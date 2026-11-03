import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChapter } from '../src/chapters/index.js';
import {
  BACKDROP_OFFSETS, BACKDROP_TEXTURE_SIZE,
  backdropLayout, backdropOpacity, panoramicRidgeY, createBackdropImpostors,
} from '../src/world/BackdropImpostors.js';

const fakeContext = () => ({
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
  lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
  globalCompositeOperation: 'source-over', globalAlpha: 1,
});
let canvases;
beforeEach(() => {
  canvases = [];
  vi.stubGlobal('document', {
    createElement(tag) {
      if (tag !== 'canvas') throw new Error('only canvas expected: ' + tag);
      const canvas = { width: 0, height: 0, getContext: vi.fn(fakeContext) };
      canvases.push(canvas);
      return canvas;
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('Panoramas 360 graus dos dois capítulos', () => {
  it('montanhas fecham exatamente a costura horizontal da textura', () => {
    for (const baseline of [155, 163, 191, 192]) {
      for (const amplitude of [9, 18, 22, 29]) {
        const y0 = panoramicRidgeY(0, 1024, baseline, amplitude);
        const y1 = panoramicRidgeY(1024, 1024, baseline, amplitude);
        expect(y0).toBeCloseTo(y1, 9);
        const left = panoramicRidgeY(1, 1024, baseline, amplitude);
        const right = panoramicRidgeY(1023, 1024, baseline, amplitude);
        expect(Math.abs(left - right)).toBeLessThan(1);
      }
    }
  });

  it.each(['ch01', 'ch02'])('%s mantém o cilindro inteiro fora dos cantos jogáveis', id => {
    const bounds = getChapter(id).data.bounds;
    const diagonal = Math.hypot((bounds[2] - bounds[0]) / 2, (bounds[3] - bounds[1]) / 2);
    const near = backdropLayout(bounds, 'near');
    const far = backdropLayout(bounds, 'far');
    expect(near.radius).toBeCloseTo(diagonal + BACKDROP_OFFSETS.near, 5);
    expect(far.radius).toBeCloseTo(diagonal + BACKDROP_OFFSETS.far, 5);
    expect(far.radius).toBeGreaterThan(near.radius);
    expect(near.radialSegments).toBe(48);
    expect(far.radialSegments).toBe(48);
    expect(near.x).toBe((bounds[0] + bounds[2]) / 2);
    expect(near.z).toBe((bounds[1] + bounds[3]) / 2);
  });

  it.each([1, 2])('capítulo %s usa apenas dois cilindros sem costuras', chapter => {
    const bounds = getChapter('ch0' + chapter).data.bounds;
    const bg = createBackdropImpostors({ bounds, chapter });
    expect(canvases).toHaveLength(2);
    expect(canvases.every(c => c.width === BACKDROP_TEXTURE_SIZE.width && c.height === BACKDROP_TEXTURE_SIZE.height)).toBe(true);
    expect(bg.stats()).toMatchObject({ chapter, planes: 2, visiblePlanes: 2, textures: 2 });
    const meshes = [];
    bg.group.traverse(obj => { if (obj.isMesh) meshes.push(obj); });
    expect(meshes).toHaveLength(2);
    expect(new Set(meshes.map(m => m.material.map))).toEqual(new Set(bg.textures));
    for (const mesh of meshes) {
      expect(mesh.geometry.type).toBe('CylinderGeometry');
      expect(mesh.geometry.parameters.openEnded).toBe(true);
      expect(mesh.geometry.parameters.radialSegments).toBe(48);
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(false);
      expect(mesh.material.depthWrite).toBe(false);
      expect(mesh.material.fog).toBe(false);
      expect(mesh.frustumCulled).toBe(true);
    }
    bg.setQuality({ foliage: 0.45, fogFar: 62 });
    expect(bg.stats().visiblePlanes).toBe(1);
    expect(bg.nearGroup.visible).toBe(false);
    bg.setQuality({ foliage: 0.8, fogFar: 78 });
    expect(bg.stats().visiblePlanes).toBe(2);
    expect(bg.nearGroup.visible).toBe(true);
    expect(bg.stats().opacity).toEqual([backdropOpacity(78).far, backdropOpacity(78).near]);
    const dispose = bg.textures.map(t => vi.spyOn(t, 'dispose'));
    bg.dispose();
    expect(dispose.every(spy => spy.mock.calls.length === 1)).toBe(true);
  });

  it('ajusta a opacidade à névoa sem tocar em colisões ou campanha', () => {
    const lo = backdropOpacity(62), mid = backdropOpacity(78), high = backdropOpacity(92);
    expect(lo.far).toBeLessThan(mid.far);
    expect(mid.far).toBeLessThan(high.far);
    expect(lo.near).toBeLessThan(high.near);
    for (const id of ['ch01', 'ch02']) {
      const data = getChapter(id).data;
      const before = JSON.stringify(data);
      const bg = createBackdropImpostors({ bounds: data.bounds, chapter: data.chapter, quality: 'low' });
      expect(bg.stats().visiblePlanes).toBe(1);
      expect(JSON.stringify(data)).toBe(before);
      bg.dispose();
    }
    expect(() => backdropLayout([0, 0, -1, 1])).toThrow();
    expect(() => backdropLayout([-40, -40, 40, 40], 'unknown')).toThrow();
  });
});
