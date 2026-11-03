import { describe, it, expect } from 'vitest';
import dialogues from '../src/data/dialogues.json';
import { getChapter } from '../src/chapters/index.js';
import { advanceToChapter } from '../src/gameplay/ChapterTransition.js';
import { createNewSave } from '../src/gameplay/GameState.js';

describe('Ligação cinematográfica Capítulo 01 → 02', () => {
  it('termina os diálogos antes do corte de cena, inclusive o contato com Caio', () => {
    const { script } = getChapter('ch01');
    const durationMs = dialogues.ch01_coro_tower.reduce((total, line) => total + line.ms, 0);
    expect(durationMs).toBeLessThan(script.cutscenes.ending.dur * 1000);
    expect(dialogues.ch01_coro_tower.at(-1).who).toContain('Caio');
    expect(dialogues.ch02_intro_radio[0].text).toContain('Lia');
  });

  it('a câmera do encerramento sai do portão de Lia para revelar a torre', () => {
    const positions = [], targets = [], fovs = [], sync = [];
    const cam = {
      position: { set: (...pos) => positions.push(pos) },
      lookAt: (...target) => targets.push(target),
      updateProjectionMatrix() { fovs.push(this.fov); },
    };
    const game = {
      player: { x: 0, z: -43 },
      threeCam: cam,
      playerView: { sync: (...args) => sync.push(args) },
    };
    const ending = getChapter('ch01').script.cutscenes.ending;
    ending.update(game, { t: 0 }, 1 / 60);
    ending.update(game, { t: ending.dur }, 1 / 60);
    expect(positions).toHaveLength(2);
    expect(positions[0]).not.toEqual(positions[1]);
    expect(targets[0]).not.toEqual(targets[1]);
    expect(fovs.every((fov) => fov >= 58 && fov <= 61)).toBe(true);
    expect(positions.flat().every(Number.isFinite)).toBe(true);
    expect(sync).toHaveLength(2);
  });

  it('a passagem preserva a campanha e prepara Caio, sem substituir um save já existente', () => {
    const before = createNewSave({ slot: 1, runId: 'r_handoff' });
    before.chapterStats.ch01 = { grade: 'A', score: 90 };
    before.documents.push('doc_a');
    const after = advanceToChapter(before, 'ch02');
    expect(after.playerId).toBe('caio');
    expect(after.chapterStats.ch01).toEqual(before.chapterStats.ch01);
    expect(after.documents).toEqual(before.documents);
    expect(before.chapterId).toBe('ch01');
    expect(getChapter('ch02').script.cutscenes.intro.dur * 1000)
      .toBeGreaterThan(dialogues.ch02_intro_radio.reduce((n, line) => n + line.ms, 0));
  });
});
