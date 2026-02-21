/**
 * PromptStreamParser — Sprint 9
 *
 * Stateful stream parser that detects command completion by watching for:
 *   1. An OSC terminal title sequence injected by PROMPT_COMMAND:
 *        ESC ] 0 ; SMA : <exitCode> BEL   →  \x1b]0;SMA:<exitCode>\x07
 *   2. The shell prompt regex (username@hostname:path[$#]) following the output.
 *
 * Both signals must appear before the parser declares completion.
 * This dual-signal requirement prevents false-positive completions when command
 * output happens to contain text that looks like a shell prompt.
 *
 * Unlike MarkerStreamParser, this class does NOT require any command wrapping.
 * The raw command string is written to the PTY as-is. Clean terminal output.
 *
 * Parser lifecycle:
 *   WAITING_FOR_ECHO → skip the shell's echo of the typed command
 *   CAPTURING        → accumulate output; watch for OSC + prompt
 *   DONE             → command complete; ignore further data
 *
 * Edge case handled:
 *   - OSC sequence and prompt arriving in the same chunk or across chunk boundaries
 *   - Very large chunks buffered correctly
 *   - Command echo spanning multiple lines (terminal wrapping for long commands)
 *   - Empty-output commands (cd, export) — completes with stdout: ''
 *   - maxOutputBytes cap to prevent memory exhaustion
 */

/**
 * Result returned from each call to feed().
 */
export interface PromptFeedResult {
  /**
   * New command output content captured since the last feed() call.
   * Excludes the command echo line, OSC sequences, and prompt text.
   * Suitable for real-time step-output events.
   */
  newContent: string;

  /**
   * True when the shell prompt has been detected after command output,
   * indicating the command has completed.
   */
  complete: boolean;

  /**
   * The exit code extracted from the OSC title sequence.
   * Only reliably set when complete is true.
   * null if the OSC sequence was not found (PROMPT_COMMAND may not be active).
   */
  exitCode: number | null;
}

export interface PromptStreamParserConfig {
  /**
   * The exact command string that was sent to the PTY.
   * Used to detect and skip the shell echo of the typed command.
   */
  command: string;

  /**
   * Regex that matches the shell prompt for this connection.
   * Constructed from the connection's username + hostname.
   * Example: /(?:\([^)]+\)\s*)?mike@PiTEST:[^$#]*[$#]\s*$/
   */
  promptRegex: RegExp;

  /**
   * Maximum bytes to accumulate in the output buffer.
   * Prevents memory exhaustion on commands producing massive output.
   */
  maxOutputBytes: number;
}

/**
 * WAITING_FOR_ECHO: Command was written; waiting to skip the shell echo line.
 * CAPTURING:        Accumulating command output; watching for OSC + prompt.
 * DONE:             Command complete; all further data is ignored.
 */
type ParserState = 'WAITING_FOR_ECHO' | 'CAPTURING' | 'DONE';

export class PromptStreamParser {
  private readonly config: PromptStreamParserConfig;
  private state: ParserState = 'WAITING_FOR_ECHO';

  /**
   * Raw data accumulation buffer used during state transitions.
   * A tail is kept in the buffer (tailReserve bytes) so that a prompt
   * spread across two chunks is not missed.
   */
  private buffer: string = '';

  /**
   * Accumulated clean output (command echo removed, OSC stripped).
   * Returned by getCapturedOutput() after command completes.
   */
  private capturedOutput: string = '';

  /** Running total of captured bytes — enforces maxOutputBytes. */
  private totalBytes: number = 0;

  /** Exit code parsed from the OSC sequence. null until the sequence is seen. */
  private detectedExitCode: number | null = null;

