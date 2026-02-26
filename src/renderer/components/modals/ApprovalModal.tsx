/**
 * ApprovalModal — shown when a dangerous command needs explicit user approval.
 *
 * Three choices: Approve (run it), Skip (skip this step), Cancel Plan.
 * Rendered by PlanView when pendingApproval != null.
 */

import React from 'react';
import { AlertTriangle, CheckCircle2, SkipForward, Square, Terminal } from 'lucide-react';

interface ApprovalModalProps {
  stepId: string;
  command: string;
  riskLevel: string;
  warningMessage?: string;
  onApprove: () => void;
  onReject: () => void;
  onSkip: () => void;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  stepId: _stepId,
  command,
  riskLevel,
  warningMessage,
  onApprove,
  onReject,
  onSkip,
}) => {
  const riskColor = riskLevel === 'blocked'
    ? 'border-red-600/80 bg-red-950/60'
    : 'border-red-700/60 bg-red-950/40';

  const riskLabelColor = riskLevel === 'blocked'
    ? 'text-red-300 bg-red-900/60 border-red-700/60'
    : 'text-red-400 bg-red-900/40 border-red-700/40';

  return (
    /* Backdrop */
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-sm rounded-lg border ${riskColor} shadow-2xl`}>

        {/* Header */}
        <div className="flex items-center gap-2 p-4 border-b border-red-800/40">
          <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-red-300">Approval Required</h3>
            <p className="text-[11px] text-red-400 mt-0.5">
              This command requires explicit confirmation before executing
            </p>
          </div>
          <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border ${riskLabelColor}`}>
            {riskLevel}
          </span>
        </div>

        <div className="p-4 space-y-3">
          {/* Command */}
          <div>
            <p className="text-[11px] text-gray-400 mb-1.5">Command to execute:</p>
            <div className="bg-[#0d1117] border border-[#3e3e3e] rounded overflow-hidden">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-[#141414] border-b border-[#3e3e3e] text-[10px] text-gray-500">
                <Terminal className="h-3 w-3" />
                bash
              </div>
              <pre className="px-3 py-2 text-[12px] font-mono text-[#9cdcfe] overflow-x-auto whitespace-pre">
                {`$ ${command}`}
              </pre>
            </div>
          </div>

          {/* Warning message */}
          {warningMessage && (
            <div className="flex items-start gap-2 text-[11px] text-yellow-300 bg-yellow-900/20 border border-yellow-700/30 rounded px-2.5 py-2">
              <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
              <span>{warningMessage}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={onApprove}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-green-800/60 hover:bg-green-700/60 text-green-300 rounded border border-green-700/40 text-xs font-medium transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approve — Run this command
            </button>

            <button
              onClick={onSkip}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-[#2d2d2d] hover:bg-[#3e3e3e] text-vscode-text-secondary rounded border border-[#555] text-xs font-medium transition-colors"
            >
              <SkipForward className="h-3.5 w-3.5" />
              Skip — Continue without this step
            </button>

            <button
              onClick={onReject}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded border border-red-700/40 text-xs font-medium transition-colors"
            >
              <Square className="h-3.5 w-3.5" />
              Cancel Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
