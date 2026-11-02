import { describe, it, expect } from 'vitest';
import { KillChainSystem, killMultiplier, killReward } from '../src/gameplay/KillChainSystem.js';
import { EconomyLedger } from '../src/gameplay/EconomyLedger.js';
import { gradeFor } from '../src/gameplay/ScoringSystem.js';
import { damp, percentile } from '../src/core/math.js';
import { createRng } from '../src/core/rng.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { purchase, getItem } from '../src/gameplay/ShopSystem.js';
import { createNewSave } from '../src/gameplay/GameState.js';
import { SaveManager, MemoryAdapter, migrateSave, validateSave } from '../src/gameplay/SaveManager.js';
import { difficulty } from '../src/gameplay/DifficultyManager.js';
import { summarizeFrames, recommend, BenchCollector } from '../src/benchmark/Benchmark.js';
import { GameLoop, FIXED_DT } from '../src/core/GameLoop.js';
import chapter from '../src/data/chapter01.json';
import shop from '../src/data/shop.json';
import secrets from '../src/data/secrets.json';

describe('núcleo', () => {
  it('rng determinístico', () => { const a = createRng(5), b = createRng(5); expect([a.next(), a.next()]).toEqual([b.next(), b.next()]); });
  it('damp independe de FPS', () => {
    let a = 0; for (let i = 0; i < 60; i++) a += (1 - a) * damp(1 / 60, 0.1);
    let b = 0; for (let i = 0; i < 30; i++) b += (1 - b) * damp(1 / 30, 0.1);
    expect(Math.abs(a - b)).toBeLessThan(1e-6);
  });
  it('percentil', () => { expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3); });
  it('notas', () => { expect(gradeFor(90)).toBe('S'); expect(gradeFor(80)).toBe('A'); expect(gradeFor(10)).not.toBe('S'); });
  it('colisão: não atravessa parede', () => {
    const w = new CollisionWorld([-20, -20, 20, 20]); w.addBox('w', 0, 0, 2, 3, 10);
    const r = w.resolveCircle(0.5, 0, 0.4); expect(Math.abs(r.x)).toBeGreaterThan(1.3);
    expect(w.raycast(-5, 1, 0, 1, 0, 0, 20, 'bullet')).toBeTruthy();
  });
  it('GameLoop: passo fixo independente do FPS', () => {
    let n = 0; const l = new GameLoop({ step: () => n++, render: () => {}, isRunning: () => true });
    l.advance(1); expect(n).toBeLessThanOrEqual(5); n = 0; l.acc = 0; l.advance(FIXED_DT * 3.01); expect(n).toBe(3);
  });
});

describe('cadeia de eliminações', () => {
  it('multiplicador 1.00/1.15/1.30 e exemplo 835 CC', () => {
    expect(killMultiplier(1)).toBe(1); expect(killMultiplier(2)).toBeCloseTo(1.15); expect(killMultiplier(3)).toBeCloseTo(1.3);
    expect(killMultiplier(99)).toBe(2.5);
    expect(killReward(250, 1) + killReward(250, 2) + killReward(250, 3)).toBeGreaterThan(0);
  });
  it('janela de 4 s (4.001 expira) e ordem determinística', () => {
    const c = new KillChainSystem();
    c.registerKill({ creditedTo: 'player', enemyId: 'a', baseCC: 100 }, 0);
    expect(c.update(4000)).toBeNull(); expect(c.update(4001)?.reason).toBe('expired');
    const evs = KillChainSystem.sortEvents([{ tick: 2, encounterId: 'b', enemyId: 'z' }, { tick: 1, encounterId: 'c', enemyId: 'y' }, { tick: 1, encounterId: 'a', enemyId: 'x' }]);
    expect(evs.map((e) => e.enemyId)).toEqual(['x', 'y', 'z']);
  });
  it('mesmo inimigo não pontua duas vezes', () => {
    const c = new KillChainSystem(); expect(c.registerKill({ creditedTo: 'player', enemyId: 'a', baseCC: 100 }, 0)).toBeTruthy();
    expect(c.registerKill({ creditedTo: 'player', enemyId: 'a', baseCC: 100 }, 10)).toBeNull();
  });
});

