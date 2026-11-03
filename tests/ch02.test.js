import { describe, it, expect } from 'vitest';
import { canOpenYard, TomasDefense, arenaResupply, completeTomasDefense, chapterState, makeGate, k1ShouldSpawn, RESUPPLY } from '../src/chapters/ch02.js';
import { createNewSave } from '../src/gameplay/GameState.js';
import { EconomyLedger } from '../src/gameplay/EconomyLedger.js';
import { getChapter } from '../src/chapters/index.js';

const STEP = 1000 / 60;
const ch02Save = () => {
  const s = createNewSave({ slot: 1, runId: 'run_t' });
  s.chapterId = 'ch02'; s.sectorId = 'outpost_02'; s.playerId = 'caio';
  return s;
};

describe('Capítulo 02 — pátio e cercado', () => {
  it('yard_gate_panel recusa sem gate_k1_locked e libera com', () => {
    const s = ch02Save();
    expect(canOpenYard(s)).toBe(false);
    s.storyFlags.gate_k1_locked = true;
    expect(canOpenYard(s)).toBe(true);
  });
});

describe('Capítulo 02 — defesa de Tomás', () => {
  it('juvenil a 1 m por 5 s: o progresso não avança (Tomás recua, não falha)', () => {
    const d = new TomasDefense();
    for (let t = 0; t < 5000; t += STEP) d.step(STEP, 1.0);
    expect(d.progressMs).toBe(0);
    expect(d.paused).toBe(true);
    expect(d.done).toBe(false);
  });
  it('sem ameaça por 25 s: concluída; 3 juvenis surgiram', () => {
    const d = new TomasDefense();
    let spawned = 0, justDone = 0;
    for (let t = 0; t < 25000 + STEP * 2; t += STEP) { const r = d.step(STEP, Infinity); spawned += r.spawn; if (r.justDone) justDone++; }
    expect(d.done).toBe(true);
    expect(spawned).toBe(3);
    expect(justDone).toBe(1);
  });
  it('ameaça a 1,5 m conta como alcançado; 1,6 m não', () => {
    const a = new TomasDefense(); a.step(1000, 1.5); expect(a.progressMs).toBe(0);
    const b = new TomasDefense(); b.step(1000, 1.6); expect(b.progressMs).toBe(1000);
  });
});

describe('Capítulo 02 — retry após morte no K-1', () => {
  it('snapshot pre_k1: tomas_found sem k1_defeated; portão volta pronto; CC sem duplicar', () => {
    const s = ch02Save();
    const l = new EconomyLedger(s.economyLedger); l.credit('run_t|kill|r4j_def_a', 120); s.economyLedger = l.serialize(); s.credits = l.credits;
    completeTomasDefense(s);
    const snap = JSON.parse(JSON.stringify(s));                 // o que o Game grava em checkpointSnap
    expect(snap.checkpointId).toBe('pre_k1');
    expect(snap.storyFlags.tomas_found).toBe(true);
    expect(snap.rescueFlags.tomas).toBe(true);
    expect(snap.storyFlags.k1_defeated).toBeUndefined();
    const ccAtCheckpoint = snap.economyLedger.credits;
    expect(ccAtCheckpoint).toBeGreaterThan(120);                  // recompensa do resgate entrou uma vez

    // luta: o portão cai (carga gasta) e o estado vivo do save muda — o snapshot não
    const gate = makeGate(); gate.lastDropAt = 9000; chapterState(s).gate = gate.serialize(12000);
    expect(chapterState(s).gate.remainingMs).toBeGreaterThan(0);

    // retry: restaura o snapshot (simMs volta a 0)
    const back = JSON.parse(JSON.stringify(snap));
    const g2 = makeGate(); g2.restore(chapterState(back).gate, 0);
    expect(g2.ready(0)).toBe(true);
    expect(k1ShouldSpawn(back)).toBe(true);                      // K-1 volta (agente novo = vida cheia)
    completeTomasDefense(back);                                   // reconclusão não paga de novo
    expect(back.economyLedger.credits).toBe(ccAtCheckpoint);
  });
  it('K-1 só surge depois de tomas_found e enquanto não derrotado', () => {
    const s = ch02Save();
    expect(k1ShouldSpawn(s)).toBe(false);
    s.storyFlags.tomas_found = true; expect(k1ShouldSpawn(s)).toBe(true);
    s.persistentWorldFlags.defeatedEnemies.push('k1'); expect(k1ShouldSpawn(s)).toBe(false);
  });
});

