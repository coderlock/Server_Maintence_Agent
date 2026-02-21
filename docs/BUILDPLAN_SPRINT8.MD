BUILDPLAN_SPRINT8.MD — Idle Timer & Stall Detection

Sprint: 8 of Phase 1
Focus: Add idle timer stall detection to ExecutionEmitter, integrate with AgentBrain.analyzeStall(), wire prompt detection events through the existing PlanEvent system, and expose thresholds as user-configurable settings.
Target AI: Claude Sonnet 4.6
Prerequisite: Sprint 7 complete (ExecutionStrategy pattern, ExecutionEmitter, BatchStrategy, RealTerminalStrategy)
1. Objective

When a command is running and the SSH data stream goes silent, the system currently has no awareness until the full 120-second timeout expires. This sprint adds a resettable idle timer inside ExecutionEmitter that detects silence at two thresholds:

    Soft stall (default 15s): Re-examines the last output for missed interactive prompts. If a prompt pattern is found, emits prompt-detected. If not, emits idle-warning as an informational event.
    Hard stall (default 45s): Calls AgentBrain.analyzeStall() to determine whether the command is waiting for input, hanging, or legitimately slow. The agent's correction flows through the existing AgentCorrection → PlanExecutor pipeline.

Both thresholds are configurable in the Settings modal. The idle timer is strategy-agnostic — it works identically for Batch and Real Terminal modes because it hooks into ExecutionEmitter, which both strategies use.

In this sprint, all detected prompts pause and show to the user regardless of mode. The tiered auto-response system (auto-confirm [Y/n] in Agentic mode, LLM analysis for unknown prompts) is Sprint 9.
2. Architecture
2.1 Where the Timer Lives

text

ExecutionEmitter (shared by all strategies)
    │
    ├── on('stdout') ──► resetIdleTimer()
    ├── on('stderr') ──► resetIdleTimer()
    │
    │   (no data for idleWarningSeconds)
    │   softTimer fires ──► emit('idle-warning', { ... })
    │
    │   (no data for idleStalledSeconds)
    │   hardTimer fires ──► emit('idle-stalled', { ... })
    │
    ├── on('done') ──► clearAllTimers()
    └── on('abort') ──► clearAllTimers()

2.2 Who Listens

text

ExecutionEmitter
    │
    ├── 'idle-warning' ──► StepExecutor
    │                        │
    │                        ├── Run detectInteractivePrompt(lastOutput)
    │                        │     │
    │                        │     ├── Match found → emit PlanEvent 'prompt-detected'
    │                        │     └── No match → emit PlanEvent 'idle-warning' (informational)
    │                        │
    │                        └── (No execution pause — just detection + notification)
    │
    ├── 'idle-stalled' ──► StepExecutor
    │                        │
    │                        ├── Run detectInteractivePrompt(lastOutput) one more time
    │                        │     │
    │                        │     ├── Match found → emit PlanEvent 'prompt-detected'
    │                        │     │
    │                        │     └── No match → call AgentBrain.analyzeStall()
    │                        │                      │
    │                        │                      ├── 'abort' → emitter.abort()
    │                        │                      ├── 'wait'  → reset timers, extend timeout
    │                        │                      ├── 'send-input' → emit 'prompt-detected'
    │                        │                      │                   with agent's suggested input
    │                        │                      └── 'skip' → emitter.abort(), mark step skipped
    │                        │
    │                        └── emit PlanEvent 'stall-detected' (informational for UI)
    │
    └── plan.handler.ts ──► forwards PlanEvents to renderer via IPC
                              │
                              ▼
                         usePlanExecution hook ──► UI step cards

2.3 Data Flow for Prompt Detection

text

CASE 1: Regex catches prompt immediately (Sprint 7 existing path)
─────────────────────────────────────────────────────────────────
Data chunk: "Do you want to continue? [Y/n] "
  │
  ├── detectInteractivePrompt(chunk) → MATCH
  │     └── emit PlanEvent 'prompt-detected'
  │           └── UI shows prompt notification on step card
  │
  └── resetIdleTimer()  (timer never fires — data arrived)

CASE 2: Regex misses prompt, soft stall catches it
─────────────────────────────────────────────────────
Data chunk: "Enter your deployment target: "
  │
  ├── detectInteractivePrompt(chunk) → NO MATCH (unknown format)
  │
  └── resetIdleTimer()
        │
        (15 seconds of silence)
        │
        └── idle-warning fires
              │
              ├── detectInteractivePrompt(lastOutputBuffer) → MATCH or NO MATCH
              │     (re-examines a larger window — maybe the prompt was
              │      split across chunks or preceded by other output)
              │
              └── If still no match → emit 'idle-warning' PlanEvent
                    (informational — user sees "command may be stalled")

CASE 3: Truly stuck — hard stall triggers agent analysis
──────────────────────────────────────────────────────────
(45 seconds of silence, soft stall already fired at 15s)
  │
  └── idle-stalled fires
        │
        ├── detectInteractivePrompt(lastOutputBuffer) → last attempt
        │
        └── If no match → AgentBrain.analyzeStall()
              │
              └── Agent decides based on command + last output

3. New Files
3.1 src/main/services/execution/IdleTimerManager.ts

Purpose: Encapsulates the dual-threshold idle timer logic. Attaches to an ExecutionEmitter instance and emits idle-warning and idle-stalled events when silence thresholds are reached.

typescript

import { ExecutionEmitter } from './strategies/ExecutionEmitter';

export interface IdleTimerConfig {
  /**
   * Seconds of silence before emitting 'idle-warning'.
   * 0 = disabled.
   */
  idleWarningSeconds: number;

  /**
   * Seconds of silence before emitting 'idle-stalled'.
   * Must be > idleWarningSeconds (or 0 to disable).
   */
  idleStalledSeconds: number;
}

export const DEFAULT_IDLE_TIMER_CONFIG: IdleTimerConfig = {
  idleWarningSeconds: 15,
  idleStalledSeconds: 45,
};

