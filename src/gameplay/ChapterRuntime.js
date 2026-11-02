import * as THREE from 'three';
import bestiary from '../data/bestiary.json';
import docs from '../data/documents.json';
import secrets from '../data/secrets.json';
import { claimSecret, discover, CollectibleManager, getDossier } from './SecretManager.js';
import { difficulty } from './DifficultyManager.js';
import { WEAPONS } from './GameState.js';
import { activeInventory, getCharacter, canUseInteraction } from './Characters.js';
import { keyLabel } from '../core/Settings.js';

/** Runtime genérico de capítulo: encontros, pickups, interações, zonas, objetivos, tutoriais, flags. Lógica específica vive no script do capítulo (hooks). */
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
  constructor(game, { data, script }) {
    this.g = game; this.data = data; this.script = script ?? {}; this.pickups = []; this.holdMs = 0; this.promptTarget = null; this.lateAt = null;
    this.group = new THREE.Group(); this.suspiciousCenter = null;
  }
  get wf() { return this.g.save.persistentWorldFlags; }

  /** (Re)constrói entidades dinâmicas conforme o save. */
  load() {
    const g = this.g, data = this.data;
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
      if (this.script.onEncounter?.(this, enc, alive)) continue;      // script trata encontros especiais (ex.: tardio) no ponto original do laço
      for (const e of alive) g.spawnAgent(e, enc.id);
    }
    this.restoreBreakables();
    this.script.onLoad?.(this);
  }
  /** Barreiras: as já quebradas somem (colisor + mesh); as demais voltam (carregar save anterior no mesmo capítulo). */
  restoreBreakables() {
    const g = this.g, broken = this.wf.broken ??= [];
    for (const it of this.data.interactables) {
      if (it.kind !== 'breakable') continue;
      const gone = broken.includes(it.id), cid = it.colliderId ?? it.id, mesh = g.scenery?.meshes?.get(cid);
      if (gone) g.world.removeById(cid); else g.world.restoreById?.(cid);
      if (mesh) mesh.visible = !gone;
    }
  }
  /** Golpe de impacto em (x,z): quebra barreiras ao alcance. Retorna quantas quebrou. */
  breakAt(x, z, range) {
    const g = this.g, broken = this.wf.broken ??= []; let n = 0;
    for (const it of this.data.interactables) {
      if (it.kind !== 'breakable' || broken.includes(it.id)) continue;
      if (dist(x, z, it.pos[0], it.pos[1]) > range) continue;
      const cid = it.colliderId ?? it.id, mesh = g.scenery?.meshes?.get(cid);
      g.world.removeById(cid); if (mesh) mesh.visible = false;
      broken.push(it.id); n++;
      g.fx?.burst({ x: it.pos[0], y: 1, z: it.pos[1] }, 0xb89a6a, 14, 4);
      this.script.onBreak?.(this, it);
    }
    return n;
  }
  hiddenInteractable(it) {
    if (it.kind === 'breakable') return (this.wf.broken ?? []).includes(it.id);
    if (it.kind === 'heavy_lever' && it.flag) return !!this.g.save.storyFlags[it.flag];
    return false;
  }
  dispose() { this.script.onDispose?.(this); if (this.group) { this.g.scene.remove(this.group); this.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); } }

  labels() { const b = this.g.settings.bindings; return { move: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', look: '<kbd>Mouse</kbd>', aim: `<kbd>${keyLabel(b.aim)}</kbd>`, fire: `<kbd>${keyLabel(b.fire)}</kbd>`, reload: `<kbd>${keyLabel(b.reload)}</kbd>`, swap: `<kbd>${keyLabel(b.swap)}</kbd>`, dodge: `<kbd>${keyLabel(b.dodge)}</kbd>`, interact: `<kbd>${keyLabel(b.interact)}</kbd>`, utility: `<kbd>${keyLabel(b.utility)}</kbd>`, weapon1: `<kbd>${keyLabel(b.weapon1)}</kbd>`, weapon2: `<kbd>${keyLabel(b.weapon2)}</kbd>` }; }
  tutorial(id) {
    if (this.wf.tutorialSeen.includes(id)) return;
    const t = this.data.tutorials.find((x) => x.id === id); if (!t) return;
    this.wf.tutorialSeen.push(id);
    const L = this.labels(); const html = t.text.replace(/\{(\w+)\}/g, (_, k) => L[k] ?? k);
    const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = html; this.g.hud.toasts.append(el); setTimeout(() => el.remove(), 5300);
  }

  flag(name) { this.g.save.storyFlags[name] = true; }

  // ---------- passo de simulação ----------
  step(dt, simMs, inp) {
    const p = this.g.player;
    // zonas
    for (const z of this.data.zones) {
      const inside = inZone(z, p.x, p.z);
      if (inside && !this.lastZones.has(z.id)) { this.lastZones.add(z.id); this.onZoneEnter(z); }
      if (!inside) this.lastZones.delete(z.id);
    }
    this.script.step?.(this, dt, simMs, inp);
    this.interactions(dt, simMs, inp);
    this.objectives();
    if (!this.exiting && this.script.exitWhen?.(this)) { this.exiting = true; this.g.finishChapter(); }
    // animação de pickups
    for (const k of this.pickups) k.mesh.rotation.y += dt * 0.5;
  }

  onZoneEnter(z) {
    const vz = this.wf.zonesVisited;
    if (!vz.includes(z.id)) vz.push(z.id);
    this.script.onZoneEnter?.(this, z);
  }

  objectives() {
    const save = this.g.save, done = save.completedObjectives;
    for (const o of this.data.objectives) {
      if (done.includes(o.id)) continue;
      const w = o.doneWhen; let ok = false;
      if (w.zone) ok = this.wf.zonesVisited.includes(w.zone);
      if (w.flag) ok = STORY(save, w.flag);
      if (w.flags) ok = w.flags.every((f) => STORY(save, f));
      if (ok) { done.push(o.id); this.g.hud.toast(`Objetivo concluído: ${o.text.split('.')[0]}`, 'good'); }
    }
  }
  currentObjective() { return this.data.objectives.find((o) => !this.g.save.completedObjectives.includes(o.id)); }
  objectiveTarget() {
    const o = this.currentObjective(); if (!o) return null;
    if (o.target) return { x: o.target[0], z: o.target[1] };
    return this.script.objectiveTarget?.(this, o.id) ?? null;
  }

  // ---------- interações ----------
  nearest(p) {
    let best = null;
    const consider = (d, r, rec) => { if (d <= r && (!best || d < best.d)) best = { d, ...rec }; };
    for (const k of this.pickups) consider(dist(p.x, p.z, k.def.pos[0], k.def.pos[1]), 1.9, { type: 'pickup', k, label: `Pegar — ${k.def.label}` });
    for (const it of this.data.interactables) {
      if (this.hiddenInteractable(it) || this.script.hideInteractable?.(this, it)) continue;
      consider(dist(p.x, p.z, it.pos[0], it.pos[1]), it.r, { type: it.kind, it, label: this.script.interactLabel?.(this, it) ?? it.label });
    }
    for (const t of this.data.terminals) consider(dist(p.x, p.z, t.pos[0], t.pos[1]), 2.3, { type: 'terminal', t, label: `Usar ${t.name}` });
    return best;
  }
  interactions(dt, simMs, inp) {
    const g = this.g, p = g.player, key = keyLabel(g.settings.bindings.interact);
    if (p.dead || p.dodging) { g.hud.setPrompt(null); this.holdMs = 0; return; }
    const n = this.nearest(p); this.promptTarget = n;
    if (!n) { g.hud.setPrompt(null); this.holdMs = Math.max(0, this.holdMs - dt * 2000); return; }
    if (n.type === 'terminal') this.tutorial('tut_terminal');
    if (n.type === 'heavy_lever' || n.type === 'breakable') {
      const id = this.g.save.playerId;
      if (!canUseInteraction(id, n.type)) { this.holdMs = 0; g.hud.setPrompt('Precisa da força de Caio'); return; }
      if (n.type === 'breakable') { g.hud.setPrompt(`${n.label} — golpe de impacto`); return; }
    }
    const hi = n.type === 'heavy_lever' ? { holdMs: n.it.holdMs ?? 1500, onDone: () => this.completeLever(n) } : this.script.holdInteraction?.(this, n);
    if (hi) {
      const hold = hi.holdMs;
      if (inp.interactHeld && !p.using) {
        this.holdMs += dt * 1000;
        if (this.g.lastDamageAt > simMs - 120) this.holdMs = 0;
        if (this.holdMs >= hold) { this.holdMs = 0; hi.onDone(); }
      } else this.holdMs = Math.max(0, this.holdMs - dt * 1500);
      g.hud.setPrompt(`<kbd>${key}</kbd> (segure) ${n.label}`, this.holdMs / hold); return;
    }
    g.hud.setPrompt(`<kbd>${key}</kbd> ${n.label}`);
    if (!inp.interactPressed) return;
    if (n.type === 'pickup') this.collect(n.k);
    else if (n.type === 'terminal') g.openTerminal(n.t);
    else this.script.onInteract?.(this, n);
  }

  completeLever(n) {
    const g = this.g; if (n.it.flag) this.flag(n.it.flag);
    g.audio.play('gate'); g.hud.toast(n.it.doneText ?? 'Alavanca acionada.', 'good');
    this.script.onInteract?.(this, n);
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
      if (!r) taken = false; else { msg = (p.kind === 'secret' ? 'Segredo encontrado: Abrigo do topógrafo. ' : 'Cache encontrado. ') + r.summary.join(' · '); g.stats.secretsFound++; if (p.kind === 'secret') discover(save, 'SEC_01'); for (const w of Object.keys(inv.ammoReserve)) capAmmo(w); capCons('medkit'); capCons('hemostatic'); }
    }
    if (!taken) return;
    this.wf.pickedUp.push(p.id); this.pickups = this.pickups.filter((x) => x !== k); this.group.remove(k.mesh);
    g.syncRuntimeFromSave(); g.hud.toast(msg, 'good'); g.audio.play('pickup');
  }
}
export { bestiary, secrets };
