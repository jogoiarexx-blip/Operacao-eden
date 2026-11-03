import { describe, it, expect } from 'vitest';
import { createNewSave } from '../src/gameplay/GameState.js';
import { activeInventory } from '../src/gameplay/Characters.js';
import { SaveManager, MemoryAdapter, migrateSave, validateSave } from '../src/gameplay/SaveManager.js';
import { purchase } from '../src/gameplay/ShopSystem.js';
import { EconomyLedger } from '../src/gameplay/EconomyLedger.js';
import { Player } from '../src/actors/Player.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';

describe('save v5', () => {
  it('createNewSave: inventários por personagem', () => {
    const s = createNewSave();
    expect(s.schemaVersion).toBe(5);
    expect(s.inventories.lia.equipped).toBe('pistol'); expect(s.inventories.caio.equipped).toBe('shotgun');
    expect(Array.isArray(s.teamKeys)).toBe(true); expect(s.inventory).toBeUndefined();
    expect(s.persistentWorldFlags.chapter.ch01.gateOpen).toBe(false);
  });
  it('migra v4 → v5 sem perder progressão', () => {
    const o = createNewSave(); delete o.inventories; delete o.teamKeys;
    o.schemaVersion = 4; o.inventory = { equipped: 'pistol', ammoReserve: { pistol: 50 }, upgrades: ['vest_1'], teamKeys: ['k1'] };
    o.persistentWorldFlags = { defeatedEnemies: [], pickedUp: [], tutorialSeen: [], zonesVisited: [], gateOpen: true };
    const { save, migrated } = migrateSave(o);
    expect(migrated).toBe(true);
    expect(save.inventories.lia.ammoReserve.pistol).toBe(50); expect(save.inventories.lia.upgrades).toContain('vest_1');
    expect(save.inventories.caio.equipped).toBe('shotgun');
    expect(save.teamKeys).toEqual(['k1']); expect(save.persistentWorldFlags.chapter.ch01.gateOpen).toBe(true);
    expect(save.inventory).toBeUndefined(); expect(validateSave(save).errors).toEqual([]);
  });
  it('activeInventory e compra isolada por personagem', async () => {
    const s = createNewSave(); s.playerId = 'caio';
    expect(activeInventory(s)).toBe(s.inventories.caio);
    const l = new EconomyLedger(s.economyLedger); l.credit('t', 1000); s.economyLedger = l.serialize(); s.credits = l.credits;
    const liaBefore = s.inventories.lia.ammoReserve.shotgun, before = s.inventories.caio.ammoReserve.shotgun;
    const r = await purchase(s, 'ammo_shotgun_12', 'tx1', async () => {}, 2);
    expect(r.ok).toBe(true);
    expect(r.save.inventories.caio.ammoReserve.shotgun).toBe(before + 12);
    expect(r.save.inventories.lia.ammoReserve.shotgun).toBe(liaBefore);
    expect(r.save.economyLedger.credits).toBe(1000 - 450);
  });
  it('Player usa o personagem do save', () => {
    const w = new CollisionWorld(); const p = new Player(w);
    const s = createNewSave(); s.playerId = 'caio'; p.loadFromSave(s);
    expect(p.maxHp).toBe(120); expect(p.weaponId).toBe('shotgun'); p.hp = 120;
    expect(p.takeDamage(20, 0)).toBe(17); expect(p.hp).toBe(103);
    const l = new Player(w); l.loadFromSave(createNewSave()); expect(l.maxHp).toBe(100); expect(l.takeDamage(20, 0)).toBe(20); expect(l.dodgeCdS).toBe(0.85);
  });
  it('round-trip do SaveManager com Caio no ch02', async () => {
    const m = new SaveManager(new MemoryAdapter()); const s = createNewSave(); s.playerId = 'caio'; s.chapterId = 'ch02';
    s.inventories.caio.ammoReserve.shotgun = 7;
    await m.save(1, s); const r = await m.load(1);
    expect(r.save.playerId).toBe('caio'); expect(r.save.inventories.caio.ammoReserve.shotgun).toBe(7); expect(r.migrated).toBe(false);
  });
});
