/**
 * Terminal Store
 * Manages terminal instance reference and dimensions.
 * xterm.js manages its own scrollback buffer internally —
 * we do NOT duplicate output here.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Terminal } from '@xterm/xterm';

interface TerminalState {
  // xterm.js Terminal instance (stored as ref, not reactive data)
  terminal: Terminal | null;

  // Terminal dimensions (kept in sync with PTY)
  cols: number;
  rows: number;

  // Actions
  setTerminal: (terminal: Terminal | null) => void;
  setDimensions: (cols: number, rows: number) => void;
}

export const useTerminalStore = create<TerminalState>()(
  immer((set) => ({
    terminal: null,
    cols: 80,
    rows: 24,

    setTerminal: (terminal) => {
      set({ terminal });
    },

    setDimensions: (cols, rows) => {
      set({ cols, rows });
    },
  }))
);
