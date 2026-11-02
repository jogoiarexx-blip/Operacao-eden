/**
 * Entrada: teclado/mouse (Pointer Lock opcional) e gamepad. Ações remapeáveis.
 * Bordas "de simulação" persistem até um passo fixo consumi-las; bordas "de quadro" (UI) são consumidas no render.
 */
const SIM_EDGE = ['fire', 'dodge', 'reload', 'utility', 'medkit', 'hemo', 'interact', 'weapon1', 'weapon2', 'weaponNext'];
const FRAME_EDGE = ['swap', 'turn180', 'map', 'inventory', 'pause'];
const PAD = { fire: 7, aim: 6, interact: 0, dodge: 1, reload: 2, turn180: 3, utility: 4, swap: 11, pause: 9, map: 8, run: 10, inventory: 5, weaponNext: 15 };
const PAD_WEAPON_PREV = 14;                 // direcional esquerdo também alterna a arma

export class Input {
  constructor(el, settings) {
    this.el = el; this.settings = settings;
    this.down = new Set(); this.simEdges = new Set(); this.frameEdges = new Set();
    this.look = { x: 0, y: 0 }; this.locked = false; this.enabled = false; this.padPrev = {}; this.padLook = { x: 0, y: 0 };
    this.rebinding = null; this.lastDevice = 'kbm';
    this._bind();
  }
  _actionsFor(code) { return Object.entries(this.settings.bindings).filter(([, c]) => c === code).map(([a]) => a); }
  _press(code) {
    if (this.rebinding) { const cb = this.rebinding; this.rebinding = null; cb(code); return; }
    const acts = this._actionsFor(code);
    if (!this.down.has(code)) for (const a of acts) { if (SIM_EDGE.includes(a)) this.simEdges.add(a); if (FRAME_EDGE.includes(a)) this.frameEdges.add(a); }
    this.down.add(code);
  }
  _release(code) { this.down.delete(code); }
  _bind() {
    addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return;
      if (e.code === 'Tab' || e.code.startsWith('Arrow') || e.code === 'Space') { if (this.enabled) e.preventDefault(); }
      if (e.repeat) return;
      this.lastDevice = 'kbm'; this._press(e.code);
    });
    addEventListener('keyup', (e) => this._release(e.code));
    addEventListener('blur', () => { this.down.clear(); });
    this.el.addEventListener('mousedown', (e) => { if (!this.enabled) return; this.lastDevice = 'kbm'; this._press(`Mouse${e.button}`); e.preventDefault(); });
    addEventListener('mouseup', (e) => this._release(`Mouse${e.button}`));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.el.addEventListener('wheel', (e) => { if (!this.enabled) return; this.lastDevice = 'kbm'; this.simEdges.add('weaponNext'); e.preventDefault(); }, { passive: false });
    addEventListener('mousemove', (e) => {
      if (!this.enabled || (!this.locked && !(this.down.has('Mouse0') || this.down.has('Mouse2')))) return;
      this.look.x += e.movementX || 0; this.look.y += e.movementY || 0;
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked; this.locked = document.pointerLockElement === this.el;
      if (was && !this.locked) this.onLockLost?.();
    });
  }
  lock() { try { const p = this.el.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* sem pointer lock */ } }
  unlock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* ignora */ } }
  setEnabled(v) { this.enabled = v; if (!v) { this.down.clear(); this.simEdges.clear(); this.look.x = this.look.y = 0; } }
  held(action) {
    const code = this.settings.bindings[action];
    if (this.down.has(code)) return true;
    return !!this.padState?.[action];
  }
  /** Bordas de UI consumidas no render. */
  consumeFrame(action) { const had = this.frameEdges.delete(action) || !!this.padEdges?.[action]; if (this.padEdges) this.padEdges[action] = false; return had; }

  /** Radianos de olhar acumulados desde a última chamada (mouse imediato + analógico direito × dt). */
  takeLook(dt) {
    const k = 0.0022;
    const s = this.settings;
    const lx = this.look.x * k + this.padLook.x * dt * 2.6, ly = this.look.y * k + this.padLook.y * dt * 2.0;
    this.look.x = this.look.y = 0;
    return { x: lx, y: ly };
  }

  pollGamepad() {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) { this.padState = null; this.padLook.x = this.padLook.y = 0; return; }
    const dz = this.settings.deadzone, ax = (v) => (Math.abs(v) < dz ? 0 : (Math.sign(v) * (Math.abs(v) - dz)) / (1 - dz));
    this.padState = {}; this.padEdges ||= {};
    for (const [a, b] of Object.entries(PAD)) {
      const pressed = !!gp.buttons[b]?.pressed; this.padState[a] = pressed;
      if (pressed && !this.padPrev[a]) { if (SIM_EDGE.includes(a)) this.simEdges.add(a); if (FRAME_EDGE.includes(a)) this.padEdges[a] = true; this.lastDevice = 'pad'; }
      this.padPrev[a] = pressed;
    }
    { const pr = !!gp.buttons[PAD_WEAPON_PREV]?.pressed; if (pr && !this.padPrev.weaponPrevAlt) { this.simEdges.add('weaponNext'); this.lastDevice = 'pad'; } this.padPrev.weaponPrevAlt = pr; }
    this.navEdges ||= []; this.navPrev ||= {};
    for (const [n, b] of Object.entries({ up: 12, down: 13, left: 14, right: 15, accept: 0, back: 1 })) { const pr = !!gp.buttons[b]?.pressed; if (pr && !this.navPrev[n]) this.navEdges.push(n); this.navPrev[n] = pr; }
    this.padAxes = { x: ax(gp.axes[0] ?? 0), y: ax(gp.axes[1] ?? 0) };
    this.padLook.x = ax(gp.axes[2] ?? 0); this.padLook.y = ax(gp.axes[3] ?? 0);
    const d = gp.buttons[12]?.pressed ? 1 : gp.buttons[13]?.pressed ? -1 : 0; void d;
  }

  /** Instantâneo para um passo de simulação (consome bordas de simulação). */
  snapshot() {
    const h = (a) => this.held(a);
    let mx = (h('right') ? 1 : 0) - (h('left') ? 1 : 0), my = (h('forward') ? 1 : 0) - (h('back') ? 1 : 0);
    if (this.padAxes && (this.padAxes.x || this.padAxes.y)) { mx = this.padAxes.x; my = -this.padAxes.y; }
    const e = (a) => this.simEdges.delete(a);
    return {
      moveX: mx, moveY: my, run: h('run'), aim: h('aim'), fireHeld: h('fire'),
      firePressed: e('fire'), dodgePressed: e('dodge'), reloadPressed: e('reload'), utilityPressed: e('utility'),
      weaponSlot: e('weapon1') ? 1 : e('weapon2') ? 2 : 0, weaponNext: e('weaponNext'),
      medkitPressed: e('medkit'), hemoPressed: e('hemo'), interactPressed: e('interact'), interactHeld: h('interact'),
    };
  }
  clearEdges() { this.simEdges.clear(); this.frameEdges.clear(); }
}
