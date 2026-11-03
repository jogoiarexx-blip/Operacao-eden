import * as THREE from 'three';
import { clamp } from '../core/math.js';
import weaponsData from '../data/weapons.json';
import { HumanRig } from './HumanRig.js';

const NEG_Y = new THREE.Vector3(0, -1, 0), DOWN = NEG_Y;
const _d = new THREE.Vector3(), _u = new THREE.Vector3(), _ax = new THREE.Vector3(), _xw = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qt = new THREE.Quaternion();
const mix = (a, b, t) => a + (b - a) * t;
const RAD = Math.PI / 180;

/** Cinemática inversa de 2 ossos no espaço da coluna: ombro `sh` (posição S) e cotovelo `el` alcançam o alvo T (clamp ao alcance). */
function solveArm(sh, el, T, L1, L2) {
  _d.copy(T).sub(sh.position); let D = _d.length(); if (D < 1e-5) return; _d.divideScalar(D);
  D = clamp(D, Math.abs(L1 - L2) + 0.02, (L1 + L2) * 0.999);
  const e = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
  const a = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
  _ax.crossVectors(_d, DOWN); if (_ax.lengthSq() < 1e-6) _ax.set(1, 0, 0); _ax.normalize();
  _u.copy(_d).applyAxisAngle(_ax, a);
  sh.quaternion.setFromUnitVectors(NEG_Y, _u);
  // alinha o eixo x local (eixo do cotovelo) com o normal do plano do braço
  _n.copy(_ax).negate(); _xw.set(1, 0, 0).applyQuaternion(sh.quaternion);
  const phi = Math.atan2(_u.dot(_c.crossVectors(_xw, _n)), _xw.dot(_n));
  sh.quaternion.premultiply(_qt.setFromAxisAngle(_u, phi)); el.rotation.x = e;
}

