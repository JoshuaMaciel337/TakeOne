# Plano: TakeOne, editor de vídeo no estilo CapCut

Editor de vídeo web com o mesmo fluxo e a mesma organização do CapCut, mas com nome, visual, ícones e código próprios. Base de três fontes: a análise do CapCut feita com o REA, os repositórios abertos FilmCraft e LightCraft, e o HolyCut.

Nome do projeto: **TakeOne** (neste documento, também "o editor").

## 1. O que pode ser usado de cada fonte

| Fonte | Licença | O que pode |
|---|---|---|
| CapCut | Proprietária | Só como referência de funções e fluxo. Nada de código, ícones, modelos, músicas, efeitos ou marca. |
| FilmCraft (`storytold/filmcraft`) | MIT ou Apache-2.0 | Copiar e adaptar código, mantendo os avisos de licença e o `NOTICE`. A marca ArtCraft não pode ir junto. |
| LightCraft (`storytold/lightcraft`) | MIT ou Apache-2.0 | Igual ao FilmCraft. |
| EffectCraft, PhotoCraft, SoundCraft, VectorCraft (`storytold/...`) | MIT ou Apache-2.0 | Igual ao FilmCraft. |
| ArtCraft (`storytold/artcraft`) | MIT ou Apache-2.0 (desde 2026; conferido em 22/10/2026) | Igual ao FilmCraft. Antes era a "ArtCraft License" (fair source), que proibia um produto concorrente. A marca, o logo e os ícones dos apps continuam de fora. |
| artcraft-services (`storytold/artcraft-services`) | "ArtCraft License" (fair source) | **Não usar.** A licença proíbe usar o código para criar um produto concorrente de ferramentas de imagem e vídeo com IA, e é o caso do editor. Também ficam de fora os repositórios sem licença (`artcraftx`, `storyteller-ml`, `cloud-worker`, `realtime-voice-conversion`). |
| HolyCut (`JoshuaMaciel337/HolyCut`) | Projeto do próprio dono | Copiar o que servir para dentro do editor. O HolyCut continua um projeto independente, sem ligação por código, banco ou login. |

Regras para o código que vier do FilmCraft e do LightCraft:

- Cada arquivo copiado ou portado leva no topo a origem e a licença.
- Os textos de licença de cada origem (`LICENSE-MIT`, `LICENSE-APACHE` e `NOTICE`) ficam em `licencas/<projeto>/`, e na raiz fica um `THIRD_PARTY.md` listando o que veio de onde. Eles não ficam na raiz porque lá pareceriam a licença do TakeOne inteiro, com o copyright do ArtCraft Team.
- Nomes de marcas de terceiros (Lumetri, Premiere, Lightroom, CapCut) não aparecem na interface. Exemplo: o painel de cor se chama "Ajustes de cor", não "Lumetri".

## 2. O que aproveitar

### Do CapCut (só referência)

- **Layout de quatro áreas:**
  - barra lateral de ferramentas
  - painel de conteúdo da ferramenta escolhida
  - prévia no centro, com proporção e o botão Exportar
  - linha do tempo embaixo
- **Ferramentas na barra lateral:** Mídia, Modelos, Elementos, Áudio, Texto, Legendas, Transcrição, Efeitos, Transições, Filtros, Kit de marca e Plugins.
- **Fluxos:**
  - entrar sem conta (com aviso de que o projeto não fica salvo)
  - arrastar e soltar mídia
  - importar do Google Drive e do Dropbox
  - editar pelo texto da transcrição
  - modelos prontos
  - edição automática a partir de vários clipes
- **O que cada painel tem (visto logado):**
  - **Modelos:** por tema (Intro, Outro, Revelação de logotipo, datas comemorativas).
  - **Elementos:** biblioteca local, fotos, stickers e GIFs.
  - **Áudio:** música por categoria e por busca, e efeitos sonoros.
  - **Texto:** modelos de texto por categoria, efeitos de texto, cabeçalho e corpo.
  - **Legendas:** automáticas por idioma, manuais, importar `.srt`, `.ass` e `.lrc`, e letras de música automáticas.
  - **Transcrição:** edição baseada na transcrição, escolhendo idioma e faixa.
  - **Transições:** algumas dezenas em categorias (virada 3D, dividir em 2/3/4, desfocar, sobrepor, pixelado, recorte, estroboscópico...).
  - **Filtros:** dezenas de filtros com nome de clima (névoa cinematográfica, pele natural, vintage suave...).
  - **Plugins:** banco de música licenciada (Epidemic Sound).
- **Não copiar:** transições e adesivos com personagens licenciados (desenhos e marcas de terceiros). Os nossos são próprios.

### Do OpusClip e do Cut.Pro (só referência, vistos logados)

Analisados com uma conta grátis, usando o vídeo de exemplo do HolyCut no OpusClip e os exemplos prontos do Cut.Pro. As capturas ficam na pasta `analise/` do projeto REA, fora do repositório do TakeOne.

**Cut.Pro** (o mais parecido com o HolyCut, em português):
- **Menu:** Início, Automações, Personas IA, Clipar, Clipar lives, Campeonatos, Editor, Templates, Transcrição, Downloads, Armazenamento, Agenda, Contas conectadas, Métricas e Afiliados.
- **Clipar:** colar o link (YouTube, Twitch, TikTok) ou enviar o arquivo. O resultado é uma lista de cortes, cada um com:
  - nota de potencial (ex.: 9/10), duração, título em caixa alta e resumo
  - Exportar e Publicar
  - gostei/não gostei
  - ordenar por "maior potencial" e "escolher template para todos"
- **Templates** (montados uma vez e aplicados sozinhos em todos os cortes):
  - Layout: tela cheia, fundo desfocado, dividido, webcam, espaço para texto, cinema, com recorte automático.
  - Legendas automáticas, com emoji automático sobre palavras-chave.
  - Texto: dezenas de títulos animados (pulo elástico, cascata, cortina, relevo 3D), estilos de impacto, neon, caixa e "news".
  - Formas: barra inferior (lower third), caixa semitransparente, barra de progresso.
  - Elementos: GIFs, emoji, objetos 3D, molduras, fundos animados, green screen.
  - **Atenção:** uma caixa onde entra um vídeo de "distração" (satisfatório, areia, CNC), diferente em cada corte.
  - **Print:** um quadro do vídeo original como imagem (início, meio, fim ou aleatório).
  - **Imagem automática:** cada corte ganha uma foto do assunto, buscada na web, numa caixa posicionada.
  - **B-roll automático** por slot, com regra de onde entra.
