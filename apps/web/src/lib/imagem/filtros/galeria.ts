// Filtro › Galeria de desfoque (ADR 0003, onda 13.11): campo, íris, inclinação, caminho e giro, cada um com os
// alfinetes dele, num filtro só (`galeria`). Os alfinetes ficam nas opções como texto curto (as posições em % do
// documento, as medidas em pixels do documento), para caberem no filtro inteligente. O campo, a íris e a inclinação
// viram um raio por pixel e passam pelo desfoque da lente (lente.ts), com os realces do bokeh; o giro e o caminho são
// desfoques de direção, feitos depois; o ruído vem por último.
import { type ContextoDoFiltro, type ImagemDoFiltro, limitar } from "./comum.ts";
import { desfoqueVariavel } from "./lente.ts";
import { adicionarRuido } from "./nitidezRuido.ts";

export type Ponto = { x: number; y: number };
/** Um alfinete do campo: o lugar (% do documento) e o desfoque dele (pixels). */
export type PinoCampo = Ponto & { desfoque: number };
/** A íris: o meio, os raios (pixels), o giro (graus), o arredondado (0 quadrada, 100 elipse), a área nítida (% do raio) e o desfoque. */
export type PinoIris = Ponto & { rx: number; ry: number; giro: number; arredondado: number; nitida: number; desfoque: number };
/** A inclinação: a linha do meio (o ponto e o ângulo), a meia largura nítida e a da transição (pixels) e o desfoque. */
export type PinoInclinacao = Ponto & { angulo: number; nitida: number; transicao: number; desfoque: number };
/** O caminho: os pontos (% do documento), a velocidade (o comprimento do rastro, em pixels) e o afunilar (0 a 100). */
export type PinoCaminho = { pontos: Ponto[]; velocidade: number; afunilar: number };
/** O giro: a elipse (o meio, os raios em pixels e o giro), o ângulo do desfoque (graus) e a transição (% do raio). */
export type PinoGiro = Ponto & { rx: number; ry: number; giro: number; angulo: number; transicao: number };

export type Galeria = { campo: PinoCampo[]; iris: PinoIris[]; inclinacao: PinoInclinacao[]; caminho: PinoCaminho[]; giro: PinoGiro[] };
export type FerramentaDaGaleria = keyof Galeria;

/** Quantos alfinetes de cada um (para o texto caber nas opções do filtro inteligente). */
export const LIMITES_DA_GALERIA: Record<FerramentaDaGaleria, number> = { campo: 12, iris: 6, inclinacao: 4, caminho: 3, giro: 6 };
export const PONTOS_POR_CAMINHO = 10;

const num = (v: number) => String(Math.round(v * 10) / 10);
const CAMPOS = {
  campo: ["x", "y", "desfoque"],
  iris: ["x", "y", "rx", "ry", "giro", "arredondado", "nitida", "desfoque"],
  inclinacao: ["x", "y", "angulo", "nitida", "transicao", "desfoque"],
  giro: ["x", "y", "rx", "ry", "giro", "angulo", "transicao"],
} as const;

/** Os alfinetes de uma ferramenta como texto ("x,y,…;x,y,…"; no caminho, "x y x y …|velocidade|afunilar"). */
export function textoDosPinos<F extends FerramentaDaGaleria>(ferramenta: F, pinos: Galeria[F]): string {
  const lista = pinos.slice(0, LIMITES_DA_GALERIA[ferramenta]);
  if (ferramenta === "caminho") return (lista as PinoCaminho[]).map((c) => `${c.pontos.slice(0, PONTOS_POR_CAMINHO).map((p) => `${num(p.x)} ${num(p.y)}`).join(" ")}|${num(c.velocidade)}|${num(c.afunilar)}`).join(";");
  const campos = CAMPOS[ferramenta as Exclude<FerramentaDaGaleria, "caminho">];
  return lista.map((pino) => campos.map((campo) => num((pino as Record<string, number>)[campo])).join(",")).join(";");
}

