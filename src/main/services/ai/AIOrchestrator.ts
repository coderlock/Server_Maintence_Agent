import { BrowserWindow } from 'electron';
/** Tiny crypto-random UUID — avoids ESM-only uuid package in main process */
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
import { IPC_CHANNELS } from '@shared/constants/ipcChannels';
import { moonshotProvider } from './providers/MoonshotProvider';
import { openaiProvider } from './providers/OpenAIProvider';
import { contextBuilder } from './ContextBuilder';
import { storePlan } from '../../ipc/plan.handler';
import { AIContext } from './AIContext';
import { BASE_SYSTEM_PROMPT, STEP_EVALUATION_PROMPT } from './prompts/systemPrompt';
import type { ChatMessage, ExecutionPlan, OSInfo, ActiveConnection } from '@shared/types';
import type { CommandResult, StepAssessment } from '@shared/types/execution';
import type { LLMMessage, LLMProvider, LLMResponse, LLMStreamHandler } from './providers/LLMProvider';

import type { ExecutionMode } from '@shared/types';

interface ChatInput {
  connection: ActiveConnection;
  osInfo: OSInfo;
  mode: ExecutionMode;
  sessionHistory: ChatMessage[];
}

export class AIOrchestrator {
  private mainWindow: BrowserWindow | null = null;
  private provider: LLMProvider = moonshotProvider;
  private isProcessing = false;

  /** Running token total for the current session — displayed in the StatusBar */
  private sessionTokensUsed = 0;

  // ── Lifecycle ─────────────────────────────────────────────────────

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  initialize(apiKey: string, model?: string): void {
    this.provider.initialize(apiKey);
    if (model) this.provider.setModel(model);
  }

  isInitialized(): boolean {
    return this.provider.isInitialized();
  }

  /**
   * Switch between named providers at runtime (e.g. when settings change).
   * The selected provider must still be initialized with an API key separately.
   */
  setProvider(name: string): void {
    if (name === 'openai') {
      this.provider = openaiProvider;
    } else {
      this.provider = moonshotProvider;
    }
  }

  getSessionTokensUsed(): number {
    return this.sessionTokensUsed;
  }

  resetSessionTokens(): void {
    this.sessionTokensUsed = 0;
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    return this.provider.validateApiKey(apiKey);
  }

  // ── Generic call — used by plan executor and future agent loop ────

  /**
   * Direct AI call with a pre-built AIContext.
   * The plan executor and agent loop use this to avoid going through the chat flow.
   */
  async call(aiContext: AIContext, messages: LLMMessage[]): Promise<LLMResponse> {
    if (!this.provider.isInitialized()) {
      throw new Error('AI not initialized. Please set your API key in Settings.');
    }
    const systemPrompt = aiContext.toSystemPrompt(BASE_SYSTEM_PROMPT);
    const response = await this.provider.sendMessage(systemPrompt, messages);
    this.sessionTokensUsed += response.usage.inputTokens + response.usage.outputTokens;
    return response;
  }

  /**
   * Direct AI call with a fully custom system prompt — bypasses AIContext.
   * Used by AgentBrain and AgentContext summarizer which have their own prompts.
   */
  async callRaw(systemPrompt: string, messages: LLMMessage[]): Promise<LLMResponse> {
    if (!this.provider.isInitialized()) {
      throw new Error('AI not initialized. Please set your API key in Settings.');
    }
    const response = await this.provider.sendMessage(systemPrompt, messages);
    this.sessionTokensUsed += response.usage.inputTokens + response.usage.outputTokens;
    return response;
  }

  /**
   * Evaluate the result of a plan step.
   * Called by the plan executor after each command (Sprint 5).
   * The agent loop will also call this to decide whether to replan.
   */
  async evaluateStepResult(
    commandResult: CommandResult,
    expectedOutcome: string,
  ): Promise<StepAssessment> {
    if (!this.provider.isInitialized()) {
      // Fallback: heuristic assessment based on exit code
      return {
        succeeded: commandResult.exitCode === 0,
        confidence: 'low',
        reason: 'AI not initialized — assessed by exit code only',
        suggestedAction: commandResult.exitCode === 0 ? 'continue' : 'ask-user',
      };
    }

    const messages: LLMMessage[] = [
      {
        role: 'user',
        content: [
          `Command executed: \`${commandResult.command}\``,
          `Expected outcome: ${expectedOutcome}`,
          `Exit code: ${commandResult.exitCode}`,
          commandResult.stdout ? `stdout:\n\`\`\`\n${commandResult.stdout.slice(0, 2000)}\n\`\`\`` : '',
          commandResult.stderr ? `stderr:\n\`\`\`\n${commandResult.stderr.slice(0, 1000)}\n\`\`\`` : '',
          commandResult.timedOut ? '⚠️ Command timed out' : '',
        ].filter(Boolean).join('\n'),
      },
    ];

    try {
      const response = await this.provider.sendMessage(STEP_EVALUATION_PROMPT, messages);
      this.sessionTokensUsed += response.usage.inputTokens + response.usage.outputTokens;

      // Try to parse JSON directly or inside a code block
      const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ??
                        [null, response.content];
      return JSON.parse(jsonMatch[1]!) as StepAssessment;
    } catch {
      return {
        succeeded: commandResult.exitCode === 0,
        confidence: 'low',
        reason: 'Failed to parse AI assessment — falling back to exit code',
        suggestedAction: commandResult.exitCode === 0 ? 'continue' : 'ask-user',
      };
    }
  }

