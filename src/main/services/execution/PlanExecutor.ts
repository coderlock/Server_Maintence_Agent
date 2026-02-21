/**
 * PlanExecutor  iterates plan steps using StepExecutor.
 *
 * Yields PlanEvents for the UI via IPC. Persists execution records.
 * Supports pause, resume, and cancel.
 *
 * Sprint 6: Adds the Agentic Loop.
 *   - In 'agentic' mode, step failures enter a recovery cycle:
 *       AgentBrain.analyzeFailure()  PlanMutator  rewind  retry
 *   - Circuit breakers prevent infinite loops:
 *        max 3 retries per individual step
 *        max 10 total agent corrections per plan run
 *   - Dangerous agent-generated commands still require user approval
 *     (handled transparently by StepExecutor's existing risk gate).
 */

import type { ExecutionPlan, ActiveConnection, OSInfo, PlanStep, ExecutionMode } from '@shared/types';
import type { PlanEvent, StepResult, ExecutionRecord } from '@shared/types/execution';
import { StepExecutor, ApprovalHandler } from './StepExecutor';
import { CommandExecutor } from './CommandExecutor';
import { AIContext } from '../ai/AIContext';
import { AgentContext } from '../agent/AgentContext';
import { agentBrain } from '../agent/AgentBrain';
import { insertStepsBefore, replaceStepCommand, MAX_ADDED_STEPS } from '../agent/PlanMutator';
import { sessionStore } from '../storage/SessionStore';
import { contextBuilder } from '../ai/ContextBuilder';

export interface PlanExecutorConfig {
  connection: ActiveConnection;
  osInfo: OSInfo;
  mode: ExecutionMode;
  connectionId: string;
  /**
   * Manual mode only: execute exactly this step index and then stop.
   * When undefined the full plan is executed from plan.currentStepIndex.
   */
  singleStepIndex?: number;
}

//  Circuit-breaker constants 

const MAX_RETRIES_PER_STEP = 3;
const MAX_TOTAL_CORRECTIONS = 10;

//  PlanExecutor 

export class PlanExecutor {
  private readonly stepExecutor: StepExecutor;
  private isPaused = false;
  private isCancelled = false;
  private pauseResolve: (() => void) | null = null;

  constructor(
    commandExecutor: CommandExecutor,
    approvalHandler: ApprovalHandler,
  ) {
    this.stepExecutor = new StepExecutor(commandExecutor, approvalHandler);
  }

