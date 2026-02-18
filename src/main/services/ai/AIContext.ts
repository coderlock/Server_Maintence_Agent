import type { OSInfo, ActiveConnection, ChatMessage } from '@shared/types';
import type { CommandResult, StepResult } from '@shared/types/execution';

/**
 * A composable context object that is explicitly assembled per AI call.
 *
 * Deliberately NOT a stateful service. Each AI invocation creates or receives
 * a fresh AIContext. This design lets:
 *   - Chat build context from conversation history
 *   - The plan executor (Sprint 5) build context from step results
 *   - The future agent loop build context from goal state + failure history
 *
 * Callers chain addXxx() calls then call toSystemPrompt() to get the final string.
 */

interface ContextBlock {
  priority: number;       // Lower = higher priority; lower-priority blocks are dropped first
  tokenEstimate: number;  // Rough estimate (chars / 4)
  content: string;
  label: string;
}

export class AIContext {
  private blocks: ContextBlock[] = [];
  private readonly maxTokenBudget = 80_000; // Leave room for model response

  // ── Connection & System Info ──────────────────────────────────────

  addSystemInfo(connection: ActiveConnection, osInfo: OSInfo): this {
    const lines = [
      `## Connected System`,
      `- **Host:** ${connection.host} (${connection.name})`,
      `- **User:** ${connection.username}`,
      `- **OS:** ${osInfo.type}${osInfo.distribution ? ` / ${osInfo.distribution}` : ''}${osInfo.version ? ` ${osInfo.version}` : ''}`,
    ];
    if (osInfo.architecture) lines.push(`- **Arch:** ${osInfo.architecture}`);
    if (osInfo.kernel) lines.push(`- **Kernel:** ${osInfo.kernel}`);
    if (osInfo.hostname) lines.push(`- **Hostname:** ${osInfo.hostname}`);
    if (osInfo.shell) lines.push(`- **Shell:** ${osInfo.shell.type}${osInfo.shell.version ? ` (${osInfo.shell.version})` : ''}`);

    this.blocks.push({
      priority: 0,
      label: 'system-info',
      tokenEstimate: 200,
      content: lines.join('\n'),
    });
    return this;
  }

  // ── Mode ────────────────────────────────────────────────────────

  addMode(mode: 'fixer' | 'teacher'): this {
    const desc = mode === 'fixer'
      ? '**Mode: Fixer** — Commands will be executed automatically with appropriate safety checks. Be concise and actionable.'
      : '**Mode: Teacher** — Show commands with detailed explanations. Do NOT auto-execute; the user will copy commands manually.';

    this.blocks.push({
      priority: 0,
      label: 'mode',
      tokenEstimate: 40,
      content: `## Operating Mode\n${desc}`,
    });
    return this;
  }

  // ── Chat History ─────────────────────────────────────────────────

  addChatHistory(messages: ChatMessage[], maxMessages = 20): this {
    const recent = messages.slice(-maxMessages);
    if (recent.length === 0) return this;

    const content = recent
      .map(msg => `**${msg.role.toUpperCase()}:** ${msg.content.slice(0, 500)}${msg.content.length > 500 ? '…' : ''}`)
      .join('\n\n');

    this.blocks.push({
      priority: 2,
      label: 'chat-history',
      tokenEstimate: content.length / 4,
      content: `## Recent Conversation\n${content}`,
    });
    return this;
  }

  // ── Terminal Output ───────────────────────────────────────────────

  addTerminalOutput(output: string, maxLines = 50): this {
    if (!output.trim()) return this;
    const lines = output.split('\n').slice(-maxLines).join('\n');

    this.blocks.push({
      priority: 3,
      label: 'terminal-output',
      tokenEstimate: lines.length / 4,
      content: `## Recent Terminal Output\n\`\`\`\n${lines}\n\`\`\``,
    });
    return this;
  }

  // ── Current Task / Plan State ─────────────────────────────────────

  addCurrentTask(goal: string, steps: Array<{ description: string; command: string }>, currentStepIndex: number): this {
    const stepsDisplay = steps.map((step, i) => {
      const icon = i < currentStepIndex ? '✅' : i === currentStepIndex ? '🔄' : '⬜';
      return `${icon} Step ${i + 1}: ${step.description} — \`${step.command}\``;
    }).join('\n');

    this.blocks.push({
      priority: 1,
      label: 'current-task',
      tokenEstimate: stepsDisplay.length / 4,
      content: `## Current Task\n**Goal:** ${goal}\n\n**Plan:**\n${stepsDisplay}`,
    });
    return this;
  }

  // ── Last Command Result ───────────────────────────────────────────

  addCommandResult(result: CommandResult): this {
    const parts = [
      `## Last Command Result`,
      `**Command:** \`${result.command}\``,
      `**Exit Code:** ${result.exitCode}`,
      `**Duration:** ${result.duration}ms`,
    ];
    if (result.stdout) parts.push(`**stdout:**\n\`\`\`\n${result.stdout.slice(0, 2000)}\n\`\`\``);
    if (result.stderr) parts.push(`**stderr:**\n\`\`\`\n${result.stderr.slice(0, 1000)}\n\`\`\``);
    if (result.timedOut) parts.push('**⚠️ Command timed out**');

    this.blocks.push({
      priority: 1,
      label: 'last-command-result',
      tokenEstimate: (result.stdout.length + result.stderr.length) / 4,
      content: parts.join('\n'),
    });
    return this;
  }

  // ── Failure History ───────────────────────────────────────────────

  addFailureHistory(failures: StepResult[]): this {
    if (failures.length === 0) return this;

    const content = failures.map((f, i) =>
      `**Attempt ${i + 1}:** \`${f.command}\` → Exit ${f.exitCode}\n${f.stderr || 'No error output'}`
    ).join('\n\n');

    this.blocks.push({
      priority: 1,
      label: 'failure-history',
      tokenEstimate: content.length / 4,
      content: `## Previous Failed Attempts\n${content}`,
    });
    return this;
  }

  // ── Agent State (stub — used by future agent loop) ────────────────

  addAgentState(state: {
    iteration: number;
    maxIterations: number;
    consecutiveFailures: number;
    goal: string;
    assessment: string;
  }): this {
    this.blocks.push({
      priority: 0,
      label: 'agent-state',
      tokenEstimate: 80,
      content: [
        `## Agent State`,
        `- **Goal:** ${state.goal}`,
        `- **Iteration:** ${state.iteration} / ${state.maxIterations}`,
        `- **Consecutive Failures:** ${state.consecutiveFailures}`,
        `- **Assessment:** ${state.assessment}`,
      ].join('\n'),
    });
    return this;
  }

  // ── Assembly ─────────────────────────────────────────────────────

  /**
   * Assembles all blocks into a full system prompt.
   * Blocks are sorted by priority and truncated if the token budget would be exceeded.
   */
  toSystemPrompt(basePrompt: string): string {
    const sorted = [...this.blocks].sort((a, b) => a.priority - b.priority);
    let totalTokens = basePrompt.length / 4;
    const sections: string[] = [basePrompt];

    for (const block of sorted) {
      if (totalTokens + block.tokenEstimate > this.maxTokenBudget) {
        console.warn(`[AIContext] Dropping block "${block.label}" — token budget (${this.maxTokenBudget}) would be exceeded`);
        continue;
      }
      sections.push(block.content);
      totalTokens += block.tokenEstimate;
    }

    return sections.join('\n\n---\n\n');
  }

  /** Estimated total tokens for this assembled context */
  estimateTokens(): number {
    return this.blocks.reduce((sum, b) => sum + b.tokenEstimate, 0);
  }
}
