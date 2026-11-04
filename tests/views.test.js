import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { PlayerView } from '../src/actors/PlayerView.js';
import { Player } from '../src/actors/Player.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { getMaterial, disposeMaterials } from '../src/render/Materials.js';
import { CreatureView } from '../src/actors/CreatureView.js';
import { DinosaurAgent, AI } from '../src/actors/DinosaurAgent.js';
import { K1Agent, K1 } from '../src/actors/K1Agent.js';
import { dinoGeometryList, disposeDinoGeometries } from '../src/actors/DinoRig.js';
import bestiary from '../src/data/bestiary.json';

const mk = (id = 'lia', q = 'medium') => {
  const p = new Player(new CollisionWorld()); p.teleport(0, 0, 0);
  const v = new PlayerView(p, q); v.setCharacter(id); v.sync(1, 0.016, 1); v.root.updateMatrixWorld(true);
  return { p, v };
};
const settle = (v, n = 40) => { for (let i = 0; i < n; i++) v.sync(1, 0.016, 1); v.root.updateMatrixWorld(true); };
const vis = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
const bodyBox = (v) => { const b = new THREE.Box3(); v.root.updateMatrixWorld(true); v.root.traverse((o) => { if (o.isMesh && o !== v.flash && vis(o)) b.expandByObject(o); }); return b; };
const meshes = (v) => { const a = []; v.root.traverse((o) => { if (o.isMesh) a.push(o); }); return a; };
const uniqGeos = (v) => new Set(meshes(v).map((m) => m.geometry.uuid)).size;
const wp = (o) => o.getWorldPosition(new THREE.Vector3());
afterEach(() => disposeMaterials());

describe('PlayerView: Lia e Caio procedurais', () => {
  it('alturas medidas antes da mudança permanecem (Lia 1,79 / Caio 1,87, cabeça 1,62 / 1,70)', () => {
    // Medido no modelo antigo: Lia 1.79 (Box3), Caio 1.879. O brief pedia 1,65-1,75 / 1,73-1,83, mas as alturas atuais prevalecem.
    const l = mk('lia'), c = mk('caio');
    const hl = bodyBox(l.v).getSize(new THREE.Vector3()).y, hc = bodyBox(c.v).getSize(new THREE.Vector3()).y;
    expect(hl).toBeGreaterThan(1.74); expect(hl).toBeLessThan(1.84);
    expect(hc).toBeGreaterThan(1.82); expect(hc).toBeLessThan(1.92);
    expect(bodyBox(l.v).min.y).toBeGreaterThan(-0.05); expect(bodyBox(l.v).min.y).toBeLessThan(0.03);
    expect(wp(l.v.head).y).toBeCloseTo(1.62, 1); expect(wp(c.v.head).y).toBeCloseTo(1.70, 1);
  });
  it('Caio é mais largo que Lia', () => {
    const wl = bodyBox(mk('lia').v).getSize(new THREE.Vector3()).x, wc = bodyBox(mk('caio').v).getSize(new THREE.Vector3()).x;
    expect(wc).toBeGreaterThan(wl + 0.1);
  });
  it('ponto do cano (Player.muzzle) inalterado e a boca do cano visual fica perto dele', () => {
    const { p, v } = mk('lia');
    expect(p.muzzle(0)).toEqual({ x: 0.2, y: 1.28, z: -0.55 });
    for (const id of ['lia', 'caio']) for (const w of ['pistol', 'shotgun']) {
      const q = mk(id); q.p.aiming = true; q.p.weaponId = w; settle(q.v);
      const f = wp(q.v.flash), m = q.p.muzzle(0);
      expect(Math.hypot(f.x - m.x, f.y - m.y, f.z - m.z)).toBeLessThan(0.16);
    }
    void v;
  });
  it('trocar de personagem 5x não aumenta geometrias únicas', () => {
    const { v } = mk('lia'); const n0 = uniqGeos(v), c0 = meshes(v).length;
    for (let i = 0; i < 5; i++) { v.setCharacter('caio'); v.setCharacter('lia'); }
    expect(uniqGeos(v)).toBe(n0); expect(meshes(v).length).toBe(c0);
    const other = mk('caio'); expect(uniqGeos(other.v)).toBe(n0); // instâncias compartilham geometrias
  });
  it('malha tem detalhe (cabelo, colete, mochila) e todos os corpos projetam sombra', () => {
    const { v } = mk('lia'); const ms = meshes(v).filter((m) => m !== v.flash);
    expect(ms.length).toBeGreaterThanOrEqual(18); expect(ms.length).toBeLessThanOrEqual(40);
    expect(ms.every((m) => m.castShadow)).toBe(true);
  });
  it('materiais compartilhados do cache nunca são mutados (opacidade, dano)', () => {
    const { p, v } = mk('lia'); const cloth = getMaterial('cloth', 'medium', { color: 0x2f6f73 }), c0 = cloth.color.getHex();
    p.hurtT = 0.3; v.sync(1, 0.016, 0.3);
    expect(cloth.transparent).toBe(false); expect(cloth.opacity).toBe(1); expect(cloth.color.getHex()).toBe(c0);
    expect(meshes(v).filter((m) => m !== v.flash).every((m) => !m.material.userData.shared)).toBe(true);
    expect(meshes(v).some((m) => m.material.opacity < 0.5)).toBe(true);
  });
  it('qualidade: Lambert no Baixo, Standard no Médio/Alto; dispose libera as cópias', () => {
    const { v } = mk('lia', 'low');
    expect(v.torso.material.isMeshLambertMaterial).toBe(true);
    v.setQuality('medium'); expect(v.torso.material.isMeshStandardMaterial).toBe(true);
    let n = 0; const old = v.torso.material; old.addEventListener('dispose', () => n++);
    v.setQuality('high'); expect(n).toBe(1); expect(v.torso.material).not.toBe(old);
    const cur = v.torso.material; let d = 0; cur.addEventListener('dispose', () => d++); v.dispose(); expect(d).toBe(1);
  });
  it('recuo: muzzleFlash dobra a arma e decai; sem efeito na lógica do jogador', () => {
    const { p, v } = mk('lia'); p.aiming = true; settle(v);
    const r0 = v.gun.rotation.x; const snap = JSON.stringify([p.x, p.z, p.yaw, p.hp]);
    v.muzzleFlash(); v.sync(1, 0.016, 1); const r1 = v.gun.rotation.x;
    expect(r1).toBeGreaterThan(r0 + 0.01);
    for (let i = 0; i < 30; i++) v.sync(1, 0.016, 1);
    expect(v.gun.rotation.x).toBeCloseTo(r0, 2); expect(JSON.stringify([p.x, p.z, p.yaw, p.hp])).toBe(snap);
  });
  it('esquiva: rolamento mantém o corpo acima do chão e termina na pose original', () => {
    for (const id of ['lia', 'caio']) {
      const { p, v } = mk(id); let minY = 9;
      for (let k = 0; k <= 10; k++) { p.dodgeT = 0.34 * (k / 10); v.sync(1, 0.016, 1); minY = Math.min(minY, bodyBox(v).min.y); }
      expect(minY).toBeGreaterThan(-0.2);
      p.dodgeT = -1; v.sync(1, 0.016, 1); expect(bodyBox(v).min.y).toBeGreaterThan(-0.05);
    }
  });
  it('morte inclina a raiz como antes (para frente, 90 graus menos 0,1)', () => {
    const { p, v } = mk('lia'); p.dead = true; for (let i = 0; i < 80; i++) v.sync(1, 0.016, 1);
    expect(v.root.rotation.x).toBeCloseTo(-(Math.PI / 2 - 0.1), 2); expect(v.root.position.y).toBeCloseTo(0.12, 2);
  });
});

