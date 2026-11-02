/** Recordes LOCAIS (sem servidor/telemetria). Classificado só para runs elegíveis; demais vão para Livre. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export class RecordBook {
  constructor(storage) { this.storage = storage; this.data = { classified: {}, free: {}, finalized: [] }; }
  async load() { const d = await this.storage.get('records'); if (d) this.data = { classified: {}, free: {}, finalized: [], ...d }; return this; }
  static groupKey(r) { return [r.chapterId, r.difficulty, r.protagonist, r.mode, `assist:${r.assists}`].join('|'); }
  /** Finalização idempotente por runId+chapterId. */
  async submit(rec) {
    const fid = `${rec.runId}|${rec.chapterId}|${rec.attempt ?? 0}`;
    if (this.data.finalized.includes(fid)) return { duplicate: true };
    this.data.finalized.push(fid);
    const bucket = rec.eligibility === 'classified' ? 'classified' : 'free';
    const key = RecordBook.groupKey(rec);
    const row = { ...rec, checksum: fnv1a(stableStringify({ s: rec.score, c: rec.eventsDigest })) };
    const list = (this.data[bucket][key] ||= []);
    list.push(row); list.sort((a, b) => b.score - a.score || a.time - b.time); list.length = Math.min(list.length, 10);
    await this.storage.set('records', this.data);
    return { bucket, key, best: list[0].runId === rec.runId, row };
  }
  best(bucket, key) { return this.data[bucket][key]?.[0] ?? null; }
}
