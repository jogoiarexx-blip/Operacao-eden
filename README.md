# Projeto Extinção — Operação Éden (R0 + R1 + R2)

Jogo 3D de ação/sobrevivência em terceira pessoa (câmera sobre o ombro), jogável no navegador. Esta entrega cobre a fundação técnica (R0), o **Capítulo 01 — O Sinal na Mata** com Lia (R1) e o **Capítulo 02 — A Ordem de Retirada** com Caio (R2: escopeta e pistola, ferramenta de impacto, defesa de Tomás, chefe K-1 e transição Cap. 01 → Cap. 02 pela tela de resultados). Capítulos 03–10 seguem o roadmap do GDD v4.

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

## Gráficos
Estilo "low-poly caprichado" com três presets (Opções → Qualidade; o benchmark B01 recomenda um):
- **Baixo** — materiais Lambert, gradação de cor/vinheta (`postfx: grade`, render direto), sem sombras, chuva, grama, lanterna volumétrica nem luz de disparo; 80 partículas e 12 decalques.
- **Médio** — materiais PBR (`pbr`), sombra da lua (`moonShadow`), bloom (`postfx: bloom`), grama a 60 % (`grass`), chuva, lanterna/feixes volumétricos (`volumetric`), sem chão texturizado nem luz de disparo (só no Alto); 220 partículas e 40 decalques.
- **Alto** — tudo do Médio com bloom + SAO (`postfx: full`), grama a 100 %, chão texturizado, luz de disparo (clarão no cano), sombras 2048 com PCF suave, 400 partículas e 80 decalques.

Bloom e SAO exigem GPU real: sob SwiftShader (Chromium headless) o pós-processamento cai para `grade` em todos os presets, então os scripts de captura/benchmark não medem esses passes.

Ferramentas: com `?debug=1`, `__eden.setQuality('low'|'medium'|'high')` troca o preset e `__eden.cameraShot(x, z, yaw, pitch)` posiciona a câmera. `node scripts/shots-visual.mjs <rótulo>` gera as capturas (7 cenas × 3 presets em `shots/<rótulo>/`), `node scripts/bench.mjs <rótulo>` roda o B01 em Baixo/Médio (`shots/<rótulo>/bench.json`) e `node scripts/e2e-memory.mjs` verifica vazamento de recursos GPU na troca de capítulo/preset.

## Testes de fumaça (Playwright)
Servir `dist` em :4177 (`npm run build && npx vite preview --port 4177 --strictPort`) e rodar:
- `scripts/e2e.mjs`, `scripts/e2e2.mjs` — Cap. 01 (fluxo geral, loja, save, benchmark).
- `scripts/e2e-transition.mjs` — fim do Cap. 01 → resultados → Continuar → Cap. 02.
- `scripts/smoke-ch02.mjs` — Cap. 02 inteiro por atalhos de depuração (gerador, rádio, defesa, K-1, morte/retry, resultados).
- `scripts/e2e3.mjs` — fluxo R2 completo: novo jogo → Cap. 02 com Caio/escopeta → salvar/carregar slot 2 → K-1 → resultados.
- `scripts/play-ch02.mjs` — partida do Cap. 02 com teclado/mouse reais (sem teleporte/god), relata até onde chegou.

Jogo original, inspirado apenas em convenções do gênero.
