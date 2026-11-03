// QA visual: Cap. 02 → entrada da brecha → revelação de área + R-4 criado uma vez.
// Rodar com Vite preview em 4177 e Playwright Chromium instalado.
import { chromium } from 'playwright';

const base = process.env.URL || 'http://localhost:4177/?debug=1';
const shots = process.env.SHOT_DIR || '.';
const browser = await chromium.launch({ args: [
  '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
try {
  await page.goto(base);
  await page.waitForFunction(() => !!window.__eden && !!window.__game);
  await page.evaluate(async () => { await window.__eden.startChapter('ch02'); window.__eden.skip(); });
  await page.waitForFunction(() => window.__game.sm.state === 'PLAYING');
  await page.evaluate(() => { window.__eden.god(true); window.__eden.teleport(11.3, 27); });
  await page.waitForFunction(() => window.__game.save.storyFlags.ch02_breach_entered === true);
  await page.waitForFunction(() => document.querySelector('[data-area-beat="ch02_breach"]') !== null);
  const first = await page.evaluate(() => ({
    count: window.__game.agents.filter((a) => a.agent.id === 'r4_court').length,
    reveal: window.__game.chapter.areaBeatsShown.has('ch02_breach'),
  }));
  if (first.count !== 1 || !first.reveal) throw Error('Primeiro encontro incorreto: ' + JSON.stringify(first));
  await page.screenshot({ path: shots + '/area-breach.png' });
  await page.evaluate(() => window.__eden.teleport(11.3, 34));
  await page.waitForTimeout(350);
  await page.evaluate(() => window.__eden.teleport(11.3, 27));
  await page.waitForTimeout(300);
  const second = await page.evaluate(() => ({
    count: window.__game.agents.filter((a) => a.agent.id === 'r4_court').length,
    flag: window.__game.save.storyFlags.ch02_breach_entered,
    playing: window.__game.sm.state === 'PLAYING',
  }));
  if (second.count !== 1 || !second.flag || !second.playing) throw Error('Reentrada inválida: ' + JSON.stringify(second));
  if (errors.length) throw Error('Console: ' + errors.join('; '));
  console.log('AREA_TRANSITIONS_PASS', JSON.stringify({ first, second }));
} finally {
  await browser.close();
}
