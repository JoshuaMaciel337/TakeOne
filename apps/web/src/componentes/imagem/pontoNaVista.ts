// O ponto do ponteiro nas coordenadas de um elemento da prévia do editor de imagem, mesmo com a vista girada ou
// espelhada (Girar vista, R; Exibir › Espelhar a vista; ADR 0003, onda 13.14). A imagem na prévia gira com uma
// transformação CSS em volta do meio dela, e a caixa que o navegador dá (getBoundingClientRect) passa a ser a caixa da
// imagem girada: o ponto vem desfazendo o giro e o espelho em volta do meio, no espaço da imagem sem a transformação.

/** O elemento girado leva estes atributos: o ângulo em graus e "1" quando espelhado. */
export const ATRIBUTO_DO_GIRO = "data-vista-giro";
export const ATRIBUTO_DO_ESPELHO = "data-vista-espelho";

export function pontoNoElemento(evento: { clientX: number; clientY: number }, elemento: Element): { x: number; y: number } {
  const girado = elemento.closest(`[${ATRIBUTO_DO_GIRO}]`) as HTMLElement | null;
  const graus = Number(girado?.getAttribute(ATRIBUTO_DO_GIRO) ?? 0);
  const espelhado = girado?.getAttribute(ATRIBUTO_DO_ESPELHO) === "1";
  if (!girado || (!graus && !espelhado)) {
    const r = elemento.getBoundingClientRect();
    return { x: evento.clientX - r.left, y: evento.clientY - r.top };
  }
  // O meio não muda com o giro: dele, desfaz o giro e depois o espelho
  const caixa = girado.getBoundingClientRect();
  const dx = evento.clientX - (caixa.left + caixa.width / 2);
  const dy = evento.clientY - (caixa.top + caixa.height / 2);
  const t = (-graus * Math.PI) / 180;
  let x = dx * Math.cos(t) - dy * Math.sin(t);
  const y = dx * Math.sin(t) + dy * Math.cos(t);
  if (espelhado) x = -x;
  const local = { x: x + girado.offsetWidth / 2, y: y + girado.offsetHeight / 2 };
  // O elemento dentro da imagem (sem transformação própria): a posição dele no espaço dela
  let deslocamentoX = 0;
  let deslocamentoY = 0;
  let atual: Element | null = elemento;
  while (atual && atual !== girado) {
    if (atual instanceof HTMLElement) {
      deslocamentoX += atual.offsetLeft;
      deslocamentoY += atual.offsetTop;
      atual = atual.offsetParent;
    } else atual = atual.parentElement;
  }
  return { x: local.x - deslocamentoX, y: local.y - deslocamentoY };
}
