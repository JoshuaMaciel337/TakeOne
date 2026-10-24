// O Dissolver (Filtro › Dissolver, Ctrl+Shift+X; ADR 0003, onda 13.6): um campo de deslocamento, de trás para a
// frente (cada pixel do resultado lê a imagem no ponto p + D(p)), mexido pelos pincéis. Cada pincel diz para onde o
// conteúdo debaixo dele vai; o campo novo é o antigo lido nesse ponto (então os traços se somam sem rasgar), vezes a
// força da marca, que cai do centro para a borda e para no que está congelado.
import { type Interpolacao, leitor } from "./livre.ts";

export type FerramentaDoDissolver = "empurrar" | "reconstruir" | "suavizar" | "torcer" | "contrair" | "inflar" | "empurrarEsquerda" | "congelar" | "descongelar";

export type Campo = { largura: number; altura: number; dx: Float32Array; dy: Float32Array; congelado: Float32Array };
export type PincelDoDissolver = { raio: number; densidade: number; pressao: number; taxa: number };
type Imagem = { dados: ArrayLike<number>; largura: number; altura: number };

export function campoNovo(largura: number, altura: number): Campo {
  const n = largura * altura;
  return { largura, altura, dx: new Float32Array(n), dy: new Float32Array(n), congelado: new Float32Array(n) };
}

/** O peso do pincel na distância relativa t (0 no centro, 1 na borda): com mais densidade, a força chega mais à borda. */
export function pesoDoPincel(t: number, densidade: number): number {
  if (t >= 1) return 0;
  return Math.pow(1 - t * t, 1 + 4 * (1 - densidade));
}

