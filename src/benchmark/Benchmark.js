import { percentile } from '../core/math.js';

/**
 * Benchmark nativo (GDD 11.3). Funções puras (testáveis) + coletor.
 * Frametime é a métrica principal. Nada é fabricado: dados indisponíveis ficam `null`.
 */
export const BENCH = { warmupMs: 10000, runMs: 60000, quickWarmupMs: 3000, quickRunMs: 20000, seed: 77, sceneId: 'B01', sceneName: 'Selva Profunda' };
const PRESET_ORDER = ['low', 'medium', 'high'];
export const PRESET_LABEL = { low: 'Baixo', medium: 'Médio', high: 'Alto' };

export function summarizeFrames(frameMs) {
  if (!frameMs.length) return { frames: 0, p50: null, p95: null, p99: null, fpsMedian: null, over33: 0, over50: 0, maxFrame: null };
  const s = [...frameMs].sort((a, b) => a - b);
  const p50 = percentile(s, 50);
  return { frames: s.length, p50, p95: percentile(s, 95), p99: percentile(s, 99), fpsMedian: 1000 / p50, over33: s.filter((v) => v > 33.3).length, over50: s.filter((v) => v > 50).length, maxFrame: s[s.length - 1] };
}

/** Recomendação por p95 (GDD 11.3): Alto só é sugerido se o teste foi feito no Alto e estável. */
export function recommend(sum, testedPreset, { valid = true } = {}) {
  if (!valid || sum.p95 == null) return null;
  const idx = PRESET_ORDER.indexOf(testedPreset);
  const stableHigh = sum.p95 <= 18 && sum.over50 === 0 && sum.maxFrame < 250;
  let preset, reason;
  if (testedPreset === 'high') {
    if (stableHigh) { preset = 'high'; reason = `p95 ${sum.p95.toFixed(1)} ms ≤ 18 ms e sem travamentos: Alto confirmado.`; }
    else if (sum.p95 <= 20) { preset = 'medium'; reason = `p95 ${sum.p95.toFixed(1)} ms: estável no Médio, mas não confirmou o Alto.`; }
    else { preset = 'low'; reason = `p95 ${sum.p95.toFixed(1)} ms acima do alvo de 60 FPS (20 ms): recomendado Baixo.`; }
  } else if (testedPreset === 'medium') {
    if (sum.p95 <= 20) { preset = 'medium'; reason = `p95 ${sum.p95.toFixed(1)} ms ≤ 20 ms: Médio estável (rode no Alto para confirmar o Alto).`; }
    else { preset = 'low'; reason = `p95 ${sum.p95.toFixed(1)} ms ${sum.p95 > 36 ? 'acima de 36 ms (abaixo de 30 FPS estável)' : 'acima de 20 ms (60 FPS instável)'}: recomendado Baixo.`; }
  } else {
    preset = 'low';
    reason = sum.p95 <= 36 ? `p95 ${sum.p95.toFixed(1)} ms ≤ 36 ms: Baixo atende a meta de 30 FPS.${sum.p95 <= 20 ? ' Sobra folga: rode o teste no Médio para verificar.' : ''}` : `p95 ${sum.p95.toFixed(1)} ms mesmo no Baixo: reduza a resolução da janela ou feche outros apps.`;
  }
  void idx;
  return { preset, label: PRESET_LABEL[preset], reason };
}

/** Só compara execuções tecnicamente equivalentes (mesma cena, seed, resolução interna, navegador e preset). */
export function compareReports(a, b) {
  const reasons = [];
  if (a.sceneId !== b.sceneId) reasons.push('cenas diferentes');
  if (a.seed !== b.seed) reasons.push('seeds diferentes');
  if (a.mode !== b.mode) reasons.push('modos (completo/rápido) diferentes');
  if (a.env.internalW !== b.env.internalW || a.env.internalH !== b.env.internalH) reasons.push('resolução interna diferente');
  if (a.env.browser !== b.env.browser) reasons.push('navegadores diferentes');
  if (a.env.preset !== b.env.preset) reasons.push('presets diferentes');
  if (a.status !== 'valid' || b.status !== 'valid') reasons.push('uma das execuções não é válida');
  return { comparable: reasons.length === 0, reasons, deltaP95: reasons.length ? null : b.p95 - a.p95 };
}

