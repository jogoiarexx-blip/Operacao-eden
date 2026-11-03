// QA real em Chromium: perímetro de exclusão dos dinossauros, terminal de save/loja
// e árvores-imagem inacessíveis em ambos os cenários.
import { chromium } from 'playwright';

const base = process.env.URL || 'http://localhost:4177/?debug=1';
const shots = process.env.SHOT_DIR || '.';
const browser = await chromium.launch({ args: [
  '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(base);
  await page.waitForFunction(() => !!window.__game && !!window.__eden);
  for (const id of ['ch01', 'ch02']) {
    await page.evaluate(async name => {
      await window.__eden.startChapter(name);
      window.__eden.skip();
    }, id);
    await page.waitForFunction(() => window.__game.sm.state === 'PLAYING');
    const report = await page.evaluate(async () => {
      const g = window.__game, data = g.chapterDef.data, rooms = data.safeRooms;
      const tests = [];
      const trees = g.scenery.treeCards;
      trees.update(g.camera.pos, 1 / 60);
      for (const room of rooms) {
        const [x, z] = room.center;
        g.player.teleport(x, z);
        const originalHP = g.player.hp;
        const dino = g.spawnAgent({ id: 'qa_safe_' + room.id, type: 'forest_runner_juvenile',
          pos: [x + 0.25, z + 0.25], patrol: [] }, 'qa_safe');
        dino.setState('CHASE');
        for (let i = 0; i < 90; i++) g.step(1 / 60);
        const distance = Math.hypot(dino.x - x, dino.z - z);
        const safe = distance > room.radius + dino.radius - .01;
        const hpPreserved = g.player.hp === originalHP;
        const terminal = data.terminals.find(t => t.id === room.terminalId);
        tests.push({ id: room.id, safe, hpPreserved, distance,
          radius: room.radius, terminal: terminal?.id ?? null });
      }
      const terminal = data.terminals.find(t => t.id === rooms[0].terminalId);
      g.player.teleport(...terminal.safe);
      g.openTerminal(terminal);
      const shop = g.sm.state === 'SHOP' && !!g.terminalUI?.el &&
        g.terminalUI.el.textContent.includes('COMPRAR') &&
        g.terminalUI.el.textContent.includes('SALVAR');
      const saved = await g.saveToSlot(3);
      g.closeTerminal();
      const restored = await g.saveManager.load(3);
      const doors = g.scenery.safeDoors;
      const doorResults = doors.doors.map(d => {
        g.player.teleport(...d.room.entrance);
        doors.update(g.player, 1);
        const locked = !!(d.room.requiresBroken && g.world.byId.has(d.room.requiresBroken));
        const opened = doors.stats().open.includes(d.room.id);
        let openedAfterUnlock = null;
        if (locked) {
          // Confirma a progressão da missão sem alterar permanentemente o colisor.
          g.world.removeById(d.room.requiresBroken);
          doors.update(g.player, 1);
          openedAfterUnlock = doors.stats().open.includes(d.room.id);
          g.world.restoreById(d.room.requiresBroken);
        }
        return {id:d.room.id,locked,opened,openedAfterUnlock};
      });
      return { chapter: g.chapterId, tests, shop, saved: saved.ok, restored: !!restored,
        treeStats: trees.stats(), doors: doorResults, doorCount: doors.stats().doors,
        playing: g.sm.state === 'PLAYING' };
    });
    console.log('SAFE_ROOMS_QA', JSON.stringify(report));
    if (report.tests.length < 2 || !report.tests.every(t => t.safe && t.hpPreserved && t.terminal) ||
      !report.shop || !report.saved || !report.restored || !report.treeStats.outsideBounds ||
      report.treeStats.panels !== 2 || report.treeStats.trees < 40 || !report.playing ||
      report.doorCount !== (id === 'ch01' ? 1 : 2) ||
      !report.doors.every(d => d.locked ? (!d.opened && d.openedAfterUnlock) : d.opened))
      throw Error('Salas seguras / árvores 2.5D falharam: ' + JSON.stringify(report));
    await page.screenshot({ path: shots + '/safe-rooms-' + id + '.png' });
  }
  if (errors.length) throw Error('Erros no console: ' + errors.join('; '));
  console.log('SAFE_ROOMS_E2E_PASS');
} finally {
  await browser.close();
}
