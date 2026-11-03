import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { gameEntry } from './scripts/vite-entry.js';

// A raiz index.html é arquivo compilado e publicado. Nunca deve ser entrada do build.
export default defineConfig({
  base: process.env.EDEN_BASE || './',
  plugins: [gameEntry()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: { input: resolve('dev.html') },
  },
  define: { __BUILD_ID__: JSON.stringify(process.env.EDEN_BUILD_ID || 'dev') },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
