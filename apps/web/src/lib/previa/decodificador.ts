// Decodificador de vídeo da prévia, com WebCodecs. Lê do proxy só o cabeçalho (com o mp4box) e,
// depois, os grupos de quadros que precisa, por pedidos de intervalo (Range). Para mostrar um
// instante, decodifica a partir do quadro-chave anterior e entrega o quadro exato daquele instante,
// o que o elemento `<video>` não garante.
//
// Os quadros decodificados (VideoFrame) ocupam memória de vídeo e o decodificador trava se muitos
// ficarem abertos, então só uns poucos à frente do instante pedido ficam guardados; os que já
// passaram são fechados.
import {
  type Amostra,
  amostraNoTempo,
  bytesDasAmostras,
  chaveAnterior,
  fimDoGrupo,
  montarAmostras,
  ordemDeExibicao,
  quadroParaMostrar,
} from "./amostras.ts";

type Cabecalho = {
  config: VideoDecoderConfig;
  amostras: Amostra[];
  exibicao: number[];
  primeiroTempo: number;
  ultimoTempo: number;
};

/** Quanto do arquivo pedir de cada vez até achar o cabeçalho (o proxy tem o cabeçalho no começo). */
const PEDACO_CABECALHO = 1024 * 1024;
const MAXIMO_PEDACOS_CABECALHO = 64;
/** Quadros decodificados guardados à frente do instante pedido. */
const MAXIMO_A_FRENTE = 6;
/** Amostras esperando dentro do decodificador. */
const MAXIMO_NA_FILA = 8;
const GRUPOS_GUARDADOS = 3;
/**
 * Tocando para trás (o J), cada quadro pedido fica antes dos decodificados, e o decodificador só anda para a frente:
 * sem guardar nada, cada passo decodificava o grupo inteiro desde o quadro-chave (uns 60 quadros) para mostrar um.
 * Os quadros do grupo são copiados em imagens menores (os VideoFrame abertos travam o decodificador), uma passada por
 * grupo, até este tanto deles.
 */
const MAXIMO_PARA_TRAS = 75;
const LADO_PARA_TRAS = 854;
/** Parado depois de andar para trás (o ← quadro a quadro), o quadro volta a ser decodificado em resolução cheia. */
const REFINAR_PARADO_MS = 200;
/** A mesma folga do `quadroParaMostrar`. */
const FOLGA_PARA_TRAS_US = 500;

type QuadroParaTras = { tempo: number; fim: number; imagem: ImageBitmap | null };
const QUADRO_PADRAO_US = 33_333;

export function webCodecsDisponivel(): boolean {
  return typeof window !== "undefined" && "VideoDecoder" in window && "EncodedVideoChunk" in window;
}

// Um cabeçalho por arquivo: as duas metades de um clipe dividido usam o mesmo
const cabecalhos = new Map<string, Promise<Cabecalho>>();

function obterCabecalho(url: string): Promise<Cabecalho> {
  let cabecalho = cabecalhos.get(url);
  if (!cabecalho) {
    cabecalho = lerCabecalho(url);
    cabecalhos.set(url, cabecalho);
    cabecalho.catch(() => cabecalhos.delete(url));
  }
  return cabecalho;
}

type CaixaGravavel = { write: (stream: unknown) => void };