export function pinosDoTexto<F extends FerramentaDaGaleria>(ferramenta: F, texto: string): Galeria[F] {
  const partes = String(texto ?? "")
    .split(";")
    .filter(Boolean)
    .slice(0, LIMITES_DA_GALERIA[ferramenta]);
  const finito = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  if (ferramenta === "caminho")
    return partes.flatMap((parte) => {
      const [pontos, velocidade, afunilar] = parte.split("|");
      const numeros = (pontos ?? "").trim().split(/\s+/).map(finito);
      const lista: Ponto[] = [];
      for (let i = 0; i + 1 < numeros.length && lista.length < PONTOS_POR_CAMINHO; i += 2) lista.push({ x: numeros[i], y: numeros[i + 1] });
      return lista.length >= 2 ? [{ pontos: lista, velocidade: finito(velocidade ?? "0"), afunilar: finito(afunilar ?? "0") }] : [];
    }) as Galeria[F];
  const campos = CAMPOS[ferramenta as Exclude<FerramentaDaGaleria, "caminho">];
  return partes.flatMap((parte) => {
    const numeros = parte.split(",").map(finito);
    return numeros.length === campos.length ? [Object.fromEntries(campos.map((campo, i) => [campo, numeros[i]]))] : [];
  }) as Galeria[F];
}

export const FERRAMENTAS_DA_GALERIA: FerramentaDaGaleria[] = ["campo", "iris", "inclinacao", "caminho", "giro"];
export const NOMES_DA_GALERIA: Record<FerramentaDaGaleria, string> = { campo: "Desfoque de campo", iris: "Desfoque de íris", inclinacao: "Inclinação-deslocamento", caminho: "Desfoque de caminho", giro: "Desfoque de giro" };

export function galeriaDasOpcoes(v: Record<string, unknown>): Galeria {
  return {
    campo: pinosDoTexto("campo", String(v.campo ?? "")),
    iris: pinosDoTexto("iris", String(v.iris ?? "")),
    inclinacao: pinosDoTexto("inclinacao", String(v.inclinacao ?? "")),
    caminho: pinosDoTexto("caminho", String(v.caminho ?? "")),
    giro: pinosDoTexto("giro", String(v.giro ?? "")),
  };
}

/** O primeiro alfinete de cada ferramenta, no meio do documento (do tamanho dele). */
export function pinoNovo<F extends FerramentaDaGaleria>(ferramenta: F, x: number, y: number, documento: { largura: number; altura: number }): Galeria[F][number] {
  const lado = Math.min(documento.largura, documento.altura);
  const desfoque = Math.max(1, Math.round(lado / 40));
  if (ferramenta === "campo") return { x, y, desfoque } as Galeria[F][number];
  if (ferramenta === "iris") return { x, y, rx: Math.round(lado / 4), ry: Math.round(lado / 4), giro: 0, arredondado: 100, nitida: 50, desfoque } as Galeria[F][number];
  if (ferramenta === "inclinacao") return { x, y, angulo: 0, nitida: Math.round(lado / 10), transicao: Math.round(lado / 6), desfoque } as Galeria[F][number];
  if (ferramenta === "giro") return { x, y, rx: Math.round(lado / 5), ry: Math.round(lado / 5), giro: 0, angulo: 15, transicao: 30 } as Galeria[F][number];
  return { pontos: [{ x: Math.max(0, x - 15), y }, { x: Math.min(100, x + 15), y }], velocidade: Math.round(lado / 15), afunilar: 0 } as Galeria[F][number];
}

/** A curva suave de 0 a 1. */
const suave = (t: number) => {
  const u = limitar(t);
  return u * u * (3 - 2 * u);
};

/** O ponto do documento em pixels (de % para pixels). */
const emPixels = (p: Ponto, documento: { largura: number; altura: number }) => ({ x: (p.x / 100) * documento.largura, y: (p.y / 100) * documento.altura });

/** A elipse em volta de um ponto: a distância normalizada (1 na borda), pelo arredondado (expoente de 2 a 10). */
export function naElipse(px: number, py: number, centro: Ponto, rx: number, ry: number, giro: number, arredondado = 100): number {
  const r = (-giro * Math.PI) / 180;
  const dx = px - centro.x;
  const dy = py - centro.y;
  const u = Math.abs((dx * Math.cos(r) - dy * Math.sin(r)) / Math.max(1e-6, rx));
  const v = Math.abs((dx * Math.sin(r) + dy * Math.cos(r)) / Math.max(1e-6, ry));
  const e = 2 + (1 - limitar(arredondado / 100)) * 8;
  return (u ** e + v ** e) ** (1 / e);
}

