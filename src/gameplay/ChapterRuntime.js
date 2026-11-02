import * as THREE from 'three';
import data from '../data/chapter01.json';
import bestiary from '../data/bestiary.json';
import docs from '../data/documents.json';
import secrets from '../data/secrets.json';
import { DinosaurAgent, AI } from '../actors/DinosaurAgent.js';
import { CreatureView } from '../actors/CreatureView.js';
import { claimSecret, hint, discover, CollectibleManager, getDossier } from './SecretManager.js';
import { difficulty } from './DifficultyManager.js';
import { WEAPONS } from './GameState.js';
import { activeInventory } from './Characters.js';
import { keyLabel } from '../core/Settings.js';

/** Lógica do Capítulo 01 — O Sinal na Mata: encontros, pickups, interações, zonas, objetivos, tutoriais, flags. */
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const inZone = (z, x, zz) => dist(x, zz, z.pos[0], z.pos[1]) <= z.r;
const STORY = (save, f) => !!save.storyFlags[f];

function pickupMesh(p) {
  const g = new THREE.Group();
  const mk = (geo, col, em = 0x000000) => new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col, emissive: em, flatShading: true }));
  if (p.kind === 'document') { const m = mk(new THREE.BoxGeometry(0.34, 0.02, 0.44), 0xe8e0c8, 0x2a2618); m.rotation.y = 0.5; m.position.y = 0.05; g.add(m); }
  else if (p.kind === 'dossier') { const m = mk(new THREE.BoxGeometry(0.36, 0.05, 0.46), 0x2c6a9a, 0x0c2236); m.position.y = 0.06; m.rotation.y = -0.3; g.add(m); const t = mk(new THREE.BoxGeometry(0.2, 0.052, 0.04), 0xe8e0c8, 0x333333); t.position.set(0, 0.06, 0.1); m.add(t); }
  else if (p.id === 'medkit_small_01' || p.consumable?.medkit) { const m = mk(new THREE.BoxGeometry(0.4, 0.26, 0.28), 0xeeeeee, 0x222222); m.position.y = 0.14; g.add(m); const c1 = mk(new THREE.BoxGeometry(0.22, 0.28, 0.02), 0xcc2222, 0x330000); c1.position.set(0, 0.14, 0.14); g.add(c1); const c2 = mk(new THREE.BoxGeometry(0.08, 0.28, 0.22), 0xcc2222, 0x330000); c2.position.set(0, 0.14, 0.15); g.add(c2); }
  else if (p.kind === 'secret') { const m = mk(new THREE.BoxGeometry(0.3, 0.05, 0.4), 0x5a4a2a, 0x1a1408); m.position.y = 0.86; m.rotation.y = 0.3; g.add(m); }
  else if (p.kind === 'cache') { const m = mk(new THREE.BoxGeometry(0.8, 0.45, 0.45), 0x4a5a3a, 0x10180c); m.position.y = 0.23; g.add(m); const s = mk(new THREE.BoxGeometry(0.82, 0.06, 0.1), 0x222222); s.position.y = 0.3; g.add(s); }
  else { const m = mk(new THREE.BoxGeometry(0.46, 0.28, 0.32), 0x4a5a2c, 0x141a08); m.position.y = 0.15; g.add(m); const l = mk(new THREE.BoxGeometry(0.48, 0.04, 0.34), 0x2a3416); l.position.y = 0.3; g.add(l); }
  g.position.set(p.pos[0], p.kind === 'secret' ? 0 : 0, p.pos[1]);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class ChapterRuntime {
  constructor(game) {
    this.g = game; this.data = data; this.pickups = []; this.holdMs = 0; this.promptTarget = null; this.lateAt = null;
    this.group = new THREE.Group(); this.suspiciousCenter = null;
    // centro exibido da área suspeita = verdadeiro + deslocamento fixo (nunca o ponto exato do segredo)
    const z = data.zones.find((q) => q.id === 'suspicious_west'); this.suspiciousCenter = { x: z.pos[0] + 3.5, z: z.pos[1] - 2.5, r: z.r };
  }
  get wf() { return this.g.save.persistentWorldFlags; }

  /** (Re)constrói entidades dinâmicas conforme o save. */
  load() {
    const g = this.g, save = g.save;
    this.dispose();
    this.group = new THREE.Group(); g.scene.add(this.group);
    this.holdMs = 0; this.lateAt = null; this.pickups = []; this.lastZones = new Set();
    // pickups ainda não coletados
    for (const p of data.pickups) {
      if (this.wf.pickedUp.includes(p.id)) continue;
      const mesh = pickupMesh(p); this.group.add(mesh); this.pickups.push({ def: p, mesh });
    }
    // encontros
    for (const enc of data.encounters) {
      const alive = enc.enemies.filter((e) => !this.wf.defeatedEnemies.includes(e.id));
      g.combo.registerEncounter(enc.id, alive.length, true);
      if (enc.late) {
        if (alive.length && this.wf.lateSpawned) this._spawnLate(enc, alive[0], true);
        else if (alive.length && this.wf.lateScheduled) this.lateAt = g.simMs + 2500;
        continue;
      }
      for (const e of alive) g.spawnAgent(e, enc.id);
    }
    g.scenery.setBeaconPowered(STORY(save, 'beacon_repaired'));
    g.scenery.setGateOpen(this.wf.chapter.ch01.gateOpen, true); g.world.setEnabled('gate_leaf', !this.wf.chapter.ch01.gateOpen);
    if (this.wf.bridgeCollapsed) g.scenery.startCollapse();
    g.scenery.coroPattern.active = false;
  }
  dispose() { if (this.group) { this.g.scene.remove(this.group); this.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); } }

  labels() { const b = this.g.settings.bindings; return { move: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', look: '<kbd>Mouse</kbd>', aim: `<kbd>${keyLabel(b.aim)}</kbd>`, fire: `<kbd>${keyLabel(b.fire)}</kbd>`, reload: `<kbd>${keyLabel(b.reload)}</kbd>`, swap: `<kbd>${keyLabel(b.swap)}</kbd>`, dodge: `<kbd>${keyLabel(b.dodge)}</kbd>`, interact: `<kbd>${keyLabel(b.interact)}</kbd>` }; }
  tutorial(id) {
    if (this.wf.tutorialSeen.includes(id)) return;
    const t = data.tutorials.find((x) => x.id === id); if (!t) return;
    this.wf.tutorialSeen.push(id);
    const L = this.labels(); const html = t.text.replace(/\{(\w+)\}/g, (_, k) => L[k] ?? k);
    const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = html; this.g.hud.toasts.append(el); setTimeout(() => el.remove(), 5300);
  }

  flag(name) { this.g.save.storyFlags[name] = true; }

  // ---------- passo de simulação ----------
  step(dt, simMs, inp) {
    const g = this.g, p = g.player, save = g.save;
    // zonas
    for (const z of data.zones) {
      const inside = inZone(z, p.x, p.z);
      if (inside && !this.lastZones.has(z.id)) { this.lastZones.add(z.id); this.onZoneEnter(z); }
      if (!inside) this.lastZones.delete(z.id);
    }
    // tutorial inicial
    if (simMs > 1500) this.tutorial('tut_look');
    if (dist(p.x, p.z, 0, 36) > 3) this.tutorial('tut_aim');
    // late spawn
    if (!this.wf.lateScheduled && (this.wf.defeatedEnemies.includes('r4_a') || STORY(save, 'beacon_repaired'))) {
      this.wf.lateScheduled = true; this.lateAt = simMs + 6000;
    }
    if (this.lateAt != null && simMs >= this.lateAt - 3500 && !this._roared) { this._roared = true; g.audio.play('roar', p.x + 40, p.z + 20); g.dialogue.play('ch01_second_roar'); }
    if (this.lateAt != null && simMs >= this.lateAt) {
      const enc = data.encounters.find((e) => e.late), ed = enc.enemies[0];
      if (!this.wf.defeatedEnemies.includes(ed.id) && !this.wf.lateSpawned) { if (this._spawnLate(enc, ed, false)) this.lateAt = null; }
      else this.lateAt = null;
    }
    this.interactions(dt, simMs, inp);
    this.objectives();
    if (this.wf.chapter.ch01.gateOpen && STORY(save, 'outpost_access') && inZone(data.zones.find((z) => z.id === 'exit_trigger'), p.x, p.z) && !this.exiting) { this.exiting = true; g.finishChapter(); }
    // animação de pickups
    for (const k of this.pickups) k.mesh.rotation.y += dt * 0.5;
  }

  onZoneEnter(z) {
    const g = this.g, save = g.save, vz = this.wf.zonesVisited;
    if (!vz.includes(z.id)) vz.push(z.id);
    switch (z.id) {
      case 'enter_zone_01': if (!this.wf.firstTracks) { this.wf.firstTracks = true; g.dialogue.play('ch01_first_tracks'); } break;
      case 'tower_visited': this.tutorial('tut_shoulder'); break;
      case 'suspicious_west': if (hint(save, 'SEC_01')) { g.hud.toast('Fitas laranja e um símbolo de abrigo apontam para o oeste — área suspeita registrada no mapa.', 'warn'); } break;
      case 'bridge_cross': if (!this.wf.bridgeWarned && p0(g).z > -3) { this.wf.bridgeWarned = true; g.dialogue.play('ch01_passarela'); } break;
      case 'bridge_mid': if (!this.wf.bridgeCollapsed) { this.wf.bridgeCollapsed = true; g.scenery.startCollapse(); g.audio.play('creak'); g.camera.shake(1.4); g.hud.toast('As tábuas cedem sob seus pés!', 'warn'); } break;
      case 'terminal': break;
      default: break;
    }
  }

  objectives() {
    const save = this.g.save, done = save.completedObjectives;
    for (const o of data.objectives) {
      if (done.includes(o.id)) continue;
      const w = o.doneWhen; let ok = false;
      if (w.zone) ok = this.wf.zonesVisited.includes(w.zone);
      if (w.flag) ok = STORY(save, w.flag);
      if (ok) { done.push(o.id); this.g.hud.toast(`Objetivo concluído: ${o.text.split('.')[0]}`, 'good'); }
    }
  }
  currentObjective() { return data.objectives.find((o) => !this.g.save.completedObjectives.includes(o.id)); }
  objectiveTarget() {
    const o = this.currentObjective(); if (!o) return null;
    const pt = { reach_tower: [-13, 18], repair_beacon: [10, 6], find_recon: [-6, -27], open_gate: [4.2, -37.6], exit_sector: [0, -42] }[o.id];
    return pt ? { x: pt[0], z: pt[1] } : null;
  }

  // ---------- interações ----------
  nearest(p) {
    let best = null;
    const consider = (d, r, rec) => { if (d <= r && (!best || d < best.d)) best = { d, ...rec }; };
    for (const k of this.pickups) consider(dist(p.x, p.z, k.def.pos[0], k.def.pos[1]), 1.9, { type: 'pickup', k, label: `Pegar — ${k.def.label}` });
    for (const it of data.interactables) {
      if (it.kind === 'beacon' && STORY(this.g.save, 'beacon_repaired')) continue;
      if (it.kind === 'recon_radio' && STORY(this.g.save, 'recon_found')) continue;
      if (it.kind === 'gate_panel' && STORY(this.g.save, 'outpost_access')) continue;
      consider(dist(p.x, p.z, it.pos[0], it.pos[1]), it.r, { type: it.kind, it, label: it.label });
    }
    for (const t of data.terminals) consider(dist(p.x, p.z, t.pos[0], t.pos[1]), 2.3, { type: 'terminal', t, label: `Usar ${t.name}` });
    return best;
  }
  interactions(dt, simMs, inp) {
    const g = this.g, p = g.player, key = keyLabel(g.settings.bindings.interact);
    if (p.dead || p.dodging) { g.hud.setPrompt(null); this.holdMs = 0; return; }
    const n = this.nearest(p); this.promptTarget = n;
    if (!n) { g.hud.setPrompt(null); this.holdMs = Math.max(0, this.holdMs - dt * 2000); return; }
    if (n.type === 'terminal') this.tutorial('tut_terminal');
    if (n.type === 'beacon') this.tutorial('tut_interact');
    if (n.type === 'beacon') {
      const hold = n.it.holdMs;
      if (inp.interactHeld && !p.using) {
        this.holdMs += dt * 1000;
        if (this.g.lastDamageAt > simMs - 120) this.holdMs = 0;
        if (this.holdMs >= hold) { this.holdMs = 0; this.repairBeacon(); }
      } else this.holdMs = Math.max(0, this.holdMs - dt * 1500);
      g.hud.setPrompt(`<kbd>${key}</kbd> (segure) ${n.label}`, this.holdMs / hold); return;
    }
    g.hud.setPrompt(`<kbd>${key}</kbd> ${n.label}`);
    if (!inp.interactPressed) return;
    if (n.type === 'pickup') this.collect(n.k);
    else if (n.type === 'terminal') g.openTerminal(n.t);
    else if (n.type === 'recon_radio') { this.flag('recon_found'); g.dialogue.play('ch01_recon_radio'); g.hud.toast('Grupo de reconhecimento localizado.', 'good'); g.audio.play('ui'); }
    else if (n.type === 'gate_panel') {
      if (!STORY(g.save, 'beacon_repaired')) { g.hud.toast('Painel sem energia: religue a baliza primeiro.', 'warn'); g.audio.play('deny'); }
      else if (!STORY(g.save, 'recon_found')) { g.hud.toast('Sem sinal verde do grupo de reconhecimento: ouça o rádio do acampamento antes.', 'warn'); g.audio.play('deny'); }
      else { this.flag('outpost_access'); this.wf.chapter.ch01.gateOpen = true; g.scenery.setGateOpen(true); g.world.setEnabled('gate_leaf', false); g.audio.play('gate'); g.dialogue.play('ch01_gate_open'); }
    }
  }
  repairBeacon() {
    const g = this.g, save = g.save;
    this.flag('beacon_repaired'); g.scenery.setBeaconPowered(true); g.audio.play('beacon');
    if (!save.documents.includes('DOC_01')) { save.documents.push('DOC_01'); g.hud.toast(`Documento: ${docs.documents.DOC_01.title}`, 'good'); }
    g.dialogue.play('ch01_beacon_revelation');
  }

  collect(k) {
    const g = this.g, save = g.save, p = k.def; g.syncSaveFromRuntime();
    let taken = true, msg = '';
    const ammoScale = (n) => difficulty.ammoPickup(n, save.difficulty.current);
    const inv = activeInventory(save);
    const capAmmo = (w) => { const cap = WEAPONS[w]?.reserveCap ?? 999; inv.ammoReserve[w] = Math.min(cap, inv.ammoReserve[w] ?? 0); };
    const capCons = (c) => { inv.consumables[c] = Math.min(5, inv.consumables[c] ?? 0); };
    if (p.kind === 'supplies') {
      const parts = [];
      for (const [w, n] of Object.entries(p.ammo ?? {})) { const v = ammoScale(n); inv.ammoReserve[w] = (inv.ammoReserve[w] ?? 0) + v; capAmmo(w); parts.push(`+${v} munição`); }
      for (const [c, n] of Object.entries(p.consumable ?? {})) { inv.consumables[c] = (inv.consumables[c] ?? 0) + n; capCons(c); parts.push(`+${n} ${c === 'medkit' ? 'kit médico' : 'hemostático'}`); }
      msg = parts.join(' · ');
    } else if (p.kind === 'document') { if (!save.documents.includes(p.doc)) save.documents.push(p.doc); msg = `Documento: ${docs.documents[p.doc].title}`; }
    else if (p.kind === 'dossier') {
      const r = CollectibleManager.collect(save, g.profile, p.dossier); g.saveProfile();
      msg = `Dossiê de campo ${p.dossier} — ${getDossier(p.dossier).title}`; g.stats.dossiersFound = save.dossiersInRun.length; void r;
    } else if (p.kind === 'secret' || p.kind === 'cache') {
      const r = claimSecret(save, p.secret ?? p.cache, { ammoScale });
      if (!r) taken = false; else { msg = (p.kind === 'secret' ? 'Segredo encontrado: Abrigo do topógrafo. ' : 'Cache encontrado. ') + r.summary.join(' · '); g.stats.secretsFound++; if (p.kind === 'secret') discover(save, 'SEC_01'); capAmmo('pistol'); capCons('medkit'); capCons('hemostatic'); }
    }
    if (!taken) return;
    this.wf.pickedUp.push(p.id); this.pickups = this.pickups.filter((x) => x !== k); this.group.remove(k.mesh);
    g.syncRuntimeFromSave(); g.hud.toast(msg, 'good'); g.audio.play('pickup');
  }

  // ---------- spawn justo do segundo R-4 ----------
  _spawnLate(enc, ed, restore) {
    const g = this.g, p = g.player, rng = g.rng;
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
        this.wf.lateSpawned = true; return true;
      }
    }
    return false;
  }
}
const p0 = (g) => g.player;
export { data as chapterData, bestiary, secrets };
