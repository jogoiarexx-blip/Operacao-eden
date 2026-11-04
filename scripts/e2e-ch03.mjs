// Playtest do Capítulo 03 — Jardim das Vozes (Chromium headless).
// Servir o build single em :4177 e rodar:  URL='http://127.0.0.1:4177/?debug=1' SHOT_DIR=qa-shots node scripts/e2e-ch03.mjs
// Cobre: Cap. 02 → resultados → Continuar → Cap. 03 (Lia), irrigação atraindo o S-2, chave biométrica,
// puzzle de calibração da torre, comporta, saída e tela de resultados — sem erros de página.
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://127.0.0.1:4177/?debug=1';
const SHOT = process.env.SHOT_DIR || '.';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const fail = async (msg) => { console.error('FALHOU:', msg); await page.screenshot({ path: `${SHOT}/ch03-falha.png` }); await browser.close(); process.exit(1); };
const ok = async (cond, msg) => { if (cond) console.log('ok -', msg); else await fail(msg); };
const G = (fn, arg) => page.evaluate(fn, arg);
const waitState = (s, timeout = 60000) => page.waitForFunction((st) => window.__game?.sm.state === st, s, { timeout });
const flags = () => G(() => ({ ...window.__game.save.storyFlags }));
const tap = async (code) => { await G((c) => window.__eden.press(c), code); await page.waitForTimeout(250); await G((c) => window.__eden.release(c), code); await page.waitForTimeout(350); };

await page.goto(URL); await page.waitForFunction(() => window.__eden && window.__game?.sm.state === 'MAIN_MENU', null, { timeout: 60000 });

// 1) Cap. 02 concluído → resultados → Continuar abre o Cap. 03 com a Lia
await G(() => window.__eden.startChapter('ch02')); await waitState('CUTSCENE'); await G(() => window.__eden.skip()); await waitState('PLAYING');
await G(() => window.__eden.finishChapter()); await waitState('CUTSCENE'); await G(() => window.__eden.skip());
await waitState('CHAPTER_COMPLETE');
const teaser = await page.locator('.card.amber').textContent().catch(() => '');
await ok(/Lia segue para os Jardins/.test(teaser), `resultados do Cap. 02 anunciam o Cap. 03 (${teaser.slice(0, 60)}…)`);
await page.click('text=Continuar — Capítulo 03');
await waitState('CUTSCENE', 90000);
await ok(await G(() => window.__game.chapterId === 'ch03' && window.__game.save.playerId === 'lia'), 'Cap. 03 começa com a Lia');
await page.waitForTimeout(2500); await page.screenshot({ path: `${SHOT}/ch03-intro.png` });
await G(() => window.__eden.skip()); await waitState('PLAYING');
await G(() => window.__eden.god(true));
await page.waitForTimeout(1500); await page.screenshot({ path: `${SHOT}/ch03-start.png` });

// 2) estufa de entrada
await G(() => window.__eden.cameraShot(0, 20, 0, 0.05)); await page.waitForTimeout(1500);
await ok(await G(() => window.__game.save.completedObjectives.includes('enter_gardens')), 'objetivo 1: estufa de entrada');
await page.screenshot({ path: `${SHOT}/ch03-estufa.png` });

// 3) irrigação: o S-2 sai para investigar o barulho
await G(() => window.__eden.cameraShot(-12.6, 9.6, Math.PI / 2, 0.05)); await page.waitForTimeout(800);
await tap('KeyF');
const noise = await G(() => window.__game.chapter.script.noiseSources(window.__game.chapter, window.__game.simMs).length);
await ok(noise === 1, 'irrigação gera fonte sonora');
await page.waitForFunction(() => { const a = window.__game.liveAgents().find((x) => x.id === 's2_a'); return a && ['INVESTIGATE', 'SEARCH'].includes(a.state); }, null, { timeout: 30000 }).catch(() => null);
const s2 = await G(() => { const a = window.__game.liveAgents().find((x) => x.id === 's2_a'); return a ? { s: a.state, x: a.x, z: a.z } : null; });
await ok(s2 && ['INVESTIGATE', 'SEARCH', 'STALK', 'CHASE'].includes(s2.s), `S-2 reagiu à irrigação (${JSON.stringify(s2)})`);

// 4) chave biométrica (interação de segurar)
await G(() => window.__eden.cameraShot(-26.2, 11.9, Math.PI, 0.05)); await page.waitForTimeout(600);
await G(() => window.__eden.press('KeyF'));
await page.waitForFunction(() => window.__game.save.storyFlags.biometric_key, null, { timeout: 180000 }).catch(() => null);
await G(() => window.__eden.release('KeyF'));
await ok((await flags()).biometric_key, 'chave biométrica obtida');
await ok(await G(() => window.__game.save.documents.includes('AUDIO_ELISA_01')), 'áudio da Elisa no diário');
await page.screenshot({ path: `${SHOT}/ch03-escritorio.png` });

// 5) comporta recusa enquanto a torre transmite
await G(() => window.__eden.cameraShot(3.7, -31.6, 0, 0.05)); await page.waitForTimeout(800);
await tap('KeyF');
await ok(!(await flags()).research_wing_open, 'comporta em quarentena antes da calibração');

// 6) puzzle de calibração: 2 trocas por canal levam à sintonia
for (const [x, z, yaw] of [[-6.2, -8.9, 0], [6.2, -8.9, 0], [0, -18.3, 0]]) {
  await G(([a, b, c]) => window.__eden.cameraShot(a, b, c, 0.05), [x, z, yaw]); await page.waitForTimeout(700);
  await tap('KeyF'); await tap('KeyF');
}
await ok((await flags()).coro_garden_off, 'torre CORO-J calibrada (3/3 canais)');
await G(() => window.__eden.cameraShot(0, -2, 0, 0.35)); await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOT}/ch03-torre.png` });

// 7) comporta abre e a saída conclui o capítulo
await G(() => window.__eden.cameraShot(3.7, -31.6, 0, 0.05)); await page.waitForTimeout(800);
await tap('KeyF');
await ok((await flags()).research_wing_open, 'comporta da ala de pesquisa aberta');
await page.waitForTimeout(2500);
await G(() => window.__eden.cameraShot(0, -37.2, 0, 0.05));
await waitState('CUTSCENE', 30000); await page.waitForTimeout(2000); await page.screenshot({ path: `${SHOT}/ch03-final.png` });
await G(() => window.__eden.skip()); await waitState('CHAPTER_COMPLETE', 30000);
const title = await page.locator('h2').first().textContent();
await ok(/Capítulo 03 concluído/.test(title), `tela de resultados (${title})`);
await page.screenshot({ path: `${SHOT}/ch03-resultados.png` });

const real = errors.filter((e) => !/GL Driver|GPU stall|WebGL/.test(e));
await ok(real.length === 0, `sem erros de página (${real.slice(0, 3).join(' | ')})`);
await browser.close();
