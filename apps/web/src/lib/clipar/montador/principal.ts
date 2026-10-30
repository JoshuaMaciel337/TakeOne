// A montagem dos cortes fora do navegador (ADR 0004, decisão 1 e 14.9): o worker "montagem" empacota este arquivo
// num só (esbuild, na imagem do worker) e roda pelo Deno, com a rede presa à API. É o mesmo código do "Montar e abrir
// no editor" (abrirCorte.ts), falando com a API por uma chave de acesso temporária do dono do pedido.
//
// O pedido chega pela entrada padrão, em JSON (a chave não aparece na lista de processos):
//   { endereco, chave, clipagem_id, cortes: [ids], exportar, resolucao }
// e cada passo sai numa linha JSON na saída padrão:
//   { evento: "etapa", corte, texto }            o que a montagem do corte está fazendo
//   { evento: "montado", corte, projeto_id }     o projeto do corte está salvo
//   { evento: "exportado", corte, exportacao_id } o vídeo entrou na fila do render
//   { evento: "erro", corte, mensagem }          este corte não saiu (os outros seguem)
import { chamarApi, configurarApi } from "@/lib/api";
import type { Clipagem } from "@/lib/clipagens";
import type { Marca } from "@/lib/projeto/marca";

import { projetoDoCorte } from "../abrirCorte";

declare const Deno: { stdin: { readable: ReadableStream<Uint8Array> }; exit(codigo: number): never };

type Pedido = { endereco: string; chave: string; clipagem_id: string; cortes: string[]; exportar: boolean; resolucao?: string };

function contar(evento: Record<string, unknown>) {
  console.log(JSON.stringify(evento));
}

async function principal() {
  const pedido = JSON.parse(await new Response(Deno.stdin.readable).text()) as Pedido;
  configurarApi({ endereco: pedido.endereco, chave: pedido.chave });
  const [clipagem, marca] = await Promise.all([chamarApi<Clipagem>(`/clipagens/${pedido.clipagem_id}`), chamarApi<Marca>("/marca")]);
  for (const id of pedido.cortes) {
    const corte = clipagem.cortes.find((item) => item.id === id);
    if (!corte) {
      contar({ evento: "erro", corte: id, mensagem: "O corte saiu da lista." });
      continue;
    }
    try {
      const projetoId = await projetoDoCorte(
        clipagem,
        corte,
        marca,
        (texto) => contar({ evento: "etapa", corte: id, texto }),
        () => true,
      );
      if (!projetoId) throw new Error("A montagem parou no meio.");
      contar({ evento: "montado", corte: id, projeto_id: projetoId });
      if (pedido.exportar) {
        contar({ evento: "etapa", corte: id, texto: "Pondo na fila do vídeo" });
        const exportacao = await chamarApi<{ id: string }>("/exportacoes", {
          metodo: "POST",
          corpo: { projeto_id: projetoId, resolucao: pedido.resolucao ?? "1080p", formato: "mp4" },
        });
        contar({ evento: "exportado", corte: id, exportacao_id: exportacao.id });
      }
    } catch (erro) {
      contar({ evento: "erro", corte: id, mensagem: erro instanceof Error ? erro.message : "A montagem falhou." });
    }
  }
}

principal().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : String(erro));
  Deno.exit(1);
});
