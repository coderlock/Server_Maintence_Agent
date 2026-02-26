import crypto from 'crypto';
import { safeStorage } from 'electron';
import type { AppSettings } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';

/** Prefix written before safeStorage-encrypted values. */
const ENC_SAFE_PREFIX = 'enc:safe:';
/** Prefix written before AES-256-GCM fallback-encrypted values. */
const ENC_AES_PREFIX = 'enc:aes:';

interface SettingsStoreSchema {
  settings: AppSettings;
  apiKey: string | null;
}

/**
 * Persists application settings and the API key using electron-store.
 * The API key is encrypted at rest using Electron's safeStorage (OS DPAPI /
 * Keychain) with an AES-256-GCM fallback.  Legacy plaintext values are
 * transparently migrated to encrypted form on first read.
 * Dynamic import is required because electron-store v8+ is ESM-only.
 */
export class SettingsStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private store: any = null;
  private initPromise: Promise<void> | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // ── Encryption helpers ────────────────────────────────────────────────────

  /** Derives a machine-specific 256-bit key for AES fallback encryption. */
  private getFallbackKey(): Buffer {
    const machineId =
      process.env.COMPUTERNAME ||
      process.env.HOSTNAME ||
      process.env.USER ||
      'default-machine-id';
    return crypto.scryptSync(machineId, 'sma-apikey-salt-v1', 32);
  }

  private encryptApiKey(apiKey: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(apiKey);
      return ENC_SAFE_PREFIX + encrypted.toString('base64');
    }
    // Fallback: AES-256-GCM with machine-derived key
    const key = this.getFallbackKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return (
      ENC_AES_PREFIX +
      `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
    );
  }

  private decryptApiKey(stored: string): string | null {
    try {
      if (stored.startsWith(ENC_SAFE_PREFIX)) {
        const buf = Buffer.from(stored.slice(ENC_SAFE_PREFIX.length), 'base64');
        return safeStorage.decryptString(buf);
      }
      if (stored.startsWith(ENC_AES_PREFIX)) {
        const [ivB64, authTagB64, encB64] = stored.slice(ENC_AES_PREFIX.length).split(':');
        if (!ivB64 || !authTagB64 || !encB64) return null;
        const key = this.getFallbackKey();
        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(ivB64, 'base64'),
        );
        decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
        const decrypted = Buffer.concat([
          decipher.update(Buffer.from(encB64, 'base64')),
          decipher.final(),
        ]);
        return decrypted.toString('utf8');
      }
      // Legacy plaintext value — return as-is so the caller can re-encrypt it.
      return stored;
    } catch (error) {
      console.error('Failed to decrypt API key:', error);
      return null;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

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
    const stored = store.get('apiKey', null) as string | null;
    if (!stored) return null;

    const decrypted = this.decryptApiKey(stored);

    // Migrate legacy plaintext value to encrypted form on first read.
    if (
      decrypted &&
      !stored.startsWith(ENC_SAFE_PREFIX) &&
      !stored.startsWith(ENC_AES_PREFIX)
    ) {
      await this.setApiKey(decrypted);
    }

    return decrypted;
  }

  async setApiKey(apiKey: string): Promise<void> {
    const store = await this.getStore();
    store.set('apiKey', this.encryptApiKey(apiKey));
  }

  async clearApiKey(): Promise<void> {
    const store = await this.getStore();
    store.set('apiKey', null);
  }
}

export const settingsStore = new SettingsStore();