describe('Capítulo 02 — reabastecimento da arena', () => {
  it('dá 6 cartuchos só com <6 (reserva + pente) e ≥40 s desde o último', () => {
    const inv = { weapons: { shotgun: { mag: 2 } }, ammoReserve: { shotgun: 3 } }, box = {};
    expect(arenaResupply(1000, inv, box)).toBe(6); expect(inv.ammoReserve.shotgun).toBe(9);
    inv.ammoReserve.shotgun = 0; inv.weapons.shotgun.mag = 0;
    expect(arenaResupply(1000 + 39000, inv, box)).toBe(0);
    expect(arenaResupply(1000 + RESUPPLY.everyMs, inv, box)).toBe(6);
    const full = { weapons: { shotgun: { mag: 0 } }, ammoReserve: { shotgun: 6 } };
    expect(arenaResupply(500000, full, {})).toBe(0);
    const mixed = { weapons: { shotgun: { mag: 3 } }, ammoReserve: { shotgun: 3 } };
    expect(arenaResupply(500000, mixed, {})).toBe(0);
    expect(arenaResupply(0, { weapons: {}, ammoReserve: {} }, {})).toBe(0);    // sem escopeta
  });
});

describe('Capítulo 02 — dados', () => {
  const { data } = getChapter('ch02');
  it('cabeçalho e objetivos', () => {
    expect(data).toMatchObject({ id: 'outpost_02', chapterId: 'ch02', protagonist: 'caio', bounds: [-40, -40, 40, 40], chapter: 2 });
    expect(data.objectives.map((o) => o.id)).toEqual(['restore_generator', 'radio', 'lock_pen', 'open_yard', 'find_tomas', 'defeat_k1', 'exit']);
    for (const o of data.objectives) expect(o.target, o.id).toHaveLength(2);
  });
  it('interações e zonas exigidas', () => {
    const levers = data.interactables.filter((i) => i.kind === 'heavy_lever');
    expect(levers).toHaveLength(2); for (const l of levers) expect(l.holdMs).toBe(2400);
    for (const k of ['crates_shed', 'radio_console', 'pen_lock', 'yard_gate_panel', 'archive_door', 'gate_drop']) expect(data.interactables.map((i) => i.id)).toContain(k);
    for (const z of ['breach', 'generator_shed', 'radio_room', 'pen_area', 'yard', 'archive', 'service_road', 'truck', 'gate_zone', 'north_service_exit']) expect(data.zones.map((q) => q.id)).toContain(z);
    expect(data.terminals.find((t) => t.id === 'terminal_outpost_b').checkpointId).toBe('terminal_B2');
    expect(data.zones.some((z) => z.narrow)).toBe(true);
  });
});

describe('Capítulo 02 — caixas de munição compartilham o relógio', () => {
  it('usar a caixa B logo após a A não reabastece (um único lastAt)', () => {
    const inv = { weapons: { shotgun: { mag: 0 } }, ammoReserve: { shotgun: 0 } }, shared = {};
    expect(arenaResupply(1000, inv, shared)).toBe(6);
    inv.ammoReserve.shotgun = 0;
    expect(arenaResupply(1500, inv, shared)).toBe(0);                   // "outra caixa" = mesmo objeto de estado
    expect(arenaResupply(1000 + RESUPPLY.everyMs, inv, shared)).toBe(6);
    expect(RESUPPLY.amount / (RESUPPLY.everyMs / 1000)).toBeCloseTo(0.15, 5);   // ≤ 6 cartuchos / 40 s
  });
});
