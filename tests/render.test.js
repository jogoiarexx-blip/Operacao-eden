import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { createAtmosphere, MOON_SHADOW_BASE } from '../src/render/Atmosphere.js';
import { QUALITY } from '../src/core/Settings.js';
import { generatePixels, getTexture, disposeTextures, textureCacheSize } from '../src/render/ProceduralTextures.js';
import { getMaterial, disposeMaterials, disposeRenderResources } from '../src/render/Materials.js';

describe('presets gráficos', () => {
  it('QUALITY tem as chaves novas nos 3 níveis', () => {
    expect(QUALITY.low).toMatchObject({ postfx: 'grade', pbr: false, moonShadow: false, grass: 0, particles: 80, decals: 12, volumetric: false });
    expect(QUALITY.medium).toMatchObject({ postfx: 'bloom', pbr: true, moonShadow: true, grass: 0.6, particles: 220, decals: 40, volumetric: true });
    expect(QUALITY.high).toMatchObject({ postfx: 'full', pbr: true, moonShadow: true, grass: 1.0, particles: 400, decals: 80, volumetric: true });
    expect(QUALITY.low.shadowMap).toBe(0);
  });
});
describe('texturas procedurais', () => {
  afterEach(() => disposeTextures());
  it('generatePixels é determinístico e depende da seed', () => {
    const a = generatePixels('dirt', 7, 32), b = generatePixels('dirt', 7, 32), c = generatePixels('dirt', 8, 32);
    expect(a).toBeInstanceOf(Uint8ClampedArray);
    expect(a.length).toBe(32 * 32 * 4);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });
  it('todos os tipos geram pixels opacos', () => {
    for (const k of ['dirt', 'mud', 'gravel', 'bark', 'scales', 'cloth', 'concrete', 'metal', 'foliage']) {
      const p = generatePixels(k, 1, 16); expect(p.length).toBe(16 * 16 * 4); expect(p[3]).toBe(255);
    }
  });
  it('getTexture usa cache e disposeTextures esvazia', () => {
    const t = getTexture('bark', { seed: 1, size: 32 });
    expect(getTexture('bark', { seed: 1, size: 32 })).toBe(t);
    expect(textureCacheSize()).toBe(1);
    disposeTextures();
    expect(textureCacheSize()).toBe(0);
  });
});
describe('correções de revisão', () => {
  afterEach(() => disposeRenderResources());
  it('repeat diferente → textura própria', () => {
    const a = getTexture('dirt', { size: 16, repeat: 2 }), b = getTexture('dirt', { size: 16, repeat: 5 });
    expect(a).not.toBe(b); expect(a.repeat.x).toBe(2); expect(b.repeat.x).toBe(5);
    expect(getTexture('dirt', { size: 16, repeat: 2 })).toBe(a);
  });
  it('disposeRenderResources esvazia os dois caches', () => {
    getMaterial('bark', 'high'); expect(textureCacheSize()).toBeGreaterThan(0);
    disposeRenderResources(); expect(textureCacheSize()).toBe(0);
    expect(getMaterial('bark', 'high').map).toBeTruthy();
  });
  it('texturas são quase neutras (cor do papel é o tint)', () => {
    for (const k of ['dirt', 'mud', 'gravel', 'bark', 'scales', 'cloth', 'concrete', 'metal', 'foliage']) {
      const p = generatePixels(k, 3, 32); let r = 0, g = 0, b = 0; for (let i = 0; i < p.length; i += 4) { r += p[i]; g += p[i + 1]; b += p[i + 2]; }
      const n = p.length / 4; expect(Math.abs(r - g) / n).toBeLessThan(10); expect(Math.abs(g - b) / n).toBeLessThan(10); expect(r / n).toBeGreaterThan(180);
    }
  });
  it('accent muda a textura de scales (e só dela)', () => {
    expect(Array.from(generatePixels('scales', 1, 32, { accent: 0xff0000 }))).not.toEqual(Array.from(generatePixels('scales', 1, 32)));
    expect(Array.from(generatePixels('dirt', 1, 16, { accent: 0xff0000 }))).toEqual(Array.from(generatePixels('dirt', 1, 16)));
    expect(getMaterial('scales', 'high', { accent: 0xff0000 }).map).not.toBe(getMaterial('scales', 'high').map);
  });
});
describe('accent assado', () => {
  afterEach(() => disposeRenderResources());
  it('scales com accent: material branco, faixas ≈ accent, base ≈ cor do papel', () => {
    const m = getMaterial('scales', 'high', { color: 0x5f8a4a, accent: 0xff0000 });
    expect(m.color.getHex()).toBe(0xffffff);
    const p = m.map.image.data; let bands = 0, base = 0, br = 0, bg = 0, bb = 0, ar = 0;
    for (let i = 0; i < p.length; i += 4) { if (p[i] > p[i + 1] * 2) { bands++; ar += p[i]; } else { base++; br += p[i]; bg += p[i + 1]; bb += p[i + 2]; } }
    expect(bands).toBeGreaterThan(0); expect(base).toBeGreaterThan(0);
    expect(ar / bands).toBeGreaterThan(200);
    expect(br / base / 255).toBeGreaterThan(0x5f / 255 * 0.8); expect(bg / base).toBeGreaterThan(bb / base); expect(Math.abs(br / base - 0x5f)).toBeLessThan(40);
  });
  it('accent só entra no hash de scales', () => {
    expect(getMaterial('cloth', 'high', { accent: 1 })).toBe(getMaterial('cloth', 'high', { accent: 2 }));
  });
});
describe('materiais', () => {
  afterEach(() => { disposeMaterials(); disposeTextures(); });
  it('Lambert no Baixo, Standard no Alto, com cache', () => {
    expect(getMaterial('cloth', 'low').type).toBe('MeshLambertMaterial');
    expect(getMaterial('cloth', 'high').type).toBe('MeshStandardMaterial');
    expect(getMaterial('cloth', 'high')).toBe(getMaterial('cloth', 'high'));
    expect(getMaterial('cloth', 'high', { color: 0xff0000 })).not.toBe(getMaterial('cloth', 'high'));
  });
  it('todos os papéis existem; lâmpada emissiva', () => {
    for (const r of ['ground', 'bark', 'foliage', 'skin', 'cloth', 'clothDark', 'scales', 'metal', 'concrete', 'wood', 'emissiveLamp']) expect(getMaterial(r, 'medium').flatShading).toBe(true);
    expect(getMaterial('emissiveLamp', 'high', { emissive: 0xffeeaa }).emissiveIntensity).toBeGreaterThan(1);
  });
});
describe('atmosfera', () => {
  const mk = (quality) => { const scene = new THREE.Scene(); const atmo = createAtmosphere({ scene, quality, data: { bounds: [-40, -40, 40, 40] } }); return { scene, atmo }; };
  const upd = (atmo) => atmo.update(0.016, { player: { x: 1, z: 2 }, flashlight: true, camera: { pos: { x: 0, y: 1.6, z: 0 }, dir: { x: 0, y: 0, z: -1 } }, lightning: 0 });
  it('Baixo não cria cone nem névoa', () => {
    const { scene, atmo } = mk('low'); expect(atmo.group.children.length).toBe(0); upd(atmo); expect(atmo.group.children.length).toBe(0); atmo.dispose(); expect(scene.children.includes(atmo.group)).toBe(false);
  });
  it('Médio cria cone e névoa; dispose remove o grupo', () => {
    const { scene, atmo } = mk('medium'); expect(atmo.group.children.length).toBeGreaterThan(0); expect(scene.children).toContain(atmo.group); upd(atmo);
    const fog = atmo.group.children.filter((c) => c.name === 'fogQuad'); expect(fog.length).toBeGreaterThanOrEqual(6); expect(fog.length).toBeLessThanOrEqual(10);
    expect(atmo.group.getObjectByName('flashlightCone')).toBeTruthy();
    atmo.group.traverse((o) => { if (o.isMesh || o.isPoints) { expect(o.material.depthWrite).toBe(false); const hit = []; o.raycast(new THREE.Raycaster(), hit); expect(hit.length).toBe(0); } });
    atmo.dispose(); expect(scene.children.includes(atmo.group)).toBe(false); expect(atmo.group.children.length).toBe(0);
  });
  it('setQuality alterna sem acumular filhos', () => {
    const { scene, atmo } = mk('medium'); const n = atmo.group.children.length;
    atmo.setQuality('low'); expect(atmo.group.children.length).toBe(0);
    atmo.setQuality('high'); expect(atmo.group.children.length).toBe(n);
    for (let i = 0; i < 5; i++) { atmo.setQuality('medium'); atmo.setQuality('low'); }
    atmo.setQuality('medium'); expect(atmo.group.children.length).toBe(n); expect(scene.children.length).toBe(1); atmo.dispose();
  });
  it('lanterna desligada esconde o cone', () => {
    const { atmo } = mk('medium'); atmo.update(0.016, { player: { x: 0, z: 0 }, flashlight: false, camera: { pos: { x: 0, y: 1.6, z: 0 }, dir: { x: 0, y: 0, z: -1 } }, lightning: 0 });
    expect(atmo.group.getObjectByName('flashlightCone').visible).toBe(false); atmo.dispose();
  });
});
describe('relâmpago e sombra da lua', () => {
  it('shadow.intensity sobe a 1 no flash e volta exatamente ao baseline (também em low)', () => {
    for (const q of ['low', 'medium']) {
      const scene = new THREE.Scene(), atmo = createAtmosphere({ scene, quality: q, data: {} }), moon = new THREE.DirectionalLight(); moon.shadow.intensity = MOON_SHADOW_BASE;
      const u = (l) => atmo.update(0.016, { player: { x: 0, z: 0 }, flashlight: false, camera: { pos: { x: 0, y: 1, z: 0 }, dir: { x: 0, y: 0, z: -1 } }, lightning: l, moon });
      u(0); expect(moon.shadow.intensity).toBe(0.75); u(1); expect(moon.shadow.intensity).toBe(1); u(0.8); expect(moon.shadow.intensity).toBe(1); u(0); expect(moon.shadow.intensity).toBe(MOON_SHADOW_BASE); atmo.dispose();
    }
  });
});

