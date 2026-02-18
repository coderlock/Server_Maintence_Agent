# Sprint 5 Completion Report — Plan Execution Engine

**Sprint:** 5 of Phase 1  
**Date Completed:** 2025  
**Focus:** End-to-end plan execution pipeline — risk classification, SSH command execution, approval flow, terminal mirroring, and execution UI

---

## Sprint Goals (from BUILDPLAN_PHASE1A.MD)

| Goal | Status |
|---|---|
| Risk classification engine | ✅ Complete |
| Plan parser / validator | ✅ Complete |
| Command executor (SSH bridge) | ✅ Complete |
| Step executor (single step lifecycle) | ✅ Complete |
| Plan executor (iterates steps, yields events) | ✅ Complete |
| `plan.handler.ts` full IPC implementation | ✅ Complete |
| Approval modal (dangerous command gate) | ✅ Complete |
| Terminal output mirroring | ✅ Complete |
| `usePlanExecution` renderer hook | ✅ Complete |
| FixerPlanView UI (auto-execution mode) | ✅ Complete |
| TeacherPlanView UI (guided display mode) | ✅ Complete |
| PlanView container (mode switch + approval) | ✅ Complete |
| ChatPanel integration | ✅ Complete |
| IPC channel additions | ✅ Complete |
| Shared type updates | ✅ Complete |

---

## Architecture Decisions

### Composable Executor Layers
The execution pipeline is split into four composable layers, each with a single responsibility:

```
CommandExecutor   →  lowest level: one SSH command, structured result, timeout handling
StepExecutor      →  one plan step: risk gate → approval → execute → evaluate → emit events
PlanExecutor      →  all steps: iterator loop, pause/resume/cancel controls, session persistence
plan.handler.ts   →  IPC bridge: async generator loop → renderer events, approval bridging
```

This layering means the AgentLoop (Sprint 6) can call `StepExecutor` directly with retry
logic without touching `PlanExecutor` or the IPC layer.

### In-Memory Plan Store
Plans are stored in a `Map<string, ExecutionPlan>` inside `plan.handler.ts` (main process).
This is sufficient for MVP because:
- Plans are generated per session and referenced by `planId`
- The renderer never needs to re-fetch a plan — it receives it via `PLAN.GENERATED` event
- Persistence of execution history goes through `SessionStore` (electron-store) as before

### Terminal Output Mirroring
On `step-completed` and `step-failed` events, `plan.handler.ts` sends the command's stdout/stderr
to the terminal panel via `ssh:data` IPC — the same channel the PTY uses. This means all plan
execution output appears in the terminal in real time, with stderr highlighted in yellow using
ANSI escape codes, requiring zero changes to `TerminalPanel`.

### Approval Modal Pattern (Step Failure / Dangerous Commands)
Two cases trigger the `ApprovalModal`:

1. **Dangerous/blocked command** — `StepExecutor` calls `approvalHandler.requestApproval()` which
   pauses the async generator via a `Promise` that only resolves when the renderer sends
   `PLAN.APPROVAL_RESPONSE`.

2. **Step failure** — The plan executor emits `plan-cancelled`. The `usePlanExecution` hook
   sets `error` state, which ChatPanel/FixerPlanView surfaces as an inline error banner rather
   than a blocking modal (cleaner UX for non-approval failures).

The three approval choices are: **Approve** (run the command), **Skip** (continue without this
step), **Cancel Plan** (abort entire execution).

### SSHExecutor Bridge
`SSHManager.executeCommand()` returns `{ stdout, stderr, code }` (from ssh2 `exec` callback).
`CommandExecutor` requires `{ stdout, stderr, exitCode }`. The bridge is `makeSSHExecutor()` in
`plan.handler.ts` — a single adapter closure that maps `.code → .exitCode`. This is the only
place the field name mismatch is handled; all upstream code sees the clean interface.

### Shared Hook Instance (No Duplicate State)
`usePlanExecution()` is called once in `ChatPanel`. The resulting `execution` object is passed
as a prop to `PlanView`, which passes sub-fields to `FixerPlanView`/`TeacherPlanView`. This
means there is exactly **one** IPC subscription and **one** React reducer for all plan state —
no synchronization needed.

### Agent-Ready State Fields
`usePlanExecution` state includes `isReplanning`, `retryInfo`, and `agentMessage` fields that
are no-ops in Sprint 5. Sprint 6's AgentLoop emits `plan-revised`, `retry-attempt`, and
`agent-thinking` `PlanEvent` types — the hook handles them already; UI components only need to
wire up the display.

---

## New Files

| File | Purpose |
|---|---|
| `src/main/services/security/riskPatterns.ts` | Pattern arrays for blocked / dangerous / caution / safe commands |
| `src/main/services/security/RiskClassifier.ts` | Classifies commands by risk level; handles compound commands, obfuscation |
| `src/main/services/execution/PlanParser.ts` | Validates and normalises AI-generated `ExecutionPlan` objects |
| `src/main/services/execution/CommandExecutor.ts` | Lowest-level SSH executor — timeout, structured `CommandResult` |
| `src/main/services/execution/StepExecutor.ts` | Single step lifecycle: risk gate → approval → execute → evaluate |
| `src/main/services/execution/PlanExecutor.ts` | Iterates steps, exposes pause/resume/cancel, persists to `SessionStore` |
| `src/renderer/hooks/usePlanExecution.ts` | Renderer hook — event-driven reducer, all PlanEvent types |
| `src/renderer/components/plan/FixerPlanView.tsx` | Auto-execution UI — progress, controls, step output |
| `src/renderer/components/plan/TeacherPlanView.tsx` | Guided display UI — command cards with copy / run buttons |
| `src/renderer/components/plan/PlanView.tsx` | Container — mode switch (Fixer/Teacher), renders modal |
| `src/renderer/components/plan/index.ts` | Barrel exports |
| `src/renderer/components/modals/ApprovalModal.tsx` | Dangerous command approval overlay — 3 choices |

