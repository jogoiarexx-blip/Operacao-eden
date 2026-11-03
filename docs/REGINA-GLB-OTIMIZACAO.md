# Regina — integração GLB otimizado (Operação Éden)

## Resultado do processamento

- Origem: `regina pronta pro dino.glb` — 14.253.752 bytes.
- Entrega: `public/assets/characters/regina-optimized.glb` — 2.235.912 bytes (**84,3% menor**).
- A malha permanece com 16.810 vértices, 10.317 triângulos e 85 ossos.
- Os 17 clips `DC2_P000_Animacao_Slot_*_TESTE` continuam dentro do GLB. São **experimentais**, por isso o jogo não assume mapeamento desconhecido.
- Normal: 2048² PNG → 1024² JPEG alta qualidade; cor: 2048² PNG → 1024² JPEG; metálico/rugosidade: 2048² PNG → 512² PNG sem perdas.
- O script `tools/optimize-regina.py` permite reproduzir o resultado; requer Pillow.

## Integração com o jogo

- Ao abrir o jogo, `PlayerView` inicia carregamento assíncrono, sem bloquear o menu.
- A malha Regina substitui **visualmente** Lia enquanto a Lia for a personagem controlada. Mantém nomes, inventários, puzzles, checkpoints, câmera, combate e saves originais.
- Caio permanece com a malha procedural antiga.
- O fallback procedural continua funcional em caso de falha de rede / WebGL / GLB inexistente.
- `ReginaRig` escala a personagem para aproximadamente 1,70 m e alinha a sola ao piso.
- Posição e rotação globais ainda são controladas pelo `Player` e `PlayerView`; animações não introduzem deslocamento independente que atravesse os colisores.
- Controlador normalizado para *idle*, *walk*, *run*, *aim*, *aimWalk*, *shoot*, *reload*, *use*, *dodge*, *hurt* e *death*, com transições graduais.
- Arma e clarão de tiro ancorados ao osso `RightHandWeaponSocket`; efeito externo original continua para o Caio.
- Em distâncias de câmera pequenas, opacidade gradual. Renderização esquelética mantém castShadow.

## Testes e limitações

- Foi validado o formato GLB, o comprimento e os limites dos bufferViews, presença do skin e integridade dos clips após recompressão; sintaxe dos módulos JS verificada.
- Requer compilação com `npm ci && npm test && npm run build:single` para QA integral, disponível no GitHub Actions.
- Não foi executada uma sessão humana de gameplay com a Regina em todas as ações; **encaixe da arma, orientação do rosto e rig em movimento precisam de inspeção visual**, sobretudo no mobile.
- `index.html` de desenvolvimento é a origem do Vite. **Publicação GitHub Pages** deve incluir `index.html` compilado de `dist-single/index.html` na raiz, além do conteúdo do diretório `public/` em `assets/`, preservando arquivos de código e outros recursos do projeto.
- O GLB é carregado por URL relativa: `assets/characters/regina-optimized.glb`; abrir HTML via `file://` pode bloquear o carregamento por CORS; executar em servidor local ou no Pages.

## Conferência funcional a executar

1. Abrir o Capítulo 01 e inspecionar pés no chão, rosto olhando à frente, sombras, armas e distância da câmera.
2. Caminhar, correr e caminhar mirando; verificar movimentação sem deslizamento excessivo.
3. Disparar pistola e escopeta, recarregar e cancelar recarga com esquiva; observar clarão no cano.
4. Usar medkit, receber dano, morrer e voltar do checkpoint.
5. Entrar no Capítulo 02 e conferir se Caio permanece diferente de Regina.
6. Verificar qualidade baixa em celular e sem carregar GLB (fallback procedural).
