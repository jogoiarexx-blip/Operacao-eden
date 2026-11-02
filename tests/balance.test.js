import { describe, it, expect } from 'vitest';
import { ammoBudget, startInventoryOf } from '../src/gameplay/AmmoBudget.js';
import { difficulty, ORDER } from '../src/gameplay/DifficultyManager.js';
import { AttackCoordinator } from '../src/actors/DinosaurAgent.js';
import { ShoulderCameraController, zoneAtPoint } from '../src/world/ShoulderCameraController.js';
import { resolveDifficultyOffer } from '../src/gameplay/DifficultyOffer.js';
import { completeTomasDefense } from '../src/chapters/ch02.js';
import { createNewSave } from '../src/gameplay/GameState.js';
import ch01 from '../src/data/chapter01.json';
import ch02 from '../src/data/chapter02.json';
import bestiary from '../src/data/bestiary.json';
import weapons from '../src/data/weapons.json';
import characters from '../src/data/characters.json';
import rank from '../src/data/rankTargets.json';

const MIN = { explorer: 1.6, standard: 1.3, veteran: 1.1, extinction: 1.0 };
const B = rank.chapters.ch02.ammoBudget;
const opts = {
  ch01: () => ({ startInventory: startInventoryOf(characters.lia) }),
  ch02: () => ({ startInventory: startInventoryOf(characters.caio), resupplyShells: B.resupplyShells, gateDrops: B.gateDrops }),
};

describe('orçamento de munição', () => {
  for (const id of ORDER) {
    it(`ch02 (Caio) ${id} ≥ ${MIN[id]}`, () => {
      const r = ammoBudget(ch02, bestiary, weapons, id, opts.ch02());
      expect(r.ratio).toBeGreaterThanOrEqual(MIN[id]);
    });
    it(`ch01 (Lia) ${id} ≥ ${MIN[id]}`, () => {
      const r = ammoBudget(ch01, bestiary, weapons, id, opts.ch01());
      expect(r.ratio).toBeGreaterThanOrEqual(MIN[id]);
    });
  }
  it('ch02 padrão dentro de [piso, 2,5] (escassez)', () => {
    const r = ammoBudget(ch02, bestiary, weapons, 'standard', opts.ch02()).ratio;
    expect(r).toBeGreaterThanOrEqual(MIN.standard); expect(r).toBeLessThanOrEqual(B.maxStandard);
  });
  it('razão não aumenta de Explorador a Extinção (ambos os capítulos)', () => {
    for (const k of ['ch01', 'ch02']) {
      const d = k === 'ch01' ? ch01 : ch02;
      const rs = ORDER.map((id) => ammoBudget(d, bestiary, weapons, id, opts[k]()).ratio);
      for (let i = 1; i < rs.length; i++) expect(rs[i]).toBeLessThanOrEqual(rs[i - 1]);
    }
  });
  it('portão não conta e K-1 é abatível só com munição', () => {
    expect(B.gateDrops).toBe(0);
    const a = ammoBudget(ch02, bestiary, weapons, 'standard', opts.ch02());
    expect(a.enemyHp).toBeGreaterThan(900);
  });
  it('rankTargets.ch02.ammoBudget registra as razões finais coerentes', () => {
    for (const id of ORDER) {
      const r = ammoBudget(ch02, bestiary, weapons, id, opts.ch02());
      expect(B.ratios[id]).toBeCloseTo(r.ratio, 2);
    }
  });
});

