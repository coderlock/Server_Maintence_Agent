/**
 * Risk pattern definitions for command classification.
 * Patterns are grouped by severity and checked in order:
 * blocked → dangerous → caution → safe → default (caution)
 */

export interface RiskPattern {
  pattern: RegExp;
  level: 'safe' | 'caution' | 'dangerous' | 'blocked';
  category: string;
  reason: string;
  warningMessage?: string;
}

// ── Blocked — never execute, always reject ────────────────────────────────────

export const DEFAULT_BLOCKED_PATTERNS: RiskPattern[] = [
  {
    pattern: /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?\/\s*$/,
    level: 'blocked',
    category: 'filesystem-destruction',
    reason: 'Recursive deletion of root filesystem',
    warningMessage: 'This command would destroy the entire filesystem.',
  },
  {
    pattern: /dd\s+.*of=\/dev\/[sh]d[a-z]\b/,
    level: 'blocked',
    category: 'disk-overwrite',
    reason: 'Direct write to system disk',
    warningMessage: 'This command would overwrite a disk device directly.',
  },
  {
    pattern: /mkfs\.\w+\s+\/dev\/[sh]d[a-z][0-9]?/,
    level: 'blocked',
    category: 'filesystem-format',
    reason: 'Formatting a disk partition',
  },
  {
    pattern: /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;?\s*:/,
    level: 'blocked',
    category: 'fork-bomb',
    reason: 'Fork bomb detected',
  },
  {
    pattern: />\s*\/dev\/[sh]d[a-z]/,
    level: 'blocked',
    category: 'disk-overwrite',
    reason: 'Redirecting output to disk device',
  },
];

// ── Dangerous — require explicit user approval ────────────────────────────────

export const DEFAULT_DANGEROUS_PATTERNS: RiskPattern[] = [
  {
    pattern: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*)/,
    level: 'dangerous',
    category: 'recursive-delete',
    reason: 'Recursive or forced file deletion',
    warningMessage: 'This will permanently delete files. This action cannot be undone.',
  },
  {
    pattern: /apt(-get)?\s+(remove|purge|autoremove)/,
    level: 'dangerous',
    category: 'package-removal',
    reason: 'Removing software packages',
    warningMessage: 'Removing packages may affect other services.',
  },
  {
    pattern: /systemctl\s+(disable|mask|stop)\s+/,
    level: 'dangerous',
    category: 'service-modification',
    reason: 'Disabling or stopping system services',
  },
  {
    pattern: /userdel|groupdel/,
    level: 'dangerous',
    category: 'user-modification',
    reason: 'Deleting users or groups',
  },
  {
    pattern: /chmod\s+[0-7]*[0-7]{3}/,
    level: 'dangerous',
    category: 'permission-change',
    reason: 'Changing file permissions',
  },
  {
    pattern: /chown\s+/,
    level: 'dangerous',
    category: 'ownership-change',
    reason: 'Changing file ownership',
  },
  {
    pattern: /iptables|ufw\s+(deny|delete|reset)/,
    level: 'dangerous',
    category: 'firewall-modification',
    reason: 'Modifying firewall rules',
  },
  {
    pattern: /reboot|shutdown|init\s+[0-6]/,
    level: 'dangerous',
    category: 'system-power',
    reason: 'System reboot or shutdown',
  },
  {
    pattern: />\s*\/etc\//,
    level: 'dangerous',
    category: 'config-overwrite',
    reason: 'Overwriting system configuration file',
  },
  {
    pattern: /passwd/,
    level: 'dangerous',
    category: 'credential-change',
    reason: 'Changing user passwords',
  },
];

// ── Caution — execute automatically in Fixer mode but display warning badge ──

export const DEFAULT_CAUTION_PATTERNS: RiskPattern[] = [
  {
    pattern: /apt(-get)?\s+install/,
    level: 'caution',
    category: 'package-install',
    reason: 'Installing new software',
  },
  {
    pattern: /apt(-get)?\s+update/,
    level: 'caution',
    category: 'package-update',
    reason: 'Updating package lists',
  },
  {
    pattern: /apt(-get)?\s+upgrade/,
    level: 'caution',
    category: 'package-upgrade',
    reason: 'Upgrading installed packages',
  },
  {
    pattern: /systemctl\s+(start|restart|enable)/,
    level: 'caution',
    category: 'service-modification',
    reason: 'Starting or restarting services',
  },
  {
    pattern: /pip3?\s+install/,
    level: 'caution',
    category: 'package-install',
    reason: 'Installing Python packages',
  },
  {
    pattern: /npm\s+install/,
    level: 'caution',
    category: 'package-install',
    reason: 'Installing Node.js packages',
  },
  {
    pattern: /curl\s+.*\|\s*(sudo\s+)?(bash|sh)/,
    level: 'caution',
    category: 'remote-execution',
    reason: 'Downloading and executing remote script',
    warningMessage: 'This pipes a remote script directly into a shell. Review the source first.',
  },
  {
    pattern: /sudo\s+tee/,
    level: 'caution',
    category: 'file-write',
    reason: 'Writing to file with elevated privileges',
  },
  {
    pattern: /mkdir\s+/,
    level: 'caution',
    category: 'filesystem-create',
    reason: 'Creating directories',
  },
];

