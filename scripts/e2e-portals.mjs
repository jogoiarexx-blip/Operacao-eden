// E2E visual isolado dos portais e da emboscada do rádio (?debug=1).
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4177/?debug=1';
const SHOT = process.env.SHOT_DIR || '.';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (e) => { if (e.type() === 'error') errors.push(e.text()); });

try {
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__eden && !!window.__game);
  await page.evaluate(async () => { await window.__eden.startChapter('ch02'); window.__eden.skip(); });
  await page.waitForFunction(() => window.__game.sm.state === 'PLAYING');

  // Sem se teletransportar para dentro de portas fechadas; todas as posições são transitáveis.
  await page.evaluate(() => { window.__eden.god(true); window.__eden.teleport(11.3, 27); });
  await page.waitForFunction(() => window.__game.camera.activeZone?.id === 'cz_portal_breach');
  const first = await page.evaluate(() => {
    const g = window.__game, c = g.scenery.visualDetailCuller;
    const before = c.entries.length;
    c.update({ x: 200, z: 200 }); // chama o mesmo culler isoladamente para conferir que há detalhes candidatos
    const hidden = c.culled;
    c.restore(); // não mantém a alteração durante a partida
    return { zone: g.camera.activeZone.id, before, hidden };
  });
  if (first.before < 3 || first.hidden !== first.before) throw Error('LOD não selecionou detalhes: ' + JSON.stringify(first));
  await page.screenshot({ path: SHOT + '/portal-breach.png' });

  await page.evaluate(() => { window.__eden.teleport(17.3, 12); });
  await page.waitForFunction(() => window.__game.camera.activeZone?.id === 'cz_portal_shed');

  // A porta (-13,2) e o corredor (-17) são zonas diferentes. Primeiro valida
  // a câmera curta na passagem; só depois entra no gatilho da emboscada do rádio.
  await page.evaluate(() => {
    const g = window.__game;
    g.save.storyFlags.radio_online = true;
    g.props.setRadio(true);
    window.__eden.teleport(-13.2, 11.2);
  });
  await page.waitForFunction(() => window.__game.camera.activeZone?.id === 'cz_portal_admin');
  await page.screenshot({ path: SHOT + '/portal-admin-door.png' });
  await page.evaluate(() => window.__eden.teleport(-17, 11.2));
  await page.waitForFunction(() => window.__game.camera.activeZone?.id === 'cz_admin');
  await page.waitForFunction(() => window.__game.save.storyFlags.ch02_admin_hunter_triggered === true, null, { timeout: 12000 });
  const ambush = await page.evaluate(() => {
    const g = window.__game;
    return {
      zone: g.camera.activeZone?.id,
      agents: g.agents.filter(a => a.agent.id === 'r4j_admin').length,
      saved: g.save.storyFlags.ch02_admin_hunter_triggered,
      state: g.sm.state,
    };
  });
  if (!ambush.saved || ambush.agents !== 1 || ambush.state !== 'PLAYING') throw Error('Emboscada inválida: ' + JSON.stringify(ambush));
  await page.screenshot({ path: SHOT + '/portal-admin-ambush.png' });
  if (errors.length) throw Error(errors.join(' | '));
  console.log('PORTALS_PASS', JSON.stringify({ first, ambush }));
} finally {
  await browser.close();
}
