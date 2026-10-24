// As contas dos estilos de camada (ADR 0003, onda 13.9), na CPU, sobre o alfa da camada desenhada sozinha (os mesmos
// números na prévia e na exportação, que desenham pelo mesmo compositor). Cada efeito vira um campo de cobertura (0 a
// 1, por pixel) que o compositor pinta com a cor ou a tinta do efeito e mistura no modo dele, como uma camada por
// cima ou por baixo do conteúdo. As medidas chegam já em pixels do campo (a escala da tela vezes a dos efeitos).
//
// Desfoque: três caixas seguidas (a gaussiana aproximada, como os editores fazem), com fora da imagem transparente.
// Distância: a transformada exata (Felzenszwalb e Huttenlocher) até o pixel mais perto do outro lado, com a borda
// suave pelo alfa (o pixel meio coberto fica a meio pixel da borda).
import { valorDaCurva } from "../projeto/cor.ts";
import { type ContornoDoEfeito, type Efeito, LINEAR, type LuzGlobal } from "./estiloDeCamada.ts";

export type Campo = { largura: number; altura: number; dados: Float32Array };

const novo = (largura: number, altura: number): Campo => ({ largura, altura, dados: new Float32Array(largura * altura) });
const limitar = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// ——— Desfoque ———

/** Os tamanhos das três caixas que somam uma gaussiana de desvio `sigma` (Kovesi). */
export function caixasDaGaussiana(sigma: number, n = 3): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let menor = Math.floor(ideal);
  if (menor % 2 === 0) menor--;
  const maior = menor + 2;
  const m = Math.round((12 * sigma * sigma - n * menor * menor - 4 * n * menor - 3 * n) / (-4 * menor - 4));
  return Array.from({ length: n }, (_, i) => (i < m ? menor : maior));
}

function caixaHorizontal(entrada: Float32Array, saida: Float32Array, largura: number, altura: number, raio: number) {
  const tamanho = 2 * raio + 1;
  for (let y = 0; y < altura; y++) {
    const linha = y * largura;
    let soma = 0;
    for (let x = -raio; x <= raio; x++) if (x >= 0 && x < largura) soma += entrada[linha + x];
    for (let x = 0; x < largura; x++) {
      saida[linha + x] = soma / tamanho;
      const sai = x - raio;
      const entra = x + raio + 1;
      if (sai >= 0) soma -= entrada[linha + sai];
      if (entra < largura) soma += entrada[linha + entra];
    }
  }
}

function caixaVertical(entrada: Float32Array, saida: Float32Array, largura: number, altura: number, raio: number) {
  const tamanho = 2 * raio + 1;
  for (let x = 0; x < largura; x++) {
    let soma = 0;
    for (let y = -raio; y <= raio; y++) if (y >= 0 && y < altura) soma += entrada[y * largura + x];
    for (let y = 0; y < altura; y++) {
      saida[y * largura + x] = soma / tamanho;
      const sai = y - raio;
      const entra = y + raio + 1;
      if (sai >= 0) soma -= entrada[sai * largura + x];
      if (entra < altura) soma += entrada[entra * largura + x];
    }
  }
}

/** O desfoque exato (o núcleo gaussiano em cada direção), para desvios pequenos, onde as caixas erram. */
function gaussianaExata(campo: Campo, sigma: number): Campo {
  const { largura, altura } = campo;
  const raio = Math.ceil(3 * sigma);
  const nucleo = Array.from({ length: 2 * raio + 1 }, (_, k) => Math.exp(-((k - raio) ** 2) / (2 * sigma * sigma)));
  const total = nucleo.reduce((s, v) => s + v, 0);
  const pesos = nucleo.map((v) => v / total);
  const meio = new Float32Array(campo.dados.length);
  const saida = new Float32Array(campo.dados.length);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      let s = 0;
      for (let k = -raio; k <= raio; k++) if (x + k >= 0 && x + k < largura) s += campo.dados[y * largura + x + k] * pesos[k + raio];
      meio[y * largura + x] = s;
    }
  }
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      let s = 0;
      for (let k = -raio; k <= raio; k++) if (y + k >= 0 && y + k < altura) s += meio[(y + k) * largura + x] * pesos[k + raio];
      saida[y * largura + x] = s;
    }
  }
  return { largura, altura, dados: saida };
}

