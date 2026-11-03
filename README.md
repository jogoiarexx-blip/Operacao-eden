# Projeto Extinção — Operação Éden (R0 + R1 + R2.2)

Jogo 3D de ação/sobrevivência em terceira pessoa (câmera sobre o ombro), jogável no navegador. Esta entrega cobre a fundação técnica (R0), o **Capítulo 01 — O Sinal na Mata** com Lia (R1) e o **Capítulo 02 — A Ordem de Retirada** com Caio (R2: escopeta e pistola, ferramenta de impacto, defesa de Tomás, chefe K-1 e transição Cap. 01 → Cap. 02 pela tela de resultados). Capítulos 03–10 seguem o roadmap do GDD v4.

## R2.2 — Portais, performance e emboscada do rádio
- **6 zonas curtas de câmera**: entrada pela brecha, porta do gerador, corredor administrativo, portão do pátio, arquivo e saída norte. A câmera continua por cima do ombro, aproxima e recua suavemente, com colisão.
- **LOD visual seguro**: oculta sete objetos decorativos pequenos quando distantes (2 no Cap. 01, 5 no Cap. 02) e restaura quando próximos. Mantém visíveis paredes, telhados, portas, placas, coberturas, plataformas, alavancas e todos os itens interativos. Não mexe nas colisões, no spawn, na memória carregada ou nos saves. O ganho de FPS depende de medição real.
- **Emboscada dinâmica**: após reativar o rádio, o regresso pelo corredor administrativo arma um R-4 juvenil, anunciado por um som, com candidato selecionado fora da câmera. O gatilho é persistente e evita spawns repetidos ao voltar ou recarregar; inimigos já abatidos continuam eliminados.
- **QA**: `tests/visual-detail-culling.test.js`, `tests/admin-ambush.test.js`, `scripts/e2e-portals.mjs` e passos Chromium no GitHub Actions. A reprodução da campanha inteira ainda depende do resultado de CI/playtest.

## R2.1 — Passagens e ritmo de ação
- 10 revelações curtas de ambientes: quatro no Cap. 01 e seis no Cap. 02, inclusive na abertura de portões e no resgate de Tomás.
- Transições cinematográficas não pausam IA, não teletransportam personagens e não interferem nos saves. O jogador continua com câmera por cima do ombro.
- O R-4 inicial do Posto Norte passa a surgir **quando Caio entra pela brecha**, uma só vez, com o gatilho persistido no save.
- Correção de paridade de dados entre código-fonte e `index.html` do Pages na saída `north_service_exit`.
- QA: `tests/area-transitions.test.js`, `scripts/e2e-area-transitions.mjs` e CI com build single + Chromium. O resultado do CI precisa ser conferido no GitHub Actions.

## Rodar
- Abrir `dist-single/index.html` (arquivo único) em um navegador moderno com WebGL — ou:
- `npm install && npm run dev` (desenvolvimento) / `npm run build && npm run preview`
- `npm test` — testes unitários (Vitest) · `npm run build:single` — build em arquivo único (`dist-single/index.html`)

## Controles padrão (remapeáveis em Opções)
WASD mover · Mouse mirar · botão direito mirar de perto (ADS) · botão esquerdo atirar · R recarregar · Shift correr · Espaço esquivar · F interagir (segurar em alavancas/rádio) · Q ferramenta utilitária (elétrica da Lia; de impacto do Caio, que também quebra barreiras de caixas) · E meia-volta · V trocar ombro · M mapa · I diário · Esc pausar.

Armas e itens (R2): **1** pistola · **2** escopeta · **roda do mouse** (ou direcional esquerdo/direito do gamepad) alterna entre as armas · **3** kit médico · **4** hemostático (antes eram 1/2). Gamepad suportado.

## Estrutura
`src/core` (loop de passo fixo, estados, config) · `src/gameplay` (economia, combo, loja, saves, pontuação) · `src/world` (colisão, câmera, cenário) · `src/actors` (jogador, IA dos dinossauros, combate) · `src/ui` · `src/benchmark` · `src/data` (JSON de balanceamento/conteúdo) · `tests/`.

## Depuração
`?debug=1` expõe `window.__eden`; qualquer uso marca a execução como "Livre" (fora do ranking). Atalhos extras: `finishChapter()`, `goto('ch02','pre_k1')`, `killBoss()`, `startChapter('ch02')`.

## Testes de fumaça (Playwright)
Servir `dist` em :4177 (`npm run build && npx vite preview --port 4177 --strictPort`) e rodar:
- `scripts/e2e.mjs`, `scripts/e2e2.mjs` — Cap. 01 (fluxo geral, loja, save, benchmark).
- `scripts/e2e-transition.mjs` — fim do Cap. 01 → resultados → Continuar → Cap. 02.
- `scripts/smoke-ch02.mjs` — Cap. 02 inteiro por atalhos de depuração (gerador, rádio, defesa, K-1, morte/retry, resultados).
- `scripts/e2e3.mjs` — fluxo R2 completo: novo jogo → Cap. 02 com Caio/escopeta → salvar/carregar slot 2 → K-1 → resultados.
- `scripts/e2e-area-transitions.mjs` — entrada no Posto Norte com apresentação visual e R-4 sem duplicação.
- `scripts/e2e-portals.mjs` — LOD de detalhes, câmera dos portais e emboscada do rádio (Chromium + screenshots).
- `scripts/play-ch02.mjs` — partida do Cap. 02 com teclado/mouse reais (sem teleporte/god), relata até onde chegou.

Jogo original, inspirado apenas em convenções do gênero.