// ---------- Etapa 3: chão, árvores e vegetação ----------
import { buildScenery } from '../src/world/SectorScenery.js';
import { scatterVegetation, buildPathMask } from '../src/render/Vegetation.js';
import treesBefore from './fixtures/trees-before.json';
import ch01Data from '../src/data/chapter01.json';
import ch02Data from '../src/data/chapter02.json';
import { createRng } from '../src/core/rng.js';

const fakeWorld = () => { const cyl = [], adds = []; return { cyl, adds, add: (c) => adds.push(c), addCyl: (id, x, z, r, h, y0, fl) => cyl.push([id, x, z, r, h, y0, fl]) }; };
const distPoly = (x, z, pts) => { let b = Infinity; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); b = Math.min(b, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return b; };
const tilesOf = (o) => (o.tiles ?? [o]);
const instPositions = (o) => { const out = [], m = new THREE.Matrix4(); for (const im of tilesOf(o)) for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); out.push([m.elements[12], m.elements[14]]); } return out; };
const allMatrices = (o) => tilesOf(o).flatMap((im) => Array.from(im.instanceMatrix.array.slice(0, im.count * 16)));

describe('etapa 3: árvores com posições/colisores idênticos', () => {
  afterEach(() => disposeRenderResources());
  for (const [k, d] of [['ch01', ch01Data], ['ch02', ch02Data]]) {
    it(`${k}: posições e colisores iguais aos de antes (qualquer qualidade)`, () => {
      for (const q of ['low', 'medium', 'high']) {
        const w = fakeWorld(), s = buildScenery({ world: w, data: d, quality: q });
        const pick = (t) => ({ x: t.x, z: t.z, r: t.r, h: t.h, lean: t.lean, tone: t.tone });
        expect(s.trees.map(pick)).toEqual(treesBefore[k].trees);
        expect(w.cyl).toEqual(treesBefore[k].cyl);
        s.dispose();
      }
    });
    it(`${k}: vegetação decorativa não gera colisores`, () => {
      const lo = fakeWorld(), hi = fakeWorld();
      buildScenery({ world: lo, data: d, quality: 'low' }).dispose(); buildScenery({ world: hi, data: d, quality: 'high' }).dispose();
      expect(hi.adds.length).toBe(lo.adds.length); expect(hi.cyl.length).toBe(lo.cyl.length);
    });
  }
  it('variantes de árvore: as 3 aparecem e vêm de rng separado', () => {
    const s = buildScenery({ world: fakeWorld(), data: ch01Data, quality: 'high' });
    expect(new Set(s.trees.map((t) => t.variant))).toEqual(new Set(['pine', 'broadleaf', 'palm']));
    s.dispose();
  });
  it('máscara de trilhas é por capítulo e é descartada no dispose; texturas compartilhadas não', () => {
    const before = textureCacheSize();
    const s = buildScenery({ world: fakeWorld(), data: ch01Data, quality: 'medium' });
    let disposed = 0; s.groundMask.addEventListener('dispose', () => disposed++);
    const cached = textureCacheSize(); expect(cached).toBeGreaterThan(before);
    s.dispose(); expect(disposed).toBe(1); expect(textureCacheSize()).toBe(cached);
  });
  it('buildPathMask pinta a trilha e deixa o resto vazio', () => {
    const { data, width, height } = buildPathMask(ch01Data, 128);
    const [bx0, bz0, bx1, bz1] = ch01Data.bounds, gW = bx1 - bx0 + 20, gD = bz1 - bz0 + 20, px = (x, z) => { const u = Math.floor(((x - (bx0 + bx1) / 2 + gW / 2) / gW) * width), v = Math.floor(((z - (bz0 + bz1) / 2 + gD / 2) / gD) * height); return data[(v * width + u) * 4]; };
    const [x, z] = ch01Data.paths[0].pts[1]; expect(px(x, z)).toBeGreaterThan(200); expect(px(bx0 + 1, bz0 + 1)).toBe(0);
  });
});

