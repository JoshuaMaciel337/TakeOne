// O que muda a cada movimento do mouse ou da rolagem na prévia do editor de imagem (ADR 0003, onda 13.14): o ponto do
// ponteiro e o retângulo visível, em pixels do documento. Ficam fora do estado do editor, num armazém pequeno que só
// os painéis Informações e Navegador assinam: guardados no editor, cada movimento desenharia a página inteira de novo.
import { useSyncExternalStore } from "react";

type Ponto = { x: number; y: number };
type Retangulo = { x: number; y: number; largura: number; altura: number };
export type VistaAoVivo = { ponteiro: Ponto | null; visivel: Retangulo | null };

let estado: VistaAoVivo = { ponteiro: null, visivel: null };
const ouvintes = new Set<() => void>();
let rolagem: ((x: number, y: number) => void) | null = null;

const igual = (a: Retangulo | Ponto | null, b: Retangulo | Ponto | null) => JSON.stringify(a) === JSON.stringify(b);

export function mudarVistaAoVivo(parcial: Partial<VistaAoVivo>) {
  const novo = { ...estado, ...parcial };
  if (igual(novo.ponteiro, estado.ponteiro) && igual(novo.visivel, estado.visivel)) return;
  estado = novo;
  for (const ouvinte of ouvintes) ouvinte();
}

export function useVistaAoVivo(): VistaAoVivo {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    () => estado,
    () => estado,
  );
}

/** A prévia registra como pôr um ponto do documento no meio da área (o Navegador arrasta o retângulo). */
export function registrarRolagem(rolar: ((x: number, y: number) => void) | null) {
  rolagem = rolar;
}

export function rolarVistaPara(x: number, y: number) {
  rolagem?.(x, y);
}
