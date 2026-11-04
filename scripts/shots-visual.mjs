// Linha de base visual: `node scripts/shots-visual.mjs <label>` → shots/<label>/<preset>-<cena>.png (7 cenas × 3 presets).
// Serve `dist` em :4177 (npx vite preview --port 4177 --strictPort). HUD oculto nas capturas.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const label = process.argv[2] || 'antes';
const URL = process.env.URL || 'http://localhost:4177/?debug=1';
const OUT = `shots/${label}`; mkdirSync(OUT, { recursive: true });
const PRESETS = ['low', 'medium', 'high'];
// [chapter, cena, x, z, yaw, pitch] — yaw 0 olha para -z
const CH01 = [['ch01-pier', 0, 31, Math.PI, 0.12], ['ch01-trilha', -4, 16, 0, 0.1], ['ch01-baliza', 10, 11, 0, 0.1], ['ch01-torre', -14, 24, 0, 0.12]];
const CH02 = [['ch02-patio', 0, -6.5, 0, 0.1], ['ch02-corredor', -17, 11.2, Math.PI / 2, 0.1]];
const K1 = ['ch02-k1', 11, -27.2, Math.PI, 0.1];
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
const ev = (fn, a) => pg.evaluate(fn, a);
await pg.goto(URL); await pg.waitForTimeout(2000);
// oculta HUD, legendas, avisos
await pg.addStyleTag({ content: '#hud, #hud *, #vignette, #threats, .reticle, #reticle { visibility: hidden !important; }' });
await ev(() => { window.__game.hud.hide(); });
const shoot = async (preset, [name, x, z, yaw, pitch], wait = 2500) => {
  await ev(([x, z, yaw, pitch]) => { window.__eden.god(true); window.__eden.cameraShot(x, z, yaw, pitch); }, [x, z, yaw, pitch]);
  await pg.waitForTimeout(wait);
  await pg.screenshot({ path: `${OUT}/${preset}-${name}.png` }); console.log('ok', `${preset}-${name}`);
};
const begin = async (id) => { await ev((i) => window.__eden.startChapter(i), id); await pg.waitForTimeout(1500); await ev(() => window.__eden.skip()); await pg.waitForTimeout(1500); await ev(() => window.__game.hud.hide()); };
await begin('ch01');
for (const p of PRESETS) { await ev((q) => window.__eden.setQuality(q), p); await pg.waitForTimeout(800); for (const s of CH01) await shoot(p, s); }
await begin('ch02');
for (const p of PRESETS) { await ev((q) => window.__eden.setQuality(q), p); await pg.waitForTimeout(800); for (const s of CH02) await shoot(p, s); }
await ev(() => window.__eden.goto('ch02', 'pre_k1')); await pg.waitForTimeout(3500); await ev(() => window.__game.hud.hide());
for (const p of PRESETS) { await ev((q) => window.__eden.setQuality(q), p); await pg.waitForTimeout(800); await shoot(p, K1, 3000); }
console.log('ERRS', JSON.stringify(errs)); await b.close();
