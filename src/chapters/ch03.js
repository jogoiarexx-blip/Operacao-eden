import { getMaterial } from '../render/Materials.js';
import * as THREE from 'three';
import data from '../data/chapter03.json';
import lines from '../data/dialogues.json';
import docs from '../data/documents.json';
import { AI } from '../actors/DinosaurAgent.js';
import { hint } from '../gameplay/SecretManager.js';

/**
 * Script do Capítulo 03 — Jardim das Vozes (Lia), setor `research_gardens_03` (GDD 7.4).
 * Objetivos: chave biométrica da Dra. Elisa → calibrar a torre CORO-J (puzzle de frequência acessível) → comporta da ala de pesquisa.
 * Novidades: S-2 (espreitador que contorna e denuncia a manobra pelo som) e distração por irrigação (alternativa ao combate).
 * Lógica pura exportada para testes: `chapterState`, `TARGET`, `cycleChannel`, `channelsInTune`, `wingPanelCheck`, `sprinklerNoise`.
 */
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const STORY = (save, f) => !!save.storyFlags[f];
const zoneOf = (id) => data.zones.find((z) => z.id === id);
const inZone = (z, x, zz) => dist(x, zz, z.pos[0], z.pos[1]) <= z.r;

// ---------------------------------------------------------------- lógica pura
/** Frequências de cada canal (índices). O alvo vem da Tabela de calibração (DOC_CALIB). */
export const FREQ = Object.freeze(['GRAVE', 'MÉDIO', 'AGUDO']);
export const TARGET = Object.freeze([2, 0, 1]);                 // canal 1 AGUDO · canal 2 GRAVE · canal 3 MÉDIO
const INITIAL = [0, 1, 2];                                       // começa com os três canais fora de sintonia

/** Estado local do capítulo no save (persistentWorldFlags.chapter.ch03). */
export function chapterState(save) {
  const c = save.persistentWorldFlags.chapter ??= {};
  const s = (c.ch03 ??= { gateOpen: false, channels: [...INITIAL], s2bScheduled: false, s2bSpawned: false });
  if (!Array.isArray(s.channels) || s.channels.length !== 3) s.channels = [...INITIAL];
  return s;
}
/** Avança o canal `i` para a próxima frequência. Retorna o novo valor. */
export function cycleChannel(state, i) { state.channels[i] = (state.channels[i] + 1) % FREQ.length; return state.channels[i]; }
export const channelOk = (state, i) => state.channels[i] === TARGET[i];
export const channelsInTune = (state) => state.channels.filter((_, i) => channelOk(state, i)).length;
/** Comporta da ala: exige a chave e a torre em repouso (quarentena). Nunca trava o jogador: a mensagem diz o que falta. */
export function wingPanelCheck(save) {
  if (!STORY(save, 'biometric_key')) return { ok: false, reason: 'key' };
  if (!STORY(save, 'coro_garden_off')) return { ok: false, reason: 'coro' };
  return { ok: true };
}
export const SPRINKLER = Object.freeze({ pos: [-22, -5], radius: 20, durationMs: 9000, cooldownMs: 20000 });
/** Ruído da irrigação: fonte sonora ativa enquanto a água corre (atrai o S-2 para fora da estufa). */
export function sprinklerNoise(rtState, simMs) {
  return rtState.sprinklerUntil != null && simMs < rtState.sprinklerUntil ? [{ x: SPRINKLER.pos[0], z: SPRINKLER.pos[1], r: SPRINKLER.radius }] : [];
}

