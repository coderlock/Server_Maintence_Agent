/**
 * FixerPlanView — auto-execution mode (Planner & Agentic).
 * Shows step-by-step progress with status indicators.
 * Wires to usePlanExecution for real-time updates.
 */

import React from 'react';
import {
  Play, Pause, Square, RotateCcw, CheckCircle2,
  XCircle, Clock, Loader2, AlertTriangle, Info, Terminal, Zap,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import type { ExecutionPlan, PlanStep } from '@shared/types';
import type { StepResult } from '@shared/types/execution';
import { StallIndicator } from './StallIndicator';
import type { StepStallState } from './StallIndicator';

// ── Step outcome helper ──────────────────────────────────────────────────────

type StepOutcome = 'success' | 'warning' | 'failed' | 'running' | 'pending';

function getStepOutcome(step: PlanStep, result?: StepResult): StepOutcome {
  if (step.status === 'failed')    return 'failed';
  if (step.status === 'running')   return 'running';
  if (step.status === 'completed') {
    if (!result) return 'success';
    const hasStderr    = !!result.stderr?.trim();
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

const StatusIcon: React.FC<{ status: PlanStep['status']; isCurrentStep: boolean; isBeingAnalyzed?: boolean; retryExhausted?: boolean; outcome?: StepOutcome }> = ({ status, isCurrentStep, isBeingAnalyzed, retryExhausted, outcome }) => {
  if (isBeingAnalyzed) return <Zap className="h-4 w-4 text-purple-400 flex-shrink-0 animate-pulse" />;
  if (status === 'completed' && outcome === 'warning')
    return <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0" />;
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />;
  if (status === 'failed')    return <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />;
  if (status === 'running' || isCurrentStep)
    return <Loader2 className={`h-4 w-4 text-vscode-accent flex-shrink-0 ${retryExhausted ? '' : 'animate-spin'}`} />;
  if (status === 'awaiting-approval') return <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0" />;
  if (status === 'skipped')   return <RotateCcw className="h-4 w-4 text-gray-400 flex-shrink-0" />;
  return <Clock className="h-4 w-4 text-gray-500 flex-shrink-0" />;
};

// ── Log entry type ────────────────────────────────────────────────────────

type LogEntryType = 'info' | 'success' | 'error' | 'retry' | 'replan';
interface LogEntry { time: string; type: LogEntryType; message: string; }

// ── Step row ───────────────────────────────────────────────────────────────

interface StepRowProps {
  step: PlanStep;
  index: number;
  isCurrentStep: boolean;
  isBeingAnalyzed: boolean;
  result?: StepResult;
  retryInfo?: { stepId: string; attempt: number; maxAttempts: number } | null;
  /** Live output chunks accumulated while this step is running. */
  liveOutput?: { stdout: string; stderr: string };
  /** True in real-terminal mode — stderr is merged into stdout, never separate. */
  mergesStderr?: boolean;
  /** Sprint 8: stall / prompt state for this step. */
  stallState?: StepStallState | null;
  /** True when this step was never executed and execution has stopped — dim it out. */
  isSuperseded?: boolean;
  /** True when this step was injected by the agent mid-execution (replanning). */
  isDynamic?: boolean;
}

const StepRow: React.FC<StepRowProps> = ({ step, index, isCurrentStep, isBeingAnalyzed, result, retryInfo, liveOutput, mergesStderr, stallState, isSuperseded, isDynamic }) => {
  const isActive = step.status === 'running' || isCurrentStep;
  const isRecovering = isBeingAnalyzed;
  const assessment = result?.assessment;
  const isRetrying = !!(retryInfo && retryInfo.stepId === step.id);
  const retryExhausted = isRetrying && retryInfo!.attempt >= retryInfo!.maxAttempts;
  const outcome = getStepOutcome(step, result);

  // Auto-collapse when a step completes; user can re-expand.
  const [isExpanded, setIsExpanded] = React.useState(step.status !== 'completed');
  React.useEffect(() => {
    if (step.status === 'completed') setIsExpanded(false);
  }, [step.status]);
  const isCollapsible = step.status === 'completed';

  return (
    <div className={`${isDynamic ? 'ml-4' : ''}`}>
    {isDynamic && (
      <div className="flex items-center gap-1 mb-1 ml-1">
        <Zap className="h-2.5 w-2.5 text-yellow-500/70" />
        <span className="text-[9px] text-yellow-500/70 uppercase tracking-wider font-medium">added by agent</span>
      </div>
    )}
    <div className={`border rounded-md transition-colors ${isCollapsible ? 'cursor-pointer select-none' : ''} ${isSuperseded ? 'opacity-40' : ''} ${
      isSuperseded
        ? 'border-[#1e3a5f]/30 bg-[#0d1117]'
        : isRecovering
          ? 'border-purple-500/60 bg-purple-900/10'
          : isActive
            ? 'border-vscode-accent/60 bg-vscode-accent/5'
            : outcome === 'success'
              ? 'border-green-500 bg-green-900/20 shadow-[0_0_0_1px_rgba(34,197,94,0.15)]'
              : outcome === 'warning'
                ? 'border-yellow-500/60 bg-yellow-900/20 shadow-[0_0_0_1px_rgba(234,179,8,0.10)]'
                : outcome === 'failed'
                  ? 'border-red-700/50 bg-red-900/15'
                  : isDynamic
                    ? 'border-yellow-600/50 bg-yellow-900/10'
                    : 'border-[#1e3a5f]/60 bg-[#111827]'
    }`}
      onClick={isCollapsible ? () => setIsExpanded(v => !v) : undefined}
    >
      <div className={`flex items-start gap-2 ${isExpanded ? 'p-3' : 'px-3 py-2'}`}>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-vscode-text-secondary w-5 text-right">{index + 1}.</span>
          <StatusIcon status={step.status} isCurrentStep={isCurrentStep} isBeingAnalyzed={isBeingAnalyzed} retryExhausted={retryExhausted} outcome={outcome} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-vscode-text font-medium">{step.description}</span>
            <RiskBadge level={step.riskAssessment.level} />
          </div>

          {isExpanded && (
            <>
          <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-[#9cdcfe] bg-[#141414] rounded px-2 py-1">
            <Terminal className="h-3 w-3 text-gray-500 flex-shrink-0" />
            <span className="truncate">{step.command}</span>
          </div>

          {step.explanation && (
            <p className="mt-1 text-[11px] text-vscode-text-secondary leading-relaxed">
              {step.explanation}
            </p>
          )}

          {/* Replanning banner — AI is analyzing this failure */}
          {isBeingAnalyzed && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-purple-300 bg-purple-900/20 border border-purple-600/40 rounded px-2 py-1 animate-pulse">
              <Zap className="h-3 w-3 flex-shrink-0" />
              AI analyzing failure — generating recovery plan…
            </div>
          )}

          {/* Inline retry indicator with attempt dots */}
          {isRetrying && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-orange-400 bg-orange-900/20 border border-orange-700/30 rounded px-2 py-1">
              <RotateCcw className={`h-3 w-3 flex-shrink-0 ${retryExhausted ? '' : 'animate-spin'}`} />
              <span className="font-medium">{retryExhausted ? 'Retry limit reached' : 'Retrying…'}</span>
              <span className="text-gray-500">Attempt {retryInfo!.attempt} of {retryInfo!.maxAttempts}</span>
              <div className="ml-auto flex gap-0.5">
                {Array.from({ length: retryInfo!.maxAttempts }).map((_, i) => (
                  <div key={i} className={`h-1.5 w-3 rounded-sm ${i < retryInfo!.attempt ? 'bg-orange-500' : 'bg-gray-700'}`} />
                ))}
              </div>
            </div>
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
              {/* Only show the separate stderr block in batch mode (streams are separate).
                  In real-terminal mode stderr is merged into stdout — no duplicate box. */}
              {!mergesStderr && result.stderr && (
                <pre className="text-[10px] font-mono bg-[#0d1117] text-yellow-300 rounded p-1.5 max-h-16 overflow-y-auto whitespace-pre-wrap break-words">
                  {result.stderr.trim()}
                </pre>
              )}
              {/* Hint shown on failed steps in real-terminal mode */}
              {mergesStderr && !result.assessment?.succeeded && (
                <p className="text-[10px] text-gray-500 italic">
                  Real Terminal mode — stdout and stderr are merged above
                </p>
              )}
            </div>
          )}

          {/* Live streaming output while step is running */}
          {!result && isCurrentStep && liveOutput && liveOutput.stdout && (
            <div className="mt-2">
              <pre className="text-[10px] font-mono bg-[#0d1117] text-gray-400 rounded p-1.5 max-h-20 overflow-y-auto whitespace-pre-wrap break-words">
                {liveOutput.stdout}
                <span className="animate-pulse">&#x258c;</span>
              </pre>
            </div>
          )}

          {/* Sprint 8: Stall / prompt indicator — shown while step is executing */}
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

        {/* Expand/collapse chevron — only for completed steps */}
        {isCollapsible && (
          <div className="flex-shrink-0 mt-0.5 text-gray-500">
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

// ── Main FixerPlanView ─────────────────────────────────────────────────────

interface FixerPlanViewProps {
  plan: ExecutionPlan;
  isExecuting: boolean;
  isPaused: boolean;
  isReplanning: boolean;
  currentStepIndex: number;
  stepResults: Map<string, StepResult>;
  /** Live output chunks per step, keyed by stepId. Populated while a step runs. */
  liveStepOutput: Map<string, { stdout: string; stderr: string }>;
  /** True when execution is in real-terminal mode (stderr merged into stdout). */
  mergesStderr: boolean;
  /** Sprint 8: Stall/prompt state per step, keyed by stepId. */
  stepStallStates: Record<string, StepStallState>;
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
  liveStepOutput,
  mergesStderr,
  stepStallStates,
  error,
  agentMessage,
  retryInfo,
  onStart,
  onPause,
  onResume,
  onCancel,
}) => {
  // Track how many steps the plan had when execution started — steps added after
  // that point were injected by the agent mid-run (replanning / dynamic steps).
  const originalStepCountRef = React.useRef<number>(plan.steps.length);
  const prevIsExecutingForCountRef = React.useRef(false);
  React.useEffect(() => {
    if (isExecuting && !prevIsExecutingForCountRef.current) {
      originalStepCountRef.current = plan.steps.length;
    }
    prevIsExecutingForCountRef.current = isExecuting;
  }, [isExecuting]); // eslint-disable-line react-hooks/exhaustive-deps

  const completedCount = [...stepResults.values()].filter(r => r.assessment?.succeeded).length;
  const totalSteps = plan.steps.length;
  const progressPct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
  const hasFailed = plan.steps.some(s => s.status === 'failed');
  const isDone = !isExecuting && stepResults.size > 0;

  // Determine where to inject the inline error banner (above the problem step).
  const errorInsertIndex = React.useMemo(() => {
    if (!error) return -1;
    if (isExecuting) return currentStepIndex;
    const failedIdx = plan.steps.findIndex(s => s.status === 'failed');
    return failedIdx >= 0 ? failedIdx : plan.steps.length;
  }, [error, isExecuting, currentStepIndex, plan.steps]);

  // ── Execution log (Option B: derived from prop changes via useEffect) ────
  const [executionLog, setExecutionLog] = React.useState<LogEntry[]>([]);
  const [logOpen, setLogOpen] = React.useState(false);
  const logEndRef = React.useRef<HTMLDivElement>(null);
  const loggedResultsRef = React.useRef(new Set<string>());
  const prevIsExecutingRef = React.useRef(false);
  const prevIsReplanningRef = React.useRef(false);
  const prevRetryKeyRef = React.useRef<string | null>(null);
  const prevStepIndexRef = React.useRef(-1);

  const ts = () => new Date().toLocaleTimeString('en-US', { hour12: false });

  // Log execution lifecycle (start / finish)
  React.useEffect(() => {
    if (isExecuting && !prevIsExecutingRef.current) {
      loggedResultsRef.current.clear();
      prevStepIndexRef.current = -1;
      setExecutionLog([{ time: ts(), type: 'info', message: 'Execution started' }]);
    } else if (!isExecuting && prevIsExecutingRef.current && stepResults.size > 0) {
      setExecutionLog(prev => [...prev, {
        time: ts(),
        type: hasFailed ? 'error' : 'success',
        message: `Execution finished — ${completedCount}/${totalSteps} steps succeeded`,
      }]);
    }
    prevIsExecutingRef.current = isExecuting;
  }, [isExecuting]); // eslint-disable-line react-hooks/exhaustive-deps

  // Log step starts
  React.useEffect(() => {
    if (isExecuting && currentStepIndex !== prevStepIndexRef.current && currentStepIndex >= 0 && currentStepIndex < totalSteps) {
      const step = plan.steps[currentStepIndex];
      if (step) {
        setExecutionLog(prev => [...prev, { time: ts(), type: 'info', message: `Step ${currentStepIndex + 1} started: ${step.description}` }]);
      }
    }
    prevStepIndexRef.current = currentStepIndex;
  }, [currentStepIndex, isExecuting]); // eslint-disable-line react-hooks/exhaustive-deps

  // Log step results as they arrive
  React.useEffect(() => {
    stepResults.forEach((result, stepId) => {
      if (!loggedResultsRef.current.has(stepId)) {
        loggedResultsRef.current.add(stepId);
        const stepIdx = plan.steps.findIndex(s => s.id === stepId);
        const label = stepIdx >= 0 ? `Step ${stepIdx + 1}` : stepId;
        if (result.assessment?.succeeded) {
          setExecutionLog(prev => [...prev, { time: ts(), type: 'success', message: `${label} completed successfully` }]);
        } else if (result.assessment) {
          setExecutionLog(prev => [...prev, { time: ts(), type: 'error', message: `${label} failed: ${result.assessment!.reason}` }]);
        }
      }
    });
  }, [stepResults]); // eslint-disable-line react-hooks/exhaustive-deps

  // Log retries
  React.useEffect(() => {
    if (retryInfo) {
      const key = `${retryInfo.stepId}-${retryInfo.attempt}`;
      if (key !== prevRetryKeyRef.current) {
        prevRetryKeyRef.current = key;
        const stepIdx = plan.steps.findIndex(s => s.id === retryInfo.stepId);
        const label = stepIdx >= 0 ? `Step ${stepIdx + 1}` : retryInfo.stepId;
        setExecutionLog(prev => [...prev, { time: ts(), type: 'retry', message: `${label} — retry attempt ${retryInfo.attempt} of ${retryInfo.maxAttempts}` }]);
      }
    }
  }, [retryInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Log replanning
  React.useEffect(() => {
    if (isReplanning && !prevIsReplanningRef.current) {
      setExecutionLog(prev => [...prev, { time: ts(), type: 'replan', message: 'AI replanning triggered — analyzing failure and generating recovery steps…' }]);
    }
    prevIsReplanningRef.current = isReplanning;
  }, [isReplanning]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll log to bottom when new entries arrive
  React.useEffect(() => {
    if (logOpen && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [executionLog, logOpen]);

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="text-xs font-semibold text-vscode-text">{plan.goal}</h3>
          <p className="text-[10px] text-vscode-text-secondary mt-0.5">
            {plan.steps.length} steps • {plan.mode === 'agent' ? 'agent mode' : plan.mode ?? 'agent'} mode
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
      {/* Retry info is now shown inline on the affected step */}

      {/* Steps — error banner injected inline above the problem step */}
      <div className="flex flex-col gap-2">
        {plan.steps.map((step, i) => {
          const isSuperseded = !isExecuting && hasFailed &&
            step.status === 'pending' && !stepResults.has(step.id);
          return (
            <React.Fragment key={step.id}>
              {error && i === errorInsertIndex && (
                <div className="flex items-start gap-1.5 text-[11px] text-red-400 bg-red-900/20 border border-red-700/30 rounded px-2 py-1.5">
                  <XCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  <span className="break-words">{error}</span>
                </div>
              )}
              <StepRow
                step={step}
                index={i}
                isCurrentStep={isExecuting && i === currentStepIndex}
                isBeingAnalyzed={isReplanning && step.status === 'failed' && retryInfo?.stepId === step.id}
                result={stepResults.get(step.id)}
                retryInfo={retryInfo}
                liveOutput={liveStepOutput.get(step.id)}
                mergesStderr={mergesStderr}
                stallState={stepStallStates[step.id] ?? null}
                isSuperseded={isSuperseded}
                isDynamic={i >= originalStepCountRef.current}
              />
            </React.Fragment>
          );
        })}
        {/* Error banner after the last step when the failure is at the end */}
        {error && errorInsertIndex === plan.steps.length && (
          <div className="flex items-start gap-1.5 text-[11px] text-red-400 bg-red-900/20 border border-red-700/30 rounded px-2 py-1.5">
            <XCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
            <span className="break-words">{error}</span>
          </div>
        )}
      </div>

      {/* Rollback hint */}
      {error && plan.rollbackPlan && plan.rollbackPlan.length > 0 && (
        <div className="text-[11px] text-gray-400 bg-[#0a1628] border border-[#1e3a5f]/60 rounded p-2">
          <p className="font-medium text-gray-300 mb-1">Rollback steps:</p>
          {plan.rollbackPlan.map((cmd, i) => (
            <div key={i} className="font-mono text-[10px] text-[#9cdcfe]">$ {cmd}</div>
          ))}
        </div>
      )}

      {/* Completion banner */}
      {isDone && (
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
              ? `Completed with errors — ${completedCount} of ${totalSteps} steps succeeded`
              : `All ${totalSteps} step${totalSteps !== 1 ? 's' : ''} completed successfully`}
          </span>
        </div>
      )}

      {/* Success criteria */}
      {plan.successCriteria.length > 0 && (
        <div className="text-[11px] text-gray-400 bg-[#0a1628] border border-[#1e3a5f]/60 rounded p-2">
          <p className="font-medium text-gray-300 mb-1">Success criteria:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {plan.successCriteria.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      {/* Collapsible execution log */}
      {executionLog.length > 0 && (
        <div className="border border-[#1e3a5f]/60 rounded overflow-hidden">
          <button
            onClick={() => setLogOpen(v => !v)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] text-gray-400 hover:text-gray-200 hover:bg-[#0f1f35] transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Terminal className="h-3 w-3" />
              Execution log
              <span className="text-gray-600">({executionLog.length} events)</span>
            </span>
            <span className="text-gray-600 text-[10px]">{logOpen ? '▲ hide' : '▼ show'}</span>
          </button>
          {logOpen && (
            <div className="max-h-48 overflow-y-auto bg-[#070d14] px-2.5 py-2 space-y-0.5">
              {executionLog.map((entry, i) => (
                <div key={i} className={`text-[10px] font-mono flex gap-2 ${
                  entry.type === 'error'   ? 'text-red-400' :
                  entry.type === 'success' ? 'text-green-400' :
                  entry.type === 'retry'   ? 'text-orange-400' :
                  entry.type === 'replan'  ? 'text-purple-400' :
                                            'text-gray-500'
                }`}>
                  <span className="text-gray-700 flex-shrink-0 select-none">{entry.time}</span>
                  <span className="break-words">{entry.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
