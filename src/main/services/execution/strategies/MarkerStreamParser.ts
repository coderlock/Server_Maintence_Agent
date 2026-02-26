/**
 * MarkerStreamParser — Sprint 7
 *
 * Stateful parser that detects SMA boundary markers in a continuous PTY data stream.
 *
 * PTY data arrives in arbitrary chunks from the SSH library — a single marker may
 * be split across two or more consecutive data events.  This parser handles that by
 * maintaining an internal buffer and scanning for complete marker strings after each
 * feed() call.
 *
 * Usage:
 *   const parser = new MarkerStreamParser(markerId, 2 * 1024 * 1024);
 *   sshDataStream.on('data', (chunk: string) => {
 *     const result = parser.feed(chunk);
 *     if (result.newContent) { … }   // real-time output chunk
 *     if (result.complete)  { … }   // command finished, result.exitCode is set
 *   });
 */

/**
 * Result returned from each call to feed().
 */
export interface MarkerFeedResult {
  /**
   * New content captured since the last feed() call.
   * Empty string when no new output between markers was found in this chunk.
   * Used to emit real-time step-output events.
   */
  newContent: string;

  /**
   * True when the end marker has been detected and the command is complete.
   */
  complete: boolean;

  /**
   * The exit code parsed from the end marker.
   * Only meaningful when complete is true.
   */
  exitCode?: number;
}

/**
 * Internal parser states.
 *
 * WAITING_FOR_START — start marker not yet seen; all incoming data is ignored.
 * CAPTURING         — start marker found; accumulate output until end marker.
 * DONE              — end marker found; ignore all subsequent data.
 */
type ParserState = 'WAITING_FOR_START' | 'CAPTURING' | 'DONE';

/**
 * Maximum length of any SMA marker string:
 *   ===SMA_EXIT_ (12) + up to 3-digit exit code (3) + _END_ (5) + 12 hex chars (12) + === (3) = 35
 * Doubled for safety to keep a 70-character sliding tail buffer.
 */
const MARKER_TAIL_BUFFER = 70;

export class MarkerStreamParser {
  private readonly startMarker: string;
  private readonly endMarkerRegex: RegExp;

  private state: ParserState = 'WAITING_FOR_START';
  private buffer = '';
  private capturedOutput = '';
  private totalBytes = 0;

  constructor(
    markerId: string,
    private readonly maxBytes: number,
  ) {
    this.startMarker = `===SMA_START_${markerId}===`;
    // Matches: ===SMA_EXIT_<digits>_END_<markerId>===
    this.endMarkerRegex = new RegExp(`===SMA_EXIT_(\\d+)_END_${markerId}===`);
  }

  /**
   * Feed a chunk of PTY data into the parser.
   *
   * Call this for every data event from the SSH stream while a command is running.
   * The parser maintains state across calls and handles split markers transparently.
   */
  feed(chunk: string): MarkerFeedResult {
    if (this.state === 'DONE') {
      return { newContent: '', complete: true };
    }

    this.buffer += chunk;

    if (this.state === 'WAITING_FOR_START') {
      return this.handleWaitingForStart();
    }

    // state === 'CAPTURING'
    return this.handleCapturing();
  }

  /** All output accumulated so far (used for timeout/abort partial results). */
  getAccumulatedOutput(): string {
    return this.capturedOutput;
  }

  /** Final captured output — only meaningful after complete === true. */
  getCapturedOutput(): string {
    return this.capturedOutput;
  }

  /** Reset for reuse (prefer creating a new instance per command instead). */
  reset(): void {
    this.state = 'WAITING_FOR_START';
    this.buffer = '';
    this.capturedOutput = '';
    this.totalBytes = 0;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private handleWaitingForStart(): MarkerFeedResult {
    const startIdx = this.buffer.indexOf(this.startMarker);

    if (startIdx === -1) {
      // Keep only a short tail in case the marker is split across the boundary.
      if (this.buffer.length > this.startMarker.length * 2) {
        this.buffer = this.buffer.slice(-this.startMarker.length);
      }
      return { newContent: '', complete: false };
    }

    // Start marker found — transition to CAPTURING
    this.state = 'CAPTURING';

    // Everything after the start marker is command output
    const contentStart = startIdx + this.startMarker.length;
    this.buffer = this.buffer.slice(contentStart);

    // Strip the leading newline that echo adds after the marker
    if (this.buffer.startsWith('\r\n')) {
      this.buffer = this.buffer.slice(2);
    } else if (this.buffer.startsWith('\n')) {
      this.buffer = this.buffer.slice(1);
    }

    // The same chunk may contain output (or even the end marker) after the start
    return this.handleCapturing();
  }

  private handleCapturing(): MarkerFeedResult {
    const endMatch = this.endMarkerRegex.exec(this.buffer);

    if (endMatch) {
      // End marker found — extract output before it
      const endIdx = endMatch.index;
      const rawContent = this.buffer.slice(0, endIdx);

      // Trim the trailing newline that precedes the end marker
      const trimmed = rawContent.replace(/\r?\n$/, '');

      this.capturedOutput += trimmed;
      this.state = 'DONE';

      const exitCode = parseInt(endMatch[1], 10);
      return {
        newContent: trimmed,
        complete: true,
        exitCode: isNaN(exitCode) ? 1 : exitCode,
      };
    }

    // End marker not yet found — emit content that is safely before any partial marker.
    // Retain the last MARKER_TAIL_BUFFER chars to catch a split end marker.
    const safeLength = this.buffer.length - MARKER_TAIL_BUFFER;

    if (safeLength <= 0) {
      // Buffer too small to safely emit anything yet
      return { newContent: '', complete: false };
    }

    const newContent = this.buffer.slice(0, safeLength);

    // Enforce max output cap
    if (this.totalBytes + newContent.length > this.maxBytes) {
      const allowed = this.maxBytes - this.totalBytes;
      if (allowed <= 0) {
        // Already at cap — discard and keep scanning for end marker
        this.buffer = this.buffer.slice(safeLength);
        return { newContent: '', complete: false };
      }
      const truncated = newContent.slice(0, allowed);
      this.capturedOutput += truncated;
      this.totalBytes += truncated.length;
      this.buffer = this.buffer.slice(safeLength);
      return { newContent: truncated, complete: false };
    }

    this.capturedOutput += newContent;
    this.totalBytes += newContent.length;
    this.buffer = this.buffer.slice(safeLength);

    return { newContent, complete: false };
  }
}
