// Os gráficos do editor de imagem (ADR 0003, onda 13.16): colunas, colunas empilhadas, barras, barras empilhadas,
// linha, área, dispersão, pizza e radar, desenhados de uma tabela (as categorias nas linhas, as séries nas colunas)
// dentro de um retângulo da imagem. O gráfico vira formas (uma camada por série, a grade e os eixos) e textos (os
// números dos eixos, as categorias e a legenda), num grupo que guarda a tabela para refazer. As contas são puras.
import type { Subcaminho } from "../vetor/modelo.ts";

export type TipoDeGrafico = "colunas" | "colunasEmpilhadas" | "barras" | "barrasEmpilhadas" | "linha" | "area" | "dispersao" | "pizza" | "radar";

export const TIPOS_DE_GRAFICO: { id: TipoDeGrafico; nome: string }[] = [
  { id: "colunas", nome: "Colunas" },
  { id: "colunasEmpilhadas", nome: "Colunas empilhadas" },
  { id: "barras", nome: "Barras" },
  { id: "barrasEmpilhadas", nome: "Barras empilhadas" },
  { id: "linha", nome: "Linha" },
  { id: "area", nome: "Área" },
  { id: "dispersao", nome: "Dispersão" },
  { id: "pizza", nome: "Pizza" },
  { id: "radar", nome: "Radar" },
];

export type SerieDoGrafico = { nome: string; valores: number[] };
export type Grafico = {
  tipo: TipoDeGrafico;
  rotulos: string[];
  series: SerieDoGrafico[];
  /** O retângulo do gráfico na imagem, em pixels. */
  caixa: { x: number; y: number; largura: number; altura: number };
  legenda: boolean;
  cores: string[];
};

export const CORES_DO_GRAFICO = ["#2f6fdd", "#e5484d", "#30a46c", "#f5a524", "#8e4ec6", "#0fb5ae", "#d6409f", "#7c8594"];

export type ElementoDoGrafico =
  | { tipo: "forma"; nome: string; caminhos: Subcaminho[]; cor: string | null; traco: { cor: string; largura: number } | null }
  | { tipo: "texto"; nome: string; texto: string; x: number; y: number; alinhamento: "esquerda" | "centro" | "direita"; tamanho: number; cor: string; giro: number };

type Ponto = { x: number; y: number };
const COR_DA_GRADE = "#d4d8de";
const COR_DO_EIXO = "#5b6270";
const COR_DO_TEXTO = "#3a404b";

/** A tabela colada (tabulações ou ponto e vírgula; a primeira linha são os nomes das séries, a primeira coluna as categorias). */
export function dadosDoTexto(texto: string): { rotulos: string[]; series: SerieDoGrafico[] } {
  const linhas = texto
    .split(/\r?\n/)
    .map((linha) => linha.split(/\t|;/).map((celula) => celula.trim()))
    .filter((celulas) => celulas.some(Boolean));
  if (!linhas.length) return { rotulos: [], series: [] };
  const [cabecalho, ...resto] = linhas;
  const numero = (valor: string) => Number(valor.replace(/\./g, "").replace(",", ".")) || 0;
  const nomes = cabecalho.slice(1);
  return {
    rotulos: resto.map((celulas) => celulas[0] ?? ""),
    series: nomes.map((nome, j) => ({ nome: nome || `Série ${j + 1}`, valores: resto.map((celulas) => numero(celulas[j + 1] ?? "0")) })),
  };
}

/** Uma escala de números redondos entre o menor e o maior (o passo é 1, 2 ou 5 vezes uma potência de dez). */
export function escalaBonita(menor: number, maior: number, divisoes = 5): { min: number; max: number; passo: number } {
  let lo = Math.min(menor, maior, 0);
  let hi = Math.max(menor, maior, 0);
  if (hi - lo < 1e-9) hi = lo + 1;
  const bruto = (hi - lo) / divisoes;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? 10 * potencia;
  lo = Math.floor(lo / passo) * passo;
  hi = Math.ceil(hi / passo) * passo;
  return { min: lo, max: hi, passo };
}

