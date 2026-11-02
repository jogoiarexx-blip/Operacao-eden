import * as THREE from 'three';
import { clamp } from '../core/math.js';

/** Lia (1,70 m): malha low-poly com animação procedural (idle/walk/run/aim/shoot/reload/dodge/hurt/death). */
export class PlayerView {
  constructor(player) {
    this.player = player;
    const g = this.root = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0xc58b62, flatShading: true });
    const jacket = new THREE.MeshLambertMaterial({ color: 0x2f6f73, flatShading: true });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2b2f3a, flatShading: true });
    const hair = new THREE.MeshLambertMaterial({ color: 0x1d1512, flatShading: true });
    const gear = new THREE.MeshLambertMaterial({ color: 0x3a3d3a, flatShading: true });
    this.mats = [skin, jacket, pants, hair, gear]; this.liaColors = this.mats.map((m) => m.color.getHex()); this.baseColors = this.mats.map((m) => m.color.getHex());
    const body = this.body = new THREE.Group(); g.add(body);
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.26), jacket); this.torso.position.set(0, 1.2, 0); body.add(this.torso);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.16), gear); pack.position.set(0, 1.22, 0.2); body.add(pack);
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), skin); this.head.position.set(0, 1.62, 0); body.add(this.head);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), hair); hairM.position.set(0, 1.64, 0.01); body.add(hairM);
    const tail = this.tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), hair); tail.position.set(0, 1.5, 0.17); tail.rotation.x = 0.4; body.add(tail);
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(sx * 0.12, 0.92, 0); g.add(hip);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.9, 0.2), pants); leg.position.y = -0.45; hip.add(leg);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.14, 0.3), gear); boot.position.set(0, -0.86, -0.04); hip.add(boot);
      this.legs.push(hip);
    }
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * 0.31, 1.42, 0); body.add(sh);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), jacket); arm.position.y = -0.24; sh.add(arm);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), skin); hand.position.y = -0.5; sh.add(hand);
      this.arms.push(sh);
    }
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.3), gear); this.gun.position.set(0, -0.5, -0.14); this.arms[1].add(this.gun);
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd27a })); this.flash.position.set(0, -0.5, -0.34); this.flash.visible = false; this.arms[1].add(this.flash);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.t = 0; this.flashT = 0; this.deadT = 0; this.charId = 'lia';
  }
  /** Lia (padrão) ou Caio: mais largo, jaqueta ocre, cabelo curto, esquiva em rolamento pesado. */
  setCharacter(id) {
    const caio = id === 'caio'; this.charId = caio ? 'caio' : 'lia';
    const cols = caio ? [0x8a5a3c, 0x9a5a22, 0x30343a, 0x120e0c, 0x3a3d3a] : this.liaColors;
    this.mats.forEach((m, i) => m.color.setHex(cols[i])); this.baseColors = cols.slice();
    this.body.scale.set(caio ? 1.25 : 1, caio ? 1.05 : 1, caio ? 1.2 : 1);
    this.legs.forEach((l) => l.scale.set(caio ? 1.2 : 1, 1, caio ? 1.15 : 1));
    this.tail.visible = !caio;
  }
  muzzleFlash() { this.flashT = 0.05; }
  sync(alpha, dt, opacity = 1) {
    const p = this.player, g = this.root;
    this.t += dt;
    g.position.set(p.px + (p.x - p.px) * alpha, 0, p.pz + (p.z - p.pz) * alpha);
    let dy = p.yaw - p.pYaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    g.rotation.y = p.pYaw + dy * alpha;
    const sp = clamp(p.speed / 3.7, 0, 1.5), sw = Math.sin(p.walkPhase * 3.2) * 0.9 * sp;
    this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
    this.body.position.y = Math.abs(Math.sin(p.walkPhase * 3.2)) * 0.04 * sp;
    this.body.rotation.set(0, 0, 0); this.body.rotation.x = p.sprinting ? -0.18 : 0;
    // braços
    const aim = p.aiming || p.simShooting ? 1 : 0;
    this.arms[1].rotation.x = aim ? -1.5 : -0.5 + Math.sin(p.walkPhase * 3.2) * 0.4 * sp * -1;
    this.arms[0].rotation.x = aim ? -1.35 : Math.sin(p.walkPhase * 3.2) * 0.5 * sp;
    this.arms[0].rotation.z = aim ? 0.25 : 0; this.arms[1].rotation.z = 0;
    const sg = p.weaponId === 'shotgun'; this.gun.scale.set(1, 1, sg ? 2.6 : 1); this.gun.position.z = sg ? -0.3 : -0.14; this.flash.position.z = sg ? -0.62 : -0.34;
    if (p.switchT > 0) { this.arms[1].rotation.x = -0.2 - p.switchT * 2; }
    if (p.reloading) { this.arms[0].rotation.x = -0.9; this.arms[1].rotation.x = -0.8; this.arms[0].rotation.z = -0.5; }
    if (p.using) { this.arms[0].rotation.x = -1.1; this.arms[1].rotation.x = -1.0; }
    this.head.position.y = 1.62; this.body.rotation.z = 0;
    // esquiva: rolamento
    g.position.y = 0;
    if (p.dodging) { const k = clamp(p.dodgeT / 0.34, 0, 1), heavy = this.charId === 'caio'; this.body.rotation.x = -k * Math.PI * 2; this.body.position.y = (heavy ? 0.12 : 0.3) * Math.sin(k * Math.PI) - 0.25 + (heavy ? 0.3 : 0.4); if (heavy) this.body.rotation.z = Math.sin(k * Math.PI) * 0.25; this.legs.forEach((l) => { l.rotation.x = -1.2; }); }
    // dano
    const hurt = p.hurtT > 0;
    this.mats.forEach((m, i) => m.color.setHex(hurt && i !== 0 ? 0xcc6666 : this.baseColors[i]));
    if (p.dead) { this.deadT = Math.min(1, this.deadT + dt * 1.8); g.rotation.x = -this.deadT * (Math.PI / 2 - 0.1); g.position.y = 0.12 * this.deadT; }
    else this.deadT = 0, g.rotation.x = 0;
    this.flashT = Math.max(0, this.flashT - dt); this.flash.visible = this.flashT > 0;
    g.visible = opacity > 0.05 || p.dead;
    this.root.traverse((o) => { if (o.isMesh && o.material !== this.flash.material) { o.material.transparent = opacity < 0.99; o.material.opacity = opacity; } });
  }
}
