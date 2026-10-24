// A linha do tempo de quadros do editor de imagem para fora (ADR 0003, onda 13.15): cada quadro desenhado pela
// exportação de sempre (o documento com o quadro aplicado), e daí o GIF animado (a paleta de cada quadro, com
// pontilhado) ou o MP4 (H.264 pelo WebCodecs e o mp4-muxer, cada quadro o tempo dele).
import { ArrayBufferTarget, Muxer } from "mp4-muxer";

import { compDoQuadro, type AnimacaoDaImagem } from "../imagem/animacao";
import { aplicarComp } from "../imagem/comps";
import type { Projeto } from "../projeto/modelo";
import type { Midia } from "../tipos";
import { type FontesDaExportacao, OPCOES_PADRAO_DE_EXPORTACAO, pixelsDoBlob } from "./exportarComo";
import { codificarGifAnimado } from "./formatos/gif";
import { indexar } from "./formatos/quantizar";
import { exportarImagem } from "./imagem";

type Progresso = (texto: string) => void;

/** Cada quadro desenhado, na escala pedida. */
async function desenharQuadros(projeto: Projeto, midias: ReadonlyMap<string, Midia>, animacao: AnimacaoDaImagem, escala: number, fontes: FontesDaExportacao, aoProgresso: Progresso) {
  const canvas: HTMLCanvasElement[] = [];
  for (const [i, quadro] of animacao.quadros.entries()) {
    aoProgresso(`Desenhando o quadro ${i + 1} de ${animacao.quadros.length}…`);
    canvas.push((await pixelsDoBlob(await exportarImagem(aplicarComp(projeto, compDoQuadro(quadro)), midias, { formato: "png", escala, ...fontes }))).canvas);
  }
  return canvas;
}

export async function gifDaAnimacao(projeto: Projeto, midias: ReadonlyMap<string, Midia>, animacao: AnimacaoDaImagem, escala: number, fontes: FontesDaExportacao, aoProgresso: Progresso): Promise<Blob> {
  if (!animacao.quadros.length) throw new Error("A animação não tem quadros.");
  const quadros = await desenharQuadros(projeto, midias, animacao, escala, fontes, aoProgresso);
  aoProgresso("Montando o GIF…");
  const indexadas = quadros.map((canvas, i) => {
    const dados = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data;
    return { imagem: indexar(dados, canvas.width, canvas.height, OPCOES_PADRAO_DE_EXPORTACAO.paleta), atraso: animacao.quadros[i].atraso };
  });
  const bytes = codificarGifAnimado(indexadas, animacao.repetir);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "image/gif" });
}

/**
 * O MP4: cada quadro fica na tela o tempo dele (no mínimo um trinta avos de segundo), e a animação se repete as vezes
 * pedidas (a que repete sempre sai uma vez). O H.264 pede lados pares: o último pixel ímpar sai.
 */
export async function videoDaAnimacao(projeto: Projeto, midias: ReadonlyMap<string, Midia>, animacao: AnimacaoDaImagem, escala: number, fontes: FontesDaExportacao, aoProgresso: Progresso): Promise<Blob> {
  if (!animacao.quadros.length) throw new Error("A animação não tem quadros.");
  if (typeof VideoEncoder === "undefined") throw new Error("Este navegador não codifica vídeo (use o Chrome ou o Edge).");
  const quadros = await desenharQuadros(projeto, midias, animacao, escala, fontes, aoProgresso);
  const largura = quadros[0].width - (quadros[0].width % 2);
  const altura = quadros[0].height - (quadros[0].height % 2);
  let config: VideoEncoderConfig | null = null;
  for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42e028"]) {
    const tentativa: VideoEncoderConfig = { codec, width: largura, height: altura, bitrate: 8_000_000, framerate: 30, avc: { format: "avc" } };
    if ((await VideoEncoder.isConfigSupported(tentativa)).supported) {
      config = tentativa;
      break;
    }
  }
  if (!config) throw new Error("Este navegador não codifica H.264 nesse tamanho.");
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width: largura, height: altura }, fastStart: "in-memory" });
  let erro: unknown = null;
  const codificador = new VideoEncoder({ output: (pedaco, meta) => muxer.addVideoChunk(pedaco, meta), error: (e) => (erro = e) });
  codificador.configure(config);
  // Sem fundo transparente no vídeo: o quadro vai sobre o branco
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  const contexto = tela.getContext("2d")!;
  const voltas = animacao.repetir === 0 ? 1 : animacao.repetir;
  let tempo = 0;
  let n = 0;
  for (let volta = 0; volta < voltas; volta++) {
    for (const [i, canvas] of quadros.entries()) {
      aoProgresso(`Codificando o quadro ${i + 1} de ${quadros.length}${voltas > 1 ? ` (volta ${volta + 1} de ${voltas})` : ""}…`);
      contexto.fillStyle = "#ffffff";
      contexto.fillRect(0, 0, largura, altura);
      contexto.drawImage(canvas, 0, 0);
      const duracao = Math.max(1 / 30, animacao.quadros[i].atraso) * 1_000_000;
      const quadro = new VideoFrame(tela, { timestamp: Math.round(tempo), duration: Math.round(duracao) });
      codificador.encode(quadro, { keyFrame: n % 30 === 0 });
      quadro.close();
      tempo += duracao;
      n++;
    }
  }
  await codificador.flush();
  codificador.close();
  if (erro) throw erro instanceof Error ? erro : new Error("Não foi possível codificar o vídeo.");
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}
