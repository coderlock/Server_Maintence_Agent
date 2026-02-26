/**
 * RealTerminalStrategy — Sprint 7 (marker detection) + Sprint 9 (prompt detection)
 *
 * Executes plan commands by writing them directly into the live SSH PTY session.
 * The terminal displays authentic output — colours, progress bars, interactive
 * formatting — exactly as if the user typed the command themselves.
 *
 * TWO DETECTION MODES (selected automatically based on remote shell type):
 *
 *   'prompt' (default for bash / zsh — Sprint 9)
 *     Commands are written RAW to the PTY with no wrapping.
 *     A one-time PROMPT_COMMAND / precmd hook injected at session setup
 *     embeds the last exit code in an invisible OSC title sequence before each prompt.
 *     PromptStreamParser watches for both the OSC sequence and the prompt regex.
 *     Clean terminal — the user sees exactly what they would see typing the command.
 *
 *   'markers' (fallback for unknown shells — Sprint 7 behaviour retained)
 *     Commands are wrapped with unique boundary markers.
 *     MarkerStreamParser extracts output and exit code from the marker delimiters.
 *     Markers are visible in the terminal, but every shell is supported.
 *
 * NOTE ON STDERR
 *   PTY mode merges stdout and stderr. CommandResult.stderr is always ''.
 *   AgentBrain infers errors from the combined stdout content.
 *
 * NOTE ON TERMINAL LOCKING
 *   requiresTerminalLock is false. The user can observe and scroll freely.
 *   Future: flip to true when input locking is added.
 */

import type { ExecutionStrategy, ExecutionHandle } from './ExecutionStrategy';
import { ExecutionEmitter } from './ExecutionEmitter';
import { PromptStreamParser, type PromptStreamParserConfig } from './PromptStreamParser';
import { MarkerStreamParser } from './MarkerStreamParser';       // RETAINED as fallback
import { stripAnsi } from './ansiStripper';
import { stripOSCSequences } from './promptUtils';
import { generateMarkerId, wrapCommandWithMarkers } from './markerUtils'; // RETAINED as fallback
import type { ShellSessionInfo } from './sessionSetup';
import type { CommandResult, ExecutionConfig } from '@shared/types/execution';

export class RealTerminalStrategy implements ExecutionStrategy {
  readonly handlesTerminalDisplay = true;
  readonly mergesStderr = true;
  readonly requiresTerminalLock = false;

  private activeParser: PromptStreamParser | MarkerStreamParser | null = null;

  /**
   * @param sshWrite             — writes data to the PTY (sshManager.write)
   * @param registerDataListener — adds an observer to the SSH data stream
   * @param removeDataListener   — removes a previously added observer
   * @param sessionInfo          — shell metadata from session setup (Sprint 9)
   */
  constructor(
    private readonly sshWrite: (data: string) => void,
    private readonly registerDataListener: (listener: (data: string) => void) => void,
    private readonly removeDataListener: (listener: (data: string) => void) => void,
    private readonly sessionInfo: ShellSessionInfo,
  ) {}

  execute(command: string, config: ExecutionConfig): ExecutionHandle {
    if (this.sessionInfo.detectionMode === 'prompt') {
      return this.executeWithPromptDetection(command, config);
    }
    return this.executeWithMarkers(command, config);
  }

  // ── Prompt-based detection (Sprint 9 — bash / zsh) ────────────────────────

