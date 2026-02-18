import OpenAI from 'openai';
import type { LLMProvider, LLMMessage, LLMResponse, LLMStreamHandler } from './LLMProvider';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI | null = null;
  private model: string = DEFAULT_MODEL;

  initialize(apiKey: string): void {
    const cleanKey = apiKey.trim();

    console.log('[OpenAIProvider] initialize() called');
    console.log('[OpenAIProvider]   baseURL   :', OPENAI_BASE_URL);
    console.log('[OpenAIProvider]   model     :', this.model);
    console.log('[OpenAIProvider]   key prefix:', cleanKey.slice(0, 10));
    console.log('[OpenAIProvider]   key suffix:', cleanKey.slice(-4));
    console.log('[OpenAIProvider]   key length:', cleanKey.length);

    this.client = new OpenAI({
      apiKey: cleanKey,
      dangerouslyAllowBrowser: false,
    });

    console.log('[OpenAIProvider] OpenAI client created successfully');
  }

  setModel(model: string): void {
    console.log(`[OpenAIProvider] setModel(): '${this.model}' → '${model}'`);
    this.model = model;
  }

  isInitialized(): boolean {
    return this.client !== null;
  }

  async sendMessage(
    systemPrompt: string,
    messages: LLMMessage[],
  ): Promise<LLMResponse> {
    if (!this.client) throw new Error('OpenAIProvider not initialized. Set API key in Settings.');

    console.log('[OpenAIProvider] sendMessage() — model:', this.model, '| messages:', messages.length);

    const params = {
      model: this.model,
      max_tokens: 4096,
      temperature: 0.6,
      messages: [
        { role: 'system' as const, content: systemPrompt },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ],
      stream: false as const,
    };

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await this.client.chat.completions.create(params) as OpenAI.Chat.Completions.ChatCompletion;
    } catch (err: any) {
      console.error('[OpenAIProvider] sendMessage() API error:');
      console.error('  status :', err?.status ?? err?.statusCode ?? 'N/A');
      console.error('  message:', err?.message ?? String(err));
      console.error('  error  :', JSON.stringify(err?.error ?? err?.body ?? null, null, 2));
      throw err;
    }

    console.log('[OpenAIProvider] sendMessage() success — finish_reason:', response.choices[0]?.finish_reason,
      '| tokens in/out:', response.usage?.prompt_tokens, '/', response.usage?.completion_tokens);

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
    if (!this.client) throw new Error('OpenAIProvider not initialized. Set API key in Settings.');

    console.log('[OpenAIProvider] sendMessageStream() — model:', this.model, '| messages:', messages.length);

    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 4096,
        temperature: 0.6,
        messages: [
          { role: 'system' as const, content: systemPrompt },
          ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ],
        stream: true as const,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          handler.onChunk(delta);
        }
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
      console.error('[OpenAIProvider] sendMessageStream() API error:');
      console.error('  status :', err?.status ?? err?.statusCode ?? 'N/A');
      console.error('  message:', err?.message ?? String(err));
      console.error('  error  :', JSON.stringify(err?.error ?? err?.body ?? null, null, 2));
      handler.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    const cleanKey = apiKey ? apiKey.trim() : '';

    if (!cleanKey.startsWith('sk-') || cleanKey.length < 32) {
      console.warn('[OpenAIProvider] validateApiKey(): failed format check —',
        `length=${cleanKey.length}, starts-sk-=${cleanKey.startsWith('sk-')}`);
      return false;
    }

    console.log('[OpenAIProvider] validateApiKey(): format OK — testing against OpenAI API...');
    try {
      const testClient = new OpenAI({ apiKey: cleanKey, dangerouslyAllowBrowser: false });
      await testClient.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
        stream: false,
      });
      console.log('[OpenAIProvider] validateApiKey(): live check PASSED ✓');
      return true;
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode ?? 'N/A';
      const msg = err?.error?.message ?? err?.message ?? String(err);
      console.error(`[OpenAIProvider] validateApiKey(): live check FAILED — status=${status}, message=${msg}`);
      if (status === 401 || status === 403) return false;
      return true;
    }
  }
}

export const openaiProvider = new OpenAIProvider();
