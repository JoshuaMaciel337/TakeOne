// A fonte do fontkit (MIT) do jeito que a disposição do texto pede (layout.ts): as medidas e o formatador, que diz quantas
// unidades de UTF-16 do texto cada glifo cobre.
//
// O fontkit guarda os glifos por id, com os códigos de caractere de quando foram criados, e o mesmo objeto vale para
// todas as vezes que o glifo aparece. Desenhar um glifo composto ("á" = "a" + acento) cria o "a" sem código, e daí em
// diante todo "a" voltava com zero letras: o índice do texto ficava para trás e a quebra caía no meio das palavras. Por
// isso a entrada vai com os códigos certos (uma cópia de cada glifo) e as letras saem dos glifos do formatador, que são
// de cada vez (o motor solta essa lista no fim; o `cleanup` dele é embrulhado para guardá-la antes).
import type { Fonte as FonteDoFontkit, Glifo } from "fontkit";

import type { FonteCarregada, GlifoFormatado } from "./layout.ts";

type InfoDoGlifo = { codePoints: number[] };
type Motor = { glyphInfos: InfoDoGlifo[] | null; cleanup?: () => void; ultimas?: InfoDoGlifo[] | null; embrulhado?: boolean };

function motorDe(fonte: FonteDoFontkit): Motor | null {
  try {
    return (fonte as unknown as { _layoutEngine?: { engine?: Motor } })._layoutEngine?.engine ?? null;
  } catch {
    return null;
  }
}

const unidades = (codigos: number[]) => codigos.reduce((soma, cp) => soma + (cp > 0xffff ? 2 : 1), 0);

export function adaptarFonte(fonte: FonteDoFontkit, chave: string): FonteCarregada {
  const recursos = new Set(fonte.availableFeatures ?? []);
  const os2 = fonte["OS/2"];
  const motor = motorDe(fonte);
  if (motor?.cleanup && !motor.embrulhado) {
    const limpar = motor.cleanup.bind(motor);
    motor.cleanup = () => {
      motor.ultimas = motor.glyphInfos;
      limpar();
    };
    motor.embrulhado = true;
  }
  return {
    chave,
    unidades: fonte.unitsPerEm,
    ascendente: fonte.ascent,
    descendente: fonte.descent,
    sublinhado: { posicao: fonte.underlinePosition || -fonte.unitsPerEm * 0.1, espessura: fonte.underlineThickness || fonte.unitsPerEm * 0.05 },
    tachado: { posicao: os2?.yStrikeoutPosition || fonte.unitsPerEm * 0.28, espessura: os2?.yStrikeoutSize || fonte.unitsPerEm * 0.05 },
    temRecurso: (tag) => recursos.has(tag),
    formatar(texto, pedidos) {
      const entrada: Glifo[] = [];
      for (const caractere of texto) {
        const codigo = caractere.codePointAt(0)!;
        entrada.push(Object.create(fonte.glyphForCodePoint(codigo), { codePoints: { value: [codigo] } }) as Glifo);
      }
      if (motor) motor.ultimas = null;
      const corrida = fonte.layout(entrada, pedidos);
      const infos = motor?.ultimas && motor.ultimas.length === corrida.glyphs.length ? motor.ultimas : null;
      // Sem o motor (fonte sem GSUB nem GPOS), cada caractere é um glifo
      const deCadaVez = infos ?? (corrida.glyphs.length === entrada.length ? entrada : corrida.glyphs);
      return corrida.glyphs.map((glifo, i): GlifoFormatado => {
        const posicao = corrida.positions[i];
        const b = glifo.bbox;
        const comTinta = Number.isFinite(b.minX) && Number.isFinite(b.maxX) && b.maxX > b.minX;
        return {
          id: glifo.id,
          avanco: posicao.xAdvance,
          dx: posicao.xOffset,
          dy: posicao.yOffset,
          // Unidades de UTF-16 (o índice do texto): fora do plano básico, um caractere são duas
          letras: unidades(deCadaVez[i].codePoints),
          caminho: () => glifo.path.toSVG(),
          caixa: comTinta ? { x0: b.minX, y0: b.minY, x1: b.maxX, y1: b.maxY } : { x0: 0, y0: 0, x1: 0, y1: 0 },
        };
      });
    },
  };
}
