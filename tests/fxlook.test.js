import { describe, it, expect } from 'vitest';
import { Game } from '../src/Game.js';
import { ParticlePool } from '../src/render/ParticlePool.js';
import { Decals } from '../src/render/Decals.js';

describe('sangramento pulsa a vinheta', () => {
  const run = (reduceFlash) => {
    const calls = [];
    const self = { player: {}, settings: { reduceFlash }, postfx: { pulseDamage: (v) => calls.push(v) } };
    Game.prototype.onPlayerEvent.call(self, { type: 'bleedTick' });
    return calls;
  };
  it('bleedTick chama pulseDamage', () => { expect(run(false)).toEqual([0.2]); });
  it('reduceFlash atenua o pulso', () => { expect(run(true)).toEqual([0.05]); });
  it('sem postfx não quebra', () => {
    expect(() => Game.prototype.onPlayerEvent.call({ player: {}, settings: {}, postfx: null }, { type: 'bleedTick' })).not.toThrow();
  });
});

describe('FX: tone mapping e espaço de cor', () => {
  it('shaders de partículas e decalques incluem tonemapping e colorspace', () => {
    const p = new ParticlePool({ capacity: 4 }), d = new Decals({ capacity: 4 });
    for (const m of [p.material, d.material]) {
      expect(m.fragmentShader).toContain('#include <tonemapping_fragment>');
      expect(m.fragmentShader).toContain('#include <colorspace_fragment>');
      expect(m.toneMapped).toBe(true);
    }
  });
  it('cores sRGB são convertidas para linear uma vez (poeira 0.55 sRGB < 0.3 linear)', () => {
    const p = new ParticlePool({ capacity: 2 });
    p.spawn('dust', { x: 0, y: 0, z: 0 });
    expect(p.base[0]).toBeLessThan(0.4);
    expect(p.base[0]).toBeGreaterThan(0.1);
  });
});
