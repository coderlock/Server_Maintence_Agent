import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMMessage, LLMResponse, LLMStreamHandler } from './LLMProvider';

const DEFAULT_MODEL = 'claude-opus-4-5';

/**
 * Models that use extended thinking — temperature must be 1 and
 * thinking tokens must be passed instead of a plain max_tokens value.
 * For now we just disable custom temperature for these.
 */
function isThinkingModel(model: string): boolean {
  return model.includes('thinking');
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic | null = null;
  private model: string = DEFAULT_MODEL;

  initialize(apiKey: string): void {
    const cleanKey = apiKey.trim();
    console.log('[AnthropicProvider] initialize() — key prefix:', cleanKey.slice(0, 14), '| length:', cleanKey.length);
    this.client = new Anthropic({ apiKey: cleanKey });
  }

  setModel(model: string): void {
    console.log(`[AnthropicProvider] setModel(): '${this.model}' → '${model}'`);
    this.model = model;
  }

  isInitialized(): boolean {
    return this.client !== null;
  }

  async sendMessage(
    systemPrompt: string,
    messages: LLMMessage[],
  ): Promise<LLMResponse> {
    if (!this.client) throw new Error('AnthropicProvider not initialized. Set API key in Settings.');

    console.log('[AnthropicProvider] sendMessage() — model:', this.model, '| messages:', messages.length);

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      ...(isThinkingModel(this.model) ? {} : { temperature: 0.6 }),
    };

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({ ...params, stream: false });
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      console.error('[AnthropicProvider] sendMessage() API error:');
      console.error('  status :', e?.status ?? 'N/A');
      console.error('  message:', e?.message ?? String(err));
      throw err;
    }

    console.log('[AnthropicProvider] sendMessage() success — stop_reason:', response.stop_reason,
      '| tokens in/out:', response.usage.input_tokens, '/', response.usage.output_tokens);

    const content = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    return {
      content,
      stopReason: response.stop_reason ?? 'stop',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async sendMessageStream(
    systemPrompt: string,
    messages: LLMMessage[],
    handler: LLMStreamHandler,
  ): Promise<void> {
    if (!this.client) throw new Error('AnthropicProvider not initialized. Set API key in Settings.');

    console.log('[AnthropicProvider] sendMessageStream() — model:', this.model, '| messages:', messages.length);

    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        ...(isThinkingModel(this.model) ? {} : { temperature: 0.6 }),
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          fullContent += event.delta.text;
          handler.onChunk(event.delta.text);
        }
      }

      const finalMessage = await stream.finalMessage();
      inputTokens = finalMessage.usage.input_tokens;
      outputTokens = finalMessage.usage.output_tokens;

      handler.onComplete({
        content: fullContent,
        stopReason: finalMessage.stop_reason ?? 'stop',
        usage: { inputTokens, outputTokens },
      });
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      console.error('[AnthropicProvider] sendMessageStream() API error:');
      console.error('  status :', e?.status ?? 'N/A');
      console.error('  message:', e?.message ?? String(err));
      handler.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    const cleanKey = apiKey.trim();

    // Anthropic keys start with "sk-ant-"
    if (!cleanKey.startsWith('sk-ant-') || cleanKey.length < 32) {
      console.warn('[AnthropicProvider] validateApiKey(): failed format check —',
        `length=${cleanKey.length}, starts-sk-ant-=${cleanKey.startsWith('sk-ant-')}`);
      return false;
    }

    console.log('[AnthropicProvider] validateApiKey(): format OK — testing against Anthropic API...');
    try {
      const testClient = new Anthropic({ apiKey: cleanKey });
      await testClient.messages.create({
        model: 'claude-haiku-3-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      console.log('[AnthropicProvider] validateApiKey(): live check PASSED ✓');
      return true;
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      const status = e?.status ?? 'N/A';
      const msg = e?.message ?? String(err);
      console.error(`[AnthropicProvider] validateApiKey(): live check FAILED — status=${status}, message=${msg}`);
      if (status === 401 || status === 403) return false;
      // Network errors, 529 overload etc — treat key as valid, will fail on real use
      return true;
    }
  }
}

export const anthropicProvider = new AnthropicProvider();
