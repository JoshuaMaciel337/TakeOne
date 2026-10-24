// Texto de ponto em texto de parágrafo e de volta (ADR 0003, onda 13.8), com as letras no mesmo lugar: o começo da
// primeira linha fica onde estava. O de parágrafo vira de ponto com uma quebra no fim de cada linha que a caixa quebrou
// (com hífen quando a quebra caiu no meio de uma palavra); o de ponto vira uma caixa do tamanho das linhas dele.
import { disporTexto, type Fontes } from "./layout.ts";
import { medirTexto } from "./medida.ts";
import { substituir, textoCorrido, type TextoRico } from "./modelo.ts";

const LETRA = /[\p{L}\p{N}]/u;

/** O texto no outro modo e o deslocamento da caixa (o ponto da caixa antiga vira ele mais `deslocamento` na nova). */
export function converterModo(texto: TextoRico, fontes: Fontes): { texto: TextoRico; deslocamento: { x: number; y: number } } {
  const antes = disporTexto(texto, fontes);
  const vertical = texto.orientacao === "vertical";
  let novo: TextoRico;
  if (texto.modo === "paragrafo") {
    // As quebras da caixa viram quebras de verdade, do fim para o começo (os índices de antes continuam valendo)
    const corrido = textoCorrido(texto);
    novo = { ...texto, modo: "ponto" };
    for (let i = antes.linhas.length - 2; i >= 0; i--) {
      const linha = antes.linhas[i];
      if (antes.linhas[i + 1].inicio !== linha.fim) continue;
      let fim = linha.fim;
      while (fim > linha.inicio && /\s/.test(corrido[fim - 1])) fim--;
      const noMeio = LETRA.test(corrido[linha.fim - 1] ?? "") && LETRA.test(corrido[linha.fim] ?? "");
      novo = substituir(novo, fim, linha.fim, noMeio ? "-\n" : "\n");
    }
    novo = { ...novo, ...medirTexto(novo, disporTexto(novo, fontes)) };
  } else {
    // A caixa cabe a linha mais longa (com um pixel de folga, para a quebra não mudar) e a altura das linhas
    const comprimento = Math.max(1, ...antes.linhas.map((linha) => linha.largura)) + texto.paragrafo.recuoInicio + texto.paragrafo.recuoFim + 1;
    novo = { ...texto, modo: "paragrafo", origem: { x: 0, y: 0 }, caixa: vertical ? { largura: texto.caixa.largura, altura: comprimento } : { largura: comprimento, altura: texto.caixa.altura } };
  }
  const depois = disporTexto(novo, fontes);
  const inicio = (d: typeof antes, t: TextoRico) => (d.linhas[0] ? { x: d.linhas[0].baseX + t.origem.x, y: d.linhas[0].baseY + t.origem.y } : { x: t.origem.x, y: t.origem.y });
  const a = inicio(antes, texto);
  const b = inicio(depois, novo);
  return { texto: novo, deslocamento: { x: b.x - a.x, y: b.y - a.y } };
}
