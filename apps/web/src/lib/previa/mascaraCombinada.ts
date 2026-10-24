// A máscara que o compositor usa numa camada do editor de imagem (ADR 0003, onda 13.7): a de pixels, a vetorial ou as
// duas. O compositor lê uma máscara só; com as duas, elas são juntadas aqui, no espaço da de pixels (a vetorial levada
// até lá pelas duas matrizes), cada uma com a densidade e a difusão dela, e multiplicadas.
import type { Clipe } from "../projeto/modelo";
import type { Caixa, Tamanho } from "../projeto/geometria";
import { type Afim, aplicar, compor, inverter, matrizEmUso } from "../projeto/mascaraDePixels";
import { transformarCaminhos } from "../vetor/edicao";
import { path2dDe } from "../vetor/desenhar";
import type { MascaraVetorial } from "../vetor/mascaraVetorial";
import type { Subcaminho } from "../vetor/modelo";

export type MascaraParaOCompositor = { fonte: TexImageSource; quadro: Tamanho; matriz?: Afim; densidade?: number; difusao?: number };

const LADO_MAXIMO = 4096;
const GUARDADAS = new Map<string, { chave: string; canvas: HTMLCanvasElement }>();
const IDS_DAS_FONTES = new WeakMap<object, number>();
let proximoId = 1;
const idDaFonte = (fonte: object) => {
  if (!IDS_DAS_FONTES.has(fonte)) IDS_DAS_FONTES.set(fonte, proximoId++);
  return IDS_DAS_FONTES.get(fonte)!;
};

/** A máscara vetorial em cinza num canvas (`escala` pixels do canvas por pixel do documento), sem a densidade. */
function desenharVetorial(ctx: CanvasRenderingContext2D, caminhos: Subcaminho[], base: MascaraVetorial["base"], largura: number, altura: number, escala: number, difusao: number) {
  ctx.save();
  ctx.fillStyle = base === "revelar" ? "#ffffff" : "#000000";
  ctx.fillRect(0, 0, largura, altura);
  if (difusao > 0) ctx.filter = `blur(${difusao * escala}px)`;
  ctx.setTransform(escala, 0, 0, escala, 0, 0);
  for (const sub of caminhos) {
    if (sub.nos.length < 2) continue;
    const caminho = path2dDe([{ ...sub, fechado: true }]);
    if (sub.operacao === "somar") {
      ctx.fillStyle = "#ffffff";
      ctx.fill(caminho);
    } else if (sub.operacao === "subtrair") {
      ctx.fillStyle = "#000000";
      ctx.fill(caminho);
    } else if (sub.operacao === "intersectar") {
      // Fora do caminho fica preto: o retângulo inteiro com o caminho furado (par e ímpar)
      const fora = new Path2D();
      fora.rect(-1e5, -1e5, 2e5, 2e5);
      fora.addPath(caminho);
      ctx.fillStyle = "#000000";
      ctx.fill(fora, "evenodd");
    } else {
      // Excluir: o que está dentro do caminho se inverte
      ctx.globalCompositeOperation = "difference";
      ctx.fillStyle = "#ffffff";
      ctx.fill(caminho);
      ctx.globalCompositeOperation = "source-over";
    }
  }
  ctx.restore();
}

function levar(caminhos: Subcaminho[], matriz: Afim, documento: Tamanho): Subcaminho[] {
  return transformarCaminhos(caminhos, (p) => {
    const [x, y] = aplicar(matriz, p.x / documento.largura, p.y / documento.altura);
    return { x: x * documento.largura, y: y * documento.altura };
  });
}

/**
 * A máscara da camada para o compositor, ou null quando ela não tem nenhuma ligada (ou a de pixels ainda não chegou e
 * não há vetorial). `caixa` e `quadro` nas mesmas unidades; `documento`, o tamanho da imagem em pixels.
 */
