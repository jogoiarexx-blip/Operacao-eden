# R2 — Capítulo 02 "A Ordem de Retirada" (Caio) — Design

Data: 2026-11-02 · Base: GDD v4 (§2.3, §4.5, §6.2–6.3, §7.3, §7.14, §8.1, §13 R2) · Código: entrega R0+R1.

## 1. Entendimento

**Pedido (usuário):** continuar o jogo implementando o marco **R2 completo**.

**O que o GDD exige no R2 (§13):**
1. Caio com escopeta, animações e limitações reais.
2. Posto, gerador, resgate de Tomás, discordância no rádio, primeiro K-1.
3. Inventários por personagem, créditos/chaves comuns, checkpoint entre capítulos.
4. Primeiro balanço de municiamento, agressividade, retículo e câmera em espaço apertado.
5. Verificar 4 presets de dificuldade (Extinção bloqueado até fim da campanha) e counter/esquiva com animações reais.

**Premissas (não ditas pelo usuário — corrigir se errado):**
- "Animações reais" = animações procedurais no estilo das já existentes (`PlayerView`/`CreatureView`); não há pipeline GLB no projeto. Assets GLB ficam para R6.
- Abordagem 1 (capítulo como dados + script por capítulo) aceita, já que o R2 completo foi escolhido.
- Capítulo 03 continua fora: o botão "Continuar — Capítulo 03" aparece desativado (marco R4).
- Sem novo benchmark (B02) neste marco.

**Critério de sucesso:** jogar Cap. 01 → resultados → "Continuar — Capítulo 02" → jogar o Cap. 02 inteiro com Caio, vencer o K-1, ver resultados com nota; salvar/carregar e morrer/repetir em qualquer ponto sem perder progresso nem duplicar CC/itens; `npm test` e `npm run build` passando; teste de fumaça e2e cobrindo a transição.

## 2. Arquitetura — capítulos plugáveis

Hoje `ChapterRuntime`, `SectorScenery`, `Game` e a pontuação estão presos ao `chapter01.json` e a ids do Cap. 01 (baliza, passarela, portão, CORO).

**Novo:**
- `src/chapters/index.js` — registro `{ ch01: { data, script }, ch02: { data, script } }` e `getChapter(id)`.
- `src/chapters/ch01.js` / `ch02.js` — **script do capítulo**: tudo que é único daquele capítulo. Interface (todos opcionais):
  - `buildProps(ctx)` → objetos de cenário especiais (baliza, passarela, gerador, portão K-1); devolve `{ update(dt), dispose() }`.
  - `onLoad(rt)`, `onZoneEnter(rt, zoneId)`, `onInteract(rt, def)` (retorna `true` se tratou), `step(rt, dt, simMs, input)`.
  - `cutscenes: { intro, ending }` — cada uma `{ start(game, cine), update(game, cine, dt), dur }`.
  - `explorationVisited(save)` → lista de nós para a nota.
  - `deathHint`, `introToast`.
- `ChapterRuntime` passa a ser genérico: recebe `{ data, script }`; mantém pickups, encontros, zonas, objetivos (`doneWhen`), tutoriais, terminais e interações com `holdMs`; delega o resto ao script. A lógica do Cap. 01 sai daqui para `ch01.js` sem mudar comportamento.
- `SectorScenery.buildScenery` vira genérico (chão, caminhos, estruturas, árvores, chuva); baliza/passarela/CORO/portão viram props de `ch01.js`. A API `setGateOpen`, `setBeaconPowered`, `startCollapse`, `coroPattern` passa para o objeto devolvido por `buildProps`.
- `Game.loadChapter(id)` — descarta cena/mundo/colisão do capítulo anterior, cria `CollisionWorld(data.bounds)`, `buildScenery`, `buildProps`, novo `ChapterRuntime`; usado por novo jogo, carregar save e transição. Todo `'ch01'` fixo em `Game.js` (pontuação, recordes, exploração, cutscenes, dica de morte, toast "Lia caiu…") passa a vir do capítulo/personagem ativos.
- `MapView` usa `data` do capítulo ativo (já recebe por parâmetro).

**Regra de não-regressão:** o Cap. 01 deve se comportar igual ao atual; os testes existentes continuam passando sem alteração de expectativa.

## 3. Personagens e inventários (save v5)

**`src/data/characters.json`:**

