// O layout de uma cena (ADR 0004, 14.7): como um vídeo deitado ocupa um quadro em pé. O clipe guarda só a intenção
// (`layout`), e as cópias nascem na hora de desenhar, iguais na prévia e no render (core/utils/layout_da_cena.py,
// casos em tests/casos/layout.json), como o fundo desfocado (fundoDesfocado.ts):
//  - preencher: sem layout, o clipe cobre o quadro (seguindo o rosto ou parado onde a pessoa pôs);
//  - caber: o clipe inteiro no meio, sobre uma cópia dele mesmo cobrindo o quadro, desfocada;
//  - duas pessoas e tela e rosto: o quadro dividido em cima e embaixo, cada parte com um pedaço da imagem (um
//    retângulo na proporção da parte, em volta de um centro, com zoom). Na tela e rosto, a parte de cima costuma
//    mostrar a imagem inteira e a de baixo o rosto; a conta é a mesma.
// A cópia de baixo (no caber, a desfocada; no dividido, a parte de cima) guarda o id e o som do clipe; a outra vai
// para uma faixa logo acima, sem som.
import { recorteNaFonte, type Tamanho } from "./geometria.ts";
import type { Keyframes } from "./keyframes.ts";
import type { Clipe, Faixa, Projeto, Recorte } from "./modelo.ts";

/** Um pedaço da imagem: o centro em frações da mídia (como ela é, sem virar) e o zoom (1 é o maior que cabe). */
export type RegiaoDoLayout = { x: number; y: number; zoom: number };

export type LayoutDaCena =
  | { tipo: "caber"; desfoque: number }
  | { tipo: "duas_pessoas" | "tela_rosto"; divisao: number; quadros: [RegiaoDoLayout, RegiaoDoLayout] };

export const SUFIXO_DO_LAYOUT = "~layout";
export const DIVISAO_MINIMA = 0.2;
export const ZOOM_MAXIMO = 4;
export const DESFOQUE_DO_CABER = 0.6;

const limitar = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor));

export function temLayout(clipe: Pick<Clipe, "layout" | "midia_id" | "texto" | "ajuste">): boolean {
  return Boolean(clipe.layout && clipe.midia_id && !clipe.texto && !clipe.ajuste);
}

/** A proporção do quadro do projeto ("9:16") como um tamanho. */
export function quadroDaProporcao(proporcao: string): Tamanho {
  const [largura, altura] = proporcao.split(":").map(Number);
  return { largura, altura };
}

/** As alturas (em frações do quadro) das duas partes do dividido. */
export function partesDaDivisao(divisao: number): [number, number] {
  const cima = limitar(divisao, DIVISAO_MINIMA, 1 - DIVISAO_MINIMA);
  return [cima, 1 - cima];
}

/**
 * O retângulo da mídia (frações, como ela é) que a região mostra numa caixa com a proporção `alvo`: o maior nessa
 * proporção que cabe na mídia, dividido pelo zoom, em volta do centro e sem sair da imagem.
 */
export function recorteDaRegiao(regiao: RegiaoDoLayout, midia: Tamanho, alvo: Tamanho): Recorte {
  const proporcao = alvo.largura / alvo.altura;
  const zoom = limitar(regiao.zoom, 1, ZOOM_MAXIMO);
  const [largura, altura] = midia.largura / midia.altura > proporcao ? [(midia.altura * proporcao) / midia.largura, 1] : [1, midia.largura / proporcao / midia.altura];
  const l = largura / zoom;
  const a = altura / zoom;
  return { x: limitar(regiao.x - l / 2, 0, 1 - l), y: limitar(regiao.y - a / 2, 0, 1 - a), largura: l, altura: a };
}

/** A escala que faz a mídia (já recortada) cobrir o quadro inteiro (1 é caber). */
export function escalaParaCobrir(midia: Tamanho, quadro: Tamanho): number {
  const largura = quadro.largura / midia.largura;
  const altura = quadro.altura / midia.altura;
  return Math.max(largura, altura) / Math.min(largura, altura);
}

