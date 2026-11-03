import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'node:path';
import { gameEntry } from './scripts/vite-entry.js';

// IMPORTANTE: index.html na raiz é um ARTEFATO do GitHub Pages.
// Compilar a partir dele recicla JavaScript antigo e ignora o código de src/.
// dev.html é a fonte única; gameEntry renomeia dist-single/dev.html para index.html.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile(), gameEntry()],
  build: {
    target: 'es2020',
    outDir: 'dist-single',
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: resolve('dev.html') },
  },
  define: { __BUILD_ID__: JSON.stringify(process.env.EDEN_BUILD_ID || 'single') },
});
