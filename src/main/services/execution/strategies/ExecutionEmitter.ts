/**
 * ExecutionEmitter — Sprint 5.5 / Sprint 7 / Sprint 8
 *
 * Typed EventEmitter for in-flight command output events.
 *
 * Events:
 *   stdout        (chunk: string)    — a chunk of stdout text (may fire multiple times)
 *   stderr        (chunk: string)    — a chunk of stderr text (may fire multiple times;
 *                                      never fires in Real Terminal mode where streams are merged)
 *   done          ()                 — command has completed (after promise resolves)
 *   abort         ()                 — external abort request (sent by PlanExecutor on cancel)
 *   idle-warning  (event: IdleEvent) — Sprint 8: soft stall threshold reached
 *   idle-stalled  (event: IdleEvent) — Sprint 8: hard stall threshold reached
 */

import { EventEmitter } from 'events';
import type { IdleEvent } from '../IdleTimerManager';

export class ExecutionEmitter extends EventEmitter {
  /** Emitted when a stdout chunk arrives */
  emit(event: 'stdout', chunk: string): boolean;
  /** Emitted when a stderr chunk arrives */
  emit(event: 'stderr', chunk: string): boolean;
  /** Emitted once when the command finishes */
  emit(event: 'done'): boolean;
  /** Emit to request cancellation of the running command */
  emit(event: 'abort'): boolean;
  /** Sprint 8: emitted by IdleTimerManager when soft stall threshold fires */
  emit(event: 'idle-warning', idleEvent: IdleEvent): boolean;
  /** Sprint 8: emitted by IdleTimerManager when hard stall threshold fires */
  emit(event: 'idle-stalled', idleEvent: IdleEvent): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string | symbol, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  on(event: 'stdout', listener: (chunk: string) => void): this;
  on(event: 'stderr', listener: (chunk: string) => void): this;
  on(event: 'done', listener: () => void): this;
  on(event: 'abort', listener: () => void): this;
  on(event: 'idle-warning', listener: (event: IdleEvent) => void): this;
  on(event: 'idle-stalled', listener: (event: IdleEvent) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  once(event: 'stdout', listener: (chunk: string) => void): this;
  once(event: 'stderr', listener: (chunk: string) => void): this;
  once(event: 'done', listener: () => void): this;
  once(event: 'abort', listener: () => void): this;
  once(event: 'idle-warning', listener: (event: IdleEvent) => void): this;
  once(event: 'idle-stalled', listener: (event: IdleEvent) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  once(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.once(event, listener);
  }

  removeListener(event: 'stdout', listener: (chunk: string) => void): this;
  removeListener(event: 'stderr', listener: (chunk: string) => void): this;
  removeListener(event: 'done', listener: () => void): this;
  removeListener(event: 'abort', listener: () => void): this;
  removeListener(event: 'idle-warning', listener: (event: IdleEvent) => void): this;
  removeListener(event: 'idle-stalled', listener: (event: IdleEvent) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeListener(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.removeListener(event, listener);
  }
}