const fechado = (pontos: Ponto[]): Subcaminho => ({ nos: pontos.map(({ x, y }) => ({ x, y })), fechado: true, operacao: "somar" });
const aberto = (pontos: Ponto[]): Subcaminho => ({ nos: pontos.map(({ x, y }) => ({ x, y })), fechado: false, operacao: "somar" });
const retangulo = (x: number, y: number, l: number, a: number): Subcaminho => fechado([{ x, y }, { x: x + l, y }, { x: x + l, y: y + a }, { x, y: y + a }]);
const circulo = (c: Ponto, r: number): Subcaminho => {
  const k = r * 0.5522847498;
  return {
    nos: [
      { x: c.x, y: c.y - r, ex: c.x - k, ey: c.y - r, sx: c.x + k, sy: c.y - r },
      { x: c.x + r, y: c.y, ex: c.x + r, ey: c.y - k, sx: c.x + r, sy: c.y + k },
      { x: c.x, y: c.y + r, ex: c.x + k, ey: c.y + r, sx: c.x - k, sy: c.y + r },
      { x: c.x - r, y: c.y, ex: c.x - r, ey: c.y + k, sx: c.x - r, sy: c.y - k },
    ],
    fechado: true,
    operacao: "somar",
  };
};
const numeroCurto = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

