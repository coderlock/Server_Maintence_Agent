import { useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useChatStore } from '../store/chatStore';
import { useConnectionStore } from '../store/connectionStore';
import type { ChatMessage } from '@shared/types';

/**
 * useAI — manages the full AI chat lifecycle in the renderer:
 *   - Sends messages to the main process via IPC
 *   - Receives streaming chunks and commits them to chatStore
 *   - Loads/saves session history per connection
 *   - Tracks token usage for the StatusBar
 */
export function useAI() {
  const {
    addMessage,
    setLoading,
    appendStreamingContent,
    commitStreamingMessage,
    clearStreamingContent,
    setPlan,
    streamingContent,
    mode,
  } = useChatStore();

  const { activeConnection } = useConnectionStore();

  // Ref prevents stale closure issues in streaming callbacks
  const connectionIdRef = useRef<string | null>(null);
  useEffect(() => {
    connectionIdRef.current = activeConnection?.connectionId ?? null;
  }, [activeConnection?.connectionId]);

  // ── Session loading ─────────────────────────────────────────────

  const loadSession = useCallback(async (connectionId: string) => {
    try {
      const session = await window.electronAPI.session.get(connectionId);
      if (session?.messages?.length) {
        useChatStore.getState().setMessages(session.messages);
      }
    } catch (err) {
      console.error('[useAI] Failed to load session:', err);
    }
  }, []);

  // ── Send message ────────────────────────────────────────────────

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !activeConnection) return;

    const connectionId = activeConnection.connectionId;
    const osInfo = activeConnection.osInfo;

    if (!osInfo) {
      console.warn('[useAI] No osInfo available — connect to a server first');
      return;
    }

    // Add user message to store immediately for optimistic UI
    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };
    addMessage(userMsg);
    setLoading(true);
    clearStreamingContent();

    try {
      const result = await window.electronAPI.ai.sendMessage(content.trim(), {
        connectionId,
        connection: activeConnection,
        osInfo,
        mode,
      } as any);

      if (!result.success) {
        const errMsg: ChatMessage = {
          id: uuidv4(),
          role: 'assistant',
          content: `⚠️ ${result.error ?? 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        };
        addMessage(errMsg);
        setLoading(false);
      }
      // If success, streaming callbacks below will handle the rest
    } catch (err) {
      const errMsg: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: `⚠️ Failed to contact AI: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toISOString(),
      };
      addMessage(errMsg);
      setLoading(false);
    }
  }, [activeConnection, mode, addMessage, setLoading, clearStreamingContent]);

  const cancelMessage = useCallback(() => {
    window.electronAPI.ai.cancel();
    commitStreamingMessage();
    setLoading(false);
  }, [commitStreamingMessage, setLoading]);

  // ── IPC event listeners ─────────────────────────────────────────

  useEffect(() => {
    const removeChunk = window.electronAPI.ai.onStreamChunk((chunk) => {
      appendStreamingContent(chunk);
    });

    const removeEnd = window.electronAPI.ai.onStreamEnd(async (payload) => {
      commitStreamingMessage();
      setLoading(false);

      // Persist assistant message to session
      const connId = connectionIdRef.current;
      if (connId) {
        await window.electronAPI.ai.saveMessage(
          connId,
          payload.content,
          (payload.usage?.inputTokens ?? 0) + (payload.usage?.outputTokens ?? 0),
        );
      }
    });

    const removeError = window.electronAPI.ai.onError((error) => {
      clearStreamingContent();
      setLoading(false);
      const errMsg: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: `⚠️ AI error: ${error}`,
        timestamp: new Date().toISOString(),
      };
      addMessage(errMsg);
    });

    const removePlanGenerated = window.electronAPI.plan.onGenerated((plan) => {
      setPlan(plan);
    });

    return () => {
      removeChunk();
      removeEnd();
      removeError();
      removePlanGenerated();
    };
  }, [appendStreamingContent, commitStreamingMessage, clearStreamingContent, setLoading, addMessage, setPlan]);

  // ── Load session when connection changes ────────────────────────

  useEffect(() => {
    if (activeConnection?.connectionId) {
      loadSession(activeConnection.connectionId);
    } else {
      useChatStore.getState().clearMessages();
    }
  }, [activeConnection?.connectionId, loadSession]);

  return {
    sendMessage,
    cancelMessage,
    isStreaming: streamingContent.length > 0,
  };
}
