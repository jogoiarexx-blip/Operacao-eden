import * as THREE from 'three';
import { createRng } from '../core/rng.js';

/**
 * Chuva em riscos (LineSegments) com respingos de pool próprio. Tudo pré-alocado: nenhuma alocação por quadro.
 * Segue a câmera embrulhando x/z numa caixa em torno dela; só visual (rng derivado, fora da simulação).
 * Contagens por preset (o Baixo mantém a chuva desligada via QUALITY.rain; se ligada, usa a contagem mínima).
 */
const MAX_DROPS = 700, MAX_SPLASH = 96, BOX = 36, H = 16, SPEED = 15, LEN = 0.6, R = BOX / 2;
export const RAIN_COUNTS = { low: { drops: 160, splash: 0 }, medium: { drops: 420, splash: 48 }, high: { drops: 700, splash: 96 } };
const wrap = (p, c) => c + ((((p - c + R) % BOX) + BOX) % BOX) - R;

export function createRain({ seed = 1, quality = 'medium' } = {}) {
  const rng = createRng((seed ^ 0x7a1a) >>> 0);
  const px = new Float32Array(MAX_DROPS), py = new Float32Array(MAX_DROPS), pz = new Float32Array(MAX_DROPS), spd = new Float32Array(MAX_DROPS);
  for (let i = 0; i < MAX_DROPS; i++) { px[i] = rng.range(-R, R); py[i] = rng.range(0, H); pz[i] = rng.range(-R, R); spd[i] = SPEED * rng.range(0.85, 1.15); }
  const dropPos = new Float32Array(MAX_DROPS * 6), dropCol = new Float32Array(MAX_DROPS * 6);
  for (let i = 0; i < MAX_DROPS; i++) dropCol.set([0.02, 0.03, 0.035, 0.34, 0.46, 0.52], i * 6);   // cauda apagada → cabeça clara
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dropPos, 3).setUsage(THREE.DynamicDrawUsage));
  dg.setAttribute('color', new THREE.BufferAttribute(dropCol, 3));
  const mkMat = () => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const drops = new THREE.LineSegments(dg, mkMat()); drops.frustumCulled = false;

  // respingos: 4 traços radiais por respingo (8 vértices), crescem e apagam; ciclo em anel no pool
  const sPos = new Float32Array(MAX_SPLASH * 8 * 3), sCol = new Float32Array(MAX_SPLASH * 8 * 3);
  const sx = new Float32Array(MAX_SPLASH), sz = new Float32Array(MAX_SPLASH), sAge = new Float32Array(MAX_SPLASH).fill(1);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  sg.setAttribute('color', new THREE.BufferAttribute(sCol, 3).setUsage(THREE.DynamicDrawUsage));
  const splashes = new THREE.LineSegments(sg, mkMat()); splashes.frustumCulled = false;
  const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];
  const group = new THREE.Group(); group.name = 'rain'; group.add(drops, splashes);

  let nDrops = 0, nSplash = 0, head = 0;
  const api = {
    group, drops, splashes,
    setQuality(qk) {
      const c = RAIN_COUNTS[qk] ?? RAIN_COUNTS.medium; nDrops = c.drops; nSplash = c.splash;
      dg.setDrawRange(0, nDrops * 2); sg.setDrawRange(0, nSplash * 8); splashes.visible = nSplash > 0;
      if (head >= nSplash) head = 0;
      // limpa os slots acima da nova contagem: sem isso, alto→médio→alto reexibe traços congelados (fantasmas)
      sPos.fill(0, nSplash * 24); sCol.fill(0, nSplash * 24); sAge.fill(1, nSplash);
      sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true;
    },
    update(dt, cam) {
      dt = Math.min(dt, 0.1); if (!(dt > 0)) return;
      const cx = cam.x, cz = cam.z;
      for (let i = 0; i < nDrops; i++) {
        let y = py[i] - spd[i] * dt;
        if (y < 0) {
          y += H;                                              // reaparece no topo com x/z novos
          if (nSplash && (i & 1) === 0) {                      // metade das gotas deixa respingo (só perto da câmera)
            const wx = wrap(px[i], cx), wz = wrap(pz[i], cz);
            if ((wx - cx) * (wx - cx) + (wz - cz) * (wz - cz) < 196) { sx[head] = wx; sz[head] = wz; sAge[head] = 0; head = (head + 1) % nSplash; }
          }
          px[i] = rng.range(-R, R) + cx; pz[i] = rng.range(-R, R) + cz;
        }
        py[i] = y;
        const wx = wrap(px[i], cx), wz = wrap(pz[i], cz), o = i * 6;
        dropPos[o] = wx - 0.07 * LEN; dropPos[o + 1] = y + LEN; dropPos[o + 2] = wz - 0.03 * LEN;     // cauda (inclinada pelo vento)
        dropPos[o + 3] = wx; dropPos[o + 4] = y; dropPos[o + 5] = wz;
      }
      dg.attributes.position.needsUpdate = true;
      if (nSplash) {
        for (let i = 0; i < nSplash; i++) {
          const a = (sAge[i] += dt * 4.5), o = i * 24;              // vida ~0.22 s
          if (a >= 1) { if (a < 1 + dt * 4.5 + 1e-6) { sPos.fill(0, o, o + 24); sCol.fill(0, o, o + 24); } continue; }
          const r0 = 0.04 + a * 0.16, r1 = r0 + 0.07, c = (1 - a) * 0.5;
          for (let k = 0; k < 4; k++) {
            const q = o + k * 6;
            sPos[q] = sx[i] + DX[k] * r0; sPos[q + 1] = 0.04; sPos[q + 2] = sz[i] + DZ[k] * r0;
            sPos[q + 3] = sx[i] + DX[k] * r1; sPos[q + 4] = 0.04 + (1 - a) * 0.05; sPos[q + 5] = sz[i] + DZ[k] * r1;
            sCol[q] = sCol[q + 3] = c * 0.6; sCol[q + 1] = sCol[q + 4] = c * 0.8; sCol[q + 2] = sCol[q + 5] = c * 0.9;
          }
        }
        sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true;
      }
    },
  };
  api.setQuality(quality);
  return api;
}
