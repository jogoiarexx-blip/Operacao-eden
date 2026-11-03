import * as THREE from 'three';
import { REGION_DEFINITIONS } from '../gameplay/RegionalSectors.js';
import { safeRoomAt } from '../gameplay/SafeZones.js';

export const DETAIL_SHOW_DISTANCE = 30;
export const DETAIL_HIDE_DISTANCE = 44;

function seeded(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function regionSeed(id, chapter) {
  let h = 811 + chapter;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Streaming real de pequenas pistas ambientais: malhas e buffers são criados
 * ao entrar no raio e DESCARTADOS ao sair. Sem colisores, pickups, inimigos,
 * terminais ou lógica de objetivos, que permanecem persistentes no mundo.
 */
export function createRegionalDetailStream({ data, group = new THREE.Group() }) {
  const regions = REGION_DEFINITIONS[data.chapterId] ?? [];
  const active = new Map();
  let created = 0, disposed = 0, quality = 1;
  group.name = 'regional_detail_stream';

  function build(region) {
    const rng = seeded(regionSeed(region.id, data.chapter));
    const cluster = new THREE.Group(); cluster.name = 'details_' + region.id;
    const spots = [];
    // Peças muito baixas sobre o chão — sem parede invisível nem obstáculo à IA.
    for (let tries = 0; tries < 64 && spots.length < 12; tries++) {
      const angle = rng() * Math.PI * 2, dist = 1.9 + rng() * 6.5;
      const x = region.center[0] + Math.cos(angle) * dist;
      const z = region.center[1] + Math.sin(angle) * dist;
      if (x < data.bounds[0] + 2 || x > data.bounds[2] - 2 ||
          z < data.bounds[1] + 2 || z > data.bounds[3] - 2 ||
          safeRoomAt(data, x, z, 0.8)) continue;
      spots.push({ x, z, angle, size: .22 + rng() * .33 });
    }
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const material = new THREE.MeshLambertMaterial({
      color: data.chapter === 1 ? 0x3d4839 : 0x4a5150,
      flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(geo, material, spots.length);
    mesh.name = 'debris_' + region.id;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    spots.forEach((spot, i) => {
      p.set(spot.x, .05, spot.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.angle);
      sc.set(spot.size, .04, spot.size * 1.2);
      m.compose(p, q, sc);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    cluster.add(mesh); group.add(cluster);
    created++;
    active.set(region.id, { group: cluster, mesh, material, geo, count: spots.length });
    return cluster;
  }
  function unload(id) {
    const item = active.get(id);
    if (!item) return false;
    group.remove(item.group);
    item.mesh.dispose();
    item.geo.dispose(); item.material.dispose();
    active.delete(id); disposed++;
    return true;
  }
  return {
    group,
    setQuality(q) {
      quality = typeof q === 'number' ? q : q?.foliage ?? 1;
      for (const v of active.values()) v.mesh.count = quality < .7 ? Math.ceil(v.count / 2) : v.count;
    },
    update(player) {
      if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return false;
      let changed = false;
      for (const region of regions) {
        const distance = Math.hypot(player.x - region.center[0], player.z - region.center[1]) - region.radius;
        if (active.has(region.id)) {
          if (distance > DETAIL_HIDE_DISTANCE) changed = unload(region.id) || changed;
        } else if (distance < DETAIL_SHOW_DISTANCE) {
          build(region);
          const item = active.get(region.id);
          item.mesh.count = quality < .7 ? Math.ceil(item.count / 2) : item.count;
          changed = true;
        }
      }
      return changed;
    },
    stats() {
      return { regions: regions.length, activeRegions: [...active.keys()], created, disposed,
        drawCalls: active.size, instances: [...active.values()].reduce((n, x) => n + x.mesh.count, 0) };
    },
    dispose() { for (const id of [...active.keys()]) unload(id); },
  };
}
