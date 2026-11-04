import * as THREE from 'three';

/** Gradação de cor: vinheta, grão, tingimento sombra/luz e flash de dano. Roda antes do OutputPass (espaço linear). */
export const gradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.03 },
    uTime: { value: 0 },
    uTintShadow: { value: new THREE.Color(0.9, 1.0, 1.05) },
    uTintLight: { value: new THREE.Color(1.04, 1.0, 0.94) },
    uDamage: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uVignette, uGrain, uTime, uDamage;
    uniform vec3 uTintShadow, uTintLight;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb *= mix(uTintShadow, uTintLight, smoothstep(0.02, 0.6, l));
      vec2 d = vUv - 0.5;
      float v = 1.0 - uVignette * smoothstep(0.25, 0.85, length(d) * 1.35);
      c.rgb *= v;
      c.rgb += (hash(vUv * 1024.0 + fract(uTime) * 91.0) - 0.5) * uGrain;
      float edge = smoothstep(0.2, 0.8, length(d) * 1.4);
      c.rgb = mix(c.rgb, vec3(0.55, 0.02, 0.02), uDamage * (0.18 + 0.5 * edge));
      gl_FragColor = c;
    }
  `,
};