async function lerCabecalho(url: string): Promise<Cabecalho> {
  const { createFile, DataStream, Endianness, MP4BoxBuffer } = await import("mp4box");
  const arquivo = createFile();
  let pronto = false;
  let erro = "";
  arquivo.onReady = () => {
    pronto = true;
  };
  arquivo.onError = (_modulo, mensagem) => {
    erro = mensagem;
  };

  let posicao = 0;
  for (let pedaco = 0; pedaco < MAXIMO_PEDACOS_CABECALHO && !pronto && !erro; pedaco++) {
    const resposta = await fetch(url, { headers: { Range: `bytes=${posicao}-${posicao + PEDACO_CABECALHO - 1}` }, credentials: "same-origin" });
    if (resposta.status !== 206 && resposta.status !== 200) throw new Error(`O vídeo respondeu ${resposta.status}.`);
    const dados = await resposta.arrayBuffer();
    const inteiro = resposta.status === 200;
    const ultimo = inteiro || dados.byteLength < PEDACO_CABECALHO;
    posicao = arquivo.appendBuffer(MP4BoxBuffer.fromArrayBuffer(dados, inteiro ? 0 : posicao), ultimo);
    if (ultimo) {
      arquivo.flush();
      break;
    }
  }
  if (!pronto) throw new Error(erro || "Não achei o cabeçalho do vídeo.");

  const faixa = arquivo.getInfo().videoTracks[0];
  if (!faixa?.video) throw new Error("O arquivo não tem vídeo.");
  const trak = arquivo.getTrackById(faixa.id);
  if (!trak.samples?.length) throw new Error("O cabeçalho não lista os quadros (arquivo fragmentado).");

  // Primeira edição com mídia: o atraso que os quadros B colocam no começo
  const edicao = trak.edts?.elst?.entries.find((entrada) => entrada.media_time >= 0);
  const amostras = montarAmostras(trak.samples, trak.samples[0].timescale, edicao?.media_time ?? 0);
  const exibicao = ordemDeExibicao(amostras);

  const entrada = trak.mdia.minf.stbl.stsd.entries[0] as unknown as Record<string, CaixaGravavel | undefined>;
  const caixa = entrada.avcC ?? entrada.hvcC ?? entrada.vpcC ?? entrada.av1C;
  let description: Uint8Array | undefined;
  if (caixa) {
    const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
    caixa.write(stream);
    // Sem os 8 bytes do cabeçalho da caixa (tamanho e tipo)
    description = new Uint8Array(stream.buffer, 8);
  }
  const config: VideoDecoderConfig = { codec: faixa.codec, codedWidth: faixa.video.width, codedHeight: faixa.video.height, description };
  const suporte = await VideoDecoder.isConfigSupported(config);
  if (!suporte.supported) throw new Error(`O navegador não decodifica ${faixa.codec}.`);

  return {
    config,
    amostras,
    exibicao,
    primeiroTempo: amostras[exibicao[0]].tempo,
    ultimoTempo: amostras[exibicao[exibicao.length - 1]].tempo,
  };
}

type Grupo = { inicio: number; dados: Uint8Array };

export class DecodificadorDeVideo {
  /** Não deu para usar o WebCodecs neste arquivo: a prévia volta para o `<video>`. */
  falhou = false;
  private readonly url: string;
  private readonly aoMudar: () => void;
  private cabecalho: Cabecalho | null = null;
  private decodificador: VideoDecoder | null = null;
  /** Quadros decodificados, em ordem de exibição. */
  private quadros: VideoFrame[] = [];
  /** O último quadro entregue. Fica aberto até ser trocado, para a prévia não piscar durante uma busca. */
  private mostrado: VideoFrame | null = null;
  private alvo = 0;
  /** O instante pedido anda para trás: os quadros vêm das imagens guardadas do grupo (`atras`). */
  private paraTras = false;
  private readonly comParaTras: boolean;
  /** Os quadros do grupo, copiados enquanto anda para trás, em ordem de tempo (a imagem chega depois da cópia). */
  private atras: QuadroParaTras[] = [];
  /** A imagem mostrada para trás: fica até ser trocada, como o `mostrado`. */
  private mostradoAtras: ImageBitmap | null = null;
  /** Na passada para trás, já saiu um quadro depois do instante pedido: a passada pode parar. */
  private saiuDepoisDoAlvo = false;
  private refinar: ReturnType<typeof setTimeout> | null = null;
  /** Próxima amostra a enviar, na ordem de decodificação. */
  private proxima = 0;
  /** Instante do quadro-chave onde a decodificação atual começou. */
  private inicioDaDecodificacao = Number.POSITIVE_INFINITY;
  private terminou = false;
  /** Muda a cada busca: o que estava a caminho da busca anterior é ignorado. */
  private geracao = 0;
  private trabalhando = false;
  /** Alguém pediu trabalho enquanto o laço rodava: roda de novo no fim, para não perder o aviso. */
  private deNovo = false;
  private grupos = new Map<number, Promise<Grupo>>();
  private fechado = false;

