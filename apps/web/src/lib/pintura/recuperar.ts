// A recuperação (ADR 0003, onda 13.5): o Pincel de recuperação, o de manchas, a Correção e o Mover sensível ao
// conteúdo. Contas puras sobre RGBA sem pré-multiplicar:
// - corrigirTom (o pincel, que não sabe onde o traço acaba): a textura vem da fonte e o tom (a luz e a cor em grande
//   escala) fica o do destino, somando à fonte a diferença desfocada entre os dois;
// - colarSemEmenda (quando a região é conhecida): a clonagem de Poisson, a fonte mais a membrana harmônica (cada pixel
//   é a média dos vizinhos, resolvida numa pirâmide) da diferença na borda;
// - preencherBuraco: o lugar mais parecido por perto (pelo anel em volta do buraco) copiado sem emenda, ou a membrana
//   com o grão desse lugar.

/** Três médias móveis seguidas (quase uma gaussiana de sigma `sigma`), num canal float, com a borda repetida. */
export function desfocarCanal(valores: Float32Array, largura: number, altura: number, sigma: number): Float32Array {
  if (sigma <= 0.3) return Float32Array.from(valores);
  const raio = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  let a = Float32Array.from(valores);
  let b = new Float32Array(valores.length);
  const lado = 2 * raio + 1;
  for (let passada = 0; passada < 3; passada++) {
    for (let y = 0; y < altura; y++) {
      const linha = y * largura;
      let soma = 0;
      for (let k = -raio; k <= raio; k++) soma += a[linha + Math.min(largura - 1, Math.max(0, k))];
      for (let x = 0; x < largura; x++) {
        b[linha + x] = soma / lado;
        soma += a[linha + Math.min(largura - 1, x + raio + 1)] - a[linha + Math.max(0, x - raio)];
      }
    }
    [a, b] = [b, a];
    for (let x = 0; x < largura; x++) {
      let soma = 0;
      for (let k = -raio; k <= raio; k++) soma += a[Math.min(altura - 1, Math.max(0, k)) * largura + x];
      for (let y = 0; y < altura; y++) {
        b[y * largura + x] = soma / lado;
        soma += a[Math.min(altura - 1, y + raio + 1) * largura + x] - a[Math.max(0, y - raio) * largura + x];
      }
    }
    [a, b] = [b, a];
  }
  return a;
}

/**
 * A fonte com o tom do destino: fonte + desfoque(destino − fonte), canal a canal no alfa pré-multiplicado, com o
 * desfoque do tamanho do pincel. Devolve a imagem nova (sem pré-multiplicar).
 */
export function corrigirTom(destino: Uint8ClampedArray, fonte: Uint8ClampedArray, largura: number, altura: number, sigma: number): Uint8ClampedArray<ArrayBuffer> {
  const n = largura * altura;
  const saida = new Uint8ClampedArray(n * 4);
  const pre = (dados: Uint8ClampedArray, c: number) => Float32Array.from({ length: n }, (_, i) => (c === 3 ? dados[i * 4 + 3] : (dados[i * 4 + c] * dados[i * 4 + 3]) / 255));
  const canais = [0, 1, 2, 3].map((c) => {
    const f = pre(fonte, c);
    const d = pre(destino, c);
    const diferenca = new Float32Array(n);
    for (let i = 0; i < n; i++) diferenca[i] = d[i] - f[i];
    const tom = desfocarCanal(diferenca, largura, altura, sigma);
    for (let i = 0; i < n; i++) f[i] += tom[i];
    return f;
  });
  for (let i = 0; i < n; i++) {
    const a = Math.min(255, Math.max(0, canais[3][i]));
    saida[i * 4 + 3] = Math.round(a);
    for (let c = 0; c < 3; c++) saida[i * 4 + c] = a > 0 ? Math.round(Math.min(255, Math.max(0, (canais[c][i] * 255) / a))) : 0;
  }
  return saida;
}

