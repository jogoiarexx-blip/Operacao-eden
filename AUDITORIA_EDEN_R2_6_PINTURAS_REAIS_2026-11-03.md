# Operação Éden — R2.6: revisão visual dos panoramas com evidência real

**Data:** 03/11/2026  
**Fases:** Cap. 01 — O Sinal na Mata; Cap. 02 — A Ordem de Retirada.  
**Fonte da observação:** artefato `eden-qa-screenshots` do workflow bem-sucedido [41668410804](https://github.com/jogoiarexx-blip/Operacao-eden/actions/runs/41668410804) (capturas reais de Chromium/WebGL, R2.5).

## Diagnóstico a partir das capturas

| Evidência | O que a captura mostra | Ação adotada |
| --- | --- | --- |
| `backdrop-ch01.png` e `regina-ch01.png` | Primeiro plano com grandes coníferas poligonais; entre elas o horizonte fica muito escuro e a mata distante pouco específica | Perfil de três serras com relevo, estrias de rocha e mata tropical pintada com copas largas e alturas variadas |
| `backdrop-ch02.png` e `vegetation-ch02.png` | Muros e galpão do posto dominam o enquadramento de spawn; pouca instalação reconhecível no céu, horizonte abstrato | Telhados industriais, divisões de chapa, venezianas, depósitos cilíndricos e torres de comunicação na pintura |
| Ambas as fases | Capturas de spawn escondem grande parte da pintura atrás do nível 3D; uma imagem do jogador não basta para julgar a textura completa | Playwright passou a arquivar `painting-ch01-far.png`, `painting-ch01-near.png`, `painting-ch02-far.png`, `painting-ch02-near.png`, diretamente dos Canvas do navegador |
| GitHub Actions [41668904299](https://github.com/jogoiarexx-blip/Operacao-eden/actions/runs/41668904299) | Falha unitária específica: costura das montanhas esperava diferença < 1 px e recebeu 1,05777 px | Nova curva periódica com inclinação contínua junto da costura; teste permanece estrito |

## Antes e depois técnico

| Subssistema | Antes | Depois R2.6 |
| --- | --- | --- |
| Montanhas | Dois relevos periódicos genéricos de baixa definição | Três planos atmosféricos em ambas as fases; contorno suavizado na junção 360° |
| Vegetação da pintura | Dezenas de árvores feitas com três triângulos muito semelhantes | Copas largas e irregulares em clusters de círculos, troncos/galhos, raras copas agudas, massa de sub-bosque |
| Instalações ao fundo | Retângulos, janelas e quatro torres | Galpões com telhados quebrados e venezianas, tanques, dutos, chapa e torres; tudo 2D |
| Costura de 360° | Morros fechavam no valor, mas derivada forte na emenda; variação aleatória poderia alterar copas duplicadas | Perfil com valor e tangente suaves; volumes de copa determinísticos em ambas as bordas |
| Texturas | Duas CanvasTextures 1024×256 por capítulo | **Inalterado**: duas CanvasTextures 1024×256 por capítulo |
| Geometria 360° | Dois cilindros de 48 segmentos | **Inalterado** |
| Desenho por frame | Nenhum | **Nenhum**: Canvas pintado uma vez ao entrar no capítulo |
| IA, inimigos, colisão, save, backtrack | Independentes do panorama | **Inalterados** |
| Qualidade baixa | Camada distante visível | **Inalterado**: camada próxima oculta |

## Orçamento e limites da validação

- 2 superfícies transparentes, sem sombra e sem shader extra; 2 texturas RGBA 1024×256 por capítulo (**~2 MiB sem mipmaps; ~2,67 MiB com mipmaps**, estimativa).
- Não há arquivo de imagem externo, requisições de rede adicionais, física ou geometria 3D para os novos detalhes.
- Mais operações de Canvas **somente na criação do capítulo**, sem custo de desenho da vegetação a cada frame. O tempo extra de inicialização não foi medido.
- O teste unitário confirma dimensões, quantidade de texturas e malhas, raio fora dos cantos jogáveis, presets e limpeza, mas **não certifica visualmente** a renderização.
- A captura R2.5 é evidência do problema anterior; a revisão visual das novas pinturas dependerá das imagens exportadas pelo Playwright após o CI. FPS antes/depois e atravessamento completo das fases ainda não estão certificados.
- **Pendente de arte**: o primeiro plano 3D em si ainda utiliza árvores grandes, escuras e pontiagudas; esta revisão não altera esses GLBs/procedurais nem abre áreas bloqueadas.

## Arquivos modificados

1. `src/world/BackdropImpostors.js` — duas pinturas melhoradas, curva de horizonte e costura sem descontinuidade.
2. `tests/backdrop-impostors.test.js` — Canvas mock compatível com copas arredondadas e teste explícito de orçamento.
3. `scripts/e2e-backdrops.mjs` — captura do jogo e das quatro texturas produzidas em Chromium.

**Publicação:** alteração de código-fonte feita diretamente na branch `main`; o HTML monolítico de GitHub Pages é compilado e atualizado pelo workflow somente quando os testes/Playwright terminarem com sucesso. Não afirmar versão publicada sem esse resultado.

## Rechecagem visual com artefato real (segunda passada)

- O workflow [41670309594](https://github.com/jogoiarexx-blip/Operacao-eden/actions/runs/41670309594) concluiu com **unitários, build, Chromium e publicação aprovados** para a primeira pintura R2.6.
- O artefato incluiu **quatro PNGs reais das CanvasTextures** (far/near de cada fase) e as duas capturas in-game. A imagem da floresta ficou com reflexos de copa claros demais, gerando pontos quase esbranquiçados; ajustados para uma luz mais discreta.
- A comparação objetiva das capturas de spawn R2.5→R2.6 apontou diferença visual pequena (**0,19% dos pixels com diferença máxima de canal >20 em ch01, 0,32% em ch02**, cada imagem 1280×720). Isso **não** comprova ganho artístico perceptível no jogo: indica que árvores e paredes 3D bloqueiam o campo de visão.
- Por isso a segunda passada elevou a linha de relevo do panorama distante mudando **altura do cilindro de 30 para 42** e **centro vertical de 12,4 para 18,8**, preservando o fundo abaixo do chão (**base -2,2**) e a mesma quantidade de textura, triângulos e draw calls por camada.
- A curva passou a ter nervuras altas adicionais, sem quebrar continuidade na junção de 360°. O teste agora garante que o cilindro distante mantém a base abaixo do solo.
- **Evidência pendente:** avaliar a próxima captura WebGL após a segunda passada para confirmar que o relevo elevado aparece acima das paredes. A melhora efetiva na tela de jogo e o FPS ainda não estão certificados para essa passagem.
