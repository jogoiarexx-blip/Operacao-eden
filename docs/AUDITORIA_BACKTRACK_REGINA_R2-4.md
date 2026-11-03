# Operação Éden — Auditoria de backtracking e animação da Regina

**Escopo:** Capítulos 01 (Selva Norte/Lia) e 02 (Posto Norte/Caio), motor Three.js, save v5, GLB da Regina. **Revisão:** 03/11/2026.

## Estado encontrado antes

1. `src/Game.js` usava `advanceToChapter()` apenas para progressão narrativa. A tela de resultados avançava do Capítulo 01 para o 02, mas não existia interação reversível nos mapas.
2. `advanceToChapter()` substituía objetivos e estatísticas do capítulo ativo. Sem armazenamento separado, retornar faria perder a progressão local.
3. `ChapterRuntime.load()` excluía inimigos já presentes em `persistentWorldFlags.defeatedEnemies`; na volta, a área podia ficar completamente vazia.
4. `EconomyLedger.creditRespawn()` já suportava 25% de crédito com teto de 500 CC por setor, mas nenhum controlador de patrulhas a utilizava.
5. O esqueleto da Regina e as animações procedurais estavam carregando no navegador, porém `stateForRegina()` escolhia apenas deslocamento genérico e mira genérica, sem marcha ré e strafe diferenciados.

## Implementado

- `src/gameplay/Backtrack.js`: portais reversíveis após finalizar o Cap. 01; retorno é ativado com **F**, sem reexecutar cutscenes. Cap. 01 ⇄ Cap. 02.
- `recordChapterState()` e `travelBacktrack()`: objetivos, estatísticas e checkpoints arquivados por cenário. Vida, inventários, créditos e flags narrativas seguem persistentes. O checkpoint ativo ao entrar no mapa é reposicionado num ponto de passagem seguro.
- `ChapterRuntime.load()`: patrulhas **comuns** somente em revisitas, no máximo duas por entrada, com validação de colisão, distância do jogador e afastamento de inimigos existentes. IDs `bt_...` não interferem nos inimigos de missão.
- `Game.js`: integração dos portais, autosave, troca de personagem e recarga do cenário; novos inimigos não são registrados no histórico de derrotas permanentes.
- `ComboSystem` e `DinosaurAgent`: recompensa das patrulhas usa `creditRespawn()`, com teto existente; eventos repetíveis de contra-ataque e estilo não geram prêmios extras indevidos.
- Mapa em `src/ui/MapView.js`: marcador **P** e legenda informam a localização do portal quando ele está liberado.
- `ReginaRig.js`: nova direção relativa ao corpo, estados `walkBack`, `aimBack`, `aimStrafeLeft` e `aimStrafeRight`; apoio dos pés, respiração e ombros; tempo do ciclo de movimento ajustado à velocidade, mantendo colisões e root motion controlados pelo `Player`.

## Testes realmente reproduzidos

- Unitários `tests/backtrack.test.js`: entrada bloqueada antes da conclusão; preservação do progresso entre mapas; posições seguras de respawn; impossibilidade de reativar chefes.
- `tests/regina.test.js`: prioridade dos estados, marcha ré, deslocamento lateral enquanto mira e corrida.
- Chromium `scripts/e2e-backtrack.mjs`: Capítulo 02 → 01 → 02, troca Caio/Lia, patrulhas `bt_ch01_v2_0` e `bt_ch02_v2_0`, objetivos e HP do Caio preservados. Registro `BACKTRACK_E2E_PASS` no CI.
- Chromium `scripts/e2e-regina.mjs`: GLB HTTP 200, 4 malhas, 17 clipes importados, sem erros; teste adicional de ações direcionais e trilhas ósseas incluído para nova execução.
- Testes existentes de capítulos, portais, emboscada e streaming de vegetação mantidos.

Evidência: https://github.com/jogoiarexx-blip/Operacao-eden/actions/runs/41655847858

## Limitações e pendências reais

1. O backtracking desta entrega liga **dois mapas inteiros**; não há ainda streaming contínuo entre dezenas de regiões. Para o próximo ciclo: tornar cada área interna/externa um subcenário com estados locais.
2. O respawn especial ocorre **na revisita ao mapa**, não a cada ida e volta entre todas as zonas internas. Não existem ondas infinitas; as patrulhas são limitadas por entrada. Próximo passo: volumes de reentrada por região, cooldown, ameaça e quantidade dependentes da dificuldade.
3. A saída final do Capítulo 02 ainda segue a tela de resultados; a exploração pós-campanha precisa de um modo próprio.
4. Animações da Regina agora têm clips direcionais, mas ainda faltam revisão visual humana do contato dos pés, encaixe de arma na mão, recoil e blending em rampas/colisões; nenhuma certificação de partida humana completa foi declarada.
5. Saves anteriores ao backtracking continuam aceitos: campos novos são opcionais, e o histórico começa no próximo avanço. É recomendável realizar também um teste manual com save antigo real.

## Reprodução manual

1. Conclua o Cap. 01 de modo normal, abra o Cap. 02 e volte à brecha sul com Caio.
2. Pressione **M** e procure **P**; na passagem, pressione **F** para retornar à Selva Norte.
3. Confira a presença de uma patrulha nova, a persistência do portão aberto e a ausência de itens já coletados.
4. Volte ao portão sul e pressione **F**; retorne ao Posto Norte com Caio.
5. Confira objetivos, escopeta, munição, vida e chefes já derrotados. Teste salvar/carregar e morrer após o retorno.
6. Com a Regina no Cap. 01, teste caminhada, corrida, marcha ré, mira deslocando-se para A/D, recarga, esquiva, dano e morte.

**Critério de conclusão:** CI aprovado + build publicado no GitHub Pages + revisão humana de jogabilidade e animação. O CI não substitui a última etapa.
