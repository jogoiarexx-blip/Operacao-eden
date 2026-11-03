import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import single from '../vite.single.config.js';
import regular from '../vite.config.js';

// Evita regressão crítica: index.html é resultado publicado, NÃO fonte do Vite.
describe('build regenerado a partir do código-fonte', () => {
  it('usa dev.html em ambos os builds, e o HTML de origem aponta para src/main.js', () => {
    for (const config of [single, regular]) {
      const input = config.build.rollupOptions.input;
      expect(input.replace(/\\/g, '/')).toMatch(/\/dev\.html$/);
      expect(config.plugins.some(p => p.name === 'eden-entry')).toBe(true);
    }
    const html = readFileSync(new URL('../dev.html', import.meta.url), 'utf8');
    expect(html).toContain('src="/src/main.js"');
  });
});
