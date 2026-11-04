# Melhorias gráficas (low-poly caprichado) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevar o visual do jogo em luz/atmosfera, personagens/dinos, cenário e efeitos de combate, mantendo o estilo low-poly procedural e sem mudar jogabilidade.

**Architecture:** Novos módulos em `src/render/` (PostFX, ProceduralTextures, Materials, ParticlePool, Decals) consumidos pelas views e pelo cenário existentes; todo efeito é ligado por chaves novas de `QUALITY`. Lógica pura (presets, geração de pixels, pools) é testada sem WebGL; o resultado visual é verificado por capturas e o custo pelo benchmark B01.

**Tech Stack:** JavaScript ES modules, Three.js 0.170 (+ addons em `three/examples/jsm/postprocessing/*`), Vite 5, Vitest 2, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-melhorias-graficas-design.md`

## Global Constraints

- Nenhum asset externo e nenhuma dependência nova; só addons do pacote `three` 0.170.0.
- Jogabilidade, colisões, hitboxes, IA, números de combate e determinismo da simulação não mudam; os 122 testes existentes passam sem mudar expectativas.
- `QUALITY` ganha: `postfx` (`'grade'|'bloom'|'full'`), `pbr`, `moonShadow`, `grass`, `particles`, `decals`, `volumetric` — Baixo: `'grade'`, false, false, 0, 80, 12, false · Médio: `'bloom'`, true, true, 0.6, 220, 40, true · Alto: `'full'`, true, true, 1.0, 400, 80, true.
- Renderer: `toneMapping = THREE.ACESFilmicToneMapping`, `outputColorSpace = THREE.SRGBColorSpace`; texturas de cor com `colorSpace = SRGBColorSpace`.
- Gradação: vinheta 0.25, grão 0.04 (Médio/Alto; Baixo sem grão).
- Desempenho (benchmark B01, mesma máquina, vs. `main` 107750e): tempo de quadro médio no Médio piora ≤ 25 %, no Baixo ≤ 10 %.
- Aleatoriedade visual só via `createRng(seed)` (determinística); nada aloca por quadro em partículas/decalques.
- Falha ao criar um passe de pós → aviso no console e queda para `'grade'`, sem quebrar o jogo.
- Recursos compartilhados liberados em `Game.loadChapter`/`dispose` (sem crescimento entre trocas de capítulo).
- Texto de interface em português do Brasil. Manter finais de linha existentes dos arquivos.

## Review Focus

1. Trocar a qualidade em Opções no meio do jogo (Baixo↔Alto) → efeitos ligam/desligam sem tela preta nem vazamento (teste na Task 2: `passesFor` e `PostFX.setPreset` com stub; Task 1: troca de materiais).
2. Redimensionar a janela / mudar DPR → pós-processamento acompanha o tamanho (teste na Task 2 de `setSize` repassando aos passes via stub).
3. Trocar de capítulo várias vezes (Cap. 01 → Cap. 02 → menu → benchmark) → contagem de texturas/pools não cresce (teste na Task 1 para cache de texturas, Task 8 para pools).
4. Rajada de escopeta + sangue em sequência → pool recicla os mais antigos, sem alocar (teste na Task 8).
5. Benchmark B01 continua determinístico e comparável antes/depois (Task 0 cria a medição; Task 9 compara).

---

### Task 0: Linha de base visual e de desempenho

**Files:** Create: `scripts/shots-visual.mjs`, `scripts/bench.mjs`; Modify: `src/Game.js` (`_installDebug`: `__eden.setQuality(id)`, `__eden.cameraShot(chId, shotId)` se faltar), `.gitignore` (`/shots/`)

**Interfaces:**
- Produces: `node scripts/shots-visual.mjs <label>` → grava `shots/<label>/<preset>-<cena>.png` para cenas fixas: `ch01-pier`, `ch01-trilha`, `ch01-baliza`, `ch01-torre`, `ch02-patio`, `ch02-corredor`, `ch02-k1` (posição+yaw+pitch fixos por cena, definidos no script) × presets `low|medium|high`.
- Produces: `node scripts/bench.mjs <label>` → roda B01 em `low` e `medium` via UI/debug e grava `shots/<label>/bench.json` com `{ preset: { avgMs, p95Ms } }`.

- [ ] **Step 1:** Implementar os dois scripts (servindo `dist` em :4177 com flags swiftshader dos e2e existentes; HUD oculto nas capturas).
- [ ] **Step 2:** `npm run build` e rodar `node scripts/shots-visual.mjs antes` e `node scripts/bench.mjs antes`. Expected: 21 PNGs e `bench.json` com 2 presets.
- [ ] **Step 3:** Commit `chore: capturas e benchmark de linha de base` (sem `shots/`).

### Task 1: Presets, texturas procedurais e materiais

**Files:** Create: `src/render/ProceduralTextures.js`, `src/render/Materials.js`; Modify: `src/core/Settings.js` (`QUALITY`); Test: `tests/render.test.js`

**Interfaces:**
- Produces: `QUALITY[id]` com as chaves das Global Constraints.
- Produces: `generatePixels(kind, seed, size) → Uint8ClampedArray` (RGBA, puro, sem DOM) para `kind ∈ {'dirt','mud','gravel','bark','scales','cloth','concrete','metal','foliage'}`; `getTexture(kind, { seed = 1, size = 256, repeat }) → THREE.CanvasTexture|THREE.DataTexture` (cache por `kind:seed:size`); `disposeTextures()`; `textureCacheSize() → number`.
- Produces: `getMaterial(role, quality, opts?) → THREE.Material` para `role ∈ {'ground','bark','foliage','skin','cloth','clothDark','scales','metal','concrete','wood','emissiveLamp'}` (opts: `{ color, emissive, accent }`); Lambert se `!QUALITY[q].pbr`, senão `MeshStandardMaterial` (roughness/metalness por papel); cache por `role:quality:hash(opts)`; `disposeMaterials()`.

- [ ] **Step 1: Testes que falham:** `QUALITY.low.postfx === 'grade'`, `QUALITY.medium.particles === 220`, `QUALITY.high.decals === 80` (todas as chaves nos 3 níveis); `generatePixels('dirt', 7, 32)` igual em duas chamadas e diferente de seed 8, tamanho 32×32×4; `getMaterial('cloth','low').type === 'MeshLambertMaterial'` e `getMaterial('cloth','high').type === 'MeshStandardMaterial'`; mesma chamada retorna o mesmo objeto (cache); após `disposeTextures()`, `textureCacheSize() === 0`.
- [ ] **Step 2:** `npx vitest run tests/render.test.js` → FAIL.
- [ ] **Step 3:** Implementar (ruído de valor com `createRng`; `getTexture` usa `DataTexture` quando não houver `document`).
- [ ] **Step 4:** `npm test` passa.
- [ ] **Step 5:** Commit `feat: presets gráficos, texturas procedurais e materiais`.

### Task 2: PostFX, tone mapping, sombra da lua e névoa

**Files:** Create: `src/render/PostFX.js`, `src/render/gradeShader.js`; Modify: `src/Game.js` (renderer, `applySettings`, `onResize`, laço de render e benchmark usam `postfx.render`), `src/world/SectorScenery.js` (lua com sombra seguindo o jogador, `FogExp2`), `src/data/chapter01.json` / `chapter02.json` (`render: { exposure, fogColor, fogDensity, grade }`), `src/actors/Player.js` ou `Game.onPlayerEvent` (chamar `pulseDamage` ao receber dano); Test: `tests/postfx.test.js`

**Interfaces:**
- Produces: `passesFor(quality) → string[]` (puro): `'grade' → ['render','grade','output']`, `'bloom' → ['render','bloom','grade','output']`, `'full' → ['render','sao','bloom','grade','output']`.
- Produces: `class PostFX { constructor(renderer, scene, camera, { createPass } ) ; setPreset(qualityId); setSize(w, h, dpr); setGrade({ vignette, grain, tint }); pulseDamage(intensity0to1); render(dt); dispose() }` — `createPass(name)` injetável (padrão cria os passes reais) para testar sem WebGL; falha em `createPass` → `console.warn` e preset efetivo `'grade'`.
- Produces: `gradeShader` uniforms: `uVignette`, `uGrain`, `uTime`, `uTintShadow`, `uTintLight`, `uDamage`.
- Lua: `moonShadow` liga `castShadow`; câmera de sombra ±20 m centrada no jogador, atualizada em `scenery.update`.

- [ ] **Step 1: Testes que falham:** `passesFor` para os 3 níveis; `PostFX` com `createPass` falso registra a ordem de passes ao `setPreset('high')`; `setPreset('low')` depois de `'high'` chama `dispose` dos passes removidos; `setSize(800,600,2)` repassa `(1600,1200)` aos passes; `createPass` que lança em `'sao'` → preset efetivo `'grade'` e `console.warn` chamado; `pulseDamage(1)` seguido de `render(0.5)` reduz `uDamage` (decai em ~0,4 s).
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar; exposição e névoa do capítulo aplicadas em `loadChapter`; flash de dano ligado ao evento de dano do jogador.
- [ ] **Step 4:** `npm test`, `npm run build`, scripts e2e (`e2e`, `e2e2`, `e2e-transition`, `smoke-ch02`, `e2e3`) sem THREW; capturas `node scripts/shots-visual.mjs etapa1`.
- [ ] **Step 5:** Commit `feat: pós-processamento, tone mapping, sombra da lua e névoa`.

### Task 3: Atmosfera — lanterna volumétrica, névoa rasteira, emissivos e relâmpago

**Files:** Create: `src/render/Atmosphere.js`; Modify: `src/world/SectorScenery.js`, `src/chapters/ch01.js`, `src/chapters/ch02.js` (lâmpadas/painéis/CORO/baliza com `getMaterial('emissiveLamp', …)`)

**Interfaces:**
- Consumes: `getMaterial`, `getTexture` (Task 1), `QUALITY.volumetric`.
- Produces: `createAtmosphere({ scene, quality, data }) → { update(dt, { player, flashlight, camera, lightning }), dispose() }` com: cone aditivo da lanterna (alinhado ao `SpotLight` existente, ruído animado), 6–10 quads de névoa rasteira com ruído (só `volumetric`), poeira no feixe; relâmpago integra flash da hemisfera + sombra dura breve da lua.

- [ ] **Step 1:** Teste em `tests/render.test.js`: `createAtmosphere` com `quality:'low'` não cria cone nem névoa (`children.length === 0` no grupo); `'medium'` cria cone e névoa; `dispose()` remove o grupo da cena.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** `npm test`, build, e2e; `shots-visual etapa1b`.
- [ ] **Step 5:** Commit `feat: atmosfera noturna (lanterna volumétrica, névoa rasteira, emissivos)`.

### Task 4: Lia e Caio

**Files:** Modify: `src/actors/PlayerView.js` (pode dividir em `src/actors/HumanRig.js` para a montagem da malha); Test: `tests/views.test.js`

**Interfaces:**
- Consumes: `getMaterial('skin'|'cloth'|'clothDark'|'metal', quality, { color })`.
- Produces: `PlayerView.setCharacter(id)` (já existe) monta rig com cápsulas/cilindros chanfrados: cabeça, cabelo em mechas, tronco, colete com bolsos, braços (ombro/cotovelo), mãos, pernas (quadril/joelho), botas; Caio mais largo, ombreiras e mochila. Animação procedural: respiração, passada com inclinação, braços alinhados à arma na mira, recuo por `weapon.recoilKickDeg`, rolamento na esquiva (Caio mais pesado), reação a dano.
- Invariantes: altura total 1,70 m (Lia) / 1,78 m (Caio) ± 0,05; ponto do cano e alturas usadas pela câmera inalterados.

- [ ] **Step 1: Testes que falham:** `new PlayerView()` + `setCharacter('lia')` → `Box3` da malha com altura 1,65–1,75; `'caio'` 1,73–1,83 e largura maior que Lia; trocar personagem 5× não aumenta o número de geometrias únicas (reaproveita/descarta).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npm test`, build, e2e; `shots-visual etapa2a`.
- [ ] **Step 5:** Commit `feat: modelos procedurais de Lia e Caio`.

