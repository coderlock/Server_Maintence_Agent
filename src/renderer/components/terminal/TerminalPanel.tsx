/**
 * TerminalPanel Component - Sprint 3
 *
 * Full xterm.js terminal with:
 *  - PTY input / output via SSH IPC
 *  - ResizeObserver → PTY resize sync
 *  - Toolbar: Copy, Paste, Clear, Search
 *  - Disconnect banner (preserves scrollback)
 *  - VSCode-inspired theme
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';

import {
  Terminal,
  Copy,
  Clipboard,
  Trash2,
  Search,
  X,
  WifiOff,
} from 'lucide-react';
import { Button } from '../ui';
import { useTerminalStore } from '@renderer/store/terminalStore';
import { useConnectionStore } from '@renderer/store/connectionStore';

// ─── xterm.js VSCode-like theme ───────────────────────────────────────────────
const VSCODE_THEME = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#aeafad',
  cursorAccent: '#000000',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5',
  selectionBackground: '#264f78',
  selectionForeground: '#ffffff',
};

// ─── SearchBar ────────────────────────────────────────────────────────────────
interface SearchBarProps {
  searchAddon: SearchAddon | null;
  onClose: () => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ searchAddon, onClose }) => {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const search = useCallback(
    (direction: 'next' | 'prev') => {
      if (!searchAddon || !query) return;
      const opts = { caseSensitive, regex };
      if (direction === 'next') {
        searchAddon.findNext(query, opts);
      } else {
        searchAddon.findPrevious(query, opts);
      }
    },
    [searchAddon, query, caseSensitive, regex]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      search(e.shiftKey ? 'prev' : 'next');
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-[#252526] border-b border-[#3c3c3c] text-xs">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in terminal…"
        className="bg-[#3c3c3c] text-[#d4d4d4] border border-[#555] rounded px-2 py-0.5 text-xs w-48 outline-none focus:border-[#007acc]"
      />
      <button
        onClick={() => search('prev')}
        className="px-1.5 py-0.5 rounded hover:bg-[#3c3c3c] text-[#ccc]"
        title="Previous (Shift+Enter)"
      >
        ↑
      </button>
      <button
        onClick={() => search('next')}
        className="px-1.5 py-0.5 rounded hover:bg-[#3c3c3c] text-[#ccc]"
        title="Next (Enter)"
      >
        ↓
      </button>
      <button
        onClick={() => setCaseSensitive((v) => !v)}
        className={`px-1.5 py-0.5 rounded text-[#ccc] ${caseSensitive ? 'bg-[#007acc]' : 'hover:bg-[#3c3c3c]'}`}
        title="Match case"
      >
        Aa
      </button>
      <button
        onClick={() => setRegex((v) => !v)}
        className={`px-1.5 py-0.5 rounded text-[#ccc] ${regex ? 'bg-[#007acc]' : 'hover:bg-[#3c3c3c]'}`}
        title="Use regex"
      >
        .*
      </button>
      <button onClick={onClose} className="ml-1 hover:bg-[#3c3c3c] rounded p-0.5 text-[#ccc]">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};

// ─── TerminalPanel ────────────────────────────────────────────────────────────
export const TerminalPanel: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const { setTerminal, setDimensions } = useTerminalStore();
  const { activeConnection } = useConnectionStore();

  const [showSearch, setShowSearch] = useState(false);
  const isConnected = activeConnection?.status === 'connected';

  // ── Initialise xterm once on mount ──────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || xtermRef.current) return;

    const term = new XTerm({
      fontFamily: 'Menlo, Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: VSCODE_THEME,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      convertEol: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);

    term.open(containerRef.current);

    // ── Keyboard shortcuts ───────────────────────────────────────────────
    // attachCustomKeyEventHandler intercepts keys before xterm processes them.
    // Return false  → xterm ignores the key (we handle it ourselves).
    // Return true   → xterm processes it normally (PTY receives the byte).
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== 'keydown') return true;

      // Ctrl+Shift+C → always copy selection (unambiguous, no PTY side-effect)
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
        const sel = term.getSelection();
        if (sel) navigator.clipboard.writeText(sel).catch(() => {});
        return false;
      }

      // Ctrl+Shift+V → always paste from clipboard
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyV') {
        navigator.clipboard.readText().then((text) => {
          if (text) term.paste(text);
        }).catch(() => {});
        return false;
      }

      // Ctrl+Shift+F → toggle search panel
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyF') {
        setShowSearch((v) => !v);
        return false;
      }

      // Ctrl+C → copy if text is selected; otherwise pass SIGINT (\x03) to PTY
      if (e.ctrlKey && !e.shiftKey && e.code === 'KeyC') {
        const sel = term.getSelection();
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {});
          return false; // handled — don't send to PTY
        }
        return true; // no selection — let xterm send \x03 (SIGINT)
      }

      // Ctrl+V → paste from clipboard into PTY
      if (e.ctrlKey && !e.shiftKey && e.code === 'KeyV') {
        navigator.clipboard.readText().then((text) => {
          if (text) term.paste(text);
        }).catch(() => {});
        return false;
      }

      return true; // all other keys pass through to PTY normally
    });

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Fit after the browser has painted so the container has its final size.
    // A double-rAF ensures Electron's WebContents has finished its layout pass.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitAddon.fit();
        setDimensions(term.cols, term.rows);
        // Sync the PTY with the fitted dimensions immediately
        window.electronAPI.ssh.resize(term.cols, term.rows);
      });
    });

    // Expose to store so useSSH can write data
    setTerminal(term);

    // Forward keyboard input to SSH PTY
    term.onData((data) => {
      window.electronAPI.ssh.write(data);
    });

    // Receive PTY output from SSH and write to terminal.
    // This is the ONLY subscriber to ssh.onData — keeping it here prevents
    // duplicate writes when useSSH is mounted in multiple components.
    const unsubSSHData = window.electronAPI.ssh.onData((data: string) => {
      term.write(data);
    });

    // Notify store of dimension changes (triggered by fit)
    term.onResize(({ cols, rows }) => {
      setDimensions(cols, rows);
      window.electronAPI.ssh.resize(cols, rows);
    });

    // Welcome message when terminal first mounts (disconnected state)
    term.writeln('\x1b[2m  Server Maintenance Agent \x1b[0m');
    term.writeln('\x1b[2m  Connect to a server to begin.\x1b[0m');
    term.writeln('');

    // ResizeObserver — attach here (after fitAddon is ready) so fit() is
    // always called with a valid addon reference when the panel resizes.
    const ro = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch { /* ignore unmount races */ }
    });
    ro.observe(containerRef.current);
    resizeObserverRef.current = ro;

    return () => {
      ro.disconnect();
      resizeObserverRef.current = null;
      unsubSSHData();
      setTerminal(null);
      term.dispose();
      xtermRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ❌ REMOVED — duplicate ResizeObserver useEffect was here.
  //    The single ResizeObserver in the mount effect above is sufficient.

  // ── Disconnect banner ────────────────────────────────────────────────────
  useEffect(() => {
    if (!xtermRef.current) return;
    const wasConnected = activeConnection?.status === 'disconnecting';
    const justDisconnected = !isConnected && wasConnected;

    if (justDisconnected) {
      xtermRef.current.writeln(
        '\r\n\x1b[33m  ── Connection closed ──\x1b[0m\r\n'
      );
    }
  }, [isConnected, activeConnection?.status]);

  // ── Toolbar actions ──────────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    const term = xtermRef.current;
    if (!term) return;
    const sel = term.getSelection();
    if (sel) {
      navigator.clipboard.writeText(sel).catch(() => {/* ignore */});
    }
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        window.electronAPI.ssh.write(text);
        xtermRef.current?.focus();
      }
    } catch {/* clipboard permission denied */}
  }, []);

  const handleClear = useCallback(() => {
    xtermRef.current?.clear();
    xtermRef.current?.focus();
  }, []);

  const handleToggleSearch = useCallback(() => {
    setShowSearch((v) => {
      if (v) {
        // closing search — clear highlight and refocus terminal
        searchAddonRef.current?.findNext('', {});
        xtermRef.current?.focus();
      }
      return !v;
    });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] overflow-hidden">
      {/* ── Panel Header / Toolbar ─────────────────────────────────────── */}
      <div className="h-9 bg-[#252526] border-b border-[#3c3c3c] flex items-center px-3 gap-1 flex-shrink-0">
        <Terminal className="h-4 w-4 mr-1 text-[#ccc]" />
        <span className="text-sm font-medium text-[#ccc] mr-2">Terminal</span>

        {/* Connection indicator */}
        {isConnected && (
          <span className="flex items-center gap-1 text-xs text-green-400 mr-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
            {activeConnection?.username}@{activeConnection?.host}
          </span>
        )}
        {!isConnected && activeConnection === null && (
          <span className="text-xs text-[#888]">Disconnected</span>
        )}
        {!isConnected && activeConnection !== null && (
          <span className="flex items-center gap-1 text-xs text-yellow-400">
            <WifiOff className="h-3 w-3" />
            {activeConnection.status}
          </span>
        )}

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handleCopy}
          title="Copy selection (Ctrl+C with selection, or Ctrl+Shift+C)"
        >
          <Copy className="h-3.5 w-3.5 mr-1" />
          Copy
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handlePaste}
          title="Paste from clipboard (Ctrl+V or Ctrl+Shift+V)"
        >
          <Clipboard className="h-3.5 w-3.5 mr-1" />
          Paste
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handleClear}
          title="Clear terminal"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Clear
        </Button>
        <Button
          variant={showSearch ? 'default' : 'ghost'}
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handleToggleSearch}
          title="Search (Ctrl+Shift+F)"
        >
          <Search className="h-3.5 w-3.5 mr-1" />
          Search
        </Button>
      </div>

      {/* ── Search bar (conditionally shown) ─────────────────────────── */}
      {showSearch && (
        <SearchBar
          searchAddon={searchAddonRef.current}
          onClose={handleToggleSearch}
        />
      )}

      {/* ── xterm.js mount point ──────────────────────────────────────── */}
      {/* Use position:absolute so FitAddon measures exact pixel
          dimensions — no ambiguity from percentage widths.          */}
      <div
        className="flex-1 overflow-hidden"
        style={{ position: 'relative' }}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.shiftKey) {
            if (e.key === 'C') { e.preventDefault(); handleCopy(); }
            if (e.key === 'V') { e.preventDefault(); handlePaste(); }
            if (e.key === 'F') { e.preventDefault(); handleToggleSearch(); }
          }
        }}
      >
        <div
          ref={containerRef}
          style={{
            position: 'absolute',
            top: 4,
            left: 6,
            right: 6,
            bottom: 4,
            textAlign: 'left',
          }}
        />
      </div>
    </div>
  );
};
