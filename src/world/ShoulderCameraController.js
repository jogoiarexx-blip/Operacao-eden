import { clamp, damp, DEG, lerp } from '../core/math.js';

/**
 * Câmera permanente sobre o ombro (GDD 4.1–4.3, 9.6). Matemática pura (sem THREE), testável.
 * Ordem: input → orientação → pivô → colisão (spherecast) → suavização → retículo.
 * Convenção: yaw 0 olha para -Z; yaw cresce no sentido anti-horário visto de cima.
 * Direção frente = (-sin yaw·cos pitch, sin pitch, -cos yaw·cos pitch); direita = (cos yaw, 0, -sin yaw) ⇒ D/→ sempre à direita da tela.
 */
export const CAMERA_PRESETS = {
  explore: { fov: 68, dist: 3.1, offset: 0.55, pivotH: 1.52, minDist: 0.55, pitch: [-60, 65], tau: 0.1 },
  ads: { fov: 57, dist: 2.05, offset: 0.42, pivotH: 1.56, minDist: 0.45, pitch: [-50, 55], tau: 0.08 },
};

export function forwardVec(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}
export const rightVec = (yaw) => ({ x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) });

/** Zona de câmera ativa em (x,z): retângulo `rect:[x0,z0,x1,z1]` e/ou círculo da zona de capítulo referenciada por `zone`. */
export function zoneAtPoint(cameraZones, zones, x, z) {
  for (const cz of cameraZones ?? []) {
    if (cz.rect && x >= cz.rect[0] && x <= cz.rect[2] && z >= cz.rect[1] && z <= cz.rect[3]) return cz;
    if (cz.zone) { const q = (zones ?? []).find((y) => y.id === cz.zone); if (q && Math.hypot(x - q.pos[0], z - q.pos[1]) <= q.r) return cz; }
  }
  return null;
}
export const SIDE_WALL_M = 0.6;           // parede mais perto que isso do lado do ombro → troca de lado temporariamente

