import { describe, it, expect } from 'vitest';
import { resolveShot, falloffMult, shouldInterrupt } from '../src/actors/Combat.js';
import { Player } from '../src/actors/Player.js';
import { DinosaurAgent, AI, AttackCoordinator } from '../src/actors/DinosaurAgent.js';
import { WEAPONS } from '../src/gameplay/GameState.js';
import { createRng } from '../src/core/rng.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { loadSettings, DEFAULT_BINDINGS } from '../src/core/Settings.js';
import { createNewSave } from '../src/gameplay/GameState.js';
import { activeInventory } from '../src/gameplay/Characters.js';
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
    const sum = Object.values(h.damageByPart).reduce((a, b) => a + b, 0);
    expect(sum).toBe(h.damage);                                 // dano por parte soma o total
    expect(Object.keys(h.damageByPart).every((p) => ['head', 'torso', 'legs'].includes(p))).toBe(true);
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

  it('dodge cancela recarga por cartucho mantendo cartuchos inseridos', () => {
    const p = shotgunPlayer(2, 10);
    runFor(p, 16, { ...IN, reloadPressed: true });
    runFor(p, 250 + 520 - 16 + 30);
    expect(p.mag).toBe(3);
    const evs = runFor(p, 16, { ...IN, dodgePressed: true });
    expect(evs.some((e) => e.type === 'reloadCancelled')).toBe(true);
    expect(p.reloading).toBe(false); expect(p.mag).toBe(3); expect(p.reserve).toBe(9);
  });

  it('munição concedida a arma não equipada sobrevive a writeToSave/loadFromSave', () => {
    const save = createNewSave(); save.playerId = 'caio';
    const inv = activeInventory(save);
    expect(inv.equipped).toBe('shotgun');
    const p = new Player(mkWorld()); p.loadFromSave(save);
    expect(p.switchWeapon('pistol')).toBe(true);
    p.writeToSave(save);
    const pistolBefore = inv.ammoReserve.pistol, shotBefore = inv.ammoReserve.shotgun;
    inv.ammoReserve.shotgun += 6;                         // pickup/compra da arma não equipada
    p.loadFromSave(save);                                 // fluxo real: syncRuntimeFromSave
    p.writeToSave(save);
    expect(inv.ammoReserve.shotgun).toBe(shotBefore + 6);
    expect(inv.ammoReserve.pistol).toBe(pistolBefore);
    expect(inv.equipped).toBe('pistol');
  });
});

describe('migração de teclas', () => {
  const store = (o) => ({ getItem: () => JSON.stringify(o) });
  it('configurações antigas movem kit/hemostático para 3/4', () => {
    const s = loadSettings(store({ bindings: { medkit: 'Digit1', hemo: 'Digit2', fire: 'Mouse0' } }));
    expect(s.bindings.medkit).toBe('Digit3'); expect(s.bindings.hemo).toBe('Digit4');
    expect(s.bindings.weapon1).toBe('Digit1'); expect(s.bindings.weapon2).toBe('Digit2');
  });
  it('configurações novas e remapeamentos do jogador são preservados', () => {
    const s = loadSettings(store({ bindings: { ...DEFAULT_BINDINGS, medkit: 'KeyZ' } }));
    expect(s.bindings.medkit).toBe('KeyZ');
    const t = loadSettings(store({ bindings: { ...DEFAULT_BINDINGS, weapon1: 'Digit1', medkit: 'Digit1' } }));
    expect(t.bindings.medkit).toBe('Digit1');
  });
});
