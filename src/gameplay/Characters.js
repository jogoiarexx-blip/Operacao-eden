import characters from '../data/characters.json';

/** Personagens jogáveis (dados puros em characters.json). */
export const CHARACTERS = characters;
export const getCharacter = (id) => characters[id] ?? characters.lia;
/** Inventário inicial de um personagem (cópia profunda). */
export function newInventory(charId) {
  const st = getCharacter(charId).start;
  return { weapons: structuredClone(st.weapons), equipped: st.equipped, ammoReserve: { ...st.ammoReserve }, consumables: { ...st.consumables }, upgrades: [] };
}
/** Inventário do personagem ativo (save v5). */
export const activeInventory = (save) => save.inventories[save.playerId];
