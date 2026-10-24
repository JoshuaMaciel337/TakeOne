// A caixa do texto (ADR 0003, onda 13.8): no de ponto, o que as letras ocupam com uma folga, e onde fica a origem (o
// começo da primeira linha de base) dentro dela; no de parágrafo, a caixa é a da pessoa e a origem é o canto.
import type { Disposicao } from "./layout.ts";
import type { TextoRico } from "./modelo.ts";
import { gruposDeformados } from "./contornos.ts";
import { limitesDosPoligonos } from "./deformar.ts";
import { percurso } from "./caminho.ts";

export function medirTexto(texto: TextoRico, disposicao: Disposicao): Pick<TextoRico, "caixa" | "origem"> {
  if (texto.modo === "paragrafo") return { caixa: texto.caixa, origem: { x: 0, y: 0 } };
  const folga = Math.max(2, Math.round(texto.estilo.tamanho * 0.12));
  // Deformado, a caixa é o que as letras deformadas ocupam (o cursor anda junto com elas)
  const deformados = gruposDeformados(texto, disposicao, Math.max(0.05, texto.estilo.tamanho / 400));
  // O caminho do texto também entra (para ele continuar à vista e editável dentro da caixa)
  const doCaminho = texto.caminho ? [percurso(texto.caminho).pontos] : [];
  const limites = deformados ? limitesDosPoligonos([...deformados.flatMap((grupo) => grupo.poligonos), ...doCaminho]) : null;
  if (limites) {
    const negrito = Math.max(0, ...deformados!.map((grupo) => (grupo.negrito ? grupo.em * 0.035 : 0))) / 2;
    const x0 = limites.x0 - negrito;
    const y0 = limites.y0 - negrito;
    return { caixa: { largura: Math.max(1, limites.x1 + negrito - x0 + 2 * folga), altura: Math.max(1, limites.y1 + negrito - y0 + 2 * folga) }, origem: { x: folga - x0, y: folga - y0 } };
  }
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
