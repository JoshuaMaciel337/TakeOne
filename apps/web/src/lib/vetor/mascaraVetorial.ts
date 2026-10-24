// A máscara vetorial de uma camada (ADR 0003, onda 13.7): caminhos que mostram ou escondem a camada, com a borda nítida
// em qualquer tamanho. Como a máscara de pixels (lib/projeto/mascaraDePixels.ts), ela vive no espaço do documento e uma
// matriz leva a posição dentro da caixa da camada (0 a 1) ao ponto da máscara (frações do documento): vinculada, a
// matriz é a da caixa quando ela foi feita (e a máscara anda com a camada); desvinculada, é a da caixa de agora. A base
// diz o que vale fora dos caminhos: "revelar" mostra tudo e os caminhos que subtraem escondem; "ocultar" esconde tudo
// e os caminhos que somam mostram.
import { type Afim, aplicar, compor, inverter, matrizDaCaixa, matrizEmUso } from "../projeto/mascaraDePixels.ts";
import type { Caixa, Tamanho } from "../projeto/geometria.ts";
import { transformarCaminhos } from "./edicao.ts";
import type { Subcaminho } from "./modelo.ts";

export type MascaraVetorial = {
  /** Os caminhos, em pixels do documento no espaço da máscara. */
  subcaminhos: Subcaminho[];
  base: "revelar" | "ocultar";
  ligada: boolean;
  vinculada: boolean;
  /** 1 é a máscara inteira; 0 não esconde nada. */
  densidade: number;
  /** O desfoque da borda, em pixels do documento. */
  difusao: number;
  matriz: Afim;
};

// A caixa e o quadro vêm nas mesmas unidades (os pixels da prévia, por exemplo); os caminhos, em pixels do documento.

/** Uma máscara vetorial nova para a camada: vinculada, na caixa de agora. */
export function novaMascaraVetorial(base: MascaraVetorial["base"], subcaminhos: Subcaminho[], caixa: Caixa, quadro: Tamanho): MascaraVetorial {
  return { subcaminhos, base, ligada: true, vinculada: true, densidade: 1, difusao: 0, matriz: matrizDaCaixa(caixa, quadro) };
}

/** A matriz que leva o espaço da máscara ao documento como ele aparece agora (frações do documento). */
export function daMascaraAoDocumento(mascara: Pick<MascaraVetorial, "vinculada" | "matriz">, caixa: Caixa, quadro: Tamanho): Afim {
  // Ponto da máscara m → posição na caixa L = M⁻¹(m) → documento D(L)
  return compor(matrizDaCaixa(caixa, quadro), inverter(matrizEmUso(mascara, caixa, quadro)));
}

function levar(caminhos: Subcaminho[], matriz: Afim, documento: Tamanho): Subcaminho[] {
  return transformarCaminhos(caminhos, (p) => {
    const [x, y] = aplicar(matriz, p.x / documento.largura, p.y / documento.altura);
    return { x: x * documento.largura, y: y * documento.altura };
  });
}

/** Os caminhos da máscara onde aparecem agora no documento (para as ferramentas de caminho). */
export function caminhosDaMascaraNoDocumento(mascara: MascaraVetorial, caixa: Caixa, quadro: Tamanho, documento: Tamanho): Subcaminho[] {
  return levar(mascara.subcaminhos, daMascaraAoDocumento(mascara, caixa, quadro), documento);
}

/** O contrário: caminhos em pixels do documento de agora levados ao espaço da máscara. */
export function caminhosNoEspacoDaMascara(caminhos: Subcaminho[], mascara: MascaraVetorial, caixa: Caixa, quadro: Tamanho, documento: Tamanho): Subcaminho[] {
  return levar(caminhos, inverter(daMascaraAoDocumento(mascara, caixa, quadro)), documento);
}

/**
 * Vincular ou desvincular sem tirar a máscara do lugar: ao vincular, a matriz passa a ser a da caixa de agora (os
 * caminhos já estão onde aparecem); ao desvincular, os caminhos vão para onde aparecem no documento.
 */
export function vincularMascaraVetorial(mascara: MascaraVetorial, vincular: boolean, caixa: Caixa, quadro: Tamanho, documento: Tamanho): MascaraVetorial {
  if (vincular === mascara.vinculada) return mascara;
  const subcaminhos = caminhosDaMascaraNoDocumento(mascara, caixa, quadro, documento);
  return { ...mascara, subcaminhos, vinculada: vincular, matriz: matrizDaCaixa(caixa, quadro) };
}

/** Inverter: a base troca, e os caminhos que somavam passam a subtrair (e o contrário). */
export function inverterMascaraVetorial(mascara: MascaraVetorial): MascaraVetorial {
  const trocar = { somar: "subtrair", subtrair: "somar", intersectar: "intersectar", excluir: "excluir" } as const;
  return { ...mascara, base: mascara.base === "revelar" ? "ocultar" : "revelar", subcaminhos: mascara.subcaminhos.map((sub) => ({ ...sub, operacao: trocar[sub.operacao] })) };
}
