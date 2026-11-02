/**
 * Camada A do combo: sequência de eliminações (GDD 5.12).
 * Relógio = tempo de SIMULAÇÃO ativo em ms (nunca Date.now / timestamps de DOM).
 */
export const BASE_WINDOW_MS = 4000;
export const MODULE_WINDOW_MS = 5000;
export const MAX_MULT = 2.5;

export function killMultiplier(count) {
  return Math.min(MAX_MULT, 1 + 0.15 * Math.max(0, count - 1));
}
export function killReward(baseCC, chainCount) {
  return Math.round(baseCC * killMultiplier(chainCount));
}
export function chainTier(count) {
  if (count >= 10) return 'EXTINÇÃO';
  if (count >= 6) return 'IMPLACÁVEL';
  if (count >= 4) return 'PREDADOR';
  if (count >= 2) return 'CADEIA';
  return '';
}

export class KillChainSystem {
  constructor({ windowMs = BASE_WINDOW_MS } = {}) {
    this.windowMs = windowMs;
    this.count = 0; this.lastKillMs = -Infinity; this.maxCount = 0;
    this.credited = new Set();           // enemyIds já pontuados (nunca duas vezes)
    this.lastEnemyId = null;
  }
  setWindow(ms) { this.windowMs = ms; }
  get active() { return this.count > 0; }
  remainingMs(simMs) { return this.count > 0 ? Math.max(0, this.windowMs - (simMs - this.lastKillMs)) : 0; }

  /** Expira a cadeia se a janela passou. Retorna evento de término ou null. */
  update(simMs) {
    if (this.count > 0 && simMs - this.lastKillMs > this.windowMs) return this.end('expired');
    return null;
  }
  end(reason) {
    if (this.count === 0) return null;
    const ended = { count: this.count, reason };
    this.count = 0; this.lastEnemyId = null;
    return ended;
  }
  /** Registra uma neutralização elegível. Retorna null se inelegível/duplicada. */
  registerKill(ev, simMs) {
    if (ev.creditedTo !== 'player') return null;        // aliados e hazards não contam
    if (this.credited.has(ev.enemyId)) return null;
    this.credited.add(ev.enemyId);
    const continued = this.count > 0 && simMs - this.lastKillMs <= this.windowMs;
    this.count = continued ? this.count + 1 : 1;
    this.lastKillMs = simMs;
    this.maxCount = Math.max(this.maxCount, this.count);
    const prev = this.lastEnemyId; this.lastEnemyId = ev.enemyId;
    return { count: this.count, multiplier: killMultiplier(this.count), cc: killReward(ev.baseCC, this.count), previousEnemyId: prev, tier: chainTier(this.count) };
  }
  /** Ordem determinística: tick → encounterId → enemyId (GDD 5.12 regra 6). */
  static sortEvents(events) {
    return [...events].sort((a, b) =>
      a.tick - b.tick || String(a.encounterId).localeCompare(String(b.encounterId)) || String(a.enemyId).localeCompare(String(b.enemyId)));
  }
  /** Ao salvar/carregar/trocar de setor a cadeia não é guardada. */
  reset() { this.count = 0; this.lastKillMs = -Infinity; this.lastEnemyId = null; this.credited.clear(); }
}
