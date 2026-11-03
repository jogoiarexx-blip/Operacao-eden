import { h, fmtNum, fmtTime } from './dom.js';
import { ACTION_LABELS, QUALITY, DEFAULT_BINDINGS, keyLabel } from '../core/Settings.js';
import { difficulty } from '../gameplay/DifficultyManager.js';
import { DOSSIER_IDS, getDossier } from '../gameplay/SecretManager.js';
import docs from '../data/documents.json';
import { getCharacter } from '../gameplay/Characters.js';

/** Telas de menu (DOM/CSS). Cada função devolve um elemento <div.screen>. */
const btn = (label, onclick, cls = '', extra = {}) => h(`button${cls ? '.' + cls : ''}`, { onclick, ...extra }, label);

export function mainMenu(game, { hasSave }) {
  return h('div.screen.fade-in',
    h('div', { style: { textAlign: 'center' } },
      h('p.subtitle', 'Operação'), h('h1.title', 'Éden'),
      h('div.title', { style: { fontSize: 'clamp(14px,2.4vw,22px)', letterSpacing: '.5em', marginTop: '6px', color: 'var(--cyan)' } }, 'Projeto Extinção'),
      h('p.tagline', 'A ilha não perdeu o controle. Alguém decidiu entregá-lo.'),
      h('div.menu-col', { style: { margin: '0 auto' } },
        btn('Novo jogo', () => game.ui.difficulty(), 'primary'),
        btn('Continuar', () => game.continueGame(), '', { disabled: !hasSave }),
        btn('Carregar', () => game.ui.loadSlots(), '', { disabled: !hasSave }),
        btn('Extras', () => game.ui.extras()),
        btn('Opções', () => game.ui.options(() => game.ui.menu())),
        btn('Créditos', () => game.ui.credits()),
      ),
      h('p.dim.small', { style: { marginTop: '26px' } }, 'R2 · Capítulos 01–02 — O Sinal na Mata · A Ordem de Retirada · jogo original, inspirado apenas em convenções de gênero')));
}

/** `opts` (início de capítulo novo): { current, label, onConfirm(id), onBack() } — reaproveita as mesmas cartas. */
export function difficultyScreen(game, profile, opts = null) {
  let sel = opts?.current ?? 'standard';
  const cards = h('div.grid2');
  const confirm = btn(opts?.label ?? 'Iniciar Capítulo 01', () => (opts ? opts.onConfirm(sel) : game.newCampaign(sel)), 'primary');
  const render = () => {
    cards.replaceChildren(...difficulty.list().map((p) => {
      const locked = !difficulty.isUnlocked(p.id, profile);
      return h(`button.card${sel === p.id ? '.sel' : ''}`, { disabled: locked, onclick: () => { sel = p.id; render(); } },
        h('div.row.between', h('b', p.label), p.id === 'standard' ? h('span.badge.available', 'recomendado') : locked ? h('span.badge.locked', 'bloqueado') : null),
        h('p.small.dim', locked ? 'Desbloqueado ao concluir a campanha.' : p.description),
        h('div.small', `Dano recebido ${p.playerDamageMult}× · Munição ${p.ammoMult}× · Aviso ${p.warningMult}× · Atacantes ${p.maxContactAttackers}`));
    }));
  };
  render();
  return h('div.screen.solid.fade-in', h('div.panel', h('h2', 'Dificuldade'),
    h('p.dim', 'Pressão, disponibilidade de recursos e padrões — nunca barras de vida infladas. A história e as pistas são idênticas. Reduzir a dificuldade em um terminal é sempre permitido (o ranking daquela execução passa a “Livre”).'),
    cards, h('div.row', { style: { marginTop: '16px' } }, confirm, btn('Voltar', () => (opts ? opts.onBack() : game.ui.menu())))));
}

export function loadScreen(game, metas) {
  return h('div.screen.solid.fade-in', h('div.panel.narrow', h('h2', 'Carregar jogo'),
    ...metas.map((m) => h('div.card', { style: { marginBottom: '8px' } },
      h('div.row.between', h('b', m.slot === 0 ? 'Autosave' : `Slot ${m.slot}`), m.corrupted ? h('span.red', 'corrompido') : m.empty ? h('span.dim', 'vazio') : h('span.dim.small', `${m.chapterId?.toUpperCase()} · ${m.playerId ? getCharacter(m.playerId).name + ' · ' : ''}${m.difficulty} · ${fmtTime(m.playtimeSeconds ?? 0)}`)),
      m.empty || m.corrupted ? null : h('div.row', { style: { marginTop: '8px' } }, btn('Carregar', () => game.loadSlot(m.slot), 'primary'), btn('Exportar JSON', () => game.exportSlot(m.slot)), btn('Apagar', () => game.deleteSlot(m.slot), 'danger')))),
    h('div.row', { style: { marginTop: '10px' } },
      h('label.small', 'Importar JSON: ', h('input', { type: 'file', accept: '.json,application/json', onchange: (e) => game.importFile(e.target.files?.[0]) })),
      btn('Voltar', () => game.ui.menu()))));
}

