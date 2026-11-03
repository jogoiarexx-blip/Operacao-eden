import { describe, it, expect, vi } from 'vitest';
import { createNewSave } from '../src/gameplay/GameState.js';
import { getChapter } from '../src/chapters/index.js';
import {
  REGION_DEFINITIONS, REGION_REENTRY_COOLDOWN, REGION_FIRST_REENTRY_DELAY,
  regionAt, recordRegionEntry, planRegionReentry, markRegionSpawn,
  RegionalSectorDirector,
} from '../src/gameplay/RegionalSectors.js';
import { validateSave } from '../src/gameplay/SaveManager.js';

const prepare = (chapterId = 'ch01') => {
  const save = createNewSave({ runId: 'regional_qa' });
  save.chapterId = chapterId;
  save.sectorId = getChapter(chapterId).data.id;
  return { save, data: getChapter(chapterId).data };
};
const clearWorld = { blockedAt: () => false };

describe('Continuidade das regiões e respawn controlado', () => {
  it('há cinco regiões por cenário, sem alterar a lista narrativa dos capítulos', () => {
    for (const id of ['ch01', 'ch02']) {
      const data = getChapter(id).data, before = JSON.stringify(data.zones);
      expect(REGION_DEFINITIONS[id]).toHaveLength(5);
      expect(REGION_DEFINITIONS[id].every(r => r.radius > 4 && r.spawnPoints.length >= 3)).toBe(true);
      expect(JSON.stringify(data.zones)).toBe(before);
    }
  });
  it('detecção usa histerese e não repete a entrada por micro-oscilação', () => {
    expect(regionAt('ch01', 27, 13)?.id).toBe('east_trail');
    expect(regionAt('ch01', 34.2, 13, 'east_trail')?.id).toBe('east_trail');
    expect(regionAt('ch01', 50, 50)).toBeNull();
    expect(regionAt('invalid', 0, 0)).toBeNull();
  });
  it('primeira visita não gera nada; retorno exige tempo suficiente', () => {
    const { save, data } = prepare(), region = REGION_DEFINITIONS.ch01[0];
    const player = { x: region.center[0], z: region.center[1] };
    recordRegionEntry(save, region, 0);
    expect(planRegionReentry({ save, region, data, world: clearWorld, player, now: 100 })).toBeNull();
    recordRegionEntry(save, region, 5);
    expect(planRegionReentry({ save, region, data, world: clearWorld, player, now: REGION_FIRST_REENTRY_DELAY - 1 })).toBeNull();
    const def = planRegionReentry({ save, region, data, world: clearWorld, player, now: 25 });
    expect(def?.id).toBe('region_ch01_east_trail_1');
    expect(def?.backtrack).toBe(true);
    expect(def?.sectorId).toBe('region:ch01:east_trail');
    expect(Math.hypot(def.pos[0] - player.x, def.pos[1] - player.z)).toBeGreaterThanOrEqual(8);
    markRegionSpawn(save, region, 25);
    recordRegionEntry(save, region, 26);
    expect(planRegionReentry({ save, region, data, world: clearWorld, player, now: 25 + REGION_REENTRY_COOLDOWN - 1 })).toBeNull();
    expect(planRegionReentry({ save, region, data, world: clearWorld, player, now: 25 + REGION_REENTRY_COOLDOWN })?.id).toBe('region_ch01_east_trail_2');
    expect(validateSave(JSON.parse(JSON.stringify(save))).ok).toBe(true);
  });
  it('não aparece dentro de áreas seguras, paredes nem sobre outros inimigos', () => {
    const { save, data } = prepare(), region = REGION_DEFINITIONS.ch01[2];
    recordRegionEntry(save, region, 0); recordRegionEntry(save, region, 100);
    const player = { x: -27, z: 4 }; // interior do abrigo
    expect(planRegionReentry({ save, region, data, world: clearWorld, player, now: 100 })).toBeNull();
    player.x = region.center[0]; player.z = region.center[1];
    expect(planRegionReentry({ save, region, data, world: { blockedAt: () => true }, player, now: 100 })).toBeNull();
    const occupied = Array.from({length:4}, (_, i) => ({ id: 'r'+i, x:100+i, z:100, backtrack:true, sectorId:'region:ch01:beacon' }));
    expect(planRegionReentry({ save, region, data, world: clearWorld, player, occupied, now:100 })).toBeNull();
  });
  it('diretor só conta nova visita após sair e voltar; não exige recarregar o mapa', () => {
    const { save, data } = prepare('ch02');
    const region = REGION_DEFINITIONS.ch02[0];
    save.chapterId = 'ch02';
    const game = {
      save, chapterDef: { data }, player: { x: region.center[0], z: region.center[1], dead: false },
      world: clearWorld, liveAgents: () => [],
      combo: { registerEncounter: vi.fn() }, spawnAgent: vi.fn(), hud: { toast: vi.fn() },
    };
    const director = new RegionalSectorDirector(game);
    expect(director.step()).toMatchObject({region:'north_road',spawned:false});
    expect(director.step()).toBeNull();
    game.player.x = 100; game.player.z = 100;
    director.step();
    save.playtimeSeconds = 50;
    game.player.x = region.center[0]; game.player.z = region.center[1];
    expect(director.step()).toMatchObject({region:'north_road',spawned:true});
    expect(save.backtrack.regions['ch02:north_road'].visits).toBe(2);
    expect(game.spawnAgent).toHaveBeenCalledTimes(1);
    expect(game.combo.registerEncounter).toHaveBeenCalledWith('regional:ch02:north_road:1', 1, false);
    expect(director.step()).toBeNull();
  });
});
