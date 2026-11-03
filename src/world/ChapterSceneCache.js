/**
 * Cache LRU de um único mapa estático inativo.
 *
 * Apenas recursos do cenário (CollisionWorld, SectorScenery e props) são
 * reaproveitados. Inimigos, pickups, objetivo, UI e roteiro são reconstruídos
 * a partir do save ao reentrar: não ficam congelados no cache.
 *
 * Escopo por runId. Ao iniciar outra partida, todos os recursos são liberados.
 */
export class ChapterSceneCache {
  constructor({ capacity = 1, dispose } = {}) {
    this.capacity = Math.max(0, Math.floor(capacity));
    this.disposeResource = dispose ?? ((entry) => {
      entry.props?.dispose?.();
      entry.scenery?.dispose?.();
    });
    this.items = new Map();
    this.disposed = 0;
    this.hits = 0;
    this.misses = 0;
    this.stored = 0;
  }

  take(chapterId) {
    if (!this.items.has(chapterId)) { this.misses++; return null; }
    const bundle = this.items.get(chapterId);
    this.items.delete(chapterId);
    this.hits++;
    return bundle;
  }

  store(chapterId, bundle) {
    if (!bundle) return false;
    if (this.capacity < 1) {
      this._dispose(bundle);
      return false;
    }
    const old = this.items.get(chapterId);
    if (old) { this.items.delete(chapterId); if (old !== bundle) this._dispose(old); }
    this.items.set(chapterId, bundle);
    this.stored++;
    while (this.items.size > this.capacity) {
      const oldest = this.items.keys().next().value;
      const evicted = this.items.get(oldest);
      this.items.delete(oldest);
      if (evicted !== bundle) this._dispose(evicted);
    }
    return true;
  }

  _dispose(bundle) { this.disposeResource(bundle); this.disposed++; }
  clear() {
    for (const bundle of this.items.values()) this._dispose(bundle);
    this.items.clear();
  }

  stats() {
    return { capacity: this.capacity, cached: [...this.items.keys()],
      hits: this.hits, misses: this.misses, stored: this.stored,
      disposed: this.disposed };
  }
}
