import targetsData from '../data/rankTargets.json';

/** Nota normalizada 0–100 por capítulo (GDD 5.13). Segredos NUNCA são necessários para S. */
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class RunStats {
  constructor(s = {}) {
    this.activeSeconds = s.activeSeconds ?? 0; this.damageTaken = s.damageTaken ?? 0;
    this.deaths = s.deaths ?? 0; this.healsUsed = s.healsUsed ?? 0;
    this.shotsFired = s.shotsFired ?? 0; this.shotsHit = s.shotsHit ?? 0;
    this.maxChain = s.maxChain ?? 0; this.ccEarned = s.ccEarned ?? 0; this.counters = s.counters ?? 0;
    this.kills = s.kills ?? 0;
    this.style = s.style ?? { totalPE: 0, byType: {}, peByEncounter: {} };
    this.objectivesDone = s.objectivesDone ?? 0; this.objectivesTotal = s.objectivesTotal ?? 1;
    this.explorationVisited = s.explorationVisited ?? [];
    this.dossiersFound = s.dossiersFound ?? 0; this.secretsFound = s.secretsFound ?? 0;
  }
  get accuracy() { return this.shotsFired ? this.shotsHit / this.shotsFired : 0; }
  serialize() { return { ...this, style: this.style }; }
}

export function gradeFor(total, grades = targetsData.grades) {
  if (total >= grades.S) return 'S';
  if (total >= grades.A) return 'A';
  if (total >= grades.B) return 'B';
  if (total >= grades.C) return 'C';
  return 'D';
}

export function scoreChapter(stats, chapterKey = 'ch01', data = targetsData) {
  const t = data.chapters[chapterKey], W = data.weights;
  const objectives = W.objectives * clamp01(stats.objectivesDone / Math.max(1, stats.objectivesTotal));
  const survival = Math.max(0, W.survival * clamp01(1 - stats.damageTaken / t.maxDamage) - stats.deaths * t.deathPenalty);
  const cappedPE = Object.values(stats.style.peByEncounter || {}).reduce((s, v) => s + Math.min(v, t.styleCapPerEncounter), 0);
  const distinct = Object.keys(stats.style.byType || {}).length;
  const combat = W.combat * (0.4 * clamp01(stats.maxChain / t.chainTarget) + 0.4 * clamp01(cappedPE / t.styleTarget) + 0.2 * clamp01(distinct / t.diversityTypes));
  const timeScore = stats.activeSeconds <= t.parTimeSec ? 1 : clamp01(1 - (stats.activeSeconds - t.parTimeSec) / (1.5 * t.parTimeSec));
  const efficiency = W.efficiency * (0.6 * timeScore + 0.4 * clamp01(1 - stats.healsUsed / t.maxHeals));
  const explored = new Set(stats.explorationVisited).size;
  const exploration = W.exploration * clamp01(explored / t.explorationNodes.length);
  const parts = { objectives, survival, combat, efficiency, exploration };
  const total = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
  return { total, grade: gradeFor(total, data.grades), parts, scoringVersion: data.scoringVersion, cappedPE };
}
