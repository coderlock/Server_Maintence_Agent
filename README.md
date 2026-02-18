# Server Maintenance Agent

AI-powered SSH server maintenance agent built with Electron, React, TypeScript, and Tailwind CSS.

## Project Overview

This application helps system administrators maintain servers through an AI assistant that can:
- Connect to SSH servers
- Understand the connected system
- Generate and execute maintenance plans
- Flag dangerous commands for approval
- Persist chat sessions across application restarts

## Development Environment Setup

### Prerequisites

- **Node.js**: 20.x LTS
- **npm**: 10.x
- **Git**: 2.x

### Installation

1. **Clone the repository** (if from git) or navigate to the project directory:
   ```powershell
   cd AI_Server_Maintenance_Agent_v02
   ```

2. **Install dependencies**:
   ```powershell
   npm install
   ```

3. **Start the development server**:
   ```powershell
   npm start
   ```

The application will launch in development mode with hot reload enabled.

### Available Scripts

- `npm start` - Start the Electron app in development mode
- `npm run package` - Package the app for distribution
- `npm run make` - Create distributable installers
- `npm run lint` - Run ESLint to check code quality

## Project Structure

```
AI_Server_Maintenance_Agent_v02/
├── docs/                          # Project documentation
│   ├── BUILDPLAN_PHASE1.MD       # Phase 1 build plan
│   └── DESIGN_DOC.MD             # Design specifications
├── src/
│   ├── main/                     # Electron main process
│   │   ├── ipc/                  # IPC handlers
│   │   ├── services/             # Core services
│   │   │   ├── ssh/             # SSH connection management
│   │   │   ├── ai/              # AI integration
│   │   │   ├── security/        # Security & encryption
│   │   │   └── storage/         # Data persistence
│   │   ├── utils/               # Utility functions
│   │   └── index.ts             # Main process entry
│   ├── preload/                  # Electron preload scripts
│   │   └── index.ts             # IPC bridge
│   ├── renderer/                 # React application
│   │   ├── components/          # React components
│   │   │   ├── layout/         # Layout components
│   │   │   ├── terminal/       # Terminal components
│   │   │   ├── chat/           # Chat interface
│   │   │   ├── connections/    # Connection manager
│   │   │   ├── modals/         # Modal dialogs
│   │   │   └── ui/             # UI primitives
│   │   ├── hooks/              # Custom React hooks
│   │   ├── store/              # Zustand state management
│   │   ├── lib/                # Utility libraries
│   │   ├── styles/             # CSS & Tailwind
│   │   ├── App.tsx             # Root component
│   │   └── index.tsx           # Renderer entry
│   └── shared/                  # Shared code
│       ├── types/              # TypeScript types
│       └── constants/          # Shared constants
├── tests/                       # Test files
│   ├── unit/                   # Unit tests
│   └── integration/            # Integration tests
├── forge.config.ts             # Electron Forge configuration
├── tsconfig.json               # TypeScript configuration
├── tailwind.config.js          # Tailwind CSS configuration
├── vite.*.config.ts            # Vite build configurations
└── package.json                # Project dependencies

```

## Tech Stack

- **Electron**: Desktop application framework
- **React**: UI framework
- **TypeScript**: Type-safe JavaScript
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **Zustand**: State management
- **ssh2**: SSH client for Node.js
- **Moonshot AI**: Kimi 2.5 language model (AI assistant)
- **Tailwind CSS**: Utility-first CSS framework
- **Zustand**: State management (to be implemented)
- **ssh2**: SSH client library (to be implemented)

## Development Status

✅ **Completed:**
- Project initialization
- TypeScript configuration
- React + Vite setup
- Tailwind CSS with VSCode-like theme
- ESLint and Prettier configuration
- Project folder structure
- Basic application shell

🚧 **In Progress:**
- Sprint 1: Project Foundation

📋 **Upcoming:**
- Sprint 2: SSH Integration
- Sprint 3: Terminal & UI
- Sprint 4: AI Integration
- Sprint 5: Plan Execution Engine
- Sprint 6: Polish & Integration Testing

## Configuration Files

### TypeScript (`tsconfig.json`)
- Strict mode enabled
- Path aliases configured (`@/*`, `@main/*`, `@renderer/*`, etc.)

### Tailwind CSS (`tailwind.config.js`)
- Dark mode enabled
- VSCode color theme variables
- Custom utility classes

### ESLint (`.eslintrc.json`)
- TypeScript support
- React plugin
- React Hooks rules

## Testing

Testing infrastructure is set up to work with or without Docker:

### Option A: Local SSH (Recommended for Windows)
Use WSL or enable local SSH server:

```powershell
# In WSL
wsl
sudo apt install openssh-server
sudo service ssh start
```

### Option B: Network Server
Use a Raspberry Pi or any other server on your network.

### Option C: External Server
Use any SSH server you have access to.

Create `.env.test.local` with your test credentials (never commit this file):
```
TEST_SSH_HOST=your-host
TEST_SSH_PORT=22
TEST_SSH_USER=your-user
TEST_SSH_PASS=your-password
```

## Next Steps

Follow the [Phase 1 Build Plan](docs/BUILDPLAN_PHASE1.MD) to continue development:
1. Day 1: ✅ Complete
2. Day 2: Define shared types and IPC channels
3. Day 3: Set up state management
4. Day 4: Create layout components
5. Day 5: Configure main process and test

## License

MIT

## Documentation

For detailed documentation, see the `/docs` folder:
- [Design Document](docs/DESIGN_DOC.MD) - Full technical design
- [Phase 1 Build Plan](docs/BUILDPLAN_PHASE1.MD) - 6-week implementation plan
