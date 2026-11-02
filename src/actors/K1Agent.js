import { clamp } from '../core/math.js';
import { PLAYER_RADIUS } from './Player.js';
import { DinosaurAgent, AI } from './DinosaurAgent.js';

/**
 * Minichefe K-1 "Alfa de contenção" (Cap. 02, design §6). Padrões telegrafados:
 * investida (agacha e raspa, corre em linha reta travada; bate em parede/cobertura → DAZED com cabeça exposta ×3),
 * mordida (ataque base da espécie), varredura de cauda (fase ≥2, jogador atrás >1,5 s) e memória de posição
 * (jogador no mesmo raio de 2 m por >6 s → flanco a 90° em vez de investida).
 * Fases: 1 (>60 %), 2 (≤60 %: cauda + investida −15 %), 3 (≤25 %: ruge uma vez, bus `k1Roar`).
 * Todos os telegráficos passam por `diffMgr.warningMs` (warningMult + pisos MIN_REACTION_MS / minWarningMs).
 */
export const K1 = Object.freeze({ CHARGE_WINDUP: 'CHARGE_WINDUP', CHARGE: 'CHARGE', DAZED: 'DAZED', TAIL_WINDUP: 'TAIL_WINDUP' });
const OWN = new Set([AI.CHASE, K1.CHARGE_WINDUP, K1.CHARGE, K1.DAZED, K1.TAIL_WINDUP]);

export class K1Agent extends DinosaurAgent {
  constructor(opts) {
    super(opts);
    this.cfg = this.species.k1;
    this.roared = false; this.dazeImmuneUntil = 0; this.chargeReadyAt = 0; this.chargeRun = null; this.dazeCause = null;
    this.behindMs = 0; this.memAnchor = null; this.memSince = 0; this.flank = null; this.moveMode = 'approach';
  }
  get hpFrac() { return Math.max(0, this.hp) / this.maxHp; }
  get phase() { const f = this.hpFrac, [p2, p3] = this.cfg.phases; return f > p2 ? 1 : f > p3 ? 2 : 3; }
  /** Caixas de acerto: atordoado, a cabeça desce e fica exposta. */
  get hitBoxes() { return this.state === K1.DAZED ? { ...this.species.hit, head: this.cfg.dazedHead } : this.species.hit; }
  chargeWindupMs(diffMgr, diffId) {
    const c = this.cfg.charge;
    return diffMgr.warningMs(c.windupMs * (this.phase >= 2 ? c.phase2Mult : 1), diffId);
  }
  tailWindupMs(diffMgr, diffId) { return diffMgr.warningMs(this.cfg.tail.windupMs, diffId); }

  update(dt, ctx) {
    if (this.dead || this.scripted || !OWN.has(this.state)) {
      super.update(dt, ctx);
      if (!this.dead) this._track(dt, ctx);
      return;
    }
    const { player, world, coordinator, diff, diffMgr, bus, sim, allies } = ctx;
    this.px = this.x; this.pz = this.z; this.pYaw = this.yaw;
    this.stateT += dt * 1000; this.hurtT = Math.max(0, this.hurtT - dt);
    const sp = this.species, ch = this.cfg.charge;
    const distP = Math.hypot(player.x - this.x, player.z - this.z);
    const sees = !player.dead && this.canSee(player, world);
    if (sees) { this.lastKnown = { x: player.x, z: player.z }; this.lastSeenAt = sim; }
    this._track(dt, ctx);

    switch (this.state) {
      case AI.CHASE: {
        if (player.dead) { this.flank = null; this.setState(AI.SEARCH, 2000); break; }
        if (!sees && sim - this.lastSeenAt > 5000) { this.flank = null; this.noiseTarget = this.lastKnown ?? { x: this.x, z: this.z }; this.setState(AI.SEARCH, 3500); break; }
        const tgt = sees ? player : (this.lastKnown ?? player);
        if (this.phase >= 2 && this.behindMs > this.cfg.tail.behindMs) { this._beginTail(ctx); break; }
        if (sees && distP <= sp.attack.triggerRange && coordinator.request(this)) {
          this.flank = null; this._move('bite', ctx); this._beginWindup(player, diffMgr, diff, bus); break;
        }
        if (this.flank) {
          const d = this._steer(this.flank.x, this.flank.z, sp.chaseSpeed, dt, world);
          if (d < 1.5 || sim >= this.flank.until) { this.flank = null; this.memSince = sim; }
          break;
        }
        if (sees && this.memAnchor && sim - this.memSince > this.cfg.memory.ms) { this._beginFlank(ctx); break; }
        if (sees && distP >= ch.minRange && distP <= ch.maxRange && sim >= this.chargeReadyAt) { this._beginChargeWindup(ctx); break; }
        this._steer(tgt.x, tgt.z, sp.chaseSpeed, dt, world);
        break;
      }
      case K1.CHARGE_WINDUP: {
        const p = clamp(this.stateT / this.windupMs, 0, 1);
        this.windupProgress = p; this.speedNow = 0;
        if (p < ch.lockAt && !player.dead) this._faceTarget(player.x, player.z, dt, 1.6);   // depois do travamento a linha não muda ⇒ esquiva lateral evita
        if (p >= 1) this.startChargeRun(ctx, this.yaw, this.attackId);
        break;
      }
      case K1.CHARGE: this._chargeStep(dt, ctx); break;
      case K1.DAZED: {
        this.speedNow = 0; this.vulnerable = true;
        if (this.stateT >= this.stateDur) {
          this.vulnerable = false; this.dazeImmuneUntil = sim + ch.dazedImmuneMs;
          this.lastKnown = { x: player.x, z: player.z }; this.lastSeenAt = sim; this.setState(AI.CHASE);
        }
        break;
      }
      case K1.TAIL_WINDUP: {
        this.windupProgress = clamp(this.stateT / this.windupMs, 0, 1); this.speedNow = 0;
        if (this.stateT >= this.windupMs) this._tailSweep(ctx);
        break;
      }
      default: break;
    }
    this._separate(allies, world);
  }

