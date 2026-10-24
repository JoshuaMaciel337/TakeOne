// Filtro › Desfoque › Desfoque de lente (ADR 0003, onda 13.11): a profundidade (um mapa) diz quanto cada pixel sai do
// foco; o desfoque é o disco da íris (um polígono de 3 a 8 lâminas, com a curvatura e o giro, ou um círculo) do tamanho
// do círculo de confusão. A conta vai em níveis de raio: cada pixel mistura os dois níveis em volta do raio dele, e em
// cada nível uma amostra só conta onde o disco dela alcança o pixel (o assunto nítido não vaza para o fundo borrado).
// Os realces especulares viram discos claros (o claro acima do limiar é multiplicado antes do desfoque).
import { caixaNoPlano, type ContextoDoFiltro, dePlanos, type ImagemDoFiltro, limitar, lumaDe, paraPlanos, type Planos } from "./comum.ts";
import { adicionarRuido } from "./nitidezRuido.ts";

export type OpcoesDaLente = {
  /** De onde vem a profundidade: nenhuma, transparencia, luz, degrade (de cima para baixo), mascara ou canal:<id>. */
  fonte: string;
  /** A profundidade que fica nítida, de 0 a 255. */
  focal: number;
  inverter: boolean;
  /** circulo, ou o número de lâminas (3 a 8). */
  iris: string;
  /** O raio do maior disco, em pixels da imagem. */
  raio: number;
  /** A curvatura das lâminas e o giro da íris (0 a 100 e graus). */
  curvatura: number;
  rotacao: number;
  brilho: number;
  limiar: number;
  ruido: number;
  distribuicao: string;
  monocromatico: boolean;
};

/** A distância de um vetor pela íris: 1 na borda do polígono (o raio do círculo que passa pelos cantos). */
export function normaDaIris(lados: number, curvatura: number, rotacao: number): (x: number, y: number) => number {
  if (!lados) return (x, y) => Math.hypot(x, y);
  const r = (rotacao * Math.PI) / 180;
  const normais = Array.from({ length: lados }, (_, i) => r + ((2 * i + 1) * Math.PI) / lados - Math.PI / 2);
  const cos = normais.map(Math.cos);
  const sen = normais.map(Math.sin);
  const apotema = Math.cos(Math.PI / lados);
  const c = limitar(curvatura / 100);
  return (x, y) => {
    let maior = -Infinity;
    for (let i = 0; i < lados; i++) maior = Math.max(maior, x * cos[i] + y * sen[i]);
    return (1 - c) * (maior / apotema) + c * Math.hypot(x, y);
  };
}

/** A profundidade de cada pixel, de 0 a 1 (`null`: sem mapa, tudo no mesmo desfoque). */
export function profundidade(imagem: ImagemDoFiltro, fonte: string, ctx: ContextoDoFiltro): Float32Array | null {
  const { largura, altura, dados } = imagem;
  const n = largura * altura;
  if (fonte === "transparencia" || fonte === "luz") {
    const mapa = new Float32Array(n);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const a = dados[i + 3];
      mapa[p] = fonte === "transparencia" ? a / 255 : a ? lumaDe(dados[i] / a, dados[i + 1] / a, dados[i + 2] / a) : 0;
    }
    return mapa;
  }
  if (fonte === "degrade") {
    const mapa = new Float32Array(n);
    for (let y = 0; y < altura; y++) mapa.fill(limitar((ctx.origem.y + (y + 0.5) / ctx.escala) / ctx.documento.altura), y * largura, (y + 1) * largura);
    return mapa;
  }
  if (fonte === "mascara" || fonte.startsWith("canal:")) return ctx.mapa?.(fonte) ?? new Float32Array(n);
  return null;
}

export function desfoqueDeLente(imagem: ImagemDoFiltro, o: OpcoesDaLente, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const n = imagem.largura * imagem.altura;
  const raioMaximo = Math.max(0, o.raio);
  // O círculo de confusão de cada pixel, em pixels da imagem
  const mapa = profundidade(imagem, o.fonte, ctx);
  const focal = limitar(o.focal / 255);
  const coc = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const d = mapa ? (o.inverter ? 1 - mapa[p] : mapa[p]) : 1;
    coc[p] = mapa ? raioMaximo * Math.abs(d - focal) : raioMaximo;
  }
  const lados = o.iris === "circulo" ? 0 : Math.max(3, Math.min(8, Math.round(Number(o.iris)) || 6));
  let resultado = desfoqueVariavel(imagem, coc, raioMaximo, { lados, curvatura: o.curvatura, rotacao: o.rotacao }, { brilho: o.brilho, limiar: o.limiar });
  if (o.ruido > 0) resultado = adicionarRuido(resultado, o.ruido, o.distribuicao, o.monocromatico, ctx);
  return resultado;
}

/**
 * O desfoque com um raio por pixel (`coc`, em pixels da imagem, até `raioMaximo`) pelo disco da íris, com os realces
 * (o claro acima do limiar fica mais forte antes, e pode ganhar saturação): a base do desfoque de lente e da galeria.
 */
