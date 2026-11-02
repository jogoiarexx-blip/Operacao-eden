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
  rt.flag('beacon_repaired'); g.scenery.setBeaconPowered(true); g.audio.play('beacon');
  if (!save.documents.includes('DOC_01')) { save.documents.push('DOC_01'); g.hud.toast(`Documento: ${docs.documents.DOC_01.title}`, 'good'); }
  g.dialogue.play('ch01_beacon_revelation');
}

export default {
  onLoad(rt) {
    const g = rt.g, save = g.save, wf = rt.wf;
    // centro exibido da área suspeita = verdadeiro + deslocamento fixo (nunca o ponto exato do segredo)
    const sz = data.zones.find((q) => q.id === 'suspicious_west'); rt.suspiciousCenter = { x: sz.pos[0] + 3.5, z: sz.pos[1] - 2.5, r: sz.r };
    // segundo R-4: restaura se já surgiu, ou reagenda
    const enc = data.encounters.find((e) => e.late);
    if (enc) {
      const alive = enc.enemies.filter((e) => !wf.defeatedEnemies.includes(e.id));
      if (alive.length && wf.lateSpawned) spawnLate(rt, enc, alive[0], true);
      else if (alive.length && wf.lateScheduled) rt.lateAt = g.simMs + 2500;
    }
    g.scenery.setBeaconPowered(STORY(save, 'beacon_repaired'));
    g.scenery.setGateOpen(wf.chapter.ch01.gateOpen, true); g.world.setEnabled('gate_leaf', !wf.chapter.ch01.gateOpen);
    if (wf.bridgeCollapsed) g.scenery.startCollapse();
    g.scenery.coroPattern.active = false;
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
      case 'bridge_mid': if (!wf.bridgeCollapsed) { wf.bridgeCollapsed = true; g.scenery.startCollapse(); g.audio.play('creak'); g.camera.shake(1.4); g.hud.toast('As tábuas cedem sob seus pés!', 'warn'); } break;
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
      else { rt.flag('outpost_access'); wf.chapter.ch01.gateOpen = true; g.scenery.setGateOpen(true); g.world.setEnabled('gate_leaf', false); g.audio.play('gate'); g.dialogue.play('ch01_gate_open'); }
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
