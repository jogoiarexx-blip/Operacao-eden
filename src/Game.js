import * as THREE from 'three';
import { createRng } from './core/rng.js';
import { EventBus } from './core/EventBus.js';
import { GameLoop } from './core/GameLoop.js';
import { StateMachine, S } from './core/StateMachine.js';
import { loadSettings, saveSettings, QUALITY } from './core/Settings.js';
import { lerp } from './core/math.js';
import { Input } from './input/Input.js';
import { AudioEngine } from './audio/Audio.js';
import { Hud } from './ui/Hud.js';
import { h } from './ui/dom.js';
import * as Screens from './ui/Screens.js';
import { TerminalUI } from './ui/TerminalUI.js';
import { drawMap } from './ui/MapView.js';
import { Dialogue } from './gameplay/Dialogue.js';
import { ChapterRuntime } from './gameplay/ChapterRuntime.js';
import { getChapter, CHAPTER_IDS } from './chapters/index.js';
import bestiary from './data/bestiary.json';
import rankTargets from './data/rankTargets.json';
import { ShoulderCameraController, forwardVec } from './world/ShoulderCameraController.js';
import { CollisionWorld } from './world/CollisionWorld.js';
import { buildScenery } from './world/SectorScenery.js';
import { FX } from './world/FX.js';
import { Player } from './actors/Player.js';
import { PlayerView } from './actors/PlayerView.js';
import { DinosaurAgent, AttackCoordinator, AI } from './actors/DinosaurAgent.js';
import { CreatureView } from './actors/CreatureView.js';
import { K1Agent, K1 } from './actors/K1Agent.js';
import { resolveShot, reticleState, shouldInterrupt, applyImpact } from './actors/Combat.js';
import { EconomyLedger } from './gameplay/EconomyLedger.js';
import { ComboSystem } from './gameplay/ComboSystem.js';
import { difficulty } from './gameplay/DifficultyManager.js';
import { purchase } from './gameplay/ShopSystem.js';
import { SaveManager } from './gameplay/SaveManager.js';
import { createNewSave, WEAPONS, UTILITY } from './gameplay/GameState.js';
import { activeInventory, getCharacter } from './gameplay/Characters.js';
import { RunStats, scoreChapter } from './gameplay/ScoringSystem.js';
import { RecordBook } from './gameplay/RecordBook.js';
import { CollectibleManager } from './gameplay/SecretManager.js';
import { computeEligibility } from './gameplay/RunRules.js';
import { BenchCollector, BENCH, collectEnv, compareReports } from './benchmark/Benchmark.js';
import { percentile } from './core/math.js';

const $ = (s) => document.querySelector(s);
const BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

/**
 * Game: orquestra loop de passo fixo, estados do app, câmera sobre o ombro, combate, IA, economia, saves, cutscenes e benchmark.
 * Ordem da simulação (GDD 9.9): input → movimento/câmera → IA → tiros/hitbox → dano → neutralizações → ledger/estilo → FX → HUD.
 */
export class Game {
  constructor() {
    this.canvas = $('#game'); this.uiRoot = $('#ui'); this.hudRoot = $('#hud'); this.appEl = $('#app');
    this.settings = loadSettings();
    this.sm = new StateMachine(S.BOOT);
    this.bus = new EventBus();
    this.simMs = 0; this.agents = []; this.noises = []; this.stats = new RunStats(); this.lastDamageAt = -1e9;
    this.txCounter = 0; this.hasSave = false; this.mapOpen = false; this.cine = null; this.bench = null;
    this.debugUsed = false; this.deathAt = null; this.checkpointSnap = null; this.rng = createRng(1234);
    this.tAnim = 0;
  }

