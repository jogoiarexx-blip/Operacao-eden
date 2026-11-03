import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChapter } from '../src/chapters/index.js';
import { BACKDROP_OFFSETS, BACKDROP_TEXTURE_SIZE, backdropLayout, createBackdropImpostors } from '../src/world/BackdropImpostors.js';

const fakeGradient = () => ({ addColorStop: vi.fn() });
const fakeContext = () => ({
  createLinearGradient: vi.fn(fakeGradient),
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

describe('Fundos ilustrados inacessíveis — Capítulos 1 e 2', () => {
  it.each(['ch01', 'ch02'])('todos os oito painéis de %s ficam além dos limites jogáveis', (id) => {
    const bounds = getChapter(id).data.bounds;
    for (const layer of ['near', 'far']) {
      const layout = backdropLayout(bounds, layer);
      expect(layout).toHaveLength(4);
      const offset = BACKDROP_OFFSETS[layer];
      for (const plane of layout) {
        expect(plane.height).toBeGreaterThan(10);
        expect(plane.width).toBeGreaterThan(0);
        expect(Number.isFinite(plane.yaw)).toBe(true);
        const xOutside = plane.x <= bounds[0] - offset || plane.x >= bounds[2] + offset;
        const zOutside = plane.z <= bounds[1] - offset || plane.z >= bounds[3] + offset;
        expect(xOutside || zOutside, plane.id).toBe(true);
      }
    }
  });

  it.each([1, 2])('usa somente duas imagens estáticas partilhadas em %s', (chapter) => {
    const bounds = getChapter('ch0' + chapter).data.bounds;
    const bg = createBackdropImpostors({ bounds, chapter });
    expect(canvases).toHaveLength(2);
    expect(canvases.every(c => c.width === BACKDROP_TEXTURE_SIZE.width && c.height === BACKDROP_TEXTURE_SIZE.height)).toBe(true);
    expect(bg.stats()).toMatchObject({ chapter, planes: 8, visiblePlanes: 8, textures: 2 });
    const meshes = [];
    bg.group.traverse(obj => { if (obj.isMesh) meshes.push(obj); });
    expect(meshes).toHaveLength(8);
    expect(new Set(meshes.map(m => m.material.map))).toEqual(new Set(bg.textures));
    for (const mesh of meshes) {
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(false);
      expect(mesh.material.depthWrite).toBe(false);
      expect(mesh.material.fog).toBe(false);
      expect(mesh.frustumCulled).toBe(true);
    }
    bg.setQuality({ foliage: 0.45 });
    expect(bg.stats().visiblePlanes).toBe(4);
    expect(bg.nearGroup.visible).toBe(false);
    bg.setQuality({ foliage: 0.8 });
    expect(bg.stats().visiblePlanes).toBe(8);
    expect(bg.nearGroup.visible).toBe(true);
    const dispose = bg.textures.map(t => vi.spyOn(t, 'dispose'));
    bg.dispose();
    expect(dispose.every(spy => spy.mock.calls.length === 1)).toBe(true);
  });

  it('não altera os limites das fases nem configurações de campanha', () => {
    for (const id of ['ch01', 'ch02']) {
      const data = getChapter(id).data;
      const before = JSON.stringify(data);
      const bg = createBackdropImpostors({ bounds: data.bounds, chapter: data.chapter, quality: 'low' });
      expect(bg.stats().visiblePlanes).toBe(4);
      expect(JSON.stringify(data)).toBe(before);
      bg.dispose();
    }
    expect(() => backdropLayout([0, 0, -1, 1])).toThrow();
    expect(() => backdropLayout([-40, -40, 40, 40], 'unknown')).toThrow();
  });
});
