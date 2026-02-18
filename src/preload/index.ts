import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants/ipcChannels';
import type {
  ConnectionConfig,
  ConnectionInput,
  OSInfo,
  AIRequestContext,
  ExecutionPlan,
  PlanStep,
  ChatSession,
  AppSettings,
  ExecutionMode,
} from '../shared/types';

// Type-safe API exposed to renderer
const electronAPI = {
  // SSH Operations
  ssh: {
    connect: (config: ConnectionConfig) => 
      ipcRenderer.invoke(IPC_CHANNELS.SSH.CONNECT, config),
    disconnect: () => 
      ipcRenderer.invoke(IPC_CHANNELS.SSH.DISCONNECT),
    write: (data: string) => 
      ipcRenderer.send(IPC_CHANNELS.SSH.WRITE, data),
    resize: (cols: number, rows: number) => 
      ipcRenderer.send(IPC_CHANNELS.SSH.RESIZE, cols, rows),
    onData: (callback: (data: string) => void) => {
      const handler = (_: any, data: string) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.SSH.DATA, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SSH.DATA, handler);
    },
    onConnected: (callback: (info: OSInfo) => void) => {
      const handler = (_: any, info: OSInfo) => callback(info);
      ipcRenderer.on(IPC_CHANNELS.SSH.CONNECTED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SSH.CONNECTED, handler);
    },
    onDisconnected: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.SSH.DISCONNECTED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SSH.DISCONNECTED, handler);
    },
    onError: (callback: (error: string) => void) => {
      const handler = (_: any, error: string) => callback(error);
      ipcRenderer.on(IPC_CHANNELS.SSH.ERROR, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SSH.ERROR, handler);
    },
  },
  
  // AI Operations
  ai: {
    sendMessage: (message: string, context: AIRequestContext) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI.SEND_MESSAGE, message, context),
    saveMessage: (connectionId: string, content: string, tokensUsed?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI.SAVE_MESSAGE, connectionId, content, tokensUsed),
    cancel: () =>
      ipcRenderer.send(IPC_CHANNELS.AI.CANCEL),
    getTokensUsed: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AI.GET_TOKENS),
    onStreamChunk: (callback: (chunk: string) => void) => {
      const handler = (_: any, chunk: string) => callback(chunk);
      ipcRenderer.on(IPC_CHANNELS.AI.STREAM_CHUNK, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI.STREAM_CHUNK, handler);
    },
    onStreamEnd: (callback: (payload: { messageId: string; content: string; hasPlan: boolean; usage?: { inputTokens: number; outputTokens: number } }) => void) => {
      const handler = (_: any, payload: any) => callback(payload);
      ipcRenderer.on(IPC_CHANNELS.AI.STREAM_END, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI.STREAM_END, handler);
    },
    onError: (callback: (error: string) => void) => {
      const handler = (_: any, error: string) => callback(error);
      ipcRenderer.on(IPC_CHANNELS.AI.ERROR, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI.ERROR, handler);
    },
  },
  
  // Plan Operations
  plan: {
    execute: (planId: string, mode: ExecutionMode) =>
      ipcRenderer.invoke(IPC_CHANNELS.PLAN.EXECUTE, planId, mode),
    approve: (stepId: string) =>
      ipcRenderer.send(IPC_CHANNELS.PLAN.APPROVAL_RESPONSE, { decision: 'approve', stepId }),
    reject: (stepId: string) =>
      ipcRenderer.send(IPC_CHANNELS.PLAN.APPROVAL_RESPONSE, { decision: 'reject', stepId }),
    skip: (stepId: string) =>
      ipcRenderer.send(IPC_CHANNELS.PLAN.APPROVAL_RESPONSE, { decision: 'skip', stepId }),
    pause: () =>
      ipcRenderer.send(IPC_CHANNELS.PLAN.PAUSE),
    resume: () =>
      ipcRenderer.send(IPC_CHANNELS.PLAN.RESUME),
    cancel: () =>
      ipcRenderer.send(IPC_CHANNELS.PLAN.CANCEL),
    /** Subscribe to the PlanEvent stream */
    onEvent: (callback: (event: any) => void) => {
      const handler = (_: any, event: any) => callback(event);
      ipcRenderer.on(IPC_CHANNELS.PLAN.EVENT, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PLAN.EVENT, handler);
    },
    onGenerated: (callback: (plan: ExecutionPlan) => void) => {
      const handler = (_: any, plan: ExecutionPlan) => callback(plan);
      ipcRenderer.on(IPC_CHANNELS.PLAN.GENERATED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PLAN.GENERATED, handler);
    },
    onStepUpdate: (callback: (step: PlanStep) => void) => {
      const handler = (_: any, step: PlanStep) => callback(step);
      ipcRenderer.on(IPC_CHANNELS.PLAN.STEP_UPDATE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PLAN.STEP_UPDATE, handler);
    },
    onApprovalNeeded: (callback: (payload: { stepId: string; command: string; riskLevel: string; warningMessage?: string }) => void) => {
      const handler = (_: any, payload: any) => callback(payload);
      ipcRenderer.on(IPC_CHANNELS.PLAN.APPROVAL_NEEDED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PLAN.APPROVAL_NEEDED, handler);
    },
    onComplete: (callback: (plan: ExecutionPlan) => void) => {
      const handler = (_: any, plan: ExecutionPlan) => callback(plan);
      ipcRenderer.on(IPC_CHANNELS.PLAN.COMPLETE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PLAN.COMPLETE, handler);
    },
  },
  
  // Connection Operations
  connections: {
    getAll: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION.GET_ALL),
    getById: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION.GET_BY_ID, id),
    create: (connection: ConnectionInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION.CREATE, connection),
    update: (id: string, connection: Partial<ConnectionInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION.UPDATE, id, connection),
    delete: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION.DELETE, id),
    test: (config: ConnectionConfig) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION.TEST, config),
  },
  
  // Settings Operations
  settings: {
    get: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET),
    update: (settings: Partial<AppSettings>) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.UPDATE, settings),
    getApiKey: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_API_KEY),
    setApiKey: (apiKey: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SET_API_KEY, apiKey),
  },
  
  // Session Operations
  session: {
    get: (connectionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION.GET, connectionId),
    save: (connectionId: string, session: ChatSession) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION.SAVE, connectionId, session),
    clear: (connectionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION.CLEAR, connectionId),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for renderer
export type ElectronAPI = typeof electronAPI;
