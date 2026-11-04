import * as THREE from 'three';
import { createRng } from '../core/rng.js';

/**
 * Pool de partículas em um único THREE.Points (1 draw call). Tudo é pré-alocado no construtor (typed arrays + geometria + material):
 * `spawn` e `update` não alocam. Ao lotar, recicla a mais antiga (anel). Só visual: rng próprio, nunca o da simulação.
 */
export const PARTICLE_TYPES = ['smoke', 'spark', 'dust', 'blood', 'shell', 'muzzle', 'burst'];
// vida [min,max] s · velocidade · componente vertical · gravidade (m/s², negativo sobe) · arrasto · tamanho inicial→final (m) · cor rgb · alfa
const CFG = {
  smoke:  { life: [0.6, 1.0], speed: 0.5, up: 0.6, grav: -0.5, drag: 1.5, s0: 0.12, s1: 0.5,  c: [0.62, 0.62, 0.6],  a: 0.32 },
  spark:  { life: [0.18, 0.34], speed: 4.5, up: 0.5, grav: 9, drag: 0.4, s0: 0.09, s1: 0.025,  c: [1.0, 0.78, 0.38],  a: 1 },
  dust:   { life: [0.5, 0.9], speed: 1.3, up: 0.9, grav: 0.6, drag: 2.2, s0: 0.2, s1: 0.8,  c: [0.55, 0.51, 0.43],  a: 0.45 },
  blood:  { life: [0.3, 0.55], speed: 3.2, up: 0.7, grav: 9.5, drag: 0.6, s0: 0.1, s1: 0.05, c: [0.62, 0.05, 0.05], a: 0.95 },
  shell:  { life: [1.0, 1.2], speed: 2.6, up: 0.8, grav: 10, drag: 0.2, s0: 0.05, s1: 0.05,  c: [0.92, 0.72, 0.3],  a: 1 },
  muzzle: { life: [0.05, 0.08], speed: 1.5, up: 0.2, grav: 0, drag: 3, s0: 0.28, s1: 0.06,  c: [1.0, 0.86, 0.5],   a: 1 },
  burst:  { life: [0.2, 0.35], speed: 3, up: 0.7, grav: 9, drag: 0.5, s0: 0.06, s1: 0.03,   c: [1, 1, 1],            a: 1 },
};
// Cores configuradas em sRGB; os shaders trabalham em linear (tone mapping + sRGB aplicados por #include). Convertido uma vez, aqui.
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
for (const k in CFG) CFG[k].c = CFG[k].c.map(s2l);
const TYPE_ID = Object.fromEntries(PARTICLE_TYPES.map((t, i) => [t, i]));

