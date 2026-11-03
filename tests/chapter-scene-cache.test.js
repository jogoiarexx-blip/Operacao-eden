import { describe, it, expect, vi } from 'vitest';
import { ChapterSceneCache } from '../src/world/ChapterSceneCache.js';

describe('Cache limitado de cenas estáticas para backtracking', () => {
  it('reutiliza o mesmo mundo e buffers sem chamar dispose durante o retorno', () => {
    const dispose = vi.fn(), cache = new ChapterSceneCache({ capacity: 1, dispose });
    const forest = { world: {}, scenery: { group: {} }, props: {} };
    const outpost = { world: {}, scenery: { group: {} }, props: {} };
    expect(cache.take('ch01')).toBeNull();
    cache.store('ch01', forest);
    expect(cache.stats().cached).toEqual(['ch01']);
    expect(cache.take('ch01')).toBe(forest);
    cache.store('ch02', outpost);
    expect(cache.take('ch02')).toBe(outpost);
    expect(cache.stats()).toMatchObject({ hits: 2, misses: 1, disposed: 0 });
    cache.store('ch01', forest);
    cache.clear();
    expect(dispose).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledWith(forest);
    expect(cache.stats().cached).toEqual([]);
  });

  it('evita crescimento de VRAM e libera os recursos expulsos em ordem LRU', () => {
    const disposed = [], cache = new ChapterSceneCache({
      capacity: 1, dispose: x => disposed.push(x.id),
    });
    cache.store('ch01', { id: 'ch01' });
    cache.store('ch02', { id: 'ch02' });
    cache.store('ch03', { id: 'ch03' });
    expect(cache.stats()).toMatchObject({
      cached: ['ch03'], disposed: 2, stored: 3, capacity: 1,
    });
    expect(disposed).toEqual(['ch01', 'ch02']);
    cache.clear();
    expect(disposed).toEqual(['ch01', 'ch02', 'ch03']);
  });

  it('sem cache: descarta props e buffers imediatamente', () => {
    const props = { dispose: vi.fn() }, scenery = { dispose: vi.fn() };
    const cache = new ChapterSceneCache({ capacity: 0 });
    expect(cache.store('ch01', { props, scenery })).toBe(false);
    expect(props.dispose).toHaveBeenCalledOnce();
    expect(scenery.dispose).toHaveBeenCalledOnce();
    expect(cache.stats()).toMatchObject({ cached: [], disposed: 1 });
  });

  it('substituir cenário com mesmo id não deixa materiais órfãos', () => {
    const disposed = [], cache = new ChapterSceneCache({
      capacity: 1, dispose: x => disposed.push(x.id),
    });
    cache.store('ch01', { id: 'old' });
    cache.store('ch01', { id: 'new' });
    expect(cache.take('ch01')).toEqual({ id: 'new' });
    expect(disposed).toEqual(['old']);
    cache.clear();
    expect(disposed).toEqual(['old']);
  });
});
