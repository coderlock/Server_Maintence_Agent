/**
 * usePlanExecution — React hook for plan execution state.
 *
 * Subscribes to the PlanEvent IPC stream and derives plan state from events.
 * State is data-driven (not flow-driven) which means:
 *  - All current PlanEvent types are handled
 *  - Future agent events (plan-revised, retry-attempt, etc.) are handled gracefully
 *    even before the AgentLoop is built — they update state without breaking anything
 */

import { useCallback, useEffect, useReducer } from 'react';
import type { ExecutionPlan } from '@shared/types';
import type { PlanEvent, StepResult } from '@shared/types/execution';
import type { StepStallState } from '../components/plan/StallIndicator';
import { useChatStore } from '../store/chatStore';

// ── State ──────────────────────────────────────────────────────────────────

interface PlanExecutionState {
  plan: ExecutionPlan | null;
  isExecuting: boolean;
  isPaused: boolean;
  currentStepIndex: number;
  stepResults: Map<string, StepResult>;
  /**
   * Live output streaming for the currently executing step.
   * Accumulated from step-output events while the step is running.
   * Cleared when the step result arrives (step results have the final output).
   */
  liveStepOutput: Map<string, { stdout: string; stderr: string }>;
  /**
   * Sprint 8: Stall / prompt state per executing step.
   * Key: stepId. Populated by idle-timer and prompt-detected events.
   * Cleared when the step completes, fails, or input is submitted.
   */
  stepStallStates: Record<string, StepStallState>;
  pendingApproval: {
    stepId: string;
    command: string;
    riskLevel: string;
    warningMessage?: string;
  } | null;
  error: string | null;
  // Agent-ready fields — no-ops now, used when AgentLoop ships
  isReplanning: boolean;
  retryInfo: { stepId: string; attempt: number; maxAttempts: number } | null;
  agentMessage: string | null;
}

const initialState: PlanExecutionState = {
  plan: null,
  isExecuting: false,
  isPaused: false,
  currentStepIndex: 0,
  stepResults: new Map(),
  liveStepOutput: new Map(),
  stepStallStates: {},
  pendingApproval: null,
  error: null,
  isReplanning: false,
  retryInfo: null,
  agentMessage: null,
};

// ── Actions ────────────────────────────────────────────────────────────────

type PlanAction =
  | { type: 'SET_PLAN'; plan: ExecutionPlan }
  | { type: 'PLAN_EVENT'; event: PlanEvent }
  | { type: 'SET_EXECUTING'; isExecuting: boolean }
  | { type: 'SET_PAUSED'; isPaused: boolean }
  | { type: 'CLEAR_APPROVAL' }
  | { type: 'CLEAR' };

// ── Reducer ────────────────────────────────────────────────────────────────

