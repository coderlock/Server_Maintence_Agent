BUILDPLAN_SPRINT9.MD — Hybrid Command Detection (Invisible Exit Codes + Prompt Detection)

Sprint: 9 of Phase 1
Focus: Replace the visible marker-based command detection in RealTerminalStrategy with an invisible PROMPT_COMMAND / OSC title sequence approach for exit code extraction and shell prompt regex for command completion detection. Raw commands are written to the PTY with no wrapping. The LLM (Sprint 8's stall detection) remains the fallback brain for edge cases.
Target AI: Claude Sonnet 4.6
Prerequisite: Sprint 7 (RealTerminalStrategy, MarkerStreamParser), Sprint 8 (IdleTimerManager, interactivePromptDetector, AgentBrain.analyzeStall)
1. Objective

Before (Sprint 7):

text

mike@PiTEST:~$ echo "===SMA_START_57b995ce742b==="; sudo apt update 2>&1; SMA_EC=$?; echo "===SMA_EXIT_${SMA_EC}_END_57b995ce742b==="
===SMA_START_57b995ce742b===
Hit:1 http://deb.debian.org/debian bookworm InRelease
...
===SMA_EXIT_0_END_57b995ce742b===
mike@PiTEST:~$

After (Sprint 9):

text

mike@PiTEST:~$ sudo apt update
Hit:1 http://deb.debian.org/debian bookworm InRelease
...
mike@PiTEST:~$

The user sees exactly what they would see if they typed the command themselves. No markers, no wrapping, no visual noise.

How it works under the hood:

    One-time session setup: After SSH connection, inject export PROMPT_COMMAND='printf "\033]0;SMA:%?\007"' into the shell. This makes bash embed the last exit code in an invisible OSC terminal title sequence before every prompt.

    Command execution: Write the raw command string to the PTY. No wrapping.

    Completion detection: A PromptStreamParser watches the data stream for:
        The OSC sequence \033]0;SMA:<exitCode>\007 → extracts exit code
        The shell prompt regex username@hostname:.*[$#]\s*$ → command is complete

    Stall fallback: If neither is detected within 15 seconds of silence, Sprint 8's IdleTimerManager fires and the existing stall pipeline handles it (prompt detection → LLM analysis).

2. Architecture
2.1 Session Setup Flow

text

SSH Connection Established (ssh.handler.ts)
    │
    ├── OS Detection (existing)
    │
    ├── Detect shell type: $SHELL or \$0
    │     ├── bash  → PROMPT_COMMAND approach
    │     ├── zsh   → precmd approach
    │     └── other → fall back to markers (Sprint 7 code retained)
    │
    ├── Construct prompt regex from connection config
    │     username: "mike", hostname: "PiTEST"
    │     → /mike@PiTEST:.*[$#]\s*$/
    │
    ├── Inject session setup command:
    │     export SMA_ORIG_PC="$PROMPT_COMMAND"
    │     export PROMPT_COMMAND='printf "\033]0;SMA:%?\007"; eval "$SMA_ORIG_PC"'
    │
    └── Store shell metadata in connection context
          { shellType: 'bash', promptRegex, setupComplete: true }

2.2 Command Execution Flow

text

RealTerminalStrategy.execute("sudo apt update")
    │
    ├── sshManager.write("sudo apt update\n")     ← RAW command, no wrapping
    │
    ├── PromptStreamParser begins watching data stream
    │     State: WAITING_FOR_OUTPUT
    │
    │   Data arrives: "sudo apt update\r\n"        ← echo of typed command
    │     State: CAPTURING
    │
    │   Data arrives: "Hit:1 http://deb.debian.org..."
    │     → emitter.emit('stdout', chunk)           ← real-time output events
    │     → accumulate in output buffer
    │     → IdleTimerManager resets (Sprint 8)
    │
    │   Data arrives: "\033]0;SMA:0\007mike@PiTEST:~$ "
    │     → OSC regex extracts exit code: 0
    │     → Prompt regex matches: command complete
    │     → State: DONE
    │
    └── resolve(CommandResult {
          stdout: "Hit:1 http://deb.debian.org...",   ← ANSI-stripped
          stderr: '',
          exitCode: 0,
          timedOut: false,
          durationMs: 3200
        })

2.3 What the Raw Data Stream Looks Like

The terminal (xterm.js) receives and renders the data naturally. The OSC sequence is processed by xterm.js as a title change — it is not visible as text. Here is what the raw bytes look like:

text

Visible in terminal:
  mike@PiTEST:~$ sudo apt update
  Hit:1 http://deb.debian.org/debian bookworm InRelease
  Reading package lists... Done
  mike@PiTEST:~$

Raw data stream (what PromptStreamParser sees):
  mike@PiTEST:~$ sudo apt update\r\n
  Hit:1 http://deb.debian.org/debian bookworm InRelease\r\n
  Reading package lists... Done\r\n
  \033]0;SMA:0\007mike@PiTEST:~$
  ^^^^^^^^^^^^^^^^^^^^         ^^^^^^^^^^^^^^^^^^^
  OSC title (invisible)        Shell prompt (visible)

2.4 Integration with Sprint 8 (Idle Timer)

The idle timer is unchanged. It still resets on every data chunk. The only difference is what happens when the command completes normally:

text

BEFORE (Sprint 7+8):
  MarkerStreamParser detects end marker → resolve
  IdleTimerManager clears on emitter 'done'

AFTER (Sprint 9):
  PromptStreamParser detects OSC + prompt → resolve
  IdleTimerManager clears on emitter 'done'   ← identical

The stall detection pipeline (idle-warning → idle-stalled → AgentBrain.analyzeStall()) works identically because it operates on the ExecutionEmitter events, not on the parser internals.
3. New Files
3.1 src/main/services/execution/strategies/PromptStreamParser.ts

Purpose: Stateful stream parser that detects command completion by watching for the OSC exit code sequence and the shell prompt. Replaces MarkerStreamParser.

typescript

/**
 * Result returned from each call to feed().
 */
export interface PromptFeedResult {
  /**
   * New command output content captured since the last feed() call.
   * Excludes the command echo line, OSC sequences, and prompt text.
   * Used for real-time step-output events.
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
   * null if the OSC sequence was not found (fallback: treat as unknown).
   */
  exitCode: number | null;
}

/**
 * Parser states:
 *
 * WAITING_FOR_ECHO:
 *   The command was just written to the PTY. The shell will echo it back.
 *   We need to skip this echo line so it doesn't appear in captured output.
 *   Transition: when we see the command string followed by \r\n.
 *
 * CAPTURING:
 *   Command output is being produced. Accumulate everything.
 *   Transition: when we detect the OSC sequence + prompt pattern.
 *
 * DONE:
 *   Command has completed. Ignore all subsequent data.
 */
type ParserState = 'WAITING_FOR_ECHO' | 'CAPTURING' | 'DONE';

export interface PromptStreamParserConfig {
  /**
   * The exact command string that was sent to the PTY.
   * Used to detect and skip the shell echo of the command.
   */
  command: string;

  /**
   * Regex that matches the shell prompt.
   * Constructed from the connection config: username@hostname:.*[$#]\s*$
   * Must match at the end of a data chunk (prompt is always the last thing printed).
   */
  promptRegex: RegExp;

  /**
   * Maximum bytes to accumulate in the output buffer.
   * Prevents memory exhaustion on commands producing massive output.
   */
  maxOutputBytes: number;
}

/**
 * Watches the PTY data stream for:
 *   1. OSC title sequence containing exit code: \033]0;SMA:<code>\007
 *   2. Shell prompt pattern: username@hostname:path$ 
 *
 * When both are detected, the command is complete.
 *
 * Unlike MarkerStreamParser, this parser does NOT require any command wrapping.
 * The command is written to the PTY as-is. Detection relies on:
 *   - PROMPT_COMMAND (set up once per session) for exit code embedding
 *   - The natural shell prompt for completion detection
 *
 * The parser handles data arriving in arbitrary chunk sizes, including
 * the OSC sequence and prompt being split across multiple chunks.
 */
export class PromptStreamParser {
  private config: PromptStreamParserConfig;
  private state: ParserState = 'WAITING_FOR_ECHO';
  private buffer: string = '';
  private capturedOutput: string = '';
  private totalBytes: number = 0;
  private detectedExitCode: number | null = null;
  private echoSkipped: boolean = false;

  /**
   * Regex to extract exit code from OSC terminal title sequence.
   * Matches: ESC ] 0 ; SMA : <digits> BEL
   * The ESC is \x1b, BEL is \x07
   */
  private static readonly OSC_EXIT_CODE_REGEX = /\x1b\]0;SMA:(\d+)\x07/;

  /**
   * Regex to detect OSC sequences generically (for stripping from output).
   */
  private static readonly OSC_GENERIC_REGEX = /\x1b\][^\x07]*\x07/g;

  constructor(config: PromptStreamParserConfig) {
    this.config = config;
  }

  /**
   * Feed a chunk of PTY data into the parser.
   * Call this for every data event from the SSH stream.
   */
  feed(chunk: string): PromptFeedResult {
    if (this.state === 'DONE') {
      return { newContent: '', complete: true, exitCode: this.detectedExitCode };
    }

    this.buffer += chunk;

    // Always check for OSC exit code in every chunk (it can arrive anytime
    // in the prompt rendering sequence)
    this.checkForExitCode();

    if (this.state === 'WAITING_FOR_ECHO') {
      return this.handleWaitingForEcho();
    }

    if (this.state === 'CAPTURING') {
      return this.handleCapturing();
    }

    return { newContent: '', complete: false, exitCode: null };
  }

  /**
   * Check for the OSC exit code sequence anywhere in the buffer.
   * If found, extract the exit code and remove the sequence from the buffer
   * so it doesn't appear in captured output.
   */
  private checkForExitCode(): void {
    const match = PromptStreamParser.OSC_EXIT_CODE_REGEX.exec(this.buffer);
    if (match) {
      this.detectedExitCode = parseInt(match[1], 10);
      if (isNaN(this.detectedExitCode)) {
        this.detectedExitCode = null;
      }
      // Remove the OSC sequence from the buffer
      this.buffer = this.buffer.replace(PromptStreamParser.OSC_EXIT_CODE_REGEX, '');
    }

    // Also strip any other OSC sequences (user's original PROMPT_COMMAND
    // may set window titles, etc.)
    this.buffer = this.buffer.replace(PromptStreamParser.OSC_GENERIC_REGEX, '');
  }

  /**
   * WAITING_FOR_ECHO state:
   * The shell echoes the command back. We need to skip this line.
   *
   * We look for the command string (or a substantial prefix of it) followed
   * by a newline. Everything up to and including that newline is discarded.
   *
   * Edge case: if the command is very long, the terminal may wrap it across
   * multiple lines with embedded \r sequences. We handle this by looking
   * for the first \n after the command text appears.
   */
  private handleWaitingForEcho(): PromptFeedResult {
    // Look for the first newline in the buffer — that's the end of the echo line
    const newlineIdx = this.buffer.indexOf('\n');

    if (newlineIdx === -1) {
      // Haven't received a full line yet — keep waiting
      // But prevent infinite buffering: if buffer is very large without
      // a newline, something is wrong — transition to CAPTURING
      if (this.buffer.length > 2000) {
        this.state = 'CAPTURING';
        return this.handleCapturing();
      }
      return { newContent: '', complete: false, exitCode: null };
    }

    // Verify this line contains our command (or part of it)
    const echoLine = this.buffer.substring(0, newlineIdx);
    const commandCore = this.config.command.trim().substring(0, 40);

    if (echoLine.includes(commandCore) || !this.echoSkipped) {
      // This is the echo line — discard it
      this.buffer = this.buffer.substring(newlineIdx + 1);
      this.echoSkipped = true;

      // Strip leading \r if present (PTY sends \r\n)
      if (this.buffer.startsWith('\r')) {
        this.buffer = this.buffer.substring(1);
      }

      this.state = 'CAPTURING';

      // The rest of the buffer may already contain output + prompt
      return this.handleCapturing();
    }

    // Line doesn't contain our command — might be a prompt or prior output
    // Skip it and keep looking
    this.buffer = this.buffer.substring(newlineIdx + 1);
    return { newContent: '', complete: false, exitCode: null };
  }

  /**
   * CAPTURING state:
   * Accumulate command output. Watch for the shell prompt at the end of
   * the buffer, which signals command completion.
   *
   * The prompt check only looks at the END of the buffer because the prompt
   * is always the last thing printed after a command finishes.
   */
  private handleCapturing(): PromptFeedResult {
    // Check if the prompt appears at the end of the buffer
    const promptMatch = this.config.promptRegex.exec(this.buffer);

    if (promptMatch && this.detectedExitCode !== null) {
      // Both prompt and exit code detected — command is complete
      const promptIdx = promptMatch.index;

      // Everything before the prompt is command output
      let newContent = this.buffer.substring(0, promptIdx);

      // Clean up trailing whitespace/newlines before the prompt
      newContent = newContent.replace(/\r?\n$/, '');

      // Enforce output cap
      if (this.totalBytes + newContent.length > this.config.maxOutputBytes) {
        const allowed = this.config.maxOutputBytes - this.totalBytes;
        newContent = newContent.substring(0, allowed);
      }

      this.capturedOutput += newContent;
      this.totalBytes += newContent.length;
      this.state = 'DONE';

      return {
        newContent,
        complete: true,
        exitCode: this.detectedExitCode,
      };
    }

    if (promptMatch && this.detectedExitCode === null) {
      // Prompt detected but no OSC exit code — the PROMPT_COMMAND may not
      // have been set up, or the shell doesn't support it.
      // Complete with unknown exit code (null) — caller decides how to handle.
      const promptIdx = promptMatch.index;
      let newContent = this.buffer.substring(0, promptIdx).replace(/\r?\n$/, '');

      if (this.totalBytes + newContent.length > this.config.maxOutputBytes) {
        const allowed = this.config.maxOutputBytes - this.totalBytes;
        newContent = newContent.substring(0, allowed);
      }

      this.capturedOutput += newContent;
      this.totalBytes += newContent.length;
      this.state = 'DONE';

      return {
        newContent,
        complete: true,
        exitCode: null,
      };
    }

    // Prompt not detected yet — accumulate output.
    // Retain a tail buffer for split-prompt detection.
    // The prompt can be up to ~100 chars (user@very-long-hostname:/very/long/path$)
    const tailReserve = 150;
    const safeLength = this.buffer.length - tailReserve;

    if (safeLength > 0) {
      let newContent = this.buffer.substring(0, safeLength);

      // Enforce output cap
      if (this.totalBytes + newContent.length > this.config.maxOutputBytes) {
        const allowed = this.config.maxOutputBytes - this.totalBytes;
        newContent = newContent.substring(0, allowed);
      }

      this.capturedOutput += newContent;
      this.totalBytes += newContent.length;
      this.buffer = this.buffer.substring(safeLength);

      return { newContent, complete: false, exitCode: null };
    }

    return { newContent: '', complete: false, exitCode: null };
  }

  /**
   * Get all output captured so far (even if command hasn't completed).
   * Used for timeout/abort scenarios.
   */
  getAccumulatedOutput(): string {
    return this.capturedOutput;
  }

  /**
   * Get the final captured output. Only meaningful after complete === true.
   */
  getCapturedOutput(): string {
    return this.capturedOutput;
  }

  /**
   * Get the detected exit code. null if not yet detected or OSC not supported.
   */
  getExitCode(): number | null {
    return this.detectedExitCode;
  }
}

