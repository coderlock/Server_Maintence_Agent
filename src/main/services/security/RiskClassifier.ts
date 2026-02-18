/**
 * RiskClassifier — classifies shell commands by risk level.
 *
 * Checks patterns in priority order: blocked → obfuscation → dangerous → caution → safe
 * Unknown commands default to 'caution'.
 * Compound commands (&&, ||, |, ;) are split and classified by highest-risk component.
 * User whitelist/blacklist can override default patterns.
 */

import {
  RiskPattern,
  DEFAULT_BLOCKED_PATTERNS,
  DEFAULT_DANGEROUS_PATTERNS,
  DEFAULT_CAUTION_PATTERNS,
  DEFAULT_SAFE_PATTERNS,
} from './riskPatterns';
import type { RiskAssessment } from '@shared/types/ai';

export class RiskClassifier {
  private blockedPatterns: RiskPattern[];
  private dangerousPatterns: RiskPattern[];
  private cautionPatterns: RiskPattern[];
  private safePatterns: RiskPattern[];
  private userWhitelist: string[] = [];
  private userBlacklist: string[] = [];

  constructor() {
    this.blockedPatterns = [...DEFAULT_BLOCKED_PATTERNS];
    this.dangerousPatterns = [...DEFAULT_DANGEROUS_PATTERNS];
    this.cautionPatterns = [...DEFAULT_CAUTION_PATTERNS];
    this.safePatterns = [...DEFAULT_SAFE_PATTERNS];
  }

  /**
   * Classify a command string.
   * For compound commands (&&, ||, |, ;) classifies each part and returns the highest risk.
   */
  classifyCommand(command: string): RiskAssessment {
    const trimmed = command.trim();

    if (this.isBlacklisted(trimmed)) {
      return {
        level: 'blocked',
        category: 'user-blacklisted',
        reason: 'Command matches user blacklist pattern',
        requiresApproval: false,
        warningMessage: 'This command has been blocked by your configuration.',
      };
    }

    if (this.isWhitelisted(trimmed)) {
      return {
        level: 'safe',
        category: 'user-whitelisted',
        reason: 'Command matches user whitelist pattern',
        requiresApproval: false,
      };
    }

    const subCommands = this.splitCompoundCommand(trimmed);
    if (subCommands.length > 1) {
      return this.classifyCompoundCommand(subCommands);
    }

    return this.classifySingleCommand(trimmed);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private splitCompoundCommand(command: string): string[] {
    // Split on &&, ||, ; and | (but not inside quotes — simple heuristic)
    const parts = command.split(/\s*(?:&&|\|\||;|\|)\s*/);
    return parts.map(p => p.trim()).filter(p => p.length > 0);
  }

  private classifyCompoundCommand(commands: string[]): RiskAssessment {
    const assessments = commands.map(cmd => this.classifySingleCommand(cmd));
    const riskOrder: Record<string, number> = {
      blocked: 4, dangerous: 3, caution: 2, safe: 1,
    };
    assessments.sort((a, b) => riskOrder[b.level] - riskOrder[a.level]);
    const highest = assessments[0];
    return {
      ...highest,
      reason: `Compound command — highest risk component: ${highest.reason}`,
    };
  }

  private classifySingleCommand(command: string): RiskAssessment {
    const withoutSudo = command.replace(/^sudo\s+/, '');

    for (const p of this.blockedPatterns) {
      if (p.pattern.test(command) || p.pattern.test(withoutSudo)) {
        return {
          level: 'blocked',
          category: p.category,
          reason: p.reason,
          requiresApproval: false,
          warningMessage: p.warningMessage ?? 'This command is blocked for safety.',
        };
      }
    }

    const obfuscation = this.checkObfuscation(command);
    if (obfuscation) return obfuscation;

    for (const p of this.dangerousPatterns) {
      if (p.pattern.test(command) || p.pattern.test(withoutSudo)) {
        return {
          level: 'dangerous',
          category: p.category,
          reason: p.reason,
          requiresApproval: true,
          warningMessage: p.warningMessage,
        };
      }
    }

    for (const p of this.cautionPatterns) {
      if (p.pattern.test(command) || p.pattern.test(withoutSudo)) {
        return {
          level: 'caution',
          category: p.category,
          reason: p.reason,
          requiresApproval: false,
          warningMessage: p.warningMessage,
        };
      }
    }

    for (const p of this.safePatterns) {
      if (p.pattern.test(command) || p.pattern.test(withoutSudo)) {
        return {
          level: 'safe',
          category: p.category,
          reason: p.reason,
          requiresApproval: false,
        };
      }
    }

    // Unknown — default caution
    return {
      level: 'caution',
      category: 'unknown',
      reason: 'Command not in known patterns — defaulting to caution',
      requiresApproval: false,
    };
  }

  private checkObfuscation(command: string): RiskAssessment | null {
    if (
      /base64\s+-d.*\|\s*(bash|sh)/.test(command) ||
      /echo\s+.*\|\s*base64\s+-d\s*\|\s*(bash|sh)/.test(command)
    ) {
      return {
        level: 'dangerous',
        category: 'obfuscated-execution',
        reason: 'Base64-encoded command piped to shell — contents cannot be verified',
        requiresApproval: true,
        warningMessage: 'This command decodes and executes hidden content. Review carefully.',
      };
    }
    if (/eval\s+\$/.test(command)) {
      return {
        level: 'dangerous',
        category: 'obfuscated-execution',
        reason: 'eval with variable expansion — contents cannot be statically verified',
        requiresApproval: true,
      };
    }
    if (/\\x[0-9a-fA-F]{2}.*\|\s*(bash|sh)/.test(command)) {
      return {
        level: 'dangerous',
        category: 'obfuscated-execution',
        reason: 'Hex-encoded command piped to shell',
        requiresApproval: true,
      };
    }
    return null;
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  addToWhitelist(pattern: string): void { this.userWhitelist.push(pattern); }
  addToBlacklist(pattern: string): void { this.userBlacklist.push(pattern); }
  removeFromWhitelist(pattern: string): void { this.userWhitelist = this.userWhitelist.filter(p => p !== pattern); }
  removeFromBlacklist(pattern: string): void { this.userBlacklist = this.userBlacklist.filter(p => p !== pattern); }
  getWhitelist(): string[] { return [...this.userWhitelist]; }
  getBlacklist(): string[] { return [...this.userBlacklist]; }
  isBlocked(command: string): boolean { return this.classifyCommand(command).level === 'blocked'; }

  private isWhitelisted(command: string): boolean {
    return this.userWhitelist.some(p => {
      try { return new RegExp(p).test(command); } catch { return command.includes(p); }
    });
  }

  private isBlacklisted(command: string): boolean {
    return this.userBlacklist.some(p => {
      try { return new RegExp(p).test(command); } catch { return command.includes(p); }
    });
  }
}

export const riskClassifier = new RiskClassifier();