- **Editor do corte:**
  - Barra à esquerda com Chat, Templates, Legendas, Texto, Formas, Elementos, Atenção, Print, Imagens, B-roll, Música, Sons, Arquivos e Capa.
  - Prévia 9:16 no centro.
  - Transcrição editável à direita (duplo clique na linha; mantém o tempo de cada palavra), com abas Texto e Segmentos.
  - Linha do tempo com quatro faixas.
- **Chat ("Editar com IA"):** o pedido em texto ("deixa a legenda maior", "foca em quem está falando") é aplicado ao vídeo, e Ctrl+Z desfaz o pedido inteiro.
- **Capa:** usar o quadro atual ou enviar uma imagem; a capa vira a miniatura nas redes.
- **Automações:** gatilho e ação repetidos sozinhos. É o envio automático do HolyCut, generalizado.
- **Publicar:** agenda, contas conectadas e métricas.
- **Não copiar:** a biblioteca de música deles traz faixas comerciais. Nós só usamos música com licença.

**OpusClip:**
- **Painel:**
  - Obter clipes em 1 clique (enviar ou Google Drive), Converter longo para curto e Editar vídeo (grátis, até 120 min).
  - Legendas IA, AI Producer (edição por conversa), B-Roll IA, Reenquadrar IA, SFX automático, Aprimorar, Aprimorar a fala, Voiceover hook e Roteiro para vídeo.
  - Servidor MCP para agentes.
- **Lista de cortes:**
  - Nota de viralidade de 0 a 100, com quatro notas de A a F: **Gancho, Fluxo, Valor e Tendência**.
  - Categoria do corte: história emocional, trecho viral, compilação, melhor momento.
  - "Análise de cena" ou "apenas transcrição", trechos com tempo e resumo de cada um.
  - Exportar XML, Baixar em HD, Duplicar e Publicar.
- **Editor (centrado na transcrição):**
  - Transcrição à esquerda, com busca, capítulos, filtrar palavras excluídas e exportar legendas.
  - **Limpeza de fala:** encontra pausas (com duração mínima ajustável), palavras de preenchimento e gravações ruins (retakes), com "Remover tudo".
  - **Estender um clipe** para antes ou depois.
  - Barra superior com proporção, layout (preencher), fundo e rastreador (rastreamento manual do sujeito, por cena).
  - Ferramentas à direita: Aprimoramento por IA, Legendas, Mídia, Modelo de marca, B-Roll, Movimento, Texto, Elementos, Audio e Gancho de locução.
- **Aprimoramento por IA (interruptores):**
  - remover preenchimento, pausas e tomadas ruins
  - censura automática
  - aprimorar a fala
  - B-roll por IA (vídeo e imagem) e de banco
  - gancho de locução automático
  - emojis por IA
  - destacar palavra-chave
  - transições e zoom automáticos
  - cor por palestrante
- **Legendas:** cerca de 20 predefinições animadas (karaokê, caixa de destaque, desfoque, pulo, tremor, crescer...), com fonte e efeitos separados.
- **Movimento:** transições automáticas ou personalizadas (cruzada, zoom cruzado, aproximar, afastar, aparecer e desaparecer gradualmente) e animação.
- **Texto:** sobreposição, etiqueta de nome e localização.
- **Elementos:** memes, stickers, emojis, setas, "toque aqui", redes sociais, curtir e barra de progresso.
- **Áudio:** música por clima (energético, tranquilo, dramático...) e efeitos sonoros.
- **Gancho de locução:** roteiro, voz do narrador e volume do áudio original.

**O que entra no plano por causa deles:**
- **Nota do corte com critérios:** gancho, fluxo, valor e tendência, mais uma categoria, um título e um resumo. A ordenação é por nota, com gostei/não gostei para aprender o gosto da pessoa. Generaliza o HolySermon.
- **Modelos de corte aplicados em lote:** layout, legenda, título, formas, B-roll e caixas automáticas (imagem do assunto, print, vídeo de atenção), montados uma vez e aplicados em todos os cortes.
- **Limpeza de fala num painel só:** pausas, vícios e retakes, com contagem, revisão e "remover tudo". O HolyCut já faz pausas e vícios; falta detectar retakes.
- **Editar com IA (chat):** o pedido vira comandos do editor; mostrar o que vai mudar e desfazer o pedido inteiro com um Ctrl+Z.
- **Estilos de edição completa** com um clique, a partir do "Criar automaticamente" do HolyCut.
- **Interruptores de IA:** emoji automático, destaque da palavra-chave, zoom e transições automáticos, cor por palestrante e censura automática.
- **Gancho de locução:** uma frase narrada no começo do corte, com TTS de modelo aberto e voz padrão (sem clonar voz).
- **Rastreador manual por cena** no reenquadramento.
- **Capa, agenda de publicação, contas conectadas e métricas.**
- **Exportar XML** da edição, já previsto com o `interchange` do FilmCraft.

Fica fora, como no HolyCut: avatar de IA e personas (Cut.Pro), dublagem, clonagem de voz e correção do olhar. O Captions saiu da análise porque a conta grátis só libera a criação de avatar.

**Nada pago por enquanto:** nenhuma API, modelo ou serviço cobrado por uso. Tudo roda com modelos abertos na máquina (Whisper, Ollama, DeepFilterNet, MediaPipe e, para gerar vídeo, o Wan 2.2).

### Do FilmCraft (Rust, ~430 mil linhas)

| Parte (crate) | Para quê | Como entra |
|---|---|---|
| `time` | Tempo exato em ticks (254.016.000.000 por segundo), sem erro acumulado nos cortes | Portar para TypeScript (é pequeno, ~550 linhas) |
| `edit` | Operações de linha do tempo: dividir, aparar, ripple, roll, slip, slide, edição pela transcrição | Portar a lógica para TypeScript, com os testes |
| `engine` (sistema de comandos) | Toda ação é um comando com id e parâmetros. Isso dá desfazer/refazer, histórico e controle por agentes de IA (MCP) | Copiar o desenho para TypeScript |
| `color` | Correção de cor: temperatura, exposição, contraste, curvas monotônicas, rodas de cor, HSL secundário, vinheta, oito looks | Portar para shaders (WebGL/WebGPU), para a prévia e o render serem iguais |
| `audio-dsp` | Medidor de loudness EBU R128, EQ, compressor, limitador, ducking da música sob a voz, reverb | Compilar para WebAssembly ou portar as partes usadas |
| `captions` | Ler e gravar SRT, WebVTT, SCC e TTML | Compilar para WebAssembly ou portar |
| `interchange` | Exportar e importar XML do Final Cut, FCPXML, OpenTimelineIO e EDL (levar a edição para DaVinci e Premiere) | Compilar para WebAssembly; substitui o `pacote_edicao.py` do HolyCut |
| `render` e `gpu` | Ideias do compositor: mistura em luz linear, 26 modos de mesclagem, keyframes Bezier com curvas de valor e velocidade | Referência para o nosso compositor |
| Lista de efeitos e ~30 transições | Catálogo do que implementar | Referência |

