Create detailed Phase 1 build plan markdown document
Thought Process
expand
Server Maintenance Agent - Phase 1 Build Plan

Version: 1.0
Date: January 2025
Phase: MVP Foundation
Duration: 6 Weeks (6 Sprints)
Table of Contents

    Phase Overview
    Prerequisites & Setup
    Sprint Schedule
    Sprint 1: Project Foundation
    Sprint 2: SSH Integration
    Sprint 3: Terminal & UI
    Sprint 4: AI Integration
    Sprint 5: Plan Execution Engine
    Sprint 6: Polish & Integration Testing
    Testing Strategy
    Risk Mitigation
    Definition of Done

1. Phase Overview
1.1 Phase 1 Goals

Deliver a functional MVP that allows users to:

    Connect to a single SSH server using password authentication
    Interact with an AI assistant that understands the connected system
    Execute AI-generated plans in Fixer or Teacher mode
    Have dangerous commands flagged and require approval
    Persist chat sessions across application restarts

1.2 Out of Scope for Phase 1

    SSH key authentication
    Multiple simultaneous connections
    Multiple AI providers
    File transfer/browser
    Plugin system
    Cloud sync

1.3 Success Metrics
Metric	Target
SSH Connection Success Rate	≥ 95% for standard Linux servers
OS Detection Accuracy	≥ 95% for major distributions
Plan Generation Success	≥ 90% for common tasks
Dangerous Command Detection	100% for pre-defined patterns
Application Crash Rate	< 1% of sessions
Cold Start Time	< 3 seconds
1.4 Timeline Overview

text

Week 1: Sprint 1 - Project Foundation
Week 2: Sprint 2 - SSH Integration
Week 3: Sprint 3 - Terminal & UI
Week 4: Sprint 4 - AI Integration
Week 5: Sprint 5 - Plan Execution Engine
Week 6: Sprint 6 - Polish & Integration Testing

2. Prerequisites & Setup
2.1 Development Environment
Required Software
Software	Version	Purpose
Node.js	20.x LTS	Runtime
npm	10.x	Package manager
Git	2.x	Version control
VS Code	Latest	IDE (recommended)
[REMOVED DOCKER]
VS Code Extensions (Recommended)

text

- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript Importer
- Error Lens
- GitLens


[THIS SECTION HAS BEEN UPDATED TO REMOVE DOCKER]
2.2 Test Infrastructure
Development Testing Setup

Choose ONE of these options for testing SSH connections during development:

Option A: Local SSH (Simplest)

bash

# macOS
sudo systemsetup -setremotelogin on

# Linux
sudo apt install openssh-server && sudo systemctl start ssh

# Create test credentials file (don't commit!)
cat > .env.test.local << EOF
TEST_SSH_HOST=localhost
TEST_SSH_PORT=22
TEST_SSH_USER=$(whoami)
TEST_SSH_PASS=your_password
EOF

Option B: Raspberry Pi / Network Server

bash

# Create test credentials file (don't commit!)
cat > .env.test.local << EOF
TEST_SSH_HOST=192.168.1.50
TEST_SSH_PORT=22
TEST_SSH_USER=pi
TEST_SSH_PASS=your_pi_password
EOF

Option C: WSL (Windows)

bash

# In WSL
sudo apt install openssh-server
sudo service ssh start

# Create test credentials file
cat > .env.test.local << EOF
TEST_SSH_HOST=<wsl-ip>
TEST_SSH_PORT=22
TEST_SSH_USER=your_wsl_user
TEST_SSH_PASS=your_password
EOF

Test Credential Loader

typescript

// tests/setup/testCredentials.ts
import { config } from 'dotenv';
import path from 'path';

// Load test environment
config({ path: path.join(__dirname, '../../.env.test.local') });

export const TEST_SSH_CONFIG = {
  host: process.env.TEST_SSH_HOST || 'localhost',
  port: parseInt(process.env.TEST_SSH_PORT || '22'),
  username: process.env.TEST_SSH_USER || 'testuser',
  password: process.env.TEST_SSH_PASS || 'testpass',
};

export const hasTestCredentials = (): boolean => {
  return !!(
    process.env.TEST_SSH_HOST &&
    process.env.TEST_SSH_USER &&
    process.env.TEST_SSH_PASS
  );
};

Skip Integration Tests When No Server Available

typescript

// tests/integration/ssh.integration.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { TEST_SSH_CONFIG, hasTestCredentials } from '../setup/testCredentials';
import { SSHConnection } from '@/main/services/ssh/SSHConnection';

describe('SSH Integration Tests', () => {
  beforeAll(() => {
    if (!hasTestCredentials()) {
      console.log('⚠️  Skipping SSH integration tests - no test server configured');
      console.log('   Create .env.test.local with TEST_SSH_HOST, TEST_SSH_USER, TEST_SSH_PASS');
    }
  });

  it.skipIf(!hasTestCredentials())('connects to SSH server', async () => {
    const connection = new SSHConnection(TEST_SSH_CONFIG);
    await connection.connect();
    expect(connection.getIsConnected()).toBe(true);
    connection.disconnect();
  });

  it.skipIf(!hasTestCredentials())('detects OS correctly', async () => {
    const connection = new SSHConnection(TEST_SSH_CONFIG);
    await connection.connect();
    
    const result = await connection.executeCommand('uname -s');
    expect(['Linux', 'Darwin']).toContain(result.stdout.trim());
    
    connection.disconnect();
  });
});

Unit Tests Always Run (Mocked)

typescript

// tests/unit/ssh/SSHConnection.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Client } from 'ssh2';

// Mock ssh2 before importing SSHConnection
vi.mock('ssh2', () => ({
  Client: vi.fn(() => ({
    on: vi.fn(function(event, callback) {
      if (event === 'ready') {
        setTimeout(() => callback(), 0);
      }
      return this;
    }),
    connect: vi.fn(),
    shell: vi.fn((opts, cb) => cb(null, mockStream)),
    exec: vi.fn((cmd, cb) => cb(null, mockExecStream)),
    end: vi.fn(),
  })),
}));

const mockStream = {
  on: vi.fn().mockReturnThis(),
  write: vi.fn(),
  end: vi.fn(),
  setWindow: vi.fn(),
  stderr: { on: vi.fn() },
};

const mockExecStream = {
  on: vi.fn((event, cb) => {
    if (event === 'close') setTimeout(() => cb(0), 0);
    return mockExecStream;
  }),
  stderr: { on: vi.fn() },
};

// Now import after mocking
import { SSHConnection } from '@/main/services/ssh/SSHConnection';

describe('SSHConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a connection instance', () => {
    const conn = new SSHConnection({
      host: 'test.local',
      port: 22,
      username: 'user',
      password: 'pass',
    });
    expect(conn).toBeDefined();
  });

  it('calls ssh2 connect with correct config', async () => {
    const conn = new SSHConnection({
      host: 'test.local',
      port: 22,
      username: 'user',
      password: 'pass',
    });
    
    await conn.connect();
    
    expect(Client).toHaveBeenCalled();
  });
});

2.3 API Keys

    Anthropic API Key: Required for Claude integration
    Store in .env.local (never commit)

bash

# .env.local
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx

2.4 Initial Project Setup Commands

bash

# Create project with Electron Forge + Vite + TypeScript
npm init electron-app@latest server-maintenance-agent -- --template=vite-typescript

cd server-maintenance-agent

# Install core dependencies
npm install react react-dom zustand immer
npm install ssh2 electron-store uuid zod
npm install @anthropic-ai/sdk
npm install xterm xterm-addon-fit xterm-addon-web-links
npm install lucide-react react-markdown react-syntax-highlighter

# Install UI dependencies
npm install -D tailwindcss postcss autoprefixer
npm install -D @types/react @types/react-dom @types/ssh2
npm install -D @vitejs/plugin-react

# Initialize Tailwind
npx tailwindcss init -p

# Install shadcn/ui CLI
npx shadcn-ui@latest init

# Development dependencies
npm install -D vitest @testing-library/react playwright
npm install -D eslint-plugin-react eslint-plugin-react-hooks

3. Sprint Schedule

text

┌─────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 1 SPRINT SCHEDULE                            │
├──────────┬──────────────────────────────────────────────────────────────────┤
│ Sprint 1 │ Project Foundation                                               │
│ Week 1   │ ████████████████████████████████████████████████████████████████ │
│          │ • Electron + React + TypeScript setup                            │
│          │ • Project structure                                              │
│          │ • IPC architecture                                               │
│          │ • Basic window with layout                                       │
├──────────┼──────────────────────────────────────────────────────────────────┤
│ Sprint 2 │ SSH Integration                                                  │
│ Week 2   │ ████████████████████████████████████████████████████████████████ │
│          │ • SSH connection service                                         │
│          │ • Connection storage (encrypted)                                 │
│          │ • OS detection                                                   │
│          │ • Connection management UI                                       │
├──────────┼──────────────────────────────────────────────────────────────────┤
│ Sprint 3 │ Terminal & UI                                                    │
│ Week 3   │ ████████████████████████████████████████████████████████████████ │
│          │ • xterm.js integration                                           │
│          │ • PTY session management                                         │
│          │ • Split pane layout                                              │
│          │ • VSCode-like styling                                            │
├──────────┼──────────────────────────────────────────────────────────────────┤
│ Sprint 4 │ AI Integration                                                   │
│ Week 4   │ ████████████████████████████████████████████████████████████████ │
│          │ • Claude API integration                                         │
│          │ • Chat interface                                                 │
│          │ • Context building                                               │
│          │ • Session persistence                                            │
├──────────┼──────────────────────────────────────────────────────────────────┤
│ Sprint 5 │ Plan Execution Engine                                            │
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

4. Sprint 1: Project Foundation

Duration: Week 1 (5 days)
Goal: Establish project architecture and basic application shell
4.1 Sprint 1 Objectives

    Initialize Electron + Vite + React + TypeScript project
    Establish project folder structure
    Configure build tools and linting
    Implement IPC architecture foundation
    Create basic window with placeholder layout
    Set up state management (Zustand)
    Configure Tailwind CSS and base theme

4.2 Day-by-Day Breakdown
Day 1: Project Initialization

Tasks:

text

□ Task 1.1.1: Initialize Electron Forge project
  └── Command: npm init electron-app@latest server-maintenance-agent -- --template=vite-typescript
  └── Verify: App launches with default window
  
□ Task 1.1.2: Configure TypeScript
  └── Update tsconfig.json with strict mode
  └── Create tsconfig paths for clean imports
  └── Files: tsconfig.json, tsconfig.node.json

□ Task 1.1.3: Install and configure React
  └── Install: react, react-dom, @types/react, @types/react-dom
  └── Configure Vite for React
  └── Create basic App.tsx
  └── Files: vite.renderer.config.ts, src/renderer/App.tsx

□ Task 1.1.4: Set up Tailwind CSS
  └── Install: tailwindcss, postcss, autoprefixer
  └── Initialize: npx tailwindcss init -p
  └── Configure content paths
  └── Create globals.css with Tailwind directives
  └── Files: tailwind.config.js, postcss.config.js, src/renderer/styles/globals.css

□ Task 1.1.5: Configure ESLint and Prettier
  └── Install plugins for React and TypeScript
  └── Create configuration files
  └── Add lint scripts to package.json
  └── Files: .eslintrc.json, .prettierrc, package.json

Deliverables:

    Working Electron app that displays a React component
    Tailwind CSS working (test with a colored div)
    ESLint and Prettier configured and running

Day 2: Project Structure & IPC Foundation

Tasks:

text

□ Task 1.2.1: Create folder structure
  └── Create all directories as per design document
  └── Add .gitkeep files to empty directories
  └── Structure:
      src/
      ├── main/
      │   ├── ipc/
      │   ├── services/
      │   │   ├── ssh/
      │   │   ├── ai/
      │   │   ├── security/
      │   │   └── storage/
      │   └── utils/
      ├── renderer/
      │   ├── components/
      │   │   ├── layout/
      │   │   ├── terminal/
      │   │   ├── chat/
      │   │   ├── connections/
      │   │   ├── modals/
      │   │   └── ui/
      │   ├── hooks/
      │   ├── store/
      │   ├── lib/
      │   └── styles/
      ├── preload/
      └── shared/
          ├── types/
          └── constants/

□ Task 1.2.2: Define shared types
  └── File: src/shared/types/connection.ts
  └── File: src/shared/types/ssh.ts
  └── File: src/shared/types/ai.ts
  └── File: src/shared/types/chat.ts
  └── File: src/shared/types/settings.ts
  └── File: src/shared/types/ipc.ts
  └── File: src/shared/types/index.ts (barrel export)

□ Task 1.2.3: Define IPC channels
  └── File: src/shared/constants/ipcChannels.ts
  └── Define all channel names as constants
  └── Group by feature (SSH, AI, Connections, Settings)

□ Task 1.2.4: Create preload script
  └── File: src/preload/index.ts
  └── Set up contextBridge
  └── Expose typed IPC methods
  └── Configure in forge.config.ts

□ Task 1.2.5: Create IPC handler registration system
  └── File: src/main/ipc/index.ts
  └── File: src/main/ipc/base.handler.ts
  └── Create pattern for registering handlers
  └── Register in main process

Code: src/shared/constants/ipcChannels.ts

typescript

export const IPC_CHANNELS = {
  // SSH Channels
  SSH: {
    CONNECT: 'ssh:connect',
    DISCONNECT: 'ssh:disconnect',
    WRITE: 'ssh:write',
    RESIZE: 'ssh:resize',
    DATA: 'ssh:data',
    CONNECTED: 'ssh:connected',
    DISCONNECTED: 'ssh:disconnected',
    ERROR: 'ssh:error',
  },
  
  // AI Channels
  AI: {
    SEND_MESSAGE: 'ai:send-message',
    STREAM_CHUNK: 'ai:stream-chunk',
    STREAM_END: 'ai:stream-end',
    CANCEL: 'ai:cancel',
    ERROR: 'ai:error',
  },
  
  // Plan Channels
  PLAN: {
    GENERATED: 'plan:generated',
    STEP_UPDATE: 'plan:step-update',
    APPROVAL_NEEDED: 'plan:approval-needed',
    APPROVE: 'plan:approve',
    REJECT: 'plan:reject',
    PAUSE: 'plan:pause',
    RESUME: 'plan:resume',
    CANCEL: 'plan:cancel',
    COMPLETE: 'plan:complete',
  },
  
  // Connection Channels
  CONNECTION: {
    GET_ALL: 'connection:get-all',
    GET_BY_ID: 'connection:get-by-id',
    CREATE: 'connection:create',
    UPDATE: 'connection:update',
    DELETE: 'connection:delete',
    TEST: 'connection:test',
  },
  
  // Settings Channels
  SETTINGS: {
    GET: 'settings:get',
    UPDATE: 'settings:update',
    GET_API_KEY: 'settings:get-api-key',
    SET_API_KEY: 'settings:set-api-key',
  },
  
  // Session Channels
  SESSION: {
    GET: 'session:get',
    SAVE: 'session:save',
    CLEAR: 'session:clear',
  },
} as const;