### Task 5: R-4, R-4J e K-1

**Files:** Modify: `src/actors/CreatureView.js` (pode dividir em `src/actors/DinoRig.js`); Test: `tests/views.test.js`

**Interfaces:**
- Consumes: `getMaterial('scales', quality, { color, accent })` com faixas da cor `accent` do bestiário; `getMaterial('emissiveLamp', …)` para olhos (fracos).
- Produces: rig com cabeça (mandíbula móvel), pescoço, tronco, cauda em 5 segmentos encadeados, pernas com garras; K-1 com crista/placas e escala da espécie. Animação: cauda em onda, pescoço mirando o alvo, agachamento do telegrafado, mordida, investida baixa (K-1), atordoado com cabeça pendendo, morte com queda — dirigida pelo estado do agente como hoje.
- Invariante: hitboxes (`species.hit`, `hitBoxes`) e `hurtRadius` intocados; `Box3` da malha dentro de ±15 % da altura atual por espécie.

- [ ] **Step 1: Testes que falham:** para cada espécie, altura do `Box3` dentro de ±15 % da versão atual (medir a atual no teste a partir de constantes registradas na Step 3 da Task 0 ou calcular com a view antiga antes da troca — registrar os valores no teste); cauda tem 5 segmentos; `dispose()` libera geometrias.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npm test`, build, e2e (incluindo `smoke-ch02` com K-1); `shots-visual etapa2b`.
- [ ] **Step 5:** Commit `feat: modelos procedurais dos dinossauros`.

### Task 6: Chão, árvores e vegetação

**Files:** Create: `src/render/Vegetation.js`; Modify: `src/world/SectorScenery.js`; Test: `tests/render.test.js`

**Interfaces:**
- Consumes: `getTexture('dirt'|'mud'|'gravel'|'bark'|'foliage')`, `getMaterial`.
- Produces: chão com textura em duas escalas e trilhas pintadas a partir de `data.paths` (canvas de máscara); 3 variantes de árvore (pinheiro, folhosa, palmeira) escolhidas por `createRng(treeSeed)` **sem alterar** posições/colisores atuais; `scatterVegetation({ data, quality, rng }) → { grass: InstancedMesh|null, ferns, rocks, logs }` com densidade × `QUALITY.grass`, vento no vertex shader via `onBeforeCompile`, nada sobre trilhas nem dentro de colisores.

- [ ] **Step 1: Testes que falham:** `scatterVegetation` em `quality:'low'` → `grass === null`; em `'high'` nenhuma instância a < 1,2 m de um ponto de `paths` nem dentro de um `structures` com `flags` não vazias; mesma seed → mesmas matrizes; posições das árvores idênticas às atuais (comparar com a função de posicionamento existente).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npm test`, build, e2e; `shots-visual etapa3a`.
- [ ] **Step 5:** Commit `feat: chão texturizado, árvores e vegetação com vento`.

