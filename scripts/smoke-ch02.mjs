// (a simulação headless roda ~0,6× o tempo real: segurar por mais tempo que o holdMs)
// Fumaça do Capítulo 02 via ?debug=1: startChapter('ch02') → gerador → rádio → cercado/pátio → defesa de Tomás → K-1 + portão → morte/retry pre_k1 → vitória → resultados.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4177/?debug=1';
const SHOT = process.env.SHOT_DIR || '.';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
const ev = (fn, arg) => pg.evaluate(fn, arg);
const S = () => ev(() => { const g = window.__game, s = g.save; const k1 = g.liveAgents().find((a) => a.id === 'k1'); return { st: g.sm.state, ch: g.chapterId, pl: s?.playerId, w: g.player.weaponId, pos: [+g.player.x.toFixed(1), +g.player.z.toFixed(1)], cc: g.ledger?.credits, cp: s?.checkpointId, flags: Object.keys(s?.storyFlags ?? {}).join(','), obj: g.hud._lastObj, prompt: g.hud.promptEl.textContent, agents: g.liveAgents().map((a) => a.id).join(','), k1: k1 ? Math.round(k1.hp) : null }; });
const step = async (n, fn) => { try { const r = await fn(); console.log(n, JSON.stringify(r ?? await S())); } catch (e) { errs.push(n + ' THREW ' + e.message); console.log(n, 'THREW', e.message); } };
const tp = (x, z) => ev(([x, z]) => window.__eden.teleport(x, z), [x, z]);
const hold = async (ms) => { await ev((ms) => window.__eden.hold('KeyF', ms), ms); await pg.waitForTimeout(ms + 300); };
const press = async () => { await ev(() => window.__eden.press('KeyF')); await pg.waitForTimeout(120); await ev(() => window.__eden.release('KeyF')); await pg.waitForTimeout(250); };

