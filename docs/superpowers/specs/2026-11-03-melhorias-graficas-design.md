# Melhorias gráficas — "Low-poly caprichado" — Design

Data: 2026-11-03 · Base: `main` após R2 (commit 107750e) · GDD v4 §2.5 (direção visual), §10, §11.

## 1. Entendimento

**Pedido (usuário):** melhorias gráficas no jogo, na direção **low-poly caprichado** — manter o estilo, sem baixar assets — cobrindo **luz e atmosfera, personagens e dinos, cenário e efeitos de combate**.

**Premissas (aceitas pelo usuário ao aprovar o design):**
- Tudo gerado em código (geometria e texturas procedurais); nenhum asset externo, nenhuma dependência nova (só addons que já vêm no pacote `three` 0.170).
- O preset **Baixo** continua rodando em máquina fraca; cada efeito novo é ligado por preset.
- Jogabilidade, colisões, hitboxes, IA, números de combate e determinismo **não mudam**.

**Critério de sucesso:** capturas antes/depois das mesmas cenas mostram ganho claro em cada área; no benchmark B01, o tempo de quadro médio no preset Médio não piora mais de 25 % e o Baixo não piora mais de 10 % em relação ao `main` atual (mesma máquina); todos os testes unitários e scripts e2e passam; Cap. 01 e Cap. 02 jogam igual.

## 2. Arquitetura

- **`src/render/PostFX.js`** (novo): encapsula `EffectComposer` (addons do three: `RenderPass`, `UnrealBloomPass`, `SAOPass`, `OutputPass`, `ShaderPass`) e um shader próprio de **gradação de cor + vinheta + grão + flash de dano** numa única passada. API: `new PostFX(renderer, scene, camera)`, `setPreset(q)`, `setSize(w, h, dpr)`, `render(dt)`, `pulseDamage(intensity)`, `dispose()`. Quando o preset desliga tudo, renderiza direto (`renderer.render`) sem composer.
- **`src/render/ProceduralTextures.js`** (novo): gera `CanvasTexture`s determinísticas a partir de seed (`createRng`): terra/lama/cascalho, casca de árvore, escamas, tecido, concreto, chapa metálica, mapas de rugosidade. Cacheadas por chave; liberadas em `dispose`.
- **`src/render/Materials.js`** (novo): fábrica de materiais compartilhados por papel (`ground`, `bark`, `foliage`, `skin`, `cloth`, `scales`, `metal`, `concrete`, `emissiveLamp`…), escolhendo `MeshStandardMaterial` (Médio/Alto) ou `MeshLambertMaterial` (Baixo) com as mesmas texturas.
- **`src/render/ParticlePool.js`** (novo): pool fixo de partículas (`InstancedMesh` ou `Points`) com tipos `smoke`, `spark`, `dust`, `blood`, `shell`, `muzzle`; limite por preset; sem alocação por quadro.
- **`src/render/Decals.js`** (novo): decalques simples (quads alinhados ao chão) para sangue e marcas de tiro, com fade e limite por preset.
- Arquivos existentes alterados: `Game.js` (renderer: `toneMapping = ACESFilmic`, `outputColorSpace = SRGB`, usar `PostFX.render`), `core/Settings.js` (`QUALITY` ganha chaves), `world/SectorScenery.js`, `actors/PlayerView.js`, `actors/CreatureView.js`, `world/FX.js`, `chapters/ch01.js` / `ch02.js` (props).

**Presets (`QUALITY`) — chaves novas:**

| chave | Baixo | Médio | Alto |
|---|---|---|---|
| `postfx` | `'grade'` (só gradação/vinheta, sem composer extra) | `'bloom'` | `'full'` (bloom + SAO) |
| `pbr` | false (Lambert) | true | true |
| `moonShadow` | false | true | true |
| `grass` | 0 | 0,6 | 1,0 (densidade relativa) |
| `particles` | 80 | 220 | 400 |
| `decals` | 12 | 40 | 80 |
| `volumetric` | false | true | true (cone da lanterna, feixes) |

## 3. Etapas

### Etapa 1 — Luz e atmosfera
- Renderer: tone mapping ACES Filmic, exposição ajustável por capítulo (`data.render.exposure`, padrão 1,0), `outputColorSpace` sRGB; texturas de cor marcadas como sRGB.
- **Lua com sombra** (`moonShadow`): `DirectionalLight` com câmera de sombra seguindo o jogador (frustum ~40 m), bias ajustado; mapa conforme `shadowMap` do preset.
- **Névoa**: `FogExp2` com cor por capítulo + plano de névoa rasteira (quads translúcidos com ruído animado, só `volumetric`).
- **Lanterna**: cone volumétrico falso (cone aditivo com gradiente e ruído) alinhado ao `SpotLight`; poeira em suspensão no feixe.
- **Luzes do cenário** (baliza, postes, CORO, painéis) passam a materiais emissivos que alimentam o bloom.
- **Relâmpago**: flash da hemisfera + sombra dura breve da lua (já há `lightning` — integrar).
- **Gradação**: tom frio azul-esverdeado nas sombras, quente nas luzes, vinheta 0,35 (cap. 1) / 0,40 (cap. 2), grão 0,012 / 0,014 no Médio/Alto e 0 no Baixo (valores ajustados: a gradação roda em espaço linear antes do ACES, então grão aditivo de 0,04 ficava muito visível nas sombras; vinheta 0,25 ficava fraca após o tone mapping). Flash vermelho de dano pela mesma passada.
- Cada capítulo pode definir `render: { exposure, fogColor, fogDensity, grade }` no JSON.

