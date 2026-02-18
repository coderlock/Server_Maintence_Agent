# Sprint 4 Completion Report — AI Integration

**Sprint:** 4 of Phase 1  
**Date Completed:** 2025  
**Focus:** Full AI integration with Moonshot (Kimi) provider, streaming chat UI, settings modal, session/execution persistence

---

## Sprint Goals (from BUILDPLAN_PHASE1.MD)

| Goal | Status |
|---|---|
| LLM provider abstraction layer | ✅ Complete |
| Moonshot (Kimi) provider via openai SDK | ✅ Complete |
| AI Orchestrator with streaming | ✅ Complete |
| Context builder (system info + terminal output + chat history) | ✅ Complete |
| System prompts (chat + step evaluation) | ✅ Complete |
| Chat UI with streaming markdown rendering | ✅ Complete |
| Settings modal (API key, model, temperature) | ✅ Complete |
| Session persistence (electron-store) | ✅ Complete |
| Execution record persistence | ✅ Complete |
| Settings persistence | ✅ Complete |
| IPC handler implementations | ✅ Complete |
| Token tracking in StatusBar | ✅ Complete |

---

## Architecture Decisions

### Moonshot via openai npm package
The `openai` npm package (v4+) supports custom `baseURL`, making it fully compatible with Moonshot's OpenAI-compatible endpoint:
```
baseURL: 'https://api.moonshot.cn/v1'
model:   'moonshot-v1-128k'
```
This avoids raw fetch boilerplate and gives us proper TypeScript types, streaming helpers, and retry logic for free.

### LLMProvider Abstraction
`src/main/services/ai/providers/LLMProvider.ts` defines an interface that every provider must implement. Adding a new provider (Anthropic, Groq, Gemini, Ollama) requires only implementing this interface and registering it — no changes elsewhere.

### AIContext Builder (NOT a DTO)
`src/main/services/ai/AIContext.ts` is a composable class (builder pattern) that assembles system prompt context from parts. Callers chain:
```ts
new AIContext()
  .addSystemInfo(osInfo)
  .addMode('fixer')
  .addChatHistory(messages)
  .addTerminalOutput(lines)
  .toSystemPrompt(BASE_SYSTEM_PROMPT)
```
Each part has a priority and estimated token cost. If total context exceeds 80,000 estimated tokens, lowest-priority blocks are dropped automatically.

### AIRequestContext (IPC DTO)
The shared IPC DTO (renderer → main) was renamed from `AIContext` to `AIRequestContext` in `src/shared/types/ai.ts` to avoid naming collision with the builder class.

### Terminal Context in Main Process
Terminal PTY output is captured on the main process side via `ipcMain.on('ai:terminal-data')` into a rolling 200-line buffer in `ContextBuilder`. This means AI calls never need to round-trip through the renderer to collect terminal context — better performance and simpler data flow.

### Date Serialization
All `Date` fields in shared types (`ChatMessage.timestamp`, `ChatSession.*At`) were changed to `string` (ISO 8601). This ensures safe IPC transport and electron-store persistence without custom serializers.

---

## New Files

| File | Purpose |
|---|---|
| `src/shared/types/execution.ts` | CommandResult, StepAssessment, StepResult, ExecutionRecord, PlanEvent union |
| `src/main/services/ai/providers/LLMProvider.ts` | Provider interface |
| `src/main/services/ai/providers/MoonshotProvider.ts` | Moonshot implementation via openai SDK |
| `src/main/services/ai/AIContext.ts` | Composable context builder class |
| `src/main/services/ai/prompts/systemPrompt.ts` | BASE_SYSTEM_PROMPT + STEP_EVALUATION_PROMPT |
| `src/main/services/ai/ContextBuilder.ts` | Terminal buffer + chat context assembly |
| `src/main/services/ai/AIOrchestrator.ts` | Central AI coordinator (sendMessage, call, evaluateStepResult, extractPlan) |
| `src/main/services/storage/SettingsStore.ts` | Settings + API key persistence via electron-store |
| `src/main/services/storage/SessionStore.ts` | Chat session + execution record persistence |
| `src/renderer/hooks/useAI.ts` | Streaming chat lifecycle hook |
| `src/renderer/components/modals/SettingsModal.tsx` | API key, model, temperature, mode settings UI |

---

## Modified Files

