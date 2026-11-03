import { describe, it, expect } from 'vitest';
import { getChapter } from '../src/chapters/index.js';
import { createSafeDoorFrames } from '../src/world/SafeRoomDoors.js';

describe('Acessos dos abrigos protegidos', () => {
  it('gera apenas entradas interiores e não adiciona colisores', () => {
    const data1 = getChapter('ch01').data, data2 = getChapter('ch02').data;
    const world = { byId: new Map([['crates_shed', { enabled: true }]]) };
    const a = createSafeDoorFrames({data:data1,world});
    const b = createSafeDoorFrames({data:data2,world});
    expect(a.stats().doors).toBe(1);
    expect(b.stats().doors).toBe(2);
    expect(a.group.children.every(x => x.name.startsWith('safe_door_'))).toBe(true);
    expect(b.group.children.every(x => x.name.startsWith('safe_door_'))).toBe(true);
    const player = {x:-24.2,z:4.12};
    a.update(player,1);
    expect(a.stats().open).toContain('safe_forest_shelter');
    a.update({x:100,z:100},1);
    expect(a.stats().open).toEqual([]);
    expect(world.byId.size).toBe(1);
    a.dispose();b.dispose();
  });
  it('a porta do galpão respeita o obstáculo até o jogador quebrar as caixas', () => {
    const data = getChapter('ch02').data;
    const world = {byId:new Map([['crates_shed',{enabled:true}]])};
    const doors = createSafeDoorFrames({data,world});
    doors.update({x:16,z:12},1);
    expect(doors.stats().open).not.toContain('safe_outpost_shed');
    world.byId.delete('crates_shed');
    doors.update({x:16,z:12},1);
    expect(doors.stats().open).toContain('safe_outpost_shed');
    doors.update({x:-12,z:11.2},1);
    expect(doors.stats().open).toContain('safe_outpost_admin');
    doors.dispose();
  });
});
