import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ParticlePool } from '../src/render/ParticlePool.js';
import { Decals } from '../src/render/Decals.js';
import { FX, surfaceNormal } from '../src/world/FX.js';
import { createRain } from '../src/render/Rain.js';
import { QUALITY } from '../src/core/Settings.js';
import { createRng } from '../src/core/rng.js';
import { resolveShot } from '../src/actors/Combat.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { WEAPONS } from '../src/gameplay/GameState.js';

describe('ParticlePool', () => {
  it('pool de 4 com 6 spawns: alive 4 e as 2 primeiras recicladas', () => {
    const p = new ParticlePool({ capacity: 4 });
    for (let i = 0; i < 6; i++) p.spawn('smoke', { x: i, y: 1, z: 0 });
    expect(p.alive).toBe(4);
    const xs = [0, 3, 6, 9].map((j) => p.pos[j]).sort();
    expect(xs).toEqual([2, 3, 4, 5]);
  });
  it('não aloca após o construtor: arrays e atributos mantêm identidade após 1000 spawns + updates', () => {
    const p = new ParticlePool({ capacity: 50 });
    const grab = () => [p.pos, p.col, p.size, p.vel, p.life, p.geometry.attributes.position.array, p.geometry.attributes.aColor.array];
    const before = grab(), keys = Object.keys(p).sort().join();
    for (let i = 0; i < 1000; i++) { p.spawn(['spark', 'dust', 'blood', 'shell', 'muzzle', 'smoke'][i % 6], { x: 0, y: 1, z: 0 }, { dir: { x: 1, y: 0, z: 0 } }); if (i % 10 === 0) p.update(0.016); }
    expect(p.alive).toBeLessThanOrEqual(50);
    expect(grab().every((a, i) => a === before[i])).toBe(true);
    expect(Object.keys(p).sort().join()).toBe(keys);
  });
  it('partículas morrem e o ponto fica invisível', () => {
    const p = new ParticlePool({ capacity: 8 });
    p.spawn('spark', { x: 0, y: 1, z: 0 }); expect(p.points.visible).toBe(true);
    for (let i = 0; i < 40; i++) p.update(0.05);
    expect(p.alive).toBe(0); expect(p.points.visible).toBe(false);
  });
  it('dispose remove da cena', () => {
    const scene = new THREE.Scene(), p = new ParticlePool({ capacity: 4, scene });
    expect(scene.children).toContain(p.points); p.dispose(); expect(scene.children).not.toContain(p.points);
  });
});