  /**
   * Clean terminal execution.
   * Writes the raw command string to the PTY and waits for:
   *   1. OSC exit code sequence  ( \x1b]0;SMA:<code>\x07 )
   *   2. Shell prompt regex match at end of output
   * Both signals are required for completion (exit-code-only fallback: default 0).
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

    const promise = new Promise<CommandResult>((resolve) => {
      // ── Timeout ───────────────────────────────────────────────────────────
      const timer = setTimeout(() => {
        timedOut = true;
        this.sshWrite('\x03'); // Interrupt the running command
        setTimeout(() => {
          cleanup();
          resolve({
            command,
            stdout: stripAnsi(stripOSCSequences(parser.getAccumulatedOutput())),
            stderr: '',
            exitCode: 124, // Standard "timed out" exit code (same as GNU timeout(1))
            duration: Date.now() - startTime,
            timedOut: true,
            timestamp: new Date().toISOString(),
          });
        }, 1000);
      }, config.commandTimeoutMs);

      // ── Abort (plan cancelled by user) ────────────────────────────────────
      emitter.once('abort', () => {
        clearTimeout(timer);
        this.sshWrite('\x03');
        setTimeout(() => {
          cleanup();
          resolve({
            command,
            stdout: stripAnsi(stripOSCSequences(parser.getAccumulatedOutput())),
            stderr: '',
            exitCode: 130, // Standard Ctrl+C exit code
            duration: Date.now() - startTime,
            timedOut: false,
            timestamp: new Date().toISOString(),
          });
        }, 1000);
      });

      // ── Data listener ──────────────────────────────────────────────────────
      const onData = (data: string) => {
        if (timedOut) return;

        const result = parser.feed(data);

        if (result.newContent) {
          emitter.emit('stdout', result.newContent);
        }

        if (result.complete) {
          clearTimeout(timer);
          cleanup();

          const rawOutput = parser.getCapturedOutput();
          const cleanOutput = stripAnsi(stripOSCSequences(rawOutput));

          // If the OSC sequence was not detected (PROMPT_COMMAND may not have been
          // activated yet, or the shell doesn't honour it), default to 0 and log a
          // warning. AgentBrain will still detect failures from the output content.
          let exitCode = result.exitCode;
          if (exitCode === null) {
            console.warn('[RealTerminal] OSC exit code not detected — defaulting to 0');
            exitCode = 0;
          }

          resolve({
            command,
            stdout: cleanOutput,
            stderr: '',
            exitCode,
            duration: Date.now() - startTime,
            timedOut: false,
            timestamp: new Date().toISOString(),
          });
        }
      };

      const cleanup = () => {
        this.removeDataListener(onData);
        this.activeParser = null;
        emitter.emit('done');
      };

      // Register BEFORE writing so no data chunk is missed
      this.registerDataListener(onData);

      // Write the RAW command — no wrapping
      this.sshWrite(command + '\n');
    });

    return { promise, emitter };
  }

  // ── Marker-based detection (Sprint 7 — fallback for unknown shells) ────────

  /**
   * Fallback for shells that don't support PROMPT_COMMAND / precmd hooks.
   * Wraps the command with unique boundary markers so the parser can identify
   * the output boundaries and extract the exit code.
   * Markers are visible in the terminal.
   */
  private executeWithMarkers(command: string, config: ExecutionConfig): ExecutionHandle {
    const emitter = new ExecutionEmitter();
    const markerId = generateMarkerId();
    const wrappedCommand = wrapCommandWithMarkers(command, markerId);
    const startTime = Date.now();

    const parser = new MarkerStreamParser(markerId, config.maxOutputBytes);
    this.activeParser = parser;

    let timedOut = false;

    const promise = new Promise<CommandResult>((resolve) => {
      // ── Timeout ───────────────────────────────────────────────────────────
      const timer = setTimeout(() => {
        timedOut = true;
        this.sshWrite('\x03');
        setTimeout(() => {
          cleanup();
          resolve({
            command,
            stdout: stripAnsi(parser.getAccumulatedOutput()),
            stderr: '',
            exitCode: 124,
            duration: Date.now() - startTime,
            timedOut: true,
            timestamp: new Date().toISOString(),
          });
        }, 1000);
      }, config.commandTimeoutMs);

      // ── Abort ──────────────────────────────────────────────────────────────
      emitter.once('abort', () => {
        clearTimeout(timer);
        this.sshWrite('\x03');
        setTimeout(() => {
          cleanup();
          resolve({
            command,
            stdout: stripAnsi(parser.getAccumulatedOutput()),
            stderr: '',
            exitCode: 130,
            duration: Date.now() - startTime,
            timedOut: false,
            timestamp: new Date().toISOString(),
          });
        }, 1000);
      });

      // ── Data listener ──────────────────────────────────────────────────────
      const onData = (data: string) => {
        if (timedOut) return;

        const result = parser.feed(data);

        if (result.newContent) {
          emitter.emit('stdout', result.newContent);
        }

        if (result.complete) {
          clearTimeout(timer);
          cleanup();

          const output = stripAnsi(parser.getCapturedOutput());
          const exitCode = result.exitCode ?? 1;

          resolve({
            command,
            stdout: output,
            stderr: '',
            exitCode,
            duration: Date.now() - startTime,
            timedOut: false,
            timestamp: new Date().toISOString(),
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
