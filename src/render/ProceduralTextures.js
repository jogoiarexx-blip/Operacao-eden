import * as THREE from 'three';
import { createRng } from '../core/rng.js';

/** Texturas procedurais (sem assets externos). Pixels puros e determinísticos via createRng; cache por kind:seed:size. */
const KINDS = {
  // base [r,g,b], variação de ruído, escala de grade, estilo
  dirt: { base: [92, 74, 54], amp: 0.35, cell: 8 }, mud: { base: [58, 46, 34], amp: 0.3, cell: 12 },
  gravel: { base: [120, 116, 108], amp: 0.5, cell: 4 }, bark: { base: [70, 52, 38], amp: 0.45, cell: 6, stripes: 'v' },
  scales: { base: [74, 98, 62], amp: 0.3, cell: 6, scales: true }, cloth: { base: [110, 112, 108], amp: 0.18, cell: 3, weave: true },
  concrete: { base: [128, 128, 124], amp: 0.22, cell: 10 }, metal: { base: [140, 146, 152], amp: 0.15, cell: 5, stripes: 'h' },
  foliage: { base: [52, 90, 44], amp: 0.4, cell: 5 },
};
const hash = (x, y, seed) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** Ruído de valor periódico (tileável) com interpolação suave; period = células por lado. */
function vnoise(u, v, period, seed) {
  const x = u * period, y = v * period, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), w = (i, j) => hash(((i % period) + period) % period, ((j % period) + period) % period, seed);
  const a = w(x0, y0), b = w(x0 + 1, y0), c = w(x0, y0 + 1), d = w(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
export function generatePixels(kind, seed = 1, size = 256) {
  const k = KINDS[kind]; if (!k) throw new Error(`textura desconhecida: ${kind}`);
  const out = new Uint8ClampedArray(size * size * 4), rng = createRng((seed * 7919 + kind.length * 131 + kind.charCodeAt(0)) >>> 0), s0 = rng.int(1, 1e6), s1 = rng.int(1, 1e6);
  const p1 = Math.max(2, Math.round(size / k.cell / 2)), p2 = p1 * 3;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    let n = vnoise(u, v, p1, s0) * 0.65 + vnoise(u, v, p2, s1) * 0.35; // 0..1
    if (k.stripes === 'v') n = n * 0.5 + vnoise(u, v * 0.1 + 0.05, p1 * 2, s1) * 0.5 * (0.6 + 0.4 * Math.sin(u * Math.PI * 2 * p1));
    else if (k.stripes === 'h') n = n * 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(v * Math.PI * 2 * p2));
    if (k.scales) { const gx = (u * p2) % 1, gy = (v * p2 + (Math.floor(u * p2) % 2) * 0.5) % 1; n = n * 0.5 + Math.min(1, Math.hypot(gx - 0.5, gy - 0.5) * 1.6) * 0.5; }
    if (k.weave) n = n * 0.5 + (((x >> 1) + (y >> 1)) & 1) * 0.5;
    const m = 1 + (n - 0.5) * 2 * k.amp, i = (y * size + x) * 4;
    out[i] = k.base[0] * m; out[i + 1] = k.base[1] * m; out[i + 2] = k.base[2] * m; out[i + 3] = 255;
  }
  return out;
}
const cache = new Map();
export function getTexture(kind, { seed = 1, size = 256, repeat } = {}) {
  const key = `${kind}:${seed}:${size}`; let t = cache.get(key);
  if (!t) {
    t = new THREE.DataTexture(generatePixels(kind, seed, size), size, size, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; cache.set(key, t);
  }
  if (repeat != null) { const [rx, ry] = Array.isArray(repeat) ? repeat : [repeat, repeat]; t.repeat.set(rx, ry); }
  return t;
}
export function disposeTextures() { for (const t of cache.values()) t.dispose(); cache.clear(); }
export const textureCacheSize = () => cache.size;
