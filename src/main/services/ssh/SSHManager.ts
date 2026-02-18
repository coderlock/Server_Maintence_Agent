/**
 * SSHManager Service
 * Manages the single active SSH connection and forwards events to renderer
 */

import { BrowserWindow } from 'electron';
import { SSHConnection } from './SSHConnection';
import { IPC_CHANNELS } from '@shared/constants';
import type { SSHConnectionConfig, PTYOptions, SSHCommandResult } from '@shared/types';

export class SSHManager {
  private connection: SSHConnection | null = null;
  private mainWindow: BrowserWindow | null = null;
  
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }
  
  async connect(config: SSHConnectionConfig, ptyOptions: PTYOptions): Promise<void> {
    // Disconnect existing connection
    if (this.connection) {
      await this.disconnect();
    }
    
    this.connection = new SSHConnection(config);
    
    // Set up event handlers
    this.connection.on('data', (data: string) => {
      this.sendToRenderer(IPC_CHANNELS.SSH.DATA, data);
    });
    
    this.connection.on('error', (err: Error) => {
      this.sendToRenderer(IPC_CHANNELS.SSH.ERROR, err.message);
    });
    
    this.connection.on('close', () => {
      this.sendToRenderer(IPC_CHANNELS.SSH.DISCONNECTED);
      this.connection = null;
    });
    
    // Connect and create PTY
    await this.connection.connect();
    await this.connection.createPTY(ptyOptions);
  }
  
  async disconnect(): Promise<void> {
    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }
  }
  
  write(data: string): void {
    if (this.connection) {
      this.connection.write(data);
    }
  }
  
  resize(cols: number, rows: number): void {
    if (this.connection) {
      this.connection.resize(cols, rows);
    }
  }
  
  async executeCommand(command: string): Promise<SSHCommandResult> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    return this.connection.executeCommand(command);
  }
  
  isConnected(): boolean {
    return this.connection?.getIsConnected() ?? false;
  }
  
  getConnection(): SSHConnection | null {
    return this.connection;
  }
  
  private sendToRenderer(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }
}

// Singleton instance
export const sshManager = new SSHManager();
