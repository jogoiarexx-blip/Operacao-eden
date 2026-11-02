import { describe, it, expect } from 'vitest';
import { AI, AttackCoordinator } from '../src/actors/DinosaurAgent.js';
import { K1Agent, K1 } from '../src/actors/K1Agent.js';
import { GateTrap } from '../src/gameplay/GateTrap.js';
import { hitSpheres } from '../src/actors/Combat.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { difficulty, MIN_REACTION_MS } from '../src/gameplay/DifficultyManager.js';
import { createRng } from '../src/core/rng.js';
import { CreatureView } from '../src/actors/CreatureView.js';
import bestiary from '../src/data/bestiary.json';

const SP = bestiary.species.containment_alpha;
const STEP = 1000 / 60;

const mkK1 = (diffId = 'standard', pos = [0, 0], yaw = Math.PI) =>
  new K1Agent({ id: 'K-1', encounterId: 'ch02_k1', species: SP, pos, patrol: [], hpMult: difficulty.get(diffId).enemyHpMult, yaw });

function mkCtx(k, { diffId = 'standard', world = new CollisionWorld([-40, -40, 40, 40]), player = [0, 12] } = {}) {
  const events = [];
  const pl = { x: player[0], z: player[1], px: player[0], pz: player[1], dead: false, invulnerable: false, hp: 1e6, bleeding: false, takeDamage(d) { this.hp -= d; return d; } };
  const ctx = {
    player: pl, world, noises: [], coordinator: new AttackCoordinator(2), diff: { id: diffId, ...difficulty.get(diffId) }, diffMgr: difficulty,
    bus: { emit: (type, p) => events.push({ type, p, sim: ctx.sim }) }, sim: 0, rng: createRng(1), allies: [k], tick: 0, runId: 'r',
  };
  return { ctx, events, player: pl };
}
/** Avança a simulação em passos fixos até `ms` ou até `until()` ser verdadeiro. */
function run(k, ctx, ms, until) {
  const end = ctx.sim + ms;
  while (ctx.sim < end) {
    ctx.sim += STEP; ctx.tick++; k.update(STEP / 1000, ctx);
    if (until?.()) return true;
  }
  return false;
}

