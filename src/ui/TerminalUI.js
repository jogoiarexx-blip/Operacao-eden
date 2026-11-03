import { keyLabel } from '../core/Settings.js';
import { h, fmtNum } from './dom.js';
import { SHOP_ITEMS, SHOP_TABS, itemState, ERROR_TEXT } from '../gameplay/ShopSystem.js';
import { difficulty, ORDER } from '../gameplay/DifficultyManager.js';
import { WEAPONS } from '../gameplay/GameState.js';
import { activeInventory, getCharacter } from '../gameplay/Characters.js';
import { drawMap } from './MapView.js';
import docs from '../data/documents.json';
import { getDossier, DOSSIER_IDS } from '../gameplay/SecretManager.js';

/**
 * Terminal de Rede Logística Vértice (SHOP). Menu 2D (DOM/CSS) sobre o jogo pausado.
 * Compra NUNCA acontece ao mudar de aba ou selecionar: só após confirmação explícita.
 * Abas: SALVAR | COMPRAR | EQUIPAR | DOCUMENTOS | MAPA.
 */
export class TerminalUI {
  constructor(game) { this.game = game; this.el = null; this.tab = 'SALVAR'; this.buyTab = 'MUNIÇÃO'; this.sel = null; this.msg = null; this.busy = false; this.confirming = null; }
  open(terminal) { this.terminal = terminal; this.tab = 'SALVAR'; this.sel = null; this.msg = null; this.confirming = null; this.render(); }
  close() { this.el?.remove(); this.el = null; }
  render() {
    const g = this.game, s = g.save;
    const nav = ['SALVAR', 'COMPRAR', 'EQUIPAR', 'DOCUMENTOS', 'MAPA'].map((t) => h(`button${this.tab === t ? '.on' : ''}`, { onclick: () => { this.tab = t; this.sel = null; this.confirming = null; this.msg = null; g.audio.play('ui'); this.render(); } }, t));
    const body = h('div');
    if (this.tab === 'SALVAR') this._save(body);
    if (this.tab === 'COMPRAR') this._buy(body);
    if (this.tab === 'EQUIPAR') this._equip(body);
    if (this.tab === 'DOCUMENTOS') this._docs(body);
    if (this.tab === 'MAPA') this._map(body);
    const el = h('div.screen.solid', h('div.panel',
      h('div.row.between', h('div', h('h2', this.terminal?.name ?? 'Terminal Éden'), h('div.dim.small', 'Rede Logística Vértice — reaproveitada no resgate')), h('div', { style: { textAlign: 'right' } }, h('div.dim.small', 'Saldo de contenção'), h('div.balance', `${fmtNum(s.economyLedger.credits)} CC`))),
      h('div.tabs', ...nav), this.msg ? h(`p.${this.msg.ok ? 'green' : 'red'}`, this.msg.text) : null, body,
      h('div.row', { style: { marginTop: '16px' } }, h('button.primary', { onclick: () => g.closeTerminal() }, 'Fechar terminal'), h('span.dim.small', 'Esc também fecha. Salvar é sempre gratuito.'))));
    this.el?.remove(); this.el = el; g.uiRoot.append(el);
  }

  _save(body) {
    const g = this.game, s = g.save;
    const slots = [1, 2, 3].map((n) => h('button', { onclick: async () => { const r = await g.saveToSlot(n); this.msg = r.ok ? { ok: true, text: `Progresso salvo no slot ${n}.` } : { ok: false, text: `Falha ao salvar: ${r.error}` }; this.render(); } }, `Salvar no slot ${n}`));
    const dBtns = ORDER.map((id) => {
      const p = difficulty.get(id), cur = s.difficulty.current === id, lower = difficulty.rank(id) < difficulty.rank(s.difficulty.current);
      return h(`button${cur ? '.primary' : ''}`, { disabled: cur || !lower, title: cur ? 'Atual' : lower ? 'Reduzir dificuldade' : 'Aumentar exige novo capítulo ou nova campanha', onclick: () => { const r = g.changeDifficulty(id); this.msg = r.ok ? { ok: true, text: `Dificuldade: ${p.label}. Ranking desta execução: Livre.` } : { ok: false, text: 'Não permitido neste ponto.' }; this.render(); } }, p.label + (cur ? ' (atual)' : ''));
    });
    body.append(h('h3', 'Salvar progresso (gratuito)'), h('div.row', ...slots), h('p.dim.small', 'A cadeia de combo é encerrada ao usar o terminal e nunca é guardada no save. CC e ledger são gravados na mesma transação do inventário.'),
      h('h3', 'Dificuldade'), h('div.row', ...dBtns), h('p.dim.small', `Atual: ${difficulty.get(s.difficulty.current).label}${s.difficulty.changed ? ' · ranking: Livre/Personalizado' : ''}. Aumentar a dificuldade exige novo capítulo ou nova campanha.`),
      h('h3', 'Cópia de segurança'), h('div.row', h('button', { onclick: () => g.exportCurrent() }, 'Exportar save (JSON)')));
  }

