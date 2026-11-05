/**
 * Quem um clique (ou toque) na prévia escolhe. `sob` são as camadas que ficam sob o ponto, da de cima para a
 * de baixo. Com o mouse, a de cima. No toque, tocar de novo numa camada escolhida passa à de baixo dela (e
 * volta à de cima depois da última): é o jeito de chegar a um vídeo coberto por uma animação ou um adesivo
 * que ocupam o quadro inteiro.
 */
export function escolhaNoPonto(sob: readonly string[], escolhida: string | null, toque: boolean): string | null {
  if (!sob.length) return null;
  const posicao = escolhida ? sob.indexOf(escolhida) : -1;
  if (toque && posicao >= 0) return sob[(posicao + 1) % sob.length];
  return sob[0];
}
