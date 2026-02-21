/**
 * CommandExecutor — Sprint 5.5 refactor / Sprint 8 idle-timer wiring
 *
 * Delegates actual command execution to an ExecutionStrategy.
 * Extends EventEmitter so callers can receive real-time stdout/stderr chunks
 * while a command is running — without blocking the async generator pipeline.
 *
 * Sprint 8 additions:
 *  - Maintains an output accumulator buffer (last 2 MiB) for prompt re-detection
 *    and agent stall analysis
 *  - Creates an IdleTimerManager per execute() call; auto-clears on done/abort
 *  - Forwards 'idle-warning' and 'idle-stalled' events to its own EventEmitter
 *    listeners so plan.handler.ts can react out-of-band
 *  - abortCurrentCommand(): signals the active command's emitter; used by the
 *    stall handler when AgentBrain says 'abort' or 'skip'
 *  - resetHardStallTimer(): used when AgentBrain says 'retry'/'wait longer'
 *  - getAccumulatedOutput(): returns the current output buffer for stall analysis
 *
 * StepExecutor is unchanged — it still calls commandExecutor.execute(command)
 * and awaits a Promise<CommandResult>.
 */

import { EventEmitter } from 'events';
import type { CommandResult, ExecutionConfig } from '@shared/types/execution';
import type { ExecutionStrategy } from './strategies/ExecutionStrategy';
import type { ExecutionHandle } from './strategies/ExecutionStrategy';
import { IdleTimerManager } from './IdleTimerManager';
import type { IdleEvent } from './IdleTimerManager';

/** Maximum bytes to keep in the output accumulator. */
const MAX_ACCUMULATOR_BYTES = 2 * 1024 * 1024; // 2 MiB

export class CommandExecutor extends EventEmitter {
  /** Whether the active strategy already displays output in the terminal. */
  get handlesTerminalDisplay(): boolean {
    return this.strategy.handlesTerminalDisplay;
  }

  /** Whether the active strategy merges stderr into stdout. */
  get mergesStderr(): boolean {
    return this.strategy.mergesStderr;
  }

  /** Accumulated stdout + stderr for the current command (rolling 2 MiB window). */
  private outputAccumulator: string = '';

  /** The handle for the currently executing command, if any. */
  private activeHandle: ExecutionHandle | null = null;

  /** Active idle timer for the current command, if any. */
  private activeIdleTimer: IdleTimerManager | null = null;

  constructor(
    private readonly strategy: ExecutionStrategy,
    private readonly config: ExecutionConfig,
  ) {
    super();
  }

  /**
   * Execute a single shell command.
   * Emits 'stdout' and 'stderr' events as chunks arrive.
   * Emits 'idle-warning' and 'idle-stalled' events if the command goes silent.
   * Resolves with a structured CommandResult when the command completes.
   */
  async execute(command: string): Promise<CommandResult> {
    // Reset per-command state
    this.outputAccumulator = '';
    this.activeHandle = null;
    this.activeIdleTimer = null;

    const handle = this.strategy.execute(command, this.config);
    this.activeHandle = handle;

    // ── Accumulate output + forward to callers ──────────────────────────
    const onStdout = (chunk: string) => {
      this.outputAccumulator += chunk;
      // Rolling window: trim if oversized
      if (this.outputAccumulator.length > MAX_ACCUMULATOR_BYTES) {
        this.outputAccumulator = this.outputAccumulator.slice(-MAX_ACCUMULATOR_BYTES);
      }
      this.emit('stdout', chunk);
    };

    const onStderr = (chunk: string) => {
      this.outputAccumulator += chunk;
      if (this.outputAccumulator.length > MAX_ACCUMULATOR_BYTES) {
        this.outputAccumulator = this.outputAccumulator.slice(-MAX_ACCUMULATOR_BYTES);
      }
      this.emit('stderr', chunk);
    };

    handle.emitter.on('stdout', onStdout);
    handle.emitter.on('stderr', onStderr);

    // ── Idle timer ────────────────────────────────────────────────
    if (this.config.idleWarningSeconds > 0 || this.config.idleStalledSeconds > 0) {
      this.activeIdleTimer = new IdleTimerManager(
        handle.emitter,
        {
          idleWarningSeconds: this.config.idleWarningSeconds,
          idleStalledSeconds: this.config.idleStalledSeconds,
        },
        () => this.outputAccumulator.slice(-2000),
      );
    }

    // ── Forward idle events to plan.handler.ts ────────────────────
    const onIdleWarning = (event: IdleEvent) => this.emit('idle-warning', event);
    const onIdleStalled = (event: IdleEvent) => this.emit('idle-stalled', event);
    handle.emitter.on('idle-warning', onIdleWarning);
    handle.emitter.on('idle-stalled', onIdleStalled);

    // ── Clean up on done ──────────────────────────────────────────
    handle.emitter.once('done', () => {
      this.activeIdleTimer = null;
      this.activeHandle = null;
    });

    try {
      return await handle.promise;
    } finally {
      handle.emitter.removeListener('stdout', onStdout);
      handle.emitter.removeListener('stderr', onStderr);
      handle.emitter.removeListener('idle-warning', onIdleWarning);
      handle.emitter.removeListener('idle-stalled', onIdleStalled);
      this.activeIdleTimer = null;
      this.activeHandle = null;
    }
  }

  // ── Sprint 8 public helpers ──────────────────────────────────────────

  /**
   * Abort the currently running command by signalling its emitter.
   * This is NOT a full dispose — the strategy remains ready for the next command.
   * Used by the stall handler when AgentBrain says 'abort' or 'skip'.
   */
  abortCurrentCommand(): void {
    if (this.activeHandle) {
      this.activeHandle.emitter.emit('abort');
    }
  }

  /**
   * Reset the hard stall timer without aborting the command.
   * Called when AgentBrain returns action='retry' (wait longer for a slow
   * operation like a large compilation or package download).
   */
  resetHardStallTimer(): void {
    this.activeIdleTimer?.resetHardTimer();
  }

  /**
   * Return the last N characters of accumulated output for the current command.
   * Used by the stall handler and agent analysis in plan.handler.ts.
   */
  getAccumulatedOutput(): string {
    return this.outputAccumulator;
  }

  // ── Existing API (unchanged) ─────────────────────────────────────────

  /**
   * Abort any in-flight command and clean up strategy resources.
   * Called when a plan is cancelled or the SSH connection drops.
   */
  dispose(): void {
    if (this.activeHandle) {
      this.activeHandle.emitter.emit('abort');
    }
    this.strategy.dispose();
  }
}