describe('scatterVegetation', () => {
  const run = (quality, d = ch01Data, seed = 5) => scatterVegetation({ data: d, quality, rng: createRng(seed) });
  it('low: sem capim; demais camadas existem e são baratas', () => {
    const v = run('low'); expect(v.grass).toBeNull();
    expect((v.ferns?.count ?? 0) + v.rocks.count + v.logs.count).toBeGreaterThan(0); expect(v.ferns.count).toBeLessThan(300);
    v.dispose();
  });
  it('densidade escala com QUALITY.grass', () => {
    const m = run('medium'), h = run('high');
    expect(h.grass.count).toBeGreaterThan(m.grass.count); expect(m.grass.count / h.grass.count).toBeCloseTo(0.6, 1);
    m.dispose(); h.dispose();
  });
  for (const [k, d] of [['ch01', ch01Data], ['ch02', ch02Data]]) it(`${k} high: nada a <1,2 m de trilha nem dentro de estruturas com colisão`, () => {
    const v = run('high', d); let minPath = Infinity, inside = 0, n = 0;
    for (const key of ['grass', 'ferns', 'rocks', 'logs']) for (const [x, z] of instPositions(v[key])) {
      n++;
      for (const p of d.paths) { minPath = Math.min(minPath, distPoly(x, z, p.pts)); for (const [px, pz] of p.pts) minPath = Math.min(minPath, Math.hypot(x - px, z - pz)); }
      for (const s of d.structures) if (s.flags.length) {
        if (s.kind === 'box' ? Math.abs(x - s.pos[0]) < s.size[0] / 2 && Math.abs(z - s.pos[1]) < s.size[2] / 2 : Math.hypot(x - s.pos[0], z - s.pos[1]) < s.r) inside++;
      }
    }
    expect(n).toBeGreaterThan(1000); expect(minPath).toBeGreaterThanOrEqual(1.2); expect(inside).toBe(0);
    v.dispose();
  });
  it('mesma seed → mesmas matrizes; seed diferente → outras', () => {
    const a = run('high'), b = run('high'), c = run('high', ch01Data, 6);
    expect(allMatrices(a.grass)).toEqual(allMatrices(b.grass));
    expect(allMatrices(a.rocks)).toEqual(allMatrices(b.rocks));
    expect(allMatrices(a.grass)).not.toEqual(allMatrices(c.grass));
    a.dispose(); b.dispose(); c.dispose();
  });
  it('vento é por material próprio (clone), nunca no material compartilhado; sem sombra', () => {
    const v = run('high'), shared = getMaterial('foliage', 'high', undefined);
    expect(v.grass.material).not.toBe(shared); expect(shared.onBeforeCompile).toBe(THREE.Material.prototype.onBeforeCompile);
    expect(v.grass.material.customProgramCacheKey()).toMatch(/veg/); expect(v.grass.tiles.every((t) => t.castShadow === false && t.frustumCulled === true)).toBe(true);
    expect(v.grass.material.userData.shared).toBeFalsy(); v.dispose();
  });
  it('dispose libera geometrias, clones e instâncias (materiais em cache ficam)', () => {
    const v = run('high'); const ev = { geo: 0, clone: 0, shared: 0 };
    for (const m of [v.grass, v.ferns, v.rocks, v.logs]) { m.geometry.addEventListener('dispose', () => ev.geo++); m.material.addEventListener('dispose', () => (m.material.userData.shared ? ev.shared++ : ev.clone++)); }
    v.dispose(); expect(ev.geo).toBe(4); expect(ev.clone).toBe(2); expect(ev.shared).toBe(0);
  });
});

