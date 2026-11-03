// Prova real no Chromium: o GLB deve carregar, ser usado pela Lia e renderizar.
// Impede que o fallback procedural esconda erros que não aparecem em testes unitários.
import { chromium } from 'playwright';
const base = process.env.URL || 'http://localhost:4177/?debug=1';
const out = process.env.SHOT_DIR || '.';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [], assets = [];
page.on('pageerror', error => problems.push(error.message));
page.on('console', message => { if (message.type() === 'error' || (message.type() === 'warning' && message.text().includes('[Regina]'))) problems.push(message.text()); });
page.on('response', response => { if (response.url().includes('regina-optimized.glb')) assets.push({ status: response.status(), url: response.url(), contentType: response.headers()['content-type'] }); });
page.on('requestfailed', request => { if (request.url().includes('regina-optimized.glb')) problems.push(request.url() + ': ' + request.failure()?.errorText); });
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game && !!window.__eden, null, { timeout: 20000 });
  await page.evaluate(async () => { await window.__eden.startChapter('ch01'); window.__eden.skip(); });
  await page.waitForFunction(() => window.__game.sm.state === 'PLAYING', null, { timeout: 20000 });
  const report = await page.evaluate(async () => {
    const g = window.__game, rig = g.playerView.regina;
    await rig.load();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const meshes = []; rig.model?.traverse(o => { if (o.isMesh) meshes.push(o); });
    return {
      ready: rig.ready, active: rig.active, visible: rig.model?.visible,
      rootVisible: g.playerView.root.visible, character: g.playerView.charId,
      modelParent: !!rig.model?.parent, meshCount: meshes.length,
      drawn: meshes.some(m => m.visible && m.material?.visible !== false),
      sourceClips: rig.sourceClipCount, currentState: rig.state,
    };
  });
  console.log('REGINA_LOAD', JSON.stringify({ report, assets, problems }));
  await page.screenshot({ path: out + '/regina-ch01.png' });
  if (!report.ready || !report.active || !report.visible || !report.rootVisible || !report.modelParent ||
      report.character !== 'lia' || report.meshCount < 1 || !report.drawn ||
      !assets.some(x => x.status === 200) || problems.length) {
    throw Error('GLB Regina não comprovado em execução: ' + JSON.stringify({ report, assets, problems }));
  }
  console.log('REGINA_CHROMIUM_PASS');
} finally { await browser.close(); }