  // ── Chat streaming — used by the chat UI ──────────────────────────

  /**
   * Sends a user message, streams the response to the renderer window,
   * and emits plan:generated if the response contains a plan JSON block.
   */
  async sendMessage(
    userMessage: string,
    input: ChatInput,
  ): Promise<{ messageId: string }> {
    if (this.isProcessing) {
      throw new Error('Already processing a message. Please wait.');
    }
    if (!this.provider.isInitialized()) {
      throw new Error('AI not initialized. Please set your API key in Settings.');
    }

    this.isProcessing = true;
    const messageId = uuidv4();

    try {
      const aiContext = contextBuilder.buildChatContext({
        connection: input.connection,
        osInfo: input.osInfo,
        mode: input.mode,
        sessionHistory: input.sessionHistory,
      });

      const systemPrompt = aiContext.toSystemPrompt(BASE_SYSTEM_PROMPT);

      // Build the messages array — history (excluding system msgs) + new user message
      const messages: LLMMessage[] = [
        ...input.sessionHistory
          .filter(m => m.role !== 'system')
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: userMessage },
      ];

      const handler: LLMStreamHandler = {
        onChunk: (chunk) => {
          this.sendToRenderer(IPC_CHANNELS.AI.STREAM_CHUNK, chunk);
        },
        onComplete: (response) => {
          this.isProcessing = false;
          this.sessionTokensUsed += response.usage.inputTokens + response.usage.outputTokens;

          const plan = this.extractPlan(response.content, input.mode);
          if (plan) {
            // Register the plan on the main side for execution before sending to renderer
            storePlan(plan);
            this.sendToRenderer(IPC_CHANNELS.PLAN.GENERATED, plan);
          }

          this.sendToRenderer(IPC_CHANNELS.AI.STREAM_END, {
            messageId,
            content: response.content,
            hasPlan: !!plan,
            usage: response.usage,
          });
        },
        onError: (error) => {
          this.isProcessing = false;
          this.sendToRenderer(IPC_CHANNELS.AI.ERROR, error.message);
        },
      };

      await this.provider.sendMessageStream(systemPrompt, messages, handler);
      return { messageId };
    } catch (error) {
      this.isProcessing = false;
      throw error;
    }
  }

  cancel(): void {
    this.isProcessing = false;
    // Note: openai SDK streams don't have a built-in abort on the iterator level
    // without an AbortController. This resets the flag so the next message can proceed.
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private extractPlan(content: string, mode?: ExecutionMode): ExecutionPlan | null {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.type !== 'plan' || !Array.isArray(parsed.steps)) return null;

      const plan: ExecutionPlan = {
        id: uuidv4(),
        goal: parsed.goal ?? 'Unnamed plan',
        successCriteria: parsed.successCriteria ?? [],
        mode: mode ?? 'planner',
        steps: parsed.steps.map((step: any, index: number) => ({
          id: uuidv4(),
          index,
          description: step.description ?? '',
          command: step.command ?? '',
          riskAssessment: {
            level: step.riskLevel ?? 'caution',
            category: 'general',
            reason: step.explanation ?? '',
            requiresApproval: step.riskLevel === 'dangerous',
          },
          status: 'pending' as const,
          explanation: step.explanation,
          expectedOutput: step.expectedOutput,
          verificationCommand: step.verificationCommand,
        })),
        status: 'pending',
        currentStepIndex: 0,
        createdAt: new Date().toISOString(),
        rollbackPlan: parsed.rollbackPlan,
      };

      return plan;
    } catch (err) {
      console.error('[AIOrchestrator] Failed to extract plan:', err);
      return null;
    }
  }

  private sendToRenderer(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();
