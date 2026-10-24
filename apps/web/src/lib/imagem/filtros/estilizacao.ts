// Filtro › Estilização e Vídeo (ADR 0003, onda 13.11): difusão, entalhe, extrusão, encontrar bordas, pintura a óleo,
// solarizar, ladrilhos, traçar contorno e vento; desentrelaçar e cores NTSC.
import { type ContextoDoFiltro, dePlanos, desfocarPlano, type ImagemDoFiltro, limitar, lumaDe, paraPlanos, type Planos, porPixelReto, type Rgb, sorteio } from "./comum.ts";
import { kuwahara } from "./pixelizacao.ts";

const noDocumento = (x: number, y: number, ctx: ContextoDoFiltro) => [Math.floor(ctx.origem.x + (x + 0.5) / ctx.escala), Math.floor(ctx.origem.y + (y + 0.5) / ctx.escala)];

/** A luz reta de cada pixel (0 a 1) e o alfa. */
function lumas(imagem: ImagemDoFiltro): { luz: Float32Array; alfa: Float32Array } {
  const n = imagem.largura * imagem.altura;
  const luz = new Float32Array(n);
  const alfa = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const a = imagem.dados[i + 3] / 255;
    alfa[p] = a;
    luz[p] = a > 0 ? lumaDe(imagem.dados[i], imagem.dados[i + 1], imagem.dados[i + 2]) / 255 / a : 0;
  }
  return { luz, alfa };
}

/** Difusão: cada pixel troca com um vizinho sorteado (só se mais escuro, só se mais claro, ou ao longo das bordas). */
export function difusao(imagem: ImagemDoFiltro, modo: string, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const { luz } = lumas(imagem);
  const dados = imagem.dados.slice();
  const alcance = Math.max(1, Math.round(ctx.escala));
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const [dx, dy] = noDocumento(x, y, ctx);
      let ox = Math.round((sorteio(dx, dy, 30) * 2 - 1) * alcance);
      let oy = Math.round((sorteio(dx, dy, 31) * 2 - 1) * alcance);
      if (modo === "anisotropico") {
        // Ao longo da borda: o sorteio anda perpendicular ao gradiente
        const p = y * largura + x;
        const gx = (luz[Math.min(p + 1, luz.length - 1)] ?? 0) - (luz[Math.max(p - 1, 0)] ?? 0);
        const gy = (luz[Math.min(p + largura, luz.length - 1)] ?? 0) - (luz[Math.max(p - largura, 0)] ?? 0);
        if (Math.abs(gx) > Math.abs(gy)) ox = 0;
        else oy = 0;
      }
      const sx = Math.min(largura - 1, Math.max(0, x + ox));
      const sy = Math.min(altura - 1, Math.max(0, y + oy));
      const p = y * largura + x;
      const q = sy * largura + sx;
      if (modo === "escurecer" && luz[q] >= luz[p]) continue;
      if (modo === "clarear" && luz[q] <= luz[p]) continue;
      for (let k = 0; k < 4; k++) dados[p * 4 + k] = imagem.dados[q * 4 + k];
    }
  }
  return { largura, altura, dados };
}

/** Entalhe: o cinza do meio mais a diferença da luz no ângulo (a altura em pixels), vezes a quantidade. */
export function entalhe(imagem: ImagemDoFiltro, angulo: number, altura_: number, quantidade: number): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const { luz, alfa } = lumas(imagem);
  const a = (angulo * Math.PI) / 180;
  const dx = Math.cos(a) * altura_;
  const dy = -Math.sin(a) * altura_;
  const ler = (x: number, y: number) => luz[Math.min(altura - 1, Math.max(0, Math.round(y))) * largura + Math.min(largura - 1, Math.max(0, Math.round(x)))];
  const dados = new Uint8ClampedArray(imagem.dados.length);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const p = y * largura + x;
      const v = limitar(0.5 + (ler(x + dx / 2, y + dy / 2) - ler(x - dx / 2, y - dy / 2)) * (quantidade / 100));
      for (let k = 0; k < 3; k++) dados[p * 4 + k] = Math.round(v * alfa[p] * 255);
      dados[p * 4 + 3] = Math.round(alfa[p] * 255);
    }
  }
  return { largura, altura, dados };
}

