// E2E do fluxo R2 inteiro (?debug=1): novo jogo → finishChapter → "Continuar — Capítulo 02" → Caio + escopeta no HUD →
// salvar slot 2 → recarregar a página e carregar o slot 2 → ainda Caio/escopeta → goto('ch02','pre_k1') → barra do K-1 → killBoss → saída → resultados com nota.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4177/?debug=1';
const SHOT = process.env.SHOT_DIR || '.';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
pg.on('dialog', (d) => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
const ev = (fn, arg) => pg.evaluate(fn, arg);
const S = () => ev(() => { const g = window.__game; return { st: g.sm.state, ch: g.chapterId, pl: g.save?.playerId, w: g.player.weaponId, hpMax: g.player.maxHp, wname: g.hud.wname.textContent, boss: g.hud.boss.classList.contains('hidden') ? null : g.hud.bossName.textContent, grade: g.save?.chapterStats?.ch02?.grade ?? null }; });
const must = (cond, msg) => { if (!cond) throw new Error('ASSERT ' + msg); };
const step = async (n, fn) => { try { const r = await fn(); console.log(n, JSON.stringify(r ?? await S())); } catch (e) { errs.push(n + ' THREW ' + e.message); console.log(n, 'THREW', e.message); } };
const toPlaying = (t = 15000) => pg.waitForFunction(() => window.__game.sm.state === 'PLAYING', null, { timeout: t });

await pg.goto(URL); await pg.waitForTimeout(2000);
await step('new-game', async () => { await pg.click('text=Novo jogo'); await pg.waitForTimeout(500); await pg.click('text=Iniciar Capítulo 01'); await pg.waitForTimeout(1500); await ev(() => window.__eden.skip()); await toPlaying(); const s = await S(); must(s.pl === 'lia', 'começa com Lia'); return s; });
await step('finish-ch01', async () => { await ev(() => window.__eden.finishChapter()); await pg.waitForTimeout(500); await ev(() => window.__eden.skip()); await pg.waitForFunction(() => window.__game.sm.state === 'CHAPTER_COMPLETE', null, { timeout: 15000 }); return S(); });
await step('continue-ch02', async () => { await pg.click('text=Continuar — Capítulo 02'); await pg.waitForFunction(() => window.__game.sm.state === 'CUTSCENE', null, { timeout: 15000 }); await ev(() => window.__eden.skip()); await toPlaying(); await pg.waitForTimeout(600); const s = await S(); must(s.pl === 'caio' && s.ch === 'ch02' && s.w === 'shotgun' && /scopeta/.test(s.wname), 'Caio com escopeta no HUD: ' + JSON.stringify(s)); await pg.screenshot({ path: SHOT + '/e2e3-caio.png' }); return s; });
await step('save-slot2', async () => { const r = await ev(() => window.__game.saveToSlot(2)); must(r.ok, 'saveToSlot(2): ' + JSON.stringify(r)); return r; });
await step('reload+load-slot2', async () => {
  await pg.goto(URL); await pg.waitForTimeout(2000);
  await pg.click('text=Carregar'); await pg.waitForSelector('text=Slot 2'); must(/Caio/.test(await pg.locator('text=Slot 2').locator('..').textContent()), 'cartão do slot 2 mostra Caio');
  await ev(() => window.__game.loadSlot(2)); await toPlaying(); await pg.waitForTimeout(600);
  const s = await S(); must(s.pl === 'caio' && s.ch === 'ch02' && s.w === 'shotgun' && /scopeta/.test(s.wname), 'Caio/escopeta após carregar: ' + JSON.stringify(s)); return s;
});
await step('goto-pre_k1', async () => { await ev(() => window.__eden.goto('ch02', 'pre_k1')); await toPlaying(); await pg.waitForFunction(() => window.__game.liveAgents().some((a) => a.id === 'k1'), null, { timeout: 15000 }); await pg.waitForFunction(() => !window.__game.hud.boss.classList.contains('hidden'), null, { timeout: 5000 }); await pg.waitForTimeout(500); await pg.screenshot({ path: SHOT + '/e2e3-boss.png' }); const s = await S(); must(s.boss && /K-1/.test(s.boss), 'barra do chefe visível: ' + JSON.stringify(s)); return s; });
await step('kill-boss', async () => { await ev(() => { window.__eden.god(true); window.__eden.killBoss(); }); await pg.waitForFunction(() => window.__game.hud.boss.classList.contains('hidden'), null, { timeout: 5000 }); return S(); });
await step('exit+results', async () => { await ev(() => window.__eden.teleport(26, -38.6)); await pg.waitForFunction(() => window.__game.sm.state === 'CUTSCENE', null, { timeout: 10000 }); await ev(() => window.__eden.skip()); await pg.waitForFunction(() => window.__game.sm.state === 'CHAPTER_COMPLETE', null, { timeout: 15000 }); await pg.waitForTimeout(500); await pg.screenshot({ path: SHOT + '/e2e3-results.png' }); const s = await S(); must(s.grade, 'nota no save'); const txt = await ev(() => document.querySelector('#ui')?.textContent ?? ''); must(txt.includes(s.grade), 'nota na tela de resultados'); return s; });
console.log('ERRS', errs.slice(0, 10));
await b.close();
process.exitCode = errs.filter((e) => !/favicon/.test(e)).length ? 1 : 0;