export function mascaraFinal(clipe: Clipe, caixa: Caixa, quadro: Tamanho, documento: Tamanho, fonteDosPixels: (TexImageSource & object) | null): MascaraParaOCompositor | null {
  const vetorial = clipe.mascara_vetorial?.ligada ? clipe.mascara_vetorial : null;
  const pixels = clipe.mascara_pixels?.ligada && fonteDosPixels ? clipe.mascara_pixels : null;
  if (!vetorial) return pixels && fonteDosPixels ? { fonte: fonteDosPixels, quadro } : null;
  const escala = Math.min(1, LADO_MAXIMO / Math.max(documento.largura, documento.altura), Math.max(quadro.largura / documento.largura, 0.25));
  const largura = Math.max(1, Math.round(documento.largura * escala));
  const altura = Math.max(1, Math.round(documento.altura * escala));
  const matrizDaVetorial = matrizEmUso(vetorial, caixa, quadro);
  const matrizDosPixels = pixels ? matrizEmUso(pixels, caixa, quadro) : null;
  const chave = JSON.stringify([largura, altura, vetorial.subcaminhos, vetorial.base, vetorial.difusao, pixels && fonteDosPixels ? [idDaFonte(fonteDosPixels), pixels.densidade, pixels.difusao, vetorial.densidade, matrizDaVetorial, matrizDosPixels] : null]);
  const guardada = GUARDADAS.get(clipe.id);
  let canvas = guardada?.chave === chave ? guardada.canvas : null;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d")!;
    if (!pixels || !fonteDosPixels || !matrizDosPixels) desenharVetorial(ctx, vetorial.subcaminhos, vetorial.base, largura, altura, escala, vetorial.difusao);
    else {
      // As duas: a de pixels com a densidade dela (1 − d·(1 − p) = branco·(1 − d) + p·d) e a vetorial levada ao espaço
      // dela (máscara vetorial → posição na caixa → máscara de pixels), também com a densidade, multiplicadas
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, largura, altura);
      ctx.globalAlpha = pixels.densidade;
      if (pixels.difusao > 0) ctx.filter = `blur(${pixels.difusao * escala}px)`;
      ctx.drawImage(fonteDosPixels as CanvasImageSource, 0, 0, largura, altura);
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      const outra = document.createElement("canvas");
      outra.width = largura;
      outra.height = altura;
      const octx = outra.getContext("2d")!;
      const ate = compor(matrizDosPixels, inverter(matrizDaVetorial));
      desenharVetorial(octx, levar(vetorial.subcaminhos, ate, documento), vetorial.base, largura, altura, escala, vetorial.difusao);
      const comDensidade = document.createElement("canvas");
      comDensidade.width = largura;
      comDensidade.height = altura;
      const dctx = comDensidade.getContext("2d")!;
      dctx.fillStyle = "#ffffff";
      dctx.fillRect(0, 0, largura, altura);
      dctx.globalAlpha = vetorial.densidade;
      dctx.drawImage(outra, 0, 0);
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(comDensidade, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    }
    GUARDADAS.delete(clipe.id);
    GUARDADAS.set(clipe.id, { chave, canvas });
    while (GUARDADAS.size > 32) GUARDADAS.delete(GUARDADAS.keys().next().value!);
  }
  if (pixels && matrizDosPixels) return { fonte: canvas, quadro, matriz: matrizDosPixels, densidade: 1, difusao: 0 };
  // A difusão da vetorial já está no desenho (o desfoque do canvas, na escala dele)
  return { fonte: canvas, quadro, matriz: matrizDaVetorial, densidade: vetorial.densidade, difusao: 0 };
}

/** A máscara vetorial em cinza no tamanho do documento (caminhos já onde aparecem): a seleção a partir dela. */
export function canvasDaMascaraVetorial(caminhosNoDocumento: Subcaminho[], base: MascaraVetorial["base"], documento: Tamanho): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = documento.largura;
  canvas.height = documento.altura;
  desenharVetorial(canvas.getContext("2d")!, caminhosNoDocumento, base, documento.largura, documento.altura, 1, 0);
  return canvas;
}
