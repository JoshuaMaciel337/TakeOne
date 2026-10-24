// Editar › Deformação de perspectiva (ADR 0003, onda 13.6): no layout, os planos (quadriláteros) marcam as faces da
// foto que estão em perspectiva (as paredes de um prédio), com os cantos de um plano grudados nos do vizinho; na
// deformação, os cantos andam e cada plano leva o pedaço dele pela homografia do layout para o lugar novo. O que fica
// fora dos planos segue o plano mais perto. Endireitar deixa em pé as arestas quase verticais e nivela as quase
// horizontais.
import { coeficientesDaHomografia, homografia, type Ponto, type Quadrilatero } from "./malha.ts";
import { type Interpolacao, leitor } from "./livre.ts";

type Imagem = { dados: ArrayLike<number>; largura: number; altura: number };

/** Os quatro vértices de um plano (em cima à esquerda, em cima à direita, embaixo à direita, embaixo à esquerda). */
export type Plano = [number, number, number, number];
export type DeformacaoDePerspectiva = { origem: Ponto[]; destino: Ponto[]; planos: Plano[] };

const quadDe = (pontos: Ponto[], plano: Plano): Quadrilatero => [pontos[plano[0]], pontos[plano[1]], pontos[plano[2]], pontos[plano[3]]];

/** O contrário da homografia: do ponto do quadrilátero para o (u, v) do quadrado unitário. */
function inversaDaHomografia(q: Quadrilatero): (p: Ponto) => Ponto {
  const [a, b, c, d, e, f, g, h] = coeficientesDaHomografia(q);
  const A = e - f * h;
  const B = c * h - b;
  const C = b * f - c * e;
  const D = f * g - d;
  const E = a - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const H = b * g - a * h;
  const I = a * e - b * d;
  return (p) => {
    const w = G * p.x + H * p.y + I || 1e-12;
    return { x: (A * p.x + B * p.y + C) / w, y: (D * p.x + E * p.y + F) / w };
  };
}

function dentroDoQuad(q: Quadrilatero, p: Ponto): boolean {
  let dentro = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const a = q[i];
    const b = q[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

function distanciaAoQuad(q: Quadrilatero, p: Ponto): number {
  let menor = Infinity;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    menor = Math.min(menor, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return menor;
}

/** A foto deformada pelos planos (do mesmo tamanho). */
export function deformarPelaPerspectiva(imagem: Imagem, deformacao: DeformacaoDePerspectiva, interpolacao: Interpolacao = "bilinear"): Uint8ClampedArray<ArrayBuffer> {
  const { largura, altura } = imagem;
  const saida = new Uint8ClampedArray(largura * altura * 4);
  const ler = leitor(imagem, interpolacao);
  const planos = deformacao.planos.map((plano) => ({ destino: quadDe(deformacao.destino, plano), inversa: inversaDaHomografia(quadDe(deformacao.destino, plano)), origem: homografia(quadDe(deformacao.origem, plano)) }));
  if (!planos.length) {
    for (let i = 0; i < largura * altura * 4; i++) saida[i] = imagem.dados[i];
    return saida;
  }
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const p = { x: x + 0.5, y: y + 0.5 };
      // O plano em que o ponto cai; fora de todos, o mais perto (a homografia dele, estendida)
      let escolhido = planos.find((plano) => dentroDoQuad(plano.destino, p));
      if (!escolhido) {
        let menor = Infinity;
        for (const plano of planos) {
          const d = distanciaAoQuad(plano.destino, p);
          if (d < menor) {
            menor = d;
            escolhido = plano;
          }
        }
      }
      const uv = escolhido!.inversa(p);
      const fonte = escolhido!.origem(uv.x, uv.y);
      ler(fonte.x - 0.5, fonte.y - 0.5, saida, (y * largura + x) * 4);
    }
  }
  return saida;
}

/**
 * Endireitar: as arestas dos planos quase verticais (até `limite` graus) ficam em pé e as quase horizontais ficam
 * niveladas. As arestas ligadas por vértices formam correntes (a linha de cima de dois planos vizinhos, por exemplo), e
 * todos os vértices de uma corrente vão para a média dela no eixo que importa.
 */
export function endireitar(deformacao: DeformacaoDePerspectiva, quais: "verticais" | "horizontais" | "ambos", limite = 30): Ponto[] {
  const destino = deformacao.destino.map((p) => ({ ...p }));
  const n = destino.length;
  const juntar = (pais: number[], a: number, b: number) => {
    const raiz = (i: number): number => (pais[i] === i ? i : (pais[i] = raiz(pais[i])));
    pais[raiz(a)] = raiz(b);
  };
  const verticais = Array.from({ length: n }, (_, i) => i);
  const horizontais = Array.from({ length: n }, (_, i) => i);
  const temVertical = new Uint8Array(n);
  const temHorizontal = new Uint8Array(n);
  for (const plano of deformacao.planos) {
    for (let i = 0; i < 4; i++) {
      const a = plano[i];
      const b = plano[(i + 1) % 4];
      const pa = deformacao.destino[a];
      const pb = deformacao.destino[b];
      const angulo = (Math.abs(Math.atan2(pb.y - pa.y, pb.x - pa.x)) * 180) / Math.PI;
      if ((quais === "verticais" || quais === "ambos") && Math.abs(90 - angulo) <= limite) {
        juntar(verticais, a, b);
        temVertical[a] = temVertical[b] = 1;
      } else if ((quais === "horizontais" || quais === "ambos") && Math.min(angulo, 180 - angulo) <= limite) {
        juntar(horizontais, a, b);
        temHorizontal[a] = temHorizontal[b] = 1;
      }
    }
  }
  const raizDe = (pais: number[], i: number): number => (pais[i] === i ? i : raizDe(pais, pais[i]));
  const media = (pais: number[], tem: Uint8Array, eixo: "x" | "y") => {
    const somas = new Map<number, { soma: number; quantos: number }>();
    for (let i = 0; i < n; i++) {
      if (!tem[i]) continue;
      const r = raizDe(pais, i);
      const atual = somas.get(r) ?? { soma: 0, quantos: 0 };
      atual.soma += deformacao.destino[i][eixo];
      atual.quantos++;
      somas.set(r, atual);
    }
    for (let i = 0; i < n; i++) {
      if (!tem[i]) continue;
      const { soma, quantos } = somas.get(raizDe(pais, i))!;
      destino[i][eixo] = soma / quantos;
    }
  };
  media(verticais, temVertical, "x");
  media(horizontais, temHorizontal, "y");
  return destino;
}
