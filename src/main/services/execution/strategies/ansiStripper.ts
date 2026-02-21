/**
 * ansiStripper — Sprint 7
 *
 * Strips ANSI escape sequences from PTY output before feeding captured text
 * to the Agent Brain.  Plain text is what the LLM needs; escape codes add noise.
 *
 * Handles:
 *   - CSI sequences:  ESC [ … <letter>      (colors, cursor movement, erase)
 *   - OSC sequences:  ESC ] … ST            (window title, hyperlinks)
 *   - Simple escapes: ESC <char>            (cursor save/restore, etc.)
 *   - Carriage-return progress bars: \r…\r  (curl/wget/apt progress output)
 *
 * Processing order is deliberate:
 *   1. Remove ANSI escape sequences first (some contain \r-like byte patterns)
 *   2. Resolve carriage-return lines (progress bar overwrite mechanics)
 *   3. Collapse multiple blank lines left behind by removed color banners
 */
export function stripAnsi(input: string): string {
  // ── Phase 1: Remove ANSI escape sequences ────────────────────────────────
  let result = input
    // CSI sequences: ESC[ followed by parameter bytes and a final letter
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    // OSC sequences: ESC] … terminated by BEL (\x07) or String Terminator (ESC\)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // Simple two-character escapes: ESC followed by a single non-[ non-] character
    .replace(/\x1b[^[\]]/g, '')
    // Lone ESC characters remaining after the above passes
    .replace(/\x1b/g, '');

  // ── Phase 2: Resolve carriage-return progress bars ───────────────────────
  // Lines like "  50%\r  75%\r 100%" → keep only the last non-empty segment.
  result = result
    .split('\n')
    .map((line) => {
      if (!line.includes('\r')) return line;
      const segments = line.split('\r');
      // Return the last non-empty segment (the final overwrite)
      for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i].trim()) return segments[i];
      }
      return segments[segments.length - 1];
    })
    .join('\n');

  // ── Phase 3: Collapse 3+ consecutive blank lines into two ────────────────
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}
