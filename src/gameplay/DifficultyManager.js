import data from '../data/difficulty.json';

/** Presets versionados de dificuldade (GDD 4.7). Nada de dificuldade dinâmica oculta. */
export const ORDER = ['explorer', 'standard', 'veteran', 'extinction'];
export const MIN_REACTION_MS = 350;            // piso de reação humana para telegráficos

export class DifficultyManager {
  constructor(presets = data.presets, version = data.version) { this.presets = presets; this.version = version; }
  get(id) { return this.presets[id] ?? this.presets.standard; }
  list() { return ORDER.map((id) => ({ id, ...this.presets[id] })); }
  isUnlocked(id, profile) {
    const u = this.presets[id]?.unlock;
    return !u || (u === 'campaign_complete' && !!profile?.campaignCompleted);
  }
  rank(id) { return ORDER.indexOf(id); }
  /** Janela de aviso efetiva em ms: nunca abaixo do piso de reação, nem mudada por FPS. */
  warningMs(baseMs, id) {
    const p = this.get(id);
    return Math.max(p.minWarningMs ?? MIN_REACTION_MS, Math.round(baseMs * p.warningMult));
  }
  enemyHp(base, id) { return Math.round(base * this.get(id).enemyHpMult); }
  playerDamage(base, id) { return Math.max(1, Math.round(base * this.get(id).playerDamageMult)); }
  ammoPickup(amount, id) { return Math.max(1, Math.round(amount * this.get(id).ammoMult)); }

  initialState(id) { return { selected: id, current: id, changed: false }; }

  /**
   * Troca em ponto seguro. Reduzir é permitido e marca ranking `custom`;
   * aumentar exige novo capítulo/checkpoint ou nova campanha (GDD 4.7 diretriz 7).
   */
  change(save, newId, { atSafePoint = false, newChapterStart = false } = {}) {
    if (!this.presets[newId]) return { ok: false, error: 'desconhecida' };
    const cur = save.difficulty.current;
    if (newId === cur) return { ok: true, noop: true };
    if (!atSafePoint && !newChapterStart) return { ok: false, error: 'fora_de_ponto_seguro' };
    const lowering = this.rank(newId) < this.rank(cur);
    if (!lowering && !newChapterStart) return { ok: false, error: 'aumentar_exige_novo_capitulo' };
    save.difficulty = { ...save.difficulty, current: newId, changed: true };
    save.rankEligibility = 'custom';
    return { ok: true, lowered: lowering };
  }
}
export const difficulty = new DifficultyManager();
