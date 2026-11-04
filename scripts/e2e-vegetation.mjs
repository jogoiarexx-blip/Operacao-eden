// E2E de streaming de vegetação: matriz/contagem, qualidade, colisores e troca de capítulo.
import { chromium } from 'playwright';

const url = process.env.URL || 'http://localhost:4177/?debug=1';
const shotDir = process.env.SHOT_DIR || '.';
const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

async function startChapter(id) {
  await page.evaluate(async (chapterId) => {
    await window.__eden.startChapter(chapterId);
    window.__eden.skip();
  }, id);
  await page.waitForFunction(() => window.__game.sm.state === 'PLAYING');
  await page.waitForFunction(() => window.__game.scenery.vegetationStream?.stats().treesVisible > 0);
}

try {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__eden && !!window.__game);
  for (const id of ['ch01', 'ch02']) {
    await startChapter(id);
    const result = await page.evaluate(() => {
      const game = window.__game;
      const stream = game.scenery.vegetationStream;
      const world = game.world;
      const trees = game.scenery.trees;
      const original = stream.stats();
      const saveBefore = JSON.stringify(game.save);
      const collidersBefore = world.byId.size;
      const treeColliders = trees.every((_, i) => world.byId.get('tree_' + i)?.enabled);

      // Comparação de carga geométrica no mesmo enquadramento (não é medição de FPS).
      stream.update({ x: game.player.x, z: game.player.z });
      game.renderer.info.reset(); game.renderer.render(game.scene, game.threeCam);   // info.autoReset=false (PostFX): zerar por medição
      const nearTriangles = game.renderer.info.render.triangles;

      stream.update({ x: 2000, z: 2000 });
      game.renderer.info.reset(); game.renderer.render(game.scene, game.threeCam);   // info.autoReset=false (PostFX): zerar por medição
      const farTriangles = game.renderer.info.render.triangles;
      const far = stream.stats();

      stream.update({ x: game.player.x, z: game.player.z });
      const near = stream.stats();

      stream.setQuality(0.25);
      stream.update({ x: game.player.x, z: game.player.z });
      const low = stream.stats();
      stream.setQuality(1);
      stream.update({ x: game.player.x, z: game.player.z });
      const high = stream.stats();

      // Restaurar a qualidade do usuário sem modificar suas configurações salvas.
      stream.setQuality(game.scenery.group.userData.q?.foliage ?? 1);
      stream.update({ x: game.player.x, z: game.player.z });

      return {
        chapter: game.chapterId, original, far, near, low, high,
        geometry: { nearTriangles, farTriangles, savedTriangles: nearTriangles - farTriangles },
        treeColliders, sameWorld: collidersBefore === world.byId.size,
        sameSave: JSON.stringify(game.save) === saveBefore,
        state: game.sm.state,
      };
    });
    if (!result.treeColliders || !result.sameWorld || !result.sameSave ||
        result.state !== 'PLAYING' || result.original.treesTotal === 0 ||
        result.far.treesVisible !== 0 || result.far.bushesVisible !== 0 ||
        result.near.treesVisible === 0 ||
        result.low.bushesVisible >= result.high.bushesVisible ||
        result.geometry.savedTriangles < 0) {
      throw Error('Falha no streaming ' + id + ': ' + JSON.stringify(result));
    }
    await page.screenshot({ path: `${shotDir}/vegetation-${id}.png` });
    console.log('VEGETATION_PASS', JSON.stringify(result));
  }
  if (errors.length) throw Error('Console: ' + errors.join(' | '));
} finally {
  await browser.close();
}