/** Lia (1,70 m) e Caio: rig procedural (HumanRig) com animação (respiração, passada, mira alinhada à arma, recuo, rolamento, dano). Só visual. */
export class PlayerView {
  constructor(player, quality = 'medium') {
    this.player = player; const rig = this.rig = new HumanRig(quality);
    this.root = rig.root; this.body = rig.body; this.torso = rig.chest; this.head = rig.head; this.arms = rig.arms; this.legs = rig.legs; this.gun = rig.gun; this.flash = rig.flash;
    this.t = 0; this.flashT = 0; this.deadT = 0; this.charId = 'lia'; this.recoil = 0; this.kick = 0; this.first = true;
    this.k = { aim: 0, sprint: 0, tuck: 0, reload: 0 }; this.tgt = new THREE.Vector3(); this.pt = new THREE.Vector3();
  }
  /** Lia (padrão) ou Caio: mais largo, ombreiras, jaqueta ocre, cabelo curto, esquiva em rolamento pesado. */
  setCharacter(id) { this.rig.setCharacter(id); this.charId = this.rig.charId; this.first = true; }
  /** Troca de qualidade (Game.applySettings): as cópias dos materiais são recriadas a partir de getMaterial na hora. */
  setQuality(q) { this.rig.setQuality(q); }
  dispose() { this.rig.dispose(); }
  muzzleFlash() { this.flashT = 0.05; this.recoil = 1; this.kick = (weaponsData.weapons[this.player.weaponId]?.recoilKickDeg ?? 1) * RAD; }
  sync(alpha, dt, opacity = 1) {
    const p = this.player, g = this.root, R = this.rig, P = R.P, k = this.k;
    this.t += dt;
    g.position.set(p.px + (p.x - p.px) * alpha, 0, p.pz + (p.z - p.pz) * alpha);
    let dy = p.yaw - p.pYaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    g.rotation.y = p.pYaw + dy * alpha;
    const sg = p.weaponId === 'shotgun', sp = clamp(p.speed / 3.7, 0, 1.5), ph = p.walkPhase * 3.2, sw = Math.sin(ph) * 0.9 * sp;
    const dodging = p.dodging, aim = p.aiming || p.simShooting ? 1 : 0;
    // alvos de pose suavizados (só visual)
    const f = this.first ? 1 : 1 - Math.exp(-dt * 16); this.first = false;
    k.aim += ((aim && !dodging ? 1 : 0) - k.aim) * f; k.sprint += ((p.sprinting ? 1 : 0) - k.sprint) * f;
    k.tuck += (((p.using || dodging) ? 1 : 0) - k.tuck) * f; k.reload += ((p.reloading && !p.using ? 1 : 0) - k.reload) * f;
    this.recoil = Math.max(0, this.recoil - dt * 9); const rc = this.recoil, rk = this.kick;
    // pernas (passada + joelhos) e quadril
    R.legs[0].rotation.x = sw; R.legs[1].rotation.x = -sw;
    R.knees[0].rotation.x = -Math.max(0, Math.cos(ph)) * 0.9 * sp - 0.04; R.knees[1].rotation.x = -Math.max(0, Math.cos(ph + Math.PI)) * 0.9 * sp - 0.04;
    R.body.position.y = R.hipY + Math.abs(Math.sin(ph)) * 0.04 * sp - 0.03 * k.aim;
    R.body.rotation.set(0, 0, 0);
    // coluna: respiração, inclinação, torção da passada, recuo, dano
    const breath = Math.sin(this.t * 1.9), calm = 1 - Math.min(1, sp) * 0.6, hurt = clamp(p.hurtT / 0.35, 0, 1);
    R.spine.rotation.set(-(0.18 * k.sprint + 0.05 * Math.min(sp, 1)) + 0.012 * breath * calm + rc * rk * 3 + 0.22 * hurt, Math.sin(ph) * 0.12 * sp * (1 - 0.7 * k.aim), Math.sin(this.t * 45) * 0.05 * hurt);
    R.chest.scale.y = 1 + 0.014 * breath * calm; R.headG.rotation.set(-R.spine.rotation.x * 0.7 + 0.2 * hurt, -R.spine.rotation.y * 0.8, 0);
    // arma: poses ready -> sprint -> mira -> recarga -> guardada (uso/esquiva), com recuo e troca
    const gun = R.gun, lerpPose = (t, x, y, z, pitch, roll) => { gun.position.set(mix(gun.position.x, x, t), mix(gun.position.y, y, t), mix(gun.position.z, z, t)); gun.rotation.x = mix(gun.rotation.x, pitch, t); gun.rotation.z = mix(gun.rotation.z, roll, t); };
    gun.position.set(0.17, 0.2, -0.22); gun.rotation.set(sg ? -0.55 : -0.65, 0, 0);
    lerpPose(k.sprint, 0.2, 0.1, -0.12, -1.1, 0.15); lerpPose(k.aim, 0.13, 0.36, sg ? -0.25 : -0.38, 0, 0);
    lerpPose(k.reload, 0.1, 0.3, -0.25, 0.45, 0.35); lerpPose(k.tuck, 0.15, 0.05, -0.1, -1.4, 0);
    const sk = clamp(p.switchT * 3, 0, 1); gun.position.y -= 0.25 * sk; gun.rotation.x -= 0.8 * sk;
    gun.position.y += Math.sin(this.t * 1.7) * 0.003 + Math.sin(ph * 2) * 0.01 * sp * (1 - k.aim); gun.position.z += rc * (sg ? 0.07 : 0.035); gun.rotation.x += rc * rk * 6;
    R.pistol.visible = !sg; R.shotgun.visible = sg; R.flash.position.set(0, 0, sg ? -0.33 : -0.2);
    gun.updateMatrix();
    // mãos: direita na empunhadura, esquerda no apoio (ou no carregador ao recarregar)
    this.tgt.set(0, 0, 0).applyMatrix4(gun.matrix); solveArm(R.arms[1], R.elbows[1], this.tgt, R.armL1, R.armL2);
    this.pt.set(sg ? 0 : -0.03, sg ? -0.04 : -0.075, sg ? -0.16 : 0.02).applyMatrix4(gun.matrix);
    if (k.reload > 0.01) this.pt.lerp(this.tgt.set(0.0, 0.2 + Math.sin(this.t * 9) * 0.02, -0.22), k.reload);
    solveArm(R.arms[0], R.elbows[0], this.pt, R.armL1, R.armL2);
    // esquiva: rolamento (Caio mais pesado, mais baixo e com balanço)
    g.position.y = 0;
    if (dodging) {
      const kk = clamp(p.dodgeT / 0.34, 0, 1), heavy = this.charId === 'caio', s = Math.min(1, Math.sin(kk * Math.PI) * 2.2);
      R.body.rotation.x = -kk * Math.PI * 2; if (heavy) R.body.rotation.z = Math.sin(kk * Math.PI) * 0.25;
      R.body.position.y = mix(R.hipY, heavy ? 0.78 : 0.74, s) + (heavy ? 0.05 : 0.12) * Math.sin(kk * Math.PI);
      R.spine.rotation.x -= 1.2 * s; R.legs.forEach((l) => { l.rotation.x = 1.4 * s; }); R.knees.forEach((n) => { n.rotation.x = -1.9 * s; });
    }
    R.setTint(p.hurtT > 0);
    if (p.dead) { this.deadT = Math.min(1, this.deadT + dt * 1.8); g.rotation.x = -this.deadT * (Math.PI / 2 - 0.1); g.position.y = 0.12 * this.deadT; }
    else this.deadT = 0, g.rotation.x = 0;
    this.flashT = Math.max(0, this.flashT - dt); this.flash.visible = this.flashT > 0;
    g.visible = opacity > 0.05 || p.dead; R.setOpacity(opacity);
  }
}
