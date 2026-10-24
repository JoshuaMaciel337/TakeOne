// Filtro › Filtro de revelação (ADR 0003, onda 13.11): o painel de revelação de fotos como filtro (inteligente ou
// nos pixels), com as seções de lá: básico, curva paramétrica, detalhe (nitidez e redução de ruído), mistura de
// cores, gradação de cor e efeitos (granulação e a vinheta com prioridade). A parte que é só cor (o básico pela conta
// da aba Cor, a curva, a mistura e a gradação) vira uma LUT 3D; a textura, a claridade, o detalhe, o grão e a vinheta
// dependem do lugar e vêm depois, nessa ordem.
import { AJUSTES_NEUTROS, type AjustesCor, aplicarCor, aplicarHsl, FAIXAS_DE_MATIZ, type FaixaDeMatiz, type Hsl, vetorDaRoda } from "../../projeto/cor.ts";
import { lerLutRapido, lutDaFuncao } from "../ajustes.ts";
import type { Opcao, Valores } from "./catalogo.ts";
import { type ContextoDoFiltro, type ImagemDoFiltro, limitar, sorteio } from "./comum.ts";
import { fractal } from "./renderizacao.ts";
import { borrar, gradiente } from "./galeriaDeFiltros/base.ts";

const numero = (id: string, nome: string, minimo: number, maximo: number, padrao = 0, sufixo = "", passo = 1): Opcao => ({ id, nome, tipo: "numero", minimo, maximo, padrao, sufixo, passo });

const FAIXAS = FAIXAS_DE_MATIZ.map((faixa) => faixa.id);
const REGIOES = [
  ["sombras", "Sombras"],
  ["meios", "Meios-tons"],
  ["realces", "Realces"],
  ["global", "Global"],
] as const;

export const SECOES_DA_REVELACAO: { nome: string; opcoes: Opcao[] }[] = [
  {
    nome: "Básico",
    opcoes: [
      numero("temperatura", "Temperatura", -100, 100),
      numero("tom", "Tom", -100, 100),
      numero("exposicao", "Exposição", -5, 5, 0, "", 0.05),
      numero("contraste", "Contraste", -100, 100),
      numero("realces", "Realces", -100, 100),
      numero("sombras", "Sombras", -100, 100),
      numero("brancos", "Brancos", -100, 100),
      numero("pretos", "Pretos", -100, 100),
      numero("textura", "Textura", -100, 100),
      numero("claridade", "Claridade", -100, 100),
      numero("desembacar", "Desembaçar", -100, 100),
      numero("vibracao", "Vibração", -100, 100),
      numero("saturacao", "Saturação", -100, 100),
    ],
  },
  {
    nome: "Curva",
    opcoes: [numero("curva_realces", "Realces", -100, 100), numero("curva_claros", "Claros", -100, 100), numero("curva_escuros", "Escuros", -100, 100), numero("curva_sombras", "Sombras", -100, 100)],
  },
  {
    nome: "Detalhe",
    opcoes: [
      numero("nitidez", "Nitidez", 0, 150),
      numero("raio", "Raio", 0.5, 3, 1, " px", 0.1),
      numero("detalhe", "Detalhe", 0, 100, 25),
      numero("mascaramento", "Mascaramento", 0, 100),
      numero("ruido_luminancia", "Redução de ruído", 0, 100),
      numero("ruido_cor", "Redução de ruído de cor", 0, 100),
    ],
  },
  {
    nome: "Mistura de cores",
    opcoes: FAIXAS_DE_MATIZ.flatMap((faixa) => [numero(`${faixa.id}_matiz`, `${faixa.nome}: matiz`, -100, 100), numero(`${faixa.id}_saturacao`, `${faixa.nome}: saturação`, -100, 100), numero(`${faixa.id}_luminancia`, `${faixa.nome}: luminância`, -100, 100)]),
  },
  {
    nome: "Gradação de cor",
    opcoes: [
      ...REGIOES.flatMap(([id, nome]) => [numero(`grad_${id}_matiz`, `${nome}: matiz`, 0, 360, 0, "°"), numero(`grad_${id}_saturacao`, `${nome}: saturação`, 0, 100), numero(`grad_${id}_luminancia`, `${nome}: luminância`, -100, 100)]),
      numero("grad_mistura", "Mistura", 0, 100, 50),
      numero("grad_equilibrio", "Equilíbrio", -100, 100),
    ],
  },
  {
    nome: "Efeitos",
    opcoes: [
      numero("grao", "Granulação", 0, 100),
      numero("grao_tamanho", "Tamanho do grão", 0, 100, 25),
      numero("grao_aspereza", "Aspereza do grão", 0, 100, 50),
      numero("vinheta", "Vinheta", -100, 100),
      { id: "vinheta_estilo", nome: "Estilo da vinheta", tipo: "escolha", opcoes: [{ id: "realces", nome: "Prioridade dos realces" }, { id: "cor", nome: "Prioridade da cor" }, { id: "pintura", nome: "Sobreposição de pintura" }], padrao: "realces" },
      numero("vinheta_meio", "Ponto médio", 0, 100, 50),
      numero("vinheta_arredondamento", "Arredondamento", -100, 100),
      numero("vinheta_difusao", "Difusão", 0, 100, 50),
      numero("vinheta_realces", "Realces da vinheta", 0, 100),
    ],
  },
];
export const OPCOES_DA_REVELACAO: Opcao[] = SECOES_DA_REVELACAO.flatMap((secao) => secao.opcoes);

