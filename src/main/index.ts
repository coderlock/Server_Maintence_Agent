import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { spawn } from 'child_process';
import { registerAllHandlers } from './ipc';

// Declare Vite environment variables
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// (Inlined from electron-squirrel-startup to avoid bundling issues)
if (process.platform === 'win32') {
  const cmd = process.argv[1];
  if (cmd === '--squirrel-install' || cmd === '--squirrel-updated' || cmd === '--squirrel-uninstall' || cmd === '--squirrel-obsolete') {
    app.quit();
  }
}

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  // In dev mode with Vite, preload is in the same directory as main process
  const preloadPath = path.join(__dirname, 'preload.js');
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: preloadPath,
      // Security baseline — verified:
      //   contextIsolation:  true  → renderer cannot access Node/Electron APIs directly
      //   nodeIntegration:   false → renderer has no require() access
      //   sandbox:           false → required so the preload script can use contextBridge
      //                              (acceptable because contextIsolation isolates the boundary)
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Register IPC handlers after window is created
  registerAllHandlers(mainWindow);

  // Load the app
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(() => {
  // ── Content Security Policy ───────────────────────────────────────────────
  // In dev mode Vite injects inline scripts, eval(), and HMR websockets, so
  // the policy must be relaxed.  In production (app.isPackaged) we apply a
  // strict policy.
  let csp: string;

  if (!app.isPackaged) {
    // Dev: permissive so Vite HMR and inline bootstrapping work.
    csp = [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval'",
      'connect-src *',
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      'worker-src blob: *',
    ].join('; ');
  } else {
    // Production: strict whitelist.
    const connectSrc = [
      "'self'",
      'https://api.anthropic.com',
      'https://api.moonshot.cn',
      'https://api.openai.com',
    ].join(' ');

    csp = [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",   // 'unsafe-inline' needed for Tailwind runtime styles
      "img-src 'self' data: blob:",
      `connect-src ${connectSrc}`,
      "font-src 'self' data:",
      "worker-src blob:",
    ].join('; ');
  }

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

export { mainWindow };
