// As transições de luz (o Clipar, ADR 0004, 14.12c): Flash e Clarão. Os dois clipes se cortam seco no corte, e por
// cima de tudo o que é imagem entra uma camada de ajuste que sobe até o corte e desce depois (as animações de entrada
// e saída "aparecer", que o render faz com o fade do alfa): no Flash ela leva tudo ao branco (a curva presa em 1), no
// Clarão é uma luz quente que vem de um canto (exposição, temperatura e uma máscara de elipse bem suave). Assim a
// prévia e o render desenham pelo caminho que a camada de ajuste já tem. A mesma conta em core/utils/transicao_de_luz.py.
import { duracaoDoQuadro } from "../tempo.ts";
import { AJUSTES_NEUTROS, type Cor, CURVA_NEUTRA } from "./cor.ts";
import type { Clipe, Faixa, MascaraDeForma, Projeto } from "./modelo.ts";
import { RECORTE_PADRAO, TRANSFORMACAO_PADRAO } from "./modelo.ts";

export const TRANSICOES_DE_LUZ = ["flash", "clarao"] as const;
export type TransicaoDeLuz = (typeof TRANSICOES_DE_LUZ)[number];
export const SUFIXO_DA_LUZ = "~luz";
const FAIXA_DA_LUZ = "~luzes";

export function ehTransicaoDeLuz(tipo: string | undefined | null): tipo is TransicaoDeLuz {
  return tipo === "flash" || tipo === "clarao";
}

const COR_DO_FLASH: Cor = {
  ...AJUSTES_NEUTROS,
  filtro: null,
  intensidade: 1,
  curvas: { rgb: [[0, 1], [1, 1]], r: CURVA_NEUTRA, g: CURVA_NEUTRA, b: CURVA_NEUTRA },
  hsl: null,
  lut: null,
};
// A luz quente: mais exposição, e as curvas levantam o vermelho e um pouco do verde e seguram o azul
const COR_DO_CLARAO: Cor = {
  ...AJUSTES_NEUTROS,
  exposicao: 1.2,
  temperatura: 1,
  filtro: null,
  intensidade: 1,
  curvas: { rgb: CURVA_NEUTRA, r: [[0, 0.3], [0.5, 0.92], [1, 1]], g: [[0, 0.1], [1, 1]], b: [[0, 0], [1, 0.78]] },
  hsl: null,
  lut: null,
};
const MASCARA_DO_CLARAO: MascaraDeForma = { forma: "elipse", x: 0.12, y: 0.18, largura: 1.5, altura: 1.3, suavidade: 0.5, inverter: false };

/**
 * A janela da luz em volta do corte, em quadros inteiros: a mesma das outras transições (a metade de baixo antes do
 * corte), para o pico cair no corte.
 */
export function janelaDaLuz(corte: number, duracao: number, quadro: number): { inicio: number; duracao: number; antes: number } {
  const quadros = Math.max(2, Math.round(duracao / quadro));
  const antes = Math.floor(quadros / 2) * quadro;
  return { inicio: Math.max(0, corte - antes), duracao: quadros * quadro, antes: Math.min(antes, corte) };
}

/** O projeto com a camada de ajuste de cada transição de luz da principal, numa faixa por cima dos vídeos. */
export function comAsLuzesDasTransicoes(projeto: Projeto): Projeto {
  const principal = projeto.faixas.find((faixa) => faixa.tipo === "principal");
  if (!principal?.clipes.some((clipe) => ehTransicaoDeLuz(clipe.transicao?.tipo))) return projeto;
  const quadro = duracaoDoQuadro(projeto.taxa);
  const clipes = [...principal.clipes].sort((a, b) => a.inicio - b.inicio);
  const luzes: Clipe[] = [];
  clipes.forEach((clipe, i) => {
    const transicao = clipe.transicao;
    if (!clipes[i + 1] || !transicao || !ehTransicaoDeLuz(transicao.tipo) || transicao.duracao <= 0) return;
    const corte = clipe.inicio + clipe.duracao;
    const janela = janelaDaLuz(corte, transicao.duracao, quadro);
    const flash = transicao.tipo === "flash";
    luzes.push({
      id: `${clipe.id}${SUFIXO_DA_LUZ}`,
      midia_id: null,
      ajuste: true,
      inicio: janela.inicio,
      duracao: janela.duracao,
      entrada: 0,
      velocidade: 1,
      volume: 0,
      fade_entrada: 0,
      fade_saida: 0,
      transformacao: TRANSFORMACAO_PADRAO,
      recorte: RECORTE_PADRAO,
      cor: flash ? COR_DO_FLASH : COR_DO_CLARAO,
      mascara: flash ? null : MASCARA_DO_CLARAO,
      animacao: {
        entrada: { tipo: "aparecer", duracao: janela.antes },
        saida: { tipo: "aparecer", duracao: janela.duracao - janela.antes },
      },
    });
  });
  if (!luzes.length) return projeto;
  const faixa: Faixa = { id: FAIXA_DA_LUZ, tipo: "video", oculta: false, muda: true, travada: true, clipes: luzes };
  // A lista vai de cima para baixo: a luz fica acima de todos os vídeos e abaixo dos textos e das legendas
  const primeiraDeImagem = projeto.faixas.findIndex((item) => item.tipo === "video" || item.tipo === "principal");
  const faixas = [...projeto.faixas];
  faixas.splice(primeiraDeImagem < 0 ? faixas.length : primeiraDeImagem, 0, faixa);
  return { ...projeto, faixas };
}
