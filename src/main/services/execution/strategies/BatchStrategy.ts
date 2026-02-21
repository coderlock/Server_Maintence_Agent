/**
 * BatchStrategy — Sprint 5.5
 *
 * Executes commands via a dedicated SSH exec channel (ssh2's exec()).
 * This is the classic, proven execution mode used since Sprint 5.
 *
 * Behaviour:
 *   - stdout and stderr are SEPARATE (as distinct streams)
 *   - Output is not available until the command completes
 *   - The stdout emitter event fires once with the full output on completion
 *   - handlesTerminalDisplay = false: caller is responsible for mirroring
 *     output to the terminal panel after each step completes
 *
 * Future (Sprint 8): Replace with StreamingStrategy which uses the same exec
 * channel but streams chunks in real-time.
 */

import { ExecutionStrategy, ExecutionHandle } from './ExecutionStrategy';
import { ExecutionEmitter } from './ExecutionEmitter';
import type { CommandResult, ExecutionConfig } from '@shared/types/execution';

/**
 * Minimal interface that BatchStrategy requires from the SSH layer.
 * Implemented by SSHManager.executeCommand() via the adapter in plan.handler.ts.
 */
export interface SSHExecutorFn {
  (command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export class BatchStrategy implements ExecutionStrategy {
  readonly handlesTerminalDisplay = false;
  readonly mergesStderr = false;
  readonly requiresTerminalLock = false;

  constructor(private readonly executeCommand: SSHExecutorFn) {}

  execute(command: string, config: ExecutionConfig): ExecutionHandle {
    const emitter = new ExecutionEmitter();
    const startTime = Date.now();

    let abortResolve: ((result: CommandResult) => void) | null = null;
    const abortPromise = new Promise<CommandResult>((resolve) => {
      abortResolve = resolve;
    });

    // Honour abort signal (e.g. plan cancelled while command is in-flight)
    emitter.once('abort', () => {
      if (abortResolve) {
        abortResolve({
          command,
          exitCode: 130, // Same as Ctrl+C
          stdout: '',
          stderr: 'Command aborted by user',
          duration: Date.now() - startTime,
          timedOut: false,
          timestamp: new Date().toISOString(),
        });
      }
    });

    const promise = (async (): Promise<CommandResult> => {
      try {
        const timeoutSentinel = new Promise<null>((res) =>
          setTimeout(() => res(null), config.commandTimeoutMs),
        );
        const execPromise = this.executeCommand(command);

        const raceResult = await Promise.race([execPromise, timeoutSentinel, abortPromise]);

        if (raceResult === null) {
          // Timed out
          const result: CommandResult = {
            command,
            exitCode: -1,
            stdout: '',
            stderr: `Command timed out after ${config.commandTimeoutMs}ms`,
            duration: config.commandTimeoutMs,
            timedOut: true,
            timestamp: new Date().toISOString(),
          };
          if (result.stderr) emitter.emit('stderr', result.stderr);
          emitter.emit('done');
          return result;
        }

        // abortPromise won the race — return the abort result directly
        if ('exitCode' in raceResult && (raceResult as CommandResult).stderr === 'Command aborted by user') {
          emitter.emit('done');
          return raceResult as CommandResult;
        }

        const result: CommandResult = {
          command,
          exitCode: raceResult.exitCode,
          stdout: raceResult.stdout,
          stderr: raceResult.stderr,
          duration: Date.now() - startTime,
          timedOut: false,
          timestamp: new Date().toISOString(),
        };

        // Emit full output as a single chunk for step card display
        if (result.stdout) emitter.emit('stdout', result.stdout);
        if (result.stderr) emitter.emit('stderr', result.stderr);
        emitter.emit('done');

        return result;
      } catch (error) {
        const result: CommandResult = {
          command,
          exitCode: -1,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime,
          timedOut: false,
          timestamp: new Date().toISOString(),
        };
        if (result.stderr) emitter.emit('stderr', result.stderr);
        emitter.emit('done');
        return result;
      }
    })();

    return { promise, emitter };
  }

  dispose(): void {
    // Batch executions run on a separate SSH channel — nothing to clean up
  }
}