3.2 src/main/services/execution/strategies/sessionSetup.ts

Purpose: Manages the one-time shell session setup that injects the invisible PROMPT_COMMAND and detects the shell type. Called after SSH connection, before any plan execution.

typescript

/**
 * Shell metadata stored in the connection context after session setup.
 */
export interface ShellSessionInfo {
  /**
   * Detected shell type.
   * 'bash' and 'zsh' support invisible exit code embedding.
   * 'unknown' falls back to marker-based detection.
   */
  shellType: 'bash' | 'zsh' | 'unknown';

  /**
   * Regex that matches the shell prompt for this connection.
   * Constructed from username + hostname.
   * Example: /mike@PiTEST:.*[$#]\s*$/
   */
  promptRegex: RegExp;

  /**
   * Whether the PROMPT_COMMAND setup has been injected.
   */
  setupComplete: boolean;

  /**
   * The detection mode to use for RealTerminalStrategy.
   * 'prompt' — invisible OSC + prompt regex (bash/zsh)
   * 'markers' — visible marker wrapping (fallback for unknown shells)
   */
  detectionMode: 'prompt' | 'markers';
}

/**
 * Detect the active shell type by reading $0 or $SHELL.
 *
 * @param executeCommand — function that runs a command and returns stdout
 *                          (uses the existing SSH exec channel, NOT the PTY)
 */
