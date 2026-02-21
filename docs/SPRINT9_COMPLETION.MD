# Sprint 9 Completion Report
## Hybrid Command Detection — Invisible Exit Codes + Prompt Detection

**Status:** ✅ Complete — `tsc --noEmit` passes with 0 errors  
**Build Plan:** `docs/BUILDPLAN_SPRINT9.MD`  
**Prerequisites:** Sprint 7 (RealTerminalStrategy, MarkerStreamParser), Sprint 8 (IdleTimerManager, interactivePromptDetector, AgentBrain.analyzeStall)

---

## 1. Overview

Sprint 9 replaces the visible marker-based command wrapping introduced in Sprint 7 with an invisible, standards-based approach for exit code extraction and command completion detection.

**Before (Sprint 7):**
```
mike@PiTEST:~$ echo "===SMA_START_57b995ce742b==="; sudo apt update 2>&1; SMA_EC=$?; echo "===SMA_EXIT_${SMA_EC}_END_57b995ce742b==="
===SMA_START_57b995ce742b===
Hit:1 http://deb.debian.org/debian bookworm InRelease
...
===SMA_EXIT_0_END_57b995ce742b===
mike@PiTEST:~$
```

**After (Sprint 9):**
```
mike@PiTEST:~$ sudo apt update
Hit:1 http://deb.debian.org/debian bookworm InRelease
...
mike@PiTEST:~$
```

The user sees exactly what they would see if they typed the command themselves. No markers, no wrapping, no visual noise.

### How It Works

1. **One-time session setup** — After SSH connection, the shell type is detected and a `PROMPT_COMMAND` (bash) or `precmd` hook (zsh) is injected:
   ```bash
   export PROMPT_COMMAND='printf "\033]0;SMA:$?\007"; eval "$SMA_ORIG_PC"'
   ```
   This embeds the last exit code in an invisible OSC terminal title sequence before every prompt.

2. **Command execution** — The raw command string is written to the PTY with no wrapping.

3. **Completion detection** — `PromptStreamParser` watches the data stream for:
   - OSC sequence `\x1b]0;SMA:<exitCode>\x07` → extracts exit code  
   - Shell prompt regex `username@hostname:.*[$#]\s*$` → command is complete

4. **Stall fallback** — If neither signal is detected within 15 s of silence, Sprint 8's `IdleTimerManager` fires and the existing stall pipeline handles it unchanged.

---

## 2. New Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/main/services/execution/strategies/promptUtils.ts` | ~100 | `extractOSCExitCode`, `stripOSCSequences`, `stripCommandEcho`, `stripTrailingPrompt` — shared OSC/output utilities |
| `src/main/services/execution/strategies/PromptStreamParser.ts` | ~260 | Stateful 3-state parser (WAITING_FOR_ECHO → CAPTURING → DONE); dual-signal (OSC + prompt) completion detection with real-time content emission; cross-chunk tail buffering |
| `src/main/services/execution/strategies/sessionSetup.ts` | ~180 | `detectShellType` (exec channel), `buildPromptRegex`, `buildBashSetupCommand`, `buildZshSetupCommand`, `injectSessionSetup`, `initializeSession`; returns `ShellSessionInfo` |

---

## 3. Modified Files

### Main Process

| File | Change |
|------|--------|
| `src/main/services/execution/strategies/RealTerminalStrategy.ts` | Full refactor — adds `sessionInfo: ShellSessionInfo` constructor parameter; `execute()` routes to `executeWithPromptDetection()` (new, clean terminal) or `executeWithMarkers()` (renamed Sprint 7 implementation, unchanged); `emitter.emit('done')` moved into `cleanup()` for consistent idle timer teardown across all exit paths |
| `src/main/ipc/ssh.handler.ts` | After OS detection, calls `initializeSession()` which detects the shell via the exec channel (invisible), injects `PROMPT_COMMAND` into the PTY, and returns `ShellSessionInfo`; passes it to `setPlanConnectionContext()`; falls back to `detectionMode: 'markers'` on any error |
| `src/main/ipc/plan.handler.ts` | Added `shellSessionInfo: ShellSessionInfo` to `activeConnectionContext` type and `setPlanConnectionContext()` signature; `createStrategy()` passes `sessionInfo` to `RealTerminalStrategy`; safe fallback if context is unavailable |
| `src/main/services/execution/strategies/index.ts` | Updated barrel — exports all 3 new files plus their types (`ShellSessionInfo`, `PromptStreamParserConfig`, `PromptFeedResult`) |

