import * as THREE from 'three';
import { createRng } from '../core/rng.js';
import { createVisualDetailCuller } from './VisualDetailCulling.js';
import { createVegetationSectorStream } from './VegetationSectorStream.js';
import { createBackdropImpostors } from './BackdropImpostors.js';
import { createUnreachableTreeCards } from './TreeImpostors.js';
import { createRegionalDetailStream } from './RegionalDetailStream.js';
import { createSafeDoorFrames } from './SafeRoomDoors.js';
import { createServicePassage } from './ServicePassage.js';
import { createNeighborSectorStream } from './NeighborSectorStream.js';
import { getMaterial } from '../render/Materials.js';
import { getTexture } from '../render/ProceduralTextures.js';
import { QUALITY } from '../core/Settings.js';
import { buildStructureDetail, buildPuddles } from '../render/Structures.js';
import { createRain } from '../render/Rain.js';
import { createPathMaskTexture, scatterVegetation, assignTreeVariants, buildTrees } from '../render/Vegetation.js';

/**
 * Cenário do Setor 01 em Three.js (low poly), construído a partir de chapter01.json.
 * Cria também os colisores simplificados (árvores, rochas, paredes) e devolve ganchos de runtime.
 */
const COLORS = {
  fog: 0x0a1719, sky: 0x0d1d20,
  wood: 0x5a4430, woodDark: 0x3b2c20, metal: 0x58666c, rock: 0x4b4f4a, concrete: 0x7b8279, shelter: 0x4a4636,
  tent: 0x5a6a46, crate: 0x6b5a3a, terminal: 0x2a3438, ravine: 0x050809, gate: 0x6a7176, dirt: 0x5b4a33,
  // Cap. 02 (posto avançado)
  slab: 0x3d4440, shed: 0x5d5a4c, container: 0x7a4a2e, truck: 0x4d5a3e, fence: 0x8a9196,
};
const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

