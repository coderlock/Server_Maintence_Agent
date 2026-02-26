/**
 * StepExecutor — executes a single plan step.
 *
 * Responsibility: risk check → (optionally) approval → execute → AI evaluate → emit events.
 * Composable: PlanExecutor calls this in a loop; the future AgentLoop calls it per step
 * with retry logic wrapped around it.
 *
 * Returns a StepResult. Yields PlanEvents during execution for UI updates.
 */

import type { PlanStep } from '@shared/types';
import type { CommandResult, PlanEvent, StepAssessment, StepResult } from '@shared/types/execution';
import type { AIContext } from '../ai/AIContext';
import { CommandExecutor } from './CommandExecutor';
import { riskClassifier } from '../security/RiskClassifier';
import { aiOrchestrator } from '../ai/AIOrchestrator';

export type ApprovalDecision = 'approve' | 'reject' | 'skip';

/** Bridges main-process approval requests to the renderer approval dialog */
export interface ApprovalHandler {
  requestApproval(stepId: string, command: string, riskLevel: string, warningMessage?: string): Promise<ApprovalDecision>;
}

function makeTimestamp(): string { return new Date().toISOString(); }

function failure(step: PlanStep, reason: string, commandResult: CommandResult, suggestedAction: StepAssessment['suggestedAction']): StepResult {
  const assessment: StepAssessment = {
    succeeded: false,
    confidence: 'high',
    reason,
    suggestedAction,
  };
  return {
    stepId: step.id,
    stepIndex: step.index,
    command: step.command,
    exitCode: commandResult.exitCode,
    stdout: commandResult.stdout,
    stderr: commandResult.stderr,
    duration: commandResult.duration,
    timedOut: commandResult.timedOut,
    commandResult,
    assessment,
    timestamp: makeTimestamp(),
  };
}

export class StepExecutor {
  constructor(
    private readonly commandExecutor: CommandExecutor,
    private readonly approvalHandler: ApprovalHandler,
  ) {}

  /**
   * Execute a single plan step.
   * Yields PlanEvents, then returns a StepResult as the generator return value.
   * Callers: `for await (const event of gen) { ... }; const result = (await gen.return()).value`
   * — or use the collect() helper in PlanExecutor.
   */
  async *executeStep(
    step: PlanStep,
    _context: AIContext,
  ): AsyncGenerator<PlanEvent, StepResult> {
    // ── 1. Risk check ────────────────────────────────────────────
    const risk = riskClassifier.classifyCommand(step.command);

    if (risk.level === 'blocked') {
      const commandResult: CommandResult = {
        command: step.command,
        exitCode: -1,
        stdout: '',
        stderr: `Command blocked: ${risk.reason}`,
        duration: 0,
        timedOut: false,
        timestamp: makeTimestamp(),
      };
      const result = failure(step, `Command blocked: ${risk.reason}`, commandResult, 'revise-plan');
      yield { type: 'step-failed', stepId: step.id, result };
      return result;
    }

    // ── 2. Approval for dangerous commands ───────────────────────
    if (risk.level === 'dangerous' || risk.requiresApproval) {
      yield {
        type: 'approval-needed',
        stepId: step.id,
        command: step.command,
        riskLevel: risk.level,
      };

      const decision = await this.approvalHandler.requestApproval(
        step.id,
        step.command,
        risk.level,
        risk.warningMessage,
      );

      yield { type: 'approval-received', stepId: step.id, approved: decision === 'approve' };

      if (decision === 'reject') {
        const commandResult: CommandResult = {
          command: step.command,
          exitCode: -1,
          stdout: '',
          stderr: 'Rejected by user',
          duration: 0,
          timedOut: false,
          timestamp: makeTimestamp(),
        };
        const result = failure(step, 'User rejected this command', commandResult, 'ask-user');
        yield { type: 'step-failed', stepId: step.id, result };
        return result;
      }

      if (decision === 'skip') {
        const commandResult: CommandResult = {
          command: step.command,
          exitCode: -1,
          stdout: '',
          stderr: 'Skipped by user',
          duration: 0,
          timedOut: false,
          timestamp: makeTimestamp(),
        };
        yield { type: 'step-skipped', stepId: step.id, reason: 'User chose to skip' };
        return failure(step, 'Step skipped by user', commandResult, 'continue');
      }
    }

    // ── 3. Execute ───────────────────────────────────────────────
    yield {
      type: 'step-started',
      stepId: step.id,
      stepIndex: step.index,
      command: step.command,
    };

    const commandResult = await this.commandExecutor.execute(step.command);

    // ── 4. AI evaluation ─────────────────────────────────────────
    let assessment: StepAssessment;
    try {
      assessment = await aiOrchestrator.evaluateStepResult(
        commandResult,
        step.expectedOutput || step.description,
      );
    } catch {
      // Fall back to exit-code heuristic if AI call fails
      assessment = {
        succeeded: commandResult.exitCode === 0 && !commandResult.timedOut,
        confidence: 'low',
        reason: `AI evaluation unavailable. Exit code: ${commandResult.exitCode}`,
        suggestedAction: commandResult.exitCode === 0 ? 'continue' : 'ask-user',
      };
    }

    const stepResult: StepResult = {
      stepId: step.id,
      stepIndex: step.index,
      command: step.command,
      exitCode: commandResult.exitCode,
      stdout: commandResult.stdout,
      stderr: commandResult.stderr,
      duration: commandResult.duration,
      timedOut: commandResult.timedOut,
      commandResult,
      assessment,
      timestamp: makeTimestamp(),
    };

    // ── 5. Emit terminal-visible output ──────────────────────────
    // Mirror stdout + stderr to the terminal panel (answered: yes, mirror output)
    // plan.handler.ts forwards these to ssh:data for xterm to display.

    // ── 6. Emit result event ─────────────────────────────────────
    if (assessment.succeeded) {
      yield { type: 'step-completed', stepId: step.id, result: stepResult };
    } else {
      yield { type: 'step-failed', stepId: step.id, result: stepResult };
    }

    return stepResult;
  }
}