### Not Modified (confirmed)
`ansiStripper.ts` — OSC stripping already present from Sprint 7 (no change needed).  
All Sprint 8 files (`IdleTimerManager`, `interactivePromptDetector`, `StallIndicator`, `plan.handler.ts` idle handlers) — unchanged; they operate on `ExecutionEmitter` events which are identical regardless of detection mode.  
`StepExecutor`, `PlanExecutor`, `CommandExecutor`, `AgentBrain` — all consume `CommandResult`, which has the same shape.

---

## 4. Retained Files (Not Deleted)

| File | Reason |
|------|--------|
| `MarkerStreamParser.ts` | Used by `executeWithMarkers()` fallback for unknown shells |
| `markerUtils.ts` | `generateMarkerId` / `wrapCommandWithMarkers` used by the same fallback |

---

## 5. Architecture

```
SSH Connection Established
    │
    ├── OS Detection (existing)
    │
    ├── detectShellType() via exec channel (invisible)
    │     ├── bash  → PROMPT_COMMAND injection
    │     ├── zsh   → precmd hook injection
    │     └── other → ShellSessionInfo { detectionMode: 'markers' }
    │
    ├── buildPromptRegex(username, hostname)
    │     → /(?:\([^)]+\)\s*)?mike@PiTEST:[^$#]*[$#]\s*$/
    │
    └── ShellSessionInfo stored in PlanConnectionContext

Plan Execution (real-terminal mode)
    │
    ├── createStrategy() reads activeConnectionContext.shellSessionInfo
    │
    ├── detectionMode === 'prompt':
    │     RealTerminalStrategy.executeWithPromptDetection()
    │       └── sshManager.write("sudo apt update\n")     ← RAW command
    │             PromptStreamParser.feed(chunk) on every data event
    │               ├── WAITING_FOR_ECHO → skip echo line
    │               ├── CAPTURING → accumulate; strip OSC; check prompt
    │               └── DONE → exitCode from OSC + prompt boundary
    │
    └── detectionMode === 'markers':
          RealTerminalStrategy.executeWithMarkers()          ← Sprint 7 unchanged
```

---

## 6. Key Design Decisions

### Dual-Signal Completion
Both the OSC exit code AND the prompt regex are required before `PromptStreamParser` declares completion. This prevents false positives when command output happens to contain text that looks like a shell prompt. The fallback (prompt-only, no OSC) is allowed when nothing follows the prompt, covering empty-output commands cleanly.

### PROMPT_COMMAND Preservation
The original `PROMPT_COMMAND` is saved to `SMA_ORIG_PC` and chained via `eval`. Users with existing prompt customisations (git branch display, history, etc.) are unaffected.

### Sprint 7 Marker Path Fully Retained
Unsupported shells (`fish`, `dash`, custom shells) fall back to the marker-based path automatically. No user configuration is required.

### Idle Timer / Stall Pipeline Untouched
Sprint 8's idle timer resets on every `stdout`/`stderr` event from the `ExecutionEmitter`. The detection mode change is invisible to this layer — same events, same thresholds, same stall analysis pipeline.

---

## 7. Edge Cases Addressed

| Scenario | Handling |
|----------|----------|
| Shell detection failure | Falls back to `detectionMode: 'markers'` — Sprint 7 path |
| User has existing PROMPT_COMMAND | Preserved via `eval "$SMA_ORIG_PC"` chain |
| OSC exit code not received | Defaults to `exitCode: 0`, logs warning; AgentBrain detects failure from output content |
| Empty-output commands (`cd`, `export`) | `capturedOutput: ''`, `stdout: ''` — correct result |
| Prompt text false-positive in output | Dual-signal requirement prevents early completion |
| `sudo su` / user switch | Idle timer catches silence; stall pipeline handles it |
| Interactive subshells (`python`, `mysql`) | Interactive prompt detector catches `>>>` / `mysql>` via Sprint 8 patterns |
| Rapid sequential commands | `WAITING_FOR_ECHO` state skips previous command's trailing data |
| Output exceeds `maxOutputBytes` | `PromptStreamParser` enforces cap; prompt detection still runs |

---

## 8. Sprint Relationship

```
Sprint 5  ─── PlanExecutor, StepExecutor, CommandExecutor (batch only)
Sprint 6  ─── AgentBrain, AgentContext, PlanMutator (Agentic Loop)
Sprint 7  ─── ExecutionStrategy, BatchStrategy, RealTerminalStrategy (marker-based)
Sprint 8  ─── IdleTimerManager, interactivePromptDetector, AgentBrain.analyzeStall
Sprint 9  ─── PromptStreamParser, sessionSetup, promptUtils              ◄── THIS SPRINT
              RealTerminalStrategy: prompt detection (default) + markers (fallback)
Sprint 10 ─── Tiered auto-response (PromptClassifier, auto-confirm Y/n, AgentBrain.analyzePrompt)
```
