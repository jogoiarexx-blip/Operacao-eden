import { safeRoomAt } from './SafeZones.js';

/**
 * Regiões exploráveis sem tela de carregamento dentro de cada mapa.
 * São volumes de navegação, não duplicam as zonas narrativas dos capítulos.
 * Cada retorno pode reativar UMA patrulha comum após cooldown; chefes,
 * documentos, pickups, portas e encontros da campanha não são reiniciados.
 */
export const REGION_REENTRY_COOLDOWN = 35; // segundos de jogo, não relógio do sistema
export const REGION_FIRST_REENTRY_DELAY = 20;
export const REGION_MAX_LIVE_PATROLS = 4;
export const REGION_DEFINITIONS = Object.freeze({
  ch01: [
    { id: 'east_trail', name: 'Trilha Leste', center: [27, 13], radius: 7, type: 'forest_runner_juvenile', spawnPoints: [[18, 8], [28, 3], [21, 22]] },
    { id: 'beacon', name: 'Clareira do Sinal', center: [10, 6], radius: 7.2, type: 'forest_runner', spawnPoints: [[-2, 11], [20, 11], [15, -5]] },
    { id: 'west_trail', name: 'Trilha do Abrigo', center: [-22, 7], radius: 6.5, type: 'forest_runner_juvenile', spawnPoints: [[-10, 11], [-17, -3], [-14, 16]] },
    { id: 'river', name: 'Travessia do Rio', center: [8, -9], radius: 6, type: 'forest_runner_juvenile', spawnPoints: [[-2, -15], [18, -16], [18, -3]] },
    { id: 'recon_camp', name: 'Acampamento de Reconhecimento', center: [-9, -25], radius: 7, type: 'forest_runner', spawnPoints: [[-18, -16], [-19, -32], [3, -21]] },
  ],
  ch02: [
    { id: 'north_road', name: 'Estrada de Acesso', center: [8, 28], radius: 7.4, type: 'forest_runner_juvenile', spawnPoints: [[-4, 22], [6, 17], [0, 35]] },
    { id: 'generator', name: 'Acesso ao Gerador', center: [13, 12], radius: 6.6, type: 'forest_runner_juvenile', spawnPoints: [[3, 4], [5, 22], [13, 0]] },
    { id: 'admin', name: 'Pátio Administrativo', center: [-15, 17], radius: 7, type: 'forest_runner', spawnPoints: [[-3, 11], [-18, 29], [-5, 27]] },
    { id: 'yard', name: 'Pátio de Contenção', center: [0, -15], radius: 8.5, type: 'forest_runner_juvenile', spawnPoints: [[-11, -22], [12, -18], [2, -3]] },
    { id: 'archive', name: 'Acesso ao Arquivo', center: [13, -27], radius: 5.8, type: 'forest_runner_juvenile', spawnPoints: [[0, -22], [23, -20], [7, -16]] },
  ],
});

/** Histerese espacial impede a multiplicação de visitas na borda do setor. */
export function regionAt(chapterId, x, z, previous = null) {
  const regions = REGION_DEFINITIONS[chapterId] ?? [];
  const old = regions.find(r => r.id === previous);
  if (old && Math.hypot(x - old.center[0], z - old.center[1]) <= old.radius + 1.5)
    return old;
  let closest = null, best = Infinity;
  for (const region of regions) {
    const score = Math.hypot(x - region.center[0], z - region.center[1]) / region.radius;
    if (score <= 1 && score < best) { closest = region; best = score; }
  }
  return closest;
}

export function regionHistory(save) {
  const root = save.backtrack ??= { sectors: {}, visits: {}, patrolDeaths: [] };
  root.regions ??= {};
  return root.regions;
}

export function recordRegionEntry(save, region, now = save.playtimeSeconds ?? 0) {
  const key = `${save.chapterId}:${region.id}`;
  const history = regionHistory(save);
  const state = history[key] ??= { visits: 0, firstSeenAt: now, lastSpawnAt: -1, spawns: 0 };
  state.visits++;
  if (!Number.isFinite(state.firstSeenAt)) state.firstSeenAt = now;
  return { key, state };
}

export function planRegionReentry({ save, region, data, world, player, occupied = [], now = save.playtimeSeconds ?? 0 }) {
  const key = `${save.chapterId}:${region.id}`;
  const state = save.backtrack?.regions?.[key];
  if (!state || state.visits < 2 ||
      now - state.firstSeenAt < REGION_FIRST_REENTRY_DELAY ||
      (state.lastSpawnAt >= 0 && now - state.lastSpawnAt < REGION_REENTRY_COOLDOWN) ||
      safeRoomAt(data, player.x, player.z) ||
      occupied.filter(a => !a.dead && a.backtrack && String(a.sectorId).startsWith('region:')).length >= REGION_MAX_LIVE_PATROLS)
    return null;

  const start = state.spawns % region.spawnPoints.length;
  for (let i = 0; i < region.spawnPoints.length; i++) {
    const [x, z] = region.spawnPoints[(start + i) % region.spawnPoints.length];
    if (Math.hypot(x - player.x, z - player.z) < 8 ||
        world.blockedAt(x, z, 0.75) ||
        safeRoomAt(data, x, z, 1) ||
        occupied.some(a => !a.dead && Math.hypot(a.x - x, a.z - z) < 4))
      continue;
    const id = `region_${save.chapterId}_${region.id}_${state.spawns + 1}`;
    if (save.backtrack?.patrolDeaths?.includes(id)) continue;
    return { id, type: region.type, pos: [x, z], patrol: [], backtrack: true,
      sectorId: `region:${save.chapterId}:${region.id}`, encounterId: `regional:${save.chapterId}:${region.id}:${state.spawns + 1}` };
  }
  return null;
}

export function markRegionSpawn(save, region, now = save.playtimeSeconds ?? 0) {
  const state = regionHistory(save)[`${save.chapterId}:${region.id}`];
  if (!state) throw Error('Setor ainda não visitado');
  state.spawns++;
  state.lastSpawnAt = now;
  return state.spawns;
}

/** Diretor leve: apenas verifica mudança de volume no passo fixo, sem cena extra. */
export class RegionalSectorDirector {
  constructor(game) { this.game = game; this.activeId = null; this.lastRegion = null; }
  step() {
    const g = this.game, pos = g.player, save = g.save;
    if (!save || pos.dead) return null;
    const region = regionAt(save.chapterId, pos.x, pos.z, this.activeId);
    if ((region?.id ?? null) === this.activeId) return null;
    this.activeId = region?.id ?? null;
    if (!region) return null;
    this.lastRegion = region.id;
    recordRegionEntry(save, region);
    const def = planRegionReentry({
      save, region, data: g.chapterDef.data, world: g.world, player: pos,
      occupied: g.liveAgents(),
    });
    if (!def) return { region: region.id, spawned: false };
    g.combo.registerEncounter(def.encounterId, 1, false);
    g.spawnAgent(def, def.encounterId);
    markRegionSpawn(save, region);
    g.hud.toast(`Novos predadores na região: ${region.name}`, 'warn');
    return { region: region.id, spawned: true, enemyId: def.id };
  }
}
