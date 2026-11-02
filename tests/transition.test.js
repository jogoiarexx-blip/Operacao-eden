import { describe, it, expect } from 'vitest';
import { advanceToChapter, exitCheckpoint, nextChapterId } from '../src/gameplay/ChapterTransition.js';
import { createNewSave } from '../src/gameplay/GameState.js';
import { validateSave } from '../src/gameplay/SaveManager.js';
import { difficulty } from '../src/gameplay/DifficultyManager.js';
import { getChapter } from '../src/chapters/index.js';
import { getCharacter } from '../src/gameplay/Characters.js';
import { markYardCheckpoint } from '../src/chapters/ch02.js';

const fimCh01 = () => {
  const s = createNewSave({ slot: 1, runId: 'run_t' });
  s.storyFlags.campaign_chapter_exit = true; s.completedObjectives = ['reach_tower', 'exit_sector'];
  s.chapterStats.ch01 = { maxChain: 7, activeSeconds: 900, deaths: 1, score: 80, grade: 'B' };
  s.economyLedger.credits = 450; s.credits = 450; s.documents = ['doc_a']; s.secretFlags.x = true; s.storySecrets = ['s1'];
  s.inventories.lia.ammoReserve.pistol = 17; s.health.lia = 41; s.bleeding.lia = true;
  s.stats = { deaths: 1 }; s.checkpointId = 'chapter_complete';
  return s;
};

describe('Transição Cap. 01 → Cap. 02', () => {
  it('advanceToChapter troca capítulo, personagem e checkpoint e preserva a progressão', () => {
    const src = fimCh01(), snapshot = structuredClone(src);
    const s = advanceToChapter(src, 'ch02');
    const d = getChapter('ch02').data;
    expect(s).toMatchObject({ chapterId: 'ch02', sectorId: 'outpost_02', playerId: 'caio', checkpointId: 'start', stats: null });
    expect(s.checkpoint).toEqual({ pos: d.spawn.pos, yaw: d.spawn.yaw });
    expect(s.chapterStats.ch01).toEqual(snapshot.chapterStats.ch01);
    expect(s.economyLedger.credits).toBe(450);
    expect(s.inventories.lia).toEqual(snapshot.inventories.lia);
    expect(s.documents).toEqual(['doc_a']); expect(s.secretFlags).toEqual({ x: true }); expect(s.storySecrets).toEqual(['s1']);
    expect(s.completedObjectives).toEqual([]);
    expect(src).toEqual(snapshot);                                     // pura: não muta a entrada
    expect(validateSave(s)).toEqual({ ok: true, errors: [] });
  });
  it('Caio entra com a vida máxima (120) e sem sangramento', () => {
    const s = advanceToChapter(fimCh01(), 'ch02');
    expect(s.health.caio).toBe(getCharacter('caio').maxHp);
    expect(s.health.caio).toBe(120);
    expect(s.bleeding.caio).toBe(false);
    expect(createNewSave().health).toEqual({ lia: 100, caio: 120 });
  });
  it('dificuldade pode subir/mudar no início de capítulo novo (e marca Livre)', () => {
    const s = advanceToChapter(fimCh01(), 'ch02');
    expect(difficulty.change(s, 'veteran', { newChapterStart: true })).toMatchObject({ ok: true });
    expect(s.difficulty.current).toBe('veteran');
    expect(difficulty.change(advanceToChapter(fimCh01(), 'ch02'), 'veteran', {}).ok).toBe(false);
  });
  it('capítulo seguinte: ch01 → ch02 → nenhum', () => {
    expect(nextChapterId('ch01')).toBe('ch02'); expect(nextChapterId('ch02')).toBe(null);
  });
  it('checkpoint de conclusão vem dos dados do capítulo, não de coordenada fixa', () => {
    for (const id of ['ch01', 'ch02']) {
      const { data } = getChapter(id), cp = exitCheckpoint(data);
      const z = data.zones.find((q) => q.id === 'exit_trigger');
      expect(Math.hypot(cp.pos[0] - z.pos[0], cp.pos[1] - z.pos[1])).toBeLessThanOrEqual(z.r + 6);
    }
    expect(exitCheckpoint(getChapter('ch02').data).pos).not.toEqual([0, -38]);
  });
});

describe('Cap. 02 — checkpoint ao abrir o portão do pátio', () => {
  it('markYardCheckpoint grava checkpoint dentro do pátio e é idempotente', () => {
    const s = advanceToChapter(fimCh01(), 'ch02'); s.storyFlags.yard_open = true;
    markYardCheckpoint(s);
    const d = getChapter('ch02').data;
    expect(s.checkpointId).toBe('yard_open');
    expect(s.checkpoint.pos).toEqual(d.yardCheckpoint.pos);
    expect(s.checkpoint.pos[1]).toBeLessThan(-4);                 // além do portão (z = -4)
    expect(structuredClone(markYardCheckpoint(s))).toEqual(s);
  });
});
