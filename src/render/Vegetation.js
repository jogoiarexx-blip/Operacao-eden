import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRng } from '../core/rng.js';
import { QUALITY } from '../core/Settings.js';
import { getMaterial } from './Materials.js';

/**
 * Etapa 3 — cenário: máscara de trilhas, variantes de árvore e vegetação rasteira (capim, samambaias, pedras, troncos caídos).
 * Tudo é procedural e decorativo: NADA aqui entra em colisores/LOS/navegação. Usa sempre rngs próprios (nunca o da simulação/IA).
 * Geometrias e clones de material são criados por capítulo e liberados em dispose(); materiais de getMaterial (compartilhados) nunca são
 * alterados nem descartados aqui — o vento roda em CLONES (onBeforeCompile + customProgramCacheKey).
 */

// ---------------------------------------------------------------- utilitários
const hash2 = (x, z, s) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, z, s) {
  const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0, s), b = hash2(x0 + 1, z0, s), c = hash2(x0, z0 + 1, s), d = hash2(x0 + 1, z0 + 1, s);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const qKey = (q) => (typeof q === 'string' && QUALITY[q] ? q : 'medium');

// ---------------------------------------------------------------- máscara das trilhas (por capítulo)
/** Rasteriza data.paths numa grade RGBA cobrindo o plano do chão (gW×gD centrado nos bounds). Linha 0 = z mínimo.
 *  R = cobertura da trilha (borda irregular), G = miolo (trilha mais batida/escura). Puro e determinístico (testável sem canvas). */