/** O campo lido num ponto (bilinear, com a borda repetida). */
function lerCampo(dx: Float32Array, dy: Float32Array, largura: number, altura: number, x: number, y: number): [number, number] {
  const cx = Math.min(largura - 1, Math.max(0, x));
  const cy = Math.min(altura - 1, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(largura - 1, x0 + 1);
  const y1 = Math.min(altura - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const i00 = y0 * largura + x0;
  const i10 = y0 * largura + x1;
  const i01 = y1 * largura + x0;
  const i11 = y1 * largura + x1;
  const a = (1 - fx) * (1 - fy);
  const b = fx * (1 - fy);
  const c = (1 - fx) * fy;
  const d = fx * fy;
  return [dx[i00] * a + dx[i10] * b + dx[i01] * c + dx[i11] * d, dy[i00] * a + dy[i10] * b + dy[i01] * c + dy[i11] * d];
}

/**
 * Uma marca do pincel em (x, y), com o movimento (mx, my) desde a anterior (para empurrar). `inverter` é o Alt: torcer
 * para o outro lado, empurrar para a direita, descongelar com o pincel de congelar.
 */
export function marcarNoCampo(campo: Campo, ferramenta: FerramentaDoDissolver, x: number, y: number, mx: number, my: number, pincel: PincelDoDissolver, inverter = false): void {
  const { largura, altura, dx, dy, congelado } = campo;
  const r = pincel.raio;
  const x0 = Math.max(0, Math.floor(x - r));
  const x1 = Math.min(largura - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r));
  const y1 = Math.min(altura - 1, Math.ceil(y + r));
  if (x1 < x0 || y1 < y0) return;
  if (ferramenta === "congelar" || ferramenta === "descongelar") {
    const sinal = (ferramenta === "congelar") !== inverter ? 1 : -1;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const w = pesoDoPincel(Math.hypot(px - x, py - y) / r, pincel.densidade) * pincel.pressao;
        if (w <= 0) continue;
        const i = py * largura + px;
        congelado[i] = Math.min(1, Math.max(0, congelado[i] + sinal * w));
      }
    }
    return;
  }
  // Empurrar para a esquerda: perpendicular ao movimento (subindo, o conteúdo vai para a esquerda)
  let vx = mx;
  let vy = my;
  if (ferramenta === "empurrarEsquerda") {
    vx = inverter ? -my : my;
    vy = inverter ? mx : -mx;
  }
  const passo = 0.08 * pincel.taxa;
  // O que a marca lê é o campo de antes dela: copiado só na região que ela alcança (ela escreve nele)
  const margem = Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) + r * passo + 3);
  const rx0 = Math.max(0, x0 - margem);
  const ry0 = Math.max(0, y0 - margem);
  const rl = Math.min(largura - 1, x1 + margem) - rx0 + 1;
  const ra = Math.min(altura - 1, y1 + margem) - ry0 + 1;
  const antesX = new Float32Array(rl * ra);
  const antesY = new Float32Array(rl * ra);
  for (let yy = 0; yy < ra; yy++) {
    antesX.set(dx.subarray((yy + ry0) * largura + rx0, (yy + ry0) * largura + rx0 + rl), yy * rl);
    antesY.set(dy.subarray((yy + ry0) * largura + rx0, (yy + ry0) * largura + rx0 + rl), yy * rl);
  }
  const local = (px: number, py: number) => (py - ry0) * rl + (px - rx0);
  let media: [number, number] | null = null;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const i = py * largura + px;
      const s = pesoDoPincel(Math.hypot(px - x, py - y) / r, pincel.densidade) * pincel.pressao * (1 - congelado[i]);
      if (s <= 0) continue;
      const j = local(px, py);
      if (ferramenta === "reconstruir") {
        const k = Math.min(1, s * passo * 2);
        dx[i] = antesX[j] * (1 - k);
        dy[i] = antesY[j] * (1 - k);
        continue;
      }
      if (ferramenta === "suavizar") {
        // A média 3 × 3 do campo, misturada pela força
        media = [0, 0];
        let n = 0;
        for (let j2 = -1; j2 <= 1; j2++) {
          for (let k2 = -1; k2 <= 1; k2++) {
            const xx = Math.min(rx0 + rl - 1, Math.max(rx0, px + k2));
            const yy = Math.min(ry0 + ra - 1, Math.max(ry0, py + j2));
            media[0] += antesX[local(xx, yy)];
            media[1] += antesY[local(xx, yy)];
            n++;
          }
        }
        const k = Math.min(1, s * 0.5);
        dx[i] = antesX[j] + (media[0] / n - antesX[j]) * k;
        dy[i] = antesY[j] + (media[1] / n - antesY[j]) * k;
        continue;
      }
      // O ponto de onde o conteúdo vem (q): o pixel passa a mostrar o que estava em q
      let qx = px;
      let qy = py;
      if (ferramenta === "empurrar" || ferramenta === "empurrarEsquerda") {
        qx = px - s * vx;
        qy = py - s * vy;
      } else if (ferramenta === "torcer") {
        const a = (inverter ? 1 : -1) * s * passo;
        const ox = px - x;
        const oy = py - y;
        qx = x + ox * Math.cos(a) - oy * Math.sin(a);
        qy = y + ox * Math.sin(a) + oy * Math.cos(a);
      } else if (ferramenta === "contrair" || ferramenta === "inflar") {
        const k = (ferramenta === "contrair") !== inverter ? s * passo : -s * passo;
        qx = x + (px - x) * (1 + k);
        qy = y + (py - y) * (1 + k);
      }
      const [ax, ay] = lerCampo(antesX, antesY, rl, ra, qx - rx0, qy - ry0);
      dx[i] = ax + (qx - px);
      dy[i] = ay + (qy - py);
    }
  }
}

/** A imagem deformada pelo campo (do mesmo tamanho que ele). */
export function deformar(origem: Imagem, campo: Campo, interpolacao: Interpolacao = "bilinear"): Uint8ClampedArray<ArrayBuffer> {
  const { largura, altura, dx, dy } = campo;
  const saida = new Uint8ClampedArray(largura * altura * 4);
  const ler = leitor(origem, interpolacao);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      ler(x + dx[i], y + dy[i], saida, i * 4);
    }
  }
  return saida;
}

/** O campo levado a outro tamanho (a resolução cheia): lido pelo bilinear e com os deslocamentos na escala nova. */
export function campoEm(campo: Campo, largura: number, altura: number): Campo {
  const novo = campoNovo(largura, altura);
  const fx = campo.largura / largura;
  const fy = campo.altura / altura;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const [ax, ay] = lerCampo(campo.dx, campo.dy, campo.largura, campo.altura, (x + 0.5) * fx - 0.5, (y + 0.5) * fy - 0.5);
      const i = y * largura + x;
      novo.dx[i] = ax / fx;
      novo.dy[i] = ay / fy;
    }
  }
  return novo;
}

/** O campo inteiro de volta a zero (Restaurar tudo), menos o que está congelado. */
export function restaurarTudo(campo: Campo): void {
  for (let i = 0; i < campo.dx.length; i++) {
    const k = 1 - campo.congelado[i];
    campo.dx[i] *= 1 - k;
    campo.dy[i] *= 1 - k;
  }
}
