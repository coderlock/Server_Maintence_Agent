/**
 * ManualPlanView — per-step execution mode.
 *
 * Each step has its own "Run" button. The user triggers steps individually;
 * every step goes through the full execution pipeline (risk check, output
 * capture, approval gate). No automatic advancement between steps.
 *
 * This gives full control and visibility — useful for verifying each command
 * before moving on, or for running only selected parts of a plan.
 */

import React from 'react';
import {
  Play, Square, CheckCircle2, XCircle, Clock,
  Loader2, AlertTriangle, Terminal, ChevronDown, ChevronRight,
} from 'lucide-react';
import type { ExecutionPlan, PlanStep } from '@shared/types';
import type { StepResult } from '@shared/types/execution';
import type { StepStallState } from './StallIndicator';
import { StallIndicator } from './StallIndicator';

// ── Step outcome helper ──────────────────────────────────────────────────────

type StepOutcome = 'success' | 'warning' | 'failed' | 'running' | 'pending';

function getStepOutcome(step: PlanStep, result?: StepResult): StepOutcome {
  if (step.status === 'failed')    return 'failed';
  if (step.status === 'running')   return 'running';
  if (step.status === 'completed') {
    if (!result) return 'success';
    const hasStderr   = !!result.stderr?.trim();
    const assessFailed = result.assessment ? !result.assessment.succeeded : false;
    return hasStderr || assessFailed ? 'warning' : 'success';
  }
  return 'pending';
}

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

const StatusIcon: React.FC<{ status: PlanStep['status']; isCurrentStep: boolean; outcome?: StepOutcome }> = ({ status, isCurrentStep, outcome }) => {
  if (status === 'completed' && outcome === 'warning')
    return <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0" />;
  if (status === 'completed')        return <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />;
  if (status === 'failed')           return <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />;
  if (status === 'running' || isCurrentStep)
    return <Loader2 className="h-4 w-4 text-vscode-accent flex-shrink-0 animate-spin" />;
  if (status === 'awaiting-approval') return <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0" />;
  return <Clock className="h-4 w-4 text-gray-500 flex-shrink-0" />;
};

// ── Individual step row ────────────────────────────────────────────────────

interface ManualStepRowProps {
  step: PlanStep;
  index: number;
  isCurrentStep: boolean;
  result?: StepResult;
  liveOutput?: { stdout: string; stderr: string };
  mergesStderr?: boolean;
  stallState?: StepStallState | null;
  /** True when any step is currently executing (disables all Run buttons). */
  isExecuting: boolean;
  onRun: () => void;
  onCancel: () => void;
}

