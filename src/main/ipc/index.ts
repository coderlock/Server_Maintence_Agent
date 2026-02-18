/**
 * IPC Handler Registration
 * Centralized registration of all IPC handlers
 */

import { BrowserWindow } from 'electron';
import { registerSSHHandlers } from './ssh.handler';
import { registerAIHandlers } from './ai.handler';
import { registerConnectionHandlers } from './connection.handler';
import { registerSettingsHandlers } from './settings.handler';
import { registerSessionHandlers } from './session.handler';
import { registerPlanHandlers } from './plan.handler';

/**
 * Register all IPC handlers with the main process
 * Call this once during app initialization after window is created
 */
export function registerAllHandlers(mainWindow: BrowserWindow): void {
  registerSSHHandlers(mainWindow);
  registerAIHandlers(mainWindow);
  registerConnectionHandlers();
  registerSettingsHandlers();
  registerSessionHandlers();
  registerPlanHandlers();
  
  console.log('[IPC] All handlers registered');
}
