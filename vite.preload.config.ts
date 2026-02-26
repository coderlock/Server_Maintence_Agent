import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@preload': path.resolve(__dirname, './src/preload'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
    // Ensure Node.js built-ins are available
    browserField: false,
    mainFields: ['module', 'main'],
  },
  build: {
    lib: {
      entry: 'src/preload/index.ts',
      formats: ['cjs'],
      fileName: () => 'preload.js',
    },
    rollupOptions: {
      external: [
        'electron',
        // Node.js built-ins
        'path',
        'events',
      ],
      output: {
        format: 'cjs',
        entryFileNames: 'preload.js',
      },
    },
    outDir: '.vite/build',
    emptyOutDir: false,
  },
});