| | Lia | Caio |
|---|---|---|
| maxHp | 100 | 120 |
| dano recebido | ×1,0 | ×0,85 (impacto) |
| utilitário | ferramenta elétrica (existente) | arma de impacto |
| armas iniciais | pistola | escopeta + pistola |
| esquiva | padrão | cooldown 1,0 s (vs 0,85), mais pesada |
| interações exclusivas | painéis | alavancas pesadas, barreiras |

**Arma de impacto (Caio):** golpe frontal curto (alcance 2,6 m): empurra (knockback 2,5 m) e atordoa 1,2 s; quebra barreiras marcadas `breakable`; cooldown 7 s; ruído 10 m. Contra o K-1 só empurra (sem atordoar), conforme §4.5 "sem paralisar chefe".

**Save schema 5** (`GameState.SCHEMA_VERSION = 5`):
- `inventory` passa a `inventories: { lia: {...}, caio: {...} }` com `weapons`, `equipped`, `ammoReserve`, `consumables`, `upgrades` **individuais**.
- Compartilhados no topo: `credits`/`economyLedger` (já são), `teamKeys` (sai do inventário), documentos, segredos.
- `persistentWorldFlags.gateOpen` → `persistentWorldFlags.chapter.ch01.gateOpen` (estado de mundo por capítulo em `chapter[chId]`); listas por id (`pickedUp`, `defeatedEnemies`, `zonesVisited`, `tutorialSeen`) continuam globais, com ids únicos entre capítulos.
- Migração v4→v5: `inventory` vira `inventories.lia`; `inventories.caio` recebe o inicial de Caio; `teamKeys` sobe; `gateOpen` muda de lugar; backup como hoje. Testada.
- Upgrades da loja: compra se aplica ao **personagem ativo** (`upgrades` individuais). O texto da loja mostra "para Caio"/"para Lia".
- `Player.loadFromSave/writeToSave` leem `inventories[save.playerId]` e os parâmetros de `characters.json`.

## 4. Escopeta e troca de arma

**`weapons.json` — `shotgun`:** `pellets 8`, dano 11 por chumbo, `headMult 1.5`, `limbMult 0.8`, cone 5,5° (mira) / 8° (quadril), alcance efetivo 14 m com queda linear até 0 em 22 m, `magSize 6`, `fireIntervalMs 820`, recarga **por cartucho** (`reloadMode: "shell"`, 520 ms por cartucho, abertura 250 ms), ruído 38 m, recuo 3,2°, `interrupt: { range: 6, minPellets: 4 }` — 4+ chumbos em alvo durante `ATTACK_WINDUP` a ≤ 6 m interrompem o bote (stagger), exceto K-1, que só sofre stagger com 6+ chumbos.

**Regras:**
- `Combat.resolveShot` aceita `pellets`: um raio por chumbo, dano somado por inimigo/parte, um único evento de acerto por inimigo; marcador de acerto e combo contam o tiro uma vez.
- Recarga por cartucho: cada cartucho entra individualmente; atirar ou esquivar cancela entre cartuchos (fica o que já entrou).
- Retículo dinâmico: a escopeta mostra o anel do cone em vez da cruz.
- Troca de arma: nova ação `weaponNext` (tecla `1`/`2` diretas + roda do mouse; gamepad: direcional). 400 ms, cancela recarga. HUD mostra arma e munição da equipada.
- Munição de escopeta é tipo `shotgun`; a loja já tem `ammo_shotgun_12` no Cap. 02.

## 5. Capítulo 02 — conteúdo

**Setor `outpost_02`, "Posto Avançado Norte"**, ~80×80 m, mais construído que a selva: muros, galpões, pátio central e corredores apertados (teste de câmera em espaço fechado).

