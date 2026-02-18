/**
 * FixerPlanView — auto-execution mode (Planner & Agentic).
 * Shows step-by-step progress with status indicators.
 * Wires to usePlanExecution for real-time updates.
 */

import React from 'react';
import {
  Play, Pause, Square, RotateCcw, CheckCircle2,
  XCircle, Clock, Loader2, AlertTriangle, Info, Terminal, Zap,
} from 'lucide-react';
import type { ExecutionPlan, PlanStep } from '@shared/types';
import type { StepResult } from '@shared/types/execution';

// ── Risk badge ─────────────────────────────────────────────────────────────

const RiskBadge: React.FC<{ level: string }> = ({ level }) => {
  const cls: Record<string, string> = {
    safe:      'bg-green-900/40 text-green-400 border border-green-700/40',
    caution:   'bg-yellow-900/40 text-yellow-400 border border-yellow-700/40',
    dangerous: 'bg-red-900/40 text-red-400 border border-red-700/40',
    blocked:   'bg-red-900/60 text-red-300 border border-red-600/60',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${cls[level] ?? cls.caution}`}>
      {level}
    </span>
  );
};

// ── Status icon ────────────────────────────────────────────────────────────

const StatusIcon: React.FC<{ status: PlanStep['status']; isCurrentStep: boolean; isBeingAnalyzed?: boolean }> = ({ status, isCurrentStep, isBeingAnalyzed }) => {
  if (isBeingAnalyzed) return <Zap className="h-4 w-4 text-purple-400 flex-shrink-0 animate-pulse" />;
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />;
  if (status === 'failed')    return <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />;
  if (status === 'running' || isCurrentStep)
    return <Loader2 className="h-4 w-4 text-vscode-accent animate-spin flex-shrink-0" />;
  if (status === 'awaiting-approval') return <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0" />;
  if (status === 'skipped')   return <RotateCcw className="h-4 w-4 text-gray-400 flex-shrink-0" />;
  return <Clock className="h-4 w-4 text-gray-500 flex-shrink-0" />;
};

// ── Step row ───────────────────────────────────────────────────────────────

interface StepRowProps {
  step: PlanStep;
  index: number;
  isCurrentStep: boolean;
  isBeingAnalyzed: boolean;
  result?: StepResult;
}

const StepRow: React.FC<StepRowProps> = ({ step, index, isCurrentStep, isBeingAnalyzed, result }) => {
  const isActive = step.status === 'running' || isCurrentStep;
  const isRecovering = isBeingAnalyzed;
  const assessment = result?.assessment;

  return (
    <div className={`border rounded-md p-3 transition-colors ${
      isRecovering
        ? 'border-purple-500/60 bg-purple-900/10'
        : isActive
          ? 'border-vscode-accent/60 bg-vscode-accent/5'
          : step.status === 'completed'
            ? 'border-green-500 bg-green-900/20 shadow-[0_0_0_1px_rgba(34,197,94,0.15)]'
            : step.status === 'failed'
              ? 'border-red-700/30 bg-red-900/10'
              : 'border-[#1e3a5f]/60 bg-[#111827]'
    }`}>
      <div className="flex items-start gap-2">
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-vscode-text-secondary w-5 text-right">{index + 1}.</span>
          <StatusIcon status={step.status} isCurrentStep={isCurrentStep} isBeingAnalyzed={isBeingAnalyzed} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-vscode-text font-medium">{step.description}</span>
            <RiskBadge level={step.riskAssessment.level} />
          </div>

          <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-[#9cdcfe] bg-[#141414] rounded px-2 py-1">
            <Terminal className="h-3 w-3 text-gray-500 flex-shrink-0" />
            <span className="truncate">{step.command}</span>
          </div>

          {step.explanation && (
            <p className="mt-1 text-[11px] text-vscode-text-secondary leading-relaxed">
              {step.explanation}
            </p>
          )}

          {/* Output from executed step */}
          {result && (
            <div className="mt-2 space-y-1">
              {assessment && (
                <div className={`text-[11px] flex items-center gap-1 ${
                  assessment.succeeded ? 'text-green-400' : 'text-red-400'
                }`}>
                  {assessment.succeeded
                    ? <CheckCircle2 className="h-3 w-3" />
                    : <XCircle className="h-3 w-3" />}
                  <span>{assessment.reason}</span>
                  <span className="text-gray-500">({assessment.confidence} confidence)</span>
                </div>
              )}
              {result.stdout && (
                <pre className="text-[10px] font-mono bg-[#0d1117] text-gray-300 rounded p-1.5 max-h-20 overflow-y-auto whitespace-pre-wrap break-words">
                  {result.stdout.trim()}
                </pre>
              )}
              {result.stderr && (
                <pre className="text-[10px] font-mono bg-[#0d1117] text-yellow-300 rounded p-1.5 max-h-16 overflow-y-auto whitespace-pre-wrap break-words">
                  {result.stderr.trim()}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main FixerPlanView ─────────────────────────────────────────────────────

interface FixerPlanViewProps {
  plan: ExecutionPlan;
  isExecuting: boolean;
  isPaused: boolean;
  isReplanning: boolean;
  currentStepIndex: number;
  stepResults: Map<string, StepResult>;
  error: string | null;
  agentMessage: string | null;
  retryInfo: { stepId: string; attempt: number; maxAttempts: number } | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export const FixerPlanView: React.FC<FixerPlanViewProps> = ({
  plan,
  isExecuting,
  isPaused,
  isReplanning,
  currentStepIndex,
  stepResults,
  error,
  agentMessage,
  retryInfo,
  onStart,
  onPause,
  onResume,
  onCancel,
}) => {
  const completedCount = [...stepResults.values()].filter(r => r.assessment?.succeeded).length;
  const totalSteps = plan.steps.length;
  const progressPct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="text-xs font-semibold text-vscode-text">{plan.goal}</h3>
          <p className="text-[10px] text-vscode-text-secondary mt-0.5">
            {totalSteps} steps • {plan.mode ?? 'planner'} mode
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isExecuting && (
            <button
              onClick={onStart}
              className="flex items-center gap-1 px-2 py-1 bg-vscode-accent text-white rounded text-xs hover:bg-blue-600 transition-colors"
            >
              <Play className="h-3 w-3" /> Run
            </button>
          )}
          {isExecuting && !isPaused && (
            <button
              onClick={onPause}
              className="flex items-center gap-1 px-2 py-1 bg-[#2d2d2d] text-vscode-text rounded text-xs hover:bg-[#3e3e3e] transition-colors border border-[#555]"
            >
              <Pause className="h-3 w-3" /> Pause
            </button>
          )}
          {isExecuting && isPaused && (
            <button
              onClick={onResume}
              className="flex items-center gap-1 px-2 py-1 bg-vscode-accent text-white rounded text-xs hover:bg-blue-600 transition-colors"
            >
              <Play className="h-3 w-3" /> Resume
            </button>
          )}
          {isExecuting && (
            <button
              onClick={onCancel}
              className="flex items-center gap-1 px-2 py-1 bg-[#2d2d2d] text-red-400 rounded text-xs hover:bg-red-900/30 transition-colors border border-red-700/40"
            >
              <Square className="h-3 w-3" /> Cancel
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isExecuting && (
        <div className="w-full bg-[#2d2d2d] rounded-full h-1.5">
          <div
            className="bg-vscode-accent h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* Agent messages (no-ops now, used when AgentLoop ships) */}
      {agentMessage && (
        <div className="flex items-center gap-1.5 text-[11px] text-yellow-400 bg-yellow-900/20 border border-yellow-700/30 rounded px-2 py-1.5">
          <Info className="h-3 w-3 flex-shrink-0" />
          {agentMessage}
        </div>
      )}
      {retryInfo && (
        <div className="flex items-center gap-1.5 text-[11px] text-blue-400 bg-blue-900/20 border border-blue-700/30 rounded px-2 py-1.5">
          <RotateCcw className="h-3 w-3 flex-shrink-0" />
          Retry attempt {retryInfo.attempt} / {retryInfo.maxAttempts}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-400 bg-red-900/20 border border-red-700/30 rounded px-2 py-1.5">
          <XCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {/* Rollback hint */}
      {error && plan.rollbackPlan && plan.rollbackPlan.length > 0 && (
        <div className="text-[11px] text-gray-400 bg-[#0a1628] border border-[#1e3a5f]/60 rounded p-2">
          <p className="font-medium text-gray-300 mb-1">Rollback steps:</p>
          {plan.rollbackPlan.map((cmd, i) => (
            <div key={i} className="font-mono text-[10px] text-[#9cdcfe]">$ {cmd}</div>
          ))}
        </div>
      )}

      {/* Steps */}
      <div className="flex flex-col gap-2">
        {plan.steps.map((step, i) => (
          <StepRow
            key={step.id}
            step={step}
            index={i}
            isCurrentStep={isExecuting && i === currentStepIndex}
            isBeingAnalyzed={isReplanning && step.status === 'failed' && retryInfo?.stepId === step.id}
            result={stepResults.get(step.id)}
          />
        ))}
      </div>

      {/* Success criteria */}
      {plan.successCriteria.length > 0 && (
        <div className="text-[11px] text-gray-400 bg-[#0a1628] border border-[#1e3a5f]/60 rounded p-2">
          <p className="font-medium text-gray-300 mb-1">Success criteria:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {plan.successCriteria.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};
