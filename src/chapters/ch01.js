import { getMaterial } from '../render/Materials.js';
import * as THREE from 'three';
import data from '../data/chapter01.json';
import docs from '../data/documents.json';
import { AI } from '../actors/DinosaurAgent.js';
import { hint } from '../gameplay/SecretManager.js';

/** Script do Capítulo 01 — O Sinal na Mata: tudo que cita ids específicos do capítulo (hooks consumidos pelo ChapterRuntime). */
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const inZone = (z, x, zz) => dist(x, zz, z.pos[0], z.pos[1]) <= z.r;
const STORY = (save, f) => !!save.storyFlags[f];
const TARGETS = { reach_tower: [-13, 18], repair_beacon: [10, 6], find_recon: [-6, -27], open_gate: [4.2, -37.6], exit_sector: [0, -42] };

// ---------- spawn justo do segundo R-4 ----------
function spawnLate(rt, enc, ed, restore) {
  const g = rt.g, p = g.player, rng = g.rng;
  const cands = ed.spawnCandidates.map((c) => ({ x: c[0], z: c[1] })).sort(() => rng.next() - 0.5);
  const yawC = g.camera.yaw, hfov = 2 * Math.atan(Math.tan((g.camera.fov * Math.PI) / 360) * g.camera.aspect);
  for (const c of cands) {
    const d = dist(p.x, p.z, c.x, c.z);
    if (d < 24) continue;
    const ang = Math.abs(((Math.atan2(-(c.x - g.camera.pos.x), -(c.z - g.camera.pos.z)) - yawC + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const visible = ang < hfov / 2 + 0.25;
    const hidden = !visible || g.world.segmentBlocked(g.camera.pos.x, g.camera.pos.y, g.camera.pos.z, c.x, 1.0, c.z, 'bullet');
    if ((restore || hidden) && !g.world.blockedAt(c.x, c.z, 0.6)) {
      const a = g.spawnAgent({ ...ed, pos: [c.x, c.z], patrol: [] }, enc.id);
      a.noiseTarget = { x: p.x, z: p.z }; a.setState(AI.INVESTIGATE);      // chega pelo som, sem teletransporte
      rt.wf.lateSpawned = true; return true;
    }
  }
  return false;
}

function repairBeacon(rt) {
  const g = rt.g, save = g.save;
  rt.flag('beacon_repaired'); g.props.setBeaconPowered(true); g.audio.play('beacon');
  if (!save.documents.includes('DOC_01')) { save.documents.push('DOC_01'); g.hud.toast(`Documento: ${docs.documents.DOC_01.title}`, 'good'); }
  g.dialogue.play('ch01_beacon_revelation');
}

// ---------- props do cenário (baliza, portão, passarela, torre CORO, placa) ----------
const lm = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

function buildProps({ scene, world, data: d, scenery, quality = 'medium' }) {
  const lampMat = (hex) => getMaterial('emissiveLamp', quality, { color: hex, emissive: hex });
  const group = new THREE.Group(); (scenery?.group ?? scene).add(group);
  const wood = lm(0x5a4430), woodDark = lm(0x3b2c20);
  const updaters = [];
  const sDef = (id) => d.structures.find((x) => x.id === id);
  const meshOf = (id) => scenery.meshes.get(id);

  // lâmpada da baliza
  let beaconLamp = null;
  const bm = meshOf('beacon_mast'), bd = sDef('beacon_mast');
  if (bm && bd) { beaconLamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lampMat(0xd92d2d)); beaconLamp.position.set(0, bd.h / 2 + 0.2, 0); bm.add(beaconLamp); }

  // folha do portão (listras de aviso)
  const gateMesh = meshOf('gate_leaf');
  if (gateMesh) for (let i = -1; i <= 1; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 0.05), lm(0xb08c22)); st.position.set(i * 1.3, 0, 0.43); st.rotation.z = 0.5; gateMesh.add(st); }

  // anéis da torre CORO
  const coroRings = [];
  const cm = meshOf('coro_tower'), cd = sDef('coro_tower');
  if (cm && cd) for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(cd.r * 1.25, 0.12, 6, 14), (() => { const m = lampMat(0x57e6e0).clone(); m.userData.shared = false; return m; })()); ring.rotation.x = Math.PI / 2; ring.position.y = -cd.h / 2 + 4 + i * 3.4; cm.add(ring); coroRings.push(ring); }

  // corrimãos da passarela (visuais)
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), woodDark); post.position.set(8 + sx * 1.0, 0.5, -11.5 + k * 1.4); group.add(post);
  }
  for (const sx of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 5.8), woodDark); rail.position.set(8 + sx * 1.0, 0.95, -9); group.add(rail); }

  // passarela: tábuas que cedem
  const planks = [];
  const bridgeGroup = new THREE.Group(); group.add(bridgeGroup);
  for (let i = 0; i < 12; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.42), wood); p.position.set(8, 0.02, -11.7 + i * 0.5); p.castShadow = true; bridgeGroup.add(p); planks.push(p);
  }
  const collapse = { t: -1 };
  updaters.push((t, dt) => {
    if (collapse.t < 0) return;
    collapse.t += dt;
    for (let i = 4; i < 8; i++) { const p = planks[i], k = Math.min(1, collapse.t / 0.9); p.position.y = 0.02 - k * 0.45 * (1 + (i % 2) * 0.4); p.rotation.z = (i % 2 ? 1 : -1) * k * 0.35; p.rotation.x = k * 0.2; }
  });

  // símbolo de abrigo (placa) perto do início da trilha oeste
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.05), lm(0xe8dcc0, { emissive: 0x2a2418 })); sign.position.set(-16.5, 1.7, 12.6); sign.rotation.y = 0.6; group.add(sign);
  const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 5), woodDark); signPost.position.set(-16.5, 0.9, 12.6); group.add(signPost);

  const coroPattern = { active: false, t: 0 };   // pulsos da torre CORO: 3 pulsos – pausa – 3 pulsos
  return {
    group, beaconLamp, gateMesh, coroRings, planks, coroPattern,
    startCollapse() { if (collapse.t < 0) collapse.t = 0; },
    setBeaconPowered(on) { if (beaconLamp) beaconLamp.material = lampMat(on ? 0x38e07a : 0xd92d2d); },
    setGateOpen(open, instant) { if (gateMesh) { gateMesh.userData.target = open ? 3.8 : 0; if (instant) gateMesh.position.y = 1.8 + gateMesh.userData.target; } },
    update(dt, t = 0) {
      for (const u of updaters) u(t, dt);
      if (gateMesh && gateMesh.userData.target !== undefined) { const tgt = 1.8 + gateMesh.userData.target; gateMesh.position.y += (tgt - gateMesh.position.y) * Math.min(1, dt * 1.6); }
      const cp = coroPattern;
      let on = 0.35 + 0.15 * Math.sin(t * 2);
      if (cp.active) {
        cp.t += dt; const cycle = cp.t % 3.6;                // 3 pulsos (0–1.5s), pausa, 3 pulsos
        const pulse = (cycle < 1.5 && Math.floor(cycle / 0.5) % 2 === 0) || (cycle > 2.1 && cycle < 3.6 && Math.floor((cycle - 2.1) / 0.5) % 2 === 0);
        on = pulse ? 1 : 0.1;
      }
      for (const r of coroRings) { r.material.color.setRGB(0.2 * on + 0.1, 0.9 * on, 0.88 * on); r.material.emissive.copy(r.material.color); }
    },
    dispose() { scenery?.group.remove(group); group.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { if (!m.userData.shared) m.dispose?.(); }); }); },
  };
}

