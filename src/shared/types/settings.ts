/**
 * Application settings types
 */

export interface AppSettings {
  // AI Settings
  aiProvider: 'moonshot' | 'openai';
  aiModel: string;
  aiTemperature: number;
  aiMaxTokens: number;
  
  // Terminal Settings
  terminalFontSize: number;
  terminalFontFamily: string;
  terminalCursorStyle: 'block' | 'underline' | 'bar';
  terminalCursorBlink: boolean;
  
  // UI Settings
  theme: 'dark' | 'light';
  splitPanePosition: number;
  
  // Behavior Settings
  defaultMode: 'manual' | 'agent';
  autoSaveSession: boolean;
  confirmDangerousCommands: boolean;
  
  // Connection Settings
  sshTimeout: number;
  sshKeepAliveInterval: number;
  
  // Risk Classification
  customDangerousPatterns: string[];
  customSafePatterns: string[];

  /**
   * How plan commands are executed on the remote device.
   *
   * 'batch'         — Commands run via a separate SSH exec channel.
   *                    Output appears in the terminal after the command completes.
   *                    stdout and stderr are separated.
   *
   * 'real-terminal' — Commands are typed directly into the live terminal session.
   *                    Output appears in real time with full colour and formatting.
   *                    stdout and stderr are merged (PTY behaviour).
   */
  executionOutputMode: 'batch' | 'real-terminal';

  /**
   * Seconds of output silence before showing a soft stall warning on the step card.
   * 0 = disabled.
   * Default: 15
   */
  idleWarningSeconds: number;

  /**
   * Seconds of output silence before triggering AI stall analysis.
   * Must be > idleWarningSeconds (or 0 to disable).
   * Default: 45
   */
  idleStalledSeconds: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  aiProvider: 'openai',
  aiModel: 'gpt-4o',
  aiTemperature: 0.7,
  aiMaxTokens: 4096,
  
  terminalFontSize: 14,
  terminalFontFamily: 'Consolas, "Courier New", monospace',
  terminalCursorStyle: 'block',
  terminalCursorBlink: true,
  
  theme: 'dark',
  splitPanePosition: 50,
  
  defaultMode: 'manual',
  autoSaveSession: true,
  confirmDangerousCommands: true,
  
  sshTimeout: 30000,
  sshKeepAliveInterval: 10000,
  
  customDangerousPatterns: [],
  customSafePatterns: [],

  executionOutputMode: 'batch',
  idleWarningSeconds: 15,
  idleStalledSeconds: 45,
};
