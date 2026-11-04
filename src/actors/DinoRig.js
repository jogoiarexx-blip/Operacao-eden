import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getMaterial } from '../render/Materials.js';

/**
 * Rig procedural dos dinossauros (R-4, R-4J e K-1; só visual). Frente = -Z, escala 1 = R-4; a escala da espécie vai na raiz.
 * Geometrias low-poly mescladas por material, criadas UMA vez no módulo e compartilhadas por todas as instâncias; as peças que mudam só
 * no K-1 (crista com chifres, placas) são geometrias à parte. Materiais: cópias privadas dos de getMaterial (o cache é compartilhado e
 * nunca é mutado), recriadas em setQuality() e liberadas em dispose().
 */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function part(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.clone(); _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)); g.applyMatrix4(_m); return g;
}
const merge = (list) => { const g = mergeGeometries(list); list.forEach((x) => x.dispose()); return g; };
const HP = Math.PI / 2;
const sph = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cone = (r, h, s = 4) => new THREE.ConeGeometry(r, h, s, 1);
/** Tubo para +Z (r0 em z=0, r1 em z=len); w/h = achatamento lateral/vertical. */
const tubeB = (r0, r1, len, s = 6, w = 1, h = 1) => part(new THREE.CylinderGeometry(r1, r0, len, s, 1), 0, 0, len / 2, HP, 0, 0, w, 1, h);
/** Tubo para -Z. */
const tubeF = (r0, r1, len, s = 6, w = 1, h = 1) => part(new THREE.CylinderGeometry(r1, r0, len, s, 1), 0, 0, -len / 2, -HP, 0, 0, w, 1, h);
/** Membro para baixo (-Y). */
const limb = (r0, r1, len, s = 6, w = 1, d = 1) => part(new THREE.CylinderGeometry(r0, r1, len, s, 1), 0, -len / 2, 0, 0, 0, 0, w, 1, d);

export const TAIL = { len: [0.38, 0.34, 0.3, 0.26, 0.22], r: [0.2, 0.165, 0.13, 0.1, 0.07, 0.035] };
export const LEG = { thigh: 0.42, shin: 0.4, hipY: 0.82, hipX: 0.24, hipZ: 0.18, a0: 0.45, k0: -0.9 };