  /** `paraTras`: a prévia anda para trás com o J; a exportação só anda para a frente e não guarda imagens. */
  constructor(url: string, aoMudar: () => void, { paraTras = true }: { paraTras?: boolean } = {}) {
    this.url = url;
    this.aoMudar = aoMudar;
    this.comParaTras = paraTras;
    void this.abrir();
  }

  private async abrir() {
    try {
      const cabecalho = await obterCabecalho(this.url);
      if (this.fechado) return;
      this.cabecalho = cabecalho;
      this.decodificador = new VideoDecoder({
        output: (quadro) => this.aoSair(quadro),
        error: (erro) => this.falhar(erro),
      });
      this.decodificador.addEventListener("dequeue", () => void this.trabalhar());
      this.decodificador.configure(cabecalho.config);
      void this.trabalhar();
    } catch (erro) {
      this.falhar(erro);
    }
  }

  private falhar(erro: unknown) {
    if (this.fechado || this.falhou) return;
    console.warn("Prévia: usando o elemento de vídeo, porque o WebCodecs falhou.", erro);
    this.falhou = true;
    this.aoMudar();
  }

  /**
   * O quadro do instante `segundos` da mídia, se já estiver decodificado; senão o último entregue
   * (ou null), e a decodificação continua em segundo plano, avisando por `aoMudar`.
   */
  quadroEm(segundos: number): VideoFrame | ImageBitmap | null {
    if (this.fechado || this.falhou) return null;
    const cabecalho = this.cabecalho;
    const alvo = Math.round(segundos * 1_000_000);
    const anterior = this.alvo;
    this.alvo = cabecalho ? Math.min(Math.max(alvo, cabecalho.primeiroTempo), cabecalho.ultimoTempo) : alvo;
    if (this.comParaTras && this.alvo < anterior && !this.paraTras) this.entrarParaTras();
    else if (this.alvo > anterior && this.paraTras) this.sairDoParaTras();
    if (this.paraTras) return this.quadroParaTras();

    const indice = this.indiceQueCobre();
    if (indice >= 0) {
      const quadro = this.quadros[indice];
      if (this.mostrado && this.mostrado !== quadro && !this.quadros.includes(this.mostrado)) this.mostrado.close();
      this.mostrado = quadro;
      this.podar(indice);
    } else {
      // Nenhum guardado cobre o instante: os que ficaram antes dele não voltam a servir (o decodificador só
      // anda para a frente). Segurá-los travava o decodificador num salto para a frente dentro do mesmo
      // grupo: com eles abertos, nenhum quadro novo saía, e só a saída de um quadro os fechava.
      const antes = this.quadros.filter((quadro) => quadro.timestamp < this.alvo).length;
      if (antes) this.podar(antes);
    }
    void this.trabalhar();
    // Logo depois de voltar do para trás, a imagem de lá segura a tela até o quadro de verdade chegar
    if (indice >= 0) this.soltarImagemAtras();
    return indice >= 0 ? this.quadros[0] : (this.mostrado ?? this.mostradoAtras);
  }

  private entrarParaTras() {
    this.paraTras = true;
    // Os decodificados para a frente não servem: a próxima passada começa no quadro-chave do instante
    for (const quadro of this.quadros) if (quadro !== this.mostrado) quadro.close();
    this.quadros = [];
    this.saiuDepoisDoAlvo = true;
  }

