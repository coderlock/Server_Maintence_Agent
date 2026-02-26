/**
 * IdleTimerManager — Sprint 8
 *
 * Encapsulates the dual-threshold idle timer for a single command execution.
 * Attaches to an ExecutionEmitter and emits 'idle-warning' / 'idle-stalled'
 * events when the command output stream falls silent for the configured duration.
 *
 * Architecture:
 *  - Resets on every 'stdout' or 'stderr' chunk from the emitter
 *  - Soft timer (idleWarningSeconds): fires once per silence window; re-arms after data resumes
 *  - Hard timer (idleStalledSeconds): fires once per silence window; reset
 *    explicitly via resetHardTimer() when AgentBrain says "wait longer"
 *  - Auto-disposes on 'done' or 'abort' from the emitter
 *
 * This class is strategy-agnostic — it works identically for BatchStrategy
 * and RealTerminalStrategy because it hooks into ExecutionEmitter which
 * both strategies use.
 */

import type { ExecutionEmitter } from './strategies/ExecutionEmitter';

// ── Public types ─────────────────────────────────────────────────────────

export interface IdleTimerConfig {
  /**
   * Seconds of silence before emitting 'idle-warning'.
   * 0 = disabled.
   */
  idleWarningSeconds: number;

  /**
   * Seconds of silence before emitting 'idle-stalled'.
   * Should be > idleWarningSeconds. 0 = disabled.
   */
  idleStalledSeconds: number;
}

export const DEFAULT_IDLE_TIMER_CONFIG: IdleTimerConfig = {
  idleWarningSeconds: 15,
  idleStalledSeconds: 45,
};

export interface IdleEvent {
  /**
   * Actual seconds of silence when this event fired (from Date.now() diff).
   */
  silenceSeconds: number;

  /**
   * Last N characters of accumulated output at fire time.
   * Used for prompt re-detection and agent analysis.
   */
  lastOutput: string;
}

// ── IdleTimerManager ─────────────────────────────────────────────────────

export class IdleTimerManager {
  private softTimer: ReturnType<typeof setTimeout> | null = null;
  private hardTimer: ReturnType<typeof setTimeout> | null = null;

  /** Epoch ms of the last data chunk received. */
  private lastDataTime: number = Date.now();

  /** Prevent the soft timer from firing more than once per silence window. */
  private softFired: boolean = false;

  /** Prevent the hard timer from firing more than once (until reset). */
  private hardFired: boolean = false;

  private disposed: boolean = false;

  /**
   * @param emitter       — the ExecutionEmitter for this command execution
   * @param config        — idle timer thresholds
   * @param getLastOutput — callback returning the last N chars of accumulated output
   *                        (typically the last 2000 chars from CommandExecutor's buffer)
   */
  constructor(
    private readonly emitter: ExecutionEmitter,
    private readonly config: IdleTimerConfig,
    private readonly getLastOutput: () => string,
  ) {
    this.attachListeners();
    this.startTimers();
  }

  // ── Private ──────────────────────────────────────────────────────────

  private attachListeners(): void {
    const resetHandler = () => {
      if (!this.disposed) {
        this.lastDataTime = Date.now();
        this.resetTimers();
      }
    };

    this.emitter.on('stdout', resetHandler);
    this.emitter.on('stderr', resetHandler);

    const cleanupHandler = () => this.dispose();
    this.emitter.on('done', cleanupHandler);
    this.emitter.on('abort', cleanupHandler);
  }

  private startTimers(): void {
    this.startSoftTimer();
    this.startHardTimer();
  }

  private startSoftTimer(): void {
    if (this.config.idleWarningSeconds <= 0 || this.softFired) return;

    this.softTimer = setTimeout(() => {
      if (this.disposed) return;
      this.softFired = true;

      const silenceSeconds = Math.round((Date.now() - this.lastDataTime) / 1000);
      const lastOutput = this.getLastOutput();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.emitter as any).emit('idle-warning', { silenceSeconds, lastOutput } satisfies IdleEvent);
    }, this.config.idleWarningSeconds * 1000);
  }

  private startHardTimer(): void {
    if (this.config.idleStalledSeconds <= 0 || this.hardFired) return;

    this.hardTimer = setTimeout(() => {
      if (this.disposed) return;
      this.hardFired = true;

      const silenceSeconds = Math.round((Date.now() - this.lastDataTime) / 1000);
      const lastOutput = this.getLastOutput();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.emitter as any).emit('idle-stalled', { silenceSeconds, lastOutput } satisfies IdleEvent);
    }, this.config.idleStalledSeconds * 1000);
  }

  private resetTimers(): void {
    // Soft timer: clear and restart if it hasn't fired yet
    if (this.softTimer) {
      clearTimeout(this.softTimer);
      this.softTimer = null;
      this.softFired = false; // allow it to fire again after resumed data
    }

    // Hard timer: clear and restart if it hasn't fired yet
    if (this.hardTimer) {
      clearTimeout(this.hardTimer);
      this.hardTimer = null;
    }

    this.startSoftTimer();
    this.startHardTimer();
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Reset only the hard stall timer without resetting the soft timer.
   * Called when AgentBrain returns 'retry' (wait longer) — gives the command
   * another full idleStalledSeconds before the agent re-analyses.
   */
  resetHardTimer(): void {
    this.hardFired = false;
    if (this.hardTimer) {
      clearTimeout(this.hardTimer);
      this.hardTimer = null;
    }
    this.lastDataTime = Date.now();
    this.startHardTimer();
  }

  /**
   * Clean up all timers. Called automatically on 'done' or 'abort'.
   * Safe to call multiple times.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.softTimer) { clearTimeout(this.softTimer); this.softTimer = null; }
    if (this.hardTimer) { clearTimeout(this.hardTimer); this.hardTimer = null; }
  }
}
