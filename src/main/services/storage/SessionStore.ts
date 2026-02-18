import type { ChatMessage, CompletedPlan, ChatSession } from '@shared/types';
import type { ExecutionRecord, StepResult } from '@shared/types/execution';

interface SessionStoreSchema {
  sessions: Record<string, ChatSession>;
  planHistory: Record<string, CompletedPlan[]>;
  executionRecords: Record<string, ExecutionRecord[]>;
}

/**
 * Persists chat sessions and plan execution records per connection.
 * Dynamic import is required because electron-store v8+ is ESM-only.
 */
export class SessionStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private store: any = null;
  private initPromise: Promise<void> | null = null;

  private async getStore(): Promise<any> {
    if (this.store) return this.store;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const mod = await import('electron-store');
        const StoreClass = mod.default;
        this.store = new StoreClass<SessionStoreSchema>({
          name: 'sessions',
          defaults: { sessions: {}, planHistory: {}, executionRecords: {} },
        });
      })();
    }
    await this.initPromise;
    return this.store;
  }

  // ── Chat Sessions ─────────────────────────────────────────────────

  async getSession(connectionId: string): Promise<ChatSession | null> {
    const store = await this.getStore();
    const sessions = store.get('sessions', {});
    return sessions[connectionId] ?? null;
  }

  async saveSession(connectionId: string, messages: ChatMessage[]): Promise<void> {
    const store = await this.getStore();
    const sessions = store.get('sessions', {});
    const existing = sessions[connectionId];
    sessions[connectionId] = {
      connectionId,
      messages,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.set('sessions', sessions);
  }

  async addMessage(connectionId: string, message: ChatMessage): Promise<void> {
    const session = await this.getSession(connectionId);
    const messages = session?.messages ?? [];
    messages.push(message);
    await this.saveSession(connectionId, messages);
  }

  async getMessages(connectionId: string, limit?: number): Promise<ChatMessage[]> {
    const session = await this.getSession(connectionId);
    if (!session) return [];
    return limit ? session.messages.slice(-limit) : session.messages;
  }

  async clearSession(connectionId: string): Promise<void> {
    const store = await this.getStore();
    const sessions = store.get('sessions', {});
    delete sessions[connectionId];
    store.set('sessions', sessions);
  }

  // ── Plan History ──────────────────────────────────────────────────

  async savePlanResult(connectionId: string, plan: CompletedPlan): Promise<void> {
    const store = await this.getStore();
    const planHistory = store.get('planHistory', {});
    if (!planHistory[connectionId]) planHistory[connectionId] = [];
    planHistory[connectionId].push(plan);
    if (planHistory[connectionId].length > 50) {
      planHistory[connectionId] = planHistory[connectionId].slice(-50);
    }
    store.set('planHistory', planHistory);
  }

  async getPlanHistory(connectionId: string): Promise<CompletedPlan[]> {
    const store = await this.getStore();
    return store.get('planHistory', {})[connectionId] ?? [];
  }

  // ── Execution Records ─────────────────────────────────────────────

  async saveExecutionRecord(connectionId: string, record: ExecutionRecord): Promise<void> {
    const store = await this.getStore();
    const records = store.get('executionRecords', {});
    if (!records[connectionId]) records[connectionId] = [];
    records[connectionId].push(record);
    if (records[connectionId].length > 100) {
      records[connectionId] = records[connectionId].slice(-100);
    }
    store.set('executionRecords', records);
  }

  async updateExecutionRecord(connectionId: string, planId: string, update: Partial<ExecutionRecord>): Promise<void> {
    const store = await this.getStore();
    const records = store.get('executionRecords', {});
    const list = records[connectionId] ?? [];
    const idx = list.findIndex((r: ExecutionRecord) => r.planId === planId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...update };
      records[connectionId] = list;
      store.set('executionRecords', records);
    }
  }

  async addStepResult(connectionId: string, planId: string, stepResult: StepResult): Promise<void> {
    const store = await this.getStore();
    const records = store.get('executionRecords', {});
    const list: ExecutionRecord[] = records[connectionId] ?? [];
    const record = list.find((r: ExecutionRecord) => r.planId === planId);
    if (record) {
      record.steps.push(stepResult);
      store.set('executionRecords', records);
    }
  }

  async getExecutionRecords(connectionId: string, limit?: number): Promise<ExecutionRecord[]> {
    const store = await this.getStore();
    const list: ExecutionRecord[] = store.get('executionRecords', {})[connectionId] ?? [];
    return limit ? list.slice(-limit) : list;
  }

  async getLastExecutionRecord(connectionId: string): Promise<ExecutionRecord | null> {
    const list = await this.getExecutionRecords(connectionId);
    return list.length > 0 ? list[list.length - 1] : null;
  }

  async clearAllData(): Promise<void> {
    const store = await this.getStore();
    store.set('sessions', {});
    store.set('planHistory', {});
    store.set('executionRecords', {});
  }
}

export const sessionStore = new SessionStore();