Os codecs próprios (H.264, HEVC, AV1...) **não** entram: no navegador usamos WebCodecs e no servidor o FFmpeg.

### Do LightCraft (Rust, ~120 mil linhas)

| Parte | Para quê | Como entra |
|---|---|---|
| `pipeline` (`tone`, `colorops`, `local`, `masks`) | Luz (realces e sombras sem halo), clareza, textura, remoção de névoa, granulação | Portar para shaders do filtro de vídeo e de foto |
| Shaders WGSL do `gpu` (`blur`, `mask`, `finish`, `resize`) | Já são WebGPU: rodam direto no navegador | Copiar e adaptar |
| `develop/presets` | Ideia de predefinições com intensidade de 0 a 200% | Formato dos nossos filtros (os valores são nossos) |
| `segment` | Máscara de pessoa e de céu | Referência. Para recortar o fundo usaremos um modelo de segmentação aberto |
| Máscaras (pincel, linear, radial, por cor ou por brilho) | Ajustes localizados | Fase avançada |

### Do EffectCraft (compositor no estilo After Effects)

É o mais útil depois do FilmCraft, porque cobre a parte "animada" do CapCut: textos animados, adesivos e efeitos.

| Parte (crate) | Para quê | Como entra |
|---|---|---|
| `lottie` | Importar e exportar animações Lottie | Base dos **adesivos animados, textos animados e modelos**. No navegador, as animações Lottie podem ser desenhadas com uma biblioteca aberta, e o crate serve para gerar e converter os arquivos. |
| `text` (`selectors`, `path_text`, `layout`) | Animadores de texto com seletor de intervalo (letra a letra, palavra a palavra) e texto em caminho | Base das **animações de entrada, saída e loop do texto** e das legendas animadas. Portar a lógica para TypeScript. |
| `keyframe` e `expr` | Keyframes (linear, Bezier, hold, Easy Ease) e expressões (`wiggle`, `loopOut`) | Motor de keyframes do editor. |
| `effects` (306 efeitos) | `transition`, `blur`, `distort`, `stylize`, `noise`, `keying`/`keylight` (chroma key), `time_fx`, `textfx`, `warp_stab` (estabilização) | Catálogo e fórmulas para os efeitos e transições do editor, portados para shaders. |
| `track` | Rastreamento de rosto, de ponto e de plano, e estabilização | Fazer um texto ou adesivo **seguir um objeto** e estabilizar o vídeo. |
| `segment` (MediaPipe, MobileSAM) | Segmentação de pessoa e objetos | **Recortar o fundo** sem tela verde. Conferir a licença de cada modelo antes de usar. |

### Do PhotoCraft (estilo Photoshop)

| Parte | Para quê | Como entra |
|---|---|---|
| Estilos de camada (sombra, contorno, brilho externo e interno, chanfro, sobreposição de gradiente) | **Estilos de texto** do editor: contorno, sombra e brilho, como os do CapCut | Portar as fórmulas para shaders |
| Filtros (desfoques, desfoque de lente, tilt-shift, distorções, pixelizar, pintura a óleo) | Efeitos de vídeo e filtros de foto | Portar os que entrarem no catálogo |
| Seleção de assunto e "Selecionar e mascarar" | Recorte de pessoa com bordas finas | Referência para o recorte de fundo |
| `vector` e formas | Formas com preenchimento de gradiente e traço tracejado | Elementos de forma do editor |

### Do SoundCraft (estilo Pro Tools)

| Parte | Para quê | Como entra |
|---|---|---|
| `dsp` e plugins (EQ, compressor, de-esser, reverbs, delay, chorus, pitch shifter) | **Efeitos de voz** e de áudio do editor | Compilar para WebAssembly ou portar os usados |
| Fades em cinco formatos e crossfades | Fades de áudio dos clipes | Portar |
| Detecção de batidas (Beat Detective) e `pitch_detect` | **Batida automática:** marcar as batidas da música para cortar e animar no ritmo, como o "Beat" do CapCut | Portar |
| Esticar o tempo mantendo o tom (Elastic) | Mudar a velocidade do clipe sem a voz ficar fina ou grossa | Portar ou usar o `atempo` do FFmpeg no render |
| Strip silence e normalização | Já existe no HolyCut; comparar e ficar com o melhor | Referência |

### Do VectorCraft (estilo Illustrator)

| Parte | Para quê | Como entra |
|---|---|---|
| `svg` e `pathops` | Importar SVG e combinar formas | Adesivos e formas vetoriais |
| `trace` | Transformar uma imagem em vetor | Transformar o logo da organização em vetor para o Kit de marca |

Não servem ao editor: PdfCraft, WordCraft, GridCraft, DeckCraft, CADCraft e DesignCraft. As fontes do `craft-fonts` (OFL) só fazem falta se o editor tiver interface em japonês ou chinês.

### Do HolyCut (o que já funciona e foi testado)

Fica:

- **Infraestrutura:**
  - fila de tarefas no MongoDB, com lease e heartbeat
  - upload retomável (tus) em pedaços de 8 MB
  - armazenamento por chaves, fácil de trocar por S3 ou R2
  - eventos ao vivo por SSE, com consulta periódica como reserva
  - sessão, organizações e backup
  - Docker Compose com perfil de GPU
- **Ingestão:** versão leve (proxy 720p), forma de onda, níveis de áudio e miniaturas.
- **Render no servidor:** FFmpeg numa passada só, com cortes alinhados ao quadro e áudio sem perda de sincronia, e loudness em -14 LUFS.
- **IA, sem custo por uso:**
  - transcrição com faster-whisper e alinhamento por palavra
  - legendas animadas com os presets Clean, Karaokê, Destaque e Flutuante
  - edição pelo texto
  - corte de silêncios e de vícios de fala
  - limpeza de áudio (DeepFilterNet3)
  - acompanhar o rosto ao reenquadrar (MediaPipe)
  - redução de ruído na imagem
  - "Criar automaticamente" (diretor de edição)
- **Recursos de edição:** textos e logo arrastáveis, figuras, banco de imagens da Pixabay com crédito, filtros de cor, música com volume que abaixa sob a voz, transições entre partes e efeitos (brilho, tremor, zoom, luz).
- **Extras:** QR code para baixar no celular, link de aprovação e capa do vídeo.
- **Princípio:** a prévia tem de sair igual ao render, medido em números.
- **Componentes da interface:** `FormaDeOnda`, `CamadaSobreposta`, `LegendaNaPrevia`, `PreviaEnquadrada` e os painéis de texto, cor, música, efeitos e legenda.

