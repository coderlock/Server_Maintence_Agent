# Sprint 7 Completion — Real Terminal Execution Strategy

**Sprint Goal:** Implement the Real Terminal execution strategy where plan commands are typed directly into the user's live SSH PTY session, captured via injected boundary markers, and exposed as a settings toggle alongside the existing batch method.

**Status:** ✅ Complete — `tsc --noEmit` exits 0, zero type errors.

---

## Overview

Sprint 7 introduced two related deliverables together:

1. **Sprint 5.5 (Prerequisite)** — The `ExecutionStrategy` pattern: an abstraction layer over *how* commands are executed. `CommandExecutor` was refactored to delegate to a pluggable strategy object. `BatchStrategy` wraps the existing SSH exec channel method. A new `ExecutionEmitter` provides typed real-time output events. This established the architectural foundation for all strategy variants.

2. **Sprint 7 — RealTerminalStrategy** — Commands are written directly into the live SSH PTY session. Output is captured by watching the data stream for injected boundary markers. The terminal shows authentic output — colours, progress bars, interactive formatting — exactly as if the user typed the command. A toggle in the Settings modal switches between modes at runtime.

---

## Design Decisions Made This Sprint

| Decision | Choice | Rationale |
|---|---|---|
| Sprint 5.5 + Sprint 7 scope | Combined in one sprint | Sprint 5.5 was an unbuilt prerequisite; batching them avoids a half-implemented strategy layer |
| Strategy constructor injection | Three function parameters (not SSHManager reference) | Keeps `strategies/` decoupled from `ssh/`; makes unit testing clean |
| Real-time step card updates | `step-output` events from `CommandExecutor` EventEmitter | Both batch and real-terminal modes emit chunks; renderer buffers by stepId |
| `mergesStderr` in `PlanView` | Derived from `settings.executionOutputMode` in `PlanView.tsx` | Single source of truth; no IPC needed |
| `executionConfig` built per plan run | Read `settingsStore` at execute-time | Avoids stale config if user changes mode while planning |
| Data listener cleanup on disconnect | `SSHManager.disconnect()` calls `dataListeners.clear()` | Prevents stale callbacks surviving a reconnect |

---

## New Files (6)

### `src/main/services/execution/strategies/ExecutionStrategy.ts`
The pluggable execution strategy interface. Defines `ExecutionHandle`, three capability flags (`handlesTerminalDisplay`, `mergesStderr`, `requiresTerminalLock`), `execute()`, and `dispose()`.

### `src/main/services/execution/strategies/ExecutionEmitter.ts`
Typed `EventEmitter` for in-flight command output. Events: `stdout`, `stderr`, `done`, `abort`. Used by both `BatchStrategy` and `RealTerminalStrategy` to fire real-time chunk events.

### `src/main/services/execution/strategies/BatchStrategy.ts`
Sprint 5.5 strategy. Wraps the existing SSH exec channel. `handlesTerminalDisplay = false` — caller mirrors output to terminal after completion. Emits full stdout/stderr as a single chunk on completion.

### `src/main/services/execution/strategies/RealTerminalStrategy.ts`
Sprint 7 strategy. Writes marker-wrapped commands to the live PTY; observes the SSH data stream for `===SMA_START_<id>===` and `===SMA_EXIT_<exitCode>_END_<id>===` markers; extracts output; strips ANSI. `handlesTerminalDisplay = true` — terminal already shows output live; caller must NOT mirror it again.

### `src/main/services/execution/strategies/MarkerStreamParser.ts`
Stateful stream parser. Handles markers split across multiple PTY data chunks using a sliding tail buffer. Three states: `WAITING_FOR_START` → `CAPTURING` → `DONE`. Enforces `maxOutputBytes` output cap.

### `src/main/services/execution/strategies/ansiStripper.ts`
Strips ANSI escape codes from PTY output before feeding to the Agent Brain. Three-phase processing: remove escape sequences → resolve carriage-return progress bars → collapse trailing blank lines.

### `src/main/services/execution/strategies/markerUtils.ts`
Generates 12-character hex marker IDs via `crypto.randomBytes`. Builds the POSIX-compatible wrapped command string (`echo START; cmd 2>&1; SMA_EC=$?; echo END_WITH_EC`).