Code: src/preload/index.ts

typescript

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants/ipcChannels';

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
    sendMessage: (message: string, context: AIContext) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI.SEND_MESSAGE, message, context),
    cancel: () =>
      ipcRenderer.send(IPC_CHANNELS.AI.CANCEL),
    onStreamChunk: (callback: (chunk: string) => void) => {
      const handler = (_: any, chunk: string) => callback(chunk);
      ipcRenderer.on(IPC_CHANNELS.AI.STREAM_CHUNK, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI.STREAM_CHUNK, handler);
    },
    onStreamEnd: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.AI.STREAM_END, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI.STREAM_END, handler);
    },
  },
  
  // Plan Operations
  plan: {
    approve: (stepId: string) =>
      ipcRenderer.send(IPC_CHANNELS.PLAN.APPROVE, stepId),
    reject: (stepId: string) =>
      ipcRenderer.send(IPC_CHANNELS.PLAN.REJECT, stepId),
    pause: () =>
      ipcRenderer.send(IPC_CHANNELS.PLAN.PAUSE),
    resume: () =>
      ipcRenderer.send(IPC_CHANNELS.PLAN.RESUME),
    cancel: () =>
      ipcRenderer.send(IPC_CHANNELS.PLAN.CANCEL),
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
    onApprovalNeeded: (callback: (step: PlanStep) => void) => {
      const handler = (_: any, step: PlanStep) => callback(step);
      ipcRenderer.on(IPC_CHANNELS.PLAN.APPROVAL_NEEDED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PLAN.APPROVAL_NEEDED, handler);
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

Deliverables:

    Complete folder structure created
    All shared types defined
    IPC channels defined
    Preload script with typed API

Day 3: State Management & Base Components

Tasks:

text

□ Task 1.3.1: Set up Zustand stores
  └── File: src/renderer/store/connectionStore.ts
  └── File: src/renderer/store/terminalStore.ts
  └── File: src/renderer/store/chatStore.ts
  └── File: src/renderer/store/settingsStore.ts
  └── File: src/renderer/store/index.ts

□ Task 1.3.2: Create IPC client wrapper
  └── File: src/renderer/lib/ipc.ts
  └── Type-safe wrapper around window.electronAPI
  └── Handle undefined case for non-electron environments

□ Task 1.3.3: Install and configure shadcn/ui
  └── Run: npx shadcn-ui@latest init
  └── Install base components: button, input, dialog, dropdown-menu
  └── Configure with dark theme

□ Task 1.3.4: Create base UI components
  └── File: src/renderer/components/ui/button.tsx
  └── File: src/renderer/components/ui/input.tsx
  └── File: src/renderer/components/ui/dialog.tsx
  └── File: src/renderer/components/ui/dropdown-menu.tsx
  └── File: src/renderer/components/ui/scroll-area.tsx
  └── File: src/renderer/components/ui/tooltip.tsx

Code: src/renderer/store/connectionStore.ts

typescript

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { SavedConnection, ActiveConnection, OSInfo } from '@shared/types';

interface ConnectionState {
  // Saved connections
  savedConnections: SavedConnection[];
  isLoadingConnections: boolean;
  
  // Active connection
  activeConnection: ActiveConnection | null;
  
  // Actions
  loadConnections: () => Promise<void>;
  addConnection: (connection: SavedConnection) => void;
  updateConnection: (id: string, updates: Partial<SavedConnection>) => void;
  removeConnection: (id: string) => void;
  
  setActiveConnection: (connection: ActiveConnection | null) => void;
  updateActiveConnectionStatus: (status: ActiveConnection['status']) => void;
  setOSInfo: (osInfo: OSInfo) => void;
}

export const useConnectionStore = create<ConnectionState>()(
  immer((set, get) => ({
    savedConnections: [],
    isLoadingConnections: false,
    activeConnection: null,
    
    loadConnections: async () => {
      set({ isLoadingConnections: true });
      try {
        const connections = await window.electronAPI.connections.getAll();
        set({ savedConnections: connections });
      } finally {
        set({ isLoadingConnections: false });
      }
    },
    
    addConnection: (connection) => {
      set((state) => {
        state.savedConnections.push(connection);
      });
    },
    
    updateConnection: (id, updates) => {
      set((state) => {
        const index = state.savedConnections.findIndex(c => c.id === id);
        if (index !== -1) {
          state.savedConnections[index] = { ...state.savedConnections[index], ...updates };
        }
      });
    },
    
    removeConnection: (id) => {
      set((state) => {
        state.savedConnections = state.savedConnections.filter(c => c.id !== id);
      });
    },
    
    setActiveConnection: (connection) => {
      set({ activeConnection: connection });
    },
    
    updateActiveConnectionStatus: (status) => {
      set((state) => {
        if (state.activeConnection) {
          state.activeConnection.status = status;
        }
      });
    },
    
    setOSInfo: (osInfo) => {
      set((state) => {
        if (state.activeConnection) {
          state.activeConnection.osInfo = osInfo;
        }
      });
    },
  }))
);

Code: src/renderer/store/chatStore.ts

typescript

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

Deliverables:

    Zustand stores created and typed
    IPC client wrapper working
    shadcn/ui components installed

Day 4: Layout Components

Tasks:

text

□ Task 1.4.1: Create AppLayout component
  └── File: src/renderer/components/layout/AppLayout.tsx
  └── Three-section layout: MenuBar, MainContent, StatusBar
  └── Use CSS Grid for layout

□ Task 1.4.2: Create MenuBar component
  └── File: src/renderer/components/layout/MenuBar.tsx
  └── Connection buttons (placeholder)
  └── Mode selector (placeholder)
  └── Settings button (placeholder)

□ Task 1.4.3: Create StatusBar component
  └── File: src/renderer/components/layout/StatusBar.tsx
  └── Connection status indicator
  └── Session timer
  └── Mode display

□ Task 1.4.4: Create SplitPane component
  └── File: src/renderer/components/layout/SplitPane.tsx
  └── Resizable split between terminal and chat
  └── Save split position to localStorage

□ Task 1.4.5: Create placeholder panels
  └── File: src/renderer/components/terminal/TerminalPanel.tsx (placeholder)
  └── File: src/renderer/components/chat/ChatPanel.tsx (placeholder)

Code: src/renderer/components/layout/AppLayout.tsx

typescript

import React from 'react';
import { MenuBar } from './MenuBar';
import { StatusBar } from './StatusBar';
import { SplitPane } from './SplitPane';
import { TerminalPanel } from '../terminal/TerminalPanel';
import { ChatPanel } from '../chat/ChatPanel';

export const AppLayout: React.FC = () => {
  return (
    <div className="h-screen flex flex-col bg-[#1e1e1e] text-white">
      {/* Menu Bar */}
      <MenuBar />
      
      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <SplitPane
          left={<TerminalPanel />}
          right={<ChatPanel />}
          defaultSplit={50}
          minLeft={300}
          minRight={350}
        />
      </main>
      
      {/* Status Bar */}
      <StatusBar />
    </div>
  );
};

Code: src/renderer/components/layout/MenuBar.tsx

typescript

import React from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Zap, 
  Settings,
  Wrench,
  GraduationCap
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useChatStore } from '@/store/chatStore';

export const MenuBar: React.FC = () => {
  const { mode, setMode } = useChatStore();
  
  return (
    <header className="h-12 bg-[#323233] border-b border-[#3c3c3c] flex items-center px-4 gap-2">
      {/* Connection Management */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-8">
          <Plus className="h-4 w-4 mr-1" />
          New
        </Button>
        <Button variant="ghost" size="sm" className="h-8">
          <Edit className="h-4 w-4 mr-1" />
          Edit
        </Button>
        <Button variant="ghost" size="sm" className="h-8">
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-green-400 hover:text-green-300">
          <Zap className="h-4 w-4 mr-1" />
          Connect
        </Button>
      </div>
      
      {/* Separator */}
      <div className="h-6 w-px bg-[#3c3c3c] mx-2" />
      
      {/* Mode Selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8">
            {mode === 'fixer' ? (
              <>
                <Wrench className="h-4 w-4 mr-1" />
                Fixer Mode
              </>
            ) : (
              <>
                <GraduationCap className="h-4 w-4 mr-1" />
                Teacher Mode
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => setMode('fixer')}>
            <Wrench className="h-4 w-4 mr-2" />
            Fixer Mode
            <span className="ml-2 text-xs text-gray-400">Auto-execute</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode('teacher')}>
            <GraduationCap className="h-4 w-4 mr-2" />
            Teacher Mode
            <span className="ml-2 text-xs text-gray-400">Learn step-by-step</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      {/* Spacer */}
      <div className="flex-1" />
      
      {/* Settings */}
      <Button variant="ghost" size="sm" className="h-8">
        <Settings className="h-4 w-4" />
      </Button>
    </header>
  );
};

Code: src/renderer/components/layout/SplitPane.tsx

typescript

import React, { useState, useCallback, useEffect } from 'react';

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultSplit?: number;
  minLeft?: number;
  minRight?: number;
}

export const SplitPane: React.FC<SplitPaneProps> = ({
  left,
  right,
  defaultSplit = 50,
  minLeft = 200,
  minRight = 200,
}) => {
  const [split, setSplit] = useState(() => {
    const saved = localStorage.getItem('splitPane');
    return saved ? parseFloat(saved) : defaultSplit;
  });
  const [isDragging, setIsDragging] = useState(false);
  
  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);
  
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    localStorage.setItem('splitPane', split.toString());
  }, [split]);
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const container = document.getElementById('split-container');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const newSplit = ((e.clientX - rect.left) / rect.width) * 100;
    
    const minLeftPercent = (minLeft / rect.width) * 100;
    const minRightPercent = (minRight / rect.width) * 100;
    
    if (newSplit >= minLeftPercent && newSplit <= 100 - minRightPercent) {
      setSplit(newSplit);
    }
  }, [isDragging, minLeft, minRight]);
  
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);
  
  return (
    <div 
      id="split-container"
      className="flex h-full"
      style={{ cursor: isDragging ? 'col-resize' : 'default' }}
    >
      {/* Left Panel */}
      <div style={{ width: `${split}%` }} className="h-full overflow-hidden">
        {left}
      </div>
      
      {/* Divider */}
      <div
        className="w-1 bg-[#3c3c3c] hover:bg-[#007acc] cursor-col-resize transition-colors"
        onMouseDown={handleMouseDown}
      />
      
      {/* Right Panel */}
      <div style={{ width: `${100 - split}%` }} className="h-full overflow-hidden">
        {right}
      </div>
    </div>
  );
};

Deliverables:

    AppLayout component rendering correctly
    MenuBar with placeholder buttons
    StatusBar with placeholder info
    Resizable SplitPane working

Day 5: Main Process Setup & Testing

Tasks:

text

□ Task 1.5.1: Configure main process entry
  └── File: src/main/index.ts
  └── Set up BrowserWindow with proper config
  └── Configure preload script
  └── Set up IPC handler registration

□ Task 1.5.2: Create placeholder IPC handlers
  └── File: src/main/ipc/ssh.handler.ts (placeholder)
  └── File: src/main/ipc/ai.handler.ts (placeholder)
  └── File: src/main/ipc/connection.handler.ts (placeholder)
  └── File: src/main/ipc/settings.handler.ts (placeholder)

□ Task 1.5.3: Set up development workflow
  └── Configure hot reload
  └── Add debug logging
  └── Test IPC communication

□ Task 1.5.4: Sprint 1 integration test
  └── App launches without errors
  └── Layout renders correctly
  └── IPC bridge is functional
  └── All stores are accessible

Code: src/main/index.ts

typescript

import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registerAllHandlers } from './ipc';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    titleBarStyle: 'hiddenInset', // macOS
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the app
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// Register IPC handlers
registerAllHandlers();

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Export for IPC handlers to access
export { mainWindow };

Deliverables:

    Main process configured correctly
    IPC handlers registered (placeholders)
    Test environment configured
    App launches and displays layout

4.3 Sprint 1 Definition of Done

    Application launches without errors
    React renders in Electron window
    Tailwind CSS styles are applied
    VSCode-like dark theme is visible
    Layout has MenuBar, SplitPane, StatusBar
    SplitPane is resizable and saves position
    Zustand stores are created and functional
    IPC bridge is configured and type-safe
    ESLint passes with no errors
    All code is properly typed (no any)

5. Sprint 2: SSH Integration

Duration: Week 2 (5 days)
Goal: Implement SSH connection, OS detection, and connection management
5.1 Sprint 2 Objectives

    Implement SSHManager and SSHConnection classes
    Create encrypted connection storage
    Implement OS detection
    Build connection management UI
    Implement connect/disconnect flow

5.2 Day-by-Day Breakdown
Day 1: SSH Connection Service

Tasks:

text

□ Task 2.1.1: Install and configure ssh2
  └── Install: npm install ssh2 @types/ssh2
  └── Create wrapper types for better DX

□ Task 2.1.2: Implement SSHConnection class
  └── File: src/main/services/ssh/SSHConnection.ts
  └── Connect with password
  └── Create PTY shell
  └── Handle disconnect
  └── Event emitters for data, close, error

□ Task 2.1.3: Implement SSHManager class
  └── File: src/main/services/ssh/SSHManager.ts
  └── Manage single active connection
  └── Connection lifecycle methods
  └── PTY resize handling

□ Task 2.1.4: Create SSH IPC handlers
  └── File: src/main/ipc/ssh.handler.ts
  └── Handle connect, disconnect, write, resize
  └── Forward PTY data to renderer

□ Task 2.1.5: Test SSH connection
  └── Connect to test server
  └── Verify PTY shell works
  └── Test disconnect handling

Code: src/main/services/ssh/SSHConnection.ts

typescript

import { Client, ClientChannel } from 'ssh2';
import { EventEmitter } from 'events';

export interface SSHConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface PTYOptions {
  cols: number;
  rows: number;
  term?: string;
}

export class SSHConnection extends EventEmitter {
  private client: Client;
  private stream: ClientChannel | null = null;
  private config: SSHConnectionConfig;
  private isConnected: boolean = false;
  
