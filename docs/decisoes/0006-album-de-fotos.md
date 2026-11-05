# ADR 0006 — Álbum de fotos: escolher as melhores, editar em lote e retocar

Data: 04/11/2026. Pedido do dono: o AfterShoot (instalado no PC dele) escolhe sozinho as melhores fotos de um ensaio,
edita todas no estilo do fotógrafo e retoca os retratos; "dá para fazer manualmente, mas gosto de como ele faz tudo
sozinho". O TakeOne ganha essas funções, com uma interface parecida, como uma frente a mais da edição de imagens. Este
documento é o plano (as partes, com a caixa marcada quando cada uma estiver pronta) e as decisões que o sustentam.

## De onde vem

- **AfterShoot 2.25.2**, analisado em 04/11/2026 com o REA, sem abrir o aplicativo e sem decifrar os modelos (que vêm
  cifrados). Os cinco relatórios (seleção, edição, outras ferramentas, fluxo e arquitetura, interface) ficam fora do
  repositório, em `REA/analise/aftershoot/`, como os do CapCut, do Cut.Pro e do OpusClip. Só a ideia, o fluxo e os
  números vêm dele; nada de código, ícones, ilustrações, textos, nomes de funções ou modelos.
- **TakeOne:** o editor de imagem inteiro (camadas, aba Cor com LUT 3D, "Melhorar", igualar a cor, retoque com
  pincéis, Objeto com MobileSAM e LaMa, remover e desfocar o fundo com o MODNet, preenchimento generativo, ampliar,
  Automatizar › Lote e Ações), o YuNet e a coleção `rostos`, as notas de nitidez, luz e tremor da montagem
  (`core/utils/qualidade.py`), a fila no Mongo com SSE, a ingestão de imagens com cópia leve, o envio tus, o kit de
  marca e o link de aprovação.

### O que o AfterShoot faz, resumido

| Parte | Como funciona lá |
|---|---|
| Arquitetura | Electron com a interface; um motor local em Rust (HTTP em 127.0.0.1, ~180 rotas, progresso por WebSocket com etapas) que roda os modelos em ONNX (DirectML, OpenVINO ou CPU); a revelação do RAW num visualizador WASM com WebGPU. Os perfis pessoais são treinados na nuvem. |
| Entrada | álbum "selecionar e editar" ou "retocar", com um gênero (casamento, retrato, família, esporte, escola, evento, recém-nascido...); fotos no lugar ou copiadas do cartão (com backup, pastas e nomes); catálogos de outros programas; pasta monitorada; câmera ligada. 37 formatos RAW, JPEG, PNG, HEIC, AVIF e TIFF; vídeo não. |
| Seleção | por foto: rostos, vetor do rosto, pose, foco do rosto, olhos fechados, olhar, emoção, desfoque da imagem, vetores da imagem, objetos e QR (escola). Depois: separa por intervalo de tempo, junta as parecidas por cosseno, divide grupos grandes por k-means, escolhe a melhor de cada grupo pela soma pesada por gênero e marca os destaques. Modos automático, assistido e manual; quantas ficam (de 10–20% a 50–70%, padrão 30–50%) ou um número exato; desfoque tolerante, moderado ou rígido; estrelas e cores por categoria (5★ verde, 4★ azul, 3★ amarelo, 2★ vermelho, 1★ roxo). |
| Telas da seleção | grade com pilhas de parecidas e a borda na cor do grupo; lupa com a tira do grupo e os rostos da foto (olho aberto/meio/fechado, nítido/macio/borrado); comparação de até 12 com zoom e arrasto juntos; tela cheia; pincel de notas; filtros por grupo, estrela (=, ≤, ≥), cor, pessoa, câmera, lente e orientação; gaveta do resultado à direita; atalhos (inclusive conjuntos que imitam outros programas). |
| Edição | um modelo prevê, foto a foto, uns 25 controles (temperatura, matiz, exposição, contraste, realces, sombras, brancos, pretos, textura, claridade, névoa, vibração, saturação, curva paramétrica, HSL de 8 cores, mistura P&B, nitidez e ruído); o resto do visual vem do preset mais usado. Perfil pessoal treinado com 2.500 a 50.000 fotos editadas; perfil "instantâneo" a partir de um preset, com um questionário de 3 luzes; estilos prontos, comparando até 3 na própria foto. Cada controle pode somar uma correção, ficar fixo ou desligado. Uma camada de consistência iguala fotos parecidas. Corte (6 tipos, proporções e orientação), endireitar e máscara do assunto automáticos. Corrigir uma e sincronizar nas outras. |
| Retoque | 11 categorias e ~35 controles de 0 a 100 (acne, manchas, sardas, rugas, olheiras, bolsas, olhos, dentes, brilho, dodge & burn, fios soltos, pescoço, papada, pele do corpo, roupa amassada, fiapos, pele de bebê), por grupo de pessoa, com pincel de incluir e excluir, predefinições e lote. Remover objeto com pincel, laço ou retângulo; achar e apagar distrações sozinho (placa de saída, extintor...); troca de fundo com sombra; redução de ruído com IA. |
| Saída | exportar original, JPEG (por qualidade ou tamanho máximo), PNG ou TIFF, com tamanho, marca d'água (texto ou imagem, até 5 predefinições), subpastas, nomes e divisão por nota, cor ou categoria; XMP ao lado do original; catálogos de outros programas; galeria para o cliente. |

