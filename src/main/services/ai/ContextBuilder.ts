import type { OSInfo, ActiveConnection, ChatMessage } from '@shared/types';
import { AIContext } from './AIContext';

/**
 * Convenience service for:
 *   1. Buffering SSH PTY output on the main-process side (no IPC round-trip needed)
 *   2. Building an AIContext for the standard chat use case
 *
 * The plan executor and future agent loop build their own AIContext directly —
 * they do NOT go through this class.
 */
export class ContextBuilder {
  private terminalBuffer: string[] = [];
  private readonly maxBufferLines = 200;

  // ── Terminal buffering ──────────────────────────────────────────

  /** Called by the SSH handler every time PTY data arrives */
  appendTerminalOutput(data: string): void {
    const lines = data.split('\n');
    this.terminalBuffer.push(...lines);
    if (this.terminalBuffer.length > this.maxBufferLines) {
      this.terminalBuffer = this.terminalBuffer.slice(-this.maxBufferLines);
    }
  }

  clearTerminalBuffer(): void {
    this.terminalBuffer = [];
  }

  getRecentTerminalOutput(lines = 50): string {
    return this.terminalBuffer.slice(-lines).join('\n');
  }

  // ── Chat context assembly ─────────────────────────────────────────

  /**
   * Builds an AIContext for a standard chat interaction.
   * This is ONE way to build context. Sprint 5 plan executor
   * will build context its own way.
   */
  buildChatContext(input: {
    connection: ActiveConnection;
    osInfo: OSInfo;
    mode: 'fixer' | 'teacher';
    sessionHistory: ChatMessage[];
  }): AIContext {
    const ctx = new AIContext();
    ctx.addSystemInfo(input.connection, input.osInfo);
    ctx.addMode(input.mode);
    ctx.addChatHistory(input.sessionHistory);
    ctx.addTerminalOutput(this.getRecentTerminalOutput());
    return ctx;
  }
}

export const contextBuilder = new ContextBuilder();