// Medidos no modelo antigo (Box3 da malha em repouso) antes da troca: altura / largura / comprimento.
const OLD = { forest_runner: { h: 1.665, w: 0.745, l: 3.4 }, forest_runner_juvenile: { h: 0.966, w: 0.432, l: 1.972 }, containment_alpha: { h: 3.448, w: 1.744, l: 6.46 } };
const mkDino = (id, q = 'medium') => {
  const sp = bestiary.species[id], A = sp.boss ? K1Agent : DinosaurAgent;
  const agent = new A({ id: 'd', encounterId: 'e', species: sp, pos: [3, 4], patrol: [[3, 4], [8, 4]], yaw: 0.4 });
  const v = new CreatureView(agent, q); for (let i = 0; i < 30; i++) v.sync(1, 0.016); v.mesh.updateMatrixWorld(true); return { agent, v };
};
const dBox = (v) => { v.mesh.updateMatrixWorld(true); return new THREE.Box3().setFromObject(v.mesh); };
const dMeshes = (v) => { const a = []; v.mesh.traverse((o) => { if (o.isMesh) a.push(o); }); return a; };

describe('CreatureView: dinossauros procedurais', () => {
  for (const id of Object.keys(OLD)) {
    it(`${id}: altura dentro de ±15% da versão antiga e pés no chão`, () => {
      const { v } = mkDino(id); const b = dBox(v), sz = b.getSize(new THREE.Vector3());
      expect(sz.y).toBeGreaterThan(OLD[id].h * 0.85); expect(sz.y).toBeLessThan(OLD[id].h * 1.15);
      expect(sz.z).toBeGreaterThan(OLD[id].l * 0.8); expect(sz.z).toBeLessThan(OLD[id].l * 1.2); // referência: comprimento total
      expect(b.min.y).toBeGreaterThan(-0.08); expect(b.min.y).toBeLessThan(0.06);
    });
  }
  it('K-1 é maior que R-4, que é maior que R-4J; K-1 mais largo em proporção', () => {
    const h = (id) => dBox(mkDino(id).v).getSize(new THREE.Vector3()).y;
    expect(h('containment_alpha')).toBeGreaterThan(h('forest_runner') * 1.7); expect(h('forest_runner')).toBeGreaterThan(h('forest_runner_juvenile') * 1.5);
    expect(dBox(mkDino('containment_alpha').v).getSize(new THREE.Vector3()).x / 1.9).toBeGreaterThan(dBox(mkDino('forest_runner').v).getSize(new THREE.Vector3()).x);
  });
  it('cauda com 5 segmentos encadeados; mandíbula e cabeça existem; todos os corpos projetam sombra', () => {
    for (const id of Object.keys(OLD)) {
      const { v } = mkDino(id);
      expect(v.tail.length).toBe(5); expect(v.tail[0].parent).toBe(v.rig.rig);
      for (let i = 1; i < 5; i++) expect(v.tail[i].parent).toBe(v.tail[i - 1]);
      expect(v.jaw.parent).toBe(v.head);
      const ms = dMeshes(v).filter((m) => m !== v.rig.eyes); expect(ms.every((m) => m.castShadow)).toBe(true);
      expect(dMeshes(v).length).toBeLessThanOrEqual(26);
    }
  });
  it('cauda ondula: os segmentos giram com defasagem', () => {
    const { v } = mkDino('forest_runner'); const ys = v.tail.map((s) => s.rotation.y);
    expect(new Set(ys.map((y) => y.toFixed(3))).size).toBeGreaterThan(3);
  });
  it('geometrias compartilhadas: 12 instâncias não criam geometrias novas', () => {
    const uniq = (vs) => new Set(vs.flatMap((v) => dMeshes(v).map((m) => m.geometry.uuid))).size;
    const one = mkDino('forest_runner').v, n1 = uniq([one]), list0 = dinoGeometryList().length;
    const many = Array.from({ length: 12 }, (_, i) => mkDino(i % 3 === 0 ? 'forest_runner' : 'forest_runner_juvenile').v);
    expect(uniq(many)).toBe(n1); expect(dinoGeometryList().length).toBe(list0);
    const boss = mkDino('containment_alpha').v; expect(uniq([boss])).toBe(n1); // K-1 troca só crista/placas por versões próprias
  });
  it('materiais: cópias privadas; cache compartilhado nunca é mutado (dano, estados, morte)', () => {
    const sp = bestiary.species.forest_runner, col = new THREE.Color(sp.color).getHex(), acc = new THREE.Color(sp.accent).getHex();
    const sc = getMaterial('scales', 'medium', { color: col, accent: acc }), eyeSrc = getMaterial('emissiveLamp', 'medium', { color: 0xffb02e, emissive: 0xffb02e });
    const c0 = sc.color.getHex(), e0 = eyeSrc.emissive.getHex(), ei0 = eyeSrc.emissiveIntensity;
    const { agent, v } = mkDino('forest_runner');
    expect(dMeshes(v).every((m) => m.material && !m.material.userData.shared)).toBe(true);
    expect(v.rig.mats.body.map).toBe(sc.map); // mesma textura 'scales' com faixas do accent
    expect(v.rig.mats.eye.emissiveIntensity).toBeLessThan(2); // olhos fracos
    agent.hurtT = 0.1; agent.state = AI.ATTACK_WINDUP; agent.windupProgress = 0.9; v.sync(1, 0.016);
    expect(v.rig.mats.body.color.getHex()).not.toBe(0xffffff);
    agent.dead = true; for (let i = 0; i < 40; i++) v.sync(1, 0.016);
    expect(sc.color.getHex()).toBe(c0); expect(eyeSrc.emissive.getHex()).toBe(e0); expect(eyeSrc.emissiveIntensity).toBe(ei0);
    expect(sc.userData.shared).toBe(true);
  });
  it('qualidade: Lambert no Baixo, Standard no Médio; troca recria e libera cópias; dispose libera as cópias, não as geometrias compartilhadas', () => {
    const { v } = mkDino('forest_runner', 'low');
    expect(v.rig.mats.body.isMeshLambertMaterial).toBe(true);
    const old = v.rig.mats.body; let n = 0; old.addEventListener('dispose', () => n++);
    v.setQuality('medium'); expect(n).toBe(1); expect(v.rig.mats.body).not.toBe(old); expect(v.rig.mats.body.isMeshStandardMaterial).toBe(true);
    expect(dMeshes(v).every((m) => m.material === v.rig.mats[m.userData.slot])).toBe(true);
    const mats = Object.values(v.rig.mats); let d = 0, g = 0; mats.forEach((m) => m.addEventListener('dispose', () => d++));
    const geos = dinoGeometryList(); geos.forEach((x) => x.addEventListener('dispose', () => g++));
    v.dispose(); expect(d).toBe(mats.length); expect(g).toBe(0);
  });
  it('disposeDinoGeometries libera as geometrias do módulo e elas são recriadas sob demanda', () => {
    const geos = dinoGeometryList(); let g = 0; geos.forEach((x) => x.addEventListener('dispose', () => g++));
    disposeDinoGeometries(); expect(g).toBe(geos.length);
    const { v } = mkDino('forest_runner'); expect(dMeshes(v).length).toBeGreaterThan(10);
  });
  it('estados guiam a pose: agachar, investida baixa, atordoado pende a cabeça, morte tomba; agente e hitboxes intactos', () => {
    const sp = bestiary.species.containment_alpha, hit0 = JSON.stringify(sp.hit), hr0 = sp.hurtRadius;
    const { agent, v } = mkDino('containment_alpha'); const y0 = v.rig.rig.position.y, n0 = v.rig.neck.rotation.x;
    agent.state = K1.CHARGE_WINDUP; agent.windupProgress = 1; const s0 = JSON.stringify([agent.x, agent.z, agent.yaw, agent.hp, agent.hurtT]); for (let i = 0; i < 40; i++) v.sync(1, 0.016);
    expect(v.rig.rig.position.y).toBeLessThan(y0 - 0.1); expect(v.rig.neck.rotation.x).toBeLessThan(n0 - 0.3); expect(v.rig.eyeHex).toBe(0xff2a1a);
    agent.state = K1.CHARGE; agent.speedNow = 12; for (let i = 0; i < 40; i++) v.sync(1, 0.016); expect(v.rig.rig.rotation.x).toBeLessThan(-0.1);
    agent.speedNow = 0; agent.state = K1.DAZED; for (let i = 0; i < 60; i++) v.sync(1, 0.016);
    expect(v.rig.neck.rotation.x).toBeLessThan(n0 - 0.9); expect(v.rig.eyeHex).toBe(0x8a8a8a);
    expect(JSON.stringify([agent.x, agent.z, agent.yaw, agent.hp, agent.hurtT])).toBe(s0);
    agent.dead = true; for (let i = 0; i < 80; i++) v.sync(1, 0.016);
    expect(v.mesh.rotation.z).toBeCloseTo(Math.PI / 2 - 0.15, 2);
    expect(JSON.stringify(sp.hit)).toBe(hit0); expect(sp.hurtRadius).toBe(hr0);
  });
  it('pescoço mira o alvo conhecido', () => {
    const { agent, v } = mkDino('forest_runner'); agent.yaw = agent.pYaw = 0; agent.state = AI.CHASE;
    agent.lastKnown = { x: agent.x - 4, z: agent.z - 4 };
    for (let i = 0; i < 40; i++) v.sync(1, 0.016);
    expect(Math.abs(v.rig.neck.rotation.y)).toBeGreaterThan(0.1);
    agent.state = AI.PATROL; agent.lastKnown = null; for (let i = 0; i < 60; i++) v.sync(1, 0.016); expect(Math.abs(v.rig.neck.rotation.y)).toBeLessThan(0.02);
  });
});

