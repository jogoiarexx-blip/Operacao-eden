import { getChapter } from '../chapters/index.js';

// A conclusão inicial permanece narrativa; depois, as duas passagens são reversíveis.
export const BACKTRACK_PORTALS = Object.freeze({
  ch01: { to: 'ch02', pos: [0, -42], radius: 3.1, entry: [11.3, 34], yaw: 0, label: 'Ir para o Posto Norte' },
  ch02: { to: 'ch01', pos: [11.3, 34.5], radius: 2.8, entry: [0, -37], yaw: 0, label: 'Voltar à Selva Norte' },
});

export function availableBacktrackPortal(save, x, z) {
  if (!save?.chapterStats?.ch01 || !save.storyFlags?.outpost_access) return null;
  const p = BACKTRACK_PORTALS[save.chapterId];
  return p && Math.hypot(x - p.pos[0], z - p.pos[1]) <= p.radius ? p : null;
}

export function recordChapterState(save) {
  const history = save.backtrack ??= { sectors: {}, visits: {}, patrolDeaths: [] };
  history.sectors ??= {}; history.visits ??= {}; history.patrolDeaths ??= [];
  history.sectors[save.chapterId] = {
    ...(history.sectors[save.chapterId] ?? {}),
    completedObjectives: [...(save.completedObjectives ?? [])],
    stats: save.stats == null ? null : structuredClone(save.stats),
    checkpointId: save.checkpointId,
    checkpoint: structuredClone(save.checkpoint),
  };
  history.visits[save.chapterId] ??= 1;
  return history;
}

/** Entrada por portal não recarrega HP, inventário, objetivos globais ou recompensas. */
export function travelBacktrack(save, portal, liveEnemies = null) {
  if (portal !== BACKTRACK_PORTALS[save.chapterId] || !availableBacktrackPortal(save, ...portal.pos))
    throw new Error('Passagem de retorno bloqueada');
  const s = structuredClone(save);
  const h = recordChapterState(s);
  // As criaturas narrativas sobreviventes mantêm dano e posição ao retornar.
  // Patrulhas extras têm seu próprio ciclo de revisita, sem acumular indefinidamente.
  if (Array.isArray(liveEnemies)) {
    h.sectors[save.chapterId].enemies = liveEnemies
      .filter(a => a && !a.backtrack && typeof a.id === 'string' && Number.isFinite(a.x) &&
        Number.isFinite(a.z) && Number.isFinite(a.hp) && a.hp > 0)
      .map(a => ({ id: a.id, x: a.x, z: a.z, hp: a.hp }));
  }
  const dest = getChapter(portal.to).data;
  const previous = h.sectors[portal.to];
  h.visits[portal.to] = (h.visits[portal.to] ?? 1) + 1;
  s.chapterId = portal.to; s.sectorId = dest.id; s.playerId = dest.protagonist;
  s.completedObjectives = [...(previous?.completedObjectives ?? [])];
  s.stats = previous?.stats == null ? null : structuredClone(previous.stats);
  s.checkpointId = 'backtrack_entry';
  s.checkpoint = { pos: [...portal.entry], yaw: portal.yaw };
  return s;
}

// Patrulhas comuns limitadas por revisita; chefes e encontros de missão são intocados.
const PATROLS = {
  ch01: [
    { type: 'forest_runner_juvenile', points: [[-8, -20], [11, -17], [-17, -8], [13, 9]] },
    { type: 'forest_runner', points: [[18, 5], [-18, 9], [7, -22]] },
  ],
  ch02: [
    { type: 'forest_runner_juvenile', points: [[-3, 21], [1, 17], [4, 12]] },
    { type: 'forest_runner', points: [[-8, 19], [9, 8], [-4, 13]] },
  ],
};

export function planRevisitPatrol(save, world, playerPos, occupied = []) {
  const visits = save.backtrack?.visits?.[save.chapterId] ?? 1;
  if (visits <= 1) return [];
  const rules = PATROLS[save.chapterId] ?? [];
  const dead = new Set(save.backtrack?.patrolDeaths ?? []);
  const planned = [];
  for (let i = 0; i < Math.min(rules.length, visits - 1); i++) {
    const id = `bt_${save.chapterId}_v${visits}_${i}`;
    if (dead.has(id)) continue;
    const pos = rules[i].points.find(([x, z]) =>
      Math.hypot(x - playerPos.x, z - playerPos.z) >= 9 &&
      !world.blockedAt(x, z, 0.75) &&
      !occupied.some(o => !o.dead && Math.hypot(o.x - x, o.z - z) < 4) &&
      !planned.some(o => Math.hypot(o.pos[0] - x, o.pos[1] - z) < 5)
    );
    if (pos) planned.push({ id, type: rules[i].type, pos: [...pos], patrol: [], backtrack: true, sectorId: save.sectorId });
  }
  return planned;
}
