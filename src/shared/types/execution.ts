/**
 * Structured execution types for plan step results and agent loop.
 * Used now by the plan executor (Sprint 5) and session persistence.
 * The future agent loop will build on these without breaking the IPC contract.
 */

/**
 * Structured result from executing a command via SSH.
 * This is NOT just a terminal string — it's structured data
 * that the AI (and future agent loop) can reason about.
 */
export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;    // milliseconds
  timedOut: boolean;
  timestamp: string;   // ISO string
}

/**
 * AI's assessment of whether a step succeeded.
 * In the current plan executor, this is logged.
 * In the future agent loop, this drives replanning decisions.
 */
export interface StepAssessment {
  succeeded: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  suggestedAction?: 'continue' | 'retry' | 'revise-plan' | 'ask-user';
}

/**
 * Result of a single plan step execution, including the AI's assessment.
 */
export interface StepResult {
  stepId: string;
  stepIndex: number;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  timedOut: boolean;
  assessment?: StepAssessment;
  timestamp: string;
}

/**
 * Record of an entire plan execution. Persisted for session history
 * and future agent loop context (so it knows what was already tried).
 */
export interface ExecutionRecord {
  planId: string;
  goal: string;
  startedAt: string;
  completedAt?: string;
  status: 'completed' | 'failed' | 'cancelled' | 'in-progress';
  steps: StepResult[];
  totalTokensUsed: number;
  finalOutcome?: string;
}

/**
 * Events emitted during plan execution over IPC.
 * Extensible union — the renderer handles known types and ignores unknown ones,
 * so future agent events can be added here without breaking existing UI code.
 */
export type PlanEvent =
  | { type: 'step-started'; stepId: string; stepIndex: number; command: string }
  | { type: 'step-completed'; stepId: string; result: StepResult }
  | { type: 'step-failed'; stepId: string; result: StepResult }
  | { type: 'step-skipped'; stepId: string; reason: string }
  | { type: 'approval-needed'; stepId: string; command: string; riskLevel: string }
  | { type: 'approval-received'; stepId: string; approved: boolean }
  | { type: 'plan-completed'; results: StepResult[] }
  | { type: 'plan-cancelled'; reason: string; completedSteps: number }
  // Future agent events — defined now so the IPC contract is stable for Sprint 5+
  | { type: 'plan-revised'; reason: string; newStepCount: number }
  | { type: 'retry-attempt'; stepId: string; attempt: number; maxAttempts: number }
  | { type: 'agent-thinking'; message: string }
  | { type: 'agent-stuck'; reason: string; failedAttempts: number }
  | { type: 'budget-warning'; iterationsRemaining: number; tokensUsed: number };
