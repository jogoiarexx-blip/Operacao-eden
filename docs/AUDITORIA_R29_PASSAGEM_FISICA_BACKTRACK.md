# Operação Éden · R2.9 — Ligação caminhável entre os capítulos

**Data:** 03/11/2026  
**Base:** R2.8, Capítulo 01 (Selva Norte/Lia) ⇄ Capítulo 02 (Posto Norte/Caio).

## Auditoria antes/depois

| Subsistema | Antes (R2.8) | Implementado (R2.9) |
|---|---|---|
| Ligação entre capítulos | Dois pontos de interação; F teletransporta ao mapa vizinho | Dois trechos **caminháveis** correspondentes, com piso de serviço, postes, sinalização e barreiras laterais; alcançar o fim atravessa automaticamente |
| Colisão | Interação textual sem continuidade física | Corredor central livre, duas barreiras laterais `move`/ `bullet`/ `camera` por capítulo; portão narrativo original continua determinando a primeira passagem |
| Controles | F obrigatório para revisitas | Travessia caminhando; F preservado para teclado/gamepad e compatibilidade de saves antigos |
| Segurança narrativa | Backtracking bloqueado até Capítulo 01 concluído | Regra preservada; no primeiro capítulo, a passagem segue dependente da missão. A chegada de um mapa fica **antes** da linha de travessia, evitando retorno automático involuntário |
| Progresso | Cache de um cenário estático inativo e restauro de NPCs/flags | Mesma persistência, checkpoints de entrada e combate; não repete cutscenes, nem reviva chefes |
| Arte | Cerca/portão e entradas sem linguagem visual correspondente | Peças geométricas do mesmo padrão, medidas e paleta nos dois lados; iluminação de acesso muda de âmbar para verde quando liberado |

## Código

- `src/world/ServicePassage.js`: duas pontas da estrada de serviço, materiais e geometrias low-poly leves, colisão simplificada e gatilho puro da travessia.
- `src/world/SectorScenery.js`: corredor integrado ao mapa e descartado pelo mesmo ciclo de recursos do cenário; reutilizado com o cache R2.8.
- `src/Game.js`: habilitação dinâmica após concluir o Capítulo 01; `_stepBacktrack` aceita cruzar o corredor sem interação e continua aceitando F.
- `tests/service-passage.test.js`: testes de travessia bloqueada, limites da faixa, equivalência dos acessos e chegada sem loop de teleportes.
- `scripts/e2e-service-passage.mjs`: playtest no Chromium caminhando com o `Player.step` real do Posto Norte à linha de travessia, retornando da Selva Norte, depois exercitando o comando F; valida persistência do save e cache.
- `.github/workflows/eden-ci.yml`: novo playtest executado antes do deploy de produção.

## Reprodução

```bash
npm ci
npm test
npm run build:single
npx playwright install --with-deps chromium
npx vite preview --config vite.single.config.js --host 127.0.0.1 --port 4177
URL='http://127.0.0.1:4177/?debug=1' SHOT_DIR=qa-shots node scripts/e2e-service-passage.mjs
```

## Limites e próxima prioridade

1. **A R2.9 ainda usa dois mapas separados.** A estrada compartilhada torna a passagem caminhável e visualmente correspondente, mas a engine troca de cena no fim; não há um mapa único de 160+ metros com IA e câmera fluindo entre ambos. O cache R2.8 evita reconstrução na revisita.
2. A geometria do corredor é procedural, sem um GLB novo; a colisão é aproximada, com duas barreiras laterais e o portão já existente.
3. O modelo de transição conserva a alternância narrativa de protagonistas Lia/Caio. Um jogo com troca livre de personagens em qualquer mapa exigiria revisão de missões, itens, diálogos e cutscenes.
4. O playtest automatizado valida o fluxo e as coordenadas, mas não substitui uma jogada humana integral com controle ou touch, nem medições de FPS/memória em GPU real.
5. Próximo avanço recomendado: pré-carregar recursos com orçamento por quadro e costurar caminhos externos em uma planta-mestre, gradualmente migrando os capítulos para um mundo com múltiplos setores e streaming real de colisão/IA.

**Status do QA:** consultar o GitHub Actions da revisão final antes de afirmar aprovação; implantação do Pages só é confirmada após a conclusão do workflow e do HTML publicado.
