/**
 * Plan Execution IPC Handlers (Placeholder for Sprint 1)
 * Will be implemented in Sprint 5
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/constants';

export function registerPlanHandlers(): void {
  // Approve plan step
  ipcMain.on(IPC_CHANNELS.PLAN.APPROVE, (_event, stepId) => {
    console.log('[Plan] Approve step:', stepId);
  });
  
  // Reject plan step
  ipcMain.on(IPC_CHANNELS.PLAN.REJECT, (_event, stepId) => {
    console.log('[Plan] Reject step:', stepId);
  });
  
  // Pause plan execution
  ipcMain.on(IPC_CHANNELS.PLAN.PAUSE, () => {
    console.log('[Plan] Pause requested');
  });
  
  // Resume plan execution
  ipcMain.on(IPC_CHANNELS.PLAN.RESUME, () => {
    console.log('[Plan] Resume requested');
  });
  
  // Cancel plan execution
  ipcMain.on(IPC_CHANNELS.PLAN.CANCEL, () => {
    console.log('[Plan] Cancel requested');
  });
  
  console.log('[IPC] Plan handlers registered');
}