// ---------------------------------------------------------------- spawns fora da visão
function visibleFromCamera(g, x, z) {
  const yawC = g.camera.yaw, hfov = 2 * Math.atan(Math.tan((g.camera.fov * Math.PI) / 360) * g.camera.aspect);
  const ang = Math.abs(((Math.atan2(-(x - g.camera.pos.x), -(z - g.camera.pos.z)) - yawC + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  if (ang >= hfov / 2 + 0.25) return false;
  return !g.world.segmentBlocked(g.camera.pos.x, g.camera.pos.y, g.camera.pos.z, x, 1.0, z, 'bullet');
}
function pickSpawn(g, cands, { force = false, r = 0.7, minDist = 16 } = {}) {
  const p = g.player;
  const list = cands.map((c) => ({ x: c[0], z: c[1], d: dist(p.x, p.z, c[0], c[1]) })).filter((c) => !g.world.blockedAt(c.x, c.z, r));
  list.sort((a, b) => b.d - a.d);
  const hidden = list.find((c) => c.d >= minDist && !visibleFromCamera(g, c.x, c.z));
  return hidden ?? (force ? list[0] ?? null : null);
}
function spawnReaction(rt, force) {
  const g = rt.g, st = chapterState(g.save), enc = data.encounters.find((e) => e.id === 'ch03_s2_reaction'), def = enc.enemies[0];
  if (g.save.persistentWorldFlags.defeatedEnemies.includes(def.id) || g.liveAgents().some((a) => a.id === def.id)) return true;
  const pt = pickSpawn(g, def.spawnCandidates, { force });
  if (!pt) return false;
  const a = g.spawnAgent({ ...def, pos: [pt.x, pt.z], patrol: [] }, enc.id);
  a.noiseTarget = { x: g.player.x, z: g.player.z }; a.setState(AI.INVESTIGATE);        // chega pelo som, sem teletransporte
  st.s2bSpawned = true;
  return true;
}

// ---------------------------------------------------------------- ações
function takeKey(rt) {
  const g = rt.g, save = g.save;
  rt.flag('biometric_key'); rt.flag('elisa_log_01');
  if (!save.documents.includes('AUDIO_ELISA_01')) save.documents.push('AUDIO_ELISA_01');
  g.audio.play('pickup'); g.hud.toast(`Chave biométrica obtida · Documento: ${docs.documents.AUDIO_ELISA_01.title}`, 'good');
  g.dialogue.play('ch03_elisa_log');
}
function useConsole(rt, it) {
  const g = rt.g, st = chapterState(g.save), i = it.channel;
  const v = cycleChannel(st, i);
  g.audio.play(['freq_low', 'freq_mid', 'freq_high'][v], it.pos[0], it.pos[1]);
  g.props.setChannel(i, v, channelOk(st, i));
  if (channelsInTune(st) === 3) calibrate(rt);
  else g.hud.toast(`Canal ${i + 1}: ${FREQ[v]}${channelOk(st, i) ? ' — em sintonia' : ' — fora de sintonia'}`, channelOk(st, i) ? 'good' : 'warn');
}
function calibrate(rt) {
  const g = rt.g, st = chapterState(g.save);
  rt.flag('coro_garden_off'); rt.flag('coro_route_vale');
  g.props.setCalibrated(true); g.audio.play('coro', 0, -13); g.camera.shake(0.6);
  g.hud.toast('Torre CORO-J em repouso. Ela transmitiu a última rota armazenada…', 'warn');
  g.dialogue.play('ch03_coro_route');
  if (!st.s2bScheduled) { st.s2bScheduled = true; rt.reactionAt = g.simMs + 11000; }
}
function useIrrigation(rt) {
  const g = rt.g, now = g.simMs;
  if (rt.sprinklerReadyAt != null && now < rt.sprinklerReadyAt) { g.hud.toast('A bomba de irrigação ainda está recarregando a pressão.', 'warn'); g.audio.play('deny'); return; }
  rt.sprinklerUntil = now + SPRINKLER.durationMs; rt.sprinklerReadyAt = now + SPRINKLER.cooldownMs;
  g.audio.play('sprinkler', SPRINKLER.pos[0], SPRINKLER.pos[1]);
  if (!rt.wf.chapter.ch03.irrigationUsed) { rt.wf.chapter.ch03.irrigationUsed = true; g.dialogue.play('ch03_irrigation'); }
  g.hud.toast('Irrigação ligada na ala norte: o barulho atrai o que estiver na estufa.', 'good');
}
function useWingPanel(rt) {
  const g = rt.g, save = g.save, r = wingPanelCheck(save);
  if (!r.ok) {
    g.audio.play('deny');
    if (r.reason === 'key') { g.hud.toast('Leitor biométrico: credencial E. MOURA necessária. A chave está no escritório da estufa tropical.', 'warn'); g.dialogue.play('ch03_wing_denied'); }
    else g.hud.toast('Quarentena ativa: a comporta não abre enquanto a torre CORO do jardim transmite. Calibre a torre na praça.', 'warn');
    return;
  }
  rt.flag('research_wing_open'); chapterState(save).gateOpen = true;
  g.props.setGateOpen(true); g.world.setEnabled('wing_gate', false); g.audio.play('gate');
  g.dialogue.play('ch03_wing_open'); rt.revealArea('wing_gate_opened');
}

// ---------------------------------------------------------------- props (torre, comporta, estufas)
const lm = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const C_OK = new THREE.Color(0x38e07a), C_BAD = new THREE.Color(0xe0a030), C_REST = new THREE.Color(0x57e6e0);

function buildProps({ scene, data: d, scenery, quality = 'medium' }) {
  const group = new THREE.Group(); (scenery?.group ?? scene).add(group);
  const meshOf = (id) => scenery?.meshes?.get(id);
  const sDef = (id) => d.structures.find((x) => x.id === id);
  const frame = lm(0x3b4a48), updaters = [];
  const lampMat = (hex) => { const m = getMaterial('emissiveLamp', quality, { color: hex, emissive: hex }).clone(); m.userData.shared = false; return m; };

  // montantes das estufas (leitura da silhueta de vidro)
  for (const [cx, cz, w, dd, h] of [[0, 18, 12, 10, 3.2], [-22, 6, 16, 16, 3.4], [24, 8, 12, 12, 3.2]]) {
    const xs = [cx - w / 2, cx - w / 6, cx + w / 6, cx + w / 2], zs = [cz - dd / 2, cz + dd / 2];
    for (const x of xs) for (const z of zs) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.14), frame); p.position.set(x, h / 2, z); group.add(p); }
    for (const z of [cz - dd / 2, cz + dd / 2, cz]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.12), frame); b.position.set(cx, h, z); group.add(b); }
  }

  // anéis da torre CORO-J: um por canal (âmbar = fora de sintonia, verde = em sintonia, ciano = repouso)
  const rings = [], tower = meshOf('coro_garden'), td = sDef('coro_garden');
  if (tower && td) for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(td.r * 1.3, 0.13, 6, 16), lampMat(0xe0a030));
    ring.rotation.x = Math.PI / 2; ring.position.y = -td.h / 2 + 4 + i * 3.2; tower.add(ring); rings.push(ring);
  }
  // lâmpada de estado de cada console
  const consoleLamps = ['console_a', 'console_b', 'console_c'].map((id) => {
    const m = meshOf(id), s = sDef(id); if (!m || !s) return null;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lampMat(0xe0a030)); l.position.set(0, s.size[1] / 2 + 0.12, 0); m.add(l); return l;
  });
  const state = { ok: [false, false, false], calibrated: false, pulseT: 0 };
  const paint = (mesh, col, k) => { if (!mesh) return; mesh.material.color.copy(col).multiplyScalar(k); mesh.material.emissive?.copy(col).multiplyScalar(k); };

  // comporta da ala de pesquisa
  const gate = meshOf('wing_gate'), gd = sDef('wing_gate');
  if (gate) for (let i = -1; i <= 1; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 0.05), lm(0xb08c22)); st.position.set(i * 1.3, 0, 0.38); st.rotation.z = 0.5; gate.add(st); }
  const gateBase = gd ? (gd.y ?? 0) + gd.size[1] / 2 : 1.8;

  // água da irrigação (partículas leves, só quando ligada)
  const drops = new THREE.Group(); drops.visible = false; group.add(drops);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), dropMat); m.userData.seed = i * 1.7; drops.add(m); }
  drops.position.set(-22, 0, -5);

  // etiquetas do berçário (pista do SEC_02)
  for (const [x, z] of [[14.5, 11.6], [16.2, 13.4]]) { const tag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.03), lm(0xe8dcc0, { emissive: 0x2a2418 })); tag.position.set(x, 1.0, z); tag.rotation.y = 0.4; group.add(tag); }

  updaters.push((t, dt) => {
    state.pulseT += dt;
    const cycle = state.pulseT % 3.6;
    const pulse = (cycle < 1.5 && Math.floor(cycle / 0.5) % 2 === 0) || (cycle > 2.1 && Math.floor((cycle - 2.1) / 0.5) % 2 === 0);
    rings.forEach((r, i) => {
      if (state.calibrated) paint(r, C_REST, 0.45 + 0.1 * Math.sin(t * 1.5 + i));
      else paint(r, state.ok[i] ? C_OK : C_BAD, state.ok[i] ? 0.9 : (pulse ? 1 : 0.25));
    });
    consoleLamps.forEach((l, i) => paint(l, state.calibrated ? C_REST : state.ok[i] ? C_OK : C_BAD, 1));
    if (gate && gate.userData.target !== undefined) { const tgt = gateBase + gate.userData.target; gate.position.y += (tgt - gate.position.y) * Math.min(1, dt * 1.6); }
    if (drops.visible) drops.children.forEach((m) => { const k = (t * 2.4 + m.userData.seed) % 1; const a = m.userData.seed * 2.1; m.position.set(Math.cos(a) * (0.4 + k * 2.2), 1.6 - k * 1.6 + Math.sin(k * Math.PI) * 0.8, Math.sin(a) * (0.4 + k * 2.2)); });
  });

  return {
    group, rings,
    coroPattern: state,
    setChannel(i, v, ok) { state.ok[i] = !!ok; void v; },
    setChannels(st) { for (let i = 0; i < 3; i++) state.ok[i] = st.channels[i] === TARGET[i]; },
    setCalibrated(on) { state.calibrated = !!on; },
    setGateOpen(open, instant) { if (!gate) return; gate.userData.target = open ? 3.8 : 0; if (instant) gate.position.y = gateBase + gate.userData.target; },
    setSprinkler(on) { drops.visible = !!on; },
    update(dt, t = 0) { for (const u of updaters) u(t, dt); },
    dispose() { (scenery?.group ?? scene).remove(group); group.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { if (!m.userData?.shared) m.dispose?.(); }); }); rings.forEach((r) => r.parent?.remove(r)); consoleLamps.forEach((l) => l?.parent?.remove(l)); },
  };
}

