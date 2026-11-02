import secretsData from '../data/secrets.json';
import { EconomyLedger } from './EconomyLedger.js';

/**
 * Segredos, caches e dossiês (GDD 5.4–5.10).
 * Estados: none < hinted < discovered < unlocked < claimed. Recompensa única por save (`oncePerSave`).
 */
const ORDER = ['none', 'hinted', 'discovered', 'unlocked', 'claimed'];
const rank = (s) => ORDER.indexOf(s ?? 'none');

export const DOSSIER_IDS = secretsData.dossiers.map((d) => d.id);       // whitelist de 12
export const getSecret = (id) => secretsData.secrets.find((s) => s.id === id);
export const getCache = (id) => secretsData.caches.find((s) => s.id === id);
export const getDossier = (id) => secretsData.dossiers.find((d) => d.id === id);

export function stateOf(save, id) { return save.secretFlags[id] ?? 'none'; }
function raise(save, id, to) {
  if (rank(to) > rank(stateOf(save, id))) {
    save.secretFlags[id] = to;
    save.secretMeta[id] = { ...(save.secretMeta[id] || {}), [to]: save.playtimeSeconds, sourceSaveId: save.runId };
    return true;
  }
  return false;
}
export const hint = (save, id) => raise(save, id, 'hinted');
export const discover = (save, id) => raise(save, id, 'discovered');
export const unlock = (save, id) => raise(save, id, 'unlocked');

/** Avalia `{all:[...], any:[...]}` contra flags de história. */
export function conditionMet(cond, flags) {
  if (!cond) return true;
  const all = cond.all ?? [], any = cond.any ?? [];
  return all.every((f) => flags[f]) && (any.length === 0 || any.some((f) => flags[f]));
}

/** Aplica recompensas de abastecimento; munição escala pela dificuldade. Retorna resumo para o HUD. */
export function applyRewards(save, rewards, { id, ammoScale = (n) => n } = {}) {
  const summary = [];
  const inv = save.inventory;
  for (const r of rewards) {
    if (r.type === 'supplies') {
      for (const [w, n] of Object.entries(r.ammo ?? {})) { const v = ammoScale(n); inv.ammoReserve[w] = (inv.ammoReserve[w] ?? 0) + v; summary.push(`+${v} munição`); }
      for (const [c, n] of Object.entries(r.consumable ?? {})) { inv.consumables[c] = (inv.consumables[c] ?? 0) + n; summary.push(`+${n} ${c === 'medkit' ? 'kit médico' : 'hemostático'}`); }
    } else if (r.type === 'credits') {
      const l = new EconomyLedger(save.economyLedger);
      const paid = l.credit(`${save.runId}|reward|${id}`, r.amount);
      save.economyLedger = l.serialize(); save.credits = l.credits;
      if (paid) summary.push(`+${paid} CC`);
    } else if (r.type === 'storySecret') {
      if (!save.storySecrets.includes(r.id)) save.storySecrets.push(r.id);
    } else if (r.type === 'shopUnlock') {
      if (!save.shopUnlocks.includes(r.id)) save.shopUnlocks.push(r.id);
    }
  }
  return summary;
}

/** Reivindica um segredo/cache. Retorna `null` se já reivindicado (nada é concedido duas vezes). */
export function claimSecret(save, id, opts = {}) {
  const def = getSecret(id) ?? getCache(id);
  if (!def || stateOf(save, id) === 'claimed') return null;
  if (def.unlock && !conditionMet(def.unlock, save.storyFlags)) return null;
  raise(save, id, 'discovered'); raise(save, id, 'unlocked'); raise(save, id, 'claimed');
  const summary = applyRewards(save, def.rewards ?? [], { id, ...opts });
  if (def.journal) save.journal.push({ id, text: def.journal });
  return { def, summary };
}

/** Perfil (por profileId): dossiês validados por whitelist; nunca duplicam. */
export class CollectibleManager {
  static newProfile(profileId = 'local_profile_01') {
    return { profileId, dossiers: [], profileUnlocks: [], campaignCompleted: false, cosmetics: [], bestGrades: {} };
  }
  static collect(save, profile, id) {
    if (!DOSSIER_IDS.includes(id)) return { added: false, reason: 'fora_da_whitelist' };
    const inRun = !save.dossiersInRun.includes(id);
    if (inRun) save.dossiersInRun.push(id);
    const inProfile = !profile.dossiers.includes(id);
    if (inProfile) profile.dossiers.push(id);
    return { added: inRun || inProfile, count: profile.dossiers.length, total: DOSSIER_IDS.length };
  }
  static isComplete(profile) { return DOSSIER_IDS.every((d) => profile.dossiers.includes(d)); }
  /** Capacitor Inesgotável: 12/12 + campanha concluída. Só aparece como opção em Nova Jornada+. */
  static capacitorUnlocked(profile) { return CollectibleManager.isComplete(profile) && !!profile.campaignCompleted; }
}
