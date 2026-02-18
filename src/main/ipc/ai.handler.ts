import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/constants';
import { aiOrchestrator } from '../services/ai/AIOrchestrator';
import { contextBuilder } from '../services/ai/ContextBuilder';
import { settingsStore } from '../services/storage/SettingsStore';
import { sessionStore } from '../services/storage/SessionStore';
import type { OSInfo, ActiveConnection } from '@shared/types';

export function registerAIHandlers(mainWindow: BrowserWindow): void {
  aiOrchestrator.setMainWindow(mainWindow);

  // Auto-initialize if an API key is already stored
  settingsStore.getApiKey().then(async (storedKey) => {
    if (storedKey) {
      const settings = await settingsStore.getSettings();
      if (settings.aiProvider) {
        aiOrchestrator.setProvider(settings.aiProvider);
      }
      aiOrchestrator.initialize(storedKey, settings.aiModel);
      console.log('[AI] Auto-initialized from stored API key');
    }
  });

  /**
   * Send a message to the AI.
   * The renderer passes the connectionId and mode; the main process assembles
   * the full context (OS info, terminal buffer, session history) here.
   */
  ipcMain.handle(IPC_CHANNELS.AI.SEND_MESSAGE, async (_event, message: string, requestCtx: {
    connectionId: string;
    connection: ActiveConnection;
    osInfo: OSInfo;
    mode: import('@shared/types').ExecutionMode;
  }) => {
    try {
      if (!aiOrchestrator.isInitialized()) {
        return { success: false, error: 'AI not initialized. Please set your API key in Settings.' };
      }

      const sessionHistory = await sessionStore.getMessages(requestCtx.connectionId, 40);

      const { messageId } = await aiOrchestrator.sendMessage(message, {
        connection: requestCtx.connection,
        osInfo: requestCtx.osInfo,
        mode: requestCtx.mode,
        sessionHistory,
      });

      // Persist user message immediately
      await sessionStore.addMessage(requestCtx.connectionId, {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      });

      return { success: true, messageId };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[AI] sendMessage error:', msg);
      return { success: false, error: msg };
    }
  });

  /**
   * Persist the completed assistant message after streaming ends.
   * Called by the renderer once it has the full streamed content.
   */
  ipcMain.handle(IPC_CHANNELS.AI.SAVE_MESSAGE, async (_event, connectionId: string, content: string, tokensUsed?: number) => {
    try {
      await sessionStore.addMessage(connectionId, {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content,
        timestamp: new Date().toISOString(),
        metadata: { tokensUsed },
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  /** Cancel the current in-flight AI request */
  ipcMain.on(IPC_CHANNELS.AI.CANCEL, () => {
    aiOrchestrator.cancel();
  });

  /** Append SSH PTY data to the terminal output buffer used for AI context */
  ipcMain.on('ai:terminal-data', (_event, data: string) => {
    contextBuilder.appendTerminalOutput(data);
  });

  /** Clear the terminal buffer (e.g. when user clears the terminal) */
  ipcMain.on('ai:clear-terminal-buffer', () => {
    contextBuilder.clearTerminalBuffer();
  });

  /** Get current session token count for StatusBar display */
  ipcMain.handle(IPC_CHANNELS.AI.GET_TOKENS, async () => {
    return { tokensUsed: aiOrchestrator.getSessionTokensUsed() };
  });

  console.log('[IPC] AI handlers registered');
}
