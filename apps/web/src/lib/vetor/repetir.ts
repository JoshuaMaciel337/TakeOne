// Objetos no caminho do editor vetorial (ADR 0003, onda 13.16): as cópias de uma camada espalhadas ao longo de um
// caminho, igualmente espaçadas pelo comprimento, cada uma (se pedido) girada pela direção do caminho ali.
import { achatar } from "./contorno.ts";
import type { Subcaminho } from "./modelo.ts";

type Ponto = { x: number; y: number };

/** `n` lugares ao longo do caminho: o ponto e a direção (graus); o aberto vai da ponta à ponta, o fechado dá a volta. */
export function lugaresNoCaminho(sub: Subcaminho, n: number): (Ponto & { angulo: number })[] {
  const pontos = achatar(sub, 0.2);
  if (sub.fechado && pontos.length > 1) pontos.push({ ...pontos[0] });
  if (pontos.length < 2 || n < 1) return [];
  const acumulado = [0];
  for (let i = 1; i < pontos.length; i++) acumulado.push(acumulado[i - 1] + Math.hypot(pontos[i].x - pontos[i - 1].x, pontos[i].y - pontos[i - 1].y));
  const total = acumulado[acumulado.length - 1];
  const divisao = sub.fechado ? n : Math.max(1, n - 1);
  const saida: (Ponto & { angulo: number })[] = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const d = n === 1 && !sub.fechado ? total / 2 : (total * i) / divisao;
    // Num vértice, vale a direção de saída
    while (k < pontos.length - 2 && acumulado[k + 1] <= d) k++;
    const a = pontos[k];
    const b = pontos[k + 1];
    const trecho = acumulado[k + 1] - acumulado[k] || 1;
    const t = Math.min(1, Math.max(0, (d - acumulado[k]) / trecho));
    saida.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angulo: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI });
  }
  return saida;
}
