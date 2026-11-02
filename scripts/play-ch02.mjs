// Partida "à mão" do Cap. 02 no Padrão com entradas reais (teclado/mouse do Playwright). Debug só para começar o capítulo e LER estado
// (`__eden.state()`); sem teleporte, sem god, sem killAll. Relata até onde chegou e onde travou.
// Uso: node scripts/play-ch02.mjs   (env: URL, SHOT_DIR, MAX_MIN = minutos reais de limite, default 25)
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4177/?debug=1';
const SHOT = process.env.SHOT_DIR || '.';
const MAX_MS = (+process.env.MAX_MIN || 25) * 60000;
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
await pg.addInitScript(() => { navigator.getGamepads = () => []; });   // um controle físico conectado no host (gatilho "preso") dispara sozinho; isola a entrada
const errs = [], t0 = Date.now();
pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
const ev = (fn, arg) => pg.evaluate(fn, arg);
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const ST = () => ev(() => {
  const g = window.__game, s = window.__eden.state(), p = g.player;
  return { st: s.state, x: p.x, z: p.z, yaw: g.camera.yaw, hp: Math.round(p.hp), mag: p.mag, res: p.reserve, w: p.weaponId, flags: Object.keys(s.flags ?? {}), obj: g.hud._lastObj, prompt: g.hud.promptEl.textContent, enemies: s.agents.filter((a) => a.hp > 0).map((a) => ({ id: a.id, x: a.x, z: a.z, hp: Math.round(a.hp) })), blocked: g.camera.blocked, camDist: g.camera.dist, dead: g.player.dead };
});
const held = new Set();
async function keys(want) { for (const k of [...held]) if (!want.has(k)) { await pg.keyboard.up(k); held.delete(k); } for (const k of want) if (!held.has(k)) { await pg.keyboard.down(k); held.add(k); } }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
let blockedSamples = 0, camSamples = 0, minCam = 99;
const tight = new Map();   // células de 4 m onde a câmera ficou colada (< 0,8 m)
function frameStats(s) { camSamples++; if (s.blocked) blockedSamples++; minCam = Math.min(minCam, s.camDist ?? 99); if ((s.camDist ?? 9) < 0.8) { const k = `${Math.round(s.x / 4) * 4},${Math.round(s.z / 4) * 4}`; tight.set(k, Math.min(tight.get(k) ?? 9, s.camDist)); } }
let mx = 640;
async function look(dx) {   // mouse.move é absoluto: acompanhar x; perto da borda, soltar o botão, recentralizar (sem botão o olhar é ignorado) e reapertar
  if (mx + dx < 100 || mx + dx > 1180) { if (aiming) await pg.mouse.up({ button: 'right' }); await pg.mouse.move(640, 360); mx = 640; if (aiming) await pg.mouse.down({ button: 'right' }); }
  mx += dx; await pg.mouse.move(mx, 360);
}
let aiming = false, shotsFired = 0, lastReloadAt = 0;
async function stopAim() { if (aiming) { await pg.mouse.up({ button: 'right' }); aiming = false; } }
async function shootNearby(s) {
  const e = s.enemies.map((a) => ({ ...a, d: Math.hypot(a.x - s.x, a.z - s.z) })).sort((a, b) => a.d - b.d)[0];
  if (!e || e.d > 15) {
    await stopAim();
    if (s.mag < 4 && s.res > 0 && Date.now() - lastReloadAt > 6000) { lastReloadAt = Date.now(); await pressKey('KeyR'); }   // reabastecer fora de combate
    else if (s.hp < 60 && Date.now() - lastReloadAt > 6000) { lastReloadAt = Date.now(); await pressKey('Digit3'); }
    return false;
  }
  if (!aiming) { await pg.mouse.down({ button: 'right' }); aiming = true; }   // o olhar só conta com Pointer Lock ou botão do mouse apertado
  const want = Math.atan2(-(e.x - s.x), -(e.z - s.z));        // yaw que olha para o alvo (forward = (-sin, -cos))
  const err = wrap(want - s.yaw);
  if (Math.abs(err) > 0.04) await look(clamp(-err / 0.0022, -300, 300));
  if (s.mag === 0 && s.res > 0 && Date.now() - lastReloadAt > 3000) { lastReloadAt = Date.now(); await pressKey('KeyR'); }
  else if (s.hp < 55 && s.hp > 0 && Date.now() - lastReloadAt > 3000) { lastReloadAt = Date.now(); await pressKey('Digit3'); }
  else if (Math.abs(err) < 0.2 && s.mag > 0 && e.d < 11) { await pg.mouse.down({ button: 'left' }); await pg.waitForTimeout(60); await pg.mouse.up({ button: 'left' }); shotsFired++; }
  return true;
}
async function walk(tx, tz, { tol = 1.2, maxMs = 60000, fight = true, label = '' } = {}) {
  const t1 = Date.now(); let lastP = null, lastMoveAt = Date.now();
  while (Date.now() - t1 < maxMs) {
    if (Date.now() - t0 > MAX_MS) return 'timeout';
    const s = await ST(); frameStats(s);
    if (s.st !== 'PLAYING') { await keys(new Set()); return s.st; }
    if (s.dead) return 'dead';
    const dx = tx - s.x, dz = tz - s.z, dist = Math.hypot(dx, dz);
    if (dist < tol) { await keys(new Set()); return 'ok'; }
    if (fight && !(await shootNearby(s)) && /Pegar/.test(s.prompt)) await pressKey('KeyF');
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
    const f = (dx * fx + dz * fz) / dist, r = (dx * rx + dz * rz) / dist, want = new Set();
    if (f > 0.38) want.add('KeyW'); if (f < -0.38) want.add('KeyS'); if (r > 0.38) want.add('KeyD'); if (r < -0.38) want.add('KeyA');
    await keys(want);
    if (!lastP || Math.hypot(s.x - lastP.x, s.z - lastP.z) > 0.4) { lastP = s; lastMoveAt = Date.now(); }
    else if (Date.now() - lastMoveAt > 5000) { await keys(new Set()); await pg.screenshot({ path: `${SHOT}/play-stuck-${label || 'x'}.png` }); return `stuck@${s.x.toFixed(1)},${s.z.toFixed(1)}`; }
    await pg.waitForTimeout(90);
  }
  return 'walk-timeout';
}
async function holdF(ms) { await keys(new Set()); await pg.keyboard.down('KeyF'); await pg.waitForTimeout(ms); await pg.keyboard.up('KeyF'); await pg.waitForTimeout(300); }
async function pressKey(code) { await pg.keyboard.down(code); await pg.waitForTimeout(120); await pg.keyboard.up(code); await pg.waitForTimeout(250); }
async function clearEnemies(maxMs = 40000) {
  const t1 = Date.now();
  while (Date.now() - t1 < maxMs) {
    const s = await ST(); if (s.st !== 'PLAYING' || s.dead) return; frameStats(s);
    if (!s.enemies.some((a) => Math.hypot(a.x - s.x, a.z - s.z) < 22)) return;
    await shootNearby(s); await pg.waitForTimeout(150);
  }
}
async function leg(name, fn) {
  const r = await fn(); const s = await ST();
  log(name, r, JSON.stringify({ pos: [+s.x.toFixed(1), +s.z.toFixed(1)], hp: s.hp, mag: s.mag, res: s.res, obj: s.obj, flags: s.flags.join(','), prompt: s.prompt }));
  return r;
}
const go = async (pts) => { for (const [x, z, n] of pts) { const r = await leg(n, () => walk(x, z, { label: n })); if (r !== 'ok') return r; } return 'ok'; };

