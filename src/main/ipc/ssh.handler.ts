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
import { initializeSession, buildFallbackPromptRegex } from '../services/execution/strategies/sessionSetup';
import type { ShellSessionInfo } from '../services/execution/strategies/sessionSetup';
import type { ConnectionConfig, ActiveConnection } from '@shared/types';
import { validateIpcInput, ConnectionConfigSchema } from './ipcSchemas';
import { sanitizeForLog } from '../utils/sanitize';

export function registerSSHHandlers(mainWindow: BrowserWindow): void {
  sshManager.setMainWindow(mainWindow);
  
  // Connect to SSH server
  ipcMain.handle(IPC_CHANNELS.SSH.CONNECT, async (_event, config: unknown) => {
    try {
      const safeConfig = validateIpcInput(ConnectionConfigSchema, config) as ConnectionConfig;
      console.log('[SSH] Connect requested:', sanitizeForLog(safeConfig));
      
      // Get password from vault if using saved connection
      let password = safeConfig.password;
      if (safeConfig.connectionId && !password) {
        const storedPassword = await connectionStore.getPassword(safeConfig.connectionId);
        if (!storedPassword) {
          throw new Error('No password available for this connection');
        }
        password = storedPassword;
      }
      
      // Connect with PTY
      await sshManager.connect(
        {
          host: safeConfig.host,
          port: safeConfig.port,
          username: safeConfig.username,
          password,
        },
        {
          cols: safeConfig.cols || 80,
          rows: safeConfig.rows || 24,
        }
      );

      // Detect OS
      const connection = sshManager.getConnection();
      if (connection) {
        const osDetector = new OSDetector(connection);
        const osInfo = await osDetector.detect();

        console.log('[SSH] OS detected:', osInfo.type, osInfo.distribution);

        // Update last connected time
        if (safeConfig.connectionId) {
          await connectionStore.updateLastConnected(safeConfig.connectionId);
        }

        // Cache connection context for plan execution
        const connectionId = safeConfig.connectionId ?? `${safeConfig.host}:${safeConfig.port}`;
        const activeConn: ActiveConnection = {
          connectionId,
          name: safeConfig.connectionId ?? safeConfig.host,
          host: safeConfig.host,
          port: safeConfig.port,
          username: safeConfig.username,
          status: 'connected',
          connectedAt: new Date().toISOString(),
          osInfo,
        };

        // Sprint 9: Detect shell and inject invisible exit-code embedding
        let shellSessionInfo: ShellSessionInfo;
        try {
          shellSessionInfo = await initializeSession(
            (data: string) => sshManager.write(data),
            async (cmd: string) => {
              const result = await sshManager.executeCommand(cmd);
              return result.stdout;
            },
            safeConfig.username,
            safeConfig.host,
          );
          console.log(
            `[SSH] Shell: ${shellSessionInfo.shellType}, detection mode: ${shellSessionInfo.detectionMode}`,
          );
        } catch (err) {
          console.warn('[SSH] Session setup failed — falling back to markers:', err);
          shellSessionInfo = {
            shellType: 'unknown',
            promptRegex: buildFallbackPromptRegex(config.username),
            setupComplete: false,
            detectionMode: 'markers',
          };
        }

        setPlanConnectionContext({ connection: activeConn, osInfo, connectionId, shellSessionInfo });
        
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

