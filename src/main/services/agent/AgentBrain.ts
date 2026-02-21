/**
 * AgentBrain — consults the LLM when a plan step fails in Agentic mode.
 *
 * Responsibility: given the failed step, the raw error output, and the
 * rolling AgentContext (history + summary), produce an AgentCorrection
 * that the PlanExecutor will apply to the live plan.
 *
 * Design principles:
 *  - One public method: analyzeFailure()
 *  - Returns a validated AgentCorrection; falls back to 'abort' on parse errors
 *  - Never throws — caller handles fallback via the 'abort' action
 */

import type { PlanStep } from '@shared/types';
import type { AgentCorrection, ProtoStep, StepResult } from '@shared/types/execution';
import { aiOrchestrator } from '../ai/AIOrchestrator';
import type { AgentContext } from './AgentContext';
import { detectInteractivePrompt } from '../../utils/interactivePromptPatterns';

// ── System prompt ──────────────────────────────────────────────────────────

const AGENT_BRAIN_SYSTEM_PROMPT = `You are an expert Linux server repair agent embedded in an automated maintenance tool.

A command just failed during an automated maintenance plan. Your job is to:
1. Analyse the failed command, its exit code, and the stderr output.
2. Decide on the best corrective action.
3. Return ONLY a JSON object — no markdown fences, no explanation text outside the JSON.

## Corrective Actions

| action          | When to use |
|-----------------|-------------|
| retry           | Likely transient failure (network hiccup, lock file, race condition). Retry the SAME command. |
| modify          | The command is almost right but needs a small tweak (different flag, different path). Set modifiedCommand. |
| insert_steps    | The failure reveals missing prerequisites (package not installed, dir doesn't exist, service not running). Insert 1-3 repair steps before retrying. |
| skip            | Failure is harmless and execution can continue (e.g. file already exists, service already stopped). |
| abort           | Failure is unrecoverable without human input (permission denied for root operations, hardware error, unknown state). |

## Interactive prompt detected
If the output contains a pattern like "(y/N)", "[Y/n]", "Overwrite?", "Proceed?", "Are you sure?",
"Enter passphrase", "Enter password", or similar, the command is waiting for stdin which is not
available in automated mode. Use action=modify and add the appropriate non-interactive flag:
- gpg: add --batch --yes
- apt / apt-get: ensure -y is present
- wget / curl destination: pre-delete the file with insert_steps (sudo rm -f <file>)
- cp / mv / install prompts: add -f or --force
- Any other tool: find the equivalent --yes / --non-interactive / --force / --batch flag.
Never retry an interactive prompt without fixing it — it will stall again.

## Response schema
{
  "action": "retry | modify | insert_steps | skip | abort",
  "reasoning": "<1-2 short sentences: why this action>",
  "modifiedCommand": "<new command string — only for action=modify or action=retry>",
  "newSteps": [
    {
      "description": "<human-readable description>",
      "command": "<exact shell command>",
      "riskLevel": "safe | caution | dangerous",
      "explanation": "<why this step is needed>",
      "expectedOutput": "<what success looks like>"
    }
  ]
}

Rules:
- newSteps is required only for insert_steps (1–3 steps max).
- modifiedCommand is required for modify; optional for retry (omit to retry exactly).
- Prefer safe / caution risk levels. Only use dangerous if there is no safer alternative.
- Do NOT suggest commands that require interactive input (no nano, vi, read, etc.).
- Always use non-interactive flags (e.g. apt-get install -y, not apt-get install).
- Be conservative: if uncertain, choose abort rather than guessing.`;

// ── Helpers ────────────────────────────────────────────────────────────────

const VALID_ACTIONS = new Set(['retry', 'modify', 'insert_steps', 'skip', 'abort'] as const);

function isValidAction(v: unknown): v is AgentCorrection['action'] {
  return typeof v === 'string' && VALID_ACTIONS.has(v as AgentCorrection['action']);
}

