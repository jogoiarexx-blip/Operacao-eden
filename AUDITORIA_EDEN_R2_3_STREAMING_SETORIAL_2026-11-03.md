# Operação Éden — Auditoria R2.3: streaming setorial de vegetação
**Data:** 03/11/2026 · **Escopo:** Capítulos 01 (Lia) e 02 (Caio) · **Base:** R2.2

## Objetivo técnico
Reduzir geometria vegetal processada pela GPU conforme posição do jogador, **sem** aumentar a quantidade nominal de malhas instanciadas, modificar geração procedural, descarregar colisões ou arriscar o save. Não reimplementar o mundo nem abandonar câmera sobre o ombro.

## Estado anterior × estado atual

| Subsistema | Antes R2.2 | Depois R2.3 | Efeito |
| --- | --- | --- | --- |
| Vegetação | Até 190 árvores e 420 arbustos gerados por seed; todas instâncias vegetais desenhadas de uma só vez | Índice espacial de células de 24m, instâncias compactadas pelo raio de relevância | Pode reduzir o total de triângulos desenhados em pontos periféricos |
| Draw calls vegetação | 3 InstancedMeshes (tronco, duas copas) + 1 InstancedMesh (arbustos) | Mesmas quatro malhas; muda `count` e as matrizes dos slots válidos | Não aumenta draws por setor, diferentemente de criar uma malha por célula |
| Distância | Vegetação desenhada até qualquer distância do cenário | Célula habilita-se até 70m e desabilita-se além de 84m; distâncias medidas à borda da célula | Histerese minimiza popping; névoa total do jogo a 80m |
| CPU/GPU | Matrizes instaladas na criação e mantidas até trocar capítulo | Seleção reaplicada a cada 300ms ou ao deslocar mais de 7m; não reenvia buffers se seleção for igual | Pequeno custo de seleção na CPU em troca de menos instâncias na GPU |
| Qualidade de folhagem | Prefixo do buffer de arbustos em `bushes.count = floor(total * foliage)` | Seleção determinística pelo índice em cada região ativa; árvores continuam independentes | Folhagem melhor distribuída em qualidade baixa, sem randomização adicional |
| Colisão/IA | Árvores no `CollisionWorld` | **Inalteradas**: `tree_N` permanece para tiros, câmera e movimento | Dinossauros não atravessam árvores ocultadas |
| Save/seed | Gerador procedural e flags da campanha | Sem mudança de esquema, RNG ou posições geradas | Compatibilidade mantida |
| Memória | Malhas e matrizes permanecem carregadas durante capítulo | Matrizes cacheadas e mesmos buffers alocados, agora com compactação | **Não** reduz automaticamente RAM/GPU VRAM; não é streaming de GLB/WebP |
| Publicação | Fonte, bundle standalone no Pages; workflow constrói e publica após verificar | Fonte e `index.html` atualizados com lógica equivalente; novo E2E no pipeline | Manualmente sincronizado nesta sessão; publicação final pelo workflow depende do QA |

## Implementação
- **`src/world/VegetationSectorStream.js`**: índices por célula, distância ao retângulo, seleção com histerese, cópia das matrizes originais, compactação estável, qualidade e estatísticas.
- **`src/world/SectorScenery.js`**: captura dos pontos arbustivos sem alterar RNG, instanciação de streamer após geração, chamada no update de 300ms e respectiva opção de qualidade.
- **`index.html`**: mesma lógica aplicada ao bundle atual sem remover assets, modelagem ou lógica dos demais sistemas.
- **`tests/vegetation-sector-stream.test.js`**: quatro testes com InstancedMesh real do Three.js, células negativas, histerese, deslocamentos, matrizes e qualidade.
- **`scripts/e2e-vegetation.mjs`**: Chromium nos dois capítulos; verifica colisores, saves, transição de slots, restauração de vegetação, qualidade e triângulos do renderer.
- **`.github/workflows/eden-ci.yml`**: inclui o E2E no estágio que antecede publicação do Pages.

## Testes reproduzidos durante esta sessão
| Verificação | Resultado | O que realmente prova |
| --- | --- | --- |
| Funções reais de seleção executadas isoladamente | **PASSOU** | Células, ordem determinística, transição por distância e histerese |
| 4 matrizes de árvore e 20 de arbusto simuladas com contrato de InstancedMesh | **PASSOU** | Contagem reduz perto/longe, sem repetição de escrita quando seleção não muda |
| Teleporte de -50m para +104m e retorno | **PASSOU** | Matrizes originais reaparecem em seus locais, sem perda dos dados cacheados |
| Qualidade de arbustos em 25%/100% | **PASSOU** | Seleção espacial respeita proporção e não altera contagem de árvores |
| Controle de 2000m distante | **PASSOU no isolado** | Nenhuma instância fica ativa muito além de todos os setores |
| Parse sintático de `src/world/SectorScenery.js`, módulo de streaming e JS do bundle | **PASSOU** | Código parseável, embora não comprove o cenário rodando |
| Paridade do streaming entre código-fonte e bundle | **CONFERIDA estaticamente** | Mesmos limites de 24m, 70m e 84m e integração na geometria |
| Vitest real via `npm test` no repositório | **NÃO EXECUTADO NESTA SESSÃO** | Testes criados, mas a execução precisa ser conferida no Actions |
| Playwright real e diferença de triângulos | **NÃO EXECUTADOS NESTA SESSÃO** | O E2E agora mede triângulos; seus valores não foram coletados aqui |
| FPS em PC/mobile e duas fases completas | **NÃO CERTIFICADOS** | É necessária execução real e relatório de screenshots/logs |

## Regressões prevenidas por desenho
1. **Colisões:** nenhuma chamada para desativar `CollisionWorld` ou `world.byId`.
2. **Persistência:** nenhum novo campo no save ou alteração nas flags de inimigos, pickups e missões.
3. **Controles:** sem pausa, teleporte, input falso nem substituição da câmera.
4. **GLB/Regina:** renderizador de modelos e fluxo atual de assets não foram alterados.
5. **Popping:** limites escolhidos em relação à névoa do cenário, com duas distâncias de histerese.
6. **Efeito em qualidade baixa:** arbustos selecionados de maneira estável e reconstituídos quando o setor volta.

## Pendências reais (ordem de prioridade)
- **P0:** confirmar GitHub Actions, prints do Playwright, campanha Lia → Caio → K-1 → resultados e corrigir erros reais. A execução do CI não foi observada nesta sessão.
- **P1:** medir FPS e triângulos antes/depois em pontos controlados com preset fixo e sem debug, incluindo PC de baixo desempenho e celulares.
- **P1:** considerar culling por frustum para vegetação atrás da câmera com margem adequada, sem exibir popping quando o jogador vira rapidamente.
- **P1:** particionar iluminação de interiores e efeitos pesados do Cap. 02; no momento o streaming só se aplica à vegetação.
- **P2:** investigar impostores WebP de árvores distantes *se* necessário, preservando silhueta, escala, sombra e transição para geometria real.
- **P2:** fazer build e deploy integralmente automáticos após QA, e não depender de intervenções manuais no `index.html` compilado.

**Conclusão:** R2.3 aumenta a granularidade da renderização de vegetação sem multiplicar draw calls e sem comprometer colisões ou estado de jogo. Não declarar ganho de FPS ou conclusão integral de campanha antes de conferir o QA de navegador e as medições reais.
