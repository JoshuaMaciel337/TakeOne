// O Construtor de formas e a Pintura viva do editor vetorial (ADR 0003, onda 13.16): as formas escolhidas, sobrepostas,
// dividem o plano em faces (cada pedaço que fica dentro do mesmo grupo de formas). O Construtor junta as faces por onde
// o arrasto passa numa forma só (com Alt, as apaga), e a Pintura viva enche uma face com a cor de primeiro plano. Cada
// face sabe de que forma veio a aparência (a de cima entre as que a cobrem). As contas são puras, em pixels da imagem.
import polygonClipping, { type MultiPolygon } from "polygon-clipping";

import { areaDoPoligono, regiaoDosCaminhos } from "./contorno.ts";
import type { Subcaminho } from "./modelo.ts";
import { caminhosDaRegiaoEmCurvas, pontoNaRegiao } from "./pincelVetorial.ts";

type Ponto = { x: number; y: number };

/** Uma face: a região dela (um polígono, com os buracos) e as formas que a cobrem (os índices, de baixo para cima). */
export type Face = { regiao: MultiPolygon; dentro: number[] };

/** A área de uma região (os buracos descontam). */
export function areaDaRegiao(regiao: MultiPolygon): number {
  return regiao.reduce((soma, poligono) => soma + poligono.reduce((parcial, anel, k) => parcial + (k === 0 ? 1 : -1) * Math.abs(areaDoPoligono(anel.map(([x, y]) => ({ x, y })))), 0), 0);
}

/** Cada polígono da região como uma face (os pedaços soltos de uma interseção são faces diferentes). */
const separar = (regiao: MultiPolygon, dentro: number[]): Face[] => regiao.map((poligono) => ({ regiao: [poligono], dentro })).filter((face) => areaDaRegiao(face.regiao) > 0.5);

/** As faces das formas (os caminhos de cada uma, em ordem de desenho: a primeira embaixo). */
export function facesDasFormas(formas: Subcaminho[][]): Face[] {
  let faces: Face[] = [];
  let uniao: MultiPolygon = [];
  formas.forEach((caminhos, i) => {
    const regiao = regiaoDosCaminhos(caminhos, 0.2);
    if (!regiao.length) return;
    const novas: Face[] = [];
    for (const face of faces) {
      novas.push(...separar(polygonClipping.intersection(face.regiao, regiao), [...face.dentro, i]));
      novas.push(...separar(polygonClipping.difference(face.regiao, regiao), face.dentro));
    }
    novas.push(...separar(uniao.length ? polygonClipping.difference(regiao, uniao) : regiao, [i]));
    faces = novas;
    uniao = uniao.length ? polygonClipping.union(uniao, regiao) : regiao;
  });
  return faces;
}

/** A forma de onde a face tira a aparência: a de cima entre as que a cobrem. */
export const origemDaFace = (face: Face) => face.dentro[face.dentro.length - 1];

/** A face debaixo do ponto (a menor, se duas se sobrepuserem por arredondamento), ou -1. */
export function faceNoPonto(faces: Face[], p: Ponto): number {
  let melhor = -1;
  let menor = Infinity;
  faces.forEach((face, i) => {
    if (!pontoNaRegiao(face.regiao, p)) return;
    const area = areaDaRegiao(face.regiao);
    if (area < menor) [melhor, menor] = [i, area];
  });
  return melhor;
}

/** As faces por onde o arrasto passa (pelos pontos dele, com um a cada 2 pixels nos trechos longos). */
export function facesDoArrasto(faces: Face[], pontos: Ponto[]): number[] {
  const tocadas = new Set<number>();
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[i + 1] ?? a;
    const passos = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let k = 0; k < passos; k++) {
      const face = faceNoPonto(faces, { x: a.x + ((b.x - a.x) * k) / passos, y: a.y + ((b.y - a.y) * k) / passos });
      if (face >= 0) tocadas.add(face);
    }
  }
  return [...tocadas];
}

export type Peca = { origem: number; caminhos: Subcaminho[] };

/**
 * O resultado do Construtor: cada face vira uma peça com a aparência da forma de origem; as faces juntadas viram uma
 * peça só (com a aparência da primeira tocada), e as apagadas somem.
 */
export function construirPecas(faces: Face[], juntar: number[], apagar: number[], tolerancia = 0.35): Peca[] {
  const pecas: Peca[] = [];
  const fora = new Set([...juntar, ...apagar]);
  faces.forEach((face, i) => {
    if (!fora.has(i)) pecas.push({ origem: origemDaFace(face), caminhos: caminhosDaRegiaoEmCurvas(face.regiao, tolerancia) });
  });
  if (juntar.length) {
    const regiao = juntar.slice(1).reduce((soma, i) => polygonClipping.union(soma, faces[i].regiao), faces[juntar[0]].regiao);
    pecas.push({ origem: origemDaFace(faces[juntar[0]]), caminhos: caminhosDaRegiaoEmCurvas(regiao, tolerancia) });
  }
  return pecas;
}
