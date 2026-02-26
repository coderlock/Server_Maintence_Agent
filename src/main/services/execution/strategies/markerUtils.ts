/**
 * markerUtils — Sprint 7
 *
 * Generates unique marker IDs and wraps commands with SMA boundary markers
 * for PTY output capture in RealTerminalStrategy.
 */

import { randomBytes } from 'crypto';

/**
 * Generate a cryptographically unique marker ID.
 * 12 hex characters (6 bytes) = 2^48 possible values.
 * Collision probability is negligible for any realistic number of commands.
 */
export function generateMarkerId(): string {
  return randomBytes(6).toString('hex');
}

/**
 * Wrap a command with SMA boundary markers for PTY output capture.
 *
 * The wrapped compound command:
 *   1. Echoes a unique start marker  (signals capture start)
 *   2. Runs the original command with stderr merged into stdout (2>&1)
 *   3. Captures the exit code into SMA_EC immediately (before echo overwrites $?)
 *   4. Echoes an end marker with the exit code embedded
 *
 * POSIX-compatible (bash, zsh, sh, dash, ash).  No bashisms.
 *
 * @param command  — the original shell command to execute
 * @param markerId — unique ID for this execution (from generateMarkerId)
 * @returns the full wrapped command string, ready to write to the PTY with '\n'
 */
export function wrapCommandWithMarkers(command: string, markerId: string): string {
  const startMarker = `===SMA_START_${markerId}===`;
  // Note: the end marker embeds the exit code via shell variable expansion.
  // SMA_EC captures $? immediately after the command — BEFORE the echo that would
  // overwrite it.
  const endMarkerTemplate = `===SMA_EXIT_\${SMA_EC}_END_${markerId}===`;

  return [
    `echo "${startMarker}"`,
    `${command} 2>&1`,
    `SMA_EC=$?`,
    `echo "${endMarkerTemplate}"`,
  ].join('; ');
}
