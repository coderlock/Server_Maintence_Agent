import type { AppSettings } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';

interface SettingsStoreSchema {
  settings: AppSettings;
  apiKey: string | null;
}

/**
 * Persists application settings and the API key using electron-store.
 * Dynamic import is required because electron-store v8+ is ESM-only.
 */
export class SettingsStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private store: any = null;
  private initPromise: Promise<void> | null = null;

  private async getStore(): Promise<any> {
    if (this.store) return this.store;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const mod = await import('electron-store');
        const StoreClass = mod.default;
        this.store = new StoreClass<SettingsStoreSchema>({
          name: 'settings',
          defaults: { settings: DEFAULT_SETTINGS, apiKey: null },
        });
      })();
    }
    await this.initPromise;
    return this.store;
  }

  async getSettings(): Promise<AppSettings> {
    const store = await this.getStore();
    return store.get('settings', DEFAULT_SETTINGS);
  }

  async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    const store = await this.getStore();
    const current = await this.getSettings();
    const merged = { ...current, ...updates };
    store.set('settings', merged);
    return merged;
  }

  async resetSettings(): Promise<AppSettings> {
    const store = await this.getStore();
    store.set('settings', DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }

  async getApiKey(): Promise<string | null> {
    const store = await this.getStore();
    return store.get('apiKey', null) as string | null;
  }

  async setApiKey(apiKey: string): Promise<void> {
    const store = await this.getStore();
    store.set('apiKey', apiKey);
  }

  async clearApiKey(): Promise<void> {
    const store = await this.getStore();
    store.set('apiKey', null);
  }
}

export const settingsStore = new SettingsStore();