/** O campo desfocado (gaussiana de desvio `sigma` em pixels); fora da imagem conta como zero. */
export function desfocar(campo: Campo, sigma: number): Campo {
  if (sigma < 0.3) return { ...campo, dados: campo.dados.slice() };
  if (sigma < 2.5) return gaussianaExata(campo, sigma);
  const { largura, altura } = campo;
  let a = campo.dados.slice();
  let b = new Float32Array(a.length);
  for (const caixa of caixasDaGaussiana(sigma)) {
    const raio = (caixa - 1) / 2;
    caixaHorizontal(a, b, largura, altura, raio);
    [a, b] = [b, a];
    caixaVertical(a, b, largura, altura, raio);
    [a, b] = [b, a];
  }
  return { largura, altura, dados: a };
}

// ——— Distância ———

const INFINITO = 1e20;

/** A transformada da distância ao quadrado em uma dimensão (o envelope inferior das parábolas). */
function dt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -INFINITO;
  z[1] = INFINITO;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INFINITO;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** A distância (em pixels) de cada pixel até o mais perto em que `alvo` vale. */
function distanciaAte(largura: number, altura: number, alvo: (i: number) => boolean): Float32Array {
  const n = Math.max(largura, altura);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const grade = new Float64Array(largura * altura);
  for (let i = 0; i < grade.length; i++) grade[i] = alvo(i) ? 0 : INFINITO;
  for (let x = 0; x < largura; x++) {
    for (let y = 0; y < altura; y++) f[y] = grade[y * largura + x];
    dt1d(f, altura, d, v, z);
    for (let y = 0; y < altura; y++) grade[y * largura + x] = d[y];
  }
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) f[x] = grade[y * largura + x];
    dt1d(f, largura, d, v, z);
    for (let x = 0; x < largura; x++) grade[y * largura + x] = d[x];
  }
  const saida = new Float32Array(largura * altura);
  for (let i = 0; i < saida.length; i++) saida[i] = Math.sqrt(grade[i]);
  return saida;
}

/**
 * A distância até a borda da forma por fora (0 dentro) e por dentro (0 fora), em pixels. A borda é onde o alfa passa
 * de meio; o pixel com alfa entre 0 e 1 fica a (0,5 − alfa) dela, do lado em que está.
 */
export function distancias(alfa: Campo): { fora: Float32Array; dentro: Float32Array } {
  const { largura, altura, dados } = alfa;
  const ateDentro = distanciaAte(largura, altura, (i) => dados[i] >= 0.5);
  const ateFora = distanciaAte(largura, altura, (i) => dados[i] < 0.5);
  const fora = new Float32Array(dados.length);
  const dentro = new Float32Array(dados.length);
  for (let i = 0; i < dados.length; i++) {
    const a = dados[i];
    if (a >= 0.5) dentro[i] = a < 1 ? a - 0.5 : Math.max(0, ateFora[i] - 0.5);
    else fora[i] = a > 0 ? 0.5 - a : Math.max(0, ateDentro[i] - 0.5);
  }
  return { fora, dentro };
}

// ——— Contorno, ruído e deslocamento ———

/** A tabela de 256 valores da curva de contorno (cúbica monótona entre os cantos, reta neles). */
export function tabelaDoContorno(contorno: ContornoDoEfeito | null | undefined): Float32Array {
  const pontos = (contorno ?? LINEAR).pontos;
  const tabela = new Float32Array(256);
  // Os trechos entre cantos são curvas separadas (o canto quebra a tangente)
  const trechos: { x: number; y: number }[][] = [];
  let atual: { x: number; y: number }[] = [];
  pontos.forEach((p, i) => {
    atual.push(p);
    if (p.canto && i > 0 && i < pontos.length - 1) {
      trechos.push(atual);
      atual = [p];
    }
  });
  trechos.push(atual);
  for (let k = 0; k < 256; k++) {
    const x = k / 255;
    const trecho = trechos.find((t) => x <= t[t.length - 1].x) ?? trechos[trechos.length - 1];
    tabela[k] = trecho.length < 2 ? trecho[0]?.y ?? x : valorDaCurva(trecho.map((p) => [p.x, p.y]), x);
  }
  return tabela;
}

