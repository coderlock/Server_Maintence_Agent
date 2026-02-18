/**
 * AppLayout Component
 * Main application layout with MenuBar, SplitPane, and StatusBar
 */

import React from 'react';
import { MenuBar } from './MenuBar';
import { StatusBar } from './StatusBar';
import { SplitPane } from './SplitPane';
import { TerminalPanel } from '../terminal/TerminalPanel';
import { ChatPanel } from '../chat/ChatPanel';

export const AppLayout: React.FC = () => {
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