  private sairDoParaTras() {
    this.paraTras = false;
    if (this.refinar) clearTimeout(this.refinar);
    this.refinar = null;
    for (const quadro of this.atras) if (quadro.imagem !== this.mostradoAtras) quadro.imagem?.close();
    this.atras = [];
    // A passada para trás parou depois do instante: para a frente, começa de novo no quadro-chave dele
    this.inicioDaDecodificacao = Number.POSITIVE_INFINITY;
    this.mostrado?.close();
    this.mostrado = null;
  }

  private soltarImagemAtras() {
    if (!this.mostradoAtras) return;
    this.mostradoAtras.close();
    this.mostradoAtras = null;
  }

  /** Para trás: a imagem guardada que cobre o instante (ou a última mostrada, enquanto a passada não chega a ele). */
  private quadroParaTras(): ImageBitmap | VideoFrame | null {
    // Os que ficaram depois do instante já passaram
    while (this.atras.length && this.atras[this.atras.length - 1].tempo > this.alvo + FOLGA_PARA_TRAS_US) {
      const quadro = this.atras.pop()!;
      if (quadro.imagem !== this.mostradoAtras) quadro.imagem?.close();
    }
    const quadro = this.atras[this.atras.length - 1];
    if (quadro?.imagem && this.alvo < quadro.fim && quadro.imagem !== this.mostradoAtras) {
      this.mostradoAtras?.close();
      this.mostradoAtras = quadro.imagem;
    }
    // Parado (o ← quadro a quadro, ou o J que parou), o quadro volta a sair em resolução cheia
    if (this.refinar) clearTimeout(this.refinar);
    this.refinar = setTimeout(() => {
      this.refinar = null;
      if (this.fechado || !this.paraTras) return;
      this.sairDoParaTras();
      void this.trabalhar();
    }, REFINAR_PARADO_MS);
    void this.trabalhar();
    return this.mostradoAtras ?? this.mostrado;
  }

  /** Para trás: o quadro decodificado vira uma imagem menor guardada, e o VideoFrame é fechado logo. */
  private guardarParaTras(quadro: VideoFrame) {
    if (quadro.timestamp > this.alvo + FOLGA_PARA_TRAS_US) this.saiuDepoisDoAlvo = true;
    const jaTem = this.atras.some((item) => item.tempo === quadro.timestamp);
    if (quadro.timestamp > this.alvo + FOLGA_PARA_TRAS_US || jaTem) {
      quadro.close();
      return;
    }
    const entrada: QuadroParaTras = { tempo: quadro.timestamp, fim: quadro.timestamp + (quadro.duration ?? QUADRO_PADRAO_US), imagem: null };
    const lugar = this.atras.findIndex((item) => item.tempo > entrada.tempo);
    if (lugar < 0) this.atras.push(entrada);
    else this.atras.splice(lugar, 0, entrada);
    // O fim de cada um é o começo do seguinte
    for (let i = 0; i + 1 < this.atras.length; i++) this.atras[i].fim = this.atras[i + 1].tempo;
    while (this.atras.length > MAXIMO_PARA_TRAS) this.atras.shift()?.imagem?.close();
    const escala = Math.min(1, LADO_PARA_TRAS / Math.max(quadro.displayWidth, quadro.displayHeight));
    createImageBitmap(quadro, { resizeWidth: Math.round(quadro.displayWidth * escala), resizeHeight: Math.round(quadro.displayHeight * escala), resizeQuality: "medium" })
      .then((imagem) => {
        if (this.fechado || !this.atras.includes(entrada)) imagem.close();
        else {
          entrada.imagem = imagem;
          this.aoMudar();
        }
      })
      .catch(() => {})
      .finally(() => quadro.close());
  }