Sai, por ser específico de igreja: culto, pregação, blocos do culto, HolySermon, HolyStudy, versículos, Acervo e o agente do OBS. O agente do OBS pode voltar depois como "envio automático de pasta".

Muda: o projeto do HolyCut é **uma gravação** cortada em partes. O editor precisa de **várias mídias em várias faixas**, que é a maior mudança no modelo de dados (seção 4).

## 3. Arquitetura

O desenho é híbrido: a prévia e a edição rodam no navegador, e a exportação e a IA rodam no servidor. É o modelo do HolyCut, com a prévia mais forte.

```
Navegador (Next.js 16 + Tailwind 4)
├── Interface no estilo CapCut (React)
├── Estado do projeto + comandos (desfazer/refazer, histórico)
├── Prévia: WebCodecs + compositor WebGL2 (WebGPU quando houver)
├── Áudio da prévia: Web Audio API
└── Módulo WebAssembly (código Rust do FilmCraft/LightCraft):
    legendas, interchange, loudness

Servidor (do HolyCut)
├── API FastAPI: sessão, projetos, mídias, upload tus, eventos SSE
├── Worker CPU: ingestão, render FFmpeg, rosto, imagem
├── Worker GPU: transcrição, limpeza de áudio, segmentação, LLM (Ollama),
│   geração de vídeo (Wan 2.2 pelo ComfyUI, num serviço à parte)
├── MongoDB: dados e fila
└── Armazenamento: pasta local (depois S3/R2)
```

Decisões:

- **Stack do HolyCut:** FastAPI, Next.js 16, Tailwind 4, MongoDB, FFmpeg e Docker Compose, mantendo os padrões da equipe (código em português, sem Redis e sem SQL).
- **Uma descrição para a prévia e o render.** O projeto é um JSON único. A prévia desenha a partir dele no navegador, e o worker monta o grafo do FFmpeg a partir do mesmo JSON. Cor e efeitos têm a mesma fórmula nos dois lados: shader no navegador e filtro equivalente no FFmpeg. Uma bateria de testes compara quadros da prévia e do render.
- **Comandos (ideia do FilmCraft).** Toda ação vira `{comando, parametros}`: `linha.dividir`, `clipe.mover`, `texto.adicionar`, `cor.ajustar`... Isso dá desfazer ilimitado, histórico e salvamento por diferença. Mais tarde, um servidor MCP deixa agentes de IA editarem pelo mesmo caminho.
- **Exportação rápida no navegador** (opcional, fase 6): vídeos curtos sem IA podem sair direto do navegador (WebCodecs + `mp4-muxer`), sem ocupar o servidor.

## 4. Modelo de dados

```ts
type Projeto = {
  id: string;
  nome: string;
  proporcao: "9:16" | "16:9" | "1:1" | "4:5" | "3:4" | "21:9";
  fps: number;                 // 30 por padrão
  fundo: { cor: string; desfoque: number };
  faixas: Faixa[];             // de cima para baixo
  midias: Midia[];             // arquivos usados no projeto
  versao: number;
};

type Faixa = {
  id: string;
  tipo: "principal" | "sobreposicao" | "audio" | "texto" | "legenda" | "efeito";
  oculta: boolean; muda: boolean; travada: boolean;
  clipes: Clipe[];
};

type Clipe = {
  id: string;
  midiaId?: string;
  inicio: Tick;                // posição na linha do tempo
  duracao: Tick;
  entrada: Tick;               // de onde começa na mídia
  velocidade: number;          // ou curva de velocidade
  volume: number; fadeEntrada: Tick; fadeSaida: Tick;
  transformacao: Animavel<{ x: number; y: number; escala: number; rotacao: number; opacidade: number }>;
  recorte?: { x: number; y: number; largura: number; altura: number };
  mesclagem: ModoMesclagem;
  cor: AjustesCor;             // portado do FilmCraft/LightCraft
  efeitos: Efeito[];
  transicaoSaida?: Transicao;
  texto?: Texto;               // clipes de texto
  animacao?: { entrada?: string; saida?: string; loop?: string };
};
```

- `Tick` é um inteiro com a base de tempo do FilmCraft.
- `Animavel<T>` é um valor fixo ou uma lista de keyframes com interpolação linear, Bezier ou hold.
- Projetos do HolyCut (partes de uma gravação) são convertidos em uma faixa principal com um clipe por parte.

## 5. Interface

Com base no layout observado no CapCut:

- **Topo:**
  - nome do projeto, salvo automaticamente
  - desfazer e refazer
  - proporção
  - zoom da prévia
  - botão Exportar
- **Barra lateral:** Mídia, Modelos, Elementos, Áudio, Texto, Legendas, Transcrição, Efeitos, Transições, Filtros, Kit de marca e Plugins.
- **Painel de conteúdo:**
  - Mídia: enviar, arrastar e soltar, Drive, Dropbox e banco de imagens
  - Texto: estilos prontos e animações
- **Prévia:** play, tempo atual/total, tela cheia, e mover, redimensionar e girar elementos direto na tela, com guias de alinhamento.
- **Painel de propriedades à direita**, com as abas que mudam conforme o clipe:
  - Básico (posição, escala, rotação, opacidade)
  - Áudio (volume, fades, limpar voz)
  - Velocidade (normal ou curva)
  - Animação
  - Ajustes de cor
  - Máscara
  - Recortar fundo
- **Linha do tempo:**
  - várias faixas, régua, cursor e ímã
  - zoom
  - dividir (S), apagar (Delete) e duplicar
  - aparar pelas bordas
  - miniaturas e forma de onda nos clipes
  - selecionar vários clipes
  - linkar áudio e vídeo
- **Celular:** a mesma organização que o HolyCut já usa (ferramentas numa faixa que rola para o lado).

O visual (cores, ícones, tipografia) é nosso. Os ícones vêm do `lucide-react` (ISC), que o HolyCut já usa.

## 6. Fases

Cada fase termina com algo que dá para usar e testar.

### Fase 0: fundação (1 semana)
- [x] Criar o repositório do editor e copiar do HolyCut: `core` (config, Mongo, fila, storage, ffmpeg), API básica (sessão, organizações, jobs, eventos, upload tus), worker e Docker Compose, sem as partes de igreja.
- [x] Next.js com o layout das quatro áreas e painéis redimensionáveis.
- [x] Arquivos de licença e `THIRD_PARTY.md`.
- [x] CI igual ao do HolyCut (ruff, pytest, lint, tipos, build).
- [x] Subir no Docker do Nitro 5.
- [x] Rodar o CI no GitHub pela primeira vez.

