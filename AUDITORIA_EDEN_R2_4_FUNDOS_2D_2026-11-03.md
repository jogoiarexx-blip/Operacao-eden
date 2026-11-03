# Operação Éden — Auditoria R2.4: fundos ilustrados 2D nas duas fases
**Data:** 03/11/2026 · **Base:** R2.3 · **Alteração:** matte painting leve fora dos mapas.

## Escopo realizado

| Componente | R2.3 (antes) | R2.4 (depois) | Efeito |
| --- | --- | --- | --- |
| Cap. 01 — Lia | Limites abruptos do terreno/procedural e névoa; ausência de panorama ilustrado | Pintura 2D de serras, floresta úmida, copas e árvores distantes | Profundidade cênica sem adicionar árvores reais |
| Cap. 02 — Caio | Muros, contêineres e névoa com área externa curta | Pintura 2D de galpões, instalações, torres, antenas, cercas e morros ao longe | Base parece maior que a área jogável, sem interiores falsos visitáveis |
| Carga gráfica | Sem texturas panorâmicas dedicadas | Duas imagens CanvasTexture RGBA 1024×256 por capítulo, compartilhadas em 8 planos; preset baixo mostra 4 | Máximo aproximado de 2,7 MiB de VRAM incluindo mipmaps e até 8 draw calls potenciais |
| Iluminação | Luzes/shadows do jogo existentes | MeshBasicMaterial sem luzes/shadows nos painéis, transparência e névoa pintadas no desenho | Mantém efeitos originais e evita cálculos de iluminação nos panoramas |
| Colisão | Limites do CollisionWorld definem caminho | Planos colocados 15 m e 29 m *além* de `data.bounds`, sem `world.add` | Nenhuma hitbox nova e não é possível chegar à pintura |
| CPU e rede | Cenário procedural carregado por capítulo | Imagens geradas uma vez ao entrar na fase e atualizadas só na GPU | Nenhuma requisição de textura externa nem loop de pintura por frame |
| Troca de fase | `SectorScenery.dispose` libera malhas e materiais | Também libera explicitamente as duas texturas usadas nas imagens | Evita carregar as imagens das duas fases simultaneamente |
| Persistência | Flags e saves de campanha existentes | Sem campo novo no save, alteração de IA, lógica de zonas ou spawn | Compatibilidade preservada |

## Design

- **Imagem principal** (`far`): horizonte de mata/montanhas no Cap. 01; silhueta industrial no Cap. 02. Alpha suave no topo para fundir com o céu.
- **Imagem próxima** (`near`): copas e árvores ou cerca e infraestrutura periférica; alpha mais forte na base. O plano não recebe nem lança sombras.
- **Geometria de suporte**: quatro planos orientados para o interior do mapa por camada; textura repetida nas quatro direções sem baixar quatro arquivos diferentes.
- **Qualidade**: todos os presets recebem o panorama distante. `low` oculta os quatro painéis mais próximos.
- **Integração**: novo `src/world/BackdropImpostors.js` usado em `src/world/SectorScenery.js`; mesmo recurso já embutido no `index.html` servido pelo GitHub Pages.

## Arquivos publicados

- `src/world/BackdropImpostors.js` (novo)
- `src/world/SectorScenery.js` (carregar por capítulo, ajustar qualidade, descartar)
- `index.html` (mesma função embutida no standalone do Pages)
- `tests/backdrop-impostors.test.js` (layouts, imagens e qualidade, com Canvas simulado)
- `scripts/e2e-backdrops.mjs` (Chromium, screenshot e proteção contra regressão de saves/colisores)
- `.github/workflows/eden-ci.yml` (executa o novo teste antes de publicar)
- `README.md` e este relatório

## Testes realmente reproduzidos nesta sessão

| Verificação | Resultado |
| --- | --- |
| Dados puros de posicionamento dos painéis nas duas fases (8 por fase) | **PASSOU** |
| `CanvasTexture` simuladas: 2 imagens 1024×256 por capítulo, 8 malhas com material compartilhado | **PASSOU** |
| Verificação dos oito centros de painéis fora dos limites de ambos os mapas | **PASSOU** |
| Qualidade baixo: 4 planos visíveis; qualidade média/alta: 8 | **PASSOU** |
| Descarte das texturas ao mudar/fechar capítulo | **PASSOU** na simulação |
| Nenhuma alteração no JSON de cada fase / em flags de save | **PASSOU** para os dados de cenário |
| Parse sintático do JS embutido em `index.html` após a atualização | **PASSOU** |
| Presença do código de pintura/arquitetura em fonte e bundle standalone | **PASSOU** |
| `npm test` do repositório, com Three.js real no Node | **NÃO EXECUTADO NESTA SESSÃO** |
| Chromium Playwright com texturas reais, WebGL e screenshots | **NÃO EXECUTADO NESTA SESSÃO** — automatizado para o GitHub Actions |
| Medição real de FPS, memória de GPU e duas campanhas completas | **NÃO CERTIFICADO** |

## Limitações e próximos passos

1. **P0:** verificar resultado do novo Playwright em GitHub Actions e testar se os fundos aparecem nos quatro pontos cardeais, inclusive nas bordas e atrás de construções.
2. **P0:** validar que a publicação automática recompile do `dev.html` e substitua o `index.html` sem regressões após passar o QA.
3. **P1:** ajustar contraste/escala das imagens conforme screenshots reais dos capítulos — os panoramas foram pintados com cores estilizadas, não são fotos nem capturas autênticas do Dino Crisis.
4. **P1:** medir draw calls e FPS em baixo/médio/alto antes/depois da R2.4; risco principal: até oito planos transparentes, embora pequenos.
5. **P2:** se desejado, substituir a pintura Canvas por 2 WebP autorais otimizados por capítulo mantendo exatamente a mesma API e o mesmo posicionamento.

**Conclusão:** as duas fases receberam fundos 2D estáticos inacessíveis, compatíveis com o estilo do jogo e com um orçamento gráfico controlado. A implantação em fonte e no HTML da branch foi feita; sua aparência e performance em sessão real de jogo ainda dependem da execução Chromium.
