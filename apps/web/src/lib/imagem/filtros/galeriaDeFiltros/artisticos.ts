// Galeria de filtros › Artísticos (ADR 0003, onda 13.11): lápis de cor, recorte, pincel seco, filme granulado,
// afresco, brilho neon, pinceladas, espátula, plástico, bordas posterizadas, pastel, borrão, esponja, base e aquarela.
// As medidas das opções são de lá (em pixels do documento, multiplicadas pela escala); as contas são nossas.
import { type ContextoDoFiltro, hexParaRgb, type ImagemDoFiltro, limitar } from "../comum.ts";
import { kuwahara } from "../pixelizacao.ts";
import {
  borrar,
  borrarCor,
  contraste,
  copiaDaCor,
  deReta,
  graoNoDocumento,
  gradiente,
  luz,
  luzDoRelevo,
  multiplicar,
  planoDaTextura,
  porDocumento,
  reta,
  suaveNoDocumento,
  tracar,
} from "./base.ts";
import type { EfeitoDaGaleria } from "./tipos.ts";
import { escolha, n, numero, s, LUZ, TEXTURA } from "./tipos.ts";

/** O Kuwahara num raio em pixels da imagem (de 1 a 8, o custo cresce com o quadrado). */
const facetas = (imagem: ImagemDoFiltro, raio: number) => reta(kuwahara(imagem, Math.max(1, Math.min(8, Math.round(raio)))));

/** Cada canal em `niveis` degraus. */
function posterizar(c: { r: Float32Array; g: Float32Array; b: Float32Array }, niveis: number) {
  const k = Math.max(1, niveis - 1);
  const passo = (v: number) => Math.round(limitar(v) * k) / k;
  return { r: c.r.map(passo), g: c.g.map(passo), b: c.b.map(passo) };
}

/** A textura em relevo sobre a cor. */
function comTextura(c: { r: Float32Array; g: Float32Array; b: Float32Array }, largura: number, altura: number, v: Record<string, unknown>, ctx: ContextoDoFiltro) {
  const relevo = Number(v.relevo ?? 0) / 50;
  if (relevo <= 0) return c;
  const plano = planoDaTextura(String(v.textura ?? "tela"), Number(v.escala ?? 100), largura, altura, ctx);
  return multiplicar(c, luzDoRelevo(plano, largura, altura, relevo, String(v.luz ?? "cima_esquerda")));
}

