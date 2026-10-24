// A caixa do texto (ADR 0003, onda 13.8): no de ponto, o que as letras ocupam com uma folga, e onde fica a origem (o
// começo da primeira linha de base) dentro dela; no de parágrafo, a caixa é a da pessoa e a origem é o canto.
import type { Disposicao } from "./layout.ts";
import type { TextoRico } from "./modelo.ts";

export function medirTexto(texto: TextoRico, disposicao: Disposicao): Pick<TextoRico, "caixa" | "origem"> {
  if (texto.modo === "paragrafo") return { caixa: texto.caixa, origem: { x: 0, y: 0 } };
  const folga = Math.max(2, Math.round(texto.estilo.tamanho * 0.12));
  // Sem tinta (o texto vazio ou só espaços), a altura da linha no cursor
  const cursor = disposicao.cursores[0] ?? { x: 0, y: 0, ascendente: texto.estilo.tamanho * 0.8, descendente: texto.estilo.tamanho * 0.2 };
  const fim = disposicao.cursores[disposicao.cursores.length - 1] ?? cursor;
  const tinta = disposicao.limites ?? { x0: Math.min(0, cursor.x), y0: cursor.y - cursor.ascendente, x1: Math.max(1, fim.x), y1: cursor.y + cursor.descendente };
  // A linha inteira entra (do começo das linhas ao fim delas), para o cursor e a seleção caberem na caixa; no vertical,
  // a linha é uma coluna em volta de baseX, de baseY para baixo
  const vertical = texto.orientacao === "vertical";
  const meia = (linha: Disposicao["linhas"][number]) => (linha.ascendente + linha.descendente) / 2;
  const x0 = Math.min(tinta.x0, ...disposicao.linhas.map((linha) => (vertical ? linha.baseX - meia(linha) : linha.baseX)));
  const x1 = Math.max(tinta.x1, ...disposicao.linhas.map((linha) => (vertical ? linha.baseX + meia(linha) : linha.baseX + linha.largura)));
  const y0 = Math.min(tinta.y0, ...disposicao.linhas.map((linha) => (vertical ? linha.baseY : linha.baseY - linha.ascendente)));
  const y1 = Math.max(tinta.y1, ...disposicao.linhas.map((linha) => (vertical ? linha.baseY + linha.largura : linha.baseY + linha.descendente)));
  return { caixa: { largura: Math.max(1, x1 - x0 + 2 * folga), altura: Math.max(1, y1 - y0 + 2 * folga) }, origem: { x: folga - x0, y: folga - y0 } };
}
