/**
 * ExecutionStrategy — Sprint 5.5 / Sprint 7
 *
 * Abstraction over how a plan command is executed on the remote device.
 * Current implementations: BatchStrategy, RealTerminalStrategy.
 * Future: StreamingStrategy (Sprint 8).
 */

import type { CommandResult } from '@shared/types/execution';
import type { ExecutionConfig } from '@shared/types/execution';
import type { ExecutionEmitter } from './ExecutionEmitter';

/**
 * A running command handle.
 * The emitter fires real-time chunk events while the command runs.
 * The promise resolves when the command completes (or times out / is aborted).
 */
export interface ExecutionHandle {
  promise: Promise<CommandResult>;
  emitter: ExecutionEmitter;
}

/**
 * Pluggable execution strategy interface.
 *
 * handlesTerminalDisplay — if true, the strategy already shows output in the
 *   terminal (e.g. Real Terminal mode). The caller must NOT mirror output to
 *   the terminal a second time or the user sees duplicates.
 *
 * mergesStderr — if true, stderr is merged into stdout (PTY behaviour).
 *   CommandResult.stderr will always be '' for these strategies.
 *
 * requiresTerminalLock — future hook. When true, the caller should send a
 *   terminal:lock IPC event to disable keyboard input while the command runs.
 */
export interface ExecutionStrategy {
  readonly handlesTerminalDisplay: boolean;
  readonly mergesStderr: boolean;
  readonly requiresTerminalLock: boolean;

  /**
   * Begin executing a command.
   * Returns immediately with an ExecutionHandle — the promise and emitter.
   * The emitter starts firing events as output arrives.
   */
  execute(command: string, config: ExecutionConfig): ExecutionHandle;

  /**
   * Clean up any in-flight command (e.g. send Ctrl+C, remove listeners).
   * Called when the plan is cancelled or the SSH connection drops.
   */
  dispose(): void;
}
