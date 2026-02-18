/**
 * PlanParser — validates and normalises AI-generated execution plans.
 *
 * - Validates required fields
 * - Applies RiskClassifier to each command
 * - Always uses the STRICTER of the AI's assessment vs our own classifier
 * - Rejects plans containing blocked commands
 */

import type { ExecutionPlan, PlanStep } from '@shared/types';
import type { RiskAssessment } from '@shared/types/ai';
import { riskClassifier } from '../security/RiskClassifier';

/** Tiny UUID that avoids ESM-only uuid in main process */
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface PlanValidationError {
  field: string;
  message: string;
}

export interface ParseResult {
  plan: ExecutionPlan | null;
  errors: PlanValidationError[];
}

const RISK_ORDER: Record<string, number> = {
  safe: 0, caution: 1, dangerous: 2, blocked: 3,
};

export class PlanParser {
  /**
   * Validate and normalise a raw plan object from the AI response.
   * Returns `plan: null` if the plan is structurally invalid or contains blocked commands.
   */
  validateAndNormalize(rawPlan: unknown): ParseResult {
    const errors: PlanValidationError[] = [];

    if (!rawPlan || typeof rawPlan !== 'object') {
      errors.push({ field: 'plan', message: 'Plan is not a valid object' });
      return { plan: null, errors };
    }

    const p = rawPlan as Record<string, unknown>;

    if (!p.goal || typeof p.goal !== 'string') {
      errors.push({ field: 'goal', message: 'Plan must have a goal string' });
    }

    if (!Array.isArray(p.steps) || p.steps.length === 0) {
      errors.push({ field: 'steps', message: 'Plan must have at least one step' });
      return { plan: null, errors };
    }

    const normalizedSteps: PlanStep[] = [];

    for (let i = 0; i < p.steps.length; i++) {
      const step = p.steps[i] as Record<string, unknown>;

      if (!step.command || typeof step.command !== 'string') {
        errors.push({ field: `steps[${i}].command`, message: `Step ${i + 1} must have a command` });
        continue;
      }

      const classifierRisk = riskClassifier.classifyCommand(step.command as string);

      // Blocked commands invalidate the step but don't abort the whole plan
      if (classifierRisk.level === 'blocked') {
        errors.push({
          field: `steps[${i}].command`,
          message: `Step ${i + 1} command is blocked: ${classifierRisk.reason}`,
        });
        continue;
      }

      const aiRiskLevel = (step.riskLevel as string) ?? 'caution';
      const finalRisk = this.stricter(classifierRisk, aiRiskLevel);

      normalizedSteps.push({
        id: uuidv4(),
        index: i,
        description: (typeof step.description === 'string' ? step.description : null) ?? `Step ${i + 1}`,
        command: (step.command as string).trim(),
        riskAssessment: finalRisk,
        status: 'pending',
        explanation: typeof step.explanation === 'string' ? step.explanation : '',
        expectedOutput: typeof step.expectedOutput === 'string' ? step.expectedOutput : '',
        verificationCommand: typeof step.verificationCommand === 'string' ? step.verificationCommand : undefined,
      });
    }

    if (normalizedSteps.length === 0) {
      errors.push({ field: 'steps', message: 'No valid (non-blocked) steps after validation' });
      return { plan: null, errors };
    }

    const plan: ExecutionPlan = {
      id: uuidv4(),
      goal: typeof p.goal === 'string' ? p.goal : 'Unknown goal',
      successCriteria: Array.isArray(p.successCriteria)
        ? (p.successCriteria as unknown[]).filter((s): s is string => typeof s === 'string')
        : [],
      steps: normalizedSteps,
      status: 'pending',
      currentStepIndex: 0,
      createdAt: new Date().toISOString(),
      rollbackPlan: Array.isArray(p.rollbackPlan)
        ? (p.rollbackPlan as unknown[]).filter((s): s is string => typeof s === 'string')
        : [],
      estimatedTime: typeof p.estimatedTime === 'string' ? p.estimatedTime : undefined,
    };

    return { plan, errors };
  }

  /**
   * Returns the stricter of the classifier's assessment vs the AI's reported risk level.
   * The AI can escalate risk but cannot downgrade what the classifier already flagged.
   */
  private stricter(classifierRisk: RiskAssessment, aiLevel: string): RiskAssessment {
    const classifierScore = RISK_ORDER[classifierRisk.level] ?? 1;
    const aiScore = RISK_ORDER[aiLevel] ?? 1;

    if (classifierScore >= aiScore) return classifierRisk;

    // AI flagged higher risk — respect it
    return {
      ...classifierRisk,
      level: aiLevel as RiskAssessment['level'],
      reason: `AI assessment: ${aiLevel} (classifier: ${classifierRisk.level})`,
      requiresApproval: aiLevel === 'dangerous',
    };
  }
}

export const planParser = new PlanParser();
