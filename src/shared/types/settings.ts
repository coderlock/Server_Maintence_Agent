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
  defaultMode: 'planner' | 'teacher' | 'agentic';
  autoSaveSession: boolean;
  confirmDangerousCommands: boolean;
  
  // Connection Settings
  sshTimeout: number;
  sshKeepAliveInterval: number;
  
  // Risk Classification
  customDangerousPatterns: string[];
  customSafePatterns: string[];
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
  
  defaultMode: 'planner',
  autoSaveSession: true,
  confirmDangerousCommands: true,
  
  sshTimeout: 30000,
  sshKeepAliveInterval: 10000,
  
  customDangerousPatterns: [],
  customSafePatterns: [],
};