  /**
   * Para a exportação no navegador: o quadro do instante só quando ele já está decodificado (nunca o
   * anterior, que a prévia mostra enquanto espera); null enquanto não, e a decodificação continua.
   */
  quadroExatoEm(segundos: number): VideoFrame | null {
    const quadro = this.quadroEm(segundos);
    // Sem o para trás (a exportação), o quadro é sempre um VideoFrame
    return !this.paraTras && this.indiceQueCobre() >= 0 ? (quadro as VideoFrame) : null;
  }

  /** Índice do quadro guardado que está na tela no instante pedido, ou -1. */
  private indiceQueCobre(): number {
    const inicios = this.quadros.map((quadro) => quadro.timestamp);
    const indice = quadroParaMostrar(inicios, this.alvo);
    if (indice < 0) return -1;
    const quadro = this.quadros[indice];
    const fim = indice + 1 < this.quadros.length ? this.quadros[indice + 1].timestamp : quadro.timestamp + (quadro.duration ?? QUADRO_PADRAO_US);
    const ultimoDoArquivo = this.cabecalho !== null && quadro.timestamp >= this.cabecalho.ultimoTempo;
    return this.alvo < fim || ultimoDoArquivo ? indice : -1;
  }

  /** Fecha os quadros antes do índice (já passaram). */
  private podar(indice: number) {
    for (const quadro of this.quadros.splice(0, indice)) if (quadro !== this.mostrado) quadro.close();
  }

  private aoSair(quadro: VideoFrame) {
    if (this.fechado) {
      quadro.close();
      return;
    }
    if (this.paraTras) {
      this.guardarParaTras(quadro);
      void this.trabalhar();
      return;
    }
    this.quadros.push(quadro);
    const indice = quadroParaMostrar(
      this.quadros.map((item) => item.timestamp),
      this.alvo,
    );
    if (indice > 0) this.podar(indice);
    this.aoMudar();
    void this.trabalhar();
  }

  private buscar(cabecalho: Cabecalho) {
    const decodificador = this.decodificador!;
    this.geracao++;
    decodificador.reset();
    decodificador.configure(cabecalho.config);
    for (const quadro of this.quadros) if (quadro !== this.mostrado) quadro.close();
    this.quadros = [];
    this.proxima = chaveAnterior(cabecalho.amostras, amostraNoTempo(cabecalho.amostras, cabecalho.exibicao, this.alvo));
    // Com GOP aberto, um quadro B pode aparecer antes do quadro-chave: o mínimo evita buscar de novo sem fim
    this.inicioDaDecodificacao = Math.min(cabecalho.amostras[this.proxima].tempo, this.alvo);
    this.terminou = false;
    this.saiuDepoisDoAlvo = false;
  }

  private precisaBuscar(cabecalho: Cabecalho): boolean {
    if (this.paraTras) {
      // Uma guardada cobre (ou vai cobrir, quando a cópia terminar) o instante, ou a passada ainda chega nele
      const quadro = this.atras.findLast((item) => item.tempo <= this.alvo + FOLGA_PARA_TRAS_US);
      if (quadro && this.alvo < quadro.fim) return false;
      return !(this.inicioDaDecodificacao <= this.alvo && !this.saiuDepoisDoAlvo);
    }
    if (this.indiceQueCobre() >= 0) return false;
    if (this.inicioDaDecodificacao === Number.POSITIVE_INFINITY) return true;
    // Para trás: o decodificador só anda para a frente
    if (this.alvo < this.inicioDaDecodificacao) return true;
    if (this.quadros.length && this.alvo < this.quadros[0].timestamp) return true;
    // Para a frente: se o grupo do instante pedido começa depois do que já foi enviado, pular até ele
    // poupa decodificar o caminho todo
    const chave = chaveAnterior(cabecalho.amostras, amostraNoTempo(cabecalho.amostras, cabecalho.exibicao, this.alvo));
    return chave > this.proxima;
  }

  private quadrosAFrente(): number {
    return this.quadros.filter((quadro) => quadro.timestamp > this.alvo).length;
  }

