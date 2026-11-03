import * as THREE from 'three';
import { ParticlePool } from '../render/ParticlePool.js';
import { Decals } from '../render/Decals.js';
import { QUALITY } from '../core/Settings.js';
import { createRng } from '../core/rng.js';

/**
 * Efeitos visuais em pools: tracers (linhas), partículas (1 Points), decalques (1 InstancedMesh) e um clarão de cano com UMA PointLight
 * reaproveitada (adicionada uma vez; nunca criada/removida por tiro — mudar a contagem de luzes recompila todos os materiais).
 * Puramente visual: usa rng próprio (nunca o da simulação) e só LÊ resultados já calculados; nenhuma alocação por quadro.
 */
const FLASH_S = 0.06;
const FLASH_PEAK = { pistol: 22, shotgun: 38 };
const SHELL_DELAY = { pistol: 0, shotgun: 0.38 };
const N_TRACERS = 16;
const SURF_TINT = { wood: [0.45, 0.32, 0.2], concrete: [0.58, 0.58, 0.56], ground: [0.4, 0.34, 0.26] };
const UP = { x: 0, y: 1, z: 0 };
const _o = { dir: null, speed: 0, spread: 1, color: undefined, tint: null, life: undefined, size: undefined };   // opts reutilizável (sem alocação por chamada)
const _p = { x: 0, y: 0, z: 0 }, _n = { x: 0, y: 1, z: 0 }, _d = { x: 0, y: 0, z: 1 };
const o = (dir, speed, spread, extra) => { _o.dir = dir; _o.speed = speed; _o.spread = spread; _o.color = extra?.color; _o.tint = extra?.tint ?? null; _o.life = extra?.life; _o.size = extra?.size; return _o; };

/** Normal da face do colisor mais próxima do ponto de impacto (caixa/cilindro). Sem alocação: escreve em `out`. */
export function surfaceNormal(c, pt, out = _n) {
  out.x = 0; out.y = 1; out.z = 0;
  if (!c) return out;
  if (c.type === 'cyl') { const dx = pt.x - c.x, dz = pt.z - c.z, l = Math.hypot(dx, dz) || 1; out.x = dx / l; out.y = 0; out.z = dz / l; return out; }
  const dx0 = Math.abs(pt.x - c.x0), dx1 = Math.abs(pt.x - c.x1), dz0 = Math.abs(pt.z - c.z0), dz1 = Math.abs(pt.z - c.z1), dyt = Math.abs(pt.y - c.y1);
  const m = Math.min(dx0, dx1, dz0, dz1, dyt);
  out.x = out.y = out.z = 0;
  if (m === dyt) out.y = 1; else if (m === dx0) out.x = -1; else if (m === dx1) out.x = 1; else if (m === dz0) out.z = -1; else out.z = 1;
  return out;
}

