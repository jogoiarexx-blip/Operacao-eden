/** Regras de modalidade (GDD 9.11): decide se a execução pontua/paga CC e se entra no ranking classificado. */
export const MODES = ['campaign', 'ngplus', 'chapter_replay', 'arena', 'benchmark'];

export function modeAllows(mode) {
  return {
    awardsCC: mode === 'campaign' || mode === 'ngplus',
    scores: mode !== 'benchmark',
    touchesCampaignSave: mode === 'campaign' || mode === 'ngplus',
    mutatesProfile: mode === 'campaign' || mode === 'ngplus',
  }[mode] ?? { awardsCC: false, scores: false, touchesCampaignSave: false, mutatesProfile: false };
}

/** Qualquer fator que contamina o recorde empurra a execução para a aba Livre/Personalizado. */
export function computeEligibility(save, { debug = false } = {}) {
  const r = save.runRules ?? {};
  if (debug) return 'custom';
  if (save.difficulty?.changed) return 'custom';
  if (r.infiniteAmmo) return 'custom';
  if ((r.mutators ?? []).length) return 'custom';
  if (save.rankEligibility === 'custom') return 'custom';
  if (r.mode !== 'campaign') return 'custom';
  return 'classified';
}