export function desfoqueVariavel(
  imagem: ImagemDoFiltro,
  coc: Float32Array,
  raioMaximo: number,
  iris: { lados: number; curvatura: number; rotacao: number },
  realces: { brilho: number; limiar: number; ate?: number; cor?: number },
): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const n = largura * altura;
  const o = { brilho: realces.brilho, limiar: realces.limiar };
  let planos = paraPlanos(imagem);
  // Os realces: o claro acima do limiar fica mais forte (passa de 1 nos planos; a saída corta)
  if (o.brilho > 0) {
    const ganho = 1 + (3 * o.brilho) / 100;
    const limiar = o.limiar / 255;
    const ate = (realces.ate ?? 255) / 255;
    const cor = (realces.cor ?? 0) / 100;
    planos = planos.map((plano) => plano.slice()) as Planos;
    for (let p = 0; p < n; p++) {
      const a = planos[3][p];
      if (!a) continue;
      const luz = lumaDe(planos[0][p] / a, planos[1][p] / a, planos[2][p] / a);
      if (luz < limiar || luz > ate) continue;
      // Uma rampa curta no limiar, para o disco não aparecer de repente
      const k = 1 + (ganho - 1) * limitar((luz - limiar) * 20 + 0.5);
      // A cor do realce: a saturação cresce em volta da luz (no reto, depois volta ao pré-multiplicado)
      for (let c = 0; c < 3; c++) planos[c][p] = (luz * a + (planos[c][p] - luz * a) * (1 + cor)) * k;
    }
  }
  if (raioMaximo >= 0.5) {
    const norma = normaDaIris(iris.lados, iris.curvatura, iris.rotacao);
    const niveis = Math.max(1, Math.min(8, Math.ceil(raioMaximo / 3)));
    const raios = Array.from({ length: niveis + 1 }, (_, k) => (raioMaximo * k) / niveis);
    // O nível de baixo e o peso do de cima de cada pixel; a saída começa com a parte da imagem (o nível 0)
    const nivel = new Uint8Array(n);
    const peso = new Float32Array(n);
    const saida = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)] as Planos;
    for (let p = 0; p < n; p++) {
      const t = Math.min(niveis, (coc[p] / raioMaximo) * niveis);
      nivel[p] = Math.min(niveis - 1, Math.floor(t));
      peso[p] = t - nivel[p];
      if (nivel[p] === 0) for (let c = 0; c < 4; c++) saida[c][p] = planos[c][p] * (1 - peso[p]);
    }
    for (let k = 1; k <= niveis; k++) {
      const r = raios[k];
      // A grade do disco, mais rala nos raios grandes, em passos inteiros e ímpares, com a fonte borrada por uma caixa
      // da largura do passo: as caixas se encostam sem sobrar nem faltar coluna. Com passos quebrados (buracos
      // desiguais) ou uma caixa maior que o passo (colunas contadas duas vezes), a textura da foto virava listras.
      const passo = Math.max(1, 2 * Math.round((r / 6 - 1) / 2) + 1);
      const lado = Math.ceil(r / passo);
      const listaDx: number[] = [];
      const listaDy: number[] = [];
      const listaD: number[] = [];
      for (let j = -lado; j <= lado; j++) {
        for (let i = -lado; i <= lado; i++) {
          const d = norma(i * passo, j * passo);
          if (d > r + 1e-6) continue;
          listaDx.push(i * passo);
          listaDy.push(j * passo);
          listaD.push(d);
        }
      }
      const total = listaD.length;
      const dxs = Int32Array.from(listaDx);
      const dys = Int32Array.from(listaDy);
      const ds = Float32Array.from(listaD);
      // O deslocamento de cada amostra no índice da imagem (para o miolo, onde nenhuma sai da borda)
      const desvios = Int32Array.from(listaDx.map((dx, i) => dx + listaDy[i] * largura));
      const alcance = lado * passo;
      const fonte = passo > 1 ? (planos.map((plano) => caixaNoPlano(plano, largura, altura, (passo - 1) / 2)) as Planos) : planos;
      const [f0, f1, f2, f3] = fonte;
      for (let y = 0; y < altura; y++) {
        const miolo = y >= alcance && y < altura - alcance;
        for (let x = 0; x < largura; x++) {
          const p = y * largura + x;
          // Só os pixels cujo raio cai entre os níveis k − 1 e k + 1 usam este
          const esteNivel = nivel[p] === k - 1 ? peso[p] : nivel[p] === k ? 1 - peso[p] : 0;
          if (esteNivel <= 0) continue;
          let s0 = 0;
          let s1 = 0;
          let s2 = 0;
          let s3 = 0;
          let pesos = 0;
          if (miolo && x >= alcance && x < largura - alcance) {
            for (let j = 0; j < total; j++) {
              const q = p + desvios[j];
              const d = ds[j];
              // A amostra conta onde o disco dela (o raio dela) alcança este pixel; o centro conta sempre
              const w = d < 0.5 ? 1 : coc[q] - d + 1;
              if (w <= 0) continue;
              const wl = w > 1 ? 1 : w;
              pesos += wl;
              s0 += f0[q] * wl;
              s1 += f1[q] * wl;
              s2 += f2[q] * wl;
              s3 += f3[q] * wl;
            }
          } else {
            for (let j = 0; j < total; j++) {
              const xx = x + dxs[j];
              const yy = y + dys[j];
              if (xx < 0 || yy < 0 || xx >= largura || yy >= altura) {
                // Fora da imagem é transparente (conta como um vizinho vazio)
                pesos += 1;
                continue;
              }
              const q = yy * largura + xx;
              const d = ds[j];
              const w = d < 0.5 ? 1 : coc[q] - d + 1;
              if (w <= 0) continue;
              const wl = w > 1 ? 1 : w;
              pesos += wl;
              s0 += f0[q] * wl;
              s1 += f1[q] * wl;
              s2 += f2[q] * wl;
              s3 += f3[q] * wl;
            }
          }
          if (pesos <= 0) continue;
          const k2 = esteNivel / pesos;
          saida[0][p] += s0 * k2;
          saida[1][p] += s1 * k2;
          saida[2][p] += s2 * k2;
          saida[3][p] += s3 * k2;
        }
      }
    }
    planos = saida;
  }
  return dePlanos(planos, largura, altura);
}