export function optionsScreen(game, back) {
  const s = game.settings;
  const apply = () => { game.applySettings(); };
  const slider = (label, key, min, max, step, fmt = (v) => v.toFixed(2)) => {
    const out = h('span.dim.small', fmt(s[key]));
    const inp = h('input', { type: 'range', min, max, step, value: s[key], oninput: (e) => { s[key] = +e.target.value; out.textContent = fmt(s[key]); apply(); } });
    return h('div.key-row', h('label', label), h('div.row', inp, out));
  };
  const check = (label, key) => h('div.key-row', h('label', label), h('input', { type: 'checkbox', checked: s[key], onchange: (e) => { s[key] = e.target.checked; apply(); } }));
  const select = (label, key, opts) => h('div.key-row', h('label', label), h('select', { onchange: (e) => { s[key] = e.target.value; apply(); } }, ...opts.map(([v, t]) => h('option', { value: v, selected: s[key] === v }, t))));
  const binds = h('div');
  const renderBinds = () => binds.replaceChildren(...Object.keys(DEFAULT_BINDINGS).filter((a) => a !== 'pause').map((a) =>
    h('div.key-row', h('span', ACTION_LABELS[a]), h('button', { onclick: (e) => { e.target.textContent = 'Pressione uma tecla…'; game.input.rebinding = (code) => { if (code !== 'Escape') s.bindings[a] = code; apply(); renderBinds(); }; } }, keyLabel(s.bindings[a])))));
  renderBinds();
  return h('div.screen.solid.fade-in', h('div.panel', h('h2', 'Opções'),
    h('div.grid2',
      h('div', h('h3', 'Câmera e mira'),
        slider('Sensibilidade X', 'sensX', 0.3, 2.5, 0.05), slider('Sensibilidade Y', 'sensY', 0.3, 2.5, 0.05), check('Inverter eixo Y', 'invertY'),
        slider('FOV (ajuste, graus)', 'fovOffset', -10, 12, 1, (v) => `${v > 0 ? '+' : ''}${v}°`),
        select('Lado preferido do ombro', 'shoulder', [['right', 'Direito'], ['left', 'Esquerdo']]),
        select('Assistência de mira', 'assist', [['auto', 'Padrão da dificuldade'], ['0', 'Desligada'], ['0.35', 'Discreta'], ['0.7', 'Alta']]),
        h('h3', 'Acessibilidade'),
        check('Reduzir tremor/balanço de câmera', 'reduceShake'), check('Reduzir flashes (relâmpagos)', 'reduceFlash'),
        check('Ocultar HUD de cadeia', 'hideComboHud'), check('Ocultar feed de estilo', 'hideStyleFeed'), check('Alto contraste nos indicadores de ameaça', 'highContrastThreat'),
        select('Tamanho das legendas', 'subtitleSize', [['small', 'Pequeno'], ['normal', 'Normal'], ['large', 'Grande']])),
      h('div', h('h3', 'Áudio'), slider('Volume geral', 'volMaster', 0, 1, 0.05), slider('Efeitos', 'volSfx', 0, 1, 0.05), slider('Ambiente', 'volAmbient', 0, 1, 0.05),
        h('h3', 'Gráficos'), select('Qualidade', 'quality', Object.entries(QUALITY).map(([k, q]) => [k, q.label])),
        h('p.dim.small', 'Use Extras → Benchmark para uma sugestão baseada em medições reais deste dispositivo.'),
        h('h3', 'Controles (remapear)'), binds, btn('Restaurar padrão', () => { s.bindings = { ...DEFAULT_BINDINGS }; apply(); renderBinds(); }))),
    h('div.row', { style: { marginTop: '14px' } }, btn('Voltar', back, 'primary'))));
}

