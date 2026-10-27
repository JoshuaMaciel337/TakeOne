// Abrir um corte no editor (ADR 0004, 14.5): o corte montado vira um projeto novo no formato da clipagem, ligado
// ao corte, e abrir de novo vai ao mesmo projeto. O "Como quer a edição" da clipagem muda as opções da montagem.
// A fala vem da clipagem (a transcrição ou o .srt da pessoa) e o rosto da busca de sempre (worker de CPU); a
// montagem é pura (montarCorte.ts).
import { contextoDasMidias } from "@/componentes/editor/contexto";
import { chamarApi, ErroApi } from "@/lib/api";
import { type Clipagem, type Corte, falaDaClipagem } from "@/lib/clipagens";
import type { Marca } from "@/lib/projeto/marca";
import type { Projeto } from "@/lib/projeto/modelo";
import { buscarRosto } from "@/lib/rosto";
import type { Midia } from "@/lib/tipos";

import { montarCorte, OPCOES_DA_MONTAGEM, type OpcoesDaMontagem } from "./montarCorte";
import { opcoesDoPlano } from "./pedidoDeEdicao";

/** A fala lida um pouco além das pontas do corte, para a última palavra não ficar de fora. */
const FOLGA_DA_FALA_S = 2;

async function projetoExiste(id: string): Promise<boolean> {
  try {
    await chamarApi(`/projetos/${id}`);
    return true;
  } catch (erro) {
    if (erro instanceof ErroApi && erro.status === 404) return false;
    throw erro;
  }
}

/**
 * O id do projeto do corte: o que já foi montado, se ainda existe, ou um novo. aoAndamento conta a etapa; com
 * ativo() falso no meio (a pessoa saiu da página), devolve null sem criar nada depois.
 */
export async function projetoDoCorte(
  clipagem: Clipagem,
  corte: Corte,
  marca: Marca,
  aoAndamento: (texto: string) => void,
  ativo: () => boolean,
  opcoes: OpcoesDaMontagem = OPCOES_DA_MONTAGEM,
): Promise<string | null> {
  if (corte.projeto_id && (await projetoExiste(corte.projeto_id))) return corte.projeto_id;

  aoAndamento("Lendo a fala do corte");
  const de = Math.max(0, corte.trechos[0].inicio - FOLGA_DA_FALA_S);
  const ate = corte.trechos.at(-1)!.fim + FOLGA_DA_FALA_S;
  const [midia, palavras] = await Promise.all([chamarApi<Midia>(`/midias/${clipagem.midia_id}`), falaDaClipagem(clipagem.id, de, ate)]);
  if (!midia.video) throw new Error("O vídeo do corte não tem imagem.");
  // O rosto só faz falta quando o formato do corte não é o do vídeo (um vídeo deitado num corte em pé)
  // O formato que o "Como quer a edição" pedir vale mais que o da página de opções
  const pedido = clipagem.plano_da_edicao?.formato;
  const formato = pedido && pedido !== "manter" ? pedido : clipagem.opcoes.formato;
  const [largura, altura] = formato.split(":").map(Number);
  const mesmoFormato = Math.abs(largura / altura - midia.video.largura / midia.video.altura) < 0.02;
  let rosto: Awaited<ReturnType<typeof buscarRosto>> = [];
  const enquadrar = clipagem.plano_da_edicao?.enquadrar ?? "manter";
  if (!mesmoFormato && (enquadrar === "manter" || enquadrar === "rosto")) {
    try {
      rosto = await buscarRosto(midia.id, aoAndamento, ativo);
    } catch {
      // Sem rosto (a busca falhou), o corte só cobre o quadro, no meio
      rosto = [];
    }
    if (!ativo() || rosto === null) return null;
  }
  if (!ativo()) return null;

  aoAndamento("Montando o corte");
  const vazio = await chamarApi<Projeto>("/projetos", { metodo: "POST", corpo: { nome: corte.titulo.slice(0, 120) || "Corte", proporcao: formato } });
  const { projeto } = montarCorte({
    projeto: vazio,
    ctx: contextoDasMidias(new Map([[midia.id, midia]])),
    midia: { id: midia.id, largura: midia.video.largura, altura: midia.video.altura },
    corte,
    palavras,
    rosto,
    enfase: corte.enfase,
    // O "Como quer a edição" da clipagem muda as opções; a cor que ele pede vale mais que a do kit
    opcoes: opcoesDoPlano(clipagem.plano_da_edicao, { ...opcoes, corDeDestaque: marca.cores[0] ?? opcoes.corDeDestaque }, marca.cores[0] ?? null),
  });
  await chamarApi<Projeto>(`/projetos/${vazio.id}`, {
    metodo: "PUT",
    corpo: { versao: vazio.versao, nome: vazio.nome, proporcao: projeto.proporcao, taxa: projeto.taxa, fundo: projeto.fundo, faixas: projeto.faixas, marcadores: [] },
  });
  await chamarApi(`/clipagens/${clipagem.id}/cortes/${corte.id}/projeto`, { metodo: "PUT", corpo: { projeto_id: vazio.id } });
  return vazio.id;
}
