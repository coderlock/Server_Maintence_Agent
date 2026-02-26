/**
 * ConnectionForm Component
 * Form for creating/editing SSH connections
 */

import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useConnections } from '../../hooks/useConnections';
import type { SavedConnection, ConnectionInput } from '@shared/types';

interface ConnectionFormProps {
  isOpen: boolean;
  onClose: () => void;
  editingConnection?: SavedConnection | null;
  onSaved?: () => void;
}

export const ConnectionForm: React.FC<ConnectionFormProps> = ({
  isOpen,
  onClose,
  editingConnection,
  onSaved,
}) => {
  const { createConnection, updateConnection, testConnection } = useConnections();
  
  const [formData, setFormData] = useState<ConnectionInput>({
    name: '',
    host: '',
    port: 22,
    username: '',
    password: '',
    savePassword: true,
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failure' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Reset form when opening/closing or editing different connection
  useEffect(() => {
    if (isOpen) {
      if (editingConnection) {
        setFormData({
          name: editingConnection.name,
          host: editingConnection.host,
          port: editingConnection.port,
          username: editingConnection.username,
          password: '',
          savePassword: editingConnection.hasPassword,
        });
      } else {
        setFormData({
          name: '',
          host: '',
          port: 22,
          username: '',
          password: '',
          savePassword: true,
        });
      }
      setErrors({});
      setTestResult(null);
    }
  }, [isOpen, editingConnection]);
  
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.host.trim()) {
      newErrors.host = 'Host is required';
    }
    
    if (!formData.port || formData.port < 1 || formData.port > 65535) {
      newErrors.port = 'Port must be between 1 and 65535';
    }
    
    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    }
    
    // Password required for new connections or if testing
    if (!editingConnection && !formData.password) {
      newErrors.password = 'Password is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleTest = async () => {
    if (!validate()) return;
    if (!formData.password) {
      setErrors({ password: 'Password required for testing' });
      return;
    }
    
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const result = await testConnection({
        host: formData.host,
        port: formData.port,
        username: formData.username,
        password: formData.password,
      });
      setTestResult(result.success ? 'success' : 'failure');
      if (!result.success && result.error) {
        setErrors({ test: result.error });
      }
    } catch (error) {
      setTestResult('failure');
      setErrors({ test: 'Connection test failed' });
    } finally {
      setIsTesting(false);
    }
  };
  
  const handleSave = async () => {
    if (!validate()) return;
    
    setIsSaving(true);
    
    try {
      if (editingConnection) {
        await updateConnection(editingConnection.id, formData);
      } else {
        await createConnection(formData);
      }
      onSaved?.();
      onClose();
    } catch (error) {
      setErrors({ submit: 'Failed to save connection' });
    } finally {
      setIsSaving(false);
    }
  };
  
  const updateField = (field: keyof ConnectionInput, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    const newErrors = { ...errors };
    delete newErrors[field];
    setErrors(newErrors);
    setTestResult(null);
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg w-[500px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-[#3c3c3c]">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              {editingConnection ? 'Edit Connection' : 'New Connection'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
        
        {/* Form */}
        <div className="p-4 space-y-4">
          {/* Connection Name */}
          <Input
            label="Connection Name"
            placeholder="My Raspberry Pi"
            value={formData.name}
            onChange={(e) => updateField('name', e.target.value)}
            error={errors.name}
          />
          
          {/* Host and Port */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Input
                label="Host / IP Address"
                placeholder="192.168.50.27"
                value={formData.host}
                onChange={(e) => updateField('host', e.target.value)}
                error={errors.host}
              />
            </div>
            
            <Input
              label="Port"
              type="number"
              placeholder="22"
              value={formData.port}
              onChange={(e) => updateField('port', parseInt(e.target.value) || 22)}
              error={errors.port}
            />
          </div>
          
          {/* Username */}
          <Input
            label="Username"
            placeholder="pi"
            value={formData.username}
            onChange={(e) => updateField('username', e.target.value)}
            error={errors.username}
          />
          
          {/* Password */}
          <Input
            label={`Password${editingConnection?.hasPassword ? ' (leave empty to keep current)' : ''}`}
            type="password"
            placeholder="••••••••"
            value={formData.password}
            onChange={(e) => updateField('password', e.target.value)}
            error={errors.password}
          />
          
          {/* Save Password Checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="savePassword"
              checked={formData.savePassword}
              onChange={(e) => updateField('savePassword', e.target.checked)}
              className="w-4 h-4 bg-[#3c3c3c] border-[#3c3c3c] rounded"
            />
            <label htmlFor="savePassword" className="text-sm text-gray-300 cursor-pointer">
              Save password (encrypted locally)
            </label>
          </div>
          
          {/* Test Result */}
          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded ${
              testResult === 'success'
                ? 'bg-green-900 bg-opacity-30 text-green-400'
                : 'bg-red-900 bg-opacity-30 text-red-400'
            }`}>
              {testResult === 'success' ? (
                <>
                  <CheckCircle className="h-5 w-5" />
                  Connection successful!
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5" />
                  {errors.test || 'Connection failed'}
                </>
              )}
            </div>
          )}
          
          {errors.submit && (
            <p className="text-red-400 text-sm">{errors.submit}</p>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-[#3c3c3c] flex justify-between gap-2">
          <Button
            variant="ghost"
            onClick={handleTest}
            disabled={isTesting || isSaving}
          >
            {isTesting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
          
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