const VERT = /* glsl */`
attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vColor;
void main() { vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(0.0, aSize * uScale / max(0.1, -mv.z)); }`;
const FRAG = /* glsl */`
varying vec4 vColor;
void main() { vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; float a = vColor.a * smoothstep(1.0, 0.45, d); if (a < 0.01) discard; gl_FragColor = vec4(vColor.rgb, a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

export class ParticlePool {
  constructor({ capacity = 100, scene = null, seed = 0x5eed } = {}) {
    const n = this.capacity = Math.max(1, capacity | 0);
    this.rng = createRng(seed);
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.maxLife = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.grav = new Float32Array(n); this.drag = new Float32Array(n);
    this.type = new Uint8Array(n); this.base = new Float32Array(n * 4);
    this.head = 0; this._dirty = false;
    const g = this.geometry = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false, toneMapped: true });
    this.points = new THREE.Points(g, this.material); this.points.frustumCulled = false; this.points.visible = false; this.points.name = 'particles';
    this.points.renderOrder = 5;
    this.scene = scene; scene?.add(this.points);
  }
  get alive() { let c = 0; for (let i = 0; i < this.capacity; i++) if (this.life[i] > 0) c++; return c; }
  /** Escala px/m para o tamanho dos pontos (altura do buffer / (2·tan(fov/2))). */
  setScale(v) { this.material.uniforms.uScale.value = v; }
  countByType(t) { const id = TYPE_ID[t]; let c = 0; for (let i = 0; i < this.capacity; i++) if (this.life[i] > 0 && this.type[i] === id) c++; return c; }

  /**
   * Emite UMA partícula. opts (opcional, reutilizável): dir{x,y,z} direção base, speed, spread (0..1 aleatoriedade), life, color (hex), tint [r,g,b], size.
   */
  spawn(type, pos, opts) {
    const cfg = CFG[type]; if (!cfg) return;
    const i = this.head; this.head = (this.head + 1) % this.capacity;
    const r = this.rng, sp = (opts?.speed ?? cfg.speed) * (0.55 + r.next() * 0.6), spread = opts?.spread ?? 1, d = opts?.dir;
    const j = i * 3;
    this.pos[j] = pos.x; this.pos[j + 1] = pos.y; this.pos[j + 2] = pos.z;
    let vx = (r.next() - 0.5) * spread, vy = r.next() * cfg.up * spread, vz = (r.next() - 0.5) * spread;
    if (d) { vx += d.x; vy += d.y; vz += d.z; } else if (!(spread > 0)) { vx = vy = vz = 0; }
    this.vel[j] = vx * sp; this.vel[j + 1] = vy * sp; this.vel[j + 2] = vz * sp;
    const L = opts?.life ?? (cfg.life[0] + (cfg.life[1] - cfg.life[0]) * r.next());
    this.life[i] = L; this.maxLife[i] = L; this.type[i] = TYPE_ID[type];
    this.s0[i] = opts?.size ?? cfg.s0; this.s1[i] = (opts?.size ?? cfg.s0) * (cfg.s1 / cfg.s0);
    this.grav[i] = cfg.grav; this.drag[i] = cfg.drag;
    let cr = cfg.c[0], cg = cfg.c[1], cb = cfg.c[2];
    if (opts?.color !== undefined) { cr = s2l(((opts.color >> 16) & 255) / 255); cg = s2l(((opts.color >> 8) & 255) / 255); cb = s2l((opts.color & 255) / 255); }
    else if (opts?.tint) { cr = s2l(opts.tint[0]); cg = s2l(opts.tint[1]); cb = s2l(opts.tint[2]); }
    const v = 0.85 + r.next() * 0.3, b = i * 4;
    this.base[b] = Math.min(1, cr * v); this.base[b + 1] = Math.min(1, cg * v); this.base[b + 2] = Math.min(1, cb * v); this.base[b + 3] = cfg.a;
    this.col[b] = this.base[b]; this.col[b + 1] = this.base[b + 1]; this.col[b + 2] = this.base[b + 2]; this.col[b + 3] = cfg.a;
    this.size[i] = this.s0[i]; this._dirty = true; this.points.visible = true;
  }

  update(dt) {
    if (!this._dirty) return;
    dt = Math.min(dt, 0.1); let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      const L = this.life[i] -= dt;
      if (L <= 0) { this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      alive++;
      const j = i * 3, k = 1 - Math.min(0.95, this.drag[i] * dt);
      this.vel[j] *= k; this.vel[j + 2] *= k; this.vel[j + 1] = this.vel[j + 1] * k - this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.02 && this.grav[i] > 1) { this.pos[j + 1] = 0.02; this.vel[j] *= 0.5; this.vel[j + 2] *= 0.5; this.vel[j + 1] = this.type[i] === TYPE_ID.shell ? Math.abs(this.vel[j + 1]) * 0.3 : 0; }   // chão: casquinhas quicam, o resto assenta
      const u = 1 - L / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * u;
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * (1 - u * u);
    }
        this.geometry.attributes.position.needsUpdate = true; this.geometry.attributes.aColor.needsUpdate = true; this.geometry.attributes.aSize.needsUpdate = true;
    if (alive === 0) { this.points.visible = false; this._dirty = false; }
  }
  /** Mata todas sem realocar. */
  clear() { this.life.fill(0); this.size.fill(0); this.col.fill(0); this._dirty = false; this.points.visible = false; this.geometry.attributes.aSize.needsUpdate = true; this.geometry.attributes.aColor.needsUpdate = true; }
  dispose() { this.scene?.remove(this.points); this.geometry.dispose(); this.material.dispose(); }
}
