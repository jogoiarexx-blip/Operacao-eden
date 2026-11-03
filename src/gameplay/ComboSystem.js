import { KillChainSystem, MODULE_WINDOW_MS, BASE_WINDOW_MS } from './KillChainSystem.js';
import { TacticalStyleSystem } from './TacticalStyleSystem.js';

/**
 * Fachada ÚNICA de combo (GDD 9.9): KillChain + TacticalStyle + Ledger.
 * Neutralização, saldo, rank e HUD consomem os MESMOS eventos validados — o HUD nunca calcula recompensa.
 * Eventos de entrada (EventBus): enemyNeutralized, perfectDodge, interrupt, groupControl, counterHit, playerDamaged.
 * Eventos de saída: reward {cc, pe, label, kind}, chainChanged, chainEnded.
 */
export const COUNTER_CC = 100;
export const SECTOR_CLEAR_BASE = 500;
export const SECTOR_CLEAR_CAP = 1500;

export class ComboSystem {
  constructor({ bus, ledger, getRunId, getSimMs, hasChainModule = () => false }) {
    this.bus = bus; this.ledger = ledger; this.getRunId = getRunId; this.getSimMs = getSimMs; this.hasChainModule = hasChainModule;
    this.chain = new KillChainSystem();
    this.style = new TacticalStyleSystem();
    this.pending = [];
    this.sectorKillCC = 0; this.sectorKills = 0; this.sectorDamage = 0;
    this.encounters = {};            // id → {total, dead, damage, eligible}
    this.stats = { kills: 0, counters: 0 };
    this._off = [
      bus.on('enemyNeutralized', (e) => this.pending.push(e)),
      bus.on('perfectDodge', (e) => this._style(this.style.perfectDodge(e), e)),
      bus.on('interrupt', (e) => this._style(this.style.interrupt(e), e)),
      bus.on('groupControl', (e) => this._style(this.style.groupControl(e, this.getSimMs()), e)),
      bus.on('counterHit', (e) => this.counterHit(e)),
      bus.on('playerDamaged', (e) => this.onPlayerDamaged(e)),
    ];
  }
  dispose() { this._off.forEach((f) => f()); }

  registerEncounter(id, total, eligible = true) { this.encounters[id] = { total, dead: 0, damage: 0, eligible, cleared: false }; }
  syncWindow() { this.chain.setWindow(this.hasChainModule() ? MODULE_WINDOW_MS : BASE_WINDOW_MS); }

  _style(award, e) { if (award && !e?.backtrack) this.bus.emit('reward', { kind: 'style', cc: 0, pe: award.pe, label: award.label, encounterId: e?.encounterId }); }

  /** Chamado uma vez por tick de simulação, DEPOIS da resolução de dano. */
  flush(tick, simMs) {
    this.syncWindow();
    const ended = this.chain.update(simMs);
    if (ended) this.bus.emit('chainEnded', ended);
    if (!this.pending.length) return;
    const batch = KillChainSystem.sortEvents(this.pending); this.pending = [];
    for (const ev of batch) this._applyKill(ev, simMs);
  }

  _applyKill(ev, simMs) {
    if (ev.creditedTo !== 'player') return;
    const rewardId = `${this.getRunId()}|${ev.encounterId}|${ev.enemyId}`;
    if (this.ledger.claimedRewardIds.has(rewardId)) return;           // inimigo já pago
    const k = this.chain.registerKill(ev, simMs);
    if (!k) return;
    const paid = ev.backtrack ? this.ledger.creditRespawn(ev.sectorId ?? 'backtrack', rewardId, k.cc) : this.ledger.credit(rewardId, k.cc);
    this.sectorKillCC += paid; this.sectorKills++; this.stats.kills++;
    const enc = this.encounters[ev.encounterId];
    if (enc) { enc.dead++; }
    this.bus.emit('reward', { kind: 'kill', cc: paid, pe: 0, label: k.count > 1 ? `${k.tier || 'CADEIA'} x${k.count}` : 'NEUTRALIZADO', chain: k, enemyId: ev.enemyId, encounterId: ev.encounterId });
    this.bus.emit('chainChanged', { count: k.count, remainingMs: this.chain.remainingMs(simMs), windowMs: this.chain.windowMs, tier: k.tier });
    for (const a of (ev.backtrack ? [] : this.style.onKill({ chainCount: k.count, enemyId: ev.enemyId, encounterId: ev.encounterId, vulnerable: !!ev.vulnerable }))) {
      this.bus.emit('reward', { kind: 'style', cc: 0, pe: a.pe, label: a.label, encounterId: ev.encounterId });
    }
    if (enc && enc.dead >= enc.total && !enc.cleared) {
      enc.cleared = true; this.ledger.markEncounterClaimed(ev.encounterId);
      if (enc.eligible && enc.damage === 0) {
        const a = this.style.clean(ev.encounterId);
        if (a) this.bus.emit('reward', { kind: 'style', cc: 0, pe: a.pe, label: a.label, encounterId: ev.encounterId });
      }
      this.bus.emit('encounterCleared', { encounterId: ev.encounterId, damage: enc.damage });
    }
  }

  counterHit(ev) {
    if (ev.backtrack) return; // sem CC repetidos em contra-ataques às patrulhas
    const paid = this.ledger.credit(`${this.getRunId()}|counter|${ev.attackId}`, COUNTER_CC);   // uma vez por ação inimiga
    if (paid > 0) { this.stats.counters++; this.bus.emit('reward', { kind: 'counter', cc: paid, pe: 0, label: 'CONTRA-ATAQUE', encounterId: ev.encounterId }); }
  }

  onPlayerDamaged(ev) {
    if ((ev.amount ?? 0) <= 0) return;       // feedback sem dano real não cancela
    this.sectorDamage += ev.amount;
    const ended = this.chain.end('damage');
    if (ended) this.bus.emit('chainEnded', ended);
    for (const e of Object.values(this.encounters)) if (!e.cleared) e.damage += ev.amount;
  }

  /** Setor concluído sem dano (500 + 10% do combate do setor, teto). Setor com encontros efetivos. */
  settleSector(sectorId) {
    const ended = this.chain.end('sector'); if (ended) this.bus.emit('chainEnded', ended);
    if (this.sectorKills < 1 || this.sectorDamage > 0) return 0;
    const bonus = Math.min(SECTOR_CLEAR_CAP, SECTOR_CLEAR_BASE + Math.round(this.sectorKillCC * 0.1));
    const paid = this.ledger.credit(`${this.getRunId()}|sector|${sectorId}|nodamage`, bonus);
    if (paid) this.bus.emit('reward', { kind: 'sector', cc: paid, pe: 0, label: 'SETOR SEM DANO', encounterId: null });
    return paid;
  }

  /** Salvar/carregar/terminal: a cadeia não é guardada (GDD 5.12 regra 8). */
  endChain(reason = 'safe') { const e = this.chain.end(reason); if (e) this.bus.emit('chainEnded', e); }
  resetForLoad() { this.chain.reset(); this.pending = []; }

  get maxChain() { return this.chain.maxCount; }
  get totalPE() { return this.style.totalPE; }
}