export function buildPathMask(data, size = 512) {
  const [bx0, bz0, bx1, bz1] = data.bounds, gW = bx1 - bx0 + 20, gD = bz1 - bz0 + 20, cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
  const W = size, H = size, out = new Uint8Array(W * H * 4), sx = gW / W, sz = gD / H, gx0 = cx - gW / 2, gz0 = cz - gD / 2;
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  for (const p of data.paths) for (let k = 0; k < p.pts.length - 1; k++) {
    const [ax, az] = p.pts[k], [bx, bz] = p.pts[k + 1], pad = p.w / 2 + 1;
    const u0 = Math.max(0, Math.floor((Math.min(ax, bx) - pad - gx0) / sx)), u1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx) + pad - gx0) / sx));
    const v0 = Math.max(0, Math.floor((Math.min(az, bz) - pad - gz0) / sz)), v1 = Math.min(H - 1, Math.ceil((Math.max(az, bz) + pad - gz0) / sz));
    for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) {
      const x = gx0 + (u + 0.5) * sx, z = gz0 + (v + 0.5) * sz, d = distToPolyline(x, z, [[ax, az], [bx, bz]]);
      const n = (vnoise(x * 0.9, z * 0.9, 11) - 0.5) * 0.7 + (vnoise(x * 3.1, z * 3.1, 12) - 0.5) * 0.25, hw = p.w / 2;
      const cover = 1 - sstep(hw - 0.3 + n, hw + 0.5 + n, d), core = 1 - sstep(0, hw * 0.75, d);
      const i = (v * W + u) * 4;
      out[i] = Math.max(out[i], Math.round(cover * 255)); out[i + 1] = Math.max(out[i + 1], Math.round(core * cover * 255));
    }
  }
  return { data: out, width: W, height: H };
}
export function createPathMaskTexture(data, size = 512) {
  const m = buildPathMask(data, size), t = new THREE.DataTexture(m.data, m.width, m.height, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- vento (só em clones de material)
function applyWind(mat, uniforms, kind, amp) {
  mat.userData = { ...mat.userData, shared: false };           // clone() copia userData.shared=true: este clone é NOSSO e deve ser descartado
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uAmp = { value: amp };
    sh.vertexShader = 'uniform float uTime;\nuniform float uAmp;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 vip = instanceMatrix[3].xyz;
#else
  vec3 vip = vec3(0.0);
#endif
  float vh = max(position.y, 0.0);
  float vsw = sin(uTime * 1.7 + vip.x * 0.37 + vip.z * 0.29) * 0.6 + sin(uTime * 3.1 + vip.x * 1.3 + vip.z * 0.7) * 0.25;
  float vgust = (sin(uTime * 0.55 + vip.x * 0.06 + vip.z * 0.04) * 0.5 + 0.5) * 0.7;
  transformed.x += (vsw + vgust) * uAmp * vh * vh;
  transformed.z += (vsw * 0.6 + vgust * 0.4) * uAmp * vh * vh;`);
  };
  mat.customProgramCacheKey = () => 'eden-veg-wind-' + kind;
  return mat;
}
function cloneForVeg(role, quality, color, extra = {}) {
  const m = getMaterial(role, 'low').clone();                  // clone Lambert (barato p/ muitas lâminas finas) do material em cache, que continua intocado
  m.map = null; m.vertexColors = true; m.color.set(color); m.side = THREE.DoubleSide; Object.assign(m, extra); m.needsUpdate = true;
  return m;
}

// ---------------------------------------------------------------- geometrias
/** Monta BufferGeometry não indexada a partir de triângulos [[x,y,z]×3] com cor de vértice por altura (base → ponta). */
function trisGeo(tris, baseCol, tipCol, maxY) {
  const pos = new Float32Array(tris.length * 9), col = new Float32Array(tris.length * 9), c = new THREE.Color();
  tris.forEach((t, i) => t.forEach((p, j) => {
    const o = i * 9 + j * 3; pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = p[2];
    c.copy(baseCol).lerp(tipCol, Math.max(0, Math.min(1, p[1] / maxY))); col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
  }));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals(); return g;
}
function grassGeo(seed) {
  const r = createRng(seed), tris = [], n = 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.3, 0.3), d = r.range(0.02, 0.1), h = r.range(0.22, 0.4), w = r.range(0.03, 0.05), lean = r.range(0.04, 0.14);
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    tris.push([[bx - px, 0, bz - pz], [bx + px, 0, bz + pz], [bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean]]);
  }
  return trisGeo(tris, new THREE.Color(0x13201a), new THREE.Color(0x44683a), 0.4);
}
function fernGeo(seed) {
  const r = createRng(seed), tris = [], n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.15, 0.15), L = r.range(0.55, 0.85), w = 0.13, dx = Math.cos(a), dz = Math.sin(a), px = -dz * w, pz = dx * w;
    const mid = [dx * L * 0.55, 0.3, dz * L * 0.55], tip = [dx * L, 0.14, dz * L];
    tris.push([[0, 0.04, 0], [mid[0] - px, mid[1], mid[2] - pz], [mid[0] + px, mid[1], mid[2] + pz]], [[mid[0] - px, mid[1], mid[2] - pz], tip, [mid[0] + px, mid[1], mid[2] + pz]]);
  }
  return trisGeo(tris, new THREE.Color(0x182a1a), new THREE.Color(0x3f6a37), 0.34);
}
function rockGeo(seed) {
  const g = new THREE.IcosahedronGeometry(0.5, 0), r = createRng(seed), pa = g.attributes.position, map = new Map();
  for (let i = 0; i < pa.count; i++) {                          // vértices coincidentes recebem o mesmo desvio (sem rachaduras)
    const k = `${pa.getX(i).toFixed(3)},${pa.getY(i).toFixed(3)},${pa.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, [r.range(0.8, 1.2), r.range(0.75, 1.1), r.range(0.8, 1.2)]);
    const s = map.get(k); pa.setXYZ(i, pa.getX(i) * s[0], pa.getY(i) * s[1], pa.getZ(i) * s[2]);
  }
  g.computeVertexNormals(); return g;
}
const logGeo = () => new THREE.CylinderGeometry(0.17, 0.21, 1, 6).rotateZ(Math.PI / 2);

// ---------------------------------------------------------------- espalhamento
const CULL_DIST = 30;   // m: além disso o bloco some (a névoa esconde a borda)
const MAX = { grass: 3000, ferns: 180, rocks: 70, logs: 14 };
/**
 * Vegetação rasteira decorativa. Densidade: grass × QUALITY.grass; ferns/rocks/logs × QUALITY.foliage.
 * Posições vêm de rngs derivados do `rng` recebido (4 sorteios fixos no início) e NÃO dependem da qualidade (alto ⊃ médio ⊃ baixo);
 * a qualidade só define quantas instâncias são usadas. Nada sobre trilhas, estruturas, clareiras (pedras/troncos) nem troncos de árvores.
 */
export function scatterVegetation({ data, quality = 'medium', rng, trees = [] }) {
  const qk = qKey(quality), qc = QUALITY[qk], base = rng ?? createRng(((data.treeSeed ?? 1) ^ 0x5eed5eed) >>> 0);
  const seeds = ['grass', 'ferns', 'rocks', 'logs', 'geo'].map(() => Math.floor(base.next() * 4294967296) >>> 0);
  const [bx0, bz0, bx1, bz1] = data.bounds, maxZ = data.treeMaxZ ?? 33;
  const boxes = data.structures.filter((s) => s.kind === 'box'), cyls = data.structures.filter((s) => s.kind !== 'box');
  const blocked = (x, z, pathPad, structPad) => {
    if (z > maxZ || x < bx0 + 1 || x > bx1 - 1 || z < bz0 + 1) return true;
    for (const p of data.paths) if (distToPolyline(x, z, p.pts) < Math.max(1.25, p.w / 2 + pathPad)) return true;
    for (const s of boxes) if (Math.abs(x - s.pos[0]) < s.size[0] / 2 + structPad && Math.abs(z - s.pos[1]) < s.size[2] / 2 + structPad) return true;
    for (const s of cyls) if (Math.hypot(x - s.pos[0], z - s.pos[1]) < s.r + structPad) return true;
    return false;
  };
  const nearTree = (x, z, pad) => trees.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + pad);
  const inClearing = (x, z) => data.clearings.some((c) => Math.hypot(x - c.pos[0], z - c.pos[1]) < c.r);

  const gen = (kind, ok, place) => {
    const r = createRng(seeds[['grass', 'ferns', 'rocks', 'logs'].indexOf(kind)]), out = [];
    for (let a = 0; a < MAX[kind] * 14 && out.length < MAX[kind]; a++) {
      const x = r.range(bx0 + 1, bx1 - 1), z = r.range(bz0 + 1, bz1 - 1), t = r.next(), t2 = r.next(), t3 = r.next(), t4 = r.next();
      if (ok(x, z, t4)) out.push(place(x, z, t, t2, t3));
    }
    return out;
  };
  const q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), m4 = new THREE.Matrix4();
  const mk = (geo, mat, list, count, name) => {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); im.name = name;
    list.forEach((l, i) => { ps.set(l.x, l.y, l.z); e.set(l.rx ?? 0, l.yaw, l.rz ?? 0); q.setFromEuler(e); sc.set(l.sx, l.sy, l.sz); m4.compose(ps, q, sc); im.setMatrixAt(i, m4); });
    im.count = Math.min(count, list.length); im.castShadow = false; im.receiveShadow = false; im.frustumCulled = false; im.userData.max = list.length; return im;
  };

  const grassL = gen('grass', (x, z, t4) => !blocked(x, z, 0.6, 0.35) && vnoise(x * 0.11, z * 0.11, 3) * 0.8 + 0.2 > t4 * 0.95,
    (x, z, t, t2, t3) => { const s = 0.8 + t * 0.6; return { x, y: 0, z, yaw: t2 * 6.28, sx: s, sy: 0.8 + t3 * 0.5, sz: s }; });
  const fernL = gen('ferns', (x, z) => !blocked(x, z, 0.9, 0.7) && !nearTree(x, z, 0.4), (x, z, t, t2) => { const s = 0.8 + t * 0.7; return { x, y: 0, z, yaw: t2 * 6.28, sx: s, sy: s, sz: s }; });
  const rockL = gen('rocks', (x, z) => !blocked(x, z, 1.2, 1.0) && !inClearing(x, z) && !nearTree(x, z, 0.8),
    (x, z, t, t2, t3) => { const s = 0.35 + t * t * 1.0; return { x, y: 0.12 * s, z, yaw: t2 * 6.28, rx: (t3 - 0.5) * 0.4, sx: s * (0.9 + t3 * 0.8), sy: s * 0.7, sz: s }; });
  const logL = gen('logs', (x, z) => !blocked(x, z, 1.5, 1.4) && !inClearing(x, z) && !nearTree(x, z, 1.2),
    (x, z, t, t2, t3) => ({ x, y: 0.17, z, yaw: t2 * 6.28, rz: (t3 - 0.5) * 0.12, sx: 1.8 + t * 1.8, sy: 1, sz: 1 }));

  const uniforms = { uTime: { value: 0 } }, geos = [], mats = [];
  /** Capim/samambaias em blocos espaciais (TILE m): um InstancedMesh por bloco com esfera de contorno correta → frustum culling do three;
   *  update() esconde blocos além de CULL_DIST da câmera. O bloco de cada instância não depende da qualidade; a qualidade só limita o prefixo usado. */
  const TILE = 20;
  const mkTiled = (geo, mat, list, factor, name) => {
    const buckets = new Map();
    for (const l of list) { const k = `${Math.floor(l.x / TILE)},${Math.floor(l.z / TILE)}`; (buckets.get(k) ?? buckets.set(k, []).get(k)).push(l); }
    const g = new THREE.Group(); g.name = name; g.tiles = []; g.material = mat; g.geometry = geo; g.count = 0;
    for (const k of [...buckets.keys()].sort()) {
      const l = buckets.get(k), n = Math.floor(l.length * factor); if (n < 1) continue;
      const im = mk(geo, mat, l, n, `${name}_${k}`); im.frustumCulled = true; im.computeBoundingSphere();
      im.userData.cx = l.reduce((a, b) => a + b.x, 0) / l.length; im.userData.cz = l.reduce((a, b) => a + b.z, 0) / l.length; im.userData.rad = im.boundingSphere.radius;
      g.add(im); g.tiles.push(im); g.count += im.count;
    }
    g.dispose = () => g.tiles.forEach((t) => t.dispose());
    return g.tiles.length ? g : null;
  };
  const grassCount = Math.floor(grassL.length * qc.grass), decoCount = (l) => Math.floor(l.length * qc.foliage);
  let grass = null;
  if (grassCount > 0) { const g = grassGeo(seeds[4]), m = applyWind(cloneForVeg('foliage', qk, 0xffffff), uniforms, 'grass', 0.55); geos.push(g); mats.push(m); grass = mkTiled(g, m, grassL, qc.grass, 'grass'); }
  const fg = fernGeo(seeds[4] ^ 77), fm = applyWind(cloneForVeg('foliage', qk, 0xffffff), uniforms, 'fern', 0.9); geos.push(fg); mats.push(fm);
  const ferns = mkTiled(fg, fm, fernL, qc.foliage, 'ferns');
  const rg = rockGeo(seeds[4] ^ 99), lg = logGeo(); geos.push(rg, lg);
  const rocks = mk(rg, getMaterial('concrete', qk, { color: 0x4b4f4a }), rockL, decoCount(rockL), 'rocks');
  const logs = mk(lg, getMaterial('bark', qk, { color: 0x3a2c20 }), logL, decoCount(logL), 'logs');

  const group = new THREE.Group(); group.name = 'vegetacao';
  for (const m of [grass, ferns, rocks, logs]) if (m) group.add(m);
  let disposed = false;
  return {
    grass, ferns, rocks, logs, group,
    update(t, dt, cam) {
      uniforms.uTime.value = t;
      if (cam) for (const g of [grass, ferns]) if (g) for (const im of g.tiles) im.visible = Math.hypot(im.userData.cx - cam.x, im.userData.cz - cam.z) < CULL_DIST + im.userData.rad;
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const m of [grass, ferns, rocks, logs]) m?.dispose();   // buffers de instância
      geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose());   // só geometrias/clones nossos; materiais em cache ficam
    },
  };
}