/** A membrana harmônica num nível: os pixels do buraco viram a média dos quatro vizinhos, `vezes` vezes. */
function relaxar(canais: Float32Array[], buraco: Uint8Array, largura: number, altura: number, vezes: number) {
  for (let k = 0; k < vezes; k++) {
    for (const canal of canais) {
      for (let y = 0; y < altura; y++) {
        for (let x = 0; x < largura; x++) {
          const i = y * largura + x;
          if (!buraco[i]) continue;
          let soma = 0;
          let n = 0;
          if (x > 0) {
            soma += canal[i - 1];
            n++;
          }
          if (x < largura - 1) {
            soma += canal[i + 1];
            n++;
          }
          if (y > 0) {
            soma += canal[i - largura];
            n++;
          }
          if (y < altura - 1) {
            soma += canal[i + largura];
            n++;
          }
          canal[i] = soma / n;
        }
      }
    }
  }
}

/** Resolve a membrana numa pirâmide: o nível de baixo (metade) dá o começo do de cima. */
function membrana(canais: Float32Array[], buraco: Uint8Array, largura: number, altura: number) {
  if (largura > 8 && altura > 8 && buraco.some(Boolean)) {
    const lm = Math.ceil(largura / 2);
    const am = Math.ceil(altura / 2);
    const buracoMenor = new Uint8Array(lm * am);
    const menores = canais.map(() => new Float32Array(lm * am));
    for (let y = 0; y < am; y++) {
      for (let x = 0; x < lm; x++) {
        let conhecidos = 0;
        const somas = canais.map(() => 0);
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const xx = Math.min(largura - 1, 2 * x + dx);
            const yy = Math.min(altura - 1, 2 * y + dy);
            const i = yy * largura + xx;
            if (buraco[i]) continue;
            conhecidos++;
            canais.forEach((canal, c) => (somas[c] += canal[i]));
          }
        }
        const j = y * lm + x;
        if (conhecidos) menores.forEach((menor, c) => (menor[j] = somas[c] / conhecidos));
        else buracoMenor[j] = 1;
      }
    }
    membrana(menores, buracoMenor, lm, am);
    // O começo do nível de cima: o valor do de baixo
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        const i = y * largura + x;
        if (!buraco[i]) continue;
        const j = Math.min(am - 1, y >> 1) * lm + Math.min(lm - 1, x >> 1);
        canais.forEach((canal, c) => (canal[i] = menores[c][j]));
      }
    }
    relaxar(canais, buraco, largura, altura, 30);
  } else relaxar(canais, buraco, largura, altura, Math.max(60, (largura + altura) * 2));
}

