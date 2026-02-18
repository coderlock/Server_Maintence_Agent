import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/constants';
import { settingsStore } from '../services/storage/SettingsStore';
import { aiOrchestrator } from '../services/ai/AIOrchestrator';
import type { AppSettings } from '@shared/types';

export function registerSettingsHandlers(): void {
  /** Return all persisted settings */
  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET, async () => {
    return settingsStore.getSettings();
  });

  /** Merge partial settings update and persist */
  ipcMain.handle(IPC_CHANNELS.SETTINGS.UPDATE, async (_event, updates: Partial<AppSettings>) => {
    try {
      const updated = await settingsStore.updateSettings(updates);

      // If provider changed, switch the orchestrator's active provider
      if (updates.aiProvider) {
        aiOrchestrator.setProvider(updates.aiProvider);
      }

      // If model changed, apply it to the correct provider
      if (updates.aiModel) {
        const settings = await settingsStore.getSettings();
        const providerName = updates.aiProvider ?? settings.aiProvider ?? 'moonshot';
        if (providerName === 'openai') {
          import('../services/ai/providers/OpenAIProvider').then(({ openaiProvider }) => {
            openaiProvider.setModel(updates.aiModel!);
          });
        } else {
          import('../services/ai/providers/MoonshotProvider').then(({ moonshotProvider }) => {
            moonshotProvider.setModel(updates.aiModel!);
          });
        }
      }

      return { success: true, settings: updated };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  /** Retrieve whether an API key is set (masked, not the raw value) */
  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET_API_KEY, async () => {
    const key = await settingsStore.getApiKey();
    if (!key) return { hasKey: false, maskedKey: null };
    return {
      hasKey: true,
      maskedKey: `${key.slice(0, 6)}${'•'.repeat(Math.max(0, key.length - 10))}${key.slice(-4)}`,
    };
  });

  /** Store a new API key, validate it, and re-initialize the AI orchestrator */
  ipcMain.handle(IPC_CHANNELS.SETTINGS.SET_API_KEY, async (_event, apiKey: string) => {
    try {
      if (!apiKey || apiKey.trim().length < 8) {
        return { success: false, error: 'API key is too short' };
      }

      const trimmed = apiKey.trim();

      // Validate before storing
      const isValid = await aiOrchestrator.validateApiKey(trimmed);
      if (!isValid) {
        return { success: false, error: 'API key is invalid. Please verify the key from your provider dashboard and try again.' };
      }

      await settingsStore.setApiKey(trimmed);
      const settings = await settingsStore.getSettings();
      // Ensure orchestrator is using the correct provider before initializing
      if (settings.aiProvider) {
        aiOrchestrator.setProvider(settings.aiProvider);
      }
      aiOrchestrator.initialize(trimmed, settings.aiModel);

      console.log('[Settings] API key updated and AI re-initialized');
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });

  console.log('[IPC] Settings handlers registered');
}