const lerTabela = (tabela: Float32Array, v: number) => {
  const p = limitar(v, 0, 1) * 255;
  const k = Math.floor(p);
  return k >= 255 ? tabela[255] : tabela[k] + (tabela[k + 1] - tabela[k]) * (p - k);
};

/** Um sorteio por pixel que não muda de um desenho para o outro. */
function ruidoNoPixel(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** O campo andado (dx, dy) pixels (leitura bilinear; o que vem de fora é zero). */
export function deslocar(campo: Campo, dx: number, dy: number): Campo {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return campo;
  const { largura, altura, dados } = campo;
  const saida = novo(largura, altura);
  const ler = (x: number, y: number) => (x < 0 || y < 0 || x >= largura || y >= altura ? 0 : dados[y * largura + x]);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const sx = x - dx;
      const sy = y - dy;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      saida.dados[y * largura + x] = (ler(x0, y0) * (1 - fx) + ler(x0 + 1, y0) * fx) * (1 - fy) + (ler(x0, y0 + 1) * (1 - fx) + ler(x0 + 1, y0 + 1) * fx) * fy;
    }
  }
  return saida;
}

/** Cobertura da faixa de largura `w` medida por uma distância (borda suave de um pixel). */
const cobertura = (distancia: number, w: number) => limitar(w - distancia + 0.5, 0, 1);

/**
 * O núcleo de uma sombra ou de um brilho: a forma engordada por `espalhar` do tamanho e desfocada pelo resto (o
 * "suave"), ou a rampa da distância (o "preciso"), com o contorno aplicado.
 */
function nucleo(base: Campo, distancia: Float32Array, tamanho: number, espalhar: number, preciso: boolean, contorno: Float32Array): Campo {
  const { largura, altura } = base;
  const saida = novo(largura, altura);
  if (preciso) {
    const cheio = tamanho * espalhar;
    const rampa = Math.max(1e-6, tamanho - cheio);
    for (let i = 0; i < saida.dados.length; i++) saida.dados[i] = lerTabela(contorno, Math.max(base.dados[i], 1 - limitar((distancia[i] - cheio) / rampa, 0, 1)));
    return saida;
  }
  const engordado = novo(largura, altura);
  const cheio = tamanho * espalhar;
  for (let i = 0; i < engordado.dados.length; i++) engordado.dados[i] = cheio > 0 ? Math.max(base.dados[i], cobertura(distancia[i], cheio)) : base.dados[i];
  const borrado = desfocar(engordado, (tamanho * (1 - espalhar)) / 2.5);
  for (let i = 0; i < saida.dados.length; i++) saida.dados[i] = lerTabela(contorno, borrado.dados[i]);
  return saida;
}

function comRuido(campo: Campo, ruido: number): Campo {
  if (!ruido) return campo;
  for (let i = 0; i < campo.dados.length; i++) campo.dados[i] = limitar(campo.dados[i] * (1 - ruido + 2 * ruido * ruidoNoPixel(i)), 0, 1);
  return campo;
}

// ——— Luz ———

/**
 * Um vetor da imagem (y para baixo) levado ao campo da camada, que é desenhado sem o giro dela (graus, no sentido
 * horário da tela): o giro ao contrário.
 */
export function noCampo(vx: number, vy: number, giroDaCamada: number): [number, number] {
  const g = (-giroDaCamada * Math.PI) / 180;
  return [vx * Math.cos(g) - vy * Math.sin(g), vx * Math.sin(g) + vy * Math.cos(g)];
}