  /** Envia amostras ao decodificador até ter quadros suficientes à frente do instante pedido. */
  private async trabalhar() {
    const cabecalho = this.cabecalho;
    const decodificador = this.decodificador;
    if (this.fechado || this.falhou || !cabecalho || !decodificador || decodificador.state !== "configured") return;
    if (this.trabalhando) {
      this.deNovo = true;
      return;
    }
    this.trabalhando = true;
    this.deNovo = false;
    try {
      if (this.precisaBuscar(cabecalho)) this.buscar(cabecalho);
      const { amostras } = cabecalho;
      while (
        !this.fechado &&
        this.proxima < amostras.length &&
        decodificador.decodeQueueSize < MAXIMO_NA_FILA &&
        (this.paraTras ? !this.saiuDepoisDoAlvo : this.quadrosAFrente() < MAXIMO_A_FRENTE)
      ) {
        const geracao = this.geracao;
        const indice = this.proxima;
        const grupo = await this.grupo(cabecalho, chaveAnterior(amostras, indice));
        if (this.fechado || geracao !== this.geracao || decodificador.state !== "configured") break;
        const amostra = amostras[indice];
        const inicio = amostra.posicao - grupo.inicio;
        decodificador.decode(
          new EncodedVideoChunk({
            type: amostra.chave ? "key" : "delta",
            timestamp: amostra.tempo,
            duration: amostra.duracao,
            data: grupo.dados.subarray(inicio, inicio + amostra.tamanho),
          }),
        );
        this.proxima = indice + 1;
        // Já pede o próximo grupo, para ele chegar antes de ser preciso
        if (indice + 1 < amostras.length && amostras[indice + 1].chave) void this.grupo(cabecalho, indice + 1);
      }
      // No fim do arquivo, os últimos quadros só saem com flush (o decodificador segura os B)
      if (this.proxima >= amostras.length && !this.terminou && decodificador.state === "configured") {
        this.terminou = true;
        decodificador.flush().catch(() => {});
      }
    } catch (erro) {
      this.falhar(erro);
    } finally {
      this.trabalhando = false;
    }
    if (!this.fechado && (this.deNovo || this.precisaBuscar(cabecalho))) void this.trabalhar();
  }

  private grupo(cabecalho: Cabecalho, chave: number): Promise<Grupo> {
    const guardado = this.grupos.get(chave);
    if (guardado) return guardado;
    const [primeiro, ultimo] = bytesDasAmostras(cabecalho.amostras, chave, fimDoGrupo(cabecalho.amostras, chave));
    const pedido = fetch(this.url, { headers: { Range: `bytes=${primeiro}-${ultimo - 1}` }, credentials: "same-origin" }).then(async (resposta) => {
      if (resposta.status !== 206 && resposta.status !== 200) throw new Error(`O vídeo respondeu ${resposta.status}.`);
      const dados = new Uint8Array(await resposta.arrayBuffer());
      // Servidor sem Range devolve o arquivo inteiro: os bytes começam no zero
      return resposta.status === 200 ? { inicio: 0, dados } : { inicio: primeiro, dados };
    });
    pedido.catch(() => this.grupos.delete(chave));
    this.grupos.set(chave, pedido);
    while (this.grupos.size > GRUPOS_GUARDADOS) this.grupos.delete(this.grupos.keys().next().value!);
    return pedido;
  }

  fechar() {
    this.fechado = true;
    if (this.refinar) clearTimeout(this.refinar);
    for (const quadro of this.atras) if (quadro.imagem !== this.mostradoAtras) quadro.imagem?.close();
    this.atras = [];
    this.soltarImagemAtras();
    if (this.decodificador && this.decodificador.state !== "closed") this.decodificador.close();
    for (const quadro of this.quadros) if (quadro !== this.mostrado) quadro.close();
    this.mostrado?.close();
    this.quadros = [];
    this.mostrado = null;
    this.grupos.clear();
  }
}
