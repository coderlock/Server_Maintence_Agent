# Sprint 8 Completion Report
## Idle Timer & Stall Detection

**Status:** ✅ Complete — `tsc --noEmit` passes with 0 errors  
**Build Plan:** `docs/BUILDPLAN_SPRINT8.MD`  
**Prerequisite:** Sprint 7 (`ExecutionStrategy` / `ExecutionEmitter` pattern)

---

## 1. Overview

Sprint 8 adds a dual-threshold idle timer to every command execution. When SSH output goes silent for a configurable period the system:

1. **Soft threshold (default 15 s)** — scans the output buffer for interactive prompt patterns. If a prompt is found, surfaces a typed input widget to the user. Otherwise emits an `idle-warning` flag on the step card.
2. **Hard threshold (default 45 s)** — repeats the prompt scan; if still no prompt, calls `AgentBrain.analyzeStall()` which returns an `AgentCorrection` (`retry | modify | skip | abort`). The agent's suggestion is shown on the step card and carried out automatically, or the user can override with **Force Stop**.

All state is surfaced in real-time through the existing `PlanEvent` IPC stream and the `stepStallStates` hook slice.

---

## 2. Key Design Decision — Out-of-Band Handler Pattern

### Problem
The original build plan placed idle/stall logic inside `StepExecutor` generator callbacks. This is architecturally problematic: an `AsyncGenerator` is suspended at `await execute()` while the command runs, so you cannot safely `yield` a new `PlanEvent` from an EventEmitter callback that fires during that suspension.

### Solution
Idle and stall events are handled **out-of-band in `plan.handler.ts`**, exactly like the existing `step-output` events:

```
CommandExecutor ──emit('idle-warning')──► plan.handler.ts listener
                                              └─► sender.send(IPC_CHANNELS.PLAN.EVENT, { type: 'idle-warning', ... })
                                              
CommandExecutor ──emit('idle-stalled')──► plan.handler.ts listener (async)
                                              └─► emit stall-detected (initial null agentAction)
                                              └─► AgentBrain.analyzeStall()
                                              └─► emit stall-detected (with agentAction)
                                              └─► act (retry / modify / skip / abort)
```

`StepExecutor` and `PlanExecutor` are **untouched**. The generator pipeline sees only `stdout`, `stderr`, and `done` — same as before Sprint 8.

---

## 3. New Files

| File | Purpose |
|------|---------|
| `src/main/services/execution/IdleTimerManager.ts` | Dual-threshold resettable idle timer — attaches to an `ExecutionEmitter`, resets on every `stdout`/`stderr` chunk, fires `idle-warning` / `idle-stalled` events |
| `src/main/services/execution/interactivePromptDetector.ts` | Pure functions: `detectInteractivePrompt()` (fast, last 500 chars) and `detectInteractivePromptDeep()` (thorough, last 2 000 chars); 28 regex patterns covering package managers, auth prompts, confirmations, pagers, sudo, generic `[y/n]` |
| `src/renderer/components/plan/StallIndicator.tsx` | React component rendering 4 stall states on a step card: `idle-warning` (yellow), `agent-analyzing` (purple pulsing), `idle-stalled` (orange + Force Stop button), `prompt-detected` (blue input form, masked if "password" appears in prompt text); exports `StepStallState` interface |

---

## 4. Modified Files

### Shared Types / Constants

| File | Change |
|------|--------|
| `src/shared/types/settings.ts` | Added `idleWarningSeconds: number` and `idleStalledSeconds: number` to `AppSettings` + `DEFAULT_SETTINGS` (defaults: 15, 45) |
| `src/shared/types/execution.ts` | Added `idleWarningSeconds`, `idleStalledSeconds` to `ExecutionConfig`; added 4 new `PlanEvent` union members: `prompt-detected`, `idle-warning`, `stall-detected`, `stall-input-submitted` |
| `src/shared/constants/ipcChannels.ts` | Added `PROMPT_INPUT: 'plan:prompt-input'` to the `PLAN` channel group |

### Main Process

| File | Change |
|------|--------|
| `src/main/services/execution/strategies/ExecutionEmitter.ts` | Added typed `emit` / `on` / `once` / `removeListener` overloads for `'idle-warning'` and `'idle-stalled'` events (payload: `IdleEvent`) |
| `src/main/services/execution/CommandExecutor.ts` | Full rewrite — adds rolling 2 MiB output accumulator, `IdleTimerManager` lifecycle, forwards idle events to own `EventEmitter`; new public API: `abortCurrentCommand()`, `resetHardStallTimer()`, `getAccumulatedOutput()` |
| `src/main/services/agent/AgentBrain.ts` | Added `analyzeStall(step, result, agentCtx): Promise<AgentCorrection>` — same prompt pipeline as `analyzeFailure()`; returns `'abort'` if AI unavailable, never throws |
| `src/main/ipc/plan.handler.ts` | Module-level `activeCommandExecutor` and `activePlanId` tracking; idle-warning / idle-stalled out-of-band listeners; real-time per-chunk prompt detection on `step-output`; new `ipcMain.on(PLAN.PROMPT_INPUT)` handler; cleanup on plan end and cancel |

### Renderer

