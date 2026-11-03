import * as THREE from 'three';
import data from '../data/chapter02.json';
import lines from '../data/dialogues.json';
import { AI } from '../actors/DinosaurAgent.js';
import { GateTrap } from '../gameplay/GateTrap.js';
import { EconomyLedger } from '../gameplay/EconomyLedger.js';
import { activeInventory, getCharacter } from '../gameplay/Characters.js';
import { WEAPONS } from '../gameplay/GameState.js';
import { hint } from '../gameplay/SecretManager.js';

/**
 * Script do Capítulo 02 — A Ordem de Retirada (Caio), setor `outpost_02`.
 * Lógica pura exportada para testes: `canOpenYard`, `TomasDefense`, `arenaResupply`, `completeTomasDefense`,
 * `chapterState`, `makeGate`, `k1ShouldSpawn`. O resto são hooks do ChapterRuntime.
 */
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const STORY = (save, f) => !!save.storyFlags[f];
const zoneOf = (id) => data.zones.find((z) => z.id === id);
const inZone = (z, x, zz) => dist(x, zz, z.pos[0], z.pos[1]) <= z.r;
const encOf = (id) => data.encounters.find((e) => e.id === id);

// ---------------------------------------------------------------- lógica pura
/** Estado local do capítulo no save (persistentWorldFlags.chapter.ch02). */
export function chapterState(save) {
  const c = save.persistentWorldFlags.chapter ??= {};
  return (c.ch02 ??= { gate: null, roarSpawned: false });
}
/** O portão do pátio só abre com o cercado K-1 trancado (nunca bloqueia: o painel explica e o jogador volta depois). */
export const canOpenYard = (save) => STORY(save, 'gate_k1_locked');
/** A emboscada do rádio só fica armada após restabelecer a comunicação. */
export const adminHunterShouldTrigger = (save) => STORY(save, 'radio_online') && !STORY(save, 'ch02_admin_hunter_triggered') && !(save.persistentWorldFlags.defeatedEnemies ?? []).includes('r4j_admin');
/** O K-1 existe a partir de `tomas_found` até ser derrotado; cada (re)carga cria um agente novo (vida cheia). */
export const k1ShouldSpawn = (save) => STORY(save, 'tomas_found') && !save.persistentWorldFlags.defeatedEnemies.includes('k1');

const GZ = zoneOf('gate_zone');
/** Portão de carga da arena (design §6): 30 % do HP máx. + atordoado 3,5 s; recarga 20 s. */
export const makeGate = () => new GateTrap({ zone: { x: GZ.pos[0], z: GZ.pos[1], r: GZ.r }, rechargeMs: 20000, damageFrac: 0.3, stunMs: 3500 });

/**
 * Defesa de Tomás: ele destrava a porta do arquivo por `durationMs`; juvenis surgem em `spawnAtMs` (tempo decorrido).
 * Se a ameaça mais próxima estiver a ≤ `threatR` de Tomás, ele recua e o contador pausa (nunca falha).
 */
export class TomasDefense {
  constructor({ durationMs = 25000, threatR = 1.5, spawnAtMs = [1500, 6500, 12000] } = {}) {
    this.durationMs = durationMs; this.threatR = threatR; this.spawnAtMs = spawnAtMs;
    this.progressMs = 0; this.elapsedMs = 0; this.spawned = 0; this.paused = false; this.done = false;
  }
  get frac() { return Math.min(1, this.progressMs / this.durationMs); }
  /** @returns {{spawn:number, paused:boolean, done:boolean, justDone:boolean}} */
  step(dtMs, threatDist = Infinity) {
    if (this.done) return { spawn: 0, paused: false, done: true, justDone: false };
    this.elapsedMs += dtMs;
    this.paused = threatDist <= this.threatR;
    if (!this.paused) this.progressMs = Math.min(this.durationMs, this.progressMs + dtMs);
    let spawn = 0;
    while (this.spawned < this.spawnAtMs.length && this.elapsedMs >= this.spawnAtMs[this.spawned]) { this.spawned++; spawn++; }
    if (this.progressMs >= this.durationMs) {          // garante que os 3 juvenis apareçam mesmo num fim antecipado
      spawn += this.spawnAtMs.length - this.spawned; this.spawned = this.spawnAtMs.length;
      this.done = true; return { spawn, paused: false, done: true, justDone: true };
    }
    return { spawn, paused: this.paused, done: false, justDone: false };
  }
}

export const RESUPPLY = Object.freeze({ everyMs: 40000, amount: 6, below: 6 });
/** Caixas de munição da arena: +6 cartuchos se (reserva + pente) < 6 e ≥ 40 s desde o último uso de QUALQUER caixa (estado compartilhado `box.lastAt`: no máx. +6 a cada 40 s no total). */
export function arenaResupply(simMs, inv, box = {}) {
  const sg = inv.weapons?.shotgun; if (!sg) return 0;
  const have = (inv.ammoReserve.shotgun ?? 0) + (sg.mag ?? 0);
  if (have >= RESUPPLY.below) return 0;
  if (box.lastAt != null && simMs - box.lastAt < RESUPPLY.everyMs) return 0;
  inv.ammoReserve.shotgun = Math.min(WEAPONS.shotgun?.reserveCap ?? 999, (inv.ammoReserve.shotgun ?? 0) + RESUPPLY.amount);
  box.lastAt = simMs;
  return RESUPPLY.amount;
}