describe('vegetação em blocos', () => {
  it('capim em vários blocos com esfera de contorno; update esconde blocos distantes e só mexe em visible', () => {
    const v = scatterVegetation({ data: ch01Data, quality: 'high', rng: createRng(5) });
    expect(v.grass.tiles.length).toBeGreaterThan(6);
    for (const t of v.grass.tiles) expect(t.boundingSphere.radius).toBeGreaterThan(0);
    v.update(1, 0.016, { x: -40, y: 1, z: -44 });
    const vis = v.grass.tiles.filter((t) => t.visible).length; expect(vis).toBeGreaterThan(0); expect(vis).toBeLessThan(v.grass.tiles.length);
    v.update(1, 0.016, { x: 0, y: 1, z: 0 }); expect(v.grass.tiles.filter((t) => t.visible).length).toBeGreaterThan(vis);
    v.dispose();
  });
});

// ---------- Etapa 3b: estruturas detalhadas, chuva e poças ----------
import collidersBefore from './fixtures/colliders-before.json';
import { createRain, RAIN_COUNTS } from '../src/render/Rain.js';
import { buildStructureDetail, buildPuddles } from '../src/render/Structures.js';

describe('etapa 3b: estruturas e props sem mudar colisores', () => {
  afterEach(() => disposeRenderResources());
  for (const [k, d] of [['ch01', ch01Data], ['ch02', ch02Data]]) {
    it(`${k}: colisores (ids e caixas) idênticos ao snapshot de antes, em qualquer qualidade`, () => {
      for (const q of ['low', 'medium', 'high']) {
        const w = fakeWorld(), s = buildScenery({ world: w, data: d, quality: q });
        expect(w.adds).toEqual(collidersBefore[k].adds);
        expect(w.cyl).toEqual(collidersBefore[k].cyl);
        s.dispose();
      }
    });
    it(`${k}: 3–5 poças em terreno aberto, fora de qualquer estrutura`, () => {
      expect(d.puddles.length).toBeGreaterThanOrEqual(3); expect(d.puddles.length).toBeLessThanOrEqual(5);
      for (const [x, z, r] of d.puddles) {
        for (const s of d.structures) {
          const hx = s.kind === 'box' ? s.size[0] / 2 : s.r, hz = s.kind === 'box' ? s.size[2] / 2 : s.r;
          if (s.size && s.size[1] < 0.15) continue;                         // lajes/pisos rasos não contam
          const inside = Math.abs(x - s.pos[0]) < hx + r && Math.abs(z - s.pos[1]) < hz + r;
          expect(inside, `${k} poça ${x},${z} em ${s.id}`).toBe(false);
        }
      }
    });
    it(`${k}: detalhes e poças são malhas extras, poucos draw calls, materiais compartilhados intactos`, () => {
      const lamp = getMaterial('emissiveLamp', 'medium', { color: 0xc9a35a, emissive: 0xd9a85a }), before = lamp.emissive.getHex(), ei = lamp.emissiveIntensity;
      const s = buildScenery({ world: fakeWorld(), data: d, quality: 'medium' });
      const det = s.group.getObjectByName('structure-detail'), pud = s.group.getObjectByName('puddles');
      expect(det.children.length).toBeGreaterThan(0); expect(det.children.length).toBeLessThanOrEqual(5); expect(pud.children.length).toBe(1);
      for (const m of det.children) expect(m.castShadow).toBe(false);
      expect(pud.children[0].material.roughness).toBeLessThan(0.15);
      expect(lamp.emissive.getHex()).toBe(before); expect(lamp.emissiveIntensity).toBe(ei);
      s.dispose();
      expect(lamp.userData.shared).toBe(true); expect(getMaterial('emissiveLamp', 'medium', { color: 0xc9a35a, emissive: 0xd9a85a })).toBe(lamp);   // cache intacto
    });
  }
  it('poça no Baixo usa material Lambert simples; trocar a qualidade reconstrói o detalhe', () => {
    const s = buildScenery({ world: fakeWorld(), data: ch01Data, quality: 'low' });
    expect(s.group.getObjectByName('puddles').children[0].material.isMeshLambertMaterial).toBe(true);
    s.setQuality(QUALITY.high);
    expect(s.group.getObjectByName('puddles').children[0].material.isMeshStandardMaterial).toBe(true);
    expect(s.group.children.filter((o) => o.name === 'structure-detail').length).toBe(1);
    s.dispose();
  });
  it('detalhe é determinístico e não consome o rng do cenário (árvores iguais)', () => {
    const a = buildStructureDetail({ data: ch02Data, quality: 'high' }), b = buildStructureDetail({ data: ch02Data, quality: 'high' });
    expect(a.group.children.map((m) => m.geometry.attributes.position.count)).toEqual(b.group.children.map((m) => m.geometry.attributes.position.count));
    a.dispose(); b.dispose(); buildPuddles({ data: {}, quality: 'low' }).dispose();
  });
});