describe('Minichefe K-1', () => {
  it('espécie containment_alpha com os valores do design', () => {
    expect(SP).toMatchObject({ hp: 900, scale: 1.9, baseCC: 2500, hurtRadius: 1.1, boss: true });
    expect(SP.vision.range).toBe(34);
    expect(SP.attack).toMatchObject({ windupMs: 700, damage: 26 });
    expect(SP.hit.head.r).toBeLessThan(SP.hit.torso.r);
    expect(SP.hit.head.y).toBeGreaterThan(SP.hit.torso.y);
  });

  it('HP 900 no Padrão e 810 no Explorador (enemyHpMult)', () => {
    expect(mkK1('standard').maxHp).toBe(900);
    expect(mkK1('explorer').maxHp).toBe(810);
    expect(mkK1('standard').hp).toBe(900);
  });

  it('fases por HP: >60 % → 1, ≤60 % → 2, ≤25 % → 3', () => {
    const k = mkK1();
    expect(k.phase).toBe(1);
    k.hp = 540; expect(k.phase).toBe(2);
    k.hp = 226; expect(k.phase).toBe(2);
    k.hp = 225; expect(k.phase).toBe(3);
  });

  it('windup da investida: 1100 ms na fase 1, −15 % na fase 2, com warningMult e pisos', () => {
    for (const id of ['explorer', 'standard', 'veteran', 'extinction']) {
      const p = difficulty.get(id), k = mkK1(id);
      expect(k.chargeWindupMs(difficulty, id)).toBe(Math.max(p.minWarningMs ?? MIN_REACTION_MS, Math.round(1100 * p.warningMult)));
      k.hp = Math.round(k.maxHp * 0.5);
      expect(k.chargeWindupMs(difficulty, id)).toBe(Math.max(p.minWarningMs ?? MIN_REACTION_MS, Math.round(1100 * 0.85 * p.warningMult)));
    }
    const k = mkK1('extinction'); k.hp = 10;
    expect(k.chargeWindupMs(difficulty, 'extinction')).toBeGreaterThanOrEqual(450);
    expect(k.chargeWindupMs(difficulty, 'extinction')).toBeGreaterThanOrEqual(MIN_REACTION_MS);
  });

  it('telegrafia mordida e cauda com warningMs (piso no Extinção)', () => {
    const k = mkK1('extinction');
    expect(k.tailWindupMs(difficulty, 'extinction')).toBe(Math.max(450, Math.round(800 * 0.85)));
    expect(difficulty.warningMs(SP.attack.windupMs, 'extinction')).toBeGreaterThanOrEqual(450);
  });

  it('investida contra parede → DAZED 2,5 s; cabeça recebe ×3 durante DAZED', () => {
    const w = new CollisionWorld([-40, -40, 40, 40]); w.addBox('wall', 0, 17, 20, 3, 1);
    const k = mkK1(); const { ctx, events } = mkCtx(k, { world: w });
    const dazed = run(k, ctx, 8000, () => k.state === K1.DAZED);
    expect(dazed).toBe(true);
    expect(k.stateDur).toBe(2500);
    const wu = events.find((e) => e.type === 'windupStart' && e.p.kind === 'charge');
    expect(wu.p.ms).toBe(1100);
    expect(events.some((e) => e.type === 'k1Dazed' && e.p.cause === 'wall')).toBe(true);
    expect(k.z).toBeLessThan(16.5 - 1.05);          // parou na parede, sem atravessar
    const hp0 = k.hp;
    k.takeDamage(10, 'head', ctx); expect(k.hp).toBe(hp0 - 30);
    k.takeDamage(10, 'torso', ctx); expect(k.hp).toBe(hp0 - 40);
    // cabeça baixa e exposta: a caixa de acerto da cabeça desce durante o atordoamento
    const head = hitSpheres(k).find((s) => s.part === 'head');
    expect(head.y).toBeLessThan(SP.hit.head.y);
  });

  it('fora de DAZED a cabeça não tem o ×3', () => {
    const k = mkK1(); const { ctx } = mkCtx(k);
    k.takeDamage(10, 'head', ctx);
    expect(k.hp).toBe(890);
  });

  it('após sair de DAZED, nova colisão em <1,5 s não atordoa (sem loop)', () => {
    const w = new CollisionWorld([-40, -40, 40, 40]); w.addBox('wall', 0, 17, 20, 3, 1);
    const k = mkK1(); const { ctx } = mkCtx(k, { world: w });
    run(k, ctx, 8000, () => k.state === K1.DAZED);
    run(k, ctx, 4000, () => k.state !== K1.DAZED);
    const exitAt = ctx.sim;
    expect(k.state).not.toBe(K1.DAZED);
    k.startChargeRun(ctx, Math.PI);                 // de frente para a parede (+z)
    run(k, ctx, 1000, () => k.state !== K1.CHARGE);
    expect(ctx.sim - exitAt).toBeLessThan(1500);
    expect(k.state).not.toBe(K1.DAZED);
    // passada a imunidade, a parede volta a atordoar
    run(k, ctx, 1500 - (ctx.sim - exitAt) + 50);
    k.startChargeRun(ctx, Math.PI);
    run(k, ctx, 1000, () => k.state !== K1.CHARGE);
    expect(k.state).toBe(K1.DAZED);
  });

  it('GateTrap: K-1 na zona → hit, −30 % do HP máx., DAZED 3,5 s; recarga; fora da zona', () => {
    const k = mkK1(); const { ctx, events } = mkCtx(k);
    const gate = new GateTrap({ zone: { x: 0, z: 0, r: 3 }, rechargeMs: 20000, damageFrac: 0.3, stunMs: 3500 });
    expect(gate.ready(0)).toBe(true);
    ctx.sim = 1000;
    expect(gate.trigger(1000, k, ctx)).toEqual({ hit: true });
    expect(k.hp).toBe(630);
    expect(k.state).toBe(K1.DAZED);
    expect(k.stateDur).toBe(3500);
    expect(events.some((e) => e.type === 'k1Dazed' && e.p.cause === 'gate')).toBe(true);
    expect(gate.ready(11000)).toBe(false);
    expect(gate.state(11000)).toEqual({ ready: false, frac: 0.5 });
    expect(gate.trigger(11000, k, ctx)).toEqual({ hit: false, reason: 'recharging' });
    expect(k.hp).toBe(630);
    expect(gate.ready(21000)).toBe(true);
    k.x = 10; k.z = 0;
    expect(gate.trigger(21000, k, ctx)).toEqual({ hit: false, reason: 'out_of_zone' });
    expect(k.hp).toBe(630);
  });

  it('GateTrap serializa e restaura (retry do checkpoint volta a "pronto")', () => {
    const k = mkK1(); const { ctx } = mkCtx(k);
    const gate = new GateTrap({ zone: { x: 0, z: 0, r: 3 } });
    const snap = JSON.parse(JSON.stringify(gate.serialize()));
    gate.trigger(5000, k, ctx);
    expect(gate.ready(6000)).toBe(false);
    gate.restore(snap);
    expect(gate.ready(6000)).toBe(true);
    const g2 = new GateTrap({ zone: { x: 0, z: 0, r: 3 } });
    g2.restore(JSON.parse(JSON.stringify(gate.serialize())));
    expect(g2.ready(6000)).toBe(true);
    gate.trigger(6000, k, { ...ctx, sim: 6000 });
    const g3 = new GateTrap({ zone: { x: 0, z: 0, r: 3 } }); g3.restore(JSON.parse(JSON.stringify(gate.serialize())));
    expect(g3.ready(16000)).toBe(false);
    expect(g3.ready(26000)).toBe(true);
  });

  it('abaixo de 25 % emite k1Roar uma única vez, mesmo com vários danos; bossHp a cada dano', () => {
    const k = mkK1(); const { ctx, events } = mkCtx(k);
    k.takeDamage(500, 'torso', ctx);
    expect(events.filter((e) => e.type === 'k1Roar')).toHaveLength(0);
    k.takeDamage(200, 'torso', ctx);
    k.takeDamage(10, 'torso', ctx);
    k.takeDamage(10, 'torso', ctx);
    expect(events.filter((e) => e.type === 'k1Roar')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'bossHp')).toHaveLength(4);
    expect(events.filter((e) => e.type === 'bossHp').at(-1).p.frac).toBeCloseTo(180 / 900, 5);
  });

  it('jogador parado 7 s → K-1 escolhe flanco em vez de investida', () => {
    const k = mkK1(); const { ctx, events } = mkCtx(k);
    run(k, ctx, 14000);
    const moves = events.filter((e) => e.type === 'k1Move');
    expect(moves.some((e) => e.sim < 6000 && e.p.mode === 'charge')).toBe(true);
    const after = moves.find((e) => e.sim > 6000);
    expect(after.p.mode).toBe('flank');
  });

  it('cauda só a partir da fase 2, com o jogador atrás por >1,5 s; empurra', () => {
    const k = mkK1('standard', [0, 0], Math.PI); const { ctx, events, player } = mkCtx(k, { player: [0, -2.5] });   // atrás (K-1 olha para +z)
    k.alerted = true; k.setState(K1.DAZED, 2500); k.vulnerable = true;
    run(k, ctx, 2400);
    expect(events.some((e) => e.type === 'k1Move' && e.p.mode === 'tail')).toBe(false);   // fase 1: sem cauda
    const k2 = mkK1('standard', [0, 0], Math.PI); const c2 = mkCtx(k2, { player: [0, -2.5] });
    k2.hp = 500; k2.alerted = true; k2.setState(K1.DAZED, 2500);
    const went = run(k2, c2.ctx, 3000, () => k2.state === K1.TAIL_WINDUP);
    expect(went).toBe(true);
    expect(k2.stateDur).toBe(800);
    const z0 = c2.player.z;
    run(k2, c2.ctx, 900, () => k2.state !== K1.TAIL_WINDUP);
    expect(c2.player.hp).toBeLessThan(1e6);
    expect(c2.player.z).toBeLessThan(z0 - 1);
    void player; void AI;
  });

  it('CreatureView do K-1 monta (escala 1,9) e anima investida, atordoado e cauda sem erro', () => {
    const k = mkK1(), v = new CreatureView(k);
    expect(v.mesh.userData.s).toBe(1.9);
    for (const st of [AI.CHASE, K1.CHARGE_WINDUP, K1.CHARGE, K1.DAZED, K1.TAIL_WINDUP, AI.ATTACK_WINDUP]) {
      k.setState(st, 1000); k.windupProgress = 0.5; v.sync(1, 1 / 60);
      expect(Number.isFinite(v.mesh.position.x)).toBe(true);
    }
    v.dispose();
  });

  it('K-1 não sofre atordoamento por ferramenta (stun) — boss', () => {
    const k = mkK1(); const { ctx } = mkCtx(k);
    expect(k.stun(2200, ctx)).toBe(false);
    expect(k.state).not.toBe(AI.STAGGER);
  });
});
