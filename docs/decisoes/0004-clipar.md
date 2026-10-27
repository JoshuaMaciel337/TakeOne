# ADR 0004 — Clipar: de um vídeo longo (ou de um link) aos cortes prontos

Data: 26/10/2026. Pedido do dono: colar o link de um vídeo do YouTube (ou enviar o arquivo), transcrever, achar os
melhores momentos e sair com os cortes já cortados, legendados e editados conforme o conteúdo, como no Cut.Pro. Este
documento é o plano (as partes, com a caixa marcada quando cada uma estiver pronta) e as decisões que o sustentam.

## De onde vem

- **Cut.Pro** e **OpusClip**, vistos em 26/10/2026 com as contas do dono e o mesmo vídeo de teste (uma palestra TEDx
  de 10 min em português; no OpusClip, que só aceita link no plano pago, o vídeo de exemplo do HolyCut repetido quatro
  vezes). Os relatórios ficam fora do repositório, com as capturas, como os do REA. O que eles fazem e os números estão
  resumidos abaixo; só a ideia, o fluxo e os números vêm deles, nada de código, ícones, textos, músicas ou modelos.
- **HolyCut:** o importador de links (yt-dlp com o Deno, que o YouTube passou a exigir) e o sugeridor de cortes da
  pregação (a fala lida em janelas de 8 min com 1 min de sobra, o modelo propondo de 1 a 3 cortes por janela, o corte
  levado até o assunto fechar, só ficando o que se apoia na fala). Entram adaptados, sem as partes de igreja.
- **TakeOne:** a transcrição com o tempo de cada palavra (faster-whisper), a limpeza de pausas, hesitações e retakes, o
  "Criar automaticamente" (título, tarja, zooms e chamada pelo Qwen3 local), as legendas da fala com destaque e
  palavras-chave, o "Seguir o rosto", a nota de qualidade de cada instante (montagem), os modelos de projeto, o kit de
  marca, o texto em fala e a exportação. O Clipar é, em boa parte, esses pedaços em sequência sobre um vídeo longo.

### O que os dois fazem, em números

| | Cut.Pro | OpusClip |
|---|---|---|
| Entrada | link (YouTube, Twitch, Kick) ou arquivo; live em lotes | arquivo ou Drive no grátis; link só no pago |
| Antes de gerar | estratégia (prontas ou própria: "o que buscar" e "estilo do título" em texto curto), faixa de duração, trecho a analisar, template, idioma e tradução | idioma, .srt próprio, recortar ou não, só fala ou fala e imagem, gênero (com "igreja"), faixa de duração, título e zoom automáticos, "incluir momentos" em texto livre, trecho a analisar, estilo de legenda, modelo de marca |
| Tempo | 171 s para 10 min | 255 s para 3 min |
| Resultado | 12 cortes de 30 a 54 s cobrindo quase o vídeo todo (cada ideia vira um corte), nota de 1 a 10 sem os critérios | 5 clipes; nota de 0 a 100 com gancho, fluxo, valor e tendência de A a F, cada uma com uma frase; categoria; trechos não vizinhos juntos num clipe; aviso de propaganda |
| Defeito visto | o pedido de 2 ações no chat precisou de 2 desfazer; o enquadramento do cartão caiu na tela atrás do palestrante | não percebeu o mesmo trecho repetido quatro vezes (4 clipes iguais com notas de 87 a 71); começou a exportar e a ampliar no clique, sem confirmar, e gastou créditos |
| Editor do corte | +5 s nas pontas, remover pausas, transcrição em texto e em segmentos, chat com sugestões, reenquadrar em quem fala, retenção (vídeo de distração, quadro do original, barra de progresso), capa, seis proporções, salvar como template | transcrição por capítulos, estender escolhendo na transcrição do original, limpeza com contagem, layout por cena (preencher, caber, dividido, três, quatro, tela e rosto), fundo da cena, rastreador manual, 16 interruptores de IA, ~45 estilos de legenda, gancho narrado |
| Lote | template em todos os cortes; exportar e publicar | modelo de marca antes de enviar; baixar e agendar em massa |
| Conversa | no editor, 9 a 21 s por pedido | outro produto, com perguntas em botões, etapas com estado e resumo do que mudou; 27 min para 46 s |

