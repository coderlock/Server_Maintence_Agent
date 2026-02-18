/**
 * ModeSelector — segmented control for Teacher / Planner / Agentic modes.
 *
 * Placed in the PlanView header so users can switch execution mode any time
 * before clicking Run. Reads and writes from chatStore (single source of truth).
 */

import React from 'react';
import { GraduationCap, Wrench, Zap } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import type { ExecutionMode } from '@shared/types';

interface ModeOption {
  id: ExecutionMode;
  label: string;
  tooltip: string;
  Icon: React.FC<{ className?: string }>;
}

const MODES: ModeOption[] = [
  {
    id: 'teacher',
    label: 'Teacher',
    tooltip: 'Teacher — show commands with explanations, no auto-execution',
    Icon: GraduationCap,
  },
  {
    id: 'planner',
    label: 'Planner',
    tooltip: 'Planner — execute steps automatically, stop on first failure',
    Icon: Wrench,
  },
  {
    id: 'agentic',
    label: 'Agentic',
    tooltip: 'Agentic — execute and self-correct using AI on failure',
    Icon: Zap,
  },
];

interface ModeSelectorProps {
  /** If true, the selector is rendered but disabled (plan is currently running) */
  disabled?: boolean;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ disabled = false }) => {
  const { mode, setMode } = useChatStore();

  return (
    <div
      className={`flex items-center bg-[#1e1e1e] rounded p-0.5 gap-0.5 ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
      title={disabled ? 'Cannot change mode while plan is running' : undefined}
    >
      {MODES.map(({ id, label, tooltip, Icon }) => {
        const isActive = mode === id;
        return (
          <button
            key={id}
            onClick={() => setMode(id)}
            disabled={disabled}
            title={tooltip}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              isActive
                ? id === 'agentic'
                  ? 'bg-purple-600 text-white'
                  : 'bg-vscode-accent text-white'
                : 'text-vscode-text-secondary hover:text-vscode-text hover:bg-[#2d2d2d]'
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        );
      })}
    </div>
  );
};
