import * as THREE from 'three';

/**
 * Trechos físicos correspondentes nas duas pontas da passagem de serviço.
 * A câmera continua acompanhando o jogador ao longo do caminho. O mundo
 * local é trocado apenas depois de cruzar a linha no fim do corredor.
 * A primeira passagem narrativa continua sendo feita pelas cutscenes.
 */
export const SERVICE_PASSAGES = Object.freeze({
  ch01: Object.freeze({
    id: 'forest_service_exit', to: 'ch02', x: 0, centerZ: -40.6,
    width: 3.4, length: 6.1, outbound: -1, thresholdZ: -42.8,
  }),
  ch02: Object.freeze({
    id: 'outpost_service_exit', to: 'ch01', x: 11.3, centerZ: 35.8,
    width: 3.4, length: 6.4, outbound: 1, thresholdZ: 37,
  }),
});

export function canUseServicePassage(save) {
  return !!(save?.chapterStats?.ch01 && save?.storyFlags?.outpost_access);
}

/**
 * Único gatilho de travessia automática, localizado após a parte caminhável
 * da passagem. Entrada do jogador fica do lado oposto a esse gatilho, para
 * impedir "ping-pong" ao concluir a troca de mapa.
 */
export function crossedServicePassage(save, x, z) {
  if (!canUseServicePassage(save)) return false;
  const p = SERVICE_PASSAGES[save.chapterId];
  if (!p || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  const along = (z - p.thresholdZ) * p.outbound;
  const halfLane = p.width / 2 - 0.35;
  return along >= 0 && along < 1.8 && Math.abs(x - p.x) < halfLane;
}

const material = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
const shared = {
  stone: 0x3e4f4c, steel: 0x61706c, dark: 0x263d3a, walk: 0x52605c,
  caution: 0xe0ac47, powered: 0x55dfb6,
};

/**
 * Constrói geometria leve, sem rede, GLB ou iluminação dinâmica.
 * Os colisores das laterais não cobrem o centro; o portão narrativo já
 * existente controla a primeira passagem no Capítulo 01.
 */
export function createServicePassage({ data, world }) {
  const p = SERVICE_PASSAGES[data.chapterId];
  const group = new THREE.Group();
  group.name = 'service_passage_' + (p?.id ?? 'none');
  if (!p) return { group, config: null, setUnlocked() {}, stats: () => ({ active: false }) };

  const floorMat = material(shared.walk);
  const wallMat = material(shared.stone);
  const frameMat = material(shared.steel);
  const stripeMat = material(shared.caution);
  const lampMat = new THREE.MeshBasicMaterial({ color: shared.caution });
  const meshes = [];
  const add = (geo, mat, px, py, pz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz); m.receiveShadow = true; m.castShadow = false;
    group.add(m); meshes.push(m); return m;
  };

  // Pista no mesmo eixo nos dois capítulos: as texturas, medidas e postes
  // são idênticos dos dois lados para preservar a continuidade visual.
  add(new THREE.BoxGeometry(p.width + 0.8, 0.06, p.length), floorMat,
    p.x, 0.025, p.centerZ);
  for (const side of [-1, 1]) {
    const xx = p.x + side * (p.width / 2 + 0.24);
    add(new THREE.BoxGeometry(0.22, 1.08, p.length - 0.5), wallMat,
      xx, 0.54, p.centerZ);
    // Barreira de navegação nas bordas da estrada; não bloqueia o corredor.
    world.addBox('service_edge_' + data.chapterId + '_' + (side < 0 ? 'left' : 'right'),
      xx, p.centerZ, 0.22, 1.15, p.length - 0.5, 0,
      ['move', 'bullet', 'camera']);
  }
  for (const offset of [-p.length * 0.38, 0, p.length * 0.38]) {
    const z = p.centerZ + offset;
    const frameLeft = add(new THREE.BoxGeometry(0.15, 2.95, 0.2), frameMat,
      p.x - p.width / 2 - 0.04, 1.48, z);
    const frameRight = add(new THREE.BoxGeometry(0.15, 2.95, 0.2), frameMat,
      p.x + p.width / 2 + 0.04, 1.48, z);
    add(new THREE.BoxGeometry(p.width + 0.3, 0.16, 0.23), frameMat, p.x, 2.94, z);
    // Uma faixa no chão faz a direção do caminho ficar legível à noite.
    add(new THREE.BoxGeometry(p.width - 0.7, 0.02, 0.09), stripeMat, p.x, 0.066, z);
    frameLeft.castShadow = frameRight.castShadow = false;
  }
  const gateSign = add(new THREE.BoxGeometry(1.75, 0.35, 0.07), wallMat,
    p.x, 2.55, p.centerZ);
  const signal = add(new THREE.BoxGeometry(0.35, 0.13, 0.08), lampMat,
    p.x, 2.55, p.centerZ + p.outbound * 0.05);
  const laneLine = add(new THREE.BoxGeometry(0.09, 0.018, 1.15), stripeMat,
    p.x, 0.067, p.centerZ);
  laneLine.visible = false; gateSign.name = 'service_wayfinding';
  let unlocked = false;
  return {
    group, config: p,
    setUnlocked(v) {
      const next = !!v;
      if (next === unlocked) return;
      unlocked = next;
      lampMat.color.setHex(next ? shared.powered : shared.caution);
      laneLine.visible = next;
    },
    stats() {
      return { active: true, id: p.id, destination: p.to, width: p.width,
        threshold: p.thresholdZ, unlocked, colliderCount: 2, parts: meshes.length };
    },
  };
}
