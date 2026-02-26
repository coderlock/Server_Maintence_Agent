import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@main': path.resolve(__dirname, './src/main'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
    // Ensure Node.js built-ins are available
    browserField: false,
    mainFields: ['module', 'main'],
  },
  build: {
    rollupOptions: {
      output: {
        // Force a single CJS bundle — no code splitting.
        // Electron main process must be a single file when node_modules are
        // not shipped separately (forge + vite packages only the Vite output).
        format: 'cjs',
        inlineDynamicImports: true,
      },
      external: (id: string) => {
        // Always external: Electron itself
        if (id === 'electron' || id.startsWith('electron/')) return true;
        // Always external: Node.js built-ins
        const builtins = new Set([
          'crypto', 'fs', 'path', 'os', 'stream', 'events', 'buffer', 'util',
          'net', 'tls', 'dns', 'http', 'https', 'zlib', 'assert',
          'child_process', 'worker_threads', 'readline', 'string_decoder',
          'tty', 'url', 'querystring', 'module', 'vm', 'constants',
          'timers', 'perf_hooks', 'async_hooks', 'process',
        ]);
        if (builtins.has(id)) return true;
        // Bundle everything else (ssh2, electron-store, openai, etc.)
        return false;
      },
    },
  },
  plugins: [
    // Must run before Vite/Rollup CommonJS plugin so .node binaries are
    // replaced with empty stubs rather than being parsed as JavaScript.
    {
      name: 'native-node-modules',
      enforce: 'pre' as const,
      resolveId(id: string) {
        if (id.endsWith('.node')) return id;
        return undefined;
      },
      load(id: string) {
        // Return an empty stub — ssh2 wraps these in try/catch and falls
        // back to pure-JS crypto when the native binding is unavailable.
        if (id.endsWith('.node')) return 'module.exports = {};';
        return undefined;
      },
    },
  ],
});