/** A caixa dos pixels marcados (diferentes de zero), ou null. */
function caixaDe(marcas: ArrayLike<number>, largura: number, altura: number) {
  let x0 = largura;
  let y0 = altura;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (!marcas[y * largura + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Os quatro canais pré-multiplicados (float) do recorte (x0, y0, lc, ac), lidos `(dx, dy)` adiante, com a borda repetida. */
function canaisPre(dados: ArrayLike<number>, largura: number, altura: number, x0: number, y0: number, lc: number, ac: number, dx = 0, dy = 0): Float32Array[] {
  const canais = [0, 1, 2, 3].map(() => new Float32Array(lc * ac));
  for (let y = 0; y < ac; y++) {
    const ys = Math.min(altura - 1, Math.max(0, y + y0 + dy));
    for (let x = 0; x < lc; x++) {
      const xs = Math.min(largura - 1, Math.max(0, x + x0 + dx));
      const i = (ys * largura + xs) * 4;
      const j = y * lc + x;
      const a = dados[i + 3];
      canais[3][j] = a;
      for (let c = 0; c < 3; c++) canais[c][j] = (dados[i + c] * a) / 255;
    }
  }
  return canais;
}

/** Grava os canais pré-multiplicados do recorte em `dados`, misturados ao que havia pelo peso (0 a 1) de cada pixel. */
function gravar(dados: Uint8ClampedArray, largura: number, x0: number, y0: number, lc: number, ac: number, canais: Float32Array[], peso: (i: number) => number) {
  for (let y = 0; y < ac; y++) {
    for (let x = 0; x < lc; x++) {
      const i = (y + y0) * largura + x + x0;
      const w = peso(i);
      if (w <= 0) continue;
      const j = y * lc + x;
      const antes = dados[i * 4 + 3];
      const a = Math.min(255, Math.max(0, antes * (1 - w) + canais[3][j] * w));
      const cores = [0, 1, 2].map((c) => ((dados[i * 4 + c] * antes) / 255) * (1 - w) + canais[c][j] * w);
      dados[i * 4 + 3] = Math.round(a);
      for (let c = 0; c < 3; c++) dados[i * 4 + c] = a > 0 ? Math.round(Math.min(255, Math.max(0, (cores[c] * 255) / a))) : 0;
    }
  }
}

/**
 * A clonagem sem emenda (Poisson): dentro da região, a fonte lida `(dx, dy)` adiante mais a membrana da diferença
 * entre o destino e ela na borda, então a textura é a da fonte e a luz e a cor emendam com o que está em volta.
 * `regiao` vai de 0 a 255 (a borda suave mistura). Escreve em `saida`.
 */
function clonar(destino: ArrayLike<number>, fonte: ArrayLike<number>, largura: number, altura: number, regiao: ArrayLike<number>, dx: number, dy: number, saida: Uint8ClampedArray) {
  const caixa = caixaDe(regiao, largura, altura);
  if (!caixa) return;
  const x0 = Math.max(0, caixa.x0 - 2);
  const y0 = Math.max(0, caixa.y0 - 2);
  const lc = Math.min(largura - 1, caixa.x1 + 2) - x0 + 1;
  const ac = Math.min(altura - 1, caixa.y1 + 2) - y0 + 1;
  const buraco = new Uint8Array(lc * ac);
  for (let y = 0; y < ac; y++) for (let x = 0; x < lc; x++) buraco[y * lc + x] = regiao[(y + y0) * largura + x + x0] ? 1 : 0;
  const d = canaisPre(destino, largura, altura, x0, y0, lc, ac);
  const f = canaisPre(fonte, largura, altura, x0, y0, lc, ac, dx, dy);
  const diferenca = d.map((canal, k) => Float32Array.from(canal, (v, j) => v - f[k][j]));
  membrana(diferenca, buraco, lc, ac);
  const resultado = f.map((canal, k) => Float32Array.from(canal, (v, j) => v + diferenca[k][j]));
  gravar(saida, largura, x0, y0, lc, ac, resultado, (i) => regiao[i] / 255);
}

/**
 * A fonte colada sobre o destino na região, sem emenda (os pincéis de recuperação, a Correção e o Mover sensível ao
 * conteúdo); cada ponto lê a fonte `deslocamento` adiante. A fonte precisa valer também em volta da região: a emenda
 * sai da diferença entre os dois logo fora dela.
 */
export function colarSemEmenda(destino: Uint8ClampedArray, fonte: Uint8ClampedArray, largura: number, altura: number, regiao: ArrayLike<number>, deslocamento = { dx: 0, dy: 0 }): Uint8ClampedArray<ArrayBuffer> {
  const saida = new Uint8ClampedArray(destino);
  clonar(destino, fonte, largura, altura, regiao, deslocamento.dx, deslocamento.dy, saida);
  return saida;
}

/**
 * O lugar de onde copiar o buraco: entre deslocamentos em volta (de 1,1 vez o tamanho dele a `alcance` vezes), o que
 * leva o buraco inteiro para fora dele e dentro da imagem e em que o anel de 3 pixels em volta mais se parece com o
 * anel do lugar (sem a média, porque o tom é corrigido depois), com uma preferência leve pelos mais perto.
 */
export function melhorDeslocamento(dados: ArrayLike<number>, largura: number, altura: number, buraco: ArrayLike<number>, alcance = 2): { dx: number; dy: number } | null {
  const caixa = caixaDe(buraco, largura, altura);
  if (!caixa) return null;
  const lb = caixa.x1 - caixa.x0 + 1;
  const ab = caixa.y1 - caixa.y0 + 1;
  const tamanho = Math.max(lb, ab);
  // Os pixels do buraco e os do anel
  const furos: number[] = [];
  const anel: number[] = [];
  const r = 3;
  for (let y = Math.max(0, caixa.y0 - r); y <= Math.min(altura - 1, caixa.y1 + r); y++) {
    for (let x = Math.max(0, caixa.x0 - r); x <= Math.min(largura - 1, caixa.x1 + r); x++) {
      const i = y * largura + x;
      if (buraco[i]) {
        furos.push(i);
        continue;
      }
      perto: for (let yy = Math.max(0, y - r); yy <= Math.min(altura - 1, y + r); yy++) {
        for (let xx = Math.max(0, x - r); xx <= Math.min(largura - 1, x + r); xx++) {
          if (buraco[yy * largura + xx]) {
            anel.push(i);
            break perto;
          }
        }
      }
    }
  }
  const candidatos: [number, number][] = [
    [lb + 2, 0],
    [-(lb + 2), 0],
    [0, ab + 2],
    [0, -(ab + 2)],
  ];
  const passos = [1.1, 1.5, 2, 3, 4.5, 6].filter((f) => f <= Math.max(1.1, alcance));
  for (const f of passos) {
    for (let k = 0; k < 24; k++) candidatos.push([Math.round(Math.cos((k * Math.PI) / 12) * tamanho * f), Math.round(Math.sin((k * Math.PI) / 12) * tamanho * f)]);
  }
  let melhor: { dx: number; dy: number } | null = null;
  let menor = Infinity;
  for (const [dx, dy] of candidatos) {
    if (caixa.x0 + dx < 0 || caixa.y0 + dy < 0 || caixa.x1 + dx >= largura || caixa.y1 + dy >= altura) continue;
    const salto = dy * largura + dx;
    if (furos.some((i) => buraco[i + salto])) continue;
    const medias = [0, 0, 0];
    const amostras: number[] = [];
    for (const i of anel) {
      const x = (i % largura) + dx;
      const y = Math.floor(i / largura) + dy;
      if (x < 0 || y < 0 || x >= largura || y >= altura || buraco[i + salto]) continue;
      for (let c = 0; c < 3; c++) {
        const e = dados[i * 4 + c] - dados[(i + salto) * 4 + c];
        medias[c] += e;
        amostras.push(e);
      }
    }
    const n = amostras.length / 3;
    if (n < anel.length / 2) continue;
    for (let c = 0; c < 3; c++) medias[c] /= n;
    let soma = 0;
    for (let k = 0; k < amostras.length; k++) soma += (amostras[k] - medias[k % 3]) ** 2;
    const nota = (soma / n) * (1 + (0.15 * Math.hypot(dx, dy)) / tamanho);
    if (nota < menor) {
      menor = nota;
      melhor = { dx, dy };
    }
  }
  return melhor;
}

/**
 * Preenche o buraco (`buraco[i]` diferente de zero) pelo que está em volta. `dados` muda no lugar.
 * - "liso": só a membrana;
 * - "textura": a membrana com o grão (a imagem menos ela desfocada) do lugar mais parecido por perto;
 * - "remendo": o lugar mais parecido (até `alcance` vezes o tamanho do buraco) copiado sem emenda; sem lugar que
 *   sirva (um buraco grande perto das bordas), vira "textura".
 */
export function preencherBuraco(dados: Uint8ClampedArray, largura: number, altura: number, buraco: Uint8Array, { jeito = "remendo", alcance = 2 }: { jeito?: "liso" | "textura" | "remendo"; alcance?: number } = {}): void {
  const caixa = caixaDe(buraco, largura, altura);
  if (!caixa) return;
  const lugar = jeito === "liso" ? null : melhorDeslocamento(dados, largura, altura, buraco, alcance);
  if (jeito === "remendo" && lugar) {
    clonar(dados, dados, largura, altura, Uint8Array.from(buraco, (v) => (v ? 255 : 0)), lugar.dx, lugar.dy, dados);
    return;
  }
  // A membrana, num recorte com folga do tamanho do buraco
  const tamanhoDoBuraco = Math.max(caixa.x1 - caixa.x0 + 1, caixa.y1 - caixa.y0 + 1);
  const folga = Math.max(4, tamanhoDoBuraco);
  const x0 = Math.max(0, caixa.x0 - folga);
  const y0 = Math.max(0, caixa.y0 - folga);
  const lc = Math.min(largura - 1, caixa.x1 + folga) - x0 + 1;
  const ac = Math.min(altura - 1, caixa.y1 + folga) - y0 + 1;
  const local = new Uint8Array(lc * ac);
  for (let y = 0; y < ac; y++) for (let x = 0; x < lc; x++) local[y * lc + x] = buraco[(y + y0) * largura + x + x0] ? 1 : 0;
  const canais = canaisPre(dados, largura, altura, x0, y0, lc, ac);
  membrana(canais, local, lc, ac);
  if (lugar) {
    // O grão do lugar, inteiro (pixel a pixel de lugares diferentes, ele vira chuvisco)
    const vindos = canaisPre(dados, largura, altura, x0, y0, lc, ac, lugar.dx, lugar.dy);
    for (let c = 0; c < 3; c++) {
      const desfocado = desfocarCanal(vindos[c], lc, ac, 2);
      for (let j = 0; j < lc * ac; j++) if (local[j]) canais[c][j] += vindos[c][j] - desfocado[j];
    }
  }
  gravar(dados, largura, x0, y0, lc, ac, canais, (i) => (buraco[i] ? 1 : 0));
}

/**
 * Preenche cada pedaço separado do buraco (as cunhas que um corte girado deixa, por exemplo) pelo `preencherBuraco`, um
 * de cada vez, do maior para o menor (os já preenchidos servem de contexto aos seguintes). Devolve quantos eram.
 */
export function preencherBuracos(dados: Uint8ClampedArray, largura: number, altura: number, buraco: Uint8Array, opcoes: { jeito?: "liso" | "textura" | "remendo"; alcance?: number } = {}): number {
  const n = largura * altura;
  const rotulo = new Int32Array(n).fill(-1);
  const pedacos: number[][] = [];
  for (let inicio = 0; inicio < n; inicio++) {
    if (!buraco[inicio] || rotulo[inicio] >= 0) continue;
    const pedaco: number[] = [];
    const fila = [inicio];
    rotulo[inicio] = pedacos.length;
    while (fila.length) {
      const i = fila.pop()!;
      pedaco.push(i);
      const x = i % largura;
      const vizinhos = [x > 0 ? i - 1 : -1, x < largura - 1 ? i + 1 : -1, i - largura, i + largura];
      for (const j of vizinhos) {
        if (j < 0 || j >= n || !buraco[j] || rotulo[j] >= 0) continue;
        rotulo[j] = pedacos.length;
        fila.push(j);
      }
    }
    pedacos.push(pedaco);
  }
  pedacos.sort((a, b) => b.length - a.length);
  const mascara = new Uint8Array(n);
  for (const pedaco of pedacos) {
    for (const i of pedaco) mascara[i] = 1;
    preencherBuraco(dados, largura, altura, mascara, opcoes);
    for (const i of pedaco) mascara[i] = 0;
  }
  return pedacos.length;
}