### Fase 1: linha do tempo de várias faixas (2 a 3 semanas)
- [x] Modelo de dados da seção 4, base de tempo em ticks (portada do FilmCraft) e sistema de comandos com desfazer/refazer.
- [x] Mídia: envio, ingestão (proxy, miniaturas, forma de onda, já no HolyCut), biblioteca do projeto.
- [x] Linha do tempo:
  - arrastar da biblioteca
  - mover entre faixas
  - aparar
  - dividir
  - apagar com ripple
  - duplicar
  - ímã e zoom
  - atalhos de teclado
- [x] Salvar automaticamente e recuperar depois de fechar a aba.
- [x] Prévia tocando a linha do tempo, com as faixas de sobreposição por cima da principal. Por enquanto com elementos `<video>`; o compositor de verdade é a fase 2.

### Fase 2: prévia e exportação (2 a 3 semanas)
- [x] Compositor no navegador em WebGL2: várias camadas, transformação, opacidade, recorte e fundo. A conta da posição de cada clipe (`geometria`) é a mesma no TypeScript e no Python, conferida pelos mesmos casos.
- [x] Decodificar os quadros com WebCodecs (quadro exato ao parar e camadas sincronizadas entre si), com o `<video>` como reserva quando o navegador ou o arquivo não permitem.
- [x] Áudio da prévia pelo Web Audio, com volume até 400%.
- [x] Manipular elementos na prévia (arrastar, redimensionar, girar, com ímã no centro e nas bordas), adaptado da `CamadaSobreposta` do HolyCut, e a aba Básico nas propriedades.
- [x] Render no worker a partir do mesmo JSON, generalizando o `render.py` do HolyCut para várias faixas. Exportar MP4 em 720p, 1080p e 4K, com progresso, download e QR para o celular. Conferido com o FFmpeg no Nitro. O som é misturado e medido numa passada própria e leva um ganho fixo até -14 LUFS, para manter o equilíbrio da prévia.
- [x] Teste automático que compara quadros da prévia e do render: o render é conferido contra a geometria no CI (`test_render_segue_a_geometria_da_previa`), e a prévia contra o vídeo exportado no Chrome pelo `npm run comparar-previa`, fora do CI (precisa da pilha e do navegador).

### Fase 3: texto, áudio e legendas (2 semanas)
- Texto (faixa de texto por cima de tudo; o PNG do texto é desenhado pela API e é o mesmo no render):
  - [x] fontes (Montserrat, Inter e Caveat, OFL), negrito, maiúsculas e alinhamento
  - [x] cor
  - [x] contorno
  - [x] sombra
  - [x] fundo
  - [x] estilos prontos
  - [x] animações de entrada e saída (aparecer, subir, descer, deslizar e zoom), na aba Animação de qualquer clipe de imagem
  - [x] animações de loop (pulsar, balançar, flutuar e tremer), em qualquer clipe de imagem
  - [x] animações letra a letra e palavra a palavra (máscara sobre o PNG do texto, na prévia e no render)
  - [x] brilho em volta das letras (contorno e sombra já existiam), desenhado no PNG do texto
- Áudio:
  - faixas de música e efeitos sonoros com licença: vão para a fase 6, com o banco da Pixabay (as faixas de áudio já existem)
  - [x] volume (até 400%) e fades de entrada e saída lineares, na prévia e no render
  - [x] fades em outros formatos: suave, em S e exponencial (as curvas do `afade`, com a mesma fórmula na prévia)
  - [x] abaixar a música sob a voz (curva gravada no clipe a partir da transcrição das outras faixas)
  - [x] loudness medido na ingestão e "Igualar o volume" no clipe (ebur128, como o render mede a mistura)
  - [x] efeitos de voz: equalizador de três faixas, eco e reverb, com prontos
  - [x] mudança de tom da voz (arquivo gerado no worker, o mesmo na prévia e no render)
- [x] Legendas automáticas pela fala (faster-whisper no worker de GPU), em até duas linhas que cabem no quadro. Com destaque da fala: karaokê e palavra falada, na cor escolhida.
- [x] Legendas manuais: faixa de legendas por cima de tudo, estilos prontos aplicados a todas, lista para editar, e importar/exportar SRT e VTT. O leitor foi escrito no TakeOne (o `captions` do FilmCraft fica para SCC e TTML, se um dia precisar).

### Fase 4: efeitos, transições e cor (2 a 3 semanas)
- Transições entre clipes vizinhos da principal (ferramenta Transições), cobrindo o corte pela metade:
  - [x] fusão
  - [x] escurecer
  - [x] deslizar
  - [x] empurrar
  - [x] zoom
  - [x] desfoque
  - [x] wipes (cortinas para a direita, a esquerda, cima e baixo)
- Ajustes de cor (aba Cor). A conta é do TakeOne, a mesma no shader da prévia e na LUT 3D do render; as do FilmCraft e do LightCraft ficam de referência para curvas e rodas:
  - [x] temperatura e tom
  - [x] exposição
  - [x] contraste
  - [x] realces
  - [x] sombras
  - [x] saturação
  - [x] curvas (RGB e por canal)
  - [x] rodas de cor (escuros, meios-tons e claros)
  - [x] vinheta
  - [x] granulação (na ferramenta Efeitos)
- [x] Filtros prontos com intensidade (ferramenta Filtros).
- Efeitos de vídeo, escolhidos do catálogo do EffectCraft e do PhotoCraft:
  - [x] desfoque
  - [x] brilho
  - [x] tremor e zoom (pelos loops de animação: tremer e pulsar)
  - [x] luz (faixa de luz quente que atravessa a imagem)
  - [x] glitch
  - [x] VHS
  - [x] distorções (olho de peixe)
  - [x] modos de mesclagem: multiplicar, tela e somar
- [x] Chroma key (tela verde), pelo colorkey do FFmpeg e a mesma conta no shader.
- [x] Keyframes de posição, escala, rotação e opacidade, com curva linear ou suave (a conta é do TakeOne; o `keyframe` do EffectCraft fica de referência para Bezier e hold).
- [x] Velocidade constante e com curva, mantendo o tom da voz (aba Velocidade).

### Fase 5: IA no estilo CapCut (3+ semanas)
- Já existem no HolyCut e só precisam ser generalizados:
  - [x] edição pelo texto (Transcrição)
  - [x] cortar silêncios e vícios (limpeza de fala na ferramenta Transcrição)
  - [x] limpar a voz (DeepFilterNet3 no worker de CPU, opção na aba Áudio)
  - [x] reenquadrar seguindo o rosto (YuNet no worker de CPU, botão na aba Básico)
  - [x] redução de ruído na imagem (hqdn3d no worker de CPU; a mesma imagem limpa na prévia e no render)
  - [x] "Criar automaticamente" (diretor de edição com o LLM local; seção 10)
