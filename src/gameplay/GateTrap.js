/**
 * Portão mecânico da arena do K-1 (design §6): acionado pelo painel `gate_drop`. Se o chefe estiver na zona sob o
 * portão: `damageFrac` do HP máximo + atordoado `stunMs`. Cada queda (acerto ou não) consome a carga, que volta em
 * `rechargeMs`. Estado serializável para o retry de checkpoint: grava a recarga RESTANTE (o simMs zera a cada
 * início/retry), e `restore` a reancora no simMs do momento da restauração. Tempo = ms de simulação.
 */
export class GateTrap {
  constructor({ zone, rechargeMs = 20000, damageFrac = 0.3, stunMs = 3500 }) {
    this.zone = zone; this.rechargeMs = rechargeMs; this.damageFrac = damageFrac; this.stunMs = stunMs;
    this.lastDropAt = null;           // null = nunca acionado (pronto)
    this.drops = 0; this.hits = 0;
  }
  ready(simMs) { return this.lastDropAt === null || simMs - this.lastDropAt >= this.rechargeMs; }
  inZone(agent) { return !!agent && !agent.dead && Math.hypot(agent.x - this.zone.x, agent.z - this.zone.z) <= this.zone.r; }
  /**
   * `ctx` (o aiCtx do jogo) é obrigatório: o dano/atordoamento emite no bus `enemyNeutralized`, `bossHp`, `k1Roar`, `k1Dazed`.
   * @returns {{hit:boolean, reason?:'recharging'|'out_of_zone'}}
   */
  trigger(simMs, agent, ctx) {
    if (!ctx?.bus || !ctx.coordinator) throw new Error('GateTrap.trigger: ctx (aiCtx com bus e coordinator) é obrigatório');
    if (!this.ready(simMs)) return { hit: false, reason: 'recharging' };
    this.lastDropAt = simMs; this.drops++;
    if (!this.inZone(agent)) return { hit: false, reason: 'out_of_zone' };
    this.hits++;
    const c = { ...ctx, sim: simMs };
    agent.takeDamage(Math.round(agent.maxHp * this.damageFrac), 'gate', c);
    if (!agent.dead) {
      if (agent.daze) agent.daze(this.stunMs, c, 'gate');
      else agent.stun(this.stunMs, c);
    }
    return { hit: true };
  }
  /** Para o painel: luz pronto/carregando e fração da recarga. */
  state(simMs) {
    const ready = this.ready(simMs);
    return { ready, frac: ready ? 1 : Math.max(0, Math.min(1, (simMs - this.lastDropAt) / this.rechargeMs)) };
  }
  /** Recarga restante (ms) em `simMs`; 0 = pronto. */
  remainingMs(simMs) { return this.ready(simMs) ? 0 : this.rechargeMs - (simMs - this.lastDropAt); }
  serialize(simMs) { return { remainingMs: this.remainingMs(simMs), drops: this.drops, hits: this.hits }; }
  /** Restaura relativo ao simMs atual (que pode ter zerado no retry). */
  restore(s, simMs) {
    const rem = Math.max(0, Math.min(this.rechargeMs, s?.remainingMs ?? 0));
    this.lastDropAt = rem > 0 ? simMs - (this.rechargeMs - rem) : null;
    this.drops = s?.drops ?? 0; this.hits = s?.hits ?? 0;
  }
}
