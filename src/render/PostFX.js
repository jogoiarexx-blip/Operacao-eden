import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { gradeShader } from './gradeShader.js';
import { QUALITY } from '../core/Settings.js';

const DAMAGE_DECAY_S = 0.4;

/** Lista (pura) de passes do pós-processamento para o nível `postfx`. */
export function passesFor(quality) {
  if (quality === 'full') return ['render', 'sao', 'bloom', 'grade', 'output'];
  if (quality === 'bloom') return ['render', 'bloom', 'grade', 'output'];
  return ['render', 'grade', 'output'];
}

const toColor = (v) => (Array.isArray(v) ? new THREE.Color(v[0], v[1], v[2]) : new THREE.Color(v));

export class PostFX {
  /** `createPass(name)` e `composer` injetáveis para testes sem WebGL. */
  constructor(renderer, scene, camera, { createPass, composer } = {}) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.createPass = createPass ?? ((n) => this._defaultPass(n));
    this.injected = !!createPass;
    this.composer = composer ?? null;
    this.passes = new Map();      // nome -> passe
    this.passNames = [];
    this.effectivePreset = 'grade';
    this.w = 1; this.h = 1; this.dpr = 1; this.time = 0; this.damage = 0;
    this.gradeCfg = null; this.requested = 'grade';
    this.rtKey = null;
  }

  _detectSoft() {
    this.soft = false;
    try { const gl = this.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); this.soft = /swiftshader|llvmpipe|software|basic render|warp/i.test(String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '')); } catch { /* ignora */ }
  }

  /** Alvo do composer: 8-bit sem MSAA no Baixo e em renderizador por software; HalfFloat + MSAA 4x em bloom/full. */
  _makeTarget(eff) {
    if (this.soft === undefined) this._detectSoft();
    const ldr = this.soft || eff === 'grade';
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return new THREE.WebGLRenderTarget(size.x || 1, size.y || 1, { type: ldr ? THREE.UnsignedByteType : THREE.HalfFloatType, samples: ldr ? 0 : 4 });
  }

  _ensureComposer(eff = 'grade') {
    if (this.injected) return;
    const key = this.soft || eff === 'grade' ? 'ldr' : 'hdr';
    if (!this.composer) { this.composer = new EffectComposer(this.renderer, this._makeTarget(eff)); this.rtKey = key; if (this.renderer.info) this.renderer.info.autoReset = false; }
    else if (this.rtKey !== key) { this.composer.reset(this._makeTarget(eff)); this.rtKey = key; }   // reset() descarta os alvos antigos
  }

  _defaultPass(name) {
    const size = new THREE.Vector2(this.w * this.dpr, this.h * this.dpr);
    switch (name) {
      case 'render': return new RenderPass(this.scene, this.camera);
      case 'sao': { const p = new SAOPass(this.scene, this.camera); p.params.saoIntensity = 0.012; p.params.saoScale = 8; p.params.saoKernelRadius = 24; return p; }
      case 'bloom': return new UnrealBloomPass(size, 0.3, 0.4, 0.92);
      case 'grade': { const p = new ShaderPass({ ...gradeShader, uniforms: THREE.UniformsUtils.clone(gradeShader.uniforms) }); return p; }
      case 'output': return new OutputPass();
      default: throw new Error('passe desconhecido: ' + name);
    }
  }

  /** `qualityId` ('low'|'medium'|'high') ou o nível direto ('grade'|'bloom'|'full'). */
  setPreset(qualityId) {
    let level = QUALITY[qualityId]?.postfx ?? qualityId;
    if (this.soft === undefined && !this.injected) this._detectSoft();
    this.requested = level;
    if (this.soft && level !== 'grade') level = 'grade';   // software: sem bloom/SAO (inviável e instável)
    let names = passesFor(level), eff = names.includes('sao') ? 'full' : names.includes('bloom') ? 'bloom' : 'grade';
    const built = this._build(names);
    if (!built) {
      if (eff === 'grade') { console.warn('PostFX: nenhum passe disponível; renderização direta'); this._apply([], 'grade'); return; }
      console.warn('PostFX: falha ao criar passes; usando preset grade');
      names = passesFor('grade'); eff = 'grade';
      if (!this._build(names)) { this._apply([], 'grade'); return; }
    }
    this._apply(names, eff);
  }

  /** Cria os passes que faltam; devolve false (descartando os novos) se algum falhar. */
  _build(names) {
    const fresh = [];
    try {
      for (const n of names) if (!this.passes.has(n) && !fresh.find((f) => f[0] === n)) fresh.push([n, this.createPass(n)]);
    } catch (e) {
      console.warn('PostFX: createPass falhou —', e?.message ?? e);
      for (const [, p] of fresh) p.dispose?.();
      return false;
    }
    for (const [n, p] of fresh) this.passes.set(n, p);
    return true;
  }

  _apply(names, eff) {
    for (const [n, p] of [...this.passes]) if (!names.includes(n)) { p.dispose?.(); this.passes.delete(n); }
    this.passNames = names; this.effectivePreset = eff;
    if (names.length) this._ensureComposer(eff);
    if (this.composer && this.composer.passes) {
      this.composer.passes.length = 0;
      for (const n of names) this.composer.addPass(this.passes.get(n));
    }
    this.setSize(this.w, this.h, this.dpr);
    if (this.gradeCfg) this.setGrade(this.gradeCfg);
  }

  setSize(w, h, dpr = 1) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.composer?.setPixelRatio?.(dpr); this.composer?.setSize?.(w, h);
    for (const [n, p] of this.passes) { const k = n === "bloom" && !this.injected ? 0.5 : 1; p.setSize?.(w * dpr * k, h * dpr * k); }
  }

  setGrade({ vignette, grain, tint } = {}) {
    this.gradeCfg = { vignette, grain, tint };
    const u = this.passes.get('grade')?.uniforms; if (!u) return;
    if (vignette != null) u.uVignette.value = vignette;
    if (grain != null) u.uGrain.value = this.requested === 'grade' ? 0 : grain;   // grão só no Médio/Alto
    if (tint?.shadow != null) u.uTintShadow.value = toColor(tint.shadow);
    if (tint?.light != null) u.uTintLight.value = toColor(tint.light);
  }

  pulseDamage(intensity) { this.damage = Math.max(this.damage, Math.min(1, Math.max(0, intensity))); }

  render(dt) {
    this.time += dt;
    this.damage = Math.max(0, this.damage - dt / DAMAGE_DECAY_S);
    const u = this.passes.get('grade')?.uniforms;
    if (u) { u.uDamage.value = this.damage; u.uTime.value = this.time; }
    if (this.renderer?.info) this.renderer.info.reset();   // autoReset=false: contadores cobrem o quadro inteiro
    if (this.composer && this.passNames.length) this.composer.render(dt);
    else this.renderer?.render(this.scene, this.camera);
  }

  dispose() {
    for (const p of this.passes.values()) p.dispose?.();
    this.passes.clear(); this.passNames = [];
    this.composer?.dispose?.();
  }
}
