/**
 * Chat Store
 * Manages AI chat messages and execution plans
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ChatMessage, ExecutionPlan, PlanStep } from '@shared/types';

interface ChatState {
  // Messages
  messages: ChatMessage[];
  isLoading: boolean;
  streamingContent: string;
  
  // Plan
  currentPlan: ExecutionPlan | null;
  
  // Mode
  mode: 'fixer' | 'teacher';
  
  // Actions
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
  
  setLoading: (loading: boolean) => void;
  appendStreamingContent: (chunk: string) => void;
  commitStreamingMessage: () => void;
  clearStreamingContent: () => void;
  
  setPlan: (plan: ExecutionPlan | null) => void;
  updatePlanStep: (stepId: string, updates: Partial<PlanStep>) => void;
  
  setMode: (mode: 'fixer' | 'teacher') => void;
}

export const useChatStore = create<ChatState>()(
  immer((set) => ({
    messages: [],
    isLoading: false,
    streamingContent: '',
    currentPlan: null,
    mode: 'fixer',
    
    addMessage: (message) => {
      set((state) => {
        state.messages.push(message);
      });
    },
    
    updateMessage: (id, updates) => {
      set((state) => {
        const index = state.messages.findIndex(m => m.id === id);
        if (index !== -1) {
          state.messages[index] = { ...state.messages[index], ...updates };
        }
      });
    },
    
    setMessages: (messages) => {
      set({ messages });
    },
    
    clearMessages: () => {
      set({ messages: [], currentPlan: null });
    },
    
    setLoading: (loading) => {
      set({ isLoading: loading });
    },
    
    appendStreamingContent: (chunk) => {
      set((state) => {
        state.streamingContent += chunk;
      });
    },
    
    commitStreamingMessage: () => {
      set((state) => {
        if (state.streamingContent) {
          const message: ChatMessage = {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: state.streamingContent,
            timestamp: new Date().toISOString(),
          };
          state.messages.push(message);
          state.streamingContent = '';
        }
      });
    },
    
    clearStreamingContent: () => {
      set({ streamingContent: '' });
    },
    
    setPlan: (plan) => {
      set({ currentPlan: plan });
    },
    
    updatePlanStep: (stepId, updates) => {
      set((state) => {
        if (state.currentPlan) {
          const step = state.currentPlan.steps.find(s => s.id === stepId);
          if (step) {
            Object.assign(step, updates);
          }
        }
      });
    },
    
    setMode: (mode) => {
      set({ mode });
    },
  }))
);
