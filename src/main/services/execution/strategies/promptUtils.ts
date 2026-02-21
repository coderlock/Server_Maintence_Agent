/**
 * promptUtils — Sprint 9
 *
 * Shared utility functions for the prompt-based (invisible) command detection path.
 * Used by PromptStreamParser and any fallback logic that needs OSC extraction or
 * output cleaning.
 *
 * OSC reference:
 *   Our PROMPT_COMMAND injects: ESC ] 0 ; SMA : <exitCode> BEL
 *   Written as: \x1b]0;SMA:<exitCode>\x07
 *   xterm.js processes this as a window title change — it is invisible to the user.
 */

/**
 * Extract the exit code from an OSC terminal title sequence injected by our
 * PROMPT_COMMAND: `printf "\033]0;SMA:$?\007"`.
 *
 * @param data — raw PTY data chunk (may contain the sequence)
 * @returns parsed exit code, or null if the sequence is not present
 */
export function extractOSCExitCode(data: string): number | null {
  const match = /\x1b\]0;SMA:(\d+)\x07/.exec(data);
  if (!match) return null;
  const code = parseInt(match[1], 10);
  return isNaN(code) ? null : code;
}

/**
 * Strip all OSC sequences from a string.
 * Used to clean captured output before it is stored or sent to AgentBrain.
 *
 * OSC format:  ESC ] <data> <BEL>     where BEL = \x07
 *              ESC ] <data> ESC \     (String Terminator variant)
 * Both forms are stripped.
 */
export function stripOSCSequences(data: string): string {
  // BEL-terminated form
  // ST-terminated form (ESC \)
  return data.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

/**
 * Strip the command echo from the beginning of captured output.
 *
 * When a command is written to a PTY, the shell echoes it back immediately.
 * This function removes that echo line so the captured output contains only
 * the command's actual output.
 *
 * @param output  — raw captured output (may start with the echo line)
 * @param command — the command string that was sent to the PTY
 * @returns output with the echo line removed, or the original string if not found
 */
export function stripCommandEcho(output: string, command: string): string {
  const lines = output.split('\n');
  const commandCore = command.trim().substring(0, 80); // Use a generous prefix

  // Find the first line that contains meaningful command text
  const echoIndex = lines.findIndex((line) =>
    line.includes(commandCore) || line.includes(commandCore.substring(0, 40))
  );

  if (echoIndex >= 0) {
    // Remove everything up to and including the echo line
    return lines.slice(echoIndex + 1).join('\n');
  }

  return output;
}

/**
 * Strip the trailing shell prompt from captured output.
 *
 * After a command finishes, the shell prints its prompt. The PromptStreamParser
 * uses the prompt position to delimit the output boundary, but this helper is
 * useful when cleaning output that was captured by other means (e.g., abort).
 *
 * @param output      — captured output that may end with a prompt line
 * @param promptRegex — regex matching the shell prompt (from buildPromptRegex)
 * @returns output with the trailing prompt removed and trailing whitespace trimmed
 */
export function stripTrailingPrompt(output: string, promptRegex: RegExp): string {
  const lines = output.split('\n');

  // Walk backwards to find the last non-empty line
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '') continue;
    if (promptRegex.test(lines[i])) {
      lines.splice(i, 1);
      break;
    }
    // Last non-empty line is not a prompt — stop looking
    break;
  }

  return lines.join('\n').replace(/\n+$/, '');
}
