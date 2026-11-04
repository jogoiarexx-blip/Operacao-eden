# Projeto Extinção — Operação Éden (R0 + R1 + R2.5)

Jogo 3D de ação/sobrevivência em terceira pessoa (câmera sobre o ombro), jogável no navegador. Esta entrega cobre a fundação técnica (R0), o **Capítulo 01 — O Sinal na Mata** com Lia (R1) e o **Capítulo 02 — A Ordem de Retirada** com Caio (R2: escopeta e pistola, ferramenta de impacto, defesa de Tomás, chefe K-1 e transição Cap. 01 → Cap. 02 pela tela de resultados). Capítulos 03–10 seguem o roadmap do GDD v4.

## R2.5 — Panorama ilustrado 360° sem emendas
- **Duas faixas cilíndricas por fase** (distante e próxima) substituem os 8 planos retos da R2.4. A câmera pode girar 360° sem encontrar cantos/quadrados de imagem ou uma lacuna nas diagonais.
- **Pintura repetível**: montanhas desenhadas com perfil periódico; árvores e prédios que cruzam a borda da textura são repetidos do lado oposto. A transparência desaparece apenas no alto da silhueta, não nas laterais.
- **Integração com a névoa**: panoramas permanecem sem sombra, luz dinâmica ou colisão; a opacidade da imagem acompanha `fogFar` dos presets (62 m baixo, 78 m médio, 92 m alto), mantendo fundos suaves e sem alterar a distância da névoa real.
- **Segurança espacial**: os cilindros ficam além dos quatro cantos dos dois mapas (raio = metade da diagonal do mapa + 15/29 m), sem paredes invisíveis novas nem alterações no fluxo de fases/backtracking.
- **Custo menor**: de 8 malhas de fundo para **2 malhas e 2 texturas de 1024×256**, sem downloads ou processamento de Canvas por frame. No preset baixo, só uma malha aparece.
- **QA**: testes de `tests/backdrop-impostors.test.js` e `scripts/e2e-backdrops.mjs` ampliados para raio, costura, transparência e qualidade. Testes isolados de fonte e bundle passaram; Playwright real e ganho de FPS ainda requerem resultado do CI.

## R2.4 — Fundos ilustrados inacessíveis (2D matte painting)
- **Aplicado no Capítulo 01 — Lia:** horizonte de montanhas, mata úmida, copas de árvores e silhuetas além dos limites do mapa.
- **Aplicado no Capítulo 02 — Caio:** horizonte industrial com galpões, antenas, torres de vigilância, cercas e vegetação distante.
- **Imagem leve e offline:** cada capítulo pinta apenas duas `CanvasTexture` estáticas de 1024×256 e reutiliza cada imagem nas quatro direções. Não há download, vídeo, física, shaders animados ou malhas 3D detalhadas nesses fundos.
- **Inacessível:** os painéis ficam a 15m e 29m *além* dos limites de `CollisionWorld`; o jogador não pode chegar até as imagens e elas não possuem hitbox.
- **Profundidade e atmosfera:** duas camadas com alpha suave, silhuetas e névoa pintada. Sem iluminação dinâmica e sem projetar/receber sombra.
- **Desempenho:** no preset **Baixo**, só a camada distante é desenhada (quatro planos; nas demais, oito). As duas texturas continuam alocadas até a troca de fase e são liberadas no `dispose`; custo potencial de VRAM de aproximadamente 2,7 MiB incluindo mipmaps.
- **Testes:** `tests/backdrop-impostors.test.js` e `scripts/e2e-backdrops.mjs`; o segundo testa geração de textura, limites, qualidade, memória/ciclo de vida, colisões e save em Chromium nas duas fases. A execução completa do Chromium ainda precisa ser conferida no Actions.

