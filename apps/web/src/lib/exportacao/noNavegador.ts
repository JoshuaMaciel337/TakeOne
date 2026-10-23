// Exportação rápida no navegador, para vídeos curtos em 720p: o mesmo desenho da prévia (as camadas de
// lib/previa/camadas.ts no compositor), quadro a quadro e no quadro exato, codificado em H.264 pelo
// próprio navegador (WebCodecs), e o som misturado sem tempo real com a mesma cadeia da prévia
// (lib/previa/audio.ts), levado a -14 LUFS e limitado nos picos como no render (somFinal.ts). O MP4 sai
// pelo mp4-muxer (MIT). Lê as mesmas cópias leves da prévia, por isso só 720p.
//
// O som com velocidade mudada fica para o servidor: o navegador não muda a velocidade sem mudar o tom.
import { expandirFundoDesfocado } from "../projeto/fundoDesfocado.ts";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";

import { arquivoDaMidia } from "@/lib/api";
import { ajustarCadeia, criarCadeia } from "@/lib/previa/audio";
import { arquivoDaImagemDoClipe, arquivoDoSom, clipeNaFonte } from "@/lib/previa/arquivos";
import { type CamadaNaTela, camadaDoCompositor, camadasNoTempo, type ItemDaPrevia, textosParaImagens, visuaisNoTempo } from "@/lib/previa/camadas";
import { type Camada, Compositor, FUNDO } from "@/lib/previa/compositor";
import { DecodificadorDeVideo, webCodecsDisponivel } from "@/lib/previa/decodificador";
import { imagemDeTexto, type ImagemDeTexto } from "@/lib/previa/imagensDeTexto";
import { fatorDoAbaixamento } from "@/lib/projeto/abaixar";
import { fatorDoNivelamento } from "@/lib/projeto/nivelar";
import { volumeNoTempo } from "@/lib/projeto/keyframes";
import { fatorDosFades, fimDoClipe, type Projeto } from "@/lib/projeto/modelo";
import { pendenciaParaONavegador } from "@/lib/projeto/pendencias";
import { ganhoParaIgualar } from "@/lib/projeto/som";
import { fatorDaMistura, type JanelaDoClipe, janelasDoSom } from "@/lib/projeto/transicao";
import { duracaoDoQuadro, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import { acabarSom, ganhoParaOAlvo, loudnessIntegrado } from "./somFinal";

/** O lado menor do vídeo: o das cópias leves que a prévia lê. */
export const LADO_NO_NAVEGADOR = 720;
/** Mais que isso fica para o servidor: o vídeo inteiro fica na memória até o fim. */
export const DURACAO_MAXIMA_NO_NAVEGADOR_S = 180;
const TAXA_DO_SOM = 48000;
const BITRATE_DO_VIDEO = 6_000_000;
const BITRATE_DO_SOM = 192_000;
/** O ganho dos clipes muda 200 vezes por segundo (fades e abaixar na fala). */
const PONTOS_DE_GANHO_POR_SEGUNDO = 200;
const ESPERA_DO_QUADRO_MS = 15_000;

export type Progresso = (fracao: number, etapa: string) => void;

/** O tamanho do vídeo, como o render faz: a resolução é o lado menor, sempre par. */
export function tamanhoNoNavegador(proporcao: string): { largura: number; altura: number } {
  const [l, a] = proporcao.split(":").map(Number);
  const par = (valor: number) => Math.max(2, Math.round(valor / 2) * 2);
  return l >= a ? { largura: par((LADO_NO_NAVEGADOR * l) / a), altura: LADO_NO_NAVEGADOR } : { largura: LADO_NO_NAVEGADOR, altura: par((LADO_NO_NAVEGADOR * a) / l) };
}

/** Os clipes que soam: das faixas de áudio e das de vídeo visíveis, que não estão mudas, com mídia que tem som. */
function clipesComSom(projeto: Projeto, midias: ReadonlyMap<string, Midia>): ItemDaPrevia[] {
  return projeto.faixas
    .filter((faixa) => !faixa.muda && (faixa.tipo === "audio" || (faixa.tipo !== "texto" && faixa.tipo !== "legenda" && !faixa.oculta)))
    .flatMap((faixa) =>
      faixa.clipes.flatMap((clipe) => {
        const midia = clipe.midia_id ? midias.get(clipe.midia_id) : undefined;
        return midia?.audio && midia.status === "pronta" && clipe.volume > 0 && !clipe.som_separado
          ? [{ chave: `${faixa.id}:${clipe.id}`, clipe: clipeNaFonte(clipe, midia, true), faixa, midia, ativo: true }]
          : [];
      }),
    );
}

/** Por que este projeto tem de sair pelo servidor, ou null se o navegador dá conta. */
export function motivoParaOServidor(projeto: Projeto, midias: ReadonlyMap<string, Midia>): string | null {
  if (typeof window === "undefined" || !webCodecsDisponivel() || !("VideoEncoder" in window) || !("AudioEncoder" in window) || !("OfflineAudioContext" in window)) {
    return "Este navegador não tem os codificadores de vídeo (use o Chrome ou o Edge atualizados).";
  }
  if (projeto.duracao <= 0) return "O projeto está vazio.";
  if (projeto.duracao > DURACAO_MAXIMA_NO_NAVEGADOR_S * TICKS_POR_SEGUNDO) return `No navegador, só vídeos de até ${DURACAO_MAXIMA_NO_NAVEGADOR_S / 60} minutos.`;
  if (clipesComSom(projeto, midias).some(({ clipe }) => clipe.velocidade !== 1 || clipe.curva_velocidade)) {
    return "Há som com a velocidade mudada: o navegador não muda a velocidade sem mudar o tom.";
  }
  return pendenciaParaONavegador(projeto, midias);
}

class Cancelado extends Error {}

function conferir(sinal: AbortSignal) {
  if (sinal.aborted) throw new Cancelado("Exportação cancelada.");
}

/** O som do projeto inteiro, misturado sem tempo real e já com o acabamento do render. */
async function misturarSom(projeto: Projeto, midias: ReadonlyMap<string, Midia>, sinal: AbortSignal, aoProgresso: Progresso): Promise<Float32Array[]> {
  const duracaoS = projeto.duracao / TICKS_POR_SEGUNDO;
  const total = Math.ceil(duracaoS * TAXA_DO_SOM);
  const ctx = new OfflineAudioContext(2, total, TAXA_DO_SOM);
  const decodificados = new Map<string, Promise<AudioBuffer>>();
  const decodificar = (url: string) => {
    let pedido = decodificados.get(url);
    if (!pedido) {
      pedido = fetch(url, { credentials: "same-origin", signal: sinal })
        .then((resposta) => (resposta.ok ? resposta.arrayBuffer() : Promise.reject(new Error(`O som respondeu ${resposta.status}.`))))
        .then((dados) => ctx.decodeAudioData(dados));
      decodificados.set(url, pedido);
    }
    return pedido;
  };
  const itens = clipesComSom(projeto, midias);
  const precisaDaSala = itens.some(({ clipe }) => (clipe.efeitos_voz?.reverb ?? 0) > 0);
  const sala = precisaDaSala ? await decodificar("/api/som/reverb.wav") : null;
  // Na principal, as transições que misturam o som estendem o som dos dois clipes (janelasDoSom)
  const principal = projeto.faixas.find((faixa) => faixa.tipo === "principal");
  const janelas = principal ? janelasDoSom(principal.clipes, duracaoDoQuadro(projeto.taxa)) : new Map<string, JanelaDoClipe>();
  for (const [i, item] of itens.entries()) {
    conferir(sinal);
    aoProgresso((0.15 * i) / Math.max(1, itens.length), "Preparando o som");
    const { clipe, midia } = item;
    const buffer = await decodificar(arquivoDoSom(item));
    const fonte = ctx.createBufferSource();
    fonte.buffer = buffer;
    const cadeia = criarCadeia(ctx, fonte, ctx.destination);
    ajustarCadeia(ctx, cadeia, clipe.efeitos_voz, sala);
    // A janela da mistura: o som vai além do clipe só até onde a mídia tem (como o render, que lê só o que existe)
    const janela = janelas.get(clipe.id);
    const duracaoDoClipeS = clipe.duracao / TICKS_POR_SEGUNDO;
    const entradaS = clipe.entrada / TICKS_POR_SEGUNDO;
    const limiteS = midia.video?.duracao || midia.duracao || Infinity;
    const antesS = janela ? Math.min((clipe.inicio - janela.inicio) / TICKS_POR_SEGUNDO, entradaS / clipe.velocidade) : 0;
    const depoisS = janela
      ? Math.max(0, Math.min((janela.fim - fimDoClipe(clipe)) / TICKS_POR_SEGUNDO, (limiteS - entradaS - duracaoDoClipeS * clipe.velocidade) / clipe.velocidade))
      : 0;
    const comeco = clipe.inicio - Math.round(antesS * TICKS_POR_SEGUNDO);
    const total = Math.round((antesS + duracaoDoClipeS + depoisS) * TICKS_POR_SEGUNDO);
    // O ganho do clipe a cada 5 ms: volume, igualar, fades, abaixar na fala e a mistura, como a prévia calcula
    const igualar = clipe.igualar_volume ? 10 ** (ganhoParaIgualar(midia.audio?.lufs) / 20) : 1;
    const pontos = Math.max(2, Math.ceil((total / TICKS_POR_SEGUNDO) * PONTOS_DE_GANHO_POR_SEGUNDO) + 1);
    const curva = Float32Array.from({ length: pontos }, (_, k) => {
      const t = comeco + Math.round((total * k) / (pontos - 1));
      return (
        volumeNoTempo(clipe, t) *
        igualar *
        fatorDosFades(clipe, Math.min(t, clipe.inicio + clipe.duracao - 1)) *
        fatorDoAbaixamento(clipe, t) *
        fatorDoNivelamento(clipe, t) *
        fatorDaMistura(janela?.efeitos, t)
      );
    });
    cadeia.ganho.gain.setValueCurveAtTime(curva, comeco / TICKS_POR_SEGUNDO, total / TICKS_POR_SEGUNDO);
    fonte.start(comeco / TICKS_POR_SEGUNDO, entradaS - antesS * clipe.velocidade, total / TICKS_POR_SEGUNDO);
  }
  conferir(sinal);
  aoProgresso(0.15, "Misturando o som");
  const mistura = await ctx.startRendering();
  const canais = [Float32Array.from(mistura.getChannelData(0)), Float32Array.from(mistura.getChannelData(1))];
  acabarSom(canais, TAXA_DO_SOM, ganhoParaOAlvo(loudnessIntegrado(canais, TAXA_DO_SOM)));
  return canais;
}

/** O que uma camada de mídia pede para o quadro: a imagem parada, ou o vídeo (e a máscara do fundo). */
type PedidoDeFonte = { camada: CamadaNaTela; imagem: string } | { camada: CamadaNaTela; video: string; mascara: string | null };

/** Um decodificador por arquivo e chave do clipe, com a espera pelo quadro exato. */
class Fontes {
  private readonly decodificadores = new Map<string, { decodificador: DecodificadorDeVideo; avisos: (() => void)[]; usadoEm: number }>();
  private readonly imagens = new Map<string, Promise<ImageBitmap>>();

  /**
   * O quadro exato de `url` no instante. `chave` separa os clipes: numa transição entre duas metades da
   * mesma mídia, cada uma tem o seu decodificador (com um só, ele voltaria no vídeo a cada quadro).
   */
  async esperar(chave: string, url: string, segundos: number, quadroAtual: number, sinal: AbortSignal): Promise<void> {
    const nome = `${chave}|${url}`;
    let registro = this.decodificadores.get(nome);
    if (!registro) {
      const avisos: (() => void)[] = [];
      const decodificador = new DecodificadorDeVideo(url, () => avisos.splice(0).forEach((avisar) => avisar()));
      registro = { decodificador, avisos, usadoEm: quadroAtual };
      this.decodificadores.set(nome, registro);
    }
    registro.usadoEm = quadroAtual;
    const limite = performance.now() + ESPERA_DO_QUADRO_MS;
    for (;;) {
      conferir(sinal);
      if (registro.decodificador.falhou) throw new Error("O navegador não conseguiu ler um dos vídeos. Exporte pelo servidor.");
      if (registro.decodificador.quadroExatoEm(segundos)) return;
      if (performance.now() > limite) throw new Error("Um dos vídeos demorou demais para entregar o quadro. Exporte pelo servidor.");
      // Espera o próximo aviso do decodificador (com um teto, para o laço conferir o cancelamento)
      await new Promise<void>((pronto) => {
        registro!.avisos.push(pronto);
        setTimeout(pronto, 200);
      });
    }
  }

  /** O quadro exato, sem esperar: null se ele saiu da memória do decodificador depois da espera. */
  coletar(chave: string, url: string, segundos: number): VideoFrame | null {
    return this.decodificadores.get(`${chave}|${url}`)?.decodificador.quadroExatoEm(segundos) ?? null;
  }

  imagem(url: string): Promise<ImageBitmap> {
    let pedido = this.imagens.get(url);
    if (!pedido) {
      pedido = fetch(url, { credentials: "same-origin" })
        .then((resposta) => (resposta.ok ? resposta.blob() : Promise.reject(new Error(`A imagem respondeu ${resposta.status}.`))))
        .then((blob) => createImageBitmap(blob, { premultiplyAlpha: "premultiply" }));
      this.imagens.set(url, pedido);
    }
    return pedido;
  }

  /** Fecha os decodificadores que não aparecem há um tempo (o vídeo não volta: a exportação só anda para a frente). */
  soltarAntigos(quadroAtual: number, folga: number) {
    for (const [nome, registro] of this.decodificadores) {
      if (quadroAtual - registro.usadoEm > folga) {
        registro.decodificador.fechar();
        this.decodificadores.delete(nome);
      }
    }
  }

  fechar() {
    for (const { decodificador } of this.decodificadores.values()) decodificador.fechar();
    this.decodificadores.clear();
    void Promise.all([...this.imagens.values()].map((p) => p.then((imagem) => imagem.close()).catch(() => {})));
    this.imagens.clear();
  }
}

/** Configuração do som: AAC quando o navegador codifica, senão Opus (o MP4 aceita os dois). */
async function configuracaoDoSom(): Promise<{ codec: "aac" | "opus"; config: AudioEncoderConfig }> {
  for (const [codec, nome] of [["aac", "mp4a.40.2"], ["opus", "opus"]] as const) {
    const config: AudioEncoderConfig = { codec: nome, sampleRate: TAXA_DO_SOM, numberOfChannels: 2, bitrate: BITRATE_DO_SOM };
    if ((await AudioEncoder.isConfigSupported(config)).supported) return { codec, config };
  }
  throw new Error("Este navegador não codifica som. Exporte pelo servidor.");
}

async function configuracaoDoVideo(largura: number, altura: number, fps: number): Promise<VideoEncoderConfig> {
  for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42e028"]) {
    const config: VideoEncoderConfig = { codec, width: largura, height: altura, bitrate: BITRATE_DO_VIDEO, framerate: fps, avc: { format: "avc" } };
    if ((await VideoEncoder.isConfigSupported(config)).supported) return config;
  }
  throw new Error("Este navegador não codifica H.264. Exporte pelo servidor.");
}