/** O desfoque de cada ponto do documento pelo campo, pela íris e pela inclinação (pixels do documento; `null`: nenhum). */
export function desfoqueNoPonto(galeria: Galeria, documento: { largura: number; altura: number }): ((x: number, y: number) => number) | null {
  const campo = galeria.campo.map((pino) => ({ ...emPixels(pino, documento), desfoque: Math.max(0, pino.desfoque) }));
  const iris = galeria.iris.map((pino) => ({ ...pino, centro: emPixels(pino, documento) }));
  const inclinacao = galeria.inclinacao.map((pino) => {
    const r = (pino.angulo * Math.PI) / 180;
    return { ...pino, centro: emPixels(pino, documento), normal: { x: -Math.sin(r), y: -Math.cos(r) } };
  });
  if (!campo.length && !iris.length && !inclinacao.length) return null;
  return (x, y) => {
    // O campo: a média dos alfinetes pesada pelo inverso do quadrado da distância
    let doCampo = 0;
    if (campo.length === 1) doCampo = campo[0].desfoque;
    else if (campo.length) {
      let soma = 0;
      let pesos = 0;
      for (const pino of campo) {
        const d2 = (x - pino.x) ** 2 + (y - pino.y) ** 2;
        if (d2 < 1e-6) return pino.desfoque;
        soma += pino.desfoque / d2;
        pesos += 1 / d2;
      }
      doCampo = soma / pesos;
    }
    // A íris e a inclinação: a área nítida de cada uma; o ponto fica no menor desfoque entre elas
    let dasFormas = Infinity;
    for (const pino of iris) {
      const r = naElipse(x, y, pino.centro, pino.rx, pino.ry, pino.giro, pino.arredondado);
      const dentro = limitar(pino.nitida / 100, 0, 0.99);
      dasFormas = Math.min(dasFormas, Math.max(0, pino.desfoque) * suave((r - dentro) / (1 - dentro)));
    }
    for (const pino of inclinacao) {
      const d = Math.abs((x - pino.centro.x) * pino.normal.x + (y - pino.centro.y) * pino.normal.y);
      dasFormas = Math.min(dasFormas, Math.max(0, pino.desfoque) * suave((d - pino.nitida) / Math.max(1e-6, pino.transicao)));
    }
    return Math.max(doCampo, Number.isFinite(dasFormas) ? dasFormas : 0);
  };
}

/** Os quatro canais intercalados (pré-multiplicados, de 0 a 1), para ler os quatro de uma vez. */
function intercalados(imagem: ImagemDoFiltro): Float32Array {
  const saida = new Float32Array(imagem.dados.length);
  for (let i = 0; i < saida.length; i++) saida[i] = imagem.dados[i] / 255;
  return saida;
}

/** Soma em `soma` a leitura bilinear dos quatro canais em (x, y) (o centro do pixel 0 em 0,5; fora é transparente). */
function somarBilinear(dados: Float32Array, largura: number, altura: number, x: number, y: number, soma: Float64Array): void {
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const somarPixel = (xi: number, yi: number, w: number) => {
    if (w <= 0 || xi < 0 || yi < 0 || xi >= largura || yi >= altura) return;
    const i = (yi * largura + xi) * 4;
    soma[0] += dados[i] * w;
    soma[1] += dados[i + 1] * w;
    soma[2] += dados[i + 2] * w;
    soma[3] += dados[i + 3] * w;
  };
  somarPixel(x0, y0, (1 - tx) * (1 - ty));
  somarPixel(x0 + 1, y0, tx * (1 - ty));
  somarPixel(x0, y0 + 1, (1 - tx) * ty);
  somarPixel(x0 + 1, y0 + 1, tx * ty);
}

