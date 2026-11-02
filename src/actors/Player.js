import { clamp, damp, wrapAngle } from '../core/math.js';
import { WEAPONS, UTILITY } from '../gameplay/GameState.js';
import { getCharacter, activeInventory } from '../gameplay/Characters.js';

/**
 * Lia — lógica do jogador (sem THREE). Movimento relativo à câmera, strafe ao mirar, esquiva com i-frames,
 * recarga cancelável, uso de itens. Todos os tempos em segundos de SIMULAÇÃO.
 */
export const PLAYER_RADIUS = 0.4;
export const WALK = 3.7, SPRINT = 5.6, AIM_WALK = 2.3, DODGE_SPEED = 7.6;
export const DODGE_T = 0.34, DODGE_IFRAMES = 0.27, DODGE_CD = 0.85, DODGE_BUFFER = 0.12;
const FIRE_BUFFER = 0.1;

export class Player {
  constructor(world) {
    this.world = world;
    this.x = 0; this.z = 36; this.px = 0; this.pz = 36;       // atual e anterior (interpolação)
    this.vx = 0; this.vz = 0; this.yaw = 0; this.pYaw = 0;
    this.hp = 100; this.maxHp = 100; this.dmgMult = 1; this.dodgeCdS = DODGE_CD; this.bleeding = false; this._bleedT = 0; this.dead = false;
    this.aiming = false; this.sprinting = false; this.moving = false; this.speed = 0;
    this.dodgeT = -1; this.dodgeCd = 0; this.dodgeDir = { x: 0, z: -1 }; this.dodgeBuf = 0; this.dodgeId = 0;
    this.fireBuf = 0; this.fireCd = 0; this.reloadT = -1; this.lastFireT = -99; this.utilityCd = 0;
    this.using = null;                      // {kind, t, dur}
    this.weaponId = 'pistol'; this.mag = 12; this.reserve = 24; this.magBonus = 0;
    this.upgrades = []; this.hurtT = 0; this.infiniteAmmo = false;
    this.animTime = 0; this.walkPhase = 0; this.recentShot = false;
  }
  get weapon() { return WEAPONS[this.weaponId]; }
  get magSize() { return this.weapon.magSize + (this.upgrades.includes('mag_ext_1') ? 4 : 0); }
  get invulnerable() { return this.dodgeT >= 0 && this.dodgeT < DODGE_IFRAMES; }
  get dodging() { return this.dodgeT >= 0; }
  get reloading() { return this.reloadT >= 0; }

  teleport(x, z, yaw = this.yaw) { this.x = this.px = x; this.z = this.pz = z; this.yaw = this.pYaw = yaw; this.vx = this.vz = 0; this.dodgeT = -1; this.reloadT = -1; this.using = null; }

  loadFromSave(save) {
    const inv = activeInventory(save), ch = getCharacter(save.playerId);
    this.maxHp = ch.maxHp; this.dmgMult = ch.damageTakenMult; this.dodgeCdS = ch.dodgeCdS;
    this.weaponId = inv.equipped; this.upgrades = [...inv.upgrades];
    this.mag = inv.weapons[this.weaponId]?.mag ?? 0; this.reserve = inv.ammoReserve[this.weaponId] ?? 0;
    this.hp = save.health[save.playerId]; this.bleeding = !!save.bleeding[save.playerId];
    this.infiniteAmmo = !!save.runRules.infiniteAmmo; this.dead = this.hp <= 0;
  }
  writeToSave(save) {
    const inv = activeInventory(save);
    inv.equipped = this.weaponId; inv.weapons[this.weaponId] = { mag: this.mag }; inv.ammoReserve[this.weaponId] = this.reserve;
    save.health[save.playerId] = Math.round(this.hp); save.bleeding[save.playerId] = this.bleeding;
  }

  /** Dispersão atual em graus (alimenta o retículo dinâmico e o disparo). */
  spreadDeg() {
    const w = this.weapon;
    let s = this.aiming ? w.spreadAimDeg : w.spreadHipDeg;
    if (this.aiming && this.upgrades.includes('recoil_stab')) s *= 0.7;
    if (this.speed > 0.6) s += w.spreadMoveDeg * clamp(this.speed / SPRINT, 0, 1) * (this.aiming ? 0.5 : 1);
    return s;
  }

