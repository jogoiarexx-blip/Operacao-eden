import { h } from './dom.js';
import { DEG } from '../core/math.js';

/** HUD discreto (GDD 12.1/12.4): nunca cobre o retículo; CC e ESTILO são distintos; efeitos reduzíveis. */
export class Hud {
  constructor(root) {
    this.root = root; this.timers = [];
    this.vig = h('div#vignette'); this.threatsEl = h('div#threats');
    this.objText = h('div', ''); this.objective = h('div#hud-objective.hud-box', h('b', 'Objetivo'), this.objText);
    this.nav = h('div#hud-nav'); this.objective.append(this.nav);
    this.hpFill = h('i'); this.hpBar = h('div.hpbar', this.hpFill); this.hpText = h('span'); this.bleed = h('span.red', '');
    this.items = h('div.small.dim');
    this.vitals = h('div#hud-vitals.hud-box', h('div.row.between', h('span', 'VIDA'), this.hpText), this.hpBar, h('div.row.between', this.items, this.bleed));
    this.magEl = h('div.mag'); this.resEl = h('div.dim.small'); this.wname = h('div.small.dim', 'Pistola de serviço');
    this.ammo = h('div#hud-ammo.hud-box', this.wname, this.magEl, this.resEl);
    this.chainTier = h('div.tier'); this.chainTm = h('i'); this.chainSub = h('div.small.dim');
    this.chain = h('div#hud-chain.hud-box.hidden', this.chainTier, this.chainSub, h('div.tm', this.chainTm));
    this.feedEl = h('div#hud-feed');
    this.ticks = ['top', 'bottom', 'left', 'right'].map((s) => { const t = h('div.t'); if (s === 'left' || s === 'right') { t.style.width = '8px'; t.style.height = '2px'; } return t; });
    this.dot = h('div.dot'); this.reticle = h('div#reticle', this.dot, ...this.ticks);
    this.promptEl = h('div#prompt.hidden'); this.toasts = h('div#toasts'); this.subs = h('div#subs');
    root.append(this.vig, this.threatsEl, this.objective, this.vitals, this.ammo, this.chain, this.feedEl, this.reticle, this.promptEl, this.toasts, this.subs);
    this._hitT = 0; this._lastObj = '';
  }
  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }
  setObjective(text) { if (text !== this._lastObj) { this.objText.textContent = text; this._lastObj = text; } }

  setNavigation(target, player, yaw, done, total) {
    if (!target) { this.nav.textContent = ''; return; }
    const dx = target.x - player.x, dz = target.z - player.z;
    const angle = Math.atan2(-dx, -dz) - yaw;
    const arrows = ['↑', '↖', '←', '↙', '↓', '↘', '→', '↗'];
    const arrow = arrows[((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8];
    this.nav.textContent = `${arrow} ${Math.round(Math.hypot(dx, dz))} m em linha reta · Etapa ${Math.min(done + 1, total)}/${total}`;
  }
  update(v, dt) {
    this.hpFill.style.width = `${Math.max(0, (v.hp / v.maxHp) * 100)}%`;
    this.hpBar.classList.toggle('low', v.hp / v.maxHp < 0.3);
    this.hpText.textContent = `${Math.ceil(v.hp)}`;
    this.bleed.textContent = v.bleeding ? '● SANGRANDO' : '';
    this.items.textContent = `Kit médico ${v.consumables.medkit ?? 0} · Hemostático ${v.consumables.hemostatic ?? 0}${v.consumables.medkit_adv ? ` · Avançado ${v.consumables.medkit_adv}` : ''}`;
    this.magEl.textContent = v.infinite ? '∞' : `${v.mag}`; this.magEl.classList.toggle('low', !v.infinite && v.mag <= 3);
    this.resEl.textContent = v.reloading ? 'RECARREGANDO…' : v.using ? 'USANDO ITEM…' : v.infinite ? 'Capacitor' : `Reserva ${v.reserve}`;
    // retículo dinâmico: afastamento proporcional à dispersão
    const px = Math.max(5, Math.tan(v.spreadDeg * DEG) / Math.tan((v.fov * DEG) / 2) * (innerHeight / 2));
    const [t, b, l, r] = this.ticks;
    t.style.transform = `translate(-1px, ${-px - 8}px)`; b.style.transform = `translate(-1px, ${px}px)`; l.style.transform = `translate(${-px - 8}px, -1px)`; r.style.transform = `translate(${px}px, -1px)`;
    this.reticle.className = v.reticle + (this._hitT > 0 ? ' hit' : '');
    this._hitT = Math.max(0, this._hitT - dt);
    this.reticle.style.opacity = v.aiming || v.reticle === 'enemy' ? 1 : 0.75;
  }
  hitMarker() { this._hitT = 0.12; }
  damageFlash() { this.vig.style.opacity = 0.9; setTimeout(() => { this.vig.style.opacity = 0; }, 140); }
  setChain(count, remainingMs, windowMs, tier, hidden) {
    if (hidden || count < 1) { this.chain.classList.add('hidden'); return; }
    this.chain.classList.remove('hidden');
    this.chainTier.textContent = `${tier || 'CADEIA'} x${count}`; this.chainSub.textContent = `${(remainingMs / 1000).toFixed(1)}s`;
    this.chainTm.style.width = `${Math.max(0, Math.min(100, (remainingMs / windowMs) * 100))}%`;
  }
  feed(r, hideStyle) {
    if (r.kind === 'style' && hideStyle) return;
    const row = h('div', r.label ? h('span.lbl', `${r.label}  `) : null, r.cc ? h('span.cc', `+${r.cc} CC`) : null, r.pe ? h('span.pe', `+${r.pe} ESTILO`) : null);
    this.feedEl.append(row); setTimeout(() => row.remove(), 2700);
    while (this.feedEl.children.length > 6) this.feedEl.firstChild.remove();
  }
  toast(text, kind = '') { const t = h(`div.toast${kind ? '.' + kind : ''}`, text); this.toasts.append(t); setTimeout(() => t.remove(), 5300); while (this.toasts.children.length > 3) this.toasts.firstChild.remove(); }
  setPrompt(text, progress = null) {
    if (!text) { this.promptEl.classList.add('hidden'); return; }
    this.promptEl.classList.remove('hidden');
    this.promptEl.replaceChildren(...[h('div', { html: text }), progress != null ? h('div.prog', h('i', { style: { width: `${progress * 100}%` } })) : null].filter(Boolean));
  }
  subtitle(who, text) { this.subs.replaceChildren(who ? h('span.line', h('span.who', who + ':'), text) : ''); }
  /** Indicadores de ameaça fora da tela — só para ameaça concreta (GDD 4.4). */
  setThreats(list) {
    const n = list.length;
    while (this.threatsEl.children.length < n) this.threatsEl.append(h('div.threat'));
    while (this.threatsEl.children.length > n) this.threatsEl.lastChild.remove();
    list.forEach((a, i) => {
      const el = this.threatsEl.children[i], cx = innerWidth / 2, cy = innerHeight / 2, R = Math.min(cx, cy) * 0.78;
      el.style.left = `${cx + Math.sin(a) * R - 11}px`; el.style.top = `${cy - Math.cos(a) * R - 10}px`; el.style.transform = `rotate(${a}rad)`;
    });
  }
}