// ---------------------------------------------------------------- variantes de árvore
export const TREE_VARIANTS = ['pine', 'broadleaf', 'palm'];
/** Variante por árvore a partir de rng PRÓPRIO (seed ^ constante): um sorteio por índice, sem tocar o rng que posiciona as árvores. */
export function assignTreeVariants(trees, treeSeed) {
  const r = createRng(((treeSeed ?? 1) ^ 0x7ee5a11) >>> 0);
  trees.forEach((t) => { const u = r.next(); t.variant = u < 0.5 ? 'pine' : u < 0.85 ? 'broadleaf' : (t.z > 14 ? 'palm' : 'pine'); });
  return trees;
}
function blobGeo() {
  const parts = [[0, 0, 0, 1], [0.7, -0.25, 0.2, 0.75], [-0.6, -0.2, -0.4, 0.8]].map(([x, y, z, s]) => new THREE.IcosahedronGeometry(s, 0).translate(x, y, z));
  const g = mergeGeometries(parts); parts.forEach((p) => p.dispose()); return g;
}
function frondGeo() {
  const tris = [], n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a), w = 0.16, px = -dz * w, pz = dx * w;
    const mid = [dx * 0.6, 0.22, dz * 0.6], tip = [dx * 1.25, -0.28, dz * 1.25];
    tris.push([[0, 0, 0], [mid[0] - px, mid[1], mid[2] - pz], [mid[0] + px, mid[1], mid[2] + pz]], [[mid[0] - px, mid[1], mid[2] - pz], tip, [mid[0] + px, mid[1], mid[2] + pz]]);
  }
  const g = new THREE.BufferGeometry(), pos = new Float32Array(tris.length * 9), uv = new Float32Array(tris.length * 6);
  tris.forEach((t, i) => t.forEach((p, j) => { pos.set(p, i * 9 + j * 3); uv[i * 6 + j * 2] = p[0] * 0.4 + 0.5; uv[i * 6 + j * 2 + 1] = p[2] * 0.4 + 0.5; }));
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
/**
 * Árvores em InstancedMesh por variante. Posições/escala do tronco são as de sempre (mesma matemática da versão anterior);
 * `trees[i].variant` define quais malhas recebem a árvore. Materiais vêm de getMaterial (compartilhados, trocados em setQuality).
 */
