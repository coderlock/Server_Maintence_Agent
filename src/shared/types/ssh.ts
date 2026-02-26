/**
 * SSH-related types
 */

export interface SSHConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  readyTimeout?: number;
  keepaliveInterval?: number;
}

export interface PTYOptions {
  cols: number;
  rows: number;
  term?: string;
}

/** Simple SSH command result — used internally by SSHConnection/SSHManager. */
export interface SSHCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface SSHError {
  code: string;
  message: string;
  level: 'error' | 'warning';
}

export interface SSHConnectionResult {
  success: boolean;
  error?: string;
  osInfo?: import('./connection').OSInfo;
}