export const ARTISTICOS: EfeitoDaGaleria[] = [
  {
    id: "lapis_de_cor",
    nome: "Lápis de cor",
    categoria: "artisticos",
    opcoes: [numero("espessura", "Espessura do lápis", 1, 24, 4), numero("pressao", "Pressão do traço", 0, 15, 8), numero("papel", "Brilho do papel", 0, 50, 25)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const l = luz(img);
      // Os riscos a 45°: um ruído fino puxado na diagonal, do comprimento da espessura
      const riscos = tracar(porDocumento(largura, altura, ctx, (x, y) => graoNoDocumento(x, y)), largura, altura, 45, n(v, "espessura") * 3 * ctx.escala);
      const { m } = gradiente(borrar(l, largura, altura, 0.8 * ctx.escala), largura, altura);
      const papel = ctx.fundo.map((c) => c * (n(v, "papel") / 50)) as [number, number, number];
      const pressao = n(v, "pressao") / 15;
      const saida = copiaDaCor(img);
      for (let p = 0; p < l.length; p++) {
        // O pigmento: mais no escuro e nas bordas, e só onde o risco passa
        const cobertura = limitar(((1 - l[p]) * 1.3 * pressao + m[p] * 3) * (0.35 + riscos[p] * 1.3));
        saida.r[p] = papel[0] + (img.r[p] * 0.95 - papel[0]) * cobertura;
        saida.g[p] = papel[1] + (img.g[p] * 0.95 - papel[1]) * cobertura;
        saida.b[p] = papel[2] + (img.b[p] * 0.95 - papel[2]) * cobertura;
      }
      return deReta(saida, largura, altura, img.a);
    },
  },
  {
    id: "recorte",
    nome: "Recorte",
    categoria: "artisticos",
    opcoes: [numero("niveis", "Número de níveis", 2, 8, 4), numero("simplicidade", "Simplicidade da borda", 0, 10, 4), numero("fidelidade", "Fidelidade da borda", 1, 3, 2)],
    aplicar: (imagem, v, ctx) => {
      const base = reta(imagem);
      const { largura, altura } = base;
      const lisa = borrarCor(base, largura, altura, (0.4 + n(v, "simplicidade") * 0.6) * ctx.escala);
      const l = luz(lisa);
      // Cada pixel vai ao nível da luz dele, pintado com a cor média do nível (papel recortado)
      const niveis = Math.round(n(v, "niveis"));
      const nivel = new Uint8Array(l.length);
      const somas = Array.from({ length: niveis }, () => [0, 0, 0, 0]);
      for (let p = 0; p < l.length; p++) {
        nivel[p] = Math.min(niveis - 1, Math.floor(l[p] * niveis));
        const s4 = somas[nivel[p]];
        const w = base.a[p];
        s4[0] += lisa.r[p] * w;
        s4[1] += lisa.g[p] * w;
        s4[2] += lisa.b[p] * w;
        s4[3] += w;
      }
      const fiel = (n(v, "fidelidade") - 1) / 2;
      const saida = copiaDaCor(lisa);
      for (let p = 0; p < l.length; p++) {
        const s4 = somas[nivel[p]];
        const media = s4[3] > 0 ? [s4[0] / s4[3], s4[1] / s4[3], s4[2] / s4[3]] : [lisa.r[p], lisa.g[p], lisa.b[p]];
        // A fidelidade puxa a cor de volta para a do lugar, mas o degrau da luz fica
        saida.r[p] = media[0] + (lisa.r[p] - media[0]) * fiel * 0.5;
        saida.g[p] = media[1] + (lisa.g[p] - media[1]) * fiel * 0.5;
        saida.b[p] = media[2] + (lisa.b[p] - media[2]) * fiel * 0.5;
      }
      return deReta(saida, largura, altura, base.a);
    },
  },
  {
    id: "pincel_seco",
    nome: "Pincel seco",
    categoria: "artisticos",
    opcoes: [numero("tamanho", "Tamanho do pincel", 0, 10, 2), numero("detalhe", "Detalhe do pincel", 0, 10, 8), numero("textura_n", "Textura", 1, 3, 1)],
    aplicar: (imagem, v, ctx) => {
      const img = facetas(imagem, (1 + n(v, "tamanho") * 0.6) * ctx.escala);
      const saida = posterizar(img, 3 + Math.round(n(v, "detalhe")));
      const forca = (n(v, "textura_n") - 1) * 0.07;
      const grao = porDocumento(img.largura, img.altura, ctx, (x, y) => graoNoDocumento(x, y, 2) - 0.5);
      return deReta(multiplicar(saida, grao.map((g) => 1 + g * forca * 2)), img.largura, img.altura, img.a);
    },
  },
  {
    id: "filme_granulado",
    nome: "Filme granulado",
    categoria: "artisticos",
    opcoes: [numero("grao", "Grão", 0, 20, 4), numero("realce", "Área de realce", 0, 20, 0), numero("intensidade", "Intensidade", 0, 10, 10)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const l = luz(img);
      const grao = porDocumento(img.largura, img.altura, ctx, (x, y) => graoNoDocumento(x, y, 3) - 0.5);
      const forca = (n(v, "grao") / 20) * 0.45;
      const limite = 1 - n(v, "realce") / 25;
      const brilho = n(v, "intensidade") / 10;
      const saida = copiaDaCor(img);
      for (let p = 0; p < l.length; p++) {
        // O grão aparece mais nos meios-tons; a área de realce clareia o que passa do limite
        const g = grao[p] * forca * (0.3 + 2.8 * l[p] * (1 - l[p]));
        const realce = n(v, "realce") > 0 ? limitar((l[p] - limite) * 4) * brilho * 0.5 : 0;
        saida.r[p] = img.r[p] + g + (1 - img.r[p]) * realce;
        saida.g[p] = img.g[p] + g + (1 - img.g[p]) * realce;
        saida.b[p] = img.b[p] + g + (1 - img.b[p]) * realce;
      }
      return deReta(saida, img.largura, img.altura, img.a);
    },
  },
  {
    id: "afresco",
    nome: "Afresco",
    categoria: "artisticos",
    opcoes: [numero("tamanho", "Tamanho do pincel", 0, 10, 2), numero("detalhe", "Detalhe do pincel", 0, 10, 8), numero("textura_n", "Textura", 1, 3, 1)],
    aplicar: (imagem, v, ctx) => {
      const img = facetas(imagem, (1 + n(v, "tamanho") * 0.5) * ctx.escala);
      const { largura, altura } = img;
      const l = luz(img);
      const { m } = gradiente(l, largura, altura);
      const escurecer = (10 - n(v, "detalhe")) / 10 + 0.3;
      const grao = porDocumento(largura, altura, ctx, (x, y) => suaveNoDocumento(x, y, 3, 4, 2) - 0.5);
      const forca = n(v, "textura_n") * 0.08;
      const fator = new Float32Array(l.length);
      // O afresco é escuro e contrastado: as bordas pretas e a cor mais densa
      for (let p = 0; p < l.length; p++) fator[p] = (1 - limitar(m[p] * 5) * escurecer * 0.8) * (0.85 + grao[p] * forca * 2);
      const saida = multiplicar(img, fator);
      for (const canal of [saida.r, saida.g, saida.b]) for (let p = 0; p < canal.length; p++) canal[p] = contraste(canal[p], 1.35);
      return deReta(saida, largura, altura, img.a);
    },
  },
  {
    id: "brilho_neon",
    nome: "Brilho neon",
    categoria: "artisticos",
    opcoes: [numero("tamanho", "Tamanho do brilho", -24, 24, 5), numero("brilho", "Brilho", 0, 50, 15), { id: "cor", nome: "Cor do brilho", tipo: "cor", padrao: "#2f6bff" }],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const l = luz(img);
      const t = n(v, "tamanho");
      // O brilho nasce no claro (tamanho positivo) ou no escuro (negativo) e espalha pelo tamanho
      const fonte = t >= 0 ? l : l.map((x) => 1 - x);
      const brilho = borrar(fonte, largura, altura, Math.max(0.5, Math.abs(t)) * 0.8 * ctx.escala);
      const cor = hexParaRgb(s(v, "cor"));
      const forca = n(v, "brilho") / 25;
      const saida = copiaDaCor(img);
      for (let p = 0; p < l.length; p++) {
        const g = limitar(brilho[p] * forca);
        const base = l[p] * 0.75;
        saida.r[p] = base * (1 - g) + cor[0] * g + base * g * 0.35;
        saida.g[p] = base * (1 - g) + cor[1] * g + base * g * 0.35;
        saida.b[p] = base * (1 - g) + cor[2] * g + base * g * 0.35;
      }
      return deReta(saida, largura, altura, img.a);
    },
  },
  {
    id: "pinceladas",
    nome: "Pinceladas",
    categoria: "artisticos",
    opcoes: [
      numero("tamanho", "Tamanho do pincel", 1, 50, 8),
      numero("nitidez", "Nitidez", 0, 40, 7),
      escolha("tipo", "Tipo de pincel", [["simples", "Simples"], ["claro", "Claro áspero"], ["escuro", "Escuro áspero"], ["amplo", "Amplo e nítido"], ["desfocado", "Desfocado"], ["centelha", "Centelha"]]),
    ],
    aplicar: (imagem, v, ctx) => {
      const tipo = s(v, "tipo");
      const raio = (1 + n(v, "tamanho") * (tipo === "amplo" ? 0.3 : 0.18)) * ctx.escala;
      const img = facetas(imagem, raio);
      const { largura, altura } = img;
      let saida = tipo === "desfocado" ? borrarCor(img, largura, altura, raio * 0.6) : copiaDaCor(img);
      // A nitidez puxa a borda das facetas
      const k = n(v, "nitidez") / 20;
      if (k > 0) {
        const borrada = borrarCor(saida, largura, altura, 1.2 * ctx.escala);
        saida = { r: saida.r.map((x, p) => x + (x - borrada.r[p]) * k), g: saida.g.map((x, p) => x + (x - borrada.g[p]) * k), b: saida.b.map((x, p) => x + (x - borrada.b[p]) * k) };
      }
      if (tipo === "claro" || tipo === "escuro" || tipo === "centelha") {
        const grao = porDocumento(largura, altura, ctx, (x, y) => graoNoDocumento(x, y, 5));
        for (let p = 0; p < grao.length; p++) {
          const d = tipo === "claro" ? (grao[p] - 0.3) * 0.25 : tipo === "escuro" ? -(grao[p] - 0.3) * 0.25 : grao[p] > 0.97 ? 0.6 : 0;
          saida.r[p] += d;
          saida.g[p] += d;
          saida.b[p] += d;
        }
      }
      return deReta(saida, largura, altura, img.a);
    },
  },
  {
    id: "espatula",
    nome: "Espátula",
    categoria: "artisticos",
    opcoes: [numero("tamanho", "Tamanho do traço", 1, 50, 25), numero("detalhe", "Detalhe do traço", 1, 3, 3), numero("suavidade", "Suavidade", 0, 10, 0)],
    aplicar: (imagem, v, ctx) => {
      const img = facetas(imagem, (1 + n(v, "tamanho") * 0.16) * ctx.escala);
      const { largura, altura } = img;
      let saida: { r: Float32Array; g: Float32Array; b: Float32Array } = posterizar(img, 4 + Math.round(n(v, "detalhe")) * 3);
      const suave = n(v, "suavidade");
      if (suave > 0) saida = borrarCor(saida, largura, altura, suave * 0.25 * ctx.escala);
      return deReta(saida, largura, altura, img.a);
    },
  },
  {
    id: "plastico",
    nome: "Plástico",
    categoria: "artisticos",
    opcoes: [numero("realce", "Força do realce", 0, 20, 15), numero("detalhe", "Detalhe", 1, 15, 9), numero("suavidade", "Suavidade", 1, 15, 7)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      // O filme plástico esticado sobre o relevo da imagem: o brilho especular nas encostas viradas para a luz (o
      // plano não brilha), mais fino com mais detalhe
      const relevo = borrar(luz(img), largura, altura, (0.5 + n(v, "suavidade") * 0.35) * ctx.escala);
      const luzDoFilme = luzDoRelevo(relevo, largura, altura, 1 + n(v, "detalhe") / 3, "cima_esquerda");
      const forca = n(v, "realce") / 20;
      const expoente = 1 + n(v, "detalhe") / 5;
      const saida = copiaDaCor(img);
      for (let p = 0; p < relevo.length; p++) {
        const brilho = limitar(luzDoFilme[p] - 1) ** (1 / expoente) * forca;
        saida.r[p] = img.r[p] * (1 - 0.15 * forca) + brilho;
        saida.g[p] = img.g[p] * (1 - 0.15 * forca) + brilho;
        saida.b[p] = img.b[p] * (1 - 0.15 * forca) + brilho;
      }
      return deReta(saida, largura, altura, img.a);
    },
  },
  {
    id: "bordas_posterizadas",
    nome: "Bordas posterizadas",
    categoria: "artisticos",
    opcoes: [numero("espessura", "Espessura da borda", 0, 10, 2), numero("intensidade", "Intensidade da borda", 0, 10, 1), numero("posterizacao", "Posterização", 0, 6, 2)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const cor = posterizar(img, 2 + Math.round(n(v, "posterizacao")) * 2);
      const { m } = gradiente(borrar(luz(img), largura, altura, 0.7 * ctx.escala), largura, altura);
      // A borda preta, engrossada pela espessura
      const linha = borrar(m.map((x) => limitar(x * (2 + n(v, "intensidade")) * 4 - 0.15)), largura, altura, n(v, "espessura") * 0.35 * ctx.escala);
      return deReta(multiplicar(cor, linha.map((x) => 1 - limitar(x * 1.6))), largura, altura, img.a);
    },
  },
  {
    id: "pastel",
    nome: "Pastel",
    categoria: "artisticos",
    opcoes: [numero("comprimento", "Comprimento do traço", 0, 40, 6), numero("detalhe", "Detalhe do traço", 1, 20, 4), TEXTURA, numero("escala", "Escala", 50, 200, 100, "%"), numero("relevo", "Relevo", 0, 50, 20), LUZ],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const comprimento = n(v, "comprimento") * 1.5 * ctx.escala;
      const tracos = { r: tracar(img.r, largura, altura, 45, comprimento), g: tracar(img.g, largura, altura, 45, comprimento), b: tracar(img.b, largura, altura, 45, comprimento) };
      const detalhe = n(v, "detalhe") / 20;
      const mistura = { r: tracos.r.map((x, p) => x + (img.r[p] - x) * detalhe), g: tracos.g.map((x, p) => x + (img.g[p] - x) * detalhe), b: tracos.b.map((x, p) => x + (img.b[p] - x) * detalhe) };
      return deReta(comTextura(mistura, largura, altura, v, ctx), largura, altura, img.a);
    },
  },
  {
    id: "borrao",
    nome: "Borrão",
    categoria: "artisticos",
    opcoes: [numero("comprimento", "Comprimento do traço", 0, 10, 2), numero("realce", "Área de realce", 0, 20, 0), numero("intensidade", "Intensidade", 0, 10, 10)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const comprimento = n(v, "comprimento") * 4 * ctx.escala;
      const c = { r: tracar(img.r, largura, altura, 45, comprimento), g: tracar(img.g, largura, altura, 45, comprimento), b: tracar(img.b, largura, altura, 45, comprimento) };
      const l = luz(c);
      const limite = 1 - n(v, "realce") / 25;
      const brilho = n(v, "intensidade") / 10;
      const saida = copiaDaCor(c);
      for (let p = 0; p < l.length; p++) {
        // O escuro fica mais escuro (o carvão espalhado) e a área de realce clareia
        const escuro = 0.65 + 0.35 * l[p];
        const realce = n(v, "realce") > 0 ? limitar((l[p] - limite) * 4) * brilho * 0.6 : 0;
        saida.r[p] = c.r[p] * escuro + (1 - c.r[p]) * realce;
        saida.g[p] = c.g[p] * escuro + (1 - c.g[p]) * realce;
        saida.b[p] = c.b[p] * escuro + (1 - c.b[p]) * realce;
      }
      return deReta(saida, largura, altura, img.a);
    },
  },
  {
    id: "esponja",
    nome: "Esponja",
    categoria: "artisticos",
    opcoes: [numero("tamanho", "Tamanho do pincel", 0, 10, 2), numero("definicao", "Definição", 0, 25, 12), numero("suavidade", "Suavidade", 1, 15, 5)],
    aplicar: (imagem, v, ctx) => {
      const img = facetas(imagem, (1 + n(v, "tamanho") * 0.4) * ctx.escala);
      const { largura, altura } = img;
      // As manchas da esponja: um ruído suave do tamanho do pincel, com o contraste da definição
      const tamanho = 2 + n(v, "tamanho") * 1.2;
      const manchas = porDocumento(largura, altura, ctx, (x, y) => suaveNoDocumento(x, y, tamanho, 6, 3));
      const definicao = n(v, "definicao") / 10;
      let saida: { r: Float32Array; g: Float32Array; b: Float32Array } = multiplicar(img, manchas.map((m) => 1 + (m - 0.5) * definicao));
      saida = borrarCor(saida, largura, altura, n(v, "suavidade") * 0.12 * ctx.escala);
      return deReta(saida, largura, altura, img.a);
    },
  },
  {
    id: "base",
    nome: "Base",
    categoria: "artisticos",
    opcoes: [numero("tamanho", "Tamanho do pincel", 0, 40, 6), numero("cobertura", "Cobertura da textura", 0, 40, 16), TEXTURA, numero("escala", "Escala", 50, 200, 100, "%"), numero("relevo", "Relevo", 0, 50, 4), LUZ],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      // A pintura de baixo: a imagem borrada, com um pouco do detalhe de volta onde a cobertura deixa
      const borrada = borrarCor(img, largura, altura, (0.5 + n(v, "tamanho") * 0.5) * ctx.escala);
      const k = 1 - n(v, "cobertura") / 40;
      const mistura = { r: borrada.r.map((x, p) => x + (img.r[p] - x) * k * 0.5), g: borrada.g.map((x, p) => x + (img.g[p] - x) * k * 0.5), b: borrada.b.map((x, p) => x + (img.b[p] - x) * k * 0.5) };
      return deReta(comTextura(mistura, largura, altura, v, ctx), largura, altura, img.a);
    },
  },
  {
    id: "aquarela",
    nome: "Aquarela",
    categoria: "artisticos",
    opcoes: [numero("detalhe", "Detalhe do pincel", 1, 14, 9), numero("sombra", "Intensidade da sombra", 0, 10, 1), numero("textura_n", "Textura", 1, 3, 1)],
    aplicar: (imagem, v, ctx) => {
      const img = facetas(imagem, (1 + (15 - n(v, "detalhe")) * 0.3) * ctx.escala);
      const { largura, altura } = img;
      const l = luz(img);
      const { m } = gradiente(l, largura, altura);
      const sombra = n(v, "sombra") / 10;
      const papel = porDocumento(largura, altura, ctx, (x, y) => suaveNoDocumento(x, y, 2, 8, 2) - 0.5);
      const forcaDoPapel = n(v, "textura_n") * 0.06;
      const saida = copiaDaCor(img);
      for (let p = 0; p < l.length; p++) {
        // A tinta junta na borda das manchas (mais escuro), a cor fica mais viva e o papel aparece
        const borda = 1 - limitar(m[p] * 6) * (0.25 + sombra * 0.5);
        const f = borda * (1 + papel[p] * forcaDoPapel * 2);
        for (const [canal, origem] of [[saida.r, img.r], [saida.g, img.g], [saida.b, img.b]] as const) canal[p] = (l[p] + (origem[p] - l[p]) * 1.3) * f;
      }
      return deReta(saida, largura, altura, img.a);
    },
  },
];