export class FX {
  constructor(scene, quality = 'medium') {
    this.scene = scene; this.tracers = []; this._ti = 0;
    this.rng = createRng(0xf8f8);                 // aleatoriedade visual própria (fora da simulação)
    for (let i = 0; i < N_TRACERS; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 })); l.frustumCulled = false; l.visible = false; scene.add(l);
      this.tracers.push({ l, life: 0, max: 0.07 });
    }
    // clarão do cano: uma única luz, sempre na cena (intensidade 0 quando ocioso)
    this.light = new THREE.PointLight(0xffb868, 0, 9, 2); this.light.name = 'muzzleLight'; this.light.castShadow = false; this._flashT = 0; this._flashPeak = 0;
    this._pend = Array.from({ length: 4 }, () => ({ t: -1, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 }));   // casquinhas com atraso (ejeção da escopeta)
    this.quality = null; this.particles = null; this.decals = null; this.scale = 600;
    this.setQuality(quality);
  }

  /** (Re)cria os pools com as capacidades do preset; descarta os antigos sem vazar. */
  setQuality(qk) {
    const q = QUALITY[qk] ?? QUALITY.medium, key = QUALITY[qk] ? qk : 'medium';
    if (this.quality === key && this.particles && this.particles.capacity === q.particles && this.decals.capacity === q.decals) return;
    this.quality = key; this._build(q);
    // Baixo/Médio: sem PointLight (só Alto; cada luz extra custa por fragmento em todos os materiais: +7-9 % medido); a luz só entra/sai na troca de preset, nunca por tiro
    const want = key === 'high';
    if (want && !this.light.parent) this.scene.add(this.light); else if (!want && this.light.parent) { this.scene.remove(this.light); this.light.intensity = 0; this._flashT = 0; }
  }
  _build(q) {
    this.particles?.dispose(); this.decals?.dispose();
    this.particles = new ParticlePool({ capacity: q.particles, scene: this.scene, seed: 0x5eed });
    this.decals = new Decals({ capacity: q.decals, scene: this.scene, seed: 0xdeca1 });
    this.particles.setScale(this.scale);
  }
  /** Descarta e recria pools e decalques (troca de capítulo). */
  reset() { this._build(QUALITY[this.quality] ?? QUALITY.medium); this.clear(); }
  /** Zera tudo sem realocar (reinício de checkpoint). */
  clear() {
    this.particles.clear(); this.decals.clear(); this._flashT = 0; this.light.intensity = 0;
    for (const p of this._pend) p.t = -1;
    for (const t of this.tracers) { t.life = 0; t.l.visible = false; }
  }
  /** px por metro a 1 m de distância (altura do buffer / (2·tan(fov/2))): dimensiona os pontos. */
  setView(heightPx, fovDeg) { this.scale = heightPx / (2 * Math.tan(fovDeg * Math.PI / 360)); this.particles.setScale(this.scale); }
  dispose() {
    for (const t of this.tracers) { this.scene.remove(t.l); t.l.geometry.dispose(); t.l.material.dispose(); }
    this.scene.remove(this.light); this.particles.dispose(); this.decals.dispose();
  }

  // ---------------------------------------------------------------- API legada
  tracer(a, b, life = 0.07) {
    const t = this.tracers[this._ti++ % this.tracers.length], p = t.l.geometry.attributes.position;
    p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; t.l.visible = true; t.l.material.opacity = 0.9; t.life = life; t.max = life;
  }
  burst(pt, color, n = 6, speed = 3, life = 0.35) {
    for (let i = 0; i < n; i++) this.particles.spawn('burst', pt, o(null, speed, 1, { color, life: life * (0.6 + this.rng.next() * 0.6) }));
  }

  // ---------------------------------------------------------------- combate
  /** Clarão do cano: luz única + fagulhas/fumaça curtas na boca da arma. */
  muzzle(pos, dir, weaponId = 'pistol') {
    this.light.position.set(pos.x + dir.x * 0.3, pos.y, pos.z + dir.z * 0.3);
    this._flashPeak = FLASH_PEAK[weaponId] ?? FLASH_PEAK.pistol; this._flashT = FLASH_S; this.light.intensity = this._flashPeak;
    const sg = weaponId === 'shotgun';
    _p.x = pos.x + dir.x * 0.25; _p.y = pos.y + dir.y * 0.25; _p.z = pos.z + dir.z * 0.25;
    this.particles.spawn('muzzle', _p, o(dir, 0.6, 0.2, { size: sg ? 0.42 : 0.3 }));
    for (let i = 0; i < (sg ? 4 : 2); i++) this.particles.spawn('spark', _p, o(dir, sg ? 6 : 5, 0.45));
    this.particles.spawn('smoke', _p, o(dir, 0.8, 0.5));
    if (sg) { this.particles.spawn('smoke', _p, o(dir, 1.2, 0.6)); this.particles.spawn('smoke', _p, o(dir, 0.6, 0.6)); }
  }
  /** Impacto em superfície ('metal'|'concrete'|'wood'|'ground'): metal faísca, o resto levanta poeira/lascas. `normal` opcional (deixa furo). */
  impact(point, surface = 'ground', normal = null) {
    const nm = normal ?? UP, P = this.particles;
    if (surface === 'metal') {
      for (let i = 0; i < 6; i++) P.spawn('spark', point, o(nm, 5, 0.9));
      P.spawn('smoke', point, o(nm, 0.5, 0.4));
    } else if (surface === 'concrete') {
      for (let i = 0; i < 3; i++) P.spawn('dust', point, o(nm, 1.6, 0.8, { tint: SURF_TINT.concrete }));
      P.spawn('spark', point, o(nm, 3, 0.8));
    } else if (surface === 'wood') {
      for (let i = 0; i < 3; i++) P.spawn('dust', point, o(nm, 1.8, 0.9, { tint: SURF_TINT.wood }));
      P.spawn('shell', point, o(nm, 1.5, 0.9, { tint: SURF_TINT.wood, size: 0.03, life: 0.5 }));   // lasca
    } else {
      for (let i = 0; i < 3; i++) P.spawn('dust', point, o(nm, 1.4, 0.8, { tint: SURF_TINT.ground }));
    }
    if (normal && surface !== 'ground') this.decals.add('bullet', point, normal, 0.09 + this.rng.next() * 0.05);
  }
  /** Sangue: gotas + mancha no chão sob o ponto. */
  blood(point, dir = null) {
    for (let i = 0; i < 8; i++) this.particles.spawn('blood', point, o(dir, 3.2, 1));
    this.particles.spawn('smoke', point, o(null, 0.2, 0.3, { tint: [0.4, 0.05, 0.05], size: 0.1 }));
    _p.x = point.x + (this.rng.next() - 0.5) * 0.6; _p.y = 0.0; _p.z = point.z + (this.rng.next() - 0.5) * 0.6;
    this.decals.add('blood', _p, UP, 0.35 + this.rng.next() * 0.35);
  }
  /** Casquinha ejetada pela direita da arma (escopeta: após o ferrolho, com atraso). */
  shellEject(pos, dir, weaponId = 'pistol') {
    const delay = SHELL_DELAY[weaponId] ?? 0;
    if (delay > 0) { for (const p of this._pend) if (p.t < 0) { p.t = delay; p.x = pos.x; p.y = pos.y; p.z = pos.z; p.dx = dir.x; p.dy = dir.y; p.dz = dir.z; return; } return; }
    this._eject(pos.x, pos.y, pos.z, dir.x, dir.z);
  }
  _eject(x, y, z, dx, dz) {
    _p.x = x; _p.y = y; _p.z = z; _d.x = -dz * 1.0; _d.y = 0.9; _d.z = dx * 1.0;   // direita do cano e para cima
    this.particles.spawn('shell', _p, o(_d, 2.4, 0.35));
  }
  /** Anel de poeira (investida do K-1 contra a parede, queda do portão). */
  dustRing(pos, radius = 2.5) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832 + this.rng.next() * 0.3;
      _p.x = pos.x + Math.cos(a) * radius * 0.25; _p.y = 0.25; _p.z = pos.z + Math.sin(a) * radius * 0.25;
      _d.x = Math.cos(a); _d.y = 0.22; _d.z = Math.sin(a);
      this.particles.spawn('dust', _p, o(_d, radius * 0.9, 0.2, { size: 0.45 }));
    }
  }
  /** Queda do portão: faíscas ao longo da base + anel de poeira. */
  gateImpact(pos) {
    for (let i = 0; i < 16; i++) {
      _p.x = pos.x + (this.rng.next() - 0.5) * 5; _p.y = 0.12; _p.z = pos.z + (this.rng.next() - 0.5) * 1.2;
      this.particles.spawn('spark', _p, o(UP, 4.5, 1.2));
    }
    this.dustRing(pos, 3);
  }

  /**
   * Efeitos de um tiro já resolvido (`res` de resolveShot). Só LÊ: chamado depois do cálculo de jogo, não toca na simulação.
   * `surf` = { surfaceOf(collider, point) → 'metal'|'concrete'|'wood'|'ground', colliderAt(point) → collider|null } (opcional).
   */
  shotEffects(res, mz, weaponId, surf) {
    const from = res.tracerFrom ?? mz, tgt = res.kind === 'spread' ? (res.tracers[0]?.point ?? from) : res.point;
    let dx = tgt.x - mz.x, dy = tgt.y - mz.y, dz = tgt.z - mz.z; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    _d.x = dx; _d.y = dy; _d.z = dz;
    const dir = { x: dx, y: dy, z: dz };   // um objeto pequeno por TIRO (não por quadro)
    this.muzzle(mz, dir, weaponId);
    this.shellEject(mz, dir, weaponId);
    if (res.kind === 'spread') {
      for (const t of res.tracers) this.tracer(t.from, t.point, 0.13);
      for (const pt of res.impacts) this._worldHit(pt, null, surf);
      for (const h of res.hits) this.blood(h.point, null);
      return;
    }
    this.tracer(res.tracerFrom, res.point);
    if (res.kind === 'enemy') this.blood(res.point, null);
    else if (res.kind === 'world') this._worldHit(res.point, res.collider ?? null, surf);
  }
  _worldHit(pt, collider, surf) {
    const c = collider ?? surf?.colliderAt?.(pt) ?? null, sf = surf ? surf.surfaceOf(c, pt) : 'ground';
    if (pt.y <= 0.06) { this.impact(pt, 'ground', null); return; }   // acertou o chão: só poeira
    const n = c ? surfaceNormal(c, pt) : UP;
    this.impact(pt, sf, c ? n : null);
  }

  update(dt) {
    for (const t of this.tracers) if (t.life > 0) { t.life -= dt; t.l.material.opacity = Math.max(0, t.life / t.max) * 0.9; if (t.life <= 0) t.l.visible = false; }
    if (this._flashT > 0) { this._flashT -= dt; this.light.intensity = this._flashT > 0 ? this._flashPeak * (this._flashT / FLASH_S) : 0; }
    for (const p of this._pend) if (p.t >= 0) { p.t -= dt; if (p.t < 0) { this._eject(p.x, p.y, p.z, p.dx, p.dz); p.t = -1; } }
    this.particles.update(dt); this.decals.update(dt);
  }
}
