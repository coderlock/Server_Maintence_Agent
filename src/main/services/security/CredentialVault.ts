/**
 * CredentialVault Service
 * Secure password storage using Electron's safeStorage API (OS keychain)
 * Falls back to AES-256-GCM encryption if safeStorage is unavailable
 */

import crypto from 'crypto';
import { safeStorage } from 'electron';
import type Store from 'electron-store';

interface CredentialStore {
  passwords: Record<string, string>;
}

export class CredentialVault {
  private store: Store<CredentialStore> | null = null;
  private initPromise: Promise<void> | null = null;
  
  private async init(): Promise<void> {
    if (this.store) return;
    
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const StoreModule = await import('electron-store');
        const StoreClass = StoreModule.default;
        this.store = new StoreClass<CredentialStore>({
          name: 'credentials',
          defaults: {
            passwords: {},
          },
          encryptionKey: 'sma-secure-storage-key',
        }) as Store<CredentialStore>;
      })();
    }
    
    await this.initPromise;
  }
  
  async savePassword(connectionId: string, password: string): Promise<void> {
    await this.init();
    if (!this.store) throw new Error('Store not initialized');
    
    // Use Electron's safeStorage if available (uses OS keychain)
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(password);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const passwords = ((this.store as any).get('passwords', {}) as Record<string, string>);
      passwords[connectionId] = encrypted.toString('base64');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.store as any).set('passwords', passwords);
    } else {
      // Fallback: use our own encryption
      const encrypted = this.encryptPassword(password);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const passwords = ((this.store as any).get('passwords', {}) as Record<string, string>);
      passwords[connectionId] = encrypted;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.store as any).set('passwords', passwords);
    }
  }
  
  async getPassword(connectionId: string): Promise<string | null> {
    await this.init();
    if (!this.store) throw new Error('Store not initialized');
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const passwords = ((this.store as any).get('passwords', {}) as Record<string, string>);
    const encrypted = passwords[connectionId];
    
    if (!encrypted) {
      return null;
    }
    
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(encrypted, 'base64');
        return safeStorage.decryptString(buffer);
      } catch (error) {
        console.error('Failed to decrypt password:', error);
        return null;
      }
    } else {
      return this.decryptPassword(encrypted);
    }
  }
  
  async deletePassword(connectionId: string): Promise<void> {
    await this.init();
    if (!this.store) throw new Error('Store not initialized');
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const passwords = ((this.store as any).get('passwords', {}) as Record<string, string>);
    delete passwords[connectionId];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.store as any).set('passwords', passwords);
  }
  
  async hasPassword(connectionId: string): Promise<boolean> {
    await this.init();
    if (!this.store) throw new Error('Store not initialized');
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const passwords = ((this.store as any).get('passwords', {}) as Record<string, string>);
    return connectionId in passwords;
  }
  
  // Fallback encryption using machine-specific key
  private getEncryptionKey(): Buffer {
    // Derive key from machine-specific data
    const machineId = process.env.COMPUTERNAME || 
                      process.env.HOSTNAME || 
                      process.env.USER ||
                      'default-machine-id';
    return crypto.scryptSync(machineId, 'sma-salt-v1', 32);
  }
  
  private encryptPassword(password: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(password, 'utf8'),
      cipher.final(),
    ]);
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encrypted (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }
  
  private decryptPassword(encryptedData: string): string | null {
    try {
      const [ivB64, authTagB64, encryptedB64] = encryptedData.split(':');
      
      if (!ivB64 || !authTagB64 || !encryptedB64) {
        return null;
      }
      
      const key = this.getEncryptionKey();
      const iv = Buffer.from(ivB64, 'base64');
      const authTag = Buffer.from(authTagB64, 'base64');
      const encrypted = Buffer.from(encryptedB64, 'base64');
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Failed to decrypt password:', error);
      return null;
    }
  }
}

// Lazy singleton instance
let credentialVaultInstance: CredentialVault | null = null;
export const credentialVault = {
  async savePassword(connectionId: string, password: string): Promise<void> {
    if (!credentialVaultInstance) credentialVaultInstance = new CredentialVault();
    return credentialVaultInstance.savePassword(connectionId, password);
  },
  async getPassword(connectionId: string): Promise<string | null> {
    if (!credentialVaultInstance) credentialVaultInstance = new CredentialVault();
    return credentialVaultInstance.getPassword(connectionId);
  },
  async deletePassword(connectionId: string): Promise<void> {
    if (!credentialVaultInstance) credentialVaultInstance = new CredentialVault();
    return credentialVaultInstance.deletePassword(connectionId);
  },
  async hasPassword(connectionId: string): Promise<boolean> {
    if (!credentialVaultInstance) credentialVaultInstance = new CredentialVault();
    return credentialVaultInstance.hasPassword(connectionId);
  },
};