export function extrasScreen(game, { records, profile }) {
  const rec = Object.entries(records.classified).flatMap(([k, v]) => v.slice(0, 1).map((r) => [k, r, 'Classificado']))
    .concat(Object.entries(records.free).flatMap(([k, v]) => v.slice(0, 1).map((r) => [k, r, 'Livre'])));
  return h('div.screen.solid.fade-in', h('div.panel', h('h2', 'Extras'),
    h('div.grid2',
      h('div.card', h('h3', 'Recordes locais'), rec.length ? h('table.stats', ...rec.map(([k, r, kind]) => h('tr', h('td', `${k.replace(/\|/g, ' · ')} (${kind})`), h('td', `${r.grade} · ${r.score}`)))) : h('p.dim.small', 'Nenhum recorde ainda. Recordes ficam só neste navegador, sem servidor.')),
      h('div.card', h('h3', 'Coleção'), h('p', `Dossiês de campo: ${profile.dossiers.length}/${DOSSIER_IDS.length}`), h('p.dim.small', 'A coleção do perfil é separada das campanhas. 12/12 + conclusão libera o Capacitor Inesgotável (Nova Jornada+).')),
      h('div.card', h('h3', 'Desafios'), h('p.dim.small', 'Contra o Relógio, Arena de Contenção e Caçadas chegam em versões futuras do roteiro (R6 / pós-1.0).')),
      h('div.card', h('h3', 'Benchmark'), h('p.dim.small', 'Mede frametime real na cena B01 — Selva Profunda. Isolado da campanha: não altera saves, CC ou itens.'), btn('Abrir benchmark', () => game.ui.benchIntro(), 'primary'))),
    h('div.row', { style: { marginTop: '14px' } }, btn('Voltar', () => game.ui.menu()))));
}

export function creditsScreen(game) {
  return h('div.screen.solid.fade-in', h('div.panel.narrow', h('h2', 'Créditos'),
    h('p', 'Projeto Extinção — Operação Éden. Jogo original (design, código, modelos procedurais e áudio sintetizado).'),
    h('p.dim.small', 'Inspirado apenas em convenções gerais de gênero e mecânicas de survival horror; sem reutilização de nomes, roteiro, cenários, interface, música, texturas ou modelos de qualquer jogo existente.'),
    h('p.dim.small', 'Motor: Three.js (MIT).'), btn('Voltar', () => game.ui.menu(), 'primary')));
}

export function pauseScreen(game) {
  return h('div.screen.fade-in', h('div.panel.narrow', h('h2', 'Pausa'),
    h('p.dim.small', 'A simulação está congelada: IA, danos, tiros e o relógio de cadeia.'),
    h('div.menu-col', { style: { minWidth: '100%' } },
      btn('Retomar', () => game.resume(), 'primary'), btn('Opções', () => game.ui.options(() => game.pause())),
      btn('Diário (documentos)', () => game.ui.journal()),
      btn('Voltar ao menu principal', () => game.quitToMenu(), 'danger'))));
}

export function gameOverScreen(game, info) {
  return h('div.screen.fade-in', { style: { background: 'rgba(30,0,0,.78)' } }, h('div.panel.narrow', h('h2.red', 'Você morreu'),
    h('p.dim', `Tentativas neste capítulo: ${info.attempts}. O progresso volta ao último checkpoint; CC e itens já confirmados não duplicam.`),
    info.hint ? h('p.amber', info.hint) : null,
    h('div.menu-col', { style: { minWidth: '100%' } }, btn('Tentar novamente', () => game.retry(), 'primary'),
      info.canLower ? btn('Reduzir dificuldade e tentar (ranking → Livre)', () => game.retry(true)) : null,
      btn('Menu principal', () => game.quitToMenu()))));
}

export function journalScreen(game, { save, profile }, back) {
  const docIds = save.documents ?? [];
  return h('div.screen.solid.fade-in', h('div.panel', h('h2', 'Diário'),
    h('h3', 'Documentos'), docIds.length ? docIds.map((id) => h('div.card', { style: { marginBottom: '8px' } }, h('b', docs.documents[id]?.title ?? id), h('p.small', docs.documents[id]?.text ?? ''))) : h('p.dim', 'Nenhum documento encontrado.'),
    h('h3', `Dossiês de campo — ${profile.dossiers.length}/${DOSSIER_IDS.length}`),
    ...DOSSIER_IDS.map((id) => { const got = save.dossiersInRun.includes(id) || profile.dossiers.includes(id); const d = getDossier(id); return h('div.card', { style: { marginBottom: '6px', opacity: got ? 1 : 0.5 } }, h('b', `${id} — ${got ? d.title : '???'}`), got && d.text ? h('p.small', d.text) : null); }),
    save.journal.length ? [h('h3', 'Anotações'), ...save.journal.map((j) => h('div.card.small', j.text))] : null,
    h('div.row', { style: { marginTop: '12px' } }, btn('Voltar', back, 'primary'))));
}

