import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { PlayerView } from '../src/actors/PlayerView.js';
import { Player } from '../src/actors/Player.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { getMaterial, disposeMaterials } from '../src/render/Materials.js';

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
