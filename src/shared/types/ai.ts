/**
 * AI-related types
 */

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
  mode: 'fixer' | 'teacher';
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
  mode?: 'fixer' | 'teacher';
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  currentStepIndex: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  rollbackPlan?: string[];
}

export interface RiskAssessment {
  level: 'safe' | 'caution' | 'dangerous';
  category: string;
  reason: string;
  requiresApproval: boolean;
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