/** O giro: dentro de cada elipse, a média ao longo do arco (no espaço da elipse), com a força caindo na transição. */
export function desfoqueDeGiro(imagem: ImagemDoFiltro, giros: PinoGiro[], ctx: ContextoDoFiltro): ImagemDoFiltro {
  if (!giros.length) return imagem;
  const { largura, altura } = imagem;
  const fonte = intercalados(imagem);
  const saida = fonte.slice();
  const soma = new Float64Array(4);
  const doc = (v: number, eixo: "x" | "y") => (ctx.origem[eixo] + (v + 0.5) / ctx.escala);
  const naImagem = (dx: number, dy: number) => ({ x: (dx - ctx.origem.x) * ctx.escala, y: (dy - ctx.origem.y) * ctx.escala });
  for (const pino of giros) {
    const centro = emPixels(pino, ctx.documento);
    const r = (pino.giro * Math.PI) / 180;
    const cos = Math.cos(r);
    const sen = Math.sin(r);
    const fim = 1 - limitar(pino.transicao / 100, 0, 0.99);
    const angulo = (pino.angulo * Math.PI) / 180;
    // A caixa da elipse na imagem
    const meio = naImagem(centro.x, centro.y);
    const alcance = Math.max(pino.rx, pino.ry) * ctx.escala + 1;
    const x0 = Math.max(0, Math.floor(meio.x - alcance));
    const x1 = Math.min(largura - 1, Math.ceil(meio.x + alcance));
    const y0 = Math.max(0, Math.floor(meio.y - alcance));
    const y1 = Math.min(altura - 1, Math.ceil(meio.y + alcance));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = doc(x, "x");
        const py = doc(y, "y");
        const dx = px - centro.x;
        const dy = py - centro.y;
        // No espaço da elipse (u, v de -1 a 1)
        const u = (dx * cos + dy * sen) / Math.max(1e-6, pino.rx);
        const v = (-dx * sen + dy * cos) / Math.max(1e-6, pino.ry);
        const d = Math.hypot(u, v);
        if (d > 1) continue;
        const forca = d <= fim ? 1 : 1 - suave((d - fim) / (1 - fim));
        const a = angulo * forca;
        // O arco em pixels da imagem diz quantas amostras
        const arco = a * Math.hypot(dx, dy) * ctx.escala;
        const n = Math.max(2, Math.min(64, Math.ceil(arco)));
        if (arco < 0.5) continue;
        const p = y * largura + x;
        soma.fill(0);
        for (let j = 0; j < n; j++) {
          const t = (j / (n - 1) - 0.5) * a;
          const ct = Math.cos(t);
          const st = Math.sin(t);
          const uu = u * ct - v * st;
          const vv = u * st + v * ct;
          // De volta ao documento e à imagem
          const qx = centro.x + uu * pino.rx * cos - vv * pino.ry * sen;
          const qy = centro.y + uu * pino.rx * sen + vv * pino.ry * cos;
          somarBilinear(fonte, largura, altura, (qx - ctx.origem.x) * ctx.escala, (qy - ctx.origem.y) * ctx.escala, soma);
        }
        for (let k = 0; k < 4; k++) saida[p * 4 + k] = soma[k] / n;
      }
    }
  }
  return deIntercalados(saida, largura, altura);
}

function deIntercalados(dados: Float32Array, largura: number, altura: number): ImagemDoFiltro {
  const saida = new Uint8ClampedArray(dados.length);
  for (let i = 0; i < dados.length; i += 4) {
    const a = limitar(dados[i + 3]);
    saida[i + 3] = Math.round(a * 255);
    // A cor pré-multiplicada não passa do alfa
    for (let k = 0; k < 3; k++) saida[i + k] = Math.round(Math.min(limitar(dados[i + k]), a) * 255);
  }
  return { largura, altura, dados: saida };
}

