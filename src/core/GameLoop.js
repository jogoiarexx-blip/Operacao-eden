/**
 * Game loop ÚNICO com passo fixo (1/60 s), acumulador e limite de substeps (GDD 9.3).
 * - `step(dt)` só roda quando `isRunning()` é verdadeiro (pausa real).
 * - `render(alpha, frameDt)` roda a cada quadro de vídeo.
 * - Iniciar duas vezes não cria dois rAF.
 */
export const FIXED_DT = 1 / 60;
export const MAX_SUBSTEPS = 5;

export class GameLoop {
  constructor({ step, render, isRunning = () => true, raf = (fn) => requestAnimationFrame(fn), now = () => performance.now() }) {
    this.stepFn = step; this.renderFn = render; this.isRunning = isRunning;
    this.raf = raf; this.now = now;
    this.acc = 0; this.last = 0; this.handle = null; this.active = false;
    this.tick = 0;
    this.frameCallbacks = [];
  }
  start() {
    if (this.active) return;               // sem rAF duplicado
    this.active = true; this.last = this.now(); this.acc = 0;
    const frame = () => {
      if (!this.active) return;
      this.handle = this.raf(frame);
      const t = this.now();
      let frameDt = (t - this.last) / 1000;
      this.last = t;
      if (frameDt > 0.25) frameDt = 0.25;  // evita espiral da morte após aba em segundo plano
      this.advance(frameDt);
    };
    this.handle = this.raf(frame);
  }
  /** Separado para permitir testes determinísticos sem rAF. */
  advance(frameDt) {
    let steps = 0;
    if (this.isRunning()) {
      this.acc += frameDt;
      while (this.acc >= FIXED_DT && steps < MAX_SUBSTEPS) {
        this.stepFn(FIXED_DT); this.tick++; this.acc -= FIXED_DT; steps++;
      }
      if (steps === MAX_SUBSTEPS) this.acc = 0;
    } else {
      this.acc = 0;                        // nada acumula durante pausa
    }
    this.renderFn(this.acc / FIXED_DT, frameDt, steps);
  }
  stop() { this.active = false; if (this.handle != null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.handle); this.handle = null; }
}