- Novos:
  - **animações em HTML (motion graphics):** clipe de animação a partir de modelos prontos (tarja, título cinético, logo, CTA, contador, citação), com as cores do kit de marca. Seção 10.
  - [x] LLM local (Ollama com o Qwen3 8B) para o "Criar automaticamente". Seção 10.
  - [x] "Descreva a animação": o LLM encaixa o pedido num modelo pronto ou escreve a animação a partir de um esqueleto (experimental). Seção 10.
  - [x] recortar o fundo do vídeo (pessoas, com o MODNet no worker de CPU; a mesma máscara na prévia e no render)
  - [x] **gerar vídeo com IA:** clipes curtos (B-roll, fundo, transição) a partir de um texto, com o Wan 2.2 TI2V-5B (painel Mídia, 2 a 5 s em 480p). Detalhes na seção 9.
  - [x] imagens na biblioteca (JPG, PNG e WebP, giradas pelo EXIF, com transparência): clipes de qualquer duração, na prévia e no render
  - [x] gerar vídeo a partir de uma imagem (a imagem da biblioteca é o primeiro quadro do Wan 2.2 TI2V)
  - [x] batida automática: cortar e animar no ritmo da música (detecção própria em numpy, conferida contra o librosa; seção Ritmo na aba Áudio)
  - [x] estabilização (vidstab no worker de CPU; a mesma imagem estável na prévia e no render)
  - [x] texto ou adesivo que segue um objeto (VitTrack no worker de CPU; o caminho vira keyframes de posição)
  - [x] texto em fala (TTS com modelo aberto): Kokoro-82M (Apache-2.0) com três vozes pt-BR, na ferramenta Áudio
  - [x] edição automática a partir de vários clipes (nota de cada instante no worker de CPU; trechos escolhidos no editor e cortados nas batidas)
  - [x] destacar a palavra-chave da legenda com o LLM (seção 10): botão na ferramenta Legendas e opção do "Criar automaticamente"
- Fica fora do escopo, pelas regras do dono no HolyCut: avatar de IA, dublagem, clonagem de voz e lip-sync.

### Fase 6: modelos, elementos e marca (2 semanas)
- [x] Modelos de projeto (os nossos, criados do zero): nove modelos com cenas, textos, formas, filtros, transições e animações, nas cores do kit de marca.
- [x] Formas: retângulo, arredondado, elipse, triângulo, estrela, seta, linha, balão e coração, com cor, contorno e proporção (imagens desenhadas no servidor).
- Adesivos animados (Lottie, pelo `lottie` do EffectCraft). Desenhos próprios ou com licença aberta.
- Banco de imagens e vídeos da Pixabay, já no HolyCut.
- [x] Kit de marca: logo, cores e fontes do espaço; logo num canto do vídeo, fontes e cor nos textos e as cores nos seletores e nas animações.
- [x] Levar a edição para outros editores: XML de intercâmbio (xmeml 4), sozinho ou num ZIP com as mídias.
- [x] Exportação rápida no navegador para vídeos curtos: 720p, até 3 min, com o desenho e o som da prévia.

### Fase 7: extras
- [x] Auditoria de ponta a ponta (22/10/2026): 97 achados confirmados no código e no navegador, uns 80 diferentes. Corrigidos os graves (velocidade e zoom com ticks fracionários, valor digitado indo para outro clipe, 60 mídias no editor, LUFS perdido na ingestão, keyframes demais para o FFmpeg, início do clipe um quadro adiantado no render, luz e grão apagando a transparência, retake falso com números, cortes sobrepostos no "Criar automaticamente", ZIP de intercâmbio preso no disco, gaveta do celular sob a linha do tempo) e boa parte dos médios (redirecionamento depois do login, kit de marca passando de uma conta para outra, eventos ao vivo depois de a API reiniciar, fila com o worker morto, "Criar automaticamente" preso, legendas largas demais, fala com curva de velocidade, aro escuro em logos e tela verde em imagens transparentes, pedidos ao LLM maiores que o contexto, ComfyUI segurando a placa, limpeza da animação descrita, brilho e VHS na prévia). Depois, os últimos médios: transição com número ímpar de quadros, mídia de 24/25 fps aparada, imagem que acaba antes do som, zoom alto, exportação no navegador sem os arquivos gerados e destaque com brilho. E a maior parte dos pequenos (envio, fila e cancelamento, arquivos que sobravam, mensagens da API, cor marcada nos vídeos, celular e tema claro). Ficam para depois: um change stream compartilhado nos eventos ao vivo, a ordem do letra a letra em relação aos efeitos, a cauda do reverb, a memória das imagens de texto, o tremido do "Seguir um objeto", a busca da montagem em vídeos longos, a lista de projetos com mais de 60, o painel de propriedades no celular e o recorte da caixa ao pedaço visível no zoom alto (hoje a exportação recusa com uma mensagem).
- Estudo dos apps da ArtCraft (FilmCraft, LightCraft, EffectCraft, PhotoCraft, SoundCraft, VectorCraft): 42 funções para trazer do nosso jeito, por lotes. Ficam de fora os pesos do SAM 3, o RawNIND (GPL), o potrace (GPL), o CairoSVG (LGPL), o Depth Anything Base/Large (não comercial) e as animações do LottieFiles.
  - [x] Lote A (edição do dia a dia): legendas em qualquer codificação (UTF-8, UTF-16 e Windows-1252), juntar, dividir pelas palavras e localizar e substituir; atalhos Q, W, Alt+setas e ↑ ↓ de corte em corte, com a janela "?"; copiar e colar clipes e "Colar ajustes" (Ctrl+Alt+V); guias na prévia (margens seguras, terços e as áreas cobertas no celular).
  - [x] Lote B (com a prévia igual ao render): virar o clipe na horizontal e na vertical, as curvas Acelerando, Freando e Parado nos keyframes, a chave de luminância (tirar o fundo preto ou branco) e os cantos arredondados com borda.
  - [ ] Deslizar conteúdo (slip) e mover o corte (roll), e o resto das 42.
- Máscaras desenhadas (do LightCraft e do EffectCraft) e multicâmera (do FilmCraft).
- [x] Expressões nos keyframes: repetir em ciclo ou vaivém (`loopOut`) e tremer (`wiggle`), escritas aqui, na prévia e no render.
- Servidor MCP, para agentes editarem pelos comandos.
- Publicar direto no YouTube, TikTok e Instagram.
- Colaboração e links de aprovação (do HolyCut).