describe('Decals', () => {
  it('capacidade 3 com 5 add: count 3; update(21) zera', () => {
    const d = new Decals({ capacity: 3 });
    for (let i = 0; i < 5; i++) d.add('bullet', { x: i, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 0.1);
    expect(d.count).toBe(3);
    d.update(21); expect(d.count).toBe(0);
  });
  it('fade nos últimos segundos e a normal vira o eixo z do plano', () => {
    const d = new Decals({ capacity: 2 });
    d.add('blood', { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 1);
    const e = d.mesh.instanceMatrix.array; expect([e[8], e[9], e[10]]).toEqual([0, 1, 0]);
    const a0 = d.colArr[3]; d.update(18); expect(d.colArr[3]).toBeLessThan(a0); expect(d.count).toBe(1);
  });
});

describe('FX', () => {
  const mk = (q = 'medium') => { const scene = new THREE.Scene(); return { scene, fx: new FX(scene, q) }; };
  it('impact metal gera spark; ground gera dust', () => {
    const { fx } = mk();
    fx.impact({ x: 0, y: 1, z: 0 }, 'metal'); expect(fx.particles.countByType('spark')).toBeGreaterThan(0);
    const b = mk().fx; b.impact({ x: 0, y: 0.5, z: 0 }, 'ground'); expect(b.particles.countByType('dust')).toBeGreaterThan(0); expect(b.particles.countByType('spark')).toBe(0);
  });
  it('capacidades vêm de QUALITY; troca de qualidade e reset não deixam objetos na cena', () => {
    const { scene, fx } = mk('high');
    expect(fx.particles.capacity).toBe(QUALITY.high.particles); expect(fx.decals.capacity).toBe(QUALITY.high.decals);
    const n = scene.children.length;
    fx.setQuality('low'); expect(fx.particles.capacity).toBe(QUALITY.low.particles); expect(fx.decals.capacity).toBe(QUALITY.low.decals);
    fx.setQuality('medium'); fx.reset();
    expect(scene.children.length).toBe(n);
  });
  it('uma única PointLight, nunca criada/removida por tiro; decai em 60 ms', () => {
    const { scene, fx } = mk();
    const lights = () => scene.children.filter((c) => c.isLight).length;
    expect(lights()).toBe(1); expect(fx.light.intensity).toBe(0);
    fx.muzzle({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 'pistol'); expect(fx.light.intensity).toBeGreaterThan(0); expect(lights()).toBe(1);
    fx.update(0.03); expect(fx.light.intensity).toBeGreaterThan(0);
    fx.update(0.04); expect(fx.light.intensity).toBe(0); expect(lights()).toBe(1);
  });
  it('Baixo não tem PointLight (custo por fragmento); medium/alto têm exatamente uma, trocada só com o preset', () => {
    const { scene, fx } = mk('low');
    expect(scene.children.filter((c) => c.isLight).length).toBe(0);
    fx.muzzle({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }); fx.update(0.1);
    fx.setQuality('high'); expect(scene.children.filter((c) => c.isLight).length).toBe(1);
    fx.setQuality('low'); expect(scene.children.filter((c) => c.isLight).length).toBe(0);
  });
  it('API legada tracer/burst continua funcionando', () => {
    const { fx } = mk();
    fx.tracer({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: -5 }); fx.burst({ x: 0, y: 1, z: 0 }, 0xff0000, 5);
    expect(fx.particles.alive).toBe(5); for (let i = 0; i < 10; i++) fx.update(0.1); expect(fx.particles.alive).toBe(0);
  });
  it('surfaceNormal: face mais próxima da caixa', () => {
    const c = { type: 'box', x0: 0, x1: 2, z0: 0, z1: 2, y0: 0, y1: 2 };
    expect({ ...surfaceNormal(c, { x: 1, y: 1, z: 2 }, { x: 0, y: 0, z: 0 }) }).toEqual({ x: 0, y: 0, z: 1 });
    expect({ ...surfaceNormal(c, { x: 0, y: 1, z: 1 }, { x: 0, y: 0, z: 0 }) }).toEqual({ x: -1, y: 0, z: 0 });
  });
});

describe('FX não toca na simulação', () => {
  function scripted(useFx) {
    const world = new CollisionWorld([-60, -60, 60, 60]); world.addBox('wall', 0, -20, 8, 3, 1);
    const rng = createRng(77); let calls = 0;
    const counting = { ...rng, next: () => { calls++; return rng.next(); }, range: (a, b) => { calls++; return rng.range(a, b); } };
    const fx = useFx ? new FX(new THREE.Scene(), 'medium') : null;
    const out = [];
    for (const wid of ['pistol', 'shotgun']) for (let i = 0; i < 6; i++) {
      const mz = { x: i * 0.2, y: 1.28, z: 0 };
      const cam = { reticleRay: () => ({ ox: mz.x, oy: 1.6, oz: 1.5, dx: 0, dy: 0, dz: -1 }) };
      const res = resolveShot({ world, enemies: [], camera: cam, muzzle: mz, weapon: WEAPONS[wid], spreadDeg: 2, rng: counting, assist: 0 });
      fx?.shotEffects(res, mz, wid, { surfaceOf: () => 'concrete', colliderAt: () => null });
      fx?.update(0.016);
      out.push(JSON.stringify(res.kind === 'spread' ? res.impacts : res.point));
    }
    return { out, calls, state: rng.state() };
  }
  it('mesma sequência de tiros: resultados e consumo do rng de jogo idênticos com FX real e sem FX', () => {
    const a = scripted(false), b = scripted(true);
    expect(a.calls).toBeGreaterThan(0);
    expect(b.calls).toBe(a.calls); expect(b.state).toBe(a.state); expect(b.out).toEqual(a.out);
  });
});

describe('Rain.setQuality (traços fantasmas)', () => {
  it('alto→médio zera os slots de respingo acima da nova contagem', () => {
    const r = createRain({ seed: 3, quality: 'high' });
    const pos = r.splashes.geometry.attributes.position.array, col = r.splashes.geometry.attributes.color.array;
    let seen = false;
    for (let i = 0; i < 600 && !seen; i++) { r.update(0.016, { x: 0, z: 0 }); seen = pos.slice(48 * 24).some((v) => v !== 0); }
    expect(seen).toBe(true);   // havia respingo vivo nos slots que o médio não usa
    r.setQuality('medium');
    expect(pos.slice(48 * 24).every((v) => v === 0)).toBe(true); expect(col.slice(48 * 24).every((v) => v === 0)).toBe(true);
    r.setQuality('high'); r.update(0.001, { x: 0, z: 0 });
    expect(pos.slice(48 * 24).every((v) => v === 0)).toBe(true);
  });
});
