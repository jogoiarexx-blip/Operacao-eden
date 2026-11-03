import { describe, it, expect } from 'vitest';
import { createNewSave } from '../src/gameplay/GameState.js';
import { advanceToChapter } from '../src/gameplay/ChapterTransition.js';
import { availableBacktrackPortal, BACKTRACK_PORTALS, planRevisitPatrol, travelBacktrack } from '../src/gameplay/Backtrack.js';
import { validateSave } from '../src/gameplay/SaveManager.js';

function inChapterTwo() {
  const s = createNewSave({ runId: 'qa_backtrack' });
  s.storyFlags.outpost_access = true;
  s.chapterStats.ch01 = { grade: 'B', score: 1500 };
  s.completedObjectives = ['reach_tower', 'repair_beacon', 'exit_sector'];
  s.health.lia = 32;
  s.inventories.lia.ammoReserve.pistol = 7;
  s.persistentWorldFlags.defeatedEnemies.push('r4_a');
  s.persistentWorldFlags.pickedUp.push('ammo_pier');
  return advanceToChapter(s, 'ch02');
}

describe('Portais e backtracking entre cenários', () => {
  it('não libera a passagem antes da conclusão real do capítulo inicial', () => {
    expect(availableBacktrackPortal(createNewSave(), 0, -42)).toBeNull();
  });
  it('ida e volta preservam personagem, inventários, missões, morte de chefes e progresso', () => {
    const from = inChapterTwo();
    from.completedObjectives = ['reach_breach', 'radio_online'];
    from.stats = { activeSeconds: 73, kills: 2 };
    from.inventories.caio.ammoReserve.shotgun = 4;
    from.health.caio = 45;
    from.persistentWorldFlags.defeatedEnemies.push('k1');
    expect(availableBacktrackPortal(from, 11.3, 34.5)?.to).toBe('ch01');
    const lia = travelBacktrack(from, BACKTRACK_PORTALS.ch02);
    expect(lia.chapterId).toBe('ch01');
    expect(lia.playerId).toBe('lia');
    expect(lia.health.lia).toBe(32);
    expect(lia.completedObjectives).toEqual(['reach_tower', 'repair_beacon', 'exit_sector']);
    expect(lia.persistentWorldFlags.defeatedEnemies).toContain('k1');
    expect(lia.persistentWorldFlags.pickedUp).toContain('ammo_pier');
    expect(lia.inventories.caio.ammoReserve.shotgun).toBe(4);
    expect(lia.backtrack.visits.ch01).toBe(2);
    expect(lia.checkpoint.pos).toEqual([0, -37]);
    expect(availableBacktrackPortal(lia, 0, -42)?.to).toBe('ch02');
    const caio = travelBacktrack(lia, BACKTRACK_PORTALS.ch01);
    expect(caio.chapterId).toBe('ch02');
    expect(caio.playerId).toBe('caio');
    expect(caio.health.caio).toBe(45);
    expect(caio.completedObjectives).toEqual(['reach_breach', 'radio_online']);
    expect(caio.stats).toEqual({ activeSeconds: 73, kills: 2 });
    expect(caio.backtrack.visits.ch02).toBe(2);
    expect(validateSave(caio)).toEqual({ ok: true, errors: [] });
  });
  it('guarda HP e posição dos inimigos da missão sem acumular patrulhas de revisita', () => {
    const original = inChapterTwo();
    const next = travelBacktrack(original, BACKTRACK_PORTALS.ch02, [
      { id: 'r4_court', x: 3, z: 17, hp: 21, backtrack: false },
      { id: 'bt_ch02_v2_0', x: 5, z: 11, hp: 13, backtrack: true },
    ]);
    expect(next.backtrack.sectors.ch02.enemies).toEqual([{ id: 'r4_court', x: 3, z: 17, hp: 21 }]);
    const again = travelBacktrack(next, BACKTRACK_PORTALS.ch01, []);
    expect(again.backtrack.sectors.ch02.enemies).toEqual([{ id: 'r4_court', x: 3, z: 17, hp: 21 }]);
    expect(original.backtrack?.sectors.ch02?.enemies).toBeUndefined();
  });
  it('revisitas trazem patrulhas seguras e não revivem inimigos narrativos', () => {
    const s = inChapterTwo();
    const world = { blockedAt: (x, z) => x === -3 && z === 21 };
    expect(planRevisitPatrol(s, world, { x: 11.3, z: 34 })).toEqual([]);
    s.backtrack.visits.ch02 = 2;
    const patrol = planRevisitPatrol(s, world, { x: 11.3, z: 34 });
    expect(patrol).toHaveLength(1);
    expect(patrol[0].id).toBe('bt_ch02_v2_0');
    expect(patrol[0].type).toBe('forest_runner_juvenile');
    expect(patrol[0].backtrack).toBe(true);
    expect(Math.hypot(patrol[0].pos[0]-11.3,patrol[0].pos[1]-34)).toBeGreaterThan(9);
    s.backtrack.patrolDeaths.push(patrol[0].id);
    expect(planRevisitPatrol(s, world, { x: 11.3, z: 34 })).toEqual([]);
  });
});
