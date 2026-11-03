import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRng } from '../core/rng.js';
import { getMaterial } from './Materials.js';
import { QUALITY } from '../core/Settings.js';

/**
 * Detalhe VISUAL das estruturas (degraus/chanfros, pilastres, chapas, janelas, cabos, manchas) e poças.
 * Nada daqui entra em colisores, linha de visada ou navegação: são malhas extras, fundidas por material
 * (poucos draw calls por capítulo). Usa rng próprio (derivado de treeSeed), nunca o rng do jogo nem o do cenário.
 * Materiais de getMaterial são compartilhados e nunca alterados/liberados aqui; os locais são liberados em dispose().
 */
const qKey = (q) => (q in QUALITY ? q : 'medium');
const lam = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const UP = new THREE.Vector3(0, 1, 0);

export function buildStructureDetail({ data, quality }) {
  const qk = qKey(quality), rich = qk !== 'low';
  const rng = createRng(((data.treeSeed ?? 1) ^ 0xde7a11) >>> 0);
  const B = { trim: [], plate: [], glow: [], dark: [], stain: [] };
  const box = (k, w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); B[k].push(g); };
  const cyl = (k, r0, r1, h, x, y, z, axis) => { const g = new THREE.CylinderGeometry(r0, r1, h, 10); if (axis === 'z') g.rotateX(Math.PI / 2); g.translate(x, y, z); B[k].push(g); };
  const seg = (k, a, b, th = 0.035) => {                       // haste fina entre dois pontos
    const g = new THREE.BoxGeometry(th, th, a.distanceTo(b)), m = new THREE.Matrix4().lookAt(a, b, UP);
    m.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); g.applyMatrix4(m); B[k].push(g);
  };
  const cable = (a, b, sag, n = 5) => {                        // cabo com queda parabólica
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t);
      if (prev) seg('dark', prev, p); prev = p;
    }
  };

  for (const s of data.structures) {
    if (s.fade || s.visual === 'ravine' || s.visual === 'rock') continue;
    const y0 = s.y ?? 0;
    if (s.kind !== 'box') {
      const h = s.h, r = s.r, tall = s.visual === 'metal' && h > 8;
      const bands = tall ? Math.floor(h / 2.2) : s.visual === 'wood' ? 3 : 2;
      for (let i = 1; i <= bands; i++) { const f = i / (bands + 1), rr = r * (1 + 0.1 * (1 - f)) + 0.05; cyl(s.visual === 'wood' ? 'dark' : 'plate', rr, rr, 0.14, s.pos[0], y0 + h * f, s.pos[1]); }
      if (rich && tall) {                                      // escada de serviço na face +z
        const zf = s.pos[1] + r * 1.05;
        for (const dx of [-0.25, 0.25]) box('plate', 0.05, h * 0.9, 0.05, s.pos[0] + dx, y0 + h * 0.5, zf + 0.05);
        for (let y = 0.6; y < h * 0.93; y += 0.55) box('plate', 0.55, 0.04, 0.05, s.pos[0], y0 + y, zf + 0.05);
      }
      continue;
    }
    const [w, h, d] = s.size, cx = s.pos[0], cz = s.pos[1], alongX = w >= d, L = alongX ? w : d, t = alongX ? d : w, id = s.id;
    // u: ao longo do maior eixo; v: lateral (espessura); sa/st: tamanhos ao longo / lateral
    const P = (k, u, y, v, sa, sy, st) => (alongX ? box(k, sa, sy, st, cx + u, y, cz + v) : box(k, st, sy, sa, cx + v, y, cz + u));
    const wallish = (s.visual === 'concrete' || s.visual === 'shelter' || s.visual === 'shed') && t <= 0.9 && L >= 1.5 && h >= 2;
    if (wallish) {
      P('trim', 0, y0 + h + 0.06, 0, L + 0.1, 0.12, t + 0.14);                 // coroamento
      P('trim', 0, y0 + 0.2, 0, L + 0.04, 0.4, t + 0.1);                       // rodapé em degraus (chanfro)
      P('trim', 0, y0 + 0.46, 0, L + 0.02, 0.12, t + 0.05);
      const nP = L >= 7 ? Math.max(1, Math.round(L / (rich ? 4.2 : 8))) : 0, uP = [];
      for (let i = 0; nP && i <= nP; i++) { const u = -L / 2 + (i * L) / nP; uP.push(u); P('trim', u, y0 + h / 2, 0, 0.28, h, t + 0.16); }
      for (const side of [-1, 1]) {
        const v = side * (t / 2 + 0.014);
        if (rich) for (let i = rng.int(1, 2); i > 0; i--) {                       // manchas de umidade escorrendo
          const sh = Math.min(h * 0.6, rng.range(0.8, 2.0));
          P('stain', rng.range(-L / 2 + 0.8, L / 2 - 0.8), y0 + h - sh / 2 - 0.14, v, rng.range(0.4, 1.1), sh, 0.025);
        }
        if (/^(admin_|shed_|corr_|radio_e|shelter_wall)/.test(id) && L >= 3 && h >= 2.4) {
          const n = Math.floor(L / 2.6);
          for (let i = 0; i < n; i++) {
            const u = -L / 2 + ((i + 0.5) * L) / n;
            P('plate', u, y0 + h * 0.62, side * (t / 2 + 0.008), 0.92, 0.66, 0.02);                  // moldura
            P(rng.next() < 0.45 ? 'glow' : 'dark', u, y0 + h * 0.62, v + side * 0.008, 0.78, 0.52, 0.02);
          }
        }
      }
      if (rich && uP.length > 1 && /^(admin_|shed_|wall_|yard_)/.test(id) && rng.next() < 0.5) {   // cabo entre pilastres
        const side = rng.next() < 0.5 ? -1 : 1, v = side * (t / 2 + 0.1), y = y0 + h - 0.3;
        const at = (u) => (alongX ? new THREE.Vector3(cx + u, y, cz + v) : new THREE.Vector3(cx + v, y, cz + u));
        for (let i = 0; i < Math.min(3, uP.length - 1); i++) cable(at(uP[i]), at(uP[i + 1]), 0.4, 4);
      }
    } else if (s.visual === 'gate') {
      for (const f of [0.2, 0.5, 0.8]) for (const side of [-1, 1]) P('plate', 0, y0 + h * f, side * (t / 2 + 0.02), L * 0.92, 0.12, 0.04);
      for (const side of [-1, 1]) P('dark', 0, y0 + h / 2, side * (t / 2 + 0.012), 0.05, h * 0.96, 0.02);
    } else if (s.visual === 'container') {
      const nR = Math.floor(L / 0.36);
      for (const side of [-1, 1]) for (let i = 0; i < nR; i++) P('plate', -L / 2 + ((i + 0.5) * L) / nR, y0 + h / 2, side * (t / 2 + 0.02), 0.07, h - 0.16, 0.05);
      for (const su of [-1, 1]) { P('plate', su * (L / 2 + 0.02), y0 + h / 2, 0, 0.04, h * 0.86, t * 0.9); for (const sv of [-1, 1]) P('trim', su * L / 2, y0 + h / 2, sv * t / 2, 0.1, h, 0.1); }
    } else if (s.visual === 'truck') {
      const isCab = id.includes('cab');
      for (const sv of [-1, 1]) {
        for (const wu of (isCab ? [0] : [-1.6, 1.6])) { const wx = cx + wu, wz = cz + sv * (d / 2 + 0.05); cyl('dark', 0.5, 0.5, 0.32, wx, 0.5, wz, 'z'); cyl('plate', 0.22, 0.22, 0.34, wx, 0.5, wz, 'z'); }
        if (isCab) box('dark', 0.9, 0.6, 0.02, cx - 0.1, y0 + h * 0.66, cz + sv * (d / 2 + 0.012));
      }
      if (isCab) box('dark', 0.03, 0.7, d - 0.5, cx - w / 2 - 0.012, y0 + h * 0.66, cz);
      else for (const u of [-1.8, 0, 1.8]) box('dark', 0.1, h + 0.04, d + 0.04, cx + u, y0 + h / 2, cz);   // cintas da lona
    } else if (s.visual === 'crate') {
      for (const f of [-0.3, 0.3]) P('dark', f * L, y0 + h / 2, 0, L * 0.1, h + 0.02, t + 0.02);
    } else if (s.visual === 'metal' && h >= 1 && Math.min(w, d) >= 1) {
      for (const side of [-1, 1]) for (let i = 0; i < 5; i++) P('dark', -L / 2 + 0.3 + i * ((L - 0.6) / 4), y0 + h * 0.55, side * (t / 2 + 0.012), 0.12, h * 0.4, 0.02);
      P('plate', 0, y0 + h + 0.03, 0, L * 0.7, 0.06, t * 0.7);
    } else if (s.visual === 'wood' && h <= 0.4 && Math.min(w, d) >= 1.5) {
      for (let u = -L / 2 + 0.3; u < L / 2; u += 0.55) P('dark', u, y0 + h + 0.006, 0, 0.03, 0.012, t);   // frestas das tábuas
    }
  }
  // cabo de aço da torre do coro até o muro do portão (só existe no Cap. 01)
  const by = (id) => data.structures.find((s) => s.id === id), tw = by('coro_tower'), gw = by('gate_wall_r');
  if (tw && gw) cable(new THREE.Vector3(tw.pos[0], tw.h - 0.4, tw.pos[1]), new THREE.Vector3(gw.pos[0] + 4, gw.size[1] + 0.2, gw.pos[1] + 0.5), 0.9, 8);

  const dark = lam(0x11171a), stain = lam(0x1d2421);
  const mats = {
    trim: getMaterial('concrete', qk), plate: getMaterial('metal', qk),
    glow: getMaterial('emissiveLamp', qk, { color: 0xc9a35a, emissive: 0xd9a85a }),     // estática e compartilhada: nunca alterada aqui
    dark, stain,
  };
  const group = new THREE.Group(); group.name = 'structure-detail'; const own = [dark, stain];
  for (const k of Object.keys(B)) {
    if (!B[k].length) continue;
    const g = mergeGeometries(B[k]); B[k].forEach((p) => p.dispose()); own.push(g);
    const m = new THREE.Mesh(g, mats[k]); m.receiveShadow = true; m.castShadow = false; group.add(m);
  }
  return { group, dispose() { own.forEach((o) => o.dispose()); } };
}

