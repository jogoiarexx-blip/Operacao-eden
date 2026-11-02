/**
 * Camada B do combo: pontos de estilo (PE) — servem à nota, nunca são moeda (GDD 5.12).
 */
export const STYLE = Object.freeze({
  perfectDodge: { label: 'EVASÃO PERFEITA', pe: 75 },
  interrupt: { label: 'INTERRUPÇÃO', pe: 100 },
  groupControl: { label: 'CONTROLE DE GRUPO', pe: 80 },
  multiTarget: { label: 'MULTIALVO', pe: 120 },
  finisher: { label: 'CONTENÇÃO PERFEITA', pe: 100 },
  clean: { label: 'LIMPO', pe: 150 },
});
export const GROUP_CONTROL_COOLDOWN_MS = 8000;

export class TacticalStyleSystem {
  constructor() {
    this.totalPE = 0;
    this.byType = {};                // contagem por tipo (diversidade)
    this.peByEncounter = {};
    this.seenKeys = new Set();       // antispam: um evento por chave (attackId, enemyId, encounterId)
    this.groupCooldown = {};
  }
  _award(type, key, encounterId) {
    if (key && this.seenKeys.has(`${type}:${key}`)) return null;
    if (key) this.seenKeys.add(`${type}:${key}`);
    const def = STYLE[type];
    this.totalPE += def.pe;
    this.byType[type] = (this.byType[type] || 0) + 1;
    if (encounterId) this.peByEncounter[encounterId] = (this.peByEncounter[encounterId] || 0) + def.pe;
    return { type, label: def.label, pe: def.pe };
  }
  perfectDodge(ev) { return ev.eligible === false ? null : this._award('perfectDodge', ev.attackId, ev.encounterId); }
  interrupt(ev) { return ev.eligible === false ? null : this._award('interrupt', ev.attackId, ev.encounterId); }
  groupControl(ev, simMs) {
    if (ev.eligible === false || !ev.othersAlive) return null;      // sem outros alvos não é "controle de grupo"
    const last = this.groupCooldown[ev.enemyId] ?? -Infinity;
    if (simMs - last < GROUP_CONTROL_COOLDOWN_MS) return null;
    this.groupCooldown[ev.enemyId] = simMs;
    return this._award('groupControl', null, ev.encounterId);
  }
  onKill({ chainCount, enemyId, encounterId, vulnerable }) {
    const out = [];
    if (chainCount === 2) { const a = this._award('multiTarget', `${enemyId}`, encounterId); if (a) out.push(a); }
    if (vulnerable) { const a = this._award('finisher', enemyId, encounterId); if (a) out.push(a); }
    return out;
  }
  clean(encounterId) { return this._award('clean', encounterId, encounterId); }
  /** PE considerado pela nota: limitado por encontro para não incentivar farm de estilo. */
  cappedTotal(capPerEncounter) {
    let t = 0;
    for (const v of Object.values(this.peByEncounter)) t += Math.min(v, capPerEncounter);
    return t;
  }
  distinctTypes() { return Object.keys(this.byType).length; }
  serialize() { return { totalPE: this.totalPE, byType: { ...this.byType }, peByEncounter: { ...this.peByEncounter } }; }
  /** Restaura totais a partir de um save (as chaves de antispam são recriadas a partir dos contadores). */
  restore(s) { if (!s) return; this.totalPE = s.totalPE ?? 0; this.byType = { ...(s.byType ?? {}) }; this.peByEncounter = { ...(s.peByEncounter ?? {}) }; for (const e of Object.keys(this.peByEncounter)) this.seenKeys.add(`clean:${e}`); }
}
