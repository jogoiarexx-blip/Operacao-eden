import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import {
  vegetationCells, distanceToVegetationCell, selectVegetationIndices,
  createVegetationSectorStream,
} from '../src/world/VegetationSectorStream.js';

function fakeInstance(points) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
    points.length,
  );
  const matrix = new THREE.Matrix4();
  points.forEach((p, i) => {
    matrix.makeTranslation(p.x, 0, p.z);
    mesh.setMatrixAt(i, matrix);
  });
  return mesh;
}

describe('Streaming setorial: árvore, arbusto, buffer e câmera', () => {
  it('constrói células determinísticas com origem negativa', () => {
    const points = [{ x: -25, z: -1 }, { x: -2, z: -1 }, { x: 0, z: 0 }, { x: 23.9, z: 0 }];
    const c = vegetationCells(points, 24);
    expect(c.map(s => s.key)).toEqual(['-2:-1', '-1:-1', '0:0']);
    expect(c[2].indices).toEqual([2, 3]);
    expect(distanceToVegetationCell(0, 0, c[2])).toBe(0);
    expect(distanceToVegetationCell(300, 0, c[2])).toBeGreaterThan(250);
    expect(() => vegetationCells(points, 0)).toThrow();
  });

  it('mantém histerese entre ativação e descarte', () => {
    const cell = vegetationCells([{ x: 0, z: 0 }], 24);
    const near = selectVegetationIndices(cell, new Set(), { x: 0, z: 0 }, { showDistance: 20, hideDistance: 28 });
    expect(near.indices).toEqual([0]);
    const between = selectVegetationIndices(cell, near.active, { x: 51.5, z: 0 }, { showDistance: 20, hideDistance: 28 });
    expect(between.indices).toEqual([0]); // distância até borda = 27,5
    const far = selectVegetationIndices(cell, between.active, { x: 53, z: 0 }, { showDistance: 20, hideDistance: 28 });
    expect(far.indices).toEqual([]);
    const noPop = selectVegetationIndices(cell, far.active, { x: 51.5, z: 0 }, { showDistance: 20, hideDistance: 28 });
    expect(noPop.indices).toEqual([]);
    expect(() => selectVegetationIndices(cell, new Set(), { x: 0, z: 0 }, { showDistance: 32, hideDistance: 20 })).toThrow();
  });

  it('malhas por espécie (userData.items) só recebem as suas árvores, com a cor por instância junto', () => {
    const trees = [{ x: -52, z: 0 }, { x: -20, z: 0 }, { x: 24, z: 0 }, { x: 104, z: 0 }];
    const species = (globals) => {
      const sub = globals.map((gi) => trees[gi]);
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), sub.length);
      sub.forEach((t, k) => { mesh.setMatrixAt(k, new THREE.Matrix4().makeTranslation(t.x, 0, t.z)); mesh.setColorAt(k, new THREE.Color(globals[k] / 10, 0, 0)); });
      mesh.userData.items = globals.map((gi) => [trees[gi], gi]); return mesh;
    };
    const pine = species([0, 3]), palm = species([1, 2]);
    const bushMesh = fakeInstance([{ x: 0, z: 0 }]);
    const stream = createVegetationSectorStream({ trees, bushes: [{ x: 0, z: 0 }], treeMeshes: [pine, palm], bushMesh, cellSize: 16 });
    stream.update({ x: 104, z: 0 }, { showDistance: 22, hideDistance: 34 });
    expect(pine.count).toBe(1); expect(palm.count).toBe(0);
    const m = new THREE.Matrix4(), c = new THREE.Color(); pine.getMatrixAt(0, m); pine.getColorAt(0, c);
    expect(m.elements[12]).toBe(104); expect(c.r).toBeCloseTo(0.3);
    stream.update({ x: -30, z: 0 }, { showDistance: 22, hideDistance: 34 });
    expect(pine.count).toBe(1); expect(palm.count).toBe(1);
    pine.getMatrixAt(0, m); expect(m.elements[12]).toBe(-52); palm.getMatrixAt(0, m); expect(m.elements[12]).toBe(-20);
  });

  it('compacta instâncias preservando todas as matrizes originais ao retornar', () => {
    const trees = [{ x: -52, z: 0 }, { x: -20, z: 0 }, { x: 24, z: 0 }, { x: 104, z: 0 }];
    const bushes = Array.from({ length: 20 }, (_, i) => ({ x: i * 8 - 70, z: i % 3 }));
    const treeMeshes = [fakeInstance(trees), fakeInstance(trees), fakeInstance(trees)];
    const bushMesh = fakeInstance(bushes);
    const stream = createVegetationSectorStream({ trees, bushes, treeMeshes, bushMesh, cellSize: 16 });
    const original = new THREE.Matrix4(); treeMeshes[0].getMatrixAt(3, original);
    const initial = original.elements[12];
    expect(initial).toBe(104);
    expect(stream.update({ x: -50, z: 0 }, { showDistance: 22, hideDistance: 34 })).toBe(true);
    expect(treeMeshes[0].count).toBe(2);
    expect(treeMeshes[1].count).toBe(2);
    expect(bushMesh.count).toBeLessThan(20);
    expect(stream.update({ x: -50, z: 0 }, { showDistance: 22, hideDistance: 34 })).toBe(false);
    stream.update({ x: 104, z: 0 }, { showDistance: 22, hideDistance: 34 });
    expect(treeMeshes[0].count).toBe(1);
    const matrix = new THREE.Matrix4(); treeMeshes[0].getMatrixAt(0, matrix);
    expect(matrix.elements[12]).toBe(104);
    stream.update({ x: -50, z: 0 }, { showDistance: 22, hideDistance: 34 });
    treeMeshes[0].getMatrixAt(0, matrix);
    expect(matrix.elements[12]).toBe(-52);
    expect(stream.stats().treesTotal).toBe(4);
    expect(stream.stats().treesVisible).toBe(2);
  });

  it('regulagem de folhagem respeita o orçamento sem afetar árvores', () => {
    const trees = [{ x: 0, z: 0 }];
    const bushes = Array.from({ length: 32 }, (_, i) => ({ x: i % 8, z: Math.floor(i / 8) }));
    const treeMeshes = [fakeInstance(trees), fakeInstance(trees), fakeInstance(trees)];
    const bushMesh = fakeInstance(bushes);
    const stream = createVegetationSectorStream({ trees, bushes, treeMeshes, bushMesh });
    stream.update({ x: 0, z: 0 });
    expect(bushMesh.count).toBe(32);
    stream.setQuality(0.25);
    expect(stream.update({ x: 0, z: 0 })).toBe(true);
    expect(bushMesh.count).toBeGreaterThan(0);
    expect(bushMesh.count).toBeLessThan(32);
    expect(treeMeshes[0].count).toBe(1);
    stream.setQuality(1);
    stream.update({ x: 0, z: 0 });
    expect(bushMesh.count).toBe(32);
    stream.update({ x: 1000, z: 1000 });
    expect(treeMeshes[0].count).toBe(0);
    expect(bushMesh.count).toBe(0);
  });
});
