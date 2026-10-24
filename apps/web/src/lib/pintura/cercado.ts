// O traço que cerca um objeto (a ferramenta Remover, ADR 0003, onda 13.5): quando o traço volta perto de onde começou
// e o que ele fecha tem área de verdade, o miolo entra junto, sem precisar pintar por cima de tudo.

type Ponto = { x: number; y: number };

/** A área do polígono (fórmula do laço de sapato), sem sinal. */
export function areaDoPoligono(pontos: Ponto[]): number {
  let soma = 0;
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    soma += a.x * b.y - b.x * a.y;
  }
  return Math.abs(soma) / 2;
}

/**
 * O traço cerca alguma coisa: o fim está a até 1,5 largura do traço (ou 15% do comprimento) do começo, e a área
 * fechada passa de quatro vezes a do quadrado da largura (um rabisco de ida e volta não fecha nada).
 */
export function cercaUmObjeto(pontos: Ponto[], larguraDoTraco: number): boolean {
  if (pontos.length < 4) return false;
  let comprimento = 0;
  for (let i = 1; i < pontos.length; i++) comprimento += Math.hypot(pontos[i].x - pontos[i - 1].x, pontos[i].y - pontos[i - 1].y);
  const inicio = pontos[0];
  const fim = pontos[pontos.length - 1];
  if (Math.hypot(fim.x - inicio.x, fim.y - inicio.y) > Math.max(1.5 * larguraDoTraco, 0.15 * comprimento)) return false;
  return areaDoPoligono(pontos) > 4 * larguraDoTraco * larguraDoTraco;
}
