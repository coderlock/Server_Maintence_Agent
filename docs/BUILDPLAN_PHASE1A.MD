Create detailed Phase 1A build plan markdown document
Server Maintenance Agent - Phase 1A Build Plan

Version: 1.0
Date: Feb 2025
Phase: MVP Foundation
Duration: 6 Weeks (6 Sprints)
Table of Contents

┌─────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 1 SPRINT **COMPLETED**                      │
├──────────┬──────────────────────────────────────────────────────────────────┤
│ Sprint 1 │ Project Foundation  **COMPLETED**                                │
│ Week 1   │ ████████████████████████████████████████████████████████████████ │
│          │ • Electron + React + TypeScript setup                            │
│          │ • Project structure                                              │
│          │ • IPC architecture                                               │
│          │ • Basic window with layout                                       │
├──────────┼──────────────────────────────────────────────────────────────────┤
│ Sprint 2 │ SSH Integration    **COMPLETED**                                 │
│ Week 2   │ ████████████████████████████████████████████████████████████████ │
│          │ • SSH connection service                                         │
│          │ • Connection storage (encrypted)                                 │
│          │ • OS detection                                                   │
│          │ • Connection management UI                                       │
├──────────┼──────────────────────────────────────────────────────────────────┤
│ Sprint 3 │ Terminal & UI    **COMPLETED**                                   │
│ Week 3   │ ████████████████████████████████████████████████████████████████ │
│          │ • xterm.js integration                                           │
│          │ • PTY session management                                         │
│          │ • Split pane layout                                              │
│          │ • VSCode-like styling                                            │
├──────────┼──────────────────────────────────────────────────────────────────┤
│ Sprint 4 │ AI Integration    **COMPLETED**                                  │
│ Week 4   │ ████████████████████████████████████████████████████████████████ │
│          │ • Claude API integration                                         │
│          │ • Chat interface                                                 │
│          │ • Context building                                               │
│          │ • Session persistence                                            │
├──────────┼──────────────────────────────────────────────────────────────────┤


┌─────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 1A SPRINT SCHEDULE **Sprint 5 COMPLETED**  │
├──────────┬──────────────────────────────────────────────────────────────────┤
│ Sprint 5 │ Plan Execution Engine  ✅ COMPLETED                              │
│ Week 5   │ ████████████████████████████████████████████████████████████████ │
│          │ • Plan generation & parsing                                      │
│          │ • Risk classification                                            │
│          │ • Fixer mode execution                                           │
│          │ • Teacher mode display                                           │
│          │ • Approval workflows                                             │
├──────────┼──────────────────────────────────────────────────────────────────┤
│ Sprint 6 │ Polish & Integration Testing                                     │
│ Week 6   │ ████████████████████████████████████████████████████████████████ │
│          │ • End-to-end testing                                             │
│          │ • Bug fixes                                                      │
│          │ • Performance optimization                                       │
│          │ • Documentation                                                  │
│          │ • Build & packaging                                              │
└──────────┴──────────────────────────────────────────────────────────────────┘



### Updated Sprint 5: Plan Execution Engine (Agent-Ready)
8. Sprint 5: Plan Execution Engine

Duration: Week 5 (5 days)
Goal: Implement plan generation, risk classification, command execution with safety checks, and structured step evaluation that the future agent loop will wrap around
8.1 Sprint 5 Objectives

    Parse and validate AI-generated plans
    Implement risk classification system
    Build Fixer Mode automated execution
    Build Teacher Mode guided display
    Implement approval workflows for dangerous commands
    🆕 Evaluate each step result via AI after execution
    🆕 Emit extensible PlanEvent stream through IPC
    🆕 Persist ExecutionRecord with structured StepResult per step
    🆕 Keep plan generation and step execution as independent, composable functions (not one monolith)

8.2 Day-by-Day Breakdown
Day 1: Risk Classification & Plan Parsing

Tasks:

text

□ Task 5.1.1: Create RiskClassifier service
  └── File: src/main/services/security/RiskClassifier.ts
  └── Pattern-based command classification
  └── Default safe/caution/dangerous patterns
  └── User-configurable whitelist/blacklist
  └── Compound command handling (pipes, &&, ||)

□ Task 5.1.2: Create default risk patterns database
  └── File: src/main/services/security/riskPatterns.ts
  └── Safe command patterns
  └── Cautionary command patterns
  └── Dangerous command patterns
  └── Blocked command patterns

□ Task 5.1.3: Create PlanParser service
  └── File: src/main/services/execution/PlanParser.ts
  └── Validate AI-generated plan structure
  └── Normalize plan format
  └── Cross-reference risk classification with AI's assessment

□ Task 5.1.4: Create plan-related shared types
  └── File: src/shared/types/plan.ts (update)
  └── Ensure ExecutionPlan steps include expectedOutput
  └── Add plan validation error types

□ Task 5.1.5: Unit tests for RiskClassifier
  └── Test safe commands
  └── Test dangerous commands
  └── Test compound commands
  └── Test edge cases (obfuscated commands, base64, etc.)

Code: src/main/services/security/riskPatterns.ts

typescript

export interface RiskPattern {
  pattern: RegExp;
  level: 'safe' | 'caution' | 'dangerous' | 'blocked';
  category: string;
  reason: string;
  warningMessage?: string;
}

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
    pattern: /chown\s+(-R\s+)?/,
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
    pattern: /mkdir\s+(-p\s+)?/,
    level: 'caution',
    category: 'filesystem-create',
    reason: 'Creating directories',
  },
];

export const DEFAULT_SAFE_PATTERNS: RiskPattern[] = [
  { pattern: /^ls(\s|$)/, level: 'safe', category: 'read', reason: 'List files' },
  { pattern: /^cat\s/, level: 'safe', category: 'read', reason: 'Display file contents' },
  { pattern: /^head\s/, level: 'safe', category: 'read', reason: 'Display file head' },
  { pattern: /^tail\s/, level: 'safe', category: 'read', reason: 'Display file tail' },
  { pattern: /^pwd$/, level: 'safe', category: 'read', reason: 'Print working directory' },
  { pattern: /^whoami$/, level: 'safe', category: 'read', reason: 'Display current user' },
  { pattern: /^df\s/, level: 'safe', category: 'read', reason: 'Disk usage' },
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
  { pattern: /^ss\s/, level: 'safe', category: 'read', reason: 'Socket stats' },
  { pattern: /^netstat/, level: 'safe', category: 'read', reason: 'Network stats' },
];

Code: src/main/services/security/RiskClassifier.ts

typescript

