import { describe, it, expect } from 'vitest';
import { DinosaurAgent, AI, AttackCoordinator } from '../src/actors/DinosaurAgent.js';
import { applyImpact } from '../src/actors/Combat.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { UTILITY } from '../src/gameplay/GameState.js';
import { canUseInteraction } from '../src/gameplay/Characters.js';
import bestiary from '../src/data/bestiary.json';

const mkWorld = () => new CollisionWorld([-60, -60, 60, 60]);
const mkAgent = (species, pos) => new DinosaurAgent({ id: 'R-4', encounterId: 'e', species, pos, patrol: [], hpMult: 1, yaw: 0 });
const ctx = () => ({ coordinator: new AttackCoordinator(2), sim: 0 });

describe('Kit do Caio', () => {
  it('impact_tool tem os valores do GDD', () => {
    expect(UTILITY.impact_tool).toMatchObject({ range: 2.6, knockback: 2.5, stunMs: 1200, cooldownMs: 7000, noiseRadius: 10 });
  });

  it('golpe de impacto a 2 m afasta ~2,5 m e deixa STAGGER por 1200 ms', () => {
    const w = mkWorld(), a = mkAgent(bestiary.species.forest_runner, [0, -2]);
    applyImpact(a, { x: 0, z: 0 }, UTILITY.impact_tool, w, ctx());
    expect(Math.hypot(a.x - 0, a.z - 0)).toBeGreaterThan(4.2);
    expect(Math.hypot(a.x, a.z + 2)).toBeCloseTo(2.5, 1);
    expect(a.state).toBe(AI.STAGGER);
    expect(a.stateDur).toBe(1200);
  });

  it('boss é empurrado mas não atordoado', () => {
    const w = mkWorld(), sp = { ...bestiary.species.forest_runner, boss: true };
    const a = mkAgent(sp, [0, -2]);
    applyImpact(a, { x: 0, z: 0 }, UTILITY.impact_tool, w, ctx());
    expect(Math.hypot(a.x, a.z + 2)).toBeGreaterThan(1);
    expect(a.state).not.toBe(AI.STAGGER);
  });

  it('knockback respeita colisores', () => {
    const w = mkWorld(); w.addBox('wall', 0, -3.5, 10, 2, 0.4);
    const a = mkAgent(bestiary.species.forest_runner, [0, -2]);
    a.knockback(0, -1, 2.5, w);
    expect(a.z).toBeGreaterThan(-3.2);
  });

  it('removeById faz o raycast atravessar', () => {
    const w = mkWorld(); w.addBox('crates_a', 0, -5, 2, 2, 2);
    expect(w.raycast(0, 1, 0, 0, 0, -1, 20, 'bullet')).not.toBeNull();
    w.removeById('crates_a');
    expect(w.raycast(0, 1, 0, 0, 0, -1, 20, 'bullet')).toBeNull();
    expect(w.byId.has('crates_a')).toBe(false);
  });

  it('Lia não usa heavy_lever/breakable; Caio sim', () => {
    expect(canUseInteraction('lia', 'heavy_lever')).toBe(false);
    expect(canUseInteraction('lia', 'breakable')).toBe(false);
    expect(canUseInteraction('caio', 'heavy_lever')).toBe(true);
    expect(canUseInteraction('caio', 'breakable')).toBe(true);
    expect(canUseInteraction('lia', 'beacon')).toBe(true);
  });
});
