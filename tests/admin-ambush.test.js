import { describe, it, expect } from 'vitest';
import { getChapter } from '../src/chapters/index.js';
import { createNewSave } from '../src/gameplay/GameState.js';
import { adminHunterShouldTrigger } from '../src/chapters/ch02.js';

const { data, script } = getChapter('ch02');
const enc = data.encounters.find(e => e.id === 'ch02_admin_hunter');

function setup() {
  const save = createNewSave({ runId: 'run_qa_admin' });
  save.storyFlags.radio_online = true;
  let spawned = 0;
  const all = [], sounds = [];
  const g = {
    save, simMs: 10000, player: { x: -17, z: 11.2 }, mapOpen: false,
    camera: { yaw: 0, fov: 68, aspect: 16 / 9, pos: { x: -17, y: 1.6, z: 11.2 } },
    world: { blockedAt: () => false, segmentBlocked: () => true },
    spawnAgent(def, encounterId) {
      spawned++;
      const agent = { id: def.id, encounterId, x: def.pos[0], z: def.pos[1], setState() {} };
      all.push(agent);
      return agent;
    },
    liveAgents: () => all,
    audio: { play: (name) => sounds.push(name) },
    hud: { toast() {} },
    props: { setGatePanel() {} },
  };
  const rt = {
    g, wf: save.persistentWorldFlags,
    flag: (key) => { save.storyFlags[key] = true; },
    tutorial() {},
    defense: null, gate: { state: () => ({ ready: true }) },
    k1At: null, roarPendingSince: null, adminAmbushAt: null,
  };
  return { g, rt, save, sounds, get spawned() { return spawned; } };
}

describe('Emboscada do rádio — Capítulo 02', () => {
  it('só arma após rádio e não repete quando marcado ou derrotado', () => {
    const { save } = setup();
    expect(adminHunterShouldTrigger(save)).toBe(true);
    save.storyFlags.radio_online = false;
    expect(adminHunterShouldTrigger(save)).toBe(false);
    save.storyFlags.radio_online = true;
    save.storyFlags.ch02_admin_hunter_triggered = true;
    expect(adminHunterShouldTrigger(save)).toBe(false);
    delete save.storyFlags.ch02_admin_hunter_triggered;
    save.persistentWorldFlags.defeatedEnemies.push('r4j_admin');
    expect(adminHunterShouldTrigger(save)).toBe(false);
  });

  it('o juvenil só surge depois do corredor, fora da visão, uma vez por run', () => {
    const x = setup();
    expect(script.onEncounter(x.rt, enc, enc.enemies)).toBe(true);
    expect(x.spawned).toBe(0);
    script.onZoneEnter(x.rt, { id: 'admin_corridor' });
    expect(x.rt.adminAmbushAt).toBe(11100);
    script.onZoneEnter(x.rt, { id: 'admin_corridor' });
    expect(x.rt.adminAmbushAt).toBe(11100);
    script.step(x.rt, 1 / 60, 11000);
    expect(x.spawned).toBe(0);
    script.step(x.rt, 1 / 60, 11120);
    expect(x.spawned).toBe(1);
    expect(x.save.storyFlags.ch02_admin_hunter_triggered).toBe(true);
    expect(x.sounds).toContain('creak');
    expect(x.sounds).toContain('roar');
    script.step(x.rt, 1 / 60, 11300);
    expect(x.spawned).toBe(1);
    script.onZoneEnter(x.rt, { id: 'admin_corridor' });
    expect(x.rt.adminAmbushAt).toBeNull();
  });

  it('ao recarregar save com evento acionado, reinstancia somente se não derrotado', () => {
    const x = setup();
    x.save.storyFlags.ch02_admin_hunter_triggered = true;
    expect(script.onEncounter(x.rt, enc, enc.enemies)).toBe(true);
    expect(x.spawned).toBe(1);
    x.save.persistentWorldFlags.defeatedEnemies.push('r4j_admin');
    const alive = enc.enemies.filter(e => !x.save.persistentWorldFlags.defeatedEnemies.includes(e.id));
    expect(script.onEncounter(x.rt, enc, alive)).toBe(true);
    expect(x.spawned).toBe(1);
  });
});
