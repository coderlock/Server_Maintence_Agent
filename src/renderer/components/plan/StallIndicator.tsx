/**
 * StallIndicator — Sprint 8
 *
 * Visual indicator rendered inside a StepRow when the idle timer fires
 * or an interactive prompt is detected.
 *
 * States:
 *   idle-warning    — soft stall (default 15 s). Informational — command may be waiting.
 *   agent-analyzing — hard stall firing; AgentBrain call is in progress.
 *   idle-stalled    — hard stall resolved; shows agent reasoning + Force Stop button.
 *   prompt-detected — interactive prompt found; shows the prompt text + input form.
 */

import React, { useState, useRef, useEffect } from 'react';
import { AlertTriangle, Brain, MessageSquare, StopCircle } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * Stall state for a single executing step.
 * Stored per-stepId in usePlanExecution's reducer.
 */
export interface StepStallState {
  /**
   * 'idle-warning'    — soft stall (15 s default). Show a soft warning.
   * 'agent-analyzing' — hard stall, agent analysis in progress.
   * 'idle-stalled'    — hard stall resolved; agent reasoning shown.
   * 'prompt-detected' — interactive prompt detected; show input field.
   */
  status: 'idle-warning' | 'idle-stalled' | 'prompt-detected' | 'agent-analyzing';

  /** Detected prompt text (when status === 'prompt-detected'). */
  promptText?: string;

  /** Seconds of silence when the stall was detected. */
  silenceSeconds?: number;

  /** Agent reasoning message (when status === 'idle-stalled' or 'agent-analyzing'). */
  agentMessage?: string;
}

interface StallIndicatorProps {
  /** Current stall state for this step. null = nothing to show. */
  stallState: StepStallState | null;

  /**
   * Called when the user submits input for a prompt.
   * The input string includes a trailing newline.
   */
  onSubmitInput: (input: string) => void;

  /** Called when the user clicks "Force Stop" (sends Ctrl+C). */
  onForceStop: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export const StallIndicator: React.FC<StallIndicatorProps> = ({
  stallState,
  onSubmitInput,
  onForceStop,
}) => {
  const [userInput, setUserInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input when a prompt is detected
  useEffect(() => {
    if (stallState?.status === 'prompt-detected' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [stallState?.status]);

  if (!stallState) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = userInput; // capture before clear
    setUserInput('');
    onSubmitInput(value + '\n');
  };

  const isPasswordPrompt = stallState.promptText?.toLowerCase().includes('password') ?? false;

  // ── Soft warning ────────────────────────────────────────────────────
  if (stallState.status === 'idle-warning') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-yellow-400 bg-yellow-900/20 border border-yellow-700/30 rounded px-2 py-1.5 animate-pulse">
        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
        <span>
          No output for {stallState.silenceSeconds ?? '?'}s — command may be waiting for input
        </span>
      </div>
    );
  }

  // ── Agent analysing ────────────────────────────────────────────────
  if (stallState.status === 'agent-analyzing') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-purple-300 bg-purple-900/20 border border-purple-600/40 rounded px-2 py-1.5">
        <Brain className="h-3 w-3 flex-shrink-0 animate-pulse" />
        <span>
          Analysing stall — command silent for {stallState.silenceSeconds ?? '?'}s…
        </span>
      </div>
    );
  }

  // ── Hard stall resolved (agent reasoned, no prompt found) ──────────
  if (stallState.status === 'idle-stalled') {
    return (
      <div className="mt-2 flex items-start gap-1.5 text-[11px] text-orange-300 bg-orange-900/20 border border-orange-700/30 rounded px-2 py-1.5">
        <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <span>
            Command stalled{stallState.silenceSeconds ? ` — ${stallState.silenceSeconds}s of silence` : ''}
            {stallState.agentMessage ? `: ${stallState.agentMessage}` : ''}
          </span>
        </div>
        <button
          className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-red-900/40 text-red-300 border border-red-700/40 hover:bg-red-800/50 transition-colors"
          onClick={onForceStop}
          title="Send Ctrl+C to the stalled command"
        >
          <StopCircle className="h-2.5 w-2.5" />
          Force Stop
        </button>
      </div>
    );
  }

  // ── Prompt detected — show input field ────────────────────────────
  if (stallState.status === 'prompt-detected') {
    return (
      <div className="mt-2 rounded border border-blue-600/40 bg-blue-900/15 px-2 py-1.5 space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-blue-300">
          <MessageSquare className="h-3 w-3 flex-shrink-0" />
          <span className="font-medium">Command is waiting for input</span>
          {stallState.promptText && (
            <span className="text-blue-200/70 italic truncate max-w-[220px]">
              &ldquo;{stallState.promptText}&rdquo;
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-1.5">
          <input
            ref={inputRef}
            type={isPasswordPrompt ? 'password' : 'text'}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder={isPasswordPrompt ? 'Enter password…' : 'Type your response…'}
            className="flex-1 min-w-0 bg-[#1a1a2e] text-vscode-text text-[11px] rounded px-2 py-1 outline-none border border-blue-600/40 focus:border-blue-500 placeholder-vscode-text-secondary"
          />
          <button
            type="submit"
            className="px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white text-[11px] rounded border border-blue-600 transition-colors flex-shrink-0"
          >
            Send
          </button>
        </form>

        {/* Batch-mode limitation hint */}
        <p className="text-[10px] text-gray-500 italic">
          For best results, use Real Terminal mode (Settings → Command Output Mode).
        </p>
      </div>
    );
  }

  return null;
};
