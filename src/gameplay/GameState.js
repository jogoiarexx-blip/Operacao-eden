import weapons from '../data/weapons.json';
import { newInventory, getCharacter } from './Characters.js';

export const SCHEMA_VERSION = 5;
export const SCORING_VERSION = 1;

export function newRunId(slot = 1, counter = Date.now()) { return `run_${String(slot).padStart(2, '0')}_${counter.toString(36)}`; }

/** Estado de campanha (esquema 5, GDD 9.5 + 9.10). Dados puros, serializáveis em JSON. */
export function createNewSave({ slot = 1, profileId = 'local_profile_01', difficultyId = 'standard', runId = newRunId(slot), mode = 'campaign' } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION, slot, runId,
    chapterId: 'ch01', sectorId: 'jungle_north_01', checkpointId: 'start', checkpoint: { pos: [0, 36], yaw: 0 },
    playerId: 'lia',
    health: { lia: getCharacter('lia').maxHp, caio: getCharacter('caio').maxHp }, bleeding: { lia: false, caio: false },
    credits: 0,
    economyLedger: { credits: 0, claimedRewardIds: [], claimedEncounterIds: [], purchaseIds: [], respawnPaid: {}, totalEarned: 0, totalSpent: 0 },
    secretFlags: {}, secretMeta: {}, storySecrets: [], dossiersInRun: [], documents: [], journal: [],
    shopUnlocks: [],
    inventories: { lia: newInventory('lia'), caio: newInventory('caio') },   // um inventário por personagem
    teamKeys: [],                                                         // chaves compartilhadas pela equipe
    completedObjectives: [], storyFlags: {}, rescueFlags: {}, containmentFlags: {},
    cameraSettings: { preferredShoulder: 'right', invertY: false },
    persistentWorldFlags: { defeatedEnemies: [], pickedUp: [], tutorialSeen: [], zonesVisited: [], chapter: { ch01: { gateOpen: false } } },
    playtimeSeconds: 0,
    profileId,
    difficulty: { selected: difficultyId, current: difficultyId, changed: false },
    difficultyVersion: 1,
    rankEligibility: 'classified',
    scoringVersion: SCORING_VERSION,
    runRules: { mode, infiniteAmmo: false, mutators: [] },
    chapterStats: {},
    stats: null,
    attempts: 0,
    savedAt: null,
  };
}

export const WEAPONS = weapons.weapons;
export const UTILITY = weapons.utility;