### Task 7: Estruturas, props e chuva

**Files:** Modify: `src/world/SectorScenery.js`, `src/chapters/ch01.js`, `src/chapters/ch02.js`; Test: `tests/render.test.js`

**Interfaces:**
- Consumes: `getMaterial('concrete'|'metal'|'wood'|'emissiveLamp')`.
- Produces: estruturas (`structures`) com chanfros, chapas, janelas emissivas, cabos e manchas por `visual` — **mesmas caixas de colisão**; chuva com gotas alongadas e respingos (pool próprio, limite por preset) e poças de baixa rugosidade em `data.puddles` (novo campo opcional `[[x,z,r]]`, 3–5 por capítulo).

- [ ] **Step 1: Teste:** para cada capítulo, o conjunto de colisores do `CollisionWorld` após `buildScenery` é idêntico (ids e caixas) ao de antes da mudança (registrar snapshot no teste).
- [ ] **Step 2:** FAIL/registrar. **Step 3:** implementar. **Step 4:** `npm test`, build, e2e; `shots-visual etapa3b`.
- [ ] **Step 5:** Commit `feat: estruturas detalhadas, chuva e poças`.

### Task 8: Partículas, decalques e efeitos de combate

**Files:** Create: `src/render/ParticlePool.js`, `src/render/Decals.js`; Modify: `src/world/FX.js` (passa a delegar; mantém `tracer` e `burst` como API), `src/Game.js` (`shoot`, eventos de recarga/ejeção, dano no jogador, investida/colisão do K-1, queda do portão); Test: `tests/particles.test.js`

