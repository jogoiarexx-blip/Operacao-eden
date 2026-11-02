# Projeto Extinção — Operação Éden (R0 + R1)

Jogo 3D de ação/sobrevivência em terceira pessoa (câmera sobre o ombro), jogável no navegador. Esta entrega cobre a fundação técnica (R0) e o **Capítulo 01 — O Sinal na Mata** com Lia (R1). Capítulos 02–10 seguem o roadmap do GDD v4.

## Rodar
- Abrir `dist-single/index.html` (arquivo único) em um navegador moderno com WebGL — ou:
- `npm install && npm run dev` (desenvolvimento) / `npm run build && npm run preview`
- `npm test` — testes unitários (Vitest) · `npm run build:single` — build em arquivo único

## Controles padrão (remapeáveis em Opções)
WASD mover · Mouse mirar · botão direito mirar de perto (ADS) · botão esquerdo atirar · R recarregar · Shift correr · Espaço esquivar · F interagir · V trocar ombro · E virar 180° · Q ferramenta elétrica · 1 kit médico · 2 hemostático · M mapa · Esc pausar. Gamepad suportado.

## Estrutura
`src/core` (loop de passo fixo, estados, config) · `src/gameplay` (economia, combo, loja, saves, pontuação) · `src/world` (colisão, câmera, cenário) · `src/actors` (jogador, IA dos dinossauros, combate) · `src/ui` · `src/benchmark` · `src/data` (JSON de balanceamento/conteúdo) · `tests/`.

## Depuração
`?debug=1` expõe `window.__eden`; qualquer uso marca a execução como "Livre" (fora do ranking). `scripts/e2e.mjs` e `scripts/e2e2.mjs` são testes de fumaça com Playwright (servir `dist` em :4177).

Jogo original, inspirado apenas em convenções do gênero.

## Capítulo 01 — revisão
- No celular: analógico esquerdo move, arrastar no cenário gira a câmera; botões de ações permitem mover, mirar e disparar simultaneamente. Segure Interagir junto à baliza.
- O objetivo mostra etapa, direção relativa à câmera e distância em linha reta. Use o mapa para escolher a ponte ou o desvio oeste.
- Suprimentos completamente cheios permanecem no cenário.
- `dev.html` é a entrada de desenvolvimento. `index.html` é a versão compilada, independente, para o GitHub Pages na raiz.
- Após editar: `npm test && npm run build:pages`. Inclua o `index.html` atualizado no commit de publicação.