export interface IdleEvent {
  /**
   * Total seconds of silence when this event fired.
   */
  silenceSeconds: number;

  /**
   * The last N characters of accumulated output at the time of firing.
   * Used for prompt re-detection and agent analysis.
   */
  lastOutput: string;
}

/**
 * Manages resettable idle timers for a single command execution.
 *
 * Attaches to an ExecutionEmitter and:
 *   - Resets timers whenever 'stdout' or 'stderr' events fire
 *   - Emits 'idle-warning' on the emitter after idleWarningSeconds of silence
 *   - Emits 'idle-stalled' on the emitter after idleStalledSeconds of silence
 *   - Cleans up all timers on 'done' or 'abort'
 *
 * This class does NOT decide what to do about the stall.
 * That responsibility belongs to StepExecutor.
 *
 * Usage:
 *   const timer = new IdleTimerManager(emitter, config, outputBuffer);
 *   // ... command runs ...
 *   // timer auto-cleans on emitter 'done'
 */
export class IdleTimerManager {
  private emitter: ExecutionEmitter;
  private config: IdleTimerConfig;
  private getLastOutput: () => string;

  private softTimer: ReturnType<typeof setTimeout> | null = null;
  private hardTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDataTime: number = Date.now();
  private softFired: boolean = false;
  private hardFired: boolean = false;
  private disposed: boolean = false;

  /**
   * @param emitter       — the ExecutionEmitter for this command execution
   * @param config        — idle timer thresholds
   * @param getLastOutput — callback that returns the last N chars of accumulated
   *                         output (from CommandExecutor or strategy buffer)
   */
  constructor(
    emitter: ExecutionEmitter,
    config: IdleTimerConfig,
    getLastOutput: () => string
  ) {
    this.emitter = emitter;
    this.config = config;
    this.getLastOutput = getLastOutput;

    this.attachListeners();
    this.startTimers();
  }

  private attachListeners(): void {
    // Reset timers on any data
    const resetHandler = () => {
      if (!this.disposed) {
        this.lastDataTime = Date.now();
        this.resetTimers();
      }
    };

    this.emitter.on('stdout', resetHandler);
    this.emitter.on('stderr', resetHandler);

    // Clean up on completion or abort
    const cleanupHandler = () => {
      this.dispose();
    };

    this.emitter.on('done', cleanupHandler);
    this.emitter.on('abort', cleanupHandler);
  }

  private startTimers(): void {
    this.startSoftTimer();
    this.startHardTimer();
  }

  private startSoftTimer(): void {
    if (this.config.idleWarningSeconds <= 0 || this.softFired) return;

    this.softTimer = setTimeout(() => {
      if (this.disposed) return;
      this.softFired = true;

      const silenceSeconds = Math.round((Date.now() - this.lastDataTime) / 1000);
      const lastOutput = this.getLastOutput();

      this.emitter.emit('idle-warning', {
        silenceSeconds,
        lastOutput,
      } satisfies IdleEvent);
    }, this.config.idleWarningSeconds * 1000);
  }

  private startHardTimer(): void {
    if (this.config.idleStalledSeconds <= 0 || this.hardFired) return;

    this.hardTimer = setTimeout(() => {
      if (this.disposed) return;
      this.hardFired = true;

      const silenceSeconds = Math.round((Date.now() - this.lastDataTime) / 1000);
      const lastOutput = this.getLastOutput();

      this.emitter.emit('idle-stalled', {
        silenceSeconds,
        lastOutput,
      } satisfies IdleEvent);
    }, this.config.idleStalledSeconds * 1000);
  }

  private resetTimers(): void {
    // Clear existing timers
    if (this.softTimer) {
      clearTimeout(this.softTimer);
      this.softTimer = null;
    }
    if (this.hardTimer) {
      clearTimeout(this.hardTimer);
      this.hardTimer = null;
    }

    // Restart only the timers that haven't fired yet
    // (once soft fires, it doesn't fire again; same for hard)
    this.startSoftTimer();
    this.startHardTimer();
  }

  /**
   * Reset the hard stall timer without resetting the soft timer.
   * Used when AgentBrain says "wait longer" — gives the command
   * another full idleStalledSeconds before re-checking.
   */
  resetHardTimer(): void {
    this.hardFired = false;
    if (this.hardTimer) {
      clearTimeout(this.hardTimer);
      this.hardTimer = null;
    }
    this.lastDataTime = Date.now();
    this.startHardTimer();
  }

  /**
   * Clean up all timers and detach from the emitter.
   * Called automatically on 'done' or 'abort'.
   * Safe to call multiple times.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.softTimer) {
      clearTimeout(this.softTimer);
      this.softTimer = null;
    }
    if (this.hardTimer) {
      clearTimeout(this.hardTimer);
      this.hardTimer = null;
    }
  }
}

3.2 src/main/services/execution/interactivePromptDetector.ts

Purpose: Detect interactive prompts in command output. Used both in real-time (per-chunk) and retrospectively (on idle timer fire). Pure functions, no state.

typescript

/**
 * Result of prompt detection.
 */
export interface PromptDetection {
  /**
   * Whether a prompt pattern was found.
   */
  detected: boolean;

  /**
   * The matched prompt text (the line containing the pattern).
   * Empty string if not detected.
   */
  promptText: string;