// ---------- cutscenes ----------
const cutscenes = {
  intro: {
    dur: 15.8,
    start(g, c) {
      const heli = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 4.2), new THREE.MeshLambertMaterial({ color: 0x22292b })); heli.add(body);
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(7, 0.04, 0.2), new THREE.MeshLambertMaterial({ color: 0x111111 })); rotor.position.y = 0.7; heli.add(rotor);
      const lamp = new THREE.PointLight(0xfff2cc, 40, 30); lamp.position.set(0, -0.6, -2); heli.add(lamp);
      heli.position.set(-8, 14, 32); g.scene.add(heli); c.heli = heli; c.rotor = rotor;
      g.dialogue.play('ch01_intro_radio'); g.player.teleport(0, 36, 0); g.playerView.root.visible = true;
    },
    update(g, c, dt) {
      const cam = g.threeCam, t = c.t;
      c.heli.position.set(-8 + t * 3.2, 14 + t * 1.2, 32 - t * 3.4); c.heli.rotation.y = 0.6 + t * 0.03; c.rotor.rotation.y += dt * 40;
      cam.position.set(5.5 - t * 0.04, 2.0 + Math.sin(t * 0.4) * 0.05, 41.5); cam.lookAt(c.heli.position.x * 0.3, 8 + t * 0.2, 30); cam.fov = 64; cam.updateProjectionMatrix();
      g.playerView.sync(1, dt, 1);
    },
    end(g, c) { if (c.heli) { g.scene.remove(c.heli); c.heli.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); } },   // libera geometrias/materiais do helicoptero (vazavam por inicio de capitulo)
  },
  ending: {
    dur: 9.2,
    start(g) { g.props.coroPattern.active = true; g.props.coroPattern.t = 0; g.audio.play('coro', 14, -34); g.dialogue.play('ch01_coro_tower'); },
    update(g, c) {
      const cam = g.threeCam, a = c.t * 0.18;
      cam.position.set(14 + Math.cos(a + 0.6) * 15, 3.2 + c.t * 0.1, -34 + Math.sin(a + 0.6) * 15); cam.lookAt(14, 5.5 + c.t * 0.12, -34); cam.fov = 60; cam.updateProjectionMatrix();
    },
    end(g) { g.props.coroPattern.active = false; },
  },
};

