/**
 * Connection Store
 * Manages SSH connections and connection state
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { SavedConnection, ActiveConnection, OSInfo } from '@shared/types';

interface ConnectionState {
  // Saved connections
  savedConnections: SavedConnection[];
  isLoadingConnections: boolean;
  
  // Active connection
  activeConnection: ActiveConnection | null;
  
  // Actions
  loadConnections: () => Promise<void>;
  addConnection: (connection: SavedConnection) => void;
  updateConnection: (id: string, updates: Partial<SavedConnection>) => void;
  removeConnection: (id: string) => void;
  
  setActiveConnection: (connection: ActiveConnection | null) => void;
  updateActiveConnectionStatus: (status: ActiveConnection['status']) => void;
  setOSInfo: (osInfo: OSInfo) => void;
  setConnectionError: (error: string) => void;
}

export const useConnectionStore = create<ConnectionState>()(
  immer((set, _get) => ({
    savedConnections: [],
    isLoadingConnections: false,
    activeConnection: null,
    
    loadConnections: async () => {
      set({ isLoadingConnections: true });
      try {
        const connections = await window.electronAPI.connections.getAll();
        set({ savedConnections: connections });
      } catch (error) {
        console.error('Failed to load connections:', error);
      } finally {
        set({ isLoadingConnections: false });
      }
    },
    
    addConnection: (connection) => {
      set((state) => {
        state.savedConnections.push(connection);
      });
    },
    
    updateConnection: (id, updates) => {
      set((state) => {
        const index = state.savedConnections.findIndex(c => c.id === id);
        if (index !== -1) {
          state.savedConnections[index] = { 
            ...state.savedConnections[index], 
            ...updates 
          };
        }
      });
    },
    
    removeConnection: (id) => {
      set((state) => {
        state.savedConnections = state.savedConnections.filter(c => c.id !== id);
      });
    },
    
    setActiveConnection: (connection) => {
      set({ activeConnection: connection });
    },
    
    updateActiveConnectionStatus: (status) => {
      set((state) => {
        if (state.activeConnection) {
          state.activeConnection.status = status;
        }
      });
    },
    
    setOSInfo: (osInfo) => {
      set((state) => {
        if (state.activeConnection) {
          state.activeConnection.osInfo = osInfo;
        }
      });
    },
    
    setConnectionError: (error) => {
      set((state) => {
        if (state.activeConnection) {
          state.activeConnection.error = error;
          state.activeConnection.status = 'error';
        }
      });
    },
  }))
);
