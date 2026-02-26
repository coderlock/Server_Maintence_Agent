/**
 * Sanitization helpers for safe logging.
 *
 * Never log raw SSH / connection config objects — they may contain passwords,
 * private keys, or passphrases.  Use sanitizeSSHConfig() before passing any
 * config to console.log, error reporters, or IPC events.
 */

const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'password',
  'privateKey',
  'privateKeyPath',
  'passphrase',
  'apiKey',
  'token',
  'secret',
]);

/**
 * Returns a shallow copy of `obj` with any sensitive fields replaced by
 * the string `'***'`.  Safe to pass to console.log / JSON.stringify.
 */
export function sanitizeForLog<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = SENSITIVE_KEYS.has(key) && value !== undefined ? '***' : value;
  }
  return out as T;
}
