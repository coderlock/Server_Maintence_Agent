/**
 * sessionSetup — Sprint 9
 *
 * One-time shell session initialisation that enables invisible exit-code embedding.
 *
 * After an SSH connection is established, we:
 *   1. Detect the remote shell type (bash / zsh / unknown)
 *   2. Build a prompt regex from the connection's username + hostname
 *   3. Inject a PROMPT_COMMAND (bash) or precmd hook (zsh) that embeds the
 *      last exit code in an invisible OSC terminal title sequence before every prompt
 *
 * Result is a ShellSessionInfo that drives RealTerminalStrategy's detection mode:
 *   'prompt'  → clean terminal; invisible OSC + prompt regex for completion detection
 *   'markers' → fall back to Sprint 7 marker wrapping (unknown / unsupported shells)
 */

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Shell metadata stored after session setup.
 * Passed to RealTerminalStrategy so it knows which detection mode to use.
 */
export interface ShellSessionInfo {
  /**
   * Detected shell type.
   * 'bash' and 'zsh' support invisible exit-code embedding.
   * 'unknown' falls back to marker-based detection (Sprint 7 path).
   */
  shellType: 'bash' | 'zsh' | 'unknown';

  /**
   * Regex that matches the shell prompt for this connection.
   * Built from username + hostname (first segment for FQDN support).
   *
   * Example: /(?:\([^)]+\)\s*)?mike@PiTEST:[^$#]*[$#]\s*$/
   *
   * Matches:
   *   mike@PiTEST:~$
   *   mike@PiTEST:/opt/app$
   *   (venv) mike@PiTEST:~$
   *   root@PiTEST:/home/mike#
   */
  promptRegex: RegExp;

  /**
   * Whether the PROMPT_COMMAND / precmd hook was successfully injected.
   * False if the shell is unknown or if injection was skipped.
   */
  setupComplete: boolean;

  /**
   * The detection mode to use in RealTerminalStrategy.
   * 'prompt'  → invisible OSC + prompt regex (bash / zsh)
   * 'markers' → visible command wrapping (fallback for unknown shells)
   */
  detectionMode: 'prompt' | 'markers';
}

// ── Shell type detection ───────────────────────────────────────────────────

/**
 * Detect the active shell on the remote host.
 *
 * Runs `echo $0` via the SSH exec channel (non-PTY) so the query is invisible
 * in the terminal and its output cannot interfere with the PTY stream.
 *
 * @param executeCommand — thin async wrapper around sshManager.executeCommand()
 *                          Returns stdout of the command as a string.
 */
export async function detectActualHostname(
  executeCommand: (cmd: string) => Promise<string>,
): Promise<string | null> {
  try {
    // hostname -s returns the short hostname (first label only) — exactly what
    // the shell prompt shows. Falls back to $HOSTNAME if hostname(1) is absent.
    const short = (await executeCommand('hostname -s 2>/dev/null || echo $HOSTNAME')).trim();
    if (short && short.length > 0) return short.split('.')[0]; // guard against FQDN
    return null;
  } catch {
    return null;
  }
}

export async function detectShellType(
  executeCommand: (cmd: string) => Promise<string>,
): Promise<'bash' | 'zsh' | 'unknown'> {
  try {
    // Single command that is reliable in both interactive and non-interactive
    // exec contexts. $BASH_VERSION / $ZSH_VERSION are set by the shell itself,
    // so they work regardless of how the exec channel invokes the shell.
    // Falls back to $SHELL (the login-shell path from /etc/passwd) if neither
    // version variable is set (e.g. the user's login shell is /bin/sh).
    const result = (await executeCommand(
      'if [ -n "$BASH_VERSION" ]; then echo bash; ' +
      'elif [ -n "$ZSH_VERSION" ]; then echo zsh; ' +
      'else echo "$SHELL"; fi',
    )).trim().toLowerCase();

    console.log('[Session] detectShellType raw result:', JSON.stringify(result));

    if (result === 'bash' || result.includes('/bash')) return 'bash';
    if (result === 'zsh'  || result.includes('/zsh'))  return 'zsh';
    return 'unknown';
  } catch (err) {
    console.warn('[Session] detectShellType failed:', err);
    return 'unknown';
  }
}

// ── Prompt regex construction ─────────────────────────────────────────────

/**
 * Build a shell prompt regex from the connection's username and the server's
 * ACTUAL short hostname (as returned by `hostname -s`, not config.host).
 *
 * The regex is tested against a CSI-stripped copy of the buffer.
 *
 * Supports:
 *   - Short hostnames (FQDN first-label stripping done before calling here)
 *   - Virtual environment / conda prefixes in parentheses: (venv)
 *   - Normal user `$` and root `#` prompt characters
 *   - Any working directory path
 *   - Optional trailing space after the prompt character
 */
export function buildPromptRegex(username: string, hostname: string): RegExp {
  const escUser = escapeRegex(username);
  const escHost = escapeRegex(hostname.split('.')[0]);

  return new RegExp(
    // Optional virtualenv / conda prefix: "(somename) "
    `(?:\\([^)]+\\)\\s*)?` +
    // user@host:
    `${escUser}@${escHost}:` +
    // any path (no $ or # in path names in practice)
    `[^$#]*` +
    // prompt character and optional trailing whitespace at end of chunk
    `[$#]\\s*$`,
  );
}

