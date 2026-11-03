import * as THREE from 'three';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Input } from '../src/input/Input.js';
import { DEFAULT_BINDINGS } from '../src/core/Settings.js';
import { ChapterRuntime } from '../src/gameplay/ChapterRuntime.js';
import { createNewSave, WEAPONS } from '../src/gameplay/GameState.js';
import { getChapter } from '../src/chapters/index.js';

function makeInput() {
  vi.stubGlobal('addEventListener', () => {});
  vi.stubGlobal('document', { addEventListener() {} });
  return new Input({ addEventListener() {} }, { bindings: DEFAULT_BINDINGS, deadzone: .15 });
}
function makeChapter() {
  const save = createNewSave({ runId: 'input-qa' });
  const g = {
    save,
    player: { x: 0, z: 36, dead: false, dodging: false, using: null },
    settings: { bindings: DEFAULT_BINDINGS },
    input: {},
    simMs: 0,
    hud: { toast: vi.fn(), setPrompt: vi.fn() },
    audio: { play: vi.fn() },
    dialogue: { play: vi.fn() },
    props: { setGateOpen: vi.fn(), setBeaconPowered: vi.fn(), startCollapse: vi.fn() },
    world: { setEnabled: vi.fn() },
    camera: { shake: vi.fn() },
    syncSaveFromRuntime: vi.fn(),
    syncRuntimeFromSave: vi.fn(),
    finishChapter: vi.fn(),
  };
  const chapter = new ChapterRuntime(g, getChapter('ch01'));
  chapter.lastZones = new Set();
  return { g, save, chapter };
}

afterEach(() => vi.unstubAllGlobals());

describe('entrada ao pausar e no celular', () => {
  it('combina movimento, mira, disparo e interação sustentada', () => {
    const input = makeInput(); input.setEnabled(true);
    input.touchMove = { x: .6, y: .8 };
    for (const a of ['aim', 'fire', 'interact']) input.touchAction(a, true);
    expect(input.snapshot()).toMatchObject({ moveX: .6, moveY: .8, aim: true, firePressed: true, interactHeld: true });
    expect(input.snapshot()).toMatchObject({ firePressed: false, fireHeld: true, interactPressed: false, interactHeld: true });
    input.setEnabled(false); input.setEnabled(true);
    expect(input.snapshot()).toMatchObject({ moveX: 0, moveY: 0, fireHeld: false, interactHeld: false });
  });
  it('limpa ações pendentes e analógicos ao desconectar controle', () => {
    const input = makeInput(); input.padAxes = { x: 1, y: 1 }; input.padPrev = { fire: true };
    vi.stubGlobal('navigator', { getGamepads: () => [] }); input.pollGamepad();
    expect(input.snapshot().moveX).toBe(0); expect(input.padPrev).toEqual({});
    input.touchAction('pause', true); expect(input.consumeFrame('pause')).toBe(false);
    input.setEnabled(true); input.touchAction('pause', true); input.setEnabled(false);
    expect(input.consumeFrame('pause')).toBe(false);
  });
});

describe('suprimentos do primeiro capítulo', () => {
  const collect = (reserve) => {
    const { g, save, chapter } = makeChapter();
    save.inventories.lia.ammoReserve.pistol = reserve;
    const k = { def: { id: 'ammo_pier', kind: 'supplies', ammo: { pistol: 12 } }, mesh: new THREE.Group() };
    chapter.pickups = [k]; chapter.group.add(k.mesh);
    chapter.collect(k);
    return { g, save, chapter };
  };
  it('preserva caixa de munição quando a reserva está cheia', () => {
    const cap = WEAPONS.pistol.reserveCap;
    const { save, chapter } = collect(cap);
    expect(save.inventories.lia.ammoReserve.pistol).toBe(cap);
    expect(save.persistentWorldFlags.pickedUp).toEqual([]);
    expect(chapter.pickups).toHaveLength(1);
  });
  it('mostra somente a munição efetivamente recolhida', () => {
    const cap = WEAPONS.pistol.reserveCap;
    const { g, save } = collect(cap - 1);
    expect(save.inventories.lia.ammoReserve.pistol).toBe(cap);
    expect(g.hud.toast).toHaveBeenCalledWith('+1 munição', 'good');
    expect(save.persistentWorldFlags.pickedUp).toContain('ammo_pier');
  });
});

describe('progressão do capítulo por hooks atuais', () => {
  it('exige baliza e rádio antes de abrir o portão', () => {
    const { g, save, chapter } = makeChapter();
    const gate = { type: 'gate_panel', it: { id: 'gate_panel' } };
    chapter.script.onInteract(chapter, gate);
    expect(save.persistentWorldFlags.chapter.ch01.gateOpen).toBe(false);
    save.storyFlags.beacon_repaired = true;
    chapter.script.onInteract(chapter, gate);
    expect(save.persistentWorldFlags.chapter.ch01.gateOpen).toBe(false);
    save.storyFlags.recon_found = true;
    chapter.script.onInteract(chapter, gate);
    expect(save.persistentWorldFlags.chapter.ch01.gateOpen).toBe(true);
    expect(save.storyFlags.outpost_access).toBe(true);
    expect(g.world.setEnabled).toHaveBeenCalledWith('gate_leaf', false);
  });
  it('marca objetivos apenas quando as condições forem satisfeitas', () => {
    const { g, save, chapter } = makeChapter();
    chapter.objectives();
    expect(save.completedObjectives).toEqual([]);
    save.persistentWorldFlags.zonesVisited.push('tower_visited');
    save.storyFlags.beacon_repaired = true;
    chapter.objectives();
    expect(save.completedObjectives).toContain('reach_tower');
    expect(save.completedObjectives).toContain('repair_beacon');
    expect(save.completedObjectives).not.toContain('open_gate');
    expect(g.hud.toast).toHaveBeenCalledTimes(2);
  });
  it('saída só é liberada com o portão aberto e a Lia na zona', () => {
    const { g, save, chapter } = makeChapter();
    g.player.x = 0; g.player.z = -43;
    expect(chapter.script.exitWhen(chapter)).toBe(false);
    save.persistentWorldFlags.chapter.ch01.gateOpen = true;
    save.storyFlags.outpost_access = true;
    expect(chapter.script.exitWhen(chapter)).toBe(true);
    g.player.z = 4;
    expect(chapter.script.exitWhen(chapter)).toBe(false);
  });
  it('desabamento é disparado apenas uma vez ao entrar na passarela', () => {
    const { g, save, chapter } = makeChapter();
    const zone = chapter.data.zones.find((z) => z.id === 'bridge_mid');
    chapter.script.onZoneEnter(chapter, zone);
    chapter.script.onZoneEnter(chapter, zone);
    expect(save.persistentWorldFlags.bridgeCollapsed).toBe(true);
    expect(g.props.startCollapse).toHaveBeenCalledTimes(1);
  });
  it('encontro tardio é reagendado pelos hooks do capítulo', () => {
    const { g, save, chapter } = makeChapter();
    g.simMs = 1000;
    save.persistentWorldFlags.lateScheduled = true;
    const result = chapter.script.onEncounter(chapter, { late: true }, [{ id: 'r4_b' }]);
    expect(result).toBe(true);
    expect(chapter.lateAt).toBe(3500);
  });
});
