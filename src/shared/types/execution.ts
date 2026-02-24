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
  // Flat fields kept for backward-compat with SessionStore data written before Sprint 5
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  timedOut: boolean;
  // Structured full result — available in Sprint 5+; agent loop uses this
  commandResult?: CommandResult;
  assessment?: StepAssessment;
  timestamp: string;
  /** Sprint 6: which attempt this result belongs to (0 = first try) */
  attemptIndex?: number;
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
 * Sprint 6: A step definition returned by AgentBrain — no id/index/status yet.
 * PlanMutator promotes these to full PlanStep objects.
 */
export interface ProtoStep {
  description: string;
  command: string;
  riskLevel: 'safe' | 'caution' | 'dangerous';
  explanation?: string;
  expectedOutput?: string;
}

/**
 * Sprint 6: The action the Agent Brain recommends when a step fails.
 * Drives the Agent Loop inside PlanExecutor.
 */
export type AgentCorrectionAction = 'retry' | 'modify' | 'insert_steps' | 'skip' | 'abort';

export interface AgentCorrection {
  action: AgentCorrectionAction;
  /** Short human-readable explanation surfaced in the UI */
  reasoning: string;
  /**
   * New steps to splice in after the failed step (insert_steps action).
   * PlanMutator converts these to full PlanStep objects with unique IDs.
   */
  newSteps?: ProtoStep[];
  /** Replacement command for a simple fix-and-retry (modify / retry action) */
  modifiedCommand?: string;
}

/**
 * Configuration for a single plan execution run.
 * Created in plan.handler.ts from AppSettings and passed to the strategy factory.
 */
export interface ExecutionConfig {
  /**
   * 'batch'         — SSH exec channel; full output on completion; stderr separated.
   * 'real-terminal' — Commands typed into the live PTY; output captured via markers.
   * 'streaming'     — SSH exec channel; real-time chunk events (Sprint 8).
   */
  outputMode: 'batch' | 'real-terminal' | 'streaming';

  /** Maximum time to wait for a single command before sending Ctrl+C. */
  commandTimeoutMs: number;

  /** Maximum bytes of captured stdout before truncation. */
  maxOutputBytes: number;

  /** Maximum bytes of captured stderr before truncation (batch/streaming only). */
  maxStderrBytes: number;

  /** Seconds of silence before soft stall warning. 0 = disabled. */
  idleWarningSeconds: number;
  /** Seconds of silence before hard stall + AI analysis. 0 = disabled. */
  idleStalledSeconds: number;
}

/**
 * Events emitted during plan execution over IPC.
 * Extensible union — the renderer handles known types and ignores unknown ones,
 * so future agent events can be added here without breaking existing UI code.
 */
export type PlanEvent =
  | { type: 'step-started'; stepId: string; stepIndex: number; command: string }
  /**
   * Real-time output chunk from the currently executing step.
   * Fired while the command is still running (one or more times per step).
   * In real-terminal mode, stream is always 'stdout' (stderr is merged).
   */
  | { type: 'step-output'; stepId: string; chunk: string; stream: 'stdout' | 'stderr' }
  | { type: 'step-completed'; stepId: string; result: StepResult }
  | { type: 'step-failed'; stepId: string; result: StepResult }
  | { type: 'step-skipped'; stepId: string; reason: string }
  | { type: 'approval-needed'; stepId: string; command: string; riskLevel: string; warningMessage?: string }
  | { type: 'approval-received'; stepId: string; approved: boolean }
  | { type: 'plan-completed'; results: StepResult[] }
  | { type: 'plan-cancelled'; reason: string; completedSteps: number }
  // Sprint 6 agent events
  | { type: 'plan-revised'; plan: import('./ai').ExecutionPlan; reason: string }
  | { type: 'retry-attempt'; stepId: string; attempt: number; maxAttempts: number }
  | { type: 'agent-thinking'; message: string }
  | { type: 'agent-stuck'; reason: string; failedAttempts: number }
  | { type: 'budget-warning'; iterationsRemaining: number; tokensUsed: number }
  // Sprint 8 idle-timer / stall events
  | {
      type: 'prompt-detected';
      stepId: string;
      promptText: string;
      matchedPattern: string;
      /** Where the detection was triggered from. */
      source: 'realtime' | 'idle-warning' | 'idle-stalled';
    }
  | {
      /** Soft stall — command has been silent, no prompt found. Informational. */
      type: 'idle-warning';
      stepId: string;
      silenceSeconds: number;
    }
  | {
      /** Hard stall — AI has analysed the situation. */
      type: 'stall-detected';
      stepId: string;
      silenceSeconds: number;
      /** null while analysis is in progress, then set to the agent's decision. */
      agentAction: 'abort' | 'wait' | 'send-input' | 'skip' | null;
      agentReasoning: string;
    }
  | {
      /** User submitted input via the StallIndicator form. */
      type: 'stall-input-submitted';
      stepId: string;
      /** Redacted to '***' if it contains 'password'. */
      input: string;
    }
  | {
      /**
       * AI-generated markdown summary posted to the chat panel after a plan
       * finishes (completed, cancelled, or aborted by the agent).
       */
      type: 'plan-summary';
      /** Markdown content to display as an assistant chat message. */
      content: string;
    };
