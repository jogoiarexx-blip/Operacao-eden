import { describe, it, expect } from 'vitest';
import bestiary from '../src/data/bestiary.json';
import { getChapter, CHAPTER_IDS } from '../src/chapters/index.js';

const uniq = (a) => new Set(a).size === a.length;
describe('registro de capítulos', () => {
  it('CHAPTER_IDS inclui ch01', () => { expect(CHAPTER_IDS).toContain('ch01'); });
  for (const id of ['ch01']) {
    describe(id, () => {
      const { data, script } = getChapter(id);
      it('ids únicos', () => {
        for (const k of ['pickups', 'interactables', 'zones', 'terminals']) expect(uniq(data[k].map((x) => x.id)), k).toBe(true);
        expect(uniq(data.encounters.flatMap((e) => e.enemies.map((x) => x.id))), 'enemies').toBe(true);
      });
      it('doneWhen.zone existe em zones', () => {
        const zs = data.zones.map((z) => z.id);
        for (const o of data.objectives) if (o.doneWhen.zone) expect(zs, o.id).toContain(o.doneWhen.zone);
      });
      it('tipos de inimigo existem no bestiário', () => {
        for (const e of data.encounters) for (const en of e.enemies) expect(bestiary.species[en.type], en.id).toBeTruthy();
      });
    });
  }
  it('ch01.script.explorationVisited', () => {
    const { script } = getChapter('ch01');
    expect(script.explorationVisited({ persistentWorldFlags: { zonesVisited: ['tower_visited'] } })).toEqual(['tower_visited']);
  });
  it('getChapter desconhecido lança', () => { expect(() => getChapter('nope')).toThrow(); });
});
