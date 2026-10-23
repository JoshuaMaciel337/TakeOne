// Formas desenhadas no servidor (core/utils/forma.py): cada pedido vira uma imagem transparente da biblioteca.
import { chamarApi } from "./api";
import type { Degrade } from "./projeto/gradiente";
import type { Midia } from "./tipos";

export type TipoDeForma = "retangulo" | "arredondado" | "elipse" | "triangulo" | "estrela" | "seta" | "linha" | "balao" | "coracao";

/** O pedido de uma forma. Sem `cor`, ela é vazada e precisa de contorno. */
export type PedidoDeForma = {
  tipo: TipoDeForma;
  cor: string | null;
  contorno_cor: string;
  contorno: number;
  proporcao: number | null;
  /** O preenchimento em degradê no lugar da cor (lib/projeto/gradiente.ts); a forma vazada não tem. */
  degrade?: Degrade | null;
};

export const FORMAS: { tipo: TipoDeForma; nome: string; estica: boolean }[] = [
  { tipo: "retangulo", nome: "Retângulo", estica: true },
  { tipo: "arredondado", nome: "Arredondado", estica: true },
  { tipo: "elipse", nome: "Elipse", estica: true },
  { tipo: "triangulo", nome: "Triângulo", estica: false },
  { tipo: "estrela", nome: "Estrela", estica: false },
  { tipo: "seta", nome: "Seta", estica: true },
  { tipo: "linha", nome: "Linha", estica: true },
  { tipo: "balao", nome: "Balão de fala", estica: true },
  { tipo: "coracao", nome: "Coração", estica: false },
];

/** A forma pronta na biblioteca (o mesmo pedido devolve a mesma mídia). Lança erro com a mensagem para a pessoa. */
export function criarForma(pedido: PedidoDeForma): Promise<Midia> {
  return chamarApi<Midia>("/elementos/formas", { metodo: "POST", corpo: pedido });
}