describe('Regina (GLB) sob a iluminação nova', () => {
  it('compensa a cor dos materiais só com lanterna (Médio/Alto), preserva a base e o clarão sem luz', async () => {
    const { REGINA_FLASHLIGHT_ALBEDO } = await import('../src/actors/PlayerView.js');
    const v = new PlayerView(new Player(new CollisionWorld([-10, -10, 10, 10])), 'low');
    const skin = new THREE.MeshStandardMaterial({ color: 0xd0a080 }), flash = new THREE.MeshBasicMaterial({ color: 0xffdd9b });
    const model = new THREE.Group(); model.add(new THREE.Mesh(new THREE.BoxGeometry(), skin), new THREE.Mesh(new THREE.BoxGeometry(), flash));
    v.regina.model = model;                       // simula o GLB carregado
    const base = skin.color.clone();
    v.setQuality('high');
    const [mSkin, mFlash] = model.children.map((o) => o.material);
    expect(mSkin).not.toBe(skin);                 // clonado: o material original do GLB não é tocado
    expect(mSkin.color.r).toBeCloseTo(base.r * REGINA_FLASHLIGHT_ALBEDO);
    expect(mFlash.color.getHex()).toBe(0xffdd9b);
    v.setQuality('low'); expect(mSkin.color.r).toBeCloseTo(base.r);
    v.setQuality('medium'); v.setQuality('medium'); expect(mSkin.color.r).toBeCloseTo(base.r * REGINA_FLASHLIGHT_ALBEDO);   // não acumula
  });
});
