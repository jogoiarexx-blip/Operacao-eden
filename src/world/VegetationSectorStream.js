import * as THREE from 'three';

/**
 * Streaming espacial de instâncias 3D, sem descarregar colisores ou criar draw calls
 * adicionais. As quatro InstancedMeshes existentes recebem só matrizes visíveis.
 * Tudo permanece no mesmo buffer GPU; sem alterar a posição, ID ou save da árvore.
 */

export const VEGETATION_CELL_SIZE = 24;
export const VEGETATION_SHOW_DISTANCE = 62;
export const VEGETATION_HIDE_DISTANCE = 76;

const clamp = (v, low, high) => Math.max(low, Math.min(high, v));

export function vegetationCells(points, cellSize = VEGETATION_CELL_SIZE) {
  if (!(cellSize > 0)) throw new Error('cellSize precisa ser maior que zero');
  const cells = new Map();
  points.forEach((p, index) => {
    const cx = Math.floor(p.x / cellSize), cz = Math.floor(p.z / cellSize);
    const key = `${cx}:${cz}`;
    let c = cells.get(key);
    if (!c) {
      c = { key, x0: cx * cellSize, x1: (cx + 1) * cellSize,
        z0: cz * cellSize, z1: (cz + 1) * cellSize, indices: [] };
      cells.set(key, c);
    }
    c.indices.push(index);
  });
  return Array.from(cells.values());
}

export function distanceToVegetationCell(x, z, cell) {
  return Math.hypot(x - clamp(x, cell.x0, cell.x1), z - clamp(z, cell.z0, cell.z1));
}

/** Conserva o estado de cada célula entre updates, evitando pop de visibilidade. */
export function selectVegetationIndices(cells, active, player, {
  showDistance = VEGETATION_SHOW_DISTANCE, hideDistance = VEGETATION_HIDE_DISTANCE,
} = {}) {
  if (!(showDistance > 0 && hideDistance > showDistance)) throw new Error('Distâncias inválidas');
  const indices = [], nextActive = new Set();
  for (const cell of cells) {
    const distance = distanceToVegetationCell(player.x, player.z, cell);
    if (distance < (active.has(cell.key) ? hideDistance : showDistance)) {
      nextActive.add(cell.key);
      indices.push(...cell.indices);
    }
  }
  // Ordem original e determinística preserva identificação e resultados do seed.
  indices.sort((a, b) => a - b);
  return { indices, active: nextActive };
}

const sameIndices = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
const stableSelection = (index, fraction) =>
  fraction >= 1 || (fraction > 0 && ((index * 2654435761 >>> 0) / 4294967296) < fraction);

/**
 * Guarda cópia das matrizes originais, pois a compactação sobrescreve os slots
 * das InstancedMeshes. A CPU atualiza apenas quando muda a lista de índices.
 */
export function createVegetationSectorStream({ trees, bushes, treeMeshes, bushMesh, cellSize = VEGETATION_CELL_SIZE }) {
  if (treeMeshes.length !== 3) throw new Error('Esperadas três camadas de árvore');
  const treeCells = vegetationCells(trees, cellSize), bushCells = vegetationCells(bushes, cellSize);
  const treeMatrices = treeMeshes.map((mesh) => trees.map((_, i) => {
    if (typeof mesh.getMatrixAt !== 'function') throw new Error('InstancedMesh de árvore inválido');
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(i, matrix);
    return matrix;
  }));
  const bushMatrices = bushes.map((_, i) => {
    if (typeof bushMesh.getMatrixAt !== 'function') throw new Error('InstancedMesh de arbusto inválido');
    const matrix = new THREE.Matrix4();
    bushMesh.getMatrixAt(i, matrix);
    return matrix;
  });
  let activeTrees = new Set(), activeBushes = new Set();
  let shownTrees = [], shownBushes = [], quality = 1;
  let updates = 0;

  function writeInstances(mesh, matrices, indices) {
    for (let k = 0; k < indices.length; k++) mesh.setMatrixAt(k, matrices[indices[k]]);
    mesh.count = indices.length;
    if (indices.length) mesh.instanceMatrix.needsUpdate = true;
  }

  const api = {
    treeCells, bushCells,
    setQuality(fraction) { quality = clamp(Number.isFinite(fraction) ? fraction : 1, 0, 1); },
    update(player, opts = {}) {
      if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return false;
      const T = selectVegetationIndices(treeCells, activeTrees, player, opts);
      const B = selectVegetationIndices(bushCells, activeBushes, player, opts);
      const bushIndices = B.indices.filter(i => stableSelection(i, quality));
      activeTrees = T.active; activeBushes = B.active;
      let changed = false;
      if (!sameIndices(shownTrees, T.indices)) {
        treeMeshes.forEach((mesh, i) => writeInstances(mesh, treeMatrices[i], T.indices));
        shownTrees = T.indices; changed = true;
      }
      if (!sameIndices(shownBushes, bushIndices)) {
        writeInstances(bushMesh, bushMatrices, bushIndices);
        shownBushes = bushIndices; changed = true;
      }
      if (changed) updates++;
      return changed;
    },
    stats() {
      return {
        treesTotal: trees.length, treesVisible: shownTrees.length,
        bushesTotal: bushes.length, bushesVisible: shownBushes.length,
        activeTreeCells: activeTrees.size, activeBushCells: activeBushes.size,
        cellSize, bufferUpdates: updates,
      };
    },
  };
  return api;
}
