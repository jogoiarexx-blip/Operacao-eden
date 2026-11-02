import { forwardVec } from '../world/ShoulderCameraController.js';

/**
 * Resolução de tiro (GDD 4.3 regra 5): o retículo (raio da câmera) encontra um ponto; um SEGUNDO teste parte do cano
 * e verifica se o projétil chega ao ponto sem atravessar cobertura próxima. Dano, animação e impacto são separados.
 */
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return null;
  const thc = Math.sqrt(r * r - d2); let t = tca - thc; if (t < 0) t = tca + thc;
  return t >= 0 && t <= maxT ? t : null;
}

/** Centros das caixas de acerto de um animal em coordenadas de mundo. */
export function hitSpheres(enemy) {
  const f = { x: -Math.sin(enemy.yaw), z: -Math.cos(enemy.yaw) };
  const h = enemy.species.hit, out = [];
  for (const [part, p] of Object.entries(h)) out.push({ part, x: enemy.x + f.x * p.fwd, y: p.y, z: enemy.z + f.z * p.fwd, r: p.r });
  return out;
}

export function rayEnemies(enemies, ox, oy, oz, dx, dy, dz, maxT) {
  let best = null;
  for (const e of enemies) {
    if (e.dead) continue;
    for (const s of hitSpheres(e)) {
      const t = raySphere(ox, oy, oz, dx, dy, dz, s.x, s.y, s.z, s.r, maxT);
      if (t !== null && (!best || t < best.t)) best = { t, enemy: e, part: s.part };
    }
  }
  return best;
}

export const PART_MULT = (w, part) => (part === 'head' ? w.headMult : part === 'legs' ? w.limbMult : 1);

function perturb(dx, dy, dz, spreadDeg, rng) {
  if (spreadDeg <= 0) return [dx, dy, dz];
  const ang = rng.next() * Math.PI * 2, rad = Math.sqrt(rng.next()) * spreadDeg * Math.PI / 180;
  // base ortonormal em torno de d
  const ux = Math.abs(dy) < 0.99 ? 0 : 1, uy = Math.abs(dy) < 0.99 ? 1 : 0;
  let rx = dy * 0 - dz * uy, ry = dz * ux - dx * 0, rz = dx * uy - dy * ux; // d × up
  const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
  const sx = ry * dz - rz * dy, sy = rz * dx - rx * dz, sz = rx * dy - ry * dx;
  const a = Math.tan(rad) * Math.cos(ang), b = Math.tan(rad) * Math.sin(ang);
  let nx = dx + rx * a + sx * b, ny = dy + ry * a + sy * b, nz = dz + rz * a + sz * b;
  const nl = Math.hypot(nx, ny, nz); return [nx / nl, ny / nl, nz / nl];
}

/** Assistência de mira discreta (opcional): inclina levemente a direção do TIRO, nunca a câmera. */
export function applyAssist(dir, camPos, enemies, world, strength) {
  if (strength <= 0) return dir;
  let best = null, bestAng = (3.2 * strength + 0.8) * Math.PI / 180;
  for (const e of enemies) {
    if (e.dead) continue;
    const tx = e.x - camPos.x, ty = 0.85 - camPos.y, tz = e.z - camPos.z, l = Math.hypot(tx, ty, tz);
    if (l > 32 || l < 1.5) continue;
    const dot = (dir[0] * tx + dir[1] * ty + dir[2] * tz) / l, ang = Math.acos(Math.min(1, Math.max(-1, dot)));
    if (ang < bestAng && !world.segmentBlocked(camPos.x, camPos.y, camPos.z, e.x, 0.85, e.z, 'bullet')) { bestAng = ang; best = [tx / l, ty / l, tz / l]; }
  }
  if (!best) return dir;
  const k = 0.55 * strength, nx = dir[0] + (best[0] - dir[0]) * k, ny = dir[1] + (best[1] - dir[1]) * k, nz = dir[2] + (best[2] - dir[2]) * k, nl = Math.hypot(nx, ny, nz);
  return [nx / nl, ny / nl, nz / nl];
}

/**
 * @returns {kind:'enemy'|'world'|'none', point:{x,y,z}, enemy?, part?, damage?, obstructed:boolean, tracerFrom, t}
 */
