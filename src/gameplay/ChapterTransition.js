import { getChapter, CHAPTER_IDS } from '../chapters/index.js';
import { getCharacter } from './Characters.js';
import { recordChapterState } from './Backtrack.js';

/** Capítulo seguinte na campanha (ou null quando não há mais capítulos jogáveis). */
export function nextChapterId(id) {
  const i = CHAPTER_IDS.indexOf(id);
  return i >= 0 && i + 1 < CHAPTER_IDS.length ? CHAPTER_IDS[i + 1] : null;
}

/** Posição de checkpoint gravada ao concluir o capítulo: `data.exitCheckpoint` ou o centro da zona de saída. */
export function exitCheckpoint(data) {
  if (data.exitCheckpoint) return { pos: [...data.exitCheckpoint.pos], yaw: data.exitCheckpoint.yaw ?? 0 };
  const z = data.zones.find((q) => q.id === 'exit_trigger');
  return { pos: [...(z?.pos ?? data.spawn.pos)], yaw: 0 };
}

/**
 * Transição de capítulo (pura): devolve uma cópia do save posicionada no início de `chapterId`, com o
 * protagonista do capítulo em vida máxima e sem sangramento. Mantém estatísticas por capítulo, CC/ledger,
 * documentos, segredos, flags e inventários; zera apenas o que é específico da execução do capítulo.
 */
export function advanceToChapter(save, chapterId) {
  const { data } = getChapter(chapterId);
  const s = structuredClone(save);
  recordChapterState(s); // preserva progresso por capítulo para futuras revisitas
  s.chapterId = chapterId; s.sectorId = data.id; s.playerId = data.protagonist;
  s.checkpointId = 'start'; s.checkpoint = { pos: [...data.spawn.pos], yaw: data.spawn.yaw };
  s.stats = null; s.completedObjectives = [];
  s.health = { ...s.health, [s.playerId]: getCharacter(s.playerId).maxHp };
  s.bleeding = { ...s.bleeding, [s.playerId]: false };
  return s;
}
