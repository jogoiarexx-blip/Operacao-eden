import { describe, it, expect } from 'vitest';
import bestiary from '../src/data/bestiary.json';
import secrets from '../src/data/secrets.json';
import docs from '../src/data/documents.json';
import dialogues from '../src/data/dialogues.json';
import rank from '../src/data/rankTargets.json';
import { getChapter } from '../src/chapters/index.js';
import { advanceToChapter } from '../src/gameplay/ChapterTransition.js';
import { createNewSave } from '../src/gameplay/GameState.js';
import { DinosaurAgent, AttackCoordinator, AI } from '../src/actors/DinosaurAgent.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { EventBus } from '../src/core/EventBus.js';
import { createRng } from '../src/core/rng.js';
import { chapterState, cycleChannel, channelsInTune, TARGET, FREQ, wingPanelCheck, sprinklerNoise, SPRINKLER } from '../src/chapters/ch03.js';

const { data, script } = getChapter('ch03');
const lineSec = (id) => dialogues[id].reduce((s, l) => s + l.ms, 0) / 1000;

describe('Capítulo 03 — Jardim das Vozes: dados', () => {
  it('protagonista, número e título seguem o GDD (7.4)', () => {
    expect(data.protagonist).toBe('lia'); expect(data.chapter).toBe(3); expect(data.title).toBe('Jardim das Vozes');
  });
  it('documentos, dossiê, segredo e cache referenciados existem', () => {
    for (const p of data.pickups) {
      if (p.kind === 'document') expect(docs.documents[p.doc], p.id).toBeTruthy();
      if (p.kind === 'dossier') expect(secrets.dossiers.find((d) => d.id === p.dossier)?.text, p.id).toBeTruthy();
      if (p.kind === 'secret') expect(secrets.secrets.find((s) => s.id === p.secret)?.rewards?.length, p.id).toBeGreaterThan(0);
      if (p.kind === 'cache') expect(secrets.caches.find((s) => s.id === p.cache)?.rewards?.length, p.id).toBeGreaterThan(0);
    }
    expect(docs.documents.AUDIO_ELISA_01).toBeTruthy();
  });
  it('pontuação: nós de exploração do ranking coincidem com o script', () => {
    const nodes = rank.chapters.ch03.explorationNodes;
    expect(script.explorationVisited({ persistentWorldFlags: { zonesVisited: nodes } })).toEqual(nodes);
    for (const n of nodes) expect(data.zones.map((z) => z.id)).toContain(n);
  });
  it('S-2 existe no bestiário com manobra de espreita e aviso sonoro', () => {
    const s2 = bestiary.species.pale_stalker;
    expect(s2.code).toBe('S-2'); expect(s2.stalk.ms).toBeGreaterThan(1500); expect(s2.stalk.rustleEveryMs).toBeLessThan(s2.stalk.ms);
    expect(s2.hearingScale).toBeGreaterThan(bestiary.species.forest_runner.hearingScale);
  });
  it('cutscenes duram mais que os diálogos (nada é cortado)', () => {
    expect(lineSec('ch03_intro_radio')).toBeLessThan(script.cutscenes.intro.dur);
    expect(lineSec('ch03_ending')).toBeLessThan(script.cutscenes.ending.dur);
  });
  it('a tabela de calibração no documento corresponde ao alvo do puzzle', () => {
    const t = docs.documents.DOC_CALIB.text;
    TARGET.forEach((v, i) => expect(t).toContain(`Canal ${i + 1}: ${FREQ[v]}`));
  });
  it('transição Cap. 02 → 03 troca para Lia com vida cheia e mantém o inventário dela', () => {
    const s = createNewSave(); s.chapterId = 'ch02'; s.playerId = 'caio'; s.inventories.lia.ammoReserve.pistol = 7;
    const n = advanceToChapter(s, 'ch03');
    expect(n.playerId).toBe('lia'); expect(n.chapterId).toBe('ch03'); expect(n.inventories.lia.ammoReserve.pistol).toBe(7);
    expect(n.checkpoint.pos).toEqual(data.spawn.pos);
  });
});

describe('Capítulo 03: lógica do puzzle e da comporta', () => {
  const save = () => { const s = createNewSave(); s.chapterId = 'ch03'; return s; };
  it('começa com os três canais fora de sintonia e sintoniza ciclando', () => {
    const s = save(), st = chapterState(s);
    expect(channelsInTune(st)).toBe(0);
    for (let i = 0; i < 3; i++) { let guard = 0; while (st.channels[i] !== TARGET[i] && guard++ < 3) cycleChannel(st, i); }
    expect(channelsInTune(st)).toBe(3);
    cycleChannel(st, 0); expect(channelsInTune(st)).toBe(2);
  });
  it('comporta exige chave e torre em repouso, e explica o que falta', () => {
    const s = save();
    expect(wingPanelCheck(s)).toEqual({ ok: false, reason: 'key' });
    s.storyFlags.biometric_key = true; expect(wingPanelCheck(s)).toEqual({ ok: false, reason: 'coro' });
    s.storyFlags.coro_garden_off = true; expect(wingPanelCheck(s).ok).toBe(true);
  });
  it('irrigação emite ruído só enquanto a água corre', () => {
    const rt = { sprinklerUntil: 1000 + SPRINKLER.durationMs };
    expect(sprinklerNoise(rt, 1500)).toHaveLength(1);
    expect(sprinklerNoise(rt, 1000 + SPRINKLER.durationMs + 1)).toHaveLength(0);
    expect(sprinklerNoise({}, 0)).toHaveLength(0);
  });
  it('estado salvo é reparado se vier corrompido', () => {
    const s = save(); s.persistentWorldFlags.chapter.ch03 = { channels: 'x' };
    expect(chapterState(s).channels).toHaveLength(3);
  });
});

describe('S-2: espreita justa', () => {
  const setup = () => {
    const world = new CollisionWorld([-40, -40, 40, 40]), bus = new EventBus(), cues = [];
    bus.on('creatureCue', (e) => cues.push(e.cue));
    const sp = bestiary.species.pale_stalker;
    const a = new DinosaurAgent({ id: 's2_t', encounterId: 't', species: sp, pos: [0, -12], yaw: Math.PI });
    const player = { x: 0, z: 0, dead: false, takeDamage: () => 0 };
    const ctx = (sim) => ({ player, world, noises: [], coordinator: new AttackCoordinator(2), diff: { warningMult: 1 }, diffMgr: { warningMs: (b) => b }, bus, sim, rng: createRng(3), allies: [a], tick: 0 });
    return { a, player, ctx, cues };
  };
  it('ao ver o jogador, contorna (não corre direto) e avisa com farfalhar antes de investir', () => {
    const { a, ctx, cues } = setup();
    a.yaw = Math.PI;   // frente = (-sin, -cos) = +Z: o jogador está à vista
    let sim = 0; const dt = 1 / 60;
    a.update(dt, ctx(sim));
    expect([AI.STALK, AI.CHASE]).toContain(a.state);
    const seen = [];
    for (let i = 0; i < 120; i++) { sim += dt * 1000; a.update(dt, ctx(sim)); seen.push(a.state); }
    expect(seen.slice(0, 60).every((s) => s === AI.STALK)).toBe(true);
    expect(cues).toContain('rustle');
  });
});