  takeDamage(amount, simMs, bleedChance = 0, rngVal = 1) {
    if (this.dead || this.invulnerable || amount <= 0) return 0;
    amount = Math.max(1, Math.round(amount * this.dmgMult));
    if (this.upgrades.includes('vest_1')) amount = Math.max(1, Math.round(amount * 0.85));
    this.hp = Math.max(0, this.hp - amount); this.hurtT = 0.35;
    if (rngVal < bleedChance) this.bleeding = true;
    if (this.reloadT >= 0 && amount > 0) { /* recarga continua; só esquiva cancela */ }
    if (this.using) this.using = null;                       // dano interrompe o uso de item
    if (this.hp <= 0) this.dead = true;
    return amount;
  }

  /**
   * @param input {moveX, moveY, run, aim, firePressed, fireHeld, dodgePressed, reloadPressed, utilityPressed, medkitPressed, hemoPressed}
   * @returns lista de eventos {type, ...}
   */
  step(dt, simMs, input, camYaw, consumables) {
    const ev = [];
    this.px = this.x; this.pz = this.z; this.pYaw = this.yaw;
    if (this.dead) return ev;
    this.animTime += dt;
    this.fireCd = Math.max(0, this.fireCd - dt); this.dodgeCd = Math.max(0, this.dodgeCd - dt); this.utilityCd = Math.max(0, this.utilityCd - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.dodgeBuf = input.dodgePressed ? DODGE_BUFFER : Math.max(0, this.dodgeBuf - dt);
    this.fireBuf = input.firePressed ? FIRE_BUFFER : Math.max(0, this.fireBuf - dt);

    // sangramento
    if (this.bleeding) { this._bleedT += dt; if (this._bleedT >= 2.5) { this._bleedT = 0; if (this.hp > 10) { this.hp -= 1; ev.push({ type: 'bleedTick' }); } } }

    // esquiva (buffer de ~120 ms)
    if (this.dodgeT >= 0) {
      this.dodgeT += dt;
      this._move(this.dodgeDir.x * DODGE_SPEED, this.dodgeDir.z * DODGE_SPEED, dt, true);
      if (this.dodgeT >= DODGE_T) { this.dodgeT = -1; this.vx = this.dodgeDir.x * WALK * 0.6; this.vz = this.dodgeDir.z * WALK * 0.6; }
      return ev;
    }
    if (this.dodgeBuf > 0 && this.dodgeCd <= 0 && !this.using) {
      this.dodgeBuf = 0; this.dodgeT = 0; this.dodgeCd = this.dodgeCdS; this.dodgeId++;
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      let dx = fx * input.moveY + rx * input.moveX, dz = fz * input.moveY + rz * input.moveX;
      const l = Math.hypot(dx, dz);
      if (l < 0.1) { dx = -fx; dz = -fz; } else { dx /= l; dz /= l; }          // sem direção: salto para trás
      this.dodgeDir = { x: dx, z: dz };
      if (this.reloadT >= 0) { this.reloadT = -1; ev.push({ type: 'reloadCancelled' }); }   // esquiva cancela recarga
      ev.push({ type: 'dodge', id: this.dodgeId });
      return ev;
    }

    // mira / corrida
    this.aiming = !!input.aim && !this.using;
    this.sprinting = !!input.run && !this.aiming && input.moveY > 0.1 && !this.reloading && !this.using;

    // movimento relativo à câmera (A/D = direita/esquerda da tela)
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let dx = fx * input.moveY + rx * input.moveX, dz = fz * input.moveY + rz * input.moveX;
    const inMag = Math.min(1, Math.hypot(input.moveX, input.moveY)), dl = Math.hypot(dx, dz);
    if (dl > 0) { dx /= dl; dz /= dl; }
    let top = this.sprinting ? SPRINT : this.aiming ? AIM_WALK : WALK;
    if (this.using) top *= 0.45;
    if (this.reloading) top *= 0.85;
    const tx = dx * top * inMag, tz = dz * top * inMag;
    const a = damp(dt, 0.07);
    this.vx += (tx - this.vx) * a; this.vz += (tz - this.vz) * a;
    this._move(this.vx, this.vz, dt, false);
    this.speed = Math.hypot(this.vx, this.vz); this.moving = this.speed > 0.4;
    this.walkPhase += this.speed * dt * 1.9;

    // orientação do corpo: tronco acompanha o retículo ao mirar/atirar; senão vira para onde anda
    const shooting = simMs / 1000 - this.lastFireT < 0.45;
    let wantYaw = this.yaw;
    if (this.aiming || shooting) wantYaw = camYaw;
    else if (this.moving) wantYaw = Math.atan2(-this.vx, -this.vz);
    const turn = this.aiming || shooting ? 16 : 10;
    this.yaw += clamp(wrapAngle(wantYaw - this.yaw), -turn * dt, turn * dt);

    // recarga
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      if (this.reloadT * 1000 >= this.weapon.reloadMs) {
        const need = this.magSize - this.mag, take = this.infiniteAmmo ? need : Math.min(need, this.reserve);
        this.mag += take; if (!this.infiniteAmmo) this.reserve -= take; this.reloadT = -1; ev.push({ type: 'reloaded' });
      }
    } else if (input.reloadPressed && this.mag < this.magSize && (this.reserve > 0 || this.infiniteAmmo) && !this.using) {
      this.reloadT = 0; ev.push({ type: 'reloadStart' });
    }

    // uso de itens (kit médico / hemostático)
    if (this.using) {
      this.using.t += dt;
      if (this.using.t >= this.using.dur) {
        const k = this.using.kind; this.using = null;
        if (k === 'medkit') this.hp = Math.min(this.maxHp, this.hp + 45);
        else if (k === 'medkit_adv') this.hp = Math.min(this.maxHp, this.hp + 80);
        else if (k === 'hemostatic') this.bleeding = false;
        ev.push({ type: 'itemUsed', kind: k });
      }
    } else if (!this.reloading && !this.dodging) {
      if (input.medkitPressed) {
        const kind = (consumables.medkit ?? 0) > 0 ? 'medkit' : (consumables.medkit_adv ?? 0) > 0 ? 'medkit_adv' : null;
        if (kind && this.hp < this.maxHp) { this.using = { kind, t: 0, dur: 1.1 }; ev.push({ type: 'itemStart', kind }); }
        else ev.push({ type: 'itemDenied', reason: kind ? 'vida cheia' : 'sem kit médico' });
      } else if (input.hemoPressed) {
        if ((consumables.hemostatic ?? 0) > 0 && this.bleeding) { this.using = { kind: 'hemostatic', t: 0, dur: 0.7 }; ev.push({ type: 'itemStart', kind: 'hemostatic' }); }
        else ev.push({ type: 'itemDenied', reason: this.bleeding ? 'sem hemostático' : 'sem sangramento' });
      }
    }

    // ferramenta elétrica (Q)
    if (input.utilityPressed && this.utilityCd <= 0 && !this.using && !this.reloading) {
      this.utilityCd = UTILITY.electric_tool.cooldownMs / 1000; ev.push({ type: 'utility' });
    }

    // disparo (semiautomática, com buffer de 100 ms)
    if (this.fireBuf > 0 && this.fireCd <= 0 && !this.reloading && !this.using) {
      if (this.mag > 0 || this.infiniteAmmo) {
        this.fireBuf = 0; this.fireCd = this.weapon.fireIntervalMs / 1000; this.lastFireT = simMs / 1000;
        if (!this.infiniteAmmo) this.mag--;
        ev.push({ type: 'fire' });
      } else if (this.reserve > 0) { this.reloadT = 0; ev.push({ type: 'reloadStart' }); this.fireBuf = 0; }
      else { this.fireBuf = 0; this.fireCd = 0.3; ev.push({ type: 'dryFire' }); }
    }
    return ev;
  }

  _move(vx, vz, dt, ghost) {
    const nx = this.x + vx * dt, nz = this.z + vz * dt;
    const r = this.world.resolveCircle(nx, nz, PLAYER_RADIUS);   // empurra para fora do colisor ⇒ desliza em paredes
    this.x = r.x; this.z = r.z; void ghost;
  }

  /** Ruído emitido neste passo (alimenta a audição dos animais). */
  noiseRadius() {
    if (this.dodging) return 7;
    if (this.sprinting) return 10;
    if (this.moving) return this.aiming ? 3 : 6;
    return 0;
  }
  muzzle(facingYaw = this.yaw) {
    const fx = -Math.sin(facingYaw), fz = -Math.cos(facingYaw), rx = Math.cos(facingYaw), rz = -Math.sin(facingYaw);
    return { x: this.x + fx * 0.55 + rx * 0.2, y: 1.28, z: this.z + fz * 0.55 + rz * 0.2 };
  }
}
