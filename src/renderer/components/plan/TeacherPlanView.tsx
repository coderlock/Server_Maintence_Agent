/**
 * TeacherPlanView — guided display mode.
 * Shows commands with explanations. User copies or sends them to terminal manually.
 */

import React from 'react';
import { Copy, Terminal, CheckCircle2, Clock, BookOpen } from 'lucide-react';
import type { ExecutionPlan, PlanStep } from '@shared/types';

// ── Copy button with toast feedback ───────────────────────────────────────

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-vscode-text-secondary hover:text-vscode-text bg-[#2d2d2d] hover:bg-[#3e3e3e] rounded border border-[#444] transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <>
          <CheckCircle2 className="h-3 w-3 text-green-400" />
          <span className="text-green-400">Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copy
        </>
      )}
    </button>
  );
};

// ── Run in terminal button ─────────────────────────────────────────────────

const SendToTerminalButton: React.FC<{ command: string; onSent?: () => void }> = ({ command, onSent }) => {
  const [sent, setSent] = React.useState(false);

  const handleSend = () => {
    window.electronAPI.ssh.write(command + '\n');
    setSent(true);
    onSent?.();
    setTimeout(() => setSent(false), 2500);
  };

  return (
    <button
      onClick={handleSend}
      className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-vscode-accent/20 text-vscode-accent hover:bg-vscode-accent/30 rounded border border-vscode-accent/30 transition-colors"
      title="Run in terminal"
    >
      {sent ? (
        <>
          <CheckCircle2 className="h-3 w-3 text-green-400" />
          <span className="text-green-400">Sent</span>
        </>
      ) : (
        <>
          <Terminal className="h-3 w-3" />
          Run in terminal
        </>
      )}
    </button>
  );
};

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

// ── Step card ──────────────────────────────────────────────────────────────

const TeacherStepCard: React.FC<{ step: PlanStep; index: number }> = ({ step, index }) => {
  return (
    <div className="border border-[#3e3e3e] rounded-md bg-[#1e1e1e] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#252526] border-b border-[#3e3e3e]">
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[#3e3e3e] text-[10px] font-medium text-vscode-text-secondary flex-shrink-0">
          {index + 1}
        </div>
        <span className="text-xs font-medium text-vscode-text flex-1">{step.description}</span>
        <RiskBadge level={step.riskAssessment.level} />
      </div>

      <div className="p-3 space-y-2">
        {/* Explanation */}
        {step.explanation && (
          <p className="text-[11px] text-vscode-text-secondary leading-relaxed">
            {step.explanation}
          </p>
        )}

        {/* Command block */}
        <div className="bg-[#0d1117] border border-[#3e3e3e] rounded overflow-hidden">
          <div className="flex items-center justify-between px-2 py-1 bg-[#141414] border-b border-[#3e3e3e]">
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              <Terminal className="h-3 w-3" />
              bash
            </div>
            <div className="flex items-center gap-1.5">
              <CopyButton text={step.command} />
              <SendToTerminalButton command={step.command} />
            </div>
          </div>
          <pre className="px-3 py-2 text-[12px] font-mono text-[#9cdcfe] overflow-x-auto whitespace-pre">
            {`$ ${step.command}`}
          </pre>
        </div>

        {/* Expected output */}
        {step.expectedOutput && (
          <div className="text-[11px] text-gray-500 flex items-start gap-1">
            <Clock className="h-3 w-3 flex-shrink-0 mt-0.5 text-gray-600" />
            <span className="italic">{step.expectedOutput}</span>
          </div>
        )}

        {/* Risk warning for dangerous commands */}
        {step.riskAssessment.level === 'dangerous' && step.riskAssessment.warningMessage && (
          <div className="flex items-start gap-1.5 text-[11px] text-yellow-400 bg-yellow-900/20 border border-yellow-700/30 rounded px-2 py-1.5">
            ⚠️ {step.riskAssessment.warningMessage}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main TeacherPlanView ───────────────────────────────────────────────────

interface TeacherPlanViewProps {
  plan: ExecutionPlan;
}

export const TeacherPlanView: React.FC<TeacherPlanViewProps> = ({ plan }) => {
  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-vscode-accent flex-shrink-0" />
        <div>
          <h3 className="text-xs font-semibold text-vscode-text">{plan.goal}</h3>
          <p className="text-[10px] text-vscode-text-secondary">
            {plan.steps.length} steps • Copy commands or run them in the terminal
          </p>
        </div>
      </div>

      {/* Success criteria */}
      {plan.successCriteria.length > 0 && (
        <div className="text-[11px] text-gray-400 bg-[#1e1e1e] border border-[#3e3e3e] rounded p-2">
          <p className="font-medium text-gray-300 mb-1">Goal:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {plan.successCriteria.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      {/* Steps */}
      <div className="flex flex-col gap-2.5">
        {plan.steps.map((step, i) => (
          <TeacherStepCard key={step.id} step={step} index={i} />
        ))}
      </div>

      {/* Rollback */}
      {plan.rollbackPlan && plan.rollbackPlan.length > 0 && (
        <div className="text-[11px] text-gray-400 bg-[#1e1e1e] border border-[#555] rounded p-2 mt-1">
          <p className="font-medium text-gray-300 mb-1">Rollback (if needed):</p>
          {plan.rollbackPlan.map((cmd, i) => (
            <div key={i} className="flex items-center gap-2 font-mono text-[10px] text-[#9cdcfe] mt-0.5">
              <span className="text-gray-600">$</span>
              <span>{cmd}</span>
              <CopyButton text={cmd} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