export async function detectShellType(
  executeCommand: (cmd: string) => Promise<string>
): Promise<'bash' | 'zsh' | 'unknown'> {
  try {
    // \$0 gives the current shell process name
    const result = await executeCommand('echo \$0');
    const shell = result.trim().toLowerCase();

    if (shell.includes('bash') || shell === '-bash') return 'bash';
    if (shell.includes('zsh')) return 'zsh';

    // Fallback: check $SHELL
    const shellEnv = await executeCommand('echo $SHELL');
    const shellPath = shellEnv.trim().toLowerCase();

    if (shellPath.includes('bash')) return 'bash';
    if (shellPath.includes('zsh')) return 'zsh';

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Build the prompt regex from the connection username and hostname.
 *
 * The regex matches patterns like:
 *   mike@PiTEST:~$
 *   mike@PiTEST:/opt/app$
 *   (venv) mike@PiTEST:~$
 *   root@PiTEST:/home/mike#
 *
 * It allows:
 *   - Optional prefix in parentheses (virtualenv, conda, etc.)
 *   - Variable path after the colon
 *   - Either $ (normal user) or # (root) as the prompt char
 *   - Optional trailing whitespace
 */
export function buildPromptRegex(username: string, hostname: string): RegExp {
  // Escape special regex characters in username and hostname
  const escUser = escapeRegex(username);
  const escHost = escapeRegex(hostname);

  // Match optional prefix (virtualenv, etc.), then user@host:path[$#]
  // The hostname match uses only the first segment (before any dot)
  // to handle FQDN hostnames where the prompt shows the short name
  const shortHost = escHost.split('\\.')[0];

  return new RegExp(
    `(?:\\([^)]+\\)\\s*)?${escUser}@${shortHost}:[^$#]*[$#]\\s*$`
  );
}

/**
 * Build the PROMPT_COMMAND setup string for bash.
 * Preserves the user's existing PROMPT_COMMAND by chaining.
 */
export function buildBashSetupCommand(): string {
  return [
    // Save original PROMPT_COMMAND
    'export SMA_ORIG_PC="${PROMPT_COMMAND:-}"',
    // Set our PROMPT_COMMAND that embeds exit code in terminal title
    // Note: %? is not a real bash variable — we use $? but must escape
    // the $ in the outer double quotes. We use single quotes for the
    // printf format to avoid shell expansion issues.
    `export PROMPT_COMMAND='printf "\\033]0;SMA:$?\\007"; eval "$SMA_ORIG_PC"'`,
  ].join('; ');
}

/**
 * Build the precmd setup string for zsh.
 * Preserves existing precmd by using add-zsh-hook if available.
 */
export function buildZshSetupCommand(): string {
  return [
    'autoload -Uz add-zsh-hook 2>/dev/null',
    'sma_precmd() { printf "\\033]0;SMA:$?\\007" }',
    'add-zsh-hook precmd sma_precmd 2>/dev/null || precmd_functions+=(sma_precmd)',
  ].join('; ');
}

/**
 * Inject the session setup command into the PTY.
 *
 * This writes the PROMPT_COMMAND export directly to the terminal.
 * The command itself will be visible briefly in the terminal output,
 * but subsequent commands will have clean, invisible exit code embedding.
 *
 * @param sshWrite — function to write to the PTY (sshManager.write)
 * @param shellType — detected shell type
 */
export function injectSessionSetup(
  sshWrite: (data: string) => void,
  shellType: 'bash' | 'zsh'
): void {
  const setupCommand =
    shellType === 'bash'
      ? buildBashSetupCommand()
      : buildZshSetupCommand();

  // Write the setup command followed by a newline
  // Add a clear command after to minimize visual noise from the setup
  sshWrite(setupCommand + '; clear\n');
}

/**
 * Full session initialization: detect shell, build prompt regex, inject setup.
 *
 * @param sshWrite — write to PTY
 * @param executeCommand — run command via exec channel (for shell detection)
 * @param username — from connection config
 * @param hostname — from connection config
 * @returns ShellSessionInfo with all detection results
 */
export async function initializeSession(
  sshWrite: (data: string) => void,
  executeCommand: (cmd: string) => Promise<string>,
  username: string,
  hostname: string
): Promise<ShellSessionInfo> {
  const shellType = await detectShellType(executeCommand);
  const promptRegex = buildPromptRegex(username, hostname);

  if (shellType === 'bash' || shellType === 'zsh') {
    injectSessionSetup(sshWrite, shellType);

    return {
      shellType,
      promptRegex,
      setupComplete: true,
      detectionMode: 'prompt',
    };
  }

  // Unknown shell — fall back to markers
  return {
    shellType: 'unknown',
    promptRegex,
    setupComplete: false,
    detectionMode: 'markers',
  };
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

3.3 src/main/services/execution/strategies/promptUtils.ts

Purpose: Shared utilities for prompt-based detection. Includes the OSC exit code regex and helper functions used by both PromptStreamParser and any fallback logic.

typescript

/**
 * Extract exit code from an OSC terminal title sequence.
 *
 * The PROMPT_COMMAND we inject produces:
 *   \033]0;SMA:<exitCode>\007
 *
 * This is embedded in the PTY data stream but rendered by xterm.js
 * as a window title change — invisible to the user.
 *
 * @param data — raw PTY data chunk
 * @returns exit code if found, null otherwise
 */
export function extractOSCExitCode(data: string): number | null {
  const match = /\x1b\]0;SMA:(\d+)\x07/.exec(data);
  if (!match) return null;
  const code = parseInt(match[1], 10);
  return isNaN(code) ? null : code;
}

/**
 * Strip all OSC sequences from a string.
 * Used to clean captured output before storing or sending to AgentBrain.
 *
 * OSC format: ESC ] <anything except BEL or ST> <BEL or ST>
 *   BEL = \x07
 *   ST  = ESC \
 */
export function stripOSCSequences(data: string): string {
  return data.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

/**
 * Strip the command echo from the beginning of captured output.
 *
 * When a command is typed into a PTY, the shell echoes it back.
 * This function removes that echo so the captured output contains
 * only the command's actual output.
 *
 * @param output — raw captured output
 * @param command — the command that was sent
 * @returns output with the echo line removed
 */
export function stripCommandEcho(output: string, command: string): string {
  const lines = output.split('\n');
  const commandCore = command.trim();

  // Find the first line that contains the command text
  const echoIndex = lines.findIndex((line) =>
    line.includes(commandCore) ||
    line.includes(commandCore.substring(0, 40))
  );

  if (echoIndex >= 0) {
    // Remove everything up to and including the echo line
    return lines.slice(echoIndex + 1).join('\n');
  }

  return output;
}

/**
 * Strip the trailing prompt from captured output.
 *
 * @param output — captured output that may end with a prompt
 * @param promptRegex — regex matching the shell prompt
 * @returns output with the trailing prompt removed
 */
export function stripTrailingPrompt(output: string, promptRegex: RegExp): string {
  // Split into lines and check the last non-empty line
  const lines = output.split('\n');

  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '') continue;
    if (promptRegex.test(lines[i])) {
      // Remove this line (it's the prompt)
      lines.splice(i, 1);
      break;
    }
    break; // Last non-empty line isn't a prompt — stop looking
  }

  return lines.join('\n').replace(/\n+$/, '');
}

4. Modified Files
4.1 src/main/services/execution/strategies/RealTerminalStrategy.ts

Change: Major refactor. Replace MarkerStreamParser with PromptStreamParser. Remove all command wrapping logic. Add fallback to marker-based detection for unknown shells.

typescript

import { ExecutionStrategy } from './ExecutionStrategy';
import { ExecutionHandle } from './index';
import { ExecutionEmitter } from './ExecutionEmitter';
import { CommandResult } from '../../../../shared/types/execution';
import { ExecutionConfig } from '../../../../shared/types/settings';
import { PromptStreamParser, PromptStreamParserConfig } from './PromptStreamParser';
import { MarkerStreamParser } from './MarkerStreamParser';  // RETAINED as fallback
import { stripAnsi } from './ansiStripper';
import { stripOSCSequences } from './promptUtils';
import { generateMarkerId, wrapCommandWithMarkers } from './markerUtils'; // RETAINED as fallback
import type { ShellSessionInfo } from './sessionSetup';

/**
 * Executes commands by writing them directly into the live SSH PTY session.
 *
 * Two detection modes:
 *   'prompt'  — Uses invisible OSC exit code + shell prompt regex.
 *               Commands are written raw. Clean terminal.
 *   'markers' — Falls back to Sprint 7 marker wrapping for unsupported shells.
 *
 * The mode is determined by ShellSessionInfo.detectionMode, which is set
 * during session initialization based on the detected shell type.
 */
export class RealTerminalStrategy implements ExecutionStrategy {
  readonly handlesTerminalDisplay = true;
  readonly requiresTerminalLock = false;
  readonly mergesStderr = true;

  private sshWrite: (data: string) => void;
  private registerDataListener: (listener: (data: string) => void) => void;
  private removeDataListener: (listener: (data: string) => void) => void;
  private sessionInfo: ShellSessionInfo;
  private activeParser: PromptStreamParser | MarkerStreamParser | null = null;

  constructor(
    sshWrite: (data: string) => void,
    registerDataListener: (listener: (data: string) => void) => void,
    removeDataListener: (listener: (data: string) => void) => void,
    sessionInfo: ShellSessionInfo
  ) {
    this.sshWrite = sshWrite;
    this.registerDataListener = registerDataListener;
    this.removeDataListener = removeDataListener;
    this.sessionInfo = sessionInfo;
  }

  execute(command: string, config: ExecutionConfig): ExecutionHandle {
    if (this.sessionInfo.detectionMode === 'prompt') {
      return this.executeWithPromptDetection(command, config);
    } else {
      return this.executeWithMarkers(command, config);
    }
  }

  /**
   * NEW: Prompt-based detection (clean terminal).
   */
  private executeWithPromptDetection(command: string, config: ExecutionConfig): ExecutionHandle {
    const emitter = new ExecutionEmitter();
    const startTime = Date.now();
    let timedOut = false;

    const parserConfig: PromptStreamParserConfig = {
      command,
      promptRegex: this.sessionInfo.promptRegex,
      maxOutputBytes: config.maxOutputBytes,
    };

    const parser = new PromptStreamParser(parserConfig);
    this.activeParser = parser;

    const promise = new Promise<CommandResult>((resolve, reject) => {
      // --- Timeout ---
      const timer = setTimeout(() => {
        timedOut = true;
        this.sshWrite('\x03');
        setTimeout(() => {
          cleanup();
          resolve({
            stdout: stripAnsi(stripOSCSequences(parser.getAccumulatedOutput())),
            stderr: '',
            exitCode: 124,
            timedOut: true,
            durationMs: Date.now() - startTime,
          });
        }, 1000);
      }, config.commandTimeoutMs);

      // --- Abort handler ---
      emitter.on('abort', () => {
        this.sshWrite('\x03');
        setTimeout(() => {
          cleanup();
          resolve({
            stdout: stripAnsi(stripOSCSequences(parser.getAccumulatedOutput())),
            stderr: '',
            exitCode: 130,
            timedOut: false,
            durationMs: Date.now() - startTime,
          });
        }, 1000);
      });

      // --- Data listener ---
      const onData = (data: string) => {
        const result = parser.feed(data);

        // Emit real-time output chunks
        if (result.newContent) {
          emitter.emit('stdout', result.newContent);
        }

        // Check for completion
        if (result.complete) {
          clearTimeout(timer);
          cleanup();

          const rawOutput = parser.getCapturedOutput();
          const cleanOutput = stripAnsi(stripOSCSequences(rawOutput));

          // Exit code from OSC, or fallback to null → treat as unknown
          let exitCode = result.exitCode;
          if (exitCode === null) {
            // OSC exit code not found — this means PROMPT_COMMAND may not
            // be working. Log a warning and infer from output.
            console.warn('[RealTerminal] OSC exit code not detected — defaulting to 0');
            exitCode = 0;
          }

          resolve({
            stdout: cleanOutput,
            stderr: '',
            exitCode,
            timedOut: false,
            durationMs: Date.now() - startTime,
          });
        }
      };

      const cleanup = () => {
        this.removeDataListener(onData);
        this.activeParser = null;
        emitter.emit('done');
      };

      // Register listener BEFORE writing the command
      this.registerDataListener(onData);

      // Write the RAW command — no wrapping
      this.sshWrite(command + '\n');
    });

    return { promise, emitter };
  }

  /**
   * EXISTING: Marker-based detection (fallback for unknown shells).
   * This is the Sprint 7 implementation, retained without modification.
   */
  private executeWithMarkers(command: string, config: ExecutionConfig): ExecutionHandle {
    const emitter = new ExecutionEmitter();
    const markerId = generateMarkerId();
    const startTime = Date.now();
    let timedOut = false;

    const wrappedCommand = wrapCommandWithMarkers(command, markerId);
    const parser = new MarkerStreamParser(markerId, config.maxOutputBytes);
    this.activeParser = parser;

    const promise = new Promise<CommandResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        timedOut = true;
        this.sshWrite('\x03');
        setTimeout(() => {
          cleanup();
          resolve({
            stdout: stripAnsi(parser.getAccumulatedOutput()),
            stderr: '',
            exitCode: 124,
            timedOut: true,
            durationMs: Date.now() - startTime,
          });
        }, 1000);
      }, config.commandTimeoutMs);

      emitter.on('abort', () => {
        this.sshWrite('\x03');
        setTimeout(() => {
          cleanup();
          resolve({
            stdout: stripAnsi(parser.getAccumulatedOutput()),
            stderr: '',
            exitCode: 130,
            timedOut: false,
            durationMs: Date.now() - startTime,
          });
        }, 1000);
      });

      const onData = (data: string) => {
        const result = parser.feed(data);
        if (result.newContent) {
          emitter.emit('stdout', result.newContent);
        }
        if (result.complete) {
          clearTimeout(timer);
          cleanup();
          resolve({
            stdout: stripAnsi(parser.getCapturedOutput()),
            stderr: '',
            exitCode: result.exitCode ?? 1,
            timedOut: false,
            durationMs: Date.now() - startTime,
          });
        }
      };

      const cleanup = () => {
        this.removeDataListener(onData);
        this.activeParser = null;
        emitter.emit('done');
      };

      this.registerDataListener(onData);
      this.sshWrite(wrappedCommand + '\n');
    });

    return { promise, emitter };
  }

  dispose(): void {
    if (this.activeParser) {
      this.sshWrite('\x03');
      this.activeParser = null;
    }
  }
}

