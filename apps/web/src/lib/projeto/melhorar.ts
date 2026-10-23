// "Melhorar": ajustes de cor sugeridos a partir de uma amostra da imagem (a capa do vídeo ou a foto reduzida).
// Só os controles que a pessoa já tem (exposição, contraste, realces, sombras, temperatura, tom e saturação),
// para ela ver e mudar o que a conta escolheu. Corrige só parte do que mede: a média de uma cena (pôr do sol,
// palco azul) nem sempre é um erro, então cada ajuste é contido.
import { type AjustesCor, FORCA_TEMPERATURA, FORCA_TOM, paraLinear } from "./cor.ts";

/** Quanto do desvio medido cada ajuste corrige. */
const PARTE_DO_BRANCO = 0.6;
const PARTE_DA_LUZ = 0.7;
/** A mediana da luminância que a exposição busca (na tela, de 0 a 1). */
const MEDIANA_ALVO = 0.47;
const LIMITE_DO_BRANCO = 0.5;
const LIMITE_DA_EXPOSICAO = 1;
/** Os pixels que contam para o branco: meios-tons quase neutros (o céu do pôr do sol, muito colorido, fica de fora). */
const SATURACAO_DO_NEUTRO = 0.5;
/** Com menos que isto de pixels quase neutros, a cor da cena é de propósito e o branco não muda. */
const PARTE_MINIMA_DE_NEUTROS = 0.1;
/** Até este desvio (em pontos de luz) a exposição fica como está: é gosto, não erro. */
const TOLERANCIA_DA_EXPOSICAO = 0.5;

const LUMA = [0.2126, 0.7152, 0.0722];
const arredondar = (valor: number) => Math.round(valor * 100) / 100;
const limitar = (valor: number, limite: number) => Math.max(-limite, Math.min(limite, valor));

function percentil(ordenados: number[], p: number): number {
  return ordenados[Math.min(ordenados.length - 1, Math.max(0, Math.round(p * (ordenados.length - 1))))];
}

/**
 * Os ajustes para uma amostra em RGBA (como o `getImageData`). Pixels quase transparentes ficam de fora.
 * Devolve só os campos dos ajustes; o que já estava no clipe (filtro, curvas, rodas) fica.
 */
export function ajustesAutomaticos(rgba: ArrayLike<number>): Pick<AjustesCor, "exposicao" | "contraste" | "realces" | "sombras" | "temperatura" | "tom" | "saturacao"> {
  const luminancias: number[] = [];
  let somaR = 0;
  let somaG = 0;
  let somaB = 0;
  let meios = 0;
  let somaCroma = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const r = rgba[i] / 255;
    const g = rgba[i + 1] / 255;
    const b = rgba[i + 2] / 255;
    const y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
    luminancias.push(y);
    somaCroma += Math.max(r, g, b) - Math.min(r, g, b);
    // O branco se mede nos meios-tons quase neutros: o preto, o estourado e o que tem cor forte não dizem a cor da luz
    const maior = Math.max(r, g, b);
    if (y > 0.1 && y < 0.9 && (maior - Math.min(r, g, b)) / maior < SATURACAO_DO_NEUTRO) {
      somaR += paraLinear(r);
      somaG += paraLinear(g);
      somaB += paraLinear(b);
      meios++;
    }
  }
  const neutro = { exposicao: 0, contraste: 0, realces: 0, sombras: 0, temperatura: 0, tom: 0, saturacao: 0 };
  if (luminancias.length < 16) return neutro;
  luminancias.sort((a, b) => a - b);
  const mediana = percentil(luminancias, 0.5);
  const baixo = percentil(luminancias, 0.02);
  const alto = percentil(luminancias, 0.98);

  // Exposição: a mediana até o alvo, em luz linear (pontos de luz)
  const desvio = mediana > 0.01 ? Math.log2(paraLinear(MEDIANA_ALVO) / paraLinear(mediana)) : 0;
  // Clarear não passa do ponto em que o claro da imagem (o percentil 98) chegaria ao branco: numa foto noturna
  // com luzes, a mediana baixa é a noite, e as luzes estourariam
  const ateOBranco = alto > 0.01 ? Math.max(0, Math.log2(paraLinear(0.98) / paraLinear(alto))) : LIMITE_DA_EXPOSICAO;
  const exposicao = Math.abs(desvio) < TOLERANCIA_DA_EXPOSICAO ? 0 : Math.min(limitar(PARTE_DA_LUZ * desvio, LIMITE_DA_EXPOSICAO), ateOBranco);
  // Contraste: só abre uma imagem lavada (a faixa entre o escuro e o claro estreita); nunca fecha
  const faixa = alto - baixo;
  const contraste = faixa > 0.05 && faixa < 0.8 ? Math.min(0.3, 0.5 * (0.85 / faixa - 1)) : 0;
  // Realces e sombras: segura o estourado e abre o escuro demais
  const realces = percentil(luminancias, 0.97) > 0.985 ? -0.25 : 0;
  const sombras = baixo < 0.03 && mediana < 0.35 ? 0.2 : 0;

  // Balanço de branco pelo mundo cinza: a média dos meios-tons deve sair cinza
  let temperatura = 0;
  let tom = 0;
  if (meios >= 16 && meios >= PARTE_MINIMA_DE_NEUTROS * luminancias.length) {
    const [mr, mg, mb] = [somaR / meios, somaG / meios, somaB / meios];
    // (1 + F·t)·R = (1 − F·t)·B
    temperatura = limitar(PARTE_DO_BRANCO * ((mb - mr) / (FORCA_TEMPERATURA * (mb + mr))), LIMITE_DO_BRANCO);
    // (1 − F·tom)·G = (R + B)/2
    tom = limitar(PARTE_DO_BRANCO * ((1 - (mr + mb) / 2 / mg) / FORCA_TOM), LIMITE_DO_BRANCO);
  }
  // Saturação: um pouco a mais na imagem apagada
  const croma = somaCroma / luminancias.length;
  const saturacao = croma < 0.12 ? 0.15 : croma < 0.25 ? 0.08 : 0;

  return {
    exposicao: arredondar(exposicao),
    contraste: arredondar(contraste),
    realces,
    sombras,
    temperatura: arredondar(temperatura),
    tom: arredondar(tom),
    saturacao,
  };
}
