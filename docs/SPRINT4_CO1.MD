Build Plan: Terminal Bridge — Option B (Display Execution in Terminal)

Sprint: 5.5 (Hotfix/Enhancement Sprint)
Estimated Effort: 3-4 hours
Prerequisite: Sprint 5 complete (plan execution pipeline working)
Goal: Move command execution display from the right panel (AI Assistant) to the left panel (Terminal) so the terminal shows commands being typed and their output naturally, while the right panel shows only clean plan status and AI assessments.
Context for the Implementing Developer
What We're Changing

Currently, when the plan executor runs commands via ssh2 exec(), the output is mirrored to the terminal panel as raw text via ssh:data IPC. This creates a disconnected experience — the terminal shows output that doesn't correspond to any visible command being typed, and the right panel duplicates that same output inside the plan step cards.

After this change:

    The terminal (left panel) shows each command as if someone typed it at the prompt, followed by its stdout/stderr output, followed by a fresh prompt
    The AI panel (right panel) shows only plan step status — step name, risk badge, running/success/failed state, and the AI's assessment text. No raw command output.

What We're NOT Changing

    CommandExecutor still uses ssh2 exec() for structured results (exitCode, stdout, stderr). We are NOT switching to PTY execution.
    StepExecutor and PlanExecutor are unchanged.
    The usePlanExecution hook is unchanged.
    Session persistence is unchanged.

Future Enhancement Note

Option C (streaming terminal display) will replace TerminalBridge.displayCommandExecution() with a streaming variant that pipes exec() stdout/stderr to the terminal in real time as data arrives (so apt install progress appears line by line instead of all at once after completion). The TerminalBridge class is designed with this upgrade path in mind — the interface stays the same, only the internal implementation of display timing changes. When implementing Option C, the CommandExecutor.execute() method will accept an optional onData streaming callback, and TerminalBridge will use it instead of waiting for the full result before displaying.
Architecture Overview

text

CURRENT FLOW:
─────────────────────────────────────────────────────────────────
PlanExecutor → StepExecutor → CommandExecutor.execute()
                                      │
                                      ▼
                              CommandResult { stdout, stderr, exitCode }
                                      │
                    ┌─────────────────┼──────────────────┐
                    │                 │                   │
                    ▼                 ▼                   ▼
              StepResult        ssh:data IPC         PlanEvent
              (for AI eval)     (raw mirror to       (to renderer
                                 terminal — messy)    plan view — 
                                                      includes output)

NEW FLOW:
─────────────────────────────────────────────────────────────────
PlanExecutor → StepExecutor → CommandExecutor.execute()
                                      │
                                      ▼
                              CommandResult { stdout, stderr, exitCode }
                                      │
                    ┌─────────────────┼──────────────────┐
                    │                 │                   │
                    ▼                 ▼                   ▼
              StepResult      TerminalBridge         PlanEvent
              (for AI eval)   .displayCommand()      (to renderer
                              (formatted display     plan view —
                               in terminal)          status ONLY,
                                                     no raw output)

File Changes Summary
File	Action	Description
src/main/services/execution/TerminalBridge.ts	CREATE	New service — formats and sends command display to terminal
src/main/ipc/plan.handler.ts	MODIFY	Use TerminalBridge instead of raw ssh:data emission; detect prompt string
src/renderer/components/plan/FixerPlanView.tsx	MODIFY	Remove raw stdout/stderr output display from step cards
src/renderer/components/plan/TeacherPlanView.tsx	MODIFY	Minor — ensure "Run in Terminal" uses TerminalBridge pattern
src/shared/types/execution.ts	NO CHANGE	PlanEvent types stay the same
src/renderer/hooks/usePlanExecution.ts	NO CHANGE	Hook stays the same
src/main/services/execution/CommandExecutor.ts	NO CHANGE	exec() execution stays the same
src/main/services/execution/StepExecutor.ts	NO CHANGE	Step lifecycle stays the same
src/main/services/execution/PlanExecutor.ts	NO CHANGE	Plan iteration stays the same
Step-by-Step Implementation
Step 1: Create TerminalBridge Service

File: src/main/services/execution/TerminalBridge.ts

Purpose: Formats command execution results for natural display in the xterm.js terminal panel. Takes a CommandResult from CommandExecutor and writes it to the terminal as if the user typed the command and saw the output.

