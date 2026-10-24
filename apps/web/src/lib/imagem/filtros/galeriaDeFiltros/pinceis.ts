// Galeria de filtros › Traçados de pincel (bordas acentuadas, traços angulares, hachura, traços escuros, contornos
// de tinta, salpicos, traços borrifados, sumi-e), Distorção (brilho difuso, vidro, ondulação oceânica) e Estilização
// (bordas brilhantes) (ADR 0003, onda 13.11).
import { type ImagemDoFiltro, limitar } from "../comum.ts";
import { remapear } from "../distorcao.ts";
import { borrar, borrarCor, contraste, copiaDaCor, deReta, gradiente, graoNoDocumento, luz, porDocumento, reta, suaveNoDocumento, textura, tracar } from "./base.ts";
import { escolha, type EfeitoDaGaleria, marcar, n, numero, s } from "./tipos.ts";

type Cor = { r: Float32Array; g: Float32Array; b: Float32Array };
const tracarCor = (c: Cor, largura: number, altura: number, angulo: number, comprimento: number): Cor => ({
  r: tracar(c.r, largura, altura, angulo, comprimento),
  g: tracar(c.g, largura, altura, angulo, comprimento),
  b: tracar(c.b, largura, altura, angulo, comprimento),
});
/** A máscara de nitidez simples na cor (k vezes a diferença para a cópia borrada). */
function afiar(c: Cor, largura: number, altura: number, k: number, sigma: number): Cor {
  if (k <= 0) return c;
  const borrada = borrarCor(c, largura, altura, sigma);
  return { r: c.r.map((x, p) => x + (x - borrada.r[p]) * k), g: c.g.map((x, p) => x + (x - borrada.g[p]) * k), b: c.b.map((x, p) => x + (x - borrada.b[p]) * k) };
}
/** Cada pixel lê o ponto deslocado por (dx, dy) pixels da imagem (o alfa vai junto). */
const deslocarPor = (imagem: ImagemDoFiltro, dx: Float32Array, dy: Float32Array) =>
  remapear(imagem, (x, y) => {
    const p = Math.floor(y) * imagem.largura + Math.floor(x);
    return [x + dx[p], y + dy[p]];
  }, "repetir");