export const RESCUE_CC = 300;
/**
 * Conclusão da defesa (pura, sobre o save): flags, resgate, recompensa idempotente (chave por runId) e
 * checkpoint `pre_k1`. O portão volta "pronto" no estado do capítulo. Chamar de novo não paga de novo.
 */
export function completeTomasDefense(save) {
  save.storyFlags.tomas_found = true; save.rescueFlags.tomas = true;
  const l = new EconomyLedger(save.economyLedger);
  l.credit(`${save.runId}|rescue|tomas`, RESCUE_CC);
  save.economyLedger = l.serialize(); save.credits = l.credits;
  const c = chapterState(save); c.gate = null; c.roarSpawned = false;
  save.checkpointId = 'pre_k1'; save.checkpoint = { pos: [...data.preK1.pos], yaw: data.preK1.yaw };
  return save;
}

/** Checkpoint automático ao abrir o portão do pátio (pura, idempotente): morrer na defesa volta para cá, não ao início. */
export function markYardCheckpoint(save) {
  save.checkpointId = 'yard_open'; save.checkpoint = { pos: [...data.yardCheckpoint.pos], yaw: data.yardCheckpoint.yaw };
  return save;
}

/** Cópia do save para checkpoints automáticos (yard_open, pre_k1): vida do ativo ≥ 50 % do máx. e sem sangramento — o jogador vivo não é tocado. */
export function retrySnapshot(save) {
  const s = structuredClone(save), id = s.playerId, max = getCharacter(id).maxHp;
  s.health[id] = Math.max(s.health[id] ?? 0, Math.ceil(max * 0.5)); s.bleeding[id] = false;
  return s;
}

