# Sprint 6 Completion — The Agentic Loop

**Sprint Goal:** Implement a fully autonomous, self-correcting execution mode where the AI agent monitors each step result, diagnoses failures, and mutates the live plan in real time — without requiring human intervention for transient errors.

**Status:** ✅ Complete — `tsc --noEmit` exits 0, zero type errors.

---

## Overview

Sprint 6 introduced the **Agentic Loop**: a while-based execution engine that replaces the simple for-loop of Sprint 5. When a step fails in `agentic` mode, the system pauses execution, calls the LLM via `AgentBrain`, and applies one of five corrective actions to the live plan before continuing. The existing `planner` and `teacher` modes are unaffected.

---

## Design Decisions Made This Sprint

| Decision | Choice | Rationale |
|---|---|---|
| Rename `'fixer'` mode | Full code rename → `'planner'` | Consistent domain language; `'fixer'` was confusing given the new `agentic` mode which actually fixes things |
| Context summarization | LLM-based (as spec'd in BUILDPLAN_PHASE1B) | Produces higher-quality summaries than truncation; cheap one-sentence outputs; graceful degradation if LLM call fails |
| System prompt delivery | New `callRaw(systemPrompt, messages)` on AIOrchestrator | Keeps AgentBrain/AgentContext decoupled from AIContext context-building machinery |

---

## New Files

### `src/main/services/agent/AgentContext.ts`
Rolling memory buffer for the agentic loop. Tracks step history and their results so `AgentBrain` has structured context when diagnosing failures.

- Holds at most `STEP_LIMIT = 10` detailed entries
- When buffer reaches `SUMMARIZE_TRIGGER = 5`, condenses oldest `SUMMARIZE_BATCH = 3` entries into one sentence via LLM
- Graceful degradation: if summarization fails, oldest entries are dropped silently
- Key methods: `addStep()`, `summarizeIfNeeded()`, `toContextString()`, `consecutiveFailures` getter

### `src/main/services/agent/AgentBrain.ts`
Consulted by `PlanExecutor` when a step fails in agentic mode. Calls the LLM with failure context and returns a validated `AgentCorrection`.

- One public method: `analyzeFailure(step, result, agentCtx)`  
- Returns five possible actions: `retry`, `modify`, `insert_steps`, `skip`, `abort`
- **Never throws** — any error produces `action: 'abort'` so the executor always has a clean result
- Hard cap: max 3 `newSteps` per correction (prevents runaway step injection)
- Exported singleton: `agentBrain`

### `src/main/services/agent/PlanMutator.ts`
Pure, immutable plan mutation utilities. Takes an `ExecutionPlan` and returns a new mutated copy.

- `insertSteps(plan, afterStepId, protoSteps)` — inserts new steps after a given step
- `insertStepsBefore(plan, beforeStepId, protoSteps)` — inserts new steps before a given step (used by executor to inject repair steps before retrying the failed one)
- `replaceStepCommand(plan, stepId, newCommand)` — replaces a step's command and re-classifies its risk level via `RiskClassifier`
- Budget tracking: uses `_originalLength` private field on plan to enforce `MAX_ADDED_STEPS = 10`
- `promoteProtoStep()` converts an AI-generated `ProtoStep` to a full `PlanStep` with id, index, and status

### `src/renderer/components/plan/ModeSelector.tsx`
Segmented control displayed in the PlanView header for switching between execution modes.

- Three segments: Teacher | Planner | Agentic
- Active `agentic` segment uses purple accent (`bg-purple-600`) to signal the power mode
- Disabled while a plan is executing
- Reads/writes `mode` from `useChatStore`

---

## Modified Files

### `src/shared/types/ai.ts`
- Added `export type ExecutionMode = 'teacher' | 'planner' | 'agentic'`
- `AIRequestContext.mode` changed from `'fixer' | 'teacher'` → `ExecutionMode`
- `ExecutionPlan.mode?` changed from `'fixer' | 'teacher'` → `ExecutionMode`

### `src/shared/types/execution.ts`
- Added `ProtoStep` interface (AI-generated step without id/index/status)
- Added `AgentCorrectionAction` type and `AgentCorrection` interface
- Added `attemptIndex?: number` to `StepResult`
- Updated `PlanEvent` union:
  - `plan-revised` now carries `{ type: 'plan-revised'; plan: ExecutionPlan; reason: string }` — **breaking change** (was `{ reason, newStepCount }`)
  - `agent-thinking` event added
  - `agent-stuck` event added
  - `retry-attempt` event added
  - `step-skipped` event added
  - `budget-warning` event added
  - `approval-needed` now carries `warningMessage?: string`

### `src/shared/types/settings.ts`
- `defaultMode` type changed from `'fixer' | 'teacher'` → `'planner' | 'teacher' | 'agentic'`
- Default value changed from `'fixer'` → `'planner'`

### `src/main/services/execution/PlanExecutor.ts` *(full rewrite)*
The core of Sprint 6. Replaced the `for` loop with a `while (i < plan.steps.length)` loop using a mutable `let plan` reference so mutations from `PlanMutator` are picked up dynamically.

**Agentic loop flow on step failure:**
1. Check per-step retry budget (`MAX_RETRIES_PER_STEP = 3`) → emit `agent-stuck` + `plan-cancelled` if exceeded
2. Check total correction budget (`MAX_TOTAL_CORRECTIONS = 10`) → same
3. Emit `agent-thinking`
4. Emit `budget-warning` if remaining corrections ≤ 30%
5. Call `agentBrain.analyzeFailure(step, result, agentCtx)`
6. Apply correction:
   - `retry` — optionally replace command, increment retry count, re-execute same step index
   - `modify` — replace command, emit `plan-revised`, re-execute same index
   - `insert_steps` — insert repair steps before failed step, emit `plan-revised`, re-execute (now the first injected step)
   - `skip` — emit `step-skipped`, advance index
   - `abort` — emit `plan-cancelled`, return

### `src/main/services/ai/AIOrchestrator.ts`
- Added `setProvider(name: string)` — switches active provider between `openaiProvider` and `moonshotProvider` at runtime
- Added `callRaw(systemPrompt, messages)` — direct LLM call with a custom system prompt, bypassing `AIContext` context building; used by `AgentBrain` and `AgentContext`
- Added `openaiProvider` static import (was dynamic-only before)
- `extractPlan()` now stamps `mode` on generated plans; defaults to `'planner'`

### `src/main/services/ai/ContextBuilder.ts`
- `buildChatContext()` `mode` parameter type changed from `'fixer' | 'teacher'` → `ExecutionMode`
- Added `ExecutionMode` to the type imports

### `src/main/services/ai/AIContext.ts`
- `addMode(mode: ExecutionMode)` updated to handle three cases: `'planner'`, `'agentic'`, `'teacher'`

### `src/main/ipc/plan.handler.ts`
- `plan:execute` handler now accepts `(planId: string, mode?: ExecutionMode)` as two arguments
- Execution mode passed at invocation time overrides the mode stored on the plan
- Fallback default changed from `'fixer'` → `'planner'`

### `src/preload/index.ts`
- `plan.execute` bridge updated: `(planId: string, mode: ExecutionMode) => ipcRenderer.invoke(..., planId, mode)`
- Added `ExecutionMode` to type imports

### `src/renderer/hooks/usePlanExecution.ts`
- `startExecution(planId, mode)` accepts and passes `ExecutionMode` to the IPC call
- `plan-revised` event reducer now updates `state.plan` with the full revised plan (was a no-op)

### `src/renderer/store/chatStore.ts`
- `mode` state typed as `ExecutionMode`
- `setMode` typed as `(mode: ExecutionMode) => void`
- Default `mode` changed from `'fixer'` → `'planner'`

### `src/renderer/components/plan/PlanView.tsx`
- Imports and renders `ModeSelector` in the header bar (disabled when executing)
- Passes `isReplanning` to `FixerPlanView`
- Passes `mode` to `execution.startExecution(plan.id, mode)`

### `src/renderer/components/plan/FixerPlanView.tsx`
- Added `isReplanning` and `isBeingAnalyzed` props
- Steps being analysed by agent show a `Zap` icon
- Steps in recovery show purple border accent (`border-purple-500/60 bg-purple-900/10`)
- Mode label resolves `plan.mode ?? 'planner'`

### `src/renderer/components/plan/index.ts`
- Added `export { ModeSelector } from './ModeSelector'`

### `src/renderer/components/chat/ChatPanel.tsx`
- Mode toggle updated: **Planner** (was Fixer), **Agentic** (new), **Teacher**
- `setMode('planner')` replaces `setMode('fixer')`

### `src/renderer/components/layout/MenuBar.tsx`
- Mode display handles all three modes; `setMode('planner')` replaces `setMode('fixer')`

### `src/renderer/components/layout/StatusBar.tsx`
- Mode label: `'planner'` → **Planner**, `'agentic'` → **Agentic**, `'teacher'` → **Teacher**

### `src/renderer/components/modals/SettingsModal.tsx`
- Modes array updated to `['planner', 'teacher', 'agentic']` (was `['fixer', 'teacher']`)

---

## Architecture Diagram

```
PlanExecutor (while loop)
  │
  ├─ step succeeds → advance i, record in AgentContext
  │
  └─ step fails (agentic mode)
       │
       ├─ check retryCount ≥ MAX_RETRIES_PER_STEP (3) → agent-stuck + cancel
       ├─ check totalCorrections ≥ MAX_TOTAL_CORRECTIONS (10) → cancel
       ├─ emit agent-thinking
       ├─ AgentBrain.analyzeFailure(step, result, agentCtx)
       │    └─ callRaw(AGENT_BRAIN_SYSTEM_PROMPT, messages)
       │         └─ LLM returns JSON AgentCorrection
       │
       └─ apply correction
            retry       → same i, increment retryCount
            modify      → replaceStepCommand, same i, increment retryCount
            insert_steps→ insertStepsBefore, plan-revised, same i (now = repair step)
            skip        → step-skipped, i++
            abort       → plan-cancelled, return
```

---

## Circuit Breakers

| Guard | Value | Behaviour |
|---|---|---|
| `MAX_RETRIES_PER_STEP` | 3 | After 3 failed attempts on one step → `agent-stuck` + `plan-cancelled` |
| `MAX_TOTAL_CORRECTIONS` | 10 | After 10 total agent interventions → `plan-cancelled` |
| `MAX_ADDED_STEPS` | 10 | `insertStepsBefore` / `insertSteps` silently no-ops if budget exhausted |
| AgentBrain newSteps cap | 3 | Parser discards any `newSteps` beyond index 2 |

---

## IPC Changes

| Channel | Old signature | New signature |
|---|---|---|
| `plan:execute` | `(planId: string)` | `(planId: string, mode: ExecutionMode)` |

New `plan:events` event types emitted this sprint:
- `agent-thinking` — agent is consulting the LLM
- `agent-stuck` — step retry budget exhausted
- `retry-attempt` — step is being retried (with optional new command)
- `step-skipped` — agent decided to skip the failed step
- `budget-warning` — fewer than 30% of total corrections remaining
- `plan-revised` — plan mutated; now carries full `ExecutionPlan` (breaking change)

---

## Mode Rename Reference

| Old value | New value | Location |
|---|---|---|
| `'fixer'` | `'planner'` | All types, stores, components, IPC handlers |
| `ExecutionMode = 'fixer' \| 'teacher'` | `ExecutionMode = 'teacher' \| 'planner' \| 'agentic'` | `src/shared/types/ai.ts` |
| `defaultMode: 'fixer'` | `defaultMode: 'planner'` | `src/shared/types/settings.ts`, `chatStore.ts` |

---

## Known Limitations / Future Work

- **No UI for `agent-thinking` / `retry-attempt` stream events** — these are emitted over IPC but `FixerPlanView` does not yet render a live "Agent is thinking…" animation. A future sprint should add inline status text to the step row while the agent is active.
- **AgentContext summarization latency** — the LLM call in `summarizeIfNeeded()` is `await`-ed inside the executor, adding latency every 5 steps. A future optimization could fire this as a non-blocking background task.
- **No approval gate for `insert_steps` in agentic mode** — injected steps are not sent through the `RiskClassifier` human-approval gate even if they carry `dangerous` risk level. Sprint 7 risk policy should address this.
- **Provider switching requires re-initialization** — `setProvider()` swaps the provider object but does not re-initialize the API key. Callers (settings handler) must also call `initialize()` if the new provider hasn't been initialized yet.

---

## Files Added This Sprint

```
src/main/services/agent/
  AgentContext.ts
  AgentBrain.ts
  PlanMutator.ts
src/renderer/components/plan/
  ModeSelector.tsx
docs/
  SPRINT6_COMPLETION.MD  ← this file
```

---

*Sprint 6 completed. Build passes `tsc --noEmit` with zero errors.*
