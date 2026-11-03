// QA Chromium: retorno à mesma região, respawn com cooldown, save persistente
// e buffers de cenário carregados/destruídos sem recarregar o mapa inteiro.
import { chromium } from 'playwright';
const url = process.env.URL || 'http://localhost:4177/?debug=1';
const shotDir = process.env.SHOT_DIR || '.';
const browser = await chromium.launch({
  args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: {width:1280,height:720} });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', e => { if(e.type() === 'error') errors.push(e.text()); });
try {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__game && !!window.__eden);
  for (const [chapter, coords] of [['ch01', [27, 13]], ['ch02', [8, 28]]]) {
    await page.evaluate(async id => { await window.__eden.startChapter(id); window.__eden.skip(); }, chapter);
    await page.waitForFunction(() => window.__game.sm.state === 'PLAYING');
    const report = await page.evaluate(async ([x, z]) => {
      const g = window.__game, director = g.chapter.regional, scenery = g.scenery.regionalDetails;
      const save = g.save, before = {
        items: JSON.stringify(save.persistentWorldFlags.pickedUp),
        defeated: JSON.stringify(save.persistentWorldFlags.defeatedEnemies),
        objectives: JSON.stringify(save.completedObjectives),
        colliderCount: g.world.byId.size,
        chapter: g.chapterId,
      };
      g.player.teleport(0, 0);
      director.step(); // garante saída de qualquer região prévia
      g.player.teleport(x, z);
      const first = director.step();
      g.player.teleport(0, 0);
      director.step();
      save.playtimeSeconds += 70;
      g.player.teleport(x, z);
      const second = director.step();
      const enemy = g.liveAgents().find(a => a.id === second?.enemyId);
      const spawnedDist = enemy ? Math.hypot(enemy.x - x, enemy.z - z) : -1;
      scenery.update({ x, z });
      const near = scenery.stats();
      const current = JSON.stringify({
        items: save.persistentWorldFlags.pickedUp,
        defeated: save.persistentWorldFlags.defeatedEnemies,
        objectives: save.completedObjectives,
      });
      scenery.update({x:1000,z:1000});
      const far = scenery.stats();
      scenery.update({x,z});
      const revisited = scenery.stats();
      const saved = await g.saveToSlot(3);
      const reloaded = await g.saveManager.load(3);
      const key = g.chapterId + ':' + second?.region;
      const persisted = reloaded?.save?.backtrack?.regions?.[key];
      const after = {
        items: JSON.stringify(save.persistentWorldFlags.pickedUp),
        defeated: JSON.stringify(save.persistentWorldFlags.defeatedEnemies),
        objectives: JSON.stringify(save.completedObjectives),
        colliderCount: g.world.byId.size,
        chapter: g.chapterId,
      };
      return { first, second, regionKey:key, enemy:enemy?.id ?? null, spawnedDist, near, far, revisited,
        saved:saved.ok, persisted, before, after, current };
    }, coords);
    console.log('REGIONAL_E2E', JSON.stringify({chapter, ...report}));
    if (!report.second?.spawned || !report.enemy || report.spawnedDist < 7.5 ||
      report.near.drawCalls < 1 || report.near.instances < 1 ||
      report.far.drawCalls !== 0 || report.far.disposed < 1 ||
      report.revisited.created <= report.near.created ||
      !report.saved || report.persisted?.visits < 2 || report.persisted?.spawns < 1 ||
      JSON.stringify(report.before) !== JSON.stringify(report.after)) {
      throw Error('Falha na continuidade regional: ' + JSON.stringify({chapter, report}));
    }
    await page.screenshot({ path: shotDir + '/regional-' + chapter + '.png' });
  }
  if (errors.length) throw Error('Erros no navegador: ' + errors.join(' | '));
  console.log('REGIONAL_SECTORS_E2E_PASS');
} finally {
  await browser.close();
}
