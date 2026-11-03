# Operação Éden — R2.8 · Cache de cenários e backtracking

**Data:** 3 de novembro de 2026  
**Base auditada:** R2.7, capítulos 01 (Selva Norte) e 02 (Posto Norte).

## Diagnóstico reproduzido

O método `Game.loadChapter(id)` sempre executava `scenery.dispose()`, `props.dispose()` e reconstruía
`CollisionWorld`, `buildScenery()` e `buildProps()` em toda troca de mapa. Logo, após uma revisita o
jogador repetia o custo de criação de árvores, muros, painéis e geometria estática.

O save R2.7 já guardava objetivos, itens, inimigos de missão sobreviventes, flags e regiões,
mas o **cenário visual/collision world estático** não era reutilizado.

## Antes × depois

| Subsistema | Antes da R2.8 | Depois da R2.8 |
|---|---|---|
| Capítulo 01 ⇄ 02 | Toda travessia recria cenário e colisores | Primeiro ingresso é normal; retorno reutiliza o mesmo `SectorScenery`, `CollisionWorld` e `props` |
| GPU / memória | Cena anterior totalmente descartada, com custo repetido de upload | Cache LRU de **1 capítulo inativo**, 1 ativo; materiais e geometrias estáticas reaproveitados; evicção libera recursos |
| Streaming regional | Detalhes carregados conforme região, sem integração com cache | Ao guardar o mapa, libera buffers de detalhes regionais; ao voltar, recria somente os detalhes próximos do ponto de entrada |
| NPCs e interações | Recriados do save a cada troca | Continuam recriados do save; nunca ficam congelados no cache de cena |
| Reiniciar / outra partida | Geometria do mapa antigo pode manter estados visuais mutados | `runId` novo invalida cache e força cenário limpo; sair ao menu limpa o mapa inativo |
| Passarela do Cap. 01 | Animação de queda podia ficar visualmente presa após retry | Estado das tábuas restaurado do `bridgeCollapsed`; save anterior à queda recompõe o piso e as rotações |

## Arquivos alterados

- `src/world/ChapterSceneCache.js`: LRU limitado, `take`/`store`/`clear`, descarte e diagnósticos de hits.
- `src/Game.js`: conexão do cache ao `loadChapter`, troca de referências para mundo/câmera/jogador,
  limpeza por runId, restauro de elementos dinâmicos pelo runtime e integração com o stream regional.
- `src/chapters/ch01.js`: `restoreBridge()` para corrigir regressão visual de retry/checkpoint.
- `tests/chapter-scene-cache.test.js`: teste de hits, descarte e capacidade limitada.
- `tests/bridge-cache.test.js`: regressão do estado das tábuas e rotações.
- `scripts/e2e-chapter-cache.mjs`: ida/volta **Cap. 02 → Cap. 01 → Cap. 02 → Cap. 01**, referências
  de geometria e colisão idênticas, buffers regionais realmente liberados e reinicialização limpa de outra partida.
- `.github/workflows/eden-ci.yml`: novo playtest em Chromium antes do deploy.

## Como reproduzir

```bash
npm ci
npm test
npm run build:single
npx playwright install --with-deps chromium
npx vite preview --config vite.single.config.js --host 127.0.0.1 --port 4177
URL='http://127.0.0.1:4177/?debug=1' SHOT_DIR=qa-shots node scripts/e2e-chapter-cache.mjs
```

O script só retorna `CHAPTER_SCENE_CACHE_E2E_PASS` após confirmar o reuso da **mesma instância**
de mapa e colisores e a recriação limpa em uma campanha nova. Os testes originais de Regina,
saves, campanha, terminais, backtracking, vegetação e dinossauros permanecem no CI.

## Pendências reais

1. **Não é um único mapa sem transição.** A troca entre Cap. 01 e 02 ainda usa fade curto; o cache
   evita reconstrução na **segunda** entrada, não na primeira, e não transforma os dois cenários em
   uma única malha espacial.
2. O cache pode manter as **geometrias estáticas de até dois mapas** (1 ativo + 1 inativo) na memória;
   num celular com pouca GPU, pode ser necessário desativá-lo conforme a memória disponível. O streaming
   regional já libera os buffers decorativos do mapa inativo.
3. Ainda faltam benchmark comparativo em GPU real, teste manual dos dois capítulos completos,
   persistência de estados visuais de todas as futuras portas e um gerenciador de setores 3D para capítulos adicionais.
4. Carregamento sob demanda de um terceiro capítulo exigirá capacidade variável ou eviction por prioridade;
   não presumir que o cache comporte um mundo ilimitado.

**Status de certificação:** acompanhar a última execução do GitHub Actions; publicação no Pages somente
é considerada concluída quando o workflow de deploy for aprovado e o `index.html` compilado contiver o cache.
