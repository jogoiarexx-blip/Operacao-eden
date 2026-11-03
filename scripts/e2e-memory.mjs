// Vazamento na troca de capítulo: renderer.info.memory deve ficar plano após o aquecimento (ciclos ch01 <-> ch02 e trocas de qualidade).
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4177/?debug=1';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(URL); await pg.waitForTimeout(2000);
const mem = () => pg.evaluate(() => { const i = window.__game.renderer.info.memory; return [i.geometries, i.textures]; });
let bad = false;
for (const q of ['high', 'medium', 'low']) {
  await pg.evaluate((q) => window.__eden.setQuality(q), q);
  const seen = [];
  for (let i = 0; i < 4; i++) for (const c of ['ch01', 'ch02']) { await pg.evaluate((c) => window.__eden.startChapter(c), c); await pg.waitForTimeout(900); await pg.evaluate(() => window.__eden.skip()); await pg.waitForTimeout(900); seen.push(await mem()); }
  const a = seen.slice(2, 4), z = seen.slice(-2); // mesmo capítulo em ciclos diferentes
  const ok = a.every((m, k) => m[0] === z[k][0] && m[1] === z[k][1]); if (!ok) bad = true;
  console.log(q, ok ? 'PLANO' : 'CRESCE', JSON.stringify(seen));
}
console.log('ERRS', JSON.stringify(errs)); await b.close(); process.exit(bad || errs.length ? 1 : 0);