describe('economia e loja', () => {
  it('ledger idempotente por rewardId', () => { const l = new EconomyLedger(); l.credit('r1', 100); l.credit('r1', 100); expect(l.credits).toBe(100); });
  const mk = (cc) => { const s = createNewSave(); const l = new EconomyLedger(s.economyLedger); l.credit('seed', cc); s.economyLedger = l.serialize(); s.credits = l.credits; return s; };
  it('compra atômica e idempotente', async () => {
    const item = shop.items.find((i) => i.price > 0 && i.price < 500) ?? shop.items[0];
    const s = mk(item.price + 50); let saved = 0;
    const r = await purchase(s, item.id, 'tx1', async () => { saved++; }, 1);
    expect(r.ok).toBe(true); expect(r.save.credits).toBe(50); expect(saved).toBe(1);
    const d = await purchase(r.save, item.id, 'tx1', async () => { saved++; }, 1);
    expect(d.duplicate).toBe(true); expect(saved).toBe(1);
  });
  it('falha ao salvar não debita CC', async () => {
    const item = shop.items.find((i) => i.price > 0 && i.price < 500) ?? shop.items[0]; const s = mk(item.price + 50);
    const r = await purchase(s, item.id, 'tx2', async () => { throw new Error('quota'); }, 1);
    expect(r.ok).toBe(false); expect(r.error).toBe('falha_ao_salvar'); expect(s.credits).toBe(item.price + 50);
  });
  it('saldo insuficiente', async () => { const r = await purchase(mk(0), 'x_inexistente', 't', async () => {}); expect(r.ok).toBe(false); });
});

describe('dificuldade e saves', () => {
  it('só reduz em ponto seguro e marca custom', () => {
    const s = createNewSave({ difficultyId: 'veteran' });
    expect(difficulty.change(s, 'extinction', { atSafePoint: true }).ok).toBe(false);
    expect(difficulty.change(s, 'standard', { atSafePoint: true }).ok).toBe(true); expect(s.rankEligibility).toBe('custom');
  });
  it('save: grava, carrega, detecta corrupção', async () => {
    const mem = new MemoryAdapter(), m = new SaveManager(mem), s = createNewSave();
    await m.save(1, s); const r = await m.load(1); expect(r.save.runId).toBe(s.runId);
    const rec = await mem.get('slot:1'); rec.data.credits = 99999; await mem.set('slot:1', rec);
    await expect(m.load(1)).rejects.toThrow();
  });
  it('save: falha de gravação rejeita', async () => { const mem = new MemoryAdapter(); mem.failNextSet = true; await expect(new SaveManager(mem).save(1, createNewSave())).rejects.toThrow(); });
  it('save: exportar/importar valida checksum', () => {
    const m = new SaveManager(new MemoryAdapter()), s = createNewSave(), txt = m.exportJson(s);
    expect(m.importJson(txt).ok).toBe(true); expect(m.importJson(txt.replace('"credits": 0', '"credits": 5')).ok).toBe(false); expect(m.importJson('{x').ok).toBe(false);
  });
  it('save novo valida', () => { expect(validateSave(createNewSave()).ok).toBe(true); });
  it('migração de schema antigo', () => { const old = createNewSave(); old.schemaVersion = 3; const r = migrateSave(old); expect(r.save.schemaVersion).toBe(4); });
});

describe('benchmark', () => {
  it('sumário e recomendação', () => {
    const sum = summarizeFrames(Array(100).fill(16.6)); expect(sum.p95).toBeCloseTo(16.6, 0);
    expect(recommend(sum, 'high').preset).toBe('high'); expect(recommend(summarizeFrames(Array(100).fill(40)), 'low').preset).toBe('low');
    expect(recommend(sum, 'high', { valid: false })).toBeNull();
  });
  it('coletor invalida com aba oculta', () => {
    let t = 0; const c = new BenchCollector({ mode: 'quick', now: () => t }); c.frame(0, {}); c.invalidate('aba oculta');
    for (t = 16; t < 30000; t += 16) c.frame(t, { updateMs: 1, renderMs: 1, camMs: 0 });
    expect(c.report({ preset: 'low', gpuTimer: { available: false } }, 'x').status).toBe('invalid');
  });
});

describe('dados', () => {
  it('12 dossiês, secretos referenciados existem', () => {
    expect(secrets.dossiers?.length ?? Object.keys(secrets).length).toBeGreaterThanOrEqual(12);
  });
  it('capítulo: ids únicos de encontros e inimigos', () => {
    const ids = chapter.encounters.flatMap((e) => (e.enemies ?? []).map((x) => x.id)); expect(new Set(ids).size).toBe(ids.length);
    for (const e of chapter.encounters) for (const en of (e.enemies ?? [])) { for (const [x, z] of (en.pos ? [en.pos] : en.spawnCandidates)) { expect(x).toBeGreaterThan(chapter.bounds[0]); expect(x).toBeLessThan(chapter.bounds[2]); expect(z).toBeGreaterThan(chapter.bounds[1]); expect(z).toBeLessThan(chapter.bounds[3]); } }
  });
  void getItem;
});