## Fora do escopo, com o motivo

- Dublagem, troca de personagem, personas, avatar e correção de contato visual: vetados pelo dono.
- Geração de vídeo paga (o Cut.Pro usa um modelo pago), campeonatos de cortes, métricas das redes: sem custo por uso e
  fora do produto.
- Música e efeitos sonoros comerciais: só com licença (o banco da Pixabay depende da chave do dono).
- Publicar e agendar nas redes: depende do dono (anotado no plano). Até lá, o Clipar termina no download.
- Clipar uma live enquanto ela acontece: fica para depois (a live pode ser clipada quando termina, como o HolyCut já
  faz).

## Decisões técnicas

1. **A busca é dos cortes, a edição é do editor.** O worker de GPU acha os momentos (transcrição e LLM); o projeto de
   cada corte é montado pelos mesmos comandos do editor (`lib/projeto`), como no "Criar automaticamente". Assim o
   corte sai editável na linha do tempo, com desfazer, e a prévia e o render continuam saindo da mesma conta. Para a
   montagem rodar sem uma aba aberta (a automação da parte 14.9), o mesmo código TS roda no Node (ele já roda nos
   testes pelo `node --test`), num processo pequeno do worker; antes disso, a página do Clipar monta os projetos.
2. **O modelo só aponta frases.** A fala vai ao Qwen3 numerada por frase (não por palavra: 8 min de fala são umas 1200
   palavras, que numeradas passariam do contexto de 8.192; por frase são umas 80 linhas), e a resposta, presa a um
   esquema JSON, aponta frases de começo e de fim (até 3 trechos não vizinhos), o título, a categoria, o resumo e as
   quatro notas com a frase de cada uma. O tempo sai da transcrição. Uma conferência (como `conferir_plano` e o
   `validar_cortes` do HolyCut) descarta o que não se sustenta: trecho fora da fala, curto ou longo demais para a faixa
   pedida, que começa no meio de uma frase ou termina antes do assunto fechar (as pausas e a pontuação da fala), que
   começa por uma referência solta ("isso", "como eu disse") e título que promete o que não está no trecho.