describe('bloqueio de dificuldade', () => {
  it('Extinção só com campaign_complete; concluir ch02 não concede', () => {
    expect(difficulty.isUnlocked('extinction', {})).toBe(false);
    expect(difficulty.isUnlocked('extinction', { campaignCompleted: false })).toBe(false);
    expect(difficulty.isUnlocked('extinction', { campaignCompleted: true })).toBe(true);
    const s = createNewSave({ slot: 1, runId: 'r' }); s.chapterId = 'ch02'; s.playerId = 'caio';
    completeTomasDefense(s);
    expect(s.storyFlags.campaign_complete).toBeFalsy();
    expect(JSON.stringify(s)).not.toContain('campaign_complete');
  });
  it('oferta de novo capítulo recusa preset bloqueado e mantém o atual', () => {
    const save = createNewSave({ slot: 1, runId: 'r', difficultyId: 'standard' });
    const r = resolveDifficultyOffer(save, 'extinction', { campaignCompleted: false });
    expect(r.ok).toBe(false); expect(r.message).toMatch(/bloquead/i);
    expect(save.difficulty.current).toBe('standard');
    const r2 = resolveDifficultyOffer(save, 'veteran', { campaignCompleted: false });
    expect(r2.ok).toBe(true); expect(save.difficulty.current).toBe('veteran');
    const r3 = resolveDifficultyOffer(save, 'extinction', { campaignCompleted: true });
    expect(r3.ok).toBe(true); expect(save.difficulty.current).toBe('extinction');
    expect(resolveDifficultyOffer(save, 'nope', {}).ok).toBe(false);
    expect(save.difficulty.current).toBe('extinction');
  });
});

describe('agressividade em espaço apertado', () => {
  it('maxFor e request: zona narrow limita a 1 atacante', () => {
    const c = new AttackCoordinator(2);
    expect(c.maxFor(false)).toBe(2); expect(c.maxFor(true)).toBe(1);
    const a = {}, b = {};
    expect(c.request(a, true)).toBe(true);
    expect(c.request(b, true)).toBe(false);
    c.release(a);
    expect(c.request(a, false)).toBe(true);
    expect(c.request(b, false)).toBe(true);
  });
  it('zonas narrow existem no ch02', () => {
    expect(ch02.zones.filter((z) => z.narrow).map((z) => z.id)).toEqual(['admin_corridor', 'yard_passage']);
  });
});

describe('câmera em espaço apertado', () => {
  const world = { raycast: () => null, sweepCamera: () => ({ hit: false, t: 99 }) };
  it('dentro da zona cz_admin a distância converge para 2,2 em 1 s', () => {
    const cam = new ShoulderCameraController(world);
    cam.setZones(ch02.cameraZones, ch02.zones);
    const z = zoneAtPoint(ch02.cameraZones, ch02.zones, -17, 11);
    expect(z.exploreDistance).toBe(2.2);
    for (let i = 0; i < 60; i++) cam.update(1 / 60, { lookX: 0, lookY: 0, aim: false }, { x: -17, y: 0, z: 11 });
    expect(Math.abs(cam.dist - 2.2)).toBeLessThan(0.05);
  });
  it('fora de zonas usa a distância do preset', () => {
    const cam = new ShoulderCameraController(world);
    cam.setZones(ch02.cameraZones, ch02.zones);
    for (let i = 0; i < 90; i++) cam.update(1 / 60, { lookX: 0, lookY: 0, aim: false }, { x: 0, y: 0, z: 30 });
    expect(Math.abs(cam.dist - 3.1)).toBeLessThan(0.05);
  });
  it('parede a <0,6 m do lado do ombro troca de lado temporariamente', () => {
    const wall = { raycast: (ox, oy, oz, dx) => (dx > 0 ? { t: 0.5 } : null), sweepCamera: () => ({ hit: false, t: 99 }) };
    const cam = new ShoulderCameraController(wall);
    for (let i = 0; i < 120; i++) cam.update(1 / 60, { lookX: 0, lookY: 0, aim: false }, { x: 0, y: 0, z: 0 });
    expect(cam.side).toBe('left'); expect(cam.preferredSide).toBe('right');
    const open = { raycast: () => null, sweepCamera: () => ({ hit: false, t: 99 }) };
    cam.world = open;
    for (let i = 0; i < 180; i++) cam.update(1 / 60, { lookX: 0, lookY: 0, aim: false }, { x: 0, y: 0, z: 0 });
    expect(cam.side).toBe('right');
  });
});
