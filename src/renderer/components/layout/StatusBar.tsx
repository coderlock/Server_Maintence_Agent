/**
 * StatusBar Component
 * Bottom status bar showing connection status and info
 */

import React from 'react';
import { Circle, Clock, Cpu } from 'lucide-react';
import { useConnectionStore, useChatStore } from '@renderer/store';

export const StatusBar: React.FC = () => {
  const { activeConnection } = useConnectionStore();
  const { mode } = useChatStore();
  const [sessionTime, setSessionTime] = React.useState('00:00:00');
  const [tokensUsed, setTokensUsed] = React.useState(0);
  
  React.useEffect(() => {
    if (!activeConnection?.connectedAt) return;
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - new Date(activeConnection.connectedAt!).getTime();
      const hours = Math.floor(elapsed / 3600000);
      const minutes = Math.floor((elapsed % 3600000) / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      setSessionTime(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    }, 1000);
    
    return () => clearInterval(interval);
  }, [activeConnection?.connectedAt]);

  // Update token count on each stream end
  React.useEffect(() => {
    const unsub = window.electronAPI.ai.onStreamEnd((_payload) => {
      window.electronAPI.ai.getTokensUsed().then(setTokensUsed).catch(() => {});
    });
    return () => { unsub(); };
  }, []);
  
  const getStatusColor = () => {
    if (!activeConnection) return 'text-gray-500';
    switch (activeConnection.status) {
      case 'connected': return 'text-green-500';
      case 'connecting': return 'text-yellow-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };
  
  const getStatusText = () => {
    if (!activeConnection) return 'Not connected';
    return activeConnection.status.charAt(0).toUpperCase() + activeConnection.status.slice(1);
  };
  
  return (
    <footer className="h-6 bg-vscode-accent text-white flex items-center px-4 text-xs gap-4">
      {/* Connection Status */}
      <div className="flex items-center gap-2">
        <Circle className={`h-2 w-2 fill-current ${getStatusColor()}`} />
        <span>{getStatusText()}</span>
        {activeConnection && activeConnection.status === 'connected' && (
          <span className="text-white/70">
            {activeConnection.username}@{activeConnection.host}
          </span>
        )}
      </div>
      
      {/* Separator */}
      {activeConnection && activeConnection.status === 'connected' && (
        <>
          <div className="h-4 w-px bg-white/20" />
          
          {/* Session Time */}
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3" />
            <span>{sessionTime}</span>
          </div>
        </>
      )}
      
      {/* Spacer */}
      <div className="flex-1" />
      
      {/* Mode Indicator */}
      <div className="flex items-center gap-2">
        <span className="text-white/70">Mode:</span>
        <span className="font-medium">
          {mode === 'planner' ? 'Planner' : mode === 'agentic' ? 'Agentic' : 'Teacher'}
        </span>
      </div>

      {/* Token Count */}
      {tokensUsed > 0 && (
        <>
          <div className="h-4 w-px bg-white/20" />
          <div className="flex items-center gap-1 text-white/70" title="Session tokens used">
            <Cpu className="h-3 w-3" />
            <span>{tokensUsed.toLocaleString()} tokens</span>
          </div>
        </>
      )}
      
      {/* OS Info */}
      {activeConnection?.osInfo && (
        <>
          <div className="h-4 w-px bg-white/20" />
          <span className="text-white/70">
            {activeConnection.osInfo.distribution || activeConnection.osInfo.type}
            {activeConnection.osInfo.version && ` ${activeConnection.osInfo.version}`}
            {activeConnection.osInfo.architecture && ` (${activeConnection.osInfo.architecture})`}
          </span>
        </>
      )}
    </footer>
  );
};
