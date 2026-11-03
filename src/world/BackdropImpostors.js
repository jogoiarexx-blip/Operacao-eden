import * as THREE from 'three';

/**
 * Fundos ilustrados (2D) para os dois capítulos, inspirados na técnica de matte
 * painting dos survival horrors clássicos. Desenho realizado uma vez no Canvas:
 * NÃO usa rede, GLB, colisões, IA, raycasts ou timers.
 *
 * Cada capítulo usa apenas 2 CanvasTextures de 1024×256 sobre cilindros 360°.
 * O jogador não alcança esses cilindros: a superfície fica fora de data.bounds.
 */
export const BACKDROP_TEXTURE_SIZE = Object.freeze({ width: 1024, height: 256 });
export const BACKDROP_OFFSETS = Object.freeze({ near: 15, far: 29 });

const THEMES = {
  1: {
    sky: '#233538', haze: '#435d5b', ridge: '#415d5a',
    distant: '#2e4b48', silhouette: '#17332f', trunks: '#243a34',
    glint: '#a7b5a2', mid: '#33534b', canopy: '#24433b',
  },
  2: {
    sky: '#25363f', haze: '#56676b', ridge: '#4a626b',
    distant: '#344c54', silhouette: '#20383e', trunks: '#304a4e',
    glint: '#c6b69a', mid: '#3f5459', canopy: '#2b4447',
  },
};

const randomFrom = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

/** Perfil com bordas e tangentes contínuas em 360 graus (sem degrau no mipmap). */
export function panoramicRidgeY(x, width, baseline, amplitude) {
  const a = x / width * Math.PI * 2;
  const broad = Math.cos(2 * a) * .41 + Math.cos(5 * a) * .22;
  const crags = Math.cos(9 * a) * .12 + Math.cos(16 * a) * .055;
  // Assimetria interna que converge suavemente a zero na costura.
  const asymmetry = Math.sin(3 * a) * (1 - Math.cos(a)) * .13;
  return baseline - (broad + crags + asymmetry) * amplitude;
}

function mountainPath(ctx, y, amplitude, random, width, height, color) {
  ctx.beginPath(); ctx.moveTo(0, height);
  ctx.lineTo(0, panoramicRidgeY(0, width, y, amplitude));
  for (let x = 6; x < width; x += 6) {
    ctx.lineTo(x, panoramicRidgeY(x, width, y, amplitude));
  }
  ctx.lineTo(width, panoramicRidgeY(width, width, y, amplitude));
  ctx.lineTo(width, height); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  // Pequena luz fria no divisor rocha/céu, já pré-pintada.
  ctx.beginPath();
  for (let x = 0; x <= width; x += 8) {
    const yy = panoramicRidgeY(x, width, y, amplitude);
    if (!x) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
  }
  ctx.strokeStyle = 'rgba(174,195,181,.10)'; ctx.lineWidth = .85; ctx.stroke();
}

// Repete só os elementos que tocam x=0/x=largura: não fica emenda nos 360 graus.
function wrapDraw(width, x, margin, draw) {
  for (const shift of [-width, 0, width]) {
    const px = x + shift;
    if (px >= -margin && px <= width + margin) draw(px);
  }
}

