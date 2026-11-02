/**
 * Ledger de Créditos de Contenção (CC) — GDD 5.2.2 / 5.15.
 * - Toda concessão tem `rewardId` único: repetir o mesmo id nunca paga duas vezes (anti-farm, reload, clique duplo).
 * - Compras são identificadas por `transactionId` (idempotentes).
 * - Inimigos de respawn pagam recompensa reduzida com teto por setor.
 */
export const RESPAWN_PAYOUT_RATE = 0.25;
export const RESPAWN_SECTOR_CAP = 500;

export class EconomyLedger {
  constructor(snap = {}) {
    this.credits = snap.credits ?? 0;
    this.claimedRewardIds = new Set(snap.claimedRewardIds ?? []);
    this.claimedEncounterIds = new Set(snap.claimedEncounterIds ?? []);
    this.purchaseIds = new Set(snap.purchaseIds ?? []);
    this.respawnPaid = { ...(snap.respawnPaid ?? {}) };
    this.totalEarned = snap.totalEarned ?? 0;
    this.totalSpent = snap.totalSpent ?? 0;
  }

  /** Concede CC uma única vez por rewardId. Retorna o valor realmente pago (0 se repetido). */
  credit(rewardId, amount) {
    amount = Math.max(0, Math.round(amount));
    if (!rewardId || this.claimedRewardIds.has(rewardId) || amount === 0) return 0;
    this.claimedRewardIds.add(rewardId);
    this.credits += amount;
    this.totalEarned += amount;
    return amount;
  }

  /** Inimigo que reaparece: 25% do base, teto por setor. */
  creditRespawn(sectorId, rewardId, baseCC) {
    if (this.claimedRewardIds.has(rewardId)) return 0;
    const paid = this.respawnPaid[sectorId] ?? 0;
    const room = Math.max(0, RESPAWN_SECTOR_CAP - paid);
    const amount = Math.min(room, Math.round(baseCC * RESPAWN_PAYOUT_RATE));
    if (amount <= 0) return 0;
    this.respawnPaid[sectorId] = paid + amount;
    return this.credit(rewardId, amount);
  }

  canAfford(price) { return Number.isFinite(price) && price >= 0 && this.credits >= price; }

  /** Debita preço; nunca deixa saldo negativo nem repete transação. */
  spend(transactionId, price) {
    if (this.purchaseIds.has(transactionId)) return { ok: true, duplicate: true, charged: 0 };
    if (!this.canAfford(price)) return { ok: false, error: 'saldo_insuficiente' };
    this.credits -= price;
    this.totalSpent += price;
    this.purchaseIds.add(transactionId);
    return { ok: true, charged: price };
  }

  markEncounterClaimed(id) { this.claimedEncounterIds.add(id); }

  serialize() {
    return {
      credits: this.credits,
      claimedRewardIds: [...this.claimedRewardIds],
      claimedEncounterIds: [...this.claimedEncounterIds],
      purchaseIds: [...this.purchaseIds],
      respawnPaid: { ...this.respawnPaid },
      totalEarned: this.totalEarned,
      totalSpent: this.totalSpent,
    };
  }
}
