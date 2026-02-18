/**
 * Chat session types
 */

import type { ChatMessage, CompletedPlan } from './ai';

export interface ChatSession {
  connectionId: string;
  messages: ChatMessage[];
  plans?: CompletedPlan[];
  createdAt: string;   // ISO string — serialisable over IPC & electron-store
  updatedAt: string;
}

export interface StreamChunk {
  content: string;
  isComplete: boolean;
}