export const PINCEIS: EfeitoDaGaleria[] = [
  {
    id: "bordas_acentuadas",
    nome: "Bordas acentuadas",
    categoria: "pinceis",
    opcoes: [numero("largura", "Largura da borda", 1, 14, 2), numero("brilho", "Brilho da borda", 0, 50, 38), numero("suavidade", "Suavidade", 1, 15, 5)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const { m } = gradiente(borrar(luz(img), largura, altura, n(v, "suavidade") * 0.2 * ctx.escala), largura, altura);
      const borda = borrar(m.map((x) => limitar(x * 8)), largura, altura, n(v, "largura") * 0.3 * ctx.escala);
      // Acima de 25, a borda clareia (como giz); abaixo, escurece (como tinta)
      const brilho = n(v, "brilho");
      const alvo = brilho >= 25 ? 1 : 0;
      const forca = Math.abs(brilho - 25) / 25 + 0.2;
      const saida = copiaDaCor(img);
      for (let p = 0; p < m.length; p++) {
        const k = limitar(borda[p] * 0.8 * forca);
        saida.r[p] += (alvo - saida.r[p]) * k;
        saida.g[p] += (alvo - saida.g[p]) * k;
        saida.b[p] += (alvo - saida.b[p]) * k;
      }
      return deReta(saida, largura, altura, img.a);
    },
  },
  {
    id: "tracos_angulares",
    nome: "Traços angulares",
    categoria: "pinceis",
    opcoes: [numero("equilibrio", "Equilíbrio da direção", 0, 100, 50), numero("comprimento", "Comprimento do traço", 3, 50, 15), numero("nitidez", "Nitidez", 0, 10, 3)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const comprimento = n(v, "comprimento") * ctx.escala;
      const subindo = tracarCor(img, largura, altura, 45, comprimento);
      const descendo = tracarCor(img, largura, altura, -45, comprimento);
      const l = luz(img);
      const limite = n(v, "equilibrio") / 100;
      const saida = copiaDaCor(img);
      // O claro vai num sentido e o escuro no outro; o equilíbrio muda onde troca
      for (let p = 0; p < l.length; p++) {
        const w = limitar((l[p] - (1 - limite)) * 6 + 0.5);
        saida.r[p] = descendo.r[p] + (subindo.r[p] - descendo.r[p]) * w;
        saida.g[p] = descendo.g[p] + (subindo.g[p] - descendo.g[p]) * w;
        saida.b[p] = descendo.b[p] + (subindo.b[p] - descendo.b[p]) * w;
      }
      return deReta(afiar(saida, largura, altura, n(v, "nitidez") / 4, ctx.escala), largura, altura, img.a);
    },
  },
  {
    id: "hachura",
    nome: "Hachura",
    categoria: "pinceis",
    opcoes: [numero("comprimento", "Comprimento do traço", 3, 50, 9), numero("nitidez", "Nitidez", 0, 20, 6), numero("forca", "Força", 1, 3, 1)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const comprimento = n(v, "comprimento") * ctx.escala;
      const grao = porDocumento(largura, altura, ctx, (x, y) => graoNoDocumento(x, y, 8));
      const riscos = tracar(grao, largura, altura, 45, comprimento);
      const cruzados = tracar(grao, largura, altura, -45, comprimento);
      const forca = n(v, "forca") * 0.35;
      const fator = riscos.map((x, p) => 1 + ((x + cruzados[p]) / 2 - 0.5) * forca * 2);
      const saida = afiar(img, largura, altura, n(v, "nitidez") / 8, ctx.escala);
      return deReta({ r: saida.r.map((x, p) => x * fator[p]), g: saida.g.map((x, p) => x * fator[p]), b: saida.b.map((x, p) => x * fator[p]) }, largura, altura, img.a);
    },
  },
  {
    id: "tracos_escuros",
    nome: "Traços escuros",
    categoria: "pinceis",
    opcoes: [numero("equilibrio", "Equilíbrio", 0, 10, 5), numero("preto", "Intensidade do preto", 0, 10, 6), numero("branco", "Intensidade do branco", 0, 10, 2)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const curtos = tracarCor(img, largura, altura, -45, 6 * ctx.escala);
      const longos = tracarCor(img, largura, altura, 45, 14 * ctx.escala);
      const l = luz(img);
      const limite = n(v, "equilibrio") / 10;
      const preto = n(v, "preto") / 10;
      const branco = n(v, "branco") / 10;
      const saida = copiaDaCor(img);
      for (let p = 0; p < l.length; p++) {
        const claro = l[p] > limite * 0.6 + 0.2;
        const fonte = claro ? longos : curtos;
        // O escuro fica mais preto em traços curtos; o claro, mais branco em traços longos
        const k = claro ? 1 + branco * 0.4 : 1 - preto * 0.7;
        saida.r[p] = fonte.r[p] * k;
        saida.g[p] = fonte.g[p] * k;
        saida.b[p] = fonte.b[p] * k;
      }
      return deReta(saida, largura, altura, img.a);
    },
  },
  {
    id: "contornos_de_tinta",
    nome: "Contornos de tinta",
    categoria: "pinceis",
    opcoes: [numero("comprimento", "Comprimento do traço", 1, 50, 4), numero("preto", "Intensidade do preto", 0, 50, 20), numero("brilho", "Intensidade do brilho", 0, 50, 10)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const tracos = tracarCor(img, largura, altura, 45, n(v, "comprimento") * 2 * ctx.escala);
      const { m } = gradiente(luz(img), largura, altura);
      const preto = n(v, "preto") / 50;
      const brilho = n(v, "brilho") / 50;
      const saida = copiaDaCor(tracos);
      for (let p = 0; p < m.length; p++) {
        // A tinta preta nas bordas; o resto clareia um pouco
        const tinta = limitar(m[p] * 6) * (0.4 + preto);
        for (const canal of [saida.r, saida.g, saida.b]) canal[p] = (canal[p] + (1 - canal[p]) * brilho * 0.4) * (1 - tinta);
      }
      return deReta(saida, largura, altura, img.a);
    },
  },
  {
    id: "salpicos",
    nome: "Salpicos",
    categoria: "pinceis",
    opcoes: [numero("raio", "Raio do borrifo", 0, 25, 10), numero("suavidade", "Suavidade", 1, 15, 5)],
    aplicar: (imagem, v, ctx) => {
      const { largura, altura } = imagem;
      const raio = n(v, "raio") * ctx.escala;
      const tamanho = n(v, "suavidade") * 0.4;
      const dx = porDocumento(largura, altura, ctx, (x, y) => (suaveNoDocumento(x, y, tamanho, 21, 2) - 0.5) * 2 * raio);
      const dy = porDocumento(largura, altura, ctx, (x, y) => (suaveNoDocumento(x, y, tamanho, 22, 2) - 0.5) * 2 * raio);
      return deslocarPor(imagem, dx, dy);
    },
  },
  {
    id: "tracos_borrifados",
    nome: "Traços borrifados",
    categoria: "pinceis",
    opcoes: [
      numero("comprimento", "Comprimento do traço", 0, 20, 12),
      numero("raio", "Raio do borrifo", 0, 25, 7),
      escolha("direcao", "Direção do traço", [["diagonal_direita", "Diagonal para a direita"], ["horizontal", "Horizontal"], ["diagonal_esquerda", "Diagonal para a esquerda"], ["vertical", "Vertical"]]),
    ],
    aplicar: (imagem, v, ctx) => {
      const { largura, altura } = imagem;
      const raio = n(v, "raio") * ctx.escala;
      const dx = porDocumento(largura, altura, ctx, (x, y) => (graoNoDocumento(x, y, 23) - 0.5) * 2 * raio);
      const dy = porDocumento(largura, altura, ctx, (x, y) => (graoNoDocumento(x, y, 24) - 0.5) * 2 * raio);
      const borrifada = reta(deslocarPor(imagem, dx, dy));
      const angulo = { diagonal_direita: 45, horizontal: 0, diagonal_esquerda: -45, vertical: 90 }[s(v, "direcao")] ?? 45;
      return deReta(tracarCor(borrifada, largura, altura, angulo, n(v, "comprimento") * 1.5 * ctx.escala), largura, altura, borrifada.a);
    },
  },
  {
    id: "sumie",
    nome: "Sumi-e",
    categoria: "pinceis",
    opcoes: [numero("largura", "Largura do traço", 3, 15, 10), numero("pressao", "Pressão do traço", 0, 15, 2), numero("contraste", "Contraste", 0, 40, 16)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const tracos = tracarCor(borrarCor(img, largura, altura, n(v, "largura") * 0.15 * ctx.escala), largura, altura, 45, n(v, "largura") * ctx.escala);
      const pressao = 1 + n(v, "pressao") / 6;
      const k = 1 + n(v, "contraste") / 40;
      // A tinta preta encharcada: a cor escurece pela pressão e o contraste separa
      const saida = { r: tracos.r.map((x) => contraste(x ** pressao, k)), g: tracos.g.map((x) => contraste(x ** pressao, k)), b: tracos.b.map((x) => contraste(x ** pressao, k)) };
      return deReta(saida, largura, altura, img.a);
    },
  },
  // ——— Distorção ———
  {
    id: "brilho_difuso",
    nome: "Brilho difuso",
    categoria: "distorcao",
    opcoes: [numero("granulado", "Granulado", 0, 10, 6), numero("brilho", "Quantidade de brilho", 0, 20, 10), numero("clareza", "Clareza", 0, 20, 15)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const l = luz(img);
      // O brilho na cor do fundo, nascendo no claro; a clareza encolhe a área dele
      const limite = 1 - n(v, "brilho") / 14;
      const brilho = borrar(l.map((x) => limitar((x - limite) * 3)), largura, altura, (0.5 + (20 - n(v, "clareza")) * 0.3) * ctx.escala);
      const grao = porDocumento(largura, altura, ctx, (x, y) => graoNoDocumento(x, y, 25));
      const granulado = n(v, "granulado") / 10;
      const saida = copiaDaCor(img);
      for (let p = 0; p < l.length; p++) {
        // O grão aparece como pontinhos da cor do fundo dentro do brilho
        const g = limitar(brilho[p] * (1 + (grao[p] - 0.5) * granulado * 1.6));
        saida.r[p] += (ctx.fundo[0] - saida.r[p]) * g;
        saida.g[p] += (ctx.fundo[1] - saida.g[p]) * g;
        saida.b[p] += (ctx.fundo[2] - saida.b[p]) * g;
      }
      return deReta(saida, largura, altura, img.a);
    },
  },
  {
    id: "vidro",
    nome: "Vidro",
    categoria: "distorcao",
    opcoes: [
      numero("distorcao", "Distorção", 0, 20, 5),
      numero("suavidade", "Suavidade", 1, 15, 3),
      escolha("textura", "Textura", [["blocos", "Blocos"], ["tela", "Tela"], ["fosco", "Fosco"], ["lentes", "Lentes pequenas"]], "fosco"),
      numero("escala", "Escala", 50, 200, 100, "%"),
      marcar("inverter", "Inverter"),
    ],
    aplicar: (imagem, v, ctx) => {
      const { largura, altura } = imagem;
      let altura_ = porDocumento(largura, altura, ctx, (x, y) => textura(s(v, "textura"), x, y, n(v, "escala")));
      if (v.inverter) altura_ = altura_.map((x) => 1 - x);
      altura_ = borrar(altura_, largura, altura, n(v, "suavidade") * 0.25 * ctx.escala);
      // O vidro desvia cada pixel pela inclinação da textura
      const { gx, gy } = gradiente(altura_, largura, altura);
      const forca = n(v, "distorcao") * 2 * ctx.escala;
      return deslocarPor(imagem, gx.map((x) => x * forca), gy.map((y) => y * forca));
    },
  },
  {
    id: "ondulacao_oceanica",
    nome: "Ondulação oceânica",
    categoria: "distorcao",
    opcoes: [numero("tamanho", "Tamanho da ondulação", 1, 15, 9), numero("magnitude", "Magnitude da ondulação", 0, 20, 9)],
    aplicar: (imagem, v, ctx) => {
      const { largura, altura } = imagem;
      const tamanho = 1 + n(v, "tamanho") * 0.8;
      const magnitude = n(v, "magnitude") * ctx.escala;
      const dx = porDocumento(largura, altura, ctx, (x, y) => (suaveNoDocumento(x, y, tamanho, 31, 3) - 0.5) * 2 * magnitude);
      const dy = porDocumento(largura, altura, ctx, (x, y) => (suaveNoDocumento(x, y, tamanho, 32, 3) - 0.5) * 2 * magnitude);
      return deslocarPor(imagem, dx, dy);
    },
  },
  // ——— Estilização ———
  {
    id: "bordas_brilhantes",
    nome: "Bordas brilhantes",
    categoria: "estilizacao",
    opcoes: [numero("largura", "Largura da borda", 1, 14, 2), numero("brilho", "Brilho da borda", 0, 20, 6), numero("suavidade", "Suavidade", 1, 15, 5)],
    aplicar: (imagem, v, ctx) => {
      const img = reta(imagem);
      const { largura, altura } = img;
      const sigma = n(v, "suavidade") * 0.15 * ctx.escala;
      const brilho = 2 + n(v, "brilho") * 0.8;
      const espessura = n(v, "largura") * 0.35 * ctx.escala;
      // A borda de cada canal, acesa sobre o preto
      const canal = (c: Float32Array) => borrar(gradiente(borrar(c, largura, altura, sigma), largura, altura).m.map((x) => limitar(x * brilho)), largura, altura, espessura).map((x) => limitar(x * (1 + espessura * 0.5)));
      return deReta({ r: canal(img.r), g: canal(img.g), b: canal(img.b) }, largura, altura, img.a);
    },
  },
];
