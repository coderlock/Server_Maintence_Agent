/**
 * AppLayout Component
 * Main application layout with MenuBar, SplitPane, and StatusBar
 */

import React, { useEffect } from 'react';
import { MenuBar } from './MenuBar';
import { StatusBar } from './StatusBar';
import { SplitPane } from './SplitPane';
import { TerminalPanel } from '../terminal/TerminalPanel';
import { ChatPanel } from '../chat/ChatPanel';
import { useSettingsStore } from '../../store/settingsStore';

export const AppLayout: React.FC = () => {
  const { loadSettings } = useSettingsStore();

  // Load persisted settings (including defaultMode) once on mount.
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return (
    <div className="h-screen flex flex-col bg-vscode-bg text-vscode-text">
      {/* Menu Bar */}
      <MenuBar />
      
      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <SplitPane
          left={<TerminalPanel />}
          right={<ChatPanel />}
          defaultSplit={50}
          minLeft={300}
          minRight={350}
        />
      </main>
      
      {/* Status Bar */}
      <StatusBar />
    </div>
  );
};