## Fora do escopo, com o motivo

- Conta, planos, créditos, loja de estilos paga, telemetria, flags remotas e atualizador: o TakeOne é local e sem nada
  pago.
- Treinar na nuvem: o estilo pessoal é treinado no worker de CPU, no Nitro.
- Câmera ligada pelo USB: exigiria drivers nativos e o USB dentro do WSL. A pasta monitorada cobre o caso (o programa
  gratuito da marca da câmera grava na pasta e o TakeOne processa). Só se o dono pedir.
- Escrever em catálogos de outros programas: formato fechado e arriscado. O XMP ao lado da foto leva as notas e os
  ajustes.
- Impressão e venda de fotos pela galeria.

## Decisões técnicas

1. **O álbum tem coleções próprias, a foto continua uma mídia.** O álbum (`albuns`: nome e tipo do ensaio) e o que é
   dele em cada foto (`album_fotos`: a nota, a cor, a marcação, a pasta de origem e, depois, a categoria da IA e o grupo
   de parecidas) ficam fora do projeto, porque um ensaio tem milhares de fotos e cada tecla muda uma ou várias delas;
   o projeto inteiro com a versão seria salvo a cada nota. As fotos são as mídias da biblioteca de sempre (a ingestão,
   a cópia leve e a capa), então abrir uma foto no editor de imagem vale sem código novo. A foto enviada para o álbum
   leva `album_id` na mídia e fica fora da lista da biblioteca (o editor busca a biblioteca inteira e recarrega a cada
   ingestão: milhares de fotos de um ensaio pesariam em toda aba aberta); a ingestão dela leva o álbum no job, e a
   biblioteca não recarrega por ela. Tirar uma foto do álbum apaga a enviada para ele, a menos que um projeto, um modelo
   ou uma exportação a use (aí ela vai para a biblioteca); a que veio da biblioteca só sai do álbum. Os envios sobem 4
   de cada vez (antes, todos ao mesmo tempo).
2. **A análise é por mídia e fica guardada; a escolha é uma conta.** O worker mede cada foto uma vez (rostos e pontos
   do rosto, olhos, sorriso, pose, olhar, foco no rosto e geral, exposição e o vetor da imagem) e guarda numa coleção
   própria (`fotos_medidas`). Agrupar e escolher é uma conta sobre essas medidas (`core/modelos/escolha.py`, pura e
   com testes), então mudar o modo, a quantidade ou o rigor do desfoque refaz a escolha em segundos, sem rodar modelo
   nenhum. Ela roda na API, não no navegador: os vetores de milhares de fotos (384 números cada) não precisam ir para a
   aba, e o resultado vai direto para `album_fotos`.
3. **Os modelos são abertos e pequenos, na CPU.** YuNet (MIT, já usado) para os rostos; MediaPipe Face Landmarker
   (Apache-2.0: 478 pontos e as expressões, que dão olhos fechados, sorriso, pose e olhar); variância do laplaciano no
   recorte do rosto e na máscara do assunto para o foco, com o limiar calibrado pelo próprio álbum; histograma para a
   exposição; DINOv2 ViT-S/14 (Apache-2.0) para o vetor da imagem (parecidas, variedade e o estilo); SFace (Apache-2.0)
   para as pessoas. Ficam de fora o YOLO (AGPL), os pesos do InsightFace e os modelos de rosto treinados em bases não
   comerciais.
4. **O estilo prevê os controles da aba Cor.** Um estilo é um recurso do espaço com pares (foto → controles finais),
   vindos das fotos editadas no TakeOne e de arquivos XMP (os campos que têm par na aba Cor). Com poucas fotos, a média
   dos vizinhos mais parecidos no vetor da imagem ("parece com estas 5 fotos suas"); com mais de umas 300, um modelo de
   gradient boosting que prevê a diferença sobre o "Melhorar". Como o estilo só gera valores da aba Cor, a prévia e a
   exportação continuam saindo da mesma LUT 3D. Por cima do que o modelo prevê, cada controle tem correção, fixo ou
   desligado, e o estilo tem uma intensidade geral (que o AfterShoot não tem).
5. **O retoque é quase todo conta, sobre um mapa do rosto e do corpo.** Os pontos do Face Landmarker e as regiões do
   MediaPipe Selfie Multiclass (Apache-2.0: cabelo, pele do rosto, pele do corpo, roupa) viram máscaras por foto,
   guardadas como as de hoje. Pele (separação de frequências com o filtro guiado), manchas (diferença de gaussianas e
   Poisson, LaMa nas maiores), rugas e olheiras (média frequência nas regiões dos pontos), olhos e dentes (Lab nas
   regiões) e brilho são contas que o editor de imagem já tem em pedaços. Cada controle de 0 a 100 é um campo do clipe,
   e a prévia e a exportação saem do mesmo resultado, medido em números como sempre.