// ---------------------------------------------------------------- cutscenes
const dlgSec = (id) => (lines[id] ?? []).reduce((s, l) => s + l.ms, 0) / 1000;
const sstep = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const mix = (a, b, k) => a + (b - a) * k;

const cutscenes = {
  intro: {
    dur: dlgSec('ch03_intro_radio') + 0.6,
    start(g) { g.dialogue.play('ch03_intro_radio'); g.player.teleport(data.spawn.pos[0], data.spawn.pos[1], data.spawn.yaw); g.playerView.root.visible = true; },
    update(g, c, dt) {
      // abre nas estufas embaçadas e recua até Lia na estrada de serviço
      const cam = g.threeCam, k = sstep(0.15 * c.dur, 0.85 * c.dur, c.t);
      cam.position.set(mix(-5, 2.6, k), mix(4.2, 1.9, k), mix(25, 41.2, k));
      cam.lookAt(mix(0, data.spawn.pos[0], k), mix(2.2, 1.4, k), mix(15, data.spawn.pos[1], k));
      cam.fov = 60; cam.updateProjectionMatrix();
      g.playerView.sync(1, dt, 1);
    },
  },
  ending: {
    dur: dlgSec('ch03_ending') + 0.8,
    start(g) {
      const [ex, ez] = data.exitCheckpoint.pos;
      g.player.teleport(ex, ez - 5, Math.PI); g.playerView.root.visible = true;
      g.props.setCalibrated(true);
      g.dialogue.play('ch03_ending');
    },
    update(g, c, dt) {
      // de dentro da comporta, olhando de volta para a torre do jardim
      const cam = g.threeCam, p = g.player, k = sstep(0, c.dur, c.t);
      cam.position.set(p.x + mix(1.6, -1.2, k), mix(1.7, 2.6, k), p.z - mix(2.2, 3.4, k));
      cam.lookAt(0, mix(1.6, 7, k), mix(p.z, -13, k)); cam.fov = 58; cam.updateProjectionMatrix();
      g.playerView.sync(1, dt, 1);
    },
  },
};