  /**
   * Regex to extract exit code from our injected OSC title sequence.
   *   \x1b]0;SMA:<digits>\x07
   */
  private static readonly OSC_EXIT_CODE_REGEX = /\x1b\]0;SMA:(\d+)\x07/;

  /**
   * Regex to strip ALL OSC sequences from the buffer so they never
   * appear in captured output. Matches both BEL-terminated and ST-terminated forms.
   */
  private static readonly OSC_GENERIC_REGEX = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

  /**
   * Number of bytes to retain in the tail of the buffer when emitting
   * real-time content chunks. Ensures a prompt that arrives in two pieces
   * (promptRegex spans a chunk boundary) is detected correctly.
   */
  private static readonly TAIL_RESERVE = 150;

  /**
   * If the buffer grows beyond this size with no newline visible, we assume
   * the echo line was already processed and transition to CAPTURING to
   * prevent infinite buffering.
   */
  private static readonly MAX_ECHO_BUFFER = 2000;

  constructor(config: PromptStreamParserConfig) {
    this.config = config;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Feed a chunk of PTY data into the parser.
   * Call this for every data event received from the SSH stream.
   *
   * @returns PromptFeedResult with new content for UI and completion status.
   */
  feed(chunk: string): PromptFeedResult {
    if (this.state === 'DONE') {
      return { newContent: '', complete: true, exitCode: this.detectedExitCode };
    }

    this.buffer += chunk;

    // Always scan for the OSC exit code in every new chunk.
    // The sequence can arrive anywhere in the prompt rendering sequence.
    this.extractAndStripOSC();

    if (this.state === 'WAITING_FOR_ECHO') {
      return this.handleWaitingForEcho();
    }

    if (this.state === 'CAPTURING') {
      return this.handleCapturing();
    }

    return { newContent: '', complete: false, exitCode: null };
  }

  /**
   * Returns all output captured so far, even if the command has not completed.
   * Used during timeout and abort scenarios to surface partial output.
   */
  getAccumulatedOutput(): string {
    return this.capturedOutput + this.buffer;
  }

  /**
   * Returns the final captured output. Only meaningful after feed() returns
   * complete === true.
   */
  getCapturedOutput(): string {
    return this.capturedOutput;
  }

  /**
   * Returns the detected exit code. null if not yet seen or PROMPT_COMMAND
   * is not active on the remote shell.
   */
  getExitCode(): number | null {
    return this.detectedExitCode;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Check the buffer for our OSC exit code sequence.
   * If found: extract the exit code and remove the sequence from the buffer.
   * Also strip any other OSC sequences (e.g., the user's own PROMPT_COMMAND
   * may set window titles) so they never contaminate captured output.
   */
  private extractAndStripOSC(): void {
    const match = PromptStreamParser.OSC_EXIT_CODE_REGEX.exec(this.buffer);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (!isNaN(parsed)) {
        this.detectedExitCode = parsed;
      }
      // Remove just our SMA sequence first — the generic pass below will
      // catch anything else
      this.buffer = this.buffer.replace(PromptStreamParser.OSC_EXIT_CODE_REGEX, '');
    }

    // Strip all remaining OSC sequences
    this.buffer = this.buffer.replace(PromptStreamParser.OSC_GENERIC_REGEX, '');
  }

  /**
   * WAITING_FOR_ECHO state handler.
   *
   * The shell echoes back the command we typed immediately after we write it.
   * We discard the first complete line (up to the first \n) to skip this echo.
   *
   * Handles long commands: the terminal may wrap the echo over multiple visual
   * lines with embedded \r characters. We look for the first \n.
   */
  private handleWaitingForEcho(): PromptFeedResult {
    const newlineIdx = this.buffer.indexOf('\n');

    if (newlineIdx === -1) {
      // Haven't received a full echo line yet — keep buffering.
      // Safety valve: if the buffer is very large with no newline, assume
      // something unusual is happening and start capturing anyway.
      if (this.buffer.length > PromptStreamParser.MAX_ECHO_BUFFER) {
        this.state = 'CAPTURING';
        return this.handleCapturing();
      }
      return { newContent: '', complete: false, exitCode: null };
    }

    // Discard up to and including the first newline (the echo line).
    this.buffer = this.buffer.substring(newlineIdx + 1);

    // Strip the leading \r that PTYs insert before \n
    if (this.buffer.startsWith('\r')) {
      this.buffer = this.buffer.substring(1);
    }

    this.state = 'CAPTURING';

    // Remainder of the buffer may already contain output or a prompt
    return this.handleCapturing();
  }

  /**
   * Regex that strips ANSI CSI sequences for prompt matching only.
   * Many systems configure PS1 with color codes, e.g.:
   *   \x1b[01;32mmike\x1b[00m@\x1b[01;32mPiTEST\x1b[00m:\x1b[01;34m~\x1b[00m$
   * The plain prompt regex will not match this without stripping the codes first.
   */
  private static readonly CSI_STRIP_REGEX = /\x1b\[[0-9;]*[A-Za-z]/g;

  /**
   * CAPTURING state handler.
   *
   * Accumulate command output. Check whether the shell prompt appears at the
   * end of the buffer — that signals command completion.
   *
   * IMPORTANT: The prompt regex is tested against a CSI-stripped copy of the
   * buffer so that colored PS1 prompts are matched correctly. Output in
   * this.buffer is NOT modified — ANSI codes in real output are preserved
   * and stripped later by stripAnsi() in RealTerminalStrategy.
   *
   * Cut point: the output/prompt boundary is always a line boundary. We find
   * the last newline in the raw buffer and use that as the split point.
   *
   * Real-time content is emitted by draining all but the last TAIL_RESERVE
   * bytes from the buffer each call. The tail keeps prompt detection
   * unaffected by chunk boundaries.
   */
  private handleCapturing(): PromptFeedResult {
    // Strip CSI color codes for matching purposes only — does NOT modify this.buffer.
    const cleanBuffer = this.buffer.replace(PromptStreamParser.CSI_STRIP_REGEX, '');
    const promptMatch = this.config.promptRegex.exec(cleanBuffer);

    if (promptMatch && this.detectedExitCode !== null) {
      // Both signals present — command is definitely done.
      return this.finalizeCapture(this.findOutputEndInRawBuffer());
    }

    if (promptMatch && this.detectedExitCode === null) {
      // Prompt detected but OSC exit code not yet seen.
      // Finalize if there is nothing after the prompt in the cleaned buffer
      // (covers both empty-output commands and prompt-only final chunks).
      const textAfterPrompt = cleanBuffer.substring(promptMatch.index + promptMatch[0].length).trim();
      if (textAfterPrompt === '') {
        return this.finalizeCapture(this.findOutputEndInRawBuffer());
      }
    }

    // Prompt not yet detected — emit real-time content up to TAIL_RESERVE.
    return this.drainBuffer();
  }

  /**
   * Find where command output ends in the raw buffer.
   *
   * The shell prompt is always on the last line, so output ends at the last
   * newline character. Everything from position 0 to (lastLF + 1) is output;
   * everything after is the prompt line (with its ANSI color codes).
   *
   * Returns 0 when there is no newline (empty-output commands — the whole
   * buffer is just the prompt).
   */
  private findOutputEndInRawBuffer(): number {
    const lastLF = this.buffer.lastIndexOf('\n');
    return lastLF === -1 ? 0 : lastLF + 1;
  }

  /**
   * Finalize the capture when the prompt has been detected.
   * Everything before the prompt index is command output.
   */
  private finalizeCapture(promptIdx: number): PromptFeedResult {
    let newContent = this.buffer.substring(0, promptIdx);

    // Clean up trailing whitespace / CRLF before the prompt
    newContent = newContent.replace(/[\r\n]+$/, '');

    // Enforce output cap
    newContent = this.capContent(newContent);

    this.capturedOutput += newContent;
    this.totalBytes += newContent.length;
    this.state = 'DONE';

    return {
      newContent,
      complete: true,
      exitCode: this.detectedExitCode,
    };
  }

  /**
   * Drain buffer content for real-time emission, retaining a tail of
   * TAIL_RESERVE bytes so cross-chunk prompt detection works correctly.
   */
  private drainBuffer(): PromptFeedResult {
    const safeLength = this.buffer.length - PromptStreamParser.TAIL_RESERVE;

    if (safeLength <= 0) {
      return { newContent: '', complete: false, exitCode: null };
    }

    let newContent = this.buffer.substring(0, safeLength);
    newContent = this.capContent(newContent);

    this.capturedOutput += newContent;
    this.totalBytes += newContent.length;
    this.buffer = this.buffer.substring(safeLength);

    return { newContent, complete: false, exitCode: null };
  }

  /**
   * Enforce the maxOutputBytes cap on a content string.
   * Returns the (possibly truncated) content.
   */
  private capContent(content: string): string {
    const remaining = this.config.maxOutputBytes - this.totalBytes;
    if (remaining <= 0) return '';
    if (content.length > remaining) {
      return content.substring(0, remaining);
    }
    return content;
  }
}
