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

// ── State ──────────────────────────────────────────────────────────────────

interface PlanExecutionState {
  plan: ExecutionPlan | null;
  isExecuting: boolean;
  isPaused: boolean;
  currentStepIndex: number;
  stepResults: Map<string, StepResult>;
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
        case 'step-started':
          return { ...state, currentStepIndex: ev.stepIndex, error: null };

        case 'step-completed': {
          const newResults = new Map(state.stepResults);
          newResults.set(ev.stepId, ev.result);
          return {
            ...state,
            stepResults: newResults,
            currentStepIndex: ev.result.stepIndex + 1,
          };
        }

        case 'step-failed': {
          const newResults = new Map(state.stepResults);
          newResults.set(ev.stepId, ev.result);
          return {
            ...state,
            stepResults: newResults,
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

        // ── Future agent events — already wired up ──────────────
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

  const startExecution = useCallback(async (planId: string, mode: import('@shared/types').ExecutionMode = 'planner') => {
    dispatch({ type: 'SET_EXECUTING', isExecuting: true });
    dispatch({ type: 'SET_PAUSED', isPaused: false });
    try {
      await window.electronAPI.plan.execute(planId, mode);
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
