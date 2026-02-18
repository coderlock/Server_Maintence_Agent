/**
 * Settings Store
 * Manages application settings
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AppSettings } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  
  // Actions
  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  immer((set) => ({
    settings: DEFAULT_SETTINGS,
    isLoading: false,
    
    loadSettings: async () => {
      set({ isLoading: true });
      try {
        const settings = await window.electronAPI.settings.get();
        set({ settings });
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        set({ isLoading: false });
      }
    },
    
    updateSettings: async (updates) => {
      try {
        await window.electronAPI.settings.update(updates);
        set((state) => {
          Object.assign(state.settings, updates);
        });
      } catch (error) {
        console.error('Failed to update settings:', error);
      }
    },
    
    resetSettings: () => {
      set({ settings: DEFAULT_SETTINGS });
    },
  }))
);
