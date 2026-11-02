/**
 * Portão mecânico da arena do K-1 (design §6): acionado pelo painel `gate_drop`. Se o chefe estiver na zona sob o
 * portão: `damageFrac` do HP máximo + atordoado `stunMs`. Cada queda (acerto ou não) consome a carga, que volta em
 * `rechargeMs`. Estado serializável para o retry de checkpoint. Tempo = ms de simulação.
 */
export class GateTrap {
  constructor({ zone, rechargeMs = 20000, damageFrac = 0.3, stunMs = 3500 }) {
    this.zone = zone; this.rechargeMs = rechargeMs; this.damageFrac = damageFrac; this.stunMs = stunMs;
    this.lastDropAt = null;           // null = nunca acionado (pronto)
    this.drops = 0; this.hits = 0;
  }
  ready(simMs) { return this.lastDropAt === null || simMs - this.lastDropAt >= this.rechargeMs; }
  inZone(agent) { return !!agent && !agent.dead && Math.hypot(agent.x - this.zone.x, agent.z - this.zone.z) <= this.zone.r; }
  /** @returns {{hit:boolean, reason?:'recharging'|'out_of_zone'}} */
  trigger(simMs, agent, ctx = null) {
    if (!this.ready(simMs)) return { hit: false, reason: 'recharging' };
    this.lastDropAt = simMs; this.drops++;
    if (!this.inZone(agent)) return { hit: false, reason: 'out_of_zone' };
    this.hits++;
    const c = ctx ?? { sim: simMs, tick: 0, bus: { emit() {} }, coordinator: { release() {} }, player: agent, allies: [] };
    agent.takeDamage(Math.round(agent.maxHp * this.damageFrac), 'gate', { ...c, sim: simMs });
    if (!agent.dead) {
      if (agent.daze) agent.daze(this.stunMs, { ...c, sim: simMs }, 'gate');
      else agent.stun(this.stunMs, { ...c, sim: simMs });
    }
    return { hit: true };
  }
  /** Para o painel: luz pronto/carregando e fração da recarga. */
  state(simMs) {
    const ready = this.ready(simMs);
    return { ready, frac: ready ? 1 : Math.max(0, Math.min(1, (simMs - this.lastDropAt) / this.rechargeMs)) };
  }
  serialize() { return { lastDropAt: this.lastDropAt, drops: this.drops, hits: this.hits }; }
  restore(s) { this.lastDropAt = s?.lastDropAt ?? null; this.drops = s?.drops ?? 0; this.hits = s?.hits ?? 0; }
}