/** O caminho: cada pixel borra na direção do trecho de caminho mais perto, no comprimento da velocidade (afunilando nas pontas). */
export function desfoqueDeCaminho(imagem: ImagemDoFiltro, caminhos: PinoCaminho[], ctx: ContextoDoFiltro): ImagemDoFiltro {
  type Trecho = { a: Ponto; b: Ponto; comprimento: number; inicio: number; total: number; velocidade: number; afunilar: number };
  const trechos: Trecho[] = [];
  for (const caminho of caminhos) {
    const pontos = caminho.pontos.map((p) => emPixels(p, ctx.documento));
    let total = 0;
    for (let i = 1; i < pontos.length; i++) total += Math.hypot(pontos[i].x - pontos[i - 1].x, pontos[i].y - pontos[i - 1].y);
    let andado = 0;
    for (let i = 1; i < pontos.length; i++) {
      const comprimento = Math.hypot(pontos[i].x - pontos[i - 1].x, pontos[i].y - pontos[i - 1].y);
      if (comprimento > 1e-6) trechos.push({ a: pontos[i - 1], b: pontos[i], comprimento, inicio: andado, total, velocidade: Math.max(0, caminho.velocidade), afunilar: limitar(caminho.afunilar / 100) });
      andado += comprimento;
    }
  }
  if (!trechos.length) return imagem;
  const { largura, altura } = imagem;
  const fonte = intercalados(imagem);
  const saida = fonte.slice();
  const soma = new Float64Array(4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const px = ctx.origem.x + (x + 0.5) / ctx.escala;
      const py = ctx.origem.y + (y + 0.5) / ctx.escala;
      // O trecho mais perto e o quanto do caminho já foi andado ali
      let melhor = Infinity;
      let escolhido = trechos[0];
      let s = 0;
      for (const trecho of trechos) {
        const vx = trecho.b.x - trecho.a.x;
        const vy = trecho.b.y - trecho.a.y;
        const t = limitar(((px - trecho.a.x) * vx + (py - trecho.a.y) * vy) / (trecho.comprimento * trecho.comprimento));
        const d = (px - trecho.a.x - vx * t) ** 2 + (py - trecho.a.y - vy * t) ** 2;
        if (d < melhor) {
          melhor = d;
          escolhido = trecho;
          s = t;
        }
      }
      const ao = (escolhido.inicio + s * escolhido.comprimento) / Math.max(1e-6, escolhido.total);
      // O afunilar encurta o rastro nas pontas do caminho
      const fator = 1 - escolhido.afunilar * (1 - Math.sin(Math.PI * ao));
      const comprimento = escolhido.velocidade * fator * ctx.escala;
      if (comprimento < 1) continue;
      const dx = (escolhido.b.x - escolhido.a.x) / escolhido.comprimento;
      const dy = (escolhido.b.y - escolhido.a.y) / escolhido.comprimento;
      const n = Math.max(2, Math.min(64, Math.ceil(comprimento)));
      const p = y * largura + x;
      soma.fill(0);
      for (let j = 0; j < n; j++) {
        const t = (j / (n - 1) - 0.5) * comprimento;
        somarBilinear(fonte, largura, altura, x + 0.5 + dx * t, y + 0.5 + dy * t, soma);
      }
      for (let k = 0; k < 4; k++) saida[p * 4 + k] = soma[k] / n;
    }
  }
  return deIntercalados(saida, largura, altura);
}

export type EfeitosDaGaleria = { luz: number; cor: number; faixaDe: number; faixaAte: number; ruido: number; distribuicao: string; monocromatico: boolean };

export function galeriaDeDesfoque(imagem: ImagemDoFiltro, galeria: Galeria, efeitos: EfeitosDaGaleria, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  let resultado = imagem;
  const noPonto = desfoqueNoPonto(galeria, ctx.documento);
  if (noPonto) {
    const coc = new Float32Array(largura * altura);
    let maior = 0;
    for (let y = 0, p = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++, p++) {
        coc[p] = noPonto(ctx.origem.x + (x + 0.5) / ctx.escala, ctx.origem.y + (y + 0.5) / ctx.escala) * ctx.escala;
        maior = Math.max(maior, coc[p]);
      }
    }
    // O disco redondo da galeria, com o bokeh (a faixa de luz dos realces, que ficam mais fortes e com mais cor)
    resultado = desfoqueVariavel(imagem, coc, maior, { lados: 0, curvatura: 100, rotacao: 0 }, { brilho: efeitos.luz, limiar: efeitos.faixaDe, ate: efeitos.faixaAte, cor: efeitos.cor });
  }
  resultado = desfoqueDeGiro(resultado, galeria.giro, ctx);
  resultado = desfoqueDeCaminho(resultado, galeria.caminho, ctx);
  if (efeitos.ruido > 0) resultado = adicionarRuido(resultado, efeitos.ruido, efeitos.distribuicao, efeitos.monocromatico, ctx);
  return resultado;
}

/** Quanto o resultado pode passar da camada (pixels do documento). */
export function margemDaGaleria(galeria: Galeria): number {
  return Math.max(0, ...galeria.campo.map((p) => p.desfoque), ...galeria.iris.map((p) => p.desfoque), ...galeria.inclinacao.map((p) => p.desfoque), ...galeria.caminho.map((p) => p.velocidade / 2));
}