  _buy(body) {
    const g = this.game, s = g.save;
    const tabs = h('div.tabs', ...SHOP_TABS.map((t) => h(`button${this.buyTab === t ? '.on' : ''}`, { onclick: () => { this.buyTab = t; this.sel = null; this.confirming = null; this.render(); } }, t)));
    const list = h('div');
    for (const it of SHOP_ITEMS.filter((i) => i.tab === this.buyTab)) {
      const st = itemState(it, s, g.chapterNumber);
      list.append(h(`button.item${this.sel === it.id ? '.card.sel' : ''}`, { onclick: () => { this.sel = it.id; this.confirming = null; this.msg = null; this.render(); } },
        h('span', h('b', it.name), h('div.dim.small', st.reason || it.desc)), h('span', it.price ? `${fmtNum(it.price)} CC` : '—'), h(`span.badge.${st.state}`, { owned: 'possui', available: 'disponível', locked: 'bloqueado', out_of_stock: 'sem estoque', incompatible: 'incompatível' }[st.state])));
    }
    const detail = h('div.card');
    const it = SHOP_ITEMS.find((i) => i.id === this.sel);
    if (!it) detail.append(h('p.dim', 'Selecione um item para ver detalhes. Nada é comprado ao navegar.'));
    else {
      const st = itemState(it, s, g.chapterNumber), afford = s.economyLedger.credits >= it.price;
      detail.append(h('h3', { style: { marginTop: 0 } }, it.name), h('p.small', it.desc), it.tab === 'MELHORIAS' ? h('p.small.amber', `Aplicada a ${getCharacter(s.playerId).name}`) : null, this._compare(it),
        h('p', `Preço: ${fmtNum(it.price)} CC · Saldo: ${fmtNum(s.economyLedger.credits)} CC`));
      if (this.confirming === it.id) {
        detail.append(h('p.amber', `Confirmar compra de “${it.name}” por ${fmtNum(it.price)} CC?`), h('div.row',
          h('button.primary', { disabled: this.busy, onclick: () => this._confirm(it) }, this.busy ? 'Gravando…' : 'Confirmar'), h('button', { onclick: () => { this.confirming = null; this.render(); } }, 'Cancelar')));
      } else {
        detail.append(h('button.primary', { disabled: st.state !== 'available', onclick: () => { if (!afford) { this.msg = { ok: false, text: ERROR_TEXT.saldo_insuficiente }; this.game.audio.play('deny'); this.render(); return; } this.confirming = it.id; this.render(); } }, st.state === 'available' ? 'Comprar…' : st.reason || 'Indisponível'));
      }
    }
    body.append(tabs, h('div.grid2', h('div', list), detail));
  }
  _compare(it) {
    const inv = activeInventory(this.game.save), g = it.grants || {};
    if (g.ammo) { const [w, n] = Object.entries(g.ammo)[0]; return h('p.small.dim', `Reserva ${inv.ammoReserve[w] ?? 0} → ${(inv.ammoReserve[w] ?? 0) + n} (máx. ${WEAPONS[w]?.reserveCap ?? '—'})`); }
    if (g.consumable) { const [c, n] = Object.entries(g.consumable)[0]; return h('p.small.dim', `Estoque ${inv.consumables[c] ?? 0} → ${(inv.consumables[c] ?? 0) + n} (máx. ${it.cap?.max ?? '—'})`); }
    return null;
  }
  async _confirm(it) {
    if (this.busy) return;
    this.busy = true; this.render();
    const r = await this.game.buy(it.id);
    this.busy = false; this.confirming = null;
    this.msg = r.ok ? { ok: true, text: `${it.name} adquirido.` } : { ok: false, text: ERROR_TEXT[r.error] ?? r.reason ?? 'Compra não concluída.' };
    this.game.audio.play(r.ok ? 'buy' : 'deny'); this.render();
  }

  _equip(body) {
    const g = this.game, s = g.save, p = g.player, inv = activeInventory(s);
    body.append(h('h3', 'Arma equipada'), h('div.card', h('b', WEAPONS[inv.equipped].name), h('p.small.dim', `Carregador ${p.mag}/${p.magSize} · Reserva ${p.reserve} · Dano ${WEAPONS[inv.equipped].damage} (cabeça ×${WEAPONS[inv.equipped].headMult})`)),
      h('h3', 'Suprimentos'), h('div.grid2', ...[['medkit', 'Kit médico'], ['medkit_adv', 'Kit médico avançado'], ['hemostatic', 'Hemostático']].map(([k, n]) => h('div.card', h('b', n), h('div.dim', `x${inv.consumables[k] ?? 0}`)))),
      h('p.dim.small', `Uso em campo: kit médico [${keyLabel(g.settings.bindings.medkit)}] · hemostático [${keyLabel(g.settings.bindings.hemo)}] (teclas configuráveis em Opções).`),
      h('h3', `Melhorias (${getCharacter(s.playerId).name})`), h('p.dim', inv.upgrades.length ? inv.upgrades.join(', ') : 'Nenhuma instalada.'));
  }
  _docs(body) {
    const s = this.game.save;
    body.append(h('h3', 'Documentos'), ...(s.documents.length ? s.documents.map((id) => h('div.card', { style: { marginBottom: '8px' } }, h('b', docs.documents[id]?.title ?? id), h('p.small', docs.documents[id]?.text))) : [h('p.dim', 'Nenhum documento encontrado.')]),
      h('h3', `Dossiês de campo (${this.game.profile.dossiers.length}/${DOSSIER_IDS.length})`), ...s.dossiersInRun.map((id) => h('div.card', { style: { marginBottom: '8px' } }, h('b', `${id} — ${getDossier(id).title}`), h('p.small', getDossier(id).text ?? ''))));
  }
  _map(body) {
    const cv = h('canvas'); body.append(cv, h('p.dim.small', 'Losango = objetivo atual · “?” = área suspeita (aproximada) · quadrado ciano = terminal.'));
    requestAnimationFrame(() => this.game.drawMapInto(cv));
  }
}
