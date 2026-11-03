# Operação Éden R2.7 — auditoria de regiões, streaming e portas dos abrigos

**Data:** 03/11/2026. **Base:** R2.6 (cinco salas seguras; Selva Norte/Cap. 01 e Posto Norte/Cap. 02).

## Antes × depois (código efetivamente alterado)

| Sistema | Antes (R2.6) | Depois (R2.7) |
|---|---|---|
| Exploração | Regiões narrativas detectadas por capítulo, sem tratamento de reentrada por subárea | 5 regiões persistentes por mapa, separadas dos scripts narrativos; histerese espacial para evitar falsas entradas |
| Respawn | Novas patrulhas apenas ao trocar de mapa | Até 1 patrulha comum a cada reentrada regional válida, após **20 s de exploração** e com **35 s** entre reaparecimentos; máximo 4 patrulhas regionais simultaneamente |
| Anti-farm | Bônus reduzido de revisita, teto por setor | Mantém o ledger: 25% do prêmio base, teto acumulado de 500 CC por setor e IDs únicos; chefes e inimigos narrativos não revivem |
| Persistência | Salva estados de capítulo e inimigos sobreviventes entre Cap. 01 e 02 | `save.backtrack.regions` preserva visitas, tempo de último respawn e contagem por subárea; carregamento de saves antigos sem migração destrutiva |
| Geometria de detalhe | Vegetação com streaming por células e árvores-imagem inacessíveis | Novo `RegionalDetailStream`: debris ilustrativo baixo, instanciado, construído próximo e com malhas/buffers **descartados** fora do setor; nunca toca colisores |
| Navegação | P (passagem), S (zona segura) | Mapa também destaca contornos e nomes das regiões já exploradas, sem revelar setores novos |
| Acessos interiores | Postos delimitados por paredes existentes, mas sem portas visuais | Três portas deslizantes leves: cabana, sala administrativa e galpão; galpão permanece trancado visualmente enquanto as caixas originais não forem removidas |

## Arquivos e compatibilidade

- `src/gameplay/RegionalSectors.js`: seleção com histerese, histórico do save, cooldown por relógio de jogo, local de nascimento livre, diretor regional.
- `src/gameplay/ChapterRuntime.js`: diretor chamado no `step` normal; **não** reabre missões ou cutscenes.
- `src/world/RegionalDetailStream.js`: carregamento/descarte de InstancedMesh por região em tempo real, evitando objetos longe da câmera.
- `src/world/SectorScenery.js`: integração de streaming e novas portas, descarte normal dos materiais.
- `src/world/SafeRoomDoors.js`: geometria minimalista e abertura por proximidade; portas são visuais e respeitam obstáculo já existente.
- `src/data/chapter01.json`, `src/data/chapter02.json`: posições dos vãos e requisito das caixas.
- `src/ui/MapView.js`, `src/Game.js`: nomes e contornos de regiões descobertas.
- `tests/regional-sectors.test.js`, `tests/regional-detail-stream.test.js`, `tests/safe-room-doors.test.js`: testes unitários.
- `scripts/e2e-regions.mjs` + `.github/workflows/eden-ci.yml`: Chromium com reentrada, respawn seguro, save, descarte de buffers e persistência.

## Regras de gameplay

1. Primeira visita à região: nenhuma patrulha extra.
2. Quando o personagem deixa a região e retorna após o tempo necessário, a IA pode enviar **um predador comum** para um ponto não bloqueado, longe do jogador e de outra criatura.
3. Entrar em área segura, retornar rápido demais, ou existir o teto de patrulhas ativo bloqueia novos spawns. Caso não exista posição válida, o respawn é ignorado sem consumir cooldown.
4. Os objetivos, itens, documentos, chefes e portas originais não são repetidos; inimigos comuns originais mortos seguem mortos.
5. A parte visual regional pode descarregar enquanto o jogador explora; o mapa físico, os save points, as interações e os encontros de missão permanecem carregados.

## QA reproduzível

```bash
npm ci
npm test
npm run build:single
npx playwright install chromium
npx vite preview --config vite.single.config.js --host 127.0.0.1 --port 4177
URL='http://127.0.0.1:4177/?debug=1' SHOT_DIR=qa-shots node scripts/e2e-regions.mjs
```

Critério do Playwright: em **cada capítulo**, entrar na região, sair, retornar após o tempo de jogo, obter um predador vivo e a distância segura, conservar flags/objetivos/colisores, comprovar descarte/reconstrução de buffers visuais e salvar/carregar `backtrack.regions`.

**Importante:** consultar o resultado do workflow mais recente antes de declarar esses testes como aprovados. Testes controlados não substituem a conclusão humana da campanha.

## Limites reais e próxima prioridade

- Ainda **não é um único mapa contínuo entre os dois capítulos**. A transição Selva Norte ⇄ Posto Norte ainda troca o cenário com fade curto. O streaming novo ocorre **dentro** de cada mapa, somente em detalhes não interativos.
- As três portas são **modelos visuais animados**. Parede/caixas continuam definindo colisão; zonas seguras continuam usando exclusão lógica de IA. Portas com colisão, navegação física de dinossauros e intertravamento de segurança são uma etapa estrutural posterior.
- Regiões são sensores circulares, não uma malha completa de salas/corredores. Futuro: separar corredores/edificações em setores completos com volume, pathfinding e estados locais.
- Não foram medidas melhorias de FPS ou memória de GPU em hardware real, apenas criação/descarte de malhas e comportamento de renderização.
- Resta certificação humana em mobile, controle e campanha com dois ciclos completos de backtracking.