### Ordem combinada em 22/10/2026 (ondas)
Depois do estudo dos hubs de três editores conhecidos (só a ideia: menu por seções, página inicial com as ferramentas e os projetos, página de todas as ferramentas e biblioteca de modelos com prévia) e dos editores de foto da storytold (PhotoCraft, LightCraft, figcraft), as demandas novas entram junto com os lotes que faltam das 42 funções:
- [x] Onda 1, o hub: o editor de vídeo vira uma ferramenta do TakeOne. Menu lateral por seções (Criar, Biblioteca, Publicar), página inicial (destaque, ferramentas, "Continue criando" e modelos), "Todas as ferramentas" com abas por tipo, e páginas de Projetos, Mídias, Modelos, Kit de marca, Exportados, Gerar vídeo com IA e Texto em fala. As ferramentas do editor abrem nele, num projeto novo ou recente, já na ferramenta.
- [ ] Onda 2, biblioteca de modelos com prévia em vídeo gerada pelo nosso render (as mídias de exemplo o dono decide depois; até lá, o desenho padrão), filtros, "Usar este modelo", salvar o próprio projeto como modelo, prévia das 1000 animações e mais modelos (30 a 50).
  - [x] Biblioteca no hub (modelos de projeto e animações; abas Todos, Criados no espaço, Salvos e Destaques; busca, formato, categoria e ordem por populares, novos ou nome), janela "Usar este modelo", salvos por pessoa e usos por espaço, a animação tocando ao passar o mouse, "Salvar como modelo" no editor (com as vagas: as mídias e os textos que quem usa troca) e "Preencher o modelo" na ferramenta Modelos.
  - [x] Mais modelos prontos: de 9 para 30 (top 5, pergunta e resposta, bastidores, receita, imóvel, lançamento, cupom, vlog do dia, treino, aula, notícia, aniversário, casamento, podcast, resultado do cliente, inauguração, vaga, encerramento, unboxing, dica de tecnologia e frase do dia), com o texto padrão de cada um medido no desenho do servidor para caber no quadro.
  - [ ] A prévia em vídeo dos modelos de projeto: as mídias de exemplo o dono decide depois (até lá, o desenho padrão).
- [x] Onda 3, editor de imagem (primeira versão): projeto de imagem com camadas, tamanhos prontos, o que já existe no vídeo (cor, filtros, efeitos, texto, formas, fundo removido, kit de marca), desfocar o fundo, "Melhorar", exportar PNG, JPG e WebP com a prévia medida, e modelos de imagem.
  - [x] Projeto de imagem (o mesmo documento do vídeo, com tamanho em pixels e fundo transparente), página com os tamanhos prontos no hub, editor com camadas, imagens, textos, formas, fundo e tamanho, as abas Básico, Texto e Cor, e exportação em PNG, JPG e WebP (ou para a biblioteca) medida contra a prévia.
  - [x] Remover e desfocar o fundo das fotos (MODNet, `mascara.png`) e "Melhorar" (luz e cor pela imagem, também no editor de vídeo).
  - [x] Modelos de imagem na biblioteca (14, com a miniatura desenhada como vai sair), a ferramenta Modelos no editor de imagem e "Trocar a imagem".
- [ ] Onda 4, lote C (imagem e cor): HDR do celular para SDR, vibração, brancos, pretos e níveis, a LUT 3D também na prévia, cor por matiz, nitidez, slip e roll.
  - [x] A LUT 3D também na prévia: a mesma grade de 33 pontos do render, lida com a interpolação tetraédrica do FFmpeg (o fim da diferença nas curvas íngremes).
  - [x] Brancos, pretos, vibração, níveis (preto, branco e gama) e cor por matiz (oito faixas) na aba Cor, na mesma LUT.
  - [x] Nitidez (efeito, com a cópia desfocada do brilho).
  - [ ] Slip e roll, HDR do celular para SDR.
- [ ] Onda 5, editor de imagem (segundo passo): máscaras desenhadas, camadas de ajuste, seleções sem IA, seleção com um clique (MobileSAM ou SAM 2.1), apagar objeto (LaMa), clareza e névoa, tamanho e recorte.
- [ ] Onda 6, lote D (som). Onda 7, lote E (texto). Onda 8, lote F (tempo, transições e efeitos). Onda 9, lote G (adesivos SVG, quadro, LUT, marcadores). Onda 10, lote H (esconder rosto ou placa, desfocar o fundo no vídeo, multicâmera, MCP). Onda 11, imagem com a placa (ampliar, gerar por texto, preencher, profundidade).
- Retoque de pele e rosto fica de fora (perto do que o dono vetou, e os modelos bons têm licença arriscada). Publicar, agendar e desempenho aparecem no menu com "Em breve" até existirem.

**Estimativa:**
- Versão utilizável ao final da fase 3: cerca de 7 a 9 semanas.
- Paridade com as funções principais do CapCut ao final da fase 6: cerca de 4 a 5 meses.

## 7. Riscos

- **Desempenho da prévia** com várias faixas de vídeo. Usar o proxy 720p na prévia, cache de quadros e decodificação com WebCodecs.
- **Prévia diferente do render.** Cada efeito precisa da mesma fórmula no shader e no FFmpeg. Efeito novo só entra junto com o teste que compara os dois.
- **Rust para WebAssembly.** Exige a toolchain Rust e `wasm-bindgen`. Se o ganho for pequeno, portar para TypeScript a parte que usamos.
- **Navegadores.** WebCodecs e WebGPU funcionam bem no Chrome e no Edge e são limitados no Safari e no Firefox. Ter um caminho WebGL2 e começar pelo Chrome.
- **GPU do servidor** (8 GB no Nitro 5): um modelo por vez, como o HolyCut já faz. A geração de vídeo é a tarefa mais pesada: ela só roda com a GPU livre, e os outros modelos esperam na fila.
- **Conteúdo de terceiros:** nada de músicas, efeitos ou modelos tirados do CapCut. Só material próprio ou com licença.
## 8. Decisões tomadas

1. **Nome:** TakeOne. Visual do kit da marca (`docs/marca/guia.md`): tema escuro como padrão e um claro opcional, destaque em degradê de coral (`#ff624a`) para rosa (`#ff3478`), fonte Inter, ícones do `lucide-react`.
2. **Repositório novo.** O HolyCut continua como está, sem ligação por código, banco ou login.
3. **Contas e organizações desde o começo,** como no HolyCut: sessão por cookie e cada pessoa com o seu espaço.
4. **Roda no Nitro 5,** junto com o HolyCut, sem custo. As portas padrão (Mongo 27019, API 8010, site 3010) não batem com as do HolyCut.
5. **Nada pago por enquanto** (seção 2).
6. **Geração de vídeo com o Wan 2.2** (seção 9), na fase 5.