/** Encontrar bordas: o branco com as bordas de cada canal desenhadas em cor (o oposto do gradiente). */
export function encontrarBordas(imagem: ImagemDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const reta = porPixelReto(imagem, (r, g, b) => [r, g, b]);
  const ler = (x: number, y: number, k: number) => {
    const i = (Math.min(altura - 1, Math.max(0, y)) * largura + Math.min(largura - 1, Math.max(0, x))) * 4;
    return reta.dados[i + 3] ? reta.dados[i + k] / reta.dados[i + 3] : 0;
  };
  return porPixelReto(imagem, (_r, _g, _b, x, y) =>
    [0, 1, 2].map((k) => {
      const gx = ler(x + 1, y - 1, k) + 2 * ler(x + 1, y, k) + ler(x + 1, y + 1, k) - ler(x - 1, y - 1, k) - 2 * ler(x - 1, y, k) - ler(x - 1, y + 1, k);
      const gy = ler(x - 1, y + 1, k) + 2 * ler(x, y + 1, k) + ler(x + 1, y + 1, k) - ler(x - 1, y - 1, k) - 2 * ler(x, y - 1, k) - ler(x + 1, y - 1, k);
      return 1 - Math.min(1, Math.hypot(gx, gy) / 2);
    }) as Rgb,
  );
}

/** Solarizar: os tons acima do meio viram o negativo (a meia exposição de lá). */
export function solarizar(imagem: ImagemDoFiltro): ImagemDoFiltro {
  return porPixelReto(imagem, (r, g, b) => [r, g, b].map((v) => (v > 0.5 ? 1 - v : v)) as Rgb);
}

/** Traçar contorno: no branco, cada canal desenha onde a luz cruza o nível (pelo lado de baixo ou de cima). */
export function tracarContorno(imagem: ImagemDoFiltro, nivel: number, borda: string): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const reta = porPixelReto(imagem, (r, g, b) => [r, g, b]);
  const valor = (x: number, y: number, k: number) => {
    const i = (y * largura + x) * 4;
    return reta.dados[i + 3] ? (reta.dados[i + k] * 255) / reta.dados[i + 3] : 0;
  };
  const n = nivel;
  return porPixelReto(imagem, (_r, _g, _b, x, y) =>
    [0, 1, 2].map((k) => {
      const v = valor(x, y, k);
      const lado = borda === "superior" ? v >= n : v < n;
      if (!lado) return 1;
      // Na borda: algum vizinho do outro lado do nível
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= largura || yy >= altura) continue;
        const w = valor(xx, yy, k);
        if (borda === "superior" ? w < n : w >= n) return 0;
      }
      return 1;
    }) as Rgb,
  );
}

/** Vento: os claros deixam um rastro para o lado (a ventania mais longo, a rajada irregular). */
export function vento(imagem: ImagemDoFiltro, metodo: string, direcao: string, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const planos = paraPlanos(imagem);
  const { luz } = lumas(imagem);
  const comprimento = ({ vento: 20, ventania: 50, rajada: 35 }[metodo] ?? 20) * ctx.escala;
  const saida = planos.map((plano) => plano.slice()) as Planos;
  const passo = direcao === "esquerda" ? -1 : 1;
  for (let y = 0; y < altura; y++) {
    const [, dy] = noDocumento(0, y, ctx);
    let rastro = [0, 0, 0, 0];
    let forca = 0;
    for (let i = 0; i < largura; i++) {
      // O vento vem de um lado: anda no sentido contrário para levar o claro até o outro
      const x = passo > 0 ? i : largura - 1 - i;
      const p = y * largura + x;
      const decai = metodo === "rajada" ? 1 - 1 / (comprimento * (0.3 + sorteio(dy, Math.floor(x / 8), 40))) : 1 - 1 / comprimento;
      forca *= decai;
      if (luz[p] > 0.55 && luz[p] * planos[3][p] > forca) {
        forca = luz[p] * planos[3][p];
        rastro = [planos[0][p], planos[1][p], planos[2][p], planos[3][p]];
      }
      if (forca > 0.02) {
        const t = forca / Math.max(1e-6, rastro[3] || 1);
        for (let k = 0; k < 4; k++) saida[k][p] = Math.max(saida[k][p], rastro[k] * t);
      }
    }
  }
  return dePlanos(saida, largura, altura);
}