function drawCanopy(ctx, cx, cy, size, color, random) {
  ctx.fillStyle = color;
  // Copas irregulares: volumes arredondados em vez de 3 triângulos repetidos.
  for (let l = 0; l < 4; l++) {
    // Ruído geométrico determinístico: copiar nos extremos não muda a copa.
    const dx = (l - 1.5) * size * .43 + Math.sin(l * 2.3 + cy * .09) * size * .07;
    const dy = (l % 2) * size * .14 - size * .10;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, size * (.51 + Math.sin(l * 3.1 + cy * .13) * .07), 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintForest(ctx, { width: w, height: h }, random, colors, near) {
  if (!near) {
    // Três planos atmosféricos, sem novas texturas, montanhas com massa e relevo.
    mountainPath(ctx, 137, 28, random, w, h, colors.ridge);
    mountainPath(ctx, 168, 21, random, w, h, colors.mid);
    mountainPath(ctx, 198, 13, random, w, h, colors.distant);
    ctx.strokeStyle = 'rgba(147,175,170,.10)'; ctx.lineWidth = 1;
    // Estrias discretas em paredes rochosas longínquas.
    for (let i = 0; i < 35; i++) {
      const x = random() * w;
      const y = panoramicRidgeY(x, w, 137, 28) + 7 + random() * 12;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4 - random() * 12, y + 8 + random() * 11); ctx.stroke();
    }
  }
  // Em primeiro plano predominam árvores tropicais de copa larga, mescladas
  // com palmeiras e coníferas distantes; nenhuma árvore extra na GPU.
  const amount = near ? 70 : 126;
  for (let i = 0; i < amount; i++) {
    const x = random() * w;
    const base = (near ? 235 : 217) + random() * (near ? 33 : 28);
    const height = (near ? 35 : 16) + random() * (near ? 64 : 46);
    const radius = height * (.18 + random() * .11);
    const trunk = Math.max(1.2, radius * .16);
    const color = i % 5 === 0 ? colors.mid : (i % 3 === 0 ? colors.distant : colors.canopy);
    const alpha = near ? .70 : .57;
    const treeAlpha = alpha + random() * .18;
    wrapDraw(w, x, radius * 2.5, px => {
      ctx.globalAlpha = treeAlpha;
      ctx.fillStyle = colors.trunks;
      ctx.fillRect(px - trunk / 2, base - height * .64, trunk, height * .64);
      ctx.strokeStyle = colors.trunks; ctx.lineWidth = Math.max(1, trunk * .4);
      ctx.beginPath();
      ctx.moveTo(px, base - height * .4);
      ctx.lineTo(px - radius * .62, base - height * .60);
      ctx.moveTo(px, base - height * .48);
      ctx.lineTo(px + radius * .66, base - height * .68);
      ctx.stroke();
      if (i % 11 === 0) {
        // Copa aguda rara no horizonte; não repetir uma floresta inteira de cones.
        ctx.fillStyle = color;
        for (let t = 0; t < 3; t++) {
          const yy = base - height + t * height * .15, rr = radius * (.45 + t * .25);
          ctx.beginPath(); ctx.moveTo(px, yy - 4); ctx.lineTo(px - rr, yy + height * .27);
          ctx.lineTo(px + rr, yy + height * .27); ctx.closePath(); ctx.fill();
        }
      } else {
        drawCanopy(ctx, px, base - height * .76, radius, color, random);
        ctx.globalAlpha = treeAlpha * .77;
        drawCanopy(ctx, px + radius * .22, base - height * .87, radius * .57, colors.glint, random);
      }
    });
    ctx.globalAlpha = 1;
  }
  if (!near) {
    // Manchas de umidade no fundo pintado, sem partículas nem brilho dinâmico.
    for (let i = 0; i < 28; i++) {
      const x = random() * w, y = 206 + random() * 36;
      ctx.fillStyle = 'rgba(155,190,170,.12)';
      ctx.fillRect(x, y, 1 + random() * 3, 1);
    }
  } else {
    // Folhagem baixa suaviza o encontro da pintura com os objetos 3D.
    for (let i = 0; i < 85; i++) {
      const x = random() * w, y = 236 + random() * 21;
      ctx.globalAlpha = .33 + random() * .22;
      const crownSize = 5 + random() * 4;
      wrapDraw(w, x, 12, px => drawCanopy(ctx, px, y, crownSize, colors.canopy, random));
    }
    ctx.globalAlpha = 1;
  }
}

function paintFacility(ctx, { width: w, height: h }, random, colors, near) {
  if (!near) {
    mountainPath(ctx, 143, 21, random, w, h, colors.ridge);
    mountainPath(ctx, 175, 15, random, w, h, colors.mid);
    mountainPath(ctx, 202, 9, random, w, h, colors.distant);
    // Galpões com telhados assimétricos, venezianas e exaustores: tudo é tinta.
    for (let i = 0; i < 14; i++) {
      const x = i * (w / 14) + (random() - .5) * 17;
      const bw = 40 + random() * 51;
      const y = 164 + random() * 31, roof = 7 + random() * 13;
      wrapDraw(w, x, bw + 10, px => {
        ctx.fillStyle = i % 3 ? colors.silhouette : colors.mid;
        ctx.fillRect(px, y, bw, h - y);
        ctx.beginPath();
        ctx.moveTo(px - 3, y); ctx.lineTo(px + bw * .33, y - roof);
        ctx.lineTo(px + bw * .72, y - roof * .70);
        ctx.lineTo(px + bw + 3, y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(163,183,183,.18)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px + 2, y + 3);
        ctx.lineTo(px + bw - 2, y + 3); ctx.stroke();
        for (let n = 0; n < 4; n++) {
          ctx.fillStyle = n % 3 === 0 ? 'rgba(212,172,111,.35)' : 'rgba(115,147,155,.22)';
          ctx.fillRect(px + 6 + n * (bw - 12) / 4, y + 12, Math.min(7, bw / 9), 3);
        }
        // Faixas de chapa nas paredes.
        ctx.strokeStyle = 'rgba(116,146,151,.18)';
        for (let n = 1; n <= 3; n++) {
          const lx = px + n * bw / 4;
          ctx.beginPath(); ctx.moveTo(lx, y + 22); ctx.lineTo(lx, h); ctx.stroke();
        }
        if (i % 3 === 0) {
          ctx.fillStyle = colors.trunks;
          ctx.fillRect(px + bw * .65, y - roof - 13, 4, 15);
          ctx.fillRect(px + bw * .65 - 5, y - roof - 14, 14, 3);
        }
      });
    }
    // Depósitos cilíndricos, dutos e torres: escala maior, reconhecíveis no céu.
    for (const [x, scale] of [[95, 1], [356, .7], [680, 1], [919, .75]]) {
      wrapDraw(w, x, 32 * scale, px => {
        const width = 31 * scale, y = 179 + (1 - scale) * 13;
        ctx.fillStyle = colors.mid;
        ctx.fillRect(px, y, width, h - y);
        ctx.beginPath(); ctx.arc(px + width / 2, y, width / 2, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(163,187,187,.25)'; ctx.lineWidth = 1.5;
        for (let n = 0; n < 3; n++) {
          ctx.beginPath(); ctx.moveTo(px, y + 13 + n * 14); ctx.lineTo(px + width, y + 13 + n * 14); ctx.stroke();
        }
      });
    }
    ctx.strokeStyle = 'rgba(29,51,56,.94)'; ctx.lineWidth = 2.4;
    for (const x of [129, 427, 754, 967]) {
      const y = 177 + random() * 12, top = y - 58 - random() * 28;
      wrapDraw(w, x, 16, px => {
        ctx.beginPath();
        ctx.moveTo(px - 14, y + 41); ctx.lineTo(px, top);
        ctx.lineTo(px + 14, y + 41);
        ctx.moveTo(px - 10, y - 2); ctx.lineTo(px + 10, y - 2);
        ctx.moveTo(px - 6, y - 30); ctx.lineTo(px + 6, y - 30); ctx.stroke();
        ctx.fillStyle = '#617777'; ctx.fillRect(px - 8, top - 4, 16, 6);
        ctx.fillStyle = 'rgba(210,113,81,.75)'; ctx.fillRect(px - 1, top - 8, 3, 2);
      });
    }
  } else {
    // Corredor externo do complexo: cerca cíclica e canos, sem bloqueio real.
    ctx.fillStyle = colors.silhouette; ctx.fillRect(0, 233, w, 23);
    ctx.strokeStyle = '#385357'; ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += w / 32) {
      ctx.beginPath(); ctx.moveTo(x, 190); ctx.lineTo(x, 247);
      ctx.moveTo(x - 6, 188); ctx.lineTo(x, 181); ctx.lineTo(x + 6, 188);
      ctx.stroke();
    }
    for (let y = 198; y <= 238; y += 13) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(111,138,143,.36)'; ctx.lineWidth = .8;
    for (let x = -32; x <= w; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 199); ctx.lineTo(x + 32, 238); ctx.stroke();
    }
    for (const x of [208, 608, 871]) {
      ctx.fillStyle = colors.trunks; ctx.fillRect(x, 156, 5, 72);
      ctx.fillStyle = '#8e9d99'; ctx.fillRect(x - 7, 153, 19, 4);
      ctx.strokeStyle = 'rgba(115,142,147,.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 3, 167); ctx.lineTo(x + 48, 167);
      ctx.lineTo(x + 58, 178); ctx.stroke();
    }
    // Lâmpadas amarelas fixas na pintura, não criam iluminação dinâmica.
    for (const x of [63, 319, 575, 831]) {
      ctx.fillStyle = 'rgba(212,174,109,.48)'; ctx.fillRect(x, 199, 4, 2);
    }
  }
}

