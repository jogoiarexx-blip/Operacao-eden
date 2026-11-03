# Operação Éden — auditoria de transição e direção de câmera (03/11/2026)

## Referência de design
A referência é **Dino Crisis 2** (ação fluida, combates em sequências, progresso por áreas conectadas, alternância de protagonistas e compras/recuperação nos terminais). A execução permanece original: cenário, personagens, roteiro e modelos próprios. A câmera sobre o ombro de Operação Éden foi preservada por decisão do projeto.

## Estado antes
- O Capítulo 01 terminava com a câmera orbitando a torre CORO, sem acompanhar Lia no portão.
- O diálogo de encerramento terminava antes de estabelecer claramente por onde Caio seguiria.
- O resultado do Capítulo 01 obrigava a abrir a seleção de dificuldade para continuar.
- O Capítulo 01 não possuía cameraZones; o Capítulo 02 tinha zonas para quatro recintos.
- O GitHub Pages usa um `index.html` compilado independente dos arquivos em `src/`.

## Mudanças desta entrega
1. Encerramento do Capítulo 01: câmera transiciona do portão onde Lia está para a torre CORO, mantendo as barras cinematográficas e a transmissão. Duração de 9,2 s para 16,4 s; novo diálogo tem 15,7 s.
2. Passagem narrativa: Lia menciona o portão sul; Caio confirma a chegada pela estrada de serviço e a rota lateral; a introdução do Capítulo 02 retoma o último sinal de Lia.
3. Na tela de resultados, **Continuar — Capítulo 02** vai direto à introdução com a dificuldade já escolhida. **Alterar dificuldade** continua disponível como ação alternativa.
4. Carregamento do segundo capítulo sinaliza “Posto Norte — acesso lateral” por 0,8 s antes de entrar na cutscene.
5. Cinco zonas de câmera no Capítulo 01 (píer, torre, ravina, acampamento, portão): aproximação suave para reforçar cenas com paredes, passagem estreita e revelação visual. Não há teleporte nem troca para câmera fixa; o jogador mantém controle e mira por cima do ombro.
6. Atualizados tanto os arquivos-fonte quanto o `index.html` compilado, preservando o Pages atual.
7. Os roteiros E2E `e2e-transition.mjs` e `e2e3.mjs` foram atualizados para a continuação direta; criado teste unitário de diálogos, enquadramentos e preservação de save.
8. Criado workflow `.github/workflows/eden-ci.yml` para executar `npm test` e `npm run build:single` a cada push/PR; execução do GitHub Actions ainda não confirmada.

## Verificações executadas nesta sessão
- **Passou:** análise sintática do JavaScript compilado (adaptação apenas de `import.meta` ao parser isolado).
- **Passou:** execução isolada da função de câmera compilada nos instantes 0 s e 16,4 s; posições e FOV finitos.
- **Passou:** execução isolada de `zoneAtPoint` em ravina, torre, portão e ponto fora das zonas.
- **Passou:** duração das falas (15.700 ms) inferior à duração da cutscene (16.400 ms).
- **Não executado:** `npm test` e `npm run build:single` em um checkout local completo, por indisponibilidade de download/clonagem do ambiente de execução.
- **Não executado:** Playwright real navegando e jogando os dois capítulos, avaliando colisões, áudio e FPS. O E2E foi ajustado, mas não certificado nesta sessão.
- **Não confirmado:** cache/deploy do domínio GitHub Pages após os commits, embora o `index.html` do ramo principal tenha sido atualizado.

## Pendências priorizadas para aproximar ainda mais do Dino Crisis 2
- **P1:** decompor cenários em salas/segmentos com portas e passagens que carreguem áreas leves, mantendo retorno e progressão; criar sistema de transição cinematográfica de ambiente, sem telas longas.
- **P1:** reavaliar posicionamento/ritmo dos encontros no Capítulo 01 e dos corredores do Capítulo 02, criando uma cadência entre combate, exploração e pequenas revelações. Não aumentar densidade sem medir desempenho.
- **P1:** criar playtest real que alcance o portão sul, continue a campanha, visite galpão, rádio, pátio e finalize K-1; medir cortes bruscos, câmera atravessando obstáculos, saves, áudio e combate.
- **P2:** diferenciação visual e sonora por ambiente: silhuetas, cenários mais marcantes, sinais de ataque, iluminação e identidade dos corredores do posto.
- **P2:** polimento do combate ao correr e atirar, tempo entre inimigos, reação a golpes, legibilidade dos combos e uso mais interessante dos terminais.

## Critério de aceite para próxima revisão
Completar Cap. 01 → ver resultado → continuar sem mudar dificuldade → intro do Caio → concluir Cap. 02, sem reset de créditos, documentos ou inventários; concluir a rota alternativa com mudança de dificuldade; nenhum crash/salto de câmera; manter FPS e acessibilidade. A certificação integral requer execução no navegador, não apenas testes de estado.