// ---------------------------------------------------------------- spawns fora da visão
function visibleFromCamera(g, x, z) {
  const yawC = g.camera.yaw, hfov = 2 * Math.atan(Math.tan((g.camera.fov * Math.PI) / 360) * g.camera.aspect);
  const ang = Math.abs(((Math.atan2(-(x - g.camera.pos.x), -(z - g.camera.pos.z)) - yawC + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  if (ang >= hfov / 2 + 0.25) return false;
  return !g.world.segmentBlocked(g.camera.pos.x, g.camera.pos.y, g.camera.pos.z, x, 1.0, z, 'bullet');
}
/** Escolhe um ponto marcado fora da visão (ou, com `force`, o mais distante do jogador). */
function pickSpawn(g, cands, { force = false, r = 0.7, minDist = 6 } = {}) {
  const p = g.player;
  const list = cands.map((c) => ({ x: c[0], z: c[1], d: dist(p.x, p.z, c[0], c[1]) })).filter((c) => !g.world.blockedAt(c.x, c.z, r));
  list.sort((a, b) => b.d - a.d);
  const hidden = list.find((c) => c.d >= minDist && !visibleFromCamera(g, c.x, c.z));
  return hidden ?? (force ? list[0] ?? null : null);
}
function spawnAt(rt, enc, def, pt, target) {
  const a = rt.g.spawnAgent({ ...def, pos: [pt.x, pt.z], patrol: [] }, enc.id);
  a.noiseTarget = { x: target.x, z: target.z }; a.setState(AI.INVESTIGATE);
  return a;
}
const liveById = (g, id) => g.liveAgents().find((a) => a.id === id);
const tomasPos = () => ({ x: data.tomas.pos[0], z: data.tomas.pos[1] });

// ---------------------------------------------------------------- eventos do capítulo
function restoreGenerator(rt) {
  const g = rt.g;
  rt.flag('outpost_generator'); g.props.setPowered(true); g.audio.play('beacon'); g.camera.shake(0.6);
  g.dialogue.play('ch02_generator');
  const enc = encOf('ch02_generator'), door = { x: 15, z: 12 };
  for (const e of enc.enemies) if (!rt.wf.defeatedEnemies.includes(e.id) && !liveById(g, e.id)) spawnAt(rt, enc, e, { x: e.pos[0], z: e.pos[1] }, door);
  g.audio.play('roar', 4, 22);
}
function radioOnline(rt) {
  const g = rt.g;
  rt.flag('radio_online'); g.audio.play('beacon'); g.props.setRadio(true);
  g.dialogue.play('ch02_withdrawal_order'); g.dialogue.play('ch02_reis_argument');
  g.hud.toast('Origem da ordem no terminal: SEG-CORP — canal de segurança corporativa, não o resgate.', 'warn');
}
function startDefense(rt) {
  const g = rt.g;
  rt.defense = new TomasDefense(); rt.defQueue = 0; rt.defIdx = 0;
  g.dialogue.play('ch02_tomas_meet'); g.audio.play('ui');
  g.hud.toast('Proteja Tomás enquanto ele destrava a porta do arquivo (25 s).', 'warn');
}
function finishDefense(rt) {
  const g = rt.g, save = g.save;
  g.syncSaveFromRuntime(); completeTomasDefense(save); g.syncRuntimeFromSave();
  rt.defense = null; rt.defQueue = 0;
  g.props.setLeaf('archive_door_leaf', true); g.world.setEnabled('archive_door_leaf', false); g.props.setTomas({ retreat: false, working: false });
  g.audio.play('gate'); g.hud.toast(`Tomás destravou o arquivo. Sobrevivente protegido (+${RESCUE_CC} CC).`, 'good'); rt.revealArea('archive_door_opened');
  rt.gate = makeGate();
  g.checkpointSnap = JSON.stringify(retrySnapshot(g._snapshotForCheckpoint()));           // checkpoint automático pre_k1
  g.hud.toast('Checkpoint: antes do K-1.', 'good');
  rt.k1At = g.simMs + 3000;
}
function spawnK1(rt, force) {
  const g = rt.g, enc = encOf('ch02_k1'), def = enc.enemies[0];
  if (liveById(g, def.id)) return true;
  const pt = pickSpawn(g, def.spawnCandidates, { force, r: 1.3, minDist: 8 });
  if (!pt) return false;
  spawnAt(rt, enc, def, pt, { x: g.player.x, z: g.player.z });
  g.audio.play('roar', pt.x, pt.z); g.camera.shake(1.2);
  g.dialogue.play('ch02_k1_arrives'); rt.tutorial('tut_gate');
  return true;
}
function spawnRoarJuvenile(rt, force) {
  const g = rt.g, enc = encOf('ch02_k1_roar'), def = enc.enemies[0];
  if (rt.wf.defeatedEnemies.includes(def.id) || liveById(g, def.id)) return true;
  const pt = pickSpawn(g, def.spawnCandidates, { force, minDist: 8 });
  if (!pt) return false;
  spawnAt(rt, enc, def, pt, { x: g.player.x, z: g.player.z });
  return true;
}
function spawnAdminHunter(rt) {
  const g = rt.g, enc = encOf('ch02_admin_hunter'), def = enc.enemies[0];
  if (rt.wf.defeatedEnemies.includes(def.id) || liveById(g, def.id)) {
    rt.flag('ch02_admin_hunter_triggered'); return true;
  }
  // Nunca força um ponto na câmera: a ameaça espera o jogador desviar o olhar.
  const pt = pickSpawn(g, def.spawnCandidates, { minDist: 5 });
  if (!pt) return false;
  spawnAt(rt, enc, def, pt, { x: g.player.x, z: g.player.z });
  rt.flag('ch02_admin_hunter_triggered');
  g.audio.play('roar', pt.x, pt.z);
  g.hud.toast('O som do rádio atraiu um predador ao corredor!', 'warn');
  return true;
}
function onRoar(rt) {
  const g = rt.g, c = chapterState(g.save);
  if (g.chapter !== rt || c.roarSpawned) return;
  c.roarSpawned = true; rt.roarPendingSince = g.simMs;            // exatamente 1 R-4J, de um ponto marcado fora da visão
  g.hud.toast('O K-1 rugiu — algo responde do outro lado do muro.', 'warn');
}
function spawnDefenseJuvenile(rt, force) {
  const g = rt.g, enc = encOf('ch02_tomas_defense');
  const def = enc.enemies.find((e) => !rt.wf.defeatedEnemies.includes(e.id) && !liveById(g, e.id) && !(rt.defSpawned ??= new Set()).has(e.id));
  if (!def) return true;
  const pt = pickSpawn(g, def.spawnCandidates, { force, minDist: 7 });
  if (!pt) return false;
  spawnAt(rt, enc, def, pt, tomasPos()); rt.defSpawned.add(def.id);
  return true;
}
function useGate(rt) {
  const g = rt.g, simMs = g.simMs, k1 = liveById(g, 'k1');
  const r = rt.gate.trigger(simMs, k1, g.aiCtx());
  chapterState(g.save).gate = rt.gate.serialize(simMs);
  if (r.reason === 'recharging') { g.audio.play('deny'); g.hud.toast('Portão de carga recarregando.', 'warn'); return; }
  g.props.dropGate(); g.audio.play('gate'); g.camera.shake(r.hit ? 1.6 : 0.7);
  g.hud.toast(r.hit ? 'O portão caiu em cheio sobre o K-1!' : 'O portão caiu no vazio — recarregando (20 s).', r.hit ? 'good' : 'warn');
}
function useAmmoBox(rt, it) {   // `it` ignorado de propósito: as duas caixas dividem o mesmo relógio
  const g = rt.g, inv = activeInventory(g.save), box = rt.box;
  g.syncSaveFromRuntime();
  const n = arenaResupply(g.simMs, inv, box);
  if (!n) { g.audio.play('deny'); g.hud.toast(ammoBoxLabel(rt, it), 'warn'); return; }
  g.syncRuntimeFromSave(); g.audio.play('pickup'); g.hud.toast(`+${n} cartuchos de escopeta`, 'good');
}
function ammoBoxLabel(rt, it) {
  const g = rt.g, box = rt.box, p = g.player;
  const sgHave = p.weaponId === 'shotgun' ? p.mag + p.reserve : p.stash?.shotgun ? p.stash.shotgun.mag + p.stash.shotgun.reserve : 0;
  if (sgHave >= RESUPPLY.below) return 'Caixa de munição — você já tem 6 ou mais cartuchos';
  if (box.lastAt != null && g.simMs - box.lastAt < RESUPPLY.everyMs) return `Caixa de munição — reabastece em ${Math.ceil((RESUPPLY.everyMs - (g.simMs - box.lastAt)) / 1000)} s`;
  return 'Pegar cartuchos da caixa de munição';
}
function gateLabel(rt) {
  const g = rt.g, st = rt.gate.state(g.simMs);
  if (!st.ready) return `Portão de carga — recarregando (${Math.ceil(rt.gate.remainingMs(g.simMs) / 1000)} s)`;
  return rt.gate.inZone(liveById(g, 'k1')) ? 'Soltar portão — K-1 na zona' : 'Soltar portão — K-1 fora da zona';
}

// ---------------------------------------------------------------- props do cenário
const lm = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const bm = (color) => new THREE.MeshBasicMaterial({ color });

function buildProps({ scene, data: d, scenery }) {
  const group = new THREE.Group(); (scenery?.group ?? scene).add(group);
  const meshOf = (id) => scenery?.meshes.get(id);
  const updaters = [];
  const steel = lm(0x4e575c), dark = lm(0x2a2f31);

  // sinalizadores vermelhos da equipe perdida (abertura)
  const flareMat = bm(0xff3a2a);
  for (const [x, z] of d.flares ?? []) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 5), flareMat); f.rotation.z = Math.PI / 2; f.rotation.y = (x * 7 + z) % 3; f.position.set(x, 0.05, z); group.add(f);
  }
  const fl = (d.flares ?? [])[0];
  const flareLight = new THREE.PointLight(0xff3a2a, 6, 9); if (fl) flareLight.position.set(fl[0] + 0.5, 0.5, fl[1] - 1.5); group.add(flareLight);
  updaters.push((t) => { flareLight.intensity = 4 + Math.sin(t * 17) * 1.2 + Math.sin(t * 5.3) * 0.8; });

  // postes de luz (acendem com o gerador)
  const lampHeads = [], lampOff = 0x2b2a24, lampOn = 0xffe2a0;
  for (const [x, z] of d.lamps ?? []) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6), dark); post.position.set(x, 2.1, z); group.add(post);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), bm(lampOff)); head.position.set(x, 4.25, z); group.add(head); lampHeads.push(head);
  }
  const courtLight = new THREE.PointLight(0xffe2a0, 0, 26); courtLight.position.set(0, 5, 8); group.add(courtLight);
  const yardLight = new THREE.PointLight(0xffe2a0, 0, 26); yardLight.position.set(0, 5.5, -15); group.add(yardLight);

  // folhas de portão (sobem ao abrir)
  const leaves = {};
  for (const id of ['yard_gate_leaf', 'archive_door_leaf', 'exit_gate', 'pen_chute']) {
    const m = meshOf(id); if (!m) continue;
    leaves[id] = { m, base: m.position.y, target: 0 };
    if (id !== 'archive_door_leaf') for (let i = -1; i <= 1; i += 2) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.8, 0.05), lm(0xb08c22)); st.position.set(i * 0.9, 0, (m.geometry.parameters.depth ?? 0.6) / 2 + 0.03); st.rotation.z = 0.5; if (id === 'exit_gate' || id === 'pen_chute') { st.rotation.y = Math.PI / 2; st.position.set((m.geometry.parameters.width ?? 0.6) / 2 + 0.03, 0, i * 0.9); } m.add(st); }
  }
  updaters.push((t, dt) => { for (const L of Object.values(leaves)) L.m.position.y += (L.base + L.target - L.m.position.y) * Math.min(1, dt * 1.8); });

  // luzes dos painéis: cercado, portão do pátio, portão de carga
  const panelLamp = (id) => { const m = meshOf(id); if (!m) return null; const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), bm(0xd92d2d)); l.position.set(0, 0.72, 0); m.add(l); return l; };
  const penLamp = panelLamp('pen_lock_panel'), yardLamp = panelLamp('yard_gate_panel'), gateLamp = panelLamp('gate_drop_panel');

  // portão de carga: moldura + folha pesada que cai sobre a baia
  const gz = d.zones.find((z) => z.id === 'gate_zone');
  const frame = new THREE.Group(); frame.position.set(gz.pos[0], 0, gz.pos[1]); group.add(frame);
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.2, 0.35), steel); p.position.set(sx * 3.2, 3.1, 0); frame.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.45, 0.5), steel); beam.position.y = 6.3; frame.add(beam);
  const gateLeaf = new THREE.Mesh(new THREE.BoxGeometry(6.0, 2.6, 0.45), lm(0x6a7176)); gateLeaf.castShadow = true; frame.add(gateLeaf);
  for (let i = -2; i <= 2; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.6, 0.05), lm(0xb08c22)); st.position.set(i * 1.2, 0, 0.25); st.rotation.z = 0.5; gateLeaf.add(st); }
  const UP = 4.7, DOWN = 1.3; gateLeaf.position.y = UP;
  const drop = { t: -1 };
  updaters.push((t, dt) => {
    if (drop.t < 0) return;
    drop.t += dt; const k = drop.t;
    gateLeaf.position.y = k < 0.22 ? UP - (UP - DOWN) * (k / 0.22) ** 2 : k < 1.6 ? DOWN : Math.min(UP, DOWN + (k - 1.6) * 0.9);
    if (gateLeaf.position.y >= UP) drop.t = -1;
  });

  // Tomás (figura simples, macacão laranja de manutenção)
  const tomas = new THREE.Group(); group.add(tomas);
  const suit = lm(0xc0652a), skin = lm(0x9a6a4a);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.85, 0.26), suit); legs.position.y = 0.43; tomas.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.3), suit); torso.position.y = 1.16; tomas.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), skin); head.position.y = 1.62; tomas.add(head);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), suit); arm.position.set(0.3, 1.2, -0.15); arm.rotation.x = -0.9; tomas.add(arm);
  const T = { x: d.tomas.pos[0], z: d.tomas.pos[1], tx: d.tomas.pos[0], tz: d.tomas.pos[1], working: false };
  tomas.position.set(T.x, 0, T.z); tomas.rotation.y = Math.PI;      // de frente para a porta (norte)
  updaters.push((t, dt) => {
    T.x += (T.tx - T.x) * Math.min(1, dt * 4); T.z += (T.tz - T.z) * Math.min(1, dt * 4); tomas.position.set(T.x, 0, T.z);
    arm.rotation.x = T.working ? -0.9 + Math.sin(t * 9) * 0.25 : -0.2;
  });

  // pista do BIO_03: luminária de mesa acesa no arquivo
  const desk = d.structures.find((s) => s.id === 'archive_desk');
  if (desk) {
    const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 8, 1, true), bm(0xfff0b0)); lamp.position.set(desk.pos[0] - 0.3, 0.98, desk.pos[1]); lamp.rotation.x = Math.PI; group.add(lamp);
    const dl = new THREE.PointLight(0xffe7a0, 3, 5); dl.position.set(desk.pos[0] - 0.3, 1.3, desk.pos[1]); group.add(dl);
  }
  // pista do CACHE_02: porta da cabine entreaberta
  const cab = d.structures.find((s) => s.id === 'truck_cab');
  if (cab) { const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.06), lm(0x5b6b4a)); door.position.set(cab.pos[0] + 0.5, 1.5, cab.pos[1] + cab.size[2] / 2 + 0.45); door.rotation.y = -0.9; group.add(door); }
  // LED do rádio (âmbar → verde)
  const rc = meshOf('radio_console'); let radioLed = null;
  if (rc) { radioLed = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.3), bm(0x5a3a10)); radioLed.position.set(0.46, 0.3, 0); rc.add(radioLed); }

  return {
    group, leaves, gateLeaf, tomas,
    setPowered(on) {
      for (const h of lampHeads) h.material.color.setHex(on ? lampOn : lampOff);
      courtLight.intensity = on ? 22 : 0; yardLight.intensity = on ? 26 : 0;
      if (radioLed && !this._radio) radioLed.material.color.setHex(on ? 0xffb347 : 0x5a3a10);
      if (yardLamp && !this._yard) yardLamp.material.color.setHex(on ? 0xffb347 : 0xd92d2d);
    },
    setRadio(on) { this._radio = on; if (radioLed && on) radioLed.material.color.setHex(0x38e07a); },
    setPenLocked(on, instant) { penLamp?.material.color.setHex(on ? 0x38e07a : 0xd92d2d); this.setLeaf('pen_chute', !on, instant, 1.1); },
    setLeaf(id, open, instant, up = 3.6) { const L = leaves[id]; if (!L) return; L.target = open ? up : 0; if (instant) L.m.position.y = L.base + L.target; if (id === 'yard_gate_leaf') { this._yard = open; yardLamp?.material.color.setHex(open ? 0x38e07a : 0xffb347); } },
    dropGate() { drop.t = 0; },
    setGatePanel(st, live) { if (gateLamp) gateLamp.material.color.setHex(!live ? 0x333333 : st.ready ? 0x38e07a : 0xffb347); },
    setTomas({ retreat = false, working = false, visible = true, at = null, instant = false } = {}) {
      tomas.visible = visible; T.working = working;
      const p = at ?? (retreat ? d.tomas.retreat : d.tomas.pos); T.tx = p[0]; T.tz = p[1];
      if (instant) { T.x = p[0]; T.z = p[1]; tomas.position.set(T.x, 0, T.z); }
    },
    update(dt, t = 0) { for (const u of updaters) u(t, dt); },
    dispose() { (scenery?.group ?? scene).remove(group); group.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => m.dispose?.()); }); },
  };
}