### `src/main/services/execution/strategies/index.ts`
Barrel exports for all strategy files.

---

## Modified Files (8)

### `src/main/services/execution/CommandExecutor.ts` *(full rewrite)*
Refactored from a standalone SSH-calling class to a thin orchestrator that delegates to an `ExecutionStrategy`. Now extends `EventEmitter` — fires `stdout`/`stderr` events as chunks arrive so `plan.handler.ts` can forward them to the renderer.

Key surface area changes:
- Constructor: `(ssh: SSHExecutor)` → `(strategy: ExecutionStrategy, config: ExecutionConfig)`
- `execute()`: delegates to `strategy.execute()`, returns `CommandResult` as before
- `handlesTerminalDisplay` getter: forwarded from the active strategy
- `dispose()`: new — cleans up in-flight strategy state on plan cancel

**StepExecutor is unchanged** — it still calls `commandExecutor.execute(command)` and handles `CommandResult`. The refactor is backward-compatible.

### `src/main/services/ssh/SSHManager.ts`
- Added `dataListeners: Set<(data:string) => void>` private field
- Added `registerDataListener(listener)` and `removeDataListener(listener)` public methods
- Added `notifyDataListeners(data)` private method — called in the existing `'data'` event handler, after `sendToRenderer`, so the terminal always updates first
- `disconnect()` now calls `dataListeners.clear()` to clean up stale listeners

### `src/shared/types/execution.ts`
- Added `ExecutionConfig` interface: `outputMode`, `commandTimeoutMs`, `maxOutputBytes`, `maxStderrBytes`
- Added `step-output` event to `PlanEvent` union: `{ type: 'step-output'; stepId: string; chunk: string; stream: 'stdout' | 'stderr' }` — fires while a command is running

### `src/shared/types/settings.ts`
- Added `executionOutputMode: 'batch' | 'real-terminal'` to `AppSettings`
- Added `executionOutputMode: 'batch'` to `DEFAULT_SETTINGS`

### `src/main/ipc/plan.handler.ts`
- Replaced `makeSSHExecutor()` with `createStrategy(config: ExecutionConfig): ExecutionStrategy` factory
- `CommandExecutor` now takes `(strategy, executionConfig)` — `activePlanExecutor` gets a fresh strategy per run
- Reads `settingsStore.getSettings()` at plan execute-time to build `ExecutionConfig`
- Attaches `stdout`/`stderr` listeners to `CommandExecutor` to forward `step-output` events to renderer
- Tracks `activeStepId` from `step-started` events for per-step chunk routing
- Skips terminal mirror (`SSH.DATA` send) when `outputMode === 'real-terminal'`
- Calls `commandExecutor.dispose()` on plan completion/cancellation

### `src/renderer/hooks/usePlanExecution.ts`
- Added `liveStepOutput: Map<string, { stdout: string; stderr: string }>` to state
- Handles `step-output` events: accumulates chunks by stepId into `liveStepOutput`
- `step-completed` and `step-failed` cases: delete entry from `liveStepOutput` (final result now in `stepResults`)

### `src/renderer/components/plan/FixerPlanView.tsx`
- `StepRowProps`: added `liveOutput?: { stdout: string; stderr: string }` and `mergesStderr?: boolean`
- `StepRow`: shows live streaming output box with blinking cursor while step runs (no final result yet)
- `StepRow`: conditionally renders `stderr` warning box only when `!mergesStderr` (batch mode)
- Shows a small italic hint on failed steps in real-terminal mode: "stdout and stderr are merged above"
- `FixerPlanViewProps`: added `liveStepOutput` and `mergesStderr` props

### `src/renderer/components/plan/PlanView.tsx`
- Reads `settings.executionOutputMode` from `useSettingsStore`
- Derives `mergesStderr` boolean
- Destructures and passes `liveStepOutput` and `mergesStderr` to `FixerPlanView`

### `src/renderer/components/modals/SettingsModal.tsx`
- Added `executionOutputMode` local state, synced from settings, included in `handleSaveSettings`
- Added **Command Output Mode** dropdown in the Behaviour section with dynamic description text
  - `Standard (Separate Channel)` → `'batch'`
  - `Real Terminal (Live Session)` → `'real-terminal'`

