// E2E: transição reversível entre as duas cenas, patrulhas novas e estados sem reset.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(process.env.URL || 'http://localhost:4177/?debug=1');
  await page.waitForFunction(() => !!window.__eden && !!window.__game);
  await page.evaluate(async () => { await window.__eden.startChapter('ch02'); window.__eden.skip(); });
  await page.waitForFunction(() => window.__game.sm.state === 'PLAYING');
  const report = await page.evaluate(() => {
    const g = window.__game;
    g.save.chapterStats.ch01 = { grade: 'B', score: 1500 };
    g.save.storyFlags.outpost_access = true;
    g.save.persistentWorldFlags.chapter.ch01.gateOpen = true;
    g.save.completedObjectives = ['ch02_keep'];
    g.player.hp = 47;
    g.player.teleport(11.3, 34.5);
    const back = g._stepBacktrack({ interactPressed: true });
    const lia = { back, chapter: g.chapterId, player: g.playerView.charId,
      respawns: g.liveAgents().filter(a => a.backtrack).map(a => a.id),
      hp: g.player.hp };
    g.player.hp = 55;
    g.player.teleport(0, -42);
    const forward = g._stepBacktrack({ interactPressed: true });
    const caio = { forward, chapter: g.chapterId, player: g.playerView.charId,
      objectives: [...g.save.completedObjectives], respawns: g.liveAgents().filter(a => a.backtrack).map(a => a.id),
      hp: g.player.hp, chapterStats: g.save.chapterStats };
    return { lia, caio };
  });
  console.log('BACKTRACK_E2E', JSON.stringify(report));
  if (!report.lia.back || report.lia.chapter !== 'ch01' || report.lia.player !== 'lia' || report.lia.respawns.length < 1 ||
    !report.caio.forward || report.caio.chapter !== 'ch02' || report.caio.player !== 'caio' ||
    !report.caio.objectives.includes('ch02_keep') || report.caio.respawns.length < 1 ||
    report.caio.hp !== 47 || !report.caio.chapterStats.ch01 || errors.length)
    throw Error('Falha no retorno e progresso: ' + JSON.stringify({ report, errors }));
  await page.screenshot({ path: (process.env.SHOT_DIR || '.') + '/backtrack-ch02-return.png' });
  console.log('BACKTRACK_E2E_PASS');
} finally { await browser.close(); }
