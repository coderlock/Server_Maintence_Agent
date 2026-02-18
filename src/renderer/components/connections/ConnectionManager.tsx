/**
 * ConnectionManager Component
 * Displays list of saved connections with actions
 */

import React, { useEffect, useState } from 'react';
import { Server, Trash2, Edit2, Play } from 'lucide-react';
import { Button } from '../ui/Button';
import { useConnections } from '../../hooks/useConnections';
import { useSSH } from '../../hooks/useSSH';
import type { SavedConnection } from '@shared/types';

interface ConnectionManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onNew: () => void;
  onEdit: (connection: SavedConnection) => void;
}

export const ConnectionManager: React.FC<ConnectionManagerProps> = ({
  isOpen,
  onClose,
  onNew,
  onEdit,
}) => {
  const { connections, refreshConnections, deleteConnection } = useConnections();
  const { connect, activeConnection } = useSSH();
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    if (isOpen) {
      refreshConnections();
    }
  }, [isOpen, refreshConnections]);
  
  const filteredConnections = connections.filter(conn =>
    conn.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conn.host.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const handleConnect = async (connection: SavedConnection) => {
    await connect(connection.id);
    onClose();
  };
  
  const handleDelete = async (connection: SavedConnection) => {
    if (confirm(`Delete "${connection.name}"?`)) {
      await deleteConnection(connection.id);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg w-[700px] max-h-[600px] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[#3c3c3c]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Server className="h-5 w-5" />
              Connection Manager
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
          
          {/* Search */}
          <input
            type="text"
            placeholder="Search connections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-[#3c3c3c] border border-[#3c3c3c] rounded text-white placeholder-gray-400 focus:outline-none focus:border-[#007acc]"
          />
        </div>
        
        {/* Connection List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredConnections.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No connections found</p>
              <button
                onClick={onNew}
                className="text-blue-400 mt-2 hover:underline"
              >
                Create your first connection
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredConnections.map((connection) => (
                <div
                  key={connection.id}
                  className="p-3 bg-[#2d2d30] rounded border border-[#3c3c3c] hover:border-[#007acc] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-white font-medium">{connection.name}</h3>
                        {activeConnection?.connectionId === connection.id && (
                          <span className="text-xs px-2 py-0.5 bg-green-600 text-white rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400">
                        {connection.username}@{connection.host}:{connection.port}
                      </p>
                      {connection.lastConnectedAt && (
                        <p className="text-xs text-gray-500 mt-1">
                          Last connected: {new Date(connection.lastConnectedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleConnect(connection)}
                        disabled={activeConnection?.connectionId === connection.id}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEdit(connection)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleDelete(connection)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-[#3c3c3c] flex justify-between">
          <Button onClick={onNew}>
            + New Connection
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
