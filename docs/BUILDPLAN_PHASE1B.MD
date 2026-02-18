BUILDPLAN_PHASE1B.MD — Sprint 6: The Agentic Loop

Sprint: 6 of Phase 1
Focus: Transforming the linear PlanExecutor into a dynamic, self-correcting Agentic Loop with context summarization and risk-aware replanning.
1. Executive Summary

In Sprint 5, we built a robust linear executor (PlanExecutor) that runs steps one by one. In Sprint 6, we introduce the Agentic Brain.

When a step fails in Agentic Mode, instead of aborting, the system will:

    Capture the error (stdout/stderr).
    Consult the LLM (AgentBrain) for a fix.
    Validate the fix against the RiskClassifier.
    Mutate the plan (insert new repair steps or modify the current one).
    Resume execution.

We will also implement Context Summarization to prevent token bloat during long troubleshooting sessions, and a 3-Mode Switch to control behavior.
2. Architecture Updates
2.1 The Three Execution Modes

We are refactoring the execution engine to support three distinct modes.
Mode	Identifier	Behavior
Teacher	'teacher'	Manual execution. User clicks "Run" on each step. No auto-correction. (Existing functionality)
Planner	'planner'	(Formerly "Fixer"). Runs linearly. Stops immediately on failure. No auto-correction.
Agentic	'agentic'	NEW. Runs linearly. On failure, enters "Agent Loop" to diagnose, plan fix, and retry.
2.2 The Agent Loop Flow

The PlanExecutor will be upgraded to handle a state machine that includes a RECOVERING state.

mermaid

graph TD
    A[Execute Step] --> B{Result?}
    B -- Success --> C[Next Step]
    B -- Failure --> D{Mode?}
    D -- Planner --> E[Stop Execution]
    D -- Agentic --> F[AgentBrain: Analyze]
    F --> G[Generate Fix Steps]
    G --> H[Risk Check]
    H -- Dangerous --> I[Pause for User Approval]
    H -- Safe --> J[Mutate Plan (Insert Steps)]
    J --> A

3. New Files & Components
3.1 src/main/services/agent/AgentBrain.ts

Responsibility: The interface to the LLM for error analysis and replanning.

    Methods:
        analyzeFailure(step: ExecutionStep, error: string, context: AgentContext): Promise<AgentCorrection>
    AgentCorrection Type:

    typescript

    type AgentCorrection = {
        action: 'retry' | 'modify' | 'insert_steps' | 'skip' | 'abort';
        reasoning: string;
        newSteps?: ExecutionStep[]; // If inserting/modifying
        modifiedCommand?: string;   // If simple retry with tweak
    }

3.2 src/main/services/agent/AgentContext.ts

Responsibility: Manages the history buffer and summarization to save tokens.

    Logic:
        Maintains a rolling log of executed steps and their results.
        limit: Hard token/step limit (e.g., 10 steps).
        summarize(): When limit is reached, calls LLM to compress the oldest 5 steps into a natural language summary string (e.g., "Successfully installed nodejs and git, but failed to clone repo due to auth error").
        Provides the context object to AgentBrain.

3.3 src/main/services/agent/PlanMutator.ts

Responsibility: Helper functions to safely modify the immutable Plan structure.

    Methods:
        insertSteps(plan: ExecutionPlan, afterStepId: string, newSteps: ExecutionStep[]): ExecutionPlan
        replaceStep(plan: ExecutionPlan, stepId: string, newStep: ExecutionStep): ExecutionPlan
        Crucial: Must ensure unique IDs for new steps and recalculate stepIndex for all subsequent steps.

4. Modified Files
4.1 src/shared/types/execution.ts

    Add ExecutionMode type.
    Update ExecutionPlan to include mode: ExecutionMode.
    Update StepResult to include attemptIndex (for retries).
    Add PlanEvent types:
        agent-thinking: The agent is analyzing an error.
        plan-revised: The plan structure has changed (sends full new plan).
        agent-error: The agent failed to find a fix.

4.2 src/main/services/execution/PlanExecutor.ts

    Major Refactor:
        Inject AgentBrain and AgentContext.
        In execute() loop:
            Check plan.mode.
            If agentic and step fails:
                Emit agent-thinking.
                Call AgentBrain.analyzeFailure.
                Circuit Breaker: Check global retry budget (max 3 retries per step, max 10 total corrections).
                Receive AgentCorrection.
                Risk Check: Run RiskClassifier on any new commands.
                    If blocked: Abort.
                    If dangerous: Emit approval-needed (reusing existing modal logic).
                    If safe/caution: Proceed.
                Apply PlanMutator.
                Emit plan-revised.
                Rewind index to execute the newly inserted fix steps.

4.3 src/renderer/components/plan/PlanView.tsx (and sub-components)

    Mode Switcher: Add a UI toggle (segmented control) at the top: [Teacher | Planner | Agentic].
    Visuals:
        Handle plan-revised: Update the step list with animation if possible, or just re-render.
        Handle agent-thinking: Show a "Brain" spinner/icon on the failed step while the agent works.
        Preserve "Success" state of previous steps even if the plan array is replaced.

5. Implementation Steps (Instructions for AI)
Phase A: Core Types & State

    Define ExecutionMode, AgentCorrection, and updated PlanEvent types in src/shared/types.
    Update usePlanExecution hook to store and expose the current mode.

Phase B: The Agent Services

    Implement AgentContext.ts.
        Create the buffer logic.
        Create the summarize prompt (asks LLM to condense history).
    Implement AgentBrain.ts.
        Create the system prompt: "You are a Linux repair agent. A command failed. Analyze stderr. Return JSON with a fix strategy."
    Implement PlanMutator.ts.
        Pure functions to splice arrays and re-index steps.

Phase C: The Loop (PlanExecutor)

    Modify PlanExecutor.ts.
        Import RiskClassifier (already exists).
        Add the handleAgenticFailure method inside the iteration loop.
        Implement the "Pause for Approval" logic for newly generated dangerous steps (this connects to the existing approvalHandler).

Phase D: UI Wiring

    Update ChatPanel / PlanView to pass the selected mode to plan:execute.
    Add the ModeSelector component.
    Add visual indicators for "Agent Thinking" in FixerPlanView.

6. Risk & Safety Gates (Strict Requirements)

    Dangerous Fixes: If AgentBrain suggests a command classified as dangerous (e.g., rm, dd, editing system configs), the loop MUST pause. It emits approval-needed. The UI shows the existing Approval Modal. The user must click "Approve" for the Agent to proceed with the fix.
    Infinite Loops:
        Max Retries: 3 attempts per original step.
        Max Total Steps: Plan cannot exceed original length + 10 steps.
        If budget exceeded: Emit agent-stuck and pause execution.

7. Clarifications for AI Developer

    Teacher Mode: Ignored by this sprint's logic changes. It remains manual.
    Summarization: Occurs every 5 steps. The summary replaces the oldest 5 detailed steps in the AgentContext memory sent to the LLM.
    Plan Updates: On plan-revised, send the entire plan object. The renderer will trust the step.status fields to know what is already done.