/** As formas e os textos do gráfico. */
export function elementosDoGrafico(g: Grafico): ElementoDoGrafico[] {
  const cor = (i: number) => g.cores[i % g.cores.length] ?? CORES_DO_GRAFICO[i % CORES_DO_GRAFICO.length];
  const tamanho = Math.max(9, Math.min(16, Math.round(Math.min(g.caixa.largura, g.caixa.altura) / 30)));
  const series = g.series.filter((serie) => serie.valores.length);
  const n = g.rotulos.length;
  const saida: ElementoDoGrafico[] = [];
  const texto = (nome: string, valor: string, x: number, y: number, alinhamento: "esquerda" | "centro" | "direita", giro = 0) => saida.push({ tipo: "texto", nome, texto: valor, x, y, alinhamento, tamanho, cor: COR_DO_TEXTO, giro });
  // A legenda embaixo: um quadrado e o nome de cada série (na pizza, de cada categoria)
  const nomesDaLegenda = g.tipo === "pizza" ? g.rotulos : g.tipo === "dispersao" ? series.slice(1).map((s) => s.nome) : series.map((s) => s.nome);
  const alturaDaLegenda = g.legenda && nomesDaLegenda.length ? tamanho * 2.2 : 0;
  if (alturaDaLegenda) {
    const passo = g.caixa.largura / nomesDaLegenda.length;
    nomesDaLegenda.forEach((nome, i) => {
      const x = g.caixa.x + passo * i + 4;
      const y = g.caixa.y + g.caixa.altura - alturaDaLegenda / 2;
      const deslocamento = g.tipo === "dispersao" ? 1 : 0;
      saida.push({ tipo: "forma", nome: `Legenda ${nome}`, caminhos: [retangulo(x, y - tamanho / 2, tamanho, tamanho)], cor: cor(i + deslocamento), traco: null });
      texto(`Legenda: ${nome}`, nome, x + tamanho * 1.4, y + tamanho * 0.35, "esquerda");
    });
  }
  const caixa = { x: g.caixa.x, y: g.caixa.y, largura: g.caixa.largura, altura: g.caixa.altura - alturaDaLegenda };

  if (g.tipo === "pizza" || g.tipo === "radar") {
    // Primeiro o desenho (ele também põe textos na lista), depois a lista inteira
    const desenho = g.tipo === "pizza" ? pizza(g, series, caixa, cor, texto) : radar(g, series, caixa, cor, texto, tamanho);
    return [...saida, ...desenho];
  }

  // Os eixos cartesianos: a área do desenho sem a margem dos números
  const margemEsquerda = tamanho * 4;
  const margemDeBaixo = tamanho * 2.2;
  const area = { x: caixa.x + margemEsquerda, y: caixa.y + tamanho * 0.8, largura: Math.max(10, caixa.largura - margemEsquerda - tamanho), altura: Math.max(10, caixa.altura - margemDeBaixo - tamanho * 0.8) };
  const deitado = g.tipo === "barras" || g.tipo === "barrasEmpilhadas";
  const empilhado = g.tipo === "colunasEmpilhadas" || g.tipo === "barrasEmpilhadas" || g.tipo === "area";
  // O intervalo dos valores (empilhado: as somas positivas e negativas de cada categoria)
  let menor = 0;
  let maior = 0;
  if (g.tipo === "dispersao") {
    const ys = series.slice(1).flatMap((s) => s.valores);
    menor = Math.min(0, ...ys);
    maior = Math.max(0, ...ys);
  } else if (empilhado) {
    for (let i = 0; i < n; i++) {
      const vals = series.map((s) => s.valores[i] ?? 0);
      maior = Math.max(maior, vals.filter((v) => v > 0).reduce((a, b) => a + b, 0));
      menor = Math.min(menor, vals.filter((v) => v < 0).reduce((a, b) => a + b, 0));
    }
  } else {
    const todos = series.flatMap((s) => s.valores);
    menor = Math.min(0, ...todos);
    maior = Math.max(0, ...todos);
  }
  const escala = escalaBonita(menor, maior);
  // O valor na tela: no deitado, pela largura; senão, pela altura (de baixo para cima)
  const naTela = (v: number) => (deitado ? area.x + ((v - escala.min) / (escala.max - escala.min)) * area.largura : area.y + area.altura - ((v - escala.min) / (escala.max - escala.min)) * area.altura);
  const grade: Subcaminho[] = [];
  for (let v = escala.min; v <= escala.max + escala.passo / 2; v += escala.passo) {
    const p = naTela(v);
    if (deitado) {
      grade.push(aberto([{ x: p, y: area.y }, { x: p, y: area.y + area.altura }]));
      texto(`Valor ${numeroCurto(v)}`, numeroCurto(v), p, area.y + area.altura + tamanho * 1.4, "centro");
    } else {
      grade.push(aberto([{ x: area.x, y: p }, { x: area.x + area.largura, y: p }]));
      texto(`Valor ${numeroCurto(v)}`, numeroCurto(v), area.x - tamanho * 0.5, p + tamanho * 0.35, "direita");
    }
  }
  saida.unshift({ tipo: "forma", nome: "Grade", caminhos: grade, cor: null, traco: { cor: COR_DA_GRADE, largura: 1 } });
  const zero = naTela(Math.max(escala.min, Math.min(escala.max, 0)));
  const eixos: Subcaminho[] = deitado ? [aberto([{ x: zero, y: area.y }, { x: zero, y: area.y + area.altura }])] : [aberto([{ x: area.x, y: zero }, { x: area.x + area.largura, y: zero }])];

  if (g.tipo === "dispersao") {
    // O x é a primeira série; cada outra série são os y
    const xs = series[0]?.valores ?? [];
    const ex = escalaBonita(Math.min(0, ...xs), Math.max(0, ...xs));
    const xNaTela = (v: number) => area.x + ((v - ex.min) / (ex.max - ex.min)) * area.largura;
    for (let v = ex.min; v <= ex.max + ex.passo / 2; v += ex.passo) texto(`Eixo x ${numeroCurto(v)}`, numeroCurto(v), xNaTela(v), area.y + area.altura + tamanho * 1.4, "centro");
    eixos.push(aberto([{ x: xNaTela(Math.max(ex.min, Math.min(ex.max, 0))), y: area.y }, { x: xNaTela(Math.max(ex.min, Math.min(ex.max, 0))), y: area.y + area.altura }]));
    series.slice(1).forEach((serie, j) => {
      const pontos = serie.valores.map((v, i) => circulo({ x: xNaTela(xs[i] ?? 0), y: naTela(v) }, tamanho * 0.35));
      saida.push({ tipo: "forma", nome: serie.nome, caminhos: pontos, cor: cor(j + 1), traco: null });
    });
    saida.push({ tipo: "forma", nome: "Eixos", caminhos: eixos, cor: null, traco: { cor: COR_DO_EIXO, largura: 1.5 } });
    return saida;
  }

  // As categorias pelo eixo das categorias
  const faixa = (deitado ? area.altura : area.largura) / Math.max(1, n);
  g.rotulos.forEach((rotulo, i) => {
    const meio = (deitado ? area.y : area.x) + faixa * (i + 0.5);
    if (deitado) texto(`Categoria ${rotulo}`, rotulo, area.x - tamanho * 0.5, meio + tamanho * 0.35, "direita");
    else texto(`Categoria ${rotulo}`, rotulo, meio, area.y + area.altura + tamanho * 1.4, "centro");
  });
  if (g.tipo === "linha" || g.tipo === "area") {
    const acumulado = new Array(n).fill(0);
    series.forEach((serie, j) => {
      const baixo = acumulado.slice();
      const pontos = serie.valores.slice(0, n).map((v, i) => {
        const valor = g.tipo === "area" ? (acumulado[i] += v) : v;
        return { x: area.x + faixa * (i + 0.5), y: naTela(valor) };
      });
      if (g.tipo === "area") {
        const fundo = baixo.map((v, i) => ({ x: area.x + faixa * (i + 0.5), y: naTela(v) })).reverse();
        saida.push({ tipo: "forma", nome: serie.nome, caminhos: [fechado([...pontos, ...fundo])], cor: cor(j), traco: null });
      } else {
        const marcas = pontos.map((p) => retangulo(p.x - tamanho * 0.3, p.y - tamanho * 0.3, tamanho * 0.6, tamanho * 0.6));
        // A linha só com o traço (um caminho aberto com preenchimento se fecharia sozinho) e as marcas cheias
        saida.push({ tipo: "forma", nome: serie.nome, caminhos: [aberto(pontos)], cor: null, traco: { cor: cor(j), largura: Math.max(1.5, tamanho / 6) } });
        saida.push({ tipo: "forma", nome: `${serie.nome} (marcas)`, caminhos: marcas, cor: cor(j), traco: null });
      }
    });
  } else {
    // Colunas e barras: lado a lado ou empilhadas
    const largura = faixa * 0.75;
    const positivos = new Array(n).fill(0);
    const negativos = new Array(n).fill(0);
    series.forEach((serie, j) => {
      const caminhos: Subcaminho[] = [];
      serie.valores.slice(0, n).forEach((v, i) => {
        let de: number;
        let ate: number;
        let inicio: number;
        let espessura: number;
        if (empilhado) {
          const base = v >= 0 ? positivos[i] : negativos[i];
          de = naTela(base);
          ate = naTela(base + v);
          if (v >= 0) positivos[i] += v;
          else negativos[i] += v;
          inicio = (deitado ? area.y : area.x) + faixa * i + (faixa - largura) / 2;
          espessura = largura;
        } else {
          de = zero;
          ate = naTela(v);
          espessura = largura / Math.max(1, series.length);
          inicio = (deitado ? area.y : area.x) + faixa * i + (faixa - largura) / 2 + espessura * j;
        }
        if (deitado) caminhos.push(retangulo(Math.min(de, ate), inicio, Math.abs(ate - de), espessura));
        else caminhos.push(retangulo(inicio, Math.min(de, ate), espessura, Math.abs(ate - de)));
      });
      saida.push({ tipo: "forma", nome: serie.nome, caminhos, cor: cor(j), traco: null });
    });
  }
  saida.push({ tipo: "forma", nome: "Eixos", caminhos: eixos, cor: null, traco: { cor: COR_DO_EIXO, largura: 1.5 } });
  return saida;
}

