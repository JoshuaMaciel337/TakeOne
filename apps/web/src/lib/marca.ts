// O kit de marca do espaço: carregado uma vez e guardado no módulo, para o painel, os seletores de cor
// e as animações verem o mesmo kit sem pedir de novo.
import { useSyncExternalStore } from "react";

import { chamarApi } from "./api";
import { type Marca, MARCA_VAZIA } from "./projeto/marca";

let atual: Marca | null = null;
let pedido: Promise<void> | null = null;
const ouvintes = new Set<() => void>();

function guardar(marca: Marca) {
  atual = marca;
  for (const ouvinte of ouvintes) ouvinte();
}

function carregar() {
  pedido ??= chamarApi<Marca>("/marca")
    .then(guardar)
    .catch(() => {
      pedido = null;
    });
}

/** O kit de marca do espaço (vazio até carregar). */
export function useMarca(): Marca {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte);
      carregar();
      return () => ouvintes.delete(ouvinte);
    },
    () => atual ?? MARCA_VAZIA,
    () => MARCA_VAZIA,
  );
}

/** Troca o kit inteiro. Lança erro com a mensagem para a pessoa. */
export async function salvarMarca(marca: Marca): Promise<Marca> {
  const salvo = await chamarApi<Marca>("/marca", { metodo: "PUT", corpo: marca });
  guardar(salvo);
  return salvo;
}
