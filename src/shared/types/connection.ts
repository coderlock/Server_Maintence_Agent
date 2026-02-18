/**
 * Connection-related types
 */

export interface ConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  connectionId?: string;
  cols?: number;
  rows?: number;
}

export interface SavedConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
  // Password is stored encrypted in electron-store
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
}

export interface ConnectionInput {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  savePassword?: boolean;
}

export interface ActiveConnection {
  connectionId: string;
  name: string;
  host: string;
  port: number;
  username: string;
  status: 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error';
  connectedAt?: string;
  osInfo?: OSInfo;
  error?: string;
}

export interface ShellInfo {
  type: 'bash' | 'zsh' | 'fish' | 'sh' | 'powershell' | 'cmd';
  path: string;
  version?: string;
}

export interface OSInfo {
  type: 'linux' | 'darwin' | 'windows' | 'unknown';
  distribution?: string;
  version?: string;
  kernel?: string;
  hostname?: string;
  architecture?: string;
  shell?: ShellInfo;
  codename?: string;
}