4.2 src/main/ipc/ssh.handler.ts

Change: After SSH connection and OS detection, call initializeSession() to detect the shell, build the prompt regex, and inject PROMPT_COMMAND. Store the ShellSessionInfo in the connection context for plan.handler.ts to use.

typescript

import { initializeSession, ShellSessionInfo } from '../services/execution/strategies/sessionSetup';

// ADD to the SSH.CONNECT handler, after OS detection and before setPlanConnectionContext:

// Detect shell and set up invisible exit code embedding
let shellSessionInfo: ShellSessionInfo;
try {
  shellSessionInfo = await initializeSession(
    // sshWrite: write to PTY
    (data: string) => sshManager.write(data),
    // executeCommand: run via exec channel (for shell detection queries)
    async (cmd: string) => {
      const result = await sshManager.executeCommand(cmd);
      return result.stdout;
    },
    // username and hostname from connection config
    config.username,
    config.host
  );
  console.log(`[SSH] Shell detected: ${shellSessionInfo.shellType}, detection mode: ${shellSessionInfo.detectionMode}`);
} catch (err) {
  console.warn('[SSH] Session setup failed, falling back to markers:', err);
  shellSessionInfo = {
    shellType: 'unknown',
    promptRegex: buildPromptRegex(config.username, config.host),
    setupComplete: false,
    detectionMode: 'markers',
  };
}

