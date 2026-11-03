import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { createAtmosphere } from '../src/render/Atmosphere.js';
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
describe('accent assado', () => {
  afterEach(() => disposeRenderResources());
  it('scales com accent: material branco, faixas ≈ accent, base ≈ cor do papel', () => {
    const m = getMaterial('scales', 'high', { color: 0x5f8a4a, accent: 0xff0000 });
    expect(m.color.getHex()).toBe(0xffffff);
    const p = m.map.image.data; let bands = 0, base = 0, br = 0, bg = 0, bb = 0, ar = 0;
    for (let i = 0; i < p.length; i += 4) { if (p[i] > p[i + 1] * 2) { bands++; ar += p[i]; } else { base++; br += p[i]; bg += p[i + 1]; bb += p[i + 2]; } }
    expect(bands).toBeGreaterThan(0); expect(base).toBeGreaterThan(0);
    expect(ar / bands).toBeGreaterThan(200);
    expect(br / base / 255).toBeGreaterThan(0x5f / 255 * 0.8); expect(bg / base).toBeGreaterThan(bb / base); expect(Math.abs(br / base - 0x5f)).toBeLessThan(40);
  });
  it('accent só entra no hash de scales', () => {
    expect(getMaterial('cloth', 'high', { accent: 1 })).toBe(getMaterial('cloth', 'high', { accent: 2 }));
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
describe('atmosfera', () => {
  const mk = (quality) => { const scene = new THREE.Scene(); const atmo = createAtmosphere({ scene, quality, data: { bounds: [-40, -40, 40, 40] } }); return { scene, atmo }; };
  const upd = (atmo) => atmo.update(0.016, { player: { x: 1, z: 2 }, flashlight: true, camera: { pos: { x: 0, y: 1.6, z: 0 }, dir: { x: 0, y: 0, z: -1 } }, lightning: 0 });
  it('Baixo não cria cone nem névoa', () => {
    const { scene, atmo } = mk('low'); expect(atmo.group.children.length).toBe(0); upd(atmo); expect(atmo.group.children.length).toBe(0); atmo.dispose(); expect(scene.children.includes(atmo.group)).toBe(false);
  });
  it('Médio cria cone e névoa; dispose remove o grupo', () => {
    const { scene, atmo } = mk('medium'); expect(atmo.group.children.length).toBeGreaterThan(0); expect(scene.children).toContain(atmo.group); upd(atmo);
    const fog = atmo.group.children.filter((c) => c.name === 'fogQuad'); expect(fog.length).toBeGreaterThanOrEqual(6); expect(fog.length).toBeLessThanOrEqual(10);
    expect(atmo.group.getObjectByName('flashlightCone')).toBeTruthy();
    atmo.group.traverse((o) => { if (o.isMesh || o.isPoints) { expect(o.material.depthWrite).toBe(false); const hit = []; o.raycast(new THREE.Raycaster(), hit); expect(hit.length).toBe(0); } });
    atmo.dispose(); expect(scene.children.includes(atmo.group)).toBe(false); expect(atmo.group.children.length).toBe(0);
  });
  it('setQuality alterna sem acumular filhos', () => {
    const { scene, atmo } = mk('medium'); const n = atmo.group.children.length;
    atmo.setQuality('low'); expect(atmo.group.children.length).toBe(0);
    atmo.setQuality('high'); expect(atmo.group.children.length).toBe(n);
    for (let i = 0; i < 5; i++) { atmo.setQuality('medium'); atmo.setQuality('low'); }
    atmo.setQuality('medium'); expect(atmo.group.children.length).toBe(n); expect(scene.children.length).toBe(1); atmo.dispose();
  });
  it('lanterna desligada esconde o cone', () => {
    const { atmo } = mk('medium'); atmo.update(0.016, { player: { x: 0, z: 0 }, flashlight: false, camera: { pos: { x: 0, y: 1.6, z: 0 }, dir: { x: 0, y: 0, z: -1 } }, lightning: 0 });
    expect(atmo.group.getObjectByName('flashlightCone').visible).toBe(false); atmo.dispose();
  });
});