Requirements:

    Constructor accepts a sendToTerminal function with signature (data: string) => void. This function should send data to the renderer's terminal panel via the same ssh:data IPC channel that the PTY currently uses. The plan.handler.ts file will provide this function when instantiating TerminalBridge.

    A setPrompt(prompt: string) method that stores the prompt string. The prompt should default to '$ '. After SSH connection and OS detection, plan.handler.ts will call this with the detected prompt (e.g., 'sysop@pi5:~ $ '). To detect the prompt, send a simple echo command via exec() after connection and capture the prompt prefix from the PTY output, or construct it from the SSH username and hostname in the connection config: `${username}@${hostname}:~ $ `. The constructed approach is simpler and sufficient for MVP.

    A displayCommandExecution(command: string, result: CommandResult) method that writes to the terminal in this exact sequence:
        Write \r\n to ensure we start on a fresh line
        Write the prompt string followed by the command string followed by \r\n. This makes it look like the command was typed at the prompt.
        If result.stdout is non-empty: write stdout with all \n characters replaced with \r\n (xterm.js requires carriage return + line feed). If the stdout does not end with \r\n, append \r\n.
        If result.stderr is non-empty: write stderr wrapped in ANSI yellow color codes. Use \x1b[33m before the stderr text and \x1b[0m after to reset color. Replace \n with \r\n in the stderr text. If stderr does not end with \r\n, append \r\n.
        Write the prompt string again at the end (so the terminal looks ready for the next command).

    A displayStatus(message: string) method for showing agent/plan status messages in the terminal. Write \r\n, then the message wrapped in ANSI cyan (\x1b[36m) with a [SMA] prefix, then \x1b[0m to reset, then \r\n, then the prompt. This will be used for messages like "Plan execution started", "Step 2 of 5", "Plan complete" etc.

    A displayError(message: string) method. Same pattern as displayStatus but use ANSI red (\x1b[31m) and prefix with [SMA ERROR].

    Export both the class and a module-level variable let terminalBridge: TerminalBridge | null = null with getter/setter functions getTerminalBridge() and initTerminalBridge(sendFn). This follows the same singleton pattern used by other services in the project. The setter creates the instance, the getter returns it or throws if not initialized.

Do NOT:

    Execute any commands — this class only displays
    Import or depend on ssh2, CommandExecutor, or StepExecutor
    Buffer or store any output — it's fire and forget to the terminal
    Handle streaming — that's the Option C future enhancement

Step 2: Detect and Store the Prompt String

File: src/main/ipc/plan.handler.ts

Purpose: After SSH connection is established, determine the prompt string so TerminalBridge can display it accurately.

Requirements:

    In the function that sets up the plan execution context (currently called when the SSH connection is established and OS is detected — look for where setPlanConnectionContext() is called from ssh.handler.ts), construct the prompt string from the connection config:

text

const prompt = `${connection.username}@${connection.hostname}:~ $ `;

Use the username and hostname fields from the connection config object that is already available in ssh.handler.ts when the connection succeeds. Pass this prompt to plan.handler.ts along with the other connection context.

    Initialize the TerminalBridge at this point. The sendToTerminal function should use the same mechanism currently used to send mirrored output to the terminal. Look at how plan.handler.ts currently sends data to the terminal on step-completed — it likely calls mainWindow.webContents.send('ssh:data', ...) or a similar channel. Use that exact same function as the sendToTerminal parameter.

    Call terminalBridge.setPrompt(prompt) with the constructed prompt string.

Note: The prompt won't be perfectly accurate in all cases (the user might cd to a different directory, changing the prompt). This is a cosmetic issue only — the commands still execute correctly via exec(). Option C will improve this by reading the actual PTY prompt state. For now the constructed prompt is sufficient.
Step 3: Integrate TerminalBridge into Plan Execution

File: src/main/ipc/plan.handler.ts

Purpose: Replace the current raw ssh:data terminal mirroring with formatted TerminalBridge display calls.

Requirements:

    Find every place where plan execution output is currently sent to the terminal. This is likely in the section that processes PlanEvent objects from the PlanExecutor async generator. Look for mainWindow.webContents.send calls that use the ssh:data channel (or whatever channel name is used — check ipcChannels.ts for the SSH data channel constant).

    Replace those raw sends with TerminalBridge calls:

    On plan execution start (before the first step runs):

    text

    terminalBridge.displayStatus(`Executing plan: ${plan.goal} (${plan.steps.length} steps)`);

    On step-started event:
    Do NOT display anything in the terminal yet. The command display happens after we have the result (since Option B is not streaming).

    On step-completed event (where result.assessment.succeeded === true):

    text

    terminalBridge.displayCommandExecution(step.command, result.commandResult);

    On step-failed event:

    text

    terminalBridge.displayCommandExecution(step.command, result.commandResult);
    terminalBridge.displayError(`Step failed: ${result.assessment.reason}`);

    On plan-completed event:

    text

    terminalBridge.displayStatus(`Plan complete — ${completedSteps} steps executed successfully`);

    On plan-cancelled event:

    text

    terminalBridge.displayError(`Plan stopped: ${reason}`);

    Remove all existing raw ssh:data sends that were mirroring exec() output. After this change, TerminalBridge is the only thing writing plan execution output to the terminal.

    Important timing note: displayCommandExecution should be called AFTER the command completes (since we're using Option B — no streaming). The terminal will show the command + full output at once. This is the known limitation that Option C addresses later. For short commands (apt update, systemctl status, etc.) this is fine. For long-running commands (apt upgrade with many packages), the terminal will appear frozen during execution and then show all output at once. This is acceptable for MVP.

Step 4: Clean Up FixerPlanView (Right Panel)

File: src/renderer/components/plan/FixerPlanView.tsx

Purpose: Remove raw command output from the plan step cards. The right panel should show only plan status, step names, risk badges, and AI assessment text.

Requirements:

    Find the section of each step card that displays raw stdout/stderr output. This likely renders result.stdout or result.commandResult.stdout inside a <pre> or code block element. Remove it entirely.

    Each step card in the Fixer view should display ONLY:
        Step number and description text (e.g., "1. Update package list to get the latest version information")
        The command string in a small monospace font (e.g., sudo apt update) — keep this since it's useful context
        Risk level badge (SAFE / CAUTION / DANGEROUS)
        Step status indicator:
            Pending: grey circle or empty checkbox icon
            Running: spinner or pulsing blue indicator
            Completed: green checkmark
            Failed: red X
        AI assessment text when the step is completed or failed. This is the result.assessment.reason string from the StepResult (e.g., "The command executed successfully with an exit code of 0, and the output indicates that all packages are up to date"). Show it in a smaller, muted font below the step description.
        Confidence indicator if desired (the result.assessment.confidence field — "high" / "medium" / "low") — optional, can be shown as a small label next to the assessment text.

    Remove any scrollable output panels, code blocks, or expandable sections that were showing raw stdout/stderr. The terminal on the left now serves that purpose.

    The plan header should still show:
        Plan goal text
        Total step count and mode label ("3 steps • Fixer mode")
        Run button (when plan is pending)
        Pause / Cancel buttons (when plan is executing)
        Progress bar or fraction ("2/5 steps completed")

    Do not change the data flow. The PlanEvent objects and StepResult objects still contain commandResult with stdout/stderr — we're just not rendering that data in this component anymore. The data is still used by SessionStore for persistence and by the AI for step evaluation.

Step 5: Review TeacherPlanView

File: src/renderer/components/plan/TeacherPlanView.tsx

Purpose: Ensure Teacher mode is consistent with the new terminal-centric approach.

Requirements:

    Teacher mode already shows commands as clickable cards with explanations. The user clicks "Copy to Clipboard" or "Run in Terminal". This flow does NOT change — Teacher mode is manual by design.

    If Teacher mode's "Run in Terminal" button currently calls window.electronAPI.ssh.write(command + '\n') to write to the PTY directly — that is correct and should stay. The command runs in the PTY and output appears naturally in the terminal. No TerminalBridge involvement is needed for Teacher mode because the user is manually executing via the real PTY.

    If Teacher mode step cards are also showing raw command output (same pattern as Fixer mode), remove it for consistency. Teacher mode steps should show:
        Step number and description
        Command in a code block
        Explanation text (the "what this does" educational content)
        Risk badge
        "Copy to Clipboard" and "Run in Terminal" buttons
        After the user runs the command, the terminal shows the output. The right panel does not need to duplicate it.

    If Teacher mode does NOT show raw output currently, no changes are needed to this file.

Step 6: Add Plan Status Messages to Terminal

File: src/main/ipc/plan.handler.ts

Purpose: Add contextual status messages in the terminal so the user can see plan progress without looking at the right panel.

Requirements:

Using the TerminalBridge.displayStatus() method, add status messages at these points in the plan execution loop:

    Before each step executes:

    text

    [SMA] Step 1/3: Update package list (sudo apt update)

    Format: Step {currentIndex + 1}/{totalSteps}: {step.description} ({step.command})

    After each successful step:
    This is already handled by displayCommandExecution showing the output. No additional status needed.

    On plan start:

    text

    [SMA] Starting plan: Update the server by upgrading all packages (3 steps)

    On plan completion:

    text

    [SMA] ✅ Plan complete — 3/3 steps executed successfully

    On plan failure/cancellation:

    text

    [SMA ERROR] Plan stopped at step 2/3: apt upgrade returned exit code 1

    On approval needed (dangerous command):

    text

    [SMA] ⚠️ Step 2 requires approval — waiting for confirmation in AI panel

    This lets the user know to look at the right panel for the approval modal.

These messages use the cyan [SMA] prefix defined in Step 1 so they are visually distinct from actual command output.
Step 7: Verify and Test

Verification checklist — test each scenario:

    Basic plan execution (Fixer mode):
        Ask AI to do something simple like "update packages"
        Verify: terminal shows [SMA] Starting plan... message
        Verify: terminal shows [SMA] Step 1/N... before each step
        Verify: terminal shows the prompt + command + output for each step
        Verify: terminal shows [SMA] ✅ Plan complete at the end
        Verify: right panel shows step cards with status and AI assessment only — NO raw stdout/stderr

    Dangerous command approval:
        Ask AI to do something that triggers a dangerous command
        Verify: terminal shows [SMA] ⚠️ Step N requires approval...
        Verify: approval modal appears in right panel
        Verify: after approval, command and output appear in terminal
        Verify: after rejection/skip, terminal shows appropriate status message

    Plan failure:
        Ask AI to do something that will fail (install a nonexistent package)
        Verify: terminal shows the command + error output
        Verify: terminal shows [SMA ERROR] Plan stopped...
        Verify: right panel shows failed step with red X and AI assessment

    Teacher mode:
        Switch to Teacher mode
        Generate a plan
        Click "Run in Terminal" on a step
        Verify: command executes in the real PTY as before
        Verify: right panel does not show duplicate output

    Terminal scrollback:
        Execute a plan with multiple steps
        Scroll up in the terminal
        Verify: all commands and output are in the scroll history
        Verify: the command/output sequence reads naturally top to bottom

    Multiple plans in one session:
        Execute one plan, then ask AI for another
        Verify: both plans' commands appear in terminal history
        Verify: status messages clearly delineate where one plan ends and the next begins

Summary of What the Terminal Looks Like After This Change

text

sysop@pi5:~ $ 
[SMA] Starting plan: Update the server by upgrading all packages (2 steps)

[SMA] Step 1/2: Update package list (sudo apt update)

sysop@pi5:~ $ sudo apt update
Hit:1 http://deb.debian.org/debian bookworm InRelease
Hit:2 https://download.docker.com/linux/debian bookworm InRelease
Hit:3 https://deb.nodesource.com/node_22.x nodistro InRelease
Fetched 54.5 kB in 1s (79.1 kB/s)
Reading package lists...
All packages are up to date.

[SMA] Step 2/2: Upgrade installed packages (sudo apt upgrade -y)

sysop@pi5:~ $ sudo apt upgrade -y
Reading package lists...
Building dependency tree...
0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.

[SMA] ✅ Plan complete — 2/2 steps executed successfully

sysop@pi5:~ $ 

And the right panel shows only:

text

EXECUTION PLAN
Update the server by upgrading all packages
2 steps • Fixer mode

✅ 1. Update package list                              SAFE
      sudo apt update
      ✅ "All packages are up to date" (high confidence)

✅ 2. Upgrade installed packages                     CAUTION
      sudo apt upgrade -y
      ✅ "0 packages upgraded, system is current" (high confidence)

Progress: ████████████████████ 100% (2/2)

Files To Create
#	File	Action
1	src/main/services/execution/TerminalBridge.ts	CREATE
Files To Modify
#	File	Action	Scope of Change
2	src/main/ipc/plan.handler.ts	MODIFY	Initialize TerminalBridge, replace ssh:data mirroring, add status messages
3	src/main/ipc/ssh.handler.ts	MODIFY	Pass username/hostname to plan handler for prompt construction
4	src/renderer/components/plan/FixerPlanView.tsx	MODIFY	Remove raw stdout/stderr display from step cards
5	src/renderer/components/plan/TeacherPlanView.tsx	REVIEW	Remove raw output if present; otherwise no change
Files NOT Modified
File	Reason
CommandExecutor.ts	Still uses exec() — unchanged
StepExecutor.ts	Step lifecycle unchanged
PlanExecutor.ts	Plan iteration unchanged
usePlanExecution.ts	Hook unchanged — same PlanEvent types
execution.ts (shared types)	PlanEvent types unchanged
AIOrchestrator.ts	AI evaluation unchanged
SessionStore.ts	Persistence unchanged