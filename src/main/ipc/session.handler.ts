import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/constants';
import { sessionStore } from '../services/storage/SessionStore';

export function registerSessionHandlers(): void {
  /** Get the chat session (messages) for a connection */
  ipcMain.handle(IPC_CHANNELS.SESSION.GET, async (_event, connectionId: string) => {
    return sessionStore.getSession(connectionId);
  });

  /** Save (replace) all messages for a connection */
  ipcMain.handle(IPC_CHANNELS.SESSION.SAVE, async (_event, connectionId: string, messages: any[]) => {
    try {
      await sessionStore.saveSession(connectionId, messages);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  /** Clear the chat session for a connection */
  ipcMain.handle(IPC_CHANNELS.SESSION.CLEAR, async (_event, connectionId: string) => {
    try {
      await sessionStore.clearSession(connectionId);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  console.log('[IPC] Session handlers registered');
}
