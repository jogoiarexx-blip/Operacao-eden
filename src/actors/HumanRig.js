import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getMaterial } from '../render/Materials.js';

/**
 * Montagem da malha de Lia e Caio (só visual). Geometrias low-poly (cilindros/esferas chanfrados, mesclados por material)
 * criadas UMA vez no módulo e compartilhadas por todas as instâncias e por ambos os personagens; Caio difere só por
 * parâmetros (escala das peças folha e posição das juntas). Materiais: cópias privadas dos de getMaterial (o cache é compartilhado
 * e nunca é mutado), recriadas em setQuality().
 */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function part(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.clone(); _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)); g.applyMatrix4(_m); return g;
}
const merge = (list) => { const g = mergeGeometries(list); list.forEach((x) => x.dispose()); return g; };
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s, 1);
const sph = (r, w = 7, h = 5) => new THREE.SphereGeometry(r, w, h);
const HP = Math.PI / 2;

let GEO = null;
/** Todas as geometrias do rig (módulo). Formas definidas a partir do pivô da junta; o comprimento vem da escala da malha. */
export function rigGeometries() {
  if (GEO) return GEO;
  const cap = () => new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62);
  GEO = {
    head: part(sph(0.125, 8, 6), 0, 0, 0, 0, 0, 0, 1, 1.08, 1),
    hairLia: merge([part(cap(), 0, 0.02, 0.01), part(box(0.22, 0.045, 0.07), 0, 0.075, -0.105, -0.35), part(box(0.035, 0.15, 0.09), 0.125, -0.0, 0.0), part(box(0.035, 0.15, 0.09), -0.125, 0, 0),
      part(cyl(0.045, 0.03, 0.17), 0, -0.03, 0.17, 0.6), part(cyl(0.03, 0.012, 0.17), 0, -0.17, 0.235, 0.25)]),
    hairCaio: merge([part(cap(), 0, 0.02, 0.01), part(box(0.17, 0.04, 0.11), 0, 0.12, -0.03), part(box(0.03, 0.1, 0.07), 0.13, -0.03, -0.02), part(box(0.03, 0.1, 0.07), -0.13, -0.03, -0.02)]),
    neck: cyl(0.052, 0.058, 0.12),
    pelvis: part(cyl(0.165, 0.155, 0.18, 8), 0, 0, 0, 0, 0, 0, 1, 1, 0.72),
    belt: merge([part(cyl(0.172, 0.172, 0.05, 8), 0, 0.07, 0, 0, 0, 0, 1, 1, 0.75), part(box(0.05, 0.045, 0.02), 0, 0.07, -0.13), part(box(0.05, 0.1, 0.05), 0.17, 0.0, 0.02)]),
    chest: merge([part(cyl(0.205, 0.165, 0.36, 8), 0, 0.36, 0, 0, 0, 0, 1, 1, 0.64), part(cyl(0.16, 0.155, 0.22, 8), 0, 0.14, 0, 0, 0, 0, 1, 1, 0.68)]),
    vest: merge([part(box(0.33, 0.3, 0.05), 0, 0.38, -0.145), part(box(0.31, 0.3, 0.05), 0, 0.38, 0.145), part(box(0.09, 0.09, 0.05), 0.09, 0.27, -0.185), part(box(0.09, 0.09, 0.05), -0.09, 0.27, -0.185),
      part(box(0.06, 0.04, 0.3), 0.1, 0.545, 0), part(box(0.06, 0.04, 0.3), -0.1, 0.545, 0)]),
    pack: merge([part(box(0.28, 0.32, 0.12), 0, 0.3, 0), part(box(0.18, 0.12, 0.07), 0, 0.17, 0.09), part(cyl(0.045, 0.045, 0.3), 0, 0.5, 0.0, 0, 0, HP)]),
    pauldrons: merge([part(sph(0.13, 7, 4), 0.34, 0.53, 0, 0, 0, 0, 1, 0.8, 1.05), part(sph(0.13, 7, 4), -0.34, 0.53, 0, 0, 0, 0, 1, 0.8, 1.05)]),
    upper: merge([part(cyl(0.062, 0.052, 0.29), 0, -0.145, 0), part(sph(0.07, 6, 4))]),
    fore: merge([part(cyl(0.052, 0.042, 0.27), 0, -0.135, 0), part(sph(0.05, 6, 4))]),
    hand: sph(0.05, 6, 4),
    thigh: merge([part(cyl(0.09, 0.07, 0.46), 0, -0.23, 0), part(sph(0.09, 6, 4))]),
    shin: merge([part(cyl(0.07, 0.055, 0.4), 0, -0.2, 0), part(sph(0.065, 6, 4))]),
    boot: merge([part(box(0.15, 0.1, 0.27), 0, -0.02, -0.05), part(cyl(0.068, 0.072, 0.14), 0, 0.09, 0)]),
    pistolMetal: part(box(0.045, 0.055, 0.2), 0, 0, -0.07),
    pistolGrip: part(box(0.04, 0.11, 0.05), 0, -0.075, 0.02, 0.25),
    shotMetal: merge([part(cyl(0.02, 0.02, 0.5, 6), 0, 0, -0.05, HP), part(cyl(0.017, 0.017, 0.4, 6), 0, -0.045, -0.1, HP), part(box(0.05, 0.08, 0.2), 0, -0.01, 0.1)]),
    shotGrip: merge([part(box(0.05, 0.1, 0.25), 0, -0.02, 0.3), part(box(0.06, 0.05, 0.14), 0, -0.05, -0.15)]),
    flash: sph(0.09, 6, 4),
  };
  return GEO;
}
/** Para testes: quantidade de geometrias únicas mantidas no módulo. */
export const rigGeometryCount = () => Object.keys(rigGeometries()).length;

