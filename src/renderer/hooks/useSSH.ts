/**
 * useSSH Hook
 * Manages SSH connection state and events.
 * Wires xterm.js terminal ↔ SSH PTY data flow.
 */

import { useEffect, useCallback } from 'react';
import { useConnectionStore } from '../store/connectionStore';
import { useTerminalStore } from '../store/terminalStore';
import type { OSInfo, SavedConnection } from '@shared/types';

export function useSSH() {
  const {
    activeConnection,
    setActiveConnection,
    updateActiveConnectionStatus,
    setOSInfo,
    setConnectionError,
  } = useConnectionStore();

  // Access terminal and dimensions from the store
  const { terminal, cols, rows } = useTerminalStore();

  // ── SSH event listeners ─────────────────────────────────────────────────
  // NOTE: ssh.onData is intentionally NOT subscribed here.
  //       TerminalPanel owns the xterm instance and handles data streaming
  //       directly so there is only ever one subscriber writing to the terminal.
  useEffect(() => {
    // Connection ready + OS detected
    const unsubConnected = window.electronAPI.ssh.onConnected((osInfo: OSInfo) => {
      console.log('[SSH] Connected, OS:', osInfo);
      updateActiveConnectionStatus('connected');
      setOSInfo(osInfo);
      // Ensure PTY is sized to match the current terminal dimensions
      if (terminal) {
        window.electronAPI.ssh.resize(terminal.cols, terminal.rows);
      }
    });

    // Disconnection — status update only; banner written by TerminalPanel
    const unsubDisconnected = window.electronAPI.ssh.onDisconnected(() => {
      console.log('[SSH] Disconnected');
      updateActiveConnectionStatus('disconnected');
      // Delay clearing active connection so TerminalPanel can show the banner
      setTimeout(() => setActiveConnection(null), 500);
    });

    // Error
    const unsubError = window.electronAPI.ssh.onError((error: string) => {
      console.error('[SSH] Error:', error);
      setConnectionError(error);
    });

    return () => {
      unsubConnected();
      unsubDisconnected();
      unsubError();
    };
  }, [terminal, updateActiveConnectionStatus, setOSInfo, setActiveConnection, setConnectionError]);

  // ── connect (using saved connection — password from vault) ───────────────
  const connect = useCallback(async (connectionId: string) => {
    try {
      const savedConn = await window.electronAPI.connections.getById(connectionId);
      if (!savedConn) throw new Error('Connection not found');

      setActiveConnection({
        connectionId: savedConn.id,
        name: savedConn.name,
        host: savedConn.host,
        port: savedConn.port,
        username: savedConn.username,
        status: 'connecting',
        connectedAt: new Date().toISOString(),
      });

      const result = await window.electronAPI.ssh.connect({
        host: savedConn.host,
        port: savedConn.port,
        username: savedConn.username,
        password: '', // retrieved from vault by main process
        connectionId: savedConn.id,
        cols: terminal?.cols ?? cols,
        rows: terminal?.rows ?? rows,
      });

      if (!result.success) throw new Error(result.error || 'Connection failed');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      setConnectionError(message);
      return false;
    }
  }, [terminal, cols, rows, setActiveConnection, setConnectionError]);

  // ── connectWithPassword (explicit password — used when vault has none) ───
  const connectWithPassword = useCallback(async (
    connection: SavedConnection,
    password: string
  ) => {
    try {
      setActiveConnection({
        connectionId: connection.id,
        name: connection.name,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        status: 'connecting',
        connectedAt: new Date().toISOString(),
      });

      const result = await window.electronAPI.ssh.connect({
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password,
        connectionId: connection.id,
        cols: terminal?.cols ?? cols,
        rows: terminal?.rows ?? rows,
      });

      if (!result.success) throw new Error(result.error || 'Connection failed');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      setConnectionError(message);
      return false;
    }
  }, [terminal, cols, rows, setActiveConnection, setConnectionError]);

  // ── disconnect ───────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    try {
      updateActiveConnectionStatus('disconnecting');
      await window.electronAPI.ssh.disconnect();
      return true;
    } catch (error) {
      console.error('[SSH] Disconnect failed:', error);
      return false;
    }
  }, [updateActiveConnectionStatus]);

  return {
    activeConnection,
    connect,
    connectWithPassword,
    disconnect,
  };
}
