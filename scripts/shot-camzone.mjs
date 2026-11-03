// Captura o corredor administrativo do ch02 com a zona de câmera ativa (distância 2,2). SHOT_DIR define o destino.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4177/?debug=1';
const SHOT = process.env.SHOT_DIR || '.';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
await pg.goto(URL); await pg.waitForTimeout(2000);
await pg.evaluate(() => window.__eden.startChapter('ch02')); await pg.waitForTimeout(1500);
await pg.evaluate(() => window.__eden.skip()); await pg.waitForTimeout(1500);
await pg.evaluate(() => window.__eden.god(true));
await pg.evaluate(() => window.__eden.teleport(-17, 11.2)); await pg.evaluate(() => { const c = window.__game.camera; c.yaw = Math.PI / 2; });
await pg.waitForTimeout(2500);
const info = await pg.evaluate(() => { const c = window.__game.camera; return { zone: c.activeZone?.id, dist: +c.dist.toFixed(3), side: c.side, flip: c.autoFlip }; });
console.log('CAM', JSON.stringify(info));
await pg.screenshot({ path: `${SHOT}/task-9-admin-corridor.png` });
console.log('ERRS', JSON.stringify(errs)); await b.close();