export class ShoulderCameraController {
  constructor(world, opts = {}) {
    this.world = world;
    this.yaw = 0; this.pitch = 0.08;
    this.sensitivityX = 1; this.sensitivityY = 1; this.invertY = false;
    this.preferredSide = opts.side ?? 'right';
    this.sideCur = this.preferredSide === 'right' ? 1 : -1;
    this.aimT = 0;
    this.dist = CAMERA_PRESETS.explore.dist;
    this.lateral = CAMERA_PRESETS.explore.offset;
    this.collisionRadius = 0.22;
    this.fovOffset = 0;                // ajuste do jogador (graus), faixa segura ±12
    this.shakeScale = 1;               // acessibilidade (0 = sem tremor)
    this.recoil = 0; this.shakeAmt = 0; this._shakeT = 0;
    this.turnLeft = 0;                 // meia-volta em andamento (rad restantes)
    this.pivot = { x: 0, y: 1.5, z: 0 };
    this.pos = { x: 0, y: 1.5, z: 3 };
    this.fov = CAMERA_PRESETS.explore.fov;
    this.playerOpacity = 1;
    this.blocked = false;
    this.cinematic = false;
    this.aspect = 16 / 9;
    this.cameraZones = []; this.zoneDefs = [];
    this.zoneExplore = CAMERA_PRESETS.explore.dist; this.zoneAim = CAMERA_PRESETS.ads.dist;   // distâncias interpoladas da zona ativa
    this.activeZone = null;
    this.autoFlip = false; this._clearT = 0;                                                  // troca temporária de ombro por parede
  }
  setZones(cameraZones, zones = []) { this.cameraZones = cameraZones ?? []; this.zoneDefs = zones; this.activeZone = null; }
  get side() { return this.sideCur >= 0 ? 'right' : 'left'; }
  swapShoulder() { this.preferredSide = this.preferredSide === 'right' ? 'left' : 'right'; }
  startTurn180() { if (Math.abs(this.turnLeft) < 0.01) this.turnLeft = Math.PI; }
  snapBehind(playerYaw, pitch = 0.1) { this.yaw = playerYaw; this.pitch = pitch; this.dist = CAMERA_PRESETS.explore.minDist; this.turnLeft = 0; }
  kick(deg) { this.recoil = Math.min(0.06, this.recoil + deg * DEG * this.shakeScale * 0.35); }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a * this.shakeScale); }
  get pitchEff() { return this.pitch + this.recoil; }

  /** @param input {lookX, lookY (radianos já escalados), aim:boolean}  @param target posição de base do jogador (pés) */
  update(dt, input, target) {
    const P0 = CAMERA_PRESETS.explore, P1 = CAMERA_PRESETS.ads;
    // 1) orientação
    this.yaw -= input.lookX * this.sensitivityX;
    const ySign = this.invertY ? 1 : -1;
    this.pitch += ySign * input.lookY * this.sensitivityY;
    if (this.turnLeft !== 0) { const step = Math.sign(this.turnLeft) * Math.min(Math.abs(this.turnLeft), Math.PI * dt / 0.2); this.yaw += step; this.turnLeft -= step; if (Math.abs(this.turnLeft) < 1e-3) this.turnLeft = 0; }
    const aimK = this.aimT;
    const pmin = lerp(P0.pitch[0], P1.pitch[0], aimK) * DEG, pmax = lerp(P0.pitch[1], P1.pitch[1], aimK) * DEG;
    this.pitch = clamp(this.pitch, pmin, pmax);
    this.recoil *= 1 - damp(dt, 0.12);
    // 2) preset mesclado (mirar)
    this.aimT += ((input.aim ? 1 : 0) - this.aimT) * damp(dt, 0.07);
    const k = this.aimT;
    const zone = this.cameraZones.length ? zoneAtPoint(this.cameraZones, this.zoneDefs, target.x, target.z) : null;
    this.activeZone = zone;
    const za = damp(dt, 0.15);
    this.zoneExplore += ((zone?.exploreDistance ?? P0.dist) - this.zoneExplore) * za;
    this.zoneAim += ((zone?.aimDistance ?? P1.dist) - this.zoneAim) * za;
    const dist = lerp(this.zoneExplore, this.zoneAim, k), offset = lerp(P0.offset, P1.offset, k), pivotH = lerp(P0.pivotH, P1.pivotH, k);
    this.fov = lerp(P0.fov, P1.fov, k) + this.fovOffset;
    // 3) ombro (interpolado)
    const prefSign = this.preferredSide === 'right' ? 1 : -1;
    this._autoFlip(dt, prefSign);
    const sideTarget = this.autoFlip ? -prefSign : prefSign;
    this.sideCur += (sideTarget - this.sideCur) * damp(dt, 0.09);
    // 4) pivô suavizado
    const wantPivot = { x: target.x, y: target.y + pivotH, z: target.z };
    const pa = damp(dt, 0.045);
    this.pivot.x += (wantPivot.x - this.pivot.x) * pa; this.pivot.y += (wantPivot.y - this.pivot.y) * pa; this.pivot.z += (wantPivot.z - this.pivot.z) * pa;
    // 5) deslocamento lateral com folga (corredor estreito: reduz offset, favorece o centro)
    const r = rightVec(this.yaw), wantLat = offset * this.sideCur;
    let lat = wantLat;
    if (Math.abs(wantLat) > 1e-3) {
      const s = Math.sign(wantLat), need = Math.abs(wantLat) + this.collisionRadius;
      const h = this.world.raycast(this.pivot.x, this.pivot.y, this.pivot.z, r.x * s, 0, r.z * s, need, 'camera', 0.05);
      if (h) lat = s * Math.max(0, h.t - this.collisionRadius);
    }
    this.lateral += (lat - this.lateral) * (Math.abs(lat) < Math.abs(this.lateral) ? 1 : damp(dt, 0.08));
    const ax = this.pivot.x + r.x * this.lateral, ay = this.pivot.y, az = this.pivot.z + r.z * this.lateral;
    // 6) boom com colisão: aproxima na hora, afasta suavemente (nunca atravessa)
    const d = forwardVec(this.yaw, this.pitchEff);
    const sweep = this.world.sweepCamera(ax, ay, az, -d.x, -d.y, -d.z, dist + 0.05, this.collisionRadius);
    // prioridade absoluta: nunca atravessar geometria (a distância mínima de 0,55 m só vale quando há espaço)
    const allowed = sweep.hit ? Math.max(0.12, sweep.t - 0.04) : dist;
    this.blocked = sweep.hit;
    if (allowed < this.dist) this.dist = allowed;
    else this.dist += (allowed - this.dist) * damp(dt, lerp(P0.tau, P1.tau, k) + 0.04);
    // 7) tremor opcional
    this._shakeT += dt * 60; this.shakeAmt *= 1 - damp(dt, 0.18);
    const sx = Math.sin(this._shakeT * 1.7) * this.shakeAmt * 0.03, sy = Math.cos(this._shakeT * 2.3) * this.shakeAmt * 0.03;
    this.pos.x = ax - d.x * this.dist + r.x * sx; this.pos.y = ay - d.y * this.dist + sy; this.pos.z = az - d.z * this.dist + r.z * sx;
    this.playerOpacity = clamp((this.dist - 0.55) / 0.5, 0.0, 1);       // some o avatar quando a câmera encosta
  }

  /** Parede a <0,6 m do lado do ombro (e o outro lado livre) → troca de lado; volta após 0,3 s com o lado preferido livre a 0,9 m. */
  _autoFlip(dt, prefSign) {
    const r = rightVec(this.yaw), px = this.pivot.x, py = this.pivot.y, pz = this.pivot.z;
    const hit = (s, d) => !!this.world.raycast(px, py, pz, r.x * s, 0, r.z * s, d, 'camera', 0.05);
    if (!this.autoFlip) {
      if (hit(prefSign, SIDE_WALL_M) && !hit(-prefSign, SIDE_WALL_M)) { this.autoFlip = true; this._clearT = 0; }
    } else if (hit(prefSign, SIDE_WALL_M + 0.3)) this._clearT = 0;
    else { this._clearT += dt; if (this._clearT >= 0.3) this.autoFlip = false; }
  }

  /** Raio do retículo = centro da projeção. */
  reticleRay() { const d = forwardVec(this.yaw, this.pitchEff); return { ox: this.pos.x, oy: this.pos.y, oz: this.pos.z, dx: d.x, dy: d.y, dz: d.z }; }

  writeTo(camera) {
    camera.position.set(this.pos.x, this.pos.y, this.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.pitchEff, this.yaw, 0);
    if (Math.abs(camera.fov - this.fov) > 0.01) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
  }
}
