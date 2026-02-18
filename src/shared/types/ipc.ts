/**
 * IPC communication types
 */

import type { ConnectionConfig, ConnectionInput } from './connection';
import type { AIRequestContext } from './ai';
import type { ChatSession } from './chat';
import type { AppSettings } from './settings';

// IPC Response wrapper
export interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// SSH IPC Types
export interface SSHConnectRequest {
  config: ConnectionConfig;
}

export interface SSHWriteRequest {
  data: string;
}

export interface SSHResizeRequest {
  cols: number;
  rows: number;
}

// AI IPC Types
export interface AISendMessageRequest {
  message: string;
  context: AIRequestContext;
}

// Connection IPC Types
export interface ConnectionCreateRequest {
  connection: ConnectionInput;
}

export interface ConnectionUpdateRequest {
  id: string;
  updates: Partial<ConnectionInput>;
}

export interface ConnectionTestRequest {
  config: ConnectionConfig;
}

// Settings IPC Types
export interface SettingsUpdateRequest {
  settings: Partial<AppSettings>;
}

// Session IPC Types
export interface SessionGetRequest {
  connectionId: string;
}

export interface SessionSaveRequest {
  connectionId: string;
  session: ChatSession;
}

export interface SessionClearRequest {
  connectionId: string;
}
