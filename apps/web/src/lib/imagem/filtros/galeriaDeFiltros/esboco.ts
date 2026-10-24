// Galeria de filtros › Esboço (baixo-relevo, giz e carvão, carvão, cromado, conté, caneta gráfica, padrão de
// meio-tom, papel de carta, fotocópia, gesso, reticulação, carimbo, bordas rasgadas, papel molhado) e Textura
// (craquelado, grão, ladrilhos de mosaico, colcha, vitral, texturizador) (ADR 0003, onda 13.11). Os esboços pintam
// com as duas cores da paleta: a da frente é a tinta (o escuro) e a do fundo é o papel (o claro).
import { type ContextoDoFiltro, limitar, sorteio } from "../comum.ts";
import {
  borrar,
  contraste,
  copiaDaCor,
  deReta,
  duasCores,
  gradiente,
  graoNoDocumento,
  luz,
  luzDoRelevo,
  multiplicar,
  noDocumento,
  planoDaTextura,
  porDocumento,
  reta,
  suaveNoDocumento,
  tracar,
} from "./base.ts";
import { escolha, type EfeitoDaGaleria, LUZ, marcar, n, numero, s, TEXTURA } from "./tipos.ts";

const suave = (t: number) => {
  const u = limitar(t);
  return u * u * (3 - 2 * u);
};
/** O limiar com uma borda de largura `borda` em volta (0 abaixo, 1 acima). */
const degrau = (v: number, limite: number, borda: number) => suave((v - limite) / Math.max(1e-4, borda) + 0.5);

/** A tinta (0, a cor da frente) ao papel (1, a cor do fundo). */
const esboco = (t: Float32Array, a: Float32Array, largura: number, altura: number, ctx: ContextoDoFiltro) => deReta(duasCores(t, ctx.primeiroPlano, ctx.fundo), largura, altura, a);

/**
 * As células de Voronoi presas ao documento, de lado `tamanho`: para cada pixel, a célula (o número) e a distância à
 * borda dela (pixels do documento).
 */
function celulas(largura: number, altura: number, tamanho: number, ctx: ContextoDoFiltro, semente: number) {
  const id = new Int32Array(largura * altura);
  const borda = new Float32Array(largura * altura);
  const centro = (i: number, j: number): [number, number] => [(i + 0.15 + 0.7 * sorteio(i, j, semente)) * tamanho, (j + 0.15 + 0.7 * sorteio(i, j, semente + 1)) * tamanho];
  for (let y = 0, p = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++, p++) {
      const [dx, dy] = noDocumento(x, y, ctx);
      const ci = Math.floor(dx / tamanho);
      const cj = Math.floor(dy / tamanho);
      let d1 = Infinity;
      let d2 = Infinity;
      let melhor = 0;
      let c1: [number, number] = [0, 0];
      let c2: [number, number] = [0, 0];
      for (let j = cj - 1; j <= cj + 1; j++) {
        for (let i = ci - 1; i <= ci + 1; i++) {
          const c = centro(i, j);
          const d = (dx - c[0]) ** 2 + (dy - c[1]) ** 2;
          if (d < d1) {
            d2 = d1;
            c2 = c1;
            d1 = d;
            c1 = c;
            melhor = (i & 0xffff) * 65536 + (j & 0xffff);
          } else if (d < d2) {
            d2 = d;
            c2 = c;
          }
        }
      }
      id[p] = melhor;
      // A distância à reta do meio entre os dois centros mais perto
      const mx = (c1[0] + c2[0]) / 2;
      const my = (c1[1] + c2[1]) / 2;
      const nx = c2[0] - c1[0];
      const ny = c2[1] - c1[1];
      const comprimento = Math.hypot(nx, ny) || 1;
      borda[p] = Math.abs(((dx - mx) * nx + (dy - my) * ny) / comprimento);
    }
  }
  return { id, borda };
}