function safeParseCorrection(raw: string): AgentCorrection {
  try {
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ?? [null, raw];
    const parsed = JSON.parse(jsonMatch[1]!) as Partial<AgentCorrection>;

    if (!isValidAction(parsed.action)) {
      throw new Error(`Invalid action: ${String(parsed.action)}`);
    }

    const correction: AgentCorrection = {
      action: parsed.action,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided',
    };

    if (parsed.modifiedCommand && typeof parsed.modifiedCommand === 'string') {
      correction.modifiedCommand = parsed.modifiedCommand;
    }

    if (parsed.action === 'insert_steps' && Array.isArray(parsed.newSteps)) {
      const validSteps: ProtoStep[] = (parsed.newSteps as unknown[])
        .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
        .map(s => ({
          description: typeof s.description === 'string' ? s.description : 'Auto-generated step',
          command: typeof s.command === 'string' ? s.command : 'true',
          riskLevel: ['safe', 'caution', 'dangerous'].includes(s.riskLevel as string)
            ? s.riskLevel as ProtoStep['riskLevel']
            : 'caution',
          explanation: typeof s.explanation === 'string' ? s.explanation : undefined,
          expectedOutput: typeof s.expectedOutput === 'string' ? s.expectedOutput : undefined,
        }))
        .slice(0, 3); // hard cap: max 3 new steps per correction

      if (validSteps.length > 0) {
        correction.newSteps = validSteps;
      } else {
        // insert_steps with no valid steps → fall back to abort
        correction.action = 'abort';
        correction.reasoning += ' (no valid repair steps generated)';
      }
    }

    return correction;

  } catch (err) {
    console.error('[AgentBrain] Failed to parse correction:', err, '\nRaw:', raw.slice(0, 500));
    return {
      action: 'abort',
      reasoning: `Agent response could not be parsed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── AgentBrain ─────────────────────────────────────────────────────────────

export class AgentBrain {
  /**
   * Analyse a step failure and return a corrective action.
   *
   * Never throws. On any error (AI unavailable, parse failure, etc.) returns
   * an 'abort' correction so the executor can surface the issue to the user.
   */
  async analyzeFailure(
    step: PlanStep,
    result: StepResult,
    agentCtx: AgentContext,
  ): Promise<AgentCorrection> {
    if (!aiOrchestrator.isInitialized()) {
      return {
        action: 'abort',
        reasoning: 'AI provider is not initialised — cannot analyse failure automatically.',
      };
    }

    const historyContext = agentCtx.toContextString();

    const interactivePrompt = detectInteractivePrompt(result.stdout, result.stderr);

    const userMessage = [
      interactivePrompt
        ? `⚠️ INTERACTIVE PROMPT DETECTED in output: "${interactivePrompt}" — the command stalled waiting for stdin. Fix with a non-interactive flag (see system prompt guidance).`
        : '',
      `## Failed Step`,
      `**Description:** ${step.description}`,
      `**Command:** \`${step.command}\``,
      `**Exit code:** ${result.exitCode}`,
      result.timedOut
        ? '**⚠️ Command timed out** — it may have stalled waiting for interactive stdin (y/N prompt, password, etc.). Consider adding --yes / --batch / --non-interactive / --force flags, or pre-deleting a conflicting file with insert_steps.'
        : '',
      result.stdout.trim() ? `**stdout:**\n\`\`\`\n${result.stdout.slice(0, 1500)}\n\`\`\`` : '',
      result.stderr.trim() ? `**stderr:**\n\`\`\`\n${result.stderr.slice(0, 1000)}\n\`\`\`` : '',
      `**Expected outcome:** ${step.expectedOutput ?? step.description}`,
      '',
      historyContext,
    ].filter(Boolean).join('\n');

    try {
      const response = await aiOrchestrator.callRaw(AGENT_BRAIN_SYSTEM_PROMPT, [
        { role: 'user', content: userMessage },
      ]);
      return safeParseCorrection(response.content);
    } catch (err) {
      console.error('[AgentBrain] AI call failed:', err);
      return {
        action: 'abort',
        reasoning: `AI call failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ── Sprint 8: stall analysis ────────────────────────────────────────────

  /**
   * Analyse a stalled command — called when the hard idle timer fires and no
   * interactive prompt pattern was detected by the detector.
   *
   * The agent examines the command and its last output to determine:
   *   - Is it waiting for unrecognised input? → 'modify' with suggested input text
   *   - Is it performing a slow legitimate operation? → 'retry' (wait longer)
   *   - Is it truly hung? → 'abort'
   *
   * Returns the same AgentCorrection type as analyzeFailure() for pipeline
   * compatibility. The 'retry' action means "reset the hard timer and wait";
   * 'modify' means "send the modifiedCommand as stdin input".
   *
   * Never throws — on error returns 'abort' so the executor can surface it.
   */
  async analyzeStall(
    step: PlanStep,
    result: StepResult,
    agentCtx: AgentContext,
  ): Promise<AgentCorrection> {
    if (!aiOrchestrator.isInitialized()) {
      return {
        action: 'abort',
        reasoning: 'AI provider is not initialised — cannot analyse stall automatically.',
      };
    }

    const historyContext = agentCtx.toContextString();
    const output = `${(result.stdout || '').trim()}\n\n${(result.stderr || '').trim()}`
      .trim()
      .slice(-2000);

    const userMessage = [
      'A command appears to have stalled — no output for an extended period.',
      'Analyze the command and its last output to determine the cause.',
      '',
      'Possible causes:',
      '1. The command is waiting for user input (prompt not recognized by the regex detector)',
      '2. The command is performing a slow legitimate operation (compilation, package download, fsck, etc.)',
      '3. The command is truly hung (deadlock, unresponsive network, zombie process)',
      '',
      'If the command is waiting for input, set action to "modify" and put the',
      'suggested input text in "modifiedCommand" (e.g. "y\\n", "yes\\n", "\\n").',
      'If the command is slow but making progress, set action to "retry" (wait longer).',
      'If the command is hung and unlikely to recover, set action to "abort".',
      '',
      'Respond with a JSON object matching the AgentCorrection schema.',
      '',
      '## Stalled Step',
      `**Description:** ${step.description}`,
      `**Command:** \`${step.command}\``,
      `**Last output (tail):**`,
      '```',
      output || 'No output captured',
      '```',
      '',
      historyContext,
    ].join('\n');

    try {
      const response = await aiOrchestrator.callRaw(AGENT_BRAIN_SYSTEM_PROMPT, [
        { role: 'user', content: userMessage },
      ]);
      return safeParseCorrection(response.content);
    } catch (err) {
      console.error('[AgentBrain] analyzeStall AI call failed:', err);
      return {
        action: 'abort',
        reasoning: `AI call failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

/** Singleton — one brain per app, shared between executor instances */
export const agentBrain = new AgentBrain();
