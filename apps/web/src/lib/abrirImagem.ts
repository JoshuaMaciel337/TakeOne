// Arquivo › Abrir e Colocar incorporado do editor de imagem (ADR 0003, onda 13.13): a imagem do computador sobe pelo
// envio de sempre (tus), espera a ingestão e vira um documento (do tamanho dela) ou uma camada.
import { chamarApi } from "./api";
import type { Midia } from "./tipos";

/** Sobe o arquivo e espera a mídia ficar pronta (ou dar erro): a mídia pronta. */
export async function enviarEEsperar(iniciar: (arquivos: File[], aoCriar?: (midiaId: string) => void) => void, arquivo: File, limiteMs = 10 * 60_000): Promise<Midia> {
  const midiaId = await new Promise<string>((pronto, falhou) => {
    const espera = window.setTimeout(() => falhou(new Error("O envio não começou. Tente de novo.")), 60_000);
    iniciar([arquivo], (id) => {
      window.clearTimeout(espera);
      pronto(id);
    });
  });
  const inicio = Date.now();
  for (;;) {
    const midia = await chamarApi<Midia>(`/midias/${midiaId}`);
    if (midia.status === "pronta") return midia;
    if (midia.status === "erro") throw new Error(midia.erro ?? "A imagem não pôde ser lida.");
    if (Date.now() - inicio > limiteMs) throw new Error("A imagem demorou demais para ficar pronta.");
    await new Promise((proximo) => setTimeout(proximo, 800));
  }
}

/** A imagem pronta vira um documento do tamanho dela: o id do projeto novo. */
export async function documentoDaImagem(midiaId: string): Promise<string> {
  return (await chamarApi<{ id: string }>("/projetos/da-imagem", { metodo: "POST", corpo: { midia_id: midiaId } })).id;
}

export type ImagemRecente = { id: string; nome: string };

/** As imagens mexidas há menos tempo (Abrir recentes), sem a aberta. */
export async function imagensRecentes(sem: string | null, quantas = 8): Promise<ImagemRecente[]> {
  const lista = await chamarApi<{ id: string; nome: string; tipo?: string }[]>("/projetos?limite=40");
  return lista.filter((projeto) => projeto.tipo === "imagem" && projeto.id !== sem).slice(0, quantas).map(({ id, nome }) => ({ id, nome }));
}
