/**
 * useConnections Hook
 * Manages connection CRUD operations via IPC
 */

import { useCallback } from 'react';
import { useConnectionStore } from '../store/connectionStore';
import type { ConnectionInput, SavedConnection } from '@shared/types';

export function useConnections() {
  const {
    savedConnections,
    loadConnections,
    addConnection,
    updateConnection: updateConnectionInStore,
    removeConnection,
  } = useConnectionStore();
  
  const refreshConnections = useCallback(async () => {
    await loadConnections();
  }, [loadConnections]);
  
  const createConnection = useCallback(async (input: ConnectionInput): Promise<SavedConnection | null> => {
    try {
      const result = await window.electronAPI.connections.create(input);
      if (result.success && result.connection) {
        addConnection(result.connection);
        return result.connection;
      }
      return null;
    } catch (error) {
      console.error('Failed to create connection:', error);
      return null;
    }
  }, [addConnection]);
  
  const updateConnection = useCallback(async (
    id: string,
    updates: Partial<ConnectionInput>
  ): Promise<boolean> => {
    try {
      const result = await window.electronAPI.connections.update(id, updates);
      if (result.success && result.connection) {
        updateConnectionInStore(id, result.connection);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to update connection:', error);
      return false;
    }
  }, [updateConnectionInStore]);
  
  const deleteConnection = useCallback(async (id: string): Promise<boolean> => {
    try {
      const result = await window.electronAPI.connections.delete(id);
      if (result.success) {
        removeConnection(id);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to delete connection:', error);
      return false;
    }
  }, [removeConnection]);
  
  const testConnection = useCallback(async (config: {
    host: string;
    port: number;
    username: string;
    password: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      return await window.electronAPI.connections.test(config);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }, []);
  
  return {
    connections: savedConnections,
    refreshConnections,
    createConnection,
    updateConnection,
    deleteConnection,
    testConnection,
  };
}