## 9. Geração de vídeo com IA (Wan 2.2)

Escolhido entre Wan 2.2, LTX-Video, HunyuanVideo, LTX Desktop e ComfyUI, pelo que cabe nos 8 GB da RTX 3070 Ti do Nitro 5 e pela licença.

- **Modelo:** Wan 2.2 TI2V-5B (texto ou imagem para vídeo), licença Apache 2.0. É o único dos avaliados que roda em 8 GB.
- **Como roda:** pelo ComfyUI, que descarrega parte do modelo para a memória comum (offload) enquanto gera. Sem isso, o modelo pede 24 GB.
- **ComfyUI como serviço à parte:** o ComfyUI é GPL-3.0. Ele roda no próprio container (perfil `gpu` do Compose) e o worker de GPU conversa com ele pela API HTTP. Nenhum código do ComfyUI entra no TakeOne, então a licença dele não passa para o projeto.
- **No editor:** o resultado entra na biblioteca de mídias como uma mídia comum e passa pela mesma ingestão (proxy, miniaturas, forma de onda).
- **Expectativa:** clipes de poucos segundos, em 480p ou 720p, levando alguns minutos cada um. Serve para B-roll, fundos e transições, não para cenas longas.
- **Memória:** 16 GB de RAM no Nitro 5 é o limite com o offload ligado. A tarefa roda sozinha na GPU e libera a memória ao terminar.
- **Ficaram de fora:** LTX-Video (a licença só é grátis para empresas com menos de US$ 10 milhões de faturamento, e na prática pede mais de 8 GB), HunyuanVideo (licença própria com exclusão de países e uns 14 GB no mínimo) e LTX Desktop (é um editor separado e pede 32 GB).
- **Antes de começar:** conferir a licença na página do modelo no Hugging Face e medir no Nitro 5 o tempo e a memória de um clipe de 5 s.
- **Medido de novo pelo serviço `comfyui` (15/10/2026):** 3 s em pé em 5 min 14 s e 5 s deitado em 9 min 1 s, com o HolyCut parado; a RAM livre do WSL desceu a 1,6 GB e a placa chegou a 87 °C. A geração entra pela tarefa `geracao_video` no painel Mídia.
- **Medido no Nitro 5 (14/10/2026):** licença Apache 2.0. Um clipe de 5 s em 480p levou 12 min 43 s, com pico de 9,7 GB de RAM e 7,8 GB de VRAM. Roda só com 12 GB de RAM no WSL e com a GPU livre (HolyCut parado ou sem modelo carregado); a tarefa precisa esperar a placa ficar livre e avisar que leva uns 13 minutos por clipe.

## 10. Animações e edição automática sem custo por uso

Analisado em 15/10/2026 a partir do fluxo "Claude Code + Video-Use + HyperFrames" (documento do dono). Lá, o Claude lê a transcrição, decide os cortes e escreve as animações em HTML; o Video-Use corta e legenda; o HyperFrames grava as animações em vídeo. O TakeOne faz o mesmo sem nada pago:

| Peça do fluxo | Lá | No TakeOne |
| --- | --- | --- |
| Transcrição palavra a palavra | ElevenLabs Scribe (API paga) | faster-whisper no worker de GPU (já existe) |
| Cortar silêncios, vícios, falsos começos e retakes | Video-Use (MIT) | Limpeza de fala da ferramenta Transcrição (já existe) |
| Legendas, cor e fades nos cortes | Video-Use | Já existem, com legendas animadas |
| Animações em HTML gravadas em vídeo | HyperFrames (Apache 2.0, HeyGen) | Clipe de animação (a fazer) |
| O "diretor" que planeja a edição | Claude (assinatura) | LLM aberto local pelo Ollama (a fazer) |

- **Clipe de animação:** a animação é uma página HTML com o tempo controlado (CSS, Web Animations ou Anime.js, MIT). O worker abre num Chrome sem tela, avança quadro a quadro e grava um vídeo da cor e outro da transparência, o mesmo par que o recorte do fundo usa; a prévia e o render tocam os mesmos arquivos. Os modelos são nossos, com campos (texto, cores, tempos) e as cores do kit de marca.
- **Sem GSAP:** a licença do GSAP é gratuita mas não é aberta e proíbe, sem autorização, ferramentas visuais que deixam o usuário montar animações. O HyperFrames aceita CSS, Web Animations e Anime.js, que bastam. O catálogo de blocos do HyperFrames não declara licença: não copiar de lá.
- **LLM local:** Qwen3 8B (Apache 2.0) pelo Ollama (MIT), uns 5 GB de VRAM em 4 bits, revezando a placa com o Whisper e o Wan pela fila de GPU (o modelo sai da memória no fim de cada job). Modelos de 8B erram ao escrever código do zero, então o diretor **escolhe e preenche**: lê a transcrição e devolve um plano em JSON com esquema fixo (cortes, título, tarjas, zooms, palavras em destaque) que vira comandos do editor. O resultado fica editável na linha do tempo, em vez de um MP4 fechado.
- **"Descreva a animação":** o LLM escreve o HTML a partir de um esqueleto com o relógio já ligado; a animação só entra se abrir sem erro e gerar quadros. Experimental.
- **Fora do produto:** como o dono já assina o Claude Code, o servidor MCP da fase 7 deixaria pedir edições em português direto do terminal, sem custo por uso. É uso pessoal, não uma peça do TakeOne.
- **Ordem:** (1) clipe de animação com modelos prontos; (2) Ollama + "Criar automaticamente" e destaque de palavras; (3) "Descreva a animação".
- [x] Clipe de animação com modelos prontos (ferramenta Elementos: tarja, título, revelação, CTA, contador e citação)
- [x] LLM local e "Criar automaticamente" (título, tarja, zooms e chamada a partir da fala; testado num vídeo de 47 s)
- [x] "Descreva a animação" (experimental: o LLM tenta primeiro os modelos prontos; escrevendo do zero, o modelo de 8B acerta pouco)
- [x] Biblioteca com 39 modelos em 10 categorias (CSS, Canvas 2D e Three.js), com miniaturas e teste em três proporções; a meta é chegar a uns 100, em lotes
- [x] Temas na biblioteca: 266 modelos (62 desenhos e 204 versões em 18 temas, de igreja a viagem), com filtro por tema no painel
- [x] Lote 2: 462 modelos (82 desenhos e 380 versões em 28 temas)
- [x] Lote 3: 689 modelos (104 desenhos e 585 versões em 36 temas)
- [x] Lote 4: 882 modelos (127 desenhos e 755 versões em 44 temas)
- [x] Biblioteca com 1000 modelos (lote 5: 145 desenhos e 855 versões em 50 temas)
