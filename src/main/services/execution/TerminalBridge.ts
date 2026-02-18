/**
 * TerminalBridge — Sprint 4 CO1 (Terminal Bridge Option B)
 *
 * Formats plan execution events for natural display in the xterm.js terminal panel.
 * Writes command + output as if the user typed them at a shell prompt.
 *
 * Does NOT execute commands. Does NOT buffer. Fire-and-forget to the terminal.
 *
 * Future: Option C upgrades displayCommandExecution() to stream data as it arrives
 * instead of dumping it all at once. The class interface stays the same.
 */

import type { CommandResult } from '@shared/types/execution';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Ensure text ends with \r\n (xterm.js line ending). */
function ensureCRLF(text: string): string {
  if (!text.endsWith('\r\n')) {
    return text.endsWith('\n') ? text.slice(0, -1) + '\r\n' : text + '\r\n';
  }
  return text;
}

/** Replace bare \n with \r\n, then ensure terminal newline at end. */
function normaliseCRLF(text: string): string {
  // Replace \r\n already present, then bare \n, to avoid double conversion
  return ensureCRLF(text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
}

// ── TerminalBridge class ───────────────────────────────────────────────────

export class TerminalBridge {
  private sendFn: (data: string) => void;
  private prompt: string = '$ ';

  constructor(sendToTerminal: (data: string) => void) {
    this.sendFn = sendToTerminal;
  }

  /** Set the shell prompt string. Called after SSH connection. */
  setPrompt(prompt: string): void {
    this.prompt = prompt;
  }

  /**
   * Display a command and its stdout in the terminal as if typed at the prompt.
   * stderr is intentionally excluded — it is shown inline in the AI assistant step card.
   *
   * Layout:
   *   <blank line>
   *   <prompt><command>
   *   <stdout>           (if any)
   *   <prompt>           (ready for next command)
   */
  displayCommandExecution(command: string, result: CommandResult): void {
    const parts: string[] = [];

    // Fresh line + prompt + command
    parts.push(`\r\n${this.prompt}${command}\r\n`);

    // stdout only — stderr goes to the AI assistant step card
    if (result.stdout) {
      parts.push(normaliseCRLF(result.stdout));
    }

    // Trailing prompt
    parts.push(this.prompt);

    this.sendFn(parts.join(''));
  }

  /**
   * Show a cyan [SMA] status message in the terminal.
   * Used for plan start, step progress, plan completion.
   */
  displayStatus(message: string): void {
    this.sendFn(`\r\n\x1b[36m[SMA] ${message}\x1b[0m\r\n`);
  }

  /**
   * Show a red [SMA ERROR] message in the terminal.
   * Used for plan cancellation, step failure.
   */
  displayError(message: string): void {
    this.sendFn(`\r\n\x1b[31m[SMA ERROR] ${message}\x1b[0m\r\n`);
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let terminalBridgeInstance: TerminalBridge | null = null;

/** Initialise the singleton with the send function from plan.handler.ts. */
export function initTerminalBridge(sendToTerminal: (data: string) => void): TerminalBridge {
  terminalBridgeInstance = new TerminalBridge(sendToTerminal);
  return terminalBridgeInstance;
}

/** Get the singleton. Throws if not yet initialised. */
export function getTerminalBridge(): TerminalBridge {
  if (!terminalBridgeInstance) {
    throw new Error('[TerminalBridge] Not initialised — call initTerminalBridge() first.');
  }
  return terminalBridgeInstance;
}
