/**
 * ModeSelector — segmented control for Manual / Agent modes.
 *
 * - Manual: user clicks Run on each individual step; full execution pipeline
 * - Agent:  single Run at the top; autonomous execution with AI error recovery
 *
 * Reads and writes from chatStore (single source of truth).
 */

import React from 'react';
import { Hand, Zap } from 'lucide-react';
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
    id: 'manual',
    label: 'Manual',
    tooltip: 'Manual — click Run on each step individually; full execution pipeline per step',
    Icon: Hand,
  },
  {
    id: 'agent',
    label: 'Agent',
    tooltip: 'Agent — run the whole plan autonomously; self-corrects on failure using AI',
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
                ? id === 'agent'
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