export function buildScenery({ world, data, quality }) {
  const group = new THREE.Group();
  const meshes = new Map();           // id → Object3D
  const fadeMats = new Map();         // id → material[] (oclusão localizada)
  const updaters = [];
  const [bx0, bz0, bx1, bz1] = data.bounds;
  const rng = createRng(data.treeSeed);
  const treeMaxZ = data.treeMaxZ ?? 33;   // limite sul da vegetação (a margem do rio fica livre)
  // Imagens estáticas pré-pintadas em CanvasTexture: fora dos limites do mapa.
  const backdrop = createBackdropImpostors({ bounds: data.bounds, chapter: data.chapter, quality });
  group.add(backdrop.group);
  // Copas em imagens, 100% FORA das áreas alcançáveis: 2 InstancedMesh, 1 textura.
  const treeCards = createUnreachableTreeCards(data.bounds, data.chapter, quality);
  group.add(treeCards.group);
  // Setores próximos criam geometria de detalhe sob demanda; ao afastar, liberam buffers.
  const regionalDetails = createRegionalDetailStream({ data });
  group.add(regionalDetails.group);
  const safeDoors = createSafeDoorFrames({data,world});
  group.add(safeDoors.group);
  // Mesma estrada de serviço nas duas pontas da ligação entre capítulos.
  const servicePassage = createServicePassage({ data, world });
  group.add(servicePassage.group);
  // Trecho simplificado DO PRÓXIMO CAPÍTULO: carrega perto do acesso e
  // libera material e geometria ao afastar. Sem NPCs/colisores duplicados.
  const neighborSector = createNeighborSectorStream({ data });
  group.add(neighborSector.group);

  // ---------- chão ----------
  const gW = bx1 - bx0 + 20, gD = bz1 - bz0 + 20;
  const gg = new THREE.PlaneGeometry(gW, gD, 70, 78); gg.rotateX(-Math.PI / 2);
  const col = new Float32Array(gg.attributes.position.count * 3);
  const c1 = new THREE.Color(0x1f3a22), c2 = new THREE.Color(0x2c4a2a), c3 = new THREE.Color(0x1a2b1c), tmp = new THREE.Color();
  for (let i = 0; i < gg.attributes.position.count; i++) {
    const n = rng.next(); tmp.copy(c1).lerp(n < 0.5 ? c2 : c3, rng.next()); col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // duas escalas de textura (terra em grande escala + lama em detalhe) e trilhas pintadas a partir de data.paths (máscara por capítulo)
  const groundMask = createPathMaskTexture(data), gravel = getTexture('gravel', { seed: 2 }), detail = getTexture('mud', { seed: 3 });
  const dirtTex = getTexture('dirt', { repeat: [gW / 9, gD / 9] });
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const pathCol = new THREE.Color(COLORS.dirt);
  groundMat.onBeforeCompile = (sh) => {
    sh.uniforms.tPath = { value: groundMask }; sh.uniforms.tDetail = { value: detail }; sh.uniforms.tGravel = { value: gravel };
    sh.uniforms.uPathCol = { value: pathCol }; sh.uniforms.uDetailRep = { value: new THREE.Vector2(gW / 3.2, gD / 3.2) };
    sh.vertexShader = 'varying vec2 vGUv;' + String.fromCharCode(10) + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
vGUv = uv;`);
    sh.fragmentShader = `varying vec2 vGUv;
uniform sampler2D tPath;
uniform sampler2D tDetail;
uniform sampler2D tGravel;
uniform vec3 uPathCol;
uniform vec2 uDetailRep;
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
#ifdef GROUND_DETAIL
  vec3 gdet = texture2D(tDetail, vGUv * uDetailRep).rgb;
  diffuseColor.rgb *= mix(0.78, 1.22, gdet.r);
#endif
  vec4 gpm = texture2D(tPath, vec2(vGUv.x, 1.0 - vGUv.y));
  vec3 gpc = uPathCol * 1.2 * mix(1.0, 0.75, gpm.g);
#ifdef GROUND_DETAIL
  if (gpm.r > 0.01) gpc *= texture2D(tGravel, vGUv * uDetailRep * 0.7).rgb * 1.25;
#endif
  diffuseColor.rgb = mix(diffuseColor.rgb, gpc, gpm.r);`);
  };
  groundMat.customProgramCacheKey = () => 'eden-ground-paths';
  // Baixo: só cor de vértice + máscara de trilhas (1 amostra/pixel, custo ≈ antes); Médio = Baixo (custo de preenchimento em software); Alto: terra em grande escala + detalhe em 2ª escala + cascalho na trilha
  const groundQ = (qk) => { groundMat.defines = qk === 'high' ? { GROUND_DETAIL: 1 } : {}; groundMat.map = qk === 'high' ? dirtTex : null; groundMat.needsUpdate = true; };
  groundQ(quality in QUALITY ? quality : 'medium');
  const ground = new THREE.Mesh(gg, groundMat);
  ground.receiveShadow = true; ground.position.set((bx0 + bx1) / 2, 0, (bz0 + bz1) / 2); group.add(ground);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(gW, 40).rotateX(-Math.PI / 2), mat(0x0f2a36, { transparent: true, opacity: 0.92 }));
  water.position.set(0, -0.35, bz1 + 17); group.add(water);
  updaters.push((t) => { water.position.y = -0.35 + Math.sin(t * 0.9) * 0.03; });

  // trilhas: pintadas no chão (máscara acima); sem malhas extras

  // ---------- estruturas ----------
  const wood = mat(COLORS.wood), woodDark = mat(COLORS.woodDark), rockMat = mat(COLORS.rock), metal = mat(COLORS.metal);
  const glowCyan = getMaterial('emissiveLamp', quality, { color: 0x57e6e0, emissive: 0x57e6e0 });
      const matFor = (v) => ({
    wood, metal, rock: rockMat, concrete: mat(COLORS.concrete), shelter: mat(COLORS.shelter), shelter_roof: mat(0x3a3f35),
    tent: mat(COLORS.tent), crate: mat(COLORS.crate), terminal: mat(COLORS.terminal), ravine: mat(COLORS.ravine), gate: mat(COLORS.gate), radio: mat(0x3d4440), coro: mat(0x5c666b),
    slab: mat(COLORS.slab), shed: mat(COLORS.shed), container: mat(COLORS.container), truck: mat(COLORS.truck), fence: mat(COLORS.fence, { transparent: true, opacity: 0.55 }),
  }[v] || wood);

  // superfície de impacto por colisor (só efeitos: não toca ids/caixas dos colisores)
  const SURF = { metal: 'metal', container: 'metal', truck: 'metal', gate: 'metal', terminal: 'metal', radio: 'metal', fence: 'metal', coro: 'metal', shed: 'metal', wood: 'wood', crate: 'wood', tent: 'wood', concrete: 'concrete', slab: 'concrete', shelter: 'concrete', shelter_roof: 'concrete', rock: 'concrete' };
  const surfaces = new Map();
  for (const s of data.structures) {
    const y0 = s.y ?? 0;
    surfaces.set(s.id, SURF[s.visual] ?? 'ground');
    let mesh;
    if (s.kind === 'box') {
      const [w, h, d] = s.size;
      const geo = new THREE.BoxGeometry(w, h, d);
      if (s.visual === 'rock') { const pa = geo.attributes.position; for (let i = 0; i < pa.count; i++) pa.setXYZ(i, pa.getX(i) + (rng.next() - 0.5) * 0.18, pa.getY(i) + (rng.next() - 0.5) * 0.14, pa.getZ(i) + (rng.next() - 0.5) * 0.18); geo.computeVertexNormals(); }
      mesh = new THREE.Mesh(geo, s.fade ? matFor(s.visual).clone() : matFor(s.visual));
      mesh.position.set(s.pos[0], y0 + h / 2, s.pos[1]);
      if (s.flags.length) world.add({ id: s.id, type: 'box', x0: s.pos[0] - w / 2, x1: s.pos[0] + w / 2, z0: s.pos[1] - d / 2, z1: s.pos[1] + d / 2, y0, y1: y0 + h, fade: !!s.fade, gate: !!s.gate, pit: !!s.pit, ...Object.fromEntries(s.flags.map((f) => [f, true])) });
      if (s.visual === 'ravine') {           // abismo: plano escuro ao nível do chão (o colisor `move` impede a entrada)
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x020405 }));
        mesh.position.set(s.pos[0], 0.045, s.pos[1]);
      }
    } else {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r * 1.1, s.h, 10), matFor(s.visual));
      mesh.position.set(s.pos[0], y0 + s.h / 2, s.pos[1]);
      if (s.flags.length) world.add({ id: s.id, type: 'cyl', x: s.pos[0], z: s.pos[1], r: s.r, y0, y1: y0 + s.h, ...Object.fromEntries(s.flags.map((f) => [f, true])) });
    }
    mesh.castShadow = s.flags?.includes('bullet') || s.visual === 'wood'; mesh.receiveShadow = true;
    if (s.fade) { mesh.material.transparent = true; fadeMats.set(s.id, mesh.material); }
    group.add(mesh); meshes.set(s.id, mesh);

    // detalhes
    if (s.visual === 'terminal') {
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.38), glowCyan); scr.position.set(0, 0.2, s.size ? s.size[2] / 2 + 0.01 : 0.3); mesh.add(scr);
      scr.rotation.y = 0; mesh.rotation.y = s.id === 'terminal_b' || s.id === 'terminal_outpost_b' ? 0.5 : -0.4;
    }
    if (s.visual === 'tent') { const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 4), mat(0x6c7c52)); roof.position.y = s.size[1] / 2 + 0.6; roof.rotation.y = Math.PI / 4; mesh.add(roof); }
    if (s.visual === 'radio') { const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4), metal); ant.position.set(0.3, 1.0, 0); mesh.add(ant); const led = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0xffb347 })); led.position.set(-0.2, 0.2, 0.31); mesh.add(led); }
    if (s.visual === 'crate') { const lid = new THREE.Mesh(new THREE.BoxGeometry(s.size[0] * 1.04, 0.08, s.size[2] * 1.04), wood); lid.position.y = s.size[1] / 2; mesh.add(lid); }
    if (s.visual === 'ravine') {
      // borda de pedra para o abismo ler como abismo
      for (const sz of [-1, 1]) { const lip = new THREE.Mesh(new THREE.BoxGeometry(s.size[0], 0.3, 0.55), rockMat); lip.position.set(0, 0.12, sz * (s.size[2] / 2 - 0.1)); mesh.add(lip); }
    }
  }
  // Estações de salvamento/loja sinalizadas e visíveis. Perímetros NÃO
  // substituem CollisionWorld: a exclusão de IA é responsabilidade do jogo.
  const safeSigns = [];
  if (data.safeRooms?.length) {
    const cvs = document.createElement('canvas'); cvs.width = 512; cvs.height = 128;
    const cx = cvs.getContext('2d');
    if (cx) {
      cx.fillStyle = '#0a2526'; cx.fillRect(0, 0, 512, 128);
      cx.strokeStyle = '#4daba2'; cx.lineWidth = 7; cx.strokeRect(5, 5, 502, 118);
      cx.fillStyle = '#9ae4d7'; cx.font = 'bold 38px sans-serif'; cx.textAlign = 'center';
      cx.fillText('ÁREA SEGURA', 256, 53);
      cx.fillStyle = '#c4d1c4'; cx.font = '26px sans-serif'; cx.fillText('SALVAR  /  COMPRAR', 256, 96);
      const tex = new THREE.CanvasTexture(cvs); tex.colorSpace = THREE.SRGBColorSpace;
      group.userData.safeSignTexture = tex;
      const signMat = new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,depthWrite:false});
      const signGeo = new THREE.PlaneGeometry(2.35, 0.59);
      for (const room of data.safeRooms) {
        const terminal = data.terminals.find(t => t.id === room.terminalId);
        if (!terminal) continue;
        const sign = new THREE.Mesh(signGeo, signMat);
        sign.position.set(terminal.pos[0], 2.35, terminal.pos[1]);
        sign.name = 'safe_sign_' + room.id; safeSigns.push(sign); group.add(sign);
        const ring = new THREE.Mesh(new THREE.RingGeometry(room.radius - .07, room.radius, 36),
          new THREE.MeshBasicMaterial({color:0x438e80,side:THREE.DoubleSide,transparent:true,opacity:.24,depthWrite:false}));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(room.center[0], .065, room.center[1]); ring.name = 'safe_perimeter_' + room.id; group.add(ring);
      }
    }
  }
  const visualDetailCuller = createVisualDetailCuller(data, meshes);
  let lastDetailUpdate = -Infinity, lastPX = Infinity, lastPZ = Infinity;

  // ---------- árvores (InstancedMesh + colisores) ----------
  const trees = [];
  const nearStruct = (x, z) => data.structures.some((s) => s.kind === 'box' && Math.abs(x - s.pos[0]) < s.size[0] / 2 + 2 && Math.abs(z - s.pos[1]) < s.size[2] / 2 + 2);
  for (let attempt = 0; attempt < 2600 && trees.length < 160; attempt++) {
    const x = rng.range(bx0 + 2, bx1 - 2), z = rng.range(bz0 + 2, bz1 - 2);
    if (z > treeMaxZ) continue;
    if (data.paths.some((p) => distToPolyline(x, z, p.pts) < p.w / 2 + 1.7)) continue;
    if (data.clearings.some((c) => Math.hypot(x - c.pos[0], z - c.pos[1]) < c.r)) continue;
    if (nearStruct(x, z)) continue;
    if (data.safeRooms?.some(r => Math.hypot(x - r.center[0], z - r.center[1]) < r.radius + 1.5)) continue;
    if (trees.some((t) => Math.hypot(x - t.x, z - t.z) < 3.4)) continue;
    trees.push({ x, z, r: rng.range(0.32, 0.55), h: rng.range(7, 11), lean: rng.range(-0.05, 0.05), tone: rng.next() });
  }
  assignTreeVariants(trees, data.treeSeed);          // rng próprio: não consome o rng que posicionou as árvores
  trees.forEach((t, i) => world.addCyl(`tree_${i}`, t.x, t.z, t.r * 0.85, t.h, 0, ['move', 'bullet', 'camera']));
  let qKeyNow = quality in QUALITY ? quality : 'medium';
  const treeSet = buildTrees({ trees, quality: qKeyNow }); group.add(treeSet.group);

  // ---------- folhagem rasteira (reduzível por qualidade; sem colisão) ----------
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const bushCountMax = 420;
  const bushPoints = [];
  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.7, 0), mat(0x2e5a2f), bushCountMax);
  let placed = 0;
  for (let a = 0; a < 3000 && placed < bushCountMax; a++) {
    const x = rng.range(bx0 + 1, bx1 - 1), z = rng.range(bz0 + 1, bz1 - 1);
    if (z > treeMaxZ || data.paths.some((p) => distToPolyline(x, z, p.pts) < p.w / 2 + 0.4) || nearStruct(x, z)) continue;
    if (data.safeRooms?.some(r => Math.hypot(x - r.center[0], z - r.center[1]) < r.radius + 1)) continue;
    const s = rng.range(0.5, 1.3);
    ps.set(x, 0.25 * s, z); e.set(0, rng.range(0, 6), 0); q.setFromEuler(e); sc.set(s * 1.3, s * 0.8, s * 1.3); m4.compose(ps, q, sc);
    bushPoints.push({ x, z }); bushes.setMatrixAt(placed++, m4);
  }
  bushes.count = placed; bushes.userData.max = placed; group.add(bushes);
  // Não cria draw calls: compacta as matrizes das malhas de cada espécie e dos arbustos por setor;
  // todos os colisores de árvore continuam no world.
  const vegetationStream = createVegetationSectorStream({ trees, bushes: bushPoints, treeMeshes: treeSet.meshes, bushMesh: bushes });

  // ---------- vegetação decorativa (capim, samambaias, pedras, troncos): rng próprio, sem colisão, reconstruída em setQuality ----------
  let veg = null;
  const buildVeg = (qk) => { veg = scatterVegetation({ data, quality: qk, rng: createRng(((data.treeSeed ?? 1) ^ 0x5eed5eed) >>> 0), trees }); group.add(veg.group); };
  buildVeg(qKeyNow);
  updaters.push((t, dt, cam) => veg?.update(t, dt, cam));

  // ---------- detalhe visual das estruturas e poças (malhas extras; não tocam colisores/LOS/nav) ----------
  let sDetail = null, puddles = null;
  const buildDetail = (qk) => { sDetail = buildStructureDetail({ data, quality: qk }); puddles = buildPuddles({ data, quality: qk }); group.add(sDetail.group, puddles.group); };
  buildDetail(qKeyNow);

  // ---------- pistas ambientais ----------
  const clawMat = mat(0x2a1612);
  for (const [cx, cz] of data.clawMarks) for (let k = -1; k <= 1; k++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.9), clawMat); c.position.set(cx + k * 0.18, 0.05, cz); c.rotation.y = 0.5 + k * 0.08; group.add(c);
  }
  const tape = mat(0xff7a1a, { emissive: 0x7a2f00 });
  for (const [rx, rz] of data.ribbons) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 5), woodDark); st.position.set(rx, 0.85, rz); group.add(st);
    const ta = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.03), tape); ta.position.set(rx + 0.15, 1.55, rz); ta.rotation.y = 0.7; group.add(ta);
  }
  // ---------- luzes, névoa, chuva ----------
  const hemi = new THREE.HemisphereLight(0x5c7f90, 0x1a2418, 0.95); group.add(hemi);
  const moon = new THREE.DirectionalLight(0x9db9d4, 0.85); moon.position.set(-20, 40, 14); moon.castShadow = false; moon.shadow.intensity = 0.75; group.add(moon); group.add(moon.target);
  const flash = new THREE.SpotLight(0xfff1d0, 0, 34, 0.5, 0.65, 1.2); group.add(flash); group.add(flash.target);

  const rain = createRain({ seed: data.treeSeed ?? 1, quality: qKeyNow }); group.add(rain.group);   // riscos + respingos; pools próprios, visual

  const vrng = createRng(9001);              // aleatoriedade SÓ visual (relâmpagos), fora da simulação
  const light = { next: 9, flashT: -1, intensityScale: 1, reduceFlash: false, hemiBase: 0.95 };

  const api = {
    group, meshes, fadeMats, trees, moon, lightBoost: 0, groundMask, rain,
    visualDetailCuller, vegetationStream, backdrop, treeCards, regionalDetails, safeDoors, servicePassage, neighborSector,
    /** Ganchos extras por frame (props do capítulo): fn(t, dt). */
    onUpdate: null, addUpdater(fn) { updaters.push(fn); },
    /** Superfície do colisor atingido ('metal'|'concrete'|'wood'|'ground'); só para efeitos de impacto. */
    surfaceOf(c) { const id = c?.id; return id ? (surfaces.get(id) ?? (String(id).startsWith('tree_') ? 'wood' : 'ground')) : 'ground'; },
    setReduceFlash(v) { light.reduceFlash = v; },
    setQuality(qc) {
      vegetationStream.setQuality(qc.foliage);   // arbustos: fração estável por qualidade, dentro do streaming por setor
      backdrop.setQuality(qc);
      treeCards.setQuality(qc);
      regionalDetails.setQuality(qc);
      const qk = Object.keys(QUALITY).find((k) => QUALITY[k] === qc) ?? qKeyNow;
      if (qk !== qKeyNow) { qKeyNow = qk; treeSet.setQuality(qk); groundQ(qk); group.remove(veg.group); veg.dispose(); buildVeg(qk); group.remove(sDetail.group, puddles.group); sDetail.dispose(); puddles.dispose(); buildDetail(qk); rain.setQuality(qk); }   // vegetação é barata: reconstrói na troca de qualidade
      rain.group.visible = qc.rain; flash.intensity = qc.flashlight ? 70 : 0; api.flashlightOn = qc.flashlight;
      moon.castShadow = !!qc.moonShadow;
      if (!qc.moonShadow && moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
      if (qc.moonShadow) {
        if (moon.shadow.mapSize.x !== qc.shadowMap) { moon.shadow.mapSize.set(qc.shadowMap, qc.shadowMap); moon.shadow.map?.dispose(); moon.shadow.map = null; }
        const sc = moon.shadow.camera; sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 110; sc.updateProjectionMatrix(); moon.shadow.bias = -0.0008;
      }
      group.userData.q = qc;
    },
    update(t, dt, camPos, camDir, playerPos) {
      // Reavaliar a cada 0,3 s, ou imediatamente após deslocamentos longos/teleporte.
      if (playerPos && (t - lastDetailUpdate >= 0.3 || Math.hypot(playerPos.x - lastPX, playerPos.z - lastPZ) > 7)) {
        visualDetailCuller.update(playerPos);
        vegetationStream.update(playerPos);
        regionalDetails.update(playerPos);
        lastDetailUpdate = t; lastPX = playerPos.x; lastPZ = playerPos.z;
      }
      treeCards.update(camPos, dt);
      neighborSector.update(playerPos);
      safeDoors.update(playerPos,dt);
      for (const sign of safeSigns) sign.rotation.y = Math.atan2(camPos.x - sign.position.x, camPos.z - sign.position.z);
      for (const u of updaters) u(t, dt, camPos);
      // chuva segue a câmera
      if (rain.group.visible) rain.update(dt, camPos);
      // relâmpago
      light.next -= dt;
      if (light.next <= 0) { light.flashT = 0; light.next = vrng.range(16, 34); }
      let boost = 0;
      if (light.flashT >= 0) { light.flashT += dt; const f = light.flashT; boost = (f < 0.08 ? 1 : f < 0.16 ? 0.15 : f < 0.26 ? 0.8 : 0) * (light.reduceFlash ? 0.25 : 1); if (f > 0.4) light.flashT = -1; if (f < 0.02 && api.onLightning) api.onLightning(); }
      api.lightBoost = boost; hemi.intensity = light.hemiBase + boost * 1.5; moon.intensity = 0.85 + boost * 1.4;
      // lanterna e lua seguem o jogador
      moon.position.set(playerPos.x - 20, 40, playerPos.z + 14); moon.target.position.set(playerPos.x, 0, playerPos.z);
      flash.position.set(camPos.x, camPos.y, camPos.z); flash.target.position.set(camPos.x + camDir.x * 10, camPos.y + camDir.y * 10, camPos.z + camDir.z * 10);
      api.onUpdate?.(t, dt);
    },
    setFade(id, a) { const m = fadeMats.get(id); if (m) { m.opacity += (a - m.opacity) * 0.35; m.depthWrite = m.opacity > 0.9; } },
    dispose() {
      backdrop.dispose();
      treeCards.dispose();
      regionalDetails.dispose();
      neighborSector.dispose();
      group.userData.safeSignTexture?.dispose();
      group.traverse((o) => {
        o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { if (!m.userData.shared) m.dispose?.(); });
        if (o.isInstancedMesh) o.dispose();                       // libera os buffers de instância (árvores/arbustos)
      });
      moon.dispose(); flash.dispose(); veg?.dispose(); treeSet.dispose(); groundMask.dispose();   // máscara é por capítulo; texturas de getTexture são compartilhadas e não são tocadas
      sDetail.dispose(); puddles.dispose();
    },
  };
  api.onLightning = null;
  return api;
}