  constructor(config: SSHConnectionConfig) {
    super();
    this.client = new Client();
    this.config = config;
    this.setupClientEvents();
  }
  
  private setupClientEvents(): void {
    this.client.on('ready', () => {
      this.isConnected = true;
      this.emit('ready');
    });
    
    this.client.on('error', (err) => {
      this.emit('error', err);
    });
    
    this.client.on('close', () => {
      this.isConnected = false;
      this.stream = null;
      this.emit('close');
    });
    
    this.client.on('end', () => {
      this.isConnected = false;
      this.emit('end');
    });
  }
  
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 30000);
      
      this.client.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      this.client.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      
      this.client.connect({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        password: this.config.password,
        readyTimeout: 30000,
        keepaliveInterval: 10000,
      });
    });
  }
  
  async createPTY(options: PTYOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.shell(
        {
          cols: options.cols,
          rows: options.rows,
          term: options.term || 'xterm-256color',
        },
        (err, stream) => {
          if (err) {
            reject(err);
            return;
          }
          
          this.stream = stream;
          
          stream.on('data', (data: Buffer) => {
            this.emit('data', data.toString());
          });
          
          stream.on('close', () => {
            this.stream = null;
            this.emit('stream-close');
          });
          
          stream.stderr.on('data', (data: Buffer) => {
            this.emit('data', data.toString());
          });
          
          resolve();
        }
      );
    });
  }
  
  write(data: string): void {
    if (this.stream) {
      this.stream.write(data);
    }
  }
  
  resize(cols: number, rows: number): void {
    if (this.stream) {
      this.stream.setWindow(rows, cols, 0, 0);
    }
  }
  
  async executeCommand(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      this.client.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        
        let stdout = '';
        let stderr = '';
        
        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
        
        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
        
        stream.on('close', (code: number) => {
          resolve({ stdout, stderr, code: code || 0 });
        });
      });
    });
  }
  
  disconnect(): void {
    if (this.stream) {
      this.stream.end();
    }
    this.client.end();
  }
  
  getIsConnected(): boolean {
    return this.isConnected;
  }
}

Code: src/main/services/ssh/SSHManager.ts

typescript

import { SSHConnection, SSHConnectionConfig, PTYOptions } from './SSHConnection';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipcChannels';

export class SSHManager {
  private connection: SSHConnection | null = null;
  private mainWindow: BrowserWindow | null = null;
  
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }
  
  async connect(config: SSHConnectionConfig, ptyOptions: PTYOptions): Promise<void> {
    // Disconnect existing connection
    if (this.connection) {
      await this.disconnect();
    }
    
    this.connection = new SSHConnection(config);
    
    // Set up event handlers
    this.connection.on('data', (data: string) => {
      this.sendToRenderer(IPC_CHANNELS.SSH.DATA, data);
    });
    
    this.connection.on('error', (err: Error) => {
      this.sendToRenderer(IPC_CHANNELS.SSH.ERROR, err.message);
    });
    
    this.connection.on('close', () => {
      this.sendToRenderer(IPC_CHANNELS.SSH.DISCONNECTED);
      this.connection = null;
    });
    
    // Connect
    await this.connection.connect();
    await this.connection.createPTY(ptyOptions);
  }
  
  async disconnect(): Promise<void> {
    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }
  }
  
  write(data: string): void {
    if (this.connection) {
      this.connection.write(data);
    }
  }
  
  resize(cols: number, rows: number): void {
    if (this.connection) {
      this.connection.resize(cols, rows);
    }
  }
  
  async executeCommand(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    return this.connection.executeCommand(command);
  }
  
  isConnected(): boolean {
    return this.connection?.getIsConnected() ?? false;
  }
  
  private sendToRenderer(channel: string, ...args: any[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }
}

// Singleton instance
export const sshManager = new SSHManager();

Deliverables:

    SSHConnection class working
    SSHManager singleton created
    Can connect to test SSH server

Day 2: OS Detection

Tasks:

text

□ Task 2.2.1: Create OSDetector service
  └── File: src/main/services/ssh/OSDetector.ts
  └── Detect OS type (Linux, macOS, Windows)
  └── Detect distribution (Ubuntu, Debian, Raspbian, etc.)
  └── Detect shell type
  └── Get system info (architecture, version)

□ Task 2.2.2: Define OS detection commands
  └── Linux: cat /etc/os-release, uname -a
  └── macOS: sw_vers, uname -a
  └── Windows: systeminfo, ver

□ Task 2.2.3: Create OS patterns
  └── File: src/shared/constants/osPatterns.ts
  └── Regex patterns for OS identification
  └── Distribution identification patterns

□ Task 2.2.4: Integrate OS detection with connection flow
  └── Run detection after successful connection
  └── Store OSInfo in connection state
  └── Send OSInfo to renderer

□ Task 2.2.5: Test OS detection
  └── Test against Ubuntu container
  └── Test against Debian container
  └── Verify all fields populated correctly

Code: src/main/services/ssh/OSDetector.ts

typescript

import { SSHConnection } from './SSHConnection';
import { OSInfo, ShellInfo } from '@shared/types';

export class OSDetector {
  private connection: SSHConnection;
  
  constructor(connection: SSHConnection) {
    this.connection = connection;
  }
  
  async detect(): Promise<OSInfo> {
    // Try to detect OS type first
    const osType = await this.detectOSType();
    
    let osInfo: OSInfo;
    
    switch (osType) {
      case 'linux':
        osInfo = await this.detectLinux();
        break;
      case 'darwin':
        osInfo = await this.detectMacOS();
        break;
      case 'windows':
        osInfo = await this.detectWindows();
        break;
      default:
        osInfo = this.getUnknownOS();
    }
    
    // Detect shell
    osInfo.shell = await this.detectShell();
    
    return osInfo;
  }
  
  private async detectOSType(): Promise<'linux' | 'darwin' | 'windows' | 'unknown'> {
    try {
      const { stdout } = await this.connection.executeCommand('uname -s');
      const os = stdout.trim().toLowerCase();
      
      if (os.includes('linux')) return 'linux';
      if (os.includes('darwin')) return 'darwin';
      if (os.includes('mingw') || os.includes('cygwin') || os.includes('msys')) return 'windows';
      
      // Try Windows-specific command
      const { code } = await this.connection.executeCommand('ver');
      if (code === 0) return 'windows';
      
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }
  
  private async detectLinux(): Promise<OSInfo> {
    const info: OSInfo = {
      type: 'linux',
      architecture: 'unknown',
      shell: { type: 'bash', path: '/bin/bash' },
    };
    
    // Get architecture
    try {
      const { stdout } = await this.connection.executeCommand('uname -m');
      info.architecture = stdout.trim();
    } catch {}
    
    // Get kernel version
    try {
      const { stdout } = await this.connection.executeCommand('uname -r');
      info.kernel = stdout.trim();
    } catch {}
    
    // Try to read os-release
    try {
      const { stdout } = await this.connection.executeCommand('cat /etc/os-release');
      const osRelease = this.parseOSRelease(stdout);
      
      info.distribution = osRelease.NAME || osRelease.ID;
      info.version = osRelease.VERSION_ID;
      info.codename = osRelease.VERSION_CODENAME;
      
      // Check for specific distributions
      if (osRelease.ID) {
        const id = osRelease.ID.toLowerCase();
        if (id.includes('raspbian') || osRelease.ID_LIKE?.includes('raspbian')) {
          info.distribution = 'Raspbian';
        } else if (id.includes('ubuntu')) {
          info.distribution = 'Ubuntu';
        } else if (id.includes('debian')) {
          info.distribution = 'Debian';
        } else if (id.includes('centos')) {
          info.distribution = 'CentOS';
        } else if (id.includes('fedora')) {
          info.distribution = 'Fedora';
        } else if (id.includes('arch')) {
          info.distribution = 'Arch Linux';
        }
      }
    } catch {
      // Fallback: try lsb_release
      try {
        const { stdout } = await this.connection.executeCommand('lsb_release -a');
        const lines = stdout.split('\n');
        for (const line of lines) {
          if (line.startsWith('Distributor ID:')) {
            info.distribution = line.split(':')[1]?.trim();
          }
          if (line.startsWith('Release:')) {
            info.version = line.split(':')[1]?.trim();
          }
          if (line.startsWith('Codename:')) {
            info.codename = line.split(':')[1]?.trim();
          }
        }
      } catch {}
    }
    
    return info;
  }
  
  private async detectMacOS(): Promise<OSInfo> {
    const info: OSInfo = {
      type: 'darwin',
      distribution: 'macOS',
      architecture: 'unknown',
      shell: { type: 'zsh', path: '/bin/zsh' },
    };
    
    // Get version from sw_vers
    try {
      const { stdout } = await this.connection.executeCommand('sw_vers -productVersion');
      info.version = stdout.trim();
    } catch {}
    
    // Get architecture
    try {
      const { stdout } = await this.connection.executeCommand('uname -m');
      info.architecture = stdout.trim();
    } catch {}
    
    // Get kernel
    try {
      const { stdout } = await this.connection.executeCommand('uname -r');
      info.kernel = stdout.trim();
    } catch {}
    
    return info;
  }
  
  private async detectWindows(): Promise<OSInfo> {
    const info: OSInfo = {
      type: 'windows',
      distribution: 'Windows',
      architecture: 'unknown',
      shell: { type: 'powershell', path: 'powershell.exe' },
    };
    
    // Try to get Windows version
    try {
      const { stdout } = await this.connection.executeCommand(
        'powershell -Command "[System.Environment]::OSVersion.VersionString"'
      );
      info.version = stdout.trim();
    } catch {}
    
    // Get architecture
    try {
      const { stdout } = await this.connection.executeCommand(
        'powershell -Command "$env:PROCESSOR_ARCHITECTURE"'
      );
      info.architecture = stdout.trim();
    } catch {}
    
    return info;
  }
  
  private async detectShell(): Promise<ShellInfo> {
    // Try to detect current shell
    try {
      const { stdout } = await this.connection.executeCommand('echo $SHELL');
      const shellPath = stdout.trim();
      
      if (shellPath.includes('bash')) {
        const version = await this.getShellVersion('bash --version');
        return { type: 'bash', path: shellPath, version };
      }
      if (shellPath.includes('zsh')) {
        const version = await this.getShellVersion('zsh --version');
        return { type: 'zsh', path: shellPath, version };
      }
      if (shellPath.includes('fish')) {
        const version = await this.getShellVersion('fish --version');
        return { type: 'fish', path: shellPath, version };
      }
      if (shellPath.includes('sh')) {
        return { type: 'sh', path: shellPath };
      }
    } catch {}
    
    // Check for PowerShell (Windows)
    try {
      const { code } = await this.connection.executeCommand('powershell -Command "echo test"');
      if (code === 0) {
        return { type: 'powershell', path: 'powershell.exe' };
      }
    } catch {}
    
    return { type: 'bash', path: '/bin/bash' }; // Default
  }
  
  private async getShellVersion(command: string): Promise<string | undefined> {
    try {
      const { stdout } = await this.connection.executeCommand(command);
      const match = stdout.match(/(\d+\.\d+(\.\d+)?)/);
      return match ? match[1] : undefined;
    } catch {
      return undefined;
    }
  }
  
  private parseOSRelease(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([A-Z_]+)=["']?([^"'\n]*)["']?$/);
      if (match) {
        result[match[1]] = match[2];
      }
    }
    
    return result;
  }
  
  private getUnknownOS(): OSInfo {
    return {
      type: 'linux', // Assume Linux as fallback
      architecture: 'unknown',
      shell: { type: 'sh', path: '/bin/sh' },
    };
  }
}

Deliverables:

    OSDetector class working
    Correctly identifies Ubuntu, Debian
    Shell detection working

Day 3: Connection Storage

Tasks:

text

□ Task 2.3.1: Install electron-store
  └── Install: npm install electron-store
  └── Configure encryption for passwords

□ Task 2.3.2: Create CredentialVault service
  └── File: src/main/services/security/CredentialVault.ts
  └── Encrypt/decrypt passwords
  └── Store passwords separately from connection data

□ Task 2.3.3: Create ConnectionStore service
  └── File: src/main/services/storage/ConnectionStore.ts
  └── CRUD operations for connections
  └── Integrate with CredentialVault

□ Task 2.3.4: Create connection IPC handlers
  └── File: src/main/ipc/connection.handler.ts
  └── Implement getAll, create, update, delete
  └── Handle password storage

□ Task 2.3.5: Test connection storage
  └── Create connection, verify stored
  └── Update connection, verify updated
  └── Delete connection, verify deleted
  └── Verify password encryption

Code: src/main/services/security/CredentialVault.ts

typescript

import Store from 'electron-store';
import crypto from 'crypto';
import { safeStorage } from 'electron';

interface CredentialStore {
  passwords: Record<string, string>;
}

export class CredentialVault {
  private store: Store<CredentialStore>;
  
  constructor() {
    this.store = new Store<CredentialStore>({
      name: 'credentials',
      defaults: {
        passwords: {},
      },
    });
  }
  
  savePassword(connectionId: string, password: string): void {
    // Use Electron's safeStorage if available (uses OS keychain)
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(password);
      const passwords = this.store.get('passwords', {});
      passwords[connectionId] = encrypted.toString('base64');
      this.store.set('passwords', passwords);
    } else {
      //// Fallback: use our own encryption
      const encrypted = this.encryptPassword(password);
      const passwords = this.store.get('passwords', {});
      passwords[connectionId] = encrypted;
      this.store.set('passwords', passwords);
    }
  }
  
  getPassword(connectionId: string): string | null {
    const passwords = this.store.get('passwords', {});
    const encrypted = passwords[connectionId];
    
    if (!encrypted) {
      return null;
    }
    
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(encrypted, 'base64');
        return safeStorage.decryptString(buffer);
      } catch {
        return null;
      }
    } else {
      return this.decryptPassword(encrypted);
    }
  }
  
  deletePassword(connectionId: string): void {
    const passwords = this.store.get('passwords', {});
    delete passwords[connectionId];
    this.store.set('passwords', passwords);
  }
  
  hasPassword(connectionId: string): boolean {
    const passwords = this.store.get('passwords', {});
    return connectionId in passwords;
  }
  
  // Fallback encryption using machine-specific key
  private getEncryptionKey(): Buffer {
    // In production, derive from machine-specific data
    const machineId = process.env.COMPUTERNAME || 
                      process.env.HOSTNAME || 
                      'default-machine-id';
    return crypto.scryptSync(machineId, 'sma-salt', 32);
  }
  
  private encryptPassword(password: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(password, 'utf8'),
      cipher.final(),
    ]);
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encrypted (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }
  
  private decryptPassword(encryptedData: string): string | null {
    try {
      const [ivB64, authTagB64, encryptedB64] = encryptedData.split(':');
      
      const key = this.getEncryptionKey();
      const iv = Buffer.from(ivB64, 'base64');
      const authTag = Buffer.from(authTagB64, 'base64');
      const encrypted = Buffer.from(encryptedB64, 'base64');
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      
      return decrypted.toString('utf8');
    } catch {
      return null;
    }
  }
}

