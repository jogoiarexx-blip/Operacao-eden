import { SCHEMA_VERSION, createNewSave } from './GameState.js';
import { fnv1a, stableStringify } from './RecordBook.js';

/**
 * Persistência (GDD 9.5/9.10): IndexedDB por slot, perfil e diagnósticos em registros SEPARADOS,
 * migração com backup, validação de schema, exportação/importação com checksum.
 */
export class MemoryAdapter {
  constructor() { this.m = new Map(); this.failNextSet = false; }
  async get(k) { return this.m.has(k) ? structuredClone(this.m.get(k)) : null; }
  async set(k, v) { if (this.failNextSet) { this.failNextSet = false; throw new Error('falha simulada de gravação'); } this.m.set(k, structuredClone(v)); }
  async delete(k) { this.m.delete(k); }
  async keys() { return [...this.m.keys()]; }
}

export class IndexedDbAdapter {
  constructor(name = 'eden-db') { this.name = name; this.db = null; }
  _open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const rq = indexedDB.open(this.name, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => { this.db = rq.result; res(this.db); };
      rq.onerror = () => rej(rq.error);
    });
  }
  async _tx(mode, fn) {
    const db = await this._open();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', mode); const st = tx.objectStore('kv');
      const r = fn(st);
      tx.oncomplete = () => res(r?.result ?? null);
      tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  }
  get(k) { return this._tx('readonly', (s) => s.get(k)); }
  set(k, v) { return this._tx('readwrite', (s) => s.put(v, k)); }
  delete(k) { return this._tx('readwrite', (s) => s.delete(k)); }
  keys() { return this._tx('readonly', (s) => s.getAllKeys()); }
}

export function createDefaultAdapter() {
  try { if (typeof indexedDB !== 'undefined') return new IndexedDbAdapter(); } catch { /* cai para memória */ }
  return new MemoryAdapter();
}

export function validateSave(s) {
  const errors = [];
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(s)) return { ok: false, errors: ['não é objeto'] };
  if (typeof s.schemaVersion !== 'number') errors.push('schemaVersion ausente');
  if (typeof s.chapterId !== 'string') errors.push('chapterId inválido');
  if (typeof s.sectorId !== 'string') errors.push('sectorId inválido');
  if (!['lia', 'caio'].includes(s.playerId)) errors.push('playerId inválido');
  if (!isObj(s.health)) errors.push('health inválido');
  if (!isObj(s.inventories) || !isObj(s.inventories.lia) || !isObj(s.inventories.caio)) errors.push('inventories inválido');
  if (!Array.isArray(s.teamKeys)) errors.push('teamKeys inválido');
  const credits = s.economyLedger?.credits ?? s.credits;
  if (!Number.isFinite(credits) || credits < 0) errors.push('CC inválido ou negativo');
  for (const k of ['storyFlags', 'secretFlags', 'persistentWorldFlags']) if (s[k] !== undefined && !isObj(s[k])) errors.push(`${k} inválido`);
  for (const [c, inv] of Object.entries(isObj(s.inventories) ? s.inventories : {})) for (const [w, n] of Object.entries(inv?.ammoReserve ?? {})) if (!Number.isFinite(n) || n < 0) errors.push(`munição negativa: ${c}/${w}`);
  return { ok: errors.length === 0, errors };
}