export const CHARACTERS = {
  lia: { hipX: 0.115, thigh: 0.46, shin: 0.4, shX: 0.27, shY: 0.5, headY: 0.7, limb: 1, legW: 1, chestW: 1, chestD: 1, packS: 1, arm: 1,
    colors: { skin: 0xc58b62, jacket: 0x2f6f73, vest: 0x3d4a40, pants: 0x2b2f3a, hair: 0x1d1512, gear: 0x3a3d3a, metal: 0x6a7076 } },
  caio: { hipX: 0.15, thigh: 0.48, shin: 0.42, shX: 0.33, shY: 0.53, headY: 0.74, limb: 1.25, legW: 1.2, chestW: 1.28, chestD: 1.2, packS: 1.12, arm: 1.04,
    colors: { skin: 0x8a5a3c, jacket: 0x9a5a22, vest: 0x4a3a28, pants: 0x30343a, hair: 0x120e0c, gear: 0x3a3d3a, metal: 0x6a7076 } },
};
export const LEG_BASE = { thigh: 0.46, shin: 0.4 };
const SLOT_ROLE = { skin: 'skin', hair: 'skin', jacket: 'cloth', vest: 'cloth', pants: 'clothDark', gear: 'clothDark', metal: 'metal' };
const NO_TINT = new Set(['skin', 'hair']);
export const ARM = { L1: 0.29, L2: 0.27 };