6. **A tela da seleção é do hub, a da foto é do editor de imagem.** A seleção trabalha em centenas de fotos (grade
   virtual, lupa, comparação), numa rota própria; abrir uma foto leva ao editor de imagem de sempre. Os tokens novos
   (as seis cores dos grupos, as cores dos rótulos, o véu e o vidro sobre a foto) entram no `globals.css` nos quatro
   temas.

## Para o dono decidir

- **RAW (decidido em 04/11/2026):** por agora, o JPEG que toda câmera grava dentro do RAW (serve para a grade, a
  seleção e a edição; o leitor dos contêineres é nosso). A revelação do RAW de verdade fica como melhoria futura, que o
  dono quer fazer: pede o LibRaw (LGPL ou CDDL, rodando como programa à parte, como o espeak-ng), o rawspeed (LGPL) ou o
  DNG SDK (licença da Adobe), e uma cópia leve de 16 bits que o compositor leia em ponto flutuante.
- **Ordem:** o dono decidiu em 04/11/2026 terminar antes a onda 15 (personagens); esta é a onda 16.
- **Retoque de pele e rosto:** o plano o deixava de fora, por estar perto do que o dono tinha vetado; ao pedir as
  funções do AfterShoot (que incluem o retoque) em 04/11/2026, o dono o trouxe para dentro. Os modelos de rosto com
  licença arriscada continuam de fora (decisão técnica 5).

## Partes

- [x] 16.1 Álbum de fotos: as coleções, a página no hub, enviar fotos ou a pasta inteira pelo navegador (com as
  subpastas, também arrastando), o EXIF na ingestão (a hora da foto, a câmera, a lente e a exposição), a grade virtual
  com a capa, estrelas, cores, marcação, filtros, ordem, a lupa e os atalhos.
- [x] 16.1b Fotos "no lugar", de uma pasta do Nitro montada só para leitura (sem copiar), e o RAW pelo JPEG embutido.
- [x] 16.2 Medir cada foto: o job do worker de CPU com rostos, pontos do rosto, olhos, sorriso, pose, olhar, foco,
  exposição e o vetor da imagem, guardados por mídia, com o progresso por etapas.
- [x] 16.3 Escolher as melhores: grupos por tempo e semelhança, a nota por gênero, a melhor de cada grupo, destaques e
  "talvez"; os modos automático, assistido e manual; quantas ficam ou um número exato; o rigor do desfoque e dos olhos;
  estrelas e cores por categoria. Medido contra as escolhas feitas à mão pelo dono num ensaio de verdade (falta:
  o ensaio e as escolhas do dono; testado com rajadas montadas de fotos reais).
- [x] 16.4 As vistas: lupa com a tira do grupo e os rostos da foto, comparação de até 12 com zoom e arrasto juntos,
  tela cheia, pincel de notas, gaveta do resultado, pessoas (SFace) e o filtro "alguma" ou "todas".
- [x] 16.5 Editar em lote: o "Melhorar", as LUTs, os filtros e o igualar a cor aplicados às escolhidas; sincronizar os
  ajustes de uma nas outras por grupos; antes e depois; corte e endireitar automáticos (rosto, assunto e linhas).
- [x] 16.6 Estilos: o estilo instantâneo (de um XMP, de uma LUT ou de um filtro, mais o "Melhorar" e o questionário de
  3 luzes), comparar até 3 na própria foto, o ajuste controle a controle e a intensidade, e a consistência entre fotos
  parecidas.
- [x] 16.7 Estilo pessoal: os pares das fotos editadas no TakeOne e de XMP, os vizinhos mais parecidos e depois o
  gradient boosting, treinados no worker, com "ensinar a correção" ao corrigir uma foto.
- [ ] 16.8 Retoque de retrato: o mapa do rosto e do corpo e os controles (pele, manchas, sardas, rugas, olheiras,
  olhos, dentes, brilho, uniformizar e contornar, pescoço, roupa), por pessoa, com o pincel de incluir e excluir,
  predefinições e lote.
- [ ] 16.9 Mais IA: achar e apagar distrações (um detector aberto de vocabulário livre com o MobileSAM e o LaMa,
  protegendo a pessoa), troca de fundo com sombra em lote e redução de ruído com IA (SCUNet ou NAFNet).
- [ ] 16.10 Saída: exportar as escolhidas com subpastas, nomes, divisão por nota, cor ou categoria, tamanho máximo do
  arquivo e marca d'água (texto ou o logo do kit, com predefinições); o XMP ao lado do original; a galeria do cliente
  pelo link de aprovação; e a pasta monitorada que aplica uma ação do espaço.
