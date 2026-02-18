/**
 * MenuBar Component
 * Top menu bar with connection controls and mode selector
 */

import React, { useState } from 'react';
import { 
  Plus, 
  Zap, 
  Settings,
  Wrench,
  GraduationCap,
  ChevronDown,
  List,
  LogOut
} from 'lucide-react';
import { Button } from '../ui';
import { useChatStore, useConnectionStore } from '@renderer/store';
import { useSSH } from '@renderer/hooks/useSSH';
import { ConnectionManager, ConnectionForm } from '../connections';
import { SettingsModal } from '../modals/SettingsModal';
import type { SavedConnection } from '@shared/types';

export const MenuBar: React.FC = () => {
  const { mode, setMode } = useChatStore();
  const { activeConnection } = useConnectionStore();
  const { disconnect } = useSSH();
  
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showConnectionManager, setShowConnectionManager] = useState(false);
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null);
  
  const handleNewConnection = () => {
    setEditingConnection(null);
    setShowConnectionForm(true);
    setShowConnectionManager(false);
  };
  
  const handleEditConnection = (connection: SavedConnection) => {
    setEditingConnection(connection);
    setShowConnectionForm(true);
    setShowConnectionManager(false);
  };
  
  const handleConnectionSaved = () => {
    setShowConnectionForm(false);
    setShowConnectionManager(true);
  };
  
  const handleDisconnect = async () => {
    await disconnect();
  };
  
  const isConnected = activeConnection?.status === 'connected';
  
  return (
    <>
      <header className="h-12 bg-[#323233] border-b border-vscode-border flex items-center px-4 gap-2">
        {/* Connection Management */}
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8"
            onClick={() => setShowConnectionManager(true)}
          >
            <List className="h-4 w-4 mr-1" />
            Connections
          </Button>
          
          {!isConnected ? (
            <>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8"
                onClick={handleNewConnection}
              >
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                className="h-8"
                onClick={() => setShowConnectionManager(true)}
              >
                <Zap className="h-4 w-4 mr-1" />
                Connect
              </Button>
            </>
          ) : (
            <Button 
              variant="danger" 
              size="sm" 
              className="h-8"
              onClick={handleDisconnect}
            >
              <LogOut className="h-4 w-4 mr-1" />
              Disconnect
            </Button>
          )}
        </div>
        
        {/* Connection Status */}
        {activeConnection && (
          <>
            <div className="h-6 w-px bg-vscode-border mx-2" />
            <div className="text-sm text-vscode-text flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-yellow-500'
              }`} />
              <span className="text-white font-medium">{activeConnection.name}</span>
              <span className="text-vscode-text-secondary">
                {activeConnection.username}@{activeConnection.host}
              </span>
            </div>
          </>
        )}
        
        {/* Separator */}
        <div className="h-6 w-px bg-vscode-border mx-2" />
        
        {/* Mode Selector */}
        <div className="relative">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8"
            onClick={() => setShowModeMenu(!showModeMenu)}
            disabled={!isConnected}
          >
            {mode === 'fixer' ? (
              <>
                <Wrench className="h-4 w-4 mr-1" />
                Fixer Mode
              </>
            ) : (
              <>
                <GraduationCap className="h-4 w-4 mr-1" />
                Teacher Mode
              </>
            )}
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
          
          {showModeMenu && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowModeMenu(false)}
              />
              <div className="absolute top-full left-0 mt-1 w-56 bg-[#252526] border border-vscode-border rounded shadow-lg z-20">
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[#2a2d2e] flex items-center"
                  onClick={() => {
                    setMode('fixer');
                    setShowModeMenu(false);
                  }}
                >
                  <Wrench className="h-4 w-4 mr-2" />
                  <span className="flex-1">Fixer Mode</span>
                  <span className="text-xs text-vscode-text-secondary">Auto-execute</span>
                </button>
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[#2a2d2e] flex items-center"
                  onClick={() => {
                    setMode('teacher');
                    setShowModeMenu(false);
                  }}
                >
                  <GraduationCap className="h-4 w-4 mr-2" />
                  <span className="flex-1">Teacher Mode</span>
                  <span className="text-xs text-vscode-text-secondary">Step-by-step</span>
                </button>
              </div>
            </>
          )}
        </div>
        
        {/* Spacer */}
        <div className="flex-1" />
        
        {/* Settings */}
        <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowSettings(true)} title="Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </header>
      
      {/* Connection Modals */}
      <ConnectionManager
        isOpen={showConnectionManager}
        onClose={() => setShowConnectionManager(false)}
        onNew={handleNewConnection}
        onEdit={handleEditConnection}
      />
      
      <ConnectionForm
        isOpen={showConnectionForm}
        onClose={() => setShowConnectionForm(false)}
        editingConnection={editingConnection}
        onSaved={handleConnectionSaved}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </>
  );
};