export class HumanRig {
  constructor(quality = 'medium') {
    const G = rigGeometries();
    this.quality = quality; this.mats = {}; this.base = CHARACTERS.lia.colors; this.tinted = false; this.opacity = 1; this.charId = 'lia';
    this._meshes = [];
    const mk = (geo, slot, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, null); m.userData.slot = slot; m.position.set(x, y, z); m.castShadow = true; parent.add(m); this._meshes.push(m); return m;
    };
    const root = this.root = new THREE.Group();
    const body = this.body = new THREE.Group(); root.add(body); // pivô na pélvis
    const spine = this.spine = new THREE.Group(); body.add(spine);
    this.pelvis = mk(G.pelvis, 'pants', body); this.belt = mk(G.belt, 'gear', body);
    this.chest = mk(G.chest, 'jacket', spine); this.vest = mk(G.vest, 'vest', spine);
    this.pack = mk(G.pack, 'gear', spine); this.pauldrons = mk(G.pauldrons, 'gear', spine);
    this.neck = mk(G.neck, 'skin', spine, 0, 0.6, 0);
    const headG = this.headG = new THREE.Group(); spine.add(headG);
    this.head = mk(G.head, 'skin', headG); this.hairLia = mk(G.hairLia, 'hair', headG); this.hairCaio = mk(G.hairCaio, 'hair', headG);
    this.arms = []; this.elbows = []; this.fores = []; this.uppers = []; this.hands = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); spine.add(sh); this.arms.push(sh);
      this.uppers.push(mk(G.upper, 'jacket', sh));
      const el = new THREE.Group(); el.position.y = -ARM.L1; sh.add(el); this.elbows.push(el);
      this.fores.push(mk(G.fore, 'jacket', el)); this.hands.push(mk(G.hand, 'skin', el, 0, -ARM.L2 - 0.02, 0));
    }
    this.legs = []; this.knees = []; this.thighs = []; this.shins = []; this.boots = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group(); body.add(hip); this.legs.push(hip); this.thighs.push(mk(G.thigh, 'pants', hip));
      const kn = new THREE.Group(); hip.add(kn); this.knees.push(kn); this.shins.push(mk(G.shin, 'pants', kn));
      const an = new THREE.Group(); kn.add(an); this.boots.push(mk(G.boot, 'gear', an)); kn.userData.ankle = an;
    }
    // arma: a origem é a empunhadura da mão direita; a boca do cano fica em (0,0,flashZ)
    const gun = this.gun = new THREE.Group(); spine.add(gun);
    this.pistol = new THREE.Group(); this.shotgun = new THREE.Group(); gun.add(this.pistol, this.shotgun);
    mk(G.pistolMetal, 'metal', this.pistol); mk(G.pistolGrip, 'gear', this.pistol); mk(G.shotMetal, 'metal', this.shotgun); mk(G.shotGrip, 'gear', this.shotgun);
    this.flash = new THREE.Mesh(G.flash, new THREE.MeshBasicMaterial({ color: 0xffd27a })); this.flash.visible = false; gun.add(this.flash);
    this.shotgun.visible = false;
    this._buildMats(); this.setCharacter('lia');
  }
  _buildMats() {
    for (const k of Object.keys(SLOT_ROLE)) {
      const base = getMaterial(SLOT_ROLE[k], this.quality, { color: CHARACTERS.lia.colors[k] });
      const c = base.clone(); c.userData = {}; this.mats[k] = c; // cópia privada: o cache compartilhado nunca é mutado
    }
    for (const m of this._meshes) m.material = this.mats[m.userData.slot];
    this._applyColors(); this._applyOpacity(true);
  }
  _applyColors() { for (const k of Object.keys(this.mats)) this.mats[k].color.setHex(this.tinted && !NO_TINT.has(k) ? 0xcc6666 : this.base[k]); }
  _applyOpacity(force) { for (const m of Object.values(this.mats)) { const t = this.opacity < 0.99; if (force || m.transparent !== t) { m.transparent = t; m.needsUpdate = true; } m.opacity = this.opacity; } }
  /** Troca de qualidade: recria as cópias a partir de getMaterial (Lambert no Baixo, Standard no Médio/Alto). */
  setQuality(q) {
    if (q === this.quality) return; this.quality = q;
    const old = Object.values(this.mats); this._buildMats(); old.forEach((m) => m.dispose());
  }
  setTint(on) { if (on !== this.tinted) { this.tinted = on; this._applyColors(); } }
  setOpacity(o) { if (o !== this.opacity) { this.opacity = o; this._applyOpacity(false); } }
  /** Proporções e cores de Lia/Caio; devolve os parâmetros usados pela animação. */
  setCharacter(id) {
    const caio = id === 'caio', P = this.P = CHARACTERS[caio ? 'caio' : 'lia']; this.charId = caio ? 'caio' : 'lia'; this.base = P.colors; this._applyColors();
    this.hipY = P.thigh + P.shin + 0.06;
    const lw = P.limb, set = (m, sx, sy, sz) => m.scale.set(sx, sy, sz);
    set(this.chest, P.chestW, 1, P.chestD); set(this.vest, P.chestW, 1, P.chestD); set(this.pelvis, P.chestW * 0.95, 1, P.chestD); set(this.belt, P.chestW * 0.95, 1, P.chestD);
    this.pack.scale.setScalar(P.packS); this.pack.position.set(0, 0, 0.2 * P.chestD + (P.packS - 1) * 0.04);
    this.pauldrons.visible = caio; this.hairLia.visible = !caio; this.hairCaio.visible = caio;
    this.headG.position.y = P.headY; this.head.scale.setScalar(caio ? 1.04 : 1); this.neck.scale.set(lw, 1, lw);
    for (let i = 0; i < 2; i++) {
      const sx = i ? 1 : -1;
      this.arms[i].position.set(sx * P.shX, P.shY, 0); this.arms[i].scale.setScalar(1);
      set(this.uppers[i], lw, P.arm, lw); this.elbows[i].position.y = -ARM.L1 * P.arm; set(this.fores[i], lw * 0.95, P.arm, lw * 0.95); this.hands[i].position.y = -(ARM.L2 + 0.02) * P.arm; this.hands[i].scale.setScalar(caio ? 1.2 : 1);
      this.legs[i].position.set(sx * P.hipX, 0, 0); set(this.thighs[i], P.legW, P.thigh / LEG_BASE.thigh, P.legW);
      this.knees[i].position.y = -P.thigh; set(this.shins[i], P.legW, P.shin / LEG_BASE.shin, P.legW);
      this.knees[i].userData.ankle.position.y = -P.shin; set(this.boots[i], P.legW, 1, P.legW * 1.05);
    }
    this.armL1 = ARM.L1 * P.arm; this.armL2 = ARM.L2 * P.arm;
    return P;
  }
  dispose() { Object.values(this.mats).forEach((m) => m.dispose()); this.flash.material.dispose(); this.mats = {}; }
}
