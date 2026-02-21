/**
 * SSHManager Service
 * Manages the single active SSH connection and forwards events to renderer
 */

import { BrowserWindow } from 'electron';
import { SSHConnection } from './SSHConnection';
import { IPC_CHANNELS } from '@shared/constants';
import { contextBuilder } from '../ai/ContextBuilder';
import type { SSHConnectionConfig, PTYOptions, SSHCommandResult } from '@shared/types';

export class SSHManager {
  private connection: SSHConnection | null = null;
  private mainWindow: BrowserWindow | null = null;

  /**
   * External listeners that receive a copy of all PTY data.
   * Used by RealTerminalStrategy to observe output for marker detection.
   * The normal mainWindow.webContents.send flow is NOT affected.
   */
  private dataListeners: Set<(data: string) => void> = new Set();
  
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
      this.notifyDataListeners(data);  // RealTerminalStrategy observer hook
      contextBuilder.appendTerminalOutput(data); // Feed AI terminal context buffer
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
    // Clear any lingering data listeners from a previous execution
    this.dataListeners.clear();
    // Clear terminal buffer so stale output isn't sent to the LLM on next session
    contextBuilder.clearTerminalBuffer();
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

  // ── Data listener API (used by RealTerminalStrategy) ──────────────────────

  /**
   * Register a listener that receives all PTY output data.
   * The listener receives the same string data that is sent to the renderer.
   * Multiple listeners can be registered simultaneously.
   */
  registerDataListener(listener: (data: string) => void): void {
    this.dataListeners.add(listener);
  }

  /**
   * Remove a previously registered data listener.
   */
  removeDataListener(listener: (data: string) => void): void {
    this.dataListeners.delete(listener);
  }

  /**
   * Notify all registered data listeners with a PTY data chunk.
   * Called internally in the data event handler.
   * Errors in individual listeners are caught to protect the data pipeline.
   */
  private notifyDataListeners(data: string): void {
    for (const listener of this.dataListeners) {
      try {
        listener(data);
      } catch (err) {
        console.error('[SSHManager] Data listener error:', err);
      }
    }
  }
}

// Singleton instance
export const sshManager = new SSHManager();