import { RiskPattern, 
  DEFAULT_BLOCKED_PATTERNS, 
  DEFAULT_DANGEROUS_PATTERNS, 
  DEFAULT_CAUTION_PATTERNS, 
  DEFAULT_SAFE_PATTERNS 
} from './riskPatterns';
import { RiskAssessment } from '@shared/types/execution';

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
   * Classify a single command or compound command.
   * For compound commands (&&, ||, |, ;), classifies each part
   * and returns the HIGHEST risk level found.
   */
  classifyCommand(command: string): RiskAssessment {
    const trimmed = command.trim();

    // Check user blacklist first
    if (this.isBlacklisted(trimmed)) {
      return {
        level: 'blocked',
        category: 'user-blacklisted',
        reason: 'Command matches user blacklist pattern',
        requiresApproval: false,
        warningMessage: 'This command has been blocked by your configuration.',
      };
    }

    // Check user whitelist
    if (this.isWhitelisted(trimmed)) {
      return {
        level: 'safe',
        category: 'user-whitelisted',
        reason: 'Command matches user whitelist pattern',
        requiresApproval: false,
      };
    }

    // Split compound commands and assess each part
    const subCommands = this.splitCompoundCommand(trimmed);

    if (subCommands.length > 1) {
      return this.classifyCompoundCommand(subCommands);
    }

    return this.classifySingleCommand(trimmed);
  }

  /**
   * Split compound commands on &&, ||, |, and ;
   * Respects quoted strings and subshells.
   */
  private splitCompoundCommand(command: string): string[] {
    // Simple split — handles most common cases
    // A production implementation would need a proper shell parser
    const parts = command.split(/\s*(?:&&|\|\||;)\s*/);
    return parts
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  private classifyCompoundCommand(commands: string[]): RiskAssessment {
    const assessments = commands.map(cmd => this.classifySingleCommand(cmd));

    // Return the highest risk level
    const riskOrder: Record<string, number> = {
      'blocked': 4,
      'dangerous': 3,
      'caution': 2,
      'safe': 1,
    };

    assessments.sort((a, b) => riskOrder[b.level] - riskOrder[a.level]);
    const highest = assessments[0];

    // Annotate that this is a compound command
    return {
      ...highest,
      reason: `Compound command — highest risk component: ${highest.reason}`,
    };
  }

  private classifySingleCommand(command: string): RiskAssessment {
    // Strip leading sudo for pattern matching
    const withoutSudo = command.replace(/^sudo\s+/, '');

    // Check blocked patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.pattern.test(command) || pattern.pattern.test(withoutSudo)) {
        return {
          level: 'blocked',
          category: pattern.category,
          reason: pattern.reason,
          requiresApproval: false,
          warningMessage: pattern.warningMessage || 'This command is blocked for safety.',
        };
      }
    }

    // Check for obfuscation attempts
    const obfuscationCheck = this.checkObfuscation(command);
    if (obfuscationCheck) {
      return obfuscationCheck;
    }

    // Check dangerous patterns
    for (const pattern of this.dangerousPatterns) {
      if (pattern.pattern.test(command) || pattern.pattern.test(withoutSudo)) {
        return {
          level: 'dangerous',
          category: pattern.category,
          reason: pattern.reason,
          requiresApproval: true,
          warningMessage: pattern.warningMessage,
        };
      }
    }

    // Check caution patterns
    for (const pattern of this.cautionPatterns) {
      if (pattern.pattern.test(command) || pattern.pattern.test(withoutSudo)) {
        return {
          level: 'caution',
          category: pattern.category,
          reason: pattern.reason,
          requiresApproval: false,
          warningMessage: pattern.warningMessage,
        };
      }
    }

    // Check safe patterns
    for (const pattern of this.safePatterns) {
      if (pattern.pattern.test(command) || pattern.pattern.test(withoutSudo)) {
        return {
          level: 'safe',
          category: pattern.category,
          reason: pattern.reason,
          requiresApproval: false,
        };
      }
    }

    // Default: unknown commands are treated as caution
    return {
      level: 'caution',
      category: 'unknown',
      reason: 'Command not recognized — defaulting to caution',
      requiresApproval: false,
    };
  }

  /**
   * Detect obfuscated dangerous commands.
   * This is not exhaustive but catches common tricks.
   */
  private checkObfuscation(command: string): RiskAssessment | null {
    // Detect base64 piped to shell
    if (/base64\s+-d.*\|\s*(bash|sh)/.test(command) || 
        /echo\s+.*\|\s*base64\s+-d\s*\|\s*(bash|sh)/.test(command)) {
      return {
        level: 'dangerous',
        category: 'obfuscated-execution',
        reason: 'Base64-encoded command piped to shell — contents cannot be verified',
        requiresApproval: true,
        warningMessage: 'This command decodes and executes hidden content. Review carefully.',
      };
    }

    // Detect eval with variables
    if (/eval\s+\$/.test(command)) {
      return {
        level: 'dangerous',
        category: 'obfuscated-execution',
        reason: 'eval with variable expansion — contents cannot be statically verified',
        requiresApproval: true,
      };
    }

    // Detect hex/octal encoded strings piped to shell
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

  // ── Configuration ──────────────────────────────────────────────

  addToWhitelist(pattern: string): void {
    this.userWhitelist.push(pattern);
  }

  addToBlacklist(pattern: string): void {
    this.userBlacklist.push(pattern);
  }

  removeFromWhitelist(pattern: string): void {
    this.userWhitelist = this.userWhitelist.filter(p => p !== pattern);
  }

  removeFromBlacklist(pattern: string): void {
    this.userBlacklist = this.userBlacklist.filter(p => p !== pattern);
  }

  getWhitelist(): string[] {
    return [...this.userWhitelist];
  }

  getBlacklist(): string[] {
    return [...this.userBlacklist];
  }

  private isWhitelisted(command: string): boolean {
    return this.userWhitelist.some(pattern => {
      try {
        return new RegExp(pattern).test(command);
      } catch {
        return command.includes(pattern);
      }
    });
  }

  private isBlacklisted(command: string): boolean {
    return this.userBlacklist.some(pattern => {
      try {
        return new RegExp(pattern).test(command);
      } catch {
        return command.includes(pattern);
      }
    });
  }

  isBlocked(command: string): boolean {
    const assessment = this.classifyCommand(command);
    return assessment.level === 'blocked';
  }
}

export const riskClassifier = new RiskClassifier();

Code: src/main/services/execution/PlanParser.ts

typescript

import { v4 as uuidv4 } from 'uuid';
import { ExecutionPlan, PlanStep } from '@shared/types';
import { RiskAssessment } from '@shared/types/execution';
import { riskClassifier } from '../security/RiskClassifier';

export interface PlanValidationError {
  field: string;
  message: string;
}

export class PlanParser {
  /**
   * Validate and normalize a raw AI-generated plan.
   * Cross-references AI's risk assessment with our own RiskClassifier.
   * Always trusts the STRICTER assessment.
   */
  validateAndNormalize(rawPlan: any): { 
    plan: ExecutionPlan | null; 
    errors: PlanValidationError[] 
  } {
    const errors: PlanValidationError[] = [];

    if (!rawPlan || typeof rawPlan !== 'object') {
      errors.push({ field: 'plan', message: 'Plan is not a valid object' });
      return { plan: null, errors };
    }

    if (!rawPlan.goal || typeof rawPlan.goal !== 'string') {
      errors.push({ field: 'goal', message: 'Plan must have a goal string' });
    }

    if (!Array.isArray(rawPlan.steps) || rawPlan.steps.length === 0) {
      errors.push({ field: 'steps', message: 'Plan must have at least one step' });
      return { plan: null, errors };
    }

    // Validate each step
    const normalizedSteps: PlanStep[] = [];

    for (let i = 0; i < rawPlan.steps.length; i++) {
      const step = rawPlan.steps[i];

      if (!step.command || typeof step.command !== 'string') {
        errors.push({ field: `steps[${i}].command`, message: `Step ${i + 1} must have a command` });
        continue;
      }

      // Cross-reference risk: use STRICTER of AI assessment vs our classifier
      const classifierRisk = riskClassifier.classifyCommand(step.command);
      const aiRiskLevel = step.riskLevel || 'caution';
      const finalRisk = this.stricter(classifierRisk, aiRiskLevel);

      // Block if classifier says blocked
      if (classifierRisk.level === 'blocked') {
        errors.push({
          field: `steps[${i}].command`,
          message: `Step ${i + 1} command is blocked: ${classifierRisk.reason}`,
        });
        continue;
      }

      normalizedSteps.push({
        id: uuidv4(),
        index: i,
        description: step.description || `Step ${i + 1}`,
        command: step.command.trim(),
        riskAssessment: finalRisk,
        status: 'pending',
        explanation: step.explanation || '',
        expectedOutput: step.expectedOutput || '',
        verificationCommand: step.verificationCommand || undefined,
      });
    }

    if (normalizedSteps.length === 0) {
      errors.push({ field: 'steps', message: 'No valid steps after validation' });
      return { plan: null, errors };
    }

    const plan: ExecutionPlan = {
      id: uuidv4(),
      goal: rawPlan.goal || 'Unknown goal',
      successCriteria: rawPlan.successCriteria || [],
      steps: normalizedSteps,
      status: 'pending',
      currentStepIndex: 0,
      createdAt: new Date().toISOString(),
      rollbackPlan: rawPlan.rollbackPlan || [],
      estimatedTime: rawPlan.estimatedTime || undefined,
    };

    return { plan, errors };
  }