/** Ladrilhos: a imagem cortada em quadrados, cada um deslocado um pouco ao acaso; o vão com a cor escolhida. */
export function ladrilhos(imagem: ImagemDoFiltro, numero: number, deslocamentoMaximo: number, vao: string, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const lado = Math.max(2, Math.min(ctx.documento.largura, ctx.documento.altura) / Math.max(1, numero));
  const dados = new Uint8ClampedArray(imagem.dados.length);
  // O vão: o fundo, o primeiro plano, a imagem invertida ou a imagem como está
  for (let p = 0, i = 0; p < largura * altura; p++, i += 4) {
    const a = imagem.dados[i + 3];
    if (vao === "imagem") for (let k = 0; k < 4; k++) dados[i + k] = imagem.dados[i + k];
    else if (vao === "invertida") {
      for (let k = 0; k < 3; k++) dados[i + k] = a - imagem.dados[i + k];
      dados[i + 3] = a;
    } else {
      const cor = vao === "primeiro" ? ctx.primeiroPlano : ctx.fundo;
      for (let k = 0; k < 3; k++) dados[i + k] = Math.round(cor[k] * a);
      dados[i + 3] = a;
    }
  }
  const maximo = (deslocamentoMaximo / 100) * lado;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const [dx, dy] = [ctx.origem.x + (x + 0.5) / ctx.escala, ctx.origem.y + (y + 0.5) / ctx.escala];
      const i = Math.floor(dx / lado);
      const j = Math.floor(dy / lado);
      const ox = (sorteio(i, j, 50) * 2 - 1) * maximo;
      const oy = (sorteio(i, j, 51) * 2 - 1) * maximo;
      // O pixel do ladrilho (i, j) deslocado: lê de onde ele estava, se ainda está no mesmo ladrilho
      const sx = dx - ox;
      const sy = dy - oy;
      if (Math.floor(sx / lado) !== i || Math.floor(sy / lado) !== j) continue;
      const fx = Math.round((sx - ctx.origem.x) * ctx.escala - 0.5);
      const fy = Math.round((sy - ctx.origem.y) * ctx.escala - 0.5);
      if (fx < 0 || fy < 0 || fx >= largura || fy >= altura) continue;
      const de = (fy * largura + fx) * 4;
      const para = (y * largura + x) * 4;
      for (let k = 0; k < 4; k++) dados[para + k] = imagem.dados[de + k];
    }
  }
  return { largura, altura, dados };
}

/** Extrusão: blocos (a frente da cor da célula e os lados sombreados) ou pirâmides (quatro faces com luzes diferentes). */
export function extrusao(imagem: ImagemDoFiltro, tipo: string, tamanho: number, profundidade: number, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const planos = paraPlanos(imagem);
  // A cor de cada célula (a média dela)
  const somas = new Map<string, number[]>();
  const celulaDe = (x: number, y: number) => {
    const dx = ctx.origem.x + (x + 0.5) / ctx.escala;
    const dy = ctx.origem.y + (y + 0.5) / ctx.escala;
    return { i: Math.floor(dx / tamanho), j: Math.floor(dy / tamanho), u: (dx / tamanho) % 1, v: (dy / tamanho) % 1 };
  };
  for (let y = 0; y < altura; y++)
    for (let x = 0; x < largura; x++) {
      const c = celulaDe(x, y);
      const chave = `${c.i},${c.j}`;
      const s = somas.get(chave) ?? [0, 0, 0, 0, 0];
      const p = y * largura + x;
      for (let k = 0; k < 4; k++) s[k] += planos[k][p];
      s[4]++;
      somas.set(chave, s);
    }
  const saida = [new Float32Array(largura * altura), new Float32Array(largura * altura), new Float32Array(largura * altura), new Float32Array(largura * altura)] as Planos;
  const borda = limitar(profundidade / 100, 0.05, 0.45);
  for (let y = 0; y < altura; y++)
    for (let x = 0; x < largura; x++) {
      const c = celulaDe(x, y);
      const s = somas.get(`${c.i},${c.j}`)!;
      const u = (c.u + 1) % 1;
      const v = (c.v + 1) % 1;
      let luz = 1;
      if (tipo === "piramides") {
        // A face pela diagonal mais perto: em cima clara, embaixo escura, os lados no meio
        const du = u - 0.5;
        const dv = v - 0.5;
        luz = Math.abs(du) > Math.abs(dv) ? (du > 0 ? 0.8 : 1.15) : dv > 0 ? 0.65 : 1.3;
      } else if (u < borda || v < borda || u > 1 - borda || v > 1 - borda) {
        luz = v < borda ? 1.3 : u < borda ? 1.15 : u > 1 - borda ? 0.8 : 0.65;
      }
      const p = y * largura + x;
      const a = s[3] / s[4];
      for (let k = 0; k < 3; k++) saida[k][p] = Math.min(a, (s[k] / s[4]) * luz);
      saida[3][p] = a;
    }
  return dePlanos(saida, largura, altura);
}