let GEO = null;
export function dinoGeometries() {
  if (GEO) return GEO;
  const dorsal = []; // espinhos dorsais acompanhando o dorso do tronco
  for (let i = 0; i < 7; i++) { const z = -0.5 + i * 0.17, y = 0.95 + 0.4 * Math.sqrt(Math.max(0, 1 - (z / 0.74) ** 2)); dorsal.push(part(cone(0.05, 0.12 + (i === 3 ? 0.03 : 0), 4), 0, y + 0.03, z, -0.12)); }
  const plates = []; // K-1: placas ósseas maiores + espinhos de ombro
  for (let i = 0; i < 6; i++) { const z = -0.52 + i * 0.2, y = 0.95 + 0.4 * Math.sqrt(Math.max(0, 1 - (z / 0.74) ** 2)); plates.push(part(box(0.07, 0.3 - i * 0.03, 0.17), 0, y + 0.07, z, 0.12 - i * 0.04, 0, 0, 1, 1, 1)); }
  for (const sx of [-1, 1]) plates.push(part(cone(0.07, 0.3, 5), sx * 0.34, 1.2, -0.42, -0.4, 0, -sx * 0.9));
  const arm = (sx) => merge([part(limb(0.05, 0.03, 0.26), 0, 0, 0), part(cone(0.014, 0.08, 4), -0.02, -0.29, 0, 0, 0, 0), part(cone(0.014, 0.08, 4), 0.02, -0.29, 0)]).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(sx * 0.3, 0.86, -0.56), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.95, 0, sx * 0.25)), new THREE.Vector3(1, 1, 1)));
  const teeth = [], jawTeeth = [];
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) { teeth.push(part(cone(0.014, 0.06 + (i === 0 ? 0.03 : 0), 4), sx * 0.075, -0.075, -0.22 - i * 0.07, 0, 0, Math.PI)); jawTeeth.push(part(cone(0.012, 0.05, 4), sx * 0.052, 0.035, -0.16 - i * 0.07)); }
  const eyes = merge([part(sph(0.03, 6, 4), 0.125, 0.06, -0.15), part(sph(0.03, 6, 4), -0.125, 0.06, -0.15)]);
  const toe = (yaw, len) => part(tubeF(0.032, 0.022, len, 5), 0, -0.05, -0.04, 0, yaw);
  GEO = {
    torso: merge([part(sph(1, 9, 6), 0, 0.95, 0, 0, 0, 0, 0.36, 0.4, 0.74), part(sph(1, 7, 5), 0, 0.95, 0.4, 0, 0, 0, 0.33, 0.34, 0.36), part(sph(1, 7, 5), 0, 1.0, -0.4, 0, 0, 0, 0.3, 0.36, 0.36), arm(-1), arm(1)]),
    belly: merge([part(sph(1, 8, 5), 0, 0.82, -0.02, 0, 0, 0, 0.29, 0.3, 0.7), part(sph(1, 7, 5), 0, 0.9, -0.42, 0, 0, 0, 0.24, 0.26, 0.3), part(tubeF(0.07, 0.06, 0.5, 5), 0, 1.0, -0.5, 0.7)]),
    dorsal: merge(dorsal), plates: merge(plates),
    neck: merge([part(tubeF(0.16, 0.125, 0.3, 7, 1, 1.05)), part(tubeF(0.125, 0.1, 0.3, 7, 1, 1.05), 0, 0.02, -0.27, 0.22)]),
    skull: merge([part(sph(1, 8, 6), 0, 0, -0.05, 0, 0, 0, 0.16, 0.15, 0.2), part(tubeF(0.105, 0.07, 0.42, 6, 1.05, 0.8), 0, -0.02, -0.12), part(box(0.07, 0.035, 0.14), 0.1, 0.095, -0.14, 0, 0, 0.3), part(box(0.07, 0.035, 0.14), -0.1, 0.095, -0.14, 0, 0, -0.3)]),
    crest: merge([part(box(0.035, 0.09, 0.34), 0, 0.15, -0.05, 0.12), part(cone(0.03, 0.08, 4), 0, 0.2, 0.12, -0.5)]),
    crestBoss: merge([part(box(0.05, 0.14, 0.4), 0, 0.17, -0.05, 0.1), part(cone(0.04, 0.14, 4), 0, 0.25, 0.14, -0.5), part(cone(0.05, 0.3, 5), 0.13, 0.15, 0.06, -0.9, 0, -0.45), part(cone(0.05, 0.3, 5), -0.13, 0.15, 0.06, -0.9, 0, 0.45), part(box(0.1, 0.05, 0.12), 0.1, 0.12, -0.2, 0, 0, 0.2), part(box(0.1, 0.05, 0.12), -0.1, 0.12, -0.2, 0, 0, -0.2)]),
    teeth: merge(teeth), eyes,
    jaw: part(tubeF(0.085, 0.052, 0.42, 6, 1, 0.55)), jawTeeth: merge(jawTeeth),
    tail: TAIL.len.map((l, i) => tubeB(TAIL.r[i], TAIL.r[i + 1], l, 6, 1, 1.08)),
    thigh: merge([part(limb(0.14, 0.085, LEG.thigh, 6, 1, 1.1)), part(sph(0.14, 6, 5))]),
    shin: merge([part(limb(0.08, 0.05, LEG.shin, 6)), part(sph(0.075, 6, 4))]),
    foot: merge([part(box(0.1, 0.06, 0.14), 0, -0.04, -0.03), toe(0, 0.2), toe(0.4, 0.17), toe(-0.4, 0.17), part(sph(0.055, 6, 4), 0, -0.01, 0.02)]),
    claws: merge([part(cone(0.02, 0.09, 4), 0, -0.055, -0.27, -HP), part(cone(0.018, 0.08, 4), -0.07, -0.055, -0.235, -HP, 0.4), part(cone(0.018, 0.08, 4), 0.07, -0.055, -0.235, -HP, -0.4),
      part(cone(0.024, 0.13, 4), 0, 0.0, -0.15, -1.9)]),
  };
  return GEO;
}
/** Para testes: geometrias únicas do módulo (arrays contam cada item). */
export const dinoGeometryList = () => Object.values(dinoGeometries()).flat();
/** Libera os buffers da GPU das geometrias compartilhadas (chamar só quando nenhuma instância estiver viva). */
export function disposeDinoGeometries() { if (!GEO) return; dinoGeometryList().forEach((g) => g.dispose()); GEO = null; }

const BELLY = 0x8b7b55, BONE = 0xd4c8a4;
const SLOTS = ['body', 'belly', 'accent', 'bone', 'eye'];

