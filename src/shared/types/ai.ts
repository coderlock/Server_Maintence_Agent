/**
 * AI-related types
 */

/**
 * Execution mode for the plan executor.
 * - 'manual' : per-step execution; user clicks Run on each individual step;
 *              full execution pipeline (risk check, output capture, approval gate);
 *              no automatic advancement between steps
 * - 'agent'  : fully autonomous execution; single Run button at the top;
 *              on step failure enters Agent Loop to diagnose, generate fix
 *              steps, and retry automatically
 */
export type ExecutionMode = 'manual' | 'agent';

/**
 * Lightweight DTO sent over IPC from renderer → main when submitting a message.
 * Renamed from AIContext to avoid collision with the AIContext builder class
 * in the main process (src/main/services/ai/AIContext.ts).
 */
export interface AIRequestContext {
  connectionId?: string;
  osInfo?: {
    type: string;
    distro?: string;
    version?: string;
    kernel?: string;
  };
  recentCommands?: string[];
  sessionHistory?: ChatMessage[];
  mode: ExecutionMode;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;   // ISO string — serialisable over IPC
  plan?: ExecutionPlan;
  metadata?: {
    model?: string;
    tokens?: number;
    tokensUsed?: number;
  };
}

export interface ExecutionPlan {
  id: string;
  goal: string;
  successCriteria: string[];
  steps: PlanStep[];
  mode?: ExecutionMode;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  currentStepIndex: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  rollbackPlan?: string[];
  estimatedTime?: string;
}

export interface RiskAssessment {
  level: 'safe' | 'caution' | 'dangerous' | 'blocked';
  category: string;
  reason: string;
  requiresApproval: boolean;
  warningMessage?: string;
}

export interface PlanStep {
  id: string;
  index: number;
  description: string;
  command: string;
  riskAssessment: RiskAssessment;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'awaiting-approval';
  explanation?: string;
  expectedOutput?: string;
  verificationCommand?: string;
  output?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export type RiskLevel = 'safe' | 'caution' | 'dangerous';

/** A completed plan record stored in session history */
export interface CompletedPlan {
  planId: string;
  goal: string;
  status: 'completed' | 'failed' | 'cancelled';
  stepCount: number;
  completedAt: string;
}