### Etapa 2 — Personagens e dinos
- **Lia e Caio** (`PlayerView`): corpo em cápsulas/cilindros com bordas chanfradas, mãos, botas, colete com bolsos, mochila (Caio), cabelo em mechas low-poly; materiais `cloth`/`skin`/`metal`. Silhuetas distintas (Caio mais largo, ombreiras). Mantém pontos de câmera, `muzzle` e alturas atuais (1,70 m de referência).
- Animação procedural: respiração, balanço da passada com inclinação do tronco, mira com braços alinhados à arma, recuo por arma, rolamento na esquiva, reação a dano.
- **R-4 / R-4J / K-1** (`CreatureView`): corpo segmentado (pescoço, tronco, cauda em 4–6 segmentos encadeados), cabeça com mandíbula móvel, garras, crista/placas (K-1), olhos emissivos fracos (refletem a lanterna), textura `scales` com faixas da cor `accent` do bestiário.
- Animação procedural: cauda em onda seguindo o movimento, pescoço mirando o alvo, agachamento do telegrafado mais legível, mordida com mandíbula, investida do K-1 com corpo baixo, atordoado com cabeça pendendo, morte com queda.
- **Hitboxes, escalas e raios não mudam** — só a malha visual.

### Etapa 3 — Cenário
- **Chão**: textura procedural de terra/lama/cascalho com repetição quebrada (duas escalas misturadas), trilhas pintadas no mapa de cor a partir de `paths` (sem geometria nova).
- **Vegetação**: grama e samambaias em `InstancedMesh` com balanço ao vento no vertex shader (`onBeforeCompile`), densidade por `grass`; pedras e troncos caídos decorativos (sem colisão, fora das trilhas e dos colisores existentes).
- **Árvores**: 3 variantes (pinheiro, folhosa, palmeira) com tronco texturizado, mantendo as posições e colisores atuais de `treeSeed`.
- **Construções do posto** (Cap. 02) e estruturas do Cap. 01: chanfros, chapas, janelas emissivas, cabos, manchas de ferrugem via textura; usam as mesmas `structures` (mesmas caixas de colisão).
- **Chuva**: gotas alongadas com respingos no chão (pool), poças com reflexo falso (material de baixa rugosidade) em pontos marcados.

### Etapa 4 — Efeitos de combate
- **Disparo**: clarão do cano (sprite + `PointLight` curta reaproveitada), fumaça, cápsula ejetada (pistola) ou cartucho (escopeta na recarga).
- **Impacto**: faíscas em metal/concreto, poeira em terra/madeira (tipo do colisor atingido), decalque de marca.
- **Sangue**: respingo em partículas + decalque no chão, com fade.
- **Escopeta**: rastros finos por chumbo (já há tracers — reaproveitar com fade).
- **Dano no jogador**: `PostFX.pulseDamage` + leve aberração; sangramento pulsa a vinheta.
- **K-1**: poeira na investida, tremor e anel de poeira na colisão com parede, faíscas no portão ao cair.
- Tudo via `ParticlePool`/`Decals`, com limites do preset; nada aloca por quadro.

## 4. Erros e desempenho
- Se um passe falhar ao compilar/criar (ex.: WebGL sem suporte), `PostFX` registra aviso no console e cai para o modo `'grade'`, sem quebrar o jogo.
- Recursos (texturas, materiais, pools) são compartilhados e liberados em `loadChapter`/`dispose` (sem vazamento na troca de capítulo).
- Partículas e decalques reciclam os mais antigos ao atingir o limite.
- Benchmark B01 existente mede o impacto; recomendações automáticas de qualidade (`recommend`) continuam funcionando.

## 5. Testes
- **Unitários (Vitest, sem WebGL):** presets (`QUALITY` tem as chaves novas e valores coerentes por nível); `ProceduralTextures` determinística por seed (mesmos pixels com mesma seed — usar canvas falso/stub ou gerar dados em `Uint8Array` testável); `ParticlePool` (limite, reciclagem, sem alocação após aquecimento); `Decals` (limite e fade); `Materials` escolhe Lambert no Baixo e Standard no Médio/Alto.
- **E2E:** todos os scripts existentes (`e2e`, `e2e2`, `e2e-transition`, `smoke-ch02`, `e2e3`) passam sem erros de console.
- **Visual:** script `scripts/shots-visual.mjs` captura as mesmas cenas fixas (Cap. 01: píer, trilha, baliza, torre; Cap. 02: pátio, corredor, K-1) nos 3 presets, para comparação antes/depois em cada etapa.
- **Desempenho:** rodar B01 no `main` atual e após cada etapa (Baixo e Médio) e registrar no relatório; metas do §1.

## Fora do escopo
Modelos GLB/assets externos, impostors WEBP (§10.2), mudanças de jogabilidade, novos capítulos, áudio.