| File | Change |
|---|---|
| `src/shared/types/ai.ts` | AIContext→AIRequestContext rename; restructured ExecutionPlan/PlanStep; RiskAssessment type; CompletedPlan type |
| `src/shared/types/chat.ts` | Dates→strings; CompletedPlan[]; updatedAt added |
| `src/shared/types/index.ts` | Added execution.ts barrel export |
| `src/shared/constants/ipcChannels.ts` | Added SAVE_MESSAGE, GET_TOKENS to AI channels |
| `src/preload/index.ts` | AIRequestContext; enriched onStreamEnd payload; saveMessage, getTokensUsed, getApiKey methods |
| `src/main/ipc/ai.handler.ts` | Full replacement — real streaming implementation, terminal buffer wiring |
| `src/main/ipc/settings.handler.ts` | Full replacement — masked key return, validate-before-save, live model update |
| `src/main/ipc/session.handler.ts` | Full replacement — delegates to SessionStore |
| `src/main/ipc/index.ts` | registerAIHandlers now receives mainWindow param |
| `src/renderer/components/chat/ChatPanel.tsx` | Full replacement — streaming markdown, ModeToggle, auto-scroll, clear chat |
| `src/renderer/components/layout/MenuBar.tsx` | Gear icon wired to SettingsModal; showSettings state |
| `src/renderer/components/layout/StatusBar.tsx` | tokensUsed state; onStreamEnd listener; Cpu icon + token count display |

---

## IPC Channels Added

```ts
// src/shared/constants/ipcChannels.ts  AI group
SAVE_MESSAGE: 'ai:save-message'   // persist assistant message after stream ends
GET_TOKENS:   'ai:get-tokens'     // get running session token total
```

---

## Chat UI Features

- **Streaming rendering**: Markdown renders live as tokens arrive via `onStreamChunk`
- **Mode toggle**: Fixer / Teacher inline in the chat header — changes the system prompt persona
- **Message bubbles**: User messages right-aligned, assistant left-aligned with distinct styling
- **Code blocks**: Syntax highlighted via `react-syntax-highlighter` with VSCode Dark+ theme
- **Auto-scroll**: Scrolls to bottom when new content arrives; shows scroll-down button when user has scrolled up
- **Auto-resize textarea**: Grows up to 120px height; Enter sends, Shift+Enter inserts newline
- **Clear chat**: Button in header calls `session.clear` IPC
- **API key warning**: Banner shown when connected but no API key stored

---

## Settings Modal Features

- API key input with show/hide toggle
- Inline validate-and-save (calls `settings.validateApiKey` before storing)
- Masked display of currently stored key (`sk-****...****`)
- Model selector: `moonshot-v1-8k` / `moonshot-v1-32k` / `moonshot-v1-128k`
- Temperature slider (0.0–1.0)
- Default mode toggle (Fixer / Teacher)
- Confirm dangerous commands checkbox
- "Settings saved" flash confirmation on save

---

## Token Tracking

- `AIOrchestrator.sessionTokensUsed` accumulates token counts from each `usage` chunk in the stream
- `ai:get-tokens` IPC handler returns current session total
- `StatusBar` subscribes to `ai.onStreamEnd` and refreshes the count after each message
- Displayed in status bar as `{n} tokens` with a CPU icon, only visible when count > 0

---

## Definition of Done

- [x] AI provider layer implemented with Moonshot (Kimi 2.5) as primary
- [x] Streaming chat functional end-to-end (renderer → IPC → provider → stream chunks → renderer)
- [x] Chat history persisted per connection via electron-store
- [x] Settings persisted (API key, model, temperature, mode, confirmDangerous)
- [x] Execution records schema defined and stored (ready for Sprint 5 plan executor)
- [x] Context builder composes terminal output + chat history + system info into system prompt
- [x] Step evaluation prompt ready for plan executor
- [x] All IPC handler stubs replaced with real implementations
- [x] Gear icon opens Settings modal
- [x] Token count visible in status bar

---

## Known Limitations / Sprint 5 Handoff

1. **Plan execution engine not built yet** — `AIOrchestrator.extractPlan()` parses plans from AI responses and emits `PLAN.GENERATED`, but there is no `PlanExecutor` that actually executes steps over SSH. This is Sprint 5 scope.

2. **`ai:terminal-data` events not yet wired from SSH layer** — `ContextBuilder.appendTerminalOutput()` is ready to receive PTY data, but `SSHConnection` / `SSHManager` do not yet emit `ai:terminal-data` to the main process. This wire-up belongs in Sprint 5 alongside plan execution.

3. **Risk assessment UI** — `RiskAssessment.requiresApproval` is modeled in the type system. The confirmation dialog for `dangerous` steps is not yet built (needed for Sprint 5 plan executor UI).

4. **Agent loop** — `AIContext.addAgentState()` stub and `PlanEvent` union entries (`agent-thinking`, `agent-stuck`, `budget-warning`) are intentionally included now to keep the IPC contract stable, but the agent loop itself is post-Phase-1.

---

## Next Sprint: Sprint 5 — Plan Execution Engine

**Objectives:**
1. `PlanExecutor` service — iterates `ExecutionPlan.steps`, executes each via `SSHConnection`, evaluates result via `AIOrchestrator.evaluateStepResult()`, handles retry/rollback
2. Wire `SSHConnection` PTY output → `ai:terminal-data` → `ContextBuilder`
3. Approval dialog for `dangerous` + `requiresApproval` steps
4. Plan progress panel in UI (step-by-step status, current output, approve/abort controls)
5. Rollback support using `rollbackPlan` from `ExecutionPlan`
6. Execution record written to `SessionStore` after plan completes/fails