/** Os keyframes que continuam nas cópias: o volume e a opacidade (os de posição são do enquadramento de antes). */
function keyframesDaCopia(keyframes: Keyframes | null | undefined): Keyframes | null {
  if (!keyframes) return null;
  const { volume, opacidade } = keyframes;
  return volume?.length || opacidade?.length ? { ...(volume?.length ? { volume } : {}), ...(opacidade?.length ? { opacidade } : {}) } : null;
}

/** As duas cópias do clipe: a que fica na faixa dele (com o id e o som) e a que vai para a faixa de cima. */
export function copiasDoLayout(clipe: Clipe, midia: Tamanho, quadro: Tamanho): { embaixo: Clipe; acima: Clipe } | null {
  const layout = clipe.layout;
  if (!layout || !temLayout(clipe) || midia.largura <= 0 || midia.altura <= 0) return null;
  const opacidade = clipe.transformacao.opacidade;
  const base: Clipe = { ...clipe, layout: null, keyframes: keyframesDaCopia(clipe.keyframes), expressoes: null, mascara: null, contorno: null, sombra: null };
  const acima = (copia: Partial<Clipe>): Clipe => ({ ...base, ...copia, id: `${clipe.id}${SUFIXO_DO_LAYOUT}`, som_separado: true, transicao: null });
  if (layout.tipo === "caber") {
    const recortada = { largura: midia.largura * clipe.recorte.largura, altura: midia.altura * clipe.recorte.altura };
    return {
      embaixo: {
        ...base,
        transformacao: { x: 0, y: 0, escala: escalaParaCobrir(recortada, quadro), rotacao: 0, opacidade },
        efeito: { tipo: "desfoque", intensidade: limitar(layout.desfoque, 0.05, 1) },
        cantos: null,
      },
      acima: acima({ transformacao: { x: 0, y: 0, escala: 1, rotacao: 0, opacidade } }),
    };
  }
  const [cima, baixo] = partesDaDivisao(layout.divisao);
  const parte = (regiao: RegiaoDoLayout, altura: number, centro: number): Partial<Clipe> => ({
    recorte: recorteNaFonte(recorteDaRegiao(regiao, midia, { largura: quadro.largura, altura: quadro.altura * altura }), clipe.virar),
    transformacao: { x: 0, y: centro, escala: 1, rotacao: 0, opacidade },
  });
  return {
    embaixo: { ...base, ...parte(layout.quadros[0], cima, cima / 2 - 0.5) },
    acima: acima(parte(layout.quadros[1], baixo, cima / 2)),
  };
}

/**
 * O projeto com as cópias dos layouts: cada faixa com algum clipe de layout ganha uma faixa logo acima com as cópias
 * de cima. `tamanho` dá o tamanho de cada mídia; a que não se sabe fica como está.
 */
export function comOsLayouts(projeto: Projeto, tamanho: (midiaId: string) => Tamanho | null): Projeto {
  if (!projeto.faixas.some((faixa) => faixa.clipes.some(temLayout))) return projeto;
  const quadro = quadroDaProporcao(projeto.proporcao);
  const faixas: Faixa[] = [];
  for (const faixa of projeto.faixas) {
    const copias = new Map<string, { embaixo: Clipe; acima: Clipe }>();
    for (const clipe of faixa.clipes) {
      const medida = temLayout(clipe) ? tamanho(clipe.midia_id!) : null;
      const par = medida ? copiasDoLayout(clipe, medida, quadro) : null;
      if (par) copias.set(clipe.id, par);
    }
    if (!copias.size) {
      faixas.push(faixa);
      continue;
    }
    faixas.push({
      ...faixa,
      id: `${faixa.id}${SUFIXO_DO_LAYOUT}`,
      tipo: faixa.tipo === "principal" ? "video" : faixa.tipo,
      muda: true,
      clipes: [...copias.values()].map((par) => par.acima),
    });
    faixas.push({ ...faixa, clipes: faixa.clipes.map((clipe) => copias.get(clipe.id)?.embaixo ?? clipe) });
  }
  return { ...projeto, faixas };
}
