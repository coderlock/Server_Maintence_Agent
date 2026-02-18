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
      external: [
        'electron',
        'ssh2',
        'electron-store',
        'uuid',
        '@anthropic-ai/sdk',
        // Node.js built-ins
        'crypto',
        'fs',
        'path',
        'os',
        'stream',
        'events',
        'buffer',
        'util',
      ],
    },
  },
});
