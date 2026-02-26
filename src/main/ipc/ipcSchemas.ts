/**
 * Zod schemas for all IPC handler inputs.
 *
 * All data arriving via ipcMain.handle() originates from the renderer process
 * (a Chromium sandbox).  Validating it here ensures that malformed or
 * malicious renderer messages cannot corrupt application state or trigger
 * unexpected behaviour in the main process.
 */

import { z } from 'zod';

// ── SSH / Connection ───────────────────────────────────────────────────────

export const ConnectionInputSchema = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).max(100),
  password: z.string().max(1024),
  savePassword: z.boolean().optional(),
});

export const ConnectionConfigSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).max(100),
  password: z.string().max(1024),
  connectionId: z.string().optional(),
  cols: z.number().int().positive().max(1000).optional(),
  rows: z.number().int().positive().max(500).optional(),
  readyTimeout: z.number().int().positive().optional(),
});

export const ConnectionIdSchema = z.string().min(1).max(256);

export const ConnectionUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().min(1).max(100).optional(),
  password: z.string().max(1024).optional(),
  savePassword: z.boolean().optional(),
});

// ── Settings ───────────────────────────────────────────────────────────────

export const AppSettingsUpdateSchema = z.object({
  aiProvider: z.enum(['moonshot', 'openai']).optional(),
  aiModel: z.string().min(1).max(100).optional(),
  aiTemperature: z.number().min(0).max(2).optional(),
  aiMaxTokens: z.number().int().min(1).max(200000).optional(),
  terminalFontSize: z.number().int().min(8).max(72).optional(),
  terminalFontFamily: z.string().max(200).optional(),
  terminalCursorStyle: z.enum(['block', 'underline', 'bar']).optional(),
  terminalCursorBlink: z.boolean().optional(),
  theme: z.enum(['dark', 'light']).optional(),
  splitPanePosition: z.number().min(10).max(90).optional(),
  defaultMode: z.enum(['manual', 'agent']).optional(),
  autoSaveSession: z.boolean().optional(),
  confirmDangerousCommands: z.boolean().optional(),
  sshTimeout: z.number().int().min(1000).max(120000).optional(),
  sshKeepAliveInterval: z.number().int().min(0).max(60000).optional(),
  customDangerousPatterns: z.array(z.string().max(500)).max(100).optional(),
  customSafePatterns: z.array(z.string().max(500)).max(100).optional(),
  executionOutputMode: z.enum(['batch', 'real-terminal']).optional(),
  idleWarningSeconds: z.number().int().min(0).max(300).optional(),
  idleStalledSeconds: z.number().int().min(0).max(600).optional(),
});

export const ApiKeySchema = z.string().min(8).max(512).trim();

// ── AI ─────────────────────────────────────────────────────────────────────

export const OsInfoSchema = z.object({
  type: z.string().max(100),
  distro: z.string().max(100).optional(),
  version: z.string().max(100).optional(),
  kernel: z.string().max(100).optional(),
});

export const ActiveConnectionSchema = z.object({
  connectionId: z.string().min(1).max(256),
  name: z.string().max(200),
  host: z.string().max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(100),
  status: z.enum(['connecting', 'connected', 'disconnecting', 'disconnected', 'error']),
  connectedAt: z.string().optional(),
  osInfo: OsInfoSchema.optional(),
  error: z.string().optional(),
});

export const SendMessageSchema = z.object({
  message: z.string().min(1).max(32000),
  requestCtx: z.object({
    connectionId: z.string().min(1).max(256),
    connection: ActiveConnectionSchema,
    osInfo: OsInfoSchema,
    mode: z.enum(['manual', 'agent']),
  }),
});

export const SaveMessageSchema = z.object({
  connectionId: z.string().min(1).max(256),
  content: z.string().min(1).max(100000),
  tokensUsed: z.number().int().nonnegative().optional(),
});

// ── Session ────────────────────────────────────────────────────────────────

export const SessionIdSchema = z.string().min(1).max(256);

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Validate `input` against `schema`.  Returns parsed data on success, or
 * throws an Error with a human-readable message suitable for IPC error
 * responses (does not expose internal Zod structure to the renderer).
 */
export function validateIpcInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid input: ${issues}`);
  }
  return result.data;
}
