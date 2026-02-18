/**
 * PlanView — container that switches between Teacher / Planner / Agentic modes.
 * Renders when a plan exists in the execution hook.
 * Data-driven: reflects state, not flow.
 *
 * Accepts the execution object from the parent (ChatPanel) so it shares
 * the same hook instance — no duplicate state.
 */

import React from 'react';
import { X } from 'lucide-react';
import type { usePlanExecution } from '../../hooks/usePlanExecution';
import { useChatStore } from '../../store/chatStore';
import { FixerPlanView } from './FixerPlanView';
import { ApprovalModal } from '../modals/ApprovalModal';

type PlanExecutionReturn = ReturnType<typeof usePlanExecution>;

interface PlanViewProps {
  execution: PlanExecutionReturn;
}

export const PlanView: React.FC<PlanViewProps> = ({ execution }) => {
  const { mode } = useChatStore(); // kept for onStart mode arg

  if (!execution.plan) return null;

  const {
    plan,
    isExecuting,
    isPaused,
    isReplanning,
    currentStepIndex,
    stepResults,
    pendingApproval,
    error,
    agentMessage,
    retryInfo,
  } = execution;

  return (
    <div className="flex flex-col h-full overflow-hidden border-l-2 border-blue-500/50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0f1729] border-b border-blue-500/30 flex-shrink-0">
        <span className="text-[11px] font-semibold text-blue-300 uppercase tracking-widest">
          ⚡ Execution Plan
        </span>
        <div className="flex items-center gap-2">
          {!isExecuting && (
            <button
              onClick={execution.clear}
              className="text-vscode-text-secondary hover:text-vscode-text transition-colors"
              title="Close plan"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Plan content */}
      <div className="flex-1 overflow-y-auto bg-[#0d1117]">
        <FixerPlanView
          plan={plan}
          isExecuting={isExecuting}
          isPaused={isPaused}
          isReplanning={isReplanning}
          currentStepIndex={currentStepIndex}
          stepResults={stepResults}
          error={error}
          agentMessage={agentMessage}
          retryInfo={retryInfo}
          onStart={() => execution.startExecution(plan.id, mode)}
          onPause={execution.pause}
          onResume={execution.resume}
          onCancel={execution.cancel}
        />
      </div>

      {/* Approval modal — rendered on top when a dangerous command needs approval */}
      {pendingApproval && (
        <ApprovalModal
          stepId={pendingApproval.stepId}
          command={pendingApproval.command}
          riskLevel={pendingApproval.riskLevel}
          warningMessage={pendingApproval.warningMessage}
          onApprove={() => execution.approve(pendingApproval.stepId)}
          onReject={() => execution.reject(pendingApproval.stepId)}
          onSkip={() => execution.skip(pendingApproval.stepId)}
        />
      )}
    </div>
  );
};