  /**
   * The specific pattern that matched (for logging/debugging).
   * Empty string if not detected.
   */
  matchedPattern: string;
}

/**
 * Patterns that indicate the command is waiting for user input.
 * Ordered roughly by frequency of occurrence.
 *
 * Each entry has:
 *   - pattern: regex to match against output text
 *   - label: human-readable description for logging
 */
const INTERACTIVE_PROMPT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Package managers
  { pattern: /$$Y\/n$$/i, label: 'apt Y/n' },
  { pattern: /$$y\/N$$/i, label: 'apt y/N' },
  { pattern: /$$yes\/no$$/i, label: 'yes/no' },
  { pattern: /Do you want to continue\s*\?/i, label: 'continue prompt' },
  { pattern: /Proceed\s*\?\s*$$/i, label: 'proceed prompt' },
  { pattern: /Is this ok\s*\[/i, label: 'yum ok prompt' },

  // Authentication
  { pattern: /[Pp]assword\s*:/,  label: 'password prompt' },
  { pattern: /[Pp]assphrase\s*:/, label: 'passphrase prompt' },
  { pattern: /Enter passphrase/i, label: 'passphrase prompt' },

  // SSH/Git
  { pattern: /Are you sure you want to continue connecting/i, label: 'SSH host key' },
  { pattern: /\(yes\/no\/\[fingerprint$$\)/i, label: 'SSH fingerprint' },
  { pattern: /Username for/i, label: 'git username' },
  { pattern: /Password for/i, label: 'git password' },

  // General
  { pattern: /Press ENTER to continue/i, label: 'press enter' },
  { pattern: /Press any key/i, label: 'press any key' },
  { pattern: /Hit ENTER or type/i, label: 'hit enter' },
  { pattern: /Type .+ to confirm/i, label: 'type to confirm' },

  // Editors / interactive tools
  { pattern: /\(END\)/, label: 'less/more pager' },
  { pattern: /---More---/, label: 'more pager' },

  // Sudo
  { pattern: /$$sudo$$ password for/i, label: 'sudo password' },

  // Generic input prompts (broad — keep last)
  { pattern: /:\s*$/, label: 'colon prompt (generic)' },
  { pattern: />\s*$/, label: 'angle bracket prompt (generic)' },
];

/**
 * Detect interactive prompts in a chunk of command output.
 *
 * Scans the text against known interactive prompt patterns.
 * Returns the first match found.
 *
 * @param text — raw command output (may contain ANSI codes; patterns
 *               are designed to match through common escape sequences)
 */
export function detectInteractivePrompt(text: string): PromptDetection {
  // Check the last 500 characters — prompts appear at the end of output
  const tail = text.slice(-500);

  for (const { pattern, label } of INTERACTIVE_PROMPT_PATTERNS) {
    if (pattern.test(tail)) {
      // Extract the line containing the match for display
      const lines = tail.split('\n');
      const matchedLine = lines.reverse().find((line) => pattern.test(line)) || '';

      return {
        detected: true,
        promptText: matchedLine.trim(),
        matchedPattern: label,
      };
    }
  }

  return {
    detected: false,
    promptText: '',
    matchedPattern: '',
  };
}

/**
 * Detect interactive prompts with a larger context window.
 * Used by the idle timer when re-examining accumulated output.
 *
 * Same logic as detectInteractivePrompt but examines the last 2000 characters
 * to catch prompts that may have been preceded by substantial output.
 *
 * @param accumulatedOutput — full stdout accumulated so far
 */
export function detectInteractivePromptDeep(accumulatedOutput: string): PromptDetection {
  const tail = accumulatedOutput.slice(-2000);

  for (const { pattern, label } of INTERACTIVE_PROMPT_PATTERNS) {
    if (pattern.test(tail)) {
      const lines = tail.split('\n');
      const matchedLine = lines.reverse().find((line) => pattern.test(line)) || '';

      return {
        detected: true,
        promptText: matchedLine.trim(),
        matchedPattern: label,
      };
    }
  }

  return {
    detected: false,
    promptText: '',
    matchedPattern: '',
  };
}

3.3 src/renderer/components/plan/StallIndicator.tsx

Purpose: Visual indicator shown on a step card when the idle timer fires. Displays the stall state and, when a prompt is detected, shows the prompt text and a text input field for the user to respond.

typescript

import React, { useState } from 'react';

interface StallIndicatorProps {
  /**
   * Current stall state for this step.
   */
  stallState: StepStallState | null;

  /**
   * Callback when user submits input for a detected prompt.
   * Sends the text to the terminal via IPC.
   */
  onSubmitInput: (input: string) => void;

  /**
   * Callback when user clicks "Send Ctrl+C" to abort the stalled command.
   */
  onForceStop: () => void;
}

export interface StepStallState {
  /**
   * 'idle-warning' — soft stall (15s default). Informational.
   * 'idle-stalled' — hard stall (45s default). Agent is analyzing.
   * 'prompt-detected' — an interactive prompt was found in the output.
   * 'agent-analyzing' — AgentBrain.analyzeStall() is in progress.
   */
  status: 'idle-warning' | 'idle-stalled' | 'prompt-detected' | 'agent-analyzing';

  /**
   * The detected prompt text (if status is 'prompt-detected').
   */
  promptText?: string;

  /**
   * Seconds of silence when the stall was detected.
   */
  silenceSeconds?: number;

  /**
   * Message from the agent (if status is 'agent-analyzing' or after analysis).
   */
  agentMessage?: string;
}

export const StallIndicator: React.FC<StallIndicatorProps> = ({
  stallState,
  onSubmitInput,
  onForceStop,
}) => {
  const [userInput, setUserInput] = useState('');

  if (!stallState) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (userInput.trim() || stallState.promptText) {
      onSubmitInput(userInput + '\n');
      setUserInput('');
    }
  };

  return (
    <div className={`stall-indicator stall-${stallState.status}`}>
      {/* Soft warning */}
      {stallState.status === 'idle-warning' && (
        <div className="stall-warning">
          <span className="stall-icon">⏳</span>
          <span>
            No output for {stallState.silenceSeconds}s — command may be waiting for input
          </span>
        </div>
      )}

      {/* Hard stall — agent analyzing */}
      {stallState.status === 'agent-analyzing' && (
        <div className="stall-analyzing">
          <span className="stall-icon spinning">🧠</span>
          <span>Analyzing stall — command silent for {stallState.silenceSeconds}s</span>
        </div>
      )}

      {/* Hard stall — no prompt found */}
      {stallState.status === 'idle-stalled' && (
        <div className="stall-stalled">
          <span className="stall-icon">⚠️</span>
          <span>
            Command stalled — no output for {stallState.silenceSeconds}s
            {stallState.agentMessage && `: ${stallState.agentMessage}`}
          </span>
          <button
            className="stall-force-stop"
            onClick={onForceStop}
            title="Send Ctrl+C to the running command"
          >
            Force Stop (Ctrl+C)
          </button>
        </div>
      )}

      {/* Prompt detected — show input field */}
      {stallState.status === 'prompt-detected' && (
        <div className="stall-prompt">
          <span className="stall-icon">💬</span>
          <span className="stall-prompt-text">
            Command is waiting for input: <strong>{stallState.promptText}</strong>
          </span>
          <form onSubmit={handleSubmit} className="stall-input-form">
            <input
              type={stallState.promptText?.toLowerCase().includes('password') ? 'password' : 'text'}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Type your response..."
              autoFocus
              className="stall-input"
            />
            <button type="submit" className="stall-submit">
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

4. Modified Files
4.1 src/shared/types/settings.ts

Change: Add idle timer thresholds to AppSettings and DEFAULT_SETTINGS.

typescript

export interface AppSettings {
  // ... existing fields ...

  executionOutputMode: 'batch' | 'real-terminal';

  /**
   * Seconds of output silence before showing a soft stall warning.
   * 0 = disabled.
   * Default: 15
   */
  idleWarningSeconds: number;

  /**
   * Seconds of output silence before triggering hard stall analysis.
   * Must be > idleWarningSeconds (or 0 to disable).
   * Default: 45
   */
  idleStalledSeconds: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  // ... existing defaults ...
  executionOutputMode: 'batch',
  idleWarningSeconds: 15,
  idleStalledSeconds: 45,
};

4.2 src/shared/types/execution.ts

Change: Add new PlanEvent types for stall detection and prompt notification. Add IdleTimerConfig to ExecutionConfig.

typescript

// Add to ExecutionConfig:
export interface ExecutionConfig {
  outputMode: 'streaming' | 'batch' | 'real-terminal';
  commandTimeoutMs: number;
  maxOutputBytes: number;
  maxStderrBytes: number;

  /** Seconds of silence before soft stall warning. 0 = disabled. */
  idleWarningSeconds: number;
  /** Seconds of silence before hard stall + agent analysis. 0 = disabled. */
  idleStalledSeconds: number;
}

// Add to PlanEvent union:
type PlanEvent =
  // ... existing types ...
  | {
      type: 'prompt-detected';
      stepId: string;
      promptText: string;
      matchedPattern: string;
      source: 'realtime' | 'idle-warning' | 'idle-stalled';
    }
  | {
      type: 'idle-warning';
      stepId: string;
      silenceSeconds: number;
    }
  | {
      type: 'stall-detected';
      stepId: string;
      silenceSeconds: number;
      agentAction: 'abort' | 'wait' | 'send-input' | 'skip' | null;
      agentReasoning: string;
    }
  | {
      type: 'stall-input-submitted';
      stepId: string;
      input: string;
    };

4.3 src/shared/constants/ipcChannels.ts

Change: Add IPC channel for user prompt input responses.

typescript

// Add to PLAN group:
PLAN: {
  // ... existing channels ...
  EXECUTE: 'plan:execute',
  EVENT: 'plan:event',
  APPROVAL_RESPONSE: 'plan:approval-response',
  PROMPT_INPUT: 'plan:prompt-input',      // NEW: renderer → main
}

4.4 src/main/services/execution/strategies/ExecutionEmitter.ts

Change: Add typed event signatures for idle-warning and idle-stalled so TypeScript consumers know the payload shape. No behavioral change — EventEmitter.emit already handles arbitrary event names.

typescript

import { EventEmitter } from 'events';
import type { IdleEvent } from '../IdleTimerManager';

/**
 * Typed event emitter for command execution output.
 *
 * Events:
 *   'stdout'        (chunk: string)     — a chunk of stdout data
 *   'stderr'        (chunk: string)     — a chunk of stderr data
 *   'done'          ()                  — command has exited
 *   'abort'         ()                  — command should be killed
 *   'idle-warning'  (event: IdleEvent)  — NEW: soft stall threshold reached
 *   'idle-stalled'  (event: IdleEvent)  — NEW: hard stall threshold reached
 */
export class ExecutionEmitter extends EventEmitter {
  private _aborted = false;

  abort(): void {
    this._aborted = true;
    this.emit('abort');
  }

  get aborted(): boolean {
    return this._aborted;
  }
}

4.5 src/main/services/execution/CommandExecutor.ts

Change: After creating the ExecutionHandle from the strategy, attach an IdleTimerManager to the emitter. Maintain an output accumulator buffer for the getLastOutput callback.

typescript

import { IdleTimerManager, IdleTimerConfig } from './IdleTimerManager';

export class CommandExecutor extends EventEmitter {
  private strategy: ExecutionStrategy;
  private config: ExecutionConfig;
  private activeIdleTimer: IdleTimerManager | null = null;
  private outputAccumulator: string = '';

  // ... existing constructor, setStrategy, updateConfig ...

  execute(command: string): ExecutionHandle {
    // Reset accumulator
    this.outputAccumulator = '';

    const handle = this.strategy.execute(command, this.config);

    // Accumulate output for idle timer's getLastOutput callback
    handle.emitter.on('stdout', (chunk: string) => {
      this.outputAccumulator += chunk;
      // Forward to existing listeners (plan.handler.ts)
      this.emit('stdout', chunk);
    });

    handle.emitter.on('stderr', (chunk: string) => {
      this.outputAccumulator += chunk;
      this.emit('stderr', chunk);
    });

    // Attach idle timer
    const idleConfig: IdleTimerConfig = {
      idleWarningSeconds: this.config.idleWarningSeconds,
      idleStalledSeconds: this.config.idleStalledSeconds,
    };

    this.activeIdleTimer = new IdleTimerManager(
      handle.emitter,
      idleConfig,
      () => this.outputAccumulator.slice(-2000) // Last 2000 chars
    );

    // Forward idle events to our own listeners
    handle.emitter.on('idle-warning', (event) => {
      this.emit('idle-warning', event);
    });

    handle.emitter.on('idle-stalled', (event) => {
      this.emit('idle-stalled', event);
    });

    // Clean up on done
    handle.emitter.on('done', () => {
      this.activeIdleTimer = null;
    });

    return handle;
  }

  /**
   * Reset the hard stall timer.
   * Called when AgentBrain says "wait longer".
   */
  resetHardStallTimer(): void {
    if (this.activeIdleTimer) {
      this.activeIdleTimer.resetHardTimer();
    }
  }

  /**
   * Get the accumulated output buffer.
   * Used by StepExecutor for prompt re-detection.
   */
  getAccumulatedOutput(): string {
    return this.outputAccumulator;
  }

  // ... existing executeCommand, handlesTerminalDisplay, dispose ...
}

4.6 src/main/services/execution/StepExecutor.ts

Change: Listen for idle-warning and idle-stalled events from CommandExecutor. Run prompt detection. On hard stall, call AgentBrain.analyzeStall(). Emit PlanEvent objects for the renderer.

typescript

import { detectInteractivePrompt, detectInteractivePromptDeep } from './interactivePromptDetector';
import { AgentBrain } from '../agent/AgentBrain';
import type { IdleEvent } from './IdleTimerManager';

interface StepExecutorDependencies {
  commandExecutor: CommandExecutor;
  riskClassifier: RiskClassifier;
  approvalHandler: ApprovalHandler;
  agentBrain: AgentBrain;           // NEW
}

interface StepExecuteCallbacks {
  onOutput?: (chunk: string, stream: 'stdout' | 'stderr') => void;
  onPlanEvent?: (event: PlanEvent) => void;      // NEW: emit PlanEvents to PlanExecutor
}

class StepExecutor {
  private agentBrain: AgentBrain;

  constructor(deps: StepExecutorDependencies) {
    // ... existing assignments ...
    this.agentBrain = deps.agentBrain;
  }

  async executeStep(
    step: ExecutionStep,
    context: AgentContext,
    callbacks?: StepExecuteCallbacks
  ): Promise<StepResult> {
    // 1. Risk gate (unchanged)
    // 2. Approval logic (unchanged)

    // 3. Wire up real-time prompt detection on stdout chunks
    const realtimePromptHandler = (chunk: string, stream: 'stdout' | 'stderr') => {
      callbacks?.onOutput?.(chunk, stream);

      // Real-time prompt check on each chunk
      if (stream === 'stdout') {
        const detection = detectInteractivePrompt(chunk);
        if (detection.detected) {
          callbacks?.onPlanEvent?.({
            type: 'prompt-detected',
            stepId: step.id,
            promptText: detection.promptText,
            matchedPattern: detection.matchedPattern,
            source: 'realtime',
          });
        }
      }
    };

    // 4. Wire up idle timer handlers
    const idleWarningHandler = (event: IdleEvent) => {
      // Re-examine accumulated output with deeper context
      const detection = detectInteractivePromptDeep(event.lastOutput);

      if (detection.detected) {
        callbacks?.onPlanEvent?.({
          type: 'prompt-detected',
          stepId: step.id,
          promptText: detection.promptText,
          matchedPattern: detection.matchedPattern,
          source: 'idle-warning',
        });
      } else {
        callbacks?.onPlanEvent?.({
          type: 'idle-warning',
          stepId: step.id,
          silenceSeconds: event.silenceSeconds,
        });
      }
    };

    const idleStalledHandler = async (event: IdleEvent) => {
      // Final attempt at prompt detection
      const detection = detectInteractivePromptDeep(event.lastOutput);

      if (detection.detected) {
        callbacks?.onPlanEvent?.({
          type: 'prompt-detected',
          stepId: step.id,
          promptText: detection.promptText,
          matchedPattern: detection.matchedPattern,
          source: 'idle-stalled',
        });
        return;
      }

      // No prompt found — ask AgentBrain
      callbacks?.onPlanEvent?.({
        type: 'stall-detected',
        stepId: step.id,
        silenceSeconds: event.silenceSeconds,
        agentAction: null,
        agentReasoning: 'Analyzing...',
      });

      try {
        // Build a partial StepResult for the agent
        const partialResult: StepResult = {
          stepId: step.id,
          success: false,
          stdout: this.commandExecutor.getAccumulatedOutput(),
          stderr: '',
          exitCode: -1,
          commandResult: {
            stdout: this.commandExecutor.getAccumulatedOutput(),
            stderr: '',
            exitCode: -1,
            timedOut: false,
            durationMs: 0,
          },
        };

        const correction = await this.agentBrain.analyzeStall(step, partialResult, context);

        callbacks?.onPlanEvent?.({
          type: 'stall-detected',
          stepId: step.id,
          silenceSeconds: event.silenceSeconds,
          agentAction: correction.action as any,
          agentReasoning: correction.reasoning,
        });

        // Act on the agent's decision
        switch (correction.action) {
          case 'abort':
            this.activeHandle?.emitter.abort();
            break;
          case 'skip':
            this.activeHandle?.emitter.abort();
            break;
          case 'retry':
            // For stalls, "retry" means "wait longer" — reset the hard timer
            this.commandExecutor.resetHardStallTimer();
            break;
          case 'modify':
            // Agent suggested sending specific input
            if (correction.modifiedCommand) {
              callbacks?.onPlanEvent?.({
                type: 'prompt-detected',
                stepId: step.id,
                promptText: `Agent suggests: ${correction.modifiedCommand}`,
                matchedPattern: 'agent-suggested',
                source: 'idle-stalled',
              });
            }
            break;
          default:
            // Unknown action — abort to be safe
            this.activeHandle?.emitter.abort();
            break;
        }
      } catch (err) {
        console.error('[StepExecutor] AgentBrain.analyzeStall failed:', err);
        // Agent failed — emit stall event and let user decide
        callbacks?.onPlanEvent?.({
          type: 'stall-detected',
          stepId: step.id,
          silenceSeconds: event.silenceSeconds,
          agentAction: null,
          agentReasoning: `Agent analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    };

    // 5. Attach listeners to CommandExecutor
    this.commandExecutor.on('idle-warning', idleWarningHandler);
    this.commandExecutor.on('idle-stalled', idleStalledHandler);

    // 6. Execute command (uses existing handle from CommandExecutor.execute)
    const handle = this.commandExecutor.execute(step.command);

    if (realtimePromptHandler) {
      handle.emitter.on('stdout', (chunk: string) => realtimePromptHandler(chunk, 'stdout'));
      handle.emitter.on('stderr', (chunk: string) => realtimePromptHandler(chunk, 'stderr'));
    }

    this.activeHandle = handle;

    // 7. Await result
    const result = await handle.promise;

    // 8. Clean up listeners
    this.commandExecutor.removeListener('idle-warning', idleWarningHandler);
    this.commandExecutor.removeListener('idle-stalled', idleStalledHandler);
    this.activeHandle = null;

    // 9. Build StepResult (unchanged)
    return {
      stepId: step.id,
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      commandResult: result,
    };
  }
}

4.7 src/main/services/agent/AgentBrain.ts

Change: Add analyzeStall() method as specified in the prerequisite patch you provided.

typescript

// Add to existing AgentBrain class (alongside existing analyzeFailure):

/**
 * Analyze a stalled command — called when the hard idle timer fires
 * and no interactive prompt pattern was detected.
 *
 * The agent examines the command, its accumulated output, and execution
 * context to determine whether the command is:
 *   - Waiting for unrecognized input → 'modify' with suggested input
 *   - Hanging on a network/disk operation → 'retry' (meaning: wait longer)
 *   - Truly stuck → 'abort'
 *
 * Returns the same AgentCorrection type as analyzeFailure for pipeline compatibility.
 */
async analyzeStall(
  step: PlanStep,
  result: StepResult,
  agentCtx: AgentContext
): Promise<AgentCorrection> {
  if (!aiOrchestrator.isInitialized()) {
    return {
      action: 'abort',
      reasoning: 'AI provider is not initialised — cannot analyse stall automatically.',
    };
  }

  const historyContext = agentCtx.toContextString();
  const output = `${(result.stdout || '').trim()}\n\n${(result.stderr || '').trim()}`
    .trim()
    .slice(-2000);

  const userMessage = [
    'A command appears to have stalled — no output for an extended period.',
    'Analyze the command and its last output to determine the cause.',
    '',
    'Possible causes:',
    '1. The command is waiting for user input (prompt not recognized by regex)',
    '2. The command is performing a slow operation (compilation, download, etc.)',
    '3. The command is truly hung (deadlock, network timeout, etc.)',
    '',
    'If the command is waiting for input, set action to "modify" and put the',
    'suggested input text in "modifiedCommand".',
    'If the command is slow but making progress, set action to "retry" (wait longer).',
    'If the command is hung, set action to "abort".',
    '',
    'Respond with a JSON object matching the AgentCorrection schema.',
    '',
    '## Stalled Step',
    `**Description:** ${step.description}`,
    `**Command:** \`${step.command}\``,
    `**Last output (tail):**`,
    '```',
    output || 'No output captured',
    '```',
    '',
    historyContext,
  ].join('\n');

  try {
    const response = await aiOrchestrator.callRaw(AGENT_BRAIN_SYSTEM_PROMPT, [
      { role: 'user', content: userMessage },
    ]);
    return safeParseCorrection(response.content);
  } catch (err) {
    console.error('[AgentBrain] analyzeStall AI call failed:', err);
    return {
      action: 'abort',
      reasoning: `AI call failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

4.8 src/main/ipc/plan.handler.ts

Change: Build ExecutionConfig with idle timer thresholds from settings. Register IPC handler for PROMPT_INPUT channel. Forward prompt input to the active PTY/stream.

typescript

// UPDATE config building:
const appSettings = settingsStore.getSettings();
const executionConfig: ExecutionConfig = {
  outputMode: appSettings.executionOutputMode,
  commandTimeoutMs: 120_000,
  maxOutputBytes: 2 * 1024 * 1024,
  maxStderrBytes: 512 * 1024,
  idleWarningSeconds: appSettings.idleWarningSeconds,    // NEW
  idleStalledSeconds: appSettings.idleStalledSeconds,    // NEW
};

// ADD: IPC handler for user prompt input
ipcMain.on(IPC_CHANNELS.PLAN.PROMPT_INPUT, (_event, data: { stepId: string; input: string }) => {
  console.log(`[Plan] User prompt input for step ${data.stepId}: ${data.input.includes('password') ? '***' : data.input}`);

  // Write the input to the terminal/stream
  if (executionConfig.outputMode === 'real-terminal') {
    // Real Terminal: write directly to PTY
    sshManager.write(data.input);
  } else {
    // Batch: write to the active SSH exec channel stdin
    // (This requires exposing stdin on the batch strategy — see note below)
    if (activeCommandExecutor) {
      activeCommandExecutor.writeToStdin(data.input);
    }
  }

  // Emit confirmation event to renderer
  mainWindow.webContents.send('plan:event', {
    type: 'stall-input-submitted',
    stepId: data.stepId,
    input: data.input.toLowerCase().includes('password') ? '***' : data.input,
  } satisfies PlanEvent);
});

    Note on Batch mode stdin: The current BatchStrategy uses SSHManager.executeCommand() which does not expose stdin. For Sprint 8, prompt input in batch mode will only work if the command was started with ssh2.exec() directly (which returns a stream with writable stdin). If the user is in batch mode and a prompt is detected, the StallIndicator will show a message: "Switch to Real Terminal mode for interactive prompt support." Full batch stdin support can be added in a future sprint if needed.

4.9 src/preload/index.ts

Change: Add the prompt input API.

typescript

// Add to plan API:
plan: {
  // ... existing methods ...
  submitPromptInput: (stepId: string, input: string) =>
    ipcRenderer.send(IPC_CHANNELS.PLAN.PROMPT_INPUT, { stepId, input }),
}

4.10 src/renderer/hooks/usePlanExecution.ts

Change: Add stall state tracking to the reducer. Handle new PlanEvent types.

typescript

// Add to PlanExecutionState:
interface PlanExecutionState {
  // ... existing fields ...

  /**
   * Stall state per step.
   * Key: stepId. Cleared when step completes.
   */
  stepStallStates: Record<string, StepStallState>;
}

// Import StepStallState from StallIndicator

// Add to reducer:
case 'prompt-detected': {
  const { stepId, promptText } = event;
  return {
    ...state,
    stepStallStates: {
      ...state.stepStallStates,
      [stepId]: {
        status: 'prompt-detected',
        promptText,
      },
    },
  };
}

case 'idle-warning': {
  const { stepId, silenceSeconds } = event;
  // Only set if not already showing a prompt-detected state
  const existing = state.stepStallStates[stepId];
  if (existing?.status === 'prompt-detected') return state;
  return {
    ...state,
    stepStallStates: {
      ...state.stepStallStates,
      [stepId]: {
        status: 'idle-warning',
        silenceSeconds,
      },
    },
  };
}

case 'stall-detected': {
  const { stepId, silenceSeconds, agentAction, agentReasoning } = event;
  return {
    ...state,
    stepStallStates: {
      ...state.stepStallStates,
      [stepId]: {
        status: agentAction === null ? 'agent-analyzing' : 'idle-stalled',
        silenceSeconds,
        agentMessage: agentReasoning,
      },
    },
  };
}

case 'stall-input-submitted': {
  const { stepId } = event;
  // Clear the stall state — input was sent, command should resume
  const { [stepId]: _, ...rest } = state.stepStallStates;
  return {
    ...state,
    stepStallStates: rest,
  };
}

case 'step-completed':
case 'step-failed': {
  const { stepId } = event;
  // Clear stall state for completed/failed steps
  const { [stepId]: _, ...restStall } = state.stepStallStates;
  return {
    ...state,
    // ... existing step-completed/step-failed logic ...
    stepStallStates: restStall,
  };
}

4.11 src/renderer/components/plan/FixerPlanView.tsx

Change: Import and render StallIndicator inside each step card. Wire up the input submission and force stop callbacks.

typescript

import { StallIndicator, StepStallState } from './StallIndicator';

interface StepCardProps {
  step: ExecutionStep;
  result?: StepResult;
  liveOutput?: { stdout: string; stderr: string };
  isExecuting: boolean;
  mergesStderr?: boolean;
  stallState?: StepStallState | null;  // NEW
}

function StepCard({ step, result, liveOutput, isExecuting, mergesStderr, stallState }: StepCardProps) {
  const handleSubmitInput = (input: string) => {
    window.electronAPI.plan.submitPromptInput(step.id, input);
  };

  const handleForceStop = () => {
    // Send Ctrl+C via the plan cancel mechanism
    window.electronAPI.plan.cancel();
  };

  return (
    <div className="step-card">
      {/* ... existing header, command display, output ... */}

      {/* Stall indicator — shown below the output area */}
      {isExecuting && (
        <StallIndicator
          stallState={stallState ?? null}
          onSubmitInput={handleSubmitInput}
          onForceStop={handleForceStop}
        />
      )}

      {/* ... existing stderr warning, mode indicator ... */}
    </div>
  );
}

// In the parent FixerPlanView component, pass stallState to each StepCard:
// stallState={stepStallStates[step.id] ?? null}

4.12 src/renderer/components/modals/SettingsModal.tsx

Change: Add idle timer threshold inputs to the Execution section.

typescript

// Add to the Execution settings section, after the Command Output Mode dropdown:

<div className="setting-row">
  <label htmlFor="idleWarningSeconds">Soft Stall Warning (seconds)</label>
  <input
    id="idleWarningSeconds"
    type="number"
    min={0}
    max={120}
    value={settings.idleWarningSeconds}
    onChange={(e) =>
      updateSettings({
        idleWarningSeconds: Math.max(0, parseInt(e.target.value, 10) || 0),
      })
    }
  />
  <p className="setting-description">
    Show a warning when a command produces no output for this many seconds.
    Set to 0 to disable. Default: 15
  </p>
</div>

<div className="setting-row">
  <label htmlFor="idleStalledSeconds">Hard Stall Threshold (seconds)</label>
  <input
    id="idleStalledSeconds"
    type="number"
    min={0}
    max={300}
    value={settings.idleStalledSeconds}
    onChange={(e) => {
      const value = Math.max(0, parseInt(e.target.value, 10) || 0);
      // Ensure hard threshold > soft threshold (if both enabled)
      if (value > 0 && settings.idleWarningSeconds > 0 && value <= settings.idleWarningSeconds) {
        updateSettings({ idleStalledSeconds: settings.idleWarningSeconds + 5 });
      } else {
        updateSettings({ idleStalledSeconds: value });
      }
    }}
  />
  <p className="setting-description">
    Trigger AI analysis when a command produces no output for this many seconds.
    Must be greater than the soft stall warning. Set to 0 to disable. Default: 45
  </p>
</div>

5. Implementation Order
Step	Files	Description
1	src/shared/types/settings.ts	Add idleWarningSeconds and idleStalledSeconds to AppSettings and DEFAULT_SETTINGS
2	src/shared/types/execution.ts	Add idle fields to ExecutionConfig. Add prompt-detected, idle-warning, stall-detected, stall-input-submitted to PlanEvent union
3	src/shared/constants/ipcChannels.ts	Add PROMPT_INPUT to PLAN group
4	src/main/services/execution/interactivePromptDetector.ts	Create detectInteractivePrompt() and detectInteractivePromptDeep()
5	src/main/services/execution/IdleTimerManager.ts	Create the full class with dual-threshold timers, reset, dispose
6	src/main/services/execution/strategies/ExecutionEmitter.ts	Add idle-warning and idle-stalled event type comments (no behavioral change)
7	src/main/services/execution/CommandExecutor.ts	Add IdleTimerManager creation in execute(), output accumulator, resetHardStallTimer(), getAccumulatedOutput(), forward idle events
8	src/main/services/agent/AgentBrain.ts	Add analyzeStall() method
9	src/main/services/execution/StepExecutor.ts	Add real-time prompt detection on chunks, idle-warning handler, idle-stalled handler with AgentBrain call, onPlanEvent callback
10	src/main/ipc/plan.handler.ts	Build config with idle thresholds, add PROMPT_INPUT IPC handler, wire sshManager.write() for prompt responses
11	src/preload/index.ts	Add submitPromptInput to plan API
12	src/renderer/components/plan/StallIndicator.tsx	Create the component with all four states
13	src/renderer/hooks/usePlanExecution.ts	Add stepStallStates to state, handle all new event types in reducer
14	src/renderer/components/plan/FixerPlanView.tsx	Pass stallState to StepCard, render StallIndicator
15	src/renderer/components/modals/SettingsModal.tsx	Add idle timer threshold inputs with validation
16	Compile check	tsc --noEmit — zero errors
6. Testing Checklist
#	Test	Expected Result
1	Run echo "hello" (fast command)	No stall indicators. Idle timer resets on output and clears on done.
2	Run sleep 20 (produces no output)	After 15s: soft stall warning appears on step card ("No output for 15s"). After 45s: hard stall fires, agent analyzes.
3	Run apt install that prompts [Y/n]	Real-time regex catches it instantly. StallIndicator shows prompt with input field. User types Y, command continues.
4	Run a command with unknown prompt (Enter name:)	Regex misses it. After 15s: idle-warning fires, deep detection re-examines — may catch the colon pattern. If not, after 45s: agent analyzes and suggests input.
5	Set idleWarningSeconds: 0 in settings	Soft stall disabled. No warning at 15s. Hard stall still fires at 45s.
6	Set both thresholds to 0	Both disabled. Only the 120s command timeout remains as backstop.
7	Set idleStalledSeconds: 20, idleWarningSeconds: 15	Warning at 15s, hard stall at 20s. Validation prevents hard < soft.
8	Agent returns retry (wait longer) on hard stall	Hard timer resets. Another 45s must pass before it fires again.
9	Agent returns abort on hard stall	Command receives Ctrl+C (real-terminal) or stream close (batch). Step fails.
10	User submits input via StallIndicator	Input written to PTY. Stall state clears. Command resumes producing output.
11	Command finishes while agent is analyzing stall	done event fires, timers clear, stall state cleared from reducer. No stale UI.
12	Cancel plan while stall indicator is showing	All timers dispose. Stall state clears. Plan stops normally.
13	SSH disconnect during stall	Timer fires, agent call may fail (handled by catch), step resolves via timeout.
14	Batch mode + prompt detected	StallIndicator shows prompt but input submission may not work (batch stdin limitation). Shows hint to switch to Real Terminal.
15	Settings persist across restart	Idle thresholds saved to store, loaded on next launch, used in next plan execution.
7. Files Summary
New Files (3)
File	Lines (est.)	Purpose
src/main/services/execution/IdleTimerManager.ts	~150	Dual-threshold resettable idle timer
src/main/services/execution/interactivePromptDetector.ts	~120	Prompt pattern detection (real-time + deep)
src/renderer/components/plan/StallIndicator.tsx	~110	UI component for stall states and prompt input
Modified Files (11)
File	Change Scope	Description
src/shared/types/settings.ts	Small	Add 2 fields to AppSettings + DEFAULT_SETTINGS
src/shared/types/execution.ts	Medium	Add 2 fields to ExecutionConfig, 4 PlanEvent types
src/shared/constants/ipcChannels.ts	Trivial	Add PROMPT_INPUT channel
src/main/services/execution/strategies/ExecutionEmitter.ts	Trivial	Add event type comments
src/main/services/execution/CommandExecutor.ts	Medium	IdleTimerManager creation, output accumulator, event forwarding
src/main/services/agent/AgentBrain.ts	Small	Add analyzeStall() method
src/main/services/execution/StepExecutor.ts	Large	Real-time detection, idle handlers, agent stall analysis integration
src/main/ipc/plan.handler.ts	Small	Config wiring, PROMPT_INPUT handler
src/preload/index.ts	Trivial	Add submitPromptInput
src/renderer/hooks/usePlanExecution.ts	Medium	stepStallStates, 4 new reducer cases
src/renderer/components/plan/FixerPlanView.tsx	Small	Pass stallState, render StallIndicator
src/renderer/components/modals/SettingsModal.tsx	Small	2 number inputs with validation
8. Edge Cases & Notes
8.1 Timer Precision

setTimeout in Node.js is not perfectly precise — a 15-second timer may fire at 15.001s or 15.050s. This is acceptable. The silenceSeconds value reported in events is calculated from Date.now() differences, not from the timer duration.
8.2 Multiple Stall Events

The soft timer fires once — softFired flag prevents re-firing. Same for the hard timer. If data resumes after the soft stall (timer resets), the soft timer can fire again on the next silence period. This is intentional — each silence window gets one warning.
8.3 Rapid Data Then Silence

If a command produces 10MB of output in 2 seconds then goes silent (e.g., compilation output followed by a linker prompt), the timer starts from the last chunk. The 15-second warning will fire 15 seconds after the last data arrived, not 15 seconds after the command started.
8.4 Password Input Security

StallIndicator renders a type="password" input when the prompt text contains "password" (case-insensitive). The submitted input is masked in the stall-input-submitted PlanEvent (***). The actual password is only sent via sshManager.write() and is never stored in AgentContext, StepResult, or SessionStore.
8.5 Batch Mode Stdin Limitation

The current BatchStrategy wraps SSHManager.executeCommand(), which does not expose the stdin stream of the SSH exec channel. In Sprint 8, if a prompt is detected in batch mode:

    The StallIndicator will render normally
    When the user submits input, plan.handler.ts will attempt to write it
    This will silently fail because there's no stdin to write to
    A small notice in the StallIndicator should say: "Interactive prompts work best in Real Terminal mode"

This is acceptable for Sprint 8. Full batch stdin support (exposing the ssh2 stream's stdin) can be added if needed.