3. **A nota é medida, não só opinada.** As quatro notas do modelo (gancho, fluxo, valor e autonomia, "se entende
   sozinho", no lugar da "tendência", que pediria dados de fora) entram junto de medidas do próprio vídeo: o ritmo e a
   energia da fala nos níveis da ingestão, um rosto visível (o detector do "Seguir o rosto"), a nitidez e a firmeza (a
   nota da montagem). A nota de 0 a 100 é a combinação, e o painel mostra as partes, com a frase do modelo em cada uma.
4. **Nada repetido.** Os candidatos das janelas que se sobrepõem são juntados pelo tempo (os que dividem mais da metade
   ficam o melhor), e o conteúdo repetido é achado pelo texto (os mesmos trigramas de palavras, a partir de uma
   parecença medida). O vídeo de exemplo repetido quatro vezes, que o OpusClip transformou em 4 clipes iguais, é o
   teste.
5. **Baixar pelo link é o importador do HolyCut, genérico.** O yt-dlp (Unlicense) com o Deno (MIT), na imagem do worker
   de CPU, lê os dados do vídeo antes (título, canal, duração, miniatura), para a página mostrar o que vai entrar, e baixa
   até 1080p. Depois o vídeo segue como um envio (a ingestão). A tela lembra que só se clipa o que é da pessoa ou
   autorizado.
6. **Sem crédito, com tempo estimado.** Não há custo por uso; no lugar dos créditos, a página mostra quanto vai demorar
   (pelas medidas do Nitro: o download, a transcrição e o LLM por minuto de fala) e a fila de GPU que já está na frente.
   Nada que demora começa sem a pessoa pedir (o defeito do OpusClip).
7. **A IA escolhe entre o que o TakeOne já tem.** O corte montado não inventa elementos: o Qwen3 aponta, para cada
   corte, o estilo de legenda e as palavras de ênfase de cada legenda, o gancho de abertura, os zooms, os emojis e qual
   modelo da biblioteca de animações (títulos, tarjas, chamadas, adesivos, números) entra onde, preenchendo os campos,
   como o "Descreva a animação" já faz. O modelo de corte (14.6) diz o que pode entrar; a IA só escolhe e preenche.
8. **Legendas animadas desenhadas por código, iguais na prévia e no vídeo.** As legendas de hoje são um PNG do servidor
   com 3 fontes e 6 estilos: não fazem o estilo editorial dos pacotes de legenda para redes (cada palavra com o tamanho,
   a fonte, a cor e a entrada dela: a palavra de ênfase enorme, um trecho em serifada itálica, os conectivos pequenos,
   as linhas desencontradas, a digitação com cursor, as caixas de cor atrás das palavras, o número contando). Uma
   legenda animada passa a ser desenhada por uma função do tempo em TypeScript (Canvas 2D, com as fontes livres da
   biblioteca pelo fontkit, como o texto do editor de imagem), a partir das palavras com o tempo de cada uma, do papel
   de cada palavra (ênfase, apoio, conectivo, número) e do estilo. A prévia chama a função a cada quadro; o worker roda
   o mesmo código no Chromium que já grava as animações em HTML e grava a trilha num vídeo de cor e num de
   transparência, guardado pelo resumo das palavras e do estilo. Assim a prévia e o render saem do mesmo código, e a
   diferença é medida como sempre.
9. **Desfazer o pedido inteiro.** O pedido do chat vira uma lista de comandos que entra como um passo só do histórico
   (um comando composto), que é o que o Cut.Pro promete e não cumpre.

## As partes

Cada parte termina testada no navegador (e no Nitro, onde há modelo), com o que foi medido escrito no CLAUDE.md.

- [x] **14.1 Entrada.** O "Clipar" no hub (menu Criar e página inicial). Colar o link (YouTube, Vimeo, Twitch, Drive e
  os outros que o yt-dlp lê) ou enviar o arquivo; os dados do vídeo antes de confirmar; a tarefa de importar (do
  HolyCut, sem o monitor da igreja) com o progresso; o aviso de direitos. Medir: um vídeo de 10 min e um de 1 h
  baixados no Nitro, com o tempo; um link privado ou removido dando a mensagem certa.
- [x] **14.2 A página de opções.** Estratégias prontas (ganchos rápidos, humor, ideia completa de podcast, aula,
  entrevista, pregação) e a própria (o que buscar e o estilo do título, em texto curto, guardadas no espaço); o gênero;
  a faixa de duração (menos de 30 s, 30 a 59 s, 60 a 89 s, 90 s a 3 min, 3 a 5 min, ou livre); o trecho a analisar
  (duas pontas sobre a forma de onda); o idioma; "incluir momentos" em texto livre; um .srt próprio no lugar da
  transcrição; o formato (9:16, 1:1, 4:5, 16:9); o modelo de corte (14.6); quantos cortes, no máximo; e o tempo
  estimado. "Salvar como padrão".
- [ ] **14.3 Achar os cortes.** A tarefa no worker de GPU: a transcrição (a que já existe, ou a do .srt), as frases e
  as pausas, as janelas, o Qwen3 por janela com o esquema, a conferência, as medidas, a junção e o corte do que se
  repete, a nota e a ordem, o aviso de propaganda ("link na descrição", "cupom", "comenta..."), e a coleção `clipagens`
  (a submissão, as opções, o estado e os cortes). Medir: no TEDx de teste, o tempo no Nitro (meta: menos de 5 min do
  link aos cortes), nenhum corte começando ou acabando no meio de uma frase, a comparação com os 12 cortes do Cut.Pro
  no mesmo vídeo (quantos dos nossos melhores coincidem com os dele de nota 8 a 10) e o vídeo repetido quatro vezes
  dando um corte só; e mais dois vídeos de tipos diferentes (entrevista com duas pessoas e aula).
- [ ] **14.4 A lista de cortes.** Cartões em pé com a prévia já editada (uma prévia tocando de cada vez, ao passar o
  mouse), a nota e as quatro partes com a explicação, a duração, o título com as palavras de foco, o resumo, a
  categoria, os trechos do original e os avisos (propaganda, parecido com outro); grade e lista; ordenar (nota, ordem
  do vídeo, mais longos, mais curtos), filtrar (gostei, não gostei, duração) e buscar nas falas; gostei e não gostei,
  guardados (14.10 usa); selecionar em massa; abrir no editor, exportar, baixar o .srt, duplicar, apagar, "parte 2" (o
  corte que continua a ideia); "Recriar com outras opções" sem transcrever de novo.
- [ ] **14.5 O corte montado.** Cada corte vira um projeto de vídeo no formato pedido: os trechos da mídia original
  (sem copiar o arquivo), a limpeza de pausas e hesitações (ligável), as legendas da fala no estilo escolhido (os 6 de
  hoje ou as animadas da 14.11, com a palavra falada destacada e as palavras de ênfase escolhidas pela IA), o título de abertura com as palavras de foco nos primeiros segundos,
  o reenquadramento (o "Seguir o rosto" no formato em pé), zooms curtos nas frases fortes (o mesmo pedido do "Criar
  automaticamente", agora no trecho do corte), o kit de marca e o modelo de corte. Medir: prévia e exportação no
  Chrome nos níveis de sempre, dentro dos zooms e das legendas.
- [ ] **14.6 Modelos de corte.** Um modelo de corte é uma receita, não uma linha do tempo fixa: o layout, o estilo da
  legenda (e onde ela fica), o título (estilo e duração), o logo e a chamada, a abertura e o encerramento, a música
  (com licença), a barra de progresso e os interruptores (limpar pausas, zooms, emojis, palavras-chave). Salvar o corte
  aberto como modelo de corte; escolher antes de gerar ou aplicar a todos os cortes de uma vez (num passo de cada
  projeto). Três prontos desenhados aqui.
- [ ] **14.7 O editor do corte.** No editor de vídeo, quando o projeto vem de um corte: estender pelo original (+5 s
  em cada ponta e a transcrição inteira do original para escolher o trecho), a transcrição em segmentos (as linhas da
  legenda como fichas, para dividir, juntar e ajustar o tempo), o layout por cena para o formato em pé (preencher com o
  rosto, caber com o fundo desfocado da própria imagem, dividido em dois para duas pessoas, tela e rosto) e o
  rastreador manual por cena. Medir: um vídeo deitado com duas pessoas no layout dividido, prévia e exportação.
- [ ] **14.8 Retenção e extras.** Barra de progresso; o quadro do original numa caixa (início, meio, fim ou sorteado);
  uma caixa com um vídeo de distração da biblioteca da pessoa; emoji automático nas legendas (o LLM escolhe, a fonte de
  emoji do servidor desenha); o gancho de locução (uma frase escrita pelo LLM e falada pelo Kokoro, com o volume do
  original abaixando); a capa do corte (o quadro atual ou uma imagem, baixada junto); censura de palavras (uma lista do
  espaço, com um bipe ou o silêncio) e o vocabulário da marca (nomes que a transcrição deve acertar, passados ao Whisper
  como dica).
- [ ] **14.9 Saída e automação.** Exportar vários cortes de uma vez pela fila (o render de sempre), baixar tudo num ZIP,
  e as legendas em .srt e .vtt; o XML de intercâmbio por corte. A montagem no Node (decisão 1) e as automações: "quando
  eu colar um link", "vídeo novo no canal" (o monitor do feed do HolyCut, genérico) com o modelo de corte padrão, e "no
  horário". A publicação fica esperando o dono.
- [ ] **14.10 Conversa no editor.** (Adiantada: o campo, o plano, as perguntas, o passo único e a medida dos 30
  pedidos estão prontos, e o mesmo pedido vale para todos os cortes na página de opções; falta o gosto do espaço.) Um campo "peça uma edição" no editor de vídeo: o Qwen3 traduz o pedido numa lista
  de ações de um conjunto fechado (legenda maior, menor, de outra cor ou outro estilo; título; zoom aqui; reenquadrar
  em quem fala; tirar as pausas; cortar o trecho em que se fala de X; trocar o formato; abaixar a música), mostra o
  plano e pergunta com botões quando falta algo, aplica num passo só do desfazer e diz o que mudou e o que não deu. Os
  gostei e não gostei da lista entram aqui e na 14.3 como exemplos do gosto do espaço. Medir: uma lista de 30 pedidos
  comuns, com quantos saem certos.

- [ ] **14.11 Biblioteca de legendas animadas e ganchos.** O motor da decisão 8 e uma biblioteca desenhada aqui, no
  estilo dos pacotes de legenda para redes (só a ideia, sem copiar nenhum): umas 40 legendas animadas (editorial com
  tamanhos e fontes misturados, ênfase gigante, serifada itálica de apoio, palavra por palavra com pulo, karaokê em
  caixa, caixas de cor atrás das palavras, digitação com cursor, número contando, linhas desencontradas, empilhada,
  néon, contorno grosso, com emoji) e uns 15 ganchos de abertura (o título digitado, as palavras em caixas coloridas, o
  número grande, a foto num cartão com a borda arredondada, ícones girando em volta, a tela tingida numa cor). Os papéis
  das palavras saem do LLM (a ênfase de cada legenda, como as palavras-chave de hoje) e de regras (números, conectivos).
  As cores vêm do kit de marca. Cada estilo tem a miniatura tocando no painel, como as animações. Medir: prévia e
  exportação no Chrome a menos de 4 níveis em 255 no meio das animações das palavras, e o tempo de gravar a trilha de um
  corte de 60 s no Nitro.

- [ ] **14.12 O modelo de edição de pregação.** O dono mandou um "antes e depois" de 18,5 s de um corte de pregação
  editado à mão (analisado quadro a quadro em 27/10/2026): o pregador mais perto e com a cor fria de cinema, a legenda
  editorial palavra a palavra (serifada condensada em caixa alta, a palavra forte em itálico dourado), trechos com uma
  palavra por vez, a voz de rádio só na frase de abertura, um corte ou um efeito a cada 1 a 2 s (flash branco com o
  clique de câmera, clarão de luz, whoosh), um gráfico para cada ideia forte (o coração que se abre e solta os
  pecados, a cabeça com o cérebro e "MENTE"), imagens de apoio de banco (alguém lendo a Bíblia, escrevendo o
  devocional), a música de violoncelo por baixo e a cartela final em duas partes ("MENTIRA / SAI"). As partes, nesta
  ordem, cada uma testada antes da seguinte:
  - a) **Legendas animadas** (o motor da decisão 8 e os primeiros estilos da 14.11): a trilha das palavras com o tempo
    e o papel de cada uma, desenhada em Canvas 2D com as fontes livres da biblioteca e gravada pelo worker em cor e
    transparência, como as animações em HTML (a prévia toca o mesmo vídeo que o render usa). Estilos editorial, uma
    palavra por vez, minúsculas, palavra pulando, caixa na palavra falada, caixas coloridas, digitação, contorno grosso
    e néon. **Pronta (27/10/2026):** a trilha sai das legendas do projeto (o tempo de cada palavra e as
    palavras-chave), pela seção Animada da ferramenta Legendas ou pela "Legenda animada" da página de opções do
    Clipar; ela entra por cima e a faixa das legendas fica escondida. 60 s de fala gravam em 105 s no Nitro (três
    processos, só a faixa das linhas fotografada e os quadros parados repetidos); prévia e exportação a 2,5–2,8
    níveis em 255 no meio da entrada das palavras.
  - b) **Cartela final** de frase de impacto (duas partes, a segunda grande, sobre a grade escura) e outros ganchos.
    **Pronta (27/10/2026):** a cartela de impacto e dois ganchos (tela tingida e caixas) na biblioteca de animações.
  - c) **Transições Flash e Clarão** (o branco de um quadro e o brilho de luz que passa), na prévia e no render.
    **Prontas (27/10/2026):** corte seco com uma camada de ajuste por cima na janela da transição (o branco no
    Flash, a luz quente do canto no Clarão); prévia e exportação a 0–1,5 nível em 255 no Flash e 2,7–2,9 no Clarão.
  - d) **Efeitos sonoros desenhados aqui** (whoosh, swish, clique de câmera, impacto grave, página, teclado, estalo),
    gerados por síntese, sem arquivos de terceiros, numa biblioteca do espaço. **Prontos (27/10/2026):** nove
    efeitos na ferramenta Áudio (ouvir e pôr no cursor), cada um uma mídia do espaço criada no primeiro pedido.
  - e) **Gráficos de pregação** (coração que se abre, mente, Bíblia, cruz de luz, chama, pomba, corrente que se
    quebra, céu que se abre), escolhidos pelas palavras da fala. **Prontos (27/10/2026):** os oito na categoria "Pregação e fé" de
    Elementos, e a escolha pelas palavras em `lib/clipar/graficosDaFala.ts`, que o modelo de pregação usa.
  - f) **Banco da Pixabay** (imagens e vídeos, pela chave do dono no `.env`): a busca no painel com a fonte mostrada, a
    busca guardada 24 h e o que for usado baixado para a biblioteca, como pedem as regras da API; a montagem escolhe as
    imagens de apoio pelas palavras da fala. **O banco está pronto (27/10/2026)** no painel Mídia: busca com a fonte, cache de 24 h e o item
    baixado para a biblioteca; a escolha automática pela fala vai com o modelo de pregação (g).
  - g) **O modelo de pregação** (14.6) juntando tudo, escolhido na página de opções, e as ações novas do "Peça uma
    edição" (efeito de voz num trecho, flash nos cortes, gráfico quando fala de algo, cor de cinema, imagem de apoio,
    cartela final, efeitos sonoros). Medir: um corte do TEDx montado com o modelo, prévia e exportação a menos de 4
    níveis em 255, e o tempo do link ao corte pronto.

## Riscos

- **O YouTube muda e o yt-dlp quebra.** A versão fica fixa na imagem, com a atualização como um passo conhecido; a
  mensagem diz quando é isso. O envio do arquivo continua valendo.
- **O Qwen3 8B erra mais que os modelos grandes.** Por isso ele só aponta frases e notas, a conferência descarta o
  resto e as medidas do vídeo pesam na nota. Se a comparação com o Cut.Pro sair fraca, a próxima tentativa é um modelo
  aberto maior que caiba nos 8 GB em 4 bits, medido do mesmo jeito.
- **Vídeos longos.** Uma hora de fala são umas 8 janelas; com o modelo carregado uma vez, a conta é de alguns minutos.
  A placa é dividida com o Whisper e o Wan pela fila, como hoje.
- **Mais de uma pessoa falando.** Sem separar quem fala, o layout dividido e o "reenquadrar em quem fala" usam os rostos
  e o movimento da boca; separar as vozes por modelo fica para depois, medido.
