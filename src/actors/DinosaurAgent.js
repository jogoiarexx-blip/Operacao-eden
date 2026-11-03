import { clamp, wrapAngle, DEG } from '../core/math.js';
import { PLAYER_RADIUS } from './Player.js';

/**
 * IA de criatura (GDD 6.3). Estados: IDLE → PATROL → INVESTIGATE → STALK → CHASE → ATTACK_WINDUP → ATTACK → RECOVER,
 * interrupções STAGGER, FLEE, SEARCH, DEAD. Sem onisciência: visão com cone + linha de visão, audição com atenuação.
 * Todo o tempo é de simulação (ms). Aleatoriedade vem do rng injetado.
 */
export const AI = Object.freeze({
  IDLE: 'IDLE', PATROL: 'PATROL', INVESTIGATE: 'INVESTIGATE', STALK: 'STALK', CHASE: 'CHASE',
  ATTACK_WINDUP: 'ATTACK_WINDUP', ATTACK: 'ATTACK', RECOVER: 'RECOVER', STAGGER: 'STAGGER', FLEE: 'FLEE', SEARCH: 'SEARCH', DEAD: 'DEAD',
});

/** Limita atacantes de contato simultâneos (dificuldade: 1 no Explorador, 2 nos demais). */
export class AttackCoordinator {
  constructor(max = 2) { this.max = max; this.holders = new Set(); }
  setMax(n) { this.max = n; }
  /** Em zona `narrow` (corredor/passagem) só 1 atacante de contato por vez; fora dela, o máximo da dificuldade. */
  maxFor(zoneNarrow) { return zoneNarrow ? Math.min(1, this.max) : this.max; }
  request(agent, zoneNarrow = false) { if (this.holders.has(agent)) return true; if (this.holders.size < this.maxFor(zoneNarrow)) { this.holders.add(agent); return true; } return false; }
  release(agent) { this.holders.delete(agent); }
  clear() { this.holders.clear(); }
}

export class DinosaurAgent {
  constructor({ id, encounterId, species, pos, patrol = [], hpMult = 1, yaw = 0 }) {
    this.id = id; this.encounterId = encounterId; this.species = species;
    this.x = pos[0]; this.z = pos[1]; this.px = this.x; this.pz = this.z; this.yaw = yaw; this.pYaw = yaw;
    this.maxHp = Math.round(species.hp * hpMult); this.hp = this.maxHp;
    this.patrol = patrol.length ? patrol : [[this.x, this.z]]; this.patrolIdx = 0;
    this.state = patrol.length > 1 ? AI.PATROL : AI.IDLE; this.stateT = 0; this.stateDur = 0;
    this.lastKnown = null; this.lastSeenAt = -1e9; this.noiseTarget = null;
    this.dead = false; this.deadAt = 0; this.hurtT = 0; this.vulnerable = false;
    this.attackSeq = 0; this.attackId = null; this.lunge = null; this.hitThisAttack = false;
    this.windupMs = 0; this.windupProgress = 0; this.interruptDone = new Set(); this.staggerImmuneUntil = 0;
    this.counterWindowUntil = 0; this.counterPaid = new Set(); this.dodgedAttacks = new Set();
    this.circleDir = 1; this.fled = false; this.speedNow = 0; this.walkPhase = 0; this.alerted = false;
    this.scripted = null;                           // benchmark: trajetória fixa sem dano
    this.radius = species.hurtRadius;
  }
  get ccBase() { return this.species.baseCC; }
  get alive() { return !this.dead; }
  setState(s, dur = 0) { this.state = s; this.stateT = 0; this.stateDur = dur; }