function makeBackdropTexture(chapter, layer, size = BACKDROP_TEXTURE_SIZE) {
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Canvas 2D indisponível para o fundo ilustrado');
  const colors = THEMES[chapter] ?? THEMES[1], near = layer === 'near';
  const rng = randomFrom(chapter * 46721 + (near ? 311 : 713));
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!near) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, colors.sky);
    sky.addColorStop(.6, colors.haze);
    sky.addColorStop(1, colors.distant);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
  }
  if (chapter === 2) paintFacility(ctx, { width: w, height: h }, rng, colors, near);
  else paintForest(ctx, { width: w, height: h }, rng, colors, near);

  // Névoa atmosférica pintada, sem partículas ou shaders animados.
  const mist = ctx.createLinearGradient(0, h * .45, 0, h);
  mist.addColorStop(0, 'rgba(88,119,124,0)');
  mist.addColorStop(.68, near ? 'rgba(57,81,82,.12)' : 'rgba(71,98,102,.23)');
  mist.addColorStop(1, 'rgba(11,28,31,.50)');
  ctx.fillStyle = mist; ctx.fillRect(0, 0, w, h);

  // O céu do plano não vira um retângulo: desaparece nos primeiros pixels.
  ctx.globalCompositeOperation = 'destination-in';
  const alpha = ctx.createLinearGradient(0, 0, 0, h);
  if (near) {
    alpha.addColorStop(0, 'rgba(0,0,0,0)');
    alpha.addColorStop(.46, 'rgba(0,0,0,0)');
    alpha.addColorStop(.69, 'rgba(0,0,0,.5)');
    alpha.addColorStop(1, 'rgba(0,0,0,.95)');
  } else {
    alpha.addColorStop(0, 'rgba(0,0,0,0)');
    alpha.addColorStop(.13, 'rgba(0,0,0,.40)');
    alpha.addColorStop(.34, 'rgba(0,0,0,.94)');
    alpha.addColorStop(1, 'rgba(0,0,0,1)');
  }
  ctx.fillStyle = alpha; ctx.fillRect(0, 0, w, h);
  // Panorama circular: não apagar bordas laterais (criaria uma faixa vazia a 0°).
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Geometria circular e inacessível: raio maior que a distância do centro
 * do mapa a QUALQUER canto, mais a margem da camada.
 * A mesma posição vale para os dois capítulos, sem colisores no mundo.
 */