// Singleton instance
export const credentialVault = new CredentialVault();

Code: src/main/services/storage/ConnectionStore.ts

typescript

import Store from 'electron-store';
import { v4 as uuidv4 } from 'uuid';
import { SavedConnection, ConnectionInput } from '@shared/types';
import { credentialVault } from '../security/CredentialVault';

interface ConnectionStoreSchema {
  connections: SavedConnection[];
}

export class ConnectionStore {
  private store: Store<ConnectionStoreSchema>;
  
  constructor() {
    this.store = new Store<ConnectionStoreSchema>({
      name: 'connections',
      defaults: {
        connections: [],
      },
    });
  }
  
  getAll(): SavedConnection[] {
    return this.store.get('connections', []);
  }
  
  getById(id: string): SavedConnection | null {
    const connections = this.getAll();
    return connections.find(c => c.id === id) || null;
  }
  
  create(input: ConnectionInput): SavedConnection {
    const now = new Date().toISOString();
    
    const connection: SavedConnection = {
      id: uuidv4(),
      name: input.name,
      host: input.host,
      port: input.port || 22,
      username: input.username,
      hasPassword: false,
      createdAt: now,
      updatedAt: now,
    };
    
    // Save password if provided
    if (input.password && input.savePassword) {
      credentialVault.savePassword(connection.id, input.password);
      connection.hasPassword = true;
    }
    
    const connections = this.getAll();
    connections.push(connection);
    this.store.set('connections', connections);
    
    return connection;
  }
  
  update(id: string, input: Partial<ConnectionInput>): SavedConnection | null {
    const connections = this.getAll();
    const index = connections.findIndex(c => c.id === id);
    
    if (index === -1) {
      return null;
    }
    
    const connection = connections[index];
    
    // Update fields
    if (input.name !== undefined) connection.name = input.name;
    if (input.host !== undefined) connection.host = input.host;
    if (input.port !== undefined) connection.port = input.port;
    if (input.username !== undefined) connection.username = input.username;
    
    // Handle password update
    if (input.password !== undefined) {
      if (input.password && input.savePassword) {
        credentialVault.savePassword(id, input.password);
        connection.hasPassword = true;
      } else if (!input.savePassword) {
        credentialVault.deletePassword(id);
        connection.hasPassword = false;
      }
    }
    
    connection.updatedAt = new Date().toISOString();
    
    connections[index] = connection;
    this.store.set('connections', connections);
    
    return connection;
  }
  
  delete(id: string): boolean {
    const connections = this.getAll();
    const index = connections.findIndex(c => c.id === id);
    
    if (index === -1) {
      return false;
    }
    
    // Delete associated password
    credentialVault.deletePassword(id);
    
    connections.splice(index, 1);
    this.store.set('connections', connections);
    
    return true;
  }
  
  updateLastConnected(id: string): void {
    const connections = this.getAll();
    const index = connections.findIndex(c => c.id === id);
    
    if (index !== -1) {
      connections[index].lastConnectedAt = new Date().toISOString();
      this.store.set('connections', connections);
    }
  }
  
  getPassword(connectionId: string): string | null {
    return credentialVault.getPassword(connectionId);
  }
}

// Singleton instance
export const connectionStore = new ConnectionStore();

Deliverables:

    CredentialVault with encryption working
    ConnectionStore with CRUD operations
    Passwords encrypted at rest

Day 4: Connection Management UI

Tasks:

text

□ Task 2.4.1: Create ConnectionManager modal
  └── File: src/renderer/components/connections/ConnectionManager.tsx
  └── List all saved connections
  └── Search/filter functionality
  └── Connect, Edit, Delete buttons

□ Task 2.4.2: Create ConnectionForm modal
  └── File: src/renderer/components/connections/ConnectionForm.tsx
  └── Form for name, host, port, username, password
  └── Save password checkbox
  └── Test connection button
  └── Validation

□ Task 2.4.3: Create ConnectionItem component
  └── File: src/renderer/components/connections/ConnectionItem.tsx
  └── Display connection info
  └── Show last connected time
  └── Active indicator

□ Task 2.4.4: Create useConnections hook
  └── File: src/renderer/hooks/useConnections.ts
  └── Load connections on mount
  └── CRUD operations via IPC
  └── Connect/disconnect handlers

□ Task 2.4.5: Integrate with MenuBar
  └── Wire up New, Edit, Delete, Connect buttons
  └── Open modals on click

Code: src/renderer/components/connections/ConnectionManager.tsx

typescript

import React, { useState, useEffect } from 'react';
import { Search, Server, Clock, Wifi, WifiOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { ConnectionItem } from './ConnectionItem';
import { useConnectionStore } from '@/store/connectionStore';
import { useConnections } from '@/hooks/useConnections';
import type { SavedConnection } from '@shared/types';

interface ConnectionManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit: (connection: SavedConnection) => void;
  onNew: () => void;
}