// ── Safe — read-only / informational commands ─────────────────────────────────

export const DEFAULT_SAFE_PATTERNS: RiskPattern[] = [
  { pattern: /^ls(\s|$)/, level: 'safe', category: 'read', reason: 'List files' },
  { pattern: /^cat\s/, level: 'safe', category: 'read', reason: 'Display file contents' },
  { pattern: /^head\s/, level: 'safe', category: 'read', reason: 'Display file head' },
  { pattern: /^tail\s/, level: 'safe', category: 'read', reason: 'Display file tail' },
  { pattern: /^pwd$/, level: 'safe', category: 'read', reason: 'Print working directory' },
  { pattern: /^whoami$/, level: 'safe', category: 'read', reason: 'Display current user' },
  { pattern: /^df(\s|$)/, level: 'safe', category: 'read', reason: 'Disk usage' },
  { pattern: /^du\s/, level: 'safe', category: 'read', reason: 'Directory usage' },
  { pattern: /^free(\s|$)/, level: 'safe', category: 'read', reason: 'Memory usage' },
  { pattern: /^uptime$/, level: 'safe', category: 'read', reason: 'System uptime' },
  { pattern: /^uname(\s|$)/, level: 'safe', category: 'read', reason: 'System info' },
  { pattern: /^ps\s/, level: 'safe', category: 'read', reason: 'Process list' },
  { pattern: /^top\s+-bn1/, level: 'safe', category: 'read', reason: 'Process snapshot' },
  { pattern: /^systemctl\s+status/, level: 'safe', category: 'read', reason: 'Service status' },
  { pattern: /^journalctl/, level: 'safe', category: 'read', reason: 'View logs' },
  { pattern: /^grep\s/, level: 'safe', category: 'read', reason: 'Search text' },
  { pattern: /^find\s/, level: 'safe', category: 'read', reason: 'Find files' },
  { pattern: /^which\s/, level: 'safe', category: 'read', reason: 'Locate command' },
  { pattern: /^echo\s/, level: 'safe', category: 'read', reason: 'Print text' },
  { pattern: /^date(\s|$)/, level: 'safe', category: 'read', reason: 'Display date' },
  { pattern: /^hostname(\s|$)/, level: 'safe', category: 'read', reason: 'Display hostname' },
  { pattern: /^ip\s+(addr|a|link|route)/, level: 'safe', category: 'read', reason: 'Network info' },
  { pattern: /^ss(\s|$)/, level: 'safe', category: 'read', reason: 'Socket stats' },
  { pattern: /^netstat/, level: 'safe', category: 'read', reason: 'Network stats' },
  { pattern: /^env$/, level: 'safe', category: 'read', reason: 'Environment variables' },
  { pattern: /^printenv/, level: 'safe', category: 'read', reason: 'Print environment variable' },
  { pattern: /^lscpu$/, level: 'safe', category: 'read', reason: 'CPU info' },
  { pattern: /^lsblk$/, level: 'safe', category: 'read', reason: 'Block device info' },
  { pattern: /^lsof/, level: 'safe', category: 'read', reason: 'Open files list' },
  { pattern: /^ping\s+/, level: 'safe', category: 'read', reason: 'Network ping' },
  { pattern: /^curl\s+-[sI]/, level: 'safe', category: 'read', reason: 'HTTP request (silent/head)' },
  { pattern: /^wget\s+--spider/, level: 'safe', category: 'read', reason: 'Check URL' },
  { pattern: /^dpkg\s+-l/, level: 'safe', category: 'read', reason: 'List installed packages' },
  { pattern: /^apt(-get)?\s+(list|show|search)/, level: 'safe', category: 'read', reason: 'Package query' },
];
