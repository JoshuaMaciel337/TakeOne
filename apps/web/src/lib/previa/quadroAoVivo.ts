// O quadro que a prévia do editor de vídeo acabou de desenhar, para o painel de escopos ler. Fica fora do estado do
// editor: a prévia desenha a cada quadro da tela enquanto toca, e só o painel, quando está aberto, quer saber disso.
let ultimo: HTMLCanvasElement | null = null;
const ouvintes = new Set<(canvas: HTMLCanvasElement) => void>();

/** A prévia avisa depois de cada desenho (o canvas guarda o desenho: `preserveDrawingBuffer`). */
export function avisarQuadroDesenhado(canvas: HTMLCanvasElement) {
  ultimo = canvas;
  for (const ouvinte of ouvintes) ouvinte(canvas);
}

/** Quem assina recebe o último quadro na hora e cada quadro novo depois. */
export function assinarQuadro(ouvinte: (canvas: HTMLCanvasElement) => void): () => void {
  ouvintes.add(ouvinte);
  if (ultimo?.isConnected) ouvinte(ultimo);
  return () => ouvintes.delete(ouvinte);
}