/** v1/v2 conceituais → v3 → v4 → v5, sem apagar progressão. */
export function migrateSave(raw) {
  const from = raw.schemaVersion ?? 1;
  if (from >= SCHEMA_VERSION) return { save: raw, from, migrated: false };
  const base = createNewSave({ slot: raw.slot ?? 1, profileId: raw.profileId, runId: raw.runId });
  const s = structuredClone(raw);
  // v1/v2 → v3: campos conceituais ganham padrões
  for (const k of ['health', 'storyFlags', 'rescueFlags', 'containmentFlags', 'secretFlags', 'persistentWorldFlags', 'cameraSettings']) {
    if (s[k] === undefined) s[k] = base[k];
  }
  s.persistentWorldFlags = { ...base.persistentWorldFlags, ...s.persistentWorldFlags };
  // v4 → v5: inventário único vira o da Lia; chaves sobem para o topo; gateOpen vira flag de capítulo
  if (from < 5) {
    const old = s.inventory ?? {}, bl = base.inventories.lia;
    s.inventories = { lia: { ...bl, ...old, weapons: { ...bl.weapons, ...(old.weapons ?? {}) }, ammoReserve: { ...bl.ammoReserve, ...(old.ammoReserve ?? {}) }, consumables: { ...bl.consumables, ...(old.consumables ?? {}) }, upgrades: [...(old.upgrades ?? [])] }, caio: base.inventories.caio };
    delete s.inventories.lia.teamKeys;
    s.teamKeys = [...new Set([...(s.teamKeys ?? []), ...(old.teamKeys ?? [])])];
    delete s.inventory;
    const wf = s.persistentWorldFlags;
    wf.chapter = { ...base.persistentWorldFlags.chapter, ...(wf.chapter ?? {}) };
    if (wf.gateOpen !== undefined) { wf.chapter.ch01 = { ...wf.chapter.ch01, gateOpen: !!wf.gateOpen }; delete wf.gateOpen; }
  }
  // v3 → v4
  const credits = s.economyLedger?.credits ?? s.credits ?? 0;
  s.economyLedger = { ...base.economyLedger, ...(s.economyLedger ?? {}), credits };
  s.credits = credits;
  s.runId ??= base.runId;
  s.difficulty ??= { selected: 'standard', current: 'standard', changed: false };
  s.difficultyVersion ??= 1;
  s.rankEligibility ??= 'classified';
  s.scoringVersion ??= 1;
  s.runRules ??= { mode: 'campaign', infiniteAmmo: false, mutators: [] };
  s.chapterStats ??= {};
  s.profileUnlocks ??= [];
  for (const k of ['secretMeta', 'storySecrets', 'dossiersInRun', 'documents', 'journal', 'shopUnlocks', 'completedObjectives']) s[k] ??= structuredClone(base[k]);
  s.checkpoint ??= base.checkpoint; s.attempts ??= 0; s.playtimeSeconds ??= 0;
  s.schemaVersion = SCHEMA_VERSION;
  return { save: s, from, migrated: true };
}

export class SaveManager {
  constructor(adapter = createDefaultAdapter()) { this.adapter = adapter; }
  slotKey(n) { return `slot:${n}`; }

  /** Grava slot de forma atômica (um único `set` por registro) com checksum de integridade. */
  async save(slot, state) {
    const v = validateSave(state);
    if (!v.ok) throw new Error(`save inválido: ${v.errors.join('; ')}`);
    const payload = structuredClone({ ...state, savedAt: Date.now() });
    await this.adapter.set(this.slotKey(slot), { checksum: fnv1a(stableStringify(payload)), data: payload });
    return payload;
  }
  async load(slot) {
    const rec = await this.adapter.get(this.slotKey(slot));
    if (!rec) return null;
    const data = rec.data ?? rec;
    if (rec.checksum && rec.checksum !== fnv1a(stableStringify(data))) throw new Error('save corrompido (checksum)');
    const { save, from, migrated } = migrateSave(data);
    if (migrated) await this.adapter.set(`${this.slotKey(slot)}:backup:v${from}`, rec);   // backup antes de trocar de versão
    const v = validateSave(save);
    if (!v.ok) throw new Error(`save inválido: ${v.errors.join('; ')}`);
    return { save, migrated, from };
  }
  async meta(slot) {
    try { const r = await this.load(slot); if (!r) return null; const s = r.save; return { slot, chapterId: s.chapterId, playerId: s.playerId, playtimeSeconds: s.playtimeSeconds, savedAt: s.savedAt, checkpointId: s.checkpointId, difficulty: s.difficulty.current }; } catch { return { slot, corrupted: true }; }
  }
  async remove(slot) { await this.adapter.delete(this.slotKey(slot)); }

  exportJson(state) { const data = structuredClone(state); return JSON.stringify({ format: 'eden-save', checksum: fnv1a(stableStringify(data)), data }, null, 1); }
  /** Importa SOMENTE após validar formato, checksum e schema; migra se necessário. */
  importJson(text) {
    let o; try { o = JSON.parse(text); } catch { return { ok: false, error: 'JSON inválido' }; }
    if (o?.format !== 'eden-save' || !o.data) return { ok: false, error: 'formato desconhecido' };
    if (o.checksum !== fnv1a(stableStringify(o.data))) return { ok: false, error: 'checksum não confere' };
    const { save } = migrateSave(o.data);
    const v = validateSave(save);
    return v.ok ? { ok: true, save } : { ok: false, error: v.errors.join('; ') };
  }

  async loadProfile(profileId = 'local_profile_01') {
    const p = await this.adapter.get(`profile:${profileId}`);
    return p ?? null;
  }
  async saveProfile(p) { await this.adapter.set(`profile:${p.profileId}`, p); }
  // Diagnóstico de benchmark: registro separado, NUNCA dentro do slot da campanha.
  async loadBenchHistory() { return (await this.adapter.get('benchmarkHistory')) ?? []; }
  async saveBenchHistory(h) { await this.adapter.set('benchmarkHistory', h.slice(-20)); }
}
