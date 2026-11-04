import { describe, it, expect } from 'vitest';
import bestiary from '../src/data/bestiary.json';
import { getChapter, CHAPTER_IDS } from '../src/chapters/index.js';

const uniq = (a) => new Set(a).size === a.length;
describe('registro de capítulos', () => {
  it('CHAPTER_IDS inclui ch01, ch02 e ch03 em ordem de campanha', () => { expect(CHAPTER_IDS).toEqual(['ch01', 'ch02', 'ch03']); });
  for (const id of ['ch01', 'ch02', 'ch03']) {
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
      it('objetivos: ids únicos; doneWhen.flag/flags são strings', () => {
        expect(uniq(data.objectives.map((o) => o.id))).toBe(true);
        for (const o of data.objectives) { const w = o.doneWhen; expect(!!(w.zone || w.flag || w.flags), o.id).toBe(true); }
      });
      it('terminais com checkpointId e ponto seguro; spawn dentro dos limites', () => {
        for (const t of data.terminals) { expect(t.checkpointId, t.id).toBeTruthy(); expect(t.safe).toHaveLength(2); }
        const [x0, z0, x1, z1] = data.bounds, [sx, sz] = data.spawn.pos;
        expect(sx > x0 && sx < x1 && sz > z0 && sz < z1).toBe(true);
      });
      it('breakable aponta para estrutura existente', () => {
        const ids = data.structures.map((s) => s.id);
        for (const it of data.interactables.filter((i) => i.kind === 'breakable')) expect(ids, it.id).toContain(it.colliderId ?? it.id);
      });
      it('mapTitle definido', () => { expect(typeof data.mapTitle).toBe('string'); });
    });
  }
  it('ids de zona, interagível, terminal, pickup e tutorial são únicos ENTRE capítulos', () => {
    for (const k of ['zones', 'interactables', 'terminals', 'pickups', 'tutorials']) {
      const all = CHAPTER_IDS.flatMap((id) => getChapter(id).data[k].map((x) => x.id));
      const dup = all.filter((x, i) => all.indexOf(x) !== i);
      expect(dup, k).toEqual([]);
    }
  });
  it('ch01.script.explorationVisited', () => {
    const { script } = getChapter('ch01');
    expect(script.explorationVisited({ persistentWorldFlags: { zonesVisited: ['tower_visited'] } })).toEqual(['tower_visited']);
  });
  it('getChapter desconhecido lança', () => { expect(() => getChapter('nope')).toThrow(); });
});