const ManualStepRow: React.FC<ManualStepRowProps> = ({
  step,
  index,
  isCurrentStep,
  result,
  liveOutput,
  mergesStderr,
  stallState,
  isExecuting,
  onRun,
  onCancel,
}) => {
  const isActive = step.status === 'running' || isCurrentStep;
  const assessment = result?.assessment;
  const outcome = getStepOutcome(step, result);

  // Completed steps start collapsed; others start expanded.
  const [isExpanded, setIsExpanded] = React.useState(step.status !== 'completed');
  React.useEffect(() => {
    if (step.status === 'completed') setIsExpanded(false);
  }, [step.status]);

  const isCollapsible = step.status === 'completed';

  // A step can be run if it is pending and nothing else is executing right now.
  const canRun = step.status === 'pending' && !isExecuting;

  return (
    <div className={`border rounded-md transition-colors ${isCollapsible ? 'cursor-pointer select-none' : ''} ${
      isActive
        ? 'border-vscode-accent/60 bg-vscode-accent/5'
        : outcome === 'success'
          ? 'border-green-500 bg-green-900/30 shadow-[0_0_0_1px_rgba(34,197,94,0.20)]'
          : outcome === 'warning'
            ? 'border-yellow-500/70 bg-yellow-900/30 shadow-[0_0_0_1px_rgba(234,179,8,0.15)]'
            : outcome === 'failed'
              ? 'border-red-600/70 bg-red-900/25 shadow-[0_0_0_1px_rgba(239,68,68,0.15)]'
              : 'border-[#1e3a5f]/60 bg-[#111827]'
    }`}
      onClick={isCollapsible ? () => setIsExpanded(v => !v) : undefined}
    >
      <div className={`flex items-start gap-2 ${isExpanded ? 'p-3' : 'px-3 py-2'}`}>

        {/* Step number + status icon */}
        <div className="flex items-center gap-1.5 mt-0.5 flex-shrink-0">
          <span className="text-[10px] text-vscode-text-secondary w-5 text-right">{index + 1}.</span>
          <StatusIcon status={step.status} isCurrentStep={isCurrentStep} outcome={outcome} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-vscode-text font-medium">{step.description}</span>
            <RiskBadge level={step.riskAssessment.level} />
          </div>

          {isExpanded && (
            <>
              {/* Command */}
              <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-[#9cdcfe] bg-[#141414] rounded px-2 py-1">
                <Terminal className="h-3 w-3 text-gray-500 flex-shrink-0" />
                <span className="truncate">{step.command}</span>
              </div>

              {/* Explanation */}
              {step.explanation && (
                <p className="mt-1 text-[11px] text-vscode-text-secondary leading-relaxed">
                  {step.explanation}
                </p>
              )}

              {/* Risk warning */}
              {step.riskAssessment.level === 'dangerous' && step.riskAssessment.warningMessage && (
                <div className="mt-1 flex items-start gap-1.5 text-[11px] text-yellow-400 bg-yellow-900/20 border border-yellow-700/30 rounded px-2 py-1.5">
                  ⚠️ {step.riskAssessment.warningMessage}
                </div>
              )}

              {/* Step result */}
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
                  {!mergesStderr && result.stderr && (
                    <pre className="text-[10px] font-mono bg-[#0d1117] text-yellow-300 rounded p-1.5 max-h-16 overflow-y-auto whitespace-pre-wrap break-words">
                      {result.stderr.trim()}
                    </pre>
                  )}
                </div>
              )}

              {/* Live output while running */}
              {!result && isCurrentStep && liveOutput?.stdout && (
                <div className="mt-2">
                  <pre className="text-[10px] font-mono bg-[#0d1117] text-gray-400 rounded p-1.5 max-h-20 overflow-y-auto whitespace-pre-wrap break-words">
                    {liveOutput.stdout}
                    <span className="animate-pulse">&#x258c;</span>
                  </pre>
                </div>
              )}

              {/* Stall indicator */}
              {isActive && (
                <StallIndicator
                  stallState={stallState ?? null}
                  onSubmitInput={(input) =>
                    window.electronAPI.plan.submitPromptInput(step.id, input)
                  }
                  onForceStop={() => window.electronAPI.plan.cancel()}
                />
              )}
            </>
          )}
        </div>

        {/* Right-side controls */}
        <div className="flex-shrink-0 flex items-center gap-1.5 mt-0.5">
          {/* Run button — only visible on eligible pending steps */}
          {canRun && (
            <button
              onClick={(e) => { e.stopPropagation(); onRun(); }}
              className="flex items-center gap-1 px-2 py-0.5 bg-vscode-accent text-white rounded text-[10px] hover:bg-blue-600 transition-colors"
              title={`Run step ${index + 1}`}
            >
              <Play className="h-2.5 w-2.5" />
              Run
            </button>
          )}

          {/* Cancel button — only when this step is running */}
          {isActive && isExecuting && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
              className="flex items-center gap-1 px-2 py-0.5 bg-[#2d2d2d] text-red-400 rounded text-[10px] hover:bg-red-900/30 transition-colors border border-red-700/40"
              title="Cancel this step"
            >
              <Square className="h-2.5 w-2.5" />
              Cancel
            </button>
          )}

          {/* Expand/collapse chevron for completed steps */}
          {isCollapsible && (
            <div className="text-gray-500">
              {isExpanded
                ? <ChevronDown className="h-3.5 w-3.5" />
                : <ChevronRight className="h-3.5 w-3.5" />}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

// ── Main ManualPlanView ────────────────────────────────────────────────────

interface ManualPlanViewProps {
  plan: ExecutionPlan;
  planId: string;
  isExecuting: boolean;
  currentStepIndex: number;
  stepResults: Map<string, StepResult>;
  liveStepOutput: Map<string, { stdout: string; stderr: string }>;
  mergesStderr: boolean;
  stepStallStates: Record<string, StepStallState>;
  pendingApproval: { stepId: string; command: string; riskLevel: string; warningMessage?: string } | null;
  error: string | null;
  onRunStep: (stepIndex: number) => void;
  onCancel: () => void;
}

export const ManualPlanView: React.FC<ManualPlanViewProps> = ({
  plan,
  isExecuting,
  currentStepIndex,
  stepResults,
  liveStepOutput,
  mergesStderr,
  stepStallStates,
  error,
  onRunStep,
  onCancel,
}) => {
  const completedCount = [...stepResults.values()].filter(r => r.assessment?.succeeded).length;
  const totalSteps = plan.steps.length;
  const hasFailed = plan.steps.some(s => s.status === 'failed');
  const allDone = !isExecuting && stepResults.size >= totalSteps;

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">

      {/* Header */}
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h3 className="text-xs font-semibold text-vscode-text">{plan.goal}</h3>
          <p className="text-[10px] text-vscode-text-secondary mt-0.5">
            {totalSteps} steps • manual mode — click Run on each step
          </p>
        </div>
        <div className="flex-shrink-0 text-[10px] text-vscode-text-secondary">
          {completedCount}/{totalSteps} done
        </div>
      </div>

      {/* Success criteria */}
      {plan.successCriteria.length > 0 && (
        <div className="text-[11px] text-gray-400 bg-[#0a1628] border border-[#1e3a5f]/60 rounded p-2">
          <p className="font-medium text-gray-300 mb-1">Goal:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {plan.successCriteria.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      {/* Steps */}
      <div className="flex flex-col gap-2">
        {plan.steps.map((step, i) => {
          const isCurrentStep = isExecuting && i === currentStepIndex;
          return (
            <React.Fragment key={step.id}>
              {error && step.status === 'failed' && (
                <div className="flex items-start gap-1.5 text-[11px] text-red-400 bg-red-900/20 border border-red-700/30 rounded px-2 py-1.5">
                  <XCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  <span className="break-words">{error}</span>
                </div>
              )}
              <ManualStepRow
                step={step}
                index={i}
                isCurrentStep={isCurrentStep}
                result={stepResults.get(step.id)}
                liveOutput={liveStepOutput.get(step.id)}
                mergesStderr={mergesStderr}
                stallState={stepStallStates[step.id] ?? null}
                isExecuting={isExecuting}
                onRun={() => onRunStep(i)}
                onCancel={onCancel}
              />
            </React.Fragment>
          );
        })}
      </div>

      {/* Completion banner */}
      {allDone && (
        <div className={`flex items-center gap-2 rounded px-3 py-2 text-xs font-medium border ${
          hasFailed
            ? 'text-yellow-300 bg-yellow-900/20 border-yellow-700/40'
            : 'text-green-300 bg-green-900/20 border-green-700/40'
        }`}>
          {hasFailed
            ? <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            : <CheckCircle2 className="h-4 w-4 flex-shrink-0" />}
          <span>
            {hasFailed
              ? `${completedCount} of ${totalSteps} steps completed successfully`
              : `All ${totalSteps} step${totalSteps !== 1 ? 's' : ''} completed`}
          </span>
        </div>
      )}

      {/* Rollback hint */}
      {plan.rollbackPlan && plan.rollbackPlan.length > 0 && (
        <div className="text-[11px] text-gray-400 bg-[#0a1628] border border-[#1e3a5f]/60 rounded p-2">
          <p className="font-medium text-gray-300 mb-1">Rollback steps (if needed):</p>
          {plan.rollbackPlan.map((cmd, i) => (
            <div key={i} className="font-mono text-[10px] text-[#9cdcfe]">$ {cmd}</div>
          ))}
        </div>
      )}
    </div>
  );
};
