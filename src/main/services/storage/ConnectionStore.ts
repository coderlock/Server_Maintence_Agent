/**
 * ConnectionStore Service
 * CRUD operations for saved SSH connections
 * Integrates with CredentialVault for password storage
 */

import { credentialVault } from '../security/CredentialVault';
import type { SavedConnection, ConnectionInput } from '@shared/types';
import type Store from 'electron-store';

interface ConnectionStoreSchema {
  connections: SavedConnection[];
}

export class ConnectionStore {
  private store: Store<ConnectionStoreSchema> | null = null;
  private initPromise: Promise<void> | null = null;
  private uuidv4: (() => string) | null = null;
  
  private async init(): Promise<void> {
    if (this.store) return;
    
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const StoreModule = await import('electron-store');
        const StoreClass = StoreModule.default;
        this.store = new StoreClass<ConnectionStoreSchema>({
          name: 'connections',
          defaults: {
            connections: [],
          },
        }) as Store<ConnectionStoreSchema>;
        
        // Also load uuid
        const uuidModule = await import('uuid');
        this.uuidv4 = uuidModule.v4;
      })();
    }
    
    await this.initPromise;
  }
  
  async getAll(): Promise<SavedConnection[]> {
    await this.init();
    if (!this.store) throw new Error('Store not initialized');
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((this.store as any).get('connections', []) as SavedConnection[]);
  }
  
  async getById(id: string): Promise<SavedConnection | null> {
    const connections = await this.getAll();
    return connections.find(c => c.id === id) || null;
  }
  
  async create(input: ConnectionInput): Promise<SavedConnection> {
    await this.init();
    if (!this.store || !this.uuidv4) throw new Error('Store not initialized');
    
    const now = new Date().toISOString();
    
    const connection: SavedConnection = {
      id: this.uuidv4(),
      name: input.name,
      host: input.host,
      port: input.port || 22,
      username: input.username,
      hasPassword: false,
      createdAt: now,
      updatedAt: now,
    };
    
    // Save password if provided and savePassword is true
    if (input.password && input.savePassword !== false) {
      await credentialVault.savePassword(connection.id, input.password);
      connection.hasPassword = true;
    }
    
    const connections = await this.getAll();
    connections.push(connection);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.store as any).set('connections', connections);
    
    return connection;
  }
  
  async update(id: string, input: Partial<ConnectionInput>): Promise<SavedConnection | null> {
    await this.init();
    if (!this.store) throw new Error('Store not initialized');
    
    const connections = await this.getAll();
    const index = connections.findIndex(c => c.id === id);
    
    if (index === -1) {
      return null;
    }
    
    const connection = connections[index];
    
    // Update fields
    if (input.name !== undefined) connection.name = input.name;
    if (input.host !== undefined) connection.host = input.host;
    if (input.port !== undefined) connection.port = input.port;
    if (input.username !== undefined) connection.username = input.username;
    
    // Handle password update
    if (input.password !== undefined) {
      if (input.password && input.savePassword !== false) {
        await credentialVault.savePassword(id, input.password);
        connection.hasPassword = true;
      } else if (input.savePassword === false) {
        await credentialVault.deletePassword(id);
        connection.hasPassword = false;
      }
    }
    
    connection.updatedAt = new Date().toISOString();
    
    connections[index] = connection;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.store as any).set('connections', connections);
    
    return connection;
  }
  
  async delete(id: string): Promise<boolean> {
    await this.init();
    if (!this.store) throw new Error('Store not initialized');
    
    const connections = await this.getAll();
    const index = connections.findIndex(c => c.id === id);
    
    if (index === -1) {
      return false;
    }
    
    // Delete associated password
    await credentialVault.deletePassword(id);
    
    connections.splice(index, 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.store as any).set('connections', connections);
    
    return true;
  }
  
  async updateLastConnected(id: string): Promise<void> {
    await this.init();
    if (!this.store) throw new Error('Store not initialized');
    
    const connections = await this.getAll();
    const index = connections.findIndex(c => c.id === id);
    
    if (index !== -1) {
      connections[index].lastConnectedAt = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.store as any).set('connections', connections);
    }
  }
  
  async getPassword(connectionId: string): Promise<string | null> {
    return credentialVault.getPassword(connectionId);
  }
}

// Lazy singleton instance
let connectionStoreInstance: ConnectionStore | null = null;
export const connectionStore = {
  async getAll(): Promise<SavedConnection[]> {
    if (!connectionStoreInstance) connectionStoreInstance = new ConnectionStore();
    return connectionStoreInstance.getAll();
  },
  async getById(id: string): Promise<SavedConnection | null> {
    if (!connectionStoreInstance) connectionStoreInstance = new ConnectionStore();
    return connectionStoreInstance.getById(id);
  },
  async create(input: ConnectionInput): Promise<SavedConnection> {
    if (!connectionStoreInstance) connectionStoreInstance = new ConnectionStore();
    return connectionStoreInstance.create(input);
  },
  async update(id: string, input: Partial<ConnectionInput>): Promise<SavedConnection | null> {
    if (!connectionStoreInstance) connectionStoreInstance = new ConnectionStore();
    return connectionStoreInstance.update(id, input);
  },
  async delete(id: string): Promise<boolean> {
    if (!connectionStoreInstance) connectionStoreInstance = new ConnectionStore();
    return connectionStoreInstance.delete(id);
  },
  async updateLastConnected(id: string): Promise<void> {
    if (!connectionStoreInstance) connectionStoreInstance = new ConnectionStore();
    return connectionStoreInstance.updateLastConnected(id);
  },
  async getPassword(connectionId: string): Promise<string | null> {
    if (!connectionStoreInstance) connectionStoreInstance = new ConnectionStore();
    return connectionStoreInstance.getPassword(connectionId);
  },
};