/** A cor média de cada célula (pesada pelo alfa). */
function mediaPorCelula(cor: { r: Float32Array; g: Float32Array; b: Float32Array }, a: Float32Array, id: Int32Array) {
  const somas = new Map<number, [number, number, number, number]>();
  for (let p = 0; p < id.length; p++) {
    let s4 = somas.get(id[p]);
    if (!s4) somas.set(id[p], (s4 = [0, 0, 0, 0]));
    s4[0] += cor.r[p] * a[p];
    s4[1] += cor.g[p] * a[p];
    s4[2] += cor.b[p] * a[p];
    s4[3] += a[p];
  }
  const saida = copiaDaCor(cor);
  for (let p = 0; p < id.length; p++) {
    const s4 = somas.get(id[p])!;
    if (s4[3] <= 0) continue;
    saida.r[p] = s4[0] / s4[3];
    saida.g[p] = s4[1] / s4[3];
    saida.b[p] = s4[2] / s4[3];
  }
  return saida;
}

export const ESBOCO: EfeitoDaGaleria[] = [
  {
    id: "baixo_relevo",
    nome: "Baixo-relevo",
    categoria: "esboco",
    opcoes: [numero("detalhe", "Detalhe", 1, 15, 13), numero("suavidade", "Suavidade", 1, 15, 3), LUZ],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const relevo = luzDoRelevo(borrar(luz(img), largura, altura, n(v, "suavidade") * 0.3 * ctx.escala), largura, altura, n(v, "detalhe") / 4, s(v, "luz"));
      return esboco(relevo.map((x) => limitar(0.5 + (x - 1) * 0.6)), img.a, largura, altura, ctx);
    },
  },
  {
    id: "giz_carvao",
    nome: "Giz e carvão",
    categoria: "esboco",
    opcoes: [numero("carvao", "Área de carvão", 0, 20, 6), numero("giz", "Área de giz", 0, 20, 6), numero("pressao", "Pressão do traço", 0, 5, 1)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const l = luz(img);
      const grao = porDocumento(largura, altura, ctx, (x, y) => graoNoDocumento(x, y, 41));
      const carvao = tracar(grao, largura, altura, 45, 8 * ctx.escala);
      const giz = tracar(grao, largura, altura, -45, 8 * ctx.escala);
      const pressao = 0.25 + n(v, "pressao") * 0.15;
      // O escuro em carvão (a cor da frente), o claro em giz (a do fundo) e o meio cinza, em traços
      const t = l.map((x, p) => {
        const doCarvao = limitar((0.5 - x) * 2 * (n(v, "carvao") / 8) + (carvao[p] - 0.5) * pressao * 4);
        const doGiz = limitar((x - 0.5) * 2 * (n(v, "giz") / 8) + (giz[p] - 0.5) * pressao * 4);
        return 0.5 - doCarvao * 0.5 + doGiz * 0.5;
      });
      return esboco(t, img.a, largura, altura, ctx);
    },
  },
  {
    id: "carvao",
    nome: "Carvão",
    categoria: "esboco",
    opcoes: [numero("espessura", "Espessura do carvão", 1, 7, 1), numero("detalhe", "Detalhe", 0, 5, 5), numero("equilibrio", "Equilíbrio claro/escuro", 0, 100, 50)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const l = borrar(luz(img), largura, altura, 0.6 * ctx.escala);
      const { m } = gradiente(l, largura, altura);
      const grao = porDocumento(largura, altura, ctx, (x, y) => graoNoDocumento(x, y, 42));
      const tracos = tracar(grao, largura, altura, 45, n(v, "espessura") * 5 * ctx.escala);
      const limite = 1 - n(v, "equilibrio") / 100;
      const detalhe = n(v, "detalhe") / 5;
      const t = l.map((x, p) => limitar((x - limite) * 3 + 0.5 + (tracos[p] - 0.5) * 1.2 - m[p] * 6 * detalhe));
      return esboco(t, img.a, largura, altura, ctx);
    },
  },
  {
    id: "cromado",
    nome: "Cromado",
    categoria: "esboco",
    opcoes: [numero("detalhe", "Detalhe", 0, 10, 4), numero("suavidade", "Suavidade", 0, 10, 7)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const l = borrar(luz(img), largura, altura, (0.6 + n(v, "suavidade") * 0.6) * ctx.escala);
      // O metal: a luz passa por um seno (faixas claras e escuras) e o relevo dá o volume, em cinza
      const voltas = 1.5 + n(v, "detalhe") * 0.35;
      const volume = luzDoRelevo(l, largura, altura, 2 + n(v, "detalhe") / 2, "cima_esquerda");
      const cinza = l.map((x, p) => limitar(0.25 + 0.4 * (0.5 + 0.5 * Math.sin(x * Math.PI * 2 * voltas - Math.PI / 2)) + (volume[p] - 1) * 1.2));
      return deReta({ r: cinza, g: cinza, b: cinza }, largura, altura, img.a);
    },
  },
  {
    id: "conte",
    nome: "Conté",
    categoria: "esboco",
    opcoes: [numero("frente", "Nível da frente", 1, 15, 11), numero("fundo", "Nível do fundo", 1, 15, 7), TEXTURA, numero("escala", "Escala", 50, 200, 100, "%"), numero("relevo", "Relevo", 0, 50, 4), LUZ],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const l = luz(img);
      // O escuro na cor da frente, o claro na do fundo, e o meio no cinza entre as duas
      const frente = n(v, "frente") / 15;
      const fundo = n(v, "fundo") / 15;
      const t = l.map((x) => limitar(0.5 - (0.5 - x) * 2 * frente * 0.5 * (x < 0.5 ? 1 : 0) + (x - 0.5) * 2 * fundo * 0.5 * (x >= 0.5 ? 1 : 0)));
      const cor = duasCores(t, ctx.primeiroPlano, ctx.fundo);
      const relevo = n(v, "relevo") / 50;
      const fator = relevo > 0 ? luzDoRelevo(planoDaTextura(s(v, "textura"), n(v, "escala"), largura, altura, ctx), largura, altura, relevo, s(v, "luz")) : null;
      return deReta(fator ? multiplicar(cor, fator) : cor, largura, altura, img.a);
    },
  },
  {
    id: "caneta_grafica",
    nome: "Caneta gráfica",
    categoria: "esboco",
    opcoes: [
      numero("comprimento", "Comprimento do traço", 1, 15, 15),
      numero("equilibrio", "Equilíbrio claro/escuro", 0, 100, 50),
      escolha("direcao", "Direção do traço", [["diagonal_direita", "Diagonal para a direita"], ["horizontal", "Horizontal"], ["diagonal_esquerda", "Diagonal para a esquerda"], ["vertical", "Vertical"]]),
    ],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const l = luz(img);
      const angulo = { diagonal_direita: 45, horizontal: 0, diagonal_esquerda: -45, vertical: 90 }[s(v, "direcao")] ?? 45;
      const grao = porDocumento(largura, altura, ctx, (x, y) => graoNoDocumento(x, y, 43));
      // Os riscos finos: o ruído puxado na direção, comparado à luz (tinta onde o risco passa do claro)
      const riscos = tracar(grao, largura, altura, angulo, n(v, "comprimento") * 1.5 * ctx.escala);
      let menor = Infinity;
      let maior = -Infinity;
      for (const x of riscos) {
        menor = Math.min(menor, x);
        maior = Math.max(maior, x);
      }
      const faixa = Math.max(1e-4, maior - menor);
      const desvio = (n(v, "equilibrio") - 50) / 100;
      const t = l.map((x, p) => degrau(x + desvio, (riscos[p] - menor) / faixa, 0.08));
      return esboco(t, img.a, largura, altura, ctx);
    },
  },
  {
    id: "meio_tom",
    nome: "Padrão de meio-tom",
    categoria: "esboco",
    opcoes: [numero("tamanho", "Tamanho", 1, 12, 1), numero("contraste", "Contraste", 0, 50, 5), escolha("tipo", "Tipo de padrão", [["ponto", "Ponto"], ["circulo", "Círculo"], ["linha", "Linha"]])],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const l = luz(img);
      const periodo = 3 + n(v, "tamanho") * 2;
      const tipo = s(v, "tipo");
      const meio = { x: ctx.documento.largura / 2, y: ctx.documento.altura / 2 };
      const padrao = porDocumento(largura, altura, ctx, (x, y) => {
        if (tipo === "linha") return 0.5 + 0.5 * Math.sin((y / periodo) * Math.PI * 2);
        if (tipo === "circulo") return 0.5 + 0.5 * Math.sin((Math.hypot(x - meio.x, y - meio.y) / periodo) * Math.PI * 2);
        const cx = x - (Math.floor(x / periodo) + 0.5) * periodo;
        const cy = y - (Math.floor(y / periodo) + 0.5) * periodo;
        return Math.hypot(cx, cy) / (periodo * 0.7071);
      });
      const k = 1 + n(v, "contraste") / 5;
      const t = l.map((x, p) => degrau(contraste(x, k), padrao[p], 0.15));
      return esboco(t, img.a, largura, altura, ctx);
    },
  },
  {
    id: "papel_de_carta",
    nome: "Papel de carta",
    categoria: "esboco",
    opcoes: [numero("equilibrio", "Equilíbrio da imagem", 0, 50, 25), numero("granulacao", "Granulação", 0, 20, 10), numero("relevo", "Relevo", 0, 25, 11)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const l = borrar(luz(img), largura, altura, 0.8 * ctx.escala);
      const grao = porDocumento(largura, altura, ctx, (x, y) => graoNoDocumento(x, y, 44) - 0.5);
      const granulacao = n(v, "granulacao") / 20;
      // O papel recortado: a imagem em duas cores pelo limiar, com o relevo da borda e o grão do papel
      const plano = l.map((x, p) => degrau(x + grao[p] * granulacao * 0.3, n(v, "equilibrio") / 50, 0.05));
      const relevo = luzDoRelevo(borrar(plano, largura, altura, 1.2 * ctx.escala), largura, altura, n(v, "relevo") / 6, "cima_esquerda");
      const t = plano.map((x, p) => limitar((0.3 + x * 0.6) * relevo[p] + grao[p] * granulacao * 0.15));
      return esboco(t, img.a, largura, altura, ctx);
    },
  },
  {
    id: "fotocopia",
    nome: "Fotocópia",
    categoria: "esboco",
    opcoes: [numero("detalhe", "Detalhe", 1, 24, 7), numero("escuridao", "Escuridão", 1, 50, 8)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const l = luz(img);
      const borrada = borrar(l, largura, altura, (0.5 + n(v, "detalhe") * 0.4) * ctx.escala);
      const escuridao = n(v, "escuridao") / 8;
      // Só o que é mais escuro que a vizinhança vira tinta (as bordas e os traços); o liso fica papel
      const t = l.map((x, p) => limitar(1 - Math.max(0, borrada[p] - x) * escuridao * 6 - (x < 0.12 ? (0.12 - x) * 4 : 0)));
      return esboco(t, img.a, largura, altura, ctx);
    },
  },
  {
    id: "gesso",
    nome: "Gesso",
    categoria: "esboco",
    opcoes: [numero("equilibrio", "Equilíbrio da imagem", 0, 50, 20), numero("suavidade", "Suavidade", 1, 15, 2), LUZ],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const l = borrar(luz(img), largura, altura, n(v, "suavidade") * 0.4 * ctx.escala);
      // O escuro sobe como gesso moldado: a forma pelo limiar, iluminada
      const forma = borrar(l.map((x) => degrau(x, n(v, "equilibrio") / 50, 0.1)), largura, altura, 1.5 * ctx.escala);
      const relevo = luzDoRelevo(forma.map((x) => 1 - x), largura, altura, 3, s(v, "luz"));
      const t = forma.map((x, p) => limitar(0.35 + x * 0.3 + (relevo[p] - 1) * 0.8));
      return esboco(t, img.a, largura, altura, ctx);
    },
  },
  {
    id: "reticulacao",
    nome: "Reticulação",
    categoria: "esboco",
    opcoes: [numero("densidade", "Densidade", 0, 50, 12), numero("frente", "Nível da frente", 0, 50, 40), numero("fundo", "Nível do fundo", 0, 50, 5)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const l = luz(img);
      // A emulsão encolhida: grumos (ruído fino e médio) que agrupam a tinta no escuro e o papel no claro
      const grumos = porDocumento(largura, altura, ctx, (x, y) => 0.6 * suaveNoDocumento(x, y, 2.5, 45, 2) + 0.4 * graoNoDocumento(x, y, 46));
      const densidade = 0.4 + n(v, "densidade") / 50;
      const t = l.map((x, p) => {
        const nivel = x < 0.5 ? x - (n(v, "frente") / 50) * 0.25 : x + (n(v, "fundo") / 50) * 0.25;
        return degrau(nivel, 0.5 + (grumos[p] - 0.5) * densidade, 0.08);
      });
      return esboco(t, img.a, largura, altura, ctx);
    },
  },
  {
    id: "carimbo",
    nome: "Carimbo",
    categoria: "esboco",
    opcoes: [numero("equilibrio", "Equilíbrio claro/escuro", 0, 50, 25), numero("suavidade", "Suavidade", 1, 50, 5)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const l = borrar(luz(img), largura, altura, n(v, "suavidade") * 0.15 * ctx.escala);
      return esboco(l.map((x) => degrau(x, n(v, "equilibrio") / 50, 0.03)), img.a, largura, altura, ctx);
    },
  },
  {
    id: "bordas_rasgadas",
    nome: "Bordas rasgadas",
    categoria: "esboco",
    opcoes: [numero("equilibrio", "Equilíbrio da imagem", 0, 50, 25), numero("suavidade", "Suavidade", 1, 15, 11), numero("contraste", "Contraste", 1, 25, 17)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const l = luz(img);
      // A borda do papel rasgado: o limiar com um ruído fino que a deixa irregular
      const fiapos = porDocumento(largura, altura, ctx, (x, y) => (graoNoDocumento(x, y, 47) - 0.5) * 0.6 + (suaveNoDocumento(x, y, 3, 48, 2) - 0.5) * 0.4);
      const aspera = 1 - n(v, "suavidade") / 16;
      const t = l.map((x, p) => degrau(x + fiapos[p] * aspera * 0.4, n(v, "equilibrio") / 50, 0.5 / n(v, "contraste")));
      return esboco(t, img.a, largura, altura, ctx);
    },
  },
  {
    id: "papel_molhado",
    nome: "Papel molhado",
    categoria: "esboco",
    opcoes: [numero("comprimento", "Comprimento da fibra", 3, 50, 15), numero("brilho", "Brilho", 0, 100, 60), numero("contraste", "Contraste", 0, 100, 80)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      // A tinta corre nas fibras do papel molhado: a cor borrada ao longo de fibras sorteadas (as cores ficam)
      const comprimento = n(v, "comprimento") * 0.5 * ctx.escala;
      const fibras = porDocumento(largura, altura, ctx, (x, y) => suaveNoDocumento(x, y, 6, 49, 2));
      const a = { r: tracar(img.r, largura, altura, 30, comprimento), g: tracar(img.g, largura, altura, 30, comprimento), b: tracar(img.b, largura, altura, 30, comprimento) };
      const b = { r: tracar(img.r, largura, altura, -60, comprimento), g: tracar(img.g, largura, altura, -60, comprimento), b: tracar(img.b, largura, altura, -60, comprimento) };
      const brilho = (n(v, "brilho") - 50) / 100;
      const k = 0.5 + n(v, "contraste") / 100;
      const mistura = (x: number, y: number, w: number) => contraste(x + (y - x) * w + brilho, k);
      const saida = { r: a.r.map((x, p) => mistura(x, b.r[p], fibras[p])), g: a.g.map((x, p) => mistura(x, b.g[p], fibras[p])), b: a.b.map((x, p) => mistura(x, b.b[p], fibras[p])) };
      return deReta(saida, largura, altura, img.a);
    },
  },
  // ——— Textura ———
  {
    id: "craquelado",
    nome: "Craquelado",
    categoria: "textura",
    opcoes: [numero("espacamento", "Espaçamento das rachaduras", 2, 100, 15), numero("profundidade", "Profundidade das rachaduras", 0, 10, 6), numero("brilho", "Brilho das rachaduras", 0, 10, 9)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const { borda } = celulas(largura, altura, n(v, "espacamento") * 1.5, ctx, 51);
      // A rachadura é um vale fino na borda das células, com a beira só um pouco levantada (a tinta que estufou);
      // o relevo ilumina e o brilho clareia a pintura
      const vale = borda.map((d) => limitar(d / 0.9));
      const beira = borda.map((d) => limitar(d / 4) ** 0.5);
      const relevo = luzDoRelevo(borrar(beira, largura, altura, 0.5 * ctx.escala), largura, altura, n(v, "profundidade") / 10, "cima_esquerda");
      const brilho = 0.75 + n(v, "brilho") / 30;
      return deReta(multiplicar(img, relevo.map((r, p) => r * (0.3 + 0.7 * vale[p]) * brilho)), largura, altura, img.a);
    },
  },
  {
    id: "grao",
    nome: "Grão",
    categoria: "textura",
    opcoes: [
      numero("intensidade", "Intensidade", 0, 100, 40),
      numero("contraste", "Contraste", 0, 100, 50),
      escolha("tipo", "Tipo de grão", [["comum", "Comum"], ["suave", "Suave"], ["borrifado", "Borrifado"], ["aglomerado", "Aglomerado"], ["contrastado", "Contrastado"], ["ampliado", "Ampliado"], ["pontilhado", "Pontilhado"], ["horizontal", "Horizontal"], ["vertical", "Vertical"], ["manchas", "Manchas"]]),
    ],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const tipo = s(v, "tipo");
      const grao = porDocumento(largura, altura, ctx, (x, y) => {
        if (tipo === "suave") return suaveNoDocumento(x, y, 1.2, 52, 2);
        if (tipo === "aglomerado") return suaveNoDocumento(x, y, 2.5, 53, 3);
        if (tipo === "ampliado") return sorteio(Math.floor(x / 3), Math.floor(y / 3), 54);
        if (tipo === "horizontal") return sorteio(0, Math.floor(y), 55) * 0.7 + graoNoDocumento(x, y, 56) * 0.3;
        if (tipo === "vertical") return sorteio(Math.floor(x), 0, 57) * 0.7 + graoNoDocumento(x, y, 58) * 0.3;
        if (tipo === "manchas") return suaveNoDocumento(x, y, 8, 59, 3);
        if (tipo === "borrifado" || tipo === "pontilhado") return graoNoDocumento(x, y, 60) > (tipo === "pontilhado" ? 0.9 : 0.8) ? 1 : 0.5;
        return graoNoDocumento(x, y, 61);
      });
      const intensidade = n(v, "intensidade") / 100;
      const k = tipo === "contrastado" ? 2.5 : 0.5 + n(v, "contraste") / 100;
      const somar = (c: Float32Array) => c.map((x, p) => contraste(x + (grao[p] - 0.5) * intensidade * 0.6, k > 1.4 ? k : 1 + (k - 1) * 0.5));
      return deReta({ r: somar(img.r), g: somar(img.g), b: somar(img.b) }, largura, altura, img.a);
    },
  },
  {
    id: "ladrilhos_mosaico",
    nome: "Ladrilhos de mosaico",
    categoria: "textura",
    opcoes: [numero("tamanho", "Tamanho do ladrilho", 2, 100, 12), numero("rejunte", "Largura do rejunte", 1, 15, 3), numero("clarear", "Clarear o rejunte", 0, 10, 9)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const lado = n(v, "tamanho") * 1.5;
      const rejunte = n(v, "rejunte") * 0.6;
      // A distância à borda do ladrilho (quadrados levemente desencontrados por fileira)
      const borda = porDocumento(largura, altura, ctx, (x, y) => {
        const fileira = Math.floor(y / lado);
        const u = x + sorteio(0, fileira, 62) * lado * 0.3;
        const bx = u - Math.floor(u / lado) * lado;
        const by = y - fileira * lado;
        return Math.min(bx, lado - bx, by, lado - by);
      });
      const noRejunte = borda.map((d) => 1 - limitar((d - rejunte / 2) / 0.8));
      const relevo = luzDoRelevo(borda.map((d) => limitar(d / (rejunte + 1))), largura, altura, 0.8, "cima_esquerda");
      const claro = n(v, "clarear") / 10;
      const saida = multiplicar(img, relevo);
      for (const canal of [saida.r, saida.g, saida.b]) for (let p = 0; p < canal.length; p++) canal[p] += (0.25 + claro * 0.05 - canal[p]) * noRejunte[p] * 0.75;
      return deReta(saida, largura, altura, img.a);
    },
  },
  {
    id: "colcha",
    nome: "Colcha",
    categoria: "textura",
    opcoes: [numero("tamanho", "Tamanho do quadrado", 0, 10, 4), numero("relevo", "Relevo", 0, 25, 8)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const lado = 3 + n(v, "tamanho") * 1.4;
      // Cada quadrado com a cor do meio dele, em relevo (alguns mais altos que outros)
      const id = new Int32Array(largura * altura);
      const alturaDoQuadrado = new Float32Array(largura * altura);
      for (let y = 0, p = 0; y < altura; y++)
        for (let x = 0; x < largura; x++, p++) {
          const [dx, dy] = noDocumento(x, y, ctx);
          const i = Math.floor(dx / lado);
          const j = Math.floor(dy / lado);
          id[p] = (i & 0xffff) * 65536 + (j & 0xffff);
          const bx = dx - i * lado;
          const by = dy - j * lado;
          alturaDoQuadrado[p] = (0.5 + 0.5 * sorteio(i, j, 63)) * limitar(Math.min(bx, lado - bx, by, lado - by) / 1.2);
        }
      const cor = mediaPorCelula(img, img.a, id);
      const relevo = luzDoRelevo(alturaDoQuadrado, largura, altura, n(v, "relevo") / 8, "cima_esquerda");
      return deReta(multiplicar(cor, relevo), largura, altura, img.a);
    },
  },
  {
    id: "vitral",
    nome: "Vitral",
    categoria: "textura",
    opcoes: [numero("tamanho", "Tamanho da célula", 2, 50, 10), numero("borda", "Espessura da borda", 1, 20, 4), numero("luz", "Intensidade da luz", 0, 10, 3)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const { id, borda } = celulas(largura, altura, n(v, "tamanho") * 2.5, ctx, 64);
      const cor = mediaPorCelula(img, img.a, id);
      const espessura = n(v, "borda") * 0.5;
      // A luz que passa pelo meio do vidro: mais clara no centro do quadro
      const meio = { x: ctx.documento.largura / 2, y: ctx.documento.altura / 2 };
      const raio = Math.hypot(meio.x, meio.y);
      const luzDoMeio = porDocumento(largura, altura, ctx, (x, y) => 1 + (n(v, "luz") / 10) * 0.6 * (1 - Math.hypot(x - meio.x, y - meio.y) / raio));
      const saida = multiplicar(cor, luzDoMeio);
      for (let p = 0; p < borda.length; p++) {
        // O chumbo entre os vidros, na cor da frente
        const k = 1 - limitar((borda[p] - espessura / 2) / 0.8);
        saida.r[p] += (ctx.primeiroPlano[0] - saida.r[p]) * k;
        saida.g[p] += (ctx.primeiroPlano[1] - saida.g[p]) * k;
        saida.b[p] += (ctx.primeiroPlano[2] - saida.b[p]) * k;
      }
      return deReta(saida, largura, altura, img.a);
    },
  },
  {
    id: "texturizador",
    nome: "Texturizador",
    categoria: "textura",
    opcoes: [TEXTURA, numero("escala", "Escala", 50, 200, 100, "%"), numero("relevo", "Relevo", 0, 50, 4), LUZ, marcar("inverter", "Inverter")],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      let plano = planoDaTextura(s(v, "textura"), n(v, "escala"), largura, altura, ctx);
      if (v.inverter) plano = plano.map((x) => 1 - x);
      return deReta(multiplicar(img, luzDoRelevo(plano, largura, altura, n(v, "relevo") / 10, s(v, "luz"))), largura, altura, img.a);
    },
  },
];
