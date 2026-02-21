/**
 * Patterns that indicate a remote command is waiting for stdin input.
 * Used in two places:
 *  1. SSHConnection — kills the exec channel immediately when a prompt is detected,
 *     returning the partial output so the agent can see and diagnose the prompt.
 *  2. AgentBrain    — annotates the failure message so the LLM knows to add
 *     non-interactive flags (--yes, --batch, --force, etc.)
 */

/** Combined regex — faster than iterating an array for every streaming chunk. */
export const INTERACTIVE_PROMPT_REGEX =
  /\(y\/N\)|\[y\/N\]|\(Y\/n\)|\[Y\/n\]|\boverwrite\?|\bproceed\?|\bare you sure\?|\benter passphrase|\benter password|\benter new.*password|\bconfirm\?|\bcontinue\? \[|\bpress \[?enter\]?|\bdo you want to/i;

/**
 * Individual patterns kept for the AgentBrain diagnostic message
 * (so it can report exactly which phrase triggered the detection).
 */
export const INTERACTIVE_PROMPT_PATTERNS: RegExp[] = [
  /\(y\/N\)/i,
  /\(Y\/n\)/i,
  /\[y\/N\]/i,
  /\[Y\/n\]/i,
  /\boverwrite\?/i,
  /\bproceed\?/i,
  /\bare you sure\?/i,
  /\benter passphrase/i,
  /\benter password/i,
  /\benter new.*password/i,
  /\bconfirm\?/i,
  /\bcontinue\? \[/i,
  /press \[enter\]/i,
  /press enter/i,
  /do you want to/i,
];

/** Returns the matched prompt phrase, or null if no prompt detected. */
export function detectInteractivePrompt(stdout: string, stderr: string): string | null {
  const combined = `${stdout}\n${stderr}`;
  for (const pattern of INTERACTIVE_PROMPT_PATTERNS) {
    const match = combined.match(pattern);
    if (match) return match[0];
  }
  return null;
}
