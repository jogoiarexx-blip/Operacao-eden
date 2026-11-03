import { describe, it, expect, afterEach } from 'vitest';
import { QUALITY } from '../src/core/Settings.js';
import { generatePixels, getTexture, disposeTextures, textureCacheSize } from '../src/render/ProceduralTextures.js';
import { getMaterial, disposeMaterials, disposeRenderResources } from '../src/render/Materials.js';

describe('presets gráficos', () => {
  it('QUALITY tem as chaves novas nos 3 níveis', () => {
    expect(QUALITY.low).toMatchObject({ postfx: 'grade', pbr: false, moonShadow: false, grass: 0, particles: 80, decals: 12, volumetric: false });
    expect(QUALITY.medium).toMatchObject({ postfx: 'bloom', pbr: true, moonShadow: true, grass: 0.6, particles: 220, decals: 40, volumetric: true });
    expect(QUALITY.high).toMatchObject({ postfx: 'full', pbr: true, moonShadow: true, grass: 1.0, particles: 400, decals: 80, volumetric: true });
    expect(QUALITY.low.shadowMap).toBe(0);
  });
});
describe('texturas procedurais', () => {
  afterEach(() => disposeTextures());
  it('generatePixels é determinístico e depende da seed', () => {
    const a = generatePixels('dirt', 7, 32), b = generatePixels('dirt', 7, 32), c = generatePixels('dirt', 8, 32);
    expect(a).toBeInstanceOf(Uint8ClampedArray);
    expect(a.length).toBe(32 * 32 * 4);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });
  it('todos os tipos geram pixels opacos', () => {
    for (const k of ['dirt', 'mud', 'gravel', 'bark', 'scales', 'cloth', 'concrete', 'metal', 'foliage']) {
      const p = generatePixels(k, 1, 16); expect(p.length).toBe(16 * 16 * 4); expect(p[3]).toBe(255);
    }
  });
  it('getTexture usa cache e disposeTextures esvazia', () => {
    const t = getTexture('bark', { seed: 1, size: 32 });
    expect(getTexture('bark', { seed: 1, size: 32 })).toBe(t);
    expect(textureCacheSize()).toBe(1);
    disposeTextures();
    expect(textureCacheSize()).toBe(0);
  });
});
describe('correções de revisão', () => {
  afterEach(() => disposeRenderResources());
  it('repeat diferente → textura própria', () => {
    const a = getTexture('dirt', { size: 16, repeat: 2 }), b = getTexture('dirt', { size: 16, repeat: 5 });
    expect(a).not.toBe(b); expect(a.repeat.x).toBe(2); expect(b.repeat.x).toBe(5);
    expect(getTexture('dirt', { size: 16, repeat: 2 })).toBe(a);
  });
  it('disposeRenderResources esvazia os dois caches', () => {
    getMaterial('bark', 'high'); expect(textureCacheSize()).toBeGreaterThan(0);
    disposeRenderResources(); expect(textureCacheSize()).toBe(0);
    expect(getMaterial('bark', 'high').map).toBeTruthy();
  });
  it('texturas são quase neutras (cor do papel é o tint)', () => {
    for (const k of ['dirt', 'mud', 'gravel', 'bark', 'scales', 'cloth', 'concrete', 'metal', 'foliage']) {
      const p = generatePixels(k, 3, 32); let r = 0, g = 0, b = 0; for (let i = 0; i < p.length; i += 4) { r += p[i]; g += p[i + 1]; b += p[i + 2]; }
      const n = p.length / 4; expect(Math.abs(r - g) / n).toBeLessThan(10); expect(Math.abs(g - b) / n).toBeLessThan(10); expect(r / n).toBeGreaterThan(180);
    }
  });
  it('accent muda a textura de scales (e só dela)', () => {
    expect(Array.from(generatePixels('scales', 1, 32, { accent: 0xff0000 }))).not.toEqual(Array.from(generatePixels('scales', 1, 32)));
    expect(Array.from(generatePixels('dirt', 1, 16, { accent: 0xff0000 }))).toEqual(Array.from(generatePixels('dirt', 1, 16)));
    expect(getMaterial('scales', 'high', { accent: 0xff0000 }).map).not.toBe(getMaterial('scales', 'high').map);
  });
});
describe('materiais', () => {
  afterEach(() => { disposeMaterials(); disposeTextures(); });
  it('Lambert no Baixo, Standard no Alto, com cache', () => {
    expect(getMaterial('cloth', 'low').type).toBe('MeshLambertMaterial');
    expect(getMaterial('cloth', 'high').type).toBe('MeshStandardMaterial');
    expect(getMaterial('cloth', 'high')).toBe(getMaterial('cloth', 'high'));
    expect(getMaterial('cloth', 'high', { color: 0xff0000 })).not.toBe(getMaterial('cloth', 'high'));
  });
  it('todos os papéis existem; lâmpada emissiva', () => {
    for (const r of ['ground', 'bark', 'foliage', 'skin', 'cloth', 'clothDark', 'scales', 'metal', 'concrete', 'wood', 'emissiveLamp']) expect(getMaterial(r, 'medium').flatShading).toBe(true);
    expect(getMaterial('emissiveLamp', 'high', { emissive: 0xffeeaa }).emissiveIntensity).toBeGreaterThan(1);
  });
});