// ---------------------------------------------------------------- cutscenes
const dlgSec = (id) => (lines[id] ?? []).reduce((s, l) => s + l.ms, 0) / 1000;
const sstep = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const mix = (a, b, k) => a + (b - a) * k;
/** Foco da câmera na abertura: portão trancado por dentro → sinalizadores vermelhos → Caio na brecha. */
export function introShot(t, dur) {
  const [sx, sz] = data.spawn.pos, fl = data.flares[0], k1 = sstep(0.28 * dur, 0.5 * dur, t), k2 = sstep(0.62 * dur, 0.84 * dur, t);
  const pos = [mix(-3, 5, k1) + t * 0.02, mix(1.8, 1.5, k1), mix(38, 37, k1)];
  const tgt = [mix(mix(0, fl[0], k1), sx, k2), mix(mix(2.3, 0.3, k1), 1.2, k2), mix(mix(28, fl[1], k1), sz, k2)];
  return { pos, tgt };
}
const cutscenes = {
  intro: {
    dur: dlgSec('ch02_intro_radio') + 0.6,
    start(g) { g.dialogue.play('ch02_intro_radio'); g.player.teleport(data.spawn.pos[0], data.spawn.pos[1], data.spawn.yaw); g.playerView.root.visible = true; },
    update(g, c, dt) {
      const cam = g.threeCam, s = introShot(c.t, c.dur);
      cam.position.set(...s.pos); cam.lookAt(...s.tgt); cam.fov = 62; cam.updateProjectionMatrix();
      g.playerView.sync(1, dt, 1);
    },
  },
  ending: {
    dur: dlgSec('ch02_noite_branca') + 0.8,
    start(g) {
      const [ex, ez] = data.exitCheckpoint.pos;
      g.props.setTomas({ at: [ex - 1.6, ez + 0.4], instant: true, working: false });
      g.player.teleport(ex, ez, data.exitCheckpoint.yaw); g.playerView.root.visible = true;
      g.dialogue.play('ch02_noite_branca');
    },
    update(g, c, dt) {
      const cam = g.threeCam, [ex, ez] = data.exitCheckpoint.pos, a = 0.9 + c.t * 0.05, r = 6.2 - c.t * 0.04;
      cam.position.set(ex - 0.8 + Math.cos(a) * r, 1.7 + c.t * 0.01, ez + 0.4 + Math.sin(a) * r); cam.lookAt(ex - 0.8, 1.45, ez + 0.4); cam.fov = 58; cam.updateProjectionMatrix();
      g.playerView.sync(1, dt, 1);
    },
  },
};