**Interfaces:**
- Produces: `class ParticlePool { constructor({ capacity, scene? }); spawn(type, pos, opts) ; update(dt); get alive(); dispose() }` — tipos `'smoke'|'spark'|'dust'|'blood'|'shell'|'muzzle'`; ao lotar recicla a mais antiga; sem alocação após o construtor.
- Produces: `class Decals { constructor({ capacity, scene? }); add(kind, pos, normal, size); update(dt); get count(); dispose() }` — fade em 20 s, recicla a mais antiga.
- Produces: `FX` ganha `muzzle(pos, dir, weaponId)`, `impact(point, surface)` (`surface` de `collider` atingido: `'metal'|'concrete'|'wood'|'ground'`), `blood(point)`, `shellEject(pos, dir, weaponId)`, `dustRing(pos, radius)`; capacidades de `QUALITY.particles` / `QUALITY.decals`.
- Clarão do cano usa uma única `PointLight` reaproveitada (intensidade decai em 60 ms).

- [ ] **Step 1: Testes que falham:** pool de 4 com 6 `spawn` → `alive === 4` e as 2 primeiras recicladas; contador de alocações (espiar `new` via contagem de objetos criados no construtor) estável após 1000 spawns; `Decals` de 3 com 5 `add` → `count === 3`; após `update(21)` → `count === 0`; `FX.impact` com superfície `'metal'` gera `spark`, com `'ground'` gera `dust`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar e ligar em `Game`. **Step 4:** `npm test`, build, todos os e2e; `shots-visual etapa4`.
- [ ] **Step 5:** Commit `feat: partículas, decalques e efeitos de combate`.

### Task 9: Verificação final, desempenho e README

**Files:** Modify: `README.md`, `src/benchmark/Benchmark.js` (só se `recommend` precisar das chaves novas)

- [ ] **Step 1:** `npm run build && node scripts/bench.mjs depois`; comparar com `shots/antes/bench.json`. Expected: Médio ≤ +25 %, Baixo ≤ +10 %. Se estourar, reduzir custo (densidade de grama, SAO só no Alto, resolução do bloom) até cumprir, e registrar os números.
- [ ] **Step 2:** `node scripts/shots-visual.mjs depois`; montar `shots/comparacao.html` (antes|depois lado a lado por cena/preset) — fora do git.
- [ ] **Step 3:** `npm test`, `npm run build`, `npm run build:single`, todos os scripts e2e sem THREW.
- [ ] **Step 4:** README: seção "Gráficos" (presets e o que cada um liga).
- [ ] **Step 5:** Commit `docs: melhorias gráficas; verificação de desempenho`.
