import { gameEntry } from './scripts/vite-entry.js';
import { defineConfig } from 'vite';

// `base` relativo: funciona em GitHub Pages (subpasta do repositório) e em qualquer hospedagem estática.
export default defineConfig({
  plugins: [gameEntry()],
  base: process.env.EDEN_BASE || './',
  build: { rollupOptions: { input: 'dev.html' }, target: 'es2020', chunkSizeWarningLimit: 900 },
  define: { __BUILD_ID__: JSON.stringify(process.env.EDEN_BUILD_ID || 'dev') },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
