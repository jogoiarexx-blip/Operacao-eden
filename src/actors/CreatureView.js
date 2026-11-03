import { AI } from './DinosaurAgent.js';
import { K1 } from './K1Agent.js';
import { clamp, wrapAngle } from '../core/math.js';
import { DinoRig, LEG } from './DinoRig.js';

const AIM_STATES = new Set([AI.CHASE, AI.STALK, AI.ATTACK_WINDUP, AI.ATTACK, K1.CHARGE_WINDUP, K1.CHARGE, K1.TAIL_WINDUP]);
const NECK0 = 0.75;                                   // pitch de repouso do pescoço (positivo = levanta a cabeça)
const damp = (cur, tgt, f) => cur + (tgt - cur) * f;

/**
 * Visual de R-4 / R-4J / K-1 (DinoRig) com animação dirigida pelo estado do agente: cauda em onda (5 segmentos), pescoço mirando o alvo,
 * agachamento do telegráfico (cabeça baixa, olhos vermelhos), mordida (mandíbula), investida baixa do K-1, atordoado (cabeça pendendo) e queda
 * ao morrer. Só lê o agente: nada é escrito de volta; hitboxes/tempos/IA ficam no agente. Sem alocação por quadro.
 */
export class CreatureView {
  constructor(agent, quality = 'medium') {
    this.agent = agent; this.rig = new DinoRig(agent.species, quality); this.mesh = this.rig.root;
    this.head = this.rig.head; this.jaw = this.rig.jaw; this.tail = this.rig.tail; this.neck = this.rig.neck;
    this.t = Math.random() * 10; this.deadT = 0; this.first = true;
    this.k = { crouch: 0, stretch: 0, jaw: 0, neck: 0, tail: 0, aim: 0 };
  }
  setQuality(q) { this.rig.setQuality(q); }
  sync(alpha, dt) {
    const a = this.agent, m = this.mesh, R = this.rig, k = this.k, st = a.state;
    this.t += dt;
    m.position.set(a.px + (a.x - a.px) * alpha, 0, a.pz + (a.z - a.pz) * alpha);
    m.rotation.y = a.pYaw + wrapAngle(a.yaw - a.pYaw) * alpha;
    const f = this.first ? 1 : 1 - Math.exp(-dt * 12); this.first = false;
    const spd = clamp(a.speedNow / 3, 0, 1), ph = a.walkPhase * 3, t = this.t;
    // alvos de pose (por estado)
    let crouch = 0, stretch = 0, jaw = 0, neck = 0, tail = 0, tailYaw = 0, eye = 0xffb02e, roll = 0, headRoll = 0, headYaw = 0, scratch = false, twist = 0;
    if (st === AI.ATTACK_WINDUP) { const p = a.windupProgress; crouch = clamp(p * 3, 0, 1); jaw = 0.3 + Math.sin(t * 40) * 0.1 * p; eye = 0xff2a1a; neck = -0.5 * crouch; tail = -0.3 * crouch; m.position.x += Math.sin(t * 60) * 0.015 * p; }
    else if (st === AI.ATTACK) { stretch = 1; jaw = 0.75; eye = 0xff2a1a; neck = -0.45; tail = -0.25; }
    else if (st === AI.STALK) { crouch = 0.45; eye = 0xff8a1a; neck = -0.25; }
    else if (st === AI.STAGGER) { roll = Math.sin(t * 30) * 0.08; eye = 0xffffff; neck = 0.25; jaw = 0.3; headRoll = Math.sin(t * 22) * 0.15; }
    else if (st === K1.CHARGE_WINDUP) { const p = a.windupProgress; crouch = clamp(p * 2.5, 0, 1); eye = 0xff2a1a; neck = -0.65 * crouch; tail = -0.25 * crouch; scratch = true; m.position.x += Math.sin(t * 50) * 0.02 * p; }
    else if (st === K1.CHARGE) { stretch = 0.55; jaw = 0.35; eye = 0xff2a1a; neck = -0.6; tail = -0.15; }
    else if (st === K1.DAZED) { crouch = 0.7; jaw = 0.45; eye = 0x8a8a8a; neck = -1.25; headRoll = Math.sin(t * 4) * 0.25; roll = Math.sin(t * 3) * 0.06; }
    else if (st === K1.TAIL_WINDUP) { const p = a.windupProgress; eye = 0xff2a1a; crouch = 0.3 * p; tailYaw = -0.9 * p + Math.sin(t * 30) * 0.05 * p; tail = 0.25 * p; twist = 0.3 * p; }
    else if (st === AI.RECOVER) { headYaw = Math.sin(t * 14) * 0.4; }
    if (spd > 0.99) neck -= 0.25;                      // corrida: pescoço projetado para frente
    // mira: o pescoço acompanha o último ponto conhecido do alvo
    let aim = 0;
    if (a.lastKnown && !a.dead && AIM_STATES.has(st) && st !== K1.DAZED) aim = clamp(wrapAngle(Math.atan2(-(a.lastKnown.x - a.x), -(a.lastKnown.z - a.z)) - a.yaw), -0.7, 0.7);
    k.crouch = damp(k.crouch, crouch, f); k.stretch = damp(k.stretch, stretch, f); k.jaw = damp(k.jaw, jaw, f); k.neck = damp(k.neck, neck, f); k.tail = damp(k.tail, tail, f); k.aim = damp(k.aim, aim, f);
    const c = k.crouch, s = k.stretch, br = Math.sin(t * 1.6);
    // tronco
    R.rig.position.y = -0.22 * c + Math.abs(Math.sin(ph)) * 0.025 * spd; R.rig.rotation.set(-0.1 * c - 0.3 * s, twist, roll);
    R.torso.scale.y = 1 + 0.015 * br;
    // pernas
    R.legsG.position.y = -0.06 * c;
    for (let i = 0; i < 2; i++) {
      const sw = Math.sin(ph + i * Math.PI) * 0.7 * spd, lift = Math.max(0, Math.cos(ph + i * Math.PI)) * 0.9 * spd;
      let hip = LEG.a0 + 0.25 * c + 0.15 * s + sw, kn = LEG.k0 - 0.5 * c - lift;
      if (scratch && i === 0) { hip = LEG.a0 - 0.2 + Math.sin(t * 16) * 0.55; kn = LEG.k0 - Math.max(0, Math.sin(t * 16)) * 0.5; } else if (scratch) { hip = LEG.a0 + 0.55; kn = LEG.k0 - 0.4; }
      R.legs[i].rotation.x = hip; R.knees[i].rotation.x = kn; R.ankles[i].rotation.x = -(hip + kn);
    }
    // pescoço e cabeça
    R.neck.rotation.set(NECK0 + 0.03 * br + k.neck, k.aim * 0.6, 0); R.neck.position.y = 1.08 - 0.12 * c;
    R.head.rotation.set(-(NECK0 + k.neck) * 0.85 + 0.15 - 0.3 * c + 0.1 * Math.sin(ph * 2) * spd, k.aim * 0.4 + headYaw, headRoll);
    R.jaw.rotation.x = -k.jaw;
    // cauda em onda (5 segmentos encadeados)
    for (let i = 0; i < 5; i++) {
      const seg = R.tail[i];
      seg.rotation.y = Math.sin(t * 2.2 - i * 0.9) * (0.07 + 0.015 * i) + Math.sin(ph - i * 0.7) * 0.07 * spd + tailYaw / 5;
      seg.rotation.x = 0.04 + (i === 0 ? 0.6 : 0.1) * k.tail + (i === 0 ? 0 : Math.sin(t * 1.3 - i * 0.6) * 0.012);
    }
    // olhos: emissivo fraco
    R.setEye(eye, 0.9);
    // acerto: tinge
    R.setTint(a.hurtT > 0);
    // morte: cai de lado, cabeça e cauda moles
    if (a.dead) {
      this.deadT = Math.min(1, this.deadT + dt * 2.2); const d = this.deadT;
      m.rotation.z = d * (Math.PI / 2 - 0.15); m.position.y = -0.05 * d;
      R.legs.forEach((l, i) => { l.rotation.x += (0.5 * (i ? 1 : -1) - l.rotation.x) * d * 0.6; });
      R.neck.rotation.x = NECK0 - 1.1 * d; R.jaw.rotation.x = -0.4 * d; R.tail.forEach((sg, i) => { sg.rotation.y = 0.25 * d * (i + 1) / 5; });
      R.setEye(0x222222, 0);
    }
  }
  dispose() { this.rig.dispose(); }
}
