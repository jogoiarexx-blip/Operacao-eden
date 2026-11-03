import * as THREE from 'three';

/**
 * Árvores ilustradas para FAIXA FORA DOS LIMITES JOGÁVEIS (sem collider, IA ou
 * GLB). Dois painéis cruzados por exemplar, atualizados em apenas duas draw
 * calls via InstancedMesh. CanvasTexture compartilhada: nenhuma imagem externa.
 */
export const TREE_CARD_TEXTURE = Object.freeze({ width: 192, height: 384 });
export const TREE_CARD_COUNT = 60;

function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function planUnreachableTreeCards(bounds, chapter = 1, count = TREE_CARD_COUNT) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || bounds[0] >= bounds[2] || bounds[1] >= bounds[3])
    throw Error('Limites inválidos para as árvores-imagem');
  const [xmin, zmin, xmax, zmax] = bounds, rng = random(chapter * 62971 + 381);
  const trees = [];
  // A borda de cada imagem começa ALÉM do CollisionWorld; nunca ocupa caminho.
  for (let i = 0; i < count; i++) {
    const side = i % 4, gap = 5 + rng() * 7, padding = 2;
    const x = side === 0 ? xmin - gap : side === 1 ? xmax + gap : xmin + padding + rng() * (xmax - xmin - 2 * padding);
    const z = side === 2 ? zmin - gap : side === 3 ? zmax + gap : zmin + padding + rng() * (zmax - zmin - 2 * padding);
    // Silhueta não pode alcançar a região caminhável; sem risco de atravessá-la.
    trees.push({ x, z, height: 7.8 + rng() * 4.1, width: 3.1 + rng() * 1.6, shade: 0.78 + rng() * 0.25 });
  }
  return trees;
}

function paintTree() {
  const canvas = document.createElement('canvas');
  canvas.width = TREE_CARD_TEXTURE.width; canvas.height = TREE_CARD_TEXTURE.height;
  const c = canvas.getContext('2d', { alpha: true });
  if (!c) throw Error('Canvas 2D indisponível para árvores de fundo');
  const w = canvas.width, h = canvas.height;
  c.clearRect(0, 0, w, h);
  // Tronco com dois tons e copa evergreen em cinco planos low-poly.
  c.fillStyle = '#302c23'; c.fillRect(w * .455, h * .49, w * .095, h * .5);
  c.fillStyle = '#564635'; c.fillRect(w * .455, h * .49, w * .033, h * .48);
  for (let k = 0; k < 5; k++) {
    const t = k / 5, top = h * (.025 + t * .135), base = h * (.38 + t * .12);
    const half = w * (.19 + t * .25);
    c.fillStyle = ['#173324','#1a3c27','#1b4028','#25462e','#163422'][k];
    c.beginPath(); c.moveTo(w / 2, top); c.lineTo(w / 2 - half, base);
    c.lineTo(w / 2 + half, base); c.closePath(); c.fill();
    // Facetas com pintura simples: mais volume sem triângulos reais.
    c.fillStyle = k % 2 ? '#31583b' : '#284e35';
    c.beginPath(); c.moveTo(w / 2, top); c.lineTo(w / 2 + half * .82, base);
    c.lineTo(w / 2 + half * .10, base * .98); c.closePath(); c.fill();
    c.fillStyle = '#11291e';
    c.beginPath(); c.moveTo(w / 2 - half, base);
    c.lineTo(w / 2 - half * .13, top + (base - top) * .57);
    c.lineTo(w / 2 - half * .2, base); c.closePath(); c.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function createUnreachableTreeCards(bounds, chapter = 1, quality = 1) {
  const group = new THREE.Group();
  group.name = 'unreachable_tree_impostors';
  const trees = planUnreachableTreeCards(bounds, chapter);
  const texture = paintTree();
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, alphaTest: 0.23, side: THREE.DoubleSide,
    depthWrite: true, fog: true, toneMapped: false,
  });
  const geo = new THREE.PlaneGeometry(1, 1);
  const panels = [0, 1].map(i => {
    const mesh = new THREE.InstancedMesh(geo, material, trees.length);
    mesh.name = 'tree_image_panel_' + i;
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
    mesh.count = trees.length;
    group.add(mesh);
    return mesh;
  });
  const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0);
  const orientations = trees.map(() => 0);
  let initialized = false, lastX = Infinity, lastZ = Infinity;
  const api = {
    group, trees, panels, texture,
    setQuality(q) {
      const fol = typeof q === 'number' ? q : q?.foliage ?? 1;
      const count = fol < .7 ? Math.ceil(trees.length * .55) : trees.length;
      panels.forEach(mesh => { mesh.count = count; });
    },
    update(camera, dt = 0.016) {
      if (!camera || !Number.isFinite(camera.x) || !Number.isFinite(camera.z)) return;
      if (initialized && Math.hypot(camera.x - lastX, camera.z - lastZ) < 0.2) return;
      lastX = camera.x; lastZ = camera.z;
      const k = initialized ? 1 - Math.exp(-Math.max(0.015, dt) * 5) : 1;
      trees.forEach((t, i) => {
        const target = Math.atan2(camera.x - t.x, camera.z - t.z);
        let delta = Math.atan2(Math.sin(target - orientations[i]), Math.cos(target - orientations[i]));
        orientations[i] += delta * k;
        pos.set(t.x, t.height / 2, t.z);
        scale.set(t.width, t.height, 1);
        panels.forEach((mesh, panel) => {
          quat.setFromAxisAngle(axis, orientations[i] + panel * Math.PI * .38);
          matrix.compose(pos, quat, panel === 0 ? scale : new THREE.Vector3(t.width * .63, t.height, 1));
          mesh.setMatrixAt(i, matrix);
        });
      });
      panels.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
      initialized = true;
    },
    stats() {
      return { trees: trees.length, visibleTrees: panels[0].count, panels: panels.length,
        textures: 1, outsideBounds: trees.every(t => t.x < bounds[0] || t.x > bounds[2] || t.z < bounds[1] || t.z > bounds[3]) };
    },
    dispose() { texture.dispose(); },
  };
  api.setQuality(quality);
  // Primeira orientação acontece quando a câmera estiver disponível.
  return api;
}
