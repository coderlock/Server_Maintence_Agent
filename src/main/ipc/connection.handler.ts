/**
 * Connection Management IPC Handlers
 * Handles CRUD operations for saved connections
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/constants';
import { connectionStore } from '../services/storage/ConnectionStore';
import { SSHConnection } from '../services/ssh/SSHConnection';
import type { ConnectionInput, ConnectionConfig } from '@shared/types';
import {
  validateIpcInput,
  ConnectionInputSchema,
  ConnectionUpdateSchema,
  ConnectionConfigSchema,
  ConnectionIdSchema,
} from './ipcSchemas';
import { sanitizeForLog } from '../utils/sanitize';

export function registerConnectionHandlers(): void {
  // Get all saved connections
  ipcMain.handle(IPC_CHANNELS.CONNECTION.GET_ALL, async () => {
    console.log('[Connection] Get all connections');
    return await connectionStore.getAll();
  });
  
  // Get connection by ID
  ipcMain.handle(IPC_CHANNELS.CONNECTION.GET_BY_ID, async (_event, id: unknown) => {
    try {
      const safeId = validateIpcInput(ConnectionIdSchema, id);
      console.log('[Connection] Get by ID:', safeId);
      return await connectionStore.getById(safeId);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Create new connection
  ipcMain.handle(IPC_CHANNELS.CONNECTION.CREATE, async (_event, input: unknown) => {
    try {
      const safeInput = validateIpcInput(ConnectionInputSchema, input) as ConnectionInput;
      console.log('[Connection] Create:', safeInput.name);
      const connection = await connectionStore.create(safeInput);
      return { success: true, connection };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create connection';
      return { success: false, error: message };
    }
  });

  // Update connection
  ipcMain.handle(IPC_CHANNELS.CONNECTION.UPDATE, async (_event, id: unknown, updates: unknown) => {
    try {
      const safeId = validateIpcInput(ConnectionIdSchema, id);
      const safeUpdates = validateIpcInput(ConnectionUpdateSchema, updates) as Partial<ConnectionInput>;
      console.log('[Connection] Update:', safeId);
      const connection = await connectionStore.update(safeId, safeUpdates);
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
  ipcMain.handle(IPC_CHANNELS.CONNECTION.DELETE, async (_event, id: unknown) => {
    try {
      const safeId = validateIpcInput(ConnectionIdSchema, id);
      console.log('[Connection] Delete:', safeId);
      const success = await connectionStore.delete(safeId);
      return { success };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Test connection (doesn't keep connection open)
  ipcMain.handle(IPC_CHANNELS.CONNECTION.TEST, async (_event, config: unknown) => {
    try {
      const safeConfig = validateIpcInput(ConnectionConfigSchema, config) as ConnectionConfig;
      console.log('[Connection] Test:', sanitizeForLog(safeConfig));
      const testConnection = new SSHConnection({
        host: safeConfig.host,
        port: safeConfig.port,
        username: safeConfig.username,
        password: safeConfig.password,
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