type Caixa = { x: number; y: number; largura: number; altura: number };
type Texto = (nome: string, valor: string, x: number, y: number, alinhamento: "esquerda" | "centro" | "direita", giro?: number) => void;

/** As pizzas: uma por série, lado a lado, com as fatias das categorias. */
function pizza(g: Grafico, series: SerieDoGrafico[], caixa: Caixa, cor: (i: number) => string, texto: Texto): ElementoDoGrafico[] {
  const saida: ElementoDoGrafico[] = [];
  const quantas = Math.max(1, series.length);
  const largura = caixa.largura / quantas;
  const fatias = g.rotulos.map(() => [] as Subcaminho[]);
  series.forEach((serie, s) => {
    const raio = Math.min(largura, caixa.altura) * 0.42;
    const centro = { x: caixa.x + largura * (s + 0.5), y: caixa.y + caixa.altura / 2 };
    const total = serie.valores.reduce((a, v) => a + Math.max(0, v), 0) || 1;
    let angulo = -Math.PI / 2;
    serie.valores.forEach((v, i) => {
      const parte = (Math.max(0, v) / total) * 2 * Math.PI;
      if (parte <= 0) return;
      // A fatia: o meio e o arco em pedaços de até 90°, cada um uma cúbica
      const nos: Subcaminho["nos"] = [{ x: centro.x, y: centro.y }];
      const pedacos = Math.max(1, Math.ceil(parte / (Math.PI / 2)));
      const passo = parte / pedacos;
      const k = (4 / 3) * Math.tan(passo / 4) * raio;
      for (let p = 0; p <= pedacos; p++) {
        const a = angulo + passo * p;
        const ponto = { x: centro.x + Math.cos(a) * raio, y: centro.y + Math.sin(a) * raio };
        const no: Subcaminho["nos"][number] = { x: ponto.x, y: ponto.y };
        if (p > 0) Object.assign(no, { ex: ponto.x + Math.sin(a) * k, ey: ponto.y - Math.cos(a) * k });
        if (p < pedacos) Object.assign(no, { sx: ponto.x - Math.sin(a) * k, sy: ponto.y + Math.cos(a) * k });
        nos.push(no);
      }
      fatias[i].push({ nos, fechado: true, operacao: "somar" });
      angulo += parte;
    });
    if (series.length > 1) texto(`Série ${serie.nome}`, serie.nome, centro.x, centro.y + raio + 18, "centro");
  });
  g.rotulos.forEach((rotulo, i) => fatias[i].length && saida.push({ tipo: "forma", nome: rotulo, caminhos: fatias[i], cor: cor(i), traco: { cor: "#ffffff", largura: 1.5 } }));
  return saida;
}