/** Poças: discos achatados num único mesh. Standard de baixa rugosidade no Médio/Alto; Lambert escuro simples no Baixo. Só visual. */
export function buildPuddles({ data, quality }) {
  const qk = qKey(quality), list = data.puddles ?? [], group = new THREE.Group(); group.name = 'puddles';
  if (!list.length) return { group, dispose() {} };
  const rng = createRng(((data.treeSeed ?? 1) ^ 0x90dd1e5) >>> 0), parts = [];
  for (const [x, z, r] of list) {
    const g = new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2), p = g.attributes.position;
    for (let i = 1; i < p.count; i++) { const k = 1 + (rng.next() - 0.5) * 0.28; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    g.scale(r, 1, r * rng.range(0.7, 0.95)); g.rotateY(rng.range(0, Math.PI)); g.translate(x, 0.03, z); parts.push(g);
  }
  const geo = mergeGeometries(parts); parts.forEach((p) => p.dispose());
  const pbr = !!QUALITY[qk].pbr;
  const base = { color: 0x0b1518, transparent: true, opacity: pbr ? 0.9 : 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const mat = pbr ? new THREE.MeshStandardMaterial({ ...base, roughness: 0.06, metalness: 0.1 }) : new THREE.MeshLambertMaterial(base);
  const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 1; group.add(mesh);
  return { group, dispose() { geo.dispose(); mat.dispose(); } };
}
