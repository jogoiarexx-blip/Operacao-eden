import * as THREE from 'three';
import { createRng } from '../core/rng.js';

/**
 * Decalques (furos de bala, manchas de sangue) em um único InstancedMesh (1 draw call). Capacidade fixa, tudo pré-alocado;
 * ao lotar recicla o mais antigo. Somem em 20 s (fade nos últimos 6 s). Só visual: rng próprio.
 */
export const DECAL_LIFE = 20, DECAL_FADE = 6;
const KINDS = { bullet: [0.03, 0.03, 0.03, 0.9], blood: [0.38, 0.03, 0.03, 0.85], scorch: [0.02, 0.02, 0.02, 0.6] };

const VERT = /* glsl */`
attribute vec4 aColor; varying vec4 vColor; varying vec2 vUv;
void main() { vColor = aColor; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */`
varying vec4 vColor; varying vec2 vUv;
void main() { vec2 p = vUv - 0.5; float d = length(p) * 2.0; float ang = atan(p.y, p.x); d *= 1.0 + 0.22 * sin(ang * 5.0 + vColor.r * 40.0) + 0.1 * sin(ang * 9.0);
  float a = vColor.a * smoothstep(1.0, 0.55, d); if (a < 0.01) discard; gl_FragColor = vec4(vColor.rgb, a); }`;

export class Decals {
  constructor({ capacity = 40, scene = null, seed = 0xdeca1 } = {}) {
    const n = this.capacity = Math.max(1, capacity | 0);
    this.rng = createRng(seed);
    this.age = new Float32Array(n).fill(-1); this.base = new Float32Array(n * 4); this.colArr = new Float32Array(n * 4);
    this.head = 0; this._count = 0; this._dirty = false;
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(this.colArr, 4).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = this.mesh = new THREE.InstancedMesh(this.geometry, this.material, n);
    m.count = 0; m.frustumCulled = false; m.visible = false; m.name = 'decals'; m.renderOrder = 2;
    this.scene = scene; scene?.add(m);
  }
  get count() { return this._count; }
  /** `pos` ponto na superfície, `normal` normal unitária da superfície, `size` diâmetro (m). */
  add(kind, pos, normal, size = 0.2) {
    const k = KINDS[kind] ?? KINDS.bullet, i = this.head; this.head = (this.head + 1) % this.capacity;
    if (this.age[i] < 0) this._count++;                 // slot vazio vira ocupado; ocupado é reciclado (contagem estável)
    this.age[i] = 0;
    const r = this.rng, b = i * 4, nx = normal.x, ny = normal.y, nz = normal.z;
    // base ortonormal (t, bt, n); rotação aleatória em torno da normal; plano do three olha +z → coluna z = normal
    let tx, ty, tz;
    if (Math.abs(ny) > 0.9) { tx = 1; ty = 0; tz = 0; } else { tx = -nz; ty = 0; tz = nx; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; }
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    const th = r.next() * 6.2832, c = Math.cos(th) * size, s = Math.sin(th) * size, off = 0.012;
    const e = this.mesh.instanceMatrix.array, o = i * 16;
    e[o] = tx * c + bx * s; e[o + 1] = ty * c + by * s; e[o + 2] = tz * c + bz * s; e[o + 3] = 0;
    e[o + 4] = -tx * s + bx * c; e[o + 5] = -ty * s + by * c; e[o + 6] = -tz * s + bz * c; e[o + 7] = 0;
    e[o + 8] = nx; e[o + 9] = ny; e[o + 10] = nz; e[o + 11] = 0;
    e[o + 12] = pos.x + nx * off; e[o + 13] = pos.y + ny * off; e[o + 14] = pos.z + nz * off; e[o + 15] = 1;
    const v = 0.85 + r.next() * 0.3;
    this.base[b] = k[0] * v; this.base[b + 1] = k[1] * v; this.base[b + 2] = k[2] * v; this.base[b + 3] = k[3];
    this.colArr[b] = this.base[b]; this.colArr[b + 1] = this.base[b + 1]; this.colArr[b + 2] = this.base[b + 2]; this.colArr[b + 3] = k[3];
    this.mesh.count = Math.max(this.mesh.count, i + 1); this.mesh.visible = true; this._dirty = true;
    this.mesh.instanceMatrix.needsUpdate = true; this.geometry.attributes.aColor.needsUpdate = true;
  }
  update(dt) {
    if (this._count === 0 && !this._dirty) return;
    let live = 0;
    for (let i = 0; i < this.mesh.count; i++) {
      if (this.age[i] < 0) continue;
      const a = this.age[i] += dt;
      if (a >= DECAL_LIFE) { this.age[i] = -1; this.colArr[i * 4 + 3] = 0; continue; }
      live++;
      if (a > DECAL_LIFE - DECAL_FADE) this.colArr[i * 4 + 3] = this.base[i * 4 + 3] * (DECAL_LIFE - a) / DECAL_FADE;
    }
    this._count = live; this.geometry.attributes.aColor.needsUpdate = true;
    if (live === 0) { this.mesh.visible = false; this.mesh.count = 0; this._dirty = false; this.head = 0; }
  }
  clear() { this.age.fill(-1); this.colArr.fill(0); this._count = 0; this.head = 0; this.mesh.count = 0; this.mesh.visible = false; this._dirty = false; }
  dispose() { this.scene?.remove(this.mesh); this.mesh.dispose(); this.geometry.dispose(); this.material.dispose(); }
}