const LATER = { 2: 'Capítulo 03 chega no marco R4 do roteiro.' };
export function resultsScreen(game, r) {
  const nextNum = String((r.chapterNumber ?? 1) + 1).padStart(2, '0');
  const rows = [
    ['Tempo ativo', fmtTime(r.stats.activeSeconds)], ['Precisão', `${Math.round(r.stats.accuracy * 100)}%`], ['Dano sofrido', Math.round(r.stats.damageTaken)],
    ['Mortes/tentativas', `${r.stats.deaths}`], ['Maior cadeia', `x${r.stats.maxChain}`], ['Contra-ataques', r.stats.counters],
    ['Estilo ganho', fmtNum(r.stats.style.totalPE)], ['CC ganho', fmtNum(r.stats.ccEarned)], ['Dossiês de campo achados', r.stats.dossiersFound], ['Áreas e rotas exploradas', `${new Set(r.stats.explorationVisited).size}/${r.explorationTotal}`],
  ];
  const det = h('div.hidden', h('h3', 'Detalhamento da nota'), h('table.stats', ...Object.entries(r.score.parts).map(([k, v]) => h('tr', h('td', { objectives: 'Objetivos', survival: 'Sobrevivência', combat: 'Domínio de combate', efficiency: 'Eficiência', exploration: 'Exploração' }[k]), h('td', v.toFixed(1))))),
    h('p.dim.small', `Versão de pontuação ${r.score.scoringVersion}. Segredos não são necessários para a nota S. Modo de ranking: ${r.eligibility === 'classified' ? 'Classificado' : 'Livre/Personalizado'}${r.newBest ? ' · novo recorde!' : ''}`));
  return h('div.screen.solid.fade-in', h('div.panel',
    h('div.row.between', h('div', h('h2', `Capítulo ${String(r.chapterNumber ?? 1).padStart(2, '0')} concluído`), h('p.dim', r.title ?? 'O Sinal na Mata')), h('div', { style: { textAlign: 'center' } }, h('div.grade', r.score.grade), h('div.dim.small', `${r.score.total}/100`))),
    h('table.stats', ...rows.map(([a, b]) => h('tr', h('td', a), h('td', b)))),
    r.nextChapter ? h('p.card.small.amber', 'Sinal de Lia no portão sul. Caio segue pelo acesso lateral do Posto Norte — a operação continua.') : null,
    det,
    h('div.row', { style: { marginTop: '16px' } },
      r.nextChapter
        ? btn(`Continuar — Capítulo ${nextNum}`, () => game.startChapter(r.nextChapter), 'primary')
        : btn(`Continuar — Capítulo ${nextNum}`, () => {}, 'primary', { disabled: true, title: LATER[r.chapterNumber ?? 1] ?? `Capítulo ${nextNum} chega em um marco futuro do roteiro.` }),
      r.nextChapter ? btn('Alterar dificuldade', () => game.ui.nextChapterDifficulty()) : null,
      btn('Ver detalhes', (e) => { det.classList.toggle('hidden'); e.target.textContent = det.classList.contains('hidden') ? 'Ver detalhes' : 'Ocultar detalhes'; }),
      btn('Menu principal', () => game.quitToMenu())),
    h('p.dim.small', r.nextChapter ? 'Progresso gravado no Autosave. Continue diretamente ou escolha Alterar dificuldade.' : `Progresso gravado no Autosave. ${LATER[r.chapterNumber ?? 1] ?? ''}`)));
}

export function benchIntro(game) {
  return h('div.screen.solid.fade-in', h('div.panel.narrow', h('h2', 'Benchmark — B01 Selva Profunda'),
    h('p', 'O teste usa a cena real do jogo: 10 s de aquecimento + 60 s de percurso fixo (seed fixa) com câmera sobre o ombro, três predadores roteirizados e tiros.'),
    h('ul.small.dim', h('li', 'Consome CPU/GPU e emite sons durante ~70 s. Não inicia sozinho e pode ser cancelado (Esc).'),
      h('li', 'Mantenha a aba em primeiro plano: trocar de aba ou perder o foco marca o teste como INVÁLIDO.'),
      h('li', 'O hardware não é identificado com precisão: o navegador pode ocultar o modelo da GPU. Tempo de GPU só aparece se o navegador permitir.'),
      h('li', 'Isolado da campanha: nenhum save, CC, item ou história é alterado.')),
    h('div.menu-col', { style: { minWidth: '100%' } }, btn('Teste completo (≈70 s)', () => game.startBenchmark('full'), 'primary'), btn('Diagnóstico rápido (≈25 s, não comparável)', () => game.startBenchmark('quick')), btn('Voltar', () => game.ui.extras()))));
}