const n = (v: Valores, id: string) => Number(v[id] ?? 0);
const suave = (t: number) => {
  const u = limitar(t);
  return u * u * (3 - 2 * u);
};
const LUMA = [0.2126, 0.7152, 0.0722] as const;

/** A parte de cor (o que cabe numa LUT), ou `null` quando ela não muda nada. */
export function corDaRevelacao(v: Valores): ((c: [number, number, number]) => [number, number, number]) | null {
  const ajustes: AjustesCor = {
    ...AJUSTES_NEUTROS,
    temperatura: n(v, "temperatura") / 100,
    tom: n(v, "tom") / 100,
    exposicao: n(v, "exposicao"),
    contraste: n(v, "contraste") / 100,
    realces: n(v, "realces") / 100,
    sombras: n(v, "sombras") / 100,
    brancos: n(v, "brancos") / 100,
    pretos: n(v, "pretos") / 100,
    nevoa: n(v, "desembacar") / 100,
    vibracao: n(v, "vibracao") / 100,
    saturacao: n(v, "saturacao") / 100,
  };
  const basico = Object.values(ajustes).some((x) => Math.abs(x) > 1e-9);
  const curva = ["curva_sombras", "curva_escuros", "curva_claros", "curva_realces"].map((id) => n(v, id) / 100);
  const temCurva = curva.some((x) => x !== 0);
  const hsl: Hsl = {};
  for (const faixa of FAIXAS as FaixaDeMatiz[]) {
    const ajuste = { matiz: n(v, `${faixa}_matiz`) / 100, saturacao: n(v, `${faixa}_saturacao`) / 100, luminancia: n(v, `${faixa}_luminancia`) / 100 };
    if (ajuste.matiz || ajuste.saturacao || ajuste.luminancia) hsl[faixa] = ajuste;
  }
  const temHsl = Object.keys(hsl).length > 0;
  const regioes = REGIOES.map(([id]) => ({ vetor: vetorDaRoda(n(v, `grad_${id}_matiz`)), saturacao: n(v, `grad_${id}_saturacao`) / 100, luminancia: n(v, `grad_${id}_luminancia`) / 100 }));
  const temGradacao = regioes.some((r) => r.saturacao || r.luminancia);
  if (!basico && !temCurva && !temHsl && !temGradacao) return null;
  // A curva paramétrica: quatro morros (sombras, escuros, claros e realces) que somam ao tom, presos nas pontas
  const centros = [0.125, 0.375, 0.625, 0.875];
  const naCurva = (x: number) => {
    let y = x;
    for (let k = 0; k < 4; k++) if (curva[k]) y += curva[k] * 0.22 * Math.exp(-(((x - centros[k]) / 0.15) ** 2)) * Math.sqrt(4 * x * (1 - x));
    return limitar(y);
  };
  // A gradação: as sombras, os meios e os realces pela luminância; o equilíbrio desloca o meio e a mistura alarga
  const meio = 0.5 - 0.3 * (n(v, "grad_equilibrio") / 100);
  const largura = 0.12 + 0.7 * (n(v, "grad_mistura") / 100);
  return (entrada) => {
    let c: [number, number, number] = basico ? aplicarCor(entrada, ajustes) : entrada;
    if (temCurva) c = [naCurva(c[0]), naCurva(c[1]), naCurva(c[2])];
    if (temHsl) c = aplicarHsl(c, hsl);
    if (temGradacao) {
      const y = LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
      const pesos = [1 - suave((y - meio) / largura + 0.5), Math.max(0, 1 - Math.abs(y - meio) / largura), suave((y - meio) / largura + 0.5), 1];
      for (let r = 0; r < 4; r++) {
        const regiao = regioes[r];
        if (!regiao.saturacao && !regiao.luminancia) continue;
        for (let k = 0; k < 3; k++) c[k] += pesos[r] * (regiao.vetor[k] * regiao.saturacao * 0.35 + regiao.luminancia * 0.25);
      }
      c = [limitar(c[0]), limitar(c[1]), limitar(c[2])];
    }
    return c;
  };
}