**Fluxo (objetivos `doneWhen`, nesta ordem):**
1. **Portão trancado por dentro** — Caio entra pela brecha lateral (abertura: sinalizadores vermelhos da equipe perdida no chão; diálogo de abertura). Tutorial: escopeta, troca de arma, recarga por cartucho.
2. **Religar o gerador** — no galpão de serviço: quebrar barreira de caixas com a arma de impacto (tutorial), puxar duas alavancas pesadas (`heavy_lever`, segurar 2,4 s cada; dano interrompe). Ao ligar: luzes do posto acendem, ruído atrai 2 R-4 (encontro). Flag `outpost_generator`.
3. **Estabilizar o rádio** — sala de rádio no prédio administrativo (corredor estreito). Ao ligar: Nádia volta, mas chega primeiro a **ordem de retirada**: "não entrar no laboratório, retirar imediatamente" — Caio vê no terminal que a origem é o canal de segurança corporativa (Serpa), não o resgate. Discordância no rádio entre Caio e Nádia. Flag `radio_online`. Terminal Éden B aqui (loja avançada + save).
4. **Abrir o pátio sem soltar novas criaturas** — antes de abrir o portão do pátio, o jogador deve **trancar o cercado K-1** (painel `pen_lock`); se tentar abrir o pátio antes, o painel recusa com explicação (sem falha irreversível). Flag `gate_k1_locked`.
5. **Localizar Tomás** — no arquivo do posto, do outro lado do pátio. Proteção de sobrevivente por **interação curta** (§7.14, sem escolta longa): Tomás destrava a porta por 25 s enquanto 3 juvenis R-4J tentam alcançá-lo; se algum o alcançar, ele recua e o contador pausa (não falha). Flag `tomas_found`. `BIO_03` fica numa estante do arquivo (pista: luz de mesa acesa).
6. **K-1 invade o pátio** (minichefe, §6 abaixo). Ao vencer: Tomás fala da manutenção "Noite Branca", negada pelo sistema de relatórios (gancho) → cutscene final → resultados.

**Opcionais:** `CACHE_02` no caminhão abandonado da estrada de serviço (pista: porta da cabine entreaberta e marcas de pneu saindo do caminho); 2 documentos de lore (`DOC_02` ordem de retirada impressa, `DOC_03` escala de manutenção com "Noite Branca" rasurada). Nenhuma chave obrigatória escondida.

**Persistência:** `outpost_generator`, `tomas_found`, `gate_k1_locked`, `radio_online`, `k1_defeated` em `storyFlags`; `rescueFlags.tomas = true`.

**Checkpoints:** início, terminal B, antes do K-1 (automático ao terminar a defesa de Tomás).

**Diálogos novos** (`dialogues.json`, chaves `ch02_*`): abertura, gerador, ordem de retirada, discordância Caio↔Nádia, primeira fala com Tomás (Caio desconfiado, §2.3 relação Caio↔Tomás), K-1, gancho Noite Branca. Texto original em português.

## 6. Minichefe K-1 — "Alfa de contenção"

**Espécie `containment_alpha` (bestiário):** HP 900 (padrão), escala 1,9, CC base 2500, visão 34 m, `hurtRadius` 1,1, hitbox de cabeça pequena e alta.

**Arena:** pátio ~26×22 m, com 4 coberturas baixas (contêineres), 2 caixas de munição que **reabastecem** a cada 40 s se o jogador tiver menos de 6 cartuchos (garante "munição suficiente para falhas razoáveis"), e o **portão mecânico** no lado norte. Sem cantos onde a câmera fique presa entre chefe e parede (coberturas a ≥ 3 m das paredes; câmera com distância reduzida dentro da arena).

**Padrões (cada um telegrafado, respeitando `warningMult` e o piso `MIN_REACTION_MS`):**
- **Investida** — agacha e raspa o chão (windup 1100 ms), corre em linha reta travada. Se bater em cobertura ou parede: **atordoado 2,5 s** (cabeça exposta, `headMult` ×3). Esquiva lateral evita.
- **Mordida** — curta distância, windup 700 ms, dano 26.
- **Varredura de cauda** — se o jogador ficar atrás dele >1,5 s, windup 800 ms, empurra.
- **Memória de posição** (§6.2 "aprende posição recente"): se o jogador ficar na mesma cobertura >6 s, o K-1 contorna para flanquear em vez de investir de frente.

**Fases:** 100–60 % HP só investida+mordida; abaixo de 60 % entra a cauda e o windup da investida cai 15 % (respeitando o piso); abaixo de 25 % ruge (chama 1 R-4J uma única vez).

**Portão mecânico:** painel `gate_drop` ao lado do portão. Se o K-1 estiver na zona sob o portão ao acionar: 30 % do HP máximo + atordoado 3,5 s. Recarrega em 20 s (alimentado pelo gerador; luz no painel mostra pronto/carregando). Atrair o K-1 com investida para a zona do portão é a jogada principal; vencer só com tiros também é possível. Vitória não depende de gastar toda a munição: 3 quedas de portão + ~10 tiros de escopeta na cabeça atordoada bastam no padrão.