export function benchResultsScreen(game, rep, history) {
  const f = (v, d = 1) => (v == null ? 'indisponível' : `${v.toFixed(d)} ms`);
  const status = { valid: ['VÁLIDO', 'green'], incomplete: ['INCOMPLETO', 'amber'], invalid: ['INVÁLIDO', 'red'] }[rep.status];
  const prev = history.filter((x) => x.id !== rep.id).slice(-1)[0];
  const cmp = prev ? game.compareBench(prev, rep) : null;
  return h('div.screen.solid.fade-in', h('div.panel', h('h2', `Resultado — ${rep.sceneName}`),
    h('div.row.between', h('span', 'Status: ', h(`b.${status[1]}`, status[0])), h('span.dim.small', rep.mode === 'quick' ? 'diagnóstico rápido (não comparável)' : 'teste completo')),
    rep.status === 'invalid' ? h('p.red', `Motivo: ${rep.invalidReason}. Nenhum preset é recomendado com base neste resultado.`) : null,
    h('div.grid2',
      h('table.stats', ...[['FPS mediano', rep.fpsMedian?.toFixed(1) ?? '—'], ['Frametime p50', f(rep.p50)], ['Frametime p95', f(rep.p95)], ['Frametime p99', f(rep.p99)], ['Quadros > 33,3 ms', rep.over33], ['Quadros > 50 ms', rep.over50], ['Maior pausa', f(rep.maxFrame)], ['Quadros medidos', rep.frames]].map(([a, b]) => h('tr', h('td', a), h('td', b)))),
      h('table.stats', ...[['Update JS (médio)', f(rep.updateMsAvg, 2)], ['Render CPU (médio)', f(rep.renderMsAvg, 2)], ['Tempo de GPU', rep.gpuTimeMs == null ? `indisponível (${rep.gpuTimer.available ? 'extensão presente, não coletada' : 'extensão ausente'})` : f(rep.gpuTimeMs)], ['Draw calls (máx.)', rep.renderer.calls], ['Triângulos (máx.)', rep.renderer.triangles], ['Geometrias/Texturas', `${rep.renderer.geometries}/${rep.renderer.textures}`], ['Memória JS (estim.)', rep.jsHeapMB == null ? 'indisponível' : `${rep.jsHeapMB.toFixed(0)} MB`], ['p95 do raycast de câmera', f(rep.cameraRayP95, 3)]].map(([a, b]) => h('tr', h('td', a), h('td', b))))),
    h('h3', 'Ambiente'), h('p.small.dim', `${rep.env.browser} · resolução CSS ${rep.env.cssW}×${rep.env.cssH} · interna ${rep.env.internalW}×${rep.env.internalH} · DPR ${rep.env.dpr} · preset ${rep.env.preset} · seed ${rep.seed} · build ${rep.build} · núcleos ${rep.env.cores ?? '?'} · GPU (relatada) ${rep.env.gpu ?? 'oculta'}`),
    rep.recommendation ? h('div.card', h('b', `Preset sugerido: ${rep.recommendation.label}`), h('p.small.dim', rep.recommendation.reason), h('div.row', btn(`Aplicar configuração sugerida (${rep.recommendation.label})`, () => game.applyRecommendedQuality(rep.recommendation.preset), 'primary'), h('span.dim.small', 'Só altera gráficos; nunca dificuldade, ranking, save ou sensibilidade.'))) : null,
    cmp ? h('p.small', cmp.comparable ? `Comparação com a execução anterior: p95 ${cmp.deltaP95 > 0 ? '+' : ''}${cmp.deltaP95.toFixed(1)} ms.` : `Não comparável com a execução anterior: ${cmp.reasons.join('; ')}.`) : null,
    h('div.row', { style: { marginTop: '12px' } }, btn('Exportar relatório JSON', () => game.exportBench(rep)), btn('Repetir', () => game.ui.benchIntro()), btn('Voltar aos extras', () => game.ui.extras(), 'primary'))));
}
