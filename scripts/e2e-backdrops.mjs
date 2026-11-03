// R2.5 — panorama 360 sem cantos, nas duas fases de Lia e Caio.
// Execute com URL='http://127.0.0.1:4177/?debug=1' node scripts/e2e-backdrops.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const url = process.env.URL || 'http://127.0.0.1:4177/?debug=1';
const screenshots = process.env.SHOT_DIR || '.';
mkdirSync(screenshots, { recursive: true });
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
      // Os centros dos cilindros ficam dentro do mapa; as superfícies (raios) não.
      const halfDiagonal = Math.hypot((b[2] - b[0]) / 2, (b[3] - b[1]) / 2);
      const inaccessible = meshes.every(m =>
        m.geometry.parameters.radiusTop > halfDiagonal + 10 &&
        m.geometry.parameters.radiusBottom > halfDiagonal + 10);
      const allTexturesReady = bg.textures.every(t => t.isTexture && t.image?.width === 1024 && t.image?.height === 256 && t.version > 0);
      const unlit = meshes.every(m => !m.castShadow && !m.receiveShadow && m.material.depthWrite === false && m.material.fog === false);
      const cylinders = meshes.every(m => m.geometry.type === 'CylinderGeometry' &&
        m.geometry.parameters.openEnded === true &&
        m.geometry.parameters.radialSegments === 48 && m.material.side === 1);
      const cornersRadius = Math.hypot((b[2] - b[0]) / 2, (b[3] - b[1]) / 2);
      const beyondCorners = bg.stats().radii.every(r => r > cornersRadius + 10);
      const lowFog = bg.setQuality({ foliage: .45, fogFar: 62 });
      const nearLow = bg.stats().opacity;
      bg.setQuality({ foliage: .8, fogFar: 92 });
      const nearHigh = bg.stats().opacity;
      bg.setQuality(g.scenery.group.userData.q ?? { foliage: .8, fogFar: 78 });
      const fogResponsive = nearHigh[0] > nearLow[0] && nearHigh[1] > nearLow[1];
      return {
        chapter: g.chapterId, state: g.sm.state,
        original, low, high, inaccessible, allTexturesReady, unlit,
        sameSave: JSON.stringify(g.save) === save,
        sameColliders: g.world.byId.size === colliders,
        sameFog: g.scene.fog.far === fogFar && g.scene.fog.near === fogNear,
        cylinders, beyondCorners, fogResponsive,
        rendererCalls: g.renderer.info.render.calls,
      };
    });
    if (report.chapter !== chapterId || report.state !== 'PLAYING' ||
      report.original.planes !== 2 || report.original.textures !== 2 ||
      report.low.visiblePlanes !== 1 || report.high.visiblePlanes !== 2 ||
      !report.inaccessible || !report.allTexturesReady || !report.unlit ||
      !report.cylinders || !report.beyondCorners || !report.fogResponsive ||
      !report.sameSave || !report.sameColliders || !report.sameFog) {
      throw Error('BACKDROP_FAIL ' + JSON.stringify(report));
    }
    await page.screenshot({ path: `${screenshots}/backdrop-${chapterId}.png` });
    // Captura exatamente o Canvas do navegador, não uma simulação do desenho.
    // Essas quatro imagens revelam detalhes escondidos por muros e árvores na
    // captura do spawn, e permitem comparar textura, névoa e costura horizontal.
    const paintings = await page.evaluate(() =>
      window.__game.scenery.backdrop.textures.map(texture =>
        texture.image.toDataURL('image/png').split(',')[1]));
    if (paintings.length !== 2 || paintings.some(p => !p)) {
      throw Error('BACKDROP_CANVAS_CAPTURE_FAIL ' + chapterId);
    }
    for (const [index, layer] of ['far', 'near'].entries()) {
      writeFileSync(`${screenshots}/painting-${chapterId}-${layer}.png`,
        Buffer.from(paintings[index], 'base64'));
    }
    console.log('BACKDROP_PASS ' + JSON.stringify({ ...report, canvasPaintings: 2 }));
  }
  if (errors.length) throw Error('Erros de execução JS: ' + errors.join(' | '));
} finally {
  await browser.close();
}