// ---------------------------------------------------------------- hooks
const ROOFS = { office_roof: [-30, 8, -24, 14] };

export default {
  buildProps, cutscenes,
  introToast: 'Capítulo 03 — Jardim das Vozes',
  gateOpen: (save) => !!save.persistentWorldFlags.chapter?.ch03?.gateOpen,
  deathHint: 'Dica: o S-2 contorna antes de atacar — o farfalhar avisa. Fique de costas para um vidro ou vaso, espere o agachar e atire. O painel de irrigação tira o S-2 da estufa.',
  forceFade: (g, id) => { const r = ROOFS[id]; return !!r && g.player.x > r[0] && g.player.x < r[2] && g.player.z > r[1] && g.player.z < r[3]; },

  onEncounter(rt, enc, alive) {
    if (enc.id !== 'ch03_s2_reaction') return false;
    const st = chapterState(rt.g.save);
    if (alive.length && st.s2bSpawned) spawnReaction(rt, true);                     // recarga: volta por um ponto marcado
    else if (alive.length && st.s2bScheduled) rt.reactionAt = rt.g.simMs + 4000;   // torre já calibrada, ainda não chegou
    return true;
  },
  onLoad(rt) {
    const g = rt.g, save = g.save, st = chapterState(save);
    rt.sprinklerUntil = null; rt.sprinklerReadyAt = null; rt._cueAt = null;
    if (!STORY(save, 'coro_garden_off') && channelsInTune(st) === 3) st.channels = [...INITIAL];   // estado inconsistente: recomeça o puzzle
    g.props.setChannels(st); g.props.setCalibrated(STORY(save, 'coro_garden_off'));
    g.props.setGateOpen(st.gateOpen, true); g.world.setEnabled('wing_gate', !st.gateOpen);
    g.props.setSprinkler(false);
    const nz = zoneOf('nursery_inside'); rt.suspiciousCenter = { x: nz.pos[0] - 2.5, z: nz.pos[1] + 2, r: nz.r + 1 };
  },
  /** Fontes sonoras do cenário consumidas pela IA no mesmo passo (antes da percepção). */
  noiseSources(rt, simMs) { return sprinklerNoise(rt, simMs); },
  step(rt, dt, simMs) {
    const g = rt.g, p = g.player, save = g.save;
    if (simMs > 2000) rt.tutorial('tut_listen');
    const irr = data.interactables.find((i) => i.id === 'irrigation_panel');
    if (dist(p.x, p.z, irr.pos[0], irr.pos[1]) < 4.5) rt.tutorial('tut_distract');
    g.props.setSprinkler(rt.sprinklerUntil != null && simMs < rt.sprinklerUntil);
    // reação à recalibração: aviso sonoro ~3,5 s antes, depois o S-2 chega por um ponto fora da câmera
    if (rt.reactionAt != null) {
      if (!rt._cueAt && simMs >= rt.reactionAt - 3500) { rt._cueAt = simMs; g.audio.play('rustle', p.x - 18, p.z - 10); g.audio.play('spotted', p.x - 22, p.z - 14); g.dialogue.play('ch03_s2_reaction'); }
      if (simMs >= rt.reactionAt) { if (spawnReaction(rt, simMs - rt.reactionAt > 8000)) rt.reactionAt = null; }
    }
    void save;
  },
  objectiveStatus(rt) {
    const save = rt.g.save;
    if (!STORY(save, 'biometric_key') || STORY(save, 'coro_garden_off')) return null;
    return `canais em sintonia: ${channelsInTune(chapterState(save))}/3`;
  },
  onZoneEnter(rt, z) {
    const g = rt.g, save = g.save, wf = rt.wf;
    switch (z.id) {
      case 'gh2_door': if (!wf.chapter.ch03.stalkerWarned && !wf.defeatedEnemies.includes('s2_a')) { wf.chapter.ch03.stalkerWarned = true; g.dialogue.play('ch03_first_stalker'); g.audio.play('rustle', -20, 7); } break;
      case 'tower_plaza': rt.tutorial('tut_calib'); if (!wf.chapter.ch03.plazaTold && !STORY(save, 'coro_garden_off')) { wf.chapter.ch03.plazaTold = true; g.dialogue.play('ch03_tower_plaza'); } break;
      case 'nursery_hint': if (hint(save, 'SEC_02')) g.hud.toast('Etiquetas de berçário nos vasos apontam para a estufa lacrada a leste — área suspeita registrada no mapa.', 'warn'); break;
      default: break;
    }
  },
  hideInteractable(rt, it) {
    const s = rt.g.save;
    return (it.kind === 'bio_locker' && STORY(s, 'biometric_key')) || (it.kind === 'coro_console' && STORY(s, 'coro_garden_off')) || (it.kind === 'wing_panel' && STORY(s, 'research_wing_open'));
  },
  interactLabel(rt, it) {
    if (it.kind === 'coro_console') { const st = chapterState(rt.g.save), i = it.channel; return `${it.label}: ${FREQ[st.channels[i]]} (${channelOk(st, i) ? 'em sintonia' : 'fora de sintonia'}) — trocar frequência`; }
    if (it.kind === 'irrigation_panel' && rt.sprinklerReadyAt != null && rt.g.simMs < rt.sprinklerReadyAt) return `${it.label} (recarregando pressão)`;
    return null;
  },
  holdInteraction(rt, n) {
    if (n.type !== 'bio_locker') return null;
    return { holdMs: n.it.holdMs, onDone: () => takeKey(rt) };
  },
  onInteract(rt, n) {
    switch (n.type) {
      case 'coro_console': useConsole(rt, n.it); return true;
      case 'irrigation_panel': useIrrigation(rt); return true;
      case 'wing_panel': useWingPanel(rt); return true;
      default: return false;
    }
  },
  exitWhen(rt) {
    const p = rt.g.player, save = rt.g.save;
    return !save.chapterStats?.ch03 && chapterState(save).gateOpen && STORY(save, 'research_wing_open') && inZone(zoneOf('wing_exit'), p.x, p.z);
  },
  explorationVisited(save) {
    const z = new Set(save.persistentWorldFlags.zonesVisited);
    return ['enter_gardens', 'gh2_inside', 'elisa_office', 'tower_plaza', 'nursery_hint', 'east_trail_03'].filter((n) => z.has(n));
  },
};