/** O deslocamento (dx, dy) em pixels do campo, para longe da luz que vem do ângulo (90 é de cima). */
export function direcaoDaLuz(anguloEmGraus: number, distancia: number, giroDaCamada: number): [number, number] {
  const r = (anguloEmGraus * Math.PI) / 180;
  return noCampo(-Math.cos(r) * distancia, Math.sin(r) * distancia, giroDaCamada);
}

export const anguloDoEfeito = (efeito: Efeito, luz: LuzGlobal) => (efeito.luz_global ? luz.angulo : (efeito.angulo ?? 120));
export const altitudeDoEfeito = (efeito: Efeito, luz: LuzGlobal) => (efeito.luz_global ? luz.altitude : (efeito.altitude ?? 30));

// ——— Os efeitos ———

/** O que a conta de um efeito devolve: a cobertura e, no chanfro, a dos dois tons (realce e sombra). */
export type CampoDoEfeito = { cobertura: Campo; realce?: Campo; sombra?: Campo; t?: Campo };

export type Contexto = {
  /** O alfa da camada (0 a 1). */
  alfa: Campo;
  /** As distâncias até a borda (calculadas uma vez para todos os efeitos). */
  distancias: { fora: Float32Array; dentro: Float32Array };
  /** Pixels do campo por pixel do documento (a tela e a escala dos efeitos). */
  escala: number;
  /** O giro da camada, em graus (as direções dos efeitos são da imagem). */
  giro: number;
  luz: LuzGlobal;
};

export function contextoDoAlfa(alfa: Campo, escala: number, giro: number, luz: LuzGlobal): Contexto {
  return { alfa, distancias: distancias(alfa), escala, giro, luz };
}

const multiplicar = (campo: Campo, f: (i: number) => number) => {
  for (let i = 0; i < campo.dados.length; i++) campo.dados[i] *= f(i);
  return campo;
};