## R2.3 — Streaming setorial de árvores e arbustos
- **Vegetação em células de 24m**: mantém até 190 árvores e 420 arbustos gerados pelo mesmo seed, mas compacta as matrizes por proximidade. Um setor entra a até 70m e sai depois de 84m (névoa plena a 80m), criando histerese contra aparecimentos súbitos.
- **Renderização com quatro InstancedMeshes**: uma para troncos, duas para copas e uma para arbustos. O sistema não multiplica draw calls por setor; reduz a quantidade de instâncias desenhadas nos setores distantes.
- **Colisões e saves intactos**: `tree_N` permanece registrado no CollisionWorld, mesmo com árvore oculta; não altera IA, posição, código de câmera, itens, armas ou save. Não é carregamento de modelos via rede nem descarte de memória; buffers permanecem alocados.
- **Qualidade gráfica**: a porcentagem de folhagem continua ativa, usando seleção determinística e espacialmente distribuída. O controlador só reenvia matrizes quando muda a lista de instâncias.
- **QA**: `tests/vegetation-sector-stream.test.js` (células, histerese, retorno, qualidade) e `scripts/e2e-vegetation.mjs` (Chromium nos dois capítulos, colisores intactos e comparação de triângulos). Incluído no workflow de GitHub Actions. Ganho real de FPS ainda depende de medição.

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

## Gráficos
Estilo "low-poly caprichado" com três presets (Opções → Qualidade; o benchmark B01 recomenda um):
- **Baixo** — materiais Lambert, gradação de cor/vinheta (`postfx: grade`, render direto), sem sombras, chuva, grama, lanterna volumétrica nem luz de disparo; 80 partículas e 12 decalques.
- **Médio** — materiais PBR (`pbr`), sombra da lua (`moonShadow`), bloom (`postfx: bloom`), grama a 60 % (`grass`), chuva, lanterna/feixes volumétricos (`volumetric`), sem chão texturizado nem luz de disparo (só no Alto); 220 partículas e 40 decalques.
- **Alto** — tudo do Médio com bloom + SAO (`postfx: full`), grama a 100 %, chão texturizado, luz de disparo (clarão no cano), sombras 2048 com PCF suave, 400 partículas e 80 decalques.

Bloom e SAO exigem GPU real: sob SwiftShader (Chromium headless) o pós-processamento cai para `grade` em todos os presets, então os scripts de captura/benchmark não medem esses passes.

Para exercitar o caminho do composer (bloom/SAO), `node scripts/smoke-gpu.mjs` abre o Chromium com `--use-angle=d3d11` (GPU real), cicla low→medium→high→low, redimensiona, dispara efeitos/tiros e salva capturas em `shots/gpu/`; falha em erro de console ou perda de contexto (`ANGLE=default`/`HEADFUL=1` opcionais; ignora a execução sem GPU real).

Ferramentas: com `?debug=1`, `__eden.setQuality('low'|'medium'|'high')` troca o preset e `__eden.cameraShot(x, z, yaw, pitch)` posiciona a câmera. `node scripts/shots-visual.mjs <rótulo>` gera as capturas (7 cenas × 3 presets em `shots/<rótulo>/`), `node scripts/bench.mjs <rótulo>` roda o B01 em Baixo/Médio (`shots/<rótulo>/bench.json`) e `node scripts/e2e-memory.mjs` verifica vazamento de recursos GPU na troca de capítulo/preset.

## Testes de fumaça (Playwright)
Servir `dist-single` em :4177 (`npm run build:single && npx vite preview --config vite.single.config.js --port 4177 --strictPort`) e rodar:
- `scripts/e2e.mjs`, `scripts/e2e2.mjs` — Cap. 01 (fluxo geral, loja, save, benchmark).
- `scripts/e2e-transition.mjs` — fim do Cap. 01 → resultados → Continuar → Cap. 02.
- `scripts/smoke-ch02.mjs` — Cap. 02 inteiro por atalhos de depuração (gerador, rádio, defesa, K-1, morte/retry, resultados).
- `scripts/e2e3.mjs` — fluxo R2 completo: novo jogo → Cap. 02 com Caio/escopeta → salvar/carregar slot 2 → K-1 → resultados.
- `scripts/e2e-area-transitions.mjs` — entrada no Posto Norte com apresentação visual e R-4 sem duplicação.
- `scripts/e2e-portals.mjs` — LOD de detalhes, câmera dos portais e emboscada do rádio (Chromium + screenshots).
- `scripts/e2e-vegetation.mjs` — vegetação setorial, qualidade, colisões e triângulos renderizados nos dois capítulos.
- `scripts/e2e-backdrops.mjs` — panoramas 360° dos capítulos 1 e 2, costura, distância, névoa e presets de qualidade.
- `scripts/play-ch02.mjs` — partida do Cap. 02 com teclado/mouse reais (sem teleporte/god), relata até onde chegou.

Jogo original, inspirado apenas em convenções do gênero.
