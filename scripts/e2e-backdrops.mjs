// R2.4 — imagens panorâmicas fora do mapa nos capítulos de Lia e Caio.
// Execute com URL='http://127.0.0.1:4177/?debug=1' node scripts/e2e-backdrops.mjs
import { chromium } from 'playwright';

const url = process.env.URL || 'http://127.0.0.1:4177/?debug=1';
const screenshots = process.env.SHOT_DIR || '.';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__eden && !!window.__game);
  for (const chapterId of ['ch01', 'ch02']) {
    await page.evaluate(async id => {
      await window.__eden.startChapter(id);
      window.__eden.skip();
    }, chapterId);
    await page.waitForFunction(() => window.__game.sm.state === 'PLAYING');
    const report = await page.evaluate(() => {
      const g = window.__game, bg = g.scenery.backdrop;
      const save = JSON.stringify(g.save), colliders = g.world.byId.size;
      const fogFar = g.scene.fog.far, fogNear = g.scene.fog.near;
      const meshes = [];
      bg.group.traverse(o => { if (o.isMesh) meshes.push(o); });
      const original = bg.stats();
      bg.setQuality({ foliage: 0.45 });
      const low = bg.stats();
      bg.setQuality({ foliage: 0.8 });
      const high = bg.stats();
      bg.setQuality(g.scenery.group.userData.q ?? { foliage: 0.8 });
      g.renderer.render(g.scene, g.threeCam);
      const b = g.chapterDef.data.bounds;
      const inaccessible = meshes.every(m =>
        m.position.x < b[0] || m.position.x > b[2] ||
        m.position.z < b[1] || m.position.z > b[3]);
      const allTexturesReady = bg.textures.every(t => t.isTexture && t.image?.width === 1024 && t.image?.height === 256 && t.version > 0);
      const unlit = meshes.every(m => !m.castShadow && !m.receiveShadow && m.material.depthWrite === false && m.material.fog === false);
      return {
        chapter: g.chapterId, state: g.sm.state,
        original, low, high, inaccessible, allTexturesReady, unlit,
        sameSave: JSON.stringify(g.save) === save,
        sameColliders: g.world.byId.size === colliders,
        sameFog: g.scene.fog.far === fogFar && g.scene.fog.near === fogNear,
        rendererCalls: g.renderer.info.render.calls,
      };
    });
    if (report.chapter !== chapterId || report.state !== 'PLAYING' ||
      report.original.planes !== 8 || report.original.textures !== 2 ||
      report.low.visiblePlanes !== 4 || report.high.visiblePlanes !== 8 ||
      !report.inaccessible || !report.allTexturesReady || !report.unlit ||
      !report.sameSave || !report.sameColliders || !report.sameFog) {
      throw Error('BACKDROP_FAIL ' + JSON.stringify(report));
    }
    await page.screenshot({ path: `${screenshots}/backdrop-${chapterId}.png` });
    console.log('BACKDROP_PASS ' + JSON.stringify(report));
  }
  if (errors.length) throw Error('Erros de execução JS: ' + errors.join(' | '));
} finally {
  await browser.close();
}