  /**
   * Returns the stricter of two risk assessments.
   * This ensures the AI can't downgrade a risk our classifier flags.
   */
  private stricter(classifierRisk: RiskAssessment, aiLevel: string): RiskAssessment {
    const riskOrder: Record<string, number> = {
      'safe': 0,
      'caution': 1,
      'dangerous': 2,
      'blocked': 3,
    };

    const classifierLevel = riskOrder[classifierRisk.level] || 1;
    const aiLevelNum = riskOrder[aiLevel] || 1;

    if (classifierLevel >= aiLevelNum) {
      return classifierRisk;
    }

    // AI flagged higher risk than classifier — trust AI's assessment
    return {
      ...classifierRisk,
      level: aiLevel as any,
      reason: `AI assessment: ${aiLevel} (classifier: ${classifierRisk.level})`,
      requiresApproval: aiLevel === 'dangerous',
    };
  }
}

export const planParser = new PlanParser();

Deliverables:

    ✅ RiskClassifier with comprehensive patterns
    ✅ Compound command handling
    ✅ Obfuscation detection
    ✅ PlanParser with cross-referenced risk assessment
    ✅ Unit tests for classification

Day 2: Plan Execution Engine (Core) 🆕 RESTRUCTURED

This is the most critical day for agent-readiness. The execution engine is built as three independent, composable functions rather than one monolithic executor.

Tasks:

text

🆕 Task 5.2.1: Create CommandExecutor service
  └── File: src/main/services/execution/CommandExecutor.ts
  └── Execute a SINGLE command via SSH
  └── Return structured CommandResult
  └── Timeout handling
  └── This is a pure function: command in, result out

🆕 Task 5.2.2: Create StepExecutor service
  └── File: src/main/services/execution/StepExecutor.ts
  └── Execute a single plan step (command + risk check + evaluation)
  └── Returns StepResult including AI assessment
  └── Independent from plan iteration — doesn't know about other steps

🆕 Task 5.2.3: Create PlanExecutor service
  └── File: src/main/services/execution/PlanExecutor.ts
  └── AsyncGenerator that yields PlanEvents
  └── Iterates through steps using StepExecutor
  └── Pause/resume/cancel support
  └── Persists ExecutionRecord after each step

□ Task 5.2.4: Create execution IPC handlers
  └── File: src/main/ipc/plan.handler.ts
  └── Start plan execution
  └── Pause/resume/cancel
  └── Approve/reject dangerous commands
  └── Forward PlanEvents to renderer

□ Task 5.2.5: Test plan execution flow
  └── Safe commands auto-execute
  └── Dangerous commands pause for approval
  └── Results are structured and persisted

🆕 Code: src/main/services/execution/CommandExecutor.ts

This is the lowest-level building block. It executes one command and returns structured data. Both the plan executor and future agent loop use this.

typescript

import { CommandResult } from '@shared/types/execution';

