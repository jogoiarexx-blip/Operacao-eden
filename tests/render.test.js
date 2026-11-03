import { describe, it, expect, afterEach } from 'vitest';
import { QUALITY } from '../src/core/Settings.js';
import { generatePixels, getTexture, disposeTextures, textureCacheSize } from '../src/render/ProceduralTextures.js';
import { getMaterial, disposeMaterials } from '../src/render/Materials.js';

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