export class DinoRig {
  constructor(species, quality = 'medium') {
    const G = dinoGeometries(), boss = !!species.boss, s = species.scale;
    this.species = species; this.quality = quality; this.mats = {}; this.boss = boss; this.s = s;
    this.col = { body: new THREE.Color(species.color).getHex(), accent: new THREE.Color(species.accent).getHex() };
    this.base = { body: 0xffffff, belly: BELLY, accent: this.col.accent, bone: BONE }; this.tinted = false;
    this._meshes = [];
    const mk = (geo, slot, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, null); m.userData.slot = slot; m.position.set(x, y, z); m.castShadow = true; parent.add(m); this._meshes.push(m); return m; };
    const root = this.root = new THREE.Group(); root.scale.setScalar(s); root.userData = { s };
    const rig = this.rig = new THREE.Group(); root.add(rig);
    const torso = this.torso = new THREE.Group(); rig.add(torso);
    this.torsoM = mk(G.torso, 'body', torso); this.belly = mk(G.belly, 'belly', torso); this.dorsal = mk(boss ? G.plates : G.dorsal, 'accent', torso);
    const neck = this.neck = new THREE.Group(); neck.position.set(0, 1.08, -0.58); rig.add(neck);
    this.neckM = mk(G.neck, 'body', neck);
    const head = this.head = new THREE.Group(); head.position.set(0, 0.02, -0.52); neck.add(head);
    this.skull = mk(G.skull, 'body', head); this.crest = mk(boss ? G.crestBoss : G.crest, 'accent', head); this.teeth = mk(G.teeth, 'bone', head);
    this.eyes = mk(G.eyes, 'eye', head); this.eyes.castShadow = false;
    const jaw = this.jaw = new THREE.Group(); jaw.position.set(0, -0.09, -0.03); head.add(jaw);
    this.jawM = mk(G.jaw, 'belly', jaw); mk(G.jawTeeth, 'bone', jaw);
    this.tail = []; let par = rig;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group(); seg.position.set(0, i ? 0 : 0.98, i ? TAIL.len[i - 1] : 0.6); par.add(seg); this.tail.push(seg); mk(G.tail[i], 'body', seg); par = seg;
    }
    this.legsG = new THREE.Group(); root.add(this.legsG); this.legs = []; this.knees = []; this.ankles = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(sx * LEG.hipX, LEG.hipY, LEG.hipZ); this.legsG.add(hip); this.legs.push(hip); mk(G.thigh, 'body', hip);
      const kn = new THREE.Group(); kn.position.y = -LEG.thigh; hip.add(kn); this.knees.push(kn); mk(G.shin, 'body', kn);
      const an = new THREE.Group(); an.position.y = -LEG.shin; kn.add(an); this.ankles.push(an); mk(G.foot, 'body', an); mk(G.claws, 'bone', an);
    }
    if (boss) { // K-1: tronco largo, pescoço grosso, cabeça maior
      this.torsoM.scale.set(1.35, 1.05, 1.3); this.belly.scale.set(1.3, 1.05, 1.3); this.dorsal.scale.set(1, 1.05, 1.3); this.neckM.scale.set(1.5, 1.1, 1.3);
      head.scale.set(1.25, 1.2, 1.15); for (const t of this.tail) t.scale.set(1.3, 1.25, 1);
      for (const l of this.legs) l.scale.set(1.18, 1, 1.18);
    } else if (s < 0.8) head.scale.setScalar(1.18); // juvenil: cabeça proporcionalmente maior
    this._buildMats();
  }
  _buildMats() {
    const q = this.quality, c = this.col;
    const src = {
      body: getMaterial('scales', q, { color: c.body, accent: c.accent }), belly: getMaterial('skin', q, { color: BELLY }), accent: getMaterial('skin', q, { color: c.accent }),
      bone: getMaterial('skin', q, { color: BONE }), eye: getMaterial('emissiveLamp', q, { color: 0xffb02e, emissive: 0xffb02e }),
    };
    for (const k of SLOTS) { const m = src[k].clone(); m.userData = {}; this.mats[k] = m; } // cópia privada: o cache compartilhado nunca é mutado
    this.mats.eye.emissiveIntensity = 0.9; this.eyeHex = -1;
    for (const m of this._meshes) m.material = this.mats[m.userData.slot];
    this._applyColors();
  }
  _applyColors() { for (const k of ['body', 'belly', 'accent', 'bone']) this.mats[k].color.setHex(this.tinted ? (k === 'body' ? 0xdd8a8a : 0xaa5555) : this.base[k]); }
  setTint(on) { if (on !== this.tinted) { this.tinted = on; this._applyColors(); } }
  setEye(hex, k = 0.9) {
    const m = this.mats.eye; if (hex === this.eyeHex && m.emissiveIntensity === k) return; this.eyeHex = hex; m.color.setHex(hex); m.emissive.setHex(hex); m.emissiveIntensity = k;
  }
  setQuality(q) { if (q === this.quality) return; this.quality = q; const old = Object.values(this.mats); this._buildMats(); old.forEach((m) => m.dispose()); }
  /** Libera só o que é da instância (cópias de material); as geometrias são compartilhadas. */
  dispose() { Object.values(this.mats).forEach((m) => m.dispose()); this.mats = {}; }
}