// ---------------------------------------------------------------- hooks
const ROOFS = { admin_roof: [-28, 4, -12, 18], shed_roof: [16, 6, 28, 18], archive_roof: [3.5, -38, 22, -30] };

export default {
  buildProps, cutscenes,
  introToast: 'Capítulo 02 — A Ordem de Retirada',
  deathHint: 'Dica: o K-1 não corrige a investida depois de arrancar — esquive de lado e deixe-o bater na parede ou na baia do portão de carga. Atordoado, a cabeça fica baixa e exposta.',
  forceFade: (g, id) => { const r = ROOFS[id]; return !!r && g.player.x > r[0] && g.player.x < r[2] && g.player.z > r[1] && g.player.z < r[3]; },

  onEncounter(rt, enc, alive) {
    const g = rt.g, save = g.save;
    switch (enc.id) {
      // A primeira ameaça entra quando Caio cruza a brecha, e não durante a cena de abertura.
      case 'ch02_court_r4': return !STORY(save, 'ch02_breach_entered');
      case 'ch02_admin_hunter':
        if (STORY(save, 'ch02_admin_hunter_triggered')) {
          for (const e of alive) {
            const pt = pickSpawn(g, e.spawnCandidates, { force: true, minDist: 5 });
            if (pt) spawnAt(rt, enc, e, pt, { x: g.player.x, z: g.player.z });
          }
        }
        return true;
      case 'ch02_generator': return !STORY(save, 'outpost_generator');             // surgem no ponto original após o gerador
      case 'ch02_tomas_defense':
        // só a defesa cria os juvenis; se a defesa terminou com sobreviventes, eles voltam pelos pontos marcados
        if (STORY(save, 'tomas_found')) for (const e of alive) { const pt = pickSpawn(g, e.spawnCandidates, { force: true }); if (pt) spawnAt(rt, enc, e, pt, tomasPos()); }
        return true;
      case 'ch02_k1': case 'ch02_k1_roar': return true;                              // surgem pelo step (onLoad agenda)
      default: return false;
    }
  },
  onLoad(rt) {
    const g = rt.g, save = g.save, c = chapterState(save);
    rt.gate = makeGate(); rt.gate.restore(c.gate, g.simMs);
    rt.defense = null; rt.defQueue = 0; rt.defSpawned = new Set(); rt.box = {};
    rt.adminAmbushAt = null;
    rt.k1At = k1ShouldSpawn(save) ? 0 : null; rt.k1Since = null;                 // retry: agente novo ⇒ vida cheia
    rt.roarPendingSince = c.roarSpawned && !rt.wf.defeatedEnemies.includes('r4j_roar') ? 0 : null;
    const P = g.props;
    P.setPowered(STORY(save, 'outpost_generator')); P.setRadio(STORY(save, 'radio_online'));
    P.setPenLocked(STORY(save, 'gate_k1_locked'), true);
    for (const [id, flag] of [['yard_gate_leaf', 'yard_open'], ['archive_door_leaf', 'tomas_found'], ['exit_gate', 'k1_defeated']]) {
      const open = STORY(save, flag); P.setLeaf(id, open, true); g.world.setEnabled(id, !open);
    }
    P.setTomas({ working: false });
    rt._offRoar?.(); rt._offRoar = g.bus.on('k1Roar', () => onRoar(rt));
  },
  onDispose(rt) { rt._offRoar?.(); rt._offRoar = null; },

  step(rt, dt, simMs) {
    const g = rt.g, save = g.save;
    if (simMs > 1500) rt.tutorial('tut_shotgun');
    if (rt.promptTarget?.type === 'heavy_lever') rt.tutorial('tut_lever');
    if (rt.adminAmbushAt != null && simMs >= rt.adminAmbushAt && spawnAdminHunter(rt)) rt.adminAmbushAt = null;
    // defesa de Tomás
    if (rt.defense) {
      let near = Infinity; const tp = tomasPos();
      for (const a of g.liveAgents()) near = Math.min(near, dist(a.x, a.z, tp.x, tp.z));
      const r = rt.defense.step(dt * 1000, near);
      rt.defQueue += r.spawn;
      while (rt.defQueue > 0 && spawnDefenseJuvenile(rt, r.done)) rt.defQueue--;
      // juvenis da defesa que não perseguem o jogador voltam a mirar Tomás
      for (const a of g.liveAgents()) if (a.encounterId === 'ch02_tomas_defense' && [AI.IDLE, AI.PATROL, AI.SEARCH].includes(a.state)) { a.noiseTarget = tp; a.setState(AI.INVESTIGATE); }
      g.props.setTomas({ retreat: r.paused, working: !r.paused });
      if (r.justDone) finishDefense(rt);
    }
    // K-1 invade o pátio (ponto marcado fora da visão; depois de 4 s aceita o mais distante)
    if (rt.k1At != null && simMs >= rt.k1At && k1ShouldSpawn(save)) {
      if (rt.k1Since == null) rt.k1Since = simMs;
      if (spawnK1(rt, simMs - rt.k1Since > 4000)) { rt.k1At = null; rt.k1Since = null; }
    }
    if (rt.roarPendingSince != null && spawnRoarJuvenile(rt, simMs - rt.roarPendingSince > 3000)) rt.roarPendingSince = null;
    // vitória sobre o K-1
    if (!STORY(save, 'k1_defeated') && save.persistentWorldFlags.defeatedEnemies.includes('k1')) {
      rt.flag('k1_defeated'); g.props.setLeaf('exit_gate', true); g.world.setEnabled('exit_gate', false);
      g.audio.play('gate'); g.hud.toast('K-1 neutralizado. O portão de serviço norte foi liberado.', 'good'); rt.revealArea('exit_gate_opened');
    }
    // painel do portão de carga: luz pronto/carregando; recarga restante gravada no estado do capítulo
    const live = STORY(save, 'tomas_found') && !STORY(save, 'k1_defeated') && STORY(save, 'outpost_generator');
    const st = rt.gate.state(simMs); g.props.setGatePanel(st, live);
    if (!st.ready) chapterState(save).gate = rt.gate.serialize(simMs);
    else if (chapterState(save).gate) chapterState(save).gate = null;
  },
  objectiveStatus(rt) {
    if (rt.defense) return rt.defense.paused ? 'Tomás recuou — afaste o juvenil!' : `Tomás destravando: ${Math.floor(rt.defense.progressMs / 1000)}/25 s`;
    const s = rt.g.save;
    if (STORY(s, 'tomas_found') && !STORY(s, 'k1_defeated') && rt.gate) { const st = rt.gate.state(rt.g.simMs); return st.ready ? 'Portão de carga: pronto' : `Portão de carga: ${Math.ceil(rt.gate.remainingMs(rt.g.simMs) / 1000)} s`; }
    return null;
  },
  onZoneEnter(rt, z) {
    const g = rt.g, save = g.save, c = chapterState(save);
    switch (z.id) {
      case 'breach':
        if (!STORY(save, 'ch02_breach_entered')) {
          rt.flag('ch02_breach_entered');
          const enc = encOf('ch02_court_r4'), def = enc.enemies[0];
          if (!rt.wf.defeatedEnemies.includes(def.id) && !liveById(g, def.id)) {
            spawnAt(rt, enc, def, { x: def.pos[0], z: def.pos[1] }, { x: g.player.x, z: g.player.z });
            g.audio.play('roar', def.pos[0], def.pos[1]);
            g.hud.toast('Algo se moveu no pátio de serviço.', 'warn');
          }
        }
        break;
      case 'admin_corridor':
        if (adminHunterShouldTrigger(save) && rt.adminAmbushAt == null) {
          rt.adminAmbushAt = g.simMs + 1100;
          g.audio.play('creak', -20, 11);
          g.hud.toast('Passos ecoam atrás da parede do rádio…', 'warn');
        }
        break;
      case 'generator_shed': if (!(rt.wf.broken ?? []).includes('crates_shed')) rt.tutorial('tut_impact'); break;
      case 'truck': if (!c.truckHint) { c.truckHint = true; hint(save, 'CACHE_02'); g.hud.toast('Marcas de pneu saem da estrada — e a porta da cabine do caminhão está entreaberta.', 'warn'); } break;
      default: break;
    }
  },
  hideInteractable(rt, it) {
    const s = rt.g.save;
    switch (it.kind) {
      case 'radio_console': return STORY(s, 'radio_online');
      case 'pen_lock': return STORY(s, 'gate_k1_locked');
      case 'yard_gate_panel': return STORY(s, 'yard_open');
      case 'archive_door': return !!rt.defense || STORY(s, 'tomas_found');
      case 'gate_drop': return !STORY(s, 'tomas_found') || STORY(s, 'k1_defeated');
      default: return false;
    }
  },
  interactLabel(rt, it) {
    if (it.kind === 'gate_drop' && rt.gate) return gateLabel(rt);
    if (it.kind === 'ammo_box') return ammoBoxLabel(rt, it);
    return null;
  },
  holdInteraction(rt, n) {
    if (n.type !== 'radio_console' || !STORY(rt.g.save, 'outpost_generator')) return null;
    return { holdMs: n.it.holdMs, onDone: () => radioOnline(rt) };
  },
  onInteract(rt, n) {
    const g = rt.g, save = g.save, deny = (msg) => { g.hud.toast(msg, 'warn'); g.audio.play('deny'); };
    switch (n.type) {
      case 'heavy_lever':
        if (STORY(save, 'gen_lever_a') && STORY(save, 'gen_lever_b') && !STORY(save, 'outpost_generator')) restoreGenerator(rt);
        else if (!STORY(save, 'outpost_generator')) g.hud.toast('Falta a outra alavanca.', 'warn');
        return true;
      case 'radio_console': deny('O rádio está sem energia: religue o gerador no galpão leste.'); return true;
      case 'pen_lock':
        if (!STORY(save, 'outpost_generator')) { deny('Painel do cercado sem energia: religue o gerador primeiro.'); return true; }
        rt.flag('gate_k1_locked'); g.props.setPenLocked(true); g.audio.play('gate');
        g.hud.toast('Cercado K-1 trancado. O pátio pode ser aberto sem soltar o que está lá dentro.', 'good');
        return true;
      case 'yard_gate_panel':
        if (!canOpenYard(save)) { deny('Painel recusa: o cercado K-1 ainda se comunica com o pátio. Tranque o cercado (painel a oeste) antes de abrir.'); return true; }
        rt.flag('yard_open'); g.props.setLeaf('yard_gate_leaf', true); g.world.setEnabled('yard_gate_leaf', false); g.audio.play('gate'); rt.revealArea('yard_gate_opened');
        g.syncSaveFromRuntime(); markYardCheckpoint(save); g.syncRuntimeFromSave();
        g.checkpointSnap = JSON.stringify(retrySnapshot(g._snapshotForCheckpoint()));           // checkpoint automático yard_open (antes da defesa de Tomás)
        g.hud.toast('Portão do pátio aberto. Checkpoint: pátio.', 'good');
        return true;
      case 'archive_door': startDefense(rt); return true;
      case 'gate_drop': useGate(rt); return true;
      case 'ammo_box': useAmmoBox(rt, n.it); return true;
      default: return false;
    }
  },
  exitWhen(rt) {
    const p = rt.g.player;
    return STORY(rt.g.save, 'k1_defeated') && inZone(zoneOf('north_service_exit'), p.x, p.z);
  },
  explorationVisited(save) {
    const z = new Set(save.persistentWorldFlags.zonesVisited);
    return ['generator_shed', 'radio_room', 'pen_area', 'yard', 'archive', 'service_road', 'truck'].filter((n) => z.has(n));
  },
};