| File | Change |
|------|--------|
| `src/preload/index.ts` | Added `submitPromptInput(stepId, input)` to the `plan` context bridge API |
| `src/renderer/hooks/usePlanExecution.ts` | Added `stepStallStates: Record<string, StepStallState>` to state; handles all 4 new `PlanEvent` types; clears stall state on step completion or failure |
| `src/renderer/components/plan/FixerPlanView.tsx` | Added `stallState` prop to `StepRowProps`; renders `<StallIndicator>` on active steps; accepts `stepStallStates` map from parent |
| `src/renderer/components/plan/PlanView.tsx` | Threads `stepStallStates` from `usePlanExecution` down to `FixerPlanView` |
| `src/renderer/components/modals/SettingsModal.tsx` | Added two number inputs in the Behaviour section: **Soft Stall Warning** (0–120 s) and **Hard Stall Threshold** (0–300 s), with validation enforcing `hard > soft` |

---

## 5. Architecture Diagram

```
SSH stdout/stderr chunk
      │
      ▼
CommandExecutor.execute()
  ├─ Accumulates output (rolling 2 MiB cap)
  ├─ Forwards to plan.handler.ts via EventEmitter ('step-output')   ← Sprint 7 path
  └─ Resets IdleTimerManager

IdleTimerManager
  ├─ softTimer expires (idleWarningSeconds)
  │    └─ emitter.emit('idle-warning', { silenceSeconds, lastOutput })
  └─ hardTimer expires (idleStalledSeconds)
       └─ emitter.emit('idle-stalled', { silenceSeconds, lastOutput })

plan.handler.ts (out-of-band listeners)
  │
  ├─ on('idle-warning')
  │    ├─ detectInteractivePromptDeep(accumulatedOutput)
  │    │    ├─ [prompt found] → send PlanEvent { type: 'prompt-detected', promptText }
  │    │    └─ [no prompt]   → send PlanEvent { type: 'idle-warning', silenceSeconds }
  │    └─ (CommandExecutor continues running — generator unaffected)
  │
  └─ on('idle-stalled')
       ├─ detectInteractivePromptDeep(accumulatedOutput)
       │    └─ [prompt found] → send PlanEvent { type: 'prompt-detected' }; return
       ├─ send PlanEvent { type: 'stall-detected', agentAction: null }   ← "agent is thinking"
       ├─ AgentBrain.analyzeStall(step, partialResult, agentCtx)
       ├─ send PlanEvent { type: 'stall-detected', agentAction }         ← result shown
       └─ act on agentAction:
            retry  → resetHardStallTimer()
            modify → sshManager.write(correctedCommand)
            skip   → abortCurrentCommand()
            abort  → abortCurrentCommand()

ipcMain.on(PLAN.PROMPT_INPUT)   ← user typed something in StallIndicator form
  ├─ sshManager.write(input + '\n')
  └─ send PlanEvent { type: 'stall-input-submitted', stepId }
```

---

## 6. Settings

Two new user-configurable settings are available in **Settings → Behaviour**:

| Setting | Key | Default | Range |
|---------|-----|---------|-------|
| Soft Stall Warning | `idleWarningSeconds` | `15` | 0 – 120 s |
| Hard Stall Threshold | `idleStalledSeconds` | `45` | 0 – 300 s |

Validation prevents saving if `idleStalledSeconds ≤ idleWarningSeconds`.

---

## 7. Known Limitations

1. **Batch mode `PROMPT_INPUT`** — `sshManager.write()` targets the PTY shell, not the `exec` channel stdin. Prompt responses work reliably in `real-terminal` mode; batch-mode prompt interaction may not reach the command. This is an acceptable MVP limitation and aligns with the Sprint 8 build plan notes (§8.5).

2. **`AgentBrain.analyzeStall()` uses the same model as `analyzeFailure()`** — if the configured AI provider is slow, users will see the `agent-analyzing` spinner for a noticeable period before the stall-detected action appears.

3. **Output accumulator cap** — accumulator is capped at 2 MiB per command to avoid memory growth on long-running commands. `detectInteractivePromptDeep()` inspects only the last 2 000 characters, so prompts buried in earlier output will not be detected.

---

## 8. Testing Checklist

- [ ] Run a plan step with a command that hangs (e.g. `sleep 60`) — idle-warning badge appears at 15 s, then stall-detected with agent suggestion at 45 s
- [ ] Run a command that presents an interactive prompt (e.g. `sudo apt-get install ...`) — prompt-detected state with input box is shown
- [ ] Type input in the prompt box and press Enter / Submit — command receives the input and continues
- [ ] Click **Force Stop** during stall — command is aborted, step fails with user-cancel reason
- [ ] Adjust idle thresholds via Settings and verify new values take effect on the next plan run
- [ ] Verify `stall-input-submitted` clears the stall indicator from the step card
- [ ] Confirm `step-completed` and `step-failed` always clear any residual stall state

---

## 9. Sprint Relationship

| Sprint | Focus | Relation |
|--------|-------|----------|
| Sprint 7 | `ExecutionStrategy` / `ExecutionEmitter` pattern | Required foundation |
| **Sprint 8** | **Idle timer & stall detection** | **This sprint** |
| Sprint 9 (planned) | Multi-step plan retry orchestration | Builds on stall-detection signals |

---

*Completion certified — `npx tsc --noEmit` exits 0 with no warnings.*
