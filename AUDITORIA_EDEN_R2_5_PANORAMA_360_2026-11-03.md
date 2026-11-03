# Operação Éden — Auditoria R2.5: fundo panorâmico 360° sem emendas

**Data:** 03/11/2026 · **Fases afetadas:** Cap. 01 (Lia, floresta) e Cap. 02 (Caio, Posto Norte).  
**Objetivo:** ocultar o fim do cenário, manter profundidade visual em giros completos da câmera, harmonizar fundos pintados com a névoa e reduzir chamadas de desenho.

## Antes/depois

| Subsistema | Antes (R2.4) | Depois (R2.5) | Impacto |
| --- | --- | --- | --- |
| Horizonte | 4 planos retos por camada, totalizando 8 malhas; emendas e cantos visíveis em giros | 1 cilindro oco por camada, 48 segmentos cada, totalizando 2 malhas | Contorno circular contínuo visto por dentro; evita quinas do quadrado |
| Imagens | 2 texturas Canvas RGBA de 1024×256, repetidas em 4 direções | **Mesmas 2 texturas** enroladas uma vez nos 360° | Sem downloads adicionais e sem incremento significativo de VRAM |
| Continuidade da pintura | Alpha lateral ia até zero, deixando uma faixa transparente na emenda | Alpha lateral removido; morros periódicos e duplicação de árvores/prédios que cruzam a borda | Bordas esquerda/direita combinam, sem lacunas intencionais |
| Névoa | `fog: false` para não sumir depois de `fogFar`, mas opacidade fixa | Mantém `fog: false`, porém material translúcido ajusta a opacidade ao preset `fogFar` | Fusão mais suave com céu escuro, sem mudar a névoa do cenário 3D |
| Qualidade baixa | 4 planos da camada distante | 1 cilindro distante | Menos objetos de fundo para enviar ao GPU |
| Qualidade média/alta | 8 planos das duas camadas | 2 cilindros das duas camadas | Até 6 draw calls potenciais a menos; **ganho real não medido** |
| Complexidade geométrica | 16 triângulos (8 × 2) | Aproximadamente 192 triângulos (2 cilindros de 48 lados × 2) | Mais triângulos triviais em troca de menos draw calls; custo real depende da GPU |
| Colisão | Painéis fora de `data.bounds`, sem collider | Cilindros completos além da distância centro→canto + 15m/29m | Nenhuma superfície 2D alcançável ou nova hitbox |
| Save/IA | Independe dos fundos | Continua independente | Sem mudanças em enemies, câmera, história, backtracking ou persistência |

## Posicionamento verificável

| Fase | Distância do centro ao canto | Raio da camada próxima | Raio da camada distante |
| --- | ---: | ---: | ---: |
| Cap. 01 — `[-40,-44,40,44]` | 59,46m | 74,46m | 88,46m |
| Cap. 02 — `[-40,-40,40,40]` | 56,57m | 71,57m | 85,57m |

As superfícies circulares estão inteiras fora do retângulo jogável. As texturas ficam em 1024×256 e são criadas **uma vez por fase**, não em cada frame. Os materiais não recebem sombras e não usam shaders extras. Texturas descartadas na troca/fechamento de cena.

## QA realizado nesta sessão

| Verificação | Resultado |
| --- | --- |
| Parse do módulo `src/world/BackdropImpostors.js` e JavaScript completo de `index.html` | **PASSOU** (parse/execução isolados) |
| Instanciação do módulo fonte em um renderer/Canvas simulado | **PASSOU** — 2 cilindros, 2 texturas por capítulo |
| Extração e execução da fábrica publicada em `index.html` com mesmos mocks | **PASSOU** — estrutura e resultados idênticos à fonte |
| Exclusão dos cantos jogáveis: raios em ambos os capítulos | **PASSOU** — valores da tabela acima |
| Costura horizontal: montanhas `x=0` versus `x=1024` | **PASSOU** — curva periódica |
| Material: sem sombras, `depthWrite=false`, face interna visível e ordem distante→próxima | **PASSOU** em mocks — o browser real ainda precisa ser verificado |
| Preset baixo: 1 cilindro; média/alta: 2; opacidade segue `fogFar` | **PASSOU** com simulação de preset |
| Descarte de duas texturas ao sair da fase | **PASSOU** em simulação |
| `tests/backdrop-impostors.test.js` atualizado para cilindros, raio e continuidade | **CRIADO/ATUALIZADO, mas Vitest real NÃO EXECUTADO nesta sessão** |
| `scripts/e2e-backdrops.mjs` atualizado para checar cilindros e imagens fora do mapa | **ATUALIZADO; Chromium real NÃO EXECUTADO nesta sessão** |
| FPS e capturas em navegador real, verificação visual de clipping e ordem do alpha | **NÃO MEDIDOS / NÃO CERTIFICADOS** |

Os mocks apenas validam dados, chamadas e transições determinísticas. Não substituem renderização WebGL, uso de GPU ou playtest humano.

## Arquivos alterados

- `src/world/BackdropImpostors.js` — geometria circular e imagens de borda contínua
- `tests/backdrop-impostors.test.js` — raio, costura, materiais e níveis de qualidade
- `scripts/e2e-backdrops.mjs` — controle em Chromium para ambos os capítulos
- `index.html` — publicação do módulo atualizado também no standalone do Pages
- `README.md` e este relatório

## Pendências reais por prioridade

1. **P0:** confirmar GitHub Actions e Chromium nos dois capítulos, revisar `backdrop-ch01.png` e `backdrop-ch02.png`, buscar clipping no horizonte, costuras dos prédios/fences e sobreposição dos cilindros.
2. **P0:** jogar rotas de ida/volta até as bordas reais, alternando presets e retornando do menu para a campanha.
3. **P1:** medir os contadores de draw calls e tempo de renderização antes/depois, separando custo de geometrias e transparências.
4. **P1:** melhorar ainda mais a arte do panorama com WebP autoral das duas fases se capturas evidenciarem silhuetas abstratas demais, sem reproduzir fundos protegidos de jogos comerciais.
5. **P2:** observar condições extremas de FOV e mapa na versão mobile; ajustar silhuetas/névoa sem alterar limites de colisão.

**Conclusão:** a R2.5 remove emendas estruturais dos fundos 2D e adapta a transparência à névoa em ambos os capítulos. Não há evidência reproduzida nesta sessão para certificar ganho de FPS ou visibilidade perfeita em todos os ângulos de câmera.
