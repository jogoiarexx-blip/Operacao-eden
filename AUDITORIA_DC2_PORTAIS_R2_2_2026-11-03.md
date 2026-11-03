# Operação Éden — R2.2 | Portais, LOD e emboscada de corredor
**Data:** 03/11/2026  
**Base:** R2.1 (duas fases, câmera sobre o ombro, save e dinossauros).  
**Entrega:** fonte atualizada na `main`, `index.html` compilado atualizado manualmente para GitHub Pages, testes de regressão e automação de Chromium.

## 1. Comparativo antes/depois

| Subsistema | Antes R2.1 | Depois R2.2 | Risco/impacto |
|---|---|---|---|
| Câmera nas portas | Quatro zonas amplas no Capítulo 02; a câmera podia ficar afastada demais nos vãos estreitos | Seis zonas prioritárias, curtas, com distância de exploração entre 1,8 e 1,95m; ADS entre 1,4 e 1,55m | Ajuste suave e colisão já gerenciados pela câmera existente; checar paredes e cobertura em browser |
| Renderização de detalhes | Pequenos props presentes em cena durante toda a fase | 7 candidatos de LOD (2 Cap. 01, 5 Cap. 02); ocultar além de 44m + raio, restaurar aquém de 36m + raio; reavaliar a cada 300ms ou deslocamento maior que 7m | Reduz até sete meshes desenhados se distantes; não reduz assets carregados, memória ou colisores |
| Segurança do LOD | Nenhum seletor | Exclui paredes, objetos com colisão de câmera/tiros, interativos, painéis, portões, plataformas e postes das alavancas | Não tenta descarregar o mundo e não altera o save |
| Combate do corredor administrativo | Depois do rádio ligado, corredor de volta podia ficar sem novo encontro | Um R-4 juvenil com rugido e pistas sonoras, somente ao retornar ao corredor após ligar rádio | Usa pontos pré-marcados, rejeita colisão e só escolhe fora da visão |
| Persistência dos inimigos | Save dos encontros existentes | `ch02_admin_hunter_triggered` impede repetição e `defeatedEnemies` impede reentrada de inimigo morto | Retomar save com inimigo ainda vivo pode recriá-lo com vida cheia, como os outros encontros |
| Manutenção entre fonte e Pages | Necessário manter build single em paridade | `index.html` publicado com as mesmas seis zonas, encontro novo, seletor de LOD e lógica do evento | Ideal futura CI de build e deploy automático em vez de patch manual |

## 2. Objetos elegíveis ao LOD

- **Cap. 01:** `vet_box`, `shelter_crate`.
- **Cap. 02:** `breach_rubble_a`, `breach_rubble_b`, `office_desk`, `pen_trough`, `archive_desk`.
- **Protegidos:** `tower_deck`, `lever_post_a/b`, `archive_door_leaf`, `yard_gate_leaf`, `exit_gate`, `generator`, `radio_console`, `cover_a`, `crates_shed`, todos os telhados e colisionadores de tiro/câmera.

O LOD desta fase é **desenho seletivo**, não streaming de geometria nem transição de imagem WebP/GLB. O número de draw calls realmente poupado e eventual ganho de FPS precisam ser medidos.

## 3. Emboscada e fluxo

1. Reativar o rádio no prédio administrativo.
2. Sair da sala do rádio e reencontrar a zona `admin_corridor`.
3. Ouvir o rangido e o aviso de passos.
4. Após pelo menos 1,1 segundo, procurar candidato de spawn a pelo menos 5m do jogador, sem colisor e fora da visão da câmera. Não há fallback forçado na frente da câmera; o evento espera um ponto seguro.
5. Criar um único juvenil `r4j_admin` em estado INVESTIGATE, registrar `storyFlags.ch02_admin_hunter_triggered`, tocar rugido e liberar combate normal.
6. Ao recarregar, reconstruir somente se o evento já foi ativado e o juvenil não está em `defeatedEnemies`.

## 4. Validação efetivamente executada

| Teste | Método | Estado |
|---|---|---|
| Sintaxe JS do bundle | Parse isolado de todo JS do `index.html` (`import.meta` substituído apenas no parser) | PASSOU |
| Seis portais da câmera | `zoneAtPoint` real sobre JSON do Cap. 02; pontos brecha, galpão, administração, pátio, arquivo e saída | PASSOU |
| Segurança do LOD | Predicado original executado com dados JSON: 2+5 candidatos; portas, alavancas e plataformas preservadas | PASSOU |
| Seleção/reativação por distância | Função de LOD isolada com mesh simulado; além do limite oculta e próximo reativa | PASSOU |
| Gatilho do corredor | Extração das rotinas reais `onZoneEnter`, `step` e `spawnAdminHunter` com dependências simuladas: espera 1,1s, cria 1 juvenil, não duplica, salva a flag | PASSOU |
| Paridade estática dos dados | Encontros e dez zonas de câmera do `index.html` comparados aos arquivos-fonte | PASSOU |
| Vitest completo | Arquivos novos adicionados; execução `npm test` não reproduzida nesta sessão | **NÃO VERIFICADO** |
| Chromium completo / partida humana | `scripts/e2e-portals.mjs` criado e incluído no workflow, mas navegador real não executado nesta sessão | **NÃO CERTIFICADO** |
| FPS e memória real em mobile/PC | Não medidos nesta sessão | **NÃO MEDIDO** |

## 5. Arquivos alterados

- `src/world/VisualDetailCulling.js` (novo), `src/world/SectorScenery.js`
- `src/data/chapter02.json`, `src/chapters/ch02.js`
- `index.html` (build de Pages, com portais + LOD + emboscada)
- `tests/visual-detail-culling.test.js`, `tests/admin-ambush.test.js`
- `scripts/e2e-portals.mjs`, `.github/workflows/eden-ci.yml`
- `README.md` e este relatório

## 6. Pendências reais, em ordem de impacto

1. **P0 — Certificação:** rodar Chromium de campanha completa, revisar prints/logs e corrigir falhas efetivamente reproduzidas antes de declarar as duas fases aprovadas.
2. **P1 — Streaming real e ganho mensurável:** particionar vegetação por setores/instâncias e carregar/descarregar detalhes de interiores por proximidade. Esta revisão só faz culling conservador de 7 props.
3. **P1 — Encontros mais elaborados:** patrulhas de flanco, comportamento de dinossauros em salas pequenas, coordenação sem atravessar paredes, cooldown e manejo de retorno após checkpoint.
4. **P1 — Câmera:** medir os seis portais em gameplay humano, observar obstrução de cabeça/ombros, mira, cobertura, colisão e interpolação ao cruzar os limiares.
5. **P2 — Cenografia:** áudio posicional por sala, alarmes de segurança, luz e partículas dinâmicas com orçamento por hardware.
6. **P2 — CI/CD:** gerar e publicar sempre o single-file compilado a partir da fonte, para não depender de edição manual do bundle minificado.

**Conclusão:** o jogo ganhou mais leitura espacial e tensão no Cap. 02 sem alterar a campanha, os controles ou os sistemas de save. A alegação de melhor FPS ou de fases completas e certificadas depende dos testes de browser e hardware ainda não executados.
