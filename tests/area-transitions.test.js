import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAreaBeat, revealArea } from '../src/gameplay/AreaTransitions.js';
import { getChapter } from '../src/chapters/index.js';
import { createNewSave } from '../src/gameplay/GameState.js';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Transição cinematográfica sem interromper a campanha', () => {
  it('cada área tem gatilho válido e id único; portão exige flag', () => {
    for (const id of ['ch01', 'ch02']) {
      const { data } = getChapter(id);
      const beats = data.areaTransitions;
      expect(new Set(beats.map((b) => b.id)).size).toBe(beats.length);
      expect(beats.length).toBeGreaterThan(3);
      for (const beat of beats) {
        expect(beat.title).toBeTruthy();
        expect(beat.trigger).toBeTruthy();
        if (!beat.trigger.endsWith('_opened')) expect(data.zones.some((z) => z.id === beat.trigger), beat.id).toBe(true);
      }
    }
    const d = getChapter('ch02').data;
    expect(getAreaBeat(d, 'yard_gate_opened', {})).toBeNull();
    expect(getAreaBeat(d, 'yard_gate_opened', { yard_open: true }).id).toBe('ch02_yard');
    expect(getAreaBeat(d, 'not_a_real_zone', {})).toBeNull();
  });

  it('exibe título uma vez, mantém PLAYING, não altera saves e não captura controles', () => {
    vi.useFakeTimers();
    const nodes = [];
    const dom = () => ({
      children: [], dataset: {}, className: '', textContent: '',
      append(...children) { this.children.push(...children); },
      remove() { this.removed = true; },
    });
    vi.stubGlobal('document', { createElement: () => dom() });
    const root = {
      append(node) { nodes.push(node); },
      querySelector(selector) { return selector === '.area-reveal' ? nodes.find((x) => !x.removed) ?? null : null; },
    };
    const save = createNewSave();
    const snapshot = structuredClone(save);
    let stateChanges = 0;
    const rt = {
      g: {
        sm: { is: (s) => s === 'PLAYING', go: () => stateChanges++ },
        uiRoot: root, mapOpen: false, save, simMs: 3000,
        audio: { play() {} },
      },
      data: getChapter('ch01').data,
      areaBeatsShown: new Set(), areaBeatUntil: -1,
    };
    expect(revealArea(rt, 'tower_visited')).toBe(true);
    expect(revealArea(rt, 'tower_visited')).toBe(false);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].dataset.areaBeat).toBe('ch01_tower');
    expect(nodes[0].children[1].textContent).toBe('TORRE DE OBSERVAÇÃO');
    expect(save).toEqual(snapshot);
    expect(stateChanges).toBe(0);
    expect(nodes[0].className).toContain('area-reveal');
    vi.runAllTimers();
    expect(nodes[0].removed).toBe(true);
  });

  it('não exibe ao pausar, abrir mapa ou durante o cooldown', () => {
    const d = getChapter('ch01').data;
    const rt = { g: { sm: { is: () => false }, uiRoot: {}, save: { storyFlags: {} } }, data: d };
    expect(revealArea(rt, 'tower_visited')).toBe(false);
    rt.g.sm.is = () => true; rt.g.mapOpen = true;
    expect(revealArea(rt, 'tower_visited')).toBe(false);
    expect(rt.areaBeatsShown).toBeUndefined();
  });
});

describe('Entrada do R-4 pela brecha no Posto Norte', () => {
  const { data, script } = getChapter('ch02');
  const encounter = data.encounters.find((e) => e.id === 'ch02_court_r4');
  it('o primeiro predador não nasce durante a intro; após entrar, volta ao carregar save', () => {
    const save = createNewSave();
    const rt = { g: { save } };
    expect(script.onEncounter(rt, encounter, encounter.enemies)).toBe(true);
    save.storyFlags.ch02_breach_entered = true;
    expect(script.onEncounter(rt, encounter, encounter.enemies)).toBe(false);
  });

  it('ao cruzar a brecha cria um único R-4 e grava o gatilho para impedir duplicações', () => {
    const save = createNewSave();
    let spawned = 0, roars = 0;
    const rt = {
      g: {
        save, player: { x: 11.3, z: 27 },
        liveAgents: () => [],
        spawnAgent: () => { spawned++; return { setState() {}, noiseTarget: null }; },
        audio: { play: () => roars++ },
        hud: { toast() {} },
      },
      wf: save.persistentWorldFlags,
      flag(key) { save.storyFlags[key] = true; },
      tutorial() {},
    };
    script.onZoneEnter(rt, { id: 'breach' });
    script.onZoneEnter(rt, { id: 'breach' });
    expect(save.storyFlags.ch02_breach_entered).toBe(true);
    expect(spawned).toBe(1);
    expect(roars).toBe(1);
  });
});
