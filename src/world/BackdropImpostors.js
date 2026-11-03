import * as THREE from 'three';

/**
 * Fundos ilustrados (2D) para os dois capítulos, inspirados na técnica de matte
 * painting dos survival horrors clássicos. Desenho realizado uma vez no Canvas:
 * NÃO usa rede, GLB, colisões, IA, raycasts ou timers.
 *
 * As imagens ficam em 2 CanvasTextures reutilizadas por quatro planos cada.
 * O jogador não alcança esses planos: todos ficam fora de data.bounds.
 */
export const BACKDROP_TEXTURE_SIZE = Object.freeze({ width: 1024, height: 256 });
export const BACKDROP_OFFSETS = Object.freeze({ near: 15, far: 29 });

const THEMES = {
  1: {
    sky: '#233538', haze: '#405b5c', ridge: '#263b3f', distant: '#1a3535',
    silhouette: '#102b29', trunks: '#132724', glint: '#84968b',
  },
  2: {
    sky: '#25363f', haze: '#56676b', ridge: '#303e47', distant: '#24373e',
    silhouette: '#1b3036', trunks: '#213037', glint: '#b3a88b',
  },
};

const randomFrom = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

function mountainPath(ctx, y, amplitude, random, width, height, color) {
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, y);
  for (let x = 0; x < width; x += 12) {
    // Ondas periódicas: borda esquerda e direita do panorama coincidem exatamente.
    const angle = x / width * Math.PI * 2;
    const wave = (Math.sin(angle * 3) * .7 + Math.cos(angle * 7) * .3 + Math.sin(angle * 13) * .14) * amplitude;
    ctx.lineTo(x, y - wave);
  }
  ctx.lineTo(width, y - amplitude * .3); // mesmo perfil da coluna x=0
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function paintForest(ctx, { width: w, height: h }, random, colors, near) {
  if (!near) {
    mountainPath(ctx, 163, 29, random, w, h, colors.ridge);
    mountainPath(ctx, 192, 18, random, w, h, colors.distant);
  }
  // Muitas árvores pequenas pintadas na MESMA textura, sem geometria 3D extra.
  const amount = near ? 95 : 145;
  for (let i = 0; i < amount; i++) {
    const x = random() * w;
    const baseY = (near ? 215 : 200) + random() * 48;
    const height = (near ? 31 : 20) + random() * (near ? 76 : 55);
    const width = height * (0.13 + random() * .12);
    ctx.globalAlpha = near ? .52 + random() * .30 : .52 + random() * .40;
    ctx.fillStyle = i % 3 ? colors.silhouette : colors.distant;
    // Desenhar também as cópias além da borda fecha a costura na textura 360°.
    for (const wrap of [-w, 0, w]) {
      const px = x + wrap;
      if (px < -width || px > w + width) continue;
      ctx.fillRect(px - width * .075, baseY - height * .3, width * .15, height * .4);
      for (let layer = 0; layer < 3; layer++) {
        const yy = baseY - height + layer * height * .19;
        const ww = width * (0.45 + layer * .22);
        ctx.beginPath();
        ctx.moveTo(px, yy);
        ctx.lineTo(px - ww, baseY - height * .31 + layer * height * .10);
        ctx.lineTo(px + ww, baseY - height * .31 + layer * height * .10);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
  if (!near) {
    // Reflexos longínquos do posto e da mata úmida, discretos para não gerar ruído.
    for (let i = 0; i < 18; i++) {
      const x = random() * w, y = 193 + random() * 36;
      ctx.fillStyle = 'rgba(151,173,156,0.13)';
      ctx.fillRect(x, y, 1 + random() * 2, 1);
    }
  }
}

function paintFacility(ctx, { width: w, height: h }, random, colors, near) {
  if (!near) {
    mountainPath(ctx, 155, 22, random, w, h, colors.ridge);
    mountainPath(ctx, 191, 9, random, w, h, colors.distant);
    // Silhuetas de galpões e prédios técnicos em segundo plano.
    for (let i = 0; i < 18; i++) {
      const x = i * 60 + random() * 16 - 15;
      const width = 37 + random() * 55, y = 173 + random() * 33, roof = 8 + random() * 15;
      for (const wrap of [-w, 0, w]) {
        const px = x + wrap;
        if (px + width < 0 || px > w) continue;
        ctx.fillStyle = colors.silhouette;
        ctx.fillRect(px, y, width, h - y);
        ctx.beginPath();
        ctx.moveTo(px - 4, y); ctx.lineTo(px + width * .45, y - roof);
        ctx.lineTo(px + width + 6, y); ctx.closePath(); ctx.fill();
        // Janelas distantes, todas na pintura 2D (sem luzes reais).
        for (let n = 0; n < 3; n++) {
          ctx.fillStyle = 'rgba(205,166,99,0.24)';
          ctx.fillRect(px + 7 + n * 12, y + 10, 4, 2);
        }
      }
    }
    // Torres de vigilância e antenas: só linhas 2D no mapa.
    ctx.strokeStyle = 'rgba(24,42,47,.96)';
    ctx.lineWidth = 3;
    for (const x of [123, 421, 761, 922]) {
      const y = 166 + random() * 17, top = y - 46 - random() * 34;
      ctx.beginPath(); ctx.moveTo(x - 13, y + 41); ctx.lineTo(x, top);
      ctx.lineTo(x + 13, y + 41); ctx.moveTo(x - 10, y - 3); ctx.lineTo(x + 10, y - 3);
      ctx.moveTo(x - 5, y - 29); ctx.lineTo(x + 5, y - 29);
      ctx.stroke();
      ctx.fillStyle = '#536363'; ctx.fillRect(x - 8, top - 3, 16, 5);
      ctx.fillStyle = '#a15442'; ctx.fillRect(x - 2, top - 7, 3, 2);
    }
  } else {
    // Cercas em perspectiva e canos/estruturas além do limite do posto.
    ctx.fillStyle = colors.silhouette;
    ctx.fillRect(0, 227, w, 29);
    ctx.strokeStyle = '#253d43';
    ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += w / 32) {
      ctx.beginPath(); ctx.moveTo(x, 189); ctx.lineTo(x, 245); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 7, 187); ctx.lineTo(x, 180); ctx.lineTo(x + 7, 187); ctx.stroke();
    }
    for (let y = 196; y <= 232; y += 14) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(70,84,91,.45)';
    ctx.lineWidth = 1;
    for (let x = -w / 32; x <= w; x += w / 32) {
      ctx.beginPath(); ctx.moveTo(x, 196); ctx.lineTo(x + 26, 228); ctx.stroke();
    }
    for (const x of [220, 635, 894]) {
      ctx.fillStyle = '#263a3d'; ctx.fillRect(x, 160, 4, 66);
      ctx.fillStyle = '#82918a'; ctx.fillRect(x - 7, 157, 18, 3);
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
