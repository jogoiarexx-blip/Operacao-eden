# Operação Éden — R2.1 | Passagens, suspense e continuidade
Data: 03/11/2026 | Base: `main` após a revisão de transições R2.

## Referência e objetivo
Aproximar o ritmo de **Dino Crisis 2** pela alternância de exploração, áreas controladas, encontros marcados e portas com identidade. Manter personagens, mapa, código, áudio e roteiro originais; preservar a câmera sobre o ombro em vez de copiar a câmera fixa do jogo de referência.

## Auditoria: antes → depois
| Subsistema | Antes | Depois |
| --- | --- | --- |
| Transição entre salas | Somente zonas de câmera e portas com movimento; sem apresentação contextual | Revelações curtas, com letterbox, nome do local e mensagem diegética; 4 no Cap. 01 e 6 no Cap. 02 |
| Travessia de portas | Portas abriam sem identificação da nova área | Portão sul, pátio central, arquivo e portão de retirada ativam apresentações após abrir |
| Ritmo do Cap. 02 | Primeiro R-4 existia no cenário desde o carregamento da fase | Só nasce ao atravessar a brecha; entra no modo INVESTIGATE e há rugido de aviso |
| Save | Estado do primeiro R-4 dependia de encontros já gerados | `storyFlags.ch02_breach_entered` persistido; restaurar capítulo respawna somente se não derrotado |
| Final da fase 02 | `index.html` compilado usava `exit_trigger`, enquanto o JSON atual usava `north_service_exit` | Zona, objetivo e condição de saída da build publicados sincronizados com JSON |
| Interrupção da ação | Cutscene de capítulo e resultados mudam de estado do jogo | As passagens de ambiente são apenas sobreposição visual; não mudam estado, não pausam IA, não teleportam |
| QA automático | Workflow checava `dist/index.html`, mas Vite single gera `dist-single/index.html` | Corrigido caminho e incluídos Playwright da campanha R2 e da brecha no Chromium |

## Arquivos
- `src/gameplay/AreaTransitions.js`: seleção de beats e montagem segura do overlay no DOM.
- `src/gameplay/ChapterRuntime.js`: integração com zona e gatilho de porta; reset por entrada de capítulo.
- `src/data/chapter01.json` e `src/data/chapter02.json`: metadados dos 10 beats.
- `src/chapters/ch01.js` e `src/chapters/ch02.js`: eventos dos portões e novo gatilho do predador.
- `src/styles/main.css`: animação responsiva, `pointer-events:none` e opção sem movimento.
- `index.html`: bundle de Pages atualizado com lógica equivalente e correção de saída.
- `tests/area-transitions.test.js`, `scripts/e2e-area-transitions.mjs` e `.github/workflows/eden-ci.yml`: QA.

## Testes reproduzidos nesta sessão
1. **PASSOU (JavaScript isolado):** seleção dos 10 beats a partir dos dois JSONs; títulos presentes no bundle.
2. **PASSOU (JavaScript isolado):** exibição de área uma vez, limpeza do overlay, sem chamadas para mudar estado e sem geração extra de som.
3. **PASSOU (JavaScript isolado):** a primeira entrada pela brecha gera um R-4; reentrada não duplica; após o gatilho, o encontro fica apto a ser reconstruído no carregamento de save.
4. **PASSOU (análise sintática):** JavaScript compilado parseado, com substituição apenas de `import.meta` para permitir o teste em script-mode.
5. **PASSOU (paridade estática):** saída do Cap. 02 da versão compilada agora usa `north_service_exit` para zona, objetivo e condição de saída.
6. **NÃO EXECUTADO:** Vitest completo e Playwright em navegador real nesta sessão. Adicionados ao workflow GitHub Actions, cuja execução ainda precisa ser confirmada.
7. **NÃO CERTIFICADO:** partida humana Cap. 01 → Cap. 02 até K-1, FPS em hardware real, transições em mobile, fidelidade visual e áudio.

## Próximas pendências por impacto
- **P1:** segmentação espacial com culling de props/efeitos internos fora da área atual (atualmente as cenas ainda carregam todo o capítulo); requer teste de colisão, sombras, IA e retorno à sala.
- **P1:** portas físicas com câmera de passagem controlada e tratamento de reentrada/ataques próximos ao portal. Não implementar fade que interrompa combate.
- **P1:** emboscadas de corredor no Cap. 02 e gatilhos de ameaça no Cap. 01 com cooldown, checagem fora do campo visual e persistência de inimigos derrotados.
- **P1:** certificar o E2E de campanha com screenshots e logs do Chromium, corrigindo apenas falhas reproduzidas.
- **P2:** iluminação e som característicos por sala, pistas ambientais, mais variedade de forma/animação nos predadores.
- **P2:** melhorar feedback de combos, combate em deslocamento, câmeras de impacto e legibilidade de risco.

## Critério de aceite
Jogador atravessa a brecha sem inimigo inicial aparecendo na cena de introdução; ouve o predador ao entrar; retorna à brecha sem duplicação; abre portões, conclui defesa do Tomás e mata K-1; saída norte conclui Cap. 02 e concede resultado. Todos os objetos continuam com colisão, câmera sobre o ombro, controles e save sem regressão. A verificação integral depende de um playtest real — testes isolados não comprovam campanha zerada.
