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
    expect(passesFor('grade')).toEqual([]);   // direto, sem composer
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
    expect(fx.passNames).toEqual([]);
    for (const p of f.created) expect(p.disposed).toBe(true);
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
    expect(fx.passNames).toEqual([]);
    expect(warn).toHaveBeenCalled(); warn.mockRestore();
  });
  it('pulseDamage decai em ~0,4 s (passe grade)', () => {
    const f = makeFactory(); const fx = new PostFX(null, null, null, { createPass: f.createPass, composer: { passes: [], addPass() {}, render() {}, setSize() {}, dispose() {} } });
    fx.setPreset('medium'); fx.pulseDamage(1);
    const grade = f.created.find((p) => p.name === 'grade');
    fx.render(0.01); expect(grade.uniforms.uDamage.value).toBeGreaterThan(0.8);
    fx.render(0.5); expect(grade.uniforms.uDamage.value).toBeLessThan(0.05);
  });
  function fakeOverlay() { const o = { vig: null, dmg: 0, disposed: 0, setVignette(v) { o.vig = v; }, setDamage(d) { o.dmg = d; }, dispose() { o.disposed++; } }; return o; }
  it('Baixo renderiza direto com overlay (vinheta + dano), sem composer', () => {
    const ov = fakeOverlay(); const f = makeFactory(); const direct = vi.fn(); const comp = { render: vi.fn(), setSize() {}, dispose() {} };
    const fx = new PostFX({ render: direct }, 'S', 'C', { createPass: f.createPass, composer: comp, createOverlay: () => ov });
    fx.setGrade({ vignette: 0.35 }); fx.setPreset('low');
    expect(f.created.length).toBe(0); expect(ov.vig).toBe(0.35);
    fx.pulseDamage(1); fx.render(0.1);
    expect(direct).toHaveBeenCalledWith('S', 'C'); expect(comp.render).not.toHaveBeenCalled();
    expect(ov.dmg).toBeCloseTo(0.75, 2);
    fx.render(0.5); expect(ov.dmg).toBe(0);
  });
  it('trocar preset cria/remove overlay sem vazar', () => {
    const made = []; const createOverlay = () => { const o = fakeOverlay(); made.push(o); return o; };
    const f = makeFactory(); const fx = new PostFX(null, null, null, { createPass: f.createPass, createOverlay });
    fx.setPreset('low'); fx.setPreset('medium'); fx.setPreset('low');
    expect(made.length).toBe(2); expect(made[0].disposed).toBe(1); expect(made[1].disposed).toBe(0);
    fx.dispose(); expect(made[1].disposed).toBe(1);
  });
  it('renderer.info é zerado a cada quadro e autoReset desligado', () => {
    const f = makeFactory(); const reset = vi.fn(); const info = { reset, autoReset: true };
    const fx = new PostFX({ info, render() {} }, null, null, { createPass: f.createPass, createOverlay: () => null });
    fx.setPreset('low'); fx.render(0.016);
    expect(reset).toHaveBeenCalledTimes(1); expect(info.autoReset).toBe(false);
  });
});