/**
 * Build a permissive fallback prompt regex when the actual hostname is unknown.
 * Matches any prompt of the form: username@anything:path[$#]
 * The OSC dual-signal requirement prevents false-positive completions.
 */
export function buildFallbackPromptRegex(username: string): RegExp {
  const escUser = escapeRegex(username);
  return new RegExp(
    `(?:\\([^)]+\\)\\s*)?${escUser}@[^:]+:[^$#]*[$#]\\s*$`,
  );
}

// ── Setup command builders ─────────────────────────────────────────────────

/**
 * Build the bash PROMPT_COMMAND setup string.
 *
 * Sets PROMPT_COMMAND to print an invisible OSC title sequence containing the
 * last exit code before every prompt. The user's original PROMPT_COMMAND is
 * preserved via eval so existing customisations are not broken.
 *
 * The produced PROMPT_COMMAND string (stored in the env var) is:
 *   printf "\033]0;SMA:$?\007"; eval "$SMA_ORIG_PC"
 *
 * bash evaluates $? inside PROMPT_COMMAND at run-time (not when PROMPT_COMMAND
 * is defined), so $? correctly holds the exit code of the user's last command.
 */
export function buildBashSetupCommand(): string {
  return (
    // Save any existing PROMPT_COMMAND (empty string if unset)
    'export SMA_ORIG_PC="${PROMPT_COMMAND:-}"; ' +
    // Overwrite PROMPT_COMMAND with our sequence + chain the original
    `export PROMPT_COMMAND='printf "\\033]0;SMA:$?\\007"; eval "$SMA_ORIG_PC"'`
  );
}

/**
 * Build the zsh precmd setup string.
 *
 * Uses add-zsh-hook if available (zsh 4.3.4+) for clean hook registration.
 * Falls back to appending to the precmd_functions array for older releases.
 *
 * The sma_precmd function prints the same invisible OSC sequence as the
 * bash variant so PromptStreamParser needs no separate code path.
 */
export function buildZshSetupCommand(): string {
  return [
    'autoload -Uz add-zsh-hook 2>/dev/null',
    `sma_precmd() { printf "\\033]0;SMA:$?\\007" }`,
    'add-zsh-hook precmd sma_precmd 2>/dev/null || precmd_functions+=(sma_precmd)',
  ].join('; ');
}

// ── PTY injection ─────────────────────────────────────────────────────────

/**
 * Inject the session setup command into the PTY followed by a clear.
 *
 * The setup command itself is briefly visible in the terminal, but the clear
 * removes it immediately. Subsequent commands will have clean, marker-free output.
 *
 * @param sshWrite  — function to write data to the PTY (sshManager.write)
 * @param shellType — detected shell; must be 'bash' or 'zsh'
 */
export function injectSessionSetup(
  sshWrite: (data: string) => void,
  shellType: 'bash' | 'zsh',
): void {
  const cmd = shellType === 'bash' ? buildBashSetupCommand() : buildZshSetupCommand();
  // No `clear` — preserving MOTD / welcome text that the server sent on login.
  // The setup line itself is brief and disappears naturally as the user scrolls.
  sshWrite(cmd + '\n');
}

// ── Full initialisation ───────────────────────────────────────────────────

/**
 * Complete session initialisation flow.
 *
 * 1. Detect shell type (exec channel — invisible)
 * 2. Detect the server's actual short hostname (exec channel — invisible)
 *    NOTE: config.host is the IP/DNS address used to connect, which is usually
 *    NOT what the shell prompt shows. We must query the real hostname.
 * 3. Build a prompt regex from username + actual hostname.
 *    Falls back to a permissive username@*:path$ pattern if detection fails.
 * 4. Inject PROMPT_COMMAND / precmd hook into PTY (if bash or zsh)
 *
 * @param sshWrite       — write to PTY (for injection)
 * @param executeCommand — run a command via the exec channel
 * @param username       — from the connection config
 * @param _configHost    — the IP/DNS used to connect (NOT used for regex)
 */
export async function initializeSession(
  sshWrite: (data: string) => void,
  executeCommand: (cmd: string) => Promise<string>,
  username: string,
  _configHost: string,
): Promise<ShellSessionInfo> {
  // Run sequentially — some SSH servers reject concurrent exec channels,
  // which would cause one detection to silently fail and fall back to markers.
  const shellType      = await detectShellType(executeCommand);
  const actualHostname = await detectActualHostname(executeCommand);

  const promptRegex = actualHostname
    ? buildPromptRegex(username, actualHostname)
    : buildFallbackPromptRegex(username);

  console.log(
    `[Session] shell=${shellType} hostname=${actualHostname ?? '(unknown — using fallback regex)'}`,
  );

  if (shellType === 'bash' || shellType === 'zsh') {
    injectSessionSetup(sshWrite, shellType);

    return {
      shellType,
      promptRegex,
      setupComplete: true,
      detectionMode: 'prompt',
    };
  }

  // Unknown / unsupported shell — fall back to Sprint 7 marker wrapping
  return {
    shellType: 'unknown',
    promptRegex, // still useful for idle-timer prompt detection
    setupComplete: false,
    detectionMode: 'markers',
  };
}

// ── Private helpers ───────────────────────────────────────────────────────

/**
 * Escape all special regex metacharacters in a string so it can be embedded
 * safely inside a RegExp constructor argument.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
