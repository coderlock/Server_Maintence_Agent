import OpenAI from 'openai';
import type { LLMProvider, LLMMessage, LLMResponse, LLMStreamHandler } from './LLMProvider';

const MOONSHOT_BASE_URL = 'https://api.moonshot.ai/v1';
const DEFAULT_MODEL = 'kimi-k2.5';

/**
 * kimi-k2.5 does not allow temperature, top_p, presence_penalty,
 * frequency_penalty, or n to be set — the API returns an error if included.
 */
function isKimiK25(model: string): boolean {
  return model === 'kimi-k2.5';
}

/**
 * Moonshot (Kimi) provider via the OpenAI-compatible API.
 *
 * Other OpenAI-compatible providers (Groq, Together AI, Ollama, etc.) can
 * follow the exact same pattern — only the baseURL and default model change.
 */
export class MoonshotProvider implements LLMProvider {
  private client: OpenAI | null = null;
  private model: string = DEFAULT_MODEL;

  initialize(apiKey: string): void {
    const cleanKey = apiKey.trim();
    console.log('[MoonshotProvider] initialize() — key prefix:', cleanKey.slice(0, 10), '| length:', cleanKey.length);
    this.client = new OpenAI({
      apiKey: cleanKey,
      baseURL: MOONSHOT_BASE_URL,
    });
  }

  setModel(model: string): void {
    this.model = model;
  }

  isInitialized(): boolean {
    return this.client !== null;
  }

  async sendMessage(
    systemPrompt: string,
    messages: LLMMessage[],
  ): Promise<LLMResponse> {
    if (!this.client) throw new Error('MoonshotProvider not initialized. Set API key in Settings.');

    const baseParams = {
      model: this.model,
      max_completion_tokens: 4096,
      messages: [
        { role: 'system' as const, content: systemPrompt },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ],
      stream: false as const,
    };
    // kimi-k2.5 rejects temperature and other sampling params
    const params = isKimiK25(this.model)
      ? baseParams
      : { ...baseParams, temperature: 0.6 };

    const response = await this.client.chat.completions.create(params);

    const choice = response.choices[0];
    return {
      content: choice.message.content ?? '',
      stopReason: choice.finish_reason ?? 'stop',
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async sendMessageStream(
    systemPrompt: string,
    messages: LLMMessage[],
    handler: LLMStreamHandler,
  ): Promise<void> {
    if (!this.client) throw new Error('MoonshotProvider not initialized. Set API key in Settings.');

    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const baseStreamParams = {
        model: this.model,
        max_completion_tokens: 4096,
        messages: [
          { role: 'system' as const, content: systemPrompt },
          ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ],
        stream: true as const,
        stream_options: { include_usage: true },
      };
      const streamParams = isKimiK25(this.model)
        ? baseStreamParams
        : { ...baseStreamParams, temperature: 0.6 };

      const stream = await this.client.chat.completions.create(streamParams);

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          handler.onChunk(delta);
        }
        // Usage arrives on the final chunk
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? 0;
          outputTokens = chunk.usage.completion_tokens ?? 0;
        }
      }

      handler.onComplete({
        content: fullContent,
        stopReason: 'stop',
        usage: { inputTokens, outputTokens },
      });
    } catch (err: any) {
      console.error('[MoonshotProvider] sendMessageStream() API error:');
      console.error('  status :', err?.status ?? err?.statusCode ?? 'N/A');
      console.error('  message:', err?.message ?? String(err));
      console.error('  error  :', JSON.stringify(err?.error ?? err?.body ?? null, null, 2));
      handler.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    // Format-only validation: Moonshot keys start with "sk-" and are ≥ 32 chars.
    // We intentionally avoid a live network call here — connectivity to
    // api.moonshot.cn can be unreliable (firewall, region, etc.) and would cause
    // valid keys to be rejected. The key will be verified on first real use.
    return typeof apiKey === 'string' && apiKey.startsWith('sk-') && apiKey.length >= 32;
  }
}

export const moonshotProvider = new MoonshotProvider();