export function buildTrees({ trees, quality = 'medium' }) {
  const group = new THREE.Group(); group.name = 'arvores';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color();
  const geos = { trunk: new THREE.CylinderGeometry(0.7, 1, 1, 6, 1, true),   /* sem tampas: topo fica sob a copa e a base no chão (-12 tris/árvore) */ cone: new THREE.ConeGeometry(1, 1, 7), blob: blobGeo(), frond: frondGeo() };
  const parts = [];   // { mesh, role, opts, textured }
  const owned = new Set();
  /** Baixo: Lambert só cor (como antes, custo zero). Médio: Lambert, tronco com textura de casca. Alto: PBR de getMaterial (compartilhado; clone só se precisar de dois lados). */
  const matFor = (role, opts, qk, dbl) => {
    let m;
    if (qk === 'high' && !dbl) return getMaterial(role, qk, opts);
    if (qk === 'high') m = getMaterial(role, qk, opts).clone();
    else if (qk === 'medium' && role === 'bark') m = getMaterial(role, 'low', opts).clone();
    else m = new THREE.MeshLambertMaterial({ color: opts.color ?? 0x335533, flatShading: true });
    m.userData = { ...m.userData, shared: false }; if (dbl) m.side = THREE.DoubleSide; owned.add(m); return m;
  };
  const part = (variant, name, geo, role, opts, shade, dbl = false) => {
    const list = trees.map((t, i) => [t, i]).filter(([t]) => t.variant === variant);
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geo, matFor(role, opts, qKey(quality), dbl), list.length); mesh.name = `${variant}_${name}`;
    mesh.castShadow = true; mesh.frustumCulled = false; mesh.userData.items = list; mesh.userData.shade = shade;
    group.add(mesh); parts.push({ mesh, role, opts, dbl }); return mesh;
  };
  const trunk = (variant, color) => part(variant, 'trunk', geos.trunk, 'bark', { color });
  const place = (mesh, fn) => {
    mesh.userData.items.forEach(([t], k) => {
      e.set(t.lean, 0, t.lean * 0.6); q.setFromEuler(e); fn(t, ps, sc); m4.compose(ps, q, sc); mesh.setMatrixAt(k, m4);
      if (mesh.userData.shade) { col.setScalar(0.8 + t.tone * 0.35); mesh.setColorAt(k, col); }
    });
  };
  // pinheiro (visual original + texturas)
  place(trunk('pine', 0x32261b) ?? { userData: { items: [] }, setMatrixAt() {} }, (t, p, s) => { p.set(t.x, t.h / 2, t.z); s.set(t.r, t.h, t.r); });
  const pA = part('pine', 'canopyA', geos.cone, 'foliage', { color: 0x244a2c }, true), pB = part('pine', 'canopyB', geos.cone, 'foliage', { color: 0x2e5a32 }, true);
  if (pA) place(pA, (t, p, s) => { p.set(t.x, t.h * 0.72, t.z); s.set(2.6 + t.tone * 0.9, t.h * 0.55, 2.6 + t.tone * 0.9); });
  if (pB) place(pB, (t, p, s) => { p.set(t.x, t.h * 0.98, t.z); s.set(1.9 + t.tone * 0.6, t.h * 0.42, 1.9 + t.tone * 0.6); });
  // folhosa: tronco + copa arredondada
  const bT = trunk('broadleaf', 0x4a3829), bC = part('broadleaf', 'canopy', geos.blob, 'foliage', { color: 0x4a7a32 }, true);
  if (bT) place(bT, (t, p, s) => { p.set(t.x, t.h / 2, t.z); s.set(t.r * 1.15, t.h, t.r * 1.15); });
  if (bC) place(bC, (t, p, s) => { const w = 1.9 + t.tone * 0.9; p.set(t.x, t.h * 0.8, t.z); s.set(w, w * 0.85, w); });
  // palmeira: tronco claro e fino + coroa de frondes
  const lT = trunk('palm', 0x7f6a4c), lF = part('palm', 'fronds', geos.frond, 'foliage', { color: 0x4f8a3c }, true, true);
  if (lT) place(lT, (t, p, s) => { p.set(t.x, t.h / 2, t.z); s.set(t.r * 0.7, t.h, t.r * 0.7); });
  if (lF) { place(lF, (t, p, s) => { const w = 1.7 + t.tone * 0.8; p.set(t.x, t.h, t.z); s.set(w, w, w); }); }
  for (const { mesh } of parts) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  return {
    group, meshes: parts.map((p) => p.mesh),
    setQuality(quality) {
      const k = qKey(quality), old = [...owned]; owned.clear();
      for (const p of parts) p.mesh.material = matFor(p.role, p.opts, k, p.dbl);
      old.forEach((m) => m.dispose());
    },
    dispose() { for (const { mesh } of parts) mesh.dispose(); Object.values(geos).forEach((g) => g.dispose()); owned.forEach((m) => m.dispose()); owned.clear(); },
  };
}