**HUD:** barra de vida do chefe com nome "K-1 — Alfa de contenção" enquanto o encontro estiver ativo.

## 7. Transição entre capítulos

- Resultados do Cap. 01: botão **"Continuar — Capítulo 02"** ativo. Ao clicar: `save.chapterId = 'ch02'`, `sectorId = 'outpost_02'`, `playerId = 'caio'`, checkpoint inicial, `chapterStats.ch01` mantido, `stats` zerado para o novo capítulo; oferece trocar dificuldade (regra `newChapterStart` já existente); autosave no slot 0; cutscene de abertura do Cap. 02.
- Carregar um save com `chapterId: 'ch02'` abre direto o Cap. 02.
- Resultados do Cap. 02: "Continuar — Capítulo 03" desativado com aviso do marco R4.
- Menu de slots já mostra `chapterId`; passa a mostrar também o personagem.

## 8. Dificuldade, balanço e câmera

- **Presets:** os 4 existentes se aplicam ao Cap. 02 e ao K-1 (HP, dano, avisos, munição). Extinção segue bloqueado até `campaign_complete` (não liberado ao concluir o Cap. 02). Testes automatizados confirmam: multiplicadores aplicados ao K-1, piso de reação nos telegráficos do K-1 em Extinção e o bloqueio.
- **Balanço de munição:** `rankTargets.ch02` e um teste de **orçamento**: soma do HP dos inimigos do capítulo (com `enemyHpMult` de cada preset) versus o dano possível da munição disponível (inicial + pickups × `ammoMult` + reabastecimento da arena). Meta: ≥ 1,6× no Explorador, ≥ 1,3× no Padrão, ≥ 1,1× no Veterano, ≥ 1,0× no Extinção.
- **Agressividade:** `maxContactAttackers` e `flankChance` revisados para encontros em corredor (no máximo 1 atacante em corredores com menos de 3 m de largura, via flag `narrow` na zona).
- **Retículo:** cone da escopeta; o retículo da pistola não muda.
- **Câmera em espaço apertado:** zonas `cameraZones` no JSON do capítulo com `exploreDistance`/`aimDistance` menores (ex.: 2,2/1,6 em corredores) com transição suave; ombro troca automaticamente se a parede do lado estiver a < 0,6 m.
- **Counter/esquiva:** as animações procedurais de esquiva do Caio (rolamento mais pesado) e do "counter" (tiro de escopeta que interrompe o bote) recebem pose própria em `PlayerView`; verificação manual + teste de que a interrupção acontece.

## 9. Erros e casos-limite

- Save v4 antigo carrega via migração; save corrompido segue o fluxo atual (recusa + backup).
- Morrer durante a defesa de Tomás ou o K-1 volta ao checkpoint anterior ao encontro; CC/itens voltam ao checkpoint sem duplicar (regra atual).
- Interação interrompida por dano (alavanca, painel) não consome nada e pode ser refeita.
- Fechar o pátio na ordem errada nunca bloqueia o progresso.

## 10. Testes

**Unitários (Vitest), novos:**
- registro de capítulos e carregamento de `ch01`/`ch02` (dados válidos: ids únicos, objetivos referenciam zonas/interações existentes);
- migração v4→v5 e validação v5;
- inventário por personagem e compartilhamento de CC/chaves;
- escopeta: chumbos, queda por distância, interrupção de bote, recarga por cartucho cancelável;
- K-1: atordoamento por colisão na investida, portão (dano/recarga/zona), fases, piso de aviso por preset;
- orçamento de munição por preset;
- bloqueio do Extinção.

**Fumaça (Playwright, `scripts/e2e3.mjs`):** novo jogo → pular para o fim do Cap. 01 via `?debug=1` → continuar → Cap. 02 carrega com Caio e escopeta → salvar/carregar → pular para o K-1 → vencer via debug → tela de resultados.

**Manual:** jogar o Cap. 02 inteiro no Padrão no navegador embutido.

## Fora do escopo

Capítulos 03+, modelos GLB, benchmark B02, troca livre de personagem, novas armas além da escopeta e da arma de impacto.
