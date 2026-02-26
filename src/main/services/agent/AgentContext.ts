/**
 * AgentContext — rolling memory buffer for the Agentic Loop.
 *
 * Tracks steps executed during a plan run and their results so that
 * AgentBrain has structured context when diagnosing failures.
 *
 * Token management:
 *  - Maintains at most STEP_LIMIT detailed step entries.
 *  - When the buffer reaches SUMMARIZE_TRIGGER, it calls the LLM to condense
 *    the oldest SUMMARIZE_BATCH steps into a single natural-language sentence
 *    and replaces them with that summary, keeping the buffer lean.
 *  - If the LLM call fails, the oldest entries are simply dropped (graceful degradation).
 */

import type { PlanStep } from '@shared/types';
import type { StepResult } from '@shared/types/execution';
import { aiOrchestrator } from '../ai/AIOrchestrator';

// ── Types ──────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  step: PlanStep;
  result: StepResult;
  /** Which attempt this is (0 = first try, 1 = first retry, …) */
  attemptIndex: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Hard limit — never hold more than this many detailed entries */
const STEP_LIMIT = 10;

/** When the buffer hits this size, summarise the oldest SUMMARIZE_BATCH entries */
const SUMMARIZE_TRIGGER = 5;

/** Number of oldest entries to condense per summarization run */
const SUMMARIZE_BATCH = 3;

/** System prompt for the summarizer call (extremely cheap — one sentence out) */
const SUMMARIZER_SYSTEM_PROMPT = `You are a concise summariser for server-maintenance log entries.
Given a list of executed commands and their outcomes, return a single sentence summary
(max 30 words) describing what was accomplished and any notable failures.
Respond with only the sentence — no JSON, no markdown.`;

// ── AgentContext ───────────────────────────────────────────────────────────

export class AgentContext {
  /** Compact natural-language summary of older, condensed steps */
  private summary: string | null = null;

  /** Detailed entries for the most recent steps (max STEP_LIMIT) */
  private history: HistoryEntry[] = [];

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Record a step result into the rolling buffer.
   * Call this after every step execution, whether successful or not.
   */
  addStep(step: PlanStep, result: StepResult, attemptIndex = 0): void {
    this.history.push({ step, result, attemptIndex });
  }

  /**
   * Condense the oldest entries if the buffer is getting large.
   * Should be called by PlanExecutor after each step addition.
   * Returns immediately if summarization is not yet needed.
   */
  async summarizeIfNeeded(): Promise<void> {
    if (this.history.length < SUMMARIZE_TRIGGER) return;

    const toSummarise = this.history.splice(0, SUMMARIZE_BATCH);
    const text = toSummarise.map(e =>
      `• ${e.step.command} → exit ${e.result.exitCode}${e.result.assessment?.succeeded ? ' ✓' : ' ✗'}` +
      (e.result.stderr ? ` (${e.result.stderr.slice(0, 100)})` : ''),
    ).join('\n');

    try {
      const response = await aiOrchestrator.callRaw(SUMMARIZER_SYSTEM_PROMPT, [
        { role: 'user', content: `Summarise these execution steps:\n${text}` },
      ]);
      const sentence = response.content.trim().replace(/^["']|["']$/g, '');
      this.summary = this.summary ? `${this.summary} ${sentence}` : sentence;
    } catch (err) {
      // If summarization fails, discard the oldest entries silently
      console.warn('[AgentContext] Summarization failed — oldest entries dropped:', err);
      if (this.summary) {
        this.summary += ` [${SUMMARIZE_BATCH} older steps dropped]`;
      }
    }

    // Safety valve — never exceed STEP_LIMIT regardless
    if (this.history.length > STEP_LIMIT) {
      this.history = this.history.slice(-STEP_LIMIT);
    }
  }

  /**
   * Build a markdown-formatted context string to pass to AgentBrain's LLM call.
   */
  toContextString(): string {
    const parts: string[] = [];

    if (this.summary) {
      parts.push(`## Earlier History (summarised)\n${this.summary}`);
    }

    if (this.history.length > 0) {
      const lines = this.history.map((e, i) => {
        const status = e.result.assessment?.succeeded ? '✓' : '✗';
        const attempt = e.attemptIndex > 0 ? ` (retry #${e.attemptIndex})` : '';
        const stderr = e.result.stderr ? `\n  stderr: ${e.result.stderr.slice(0, 200)}` : '';
        return `${i + 1}. [${status}]${attempt} \`${e.step.command}\` → exit ${e.result.exitCode}${stderr}`;
      }).join('\n');
      parts.push(`## Recent Step History\n${lines}`);
    }

    return parts.length > 0 ? parts.join('\n\n') : '(no prior steps)';
  }

  /** Latest step entry — convenience accessor for AgentBrain */
  getLastEntry(): HistoryEntry | undefined {
    return this.history[this.history.length - 1];
  }

  /** Total steps recorded (including summarised ones) */
  get totalSteps(): number {
    const summarisedCount = this.summary ? SUMMARIZE_BATCH : 0; // rough estimate
    return summarisedCount + this.history.length;
  }

  /** Number of consecutive failures at the tail of the history */
  get consecutiveFailures(): number {
    let count = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (!this.history[i].result.assessment?.succeeded) count++;
      else break;
    }
    return count;
  }
}