// Interface for SSH execution — decoupled from ssh2 implementation
export interface SSHExecutor {
  executeCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export class CommandExecutor {
  private defaultTimeout: number = 120000; // 2 minutes

  constructor(private ssh: SSHExecutor) {}

  /**
   * Execute a single command and return a structured result.
   * This is deliberately simple and stateless.
   * It does NOT know about plans, risk levels, or AI.
   */
  async execute(command: string, timeout?: number): Promise<CommandResult> {
    const startTime = Date.now();
    const timeoutMs = timeout || this.defaultTimeout;

    try {
      const result = await Promise.race([
        this.ssh.executeCommand(command),
        this.createTimeout(timeoutMs),
      ]);

      if (result === null) {
        // Timed out
        return {
          command,
          exitCode: -1,
          stdout: '',
          stderr: `Command timed out after ${timeoutMs}ms`,
          duration: timeoutMs,
          timedOut: true,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: Date.now() - startTime,
        timedOut: false,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        command,
        exitCode: -1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        timedOut: false,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private createTimeout(ms: number): Promise<null> {
    return new Promise(resolve => setTimeout(() => resolve(null), ms));
  }
}

🆕 Code: src/main/services/execution/StepExecutor.ts

Executes a single step: risk check → execute → evaluate. The plan executor calls this per step. The future agent loop also calls this per step (with retry logic wrapped around it).

typescript

import { v4 as uuidv4 } from 'uuid';
import { PlanStep } from '@shared/types';
import { CommandResult, StepResult, StepAssessment, PlanEvent } from '@shared/types/execution';
import { CommandExecutor } from './CommandExecutor';
import { riskClassifier } from '../security/RiskClassifier';
import { aiOrchestrator } from '../ai/AIOrchestrator';
import { AIContext } from '../ai/AIContext';

export interface ApprovalHandler {
  requestApproval(stepId: string, command: string, risk: any): Promise<'approve' | 'reject' | 'skip'>;
}

export class StepExecutor {
  constructor(
    private commandExecutor: CommandExecutor,
    private approvalHandler: ApprovalHandler,
  ) {}

  /**
   * Execute a single plan step. Returns structured StepResult.
   * Yields PlanEvents during execution for UI updates.
   * 
   * This method is self-contained — it doesn't know about other steps
   * or the overall plan. This makes it composable:
   * - PlanExecutor calls it in a loop
   * - Future AgentLoop calls it with retry logic around it
   */
  async *executeStep(
    step: PlanStep,
    context: AIContext,
  ): AsyncGenerator<PlanEvent, StepResult> {
    // 1. Risk check
    const risk = riskClassifier.classifyCommand(step.command);

    if (risk.level === 'blocked') {
      const result: StepResult = {
        stepId: step.id,
        stepIndex: step.index,
        command: step.command,
        commandResult: {
          command: step.command,
          exitCode: -1,
          stdout: '',
          stderr: 'Command blocked by risk classifier',
          duration: 0,
          timedOut: false,
          timestamp: new Date().toISOString(),
        },
        assessment: {
          succeeded: false,
          confidence: 'high',
          reason: `Command blocked: ${risk.reason}`,
          suggestedAction: 'revise-plan',
        },
        timestamp: new Date().toISOString(),
      };
      yield { type: 'step-failed', stepId: step.id, result };
      return result;
    }

    // 2. Approval for dangerous commands
    if (risk.level === 'dangerous' || risk.requiresApproval) {
      yield { type: 'approval-needed', stepId: step.id, command: step.command, risk };

      const decision = await this.approvalHandler.requestApproval(step.id, step.command, risk);

      yield { type: 'approval-received', stepId: step.id, approved: decision === 'approve' };

      if (decision === 'reject') {
        const result: StepResult = {
          stepId: step.id,
          stepIndex: step.index,
          command: step.command,
          commandResult: {
            command: step.command,
            exitCode: -1,
            stdout: '',
            stderr: 'Rejected by user',
            duration: 0,
            timedOut: false,
            timestamp: new Date().toISOString(),
          },
          assessment: {
            succeeded: false,
            confidence: 'high',
            reason: 'User rejected this command',
            suggestedAction: 'ask-user',
          },
          timestamp: new Date().toISOString(),
        };
        yield { type: 'step-failed', stepId: step.id, result };
        return result;
      }

      if (decision === 'skip') {
        yield { type: 'step-skipped', stepId: step.id, reason: 'User chose to skip' };
        const result: StepResult = {
          stepId: step.id,
          stepIndex: step.index,
          command: step.command,
          commandResult: {
            command: step.command,
            exitCode: -1,
            stdout: '',
            stderr: 'Skipped by user',
            duration: 0,
            timedOut: false,
            timestamp: new Date().toISOString(),
          },
          assessment: {
            succeeded: false,
            confidence: 'high',
            reason: 'Step skipped by user',
            suggestedAction: 'continue',
          },
          timestamp: new Date().toISOString(),
        };
        return result;
      }
    }

    // 3. Execute
    yield { type: 'step-started', stepId: step.id, stepIndex: step.index, command: step.command };

    const commandResult = await this.commandExecutor.execute(step.command);

    // 4. Evaluate result via AI
    let assessment: StepAssessment;
    try {
      assessment = await aiOrchestrator.evaluateStepResult(
        commandResult,
        step.expectedOutput || step.description,
        context,
      );
    } catch (error) {
      // If AI evaluation fails, fall back to exit code
      assessment = {
        succeeded: commandResult.exitCode === 0,
        confidence: 'low',
        reason: `AI evaluation unavailable. Exit code: ${commandResult.exitCode}`,
        suggestedAction: commandResult.exitCode === 0 ? 'continue' : 'ask-user',
      };
    }

    const stepResult: StepResult = {
      stepId: step.id,
      stepIndex: step.index,
      command: step.command,
      commandResult,
      assessment,
      timestamp: new Date().toISOString(),
    };

    // 5. Emit appropriate event
    if (assessment.succeeded) {
      yield { type: 'step-completed', stepId: step.id, result: stepResult };
    } else {
      yield { type: 'step-failed', stepId: step.id, result: stepResult };
    }

    return stepResult;
  }
}

🆕 Code: src/main/services/execution/PlanExecutor.ts

This iterates through plan steps using StepExecutor. It's an AsyncGenerator that yields PlanEvents — the UI subscribes to these. The future agent loop replaces this class (or wraps it) with retry/replan logic.

typescript

import { ExecutionPlan, PlanStep } from '@shared/types';
import { 
  PlanEvent, StepResult, ExecutionRecord, 
} from '@shared/types/execution';
import { StepExecutor, ApprovalHandler } from './StepExecutor';
import { CommandExecutor } from './CommandExecutor';
import { AIContext } from '../ai/AIContext';
import { sessionStore } from '../storage/SessionStore';
import { contextBuilder } from '../ai/ContextBuilder';
import { OSInfo, ActiveConnection } from '@shared/types';

interface PlanExecutorConfig {
  connection: ActiveConnection;
  osInfo: OSInfo;
  mode: 'fixer' | 'teacher';
  connectionId: string;
}

export class PlanExecutor {
  private stepExecutor: StepExecutor;
  private isPaused: boolean = false;
  private isCancelled: boolean = false;
  private pauseResolve: (() => void) | null = null;

  constructor(
    commandExecutor: CommandExecutor,
    approvalHandler: ApprovalHandler,
  ) {
    this.stepExecutor = new StepExecutor(commandExecutor, approvalHandler);
  }

  /**
   * Execute a plan step by step.
   * Yields PlanEvents for UI consumption.
   * 
   * Currently: linear execution with pause/cancel.
   * Future agent loop: wraps this with retry/replan logic,
   * or replaces it entirely using StepExecutor directly.
   */
  async *execute(
    plan: ExecutionPlan,
    config: PlanExecutorConfig,
  ): AsyncGenerator<PlanEvent> {
    const completedSteps: StepResult[] = [];
    let totalTokensUsed = 0;

    // Create execution record
    const record: ExecutionRecord = {
      planId: plan.id,
      goal: plan.goal,
      startedAt: new Date().toISOString(),
      status: 'in-progress',
      steps: [],
      totalTokensUsed: 0,
    };
    sessionStore.saveExecutionRecord(config.connectionId, record);

    try {
      for (let i = plan.currentStepIndex; i < plan.steps.length; i++) {
        // Check for cancellation
        if (this.isCancelled) {
          yield {
            type: 'plan-cancelled',
            reason: 'Cancelled by user',
            completedSteps: completedSteps.length,
          };

          sessionStore.updateExecutionRecord(config.connectionId, plan.id, {
            status: 'cancelled',
            completedAt: new Date().toISOString(),
          });
          return;
        }

        // Check for pause
        if (this.isPaused) {
          await this.waitForResume();
        }

        const step = plan.steps[i];

        // Build fresh context for this step
        // (Future agent loop builds context differently — with failure history, etc.)
        const stepContext = new AIContext();
        stepContext.addSystemInfo(config.connection, config.osInfo);
        stepContext.addMode(config.mode);
        stepContext.addCurrentTask(plan.goal, plan.steps, i);
        stepContext.addTerminalOutput(contextBuilder.getRecentTerminalOutput());

        // If there were previous step failures, include them
        const failures = completedSteps.filter(s => !s.assessment.succeeded);
        if (failures.length > 0) {
          stepContext.addFailureHistory(failures);
        }

        // Execute step — yields PlanEvents
        const stepGen = this.stepExecutor.executeStep(step, stepContext);

        let stepResult: StepResult | undefined;

        while (true) {
          const { value, done } = await stepGen.next();

          if (done) {
            stepResult = value as StepResult;
            break;
          }

          // Forward PlanEvent to caller (which forwards to renderer via IPC)
          yield value as PlanEvent;
        }

        if (stepResult) {
          completedSteps.push(stepResult);

          // Persist step result
          sessionStore.addStepResult(config.connectionId, plan.id, stepResult);

          // Update plan state
          plan.currentStepIndex = i + 1;
          plan.steps[i].status = stepResult.assessment.succeeded ? 'completed' : 'failed';

          // 🆕 Log the assessment — in current executor we just continue.
          // Future agent loop uses this to decide retry/replan.
          if (!stepResult.assessment.succeeded) {
            console.warn(
              `Step ${i + 1} failed: ${stepResult.assessment.reason}`,
              `Suggested action: ${stepResult.assessment.suggestedAction}`
            );
            // Current behavior: continue to next step (or stop if critical)
            // Future agent behavior: retry, replan, or escalate based on suggestedAction
            
            // For now, stop on failure
            yield {
              type: 'step-failed',
              stepId: step.id,
              result: stepResult,
            };

            // Stop execution on failure (agent loop will handle this differently)
            yield {
              type: 'plan-cancelled',
              reason: `Step ${i + 1} failed: ${stepResult.assessment.reason}`,
              completedSteps: completedSteps.length,
            };

            sessionStore.updateExecutionRecord(config.connectionId, plan.id, {
              status: 'failed',
              completedAt: new Date().toISOString(),
              finalOutcome: stepResult.assessment.reason,
            });
            return;
          }
        }
      }

      // All steps completed
      yield {
        type: 'plan-completed',
        results: completedSteps,
      };

      sessionStore.updateExecutionRecord(config.connectionId, plan.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        finalOutcome: 'All steps completed successfully',
      });

    } catch (error) {
      yield {
        type: 'plan-cancelled',
        reason: error instanceof Error ? error.message : 'Unknown error',
        completedSteps: completedSteps.length,
      };

      sessionStore.updateExecutionRecord(config.connectionId, plan.id, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        finalOutcome: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  cancel(): void {
    this.isCancelled = true;
    // Also resume if paused so the loop can exit
    this.resume();
  }

  private waitForResume(): Promise<void> {
    return new Promise(resolve => {
      this.pauseResolve = resolve;
    });
  }
}

Deliverables:

    ✅ CommandExecutor: structured results from SSH commands
    ✅ StepExecutor: single step with risk + execute + evaluate
    ✅ PlanExecutor: full plan iteration with events
    🆕 Each layer is independently usable (agent loop can use StepExecutor directly)
    🆕 AI evaluates every step result
    🆕 ExecutionRecords persisted after each step

Day 3: Fixer Mode & Teacher Mode

Tasks:

text

□ Task 5.3.1: Implement Fixer Mode UI integration
  └── File: src/renderer/components/PlanView/FixerPlanView.tsx
  └── Auto-execute display
  └── Progress indicator
  └── Real-time step status updates
  └── PlanEvent consumption from IPC

□ Task 5.3.2: Implement Teacher Mode UI
  └── File: src/renderer/components/PlanView/TeacherPlanView.tsx
  └── Command blocks with explanations
  └── Copy to clipboard button
  └── Paste & execute button (one at a time)
  └── Step-by-step progression

□ Task 5.3.3: Create PlanView container
  └── File: src/renderer/components/PlanView/PlanView.tsx
  └── Switches between Fixer and Teacher mode views
  └── Renders current plan state (data-driven, not flow-driven)
  └── Handles PlanEvent stream from IPC

□ Task 5.3.4: Create usePlanExecution hook
  └── File: src/renderer/hooks/usePlanExecution.ts
  └── Subscribe to PlanEvent IPC channel
  └── Update plan state from events
  └── Expose pause/resume/cancel controls

□ Task 5.3.5: Wire up mode toggle
  └── Mode selector in menu bar
  └── Mode persisted in settings
  └── Mode passed to AI context

🆕 Code: src/renderer/hooks/usePlanExecution.ts

The key design choice here: the hook maintains plan state derived from events. It doesn't assume forward-only progress. This means future agent events (plan-revised, retry-attempt) can update the view without rewriting this hook.

typescript

import { useCallback, useEffect, useReducer } from 'react';
import { ExecutionPlan, PlanStep } from '@shared/types';
import { PlanEvent, StepResult } from '@shared/types/execution';

interface PlanExecutionState {
  plan: ExecutionPlan | null;
  isExecuting: boolean;
  isPaused: boolean;
  currentStepIndex: number;
  stepResults: Map<string, StepResult>;
  error: string | null;
  // 🆕 These fields support future agent events without state restructuring
  isReplanning: boolean;
  retryInfo: { stepId: string; attempt: number; maxAttempts: number } | null;
  agentMessage: string | null;
}

type PlanAction =
  | { type: 'SET_PLAN'; plan: ExecutionPlan }
  | { type: 'PLAN_EVENT'; event: PlanEvent }
  | { type: 'SET_EXECUTING'; isExecuting: boolean }
  | { type: 'SET_PAUSED'; isPaused: boolean }
  | { type: 'CLEAR' };

function planReducer(state: PlanExecutionState, action: PlanAction): PlanExecutionState {
  switch (action.type) {
    case 'SET_PLAN':
      return {
        ...state,
        plan: action.plan,
        currentStepIndex: 0,
        stepResults: new Map(),
        error: null,
        isReplanning: false,
        retryInfo: null,
        agentMessage: null,
      };

    case 'PLAN_EVENT': {
      const event = action.event;

      switch (event.type) {
        case 'step-started':
          return {
            ...state,
            currentStepIndex: event.stepIndex,
          };

        case 'step-completed': {
          const newResults = new Map(state.stepResults);
          newResults.set(event.stepId, event.result);
          return {
            ...state,
            stepResults: newResults,
            currentStepIndex: state.currentStepIndex + 1,
          };
        }

        case 'step-failed': {
          const newResults = new Map(state.stepResults);
          newResults.set(event.stepId, event.result);
          return {
            ...state,
            stepResults: newResults,
            error: event.result.assessment.reason,
          };
        }

        case 'step-skipped':
          return {
            ...state,
            currentStepIndex: state.currentStepIndex + 1,
          };

        case 'approval-needed':
          return {
            ...state,
            isPaused: true, // Effectively paused while waiting for approval
          };

        case 'approval-received':
          return {
            ...state,
            isPaused: false,
          };

        case 'plan-completed':
          return {
            ...state,
            isExecuting: false,
          };

        case 'plan-cancelled':
          return {
            ...state,
            isExecuting: false,
            error: event.reason,
          };

        // 🆕 Future agent events — handled gracefully even now
        case 'plan-revised':
          return {
            ...state,
            isReplanning: false,
            agentMessage: `Plan revised: ${event.reason}`,
          };

        case 'retry-attempt':
          return {
            ...state,
            retryInfo: {
              stepId: event.stepId,
              attempt: event.attempt,
              maxAttempts: event.maxAttempts,
            },
          };

        case 'agent-thinking':
          return {
            ...state,
            agentMessage: event.message,
            isReplanning: true,
          };

        case 'agent-stuck':
          return {
            ...state,
            isExecuting: false,
            error: `Agent stuck: ${event.reason} (${event.failedAttempts} attempts)`,
          };

        case 'budget-warning':
          return {
            ...state,
            agentMessage: `Budget warning: ${event.iterationsRemaining} iterations remaining`,
          };

        default:
          return state;
      }
    }

    case 'SET_EXECUTING':
      return { ...state, isExecuting: action.isExecuting };

    case 'SET_PAUSED':
      return { ...state, isPaused: action.isPaused };

    case 'CLEAR':
      return initialState;

    default:
      return state;
  }
}

const initialState: PlanExecutionState = {
  plan: null,
  isExecuting: false,
  isPaused: false,
  currentStepIndex: 0,
  stepResults: new Map(),
  error: null,
  isReplanning: false,
  retryInfo: null,
  agentMessage: null,
};

export function usePlanExecution() {
  const [state, dispatch] = useReducer(planReducer, initialState);

  // Subscribe to plan events from main process
  useEffect(() => {
    const unsubEvent = window.electronAPI.plan.onEvent((event: PlanEvent) => {
      dispatch({ type: 'PLAN_EVENT', event });
    });

    const unsubGenerated = window.electronAPI.plan.onGenerated((plan: ExecutionPlan) => {
      dispatch({ type: 'SET_PLAN', plan });
    });

    return () => {
      unsubEvent();
      unsubGenerated();
    };
  }, []);

  const startExecution = useCallback(async (plan: ExecutionPlan) => {
    dispatch({ type: 'SET_EXECUTING', isExecuting: true });
    await window.electronAPI.plan.execute(plan.id);
  }, []);

  const pause = useCallback(() => {
    dispatch({ type: 'SET_PAUSED', isPaused: true });
    window.electronAPI.plan.pause();
  }, []);

  const resume = useCallback(() => {
    dispatch({ type: 'SET_PAUSED', isPaused: false });
    window.electronAPI.plan.resume();
  }, []);

  const cancel = useCallback(() => {
    window.electronAPI.plan.cancel();
    dispatch({ type: 'SET_EXECUTING', isExecuting: false });
  }, []);

  const approveDangerous = useCallback((stepId: string, approved: boolean) => {
    window.electronAPI.plan.approve(stepId, approved);
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  return {
    ...state,
    startExecution,
    pause,
    resume,
    cancel,
    approveDangerous,
    clear,
  };
}

Code: src/renderer/components/PlanView/PlanView.tsx

typescript

import React from 'react';
import { usePlanExecution } from '@/hooks/usePlanExecution';
import { useChatStore } from '@/store/chatStore';
import { FixerPlanView } from './FixerPlanView';
import { TeacherPlanView } from './TeacherPlanView';

export const PlanView: React.FC = () => {
  const { mode } = useChatStore();
  const execution = usePlanExecution();

  if (!execution.plan) {
    return null;
  }

  // 🆕 Data-driven rendering: the view reflects current state,
  // regardless of how that state was reached (linear execution,
  // agent retry, replanning, etc.)
  const planWithStatus = {
    ...execution.plan,
    steps: execution.plan.steps.map(step => ({
      ...step,
      status: execution.stepResults.has(step.id)
        ? execution.stepResults.get(step.id)!.assessment.succeeded
          ? 'completed' as const
          : 'failed' as const
        : step.index === execution.currentStepIndex && execution.isExecuting
          ? 'running' as const
          : 'pending' as const,
      result: execution.stepResults.get(step.id) || undefined,
    })),
  };

  return (
    <div className="plan-view">
      {/* 🆕 Agent status messages (hidden when no agent, visible when agent is active) */}
      {execution.agentMessage && (
        <div className="agent-status-bar">
          {execution.isReplanning ? '🔄' : 'ℹ️'} {execution.agentMessage}
        </div>
      )}

      {execution.retryInfo && (
        <div className="retry-indicator">
          🔁 Retrying step — attempt {execution.retryInfo.attempt} of {execution.retryInfo.maxAttempts}
        </div>
      )}

      {mode === 'fixer' ? (
        <FixerPlanView
          plan={planWithStatus}
          isExecuting={execution.isExecuting}
          isPaused={execution.isPaused}
          onStart={() => execution.startExecution(execution.plan!)}
          onPause={execution.pause}
          onResume={execution.resume}
          onCancel={execution.cancel}
          onApprove={execution.approveDangerous}
          error={execution.error}
        />
      ) : (
        <TeacherPlanView
          plan={planWithStatus}
          onCopyCommand={(command) => navigator.clipboard.writeText(command)}
          onExecuteCommand={(command) => window.electronAPI.terminal.write(command + '\n')}
        />
      )}
    </div>
  );
};

Deliverables:

    ✅ Fixer Mode auto-execution with live updates
    ✅ Teacher Mode with explanations and copy/execute
    ✅ Data-driven plan view (supports non-linear state changes)
    🆕 UI already handles future agent events gracefully

Day 4: Approval Workflows & IPC Integration

Tasks:

text

□ Task 5.4.1: Create Dangerous Command Approval modal
  └── File: src/renderer/components/Modals/ApprovalModal.tsx
  └── Command display with risk info
  └── Approve / Skip / Cancel Plan buttons
  └── Context about which plan step this is

□ Task 5.4.2: Implement approval flow in main process
  └── IPC-based approval: main requests, renderer responds
  └── Timeout handling (auto-cancel if no response)
  └── Wire ApprovalHandler interface to IPC

□ Task 5.4.3: Create Caution warning display
  └── In-chat warning bubble for caution-level commands
  └── Brief pause before auto-execution in Fixer mode
  └── Full display in Teacher mode

□ Task 5.4.4: Implement plan IPC handlers
  └── File: src/main/ipc/plan.handler.ts
  └── Wire PlanExecutor to IPC event forwarding
  └── Handle approval responses
  └── Manage executor lifecycle

□ Task 5.4.5: Test approval workflows
  └── Dangerous command triggers modal
  └── Approve continues execution
  └── Reject stops/skips step
  └── Cancel stops entire plan

Code: src/main/ipc/plan.handler.ts

typescript

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipcChannels';
import { PlanExecutor } from '../services/execution/PlanExecutor';
import { CommandExecutor } from '../services/execution/CommandExecutor';
import { ApprovalHandler } from '../services/execution/StepExecutor';
import { sshManager } from '../services/ssh/SSHManager';
import { PlanEvent } from '@shared/types/execution';
import { ExecutionPlan } from '@shared/types';

let activePlanExecutor: PlanExecutor | null = null;
let pendingApproval: {
  resolve: (decision: 'approve' | 'reject' | 'skip') => void;
} | null = null;

export function registerPlanHandlers(mainWindow: BrowserWindow): void {

  // Create approval handler that bridges to renderer
  const approvalHandler: ApprovalHandler = {
    requestApproval(stepId, command, risk): Promise<'approve' | 'reject' | 'skip'> {
      return new Promise((resolve) => {
        pendingApproval = { resolve };
        mainWindow.webContents.send(IPC_CHANNELS.PLAN.APPROVAL_NEEDED, {
          stepId,
          command,
          risk,
        });
      });
    },
  };

  // Start plan execution
  ipcMain.handle(IPC_CHANNELS.PLAN.EXECUTE, async (_event, planId: string) => {
    const connection = sshManager.getActiveConnection();
    if (!connection) {
      throw new Error('No active SSH connection');
    }

    // Get the plan from wherever it's stored (chat store sends it)
    // For now, plans are passed directly
    // TODO: store plans and look up by ID

    const commandExecutor = new CommandExecutor(connection);

    activePlanExecutor = new PlanExecutor(commandExecutor, approvalHandler);

    // This would be called with the actual plan
    // The executor yields events which we forward to renderer
  });

  // Forward plan events to renderer
  function forwardPlanEvent(event: PlanEvent): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PLAN.EVENT, event);
    }
  }

  // Handle approval response from renderer
  ipcMain.on(IPC_CHANNELS.PLAN.APPROVAL_RESPONSE, (_event, { stepId, decision }) => {
    if (pendingApproval) {
      pendingApproval.resolve(decision);
      pendingApproval = null;
    }
  });

  // Pause
  ipcMain.on(IPC_CHANNELS.PLAN.PAUSE, () => {
    activePlanExecutor?.pause();
  });

  // Resume
  ipcMain.on(IPC_CHANNELS.PLAN.RESUME, () => {
    activePlanExecutor?.resume();
  });

  // Cancel
  ipcMain.on(IPC_CHANNELS.PLAN.CANCEL, () => {
    activePlanExecutor?.cancel();
    activePlanExecutor = null;
  });
}

Deliverables:

    ✅ Approval modal for dangerous commands
    ✅ Caution warnings display
    ✅ Full IPC pipeline for plan events
    ✅ Approval flow bridges main ↔ renderer

Day 5: Integration Testing & Polish

Tasks:

text

□ Task 5.5.1: End-to-end plan execution test
  └── Ask AI to install something
  └── Verify plan generated and parsed
  └── Verify risk classification correct
  └── Verify step-by-step execution
  └── Verify approval modal triggers for dangerous commands
  └── Verify session persistence of execution records

□ Task 5.5.2: Teacher Mode end-to-end test
  └── Commands display with explanations
  └── Copy/paste works
  └── Step progression is manual

□ Task 5.5.3: Error scenario testing
  └── Test with command that fails (bad package name)
  └── Test with SSH disconnect mid-plan
  └── Test with AI API failure during evaluation
  └── Verify graceful degradation

🆕 Task 5.5.4: Verify agent-readiness
  └── Verify CommandResult is always structured (exit code, stdout, stderr)
  └── Verify StepResult includes AI assessment for every executed step
  └── Verify ExecutionRecords are persisted with step-level detail
  └── Verify PlanEvent stream includes all event types
  └── Verify StepExecutor can be called independently of PlanExecutor
  └── Verify AIContext can be built without going through ContextBuilder

□ Task 5.5.5: Bug fixes and polish
  └── Fix issues found in testing
  └── Polish plan view animations
  └── Polish approval modal
  └── Improve error messages

8.3 Sprint 5 Definition of Done

    ✅ AI-generated plans are parsed and validated
    ✅ Risk classification works with comprehensive patterns
    ✅ Compound commands are classified by highest-risk component
    ✅ Fixer Mode executes plans automatically
    ✅ Teacher Mode displays plans with explanations
    ✅ Dangerous commands trigger approval modal
    ✅ Blocked commands are rejected
    ✅ Plan execution can be paused, resumed, and cancelled
    ✅ Session persistence includes execution records
    🆕 Every executed step has a structured CommandResult (not just terminal strings)
    🆕 Every executed step has an AI StepAssessment
    🆕 CommandExecutor, StepExecutor, and PlanExecutor are independent, composable services
    🆕 PlanEvent stream supports all current and future event types
    🆕 usePlanExecution hook handles agent events gracefully (no-ops for now, ready for later)
    🆕 ExecutionRecord with per-step results persisted for every plan run

How the Future Agent Loop Plugs In

After Sprint 6 (polish) and shipping the MVP, here's what the agent loop implementation looks like given what you've built:

typescript

// This is ~150 lines of new code, composing everything from Sprints 4-5

class AgentLoop {
  constructor(
    private stepExecutor: StepExecutor,      // Built in Sprint 5
    private planParser: PlanParser,          // Built in Sprint 5  
    private aiOrchestrator: AIOrchestrator,  // Built in Sprint 4
    private sessionStore: SessionStore,      // Built in Sprint 4
  ) {}

  async *pursue(
    goal: string,
    constraints: AgentConstraints,    // maxIterations, maxRetries, etc.
    config: PlanExecutorConfig,
  ): AsyncGenerator<PlanEvent> {      // Same event type the UI already handles
    
    let context = new AIContext();     // Built in Sprint 4
    context.addSystemInfo(config.connection, config.osInfo);
    context.addMode(config.mode);

    // Generate initial plan (existing AI orchestrator)
    let plan = await this.generatePlan(goal, context);
    let iteration = 0;
    let failures: StepResult[] = [];

    while (iteration < constraints.maxIterations) {
      yield { type: 'agent-thinking', message: `Iteration ${iteration + 1}` };

      for (const step of plan.remainingSteps()) {
        // Execute step (existing StepExecutor)
        const result = await this.executeAndCollect(
          this.stepExecutor.executeStep(step,

Claude Opus 4.6

continue

typescript

          // continuing from where we left off...
          this.stepExecutor.executeStep(step, context)
        );

        // Forward all events to the UI (same PlanEvent stream)
        for (const event of result.events) {
          yield event;
        }

        if (result.stepResult.assessment.succeeded) {
          // Step succeeded — continue to next
          continue;
        }

        // Step failed — this is where the agent differs from the plan executor
        failures.push(result.stepResult);
        
        // Add failure to context so AI knows what was tried
        context.addFailureHistory(failures);
        context.addCommandResult(result.stepResult.commandResult);

        const action = result.stepResult.assessment.suggestedAction;

        if (action === 'retry' && failures.length < constraints.maxRetriesPerStep) {
          yield { 
            type: 'retry-attempt', 
            stepId: step.id, 
            attempt: failures.length, 
            maxAttempts: constraints.maxRetriesPerStep 
          };
          // Re-execute same step (StepExecutor handles it)
          continue;
        }

        if (action === 'revise-plan') {
          yield { type: 'agent-thinking', message: 'Revising plan based on failure...' };
          
          // Ask AI to revise the plan given what failed
          // Uses existing aiOrchestrator.call() with agent-specific context
          const revisedPlan = await this.revisePlan(plan, step, failures, context);
          
          if (revisedPlan) {
            plan = revisedPlan;
            yield { 
              type: 'plan-revised', 
              reason: `Step "${step.description}" failed, plan updated`, 
              newStepCount: plan.steps.length 
            };
            iteration++;
            break; // Restart from revised plan
          }
        }

        if (action === 'ask-user' || failures.length >= constraints.maxRetriesPerStep) {
          yield { 
            type: 'agent-stuck', 
            reason: result.stepResult.assessment.reason, 
            failedAttempts: failures.length 
          };
          // Wait for human input or stop
          return;
        }
      }

      // Check if all steps completed
      if (plan.allStepsComplete()) {
        yield { type: 'plan-completed', results: this.getAllResults() };

        // Verify goal was actually achieved
        const verified = await this.verifyGoal(goal, plan, context);
        if (verified) {
          return; // Success!
        }
        
        // Goal not verified — replan
        yield { type: 'agent-thinking', message: 'Plan completed but goal not verified. Replanning...' };
        iteration++;
        continue;
      }

      iteration++;
    }

    // Budget exhausted
    yield { 
      type: 'budget-warning', 
      iterationsRemaining: 0, 
      tokensUsed: this.aiOrchestrator.getSessionTokensUsed() 
    };
  }

  private async revisePlan(
    currentPlan: ExecutionPlan,
    failedStep: PlanStep,
    failures: StepResult[],
    context: AIContext,
  ): Promise<ExecutionPlan | null> {
    // Build agent-specific context for replanning
    const replanContext = new AIContext();       // Sprint 4 AIContext
    
    // Copy system info from existing context
    replanContext.addSystemInfo(context.getSystemInfo());
    replanContext.addMode('fixer');
    
    // Add what was already completed
    replanContext.addCurrentTask(
      currentPlan.goal, 
      currentPlan.steps, 
      failedStep.index
    );
    
    // Add failure history — this is the critical context for replanning
    replanContext.addFailureHistory(failures);

    // Add agent state
    replanContext.addAgentState({
      iteration: this.currentIteration,
      maxIterations: this.constraints.maxIterations,
      consecutiveFailures: failures.length,
      goal: currentPlan.goal,
      assessment: `Step "${failedStep.description}" failed after ${failures.length} attempts`,
    });

    // Call AI with replanning prompt
    const response = await this.aiOrchestrator.call(   // Sprint 4 generic call()
      replanContext,
      [{
        role: 'user',
        content: [
          `The current plan to "${currentPlan.goal}" has hit a problem.`,
          `Step ${failedStep.index + 1} ("${failedStep.description}") failed.`,
          `Command: \`${failedStep.command}\``,
          `Error: ${failures[failures.length - 1].commandResult.stderr}`,
          ``,
          `Previously completed steps still apply. Please revise the remaining`,
          `steps to achieve the original goal. Respond with an updated plan`,
          `in the standard JSON format.`,
        ].join('\n'),
      }],
    );

    // Parse the revised plan using existing PlanParser
    const { plan } = this.planParser.validateAndNormalize(    // Sprint 5 PlanParser
      this.extractPlanJson(response.content)
    );

    return plan;
  }

  private async verifyGoal(
    goal: string,
    plan: ExecutionPlan,
    context: AIContext,
  ): Promise<boolean> {
    // Run verification commands from the plan if they exist
    if (plan.successCriteria.length === 0) {
      return true; // No criteria to verify
    }

    // Ask AI to generate a verification command
    const verifyContext = new AIContext();
    verifyContext.addSystemInfo(context.getSystemInfo());
    verifyContext.addTerminalOutput(
      contextBuilder.getRecentTerminalOutput()     // Sprint 4 ContextBuilder
    );

    const response = await this.aiOrchestrator.call(
      verifyContext,
      [{
        role: 'user',
        content: [
          `The plan to "${goal}" has completed all steps.`,
          `Success criteria: ${plan.successCriteria.join(', ')}`,
          `Please provide a single verification command that confirms the goal was achieved.`,
          `Respond with just the command, no explanation.`,
        ].join('\n'),
      }],
    );

    // Execute the verification command
    const result = await this.commandExecutor.execute(    // Sprint 5 CommandExecutor
      response.content.trim()
    );

    // Ask AI if the verification passed
    const assessment = await this.aiOrchestrator.evaluateStepResult(  // Sprint 4 evaluateStepResult()
      result,
      `Verification that: ${goal}`,
      context,
    );

    return assessment.succeeded;
  }

  // Helper to collect events from an async generator
  private async executeAndCollect(
    gen: AsyncGenerator<PlanEvent, StepResult>,
  ): Promise<{ events: PlanEvent[]; stepResult: StepResult }> {
    const events: PlanEvent[] = [];
    let stepResult: StepResult;

    while (true) {
      const { value, done } = await gen.next();
      if (done) {
        stepResult = value as StepResult;
        break;
      }
      events.push(value as PlanEvent);
    }

    return { events, stepResult: stepResult! };
  }
}

Notice what's happening here — every dependency is something you already built:

text

┌──────────────────────────────────────────────────────────────────┐
│                    AGENT LOOP DEPENDENCY MAP                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  AgentLoop (NEW — ~200 lines)                                    │
│  │                                                                │
│  ├── StepExecutor ────────── Sprint 5, Day 2 ✅                  │
│  │   ├── CommandExecutor ─── Sprint 5, Day 2 ✅                  │
│  │   ├── RiskClassifier ──── Sprint 5, Day 1 ✅                  │
│  │   └── ApprovalHandler ─── Sprint 5, Day 4 ✅                  │
│  │                                                                │
│  ├── PlanParser ──────────── Sprint 5, Day 1 ✅                  │
│  │                                                                │
│  ├── AIOrchestrator ──────── Sprint 4, Day 3 ✅                  │
│  │   ├── .call() ─────────── Sprint 4, Day 3 ✅                  │
│  │   └── .evaluateStepResult() Sprint 4, Day 3 ✅               │
│  │                                                                │
│  ├── AIContext ───────────── Sprint 4, Day 1 ✅                  │
│  │   ├── .addFailureHistory()  Sprint 4, Day 1 ✅               │
│  │   ├── .addAgentState()      Sprint 4, Day 1 ✅               │
│  │   └── .addCommandResult()   Sprint 4, Day 1 ✅               │
│  │                                                                │
│  ├── SessionStore ────────── Sprint 4, Day 4 ✅                  │
│  │   └── .executionRecords     Sprint 4, Day 4 ✅               │
│  │                                                                │
│  └── PlanEvent types ─────── Sprint 4, Day 1 ✅                  │
│      ├── plan-revised          Already defined ✅                 │
│      ├── retry-attempt         Already defined ✅                 │
│      ├── agent-thinking        Already defined ✅                 │
│      ├── agent-stuck           Already defined ✅                 │
│      └── budget-warning        Already defined ✅                 │
│                                                                   │
│  UI CHANGES NEEDED:                                               │
│  │                                                                │
│  ├── usePlanExecution hook ── Already handles agent events ✅    │
│  ├── PlanView component ──── Already renders agent status ✅     │
│  │                                                                │
│  └── NEW: Agent controls UI    ~half day of work                 │
│      ├── Start agent mode button                                  │
│      ├── Max iterations config                                    │
│      ├── Budget display                                           │
│      └── "Agent is stuck" dialog                                  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

The AgentConstraints Type

You asked about max loop count. Here's what you'd configure:

typescript

// src/shared/types/agent.ts — defined now (just the type), implemented later

export interface AgentConstraints {
  // ── Loop Budgets ──────────────────────────────────────────
  maxIterations: number;           // Total replan cycles (default: 5)
  maxRetriesPerStep: number;       // Retries per failing step (default: 3)
  maxConsecutiveFailures: number;  // Failures in a row before stopping (default: 3)
  
  // ── Time Budgets ──────────────────────────────────────────
  executionTimeout: number;        // Total wall-clock time in ms (default: 600000 = 10 min)
  stepTimeout: number;             // Per-command timeout in ms (default: 120000 = 2 min)
  
  // ── Cost Budgets ──────────────────────────────────────────
  maxTokenBudget: number;          // Max API tokens to spend (default: 100000)
  
  // ── Autonomy Level ────────────────────────────────────────
  // Controls what the agent can do without asking
  autonomyLevel: 'full' | 'supervised' | 'cautious';
  // full: auto-execute safe+caution, approve dangerous
  // supervised: approve caution+dangerous, auto-execute safe
  // cautious: approve everything except safe read-only commands
  
  // ── Escalation ────────────────────────────────────────────
  requireApprovalForReplan: boolean;  // Ask human before revising plan (default: false)
  escalateAfterRetries: number;       // Ask human after N failed retries (default: 2)
}

export const DEFAULT_AGENT_CONSTRAINTS: AgentConstraints = {
  maxIterations: 5,
  maxRetriesPerStep: 3,
  maxConsecutiveFailures: 3,
  executionTimeout: 600000,
  stepTimeout: 120000,
  maxTokenBudget: 100000,
  autonomyLevel: 'supervised',
  requireApprovalForReplan: false,
  escalateAfterRetries: 2,
};

You can define this type file now (it's just types, no implementation) so it's already in your codebase when you build the agent. Or wait — it doesn't affect anything structurally.
