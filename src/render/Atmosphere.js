import * as THREE from 'three';
import { QUALITY } from '../core/Settings.js';
import { createRng } from '../core/rng.js';

/**
 * Atmosfera noturna (só visual, fora da simulação): cone volumétrico falso da lanterna (aditivo, com ruído),
 * poeira no feixe e quads de névoa rasteira. Tudo é criado só quando `QUALITY[q].volumetric` e é dono dos próprios
 * recursos (geometrias, materiais, textura), liberados em setQuality/dispose. Nada aqui é alvo de raycast nem escreve profundidade.
 */
const NO_RAY = () => {};
/** Contraste da sombra da lua: baseline suave, 1 durante o relâmpago (a intensidade da luz já sobe em SectorScenery). */
export const MOON_SHADOW_BASE = 0.75;
const CONE_LEN = 15, CONE_R = 3.2, DUST = 36, FOG_N = 8, FOG_MED = 4, FOG_SPAN = 56;

const CONE_VS = `varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const CONE_FS = `uniform float uTime; uniform float uI; uniform vec3 uColor; varying vec3 vP; varying vec3 vN; varying vec3 vV;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
void main(){
  float t = clamp(vP.z / ${CONE_LEN.toFixed(1)}, 0.0, 1.0);
  float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
  float ang = atan(vP.y, vP.x);
  float noise = 0.65 + 0.35 * n(vec2(ang * 2.0 + uTime * 0.25, t * 6.0 - uTime * 0.6));
  float a = uI * rim * noise * smoothstep(0.0, 0.08, t) * pow(1.0 - t, 1.6) * 0.3;
  gl_FragColor = vec4(uColor * a, a);
}`;

/** Textura de névoa: ruído de valor suave com queda radial (borda 0 → sem arestas visíveis nos quads). */
function makeFogTexture(size = 64) {
  const rng = createRng(7717), g = 8, grid = Array.from({ length: g * g }, () => rng.next()), data = new Uint8Array(size * size * 4);
  const at = (x, y) => grid[((y % g) + g) % g * g + ((x % g) + g) % g];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * g, v = y / size * g, x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1), nv = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    const r = Math.hypot(x / size - 0.5, y / size - 0.5) * 2, fall = Math.max(0, 1 - r * r), val = Math.max(0, (nv - 0.25) * 1.4) * fall * fall;
    const i = (y * size + x) * 4; data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.min(255, val * 255);
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}

export function createAtmosphere({ scene, quality = 'medium', data }) {
  const group = new THREE.Group(); group.name = 'atmosphere'; scene.add(group);
  let t = 0, cone = null, dust = null, fogQuads = [], own = [];          // own: tudo que este módulo criou e deve liberar
  const _r = new THREE.Vector3(), _d = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3();

  const track = (o) => { own.push(o); return o; };
  function build(q) {
    teardown();
    if (!QUALITY[q]?.volumetric) return;
    // cone da lanterna: ápice na origem, eixo +Z (Object3D.lookAt aponta +Z)
    const cg = track(new THREE.ConeGeometry(CONE_R, CONE_LEN, 20, 1, true)); cg.translate(0, -CONE_LEN / 2, 0); cg.rotateX(-Math.PI / 2);
    const cm = track(new THREE.ShaderMaterial({ vertexShader: CONE_VS, fragmentShader: CONE_FS, uniforms: { uTime: { value: 0 }, uI: { value: 1 }, uColor: { value: new THREE.Color(0xfff1d0) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    cone = new THREE.Group(); cone.name = 'flashlightCone'; cone.visible = false; cone.frustumCulled = false;
    const cmesh = new THREE.Mesh(cg, cm); cmesh.frustumCulled = false; cmesh.raycast = NO_RAY; cone.add(cmesh);
    // poeira em suspensão dentro do feixe (coordenadas locais do cone)
    const rng = createRng(4242), pg = track(new THREE.BufferGeometry()), arr = new Float32Array(DUST * 3), seeds = [];
    for (let i = 0; i < DUST; i++) { seeds.push({ z: rng.next(), a: rng.next() * 6.28, r: Math.sqrt(rng.next()), s: 0.3 + rng.next() * 0.7 }); }
    pg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pm = track(new THREE.PointsMaterial({ color: 0xfff6dc, size: 0.025, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    dust = new THREE.Points(pg, pm); dust.frustumCulled = false; dust.raycast = NO_RAY; dust.userData.seeds = seeds; cone.add(dust);
    group.add(cone);
    // névoa rasteira
    const tex = track(makeFogTexture()), fcol = scene.fog?.color ? scene.fog.color.clone().lerp(new THREE.Color(0x9fb4b8), 0.45) : new THREE.Color(0x6f8588);
    const fm = track(new THREE.MeshBasicMaterial({ map: tex, color: fcol, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide }));
    const fg = track(new THREE.PlaneGeometry(16, 16)); fg.rotateX(-Math.PI / 2);
    const fr = createRng(1313); fogQuads = [];
    const fogN = q === 'high' ? FOG_N : FOG_MED;   // quads translúcidos grandes são caros em fill-rate: metade no Médio
    for (let i = 0; i < fogN; i++) {
      const m = new THREE.Mesh(fg, fm); m.name = 'fogQuad'; m.raycast = NO_RAY; m.frustumCulled = false;
      m.userData = { bx: fr.range(-FOG_SPAN / 2, FOG_SPAN / 2), bz: fr.range(-FOG_SPAN / 2, FOG_SPAN / 2), y: 0.35 + fr.next() * 0.9, ph: fr.next() * 6.28, sp: 0.15 + fr.next() * 0.25, sc: 0.9 + fr.next() * 0.9 };
      m.rotation.y = fr.next() * 6.28; m.scale.setScalar(m.userData.sc); fogQuads.push(m); group.add(m);
    }
  }
  function teardown() {
    for (const c of [...group.children]) group.remove(c);
    for (const o of own) o.dispose?.();
    own = []; cone = null; dust = null; fogQuads = [];
  }
  build(quality);

  return {
    group,
    setQuality(q) { quality = q; build(q); },
    /** camera: { pos, dir }; player: { x, z }; flashlight: bool; lightning: 0..1 (força do relâmpago); moon: DirectionalLight opcional. */
    update(dt, { player, flashlight, camera, lightning = 0, moon } = {}) {
      t += dt;
      if (moon?.shadow) moon.shadow.intensity = lightning > 0.3 ? 1 : MOON_SHADOW_BASE;   // sombra contrastada só durante o flash; função pura do estado, sempre restaurada
      if (!cone || !camera) return;
      const on = !!flashlight; cone.visible = on;
      if (on) {
        _d.set(camera.dir.x, camera.dir.y, camera.dir.z).normalize(); _r.crossVectors(_d, UP).normalize();
        cone.position.set(camera.pos.x, camera.pos.y, camera.pos.z).addScaledVector(_r, 0.28).addScaledVector(UP, -0.32).addScaledVector(_d, 0.4);
        _p.copy(cone.position).add(_d); cone.lookAt(_p);
        const u = cone.children[0].material.uniforms; u.uTime.value = t; u.uI.value = 1 + lightning * 0.6;
        const a = dust.geometry.attributes.position, S = dust.userData.seeds;
        for (let i = 0; i < DUST; i++) {
          const s = S[i], z = ((s.z + t * 0.02 * s.s) % 1) * CONE_LEN, rr = (z / CONE_LEN) * CONE_R * 0.85 * s.r, ang = s.a + t * 0.15 * s.s;
          a.setXYZ(i, Math.cos(ang) * rr, Math.sin(ang) * rr + Math.sin(t * 0.8 + i) * 0.04, z + 0.5);
        }
        a.needsUpdate = true;
      }
      if (player) for (const m of fogQuads) {
        const d = m.userData, tx = d.bx + Math.sin(t * d.sp + d.ph) * 2.5, tz = d.bz + Math.cos(t * d.sp * 0.8 + d.ph) * 2.5;
        // ancorado ao mundo, reciclado em torno do jogador
        m.position.set(tx + Math.round((player.x - tx) / FOG_SPAN) * FOG_SPAN, d.y, tz + Math.round((player.z - tz) / FOG_SPAN) * FOG_SPAN);
      }
    },
    dispose() { teardown(); scene.remove(group); },
  };
}
