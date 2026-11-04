// Fumaça em GPU real (Chromium + ANGLE/D3D11): exercita o caminho do composer (bloom/SAO), que o SwiftShader nunca roda.
// Uso: servir dist em :4177 (npx vite preview --port 4177 --strictPort) e `node scripts/smoke-gpu.mjs`. Capturas em shots/gpu/.
// Env: URL, ANGLE (padrão d3d11; use "default" fora do Windows), HEADFUL=1. Sai com 1 em erro de console/página ou perda de contexto WebGL.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const URL = process.env.URL || 'http://localhost:4177/?debug=1', OUT = 'shots/gpu'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless: process.env.HEADFUL !== '1', args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', `--use-angle=${process.env.ANGLE || 'd3d11'}`] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
pg.on('console', (m) => { if (m.type() === 'error') { errs.push('CONSOLE ' + m.text()); if (process.env.DBG) console.log('  ERR at', global.__step, m.text().slice(0, 80)); } });
await pg.addInitScript(() => { addEventListener('DOMContentLoaded', () => { document.querySelector('canvas')?.addEventListener('webglcontextlost', () => { window.__ctxLost = true; }); }); });
const ev = (fn, a) => pg.evaluate(fn, a);
await pg.goto(URL); await pg.waitForTimeout(2000);
await ev(() => { document.querySelector('canvas')?.addEventListener('webglcontextlost', () => { window.__ctxLost = true; }); });
const gpu = await ev(() => { const gl = window.__game.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'desconhecido'; });
console.log('GPU:', gpu);
if (/swiftshader|llvmpipe|software|basic render|warp/i.test(gpu)) { console.log('SEM GPU REAL: smoke-gpu ignorado'); await b.close(); process.exit(process.env.REQUIRE_GPU ? 1 : 0); }
await ev(() => { window.__eden.god(true); return window.__eden.startChapter('ch01'); }); await pg.waitForTimeout(1500); await ev(() => window.__eden.skip()); await pg.waitForTimeout(1500);
await ev(() => window.__game.hud.hide());
// cena: parede/estrutura do píer (ver shots-visual) + efeitos 4 m à frente da câmera
const SPOT = [10, 11, 0, 0.1];
const shotFx = () => ev(() => {
  const g = window.__game, p = g.player, y = g.camera.yaw, f = { x: -Math.sin(y), y: 0, z: -Math.cos(y) };
  const at = (d, h = 0.4, s = 0) => ({ x: p.x + f.x * d + Math.cos(y) * s, y: h, z: p.z + f.z * d - Math.sin(y) * s });
  const n = { x: -f.x, y: 0, z: -f.z };
  g.scenery.flashlightOn = true;
  g.fx.dustRing(at(4, 0, -1.8), 1.5); g.fx.impact(at(4, 0.7, 1.0), 'metal', n); g.fx.impact(at(4.5, 0.6, 2.0), 'concrete', n); g.fx.blood(at(3.5, 0.5, 1.5), f);
  g.fx.muzzle(at(0.8, 1.4), f, 'pistol');
});
const cycle = [['low', 'a'], ['medium', 'b'], ['high', 'c'], ['low', 'd']];
for (const [q, k] of cycle) {
  global.__step = k + ' setQuality'; await ev((q) => window.__eden.setQuality(q), q); await pg.waitForTimeout(700);
  await ev(([x, z, yaw, pitch]) => window.__eden.cameraShot(x, z, yaw, pitch), SPOT); await pg.waitForTimeout(600);
  if (k === 'c') { await pg.setViewportSize({ width: 900, height: 500 }); await pg.waitForTimeout(500); await pg.setViewportSize({ width: 1280, height: 720 }); await pg.waitForTimeout(500); }
  global.__step = k + ' fx'; await shotFx(); await pg.waitForTimeout(120);
  await pg.screenshot({ path: `${OUT}/${k}-${q}-fx.png` });
  const st = await ev(() => { const px = window.__game.postfx; return { preset: px.effectivePreset, passes: px.passNames.join(','), soft: px.soft }; });
  console.log(q, JSON.stringify(st));
  await pg.waitForTimeout(1200);
}
// tiros reais perto de criatura/parede
await ev(() => { const g = window.__game; g.player.reserve = 999; g.player.mag = 99; });
global.__step = 'shoot'; for (let i = 0; i < 4; i++) { await ev(() => window.__game.shoot()); await pg.waitForTimeout(250); }
await pg.screenshot({ path: `${OUT}/shots-real.png` });
const lost = await ev(() => !!window.__ctxLost || window.__game.renderer.getContext().isContextLost());
console.log('CONTEXT_LOST', lost, 'ERRS', JSON.stringify(errs)); await b.close();
process.exit(lost || errs.length ? 1 : 0);