/** O radar: um eixo por categoria saindo do meio, os anéis da escala e o polígono de cada série. */
function radar(g: Grafico, series: SerieDoGrafico[], caixa: Caixa, cor: (i: number) => string, texto: Texto, tamanho: number): ElementoDoGrafico[] {
  const saida: ElementoDoGrafico[] = [];
  const n = Math.max(3, g.rotulos.length);
  const raio = Math.min(caixa.largura, caixa.altura) / 2 - tamanho * 2.5;
  const centro = { x: caixa.x + caixa.largura / 2, y: caixa.y + caixa.altura / 2 };
  const escala = escalaBonita(0, Math.max(0, ...series.flatMap((s) => s.valores)));
  const em = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / n) * 2 * Math.PI;
    const r = (Math.max(0, v - escala.min) / (escala.max - escala.min)) * raio;
    return { x: centro.x + Math.cos(a) * r, y: centro.y + Math.sin(a) * r };
  };
  const grade: Subcaminho[] = [];
  for (let v = escala.passo; v <= escala.max + escala.passo / 2; v += escala.passo) grade.push(fechado(Array.from({ length: n }, (_, i) => em(i, v))));
  for (let i = 0; i < n; i++) grade.push(aberto([centro, em(i, escala.max)]));
  saida.push({ tipo: "forma", nome: "Grade", caminhos: grade, cor: null, traco: { cor: COR_DA_GRADE, largura: 1 } });
  g.rotulos.forEach((rotulo, i) => {
    const p = em(i, escala.max + escala.passo * 0.45);
    texto(`Categoria ${rotulo}`, rotulo, p.x, p.y + tamanho * 0.35, Math.abs(p.x - centro.x) < 4 ? "centro" : p.x < centro.x ? "direita" : "esquerda");
  });
  series.forEach((serie, j) => {
    const pontos = Array.from({ length: n }, (_, i) => em(i, serie.valores[i] ?? 0));
    saida.push({ tipo: "forma", nome: serie.nome, caminhos: [fechado(pontos)], cor: null, traco: { cor: cor(j), largura: Math.max(2, tamanho / 5) } });
  });
  return saida;
}
