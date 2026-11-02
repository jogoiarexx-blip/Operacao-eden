import { describe, it, expect } from 'vitest';
import { resolveShot, falloffMult, shouldInterrupt } from '../src/actors/Combat.js';
import { Player } from '../src/actors/Player.js';
import { DinosaurAgent, AI, AttackCoordinator } from '../src/actors/DinosaurAgent.js';
import { WEAPONS } from '../src/gameplay/GameState.js';
import { createRng } from '../src/core/rng.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import bestiary from '../src/data/bestiary.json';

const IN = { moveX: 0, moveY: 0, run: false, aim: false, firePressed: false, fireHeld: false, dodgePressed: false, reloadPressed: false, utilityPressed: false, medkitPressed: false, hemoPressed: false };
const cons = { medkit: 0, hemostatic: 0 };
const mkWorld = () => new CollisionWorld([-60, -60, 60, 60]);

function runFor(p, ms, input = IN, t0 = 1000) {
  const evs = []; let t = t0;
  for (let i = 0; i < Math.round(ms / (1000 / 60)); i++) { t += 1000 / 60; evs.push(...p.step(1 / 60, t, input, 0, cons)); }
  return evs;
}
function shotgunPlayer(mag, reserve) {
  const p = new Player(mkWorld()); p.weaponId = 'shotgun'; p.mag = mag; p.reserve = reserve;
  p.stash = { pistol: { mag: 12, reserve: 24 } }; return p;
}

describe('escopeta', () => {
  it('falloffMult interpola entre alcance pleno e zero', () => {
    expect(falloffMult(10, [14, 22])).toBe(1);
    expect(falloffMult(18, [14, 22])).toBe(0.5);
    expect(falloffMult(30, [14, 22])).toBe(0);
  });

  it('resolveShot com escopeta agrupa chumbos num único acerto', () => {
    const species = bestiary.species.forest_runner;
    const ag = new DinosaurAgent({ id: 'e1', encounterId: 'x', species, pos: [0, -5], yaw: 0 });
    const camera = { reticleRay: () => ({ ox: 0, oy: 1.3, oz: 0, dx: 0, dy: -0.045, dz: -1 }) };
    const res = resolveShot({ world: mkWorld(), enemies: [ag], camera, muzzle: { x: 0, y: 1.28, z: -0.5 }, weapon: WEAPONS.shotgun, spreadDeg: 5.5, rng: createRng(7) });
    expect(res.kind).toBe('spread');
    expect(res.hits).toHaveLength(1);
    const h = res.hits[0];
    expect(h.enemy).toBe(ag);
    expect(h.pellets).toBeGreaterThanOrEqual(6);
    expect(h.damage).toBeGreaterThan(0);
    expect(h.damage).toBeLessThanOrEqual(8 * 11 * 1.5);
    expect(h.dist).toBeGreaterThan(3); expect(h.dist).toBeLessThan(6);
    expect(res.tracers).toHaveLength(8);
  });

  it('recarga por cartucho: 250 ms + 520 ms por cartucho; tiro interrompe', () => {
    const p = shotgunPlayer(2, 10);
    runFor(p, 16, { ...IN, reloadPressed: true });
    expect(p.reloading).toBe(true);
    const evs = runFor(p, 250 + 520 * 2 - 16 + 40);
    expect(p.mag).toBe(4); expect(p.reserve).toBe(8);
    expect(evs.filter((e) => e.type === 'shellLoaded')).toHaveLength(2);
    expect(p.reloading).toBe(true);                       // ainda faltam 2 cartuchos
    const ev2 = runFor(p, 16, { ...IN, firePressed: true });
    expect(p.reloading).toBe(false);
    expect(ev2.some((e) => e.type === 'reloadCancelled')).toBe(true);
    expect(p.reserve).toBe(8);
    expect(p.mag).toBe(3);                                // tiro consumiu 1 dos 4 mantidos
  });

  it('recarga por cartucho para sozinha quando o carregador enche', () => {
    const p = shotgunPlayer(5, 10);
    runFor(p, 16, { ...IN, reloadPressed: true });
    const evs = runFor(p, 1000);
    expect(p.mag).toBe(6); expect(p.reserve).toBe(9); expect(p.reloading).toBe(false);
    expect(evs.some((e) => e.type === 'reloaded')).toBe(true);
  });

  it('switchWeapon durante recarga cancela e preserva o cartucho inserido', () => {
    const p = shotgunPlayer(2, 10);
    runFor(p, 16, { ...IN, reloadPressed: true });
    runFor(p, 250 + 520 - 16 + 30);
    expect(p.mag).toBe(3);
    expect(p.switchWeapon('pistol')).toBe(true);
    expect(p.reloading).toBe(false);
    expect(p.weaponId).toBe('pistol'); expect(p.mag).toBe(12);
    const evs = runFor(p, 16);
    expect(evs.some((e) => e.type === 'weaponSwitch')).toBe(true);
    // não atira durante os 400 ms de troca
    const fired = runFor(p, 200, { ...IN, firePressed: true }).some((e) => e.type === 'fire');
    expect(fired).toBe(false);
    runFor(p, 400);
    expect(p.switchWeapon('shotgun')).toBe(true);
    expect(p.mag).toBe(3); expect(p.reserve).toBe(9);
    expect(p.switchWeapon('rifle')).toBe(false);
  });

  it('interrupção: R-4 em preparação de ataque a 4 m', () => {
    const species = bestiary.species.forest_runner, rule = WEAPONS.shotgun.interrupt;
    const mk = () => {
      const a = new DinosaurAgent({ id: 'e', encounterId: 'x', species, pos: [0, -4], yaw: 0 });
      a.setState(AI.ATTACK_WINDUP, 850); a.attackId = 'e#1'; return a;
    };
    const ctx = () => ({ sim: 5000, bus: { emit() {} }, coordinator: new AttackCoordinator(2) });
    const apply = (a, pellets) => { if (shouldInterrupt(WEAPONS.shotgun, { dist: 4, pellets }, false)) a.interrupt(ctx()); return a; };
    expect(rule.minPellets).toBe(4);
    expect(apply(mk(), 4).state).toBe(AI.STAGGER);
    expect(apply(mk(), 3).state).toBe(AI.ATTACK_WINDUP);
    expect(shouldInterrupt(WEAPONS.shotgun, { dist: 8, pellets: 8 }, false)).toBe(false);
    expect(shouldInterrupt(WEAPONS.shotgun, { dist: 4, pellets: 5 }, true)).toBe(false);
    expect(shouldInterrupt(WEAPONS.shotgun, { dist: 4, pellets: 6 }, true)).toBe(true);
  });
});