export function revelar(imagem: ImagemDoFiltro, v: Valores, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const total = largura * altura;
  // A cor reta, de 0 a 1
  const r = new Float32Array(total);
  const g = new Float32Array(total);
  const b = new Float32Array(total);
  const alfa = new Float32Array(total);
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const a = imagem.dados[i + 3];
    alfa[p] = a / 255;
    if (!a) continue;
    r[p] = imagem.dados[i] / a;
    g[p] = imagem.dados[i + 1] / a;
    b[p] = imagem.dados[i + 2] / a;
  }
  let mudou = false;
  const cor = corDaRevelacao(v);
  if (cor) {
    mudou = true;
    const lut = lutDaFuncao(cor);
    const saida = new Float64Array(3);
    for (let p = 0; p < total; p++) {
      if (!alfa[p]) continue;
      lerLutRapido(lut, r[p], g[p], b[p], saida);
      r[p] = saida[0];
      g[p] = saida[1];
      b[p] = saida[2];
    }
  }
  const luzAgora = () => {
    const y = new Float32Array(total);
    for (let p = 0; p < total; p++) y[p] = LUMA[0] * r[p] + LUMA[1] * g[p] + LUMA[2] * b[p];
    return y;
  };
  /** Soma a mesma diferença de luz nos três canais (a cor fica). */
  const somarNaLuz = (delta: (p: number) => number) => {
    for (let p = 0; p < total; p++) {
      const d = delta(p);
      r[p] += d;
      g[p] += d;
      b[p] += d;
    }
  };
  // Textura (o detalhe fino) e claridade (o contraste local dos meios-tons), na luz
  const textura = n(v, "textura") / 100;
  const claridade = n(v, "claridade") / 100;
  if (textura || claridade) {
    mudou = true;
    const y = luzAgora();
    const fina = textura ? borrar(y, largura, altura, 1.5 * ctx.escala) : null;
    const larga = claridade ? borrar(y, largura, altura, 12 * ctx.escala) : null;
    somarNaLuz((p) => (fina ? (y[p] - fina[p]) * textura * 1.2 : 0) + (larga ? (y[p] - larga[p]) * claridade * 1.5 * 4 * y[p] * (1 - y[p]) : 0));
  }
  // Redução de ruído: a luz alisada onde não há borda; a cor (Cb e Cr) borrada
  const ruidoLuz = n(v, "ruido_luminancia") / 100;
  const ruidoCor = n(v, "ruido_cor") / 100;
  if (ruidoLuz || ruidoCor) {
    mudou = true;
    if (ruidoLuz) {
      const y = luzAgora();
      const lisa = borrar(y, largura, altura, (0.6 + ruidoLuz * 1.6) * ctx.escala);
      const { m } = gradiente(lisa, largura, altura);
      somarNaLuz((p) => (lisa[p] - y[p]) * ruidoLuz * (1 - limitar(m[p] * 10)));
    }
    if (ruidoCor) {
      const y = luzAgora();
      const sigma = (1 + ruidoCor * 5) * ctx.escala;
      const cr = borrar(r.map((x, p) => x - y[p]), largura, altura, sigma);
      const cg = borrar(g.map((x, p) => x - y[p]), largura, altura, sigma);
      const cb = borrar(b.map((x, p) => x - y[p]), largura, altura, sigma);
      for (let p = 0; p < total; p++) {
        r[p] += (y[p] + cr[p] - r[p]) * ruidoCor;
        g[p] += (y[p] + cg[p] - g[p]) * ruidoCor;
        b[p] += (y[p] + cb[p] - b[p]) * ruidoCor;
      }
    }
  }
  // Nitidez: a máscara de nitidez na luz; o detalhe limita o halo e o mascaramento deixa só as bordas
  const nitidez = n(v, "nitidez") / 50;
  if (nitidez) {
    mudou = true;
    const y = luzAgora();
    const borrada = borrar(y, largura, altura, n(v, "raio") * ctx.escala);
    const teto = 0.03 + 0.3 * (n(v, "detalhe") / 100);
    const limiar = (n(v, "mascaramento") / 100) * 0.15;
    const { m } = limiar ? gradiente(borrada, largura, altura) : { m: null };
    somarNaLuz((p) => {
      const detalhe = Math.max(-teto, Math.min(teto, y[p] - borrada[p])) * nitidez;
      return m ? detalhe * suave((m[p] - limiar) / Math.max(1e-4, limiar) + 0.5) : detalhe;
    });
  }
  // Granulação: grão preso ao documento, no tamanho e na aspereza pedidos, mais nos meios-tons
  const grao = n(v, "grao") / 100;
  if (grao) {
    mudou = true;
    const tamanho = 0.7 + n(v, "grao_tamanho") / 25;
    const aspereza = n(v, "grao_aspereza") / 100;
    const y = luzAgora();
    somarNaLuz((p) => {
      const x = p % largura;
      const linha = (p - x) / largura;
      const dx = ctx.origem.x + (x + 0.5) / ctx.escala;
      const dy = ctx.origem.y + (linha + 0.5) / ctx.escala;
      const fino = sorteio(Math.floor(dx / tamanho), Math.floor(dy / tamanho), 71);
      const macio = fractal(dx, dy, tamanho * 1.5, 72, 2);
      return (fino * aspereza + macio * (1 - aspereza) - 0.5) * grao * 0.35 * (0.35 + 2.6 * y[p] * (1 - y[p]));
    });
  }
  // Vinheta: no retângulo da imagem do filtro (a camada), com o ponto médio, o arredondamento e a difusão
  const vinheta = n(v, "vinheta") / 100;
  if (vinheta) {
    mudou = true;
    const expoente = 2 + (1 - (n(v, "vinheta_arredondamento") + 100) / 200) * 8;
    const inicio = 0.1 + 0.85 * (n(v, "vinheta_meio") / 100);
    const difusao = 0.05 + 0.95 * (n(v, "vinheta_difusao") / 100);
    const estilo = String(v.vinheta_estilo ?? "realces");
    const protegerRealces = n(v, "vinheta_realces") / 100;
    for (let p = 0; p < total; p++) {
      const x = p % largura;
      const linha = (p - x) / largura;
      const u = Math.abs(((x + 0.5) / largura) * 2 - 1);
      const w = Math.abs(((linha + 0.5) / altura) * 2 - 1);
      const d = (u ** expoente + w ** expoente) ** (1 / expoente);
      const k = suave((d - inicio) / difusao) * Math.abs(vinheta);
      if (!k) continue;
      const alvo = vinheta < 0 ? 0 : 1;
      const y = LUMA[0] * r[p] + LUMA[1] * g[p] + LUMA[2] * b[p];
      if (estilo === "pintura") {
        r[p] += (alvo - r[p]) * k;
        g[p] += (alvo - g[p]) * k;
        b[p] += (alvo - b[p]) * k;
      } else if (estilo === "cor") {
        // A luz muda e a cor fica (a razão dos canais)
        const novaLuz = y + (alvo - y) * k;
        const fator = y > 1e-4 ? novaLuz / y : 1;
        r[p] = alvo === 1 ? r[p] + (1 - r[p]) * k : r[p] * fator;
        g[p] = alvo === 1 ? g[p] + (1 - g[p]) * k : g[p] * fator;
        b[p] = alvo === 1 ? b[p] + (1 - b[p]) * k : b[p] * fator;
      } else {
        // Prioridade dos realces: escurecer multiplica, e os realces voltam pela proteção
        const kk = k * (1 - protegerRealces * y * y);
        r[p] = alvo === 0 ? r[p] * (1 - kk) : r[p] + (1 - r[p]) * kk;
        g[p] = alvo === 0 ? g[p] * (1 - kk) : g[p] + (1 - g[p]) * kk;
        b[p] = alvo === 0 ? b[p] * (1 - kk) : b[p] + (1 - b[p]) * kk;
      }
    }
  }
  if (!mudou) return imagem;
  const dados = new Uint8ClampedArray(imagem.dados.length);
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const a = alfa[p];
    dados[i] = Math.round(limitar(r[p]) * a * 255);
    dados[i + 1] = Math.round(limitar(g[p]) * a * 255);
    dados[i + 2] = Math.round(limitar(b[p]) * a * 255);
    dados[i + 3] = imagem.dados[i + 3];
  }
  return { largura, altura, dados };
}