export function backdropLayout(bounds, layer = 'far') {
  const [x0, z0, x1, z1] = bounds;
  if (!(x0 < x1 && z0 < z1)) throw new Error('bounds inválidos no backdrop');
  const offset = BACKDROP_OFFSETS[layer];
  if (!offset) throw new Error('Camada de backdrop desconhecida');
  const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
  const radius = Math.hypot((x1 - x0) / 2, (z1 - z0) / 2) + offset;
  return {
    id: layer, x, z, radius,
    y: layer === 'near' ? 4.8 : 12.4,
    height: layer === 'near' ? 14 : 30,
    radialSegments: 48,
  };
}

/** Opacidade do panorama ajustada à distância da névoa do preset. */
export function backdropOpacity(fogFar = 78) {
  const t = Math.max(0, Math.min(1, (fogFar - 62) / 30));
  return { far: .35 + t * .34, near: .40 + t * .27 };
}

export function createBackdropImpostors({ bounds, chapter = 1, quality = 'medium' }) {
  const group = new THREE.Group();
  group.name = 'illustrated_backdrop';
  group.userData.backdropChapter = chapter;
  const farTexture = makeBackdropTexture(chapter, 'far');
  const nearTexture = makeBackdropTexture(chapter, 'near');
  const textures = [farTexture, nearTexture];
  const nearGroup = new THREE.Group(); nearGroup.name = 'near_silhouettes';
  group.add(nearGroup);
  const materials = [];
  let planeCount = 0;
  for (const layer of ['far', 'near']) {
    const layout = backdropLayout(bounds, layer);
    const material = new THREE.MeshBasicMaterial({
      map: layer === 'far' ? farTexture : nearTexture,
      transparent: true, opacity: 1, depthWrite: false, depthTest: true,
      fog: false, side: THREE.BackSide, toneMapped: false,
    });
    materials.push(material);
    const target = layer === 'far' ? group : nearGroup;
    // Um único panorama cilíndrico sem tampas: sem cantos e apenas 1 draw call/camada.
    const geometry = new THREE.CylinderGeometry(
      layout.radius, layout.radius, layout.height, layout.radialSegments, 1, true,
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'backdrop_' + layout.id;
    mesh.position.set(layout.x, layout.y, layout.z);
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    mesh.renderOrder = layer === 'far' ? -11 : -10;
    target.add(mesh); planeCount++;
  }
  const api = {
    group, textures, planeCount, nearGroup, materials,
    setQuality(qc) {
      const low = typeof qc === 'string' ? qc === 'low' : (qc?.foliage ?? 1) < .7;
      const fogFar = typeof qc === 'object' ? (qc?.fogFar ?? 78) : ({ low: 62, medium: 78, high: 92 }[qc] ?? 78);
      const opacity = backdropOpacity(fogFar);
      materials[0].opacity = opacity.far;
      materials[1].opacity = opacity.near;
      nearGroup.visible = !low;
    },
    stats() {
      return {
        chapter, planes: planeCount, visiblePlanes: nearGroup.visible ? planeCount : 1,
        textures: textures.length,
        width: BACKDROP_TEXTURE_SIZE.width, height: BACKDROP_TEXTURE_SIZE.height,
        radii: [backdropLayout(bounds, 'far').radius, backdropLayout(bounds, 'near').radius],
        opacity: materials.map(m => m.opacity),
      };
    },
    dispose() {
      // Geometrias e materiais são descartados pelo dispose do SectorScenery.
      for (const texture of textures) texture.dispose();
    },
  };
  api.setQuality(quality);
  return api;
}