---

## Modified Files

| File | Change |
|---|---|
| `src/shared/types/ai.ts` | Added `'blocked'` to `RiskAssessment.level`; added `warningMessage?`; added `estimatedTime?` to `ExecutionPlan` |
| `src/shared/types/execution.ts` | Added `commandResult?: CommandResult` to `StepResult` (flat fields kept for backward compat) |
| `src/shared/constants/ipcChannels.ts` | Added `EXECUTE`, `EVENT`, `APPROVAL_RESPONSE` to `PLAN` group |
| `src/main/ipc/plan.handler.ts` | Full replacement — was a stub; now full async generator execution loop |
| `src/main/ipc/ssh.handler.ts` | Calls `setPlanConnectionContext()` after OS detection so executor has connection |
| `src/main/ipc/index.ts` | Passes `mainWindow` to `registerPlanHandlers()` for renderer event emission |
| `src/main/services/ai/AIOrchestrator.ts` | Calls `storePlan(plan)` before emitting `PLAN.GENERATED` to renderer |
| `src/preload/index.ts` | Full plan API — `execute`, `approve`, `reject`, `skip`, `pause`, `resume`, `cancel`, `onEvent`, `onGenerated`, `onApprovalNeeded`, `onComplete`, `onStepUpdate` |
| `src/renderer/components/chat/ChatPanel.tsx` | Calls `usePlanExecution()`, passes `execution` prop to `PlanView`; renders `PlanView` above messages when plan exists |

---

## IPC Channels Added

| Channel | Direction | Purpose |
|---|---|---|
| `plan:execute` | renderer → main | Start executing a stored plan by ID |
| `plan:event` | main → renderer | Stream `PlanEvent` union objects to the renderer |
| `plan:approval-response` | renderer → main | User's approval decision (`approve` / `reject` / `skip`) |

---

## New Types

### `PlanEvent` union (execution.ts)
```ts
type PlanEvent =
  | { type: 'step-started';     stepId: string; stepIndex: number }
  | { type: 'step-output';      stepId: string; chunk: string }
  | { type: 'step-completed';   stepId: string; result: StepResult }
  | { type: 'step-failed';      stepId: string; result: StepResult }
  | { type: 'step-skipped';     stepId: string }
  | { type: 'approval-needed';  stepId: string; command: string; riskLevel: string; warningMessage?: string }
  | { type: 'plan-completed';   stepCount: number }
  | { type: 'plan-cancelled';   reason: string; completedSteps: number }
  // Sprint 6 agent events (handled by hook; UI wires up display):
  | { type: 'plan-revised';     ... }
  | { type: 'retry-attempt';    ... }
  | { type: 'agent-thinking';   ... }
  | { type: 'agent-stuck';      ... }
  | { type: 'budget-warning';   ... }
```

### `CommandResult` (execution.ts)
```ts
interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
}
```

---

## Risk Classification

The `RiskClassifier` classifies every command before execution:

| Level | Behaviour |
|---|---|
| `safe` | Runs immediately, no dialog |
| `caution` | Runs immediately with inline warning label in UI |
| `dangerous` | Blocks execution, triggers `ApprovalModal` |
| `blocked` | Rejected at parse time — plan is invalid and not stored |

Compound commands (`cmd1 && cmd2 || cmd3; cmd4 | cmd5`) are split and each part classified
independently — the most severe result applies.

Obfuscated commands (base64-decode-then-execute, `eval`, hex data piped to shell) are
automatically upgraded to `dangerous`.

User-provided whitelist/blacklist overrides are supported at the `RiskClassifier` level.

---

## User Design Decisions (made during sprint)

| Decision | Choice | Rationale |
|---|---|---|
| `StepResult` shape | Add `commandResult` field, keep flat fields | Backward compatibility with existing SessionStore data |
| Plan storage | In-memory `Map` in `plan.handler.ts` | MVP simplicity; plans live for one session |
| Step output routing | Mirror to terminal panel via `ssh:data` | No new UI required; output appears in existing terminal |
| Step failure handling | Stop plan, render error banner + restart option | Less disruptive than a blocking modal for every failure |

---

## Known Limitations / Sprint 6 Handoff

- **No retry logic** — if a step fails, the plan stops. Sprint 6 AgentLoop will add retry with
  AI-guided command correction.
- **No plan revision** — the plan is fixed at generation time. Sprint 6 will allow the AI to
  revise the plan mid-execution based on unexpected output.
- **Risk patterns are static** — the pattern arrays in `riskPatterns.ts` are hardcoded. A future
  sprint can load user-defined patterns from `SettingsStore`.
- **`context` param in `StepExecutor.executeStep`** — currently unused (`_context`). Sprint 6
  passes it to the AI step-evaluation call.
- **Teacher mode run-in-terminal** — `TeacherPlanView` calls `window.electronAPI.ssh.write()`
  directly. This requires an active SSH connection; no guard is shown if disconnected.
- **Approval modal is absolute-positioned** — it overlays the plan panel only. If the plan panel
  is scrolled out of view, the modal may be partially obscured on very small windows.

---

## Testing Notes

The TypeScript compiler (`tsc --noEmit`) passes with zero errors across all 15 new/modified files.
Integration tests for the execution pipeline are in `tests/integration/` (skeleton created in
Sprint 1) — full test coverage is deferred to a dedicated QA sprint after Phase 1 completion.