  // ---------- percepção ----------
  headPos() { return { x: this.x - Math.sin(this.yaw) * 0.5, y: this.species.hit.head.y, z: this.z - Math.cos(this.yaw) * 0.5 }; }
  canSee(player, world) {
    const dx = player.x - this.x, dz = player.z - this.z, d = Math.hypot(dx, dz);
    const v = this.species.vision;
    if (d > v.range) return false;
    const ang = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - this.yaw));
    if (ang > (v.fovDeg * DEG) / 2 && d > 2.2) return false;
    const h = this.headPos();
    return !world.segmentBlocked(h.x, h.y, h.z, player.x, 1.1, player.z, 'bullet');
  }
  hears(noise, world) {
    const d = Math.hypot(noise.x - this.x, noise.z - this.z);
    let r = noise.r * this.species.hearingScale;
    if (d > r) return false;
    const h = this.headPos();
    if (world.segmentBlocked(h.x, h.y, h.z, noise.x, 1.0, noise.z, 'bullet')) r *= 0.6;       // paredes/troncos atenuam
    return d <= r;
  }

  // ---------- movimento ----------
  _steer(tx, tz, speed, dt, world, turnMul = 1) {
    let dx = tx - this.x, dz = tz - this.z; const d = Math.hypot(dx, dz);
    if (d < 0.05) { this.speedNow = 0; return d; }
    dx /= d; dz /= d;
    let ang = Math.atan2(dx, dz);
    // antenas: desvia de obstáculos
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
      const a = ang + off, fx = Math.sin(a), fz = Math.cos(a);
      if (!world.blockedAt(this.x + fx * 1.1, this.z + fz * 1.1, this.radius) && !world.blockedAt(this.x + fx * 2.2, this.z + fz * 2.2, this.radius * 0.8)) { ang = a; break; }
    }
    const want = Math.atan2(-Math.sin(ang), -Math.cos(ang));     // yaw convenção: frente = (-sin, -cos)
    const rate = this.species.turnRate * turnMul;
    this.yaw += clamp(wrapAngle(want - this.yaw), -rate * dt, rate * dt);
    const step = Math.min(speed * dt, d);
    const nx = this.x + Math.sin(ang) * step, nz = this.z + Math.cos(ang) * step;
    const r = world.resolveCircle(nx, nz, this.radius);
    this.x = r.x; this.z = r.z; this.speedNow = speed; this.walkPhase += speed * dt * 1.6;
    return d;
  }
  _faceTarget(tx, tz, dt, mul = 1) {
    const want = Math.atan2(-(tx - this.x), -(tz - this.z));
    const rate = this.species.turnRate * mul;
    this.yaw += clamp(wrapAngle(want - this.yaw), -rate * dt, rate * dt);
  }

  // ---------- ciclo principal ----------
  update(dt, ctx) {
    const { player, world, noises, coordinator, diff, diffMgr, bus, sim, rng, allies } = ctx;
    this.px = this.x; this.pz = this.z; this.pYaw = this.yaw;
    this.stateT += dt * 1000; this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.dead) return;
    if (this.scripted) { this._scripted(dt, ctx); return; }
    const sp = this.species, at = sp.attack;
    const distP = Math.hypot(player.x - this.x, player.z - this.z);
    const sees = !player.dead && this.canSee(player, world);
    if (sees) { this.lastKnown = { x: player.x, z: player.z }; this.lastSeenAt = sim; }

    // audição
    let heard = null;
    if (!sees && !player.dead) for (const n of noises) if (this.hears(n, world)) { heard = n; break; }

    switch (this.state) {
      case AI.IDLE:
      case AI.PATROL: {
        if (sees) { this._beginStalk(bus); break; }
        if (heard) { this.noiseTarget = { x: heard.x, z: heard.z }; this.setState(AI.INVESTIGATE); bus.emit('creatureCue', { cue: 'heard', id: this.id }); break; }
        const wp = this.patrol[this.patrolIdx];
        if (this.patrol.length > 1) {
          const d = this._steer(wp[0], wp[1], sp.patrolSpeed, dt, world, 0.8);
          if (d < 0.8) { this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length; this.setState(AI.IDLE, rng.range(1200, 2800)); }
          if (this.state === AI.IDLE) this.speedNow = 0;
        } else this.speedNow = 0;
        if (this.state === AI.IDLE && this.stateDur > 0 && this.stateT >= this.stateDur) this.setState(AI.PATROL);
        if (this.state === AI.IDLE) this.speedNow = 0;
        break;
      }
      case AI.INVESTIGATE: {
        if (sees) { this._beginStalk(bus); break; }
        if (heard) this.noiseTarget = { x: heard.x, z: heard.z };
        const d = this._steer(this.noiseTarget.x, this.noiseTarget.z, sp.chaseSpeed * 0.55, dt, world);
        if (d < 1.4 || this.stateT > 9000) this.setState(AI.SEARCH, 3200);
        break;
      }
      case AI.SEARCH: {
        if (sees) { this._beginStalk(bus); break; }
        if (heard) { this.noiseTarget = { x: heard.x, z: heard.z }; this.setState(AI.INVESTIGATE); break; }
        this.yaw += Math.sin(this.stateT / 420) * dt * 2.2; this.speedNow = 0;
        if (this.stateT >= this.stateDur) { this.alerted = false; this.setState(this.patrol.length > 1 ? AI.PATROL : AI.IDLE); }
        break;
      }
      case AI.STALK: {           // postura de caça antes de correr: sinal claro para o jogador
        this._faceTarget(player.x, player.z, dt, 1.2);
        const d = this._steer(player.x, player.z, sp.patrolSpeed * 1.7, dt, world);
        void d;
        if (this.stateT >= 750 || distP < 7) this._beginChase(bus, allies);
        break;
      }
      case AI.CHASE: {
        const losingFor = sim - this.lastSeenAt;
        if (!sees && !heard && losingFor > 5000) { this.noiseTarget = this.lastKnown ?? { x: this.x, z: this.z }; this.setState(AI.SEARCH, 3500); break; }
        if (player.dead) { this.setState(AI.SEARCH, 2000); break; }
        // juvenis fogem ao ficar muito feridos (uma vez)
        if (sp.id === 'forest_runner_juvenile' && !this.fled && this.hp < this.maxHp * 0.3) { this.fled = true; this.setState(AI.FLEE, 2200); break; }
        const tgt = sees ? player : (this.lastKnown ?? player);
        const dT = Math.hypot(tgt.x - this.x, tgt.z - this.z);
        if (sees && distP <= at.triggerRange && coordinator.request(this, !!(ctx.narrowAt && (ctx.narrowAt(this.x, this.z) || ctx.narrowAt(player.x, player.z))))) { this._beginWindup(player, diffMgr, diff, bus); break; }
        if (sees && distP < 9.5 && !coordinator.holders.has(this)) {
          // sem permissão de ataque: reposiciona em anel e simula pressão (sem fila de inimigos parados)
          const ang = Math.atan2(this.x - player.x, this.z - player.z) + this.circleDir * 0.55;
          const ring = 6.6 + (this.id.charCodeAt(this.id.length - 1) % 3);
          this._steer(player.x + Math.sin(ang) * ring, player.z + Math.cos(ang) * ring, sp.chaseSpeed * 0.7, dt, world);
          this._faceTarget(player.x, player.z, dt, 0.6);
          break;
        }
        this._steer(tgt.x, tgt.z, sp.chaseSpeed, dt, world);
        if (!sees && dT < 1.2) this.setState(AI.SEARCH, 3000);
        break;
      }
      case AI.ATTACK_WINDUP: {
        const p = clamp(this.stateT / this.windupMs, 0, 1);
        this.windupProgress = p; this.speedNow = 0;
        if (p < 0.55 && !player.dead) this._faceTarget(player.x, player.z, dt, 1.3);     // depois de 55% a direção fica travada ⇒ dá para esquivar
        if (p >= 1) this._beginLunge(player);
        break;
      }
      case AI.ATTACK: {
        const L = this.lunge; L.t += dt * 1000;
        const step = at.lungeDist * (dt * 1000) / at.lungeMs;
        const r = world.resolveCircle(this.x + L.dx * step, this.z + L.dz * step, this.radius);
        const moved = Math.hypot(r.x - this.x, r.z - this.z); this.x = r.x; this.z = r.z; this.speedNow = step / dt;
        const d = Math.hypot(player.x - this.x, player.z - this.z);
        if (!this.hitThisAttack && !player.dead) {
          if (d <= at.reach + PLAYER_RADIUS) {
            if (player.invulnerable) {
              if (!this.dodgedAttacks.has(this.attackId)) {          // esquiva perfeita: i-frames no instante do impacto
                this.dodgedAttacks.add(this.attackId); this.hitThisAttack = true;
                bus.emit('perfectDodge', { eventId: `pd:${this.attackId}`, attackId: this.attackId, sourceEnemyId: this.id, encounterId: this.encounterId, tick: ctx.tick });
                this.counterWindowUntil = sim + 1700;
              }
            } else {
              this.hitThisAttack = true;
              const dmg = diffMgr.playerDamage(at.damage, diff.id);
              const applied = player.takeDamage(dmg, sim, at.bleedChance, rng.next());
              if (applied > 0) bus.emit('playerDamaged', { amount: applied, sourceEnemyId: this.id, encounterId: this.encounterId, tick: ctx.tick, bleeding: player.bleeding });
            }
          }
        }
        if (L.t >= at.lungeMs || (moved < 1e-4 && L.t > 80)) { coordinator.release(this); this.setState(AI.RECOVER, at.recoverMs); }
        break;
      }
      case AI.RECOVER: {
        this.windupProgress = 0;
        // recuo curto depois do salto (erra o alvo e se afasta)
        if (this.stateT < 600) { const bx = this.x + Math.sin(this.yaw) * 1.6 * dt * 1.0, bz = this.z + Math.cos(this.yaw) * 1.6 * dt * 1.0; const r = world.resolveCircle(bx, bz, this.radius); this.x = r.x; this.z = r.z; }
        this.speedNow = 0;
        if (this.stateT >= this.stateDur) { this.circleDir = rng.next() < diff.flankChance ? -this.circleDir : this.circleDir; this.setState(AI.CHASE); }
        break;
      }
      case AI.STAGGER: {
        this.speedNow = 0; this.vulnerable = true;
        if (this.stateT >= this.stateDur) { this.vulnerable = false; this.lastKnown = { x: player.x, z: player.z }; this.lastSeenAt = sim; this.setState(AI.CHASE); }
        break;
      }
      case AI.FLEE: {
        this._steer(this.x + (this.x - player.x), this.z + (this.z - player.z), sp.chaseSpeed * 0.9, dt, world);
        if (this.stateT >= this.stateDur) this.setState(AI.CHASE);
        break;
      }
      default: break;
    }
    this._separate(allies, world);
  }
  /** Separação entre animais (evita sobreposição). */
  _separate(allies, world) {
    for (const o of allies) {
      if (o === this || o.dead) continue;
      const dx = this.x - o.x, dz = this.z - o.z, d = Math.hypot(dx, dz), min = this.radius + o.radius + 0.1;
      if (d < min && d > 1e-4) { const push = (min - d) * 0.5; const r = world.resolveCircle(this.x + (dx / d) * push, this.z + (dz / d) * push, this.radius); this.x = r.x; this.z = r.z; }
    }
  }

  _beginStalk(bus) {
    if (!this.alerted) { this.alerted = true; bus.emit('creatureCue', { cue: 'spotted', id: this.id, x: this.x, z: this.z }); }
    this.setState(AI.STALK);
  }
  _beginChase(bus, allies) {
    this.setState(AI.CHASE);
    for (const o of allies) {                       // chamado curto: aliados próximos entram em alerta (sem onisciência global)
      if (o !== this && !o.dead && o.encounterId === this.encounterId && o.state !== AI.CHASE && Math.hypot(o.x - this.x, o.z - this.z) < 22 && o.state !== AI.ATTACK_WINDUP && o.state !== AI.ATTACK) {
        o.lastKnown = this.lastKnown; o.lastSeenAt = this.lastSeenAt; o.alerted = true; o.setState(AI.CHASE);
      }
    }
    bus.emit('creatureCue', { cue: 'roar', id: this.id, x: this.x, z: this.z });
  }
  _beginWindup(player, diffMgr, diff, bus) {
    this.attackSeq++; this.attackId = `${this.id}#${this.attackSeq}`; this.hitThisAttack = false;
    this.windupMs = diffMgr.warningMs(this.species.attack.windupMs, diff.id);
    this.setState(AI.ATTACK_WINDUP, this.windupMs);
    bus.emit('windupStart', { id: this.id, attackId: this.attackId, ms: this.windupMs, x: this.x, z: this.z });
  }
  _beginLunge(player) {
    const dx = player.x - this.x, dz = player.z - this.z, d = Math.hypot(dx, dz) || 1;
    this.yaw = Math.atan2(-dx, -dz);
    this.lunge = { t: 0, dx: dx / d, dz: dz / d };       // direção travada: o jogador pode sair da linha
    this.setState(AI.ATTACK, this.species.attack.lungeMs);
  }

  _scripted(dt, ctx) {          // benchmark B01: percurso determinístico, ataques simulados sem dano
    const sc = this.scripted; sc.t += dt;
    const wp = this.patrol[this.patrolIdx];
    const d = this._steer(wp[0], wp[1], this.species.chaseSpeed * 0.8, dt, ctx.world, 1.5);
    if (d < 1) this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length;
    const cycle = sc.t % 5;
    this.state = cycle > 3.2 && cycle < 4.1 ? AI.ATTACK_WINDUP : cycle >= 4.1 && cycle < 4.5 ? AI.ATTACK : AI.CHASE;
    this.windupProgress = this.state === AI.ATTACK_WINDUP ? (cycle - 3.2) / 0.9 : 0;
  }

  // ---------- dano ----------
  /** @returns {dead, interrupted, counter} */
  takeDamage(amount, part, ctx) {
    const { sim, bus, coordinator, tick } = ctx;
    if (this.dead) return { dead: true };
    this.hp -= amount; this.hurtT = 0.18;
    const out = { dead: false, interrupted: false, counter: false };
    if (sim < this.counterWindowUntil && this.attackId && !this.counterPaid.has(this.attackId)) {
      this.counterPaid.add(this.attackId); out.counter = true;
      bus.emit('counterHit', { attackId: this.attackId, enemyId: this.id, encounterId: this.encounterId });
    }
    if (this.hp <= 0) {
      const wasVulnerable = this.state === AI.STAGGER || this.vulnerable;
      this.dead = true; this.deadAt = sim; this.setState(AI.DEAD); coordinator.release(this);
      out.dead = true;
      bus.emit('enemyNeutralized', { eventId: `kill:${this.id}`, runId: ctx.runId, encounterId: this.encounterId, enemyId: this.id, tick, creditedTo: 'player', baseCC: this.ccBase, vulnerable: wasVulnerable, backtrack: !!this.backtrack, sectorId: this.sectorId });
      return out;
    }
    // chefes: qualquer dano não interrompe; só o impacto pesado (`interrupt`, escopeta com bossMinPellets)
    if (this.state === AI.ATTACK_WINDUP && !this.species.boss && this.windupProgress < 0.7 && !this.interruptDone.has(this.attackId) && sim >= this.staggerImmuneUntil) {
      this.interruptDone.add(this.attackId); this.staggerImmuneUntil = sim + 3500;
      coordinator.release(this); this.setState(AI.STAGGER, 700); this.vulnerable = true; out.interrupted = true;
      bus.emit('interrupt', { eventId: `int:${this.attackId}`, attackId: this.attackId, sourceEnemyId: this.id, encounterId: this.encounterId, tick });
    } else if ([AI.IDLE, AI.PATROL, AI.INVESTIGATE, AI.SEARCH, AI.STALK].includes(this.state)) {
      this.lastKnown = { x: ctx.player.x, z: ctx.player.z }; this.lastSeenAt = sim; this.alerted = true; this._beginChase(bus, ctx.allies);
    }
    return out;
  }
  /** Interrupção por impacto pesado (escopeta): só afeta quem está em preparação de ataque. */
  interrupt(ctx) {
    if (this.dead || this.state !== AI.ATTACK_WINDUP) return false;
    const { sim, bus, coordinator, tick } = ctx;
    coordinator.release(this); this.setState(AI.STAGGER, 700); this.vulnerable = true;
    if (!this.interruptDone.has(this.attackId)) {
      this.interruptDone.add(this.attackId); this.staggerImmuneUntil = sim + 3500;
      bus.emit('interrupt', { eventId: `int:${this.attackId}`, attackId: this.attackId, sourceEnemyId: this.id, encounterId: this.encounterId, tick });
    }
    return true;
  }
  /** Empurra `dist` m na direção (dx,dz) (normalizada aqui), resolvido contra colisores em passos curtos. */
  knockback(dx, dz, dist, world) {
    if (this.dead) return;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const steps = Math.max(1, Math.ceil(dist / 0.25)), st = dist / steps;
    for (let i = 0; i < steps; i++) {
      const r = world.resolveCircle(this.x + dx * st, this.z + dz * st, this.radius);
      if (Math.hypot(r.x - this.x, r.z - this.z) < st * 0.25) break;
      this.x = r.x; this.z = r.z;
    }
    this.px = this.x; this.pz = this.z;
  }
  stun(ms, ctx) {
    if (this.dead) return false;
    ctx.coordinator.release(this); this.setState(AI.STAGGER, ms); this.vulnerable = true;
    return true;
  }
}
