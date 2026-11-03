import { difficulty } from './DifficultyManager.js';

const REASONS = {
  desconhecida: 'dificuldade desconhecida',
  fora_de_ponto_seguro: 'fora de ponto seguro',
  aumentar_exige_novo_capitulo: 'aumentar exige novo capítulo',
};

/**
 * Aplica a dificuldade escolhida na tela de início de capítulo (pura, sobre o save).
 * Recusa preset bloqueado no perfil e respeita o resultado de `difficulty.change`; em recusa mantém a dificuldade atual.
 * @returns {{ok:boolean, message?:string}}
 */
export function resolveDifficultyOffer(save, difficultyId, profile, mgr = difficulty) {
  if (!difficultyId) return { ok: true, noop: true };
  if (!mgr.get(difficultyId) || !mgr.presets[difficultyId]) return { ok: false, message: 'Dificuldade desconhecida — mantendo a atual.' };
  if (!mgr.isUnlocked(difficultyId, profile)) return { ok: false, message: `Dificuldade bloqueada (${mgr.get(difficultyId).label}) — mantendo a atual.` };
  const r = mgr.change(save, difficultyId, { newChapterStart: true });
  if (!r.ok) return { ok: false, message: `Não foi possível trocar a dificuldade (${REASONS[r.error] ?? r.error}) — mantendo a atual.` };
  return { ok: true, noop: !!r.noop };
}
