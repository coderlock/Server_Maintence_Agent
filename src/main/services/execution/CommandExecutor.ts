/**
 * CommandExecutor — lowest-level SSH command execution.
 *
 * Stateless: one command in, one structured CommandResult out.
 * Does NOT know about plans, risk levels, or AI — pure execution.
 * Both PlanExecutor and the future AgentLoop use this directly.
 */

import type { CommandResult } from '@shared/types/execution';

/** Minimal interface so CommandExecutor stays decoupled from ssh2 */
export interface SSHExecutor {
  executeCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export class CommandExecutor {
  private readonly defaultTimeout: number;

  constructor(
    private readonly ssh: SSHExecutor,
    defaultTimeoutMs = 120_000, // 2 minutes
  ) {
    this.defaultTimeout = defaultTimeoutMs;
  }

  /**
   * Execute a single shell command over SSH.
   * Handles timeout, SSH errors, and returns structured CommandResult.
   */
  async execute(command: string, timeoutMs?: number): Promise<CommandResult> {
    const startTime = Date.now();
    const timeout = timeoutMs ?? this.defaultTimeout;

    try {
      const raceResult = await Promise.race([
        this.ssh.executeCommand(command),
        this.createTimeoutSentinel(timeout),
      ]);

      if (raceResult === null) {
        return {
          command,
          exitCode: -1,
          stdout: '',
          stderr: `Command timed out after ${timeout}ms`,
          duration: timeout,
          timedOut: true,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        command,
        exitCode: raceResult.exitCode,
        stdout: raceResult.stdout,
        stderr: raceResult.stderr,
        duration: Date.now() - startTime,
        timedOut: false,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        command,
        exitCode: -1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        timedOut: false,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private createTimeoutSentinel(ms: number): Promise<null> {
    return new Promise(resolve => setTimeout(() => resolve(null), ms));
  }
}