export function campoDoEfeito(efeito: Efeito, ctx: Contexto): CampoDoEfeito {
  const { alfa, distancias: d, escala } = ctx;
  const { largura, altura } = alfa;
  const tamanho = (efeito.tamanho ?? 0) * escala;
  const distancia = (efeito.distancia ?? 0) * escala;
  const espalhar = efeito.espalhar ?? 0;
  const contorno = tabelaDoContorno(efeito.contorno);
  switch (efeito.tipo) {
    case "sombra": {
      const [dx, dy] = direcaoDaLuz(anguloDoEfeito(efeito, ctx.luz), distancia, ctx.giro);
      let s = comRuido(nucleo(alfa, d.fora, tamanho, espalhar, false, contorno), efeito.ruido ?? 0);
      s = deslocar(s, dx, dy);
      // A camada vaza a sombra: ela não aparece por baixo do conteúdo
      if (efeito.vazar !== false) multiplicar(s, (i) => 1 - alfa.dados[i]);
      return { cobertura: s };
    }
    case "brilho_externo": {
      const s = comRuido(nucleo(alfa, d.fora, tamanho, espalhar, efeito.tecnica === "preciso", contorno), efeito.ruido ?? 0);
      multiplicar(s, (i) => 1 - alfa.dados[i]);
      // Com degradê, a cor vem da distância: do começo (junto da forma) ao fim (na ponta do brilho)
      const t = novo(largura, altura);
      for (let i = 0; i < t.dados.length; i++) t.dados[i] = limitar(d.fora[i] / Math.max(1e-6, tamanho), 0, 1);
      return { cobertura: s, t };
    }
    case "sombra_interna": {
      const [dx, dy] = direcaoDaLuz(anguloDoEfeito(efeito, ctx.luz), distancia, ctx.giro);
      // O lado de fora, engordado para dentro (o "obstruir") e desfocado, andado e cortado pela forma
      const fora: Campo = { largura, altura, dados: alfa.dados.map((a) => 1 - a) };
      let s = comRuido(nucleo(fora, d.dentro, tamanho, espalhar, false, contorno), efeito.ruido ?? 0);
      s = deslocar(s, dx, dy);
      // O que vem de fora da imagem também é o lado de fora
      if (dx || dy) {
        for (let y = 0; y < altura; y++) {
          for (let x = 0; x < largura; x++) {
            const sx = x - dx;
            const sy = y - dy;
            if (sx < 0 || sy < 0 || sx > largura - 1 || sy > altura - 1) s.dados[y * largura + x] = 1;
          }
        }
      }
      multiplicar(s, (i) => alfa.dados[i]);
      return { cobertura: s };
    }
    case "brilho_interno": {
      const fora: Campo = { largura, altura, dados: alfa.dados.map((a) => 1 - a) };
      const s = comRuido(nucleo(fora, d.dentro, tamanho, espalhar, efeito.tecnica === "preciso", contorno), efeito.ruido ?? 0);
      if (efeito.origem === "centro") for (let i = 0; i < s.dados.length; i++) s.dados[i] = 1 - s.dados[i];
      multiplicar(s, (i) => alfa.dados[i]);
      const t = novo(largura, altura);
      for (let i = 0; i < t.dados.length; i++) t.dados[i] = limitar(d.dentro[i] / Math.max(1e-6, tamanho), 0, 1);
      return { cobertura: s, t };
    }
    case "cetim": {
      // A diferença de duas cópias desfocadas, andadas para os dois lados na direção do ângulo
      const borrado = desfocar(alfa, tamanho / 2.5);
      const [dx, dy] = direcaoDaLuz(efeito.angulo ?? 19, distancia, ctx.giro);
      const a = deslocar(borrado, dx, dy);
      const b = deslocar(borrado, -dx, -dy);
      const s = novo(largura, altura);
      for (let i = 0; i < s.dados.length; i++) {
        const v = lerTabela(contorno, Math.abs(a.dados[i] - b.dados[i]));
        s.dados[i] = (efeito.inverter ? 1 - v : v) * alfa.dados[i];
      }
      return { cobertura: s };
    }
    case "sobreposicao_cor":
    case "sobreposicao_degrade":
    case "sobreposicao_padrao":
      return { cobertura: { largura, altura, dados: alfa.dados.slice() } };
    case "tracado": {
      const s = novo(largura, altura);
      const posicao = efeito.posicao ?? "fora";
      for (let i = 0; i < s.dados.length; i++) {
        const a = alfa.dados[i];
        const fora = posicao === "fora" ? tamanho : posicao === "centro" ? tamanho / 2 : 0;
        const dentro = posicao === "dentro" ? tamanho : posicao === "centro" ? tamanho / 2 : 0;
        s.dados[i] = (fora > 0 ? cobertura(d.fora[i], fora) * (1 - a) : 0) + (dentro > 0 ? cobertura(d.dentro[i], dentro) * a : 0);
      }
      return { cobertura: s };
    }
    case "chanfro":
      return chanfro(efeito, ctx, tamanho);
  }
}

/**
 * Chanfro e entalhe: uma altura (o relevo) pela forma, a normal dela e a luz do ângulo e da altitude. O que fica mais
 * claro que o plano vira realce; o mais escuro, sombra.
 */
