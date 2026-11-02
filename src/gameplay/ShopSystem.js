import shop from '../data/shop.json';
import { WEAPONS } from './GameState.js';
import { EconomyLedger } from './EconomyLedger.js';

/**
 * SHOP (Terminal de Rede Logística Vértice) — GDD 5.2.
 * Preços lidos de shop.json (nunca duplicados em componentes). Compras transacionais e idempotentes.
 * Estados de item: locked | available | owned | out_of_stock | incompatible.
 */
export const SHOP_ITEMS = shop.items;
export const SHOP_TABS = shop.tabs;
export const getItem = (id) => shop.items.find((i) => i.id === id);

export function itemState(item, save, chapter = 1) {
  const inv = save.inventory;
  const grants = item.grants || {};
  if (item.starter) return { state: 'owned', reason: 'Equipamento inicial' };
  if (grants.weapon && inv.weapons[grants.weapon]) return { state: 'owned', reason: 'Já possui' };
  if (item.unique && inv.upgrades.includes(grants.upgrade)) return { state: 'owned', reason: 'Já instalado' };
  if (item.requiresSecret) {
    const st = save.secretFlags[item.requiresSecret];
    if (!(st === 'unlocked' || st === 'claimed') || !save.shopUnlocks.includes(item.id)) return { state: 'locked', reason: 'Protótipo ainda não localizado em campo' };
  }
  if (chapter < item.chapter) return { state: 'locked', reason: `Disponível no Cap. ${String(item.chapter).padStart(2, '0')}` };
  if (item.requiresWeapon && !inv.weapons[item.requiresWeapon]) return { state: 'incompatible', reason: 'Requer arma compatível' };
  if (grants.ammo) {
    for (const [w, n] of Object.entries(grants.ammo)) {
      const cap = WEAPONS[w]?.reserveCap ?? 999;
      if ((inv.ammoReserve[w] ?? 0) + n > cap) return { state: 'out_of_stock', reason: 'Reserva cheia' };
    }
  }
  if (item.cap && (inv.consumables[item.cap.consumable] ?? 0) >= item.cap.max) return { state: 'out_of_stock', reason: 'Limite de transporte' };
  return { state: 'available', reason: '' };
}

function applyGrants(inv, item) {
  const g = item.grants || {};
  if (g.weapon) inv.weapons[g.weapon] = { mag: WEAPONS[g.weapon]?.magSize ?? 0 };
  if (g.ammo) for (const [w, n] of Object.entries(g.ammo)) inv.ammoReserve[w] = (inv.ammoReserve[w] ?? 0) + n;
  if (g.consumable) for (const [c, n] of Object.entries(g.consumable)) inv.consumables[c] = (inv.consumables[c] ?? 0) + n;
  if (g.upgrade && !inv.upgrades.includes(g.upgrade)) inv.upgrades.push(g.upgrade);
}

/**
 * Compra atômica. `persist(nextSave)` grava no armazenamento; se falhar, o estado antigo permanece
 * e NENHUM CC é debitado. Mesmo `transactionId` nunca cobra duas vezes (clique duplo).
 */
export async function purchase(save, itemId, transactionId, persist, chapter = 1) {
  const item = getItem(itemId);
  if (!item) return { ok: false, error: 'item_inexistente', save };
  const ledger = new EconomyLedger(save.economyLedger);
  if (ledger.purchaseIds.has(transactionId)) return { ok: true, duplicate: true, save };
  const st = itemState(item, save, chapter);
  if (st.state !== 'available') return { ok: false, error: `indisponivel:${st.state}`, reason: st.reason, save };
  if (!ledger.canAfford(item.price)) return { ok: false, error: 'saldo_insuficiente', save };

  const next = structuredClone(save);
  const nl = new EconomyLedger(next.economyLedger);
  const r = nl.spend(transactionId, item.price);
  if (!r.ok) return { ok: false, error: r.error, save };
  applyGrants(next.inventory, item);
  next.economyLedger = nl.serialize();
  next.credits = nl.credits;
  try { await persist(next); } catch (e) { return { ok: false, error: 'falha_ao_salvar', detail: String(e?.message ?? e), save }; }
  return { ok: true, save: next, item };
}

export const ERROR_TEXT = {
  saldo_insuficiente: 'Saldo de CC insuficiente.',
  falha_ao_salvar: 'Não foi possível gravar a compra. Nenhum CC foi debitado.',
  item_inexistente: 'Item inexistente.',
};