export function resolveShot({ world, enemies, camera, muzzle, weapon, spreadDeg, rng, assist = 0 }) {
  const cam = camera.reticleRay();
  let dir = perturb(cam.dx, cam.dy, cam.dz, spreadDeg, rng);
  dir = applyAssist(dir, { x: cam.ox, y: cam.oy, z: cam.oz }, enemies, world, assist);
  // 1) raio do retículo: ponto-alvo (inimigo ou cenário) dentro do alcance
  const range = weapon.range;
  const wHit = world.raycast(cam.ox, cam.oy, cam.oz, dir[0], dir[1], dir[2], range, 'bullet');
  const tWorld = wHit ? wHit.t : range;
  const eHit = rayEnemies(enemies, cam.ox, cam.oy, cam.oz, dir[0], dir[1], dir[2], tWorld);
  const tAim = eHit ? eHit.t : tWorld;
  const aim = { x: cam.ox + dir[0] * tAim, y: cam.oy + dir[1] * tAim, z: cam.oz + dir[2] * tAim };
  // 2) teste do cano: do cano até o ponto-alvo (paralaxe, cobertura rente)
  let mx = aim.x - muzzle.x, my = aim.y - muzzle.y, mz = aim.z - muzzle.z; const ml = Math.hypot(mx, my, mz) || 1;
  mx /= ml; my /= ml; mz /= ml;
  const tail = eHit ? 0 : 20;                      // sem inimigo, a bala segue além do ponto
  const maxT = Math.min(range, ml + tail);
  const bWorld = world.raycast(muzzle.x, muzzle.y, muzzle.z, mx, my, mz, maxT, 'bullet');
  const obstructed = !!bWorld && bWorld.t < ml - 0.15;
  const tb = bWorld ? bWorld.t : maxT;
  const bEnemy = rayEnemies(enemies, muzzle.x, muzzle.y, muzzle.z, mx, my, mz, tb);
  const from = { x: muzzle.x, y: muzzle.y, z: muzzle.z };
  if (bEnemy) {
    const t = bEnemy.t, mult = PART_MULT(weapon, bEnemy.part);
    return { kind: 'enemy', enemy: bEnemy.enemy, part: bEnemy.part, damage: Math.round(weapon.damage * mult), obstructed: false, tracerFrom: from, t, point: { x: muzzle.x + mx * t, y: muzzle.y + my * t, z: muzzle.z + mz * t }, aim };
  }
  if (bWorld) return { kind: 'world', obstructed, tracerFrom: from, t: tb, point: { x: muzzle.x + mx * tb, y: muzzle.y + my * tb, z: muzzle.z + mz * tb }, aim, collider: bWorld.collider };
  return { kind: 'none', obstructed: false, tracerFrom: from, t: maxT, point: { x: muzzle.x + mx * maxT, y: muzzle.y + my * maxT, z: muzzle.z + mz * maxT }, aim };
}

/** Estado do retículo (por quadro): 'clear' | 'enemy' | 'blocked' (cano obstruído por cobertura rente). */
export function reticleState({ world, enemies, camera, muzzle, weapon }) {
  const cam = camera.reticleRay();
  const wHit = world.raycast(cam.ox, cam.oy, cam.oz, cam.dx, cam.dy, cam.dz, weapon.range, 'bullet');
  const tw = wHit ? wHit.t : weapon.range;
  const eHit = rayEnemies(enemies, cam.ox, cam.oy, cam.oz, cam.dx, cam.dy, cam.dz, tw);
  const t = eHit ? eHit.t : tw;
  const ax = cam.ox + cam.dx * t, ay = cam.oy + cam.dy * t, az = cam.oz + cam.dz * t;
  const dx = ax - muzzle.x, dy = ay - muzzle.y, dz = az - muzzle.z, l = Math.hypot(dx, dy, dz) || 1;
  const h = world.raycast(muzzle.x, muzzle.y, muzzle.z, dx / l, dy / l, dz / l, l, 'bullet');
  const blocked = !!h && h.t < l - 0.15;
  return blocked ? 'blocked' : eHit ? 'enemy' : 'clear';
}
export { forwardVec };