---

## Architecture Diagram

```
Settings Modal
  executionOutputMode: 'batch' | 'real-terminal'
           │
           ▼
plan.handler.ts
  createStrategy(config) ─────┬──── BatchStrategy
                               └──── RealTerminalStrategy
           │
           ▼
CommandExecutor(strategy, config)
  emit('stdout', chunk)           ──► plan.handler step-output ──► renderer step card
           │
           ▼
StepExecutor.executeStep()
  await commandExecutor.execute()
  returns CommandResult (unchanged)
           │
           ▼
PlanExecutor / AgentLoop (Sprint 6)
  100% unchanged — consumes StepResult as before
```

```
RealTerminalStrategy:
  sshManager.write(wrappedCommand + '\n')
       │
       ▼
  SSHManager.data stream
       │
       ├──► mainWindow.webContents.send(SSH.DATA) ──► xterm.js  (unchanged path)
       │
       └──► notifyDataListeners()
                   │
                   ▼
            MarkerStreamParser.feed(chunk)
                   │
            START marker? → begin CAPTURING
            END marker?   → extract exitCode, resolve Promise
                   │
                   ▼
            stripAnsi(capturedOutput)
                   │
                   ▼
            resolve(CommandResult) + emit('done')
```

---

## Future Sprint Hooks (Built, Not Yet Activated)

| Hook | Location | Current State | Activation |
|---|---|---|---|
| `requiresTerminalLock` flag | `RealTerminalStrategy` | `false` | Set to `true`, implement `terminal:lock` IPC send in `plan.handler.ts` |
| `'streaming'` mode | `createStrategy()` factory (falls back to `'batch'`) | Falls through to batch | Add `StreamingStrategy` class (Sprint 8), update factory case |
| `'streaming'` in Settings UI | `SettingsModal` dropdown | Only `batch` and `real-terminal` shown | Add third `<option>` |

---

## Testing Checklist

| # | Test | Expected Result |
|---|---|---|
| 1 | Default settings → execute a plan | `'batch'` mode — identical to Sprint 6 behaviour |
| 2 | Switch to `real-terminal`, run `echo "hello"` | Terminal shows wrapped command + markers; step card shows `hello world` |
| 3 | `sudo apt update` in real-terminal mode | Live package list with colours in terminal; ANSI-stripped text in step card |
| 4 | `ls /nonexistent` in real-terminal mode | Error in terminal; step card shows message under stdout; stderr empty; non-zero exit code |
| 5 | Command with progress bar (`curl -O <url>`) | Terminal shows animated bar; step card shows final progress line |
| 6 | Command exceeds timeout | Ctrl+C sent; step card shows partial output; `timedOut: true` |
| 7 | Cancel plan mid-execution (real-terminal) | Ctrl+C sent; subsequent steps skip; terminal returns to prompt |
| 8 | Switch mode between plan runs | Next plan uses the new mode; no stale listeners |
| 9 | Agentic mode + real-terminal | Agent Brain receives ANSI-stripped merged output; all retry/skip logic unchanged |
| 10 | Step card shows live output while running | Output appears in step card with blinking cursor before step completes |
| 11 | Settings modal shows correct dropdown | Correct default (`Standard`); changes persist across app restart |
| 12 | SSH disconnect during real-terminal execution | Timeout fires; step resolves with partial output and `timedOut: true` |

---

## Sprint Relationship

```
Sprint 5   ─── PlanExecutor, StepExecutor, CommandExecutor (direct SSH), TerminalBridge
Sprint 6   ─── AgentBrain, AgentContext, PlanMutator (Agentic Loop)
Sprint 7   ─── ExecutionStrategy interface, ExecutionEmitter, BatchStrategy          ◄── THIS SPRINT
               RealTerminalStrategy, MarkerStreamParser, ansiStripper, markerUtils
               CommandExecutor refactored to delegate; SSHManager data observer API
Sprint 8   ─── StreamingStrategy (SSH exec channel, real-time chunks) — factory ready
```