  /** Temporizadores de percepção: jogador atrás (cauda) e memória de posição (flanco). */
  _track(dt, ctx) {
    const { player, sim } = ctx;
    const dx = player.x - this.x, dz = player.z - this.z, d = Math.hypot(dx, dz) || 1;
    const dot = (dx * -Math.sin(this.yaw) + dz * -Math.cos(this.yaw)) / d;
    this.behindMs = !player.dead && d < this.cfg.tail.reach + 1.5 && dot < -0.5 ? this.behindMs + dt * 1000 : 0;
    if (!this.alerted || player.dead) { this.memAnchor = null; return; }
    const m = this.memAnchor;
    if (!m || Math.hypot(player.x - m.x, player.z - m.z) > this.cfg.memory.radius) { this.memAnchor = { x: player.x, z: player.z }; this.memSince = sim; }
  }
  _move(mode, ctx) { this.moveMode = mode; ctx.bus.emit('k1Move', { id: this.id, encounterId: this.encounterId, mode }); }

  _beginFlank(ctx) {
    const { player, world, sim } = ctx;
    const vx = this.x - player.x, vz = this.z - player.z, d = Math.hypot(vx, vz) || 1, r = clamp(d, 6, 10), s = this.circleDir;
    let fx = player.x + (-vz / d) * s * r, fz = player.z + (vx / d) * s * r;                // 90° do vetor jogador→K-1
    const [bx0, bz0, bx1, bz1] = world.bounds, pad = this.radius + 0.5;
    fx = clamp(fx, bx0 + pad, bx1 - pad); fz = clamp(fz, bz0 + pad, bz1 - pad);
    this.flank = { x: fx, z: fz, until: sim + this.cfg.memory.flankMs };
    this.circleDir = -this.circleDir;
    this._move('flank', ctx);
  }

  _beginChargeWindup(ctx) {
    const { diffMgr, diff, bus } = ctx;
    this.attackSeq++; this.attackId = `${this.id}#${this.attackSeq}`; this.hitThisAttack = false;
    this.windupMs = this.chargeWindupMs(diffMgr, diff.id);
    this.setState(K1.CHARGE_WINDUP, this.windupMs);
    this._move('charge', ctx);
    bus.emit('windupStart', { id: this.id, attackId: this.attackId, ms: this.windupMs, x: this.x, z: this.z, kind: 'charge' });
  }
  /** Corrida travada na direção `yaw` (frente = (-sin, -cos)). */
  startChargeRun(ctx, yaw, attackId = null) {
    if (!attackId) { this.attackSeq++; attackId = `${this.id}#${this.attackSeq}`; this.hitThisAttack = false; }
    this.attackId = attackId; this.yaw = yaw; this.windupProgress = 0; this.flank = null;
    this.chargeRun = { t: 0, dist: 0, dx: -Math.sin(yaw), dz: -Math.cos(yaw) };
    this.setState(K1.CHARGE, this.cfg.charge.maxMs);
  }
  _chargeStep(dt, ctx) {
    const { player, world, sim } = ctx, ch = this.cfg.charge, C = this.chargeRun;
    C.t += dt * 1000;
    const total = ch.speed * dt, n = Math.max(1, Math.ceil(total / 0.3)), st = total / n;
    let collided = false;
    for (let i = 0; i < n; i++) {
      const r = world.resolveCircle(this.x + C.dx * st, this.z + C.dz * st, this.radius);
      const prog = (r.x - this.x) * C.dx + (r.z - this.z) * C.dz;
      this.x = r.x; this.z = r.z; C.dist += Math.max(0, prog);
      if (r.hit && prog < st * 0.5) { collided = true; break; }
    }
    this.speedNow = ch.speed; this.walkPhase += ch.speed * dt * 1.6;
    if (!this.hitThisAttack && !player.dead && Math.hypot(player.x - this.x, player.z - this.z) <= ch.reach + PLAYER_RADIUS) this._hitPlayer(ch.damage, 0, ctx);
    if (collided) {
      this.chargeRun = null; this.chargeReadyAt = sim + ch.cooldownMs;
      ctx.bus.emit('k1Impact', { id: this.id, x: this.x, z: this.z });
      if (sim >= this.dazeImmuneUntil) this.daze(ch.dazedMs, ctx, 'wall');
      else this.setState(AI.RECOVER, ch.recoverMs);
      return;
    }
    if (C.dist >= ch.maxDist || C.t >= ch.maxMs) { this.chargeRun = null; this.chargeReadyAt = sim + ch.cooldownMs; this.setState(AI.RECOVER, ch.recoverMs); }
  }