export const ConnectionManager: React.FC<ConnectionManagerProps> = ({
  isOpen,
  onClose,
  onEdit,
  onNew,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const { savedConnections, activeConnection } = useConnectionStore();
  const { connect, disconnect, deleteConnection, loadConnections } = useConnections();
  
  useEffect(() => {
    if (isOpen) {
      loadConnections();
    }
  }, [isOpen, loadConnections]);
  
  const filteredConnections = savedConnections.filter(conn => 
    conn.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conn.host.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const handleConnect = async (connection: SavedConnection) => {
    await connect(connection.id);
    onClose();
  };
  
  const handleDisconnect = async () => {
    await disconnect();
  };
  
  const handleDelete = async (connection: SavedConnection) => {
    if (confirm(`Are you sure you want to delete "${connection.name}"?`)) {
      await deleteConnection(connection.id);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-[#252526] border-[#3c3c3c]">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Server className="h-5 w-5" />
            Connection Manager
          </DialogTitle>
        </DialogHeader>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search connections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-[#3c3c3c] border-[#3c3c3c] text-white"
          />
        </div>
        
        {/* Connection List */}
        <ScrollArea className="h-[400px] pr-4">
          {filteredConnections.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No connections found</p>
              <Button
                variant="link"
                onClick={onNew}
                className="text-blue-400 mt-2"
              >
                Create your first connection
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredConnections.map((connection) => (
                <ConnectionItem
                  key={connection.id}
                  connection={connection}
                  isActive={activeConnection?.connectionId === connection.id}
                  isConnected={
                    activeConnection?.connectionId === connection.id &&
                    activeConnection?.status === 'connected'
                  }
                  onConnect={() => handleConnect(connection)}
                  onDisconnect={handleDisconnect}
                  onEdit={() => onEdit(connection)}
                  onDelete={() => handleDelete(connection)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
        
        {/* Footer */}
        <div className="flex justify-between pt-4 border-t border-[#3c3c3c]">
          <Button variant="outline" onClick={onNew}>
            + New Connection
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

Code: src/renderer/components/connections/ConnectionForm.tsx

typescript

import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import type { SavedConnection, ConnectionInput } from '@shared/types';

interface ConnectionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: ConnectionInput) => Promise<void>;
  onTest: (input: ConnectionInput) => Promise<boolean>;
  editingConnection?: SavedConnection | null;
}

export const ConnectionForm: React.FC<ConnectionFormProps> = ({
  isOpen,
  onClose,
  onSave,
  onTest,
  editingConnection,
}) => {
  const [formData, setFormData] = useState<ConnectionInput>({
    name: '',
    host: '',
    port: 22,
    username: '',
    password: '',
    savePassword: true,
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failure' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Reset form when opening/closing or editing different connection
  useEffect(() => {
    if (isOpen) {
      if (editingConnection) {
        setFormData({
          name: editingConnection.name,
          host: editingConnection.host,
          port: editingConnection.port,
          username: editingConnection.username,
          password: '',
          savePassword: editingConnection.hasPassword,
        });
      } else {
        setFormData({
          name: '',
          host: '',
          port: 22,
          username: '',
          password: '',
          savePassword: true,
        });
      }
      setErrors({});
      setTestResult(null);
    }
  }, [isOpen, editingConnection]);
  
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.host.trim()) {
      newErrors.host = 'Host is required';
    }
    
    if (!formData.port || formData.port < 1 || formData.port > 65535) {
      newErrors.port = 'Port must be between 1 and 65535';
    }
    
    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    }
    
    // Password required for new connections or if saving password
    if (!editingConnection && !formData.password) {
      newErrors.password = 'Password is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleTest = async () => {
    if (!validate()) return;
    
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const success = await onTest(formData);
      setTestResult(success ? 'success' : 'failure');
    } catch {
      setTestResult('failure');
    } finally {
      setIsTesting(false);
    }
  };
  
  const handleSave = async () => {
    if (!validate()) return;
    
    setIsSaving(true);
    
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      setErrors({ submit: 'Failed to save connection' });
    } finally {
      setIsSaving(false);
    }
  };
  
  const updateField = (field: keyof ConnectionInput, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
    setTestResult(null);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-[#252526] border-[#3c3c3c]">
        <DialogHeader>
          <DialogTitle className="text-white">
            {editingConnection ? 'Edit Connection' : 'New Connection'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Connection Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-300">
              Connection Name
            </Label>
            <Input
              id="name"
              placeholder="My Raspberry Pi"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="bg-[#3c3c3c] border-[#3c3c3c] text-white"
            />
            {errors.name && (
              <p className="text-red-400 text-sm">{errors.name}</p>
            )}
          </div>
          
          {/* Host and Port */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="host" className="text-gray-300">
                Host / IP Address
              </Label>
              <Input
                id="host"
                placeholder="192.168.1.50"
                value={formData.host}
                onChange={(e) => updateField('host', e.target.value)}
                className="bg-[#3c3c3c] border-[#3c3c3c] text-white"
              />
              {errors.host && (
                <p className="text-red-400 text-sm">{errors.host}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="port" className="text-gray-300">
                Port
              </Label>
              <Input
                id="port"
                type="number"
                placeholder="22"
                value={formData.port}
                onChange={(e) => updateField('port', parseInt(e.target.value) || 22)}
                className="bg-[#3c3c3c] border-[#3c3c3c] text-white"
              />
              {errors.port && (
                <p className="text-red-400 text-sm">{errors.port}</p>
              )}
            </div>
          </div>
          
          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username" className="text-gray-300">
              Username
            </Label>
            <Input
              id="username"
              placeholder="pi"
              value={formData.username}
              onChange={(e) => updateField('username', e.target.value)}
              className="bg-[#3c3c3c] border-[#3c3c3c] text-white"
            />
            {errors.username && (
              <p className="text-red-400 text-sm">{errors.username}</p>
            )}
          </div>
          
          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-gray-300">
              Password
              {editingConnection?.hasPassword && (
                <span className="text-gray-500 ml-2">(leave empty to keep current)</span>
              )}
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => updateField('password', e.target.value)}
              className="bg-[#3c3c3c] border-[#3c3c3c] text-white"
            />
            {errors.password && (
              <p className="text-red-400 text-sm">{errors.password}</p>
            )}
          </div>
          
          {/* Save Password Checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="savePassword"
              checked={formData.savePassword}
              onCheckedChange={(checked) => updateField('savePassword', checked)}
            />
            <Label htmlFor="savePassword" className="text-gray-300 cursor-pointer">
              Save password (encrypted locally)
            </Label>
          </div>
          
          {/* Test Result */}
          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded ${
              testResult === 'success' 
                ? 'bg-green-900/30 text-green-400' 
                : 'bg-red-900/30 text-red-400'
            }`}>
              {testResult === 'success' ? (
                <>
                  <CheckCircle className="h-5 w-5" />
                  Connection successful!
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5" />
                  Connection failed. Check your settings.
                </>
              )}
            </div>
          )}
          
          {errors.submit && (
            <p className="text-red-400 text-sm">{errors.submit}</p>
          )}
        </div>
        
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={isTesting || isSaving}
          >
            {isTesting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

Deliverables:

    ConnectionManager modal working
    ConnectionForm with validation
    Test connection button working
    Edit/delete functionality

Day 5: Integration & Testing

Tasks:

text

□ Task 2.5.1: Wire up connection flow
  └── Update ssh.handler.ts with full implementation
  └── Integrate OS detection
  └── Send connected event with OSInfo

□ Task 2.5.2: Update StatusBar with connection info
  └── Show connection status
  └── Display OS info when connected
  └── Session timer

□ Task 2.5.3: Create useSSH hook
  └── File: src/renderer/hooks/useSSH.ts
  └── Handle connection events
  └── Manage connection state

□ Task 2.5.4: Integration testing
  └── Test full connection flow
  └── Verify OS detection
  └── Test disconnect handling
  └── Test error scenarios

□ Task 2.5.5: Bug fixes and polish
  └── Fix any issues found in testing
  └── Improve error messages
  └── Add loading states

Code: src/main/ipc/ssh.handler.ts

typescript

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipcChannels';
import { sshManager } from '../services/ssh/SSHManager';
import { OSDetector } from '../services/ssh/OSDetector';
import { connectionStore } from '../services/storage/ConnectionStore';
import type { ConnectionConfig } from '@shared/types';

export function registerSSHHandlers(mainWindow: BrowserWindow): void {
  sshManager.setMainWindow(mainWindow);
  
  // Connect
  ipcMain.handle(IPC_CHANNELS.SSH.CONNECT, async (_, config: ConnectionConfig) => {
    try {
      // Get password from vault if using saved connection
      let password = config.password;
      if (config.connectionId && !password) {
        password = connectionStore.getPassword(config.connectionId);
        if (!password) {
          throw new Error('No password available for this connection');
        }
      }
      
      // Connect
      await sshManager.connect(
        {
          host: config.host,
          port: config.port,
          username: config.username,
          password,
        },
        {
          cols: config.cols || 80,
          rows: config.rows || 24,
        }
      );
      
      // Detect OS
      const connection = (sshManager as any).connection;
      const osDetector = new OSDetector(connection);
      const osInfo = await osDetector.detect();
      
      // Update last connected time
      if (config.connectionId) {
        connectionStore.updateLastConnected(config.connectionId);
      }
      
      // Send connected event with OS info
      mainWindow.webContents.send(IPC_CHANNELS.SSH.CONNECTED, osInfo);
      
      return { success: true, osInfo };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      mainWindow.webContents.send(IPC_CHANNELS.SSH.ERROR, message);
      return { success: false, error: message };
    }
  });
  
  // Disconnect
  ipcMain.handle(IPC_CHANNELS.SSH.DISCONNECT, async () => {
    await sshManager.disconnect();
    return { success: true };
  });
  
  // Write to terminal
  ipcMain.on(IPC_CHANNELS.SSH.WRITE, (_, data: string) => {
    sshManager.write(data);
  });
  
  // Resize terminal
  ipcMain.on(IPC_CHANNELS.SSH.RESIZE, (_, cols: number, rows: number) => {
    sshManager.resize(cols, rows);
  });
  
  // Test connection (doesn't keep connection open)
  ipcMain.handle(IPC_CHANNELS.CONNECTION.TEST, async (_, config: ConnectionConfig) => {
    try {
      const { SSHConnection } = await import('../services/ssh/SSHConnection');
      const testConnection = new SSHConnection({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
      });
      
      await testConnection.connect();
      testConnection.disconnect();
      
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      return { success: false, error: message };
    }
  });
}

Code: src/renderer/hooks/useSSH.ts

typescript

import { useEffect, useCallback } from 'react';
import { useConnectionStore } from '@/store/connectionStore';
import type { OSInfo } from '@shared/types';

export function useSSH() {
  const { 
    setActiveConnection, 
    updateActiveConnectionStatus,
    setOSInfo,
    activeConnection,
  } = useConnectionStore();
  
  // Set up event listeners
  useEffect(() => {
    const unsubConnected = window.electronAPI.ssh.onConnected((osInfo: OSInfo) => {
      updateActiveConnectionStatus('connected');
      setOSInfo(osInfo);
    });
    
    const unsubDisconnected = window.electronAPI.ssh.onDisconnected(() => {
      setActiveConnection(null);
    });
    
    const unsubError = window.electronAPI.ssh.onError((error: string) => {
      console.error('SSH Error:', error);
      updateActiveConnectionStatus('error');
    });
    
    return () => {
      unsubConnected();
      unsubDisconnected();
      unsubError();
    };
  }, [setActiveConnection, updateActiveConnectionStatus, setOSInfo]);
  
  const connect = useCallback(async (
    connectionId: string,
    host: string,
    port: number,
    username: string,
    password?: string,
    cols?: number,
    rows?: number,
  ) => {
    setActiveConnection({
      id: `session-${Date.now()}`,
      connectionId,
      status: 'connecting',
      connectedAt: undefined,
      osInfo: undefined,
    });
    
    const result = await window.electronAPI.ssh.connect({
      connectionId,
      host,
      port,
      username,
      password,
      cols,
      rows,
    });
    
    if (result.success) {
      setActiveConnection({
        id: `session-${Date.now()}`,
        connectionId,
        status: 'connected',
        connectedAt: new Date(),
        osInfo: result.osInfo,
      });
    } else {
      setActiveConnection(null);
    }
    
    return result;
  }, [setActiveConnection]);
  
  const disconnect = useCallback(async () => {
    await window.electronAPI.ssh.disconnect();
    setActiveConnection(null);
  }, [setActiveConnection]);
  
  const write = useCallback((data: string) => {
    window.electronAPI.ssh.write(data);
  }, []);
  
  const resize = useCallback((cols: number, rows: number) => {
    window.electronAPI.ssh.resize(cols, rows);
  }, []);
  
  return {
    activeConnection,
    connect,
    disconnect,
    write,
    resize,
    isConnected: activeConnection?.status === 'connected',
    isConnecting: activeConnection?.status === 'connecting',
  };
}

5.3 Sprint 2 Definition of Done

    Can create, edit, delete SSH connections
    Passwords are encrypted at rest
    Can connect to SSH server with password
    OS is detected correctly (Linux distributions)
    Connection status shown in UI
    Can disconnect cleanly
    Error handling for failed connections
    Test connection button works

6. Sprint 3: Terminal & UI

Duration: Week 3 (5 days)
Goal: Implement full terminal emulator and polish UI to VSCode-like appearance
6.1 Sprint 3 Objectives

    Integrate xterm.js terminal emulator
    Connect terminal to SSH PTY stream
    Implement copy/paste functionality
    Apply VSCode-like theme/styling
    Add terminal toolbar
    Polish overall UI appearance

6.2 Day-by-Day Breakdown
Day 1: xterm.js Integration

Tasks:

text

□ Task 3.1.1: Set up xterm.js
  └── Install: xterm, xterm-addon-fit, xterm-addon-web-links
  └── Create terminal container component
  └── Configure xterm options

□ Task 3.1.2: Create TerminalPanel component
  └── File: src/renderer/components/terminal/TerminalPanel.tsx
  └── Initialize xterm on mount
  └── Handle resize events
  └── Apply addons (fit, web-links)

□ Task 3.1.3: Create useTerminal hook
  └── File: src/renderer/hooks/useTerminal.ts
  └── Terminal instance management
  └── Data write/read handlers

□ Task 3.1.4: Connect terminal to SSH
  └── Write terminal input to SSH
  └── Display SSH output in terminal
  └── Handle resize sync

□ Task 3.1.5: Test terminal functionality
  └── Verify bidirectional communication
  └── Test terminal resize
  └── Test special keys (Ctrl+C, etc.)

Code: src/renderer/components/terminal/TerminalPanel.tsx

typescript

import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { useConnectionStore } from '@/store/connectionStore';
import { TerminalToolbar } from './TerminalToolbar';
import 'xterm/css/xterm.css';

export const TerminalPanel: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  
  const { activeConnection } = useConnectionStore();
  const isConnected = activeConnection?.status === 'connected';
  
  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;
    
    const terminal = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        black: '#1e1e1e',
        red: '#f44747',
        green: '#6a9955',
        yellow: '#dcdcaa',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f44747',
        brightGreen: '#6a9955',
        brightYellow: '#dcdcaa',
        brightBlue: '#569cd6',
        brightMagenta: '#c586c0',
        brightCyan: '#4ec9b0',
        brightWhite: '#ffffff',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true,
    });
    
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    
    terminal.open(terminalRef.current);
    fitAddon.fit();
    
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    
    // Handle terminal input
    terminal.onData((data) => {
      window.electronAPI.ssh.write(data);
    });
    
    // Handle terminal resize
    terminal.onResize(({ cols, rows }) => {
      window.electronAPI.ssh.resize(cols, rows);
    });
    
    // Initial welcome message
    terminal.writeln('\x1b[1;34m╔════════════════════════════════════════╗\x1b[0m');
    terminal.writeln('\x1b[1;34m║\x1b[0m   \x1b[1;37mServer Maintenance Agent\x1b[0m             \x1b[1;34m║\x1b[0m');
    terminal.writeln('\x1b[1;34m║\x1b[0m   Connect to a server to begin...     \x1b[1;34m║\x1b[0m');
    terminal.writeln('\x1b[1;34m╚════════════════════════════════════════╝\x1b[0m');
    terminal.writeln('');
    
    return () => {
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);
  
  // Handle SSH data
  useEffect(() => {
    const unsubscribe = window.electronAPI.ssh.onData((data: string) => {
      if (xtermRef.current) {
        xtermRef.current.write(data);
      }
    });
    
    return unsubscribe;
  }, []);
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Also observe the container for size changes
    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalRef.current?.parentElement) {
      resizeObserver.observe(terminalRef.current.parentElement);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, []);
  
  // Clear terminal when disconnected
  useEffect(() => {
    if (!isConnected && xtermRef.current) {
      // Don't clear, just add a message
      xtermRef.current.writeln('');
      xtermRef.current.writeln('\x1b[1;31m[Disconnected]\x1b[0m');
      xtermRef.current.writeln('');
    }
  }, [isConnected]);
  
  // Copy selected text
  const handleCopy = useCallback(() => {
    if (xtermRef.current) {
      const selection = xtermRef.current.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
      }
    }
  }, []);
  
  // Paste from clipboard
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && xtermRef.current) {
        // Write to SSH, not directly to terminal
        window.electronAPI.ssh.write(text);
      }
    } catch (error) {
      console.error('Failed to paste:', error);
    }
  }, []);
  
  // Clear terminal
  const handleClear = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  }, []);
  
  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      {/* Terminal Container */}
      <div 
        ref={terminalRef}
        className="flex-1 p-2"
        style={{ minHeight: 0 }} // Important for flex child
      />
      
      {/* Toolbar */}
      <TerminalToolbar
        onCopy={handleCopy}
        onPaste={handlePaste}
        onClear={handleClear}
        isConnected={isConnected}
      />
    </div>
  );
};

Code: src/renderer/components/terminal/TerminalToolbar.tsx

typescript

import React from 'react';
import { Copy, ClipboardPaste, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface TerminalToolbarProps {
  onCopy: () => void;
  onPaste: () => void;
  onClear: () => void;
  isConnected: boolean;
}

export const TerminalToolbar: React.FC<TerminalToolbarProps> = ({
  onCopy,
  onPaste,
  onClear,
  isConnected,
}) => {
  return (
    <div className="h-10 bg-[#252526] border-t border-[#3c3c3c] flex items-center px-2 gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCopy}
            className="h-7 px-2"
          >
            <Copy className="h-4 w-4 mr-1" />
            Copy
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy selected text (Ctrl+Shift+C)</TooltipContent>
      </Tooltip>
      
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onPaste}
            disabled={!isConnected}
            className="h-7 px-2"
          >
            <ClipboardPaste className="h-4 w-4 mr-1" />
            Paste
          </Button>
        </TooltipTrigger>
        <TooltipContent>Paste from clipboard (Ctrl+Shift+V)</TooltipContent>
      </Tooltip>
      
      <div className="flex-1" />
      
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-7 px-2 text-gray-400 hover:text-white"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </TooltipTrigger>
        <TooltipContent>Clear terminal output</TooltipContent>
      </Tooltip>
    </div>
  );
};

Deliverables:

    xterm.js rendering in terminal panel
    Terminal connected to SSH stream
    Copy/paste working

Day 2: Terminal Polish & Keyboard Shortcuts

Tasks:

text

□ Task 3.2.1: Implement keyboard shortcuts
  └── Ctrl+Shift+C for copy
  └── Ctrl+Shift+V for paste
  └── Ctrl+L for clear (pass through)

□ Task 3.2.2: Add terminal context menu
  └── Right-click menu with Copy, Paste, Clear
  └── Select All option

□ Task 3.2.3: Improve terminal scrolling
  └── Smooth scrolling
  └── Scroll to bottom on new output
  └── Preserve scroll position when reading history

□ Task 3.2.4: Handle terminal focus
  └── Auto-focus on connection
  └── Focus indicator styling
  └── Tab navigation support

□ Task 3.2.5: Add terminal search (optional)
  └── Ctrl+F to search
  └── Highlight matches

Deliverables:

    Keyboard shortcuts working
    Context menu functional
    Smooth terminal experience

Day 3: VSCode Theme & Styling

Tasks:

text

□ Task 3.3.1: Create VSCode dark theme CSS
  └── File: src/renderer/styles/themes/vscode-dark.css
  └── Match VSCode color palette
  └── Define CSS variables

□ Task 3.3.2: Style all components
  └── Update Tailwind config with VSCode colors
  └── Apply consistent styling across app
  └── Style scrollbars

□ Task 3.3.3: Add icons and visual polish
  └── Connection status icons
  └── OS type icons
  └── Mode icons

□ Task 3.3.4: Implement loading states
  └── Connection loading spinner
  └── Message sending indicator
  └── Skeleton loaders where appropriate

□ Task 3.3.5: Add transitions and animations
  └── Smooth panel transitions
  └── Button hover effects
  └── Modal animations

Code: tailwind.config.js (VSCode colors)

javascript

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // VSCode Dark+ Theme Colors
        vscode: {
          // Backgrounds
          'bg-primary': '#1e1e1e',
          'bg-secondary': '#252526',
          'bg-tertiary': '#2d2d2d',
          'bg-input': '#3c3c3c',
          
          // Borders
          'border': '#3c3c3c',
          'border-focus': '#007acc',
          
          // Text
          'text-primary': '#d4d4d4',
          'text-secondary': '#808080',
          'text-muted': '#6e6e6e',
          
          // Accent
          'accent': '#007acc',
          'accent-hover': '#1c8bcf',
          
          // Status
          'success': '#4ec9b0',
          'warning': '#dcdcaa',
          'error': '#f44747',
          'info': '#569cd6',
          
          // Terminal colors
          'terminal-black': '#1e1e1e',
          'terminal-red': '#f44747',
          'terminal-green': '#6a9955',
          'terminal-yellow': '#dcdcaa',
          'terminal-blue': '#569cd6',
          'terminal-magenta': '#c586c0',
          'terminal-cyan': '#4ec9b0',
          'terminal-white': '#d4d4d4',
        },
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', 'Menlo', 'Monaco', 'monospace'],
      },
    },
  },
  plugins: [],
};

Deliverables:

    VSCode-like appearance
    Consistent theming
    Polished visual appearance

Day 4: Chat Panel Foundation

Tasks:

text

□ Task 3.4.1: Create ChatPanel component
  └── File: src/renderer/components/chat/ChatPanel.tsx
  └── Message list area
  └── Input area
  └── System info header

□ Task 3.4.2: Create ChatMessage component
  └── File: src/renderer/components/chat/ChatMessage.tsx
  └── User message styling
  └── Assistant message styling
  └── Timestamp display

□ Task 3.4.3: Create ChatInput component
  └── File: src/renderer/components/chat/ChatInput.tsx
  └── Multiline input
  └── Send button
  └── Enter to send, Shift+Enter for newline

□ Task 3.4.4: Create SystemInfo component
  └── File: src/renderer/components/chat/SystemInfo.tsx
  └── Display OS info
  └── Connection status
  └── Collapsible

□ Task 3.4.5: Style chat components
  └── Match VSCode theme
  └── Smooth scrolling
  └── Message animations

Code: src/renderer/components/chat/ChatPanel.tsx

typescript

import React, { useRef, useEffect } from 'react';
import { Bot, Terminal } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { SystemInfo } from './SystemInfo';
import { PlanView } from './PlanView';
import { useChatStore } from '@/store/chatStore';
import { useConnectionStore } from '@/store/connectionStore';

export const ChatPanel: React.FC = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { messages, currentPlan, isLoading, mode } = useChatStore();
  const { activeConnection } = useConnectionStore();
  
  const isConnected = activeConnection?.status === 'connected';
  const osInfo = activeConnection?.osInfo;
  
  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);
  
  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      {/* Header */}
      <div className="h-10 bg-[#252526] border-b border-[#3c3c3c] flex items-center px-4">
        <Bot className="h-4 w-4 mr-2 text-[#007acc]" />
        <span className="text-sm font-medium text-white">AI Assistant</span>
        <span className="ml-2 text-xs text-gray-500">
          {mode === 'fixer' ? 'Fixer Mode' : 'Teacher Mode'}
        </span>
      </div>
      
      {/* System Info (when connected) */}
      {isConnected && osInfo && (
        <SystemInfo osInfo={osInfo} connection={activeConnection} />
      )}
      
      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {!isConnected ? (
            <div className="text-center py-12 text-gray-400">
              <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Connect to a server to start</p>
              <p className="text-sm mt-2">
                The AI assistant will help you manage your server
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>Ask me anything about this server!</p>
              <p className="text-sm mt-2">
                Try: "Check disk space" or "Install Docker"
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessage key={message.id} message={message} mode={mode} />
            ))
          )}
          
          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 text-gray-400">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-[#007acc] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-[#007acc] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-[#007acc] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-sm">AI is thinking...</span>
            </div>
          )}
          
          {/* Current Plan */}
          {currentPlan && (
            <PlanView plan={currentPlan} />
          )}
        </div>
      </ScrollArea>
      
      {/* Input */}
      <ChatInput disabled={!isConnected || isLoading} />
    </div>
  );
};

Code: src/renderer/components/chat/ChatMessage.tsx

typescript

import React from 'react';
import { User, Bot, Copy, Play } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Button } from '../ui/button';
import type { ChatMessage as ChatMessageType } from '@shared/types';

interface ChatMessageProps {
  message: ChatMessageType;
  mode: 'fixer' | 'teacher';
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, mode }) => {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  
  const handleCopyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
  };
  
  const handleExecuteCommand = (command: string) => {
    window.electronAPI.ssh.write(command + '\n');
  };
  
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}>
      {/* Avatar */}
      {isAssistant && (
        <div className="w-8 h-8 rounded-full bg-[#007acc] flex items-center justify-center flex-shrink-0">
          <Bot className="h-5 w-5 text-white" />
        </div>
      )}
      
      {/* Message Content */}
      <div className={`max-w-[80%] ${isUser ? 'order-first' : ''}`}>
        {/* Header */}
        <div className={`text-xs text-gray-500 mb-1 ${isUser ? 'text-right' : ''}`}>
          {isUser ? 'You' : 'Assistant'}
          <span className="ml-2">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>
        
        {/* Content */}
        <div className={`rounded-lg p-3 ${
          isUser 
            ? 'bg-[#007acc] text-white' 
            : 'bg-[#2d2d2d] text-[#d4d4d4]'
        }`}>
          <ReactMarkdown
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                const codeString = String(children).replace(/\n$/, '');
                
                if (!inline && match) {
                  return (
                    <div className="relative group">
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        className="rounded-md !bg-[#1e1e1e] !mt-2 !mb-2"
                        {...props}
                      >
                        {codeString}
                      </SyntaxHighlighter>
                      
                      {/* Command actions (for bash/sh blocks in Teacher mode) */}
                      {mode === 'teacher' && (match[1] === 'bash' || match[1] === 'sh') && (
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 px-2"
                            onClick={() => handleCopyCommand(codeString)}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 px-2"
                            onClick={() => handleExecuteCommand(codeString)}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Run
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                }
                
                return (
                  <code className="bg-[#1e1e1e] px-1.5 py-0.5 rounded text-sm" {...props}>
                    {children}
                  </code>
                );
              },
              p({ children }) {
                return <p className="mb-2 last:mb-0">{children}</p>;
              },
              ul({ children }) {
                return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>;
              },
              ol({ children }) {
                return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>;
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
      
      {/* User Avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-[#6a9955] flex items-center justify-center flex-shrink-0">
          <User className="h-5 w-5 text-white" />
        </div>
      )}
    </div>
  );
};

Deliverables:

    Chat panel rendering messages
    Markdown rendering with syntax highlighting
    Copy/Run buttons on code blocks

Day 5: Integration & Polish

Tasks:

text

□ Task 3.5.1: Final UI integration
  └── Connect all components
  └── Verify state management
  └── Test full UI flow

□ Task 3.5.2: Responsive behavior
  └── Handle window resize
  └── Minimum window size
  └── Panel minimum widths

□ Task 3.5.3: Accessibility improvements
  └── Keyboard navigation
  └── ARIA labels
  └── Focus management

□ Task 3.5.4: Performance optimization
  └── Virtualized message list (if needed)
  └── Debounced resize handlers
  └── Memoized components

□ Task 3.5.5: Sprint 3 testing
  └── Full UI walkthrough
  └── Test all interactions
  └── Fix visual bugs

6.3 Sprint 3 Definition of Done

    Terminal displays SSH output correctly
    Terminal accepts keyboard input
    Copy/paste working in terminal
    Terminal resize syncs with SSH
    VSCode-like theme applied consistently
    Chat panel displays messages
    Markdown/code rendering works
    All UI interactions are smooth
    No visual glitches



#########################################################
### THIS SECTION HAS BEEN UPDATED TO INCLUDE AGENTIC LOOPING IN FUTURE RELEASES. THE CURRENT SPRINT FOCUSES ON THE INITIAL IMPLEMENTATION OF A PLAN FOLLOWER WITHOUT THE LOOPING MECHANISM. THE LOOPING FUNCTIONALITY WILL BE ADDED IN LATER.
#########################################################

### Updated Sprint 4: AI Integration (Agent-Ready)

Here's your Sprint 4 with the agent loop foundation baked in. I've kept your existing structure and schedule but modified specific components and added targeted tasks. Changes are marked with 🔄 MODIFIED and 🆕 NEW.
7. Sprint 4: AI Integration

Duration: Week 4 (5 days)
Goal: Integrate Claude AI, implement chat functionality, session persistence, and establish the composable context and structured result patterns needed for future agentic execution
7.1 Sprint 4 Objectives

    Integrate Anthropic Claude API
    Implement composable context building for AI
    Create session persistence with structured execution records
    Implement basic chat flow
    Handle AI streaming responses
    🆕 Establish AIContext as a composable, block-based context system
    🆕 Define structured result types that the future agent loop will consume

7.2 Day-by-Day Breakdown
Day 1: Claude API Integration

Tasks:

text

□ Task 4.1.1: Create ClaudeProvider service
  └── File: src/main/services/ai/providers/ClaudeProvider.ts
  └── Initialize Anthropic client
  └── Message sending with streaming
  └── Error handling

□ Task 4.1.2: Create LLMProvider interface
  └── File: src/main/services/ai/providers/LLMProvider.ts
  └── Abstract interface for AI providers
  └── Support for future providers

□ Task 4.1.3: Create settings storage
  └── File: src/main/services/storage/SettingsStore.ts
  └── Store API key (encrypted)
  └── Store app preferences

□ Task 4.1.4: Create settings IPC handlers
  └── File: src/main/ipc/settings.handler.ts
  └── Get/set settings
  └── Validate API key

□ Task 4.1.5: Create Settings modal UI
  └── API key input
  └── Model selection
  └── Test API key button

🆕 Task 4.1.6: Create AIContext class
  └── File: src/main/services/ai/AIContext.ts
  └── Composable context block system
  └── Explicit context assembly per-call
  └── Foundation for agent loop context injection

Code: src/main/services/ai/providers/LLMProvider.ts

typescript

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMStreamHandler {
  onChunk: (chunk: string) => void;
  onComplete: (response: LLMResponse) => void;
  onError: (error: Error) => void;
}

export interface LLMProvider {
  initialize(apiKey: string): void;
  setModel(model: string): void;
  isInitialized(): boolean;
  sendMessage(systemPrompt: string, messages: LLMMessage[]): Promise<LLMResponse>;
  sendMessageStream(
    systemPrompt: string,
    messages: LLMMessage[],
    handler: LLMStreamHandler
  ): Promise<void>;
  validateApiKey(apiKey: string): Promise<boolean>;
}

Code: src/main/services/ai/providers/ClaudeProvider.ts

typescript

import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMMessage, LLMResponse, LLMStreamHandler } from './LLMProvider';

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic | null = null;
  private model: string = 'claude-3-5-sonnet-20241022';

  initialize(apiKey: string): void {
    this.client = new Anthropic({ apiKey });
  }

  setModel(model: string): void {
    this.model = model;
  }

  isInitialized(): boolean {
    return this.client !== null;
  }

  async sendMessage(
    systemPrompt: string,
    messages: LLMMessage[],
  ): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error('Claude provider not initialized');
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const textContent = response.content.find(c => c.type === 'text');

    return {
      content: textContent?.text || '',
      stopReason: response.stop_reason || 'end_turn',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async sendMessageStream(
    systemPrompt: string,
    messages: LLMMessage[],
    handler: LLMStreamHandler,
  ): Promise<void> {
    if (!this.client) {
      throw new Error('Claude provider not initialized');
    }

    const stream = await this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta as { type: string; text?: string };
        if (delta.type === 'text_delta' && delta.text) {
          handler.onChunk(delta.text);
        }
      }
    }

    const finalMessage = await stream.finalMessage();
    handler.onComplete({
      content: finalMessage.content
        .filter(c => c.type === 'text')
        .map(c => (c as { type: 'text'; text: string }).text)
        .join(''),
      stopReason: finalMessage.stop_reason || 'end_turn',
      usage: {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
      },
    });
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const testClient = new Anthropic({ apiKey });
      await testClient.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return true;
    } catch (error) {
      console.error('API key validation failed:', error);
      return false;
    }
  }
}

export const claudeProvider = new ClaudeProvider();

🆕 Code: src/main/services/ai/AIContext.ts

This is the critical new addition. Instead of building context through string template replacement, AIContext is a composable object that any caller — chat, plan executor, or future agent loop — can assemble explicitly.

typescript

import { OSInfo, ActiveConnection, ChatMessage } from '@shared/types';
import { CommandResult, StepResult } from '@shared/types/execution';

/**
 * A composable context object that is explicitly assembled per AI call.
 * 
 * This is deliberately NOT a stateful service. Each AI invocation creates
 * or receives a fresh AIContext. This design allows:
 * - Chat to build context from conversation history
 * - Plan executor to build context from step results  
 * - Future agent loop to build context from goal state + failure history
 */

interface ContextBlock {
  priority: number;    // Lower = higher priority when truncating
  tokenEstimate: number;
  content: string;
  label: string;
}

export class AIContext {
  private blocks: ContextBlock[] = [];
  private maxTokenBudget: number = 80000; // Leave room for response

  // ── Connection & System Info (always included) ──────────────────

  addSystemInfo(connection: ActiveConnection, osInfo: OSInfo): this {
    this.blocks.push({
      priority: 0, // Highest priority — never truncated
      label: 'system-info',
      tokenEstimate: 200,
      content: [
        `## Current Connection Context`,
        `- **Host:** ${connection.connectionId || 'unknown'}`,
        `- **OS:** ${osInfo.type} ${osInfo.distribution || ''} ${osInfo.version || ''}`,
        `- **Architecture:** ${osInfo.architecture}`,
        `- **Shell:** ${osInfo.shell.type}${osInfo.shell.version ? ` (${osInfo.shell.version})` : ''}`,
        osInfo.kernel ? `- **Kernel:** ${osInfo.kernel}` : '',
      ].filter(Boolean).join('\n'),
    });
    return this;
  }

  // ── Mode ────────────────────────────────────────────────────────

  addMode(mode: 'fixer' | 'teacher'): this {
    const modeDescription = mode === 'fixer'
      ? 'You are in **Fixer Mode**. Commands will be executed automatically with appropriate safety checks. Be concise and efficient.'
      : 'You are in **Teacher Mode**. Commands will be shown to the user with explanations. Provide detailed explanations for every command.';

    this.blocks.push({
      priority: 0,
      label: 'mode',
      tokenEstimate: 50,
      content: `## Mode\n${modeDescription}`,
    });
    return this;
  }

  // ── Chat History ────────────────────────────────────────────────

  addChatHistory(messages: ChatMessage[], maxMessages: number = 20): this {
    const recent = messages.slice(-maxMessages);
    const content = recent
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content.substring(0, 500)}${msg.content.length > 500 ? '...' : ''}`)
      .join('\n\n');

    this.blocks.push({
      priority: 2,
      label: 'chat-history',
      tokenEstimate: content.length / 4, // Rough token estimate
      content: `## Conversation History\n${content || '(No previous messages)'}`,
    });
    return this;
  }

  // ── Terminal Output ─────────────────────────────────────────────

  addTerminalOutput(output: string, maxLines: number = 50): this {
    const lines = output.split('\n').slice(-maxLines).join('\n');
    this.blocks.push({
      priority: 3,
      label: 'terminal-output',
      tokenEstimate: lines.length / 4,
      content: `## Recent Terminal Output\n\`\`\`\n${lines || '(No recent output)'}\n\`\`\``,
    });
    return this;
  }

  // ── Current Task / Plan State (used by executor and future agent) ──

  addCurrentTask(goal: string, planSteps: any[], currentStepIndex: number): this {
    const stepsDisplay = planSteps.map((step, i) => {
      let status = '⬜';
      if (i < currentStepIndex) status = '✅';
      if (i === currentStepIndex) status = '🔄';
      return `${status} Step ${i + 1}: ${step.description} — \`${step.command}\``;
    }).join('\n');

    this.blocks.push({
      priority: 1, // High priority — agent needs this
      label: 'current-task',
      tokenEstimate: stepsDisplay.length / 4,
      content: `## Current Task\n**Goal:** ${goal}\n\n**Plan:**\n${stepsDisplay}`,
    });
    return this;
  }

  // ── Command Result (used after each step execution) ─────────────

  addCommandResult(result: CommandResult): this {
    this.blocks.push({
      priority: 1,
      label: 'last-command-result',
      tokenEstimate: (result.stdout.length + result.stderr.length) / 4,
      content: [
        `## Last Command Result`,
        `**Command:** \`${result.command}\``,
        `**Exit Code:** ${result.exitCode}`,
        `**Duration:** ${result.duration}ms`,
        result.stdout ? `**stdout:**\n\`\`\`\n${result.stdout.substring(0, 2000)}\n\`\`\`` : '',
        result.stderr ? `**stderr:**\n\`\`\`\n${result.stderr.substring(0, 1000)}\n\`\`\`` : '',
        result.timedOut ? `**⚠️ Command timed out**` : '',
      ].filter(Boolean).join('\n'),
    });
    return this;
  }

  // ── Step Failure History (critical for future agent replanning) ──

  addFailureHistory(failures: StepResult[]): this {
    if (failures.length === 0) return this;

    const content = failures.map((f, i) =>
      `**Attempt ${i + 1}:** \`${f.command}\` → Exit ${f.exitCode}\n${f.error || f.stderr || 'Unknown error'}`
    ).join('\n\n');

    this.blocks.push({
      priority: 1,
      label: 'failure-history',
      tokenEstimate: content.length / 4,
      content: `## Previous Failed Attempts\n${content}`,
    });
    return this;
  }

  // 🆕 ── Agent State (placeholder for future agent loop) ──────────

  addAgentState(state: {
    iteration: number;
    maxIterations: number;
    consecutiveFailures: number;
    goal: string;
    assessment: string;
  }): this {
    this.blocks.push({
      priority: 0,
      label: 'agent-state',
      tokenEstimate: 100,
      content: [
        `## Agent State`,
        `- **Goal:** ${state.goal}`,
        `- **Iteration:** ${state.iteration} / ${state.maxIterations}`,
        `- **Consecutive Failures:** ${state.consecutiveFailures}`,
        `- **Current Assessment:** ${state.assessment}`,
      ].join('\n'),
    });
    return this;
  }

  // ── Assembly ────────────────────────────────────────────────────

  /**
   * Assembles all context blocks into a system prompt string.
   * Blocks are sorted by priority and truncated if they exceed the token budget.
   */
  toSystemPrompt(basePrompt: string): string {
    // Sort by priority (lower number = higher priority)
    const sorted = [...this.blocks].sort((a, b) => a.priority - b.priority);

    let totalTokens = basePrompt.length / 4; // Rough estimate for base
    const included: string[] = [basePrompt];

    for (const block of sorted) {
      if (totalTokens + block.tokenEstimate > this.maxTokenBudget) {
        console.warn(`Truncating context block "${block.label}" — token budget exceeded`);
        continue;
      }
      included.push(block.content);
      totalTokens += block.tokenEstimate;
    }

    return included.join('\n\n');
  }

  /**
   * Converts chat history blocks into LLM message format.
   * Used when the caller needs messages separate from the system prompt.
   */
  toMessages(chatHistory: ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
    return chatHistory
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
  }

  /**
   * Returns estimated total token usage for this context.
   */
  estimateTokens(): number {
    return this.blocks.reduce((sum, b) => sum + b.tokenEstimate, 0);
  }
}

🆕 Code: src/shared/types/execution.ts

These structured types are used now by the plan executor and later by the agent loop:

typescript

/**
 * Structured result from executing a command via SSH.
 * This is NOT just a terminal string — it's structured data
 * that the AI (and future agent loop) can reason about.
 */
export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;       // milliseconds
  timedOut: boolean;
  timestamp: string;      // ISO string
}

/**
 * Result of a single plan step execution, including the AI's assessment.
 */
export interface StepResult {
  stepId: string;
  stepIndex: number;
  command: string;
  commandResult: CommandResult;
  assessment: StepAssessment;
  timestamp: string;
}

/**
 * AI's assessment of whether a step succeeded.
 * In the current plan executor, this is logged.
 * In the future agent loop, this drives replanning decisions.
 */
export interface StepAssessment {
  succeeded: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  suggestedAction?: 'continue' | 'retry' | 'revise-plan' | 'ask-user';
}

/**
 * Events emitted during plan execution.
 * Extensible — future agent events slot in without breaking existing UI.
 */
export type PlanEvent =
  | { type: 'step-started'; stepId: string; stepIndex: number; command: string }
  | { type: 'step-completed'; stepId: string; result: StepResult }
  | { type: 'step-failed'; stepId: string; result: StepResult }
  | { type: 'step-skipped'; stepId: string; reason: string }
  | { type: 'approval-needed'; stepId: string; command: string; risk: any }
  | { type: 'approval-received'; stepId: string; approved: boolean }
  | { type: 'plan-completed'; results: StepResult[] }
  | { type: 'plan-cancelled'; reason: string; completedSteps: number }
  // 🆕 Future agent events — defined now so IPC contract is stable
  | { type: 'plan-revised'; reason: string; newStepCount: number }
  | { type: 'retry-attempt'; stepId: string; attempt: number; maxAttempts: number }
  | { type: 'agent-thinking'; message: string }
  | { type: 'agent-stuck'; reason: string; failedAttempts: number }
  | { type: 'budget-warning'; iterationsRemaining: number; tokensUsed: number };

/**
 * Record of an entire plan execution. Persisted for session history
 * and future agent loop context.
 */
export interface ExecutionRecord {
  planId: string;
  goal: string;
  startedAt: string;
  completedAt?: string;
  status: 'completed' | 'failed' | 'cancelled' | 'in-progress';
  steps: StepResult[];
  totalTokensUsed: number;
  finalOutcome?: string;
}

Deliverables:

    ✅ ClaudeProvider working with streaming
    ✅ API key validation
    ✅ Settings storage
    🆕 AIContext composable class
    🆕 Structured execution types defined

Day 2: Context Building 🔄 MODIFIED

Tasks:

text

🔄 Task 4.2.1: Create ContextBuilder service (now a thin wrapper)
  └── File: src/main/services/ai/ContextBuilder.ts
  └── Terminal output buffer (kept from original)
  └── Convenience method that assembles AIContext for chat use case
  └── NOTE: No longer builds system prompt via string replacement.
  └── Instead, creates an AIContext and calls toSystemPrompt()

🔄 Task 4.2.2: Create system prompt template (simplified)
  └── File: src/main/services/ai/prompts/systemPrompt.ts
  └── Base prompt only — no {{template}} variables
  └── Context injected via AIContext blocks, not string replacement

□ Task 4.2.3: Implement terminal output capture
  └── Store last N lines of terminal output
  └── Filter sensitive information
  └── Include in context

🔄 Task 4.2.4: Create AIOrchestrator service
  └── File: src/main/services/ai/AIOrchestrator.ts
  └── Uses AIContext (not string templates) for every AI call
  └── Stateless per-call — context explicitly passed, not accumulated
  └── Manage conversation routing (chat vs plan)

□ Task 4.2.5: Test context building
  └── Verify OS info included
  └── Verify terminal output included
  └── Check prompt formatting
  └── 🆕 Verify AIContext can be assembled by different callers

🔄 Code: src/main/services/ai/ContextBuilder.ts

This is now a thin convenience layer that manages terminal buffering and provides a shortcut for building chat-oriented context. The actual context composition lives in AIContext.

typescript

import { OSInfo, ActiveConnection, ChatMessage } from '@shared/types';
import { AIContext } from './AIContext';
import { BASE_SYSTEM_PROMPT } from './prompts/systemPrompt';

/**
 * Convenience service for managing terminal output buffering
 * and building AIContext for the chat use case.
 * 
 * The plan executor and future agent loop will build their own
 * AIContext directly — they don't need to go through this class.
 */
export class ContextBuilder {
  private terminalBuffer: string[] = [];
  private maxBufferLines: number = 100;

  appendTerminalOutput(output: string): void {
    const lines = output.split('\n');
    this.terminalBuffer.push(...lines);
    if (this.terminalBuffer.length > this.maxBufferLines) {
      this.terminalBuffer = this.terminalBuffer.slice(-this.maxBufferLines);
    }
  }

  clearTerminalBuffer(): void {
    this.terminalBuffer = [];
  }

  getRecentTerminalOutput(lines: number = 50): string {
    return this.terminalBuffer.slice(-lines).join('\n');
  }

  /**
   * Builds an AIContext for a standard chat interaction.
   * This is ONE way to build context. The plan executor builds it differently.
   * The future agent loop will build it yet another way.
   */
  buildChatContext(input: {
    connection: ActiveConnection;
    osInfo: OSInfo;
    mode: 'fixer' | 'teacher';
    sessionHistory: ChatMessage[];
  }): AIContext {
    const ctx = new AIContext();

    ctx.addSystemInfo(input.connection, input.osInfo);
    ctx.addMode(input.mode);
    ctx.addChatHistory(input.sessionHistory);
    ctx.addTerminalOutput(this.getRecentTerminalOutput());

    return ctx;
  }
}

export const contextBuilder = new ContextBuilder();

🔄 Code: src/main/services/ai/prompts/systemPrompt.ts

Simplified — no more {{template}} variables. Dynamic context is injected via AIContext blocks.

typescript

/**
 * Base system prompt. Context-specific information (OS, mode, history)
 * is appended by AIContext.toSystemPrompt(), not by string replacement.
 */
export const BASE_SYSTEM_PROMPT = `You are an expert system administrator assistant integrated into a terminal application called Server Maintenance Agent. You help users manage and maintain their servers through SSH connections.

## Your Capabilities
1. Execute shell commands on the connected system
2. Create multi-step plans for complex tasks
3. Analyze command output and system state
4. Provide explanations for commands (especially in Teacher Mode)
5. Detect and warn about potentially dangerous operations

## Response Guidelines

### For Simple Questions/Commands:
Respond conversationally and provide the information or single command needed.

### For Complex Tasks (installations, configurations, multi-step operations):
You MUST respond with a structured JSON plan in this exact format:

\`\`\`json
{
  "type": "plan",
  "goal": "Clear description of what will be accomplished",
  "successCriteria": [
    "Criterion 1 that indicates success",
    "Criterion 2 that indicates success"
  ],
  "steps": [
    {
      "description": "Human-readable description of this step",
      "command": "the exact command to run",
      "riskLevel": "safe|caution|dangerous",
      "explanation": "Why this command is needed and what it does",
      "expectedOutput": "What output indicates success",
      "verificationCommand": "Optional command to verify success"
    }
  ],
  "estimatedTime": "Approximate time to complete",
  "rollbackPlan": ["Command to undo step 1", "Command to undo step 2"]
}
\`\`\`

### Risk Level Guidelines:
- **safe**: Read-only operations (ls, cat, df, ps, systemctl status)
- **caution**: Modifications that are generally reversible (apt install, mkdir, service restart)
- **dangerous**: Potentially destructive operations (rm, apt remove, user modifications, system config changes)

### Important Rules:
1. Always use the correct package manager for the detected OS
2. Always check if a service/package exists before trying to modify it
3. Include verification steps to confirm success
4. For dangerous commands, explain the risk clearly
5. Never suggest commands that could brick the system (rm -rf /, dd to system drives, etc.)
6. If unsure about something, ask the user for clarification

Remember: Safety first. When in doubt, ask for confirmation.`;

/**
 * Additional prompt fragment used when the AI is asked to evaluate
 * a command result. Used by plan executor now, agent loop later.
 */
export const STEP_EVALUATION_PROMPT = `You are evaluating the result of a command that was just executed as part of a plan.

Analyze the command output and respond with a JSON assessment:

\`\`\`json
{
  "succeeded": true|false,
  "confidence": "high|medium|low",
  "reason": "Brief explanation of why you think this succeeded or failed",
  "suggestedAction": "continue|retry|revise-plan|ask-user"
}
\`\`\`

Be conservative — if you're unsure whether the command succeeded, say confidence is "low" and suggest "ask-user".`;

Deliverables:

    ✅ AIContext-based context building (replaces string templates)
    ✅ Terminal output capture working
    ✅ Base system prompt (clean, no template variables)
    🆕 Step evaluation prompt ready for use in Sprint 5

Day 3: AI Message Handling 🔄 MODIFIED

Tasks:

text

□ Task 4.3.1: Create AI IPC handlers
  └── File: src/main/ipc/ai.handler.ts
  └── Handle send message
  └── Handle streaming responses
  └── Handle cancellation

🔄 Task 4.3.2: Implement AIOrchestrator
  └── Uses AIContext (not internal state) for every call
  └── Response parsing
  └── Plan detection
  └── 🆕 Expose a generic `call()` method alongside `sendMessage()`
  └── 🆕 The generic call() accepts an AIContext directly — 
      this is what the plan executor and future agent will use

□ Task 4.3.3: Create useAI hook
  └── File: src/renderer/hooks/useAI.ts
  └── Send messages
  └── Handle streaming
  └── Manage loading state

□ Task 4.3.4: Connect ChatInput to AI
  └── Send message on submit
  └── Display streaming response
  └── Handle errors

□ Task 4.3.5: Test basic conversation
  └── Send message, receive response
  └── Verify streaming works
  └── Test context inclusion

🆕 Task 4.3.6: Create extensible IPC event system for plan execution
  └── File: src/shared/constants/ipcChannels.ts (update)
  └── Define PlanEvent channels that support current AND future event types
  └── Renderer receives PlanEvent union type — handles known types, ignores unknown

🔄 Code: src/main/services/ai/AIOrchestrator.ts

Key changes from original:

    Context is passed in, not built internally
    A generic call() method exists for non-chat callers
    Token tracking per session
    No hidden conversational state

typescript

import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { IPC_CHANNELS } from '@shared/constants/ipcChannels';
import { claudeProvider } from './providers/ClaudeProvider';
import { contextBuilder } from './ContextBuilder';
import { AIContext } from './AIContext';
import { BASE_SYSTEM_PROMPT, STEP_EVALUATION_PROMPT } from './prompts/systemPrompt';
import { ChatMessage, ExecutionPlan, OSInfo, ActiveConnection } from '@shared/types';
import { CommandResult, StepAssessment } from '@shared/types/execution';
import { LLMMessage, LLMResponse, LLMStreamHandler } from './providers/LLMProvider';

interface ChatInput {
  connection: ActiveConnection;
  osInfo: OSInfo;
  mode: 'fixer' | 'teacher';
  sessionHistory: ChatMessage[];
}

export class AIOrchestrator {
  private mainWindow: BrowserWindow | null = null;
  private isProcessing: boolean = false;
  private abortController: AbortController | null = null;

  // 🆕 Token tracking — useful now for display, critical later for agent budgets
  private sessionTokensUsed: number = 0;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  initialize(apiKey: string): void {
    claudeProvider.initialize(apiKey);
  }

  isInitialized(): boolean {
    return claudeProvider.isInitialized();
  }

  getSessionTokensUsed(): number {
    return this.sessionTokensUsed;
  }

  resetSessionTokens(): void {
    this.sessionTokensUsed = 0;
  }

  /**
   * 🆕 Generic AI call — accepts a pre-built AIContext.
   * This is the foundation method. Chat uses it via sendMessage().
   * Plan executor uses it directly for step evaluation.
   * Future agent loop uses it directly for replanning.
   */
  async call(
    aiContext: AIContext,
    messages: LLMMessage[],
  ): Promise<LLMResponse> {
    if (!claudeProvider.isInitialized()) {
      throw new Error('AI not initialized. Please set API key in settings.');
    }

    const systemPrompt = aiContext.toSystemPrompt(BASE_SYSTEM_PROMPT);

    const response = await claudeProvider.sendMessage(systemPrompt, messages);

    this.sessionTokensUsed += response.usage.inputTokens + response.usage.outputTokens;

    return response;
  }

  /**
   * 🆕 Evaluate a command result — used by plan executor after each step.
   * Future agent loop will also use this to decide whether to continue/retry/replan.
   */
  async evaluateStepResult(
    commandResult: CommandResult,
    expectedOutcome: string,
    context: AIContext,
  ): Promise<StepAssessment> {
    const evalContext = new AIContext();
    // Copy relevant blocks from the existing context
    // Then add the specific command result
    evalContext.addCommandResult(commandResult);

    const messages: LLMMessage[] = [
      {
        role: 'user',
        content: [
          `The following command was executed as part of a plan:`,
          `**Command:** \`${commandResult.command}\``,
          `**Expected outcome:** ${expectedOutcome}`,
          `**Exit code:** ${commandResult.exitCode}`,
          commandResult.stdout ? `**stdout:**\n\`\`\`\n${commandResult.stdout.substring(0, 2000)}\n\`\`\`` : '',
          commandResult.stderr ? `**stderr:**\n\`\`\`\n${commandResult.stderr.substring(0, 1000)}\n\`\`\`` : '',
          `\nDid this step succeed? Respond with the JSON assessment format.`,
        ].filter(Boolean).join('\n'),
      },
    ];

    const response = await claudeProvider.sendMessage(STEP_EVALUATION_PROMPT, messages);

    this.sessionTokensUsed += response.usage.inputTokens + response.usage.outputTokens;

    // Parse the assessment
    try {
      const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]) as StepAssessment;
      }
      // Try parsing the whole response as JSON
      return JSON.parse(response.content) as StepAssessment;
    } catch {
      // If AI didn't return valid JSON, make a conservative assessment
      return {
        succeeded: commandResult.exitCode === 0,
        confidence: 'low',
        reason: response.content.substring(0, 200),
        suggestedAction: commandResult.exitCode === 0 ? 'continue' : 'ask-user',
      };
    }
  }

  /**
   * Send a chat message with streaming — used by the chat UI.
   * Internally builds an AIContext via ContextBuilder (convenience path).
   */
  async sendMessage(
    userMessage: string,
    input: ChatInput,
  ): Promise<{ messageId: string }> {
    if (this.isProcessing) {
      throw new Error('Already processing a message');
    }

    if (!claudeProvider.isInitialized()) {
      throw new Error('AI not initialized. Please set API key in settings.');
    }

    this.isProcessing = true;
    this.abortController = new AbortController();

    const messageId = uuidv4();

    try {
      // Build context using the composable AIContext
      const aiContext = contextBuilder.buildChatContext({
        connection: input.connection,
        osInfo: input.osInfo,
        mode: input.mode,
        sessionHistory: input.sessionHistory,
      });

      const systemPrompt = aiContext.toSystemPrompt(BASE_SYSTEM_PROMPT);

      // Build messages array
      const messages: LLMMessage[] = [
        ...input.sessionHistory
          .filter(m => m.role !== 'system')
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        { role: 'user' as const, content: userMessage },
      ];

      // Stream handler
      const handler: LLMStreamHandler = {
        onChunk: (chunk: string) => {
          this.sendToRenderer(IPC_CHANNELS.AI.STREAM_CHUNK, chunk);
        },
        onComplete: (response) => {
          this.isProcessing = false;
          this.sessionTokensUsed += response.usage.inputTokens + response.usage.outputTokens;

          // Check if response contains a plan
          const plan = this.extractPlan(response.content);

          if (plan) {
            this.sendToRenderer(IPC_CHANNELS.PLAN.GENERATED, plan);
          }

          this.sendToRenderer(IPC_CHANNELS.AI.STREAM_END, {
            messageId,
            content: response.content,
            hasPlan: !!plan,
            usage: response.usage,
          });
        },
        onError: (error: Error) => {
          this.isProcessing = false;
          this.sendToRenderer(IPC_CHANNELS.AI.ERROR, error.message);
        },
      };

      await claudeProvider.sendMessageStream(systemPrompt, messages, handler);

      return { messageId };
    } catch (error) {
      this.isProcessing = false;
      throw error;
    }
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isProcessing = false;
  }

  private extractPlan(content: string): ExecutionPlan | null {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.type !== 'plan' || !parsed.steps) return null;

      const plan: ExecutionPlan = {
        id: uuidv4(),
        goal: parsed.goal,
        successCriteria: parsed.successCriteria || [],
        steps: parsed.steps.map((step: any, index: number) => ({
          id: uuidv4(),
          index,
          description: step.description,
          command: step.command,
          riskAssessment: {
            level: step.riskLevel || 'caution',
            category: 'unknown',
            reason: step.explanation || '',
            requiresApproval: step.riskLevel === 'dangerous',
          },
          status: 'pending',
          explanation: step.explanation,
          expectedOutput: step.expectedOutput,
          verificationCommand: step.verificationCommand,
        })),
        status: 'pending',
        currentStepIndex: 0,
        createdAt: new Date().toISOString(),
        rollbackPlan: parsed.rollbackPlan,
      };

      return plan;
    } catch (error) {
      console.error('Failed to extract plan:', error);
      return null;
    }
  }

  private sendToRenderer(channel: string, ...args: any[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();

Code: src/renderer/hooks/useAI.ts — unchanged from your original, it works as-is since the IPC contract hasn't changed.

Deliverables:

    ✅ AI messages sending and receiving
    ✅ Streaming responses working
    ✅ Plan extraction functional
    🆕 Generic call() method available for non-chat callers
    🆕 evaluateStepResult() ready for Sprint 5 plan executor
    🆕 Extensible PlanEvent type system in IPC channels

Day 4: Session Persistence 🔄 MODIFIED

Tasks:

text

□ Task 4.4.1: Create SessionStore service
  └── File: src/main/services/storage/SessionStore.ts
  └── Save sessions per connection
  └── Load sessions on connect
  └── Clear session option
  └── 🆕 Store ExecutionRecords alongside chat messages

□ Task 4.4.2: Create session IPC handlers
  └── File: src/main/ipc/session.handler.ts
  └── Get session for connection
  └── Save session
  └── Clear session
  └── 🆕 Get execution history for connection

□ Task 4.4.3: Integrate session loading
  └── Load session on connect
  └── Display previous messages
  └── Continue conversation context

□ Task 4.4.4: Auto-save session
  └── Save after each message exchange
  └── Debounce saves
  └── Handle errors gracefully

□ Task 4.4.5: Test session persistence
  └── Verify sessions survive restart
  └── Test multiple connection sessions
  └── Test clear session
  └── 🆕 Verify execution records persist

🔄 Code: src/main/services/storage/SessionStore.ts

typescript

import Store from 'electron-store';
import { ChatMessage, ChatSession, CompletedPlan } from '@shared/types';
import { ExecutionRecord, StepResult } from '@shared/types/execution';

interface SessionStoreSchema {
  sessions: Record<string, ChatSession>;
  planHistory: Record<string, CompletedPlan[]>;
  executionRecords: Record<string, ExecutionRecord[]>; // 🆕
}

export class SessionStore {
  private store: Store<SessionStoreSchema>;

  constructor() {
    this.store = new Store<SessionStoreSchema>({
      name: 'sessions',
      defaults: {
        sessions: {},
        planHistory: {},
        executionRecords: {}, // 🆕
      },
    });
  }

  // ── Chat Sessions (unchanged) ──────────────────────────────────

  getSession(connectionId: string): ChatSession | null {
    const sessions = this.store.get('sessions', {});
    return sessions[connectionId] || null;
  }

  saveSession(connectionId: string, messages: ChatMessage[]): void {
    const sessions = this.store.get('sessions', {});
    sessions[connectionId] = {
      connectionId,
      messages,
      createdAt: sessions[connectionId]?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.store.set('sessions', sessions);
  }

  addMessage(connectionId: string, message: ChatMessage): void {
    const session = this.getSession(connectionId);
    const messages = session?.messages || [];
    messages.push(message);
    this.saveSession(connectionId, messages);
  }

  getMessages(connectionId: string, limit?: number): ChatMessage[] {
    const session = this.getSession(connectionId);
    if (!session) return [];
    if (limit) return session.messages.slice(-limit);
    return session.messages;
  }

  clearSession(connectionId: string): void {
    const sessions = this.store.get('sessions', {});
    delete sessions[connectionId];
    this.store.set('sessions', sessions);
  }

  // ── Plan History (unchanged) ────────────────────────────────────

  savePlanResult(connectionId: string, plan: CompletedPlan): void {
    const planHistory = this.store.get('planHistory', {});
    if (!planHistory[connectionId]) {
      planHistory[connectionId] = [];
    }
    planHistory[connectionId].push(plan);
    if (planHistory[connectionId].length > 50) {
      planHistory[connectionId] = planHistory[connectionId].slice(-50);
    }
    this.store.set('planHistory', planHistory);
  }

  getPlanHistory(connectionId: string): CompletedPlan[] {
    const planHistory = this.store.get('planHistory', {});
    return planHistory[connectionId] || [];
  }

  // 🆕 ── Execution Records ───────────────────────────────────────
  // Structured records of plan execution with per-step results.
  // Used now for session context. Used later by agent loop to review
  // what was already attempted.

  saveExecutionRecord(connectionId: string, record: ExecutionRecord): void {
    const records = this.store.get('executionRecords', {});
    if (!records[connectionId]) {
      records[connectionId] = [];
    }
    records[connectionId].push(record);
    // Keep last 100 execution records per connection
    if (records[connectionId].length > 100) {
      records[connectionId] = records[connectionId].slice(-100);
    }
    this.store.set('executionRecords', records);
  }

  updateExecutionRecord(connectionId: string, planId: string, update: Partial<ExecutionRecord>): void {
    const records = this.store.get('executionRecords', {});
    const connectionRecords = records[connectionId] || [];
    const index = connectionRecords.findIndex(r => r.planId === planId);
    if (index !== -1) {
      connectionRecords[index] = { ...connectionRecords[index], ...update };
      records[connectionId] = connectionRecords;
      this.store.set('executionRecords', records);
    }
  }

  addStepResult(connectionId: string, planId: string, stepResult: StepResult): void {
    const records = this.store.get('executionRecords', {});
    const connectionRecords = records[connectionId] || [];
    const record = connectionRecords.find(r => r.planId === planId);
    if (record) {
      record.steps.push(stepResult);
      this.store.set('executionRecords', records);
    }
  }

  getExecutionRecords(connectionId: string, limit?: number): ExecutionRecord[] {
    const records = this.store.get('executionRecords', {});
    const connectionRecords = records[connectionId] || [];
    if (limit) return connectionRecords.slice(-limit);
    return connectionRecords;
  }

  getLastExecutionRecord(connectionId: string): ExecutionRecord | null {
    const records = this.getExecutionRecords(connectionId);
    return records.length > 0 ? records[records.length - 1] : null;
  }

  clearAllSessions(): void {
    this.store.set('sessions', {});
    this.store.set('executionRecords', {}); // 🆕
  }
}

export const sessionStore = new SessionStore();

Deliverables:

    ✅ Sessions persist across restarts
    ✅ Previous messages load on connect
    ✅ Clear session functionality
    🆕 Execution records persisted with structured step results

Day 5: Integration & Testing — unchanged from your original

Tasks:

text

□ Task 4.5.1: Wire up settings flow
  └── Settings modal saves API key
  └── API key loaded on app start
  └── AI initializes with key

□ Task 4.5.2: Error handling improvements
  └── Handle API errors gracefully
  └── Show user-friendly error messages
  └── Retry logic for transient failures

□ Task 4.5.3: Full AI conversation testing
  └── Test various prompts
  └── Verify context inclusion
  └── Test session persistence
  └── Test plan detection
  └── 🆕 Test that AIContext produces correct prompt for chat
  └── 🆕 Test evaluateStepResult with mock command results

□ Task 4.5.4: Performance testing
  └── Test long conversations
  └── Test streaming performance
  └── Memory usage check
  └── 🆕 Test AIContext token estimation accuracy

□ Task 4.5.5: Bug fixes and polish
  └── Fix any issues found
  └── Improve response parsing
  └── Polish loading states

7.3 Sprint 4 Definition of Done

    ✅ Can configure API key in settings
    ✅ AI responds to messages
    ✅ Streaming responses display correctly
    ✅ Context includes OS info and terminal output
    ✅ Sessions persist across app restarts
    ✅ Plans are detected and extracted
    ✅ Error handling is graceful
    ✅ Loading states display correctly
    🆕 AIContext is composable and caller-agnostic (not coupled to chat)
    🆕 Generic call() and evaluateStepResult() methods available on orchestrator
    🆕 Structured execution types defined and integrated
    🆕 ExecutionRecords persisted in SessionStore
    🆕 PlanEvent union type defined with extension points for future agent events

Summary of Changes
What Changed	Why	Extra Effort
AIContext composable class replaces string template context	Agent loop needs to build context its own way, not through chat's code path	~2 hours
ContextBuilder becomes thin wrapper using AIContext	Keeps convenience for chat, doesn't constrain other callers	~30 min (simpler than original)
System prompt loses {{template}} variables	Context blocks are additive, not template-replacement	~15 min
AIOrchestrator.call() generic method	Plan executor and future agent call AI without going through chat flow	~1 hour
AIOrchestrator.evaluateStepResult()	Sprint 5 executor uses this after each step; agent loop uses it later	~1.5 hours
PlanEvent extensible union type	IPC contract supports future agent events without breaking UI	~30 min
ExecutionRecord + StepResult types	Structured data the agent can reason about (not just chat strings)	~30 min
SessionStore.executionRecords	Agent needs to know what was already tried	~1 hour
Token tracking on orchestrator	Agent loop needs token budgets	~15 min

Total extra effort: ~half a day, spread across the week. Your schedule doesn't change. Sprint 5 (plan executor) will be easier because evaluateStepResult() and structured types are already in place.