  // ---------------------------------------------------------------- inicialização
  async init() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      this.uiRoot.append(h('div.screen.solid', h('div.panel.narrow', h('h2.red', 'WebGL indisponível'), h('p', 'Este jogo precisa de WebGL. Ative a aceleração de hardware ou use um navegador atual.'))));
      throw e;
    }
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0a1719); this.scene.fog = new THREE.Fog(0x0a1719, 8, 80);
    this.threeCam = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 150);
    this.loadChapter(CHAPTER_IDS[0]);
    this.camera = new ShoulderCameraController(this.world);
    this.player = new Player(this.world); this.playerView = new PlayerView(this.player); this.scene.add(this.playerView.root); this.playerView.root.visible = false;
    this.fx = new FX(this.scene);
    this.coordinator = new AttackCoordinator(2);
    this.hud = new Hud(this.hudRoot); this.dialogue = new Dialogue(this.hud);
    this.audio = new AudioEngine();
    this.input = new Input(this.canvas, this.settings);
    this.input.onLockLost = () => { if (this.sm.is(S.PLAYING)) this.pause(); };
    this.saveManager = new SaveManager();
    this.records = await new RecordBook(this.saveManager.adapter).load().catch(() => new RecordBook(this.saveManager.adapter));
    this.profile = (await this.saveManager.loadProfile().catch(() => null)) ?? CollectibleManager.newProfile();
    this.terminalUI = new TerminalUI(this);
    this.ledger = new EconomyLedger(); this.save = null;
    this.diffPreset = { id: 'standard', ...difficulty.get('standard') };
    this.ui = this._makeUi();
    this._wireBus();
    this.applySettings();
    addEventListener('resize', () => this.onResize()); this.onResize();
    document.addEventListener('visibilitychange', () => this.onVisibility());
    addEventListener('blur', () => this.onBlur());
    addEventListener('keydown', (e) => this.onKey(e));
    this.canvas.addEventListener('mousedown', () => { if (this.sm.is(S.PLAYING) && !this.input.locked) this.input.lock(); });
    this.loop = new GameLoop({ step: (dt) => this.step(dt), render: (a, dt) => this.render(a, dt), isRunning: () => this.sm.is(S.PLAYING) });
    await this.refreshHasSave();
    this.sm.go(S.MAIN_MENU); this.ui.menu();
    this.loop.start();
    if (new URLSearchParams(location.search).has('debug')) this._installDebug();
    return this;
  }

  /** Número do capítulo carregado (loja: itens liberados por capítulo). */
  get chapterNumber() { return this.chapterDef?.data.chapter ?? 1; }

  /** Carrega o capítulo `id`: descarta cenário, colisão, props e runtime anteriores e cria os novos. */
  loadChapter(id) {
    if (this.scenery) { this.scene.remove(this.scenery.group); this.props?.dispose?.(); this.scenery.dispose(); }
    this.chapter?.dispose();
    this.chapterId = id; this.chapterDef = getChapter(id);
    const data = this.chapterDef.data, script = this.chapterDef.script;
    this.world = new CollisionWorld(data.bounds);
    this.scenery = buildScenery({ world: this.world, data, quality: this.settings.quality });
    this.scene.add(this.scenery.group);
    this.scenery.onLightning = () => this.audio?.play('thunder');
    this.props = script.buildProps?.({ scene: this.scene, world: this.world, data, quality: this.settings.quality, scenery: this.scenery }) ?? { update() {}, dispose() {} };
    this.scenery.onUpdate = (t, dt) => this.props.update(dt, t);
    if (this.camera) this.camera.world = this.world;
    if (this.player) this.player.world = this.world;
    this.chapter = new ChapterRuntime(this, this.chapterDef);
    if (this.settings && this.audio) this.applySettings();
  }

  _wireBus() {
    const b = this.bus;
    b.on('reward', (r) => { this.hud.feed(r, this.settings.hideStyleFeed); if (r.cc) this.audio.play('ui'); });
    b.on('playerDamaged', (e) => {
      this.hud.damageFlash(); this.audio.play('hurt'); this.stats.damageTaken += e.amount; this.lastDamageAt = this.simMs; this.camera.shake(1.2);
      if (e.bleeding && !this._bleedToldAt) { this._bleedToldAt = this.simMs; this.hud.toast('Você está sangrando — use um hemostático.', 'warn'); }
    });
    b.on('enemyNeutralized', (e) => {
      const wf = this.save.persistentWorldFlags; if (!wf.defeatedEnemies.includes(e.enemyId)) wf.defeatedEnemies.push(e.enemyId);
      const a = this.agents.find((x) => x.agent.id === e.enemyId); this.audio.play('death', a?.agent.x, a?.agent.z);
    });
    b.on('creatureCue', (e) => { if (e.cue === 'spotted') this.audio.play('spotted', e.x, e.z); if (e.cue === 'roar') this.audio.play('roar', e.x, e.z); });
    b.on('windupStart', (e) => { this.audio.play('windup', e.x, e.z); this.chapter.tutorial('tut_dodge'); });
    b.on('chainEnded', () => {});
  }

  // ---------------------------------------------------------------- configurações
  applySettings() {
    const s = this.settings, cam = this.camera;
    cam.sensitivityX = s.sensX; cam.sensitivityY = s.sensY; cam.invertY = s.invertY; cam.fovOffset = s.fovOffset; cam.shakeScale = s.reduceShake ? 0 : 1;
    if (this.save) this.save.cameraSettings = { preferredShoulder: cam.preferredSide, invertY: s.invertY };
    this.audio.setVolumes(s.volMaster, s.volSfx, s.volAmbient);
    this.scenery.setReduceFlash(s.reduceFlash);
    document.body.dataset.subs = s.subtitleSize; document.body.classList.toggle('hc', !!s.highContrastThreat);
    const q = QUALITY[s.quality] ?? QUALITY.medium;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr)); this.renderer.shadowMap.enabled = q.shadows;
    this.scenery.group.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined && this._lastShadows !== q.shadows) o.material.needsUpdate = true; });
    this._lastShadows = q.shadows;
    this.scenery.setQuality(q); this.scene.fog.far = q.fogFar; this.threeCam.far = q.far; this.threeCam.updateProjectionMatrix();
    this.onResize(); saveSettings(s);
  }
  applyRecommendedQuality(preset) { this.settings.quality = preset; this.applySettings(); this.hud.toast(`Gráficos: ${QUALITY[preset].label}`, 'good'); }
  onResize() {
    if (!this.renderer) return;
    this.renderer.setSize(innerWidth, innerHeight, false); this.threeCam.aspect = innerWidth / innerHeight; this.camera.aspect = this.threeCam.aspect; this.threeCam.updateProjectionMatrix();
    if (this.bench?.collector && this.bench.collector.t0 != null) this.bench.collector.invalidate('janela redimensionada durante a coleta');
  }
  onVisibility() {
    if (document.hidden) {
      if (this.sm.is(S.PLAYING)) this.pause();
      if (this.sm.is(S.BENCHMARK)) this.bench?.collector.invalidate('aba oculta ou em segundo plano');
      this.audio.suspend();
    } else if (!this.sm.is(S.PAUSED, S.SHOP)) this.audio.resume();
  }
  onBlur() { if (this.sm.is(S.BENCHMARK) && this.bench?.collector.phase !== 'done') this.bench.collector.invalidate('janela perdeu o foco'); }
  onKey(e) {
    if (this.sm.is(S.CUTSCENE) && (e.code === 'Enter' || e.code === 'Escape' || e.code === 'Space')) { this.skipCutscene(); return; }
    if (this.sm.is(S.BENCHMARK) && e.code === 'Escape') { this.bench.collector.cancel(); return; }
    if (this.sm.is(S.SHOP) && e.code === 'Escape') { this.closeTerminal(); return; }
    if (this.sm.is(S.PAUSED) && (e.code === 'Escape') && !this.input.rebinding && !this.uiRoot.querySelector('.panel h2')?.textContent.match(/Op/)) { if (this.mapOpen) this.resume(); }
  }

  // ---------------------------------------------------------------- UI helpers
  setScreen(el) { this.uiRoot.replaceChildren(...(el ? [el] : [])); requestAnimationFrame(() => this.uiRoot.querySelector('button:not(:disabled)')?.focus?.({ preventScroll: true })); }
  async refreshHasSave() { const metas = await Promise.all([0, 1, 2, 3].map((n) => this.saveManager.meta(n).catch(() => null))); this.hasSave = metas.some((m) => m && !m.corrupted); }
  _makeUi() {
    const g = this;
    return {
      menu() { if (!g.sm.is(S.MAIN_MENU)) g.sm.go(S.MAIN_MENU); g.hud.hide(); g.appEl.classList.remove('playing'); g.setScreen(Screens.mainMenu(g, { hasSave: g.hasSave })); },
      difficulty() { g.sm.go(S.DIFFICULTY_SELECT); g.setScreen(Screens.difficultyScreen(g, g.profile)); },
      async loadSlots() { const metas = await Promise.all([0, 1, 2, 3].map(async (n) => (await g.saveManager.meta(n)) ?? { slot: n, empty: true })); metas.forEach((m, i) => { m.slot = i; }); g.setScreen(Screens.loadScreen(g, metas)); },
      extras() { if (g.sm.is(S.MAIN_MENU, S.BENCH_RESULTS, S.BENCHMARK)) g.sm.go(S.EXTRAS); g.setScreen(Screens.extrasScreen(g, { records: g.records.data, profile: g.profile })); },
      options(back) { if (g.sm.is(S.MAIN_MENU, S.PAUSED)) { g._optBack = g.sm.state; g.sm.go(S.OPTIONS); } g.setScreen(Screens.optionsScreen(g, () => { if (g.sm.is(S.OPTIONS)) g.sm.go(g._optBack); back(); })); },
      credits() { g.setScreen(Screens.creditsScreen(g)); },
      journal() { g.setScreen(Screens.journalScreen(g, { save: g.save, profile: g.profile }, () => g.setScreen(Screens.pauseScreen(g)))); },
      benchIntro() { g.setScreen(Screens.benchIntro(g)); },
    };
  }

  // ---------------------------------------------------------------- campanha
  async _loading(text = 'Carregando…') {
    this.sm.go(S.LOADING); this.setScreen(h('div.screen.solid', h('div', { style: { textAlign: 'center' } }, h('h2', text), h('div.bar', { style: { width: '240px', margin: '0 auto' } }, h('i', { style: { width: '60%' } })))));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
  async newCampaign(difficultyId) {
    this.audio.ensure(); this.audio.play('ui');
    await this._loading();
    const slotId = 1;
    this.save = createNewSave({ slot: slotId, profileId: this.profile.profileId, difficultyId, mode: 'campaign' });
    this.save.cameraSettings.preferredShoulder = this.settings.shoulder;
    if (this.save.chapterId !== this.chapterId) this.loadChapter(this.save.chapterId);
    this.camera.preferredSide = this.settings.shoulder; this.camera.sideCur = this.settings.shoulder === 'right' ? 1 : -1;
    this.stats = new RunStats({ objectivesTotal: this.chapterDef.data.objectives.length });
    this._startRun(true);
    this.startCutscene('intro');
  }
  /** Prepara uma execução a partir de this.save (nova ou carregada). */
  _startRun(fresh) {
    const s = this.save;
    if (s.chapterId !== this.chapterId) this.loadChapter(s.chapterId);
    this.diffPreset = { id: s.difficulty.current, ...difficulty.get(s.difficulty.current) };
    this.coordinator.setMax(this.diffPreset.maxContactAttackers); this.coordinator.clear();
    this.ledger = new EconomyLedger(s.economyLedger);
    this.combo?.dispose();
    this.combo = new ComboSystem({ bus: this.bus, ledger: this.ledger, getRunId: () => this.save.runId, getSimMs: () => this.simMs, hasChainModule: () => activeInventory(this.save).upgrades.includes('chain_module') });
    if (s.stats) { this.stats = new RunStats(s.stats); this.combo.style.restore(this.stats.style); this.combo.chain.maxCount = this.stats.maxChain; }
    this.stats.objectivesTotal = this.chapterDef.data.objectives.length;
    this.simMs = 0; this.deathAt = null; this.mapOpen = false; this.rng = createRng(0x9e3779b1 ^ (s.attempts * 7919) ^ s.playtimeSeconds | 0);
    this.playerView.setCharacter(s.playerId); this.player.loadFromSave(s); this.player.teleport(s.checkpoint.pos[0], s.checkpoint.pos[1], s.checkpoint.yaw ?? 0);
    const r = this.world.resolveCircle(this.player.x, this.player.z, 0.4); this.player.teleport(r.x, r.z, s.checkpoint.yaw ?? 0);
    this._clearAgents(); this.chapter.exiting = false; this.chapter._roared = false; this.chapter.load();
    this.dialogue.clear(); this.hud.toasts.replaceChildren(); this.hud.feedEl.replaceChildren();
    this.camera.preferredSide = s.cameraSettings?.preferredShoulder ?? 'right'; this.camera.snapBehind(this.player.yaw);
    this.checkpointSnap = JSON.stringify(this._snapshotForCheckpoint());
    if (fresh) this.checkpointSnap = JSON.stringify(this._snapshotForCheckpoint());
    this.playerView.root.visible = true; this.fx.update(1);
    this.applySettings();
  }
  _snapshotForCheckpoint() { this.syncSaveFromRuntime(); return structuredClone(this.save); }
  _clearAgents() { for (const a of this.agents) { this.scene.remove(a.view.mesh); a.view.dispose(); } this.agents = []; }
  spawnAgent(def, encounterId) {
    const species = bestiary.species[def.type];
    const Agent = species.boss ? K1Agent : DinosaurAgent;
    const agent = new Agent({ id: def.id, encounterId, species, pos: def.pos, patrol: def.patrol ?? [], hpMult: difficulty.get(this.diffPreset.id).enemyHpMult, yaw: this.rng.range(0, 6.28) });
    const view = new CreatureView(agent); this.scene.add(view.mesh); this.agents.push({ agent, view });
    if (this.agents.length > 14) { const dead = this.agents.findIndex((x) => x.agent.dead); if (dead >= 0) { const [d] = this.agents.splice(dead, 1); this.scene.remove(d.view.mesh); d.view.dispose(); } }
    return agent;
  }
  liveAgents() { return this.agents.filter((a) => !a.agent.dead).map((a) => a.agent); }

  syncSaveFromRuntime() {
    const s = this.save; if (!s) return;
    this.player.writeToSave(s);
    s.economyLedger = this.ledger.serialize(); s.credits = this.ledger.credits;
    this.stats.maxChain = Math.max(this.stats.maxChain, this.combo.maxChain); this.stats.counters = this.combo.stats.counters; this.stats.kills = this.combo.stats.kills;
    this.stats.style = this.combo.style.serialize(); this.stats.ccEarned = this.ledger.totalEarned;
    s.stats = this.stats.serialize();
    s.cameraSettings = { preferredShoulder: this.camera.preferredSide, invertY: this.settings.invertY };
  }
  syncRuntimeFromSave() {
    const s = this.save; this.player.loadFromSave(s);
    this.ledger = new EconomyLedger(s.economyLedger); this.combo.ledger = this.ledger;
  }

  // ---------------------------------------------------------------- saves
  async saveToSlot(n) {
    try { this.syncSaveFromRuntime(); this.save.checkpointId = this.terminal?.checkpointId ?? this.save.checkpointId; await this.saveManager.save(n, this.save); await this.saveManager.saveProfile(this.profile); await this.refreshHasSave(); this.audio.play('buy'); return { ok: true }; }
    catch (e) { this.audio.play('deny'); return { ok: false, error: String(e.message ?? e) }; }
  }
  saveProfile() { this.saveManager.saveProfile(this.profile).catch(() => {}); }
  async continueGame() {
    const metas = await Promise.all([0, 1, 2, 3].map((n) => this.saveManager.meta(n)));
    const best = metas.filter((m) => m && !m.corrupted).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0];
    if (best) this.loadSlot(best.slot);
  }
  async loadSlot(n) {
    this.audio.ensure();
    try {
      await this._loading();
      const r = await this.saveManager.load(n);
      this.save = r.save; this.stats = new RunStats(this.save.stats ?? {}); this._startRun(false);
      this.combo.resetForLoad();
      this.hud.toast(r.migrated ? `Save migrado (v${r.from} → v4) com backup.` : 'Progresso carregado.', 'good');
      this.enterPlaying();
    } catch (e) { this.sm.go(S.MAIN_MENU); this.ui.menu(); this.hud.show(); alert(`Não foi possível carregar: ${e.message}`); this.hud.hide(); }
  }
  async deleteSlot(n) { await this.saveManager.remove(n); await this.refreshHasSave(); this.ui.loadSlots(); }
  async exportSlot(n) { const r = await this.saveManager.load(n); this._download(`eden-slot${n}.json`, this.saveManager.exportJson(r.save)); }
  exportCurrent() { this.syncSaveFromRuntime(); this._download('eden-save.json', this.saveManager.exportJson(this.save)); }
  async importFile(file) {
    if (!file) return; const r = this.saveManager.importJson(await file.text());
    if (!r.ok) { alert(`Importação recusada: ${r.error}`); return; }
    await this.saveManager.save(1, r.save); await this.refreshHasSave(); alert('Save importado no slot 1.'); this.ui.loadSlots();
  }
  _download(name, text, type = 'application/json') { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove(); }

  // ---------------------------------------------------------------- fluxo de jogo
  enterPlaying() {
    this.sm.go(S.PLAYING); this.setScreen(null); this.hud.show(); this.appEl.classList.add('playing'); this.input.setEnabled(true); this.input.clearEdges();
    this.input.lock(); this.audio.resume(); this.audio.ensure(); this.loop.acc = 0;
  }
  pause({ map = false } = {}) {
    if (!this.sm.is(S.PLAYING)) return;
    this.sm.go(S.PAUSED); this.input.setEnabled(false); this.input.unlock(); this.appEl.classList.remove('playing'); this.audio.suspend();
    this.mapOpen = map;
    if (map) this._showMap(); else this.setScreen(Screens.pauseScreen(this));
  }
  resume() {
    if (!this.sm.is(S.PAUSED)) return;
    this.mapOpen = false; this.$map?.remove(); this.$map = null; this.audio.resume(); this.enterPlaying();
  }
  _showMap() {
    const cv = h('canvas'); this.$map = h('div#mapov', { onclick: () => this.resume() }, h('div', { style: { textAlign: 'center' } }, h('h2', `Mapa — ${this.chapterDef.data.mapTitle ?? this.chapterDef.data.title}`), cv, h('p.dim.small', 'Losango = objetivo · “?” = área suspeita (aproximada) · clique ou M para fechar')));
    this.uiRoot.replaceChildren(this.$map); this.drawMapInto(cv);
  }
  drawMapInto(cv) {
    const susp = this.save.secretFlags.SEC_01 && this.chapter.suspiciousCenter ? [this.chapter.suspiciousCenter] : [];
    drawMap(cv, { data: this.chapterDef.data, playerPos: { x: this.player.x, z: this.player.z }, playerYaw: this.camera.yaw, objectiveTarget: this.chapter.objectiveTarget(), suspicious: susp, terminals: this.chapterDef.data.terminals, gateOpen: this.chapter.script.gateOpen?.(this.save) ?? false });
  }
  quitToMenu() {
    this.chapter.dispose(); this._clearAgents(); this.combo?.dispose(); this.combo = null; this.playerView.root.visible = false; this.dialogue.clear();
    this.terminalUI.close(); this.mapOpen = false; this.input.setEnabled(false); this.input.unlock(); this.audio.resume(); this.save = null;
    if (!this.sm.go(S.MAIN_MENU)) this.sm.state = S.MAIN_MENU;
    this.refreshHasSave().then(() => this.ui.menu());
  }

  openTerminal(def) {
    this.combo.endChain('safe'); this.syncSaveFromRuntime();
    this.save.checkpointId = def.checkpointId; this.save.checkpoint = { pos: def.safe, yaw: this.player.yaw };
    this.terminal = def; this.checkpointSnap = JSON.stringify(structuredClone(this.save));
    this.sm.go(S.SHOP); this.input.setEnabled(false); this.input.unlock(); this.appEl.classList.remove('playing'); this.hud.setPrompt(null);
    this.audio.play('ui'); this.terminalUI.open(def);
  }
  closeTerminal() { this.terminalUI.close(); this.sm.go(S.PLAYING); this.appEl.classList.add('playing'); this.input.setEnabled(true); this.input.clearEdges(); this.input.lock(); }
  async buy(itemId) {
    this.syncSaveFromRuntime();
    const tx = `tx_${this.save.runId}_${++this.txCounter}_${Date.now().toString(36)}`;
    const r = await purchase(this.save, itemId, tx, async (next) => { next.checkpointId = this.save.checkpointId; await this.saveManager.save(0, next); }, this.chapterNumber);
    if (r.ok && !r.duplicate) { this.save = r.save; this.syncRuntimeFromSave(); this.checkpointSnap = JSON.stringify(structuredClone(this.save)); await this.refreshHasSave(); }
    return r;
  }
  changeDifficulty(id) {
    const r = difficulty.change(this.save, id, { atSafePoint: true });
    if (r.ok && !r.noop) { this.diffPreset = { id, ...difficulty.get(id) }; this.coordinator.setMax(this.diffPreset.maxContactAttackers); }
    return r;
  }

  gameOver() {
    if (!this.sm.is(S.PLAYING)) return;
    this.sm.go(S.GAME_OVER); this.input.setEnabled(false); this.input.unlock(); this.appEl.classList.remove('playing'); this.hud.setPrompt(null);
    this.stats.deaths++; this.save.attempts++;
    const canLower = difficulty.rank(this.save.difficulty.current) > 0;
    this.setScreen(Screens.gameOverScreen(this, { attempts: this.stats.deaths + 1, canLower, hint: this.stats.deaths >= 2 ? (this.chapter.script.deathHint ?? null) : null }));
  }
  async retry(lower = false) {
    await this._loading();
    const keep = this.stats; const snap = JSON.parse(this.checkpointSnap);
    snap.attempts = this.save.attempts; this.save = snap;
    snap.stats = { ...keep.serialize() };                                   // dano, tempo, mortes e estilo são cumulativos; CC/inventário voltam ao checkpoint
    this.stats = keep;
    if (lower) { const ids = ['explorer', 'standard', 'veteran', 'extinction']; const lowerId = ids[Math.max(0, ids.indexOf(this.save.difficulty.current) - 1)]; difficulty.change(this.save, lowerId, { atSafePoint: true }); }
    this._startRun(false); this.combo.resetForLoad(); this.save.stats = this.stats.serialize();
    this.hud.toast('Checkpoint restaurado — CC e itens voltam ao estado gravado, sem duplicar.', 'good');
    this.enterPlaying();
  }

  // ---------------------------------------------------------------- capítulo concluído
  finishChapter() {
    if (this.sm.is(S.PLAYING)) {
      this.combo.endChain('exit'); this.save.storyFlags.campaign_chapter_exit = true; this.chapter.objectives();
      this.startCutscene('ending');
    }
  }
  async completeChapter() {
    const s = this.save; this.combo.settleSector(s.sectorId); this.syncSaveFromRuntime();
    const st = this.stats;
    st.objectivesDone = s.completedObjectives.length;
    st.explorationVisited = this.chapter.script.explorationVisited(s);
    st.dossiersFound = s.dossiersInRun.length;
    const cid = s.chapterId, score = scoreChapter(st, cid);
    const eligibility = computeEligibility(s, { debug: this.debugUsed });
    s.chapterStats[cid] = { maxChain: st.maxChain, activeSeconds: Math.round(st.activeSeconds), deaths: st.deaths, score: score.total, grade: score.grade };
    const rec = await this.records.submit({ runId: s.runId, attempt: 0, chapterId: cid, difficulty: s.difficulty.current, protagonist: s.playerId, mode: s.runRules.mode, assists: this.settings.assist, score: score.total, grade: score.grade, time: st.activeSeconds, eligibility, eventsDigest: { k: st.kills, cc: st.ccEarned, ch: st.maxChain, d: Math.round(st.damageTaken) } });
    s.checkpointId = 'chapter_complete'; s.checkpoint = { pos: [0, -38], yaw: 0 };
    try { await this.saveManager.save(0, s); await this.saveManager.saveProfile(this.profile); await this.refreshHasSave(); } catch (e) { this.hud.toast('Falha no autosave: ' + e.message, 'warn'); }
    this.sm.go(S.CHAPTER_COMPLETE); this.hud.hide(); this.appEl.classList.remove('playing'); this.input.setEnabled(false); this.input.unlock();
    this.setScreen(Screens.resultsScreen(this, { stats: st, score, eligibility, newBest: !!rec.best, explorationTotal: rankTargets.chapters[cid].explorationNodes.length }));
  }

  // ---------------------------------------------------------------- cutscenes
  startCutscene(kind) {
    this.sm.go(S.CUTSCENE); this.input.setEnabled(false); this.input.unlock(); this.appEl.classList.remove('playing'); this.hud.hide(); this.audio.ensure();
    this.setScreen(h('div', h('div.letterbox.top'), h('div.letterbox.bot'), h('button#skip', { onclick: () => this.skipCutscene() }, 'Pular (Enter)')));
    const def = this.chapter.script.cutscenes[kind];
    const c = this.cine = { kind, t: 0, dur: def.dur, def };
    this.dialogue.clear();
    def.start(this, c);
  }
  skipCutscene() { if (this.cine) { this.cine.t = this.cine.dur + 1; this.dialogue.clear(); } }
  _updateCutscene(dt) {
    const c = this.cine; if (!c) return; c.t += dt; this.dialogue.update(dt);
    c.def.update(this, c, dt);
    if (c.t >= c.dur) this._endCutscene();
  }
  _endCutscene() {
    const c = this.cine; this.cine = null; this.dialogue.clear();
    c.def.end?.(this, c);
    if (c.kind === 'intro') { this.camera.snapBehind(this.player.yaw); this.enterPlayingFromCutscene(); }
    else this.completeChapter();
  }
  enterPlayingFromCutscene() {
    const f = $('#fade'); void f;
    this.threeCam.fov = 68; this.threeCam.updateProjectionMatrix();
    this.sm.go(S.PLAYING); this.setScreen(null); this.hud.show(); this.appEl.classList.add('playing'); this.input.setEnabled(true); this.input.clearEdges(); this.input.lock(); this.loop.acc = 0;
    this.camera.snapBehind(this.player.yaw); this.camera.pivot = { x: this.player.x, y: 1.5, z: this.player.z };
    if (this.chapter.script.introToast) this.hud.toast(this.chapter.script.introToast, 'good');
  }

  // ---------------------------------------------------------------- simulação (passo fixo)
  aiCtx() {
    return { player: this.player, world: this.world, noises: this.noises, coordinator: this.coordinator, diff: this.diffPreset, diffMgr: difficulty, bus: this.bus, sim: this.simMs, rng: this.rng, allies: this.agents.map((a) => a.agent), tick: this.loop.tick, runId: this.save.runId };
  }
  step(dt) {
    const p = this.player, tick = this.loop.tick; this.simMs += dt * 1000;
    const inp = this.input.snapshot();
    this.noises.length = 0;
    const evs = p.step(dt, this.simMs, inp, this.camera.yaw, activeInventory(this.save).consumables);
    p.simShooting = this.simMs / 1000 - p.lastFireT < 0.45;
    for (const e of evs) this.onPlayerEvent(e);
    const nr = p.noiseRadius(); if (nr > 0) this.noises.push({ x: p.x, z: p.z, r: nr });
    const ctx = this.aiCtx();
    for (const a of this.agents) { if (!a.agent.dead) a.agent.update(dt, ctx); }
    this.chapter.step(dt, this.simMs, inp);
    this.combo.flush(tick, this.simMs);
    this.dialogue.update(dt);
    this.fx.update(dt);
    this.stats.activeSeconds += dt; this.save.playtimeSeconds += dt;
    // áudio de tensão: ameaça real (CHASE/WINDUP) aumenta camada; calmaria recua
    let threat = 0; for (const a of this.agents) { const s = a.agent.state; if (a.agent.dead) continue; const d = Math.hypot(a.agent.x - p.x, a.agent.z - p.z); if (d < 30) threat = Math.max(threat, s === AI.CHASE || s === AI.ATTACK_WINDUP || s === AI.ATTACK || s === K1.CHARGE_WINDUP || s === K1.CHARGE || s === K1.TAIL_WINDUP ? 1 : s === AI.STALK ? 0.6 : s === AI.INVESTIGATE ? 0.3 : 0); }
    this._threat = lerp(this._threat ?? 0, threat, 0.04); this.audio.setThreat(this._threat);
    if (p.dead && this.deathAt == null) { this.deathAt = this.simMs; this.combo.endChain('death'); this.audio.play('hurt'); this.hud.toast(`${getCharacter(this.save.playerId).name} caiu…`, 'warn'); }
    if (this.deathAt != null && this.simMs - this.deathAt > 1800) this.gameOver();
  }
  onPlayerEvent(e) {
    const p = this.player;
    switch (e.type) {
      case 'fire': this.shoot(); break;
      case 'dryFire': this.audio.play('dry'); this.hud.toast('Sem munição', 'warn'); break;
      case 'reloadStart': this.audio.play('reload'); break;
      case 'shellLoaded': this.audio.play('reload'); break;
      case 'weaponSwitch': this.audio.play('ui'); this.hud.toast(p.weapon.name, ''); break;
      case 'dodge': this.audio.play('lunge', p.x, p.z); break;
      case 'itemStart': this.audio.play('ui'); break;
      case 'itemUsed': {
        const c = activeInventory(this.save).consumables; c[e.kind] = Math.max(0, (c[e.kind] ?? 0) - 1); if (e.kind !== 'hemostatic') this.stats.healsUsed++;
        this.hud.toast(e.kind === 'hemostatic' ? 'Sangramento estancado.' : 'Vida recuperada.', 'good'); this.audio.play('pickup'); break;
      }
      case 'itemDenied': this.hud.toast(`Não é possível: ${e.reason}`, 'warn'); this.audio.play('deny'); break;
      case 'utility': this.useUtility(); break;
      default: break;
    }
  }
  shoot() {
    const p = this.player, w = p.weapon, cam = this.camera;
    const mz = p.muzzle(cam.yaw), enemies = this.liveAgents();
    const assist = this.settings.assist === 'auto' ? this.diffPreset.assist : +this.settings.assist;
    const res = resolveShot({ world: this.world, enemies, camera: cam, muzzle: mz, weapon: w, spreadDeg: p.spreadDeg(), rng: this.rng, assist });
    this.stats.shotsFired++; this.audio.play('shot', p.x, p.z); this.playerView.muzzleFlash();
    cam.kick(w.recoilKickDeg); cam.shake(0.35);
    this.noises.push({ x: p.x, z: p.z, r: w.noiseRadius });
    if (res.kind === 'spread') {
      for (const t of res.tracers) this.fx.tracer(t.from, t.point);
      for (const pt of res.impacts) this.fx.burst(pt, 0xffd98a, 3, 2.4, 0.2);
      if (res.hits.length) { this.stats.shotsHit++; this.hud.hitMarker(); }
      for (const hit of res.hits) {
        const ag = hit.enemy; this.audio.play('hit', ag.x, ag.z);
        this.fx.burst(hit.point, 0x9a1c1c, 7, 3.4);
        const ctx = { ...this.aiCtx(), sim: this.simMs };
        const r = ag.takeDamage(hit.damage, hit.parts.head ? 'head' : 'torso', ctx);
        if (!r.dead && shouldInterrupt(w, hit, !!ag.species.boss)) ag.interrupt(ctx);
      }
      return;
    }
    this.fx.tracer(res.tracerFrom, res.point);
    if (res.kind === 'enemy') {
      const ag = res.enemy; this.stats.shotsHit++; this.hud.hitMarker(); this.audio.play('hit', ag.x, ag.z);
      this.fx.burst(res.point, 0x9a1c1c, 7, 3.4);
      ag.takeDamage(res.damage, res.part, { ...this.aiCtx(), sim: this.simMs });
    } else if (res.kind === 'world') this.fx.burst(res.point, 0xffd98a, 4, 2.4, 0.2);
  }
  useUtility() {
    if (getCharacter(this.save.playerId).utility === 'impact_tool') return this.useImpact();
    const p = this.player, ut = UTILITY.electric_tool, ctx = this.aiCtx();
    let best = null;
    for (const a of this.liveAgents()) {
      const dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz); if (d > ut.range + a.radius) continue;
      const fx = -Math.sin(this.camera.yaw), fz = -Math.cos(this.camera.yaw);
      if ((dx * fx + dz * fz) / (d || 1) < 0.35) continue;
      if (!best || d < best.d) best = { a, d };
    }
    this.noises.push({ x: p.x, z: p.z, r: ut.noiseRadius });
    if (!best) { p.utilityCd = 0.6; this.hud.toast('Nenhum alvo ao alcance da ferramenta.', 'warn'); this.audio.play('deny'); return; }
    this.audio.play('zap', best.a.x, best.a.z); this.fx.burst({ x: best.a.x, y: 1, z: best.a.z }, 0x57e6e0, 10, 4);
    best.a.stun(ut.stunMs, ctx);
    const others = this.liveAgents().filter((o) => o !== best.a && Math.hypot(o.x - p.x, o.z - p.z) < 14).length;
    this.bus.emit('groupControl', { eventId: `gc:${best.a.id}:${Math.round(this.simMs)}`, enemyId: best.a.id, encounterId: best.a.encounterId, othersAlive: others > 0, tick: this.loop.tick });
  }

  useImpact() {
    const p = this.player, ut = UTILITY.impact_tool, ctx = this.aiCtx(), fx = -Math.sin(this.camera.yaw), fz = -Math.cos(this.camera.yaw);
    this.noises.push({ x: p.x, z: p.z, r: ut.noiseRadius });
    const targets = this.liveAgents().filter((a) => { const dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz); return d <= ut.range + a.radius && (dx * fx + dz * fz) / (d || 1) >= 0.35; });
    const broke = this.chapter.breakAt(p.x + fx * 1.2, p.z + fz * 1.2, ut.range);
    if (!targets.length && !broke) { p.utilityCd = 0.6; this.hud.toast('Nada ao alcance do golpe.', 'warn'); this.audio.play('deny'); return; }
    this.camera.shake(0.6); this.audio.play('hit', p.x, p.z);
    for (const a of targets) {
      this.fx.burst({ x: a.x, y: 1, z: a.z }, 0xe8d8a8, 10, 4);
      applyImpact(a, p, ut, this.world, { ...ctx, sim: this.simMs });
    }
    const first = targets.find((a) => !a.species.boss);
    if (first) {
      const others = this.liveAgents().filter((o) => o !== first && Math.hypot(o.x - p.x, o.z - p.z) < 14).length;
      this.bus.emit('groupControl', { eventId: `gc:${first.id}:${Math.round(this.simMs)}`, enemyId: first.id, encounterId: first.encounterId, othersAlive: others > 0, tick: this.loop.tick });
    }
  }

  // ---------------------------------------------------------------- render
  render(alpha, frameDt) {
    this.tAnim += frameDt;
    this.input.pollGamepad();
    const st = this.sm.state;
    const t0 = performance.now();
    if (st === S.PLAYING) this.renderPlaying(alpha, frameDt);
    else if (st === S.CUTSCENE) { this._updateCutscene(frameDt); this.scenery.update(this.tAnim, frameDt, this.threeCam.position, { x: 0, y: 0, z: -1 }, this.player); this.agents.forEach((a) => a.view.sync(1, frameDt)); }
    else if (st === S.BENCHMARK) this.renderBench(frameDt, t0);
    else this.renderIdle(frameDt);
    if (st !== S.BENCHMARK) this.renderer.render(this.scene, this.threeCam);
    this.menuNav();
  }
  renderIdle(frameDt) {
    const st = this.sm.state, menuLike = st === S.MAIN_MENU || st === S.DIFFICULTY_SELECT || st === S.OPTIONS && !this.save || st === S.EXTRAS || st === S.BENCH_RESULTS || st === S.LOADING;
    if (menuLike || !this.save) {
      const a = this.tAnim * 0.07, c = this.threeCam;
      c.position.set(Math.sin(a) * 9 + 2, 2.6 + Math.sin(this.tAnim * 0.2) * 0.3, 30 + Math.cos(a) * 7); c.lookAt(0, 1.6, 33); c.fov = 62; c.updateProjectionMatrix();
      this.scenery.update(this.tAnim, frameDt, c.position, { x: 0, y: 0, z: -1 }, { x: 0, z: 30 });
    } else {
      this.camera.writeTo(this.threeCam);
      this.scenery.update(this.tAnim, frameDt, this.camera.pos, forwardVec(this.camera.yaw, this.camera.pitch), this.player);
      this.playerView.sync(1, 0, this.camera.playerOpacity); this.agents.forEach((a) => a.view.sync(1, 0));
    }
  }
  renderPlaying(alpha, frameDt) {
    const p = this.player, cam = this.camera, inp = this.input;
    if (inp.consumeFrame('pause')) { this.pause(); return; }
    if (inp.consumeFrame('map')) { this.pause({ map: true }); return; }
    if (inp.consumeFrame('inventory')) { this.pause(); this.ui.journal(); return; }
    if (inp.consumeFrame('swap')) { cam.swapShoulder(); this.settings.shoulder = cam.preferredSide; saveSettings(this.settings); }
    if (inp.consumeFrame('turn180')) cam.startTurn180();
    const look = inp.takeLook(frameDt);
    const aim = inp.held('aim') && !p.using && !p.dead && !p.dodging;
    cam.update(frameDt, { lookX: p.dead ? 0 : look.x, lookY: p.dead ? 0 : look.y, aim }, { x: lerp(p.px, p.x, alpha), y: 0, z: lerp(p.pz, p.z, alpha) });
    cam.writeTo(this.threeCam);
    const dir = forwardVec(cam.yaw, cam.pitchEff);
    this.scenery.update(this.tAnim, frameDt, cam.pos, dir, p);
    this.audio.setListener(cam.pos.x, cam.pos.z, cam.yaw);
    // oclusão localizada: só os objetos que bloqueiam a vista
    const occ = new Set(this.world.occluders(cam.pos.x, cam.pos.y, cam.pos.z, cam.pivot.x, cam.pivot.y, cam.pivot.z).map((c) => c.id));
    const forceFade = this.chapter.script.forceFade;
    for (const id of this.scenery.fadeMats.keys()) this.scenery.setFade(id, (occ.has(id) && cam.dist > 0.3) || forceFade?.(this, id) ? 0.16 : 1);
    this.playerView.sync(alpha, frameDt, cam.playerOpacity);
    for (const a of this.agents) a.view.sync(alpha, frameDt);
    this.updateHud(frameDt);
  }
  updateHud(frameDt) {
    const p = this.player, cam = this.camera, w = p.weapon, hud = this.hud;
    const muzzle = p.muzzle(cam.yaw), live = this.liveAgents();
    const retic = reticleState({ world: this.world, enemies: live, camera: cam, muzzle, weapon: w });
    hud.update({ hp: p.hp, maxHp: p.maxHp, bleeding: p.bleeding, mag: p.mag, reserve: p.reserve, reloading: p.reloading, using: !!p.using, aiming: p.aiming, spreadDeg: p.spreadDeg(), pellets: w.pellets ?? 1, weaponName: w.name, fov: cam.fov, reticle: retic, consumables: activeInventory(this.save).consumables, infinite: p.infiniteAmmo }, frameDt);
    const ch = this.combo.chain;
    hud.setChain(ch.count, ch.remainingMs(this.simMs), ch.windowMs, ch.count >= 10 ? 'EXTINÇÃO' : ch.count >= 6 ? 'IMPLACÁVEL' : ch.count >= 4 ? 'PREDADOR' : 'CADEIA', this.settings.hideComboHud);
    const obj = this.chapter.currentObjective(), extra = this.chapter.script.objectiveStatus?.(this.chapter); hud.setObjective((obj ? obj.text : 'Capítulo concluído.') + (extra ? ` — ${extra}` : ''));
    // ameaças reais fora da tela
    const fwd = { x: -Math.sin(cam.yaw), z: -Math.cos(cam.yaw) }, rgt = { x: Math.cos(cam.yaw), z: -Math.sin(cam.yaw) }, hf = 2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect);
    const th = [];
    for (const a of live) {
      if (![AI.CHASE, AI.ATTACK_WINDUP, AI.ATTACK, AI.STALK, K1.CHARGE_WINDUP, K1.CHARGE, K1.TAIL_WINDUP].includes(a.state)) continue;
      const dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz); if (d > 16) continue;
      const ang = Math.atan2(dx * rgt.x + dz * rgt.z, dx * fwd.x + dz * fwd.z);
      if (Math.abs(ang) > hf / 2 * 0.92) th.push(ang);
    }
    hud.setThreats(th.slice(0, 4));
    // barra do chefe: enquanto houver um chefe vivo (ex.: K-1 do encontro ch02_k1)
    const boss = live.find((a) => a.species.boss);
    hud.setBossBar(boss ? `${boss.species.code} — ${boss.species.name}` : null, boss ? Math.max(0, boss.hp) / boss.maxHp : null);
  }

  // ---------------------------------------------------------------- menus por gamepad
  menuNav() {
    const q = this.input.navEdges; if (!q?.length) return;
    const edges = q.splice(0); if (this.sm.is(S.PLAYING, S.CUTSCENE, S.BENCHMARK)) return;
    const btns = [...this.uiRoot.querySelectorAll('button:not(:disabled), select, input')]; if (!btns.length) return;
    let i = btns.indexOf(document.activeElement);
    for (const e of edges) {
      if (e === 'down' || e === 'right') i = (i + 1) % btns.length; else if (e === 'up' || e === 'left') i = (i - 1 + btns.length) % btns.length;
      else if (e === 'accept') { document.activeElement?.click?.(); continue; } else if (e === 'back') { if (this.sm.is(S.SHOP)) this.closeTerminal(); else if (this.sm.is(S.PAUSED)) this.resume(); continue; }
      btns[Math.max(0, i)]?.focus();
    }
  }

  // ---------------------------------------------------------------- benchmark B01 (isolado da campanha)
  startBenchmark(mode) {
    if (!this.sm.is(S.EXTRAS, S.BENCH_RESULTS)) return;
    this.sm.go(S.LOADING); this.hud.hide(); this.setScreen(null); this.audio.ensure();
    this.chapter.dispose(); this._clearAgents();
    const rng = createRng(BENCH.seed), cam = new ShoulderCameraController(this.world), player = new Player(this.world), view = new PlayerView(player);
    this.scene.add(view.root);
    const route = [[0, 30], [3, 24], [6, 18], [8, 10], [8, 2], [3, 6], [-6, 12], [-12, 9], [-4, 18], [1, 26]];
    const agents = [0, 1, 2].map((i) => {
      const sp = bestiary.species.forest_runner;
      const a = new DinosaurAgent({ id: `bench_${i}`, encounterId: 'bench', species: sp, pos: [route[(i * 3) % route.length][0] + 5, route[(i * 3) % route.length][1] - 6], patrol: route.map(([x, z]) => [x + (i - 1) * 4, z - 5 - i * 2]) });
      a.scripted = { t: i * 1.7 }; const v = new CreatureView(a); this.scene.add(v.mesh); return { agent: a, view: v };
    });
    this.bench = { mode, collector: new BenchCollector({ mode }), cam, player, view, agents, route, rng, t: 0, seg: 0, lastShot: 0, swapAt: 12, preset: this.settings.quality, camMs: 0 };
    this.sm.go(S.BENCHMARK); this.appEl.classList.remove('playing');
    this.benchHud = h('div.bench-hud', h('b', `Benchmark ${BENCH.sceneId} — ${BENCH.sceneName}`), h('div.small.dim', '(Esc cancela) Mantenha a aba em primeiro plano.'), (this.benchPhase = h('div', 'Aquecimento…')), h('div.bar', { style: { width: '260px', marginTop: '6px' } }, (this.benchBar = h('i'))));
    this.uiRoot.replaceChildren(this.benchHud, h('div.perf', { id: 'perf' }));
    this.canvas.focus();
  }
  renderBench(frameDt, t0) {
    const B = this.bench; if (!B) return; const col = B.collector; const ts = performance.now();
    B.t += frameDt;
    const u0 = performance.now();
    // percurso fixo ao longo da rota
    const speed = 3.6; let dist = B.t * speed, total = 0; const segs = [];
    for (let i = 0; i < B.route.length; i++) { const a = B.route[i], b = B.route[(i + 1) % B.route.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push([a, b, l]); total += l; }
    dist %= total; let x = 0, z = 0, mv = 0;
    for (const [a, b, l] of segs) { if (dist <= l) { const k = dist / l; x = a[0] + (b[0] - a[0]) * k; z = a[1] + (b[1] - a[1]) * k; mv = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])); break; } dist -= l; }
    const p = B.player; p.px = p.x; p.pz = p.z; p.pYaw = p.yaw; p.x = x; p.z = z; p.yaw = mv; p.speed = speed; p.walkPhase += speed * frameDt * 1.9; p.aiming = (B.t % 7) > 4.5; p.hp = 100; p.hurtT = 0;
    for (const a of B.agents) { a.agent.update(frameDt, { player: p, world: this.world, noises: [], coordinator: this.coordinator, diff: this.diffPreset, diffMgr: difficulty, bus: this.bus, sim: B.t * 1000, rng: B.rng, allies: B.agents.map((q) => q.agent), tick: 0 }); }
    if (B.t > B.swapAt) { B.cam.swapShoulder(); B.swapAt += 12; }
    const c0 = performance.now();
    B.cam.yaw = mv + (B.t / 30) * Math.PI * 2; B.cam.pitch = 0.1 + Math.sin(B.t * 0.5) * 0.2;
    B.cam.update(frameDt, { lookX: 0, lookY: 0, aim: p.aiming }, { x, y: 0, z });
    const camMs = performance.now() - c0;
    if (B.t - B.lastShot > 0.6) { B.lastShot = B.t; const mz = p.muzzle(B.cam.yaw); const r = resolveShot({ world: this.world, enemies: B.agents.map((q) => q.agent), camera: B.cam, muzzle: mz, weapon: WEAPONS.pistol, spreadDeg: 1, rng: B.rng }); this.fx.tracer(r.tracerFrom, r.point); this.fx.burst(r.point, 0xffd98a, 4, 2.4, 0.2); this.audio.play('shot', x, z); }
    this.fx.update(frameDt);
    B.cam.writeTo(this.threeCam);
    this.scenery.update(B.t, frameDt, B.cam.pos, forwardVec(B.cam.yaw, B.cam.pitchEff), p);
    B.view.sync(1, frameDt, B.cam.playerOpacity); B.agents.forEach((a) => a.view.sync(1, frameDt));
    const updateMs = performance.now() - u0;
    const r0 = performance.now(); this.renderer.render(this.scene, this.threeCam); const renderMs = performance.now() - r0;
    const inf = this.renderer.info;
    col.frame(ts, { updateMs, renderMs, camMs, info: { calls: inf.render.calls, triangles: inf.render.triangles, geometries: inf.memory.geometries, textures: inf.memory.textures } });
    const e = col.elapsed, ph = col.phase;
    this.benchPhase.textContent = ph === 'warmup' ? `Aquecimento… ${Math.ceil((col.warmup - e) / 1000)} s` : `Medindo… ${Math.max(0, Math.ceil((col.warmup + col.run - e) / 1000))} s`;
    this.benchBar.style.width = `${Math.min(100, (e / (col.warmup + col.run)) * 100)}%`;
    const pf = document.getElementById('perf'); if (pf) pf.textContent = `${(1000 / Math.max(1, col.frames.at(-1) ?? 16.7)).toFixed(0)} fps · ${renderMs.toFixed(1)} ms render`;
    if (col.finished) this._finishBench();
  }
  async _finishBench() {
    const B = this.bench; this.bench = null;
    if (B.collector.cancelled) {
      this.scene.remove(B.view.root); B.agents.forEach((a) => { this.scene.remove(a.view.mesh); a.view.dispose(); });
      this.sm.go(S.BENCH_RESULTS); this.sm.go(S.EXTRAS); this.ui.extras(); return;
    }
    const env = collectEnv({ renderer: this.renderer, canvas: this.canvas, preset: B.preset, dpr: this.renderer.getPixelRatio() });
    const rep = B.collector.report(env, BUILD); rep.sceneName = BENCH.sceneName;
    this.scene.remove(B.view.root); B.agents.forEach((a) => { this.scene.remove(a.view.mesh); a.view.dispose(); });
    this.sm.go(S.BENCH_RESULTS);
    const hist = await this.saveManager.loadBenchHistory().catch(() => []); hist.push(rep); await this.saveManager.saveBenchHistory(hist).catch(() => {});   // registro SEPARADO do save narrativo
    this.lastBench = rep;
    this.setScreen(Screens.benchResultsScreen(this, rep, hist));
  }
  compareBench(a, b) { return compareReports(a, b); }
  exportBench(rep) { this._download(`eden-benchmark-${rep.id}.json`, JSON.stringify(rep, null, 2)); }

  // ---------------------------------------------------------------- depuração (?debug=1) — contamina o ranking (Livre)
  _installDebug() {
    const mark = () => { this.debugUsed = true; if (this.save) this.save.rankEligibility = 'custom'; };
    window.__eden = {
      game: this, S,
      state: () => ({ state: this.sm.state, simMs: this.simMs, tick: this.loop.tick, player: { x: this.player.x, z: this.player.z, hp: this.player.hp, mag: this.player.mag, reserve: this.player.reserve }, cc: this.ledger?.credits, chain: this.combo?.chain.count, agents: this.agents.map((a) => ({ id: a.agent.id, s: a.agent.state, hp: a.agent.hp, x: +a.agent.x.toFixed(1), z: +a.agent.z.toFixed(1) })), flags: this.save?.storyFlags, camera: { yaw: this.camera.yaw, dist: this.camera.dist, blocked: this.camera.blocked, pos: this.camera.pos }, objectives: this.save?.completedObjectives }),
      teleport: (x, z) => { mark(); this.player.teleport(x, z); this.camera.snapBehind(this.player.yaw); },
      god: (v = true) => { mark(); this.god = v; this._godId = this._godId ?? setInterval(() => { if (this.god && this.player) { this.player.hp = 100; this.player.dead = false; } }, 50); },
      giveCC: (n) => { mark(); this.ledger.credit(`debug|${Math.random()}`, n); this.save.economyLedger = this.ledger.serialize(); },
      look: (dx, dy) => { this.input.look.x += dx; this.input.look.y += dy; },
      killAll: () => { mark(); const ctx = this.aiCtx(); for (const a of this.liveAgents()) a.takeDamage(9999, 'torso', ctx); },
      press: (code) => { this.input._press(code); }, release: (code) => { this.input._release(code); },
      hold: (code, ms) => { this.input._press(code); setTimeout(() => this.input._release(code), ms); },
      skip: () => this.skipCutscene(),
      /** Começa um capítulo direto (ex.: `startChapter('ch02')` → Caio no Posto Norte). Provisório até a transição da Task 8. */
      startChapter: async (id = 'ch02', difficultyId = 'standard') => {
        this.audio.ensure(); await this._loading();
        const d = getChapter(id).data, s = createNewSave({ slot: 1, profileId: this.profile.profileId, difficultyId, mode: 'campaign' });
        Object.assign(s, { chapterId: id, sectorId: d.id, playerId: d.protagonist, checkpointId: 'start', checkpoint: { pos: [...d.spawn.pos], yaw: d.spawn.yaw } });
        s.cameraSettings.preferredShoulder = this.settings.shoulder; s.health[s.playerId] = getCharacter(s.playerId).maxHp;
        this.save = s; mark();
        this.stats = new RunStats({ objectivesTotal: d.objectives.length });
        this._startRun(true); this.startCutscene('intro');
      },
    };
  }
}