export default {
  buildProps, cutscenes,
  introToast: 'Capítulo 01 — O Sinal na Mata',
  deathHint: 'Dica: o salto do R-4 tem direção travada depois do agachar — esquive de lado no último instante. Tiros durante o agachar o interrompem.',
  gateOpen: (save) => !!save.persistentWorldFlags.chapter.ch01.gateOpen,
  /** Força transparência de um oclusor (telhado do abrigo quando o jogador está dentro). */
  forceFade: (g, id) => id === 'shelter_roof' && g.player.x > -30 && g.player.x < -24 && g.player.z > 1 && g.player.z < 7,
  // encontro tardio (2º R-4): restaura se já surgiu, ou reagenda — no ponto original do laço de encontros
  onEncounter(rt, enc, alive) {
    if (!enc.late) return false;
    if (alive.length && rt.wf.lateSpawned) spawnLate(rt, enc, alive[0], true);
    else if (alive.length && rt.wf.lateScheduled) rt.lateAt = rt.g.simMs + 2500;
    return true;
  },
  onLoad(rt) {
    const g = rt.g, save = g.save, wf = rt.wf;
    // centro exibido da área suspeita = verdadeiro + deslocamento fixo (nunca o ponto exato do segredo)
    const sz = data.zones.find((q) => q.id === 'suspicious_west'); rt.suspiciousCenter = { x: sz.pos[0] + 3.5, z: sz.pos[1] - 2.5, r: sz.r };
    g.props.setBeaconPowered(STORY(save, 'beacon_repaired'));
    g.props.setGateOpen(wf.chapter.ch01.gateOpen, true); g.world.setEnabled('gate_leaf', !wf.chapter.ch01.gateOpen);
    if (wf.bridgeCollapsed) g.props.startCollapse();
    g.props.coroPattern.active = false;
  },
  step(rt, dt, simMs) {
    const g = rt.g, p = g.player, save = g.save, wf = rt.wf;
    // tutorial inicial
    if (simMs > 1500) rt.tutorial('tut_look');
    if (dist(p.x, p.z, data.spawn.pos[0], data.spawn.pos[1]) > 3) rt.tutorial('tut_aim');
    // late spawn
    if (!wf.lateScheduled && (wf.defeatedEnemies.includes('r4_a') || STORY(save, 'beacon_repaired'))) {
      wf.lateScheduled = true; rt.lateAt = simMs + 6000;
    }
    if (rt.lateAt != null && simMs >= rt.lateAt - 3500 && !rt._roared) { rt._roared = true; g.audio.play('roar', p.x + 40, p.z + 20); g.dialogue.play('ch01_second_roar'); }
    if (rt.lateAt != null && simMs >= rt.lateAt) {
      const enc = data.encounters.find((e) => e.late), ed = enc.enemies[0];
      if (!wf.defeatedEnemies.includes(ed.id) && !wf.lateSpawned) { if (spawnLate(rt, enc, ed, false)) rt.lateAt = null; }
      else rt.lateAt = null;
    }
  },
  onZoneEnter(rt, z) {
    const g = rt.g, save = g.save, wf = rt.wf;
    switch (z.id) {
      case 'enter_zone_01': if (!wf.firstTracks) { wf.firstTracks = true; g.dialogue.play('ch01_first_tracks'); } break;
      case 'tower_visited': rt.tutorial('tut_shoulder'); break;
      case 'suspicious_west': if (hint(save, 'SEC_01')) { g.hud.toast('Fitas laranja e um símbolo de abrigo apontam para o oeste — área suspeita registrada no mapa.', 'warn'); } break;
      case 'bridge_cross': if (!wf.bridgeWarned && g.player.z > -3) { wf.bridgeWarned = true; g.dialogue.play('ch01_passarela'); } break;
      case 'bridge_mid': if (!wf.bridgeCollapsed) { wf.bridgeCollapsed = true; g.props.startCollapse(); g.audio.play('creak'); g.camera.shake(1.4); g.hud.toast('As tábuas cedem sob seus pés!', 'warn'); } break;
      default: break;
    }
  },
  hideInteractable(rt, it) {
    const s = rt.g.save;
    return (it.kind === 'beacon' && STORY(s, 'beacon_repaired')) || (it.kind === 'recon_radio' && STORY(s, 'recon_found')) || (it.kind === 'gate_panel' && STORY(s, 'outpost_access'));
  },
  holdInteraction(rt, n) {
    if (n.type !== 'beacon') return null;
    rt.tutorial('tut_interact');
    return { holdMs: n.it.holdMs, onDone: () => repairBeacon(rt) };
  },
  onInteract(rt, n) {
    const g = rt.g, wf = rt.wf;
    if (n.type === 'recon_radio') { rt.flag('recon_found'); g.dialogue.play('ch01_recon_radio'); g.hud.toast('Grupo de reconhecimento localizado.', 'good'); g.audio.play('ui'); return true; }
    if (n.type === 'gate_panel') {
      if (!STORY(g.save, 'beacon_repaired')) { g.hud.toast('Painel sem energia: religue a baliza primeiro.', 'warn'); g.audio.play('deny'); }
      else if (!STORY(g.save, 'recon_found')) { g.hud.toast('Sem sinal verde do grupo de reconhecimento: ouça o rádio do acampamento antes.', 'warn'); g.audio.play('deny'); }
      else { rt.flag('outpost_access'); wf.chapter.ch01.gateOpen = true; g.props.setGateOpen(true); g.world.setEnabled('gate_leaf', false); g.audio.play('gate'); g.dialogue.play('ch01_gate_open'); }
      return true;
    }
    return false;
  },
  objectiveTarget(rt, id) { const pt = TARGETS[id]; return pt ? { x: pt[0], z: pt[1] } : null; },
  exitWhen(rt) {
    const p = rt.g.player;
    return !!(rt.wf.chapter.ch01.gateOpen && STORY(rt.g.save, 'outpost_access') && inZone(data.zones.find((z) => z.id === 'exit_trigger'), p.x, p.z));
  },
  explorationVisited(save) {
    const z = new Set(save.persistentWorldFlags.zonesVisited);
    return ['tower_visited', 'beacon_area', 'east_trail', 'west_trail', 'recon_camp'].filter((n) => z.has(n)).concat(z.has('bridge_cross') || z.has('detour_cross') ? ['route_taken'] : []);
  },
};
