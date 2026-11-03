import { describe, it, expect } from 'vitest';
import { getChapter } from '../src/chapters/index.js';
import {
  DETAIL_SHOW_DISTANCE, DETAIL_HIDE_DISTANCE, createRegionalDetailStream,
} from '../src/world/RegionalDetailStream.js';

describe('Streaming de detalhes dos setores sem recarregar o capítulo', () => {
  it.each(['ch01', 'ch02'])('%s carrega buffers ao aproximar, descarta ao afastar e recria ao voltar', id => {
    const data = getChapter(id).data;
    const stream = createRegionalDetailStream({ data });
    const all = stream.stats();
    expect(all).toMatchObject({ regions: 5, activeRegions: [], created: 0, disposed: 0, drawCalls: 0 });
    expect(DETAIL_HIDE_DISTANCE).toBeGreaterThan(DETAIL_SHOW_DISTANCE);
    stream.update({ x: 1000, z: 1000 });
    expect(stream.stats().drawCalls).toBe(0);
    const loc = data.chapter === 1 ? { x: 27, z: 13 } : { x: 8, z: 28 };
    expect(stream.update(loc)).toBe(true);
    const near = stream.stats();
    expect(near.activeRegions.length).toBeGreaterThan(0);
    expect(near.instances).toBeGreaterThan(0);
    expect(near.drawCalls).toBeLessThanOrEqual(5);
    expect(stream.update(loc)).toBe(false); // não recompila geometria por frame
    stream.setQuality(0.4);
    expect(stream.stats().instances).toBeLessThan(near.instances);
    stream.setQuality(1);
    expect(stream.stats().instances).toBe(near.instances);
    stream.update({ x: 1000, z: 1000 });
    expect(stream.stats()).toMatchObject({ activeRegions: [], drawCalls: 0 });
    expect(stream.stats().disposed).toBe(near.drawCalls);
    stream.update(loc);
    expect(stream.stats().created).toBeGreaterThan(near.created);
    stream.dispose();
    expect(stream.stats().drawCalls).toBe(0);
    expect(stream.stats().disposed).toBe(stream.stats().created);
  });

  it('não cria colisores, pickups ou objetos de campanha no mapa', () => {
    for (const id of ['ch01', 'ch02']) {
      const data = getChapter(id).data;
      const before = JSON.stringify({ zones: data.zones, pickups: data.pickups, structures: data.structures, encounters: data.encounters });
      const stream = createRegionalDetailStream({ data });
      stream.update({ x: 0, z: 0 });
      stream.dispose();
      expect(JSON.stringify({ zones: data.zones, pickups: data.pickups, structures: data.structures, encounters: data.encounters })).toBe(before);
    }
  });
});
