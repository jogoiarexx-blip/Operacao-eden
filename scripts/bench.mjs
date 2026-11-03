// Linha de base de desempenho: `node scripts/bench.mjs <label>` → shots/<label>/bench.json { preset: { avgMs, p95Ms, ... } }.
// Roda o B01 completo (UI: Extras → Benchmark) em low e medium. Serve `dist` em :4177.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const label = process.argv[2] || 'antes';
const URL = process.env.URL || 'http://localhost:4177/?debug=1';
const OUT = `shots/${label}`; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
const out = {};
for (const preset of ['low', 'medium']) {
  await pg.goto(URL); await pg.waitForTimeout(2000);
  await pg.evaluate((q) => window.__eden.setQuality(q), preset);
  await pg.click('text=Extras'); await pg.click('text=Abrir benchmark'); await pg.click('text=Teste completo');
  await pg.waitForFunction(() => window.__game.sm.state === 'BENCH_RESULTS' && !!window.__game.lastBench, null, { timeout: 240000 });
  const r = await pg.evaluate(() => window.__game.lastBench);
  out[preset] = { avgMs: r.frames ? 60000 / r.frames : null, p95Ms: r.p95, p50Ms: r.p50, p99Ms: r.p99, frames: r.frames, status: r.status, invalidReason: r.invalidReason, updateMsAvg: r.updateMsAvg, renderMsAvg: r.renderMsAvg, calls: r.renderer.calls, triangles: r.renderer.triangles };
  console.log(preset, JSON.stringify(out[preset]));
}
writeFileSync(`${OUT}/bench.json`, JSON.stringify(out, null, 2));
console.log('ERRS', JSON.stringify(errs)); await b.close();
