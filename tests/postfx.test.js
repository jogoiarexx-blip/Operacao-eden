import { describe, it, expect, vi } from 'vitest';
import { PostFX, passesFor } from '../src/render/PostFX.js';

function makeFactory(opts = {}) {
  const created = [];
  const createPass = (name) => {
    if (opts.failOn === name) throw new Error('sem suporte: ' + name);
    const p = { name, size: null, disposed: false, uniforms: { uDamage: { value: 0 }, uTime: { value: 0 }, uVignette: { value: 0 }, uGrain: { value: 0 } },
      setSize(w, h) { this.size = [w, h]; }, dispose() { this.disposed = true; } };
    created.push(p); return p;
  };
  return { createPass, created };
}

describe('passesFor', () => {
  it('lista passes por nível', () => {
    expect(passesFor('grade')).toEqual(['render', 'grade', 'output']);
    expect(passesFor('bloom')).toEqual(['render', 'bloom', 'grade', 'output']);
    expect(passesFor('full')).toEqual(['render', 'sao', 'bloom', 'grade', 'output']);
  });
});

describe('PostFX', () => {
  it('setPreset(high) registra a ordem dos passes', () => {
    const f = makeFactory(); const fx = new PostFX(null, null, null, { createPass: f.createPass });
    fx.setPreset('high');
    expect(fx.passNames).toEqual(['render', 'sao', 'bloom', 'grade', 'output']);
    expect(f.created.map((p) => p.name)).toEqual(['render', 'sao', 'bloom', 'grade', 'output']);
  });
  it('setPreset(low) depois de high descarta os passes removidos', () => {
    const f = makeFactory(); const fx = new PostFX(null, null, null, { createPass: f.createPass });
    fx.setPreset('high'); fx.setPreset('low');
    expect(fx.passNames).toEqual(['render', 'grade', 'output']);
    expect(f.created.find((p) => p.name === 'sao').disposed).toBe(true);
    expect(f.created.find((p) => p.name === 'bloom').disposed).toBe(true);
    expect(f.created.find((p) => p.name === 'grade').disposed).toBe(false);
  });
  it('setSize repassa tamanho multiplicado pelo dpr', () => {
    const f = makeFactory(); const fx = new PostFX(null, null, null, { createPass: f.createPass });
    fx.setPreset('high'); fx.setSize(800, 600, 2);
    for (const p of f.created) expect(p.size).toEqual([1600, 1200]);
  });
  it('falha em sao cai para grade com aviso', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = makeFactory({ failOn: 'sao' }); const fx = new PostFX(null, null, null, { createPass: f.createPass });
    fx.setPreset('high');
    expect(fx.effectivePreset).toBe('grade');
    expect(fx.passNames).toEqual(['render', 'grade', 'output']);
    expect(warn).toHaveBeenCalled(); warn.mockRestore();
  });
  it('pulseDamage decai em ~0,4 s', () => {
    const f = makeFactory(); const fx = new PostFX(null, null, null, { createPass: f.createPass, composer: { render() {}, setSize() {}, dispose() {} } });
    fx.setPreset('low'); fx.pulseDamage(1);
    const grade = f.created.find((p) => p.name === 'grade');
    fx.render(0.01); const a = grade.uniforms.uDamage.value;
    expect(a).toBeGreaterThan(0.8);
    fx.render(0.5); expect(grade.uniforms.uDamage.value).toBeLessThan(0.05);
  });
  it('grão é 0 no Baixo e aplicado no Médio', () => {
    const f = makeFactory(); const fx = new PostFX(null, null, null, { createPass: f.createPass });
    fx.setPreset('low'); fx.setGrade({ grain: 0.012 });
    expect(f.created.find((p) => p.name === 'grade').uniforms.uGrain.value).toBe(0);
    fx.setPreset('medium');
    expect(f.created.find((p) => p.name === 'grade').uniforms.uGrain.value).toBe(0.012);
  });
  it('renderer.info é zerado a cada quadro (autoReset desligado no composer)', () => {
    const f = makeFactory(); const reset = vi.fn(); const direct = vi.fn();
    const fx = new PostFX({ info: { reset }, render: direct }, null, null, { createPass: f.createPass });
    fx.setPreset('low'); fx.render(0.016);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
