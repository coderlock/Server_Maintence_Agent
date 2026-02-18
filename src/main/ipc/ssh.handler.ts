/**
 * SSH IPC Handlers
 * Handles SSH connection, disconnection, and terminal operations
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/constants';
import { sshManager } from '../services/ssh/SSHManager';
import { OSDetector } from '../services/ssh/OSDetector';
import { connectionStore } from '../services/storage/ConnectionStore';
import { setPlanConnectionContext } from './plan.handler';
import type { ConnectionConfig, ActiveConnection } from '@shared/types';

export function registerSSHHandlers(mainWindow: BrowserWindow): void {
  sshManager.setMainWindow(mainWindow);
  
  // Connect to SSH server
  ipcMain.handle(IPC_CHANNELS.SSH.CONNECT, async (_event, config: ConnectionConfig) => {
    try {
      console.log('[SSH] Connect requested:', config.host);
      
      // Get password from vault if using saved connection
      let password = config.password;
      if (config.connectionId && !password) {
        const storedPassword = await connectionStore.getPassword(config.connectionId);
        if (!storedPassword) {
          throw new Error('No password available for this connection');
        }
        password = storedPassword;
      }
      
      // Connect with PTY
      await sshManager.connect(
        {
          host: config.host,
          port: config.port,
          username: config.username,
          password,
        },
        {
          cols: config.cols || 80,
          rows: config.rows || 24,
        }
      );
      
      // Detect OS
      const connection = sshManager.getConnection();
      if (connection) {
        const osDetector = new OSDetector(connection);
        const osInfo = await osDetector.detect();
        
        console.log('[SSH] OS detected:', osInfo.type, osInfo.distribution);
        
        // Update last connected time
        if (config.connectionId) {
          await connectionStore.updateLastConnected(config.connectionId);
        }

        // Cache connection context for plan execution
        const connectionId = config.connectionId ?? `${config.host}:${config.port}`;
        const activeConn: ActiveConnection = {
          connectionId,
          name: config.connectionId ?? config.host,
          host: config.host,
          port: config.port,
          username: config.username,
          status: 'connected',
          connectedAt: new Date().toISOString(),
          osInfo,
        };
        setPlanConnectionContext({ connection: activeConn, osInfo, connectionId });
        
        // Send connected event with OS info
        mainWindow.webContents.send(IPC_CHANNELS.SSH.CONNECTED, osInfo);
        
        return { success: true, osInfo };
      }
      
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      console.error('[SSH] Connection failed:', message);
      mainWindow.webContents.send(IPC_CHANNELS.SSH.ERROR, message);
      return { success: false, error: message };
    }
  });
  
  // Disconnect from SSH server
  ipcMain.handle(IPC_CHANNELS.SSH.DISCONNECT, async () => {
    console.log('[SSH] Disconnect requested');
    await sshManager.disconnect();
    return { success: true };
  });
  
  // Write data to PTY
  ipcMain.on(IPC_CHANNELS.SSH.WRITE, (_event, data: string) => {
    sshManager.write(data);
  });
  
  // Resize PTY
  ipcMain.on(IPC_CHANNELS.SSH.RESIZE, (_event, cols: number, rows: number) => {
    sshManager.resize(cols, rows);
  });
  
  console.log('[IPC] SSH handlers registered');
}