/** Pintura a óleo: as facetas do Kuwahara (a estilização), as cerdas pela luz desfocada na direção das bordas e a luz do relevo. */
export function pinturaAOleo(imagem: ImagemDoFiltro, estilizacao: number, limpeza: number, escala: number, cerdas: number, angulo: number, brilho: number, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  // O tamanho da pincelada: a escala dá o pincel (1 a 41 pixels) e a estilização, o quanto ele alisa
  const base = kuwahara(imagem, Math.max(1, (1 + 4 * escala) * (estilizacao / 2.5) * ctx.escala));
  const { luz, alfa } = lumas(base);
  // O relevo: a luz suavizada pela limpeza e iluminada no ângulo
  const suave = desfocarPlano(luz, largura, altura, Math.max(0.5, (limpeza / 10) * 3 * ctx.escala));
  const a = (angulo * Math.PI) / 180;
  const lx = Math.cos(a);
  const ly = -Math.sin(a);
  const dados = base.dados.slice();
  for (let y = 1; y < altura - 1; y++) {
    for (let x = 1; x < largura - 1; x++) {
      const p = y * largura + x;
      if (!alfa[p]) continue;
      const gx = suave[p + 1] - suave[p - 1];
      const gy = suave[p + largura] - suave[p - largura];
      const [dx, dy] = noDocumento(x, y, ctx);
      const cerda = (sorteio(Math.floor(dx * 0.3 + dy * 0.05), Math.floor(dy * 0.3), 60) - 0.5) * (cerdas / 10) * 0.12;
      const sombra = 1 + (gx * lx + gy * ly) * (brilho / 10) * 6 + cerda;
      for (let k = 0; k < 3; k++) dados[p * 4 + k] = Math.round(Math.min(dados[p * 4 + 3], dados[p * 4 + k] * sombra));
    }
  }
  return { largura, altura, dados };
}

/** Desentrelaçar: as linhas pares (ou ímpares) saem e voltam copiadas da vizinha ou pela média das duas. */
export function desentrelacar(imagem: ImagemDoFiltro, eliminar: string, criar: string): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const dados = imagem.dados.slice();
  const tirar = eliminar === "pares" ? 0 : 1;
  for (let y = tirar; y < altura; y += 2) {
    const acima = y - 1 >= 0 ? y - 1 : y + 1;
    const abaixo = y + 1 < altura ? y + 1 : y - 1;
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4;
      for (let k = 0; k < 4; k++) {
        const a = imagem.dados[(acima * largura + x) * 4 + k];
        const b = imagem.dados[(abaixo * largura + x) * 4 + k];
        dados[i + k] = criar === "interpolacao" ? Math.round((a + b) / 2) : a;
      }
    }
  }
  return { largura, altura, dados };
}

/** Cores NTSC: a cor que a TV analógica não mostra (luz mais cor passando do branco) perde saturação até caber. */
export function coresNtsc(imagem: ImagemDoFiltro): ImagemDoFiltro {
  return porPixelReto(imagem, (r, g, b) => {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const i = 0.596 * r - 0.274 * g - 0.322 * b;
    const q = 0.211 * r - 0.523 * g + 0.312 * b;
    const croma = Math.hypot(i, q);
    // O sinal composto (luz ± croma) fica entre -0,2 e 1,2 (o limite de lá, em fração)
    const limite = Math.min(1.2 - y, y + 0.2);
    const f = croma > limite && croma > 0 ? limite / croma : 1;
    const i2 = i * f;
    const q2 = q * f;
    return [limitar(y + 0.956 * i2 + 0.621 * q2), limitar(y - 0.272 * i2 - 0.647 * q2), limitar(y - 1.106 * i2 + 1.703 * q2)];
  });
}
