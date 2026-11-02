import { DifficultyManager } from './DifficultyManager.js';
import diffData from '../data/difficulty.json';

/**
 * Orçamento de munição (Task 9). Dano de munição = Σ munição × dano médio esperado por tiro; HP inimigo = Σ HP×enemyHpMult.
 * razão = dano de munição / HP inimigo (>1 = sobra folga). Suposições (documentadas, ver rankTargets.*.ammoBudget):
 *  - dano por tiro = dano BRUTO da arma (`playerDamageMult` é dano RECEBIDO pelo jogador, não entra aqui);
 *  - pistola: 28 × PISTOL_HIT (0,7 de acerto); escopeta: 6 de 8 chumbos × 11 × SHOTGUN_HIT (0,75);
 *  - HP inimigo por `enemyHpMult`; munição de pickups por `ammoMult`; inventário inicial NÃO escala com a dificuldade;
 *  - o portão NÃO conta (o K-1 deve ser morto só com munição; o portão é bônus). `gateDrops` existe só como opção (padrão 0).
 */
export const PISTOL_HIT = 0.7;
export const SHOTGUN_HIT = 0.75;
export const SHOTGUN_PELLETS_COUNTED = 6;
export const GATE_FRACTION = 0.3;

export function expectedDamagePerShot(weaponId, weapons, presetId, mgr) {
  const w = weapons.weapons?.[weaponId] ?? weapons[weaponId];
  if (!w) return 0;
  const dmg = w.damage;
  if (weaponId === 'shotgun') return dmg * Math.min(SHOTGUN_PELLETS_COUNTED, w.pellets ?? SHOTGUN_PELLETS_COUNTED) * SHOTGUN_HIT;
  return dmg * PISTOL_HIT;
}

/** @returns {{enemyHp:number, ammoDamage:number, ratio:number, ammo:Object}} */
export function ammoBudget(chapterData, bestiary, weapons, presetId, { startInventory = {}, resupplyShells = 0, gateDrops = 0, mgr = new DifficultyManager(diffData.presets) } = {}) {
  const species = bestiary.species ?? bestiary;
  let enemyHp = 0;
  for (const enc of chapterData.encounters ?? []) {
    for (const e of enc.enemies ?? []) {
      const sp = species[e.type]; if (!sp) continue;
      const n = e.count ?? 1;
      let hp = mgr.enemyHp(sp.hp, presetId);
      if (e.type === 'containment_alpha') hp = Math.max(0, hp * (1 - Math.min(1, gateDrops * GATE_FRACTION)));
      enemyHp += hp * n;
    }
  }
  const ammo = { ...startInventory };
  for (const p of chapterData.pickups ?? []) {
    for (const [w, n] of Object.entries(p.ammo ?? {})) ammo[w] = (ammo[w] ?? 0) + mgr.ammoPickup(n, presetId);
  }
  if (resupplyShells) ammo.shotgun = (ammo.shotgun ?? 0) + resupplyShells;
  let ammoDamage = 0;
  for (const [w, n] of Object.entries(ammo)) ammoDamage += n * expectedDamagePerShot(w, weapons, presetId, mgr);
  return { enemyHp, ammoDamage, ratio: enemyHp ? ammoDamage / enemyHp : Infinity, ammo };
}

/** Inventário inicial (pente + reserva por arma) a partir de characters.json. */
export function startInventoryOf(character) {
  const s = character.start, out = {};
  for (const [w, v] of Object.entries(s.weapons)) out[w] = (v.mag ?? 0) + (s.ammoReserve?.[w] ?? 0);
  return out;
}