// MODIFY setPlanConnectionContext to include shellSessionInfo:
setPlanConnectionContext({
  connection: activeConn,
  osInfo,
  connectionId,
  shellSessionInfo,  // NEW
});

4.3 src/main/ipc/plan.handler.ts

Change: Pass shellSessionInfo from the connection context to RealTerminalStrategy constructor. When detectionMode is 'prompt', no command wrapping occurs. When it's 'markers', the existing Sprint 7 behavior is used.

typescript

// UPDATE createStrategy factory:

function createStrategy(
  config: ExecutionConfig,
  sshManager: SSHManager,
  connectionContext: PlanConnectionContext   // already available
): ExecutionStrategy {
  switch (config.outputMode) {
    case 'batch':
      return new BatchStrategyImpl(makeSSHExecutor(sshManager));

    case 'real-terminal':
      return new RealTerminalStrategy(
        (data: string) => sshManager.write(data),
        (listener: (data: string) => void) => sshManager.registerDataListener(listener),
        (listener: (data: string) => void) => sshManager.removeDataListener(listener),
        connectionContext.shellSessionInfo  // NEW: pass shell session info
      );

    case 'streaming':
      return new StreamingStrategyImpl(sshManager.getClient());

    default:
      const _exhaustive: never = config.outputMode;
      throw new Error(`Unknown output mode: ${_exhaustive}`);
  }
}