describe('etapa 3b: chuva em riscos com respingos', () => {
  it('riscos (LineSegments), contagem por preset e pool de respingos limitado', () => {
    const r = createRain({ seed: 7, quality: 'medium' });
    expect(r.drops.isLineSegments).toBe(true); expect(r.splashes.isLineSegments).toBe(true);
    expect(r.drops.geometry.drawRange.count).toBe(RAIN_COUNTS.medium.drops * 2);
    r.setQuality('high'); expect(r.drops.geometry.drawRange.count).toBe(RAIN_COUNTS.high.drops * 2); expect(r.splashes.geometry.drawRange.count).toBe(RAIN_COUNTS.high.splash * 8);
    r.setQuality('low'); expect(r.drops.geometry.drawRange.count).toBe(RAIN_COUNTS.low.drops * 2); expect(r.splashes.visible).toBe(false);
    expect(RAIN_COUNTS.low.drops).toBeLessThan(RAIN_COUNTS.medium.drops); expect(RAIN_COUNTS.medium.drops).toBeLessThan(RAIN_COUNTS.high.drops);
  });
  it('update não realoca buffers, segue a câmera e mantém gotas na caixa', () => {
    const r = createRain({ seed: 7, quality: 'high' }), pos = r.drops.geometry.attributes.position.array, spl = r.splashes.geometry.attributes.position.array;
    const cam = { x: 200, y: 2, z: -150 };
    for (let i = 0; i < 300; i++) r.update(0.016, cam);
    expect(r.drops.geometry.attributes.position.array).toBe(pos); expect(r.splashes.geometry.attributes.position.array).toBe(spl);
    for (let i = 0; i < RAIN_COUNTS.high.drops; i++) { expect(Math.abs(pos[i * 6 + 3] - cam.x)).toBeLessThanOrEqual(18.01); expect(Math.abs(pos[i * 6 + 5] - cam.z)).toBeLessThanOrEqual(18.01); expect(pos[i * 6 + 4]).toBeGreaterThanOrEqual(-0.01); }
    let live = 0; for (let i = 0; i < RAIN_COUNTS.high.splash; i++) if (spl[i * 24 + 1] > 0) live++;
    expect(live).toBeGreaterThan(0);
  });
  it('o cenário respeita o toggle de chuva do preset (Baixo desliga; Médio liga)', () => {
    const s = buildScenery({ world: fakeWorld(), data: ch01Data, quality: 'medium' });
    s.setQuality(QUALITY.low); expect(s.rain.group.visible).toBe(false);
    s.setQuality(QUALITY.medium); expect(s.rain.group.visible).toBe(true);
    s.update(1, 0.016, { x: 0, y: 2, z: 30 }, { x: 0, y: 0, z: -1 }, { x: 0, z: 30 });
    s.dispose();
  });
});
