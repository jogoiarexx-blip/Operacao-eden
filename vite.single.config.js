import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build em arquivo único: abre com duplo clique (file://) sem servidor.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2020', outDir: 'dist-single', chunkSizeWarningLimit: 2000 },
  define: { __BUILD_ID__: JSON.stringify(process.env.EDEN_BUILD_ID || 'single') },
});
