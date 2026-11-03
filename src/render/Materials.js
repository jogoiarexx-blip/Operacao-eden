import * as THREE from 'three';
import { QUALITY } from '../core/Settings.js';
import { getTexture, disposeTextures } from './ProceduralTextures.js';

/** Materiais por papel: Lambert no Baixo, Standard (PBR) em Médio/Alto. flatShading mantém o visual low-poly. */
const ROLES = {
  ground: { color: 0x6b5a45, tex: 'dirt', rep: 8, r: 0.95, m: 0 }, bark: { color: 0x5a4330, tex: 'bark', rep: 2, r: 0.9, m: 0 },
  foliage: { color: 0x3f7a3a, tex: 'foliage', rep: 2, r: 0.85, m: 0 }, skin: { color: 0xc89a7a, r: 0.7, m: 0 },
  cloth: { color: 0x6b7a66, tex: 'cloth', rep: 3, r: 0.9, m: 0 }, clothDark: { color: 0x2f3638, tex: 'cloth', rep: 3, r: 0.92, m: 0 },
  scales: { color: 0x5f8a4a, tex: 'scales', rep: 2, r: 0.55, m: 0.05 }, metal: { color: 0x8a9096, tex: 'metal', rep: 2, r: 0.3, m: 0.7 },
  concrete: { color: 0x8a8a84, tex: 'concrete', rep: 3, r: 0.95, m: 0 }, wood: { color: 0x7a5a3a, tex: 'bark', rep: 2, r: 0.85, m: 0 },
  emissiveLamp: { color: 0xfff1c0, emissive: 0xffe8a0, ei: 2, r: 0.4, m: 0 },
};
const cache = new Map();
const hashOpts = (o, role) => o ? ['color', 'emissive', ...(role === 'scales' ? ['accent'] : [])].map((k) => o[k] ?? '').join(',') : '';
export function getMaterial(role, quality = 'medium', opts) {
  const R = ROLES[role]; if (!R) throw new Error(`papel de material desconhecido: ${role}`);
  const key = `${role}:${quality}:${hashOpts(opts, role)}`; let m = cache.get(key); if (m) return m;
  const pbr = !!QUALITY[quality]?.pbr, p = { color: opts?.color ?? R.color, flatShading: true };
  const baked = role === 'scales' && opts?.accent != null; // com accent: base+faixas na textura, material branco
  if (R.tex) p.map = getTexture(R.tex, { repeat: R.rep, accent: baked ? opts.accent : undefined, base: baked ? p.color : undefined });
  if (baked) p.color = 0xffffff;
  if (R.emissive != null) { p.emissive = opts?.emissive ?? R.emissive; p.emissiveIntensity = R.ei; }
  if (pbr) { p.roughness = R.r; p.metalness = R.m; }
  m = pbr ? new THREE.MeshStandardMaterial(p) : new THREE.MeshLambertMaterial(p);
  cache.set(key, m); return m;
}
export function disposeMaterials() { for (const m of cache.values()) m.dispose(); cache.clear(); }
/** Libera tudo de uma vez (troca de capítulo/dispose): materiais primeiro (referenciam texturas), depois texturas. */
export function disposeRenderResources() { disposeMaterials(); disposeTextures(); }