  _beginTail(ctx) {
    const { diffMgr, diff, bus } = ctx;
    this.attackSeq++; this.attackId = `${this.id}#${this.attackSeq}`; this.hitThisAttack = false; this.flank = null;
    this.windupMs = this.tailWindupMs(diffMgr, diff.id);
    this.setState(K1.TAIL_WINDUP, this.windupMs);
    this._move('tail', ctx);
    bus.emit('windupStart', { id: this.id, attackId: this.attackId, ms: this.windupMs, x: this.x, z: this.z, kind: 'tail' });
  }
  _tailSweep(ctx) {
    const { player, world } = ctx, t = this.cfg.tail;
    const dx = player.x - this.x, dz = player.z - this.z, d = Math.hypot(dx, dz) || 1;
    const dot = (dx * -Math.sin(this.yaw) + dz * -Math.cos(this.yaw)) / d;
    if (!player.dead && d <= t.reach + PLAYER_RADIUS && dot < 0.3 && this._hitPlayer(t.damage, 0, ctx)) {
      const steps = Math.ceil(t.push / 0.25), s = t.push / steps;                       // empurrão resolvido contra colisores
      for (let i = 0; i < steps; i++) { const r = world.resolveCircle(player.x + (dx / d) * s, player.z + (dz / d) * s, PLAYER_RADIUS); player.x = r.x; player.z = r.z; }
    }
    this.behindMs = 0; this.windupProgress = 0;
    this.setState(AI.RECOVER, t.recoverMs);
  }
  /** Contato com o jogador (mesma regra de esquiva perfeita do ataque base). Retorna true se causou dano. */
  _hitPlayer(base, bleed, ctx) {
    const { player, bus, sim, diffMgr, diff, rng } = ctx;
    this.hitThisAttack = true;
    if (player.invulnerable) {
      if (!this.dodgedAttacks.has(this.attackId)) {
        this.dodgedAttacks.add(this.attackId);
        bus.emit('perfectDodge', { eventId: `pd:${this.attackId}`, attackId: this.attackId, sourceEnemyId: this.id, encounterId: this.encounterId, tick: ctx.tick });
        this.counterWindowUntil = sim + 1700;
      }
      return false;
    }
    const applied = player.takeDamage(diffMgr.playerDamage(base, diff.id), sim, bleed, rng.next());
    if (applied > 0) bus.emit('playerDamaged', { amount: applied, sourceEnemyId: this.id, encounterId: this.encounterId, tick: ctx.tick, bleeding: player.bleeding });
    return applied > 0;
  }

  /** Atordoamento (colisão da investida ou portão). Cabeça baixa e exposta (×3). */
  daze(ms, ctx, cause) {
    if (this.dead) return false;
    ctx.coordinator.release(this);
    this.chargeRun = null; this.flank = null; this.windupProgress = 0; this.dazeCause = cause;
    this.setState(K1.DAZED, ms); this.vulnerable = true;
    ctx.bus.emit('k1Dazed', { id: this.id, encounterId: this.encounterId, cause, ms, x: this.x, z: this.z });
    return true;
  }
  /** Chefe: ferramentas não atordoam (o portão usa `daze`). */
  stun() { return false; }

  takeDamage(amount, part, ctx) {
    if (this.dead) return { dead: true };
    const mult = part === 'head' && this.state === K1.DAZED ? this.cfg.dazedHeadMult : 1;
    const out = super.takeDamage(Math.round(amount * mult), part, ctx);
    ctx.bus.emit('bossHp', { id: this.id, encounterId: this.encounterId, hp: Math.max(0, this.hp), maxHp: this.maxHp, frac: this.hpFrac });
    if (!out.dead && !this.roared && this.phase === 3) {
      this.roared = true;
      ctx.bus.emit('k1Roar', { id: this.id, encounterId: this.encounterId, x: this.x, z: this.z });
    }
    return out;
  }
}
