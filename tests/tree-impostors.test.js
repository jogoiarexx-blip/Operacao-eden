import * as THREE from 'three';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getChapter } from '../src/chapters/index.js';
import {
  TREE_CARD_COUNT, TREE_CARD_TEXTURE, planUnreachableTreeCards, createUnreachableTreeCards,
} from '../src/world/TreeImpostors.js';

beforeEach(() => vi.stubGlobal('document', {
  createElement(tag) {
    if (tag !== 'canvas') throw Error('Elemento inesperado: ' + tag);
    return {
      width: 0, height: 0,
      getContext: () => ({
        clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
        closePath() {}, fill() {},
      }),
    };
  },
}));
afterEach(() => vi.unstubAllGlobals());

describe('Árvores em imagem nas áreas inacessíveis', () => {
  it('gera as mesmas 60 posições além do mapa, sem invadir áreas navegáveis', () => {
    for (const id of ['ch01', 'ch02']) {
      const data = getChapter(id).data;
      const first = planUnreachableTreeCards(data.bounds, data.chapter);
      expect(first).toHaveLength(TREE_CARD_COUNT);
      expect(first).toEqual(planUnreachableTreeCards(data.bounds, data.chapter));
      expect(first.every(t => t.x < data.bounds[0] || t.x > data.bounds[2] ||
        t.z < data.bounds[1] || t.z > data.bounds[3])).toBe(true);
    }
    expect(() => planUnreachableTreeCards([4, 4, 1, 1])).toThrow();
  });
  it('duas malhas instanciadas com uma textura raster leve, sem colisões', () => {
    const data = getChapter('ch01').data;
    const api = createUnreachableTreeCards(data.bounds, data.chapter);
    expect(api.stats()).toMatchObject({ trees: TREE_CARD_COUNT, visibleTrees: TREE_CARD_COUNT,
      panels: 2, textures: 1, outsideBounds: true });
    expect(api.texture.image.width).toBe(TREE_CARD_TEXTURE.width);
    expect(api.texture.image.height).toBe(TREE_CARD_TEXTURE.height);
    expect(api.group.children).toHaveLength(2);
    expect(api.panels.every(m => m.isInstancedMesh && m.count === TREE_CARD_COUNT && !m.castShadow)).toBe(true);
    api.setQuality(.3);
    expect(api.stats().visibleTrees).toBeLessThan(TREE_CARD_COUNT);
    api.setQuality(1);
    expect(api.stats().visibleTrees).toBe(TREE_CARD_COUNT);
    api.update({ x: 0, z: 0 }, .016);
    const before = new THREE.Matrix4();
    api.panels[0].getMatrixAt(2, before);
    for (let i = 0; i < 30; i++) api.update({ x: 60, z: 0 }, .1);
    const after = new THREE.Matrix4();
    api.panels[0].getMatrixAt(2, after);
    expect(before.equals(after)).toBe(false);
    api.dispose();
  });
});
