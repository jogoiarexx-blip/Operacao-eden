import lines from '../data/dialogues.json';

/** Fila de legendas (rádio/diálogo). Atualizada pelo relógio de simulação ⇒ pausa congela. Idempotência: quem chama decide. */
export class Dialogue {
  constructor(hud) { this.hud = hud; this.queue = []; this.cur = null; this.t = 0; this.onLine = null; }
  play(id) { const arr = lines[id]; if (!arr) { console.warn('diálogo inexistente', id); return; } this.queue.push(...arr.map((l) => ({ ...l, id }))); }
  clear() { this.queue.length = 0; this.cur = null; this.hud.subtitle(null); }
  get busy() { return !!this.cur || this.queue.length > 0; }
  update(dt) {
    if (!this.cur && this.queue.length) { this.cur = this.queue.shift(); this.t = 0; this.hud.subtitle(this.cur.who, this.cur.text); this.onLine?.(this.cur); }
    if (this.cur) { this.t += dt * 1000; if (this.t >= this.cur.ms) { this.cur = null; this.hud.subtitle(null); } }
  }
}
