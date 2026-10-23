// Os níveis de cada mídia (niveis.bin, o pico em dB a cada 10 ms, medido na ingestão). Mudam só numa nova
// ingestão: lidos uma vez por página.
import { arquivoDaMidia } from "./api";

const niveisLidos = new Map<string, Promise<Int8Array>>();

export function lerNiveis(midiaId: string): Promise<Int8Array> {
  let pedido = niveisLidos.get(midiaId);
  if (!pedido) {
    pedido = fetch(arquivoDaMidia(midiaId, "niveis.bin"), { credentials: "same-origin" })
      .then((resposta) => (resposta.ok ? resposta.arrayBuffer() : Promise.reject(new Error("Os níveis desta mídia não estão disponíveis. Envie de novo para medir."))))
      .then((dados) => new Int8Array(dados));
    pedido.catch(() => niveisLidos.delete(midiaId));
    niveisLidos.set(midiaId, pedido);
  }
  return pedido;
}