await pg.goto(URL); await pg.waitForTimeout(2000);
await step('start', async () => { await ev(() => window.__eden.startChapter('ch02')); await pg.waitForTimeout(1500); await ev(() => window.__eden.skip()); await pg.waitForTimeout(1500); await pg.screenshot({ path: SHOT + '/ch02-start.png' }); return S(); });
await ev(() => window.__eden.god(true));
await step('crates', async () => { await tp(13.5, 12); await ev(() => window.__game.chapter.breakAt(16.2, 12, 2)); await pg.waitForTimeout(300); return { broken: await ev(() => window.__game.save.persistentWorldFlags.broken) }; });
await ev(() => window.__eden.killAll()); await pg.waitForTimeout(300);
await step('levers', async () => { await tp(25.6, 8.4); await pg.waitForTimeout(300); await hold(5000); await tp(25.6, 15.6); await pg.waitForTimeout(300); await hold(5000); return S(); });
await ev(() => window.__eden.killAll()); await pg.waitForTimeout(400);
await step('radio', async () => { await tp(-25.4, 8); await pg.waitForTimeout(300); await hold(4500); return S(); });
await step('terminal_outpost_b', async () => { const r = await ev(async () => { const g = window.__game; g.openTerminal(g.chapter.data.terminals[0]); const { itemState, SHOP_ITEMS } = { itemState: null, SHOP_ITEMS: null }; void itemState; void SHOP_ITEMS; g.terminalUI.tab = 'COMPRAR'; g.terminalUI.buyTab = 'MUNIÇÃO'; g.terminalUI.render(); const row = [...document.querySelectorAll('#ui button.item')].find((b) => b.textContent.includes('12 cartuchos de escopeta')); const st = { cp: g.save.checkpointId, chNum: g.chapterNumber, shotgunAmmo: row?.querySelector('.badge')?.textContent }; g.closeTerminal(); return st; }); await pg.waitForTimeout(400); await ev(() => { const g = window.__game; if (g.sm.state === 'PAUSED') g.resume(); }); await pg.waitForTimeout(200); return r; });
await step('yard-refused', async () => { await tp(4.4, -1.0); await pg.waitForTimeout(300); await press(); return S(); });
await step('pen+yard', async () => { await tp(-18.8, -1.0); await pg.waitForTimeout(300); await press(); await tp(4.4, -1.0); await pg.waitForTimeout(300); await press(); return S(); });
await step('yard-shot', async () => { await tp(0, -6.5); await ev(() => { const g = window.__game; g.camera.yaw = 0; g.camera.pitch = 0.05; }); await pg.waitForTimeout(800); await pg.screenshot({ path: SHOT + '/ch02-yard.png' }); return S(); });
await step('defense', async () => {
  await tp(11, -27.0); await pg.waitForTimeout(300); await press();
  for (let i = 0; i < 80 && !(await ev(() => !!window.__game.save.storyFlags.tomas_found)); i++) { await pg.waitForTimeout(1000); await ev(() => { for (const a of window.__game.liveAgents()) if (a.id.startsWith('r4j')) a.takeDamage(999, 'torso', window.__game.aiCtx()); }); }
  return S();
});
const ccAtCp = await ev(() => JSON.parse(window.__game.checkpointSnap).credits);
await step('k1-spawn', async () => { await pg.waitForFunction(() => window.__game.liveAgents().some((a) => a.id === 'k1'), null, { timeout: 15000 }); await pg.waitForTimeout(600); await pg.screenshot({ path: SHOT + '/ch02-k1.png' }); return S(); });
await step('gate-prompt-out', async () => { await tp(6.2, -23.4); await pg.waitForTimeout(300); return S(); });
await step('gate-hit', async () => { await ev(() => { const k = window.__game.liveAgents().find((a) => a.id === 'k1'); k.x = k.px = 0; k.z = k.pz = -28; k.scripted = { t: 0 }; }); await pg.waitForTimeout(200); const before = await S(); await press(); await pg.waitForTimeout(1200); await pg.screenshot({ path: SHOT + '/ch02-gate.png' }); const after = await S(); await ev(() => { window.__game.liveAgents().find((a) => a.id === 'k1').scripted = null; }); return { promptBefore: before.prompt, hpBefore: before.k1, hpAfter: after.k1, obj: after.obj }; });
await step('die', async () => { await ev(() => { window.__eden.god(false); window.__game.god = false; window.__game.player.hp = 0; window.__game.player.dead = true; }); await pg.waitForFunction(() => window.__game.sm.state === 'GAME_OVER', null, { timeout: 20000 }); return S(); });
await step('retry', async () => { await ev(() => window.__game.retry(false)); await pg.waitForFunction(() => window.__game.liveAgents().some((a) => a.id === 'k1'), null, { timeout: 15000 }); const s = await S(); const gate = await ev(() => ({ ready: window.__game.chapter.gate.ready(window.__game.simMs), roar: window.__game.save.persistentWorldFlags.chapter.ch02.roarSpawned })); return { ...s, gate, ccAtCp }; });
await ev(() => window.__eden.god(true));
await step('roar', async () => { await ev(() => { const g = window.__game, k = g.liveAgents().find((a) => a.id === 'k1'); k.takeDamage(Math.round(k.maxHp * 0.8), 'torso', g.aiCtx()); }); await pg.waitForTimeout(4500); return { agents: (await S()).agents, n: await ev(() => window.__game.agents.filter((a) => a.agent.id === 'r4j_roar').length) }; });
await step('win', async () => { await ev(() => window.__eden.killAll()); await pg.waitForTimeout(500); return S(); });
await step('exit', async () => { await tp(26, -38.6); await pg.waitForFunction(() => window.__game.sm.state === 'CUTSCENE', null, { timeout: 8000 }); await ev(() => window.__eden.skip()); await pg.waitForFunction(() => window.__game.sm.state === 'CHAPTER_COMPLETE', null, { timeout: 15000 }); await pg.screenshot({ path: SHOT + '/ch02-results.png' }); return S(); });
await step('map', async () => { const t = await ev(() => { const g = window.__game; const el = document.createElement('canvas'); g.drawMapInto(el); return g.chapterDef.data.mapTitle; }); return { mapTitle: t }; });
console.log('ERRS', errs.slice(0, 10));
await b.close();
