// E2E real: duas voltas entre mapas devem reutilizar os MESMOS buffers de
// cenário, mantendo o runtime novo, a física correta e o save íntegro.
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(process.env.URL || 'http://localhost:4177/?debug=1');
  await page.waitForFunction(() => !!window.__game && !!window.__eden);
  await page.evaluate(async () => {
    await window.__eden.startChapter('ch02');
    window.__eden.skip();
  });
  await page.waitForFunction(() => window.__game.sm.state === 'PLAYING');

  const report = await page.evaluate(() => {
    const g = window.__game;
    g.save.chapterStats.ch01 = { grade: 'B', score: 1200 };
    g.save.storyFlags.outpost_access = true;
    g.save.completedObjectives.push('qa_progress_remains');
    const scene02 = g.scenery, world02 = g.world, props02 = g.props;
    const runId = g.save.runId;
    const initialSceneGroups = g.scene.children.filter(x => x === scene02.group).length;

    g.player.teleport(11.3, 34.5);
    const to01 = g._stepBacktrack({ interactPressed: true });
    const scene01 = g.scenery, world01 = g.world, props01 = g.props;
    const first = {
      to01, sceneSwitched: scene01 !== scene02,
      firstCh01: g.chapterId === 'ch01',
      detached02: scene02.group.parent !== g.scene,
      cached02: g.sceneCache.stats().cached.includes('ch02'),
      inactiveBuffersFreed: scene02.regionalDetails.stats().drawCalls === 0,
      activeDetailsReady: scene01.regionalDetails.stats().drawCalls > 0,
      createdCh01: scene01.group.parent === g.scene,
    };

    g.player.teleport(0, -42);
    const to02 = g._stepBacktrack({ interactPressed: true });
    const second = {
      to02, chapter: g.chapterId,
      sameScenery: g.scenery === scene02,
      sameCollisionWorld: g.world === world02,
      sameChapterProps: g.props === props02,
      attached02: scene02.group.parent === g.scene,
      detached01: scene01.group.parent !== g.scene,
      inactiveBuffersFreed: scene01.regionalDetails.stats().drawCalls === 0,
      activeDetailsReady: scene02.regionalDetails.stats().drawCalls > 0,
      cacheIsCh01: g.sceneCache.stats().cached.join(',') === 'ch01',
      objective: g.save.completedObjectives.includes('qa_progress_remains'),
      runId: g.save.runId,
    };

    g.player.teleport(11.3, 34.5);
    const to01Again = g._stepBacktrack({ interactPressed: true });
    const third = {
      to01Again, sameScenery: g.scenery === scene01,
      sameWorld: g.world === world01,
      sameProps: g.props === props01,
      cached02: g.sceneCache.stats().cached.includes('ch02'),
      ch01: g.chapterId === 'ch01',
      runId: g.save.runId,
    };

    const beforeNewRun = g.scenery;
    // Simula início de outra campanha: não pode reutilizar o mapa modificado
    // nem conservar texturas/props da sessão anterior.
    g.save.runId = runId + '_new';
    g._startRun(true);
    const fresh = {
      cleared: g.sceneCache.stats().cached.length === 0,
      different: g.scenery !== beforeNewRun,
      sameChapter: g.chapterId === 'ch01',
      active: g.scenery.group.parent === g.scene,
    };
    return { first, second, third, fresh, cacheStats: g.sceneCache.stats(), initialSceneGroups };
  });
  console.log('CHAPTER_SCENE_CACHE_QA', JSON.stringify({report, errors}));
  const { first, second, third, fresh } = report;
  if (!first.to01 || !first.sceneSwitched || !first.firstCh01 ||
      !first.detached02 || !first.cached02 || !first.inactiveBuffersFreed ||
      !first.activeDetailsReady || !first.createdCh01 ||
      !second.to02 || second.chapter !== 'ch02' || !second.sameScenery ||
      !second.sameCollisionWorld || !second.sameChapterProps ||
      !second.attached02 || !second.detached01 ||
      !second.inactiveBuffersFreed || !second.activeDetailsReady ||
      !second.cacheIsCh01 ||
      !second.objective ||
      !third.to01Again || !third.sameScenery || !third.sameWorld ||
      !third.sameProps || !third.cached02 || !third.ch01 ||
      third.runId !== second.runId ||
      !fresh.cleared || !fresh.different || !fresh.sameChapter || !fresh.active ||
      report.initialSceneGroups !== 1 || report.cacheStats.hits < 2 ||
      errors.length) throw Error('Reuso estático entre capítulos inválido: ' + JSON.stringify({report, errors}));
  await page.screenshot({path:(process.env.SHOT_DIR || '.')+'/chapter-scene-cache.png'});
  console.log('CHAPTER_SCENE_CACHE_E2E_PASS');
} finally {
  await browser.close();
}
