import * as THREE from 'three';
import { AI } from './DinosaurAgent.js';
import { clamp } from '../core/math.js';

/** Malha low-poly procedural para R-4 / R-4J + animação por estado (telegráfico legível: agacha, cabeça baixa, olhos vermelhos). */
export function buildCreature(species) {
  const root = new THREE.Group();
  const s = species.scale;
  const body = new THREE.MeshLambertMaterial({ color: species.color, flatShading: true });
  const belly = new THREE.MeshLambertMaterial({ color: 0x8b7b55, flatShading: true });
  const accent = new THREE.MeshLambertMaterial({ color: species.accent, flatShading: true });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb02e });
  const mats = [body, belly, accent];

  const rig = new THREE.Group(); root.add(rig);                    // inclinação geral (agachar/estender)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34 * s, 0.75 * s, 4, 8), body); torso.rotation.x = Math.PI / 2; torso.position.set(0, 0.88 * s, 0); rig.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.36 * s, 8, 6), belly); chest.scale.set(0.9, 0.7, 1); chest.position.set(0, 0.78 * s, -0.18 * s); rig.add(chest);
  const neck = new THREE.Group(); neck.position.set(0, 1.0 * s, -0.58 * s); rig.add(neck);
  const neckM = new THREE.Mesh(new THREE.CapsuleGeometry(0.15 * s, 0.4 * s, 3, 6), body); neckM.rotation.x = -0.5; neckM.position.set(0, 0.2 * s, -0.12 * s); neck.add(neckM);
  const head = new THREE.Group(); head.position.set(0, 0.42 * s, -0.3 * s); neck.add(head);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, 0.26 * s, 0.34 * s), body); head.add(skull);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.17 * s, 0.34 * s), body); snout.position.set(0, -0.03 * s, -0.3 * s); head.add(snout);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2 * s, 0.07 * s, 0.34 * s), belly); jaw.position.set(0, -0.14 * s, -0.28 * s); head.add(jaw);
  for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04 * s, 5, 4), eyeMat); eye.position.set(sx * 0.14 * s, 0.05 * s, -0.12 * s); head.add(eye); }
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.1 * s, 0.34 * s), accent); crest.position.set(0, 0.17 * s, 0); head.add(crest);
  for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.14 * s, 0.12 * s), accent); st.position.set(0, 1.2 * s, (-0.35 + i * 0.28) * s); rig.add(st); }   // faixas dorsais
  const tail = new THREE.Group(); tail.position.set(0, 0.92 * s, 0.55 * s); rig.add(tail);
  const tailM = new THREE.Mesh(new THREE.ConeGeometry(0.24 * s, 1.5 * s, 6), body); tailM.rotation.x = -Math.PI / 2; tailM.position.z = 0.75 * s; tail.add(tailM);
  const arms = [];
  for (const sx of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.3 * s, 0.06 * s), body); a.position.set(sx * 0.24 * s, 0.7 * s, -0.5 * s); a.rotation.x = 0.7; rig.add(a); arms.push(a);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.26 * s, 0.78 * s, 0.1 * s); root.add(hip);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13 * s, 0.38 * s, 3, 6), body); thigh.position.y = -0.2 * s; hip.add(thigh);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.4 * s, 0.1 * s), accent); shin.position.set(0, -0.58 * s, 0.05 * s); hip.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.05 * s, 0.3 * s), body); foot.position.set(0, -0.78 * s, -0.06 * s); hip.add(foot);
    legs.push(hip);
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.userData = { rig, neck, head, jaw, tail, legs, arms, mats, eyeMat, body, s };
  return root;
}

export class CreatureView {
  constructor(agent) {
    this.agent = agent; this.mesh = buildCreature(agent.species); this.t = Math.random() * 10; this.deadT = 0;
    this.base = this.mesh.userData.mats.map((m) => m.color.getHex());
  }
  sync(alpha, dt) {
    const a = this.agent, m = this.mesh, u = m.userData;
    this.t += dt;
    m.position.set(a.px + (a.x - a.px) * alpha, 0, a.pz + (a.z - a.pz) * alpha);
    let dy = a.yaw - a.pYaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    m.rotation.y = a.pYaw + dy * alpha;
    // marcha
    const sw = Math.sin(a.walkPhase * 3) * clamp(a.speedNow / 3, 0, 1) * 0.9;
    u.legs[0].rotation.x = sw; u.legs[1].rotation.x = -sw;
    u.tail.rotation.y = Math.sin(this.t * 2.2) * 0.15 + Math.sin(a.walkPhase * 3) * 0.1 * clamp(a.speedNow / 3, 0, 1);
    u.neck.rotation.x = Math.sin(this.t * 1.4) * 0.04 + (a.speedNow > 3 ? 0.18 : 0);
    let crouch = 0, stretch = 0, jaw = 0, eye = 0xffb02e;
    if (a.state === AI.ATTACK_WINDUP) { const p = a.windupProgress; crouch = clamp(p * 3, 0, 1); jaw = 0.3 + Math.sin(this.t * 40) * 0.1 * p; eye = 0xff2a1a; m.position.x += Math.sin(this.t * 60) * 0.015 * p; u.neck.rotation.x = 0.35 * crouch; u.tail.rotation.x = -0.3 * crouch; }
    else if (a.state === AI.ATTACK) { stretch = 1; jaw = 0.7; eye = 0xff2a1a; }
    else if (a.state === AI.STALK) { crouch = 0.45; eye = 0xff8a1a; }
    else if (a.state === AI.STAGGER) { m.rotation.z = Math.sin(this.t * 30) * 0.08; eye = 0xffffff; }
    else if (a.state === AI.RECOVER) { u.head.rotation.y = Math.sin(this.t * 14) * 0.4; }
    else { u.head.rotation.y *= 0.9; m.rotation.z *= 0.8; }
    u.rig.position.y = -0.22 * u.s * crouch; u.rig.rotation.x = 0.18 * crouch - 0.38 * stretch;
    u.jaw.rotation.x = jaw; u.eyeMat.color.setHex(eye);
    // acerto: pisca
    const flash = a.hurtT > 0 ? 1 : 0;
    u.mats.forEach((mt, i) => mt.color.setHex(flash ? 0xaa5555 : this.base[i]));
    // morte
    if (a.dead) {
      this.deadT = Math.min(1, this.deadT + dt * 2.2);
      m.rotation.z = this.deadT * (Math.PI / 2 - 0.15); m.position.y = -0.05 * this.deadT;
      u.legs.forEach((l, i) => { l.rotation.x = 0.5 * (i ? 1 : -1) * this.deadT; }); u.eyeMat.color.setHex(0x222222);
    }
  }
  dispose() { this.mesh.traverse((o) => { o.geometry?.dispose?.(); }); }
}
