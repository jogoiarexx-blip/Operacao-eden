# Operação Éden — R2.6 | Salas seguras, árvores-imagem e backtracking

**Data:** 03/11/2026 · **Escopo:** Cap. 01 (Lia, Selva Norte) e Cap. 02 (Caio, Posto Norte).

## Auditoria antes/depois

| Subsistema | Antes | Implementação desta revisão | Risco/Pendência |
|---|---|---|---|
| Terminais de save/loja | 2 no Cap. 01 + 1 no Cap. 02, sem zonas exclusivas de IA | 3 + 2 terminais em cinco regiões `safeRooms`, inclusive dentro da cabana e do galpão | Proteção é uma barreira lógica: ampliar arquitetura física das estações em fase posterior |
| Combate em área segura | Dinossauros podiam perseguir e atacar perto dos painéis | Percepção silenciada, ataques cancelados e exclusão física determinística da área para agentes | Sem malha de navegação global ainda |
| Árvores inacessíveis | Árvore procedural 3D dentro do mapa e fundo ilustrado panorâmico | 60 árvores-imagem/capítulo, raster CanvasTexture 192×384, 2 malhas instanciadas com painéis cruzados e orientação gradual à câmera, todas fora de `data.bounds` | Algumas árvores reais próximas de paredes continuam 3D para manter colisões |
| Floresta jogável | Até 190 árvores 3D instanciadas | Limite de até 160, com áreas seguras desobstruídas | A contagem efetiva varia conforme colisões e clareiras |
| Continuidade dos mapas | Backtrack reversível Cap. 01 ⇄ 02, porém criaturas restantes voltavam ao ponto original | Fade curto, marcação P e salvamento de posição/HP dos inimigos narrativos sobreviventes por cenário | Ainda existem dois mapas inteiros, sem streaming de corredores independentes |
| Patrulhas revisita | Patrulhas adicionais por retorno com limite de recompensa | Mantidas, com registros separados dos inimigos de história | Ainda não existe respawn por subárea independente |
| Navegação | Terminais marcados no mapa | Círculos S no mapa, sinalização 3D nas estações e mensagem de entrada protegida | Verificar legibilidade em celular |

## Estações protegidas

**Selva Norte (Lia):** Abrigo Logístico Norte (terminal A), Cabana de Sobrevivência (novo terminal no abrigo existente), Estação de Retaguarda (terminal B).

**Posto Norte (Caio):** Sala Segura Administrativa (terminal existente), Sala Segura do Gerador (novo terminal).

Cada estação preserva as telas existentes **SALVAR, COMPRAR, EQUIPAR, DOCUMENTOS, MAPA**. Não há transação nova, moeda infinita, ou perda dos slots existentes.

## Arquivos técnicos

- `src/gameplay/SafeZones.js`: verificação de perímetro, deslocamento de criaturas para posições não bloqueadas e comparação com margem numérica.
- `src/data/chapter01.json` e `src/data/chapter02.json`: cinco salas seguras, suas posições, raio, terminal associado e dois terminais novos.
- `src/Game.js`: filtro de percepção/ataque, correção do deslocamento de IA, restaurar HP/posição de inimigos sobreviventes, feedback de entrada e transição de cenário.
- `src/world/TreeImpostors.js`: 60 copas desenhadas por capítulo, sem GLB/rede, duas chamadas de desenho; painéis inclinados se alinham à câmera de maneira gradual.
- `src/world/SectorScenery.js`: integração das árvores-imagem, sinalização 3D, redução dos exemplares tridimensionais, descarte de recursos.
- `src/ui/MapView.js`, `src/ui/TerminalUI.js`, `src/styles/main.css`: marcações e continuidade de transição.
- `src/gameplay/Backtrack.js`: snapshot dos inimigos sobreviventes; não duplica patrulhas especiais.
- `tests/safe-zones.test.js`, `tests/tree-impostors.test.js`, `tests/backtrack.test.js` e `scripts/e2e-safe-rooms.mjs`: testes unitários e teste visual automatizado.

## Testes reproduzíveis

```bash
npm ci
npm test
npm run build:single
npx playwright install chromium
npx vite preview --config vite.single.config.js --host 127.0.0.1 --port 4177
URL='http://127.0.0.1:4177/?debug=1' SHOT_DIR=qa-shots node scripts/e2e-safe-rooms.mjs
```

**Critérios do E2E:** entrar nas cinco estações em ambos os capítulos, posicionar um juvenil hostil na borda e rodar 90 ticks, comprovar ausência de invasão/dano, abrir terminal real de salvar/comprar, salvar e recarregar slot e validar que os painéis de árvores não invadem a região jogável.

## Pendências e limitações reais

1. Salas seguras usam perímetros de exclusão de IA, mas ainda não têm portas animadas/travadas próprias para todos os postos; arquitetura adicional requer revisão de rotas e colisões.
2. As árvores 2.5D estão somente **fora dos limites**; no interior navegável as árvores 3D continuam com colisão. A regra evita que imagens planas fiquem ao alcance do jogador.
3. A continuidade visual da ida/volta usa fade de menos de um segundo; ainda recarrega a cena de cada capítulo em vez de transmissão contínua em memória entre subáreas.
4. Backtracking preserva flags globais, objetivos e chefes derrotados, e agora conserva posição/HP dos inimigos narrativos remanescentes. A campanha ainda precisa de certificação manual de dois ciclos completos de retorno, incluindo death/retry e save antigo importado.
5. Não apresentar como benchmark real de FPS: redução estimada de geometria e draw calls precisa de medição em GPU de baixa potência.

**Nota de QA:** conferir o GitHub Actions do commit desta revisão para o resultado exato dos testes; não confundir build do HTML com partida humana certificada.