function chanfro(efeito: Efeito, ctx: Contexto, tamanho: number): CampoDoEfeito {
  const { alfa, distancias: d } = ctx;
  const { largura, altura } = alfa;
  const estilo = efeito.estilo ?? "interno";
  const tecnica = efeito.tecnica ?? "suave";
  const t = Math.max(1, tamanho);
  const h = novo(largura, altura);
  const suave = tecnica === "suave";
  const borrado = suave ? desfocar(alfa, t / 2) : null;
  const contornoDoRelevo = efeito.contorno_chanfro ? tabelaDoContorno(efeito.contorno_chanfro) : null;
  for (let i = 0; i < h.dados.length; i++) {
    // Dentro: sobe da borda até o tamanho; fora: desce da borda até o tamanho
    const subidaDentro = suave ? borrado!.dados[i] : limitar(d.dentro[i] / t, 0, 1);
    const descidaFora = suave ? borrado!.dados[i] : 1 - limitar(d.fora[i] / t, 0, 1);
    let v: number;
    if (estilo === "externo") v = alfa.dados[i] >= 0.5 ? 1 : descidaFora;
    else if (estilo === "entalhe") v = suave ? borrado!.dados[i] : alfa.dados[i] >= 0.5 ? 0.5 + subidaDentro / 2 : descidaFora / 2;
    else if (estilo === "almofada") v = alfa.dados[i] >= 0.5 ? subidaDentro : 1 - descidaFora;
    else v = alfa.dados[i] >= 0.5 ? subidaDentro : 0;
    if (contornoDoRelevo) v = lerTabela(contornoDoRelevo, v);
    h.dados[i] = v;
  }
  const relevo = (efeito.suavidade ?? 0) > 0 ? desfocar(h, ((efeito.suavidade ?? 0) * ctx.escala) / 2) : h;
  // A cinzel suave arredonda o topo do cinzel duro
  const final = tecnica === "cinzel_suave" ? desfocar(relevo, Math.max(0.5, t / 8)) : relevo;
  const angulo = (anguloDoEfeito(efeito, ctx.luz) * Math.PI) / 180;
  const altitude = (altitudeDoEfeito(efeito, ctx.luz) * Math.PI) / 180;
  const sentido = efeito.direcao === "baixo" ? -1 : 1;
  // A direção da luz no campo (y para baixo) e o plano: a altura vai de 0 a 1 em `tamanho` pixels, vezes a profundidade
  const [lx, ly] = noCampo(Math.cos(altitude) * Math.cos(angulo), -Math.cos(altitude) * Math.sin(angulo), ctx.giro);
  const lz = Math.sin(altitude);
  const inclinacao = ((efeito.profundidade ?? 1) * sentido * t) / 2;
  const brilho = tabelaDoContorno(efeito.contorno_brilho);
  const realce = novo(largura, altura);
  const sombra = novo(largura, altura);
  const ler = (x: number, y: number) => final.dados[limitar(y, 0, altura - 1) * largura + limitar(x, 0, largura - 1)];
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      const gx = ((ler(x + 1, y) - ler(x - 1, y)) / 2) * inclinacao;
      const gy = ((ler(x, y + 1) - ler(x, y - 1)) / 2) * inclinacao;
      const n = Math.hypot(gx, gy, 1);
      const luz = (-gx * lx - gy * ly + lz) / n;
      // O brilho leva a luz (de -1 a 1) pela curva; o que passa do plano clareia e o que fica abaixo escurece, na
      // mesma medida (a do plano até a luz de frente)
      const plano = lerTabela(brilho, (lz + 1) / 2);
      const valor = lerTabela(brilho, (luz + 1) / 2);
      const medida = Math.max(1e-6, 1 - plano);
      const regiao = estilo === "interno" || estilo === "tracado" ? alfa.dados[i] : 1;
      realce.dados[i] = limitar((valor - plano) / medida, 0, 1) * regiao;
      sombra.dados[i] = limitar((plano - valor) / medida, 0, 1) * regiao;
    }
  }
  return { cobertura: realce, realce, sombra };
}

/** A margem (em pixels do campo) que os efeitos de fora precisam em volta da camada. */
export function margemDosEfeitos(efeitos: Efeito[], escala: number): number {
  let margem = 0;
  for (const efeito of efeitos) {
    const tamanho = (efeito.tamanho ?? 0) * escala;
    const distancia = (efeito.distancia ?? 0) * escala;
    if (efeito.tipo === "sombra") margem = Math.max(margem, distancia + tamanho * 1.6 + 2);
    else if (efeito.tipo === "brilho_externo") margem = Math.max(margem, tamanho * 1.6 + 2);
    else if (efeito.tipo === "tracado" && efeito.posicao !== "dentro") margem = Math.max(margem, tamanho + 2);
    else if (efeito.tipo === "chanfro" && efeito.estilo !== "interno") margem = Math.max(margem, tamanho * 1.2 + 2);
  }
  return Math.ceil(margem);
}
