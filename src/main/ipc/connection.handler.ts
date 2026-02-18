/**
 * Connection Management IPC Handlers
 * Handles CRUD operations for saved connections
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/constants';
import { connectionStore } from '../services/storage/ConnectionStore';
import { SSHConnection } from '../services/ssh/SSHConnection';
import type { ConnectionInput, ConnectionConfig } from '@shared/types';

export function registerConnectionHandlers(): void {
  // Get all saved connections
  ipcMain.handle(IPC_CHANNELS.CONNECTION.GET_ALL, async () => {
    console.log('[Connection] Get all connections');
    return await connectionStore.getAll();
  });
  
  // Get connection by ID
  ipcMain.handle(IPC_CHANNELS.CONNECTION.GET_BY_ID, async (_event, id: string) => {
    console.log('[Connection] Get by ID:', id);
    return await connectionStore.getById(id);
  });
  
  // Create new connection
  ipcMain.handle(IPC_CHANNELS.CONNECTION.CREATE, async (_event, input: ConnectionInput) => {
    console.log('[Connection] Create:', input.name);
    try {
      const connection = await connectionStore.create(input);
      return { success: true, connection };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create connection';
      return { success: false, error: message };
    }
  });
  
  // Update connection
  ipcMain.handle(IPC_CHANNELS.CONNECTION.UPDATE, async (_event, id: string, updates: Partial<ConnectionInput>) => {
    console.log('[Connection] Update:', id);
    try {
      const connection = await connectionStore.update(id, updates);
      if (!connection) {
        return { success: false, error: 'Connection not found' };
      }
      return { success: true, connection };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update connection';
      return { success: false, error: message };
    }
  });
  
  // Delete connection
  ipcMain.handle(IPC_CHANNELS.CONNECTION.DELETE, async (_event, id: string) => {
    console.log('[Connection] Delete:', id);
    const success = await connectionStore.delete(id);
    return { success };
  });
  
  // Test connection (doesn't keep connection open)
  ipcMain.handle(IPC_CHANNELS.CONNECTION.TEST, async (_event, config: ConnectionConfig) => {
    console.log('[Connection] Test:', config.host);
    try {
      const testConnection = new SSHConnection({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        readyTimeout: 15000, // Shorter timeout for testing
      });
      
      await testConnection.connect();
      testConnection.disconnect();
      
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed';
      console.error('[Connection] Test failed:', message);
      return { success: false, error: message };
    }
  });
  
  console.log('[IPC] Connection handlers registered');
}