  /**
   * Execute a plan, yielding PlanEvents.
   * Caller (plan.handler.ts) forwards each event to the renderer via IPC.
   */
  async *execute(
    initialPlan: ExecutionPlan,
    config: PlanExecutorConfig,
  ): AsyncGenerator<PlanEvent> {
    // Mutable plan reference  reassigned by the agent loop when plan is mutated
    let plan = initialPlan;

    const completedSteps: StepResult[] = [];

    // Per-step retry tracker & total correction budget
    const stepRetryCount = new Map<string, number>();
    let totalCorrections = 0;

    // AgentContext (rolling memory for AgentBrain)
    const agentCtx = new AgentContext();

    // Create execution record
    const record: ExecutionRecord = {
      planId: plan.id,
      goal: plan.goal,
      startedAt: new Date().toISOString(),
      status: 'in-progress',
      steps: [],
      totalTokensUsed: 0,
    };
    await sessionStore.saveExecutionRecord(config.connectionId, record);

    try {
      // In manual mode with a singleStepIndex, start exactly at that step.
      // Otherwise start from the plan's current position (normal / agent mode).
      let i = config.singleStepIndex ?? plan.currentStepIndex;

      while (i < plan.steps.length) {
        // Cancellation check
        if (this.isCancelled) {
          yield { type: 'plan-cancelled', reason: 'Cancelled by user', completedSteps: completedSteps.length };
          await sessionStore.updateExecutionRecord(config.connectionId, plan.id, {
            status: 'cancelled', completedAt: new Date().toISOString(),
          });
          return;
        }

        // Pause check
        if (this.isPaused) await this.waitForResume();

        const step: PlanStep = plan.steps[i];

        // Build per-step AI context
        const stepContext = new AIContext();
        stepContext.addSystemInfo(config.connection, config.osInfo);
        stepContext.addMode(config.mode);
        stepContext.addCurrentTask(plan.goal, plan.steps, i);
        stepContext.addTerminalOutput(contextBuilder.getRecentTerminalOutput());
        const failures = completedSteps.filter(s => !s.assessment?.succeeded);
        if (failures.length > 0) stepContext.addFailureHistory(failures);

        // Run step via StepExecutor
        const stepGen = this.stepExecutor.executeStep(step, stepContext);
        let stepResult: StepResult | undefined;
        while (true) {
          const { value, done } = await stepGen.next();
          if (done) { stepResult = value as StepResult; break; }
          yield value as PlanEvent;
        }
        if (!stepResult) { i++; continue; }

        // Record into AgentContext
        const attemptIndex = stepRetryCount.get(step.id) ?? 0;
        agentCtx.addStep(step, stepResult, attemptIndex);
        await agentCtx.summarizeIfNeeded();

        // SUCCESS PATH
        if (stepResult.assessment?.succeeded) {
          completedSteps.push(stepResult);
          plan.currentStepIndex = i + 1;
          plan.steps[i].status = 'completed';
          await sessionStore.addStepResult(config.connectionId, plan.id, stepResult);

          // Manual single-step: one step done — signal completion and stop.
          if (config.singleStepIndex !== undefined) {
            yield { type: 'plan-completed', results: completedSteps };
            await sessionStore.updateExecutionRecord(config.connectionId, plan.id, {
              status: 'completed', completedAt: new Date().toISOString(),
            });
            return;
          }

          i++;
          continue;
        }

        // FAILURE PATH
        plan.steps[i].status = 'failed';
        await sessionStore.addStepResult(config.connectionId, plan.id, stepResult);

        // Manual mode: stop immediately (no agent recovery)
        if (config.mode !== 'agent') {
          completedSteps.push(stepResult);
          yield {
            type: 'plan-cancelled',
            reason: `Step ${i + 1} failed: ${stepResult.assessment?.reason ?? 'unknown'}`,
            completedSteps: completedSteps.length,
          };
          await sessionStore.updateExecutionRecord(config.connectionId, plan.id, {
            status: 'failed', completedAt: new Date().toISOString(),
            finalOutcome: stepResult.assessment?.reason ?? 'Step failed',
          });
          return;
        }

        // AGENTIC: circuit breakers
        const currentRetries = stepRetryCount.get(step.id) ?? 0;
        if (currentRetries >= MAX_RETRIES_PER_STEP) {
          yield { type: 'agent-stuck', reason: `Step "${step.description}" failed ${currentRetries} times`, failedAttempts: currentRetries };
          yield { type: 'plan-cancelled', reason: `Step retry budget exhausted (${MAX_RETRIES_PER_STEP} retries)`, completedSteps: completedSteps.length };
          await sessionStore.updateExecutionRecord(config.connectionId, plan.id, { status: 'failed', completedAt: new Date().toISOString(), finalOutcome: 'Step retry budget exhausted' });
          return;
        }
        if (totalCorrections >= MAX_TOTAL_CORRECTIONS) {
          yield { type: 'agent-stuck', reason: `Total correction budget (${MAX_TOTAL_CORRECTIONS}) exhausted`, failedAttempts: totalCorrections };
          yield { type: 'plan-cancelled', reason: 'Total agent correction budget exhausted', completedSteps: completedSteps.length };
          await sessionStore.updateExecutionRecord(config.connectionId, plan.id, { status: 'failed', completedAt: new Date().toISOString(), finalOutcome: 'Agent correction budget exhausted' });
          return;
        }

        // Notify UI
        yield { type: 'agent-thinking', message: `Analysing failure of step ${i + 1}: "${step.description}"` };

        const remaining = MAX_TOTAL_CORRECTIONS - totalCorrections - 1;
        if (remaining <= Math.floor(MAX_TOTAL_CORRECTIONS * 0.3)) {
          yield { type: 'budget-warning', iterationsRemaining: remaining, tokensUsed: 0 };
        }

        // Ask AgentBrain
        const correction = await agentBrain.analyzeFailure(step, stepResult, agentCtx);

        // Check cancellation: user may have cancelled while the AI call was in-flight
        if (this.isCancelled) {
          yield { type: 'plan-cancelled', reason: 'Cancelled by user', completedSteps: completedSteps.length };
          await sessionStore.updateExecutionRecord(config.connectionId, plan.id, {
            status: 'cancelled', completedAt: new Date().toISOString(),
          });
          return;
        }

        totalCorrections++;
        console.log(`[PlanExecutor] Agent action=${correction.action} step=${i}: ${correction.reasoning}`);

        // Apply correction
        if (correction.action === 'retry') {
          if (correction.modifiedCommand) {
            plan = replaceStepCommand(plan, step.id, correction.modifiedCommand);
            yield { type: 'plan-revised', plan, reason: `Retrying step ${i + 1} with tweaked command: ${correction.reasoning}` };
          }
          stepRetryCount.set(step.id, currentRetries + 1);
          yield { type: 'retry-attempt', stepId: step.id, attempt: currentRetries + 1, maxAttempts: MAX_RETRIES_PER_STEP };
          // i stays the same

        } else if (correction.action === 'modify') {
          if (correction.modifiedCommand) {
            plan = replaceStepCommand(plan, step.id, correction.modifiedCommand);
            yield { type: 'plan-revised', plan, reason: `Modified command for step ${i + 1}: ${correction.reasoning}` };
          }
          stepRetryCount.set(step.id, currentRetries + 1);
          yield { type: 'retry-attempt', stepId: step.id, attempt: currentRetries + 1, maxAttempts: MAX_RETRIES_PER_STEP };
          // i stays the same

        } else if (correction.action === 'insert_steps') {
          if (!correction.newSteps || correction.newSteps.length === 0) {
            yield { type: 'plan-cancelled', reason: `Agent chose insert_steps but provided no steps: ${correction.reasoning}`, completedSteps: completedSteps.length };
            await sessionStore.updateExecutionRecord(config.connectionId, plan.id, { status: 'failed', completedAt: new Date().toISOString(), finalOutcome: correction.reasoning });
            return;
          }
          const originalLength = (plan as ExecutionPlan & { _originalLength?: number })._originalLength ?? plan.steps.length;
          if (plan.steps.length - originalLength >= MAX_ADDED_STEPS) {
            yield { type: 'agent-stuck', reason: `Plan step budget (original + ${MAX_ADDED_STEPS}) exceeded`, failedAttempts: totalCorrections };
            yield { type: 'plan-cancelled', reason: 'Plan step budget exceeded', completedSteps: completedSteps.length };
            await sessionStore.updateExecutionRecord(config.connectionId, plan.id, { status: 'failed', completedAt: new Date().toISOString(), finalOutcome: 'Plan step budget exceeded' });
            return;
          }
          const { plan: mutatedPlan, inserted } = insertStepsBefore(plan, step.id, correction.newSteps);
          if (inserted === 0) {
            yield { type: 'plan-cancelled', reason: `Could not insert repair steps: ${correction.reasoning}`, completedSteps: completedSteps.length };
            await sessionStore.updateExecutionRecord(config.connectionId, plan.id, { status: 'failed', completedAt: new Date().toISOString(), finalOutcome: correction.reasoning });
            return;
          }
          plan = mutatedPlan;
          yield { type: 'plan-revised', plan, reason: `Inserted ${inserted} repair step(s) before step ${i + 1}: ${correction.reasoning}` };
          stepRetryCount.set(step.id, currentRetries + 1);
          // i stays the same  inserted steps are now at i, original pushed to i+inserted

        } else if (correction.action === 'skip') {
          yield { type: 'step-skipped', stepId: step.id, reason: `Skipped by agent: ${correction.reasoning}` };
          i++;

        } else {
          // abort or unknown
          yield { type: 'plan-cancelled', reason: `Agent recommends aborting: ${correction.reasoning}`, completedSteps: completedSteps.length };
          await sessionStore.updateExecutionRecord(config.connectionId, plan.id, { status: 'failed', completedAt: new Date().toISOString(), finalOutcome: correction.reasoning });
          return;
        }

      } // end while

      // All steps completed
      yield { type: 'plan-completed', results: completedSteps };
      await sessionStore.updateExecutionRecord(config.connectionId, plan.id, {
        status: 'completed', completedAt: new Date().toISOString(),
        finalOutcome: 'All steps completed successfully',
      });

    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'plan-cancelled', reason, completedSteps: completedSteps.length };
      await sessionStore.updateExecutionRecord(config.connectionId, plan.id, {
        status: 'failed', completedAt: new Date().toISOString(), finalOutcome: reason,
      });
    }
  }

  pause(): void { this.isPaused = true; }

  resume(): void {
    this.isPaused = false;
    if (this.pauseResolve) { this.pauseResolve(); this.pauseResolve = null; }
  }

  cancel(): void { this.isCancelled = true; this.resume(); }

  private waitForResume(): Promise<void> {
    return new Promise(resolve => { this.pauseResolve = resolve; });
  }
}