4.4 Connection Context Type

Change: Add shellSessionInfo to the plan connection context type.

typescript

// In whatever file defines PlanConnectionContext (likely plan.handler.ts or a shared type):

import type { ShellSessionInfo } from '../services/execution/strategies/sessionSetup';

export interface PlanConnectionContext {
  connection: ActiveConnection;
  osInfo: OSInfo;
  connectionId: string;
  shellSessionInfo: ShellSessionInfo;   // NEW
}

4.5 src/main/services/execution/strategies/index.ts

Change: Update barrel exports.

typescript

export { executeStreaming, StreamingStrategyImpl } from './StreamingStrategy';
export { executeBatch, BatchStrategyImpl } from './BatchStrategy';
export { RealTerminalStrategy } from './RealTerminalStrategy';
export { MarkerStreamParser } from './MarkerStreamParser';           // RETAINED as fallback
export { PromptStreamParser } from './PromptStreamParser';           // NEW
export { stripAnsi } from './ansiStripper';
export { generateMarkerId, wrapCommandWithMarkers } from './markerUtils';  // RETAINED as fallback
export { extractOSCExitCode, stripOSCSequences, stripCommandEcho, stripTrailingPrompt } from './promptUtils'; // NEW
export { initializeSession, detectShellType, buildPromptRegex, buildBashSetupCommand, buildZshSetupCommand } from './sessionSetup'; // NEW
export type { ExecutionHandle } from './StreamingStrategy';
export type { ExecutionStrategy } from './ExecutionStrategy';
export type { ShellSessionInfo } from './sessionSetup';              // NEW
export type { PromptStreamParserConfig, PromptFeedResult } from './PromptStreamParser'; // NEW