await pg.goto(URL); await pg.waitForTimeout(2000);
await ev(() => window.__eden.startChapter('ch02')); await pg.waitForTimeout(1500); await ev(() => window.__eden.skip());
await pg.waitForFunction(() => window.__game.sm.state === 'PLAYING', null, { timeout: 15000 });
await pg.mouse.move(640, 360);
await pg.screenshot({ path: SHOT + '/play-00-start.png' });
log('start', JSON.stringify(await ST()));

async function run() {
  let r = await go([[11.3, 24, 'breach'], [6, 14, 'court']]); if (r !== 'ok') return r;
  await clearEnemies(30000);
  for (let i = 0; i < 4; i++) {   // chegar perto da barreira e usar a ferramenta de impacto (Q); aproxima mais a cada tentativa
    r = await leg('crates', () => walk(14.2 + i * 0.5, 12, { label: 'crates', tol: 0.5 })); if (r !== 'ok') return r;
    await pressKey('KeyQ'); await pg.waitForTimeout(900);
    const broken = await ev(() => window.__game.save.persistentWorldFlags.broken); log('impact try', i, JSON.stringify(broken), 'toast:', await ev(() => [...document.querySelectorAll('#hud-toasts *, .toast')].map((t) => t.textContent).join('|')));
    if (broken && (Array.isArray(broken) ? broken.length : Object.keys(broken).length)) break;
  }
  await pg.screenshot({ path: SHOT + '/play-01-crates.png' });
  r = await go([[25.8, 8.6, 'lever-a']]); if (r !== 'ok') return r;
  await holdF(6000);
  r = await go([[25.8, 15.4, 'lever-b']]); if (r !== 'ok') return r;
  await holdF(6000); await clearEnemies(40000);
  log('generator flags', JSON.stringify((await ST()).flags)); await pg.screenshot({ path: SHOT + '/play-02-generator.png' });
  r = await go([[16, 12, 'back-court-e'], [6, 13, 'court'], [-6, 11.2, 'court-w'], [-12, 11.2, 'admin-corr'], [-17, 11.2, 'admin-mid'], [-23, 10, 'radio-room'], [-25.2, 8.4, 'radio']]); if (r !== 'ok') return r;
  await holdF(5500); await clearEnemies(20000); await pg.screenshot({ path: SHOT + '/play-03-radio.png' });
  r = await go([[-23, 10, 'radio-out'], [-17, 11.2, 'corr'], [-12, 11.2, 'corr2'], [-8, 6, 'to-pen-1'], [-17, 1.5, 'to-pen-2'], [-18.8, -1.0, 'pen']]); if (r !== 'ok') return r;
  await pressKey('KeyF');
  r = await go([[-10, 0, 'pen-out'], [2, 0, 'to-yard-panel'], [4.4, -1.0, 'panel']]); if (r !== 'ok') return r;
  await pressKey('KeyF'); await pg.screenshot({ path: SHOT + '/play-04-yard.png' });
  r = await go([[0, -8, 'yard-1'], [4, -20, 'yard-2'], [10.8, -24, 'passage'], [11, -26.8, 'archive']]); if (r !== 'ok') return r;
  await pressKey('KeyF');
  const td = Date.now();
  while (Date.now() - td < 120000 && !(await ST()).flags.includes('tomas_found')) { await clearEnemies(8000); await pg.waitForTimeout(500); const s = await ST(); if (s.st !== 'PLAYING' || s.dead) return 'dead-defense'; }
  await pg.screenshot({ path: SHOT + '/play-05-defense.png' });
  const tk = Date.now();
  while (Date.now() - tk < 240000) { const s = await ST(); if (s.st !== 'PLAYING' || s.dead) return 'dead-k1:' + s.st; if (s.flags.includes('k1_defeated')) break; await clearEnemies(6000); await pg.waitForTimeout(300); }
  await pg.screenshot({ path: SHOT + '/play-06-k1.png' });
  return leg('to-exit', () => walk(26, -38, { label: 'exit', tol: 1.5, maxMs: 120000 }));
}
let outcome; try { outcome = await run(); } catch (e) { outcome = 'THREW ' + e.message; errs.push(outcome); }
await keys(new Set());
const fin = await ST();
log('OUTCOME', outcome, JSON.stringify({ st: fin.st, pos: [+fin.x.toFixed(1), +fin.z.toFixed(1)], hp: fin.hp, flags: fin.flags.join(',') }));
log('shots fired', shotsFired);
log('tight camera cells (x,z -> min dist)', JSON.stringify([...tight]));
log('camera: samples', camSamples, 'blocked', blockedSamples, 'minDist', minCam.toFixed(2));
console.log('ERRS', errs.slice(0, 10));
await pg.screenshot({ path: SHOT + '/play-end.png' });
await b.close();
