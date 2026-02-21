/**
 * interactivePromptDetector — Sprint 8
 *
 * Detect interactive prompts in SSH command output.
 * Used in two modes:
 *   - Real-time (per-chunk): detectInteractivePrompt() — fast, scans the tail of each chunk
 *   - Retrospective (on idle): detectInteractivePromptDeep() — larger context window,
 *     catches prompts that were preceded by substantial output or split across chunks
 *
 * Pure functions, no state. Strategy-agnostic.
 */

// ── Types ─────────────────────────────────────────────────────────────────

export interface PromptDetection {
  /** Whether a prompt pattern was found. */
  detected: boolean;

  /**
   * The line of output containing the matched pattern.
   * Empty string when not detected.
   */
  promptText: string;

  /**
   * Human-readable label for the matched pattern (for logging / UI display).
   * Empty string when not detected.
   */
  matchedPattern: string;
}

// ── Pattern registry ──────────────────────────────────────────────────────

/**
 * Ordered list of interactive prompt patterns.
 * Ordered roughly by specificity (most specific first to avoid false positives
 * from the broad generic patterns at the end).
 */
const PROMPT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Package managers — specific Y/n forms
  { pattern: /\[Y\/n\]/i,                           label: 'apt Y/n' },
  { pattern: /\[y\/N\]/i,                           label: 'apt y/N' },
  { pattern: /\[yes\/no\]/i,                        label: 'yes/no choice' },
  { pattern: /\(yes\/no\)/i,                        label: 'yes/no paren' },
  { pattern: /Do you want to continue\s*\?/i,       label: 'continue prompt' },
  { pattern: /Proceed\s*\?\s*$/im,                  label: 'proceed prompt' },
  { pattern: /Is this ok\s*\[/i,                    label: 'yum ok prompt' },
  { pattern: /install these packages\?/i,           label: 'install packages?' },

  // Authentication
  { pattern: /[Pp]assword\s*:/,                     label: 'password prompt' },
  { pattern: /[Pp]assphrase\s*:/,                   label: 'passphrase prompt' },
  { pattern: /Enter passphrase/i,                   label: 'enter passphrase' },
  { pattern: /Enter new.*password/i,                label: 'new password prompt' },
  { pattern: /Retype new.*password/i,               label: 'confirm password prompt' },
  { pattern: /Current password/i,                   label: 'current password prompt' },

  // SSH / Git
  { pattern: /Are you sure you want to continue connecting/i, label: 'SSH host key' },
  { pattern: /\(yes\/no\/\[fingerprint\]\)/i,       label: 'SSH fingerprint' },
  { pattern: /Username for/i,                       label: 'git username' },
  { pattern: /Password for/i,                       label: 'git password' },

  // General confirmations
  { pattern: /Press ENTER to continue/i,            label: 'press enter' },
  { pattern: /Press any key/i,                      label: 'press any key' },
  { pattern: /Hit ENTER or type/i,                  label: 'hit enter or type' },
  { pattern: /Type .+ to confirm/i,                 label: 'type to confirm' },
  { pattern: /Overwrite\?/i,                        label: 'overwrite?' },
  { pattern: /Replace\?/i,                          label: 'replace?' },

  // Pagers
  { pattern: /\(END\)/,                             label: 'less pager (END)' },
  { pattern: /---More---/,                          label: 'more pager' },

  // Sudo
  { pattern: /\[sudo\] password for/i,              label: 'sudo password' },

  // NOTE: broad "colon at end-of-line" and "angle-bracket at end-of-line" patterns have been
  // intentionally removed.  They caused false positives on apt progress lines such as
  //   Get:4 https://packages.adoptium.net/... InRelease [7,507 B]
  // (the multiline /:\s*$/m flag matched URLs and other non-prompt content in the buffer).
  // Every real interactive prompt that ends with ':' (password, passphrase, sudo) is already
  // matched by the specific patterns above.
];

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Scan `tail` against all patterns.
 * Returns the first match found, or null.
 */
function scan(tail: string): PromptDetection | null {
  for (const { pattern, label } of PROMPT_PATTERNS) {
    if (pattern.test(tail)) {
      // Extract the specific line that matched for display in the UI
      const lines = tail.split('\n');
      const matchedLine = [...lines].reverse().find((line) => pattern.test(line)) ?? '';
      return {
        detected: true,
        promptText: matchedLine.trim(),
        matchedPattern: label,
      };
    }
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Real-time prompt detection on an incoming output chunk.
 *
 * Examines the last 500 characters of the chunk — prompts always appear
 * at the tail end of output. Fast enough to call on every stdout event.
 *
 * @param text — raw command output chunk (may contain ANSI codes;
 *               patterns are designed to match through common escape sequences)
 */
export function detectInteractivePrompt(text: string): PromptDetection {
  const tail = text.slice(-500);
  return scan(tail) ?? { detected: false, promptText: '', matchedPattern: '' };
}

/**
 * Deep prompt detection on accumulated output.
 * Used by the idle timer when re-examining a larger context window.
 *
 * Examines the last 2000 characters — catches prompts that were preceded
 * by substantial command output or split across multiple data chunks.
 *
 * @param accumulatedOutput — full stdout accumulated so far for this command
 */
export function detectInteractivePromptDeep(accumulatedOutput: string): PromptDetection {
  const tail = accumulatedOutput.slice(-2000);
  return scan(tail) ?? { detected: false, promptText: '', matchedPattern: '' };
}
