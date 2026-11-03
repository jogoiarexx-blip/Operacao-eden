import * as THREE from 'three';
import { createRng } from '../core/rng.js';
import { createVisualDetailCuller } from './VisualDetailCulling.js';
import { createVegetationSectorStream } from './VegetationSectorStream.js';
import { createBackdropImpostors } from './BackdropImpostors.js';
import { createUnreachableTreeCards } from './TreeImpostors.js';

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

  // ---------- chão ----------
  const gW = bx1 - bx0 + 20, gD = bz1 - bz0 + 20;
  const gg = new THREE.PlaneGeometry(gW, gD, 70, 78); gg.rotateX(-Math.PI / 2);
  const col = new Float32Array(gg.attributes.position.count * 3);
  const c1 = new THREE.Color(0x1f3a22), c2 = new THREE.Color(0x2c4a2a), c3 = new THREE.Color(0x1a2b1c), tmp = new THREE.Color();
  for (let i = 0; i < gg.attributes.position.count; i++) {
    const n = rng.next(); tmp.copy(c1).lerp(n < 0.5 ? c2 : c3, rng.next()); col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ground = new THREE.Mesh(gg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  ground.receiveShadow = true; ground.position.set((bx0 + bx1) / 2, 0, (bz0 + bz1) / 2); group.add(ground);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(gW, 40).rotateX(-Math.PI / 2), mat(0x0f2a36, { transparent: true, opacity: 0.92 }));
  water.position.set(0, -0.35, bz1 + 17); group.add(water);
  updaters.push((t) => { water.position.y = -0.35 + Math.sin(t * 0.9) * 0.03; });

  // ---------- trilhas de terra ----------
  const dirtMat = mat(COLORS.dirt); dirtMat.polygonOffset = true; dirtMat.polygonOffsetFactor = -2;
  for (const p of data.paths) for (let i = 0; i < p.pts.length - 1; i++) {
    const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, 0.03, len + p.w * 0.4), dirtMat);
    m.position.set((ax + bx) / 2, 0.02, (az + bz) / 2); m.rotation.y = Math.atan2(bx - ax, bz - az); m.receiveShadow = true; group.add(m);
  }

  // ---------- estruturas ----------
  const wood = mat(COLORS.wood), woodDark = mat(COLORS.woodDark), rockMat = mat(COLORS.rock), metal = mat(COLORS.metal);
  const glowCyan = new THREE.MeshBasicMaterial({ color: 0x57e6e0 });
      const matFor = (v) => ({
    wood, metal, rock: rockMat, concrete: mat(COLORS.concrete), shelter: mat(COLORS.shelter), shelter_roof: mat(0x3a3f35),
    tent: mat(COLORS.tent), crate: mat(COLORS.crate), terminal: mat(COLORS.terminal), ravine: mat(COLORS.ravine), gate: mat(COLORS.gate), radio: mat(0x3d4440), coro: mat(0x5c666b),
    slab: mat(COLORS.slab), shed: mat(COLORS.shed), container: mat(COLORS.container), truck: mat(COLORS.truck), fence: mat(COLORS.fence, { transparent: true, opacity: 0.55 }),
  }[v] || wood);

  for (const s of data.structures) {
    const y0 = s.y ?? 0;
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
  const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 1, 6), canopyGeo = new THREE.ConeGeometry(1, 1, 7);
  const trunks = new THREE.InstancedMesh(trunkGeo, mat(0x3f2f22), trees.length);
  const canopyA = new THREE.InstancedMesh(canopyGeo, mat(0x1d3d24), trees.length);
  const canopyB = new THREE.InstancedMesh(canopyGeo, mat(0x264a2a), trees.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  trees.forEach((t, i) => {
    e.set(t.lean, 0, t.lean * 0.6); q.setFromEuler(e);
    ps.set(t.x, t.h / 2, t.z); sc.set(t.r, t.h, t.r); m4.compose(ps, q, sc); trunks.setMatrixAt(i, m4);
    ps.set(t.x, t.h * 0.72, t.z); sc.set(2.6 + t.tone * 0.9, t.h * 0.55, 2.6 + t.tone * 0.9); m4.compose(ps, q, sc); canopyA.setMatrixAt(i, m4);
    ps.set(t.x, t.h * 0.98, t.z); sc.set(1.9 + t.tone * 0.6, t.h * 0.42, 1.9 + t.tone * 0.6); m4.compose(ps, q, sc); canopyB.setMatrixAt(i, m4);
    world.addCyl(`tree_${i}`, t.x, t.z, t.r * 0.85, t.h, 0, ['move', 'bullet', 'camera']);
  });
  for (const m of [trunks, canopyA, canopyB]) { m.castShadow = true; m.frustumCulled = false; group.add(m); }

  // ---------- folhagem rasteira (reduzível por qualidade; sem colisão) ----------
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
  // Preserva quatro draw calls (troncos, duas copas, arbustos). Compacta apenas
  // suas matrizes por setor; todos os colisores de árvore continuam no world.
  const vegetationStream = createVegetationSectorStream({ trees, bushes: bushPoints, treeMeshes: [trunks, canopyA, canopyB], bushMesh: bushes });

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
  const moon = new THREE.DirectionalLight(0x9db9d4, 0.85); moon.position.set(-20, 40, 14); moon.castShadow = false; group.add(moon); group.add(moon.target);
  const flash = new THREE.SpotLight(0xfff1d0, 0, 34, 0.5, 0.65, 1.2); group.add(flash); group.add(flash.target);

  const RAIN = 520;
  const rainGeo = new THREE.BufferGeometry(); const rp = new Float32Array(RAIN * 3);
  for (let i = 0; i < RAIN; i++) { rp[i * 3] = (rng.next() - 0.5) * 36; rp[i * 3 + 1] = rng.next() * 18; rp[i * 3 + 2] = (rng.next() - 0.5) * 36; }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0x9fc4d6, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false }));
  rain.frustumCulled = false; group.add(rain);

  const vrng = createRng(9001);              // aleatoriedade SÓ visual (relâmpagos), fora da simulação
  const light = { next: 9, flashT: -1, intensityScale: 1, reduceFlash: false, hemiBase: 0.95 };

  const api = {
    group, meshes, fadeMats, trees, visualDetailCuller, vegetationStream, backdrop, treeCards,
    /** Ganchos extras por frame (props do capítulo): fn(t, dt). */
    onUpdate: null, addUpdater(fn) { updaters.push(fn); },
    setReduceFlash(v) { light.reduceFlash = v; },
    setQuality(qc) {
      vegetationStream.setQuality(qc.foliage);
      backdrop.setQuality(qc);
      treeCards.setQuality(qc);
      rain.visible = qc.rain; flash.intensity = qc.flashlight ? 70 : 0; api.flashlightOn = qc.flashlight;
      moon.castShadow = qc.shadows;
      if (qc.shadows) {
        if (moon.shadow.mapSize.x !== qc.shadowMap) { moon.shadow.mapSize.set(qc.shadowMap, qc.shadowMap); moon.shadow.map?.dispose(); moon.shadow.map = null; }
        const sc = moon.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 110; sc.updateProjectionMatrix(); moon.shadow.bias = -0.0008;
      }
      group.userData.q = qc;
    },
    update(t, dt, camPos, camDir, playerPos) {
      // Reavaliar a cada 0,3 s, ou imediatamente após deslocamentos longos/teleporte.
      if (playerPos && (t - lastDetailUpdate >= 0.3 || Math.hypot(playerPos.x - lastPX, playerPos.z - lastPZ) > 7)) {
        visualDetailCuller.update(playerPos);
        vegetationStream.update(playerPos);
        lastDetailUpdate = t; lastPX = playerPos.x; lastPZ = playerPos.z;
      }
      treeCards.update(camPos, dt);
      for (const sign of safeSigns) sign.rotation.y = Math.atan2(camPos.x - sign.position.x, camPos.z - sign.position.z);
      for (const u of updaters) u(t, dt);
      // chuva segue a câmera
      if (rain.visible) {
        const a = rainGeo.attributes.position; rain.position.set(camPos.x, camPos.y - 6, camPos.z);
        for (let i = 0; i < RAIN; i++) { let y = a.getY(i) - dt * 14; if (y < 0) y += 18; a.setY(i, y); }
        a.needsUpdate = true;
      }
      // relâmpago
      light.next -= dt;
      if (light.next <= 0) { light.flashT = 0; light.next = vrng.range(16, 34); }
      let boost = 0;
      if (light.flashT >= 0) { light.flashT += dt; const f = light.flashT; boost = (f < 0.08 ? 1 : f < 0.16 ? 0.15 : f < 0.26 ? 0.8 : 0) * (light.reduceFlash ? 0.25 : 1); if (f > 0.4) light.flashT = -1; if (f < 0.02 && api.onLightning) api.onLightning(); }
      hemi.intensity = light.hemiBase + boost * 1.5; moon.intensity = 0.85 + boost * 1.4;
      // lanterna e lua seguem o jogador
      moon.position.set(playerPos.x - 20, 40, playerPos.z + 14); moon.target.position.set(playerPos.x, 0, playerPos.z);
      flash.position.set(camPos.x, camPos.y, camPos.z); flash.target.position.set(camPos.x + camDir.x * 10, camPos.y + camDir.y * 10, camPos.z + camDir.z * 10);
      api.onUpdate?.(t, dt);
    },
    setFade(id, a) { const m = fadeMats.get(id); if (m) { m.opacity += (a - m.opacity) * 0.35; m.depthWrite = m.opacity > 0.9; } },
    dispose() {
      backdrop.dispose();
      treeCards.dispose();
      group.userData.safeSignTexture?.dispose();
      group.traverse((o) => {
        o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => m.dispose?.());
        if (o.isInstancedMesh) o.dispose();                       // libera os buffers de instância (árvores/arbustos)
      });
      rainGeo.dispose();
    },
  };
  api.onLightning = null;
  return api;
}
