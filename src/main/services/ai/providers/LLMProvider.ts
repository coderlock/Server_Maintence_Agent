/**
 * LLMProvider interface — the only AI abstraction the rest of the app touches.
 *
 * Each provider implements this interface and manages its own transport
 * (openai SDK, anthropic SDK, fetch, etc.) internally. Adding a new provider
 * means adding a new class that conforms to this interface — nothing else changes.
 */

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMResponse {
  content: string;
  stopReason: string;
  usage: LLMUsage;
}

export interface LLMStreamHandler {
  onChunk: (chunk: string) => void;
  onComplete: (response: LLMResponse) => void;
  onError: (error: Error) => void;
}

export interface LLMProvider {
  /** One-time initialisation with credentials */
  initialize(apiKey: string): void;

  /** Switch the active model (e.g. moonshot-v1-8k vs moonshot-v1-128k) */
  setModel(model: string): void;

  /** True once initialize() has been called with a non-empty key */
  isInitialized(): boolean;

  /** Non-streaming call — returns the full response when complete */
  sendMessage(
    systemPrompt: string,
    messages: LLMMessage[],
  ): Promise<LLMResponse>;

  /** Streaming call — calls handler callbacks as chunks arrive */
  sendMessageStream(
    systemPrompt: string,
    messages: LLMMessage[],
    handler: LLMStreamHandler,
  ): Promise<void>;

  /** Quick connectivity + auth check — should use minimal tokens */
  validateApiKey(apiKey: string): Promise<boolean>;
}