4.6 src/main/services/execution/strategies/ansiStripper.ts

Change: Add OSC stripping to the existing pipeline so captured output fed to AgentBrain is clean.

typescript

// UPDATE the stripAnsi function:

export function stripAnsi(input: string): string {
  let result = input
    // CSI sequences
    .replace(/\x1b$$[0-9;]*[A-Za-z]/g, '')
    // OSC sequences (NEW — removes SMA exit code and any other title sequences)
    .replace(/\x1b$$[^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // Simple escape sequences
    .replace(/\x1b[^[\]]/g, '')
    // Bare ESC characters
    .replace(/\x1b/g, '');

  // Carriage return progress bars (unchanged)
  result = result
    .split('\n')
    .map((line) => {
      if (line.includes('\r')) {
        const segments = line.split('\r');
        for (let i = segments.length - 1; i >= 0; i--) {
          if (segments[i].trim()) return segments[i];
        }
        return segments[segments.length - 1];
      }
      return line;
    })
    .join('\n');

  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

    Note: The OSC regex line may already exist in the Sprint 7 implementation. If so, this is a no-op. Verify and skip if already present.

5. Files NOT Modified

These files are unchanged in Sprint 9. The prompt-based detection is transparent to everything above the strategy layer:
File	Reason
StepExecutor.ts	Consumes CommandResult — same shape regardless of detection mode
PlanExecutor.ts	Iterates steps — unaware of detection internals
CommandExecutor.ts	Delegates to strategy — already handles ExecutionHandle
IdleTimerManager.ts	Resets on stdout/stderr events — works identically
interactivePromptDetector.ts	Checks output content — agnostic to how output was captured
AgentBrain.ts	Receives StepResult — same shape
usePlanExecution.ts	Handles PlanEvent types — same events emitted
FixerPlanView.tsx	Renders step cards — same props
StallIndicator.tsx	Shows stall states — same StepStallState interface
SettingsModal.tsx	No new settings for detection mode (auto-detected per shell)
6. Implementation Order
Step	Files	Description
1	src/main/services/execution/strategies/promptUtils.ts	Create extractOSCExitCode, stripOSCSequences, stripCommandEcho, stripTrailingPrompt
2	src/main/services/execution/strategies/PromptStreamParser.ts	Create full parser with three states, OSC detection, prompt regex matching, echo skipping
3	src/main/services/execution/strategies/sessionSetup.ts	Create detectShellType, buildPromptRegex, buildBashSetupCommand, buildZshSetupCommand, injectSessionSetup, initializeSession
4	src/main/services/execution/strategies/ansiStripper.ts	Verify OSC stripping is present; add if missing
5	Connection context type	Add shellSessionInfo: ShellSessionInfo to PlanConnectionContext
6	src/main/ipc/ssh.handler.ts	Call initializeSession() after OS detection; store result in connection context
7	src/main/services/execution/strategies/RealTerminalStrategy.ts	Refactor: add sessionInfo constructor param; add executeWithPromptDetection method; rename existing logic to executeWithMarkers; route based on detectionMode
8	src/main/ipc/plan.handler.ts	Pass connectionContext.shellSessionInfo to RealTerminalStrategy constructor
9	src/main/services/execution/strategies/index.ts	Update barrel exports
10	Compile check	tsc --noEmit — zero errors
7. Edge Cases & Robustness
7.1 Shell Detection Failure

If detectShellType cannot determine the shell (exec channel fails, unusual shell, etc.), initializeSession returns detectionMode: 'markers'. The Sprint 7 marker-based path is used. The user sees markers in the terminal but everything works.
7.2 PROMPT_COMMAND Already Set

The user may have a custom PROMPT_COMMAND (e.g., for terminal title, history logging). Our setup command preserves it:

bash

export SMA_ORIG_PC="${PROMPT_COMMAND:-}"
export PROMPT_COMMAND='printf "\033]0;SMA:$?\007"; eval "$SMA_ORIG_PC"'

The original PROMPT_COMMAND runs after ours via eval. If it also sets a title, the user's title will overwrite ours — but by that point the parser has already extracted the exit code from our sequence.
7.3 sudo su / User Switch

If a plan step runs sudo su or su - otheruser, the prompt changes (different username, possibly different prompt format) and PROMPT_COMMAND is not inherited by the new shell.

Detection: The PromptStreamParser will not see the expected prompt. After 15 seconds of silence, the idle timer fires, and AgentBrain.analyzeStall() handles it.

Mitigation for plan authors: The AI should be instructed to use sudo -u otheruser <command> instead of sudo su when possible, which runs a single command as another user without spawning a new shell.
7.4 Subshells (python, mysql, node)

Commands like python3 or mysql start an interactive subshell with a different prompt (>>>, mysql>). The prompt regex won't match.

Detection: Same as 7.3 — idle timer fires, agent handles it. The interactive prompt detector will likely catch >>> or mysql> via the generic patterns.

Best practice: Plan steps should use non-interactive subshell invocations: python3 -c "print('hello')" or mysql -e "SHOW TABLES".
7.5 OSC Exit Code Not Detected

If the PROMPT_COMMAND injection fails silently, the OSC sequence won't appear in the data stream. The PromptStreamParser handles this:

    Prompt regex still detects command completion
    exitCode is null
    RealTerminalStrategy logs a warning and defaults to exitCode: 0
    If the command actually failed, the output content will contain error messages that AgentBrain.analyzeFailure() can detect

7.6 Prompt Regex False Positive

If command output contains text matching the prompt pattern (e.g., a script that prints mike@PiTEST:~$), the parser may prematurely conclude the command is done.

Mitigation:

    The parser requires BOTH the OSC exit code AND the prompt to declare completion. Output is unlikely to contain both \033]0;SMA:0\007 and the prompt string.
    If the OSC is not yet seen, the parser continues capturing even after seeing the prompt pattern (it waits for both).
    This is the same reliability tradeoff we discussed — it covers 98%+ of real-world commands.

7.7 Rapid Sequential Commands

After command A completes, the parser for command A sees the prompt and resolves. Command B's parser is then created and begins watching. There is a brief window where data from command A's trailing output could be captured by command B's parser.

Mitigation: The WAITING_FOR_ECHO state in PromptStreamParser skips data until it sees the echo of command B. Any trailing data from command A is discarded in this state.
7.8 Empty Command Output

Commands like cd /opt or export FOO=bar produce no output. The data stream goes:

text

mike@PiTEST:~$ cd /opt
\033]0;SMA:0\007mike@PiTEST:/opt$

The parser sees the OSC + prompt immediately after the echo line. capturedOutput is empty. CommandResult.stdout is ''. This is correct.
8. Testing Checklist
#	Test	Expected Result
1	Connect to bash shell, run echo "hello" in real-terminal mode	Terminal shows clean echo "hello" → hello → prompt. No markers visible. Step card shows hello. Exit code 0.
2	Run ls /nonexistent	Terminal shows error message + prompt. Step card shows error. Exit code non-zero (extracted from OSC).
3	Run sudo apt update (multi-line, slow output)	Output streams live in terminal. Step card accumulates output. Completes when prompt returns. Exit code 0.
4	Run cd /opt && pwd	Terminal shows /opt. Prompt changes to mike@PiTEST:/opt$. Parser still matches the new prompt.
5	Run a command that takes >15s with no output (e.g., sleep 20)	Idle timer fires at 15s. Stall indicator appears. At 45s, agent analyzes. All Sprint 8 behavior intact.
6	Run a command with [Y/n] prompt	Interactive prompt detector catches it in real-time. StallIndicator shows input field. User types Y. Command continues.
7	Connect to a system with zsh	Session setup uses precmd instead of PROMPT_COMMAND. Detection works identically.
8	Connect to a system with unknown shell (e.g., fish)	Falls back to marker-based detection. Markers visible in terminal. Everything works.
9	Run cat /dev/urandom | head -c 1000 (binary output)	ANSI stripper + OSC stripper clean the output. Parser still detects prompt.
10	Run a command that exceeds maxOutputBytes	Output truncated at cap. Command still completes when prompt detected.
11	Cancel plan mid-execution	Ctrl+C sent. Parser resolves with partial output.
12	Timeout during execution	Timer fires, Ctrl+C sent, exit code 124.
13	Disconnect SSH during execution	Data stops, idle timer fires, eventually resolves via timeout.
14	Run 5 commands in sequence (full plan)	Each command: clean terminal output, correct exit code, no leftover state between steps.
15	Verify user's existing PROMPT_COMMAND is preserved	If user had a custom PROMPT_COMMAND, it still runs after each command (check terminal title or history behavior).
16	Batch mode unaffected	Switch to batch in settings. Plans execute via exec channel as before. No session setup injected.
17	Connect, run a plan, disconnect, reconnect, run another plan	Session setup re-runs on reconnect. New ShellSessionInfo is stored. Everything works.
9. Files Summary
New Files (3)
File	Lines (est.)	Purpose
src/main/services/execution/strategies/PromptStreamParser.ts	~220	Stateful parser: OSC exit code + prompt regex detection
src/main/services/execution/strategies/sessionSetup.ts	~140	Shell detection, prompt regex construction, PROMPT_COMMAND injection
src/main/services/execution/strategies/promptUtils.ts	~70	OSC extraction, stripping, echo removal utilities
Modified Files (5)
File	Change Scope	Description
src/main/services/execution/strategies/RealTerminalStrategy.ts	Large	Add sessionInfo param, split into executeWithPromptDetection + executeWithMarkers, route by detectionMode
src/main/ipc/ssh.handler.ts	Medium	Call initializeSession() after OS detection, store ShellSessionInfo
src/main/ipc/plan.handler.ts	Small	Pass shellSessionInfo to RealTerminalStrategy constructor
src/main/services/execution/strategies/ansiStripper.ts	Trivial	Verify OSC stripping present
src/main/services/execution/strategies/index.ts	Small	Update barrel exports
Retained (Not Deleted)
File	Reason
MarkerStreamParser.ts	Used by executeWithMarkers fallback path
markerUtils.ts	Used by executeWithMarkers fallback path
10. Sprint Relationship

text

Sprint 5   ─── PlanExecutor, StepExecutor, CommandExecutor (batch only)
Sprint 6   ─── AgentBrain, AgentContext, PlanMutator (Agentic Loop)
Sprint 7   ─── ExecutionStrategy, BatchStrategy, RealTerminalStrategy (marker-based)
Sprint 8   ─── IdleTimerManager, interactivePromptDetector, AgentBrain.analyzeStall
Sprint 9   ─── PromptStreamParser, sessionSetup, promptUtils                    ◄── THIS SPRINT
               RealTerminalStrategy refactored: prompt detection (default) + markers (fallback)
Sprint 10  ─── Tiered auto-response (PromptClassifier, auto-confirm Y/n, AgentBrain.analyzePrompt)