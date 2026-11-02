/** Barramento de eventos síncrono. Contrato único para neutralização, combo, saldo, rank (GDD 9.9). */
export class EventBus {
  constructor() { this.map = new Map(); }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) { this.map.get(type)?.delete(fn); }
  emit(type, payload = {}) {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of [...set]) fn({ type, ...payload });
  }
  clear() { this.map.clear(); }
}
