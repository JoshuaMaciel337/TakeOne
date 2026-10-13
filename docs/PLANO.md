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
| ArtCraft e artcraft-services (`storytold/artcraft`, `storytold/artcraft-services`) | "ArtCraft License" (fair source) | **Não usar.** A licença proíbe usar o código para criar um produto concorrente de ferramentas de imagem e vídeo com IA, e é o caso do editor. Também ficam de fora os repositórios sem licença (`artcraftx`, `storyteller-ml`, `cloud-worker`, `realtime-voice-conversion`). |
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
- [x] Render no worker a partir do mesmo JSON, generalizando o `render.py` do HolyCut para várias faixas. Exportar MP4 em 720p, 1080p e 4K, com progresso, download e QR para o celular. **Falta ver rodar com o FFmpeg** (escrito na máquina sem FFmpeg; o teste roda no CI e no Nitro).
- [ ] Teste automático que compara quadros da prévia e do render. Feito pela metade: o render é conferido ponto a ponto contra a geometria (`test_render_segue_a_geometria_da_previa`, roda com FFmpeg), e a prévia contra a mesma geometria só por script no navegador, fora do CI.

### Fase 3: texto, áudio e legendas (2 semanas)
- Texto (faixa de texto por cima de tudo; o PNG do texto é desenhado pela API e é o mesmo no render):
  - [x] fontes (Montserrat, Inter e Caveat, OFL), negrito, maiúsculas e alinhamento
  - [x] cor
  - [x] contorno
  - [x] sombra
  - [x] fundo
  - [x] estilos prontos
  - animações de entrada, saída e loop (animadores de texto do EffectCraft)
  - estilos de contorno, sombra e brilho (estilos de camada do PhotoCraft)
- Áudio:
  - faixas de música e efeitos sonoros
  - [x] volume (até 400%) e fades de entrada e saída lineares, na prévia e no render
  - fades em outros formatos (SoundCraft)
  - ducking sob a voz (do HolyCut)
  - loudness medido (`audio-dsp` do FilmCraft)
  - efeitos de voz: EQ, reverb, eco, mudança de tom (SoundCraft)
- Legendas automáticas (Whisper do HolyCut) com os presets animados.
- Editar a legenda e importar/exportar SRT e VTT (`captions` do FilmCraft).

### Fase 4: efeitos, transições e cor (2 a 3 semanas)
- Transições entre clipes:
  - fusão
  - escurecer
  - deslizar
  - empurrar
  - zoom
  - desfoque
  - wipes
- Ajustes de cor portados do FilmCraft e do LightCraft:
  - temperatura
  - exposição
  - contraste
  - realces
  - sombras
  - saturação
  - curvas
  - rodas de cor
  - vinheta
  - granulação
- Filtros prontos com intensidade.
- Efeitos de vídeo, escolhidos do catálogo do EffectCraft e do PhotoCraft:
  - desfoque
  - brilho
  - tremor
  - zoom
  - luz
  - glitch
  - VHS
  - distorções
  - modos de mesclagem
- Chroma key (tela verde), com o `keying` do EffectCraft.
- Keyframes em qualquer propriedade (`keyframe` do EffectCraft) e velocidade com curva, mantendo o tom da voz (SoundCraft).

### Fase 5: IA no estilo CapCut (3+ semanas)
- Já existem no HolyCut e só precisam ser generalizados:
  - edição pelo texto (Transcrição)
  - cortar silêncios e vícios
  - limpar a voz
  - reenquadrar seguindo o rosto
  - redução de ruído na imagem
  - "Criar automaticamente"
- Novos:
  - recortar o fundo do vídeo (`segment` do EffectCraft, com MediaPipe ou MobileSAM)
  - **gerar vídeo com IA:** clipes curtos (B-roll, fundo, transição) a partir de um texto ou de uma imagem, com o Wan 2.2 TI2V-5B. Detalhes na seção 9.
  - batida automática: cortar e animar no ritmo da música (detecção de batidas do SoundCraft)
  - texto ou adesivo que segue um objeto, e estabilização (`track` do EffectCraft)
  - texto em fala (TTS com modelo aberto)
  - edição automática a partir de vários clipes
  - destacar a palavra-chave da legenda com o LLM
- Fica fora do escopo, pelas regras do dono no HolyCut: avatar de IA, dublagem, clonagem de voz e lip-sync.

### Fase 6: modelos, elementos e marca (2 semanas)
- Modelos de projeto (os nossos, criados do zero), guardados no formato do projeto, com animações em Lottie.
- Elementos: figuras, adesivos animados (Lottie, pelo `lottie` do EffectCraft) e formas (`svg` e `pathops` do VectorCraft). Desenhos próprios ou com licença aberta.
- Banco de imagens e vídeos da Pixabay, já no HolyCut.
- Kit de marca: logo, cores e fontes da organização (o "Sua Identidade" do HolyCut).
- Levar a edição para DaVinci/Premiere (`interchange` do FilmCraft).
- Exportação rápida no navegador para vídeos curtos.

### Fase 7: extras
- Máscaras desenhadas (do LightCraft e do EffectCraft) e multicâmera (do FilmCraft).
- Expressões nos keyframes (`wiggle`, `loopOut`), do `expr` do EffectCraft.
- Servidor MCP, para agentes editarem pelos comandos.
- Publicar direto no YouTube, TikTok e Instagram.
- Colaboração e links de aprovação (do HolyCut).

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

1. **Nome:** TakeOne. Visual próprio: tema escuro, destaque em degradê de coral (`#ff6a3d`) para magenta (`#ff3d77`), fontes Inter e Sora, ícones do `lucide-react`.
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