export class BenchCollector {
  constructor({ mode = 'full', now = () => performance.now() } = {}) {
    this.mode = mode; this.now = now;
    this.warmup = mode === 'quick' ? BENCH.quickWarmupMs : BENCH.warmupMs;
    this.run = mode === 'quick' ? BENCH.quickRunMs : BENCH.runMs;
    this.t0 = null; this.last = null; this.frames = []; this.update = []; this.render = []; this.cam = [];
    this.info = { calls: 0, triangles: 0, geometries: 0, textures: 0 };
    this.invalidReason = null; this.cancelled = false; this.finished = false;
  }
  get elapsed() { return this.t0 == null ? 0 : this.now() - this.t0; }
  get phase() { const e = this.elapsed; return e < this.warmup ? 'warmup' : e < this.warmup + this.run ? 'run' : 'done'; }
  invalidate(reason) { if (!this.invalidReason) this.invalidReason = reason; }
  cancel() { this.cancelled = true; this.finished = true; }
  /** Chamar uma vez por quadro de vídeo, com o timestamp do rAF. */
  frame(ts, { updateMs, renderMs, camMs, info }) {
    if (this.t0 == null) { this.t0 = ts; this.last = ts; return; }
    const dt = ts - this.last; this.last = ts;
    const e = ts - this.t0;
    if (e >= this.warmup && e < this.warmup + this.run) {
      this.frames.push(dt); this.update.push(updateMs); this.render.push(renderMs); this.cam.push(camMs);
      if (info) { this.info.calls = Math.max(this.info.calls, info.calls); this.info.triangles = Math.max(this.info.triangles, info.triangles); this.info.geometries = info.geometries; this.info.textures = info.textures; }
    }
    if (e >= this.warmup + this.run) this.finished = true;
  }
  report(env, build) {
    const sum = summarizeFrames(this.frames), avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const status = this.invalidReason ? 'invalid' : this.cancelled || this.phase !== 'done' ? 'incomplete' : 'valid';
    const camSorted = [...this.cam].sort((a, b) => a - b);
    const rep = {
      id: `bench_${Date.now().toString(36)}`, sceneId: BENCH.sceneId, sceneName: BENCH.sceneName, mode: this.mode, seed: BENCH.seed, build,
      status, invalidReason: this.invalidReason, startedAt: new Date().toISOString(), ...sum,
      updateMsAvg: avg(this.update), renderMsAvg: avg(this.render), cameraRayP95: percentile(camSorted, 95),
      gpuTimer: env.gpuTimer, gpuTimeMs: null,                 // tempo de GPU só com extensão válida (não coletado nesta versão)
      renderer: { ...this.info }, jsHeapMB: env.jsHeapMB ?? null, env,
    };
    rep.recommendation = this.mode === 'full' ? recommend(sum, env.preset, { valid: status === 'valid' }) : null;
    return rep;
  }
}

export function collectEnv({ renderer, canvas, preset, dpr }) {
  const gl = renderer.getContext();
  let gpu = null;
  try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); } catch { /* oculto */ }
  const ua = navigator.userAgent, m = /(Edg|Firefox|Chrome|Safari)\/([\d.]+)/.exec(ua);
  return {
    browser: m ? `${m[1] === 'Edg' ? 'Edge' : m[1]} ${m[2].split('.')[0]}` : 'desconhecido', gpu, cores: navigator.hardwareConcurrency ?? null, memGB: navigator.deviceMemory ?? null,
    cssW: innerWidth, cssH: innerHeight, dpr: +dpr.toFixed(2), internalW: canvas.width, internalH: canvas.height, preset,
    webgl: gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1',
    gpuTimer: { available: !!gl.getExtension?.('EXT_disjoint_timer_query_webgl2') || !!gl.getExtension?.('EXT_disjoint_timer_query') },
    jsHeapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
  };
}
