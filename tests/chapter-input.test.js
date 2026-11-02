import { describe, it, expect, vi, afterEach } from 'vitest';
import { Input } from '../src/input/Input.js';
import { DEFAULT_BINDINGS } from '../src/core/Settings.js';
import { ChapterRuntime } from '../src/gameplay/ChapterRuntime.js';

function makeInput() {
  vi.stubGlobal('addEventListener', () => {});
  vi.stubGlobal('document', { addEventListener() {} });
  return new Input({ addEventListener() {} }, { bindings: DEFAULT_BINDINGS, deadzone: .15 });
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
describe('recursos do primeiro capítulo', () => {
  const collect = (reserve) => {
    const save = { persistentWorldFlags: { pickedUp: [] }, inventory: { ammoReserve: { pistol: reserve }, consumables: {} }, difficulty: { current: 'standard' } };
    const g = { save, syncSaveFromRuntime() {}, syncRuntimeFromSave: vi.fn(), hud: { toast: vi.fn() }, audio: { play() {} } };
    const chapter = new ChapterRuntime(g);
    const k = { def: { id: 'ammo_pier', kind: 'supplies', ammo: { pistol: 12 } }, mesh: { traverse() {} } };
    chapter.pickups = [k]; chapter.collect(k); return { save, chapter, g };
  };
  it('preserva munição no cenário com a reserva cheia', () => {
    const { save, chapter } = collect(120);
    expect(save.persistentWorldFlags.pickedUp).toEqual([]); expect(chapter.pickups).toHaveLength(1);
  });
  it('mostra apenas a quantidade que entrou na reserva', () => {
    const { g, save } = collect(119);
    expect(save.inventory.ammoReserve.pistol).toBe(120);
    expect(g.hud.toast).toHaveBeenCalledWith('+1 munição', 'good');
  });
});

describe('progressão completa do capítulo', () => {
  it('exige energia e rádio antes de abrir o portão e concluir', () => {
    const save = { persistentWorldFlags: { zonesVisited: [], pickedUp: [], defeatedEnemies: [] }, storyFlags: {}, completedObjectives: [], documents: [] };
    const g = { save, player: { x: 4.2, z: -36.4 }, settings: { bindings: DEFAULT_BINDINGS }, input: {},
      hud: { toast: vi.fn(), setPrompt() {} }, dialogue: { play() {} }, audio: { play() {} },
      scenery: { setBeaconPowered() {}, setGateOpen() {} }, world: { setEnabled: vi.fn() }, finishChapter: vi.fn() };
    const chapter = new ChapterRuntime(g); chapter.lastZones = new Set(); chapter.tutorial = () => {};
    chapter.interactions(.1, 1000, { interactPressed: true });
    expect(save.persistentWorldFlags.gateOpen).toBeUndefined();
    chapter.repairBeacon();
    chapter.interactions(.1, 1100, { interactPressed: true });
    expect(save.persistentWorldFlags.gateOpen).toBeUndefined();
    g.player = { x: -6.5, z: -24.5 }; chapter.interactions(.1, 1200, { interactPressed: true });
    expect(save.storyFlags.recon_found).toBe(true);
    g.player = { x: 4.2, z: -36.4 }; chapter.interactions(.1, 1300, { interactPressed: true });
    expect(save.storyFlags.outpost_access).toBe(true);
    expect(g.world.setEnabled).toHaveBeenCalledWith('gate_leaf', false);
    save.persistentWorldFlags.zonesVisited.push('tower_visited'); chapter.objectives();
    expect(save.completedObjectives).toHaveLength(4);
    // Enter the actual exit zone, with late encounter already accounted for.
    save.persistentWorldFlags.lateScheduled = true;
    g.player = { x: 0, z: -43 }; chapter.step(.016, 1400, {});
    expect(g.finishChapter).toHaveBeenCalledTimes(1);
    chapter.step(.016, 1416, {}); expect(g.finishChapter).toHaveBeenCalledTimes(1);
  });
});