function planReducer(state: PlanExecutionState, action: PlanAction): PlanExecutionState {
  switch (action.type) {
    case 'SET_PLAN':
      return {
        ...initialState,
        plan: action.plan,
      };

    case 'SET_EXECUTING':
      return { ...state, isExecuting: action.isExecuting };

    case 'SET_PAUSED':
      return { ...state, isPaused: action.isPaused };

    case 'CLEAR_APPROVAL':
      return { ...state, pendingApproval: null };

    case 'CLEAR':
      return initialState;

    case 'PLAN_EVENT': {
      const ev = action.event;

      switch (ev.type) {
        case 'step-started': {
          // Mark the step as running in the plan so step boxes update immediately
          if (state.plan) {
            const updatedSteps = state.plan.steps.map(s =>
              s.id === ev.stepId ? { ...s, status: 'running' as const } : s
            );
            return {
              ...state,
              currentStepIndex: ev.stepIndex,
              error: null,
              plan: { ...state.plan, steps: updatedSteps },
            };
          }
          return { ...state, currentStepIndex: ev.stepIndex, error: null };
        }

        case 'step-output': {
          // Accumulate live output while the step is still running.
          // The stream field is always 'stdout' in real-terminal mode (stderr is merged),
          // and usually both in batch mode.
          const prev = state.liveStepOutput.get(ev.stepId) ?? { stdout: '', stderr: '' };
          const updated = new Map(state.liveStepOutput);
          updated.set(ev.stepId, {
            ...prev,
            [ev.stream]: prev[ev.stream as 'stdout' | 'stderr'] + ev.chunk,
          });
          return { ...state, liveStepOutput: updated };
        }

        case 'step-completed': {
          const newResults = new Map(state.stepResults);
          newResults.set(ev.stepId, ev.result);
          // Clear live output — the final result is now in stepResults
          const newLive = new Map(state.liveStepOutput);
          newLive.delete(ev.stepId);
          // Clear stall state for this step
          const { [ev.stepId]: _sc, ...restStall1 } = state.stepStallStates;
          // Mark the step as completed in the plan so the step box colors immediately
          const planAfterComplete = state.plan ? {
            ...state.plan,
            steps: state.plan.steps.map(s =>
              s.id === ev.stepId ? { ...s, status: 'completed' as const } : s
            ),
          } : state.plan;
          return {
            ...state,
            plan: planAfterComplete,
            stepResults: newResults,
            liveStepOutput: newLive,
            stepStallStates: restStall1,
            currentStepIndex: ev.result.stepIndex + 1,
          };
        }

        case 'step-failed': {
          const newResults = new Map(state.stepResults);
          newResults.set(ev.stepId, ev.result);
          const newLive = new Map(state.liveStepOutput);
          newLive.delete(ev.stepId);
          // Clear stall state for this step
          const { [ev.stepId]: _sf, ...restStall2 } = state.stepStallStates;
          // Mark the step as failed in the plan so the step box colors immediately
          const planAfterFail = state.plan ? {
            ...state.plan,
            steps: state.plan.steps.map(s =>
              s.id === ev.stepId ? { ...s, status: 'failed' as const } : s
            ),
          } : state.plan;
          return {
            ...state,
            plan: planAfterFail,
            stepResults: newResults,
            liveStepOutput: newLive,
            stepStallStates: restStall2,
            error: ev.result.assessment?.reason ?? 'Step failed',
          };
        }

        case 'step-skipped':
          return { ...state, currentStepIndex: state.currentStepIndex + 1 };

        case 'approval-needed':
          return {
            ...state,
            isPaused: true,
            pendingApproval: {
              stepId: ev.stepId,
              command: ev.command,
              riskLevel: ev.riskLevel,
              warningMessage: undefined,
            },
          };

        case 'approval-received':
          return { ...state, isPaused: false, pendingApproval: null };

        case 'plan-completed':
          return { ...state, isExecuting: false, error: null };

        case 'plan-cancelled':
          return { ...state, isExecuting: false, error: ev.reason };

        // ── Sprint 8: idle timer / stall events ────────────────────────

        case 'prompt-detected': {
          // Always upgrades to prompt-detected state (overrides idle-warning)
          return {
            ...state,
            stepStallStates: {
              ...state.stepStallStates,
              [ev.stepId]: {
                status: 'prompt-detected',
                promptText: ev.promptText,
              },
            },
          };
        }

        case 'idle-warning': {
          // Only set if not already showing a higher-priority state
          const existing = state.stepStallStates[ev.stepId];
          if (
            existing?.status === 'prompt-detected' ||
            existing?.status === 'idle-stalled' ||
            existing?.status === 'agent-analyzing'
          ) {
            return state;
          }
          return {
            ...state,
            stepStallStates: {
              ...state.stepStallStates,
              [ev.stepId]: {
                status: 'idle-warning',
                silenceSeconds: ev.silenceSeconds,
              },
            },
          };
        }

        case 'stall-detected': {
          return {
            ...state,
            stepStallStates: {
              ...state.stepStallStates,
              [ev.stepId]: {
                status: ev.agentAction === null ? 'agent-analyzing' : 'idle-stalled',
                silenceSeconds: ev.silenceSeconds,
                agentMessage: ev.agentReasoning,
              },
            },
          };
        }

        case 'stall-input-submitted': {
          // Input sent — clear the stall state; command should resume
          const { [ev.stepId]: _, ...restStall } = state.stepStallStates;
          return { ...state, stepStallStates: restStall };
        }

        // ── Future agent events ──────────────────────────────────────────
        case 'plan-revised':
          return {
            ...state,
            plan: ev.plan,
            isReplanning: false,
            agentMessage: `Plan revised: ${ev.reason}`,
          };

        case 'retry-attempt':
          return {
            ...state,
            retryInfo: { stepId: ev.stepId, attempt: ev.attempt, maxAttempts: ev.maxAttempts },
          };

        case 'agent-thinking':
          return { ...state, agentMessage: ev.message, isReplanning: true };

        case 'agent-stuck':
          return {
            ...state,
            isExecuting: false,
            error: `Agent stuck: ${ev.reason} (${ev.failedAttempts} failed attempts)`,
          };

        case 'budget-warning':
          return {
            ...state,
            agentMessage: `Budget warning: ${ev.iterationsRemaining} iterations remaining`,
          };

        default:
          return state;
      }
    }

    default:
      return state;
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function usePlanExecution() {
  const [state, dispatch] = useReducer(planReducer, initialState);

  // Subscribe to events from main process
  useEffect(() => {
    const unsubEvent = window.electronAPI.plan.onEvent((event: PlanEvent) => {
      // `plan-summary` is not a plan-state event — post it directly to the
      // chat panel as an assistant message and don't touch reducer state.
      if (event.type === 'plan-summary') {
        useChatStore.getState().addMessage({
          id: `plan-summary-${Date.now()}`,
          role: 'assistant',
          content: event.content,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Agent status events — post to chat so the user sees updates inline
      // without needing to look at the plan panel.
      if (event.type === 'agent-thinking') {
        useChatStore.getState().addMessage({
          id: `agent-thinking-${Date.now()}`,
          role: 'system',
          content: `🔍 ${event.message}`,
          timestamp: new Date().toISOString(),
        });
      } else if (event.type === 'plan-revised') {
        useChatStore.getState().addMessage({
          id: `plan-revised-${Date.now()}`,
          role: 'system',
          content: `🔄 ${event.reason}`,
          timestamp: new Date().toISOString(),
        });
      } else if (event.type === 'agent-stuck') {
        useChatStore.getState().addMessage({
          id: `agent-stuck-${Date.now()}`,
          role: 'system',
          content: `⚠️ Agent stuck after ${event.failedAttempts} attempt(s): ${event.reason}`,
          timestamp: new Date().toISOString(),
        });
      } else if (event.type === 'budget-warning') {
        useChatStore.getState().addMessage({
          id: `budget-warning-${Date.now()}`,
          role: 'system',
          content: `⚠️ Correction budget running low — ${event.iterationsRemaining} iteration(s) remaining.`,
          timestamp: new Date().toISOString(),
        });
      }

      dispatch({ type: 'PLAN_EVENT', event });
    });

    const unsubGenerated = window.electronAPI.plan.onGenerated((plan: ExecutionPlan) => {
      dispatch({ type: 'SET_PLAN', plan });
    });

    const unsubApproval = window.electronAPI.plan.onApprovalNeeded((payload) => {
      dispatch({
        type: 'PLAN_EVENT',
        event: {
          type: 'approval-needed',
          stepId: payload.stepId,
          command: payload.command,
          riskLevel: payload.riskLevel,
        },
      });
    });

    return () => {
      unsubEvent();
      unsubGenerated();
      unsubApproval();
    };
  }, []);

  const startExecution = useCallback(async (planId: string, mode: import('@shared/types').ExecutionMode = 'manual', stepIndex?: number) => {
    dispatch({ type: 'SET_EXECUTING', isExecuting: true });
    dispatch({ type: 'SET_PAUSED', isPaused: false });
    try {
      await window.electronAPI.plan.execute(planId, mode, stepIndex);
    } catch (err) {
      dispatch({
        type: 'PLAN_EVENT',
        event: {
          type: 'plan-cancelled',
          reason: err instanceof Error ? err.message : 'Failed to start plan',
          completedSteps: 0,
        },
      });
    }
  }, []);

  const pause = useCallback(() => {
    dispatch({ type: 'SET_PAUSED', isPaused: true });
    window.electronAPI.plan.pause();
  }, []);

  const resume = useCallback(() => {
    dispatch({ type: 'SET_PAUSED', isPaused: false });
    window.electronAPI.plan.resume();
  }, []);

  const cancel = useCallback(() => {
    window.electronAPI.plan.cancel();
    dispatch({ type: 'SET_EXECUTING', isExecuting: false });
    dispatch({ type: 'CLEAR_APPROVAL' });
  }, []);

  const approve = useCallback((stepId: string) => {
    dispatch({ type: 'CLEAR_APPROVAL' });
    window.electronAPI.plan.approve(stepId);
  }, []);

  const reject = useCallback((stepId: string) => {
    dispatch({ type: 'CLEAR_APPROVAL' });
    window.electronAPI.plan.reject(stepId);
  }, []);

  const skip = useCallback((stepId: string) => {
    dispatch({ type: 'CLEAR_APPROVAL' });
    window.electronAPI.plan.skip(stepId);
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  return {
    ...state,
    startExecution,
    pause,
    resume,
    cancel,
    approve,
    reject,
    skip,
    clear,
  };
}
