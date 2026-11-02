/**
 * Áudio 100% procedural (sem assets de terceiros, GDD 12.3). Camadas: ambiente (chuva/vento), tensão, sinais CORO.
 * Sons espacializados por estéreo + atenuação por distância. Limite de vozes simultâneas.
 */
export class AudioEngine {
  constructor() { this.ctx = null; this.vol = { master: 0.8, sfx: 1, ambient: 0.7 }; this.voices = 0; this.maxVoices = 14; this.threat = 0; this.listener = { x: 0, z: 0, yaw: 0 }; this.suspended = false; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !this.suspended) this.ctx.resume(); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return;
    try {
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.connect(ctx.destination);
      this.sfx = ctx.createGain(); this.sfx.connect(this.master);
      this.amb = ctx.createGain(); this.amb.connect(this.master);
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      this.noiseBuf = buf;
      const white = ctx.createBuffer(1, len, ctx.sampleRate), wd = white.getChannelData(0); for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1; this.whiteBuf = white;
      const rain = ctx.createBufferSource(); rain.buffer = white; rain.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500; const rg = ctx.createGain(); rg.gain.value = 0.06;
      rain.connect(f); f.connect(rg); rg.connect(this.amb); rain.start();
      const wind = ctx.createBufferSource(); wind.buffer = buf; wind.loop = true;
      const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420; const wg = ctx.createGain(); wg.gain.value = 0.35;
      wind.connect(wf); wf.connect(wg); wg.connect(this.amb); wind.start();
      this.windGain = wg;
      const drone = ctx.createOscillator(); drone.type = 'sawtooth'; drone.frequency.value = 43;
      const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 160; this.tension = ctx.createGain(); this.tension.gain.value = 0;
      drone.connect(df); df.connect(this.tension); this.tension.connect(this.amb); drone.start();
      this.applyVolumes();
    } catch { this.ctx = null; }
  }
  applyVolumes() { if (!this.ctx) return; this.master.gain.value = this.vol.master; this.sfx.gain.value = this.vol.sfx; this.amb.gain.value = this.vol.ambient; }
  setVolumes(m, s, a) { this.vol = { master: m, sfx: s, ambient: a }; this.applyVolumes(); }
  /** Pausa efetivamente todo o áudio de jogo (GDD 12.3). */
  suspend() { this.suspended = true; this.ctx?.suspend?.(); }
  resume() { this.suspended = false; this.ctx?.resume?.(); }
  setListener(x, z, yaw) { this.listener.x = x; this.listener.z = z; this.listener.yaw = yaw; }
  setThreat(v) { this.threat = v; if (this.ctx) { this.tension.gain.setTargetAtTime(v * 0.12, this.ctx.currentTime, 0.4); this.windGain.gain.setTargetAtTime(0.35 - v * 0.15, this.ctx.currentTime, 0.6); } }

  _out(x, z, baseGain = 1) {
    const ctx = this.ctx; const g = ctx.createGain();
    let pan = 0, att = 1;
    if (x !== undefined) {
      const dx = x - this.listener.x, dz = z - this.listener.z, d = Math.hypot(dx, dz);
      const rx = Math.cos(this.listener.yaw), rz = -Math.sin(this.listener.yaw);
      pan = d > 0.1 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0; att = 1 / (1 + d * 0.09);
    }
    g.gain.value = baseGain * att;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.sfx); } else g.connect(this.sfx);
    return g;
  }
  _voice(fn) { if (!this.ctx || this.suspended || this.voices >= this.maxVoices) return; this.voices++; try { fn(this.ctx, this.ctx.currentTime); } catch { /* ignora */ } setTimeout(() => { this.voices = Math.max(0, this.voices - 1); }, 1500); }
  noiseBurst(out, t, dur, hp, lp, gain) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.whiteBuf; s.loop = true;
    const a = ctx.createBiquadFilter(); a.type = 'highpass'; a.frequency.value = hp; const b = ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = lp;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(a); a.connect(b); b.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(out, t, f0, f1, dur, type, gain) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  play(name, x, z) {
    this.ensure();
    this._voice((ctx, t) => {
      const out = this._out(x, z);
      switch (name) {
        case 'shot': this.noiseBurst(out, t, 0.18, 400, 6000, 0.9); this.tone(out, t, 160, 45, 0.16, 'sine', 0.8); break;
        case 'dry': this.tone(out, t, 1800, 1500, 0.04, 'square', 0.15); break;
        case 'reload': this.tone(out, t, 700, 500, 0.05, 'square', 0.12); this.tone(out, t + 0.5, 520, 900, 0.06, 'square', 0.14); this.tone(out, t + 1.1, 900, 650, 0.05, 'square', 0.12); break;
        case 'hit': this.noiseBurst(out, t, 0.1, 200, 1800, 0.6); this.tone(out, t, 120, 60, 0.12, 'sine', 0.5); break;
        case 'hurt': this.noiseBurst(out, t, 0.2, 80, 900, 0.7); this.tone(out, t, 90, 50, 0.25, 'sine', 0.7); break;
        case 'roar': this.tone(out, t, 220, 70, 0.9, 'sawtooth', 0.35); this.noiseBurst(out, t, 0.9, 150, 1200, 0.25); break;
        case 'spotted': this.tone(out, t, 340, 150, 0.45, 'sawtooth', 0.28); break;
        case 'windup': this.tone(out, t, 90, 130, 0.8, 'sawtooth', 0.3); this.noiseBurst(out, t, 0.7, 1500, 5000, 0.12); break;
        case 'lunge': this.noiseBurst(out, t, 0.25, 300, 3000, 0.35); break;
        case 'death': this.tone(out, t, 260, 40, 0.8, 'sawtooth', 0.3); break;
        case 'thunder': this.noiseBurst(out, t, 2.4, 20, 280, 1.0); break;
        case 'pickup': this.tone(out, t, 660, 990, 0.14, 'triangle', 0.25); this.tone(out, t + 0.1, 990, 1320, 0.16, 'triangle', 0.2); break;
        case 'ui': this.tone(out, t, 520, 780, 0.07, 'triangle', 0.18); break;
        case 'deny': this.tone(out, t, 220, 160, 0.14, 'square', 0.18); break;
        case 'buy': this.tone(out, t, 500, 1000, 0.12, 'triangle', 0.25); this.tone(out, t + 0.1, 1000, 1500, 0.18, 'triangle', 0.2); break;
        case 'coro': for (let i = 0; i < 3; i++) this.tone(out, t + i * 0.5, 196, 190, 0.34, 'sine', 0.4); for (let i = 0; i < 3; i++) this.tone(out, t + 2.1 + i * 0.5, 196, 190, 0.34, 'sine', 0.4); break;
        case 'creak': this.tone(out, t, 90, 70, 0.9, 'sawtooth', 0.15); this.noiseBurst(out, t, 0.9, 300, 900, 0.25); break;
        case 'zap': this.noiseBurst(out, t, 0.3, 1200, 8000, 0.5); this.tone(out, t, 1200, 200, 0.3, 'sawtooth', 0.25); break;
        case 'beacon': this.tone(out, t, 330, 660, 0.4, 'sine', 0.3); this.tone(out, t + 0.4, 660, 990, 0.5, 'sine', 0.3); break;
        case 'gate': this.tone(out, t, 70, 55, 1.6, 'sawtooth', 0.3); this.noiseBurst(out, t, 1.6, 100, 700, 0.3); break;
        default: break;
      }
    });
  }
}