/** O MP4 do projeto em 720p. Lança erro com a mensagem para a pessoa (ou "Exportação cancelada."). */
export async function exportarNoNavegador(projetoDaEdicao: Projeto, midias: ReadonlyMap<string, Midia>, aoProgresso: Progresso, sinal: AbortSignal): Promise<Blob> {
  // Como a prévia: o fundo desfocado vira duas cópias do clipe
  const projeto = expandirFundoDesfocado(projetoDaEdicao);
  const motivo = motivoParaOServidor(projeto, midias);
  if (motivo) throw new Error(motivo);
  const { largura, altura } = tamanhoNoNavegador(projeto.proporcao);
  const fps = projeto.taxa.num / projeto.taxa.den;
  const quadro = duracaoDoQuadro(projeto.taxa);
  const totalDeQuadros = Math.round(projeto.duracao / quadro);
  const [som, configDoVideo, configDoSom] = await Promise.all([misturarSom(projeto, midias, sinal, aoProgresso), configuracaoDoVideo(largura, altura, fps), configuracaoDoSom()]);

  const alvo = new ArrayBufferTarget();
  const muxer = new Muxer({
    target: alvo,
    video: { codec: "avc", width: largura, height: altura, frameRate: fps },
    audio: { codec: configDoSom.codec, numberOfChannels: 2, sampleRate: TAXA_DO_SOM },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });
  let falha: Error | null = null;
  const codificadorDoVideo = new VideoEncoder({ output: (pedaco, meta) => muxer.addVideoChunk(pedaco, meta), error: (erro) => (falha = erro) });
  codificadorDoVideo.configure(configDoVideo);
  const codificadorDoSom = new AudioEncoder({ output: (pedaco, meta) => muxer.addAudioChunk(pedaco, meta), error: (erro) => (falha = erro) });
  codificadorDoSom.configure(configDoSom.config);

  // O som entra em blocos de 1024 amostras (os quadros do AAC), planar (um canal depois do outro). O último
  // bloco incompleto fica de fora: o codificador o completaria com silêncio e o arquivo passaria do vídeo; ali
  // o som já está no fim do fade de saída (50 ms até zero)
  const BLOCO = 1024;
  const amostras = Math.floor(som[0].length / BLOCO) * BLOCO;
  for (let inicio = 0; inicio < amostras; inicio += BLOCO) {
    const tamanho = BLOCO;
    const dados = new Float32Array(tamanho * 2);
    dados.set(som[0].subarray(inicio, inicio + tamanho), 0);
    dados.set(som[1].subarray(inicio, inicio + tamanho), tamanho);
    const bloco = new AudioData({ format: "f32-planar", sampleRate: TAXA_DO_SOM, numberOfFrames: tamanho, numberOfChannels: 2, timestamp: Math.round((inicio * 1e6) / TAXA_DO_SOM), data: dados });
    codificadorDoSom.encode(bloco);
    bloco.close();
  }

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const compositor = new Compositor(canvas);
  const fontes = new Fontes();
  const tamanho = { largura, altura };
  try {
    // As imagens dos textos, todas antes (a mesma que a prévia usa)
    const imagensDeTexto = new Map<string, ImagemDeTexto>();
    await Promise.all(textosParaImagens(projeto).map(async ({ id, texto }) => imagensDeTexto.set(id, await imagemDeTexto(texto))));
    for (let k = 0; k < totalDeQuadros; k++) {
      conferir(sinal);
      if (falha) throw falha;
      const tempo = k * quadro;
      const visuais = visuaisNoTempo(projeto, midias, tempo);
      const camadas = camadasNoTempo(projeto, visuais, tempo, tamanho, imagensDeTexto);
      // Primeiro espera todas as fontes do quadro; depois pega os quadros de uma vez, sem nenhuma espera no
      // meio: enquanto um decodificador espera, os outros continuam e podem trocar o quadro que já tinham
      const pedidos = camadas.flatMap((camada): PedidoDeFonte[] => {
        if (camada.imagem) return [];
        const item = visuais.find((v) => v.chave === camada.chave)!;
        if (item.midia.imagem) return [{ camada, imagem: arquivoDaMidia(item.midia.id, "proxy.webp") }];
        const video = arquivoDaMidia(item.midia.id, arquivoDaImagemDoClipe(item.clipe, item.midia));
        const mascara = camada.clipe.remover_fundo && item.midia.arquivos.includes("mascara.mp4") ? arquivoDaMidia(item.midia.id, "mascara.mp4") : null;
        return [{ camada, video, mascara }];
      });
      let prontas: Camada[] | null = null;
      for (let tentativa = 0; !prontas; tentativa++) {
        if (tentativa > 20) throw new Error("Os vídeos não entregaram os quadros juntos. Exporte pelo servidor.");
        const imagens = new Map<string, ImageBitmap>();
        for (const pedido of pedidos) {
          if ("imagem" in pedido) imagens.set(pedido.imagem, await fontes.imagem(pedido.imagem));
          else {
            await fontes.esperar(pedido.camada.chave, pedido.video, pedido.camada.segundos, k, sinal);
            if (pedido.mascara) await fontes.esperar(pedido.camada.chave, pedido.mascara, pedido.camada.segundos, k, sinal);
          }
        }
        const coletadas: Camada[] = [];
        let faltou = false;
        for (const camada of camadas) {
          if (camada.clipe.ajuste) {
            coletadas.push(camadaDoCompositor(camada, FUNDO, null));
            continue;
          }
          const pedido = pedidos.find((p) => p.camada === camada);
          if (!pedido) {
            coletadas.push(camadaDoCompositor(camada, camada.imagem!, null));
            continue;
          }
          if ("imagem" in pedido) {
            coletadas.push(camadaDoCompositor(camada, imagens.get(pedido.imagem)!, null));
            continue;
          }
          const fonte = fontes.coletar(camada.chave, pedido.video, camada.segundos);
          const mascara = pedido.mascara ? fontes.coletar(camada.chave, pedido.mascara, camada.segundos) : null;
          if (!fonte || (pedido.mascara && !mascara)) {
            faltou = true;
            break;
          }
          coletadas.push(camadaDoCompositor(camada, fonte, mascara));
        }
        if (!faltou) prontas = coletadas;
      }
      // O primeiro quadro é desenhado duas vezes: no Chrome, o primeiro mipmap feito no contexto a partir de um
      // VideoFrame sai branco (medido: um vídeo reduzido na tela virou uma silhueta branca só no quadro 0)
      if (k === 0) compositor.desenhar(prontas, projeto.fundo.cor, tamanho, tamanho);
      compositor.desenhar(prontas, projeto.fundo.cor, tamanho, tamanho);
      const imagem = new VideoFrame(canvas, { timestamp: Math.round((k * 1e6) / fps), duration: Math.round(1e6 / fps) });
      codificadorDoVideo.encode(imagem, { keyFrame: k % Math.round(fps * 2) === 0 });
      imagem.close();
      // Sem deixar a fila do codificador crescer (cada quadro na fila ocupa memória de vídeo)
      while (codificadorDoVideo.encodeQueueSize > 8) await new Promise((pronto) => setTimeout(pronto, 5));
      if (k % 30 === 0) {
        fontes.soltarAntigos(k, Math.round(fps * 3));
        aoProgresso(0.2 + (0.78 * k) / totalDeQuadros, "Desenhando os quadros");
      }
    }
    await Promise.all([codificadorDoVideo.flush(), codificadorDoSom.flush()]);
    if (falha) throw falha;
    muxer.finalize();
    aoProgresso(1, "Pronto");
    return new Blob([alvo.buffer], { type: "video/mp4" });
  } finally {
    fontes.fechar();
    compositor.destruir();
    if (codificadorDoVideo.state !== "closed") codificadorDoVideo.close();
    if (codificadorDoSom.state !== "closed") codificadorDoSom.close();
  }
}

export function foiCancelado(erro: unknown): boolean {
  // O fetch do som recebe o mesmo sinal e, cancelado, rejeita com AbortError (uma mensagem em inglês)
  return erro instanceof Cancelado || (erro instanceof DOMException && erro.name === "AbortError");
}
