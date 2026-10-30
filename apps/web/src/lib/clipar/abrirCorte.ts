// Abrir um corte no editor (ADR 0004, 14.5): o corte montado vira um projeto novo no formato da clipagem, ligado
// ao corte, e abrir de novo vai ao mesmo projeto. O modelo de corte (o do corte, o da clipagem ou o padrão, 14.6)
// dá as opções da montagem, e o "Como quer a edição" da clipagem muda o que pedir. A fala vem da clipagem (a
// transcrição ou o .srt da pessoa) e o rosto da busca de sempre (worker de CPU); a montagem é pura
// (montarCorte.ts). O que espera mídias novas (a legenda animada, as partes de pregação, a chamada, o logo e a
// música) vem depois, antes de salvar o projeto.
import { contextoDasMidias } from "@/componentes/editor/contexto";
import { chamarApi, ErroApi } from "@/lib/api";
import { type Clipagem, type Corte, falaDaClipagem } from "@/lib/clipagens";
import { falaDosClipes, palavrasDaLinha } from "@/lib/projeto/fala";
import type { Marca } from "@/lib/projeto/marca";
import type { Projeto } from "@/lib/projeto/modelo";
import { buscarRosto } from "@/lib/rosto";
import type { Midia } from "@/lib/tipos";

import { aplicarLegendaEPartes } from "./aplicarPregacao";
import { extrasDoModelo } from "./extrasDoModelo";
import { modeloDasOpcoes, opcoesDoModelo, partesDoModelo, receitaValida } from "./modelosDeCorte";
import { montarCorte, OPCOES_DA_MONTAGEM } from "./montarCorte";
import { frasesDaLinha, legendaAnimadaDoPlano, opcoesDoPlano, partesDoPlano } from "./pedidoDeEdicao";

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

/** O modelo que vale para o corte: o aplicado só a ele, o escolhido na clipagem ou o padrão. */
export function modeloDoCorte(clipagem: Clipagem, corte: Corte) {
  return corte.modelo_corte ? { ...corte.modelo_corte, receita: receitaValida(corte.modelo_corte.receita) } : modeloDasOpcoes(clipagem.opcoes);
}

/**
 * O id do projeto do corte: o que já foi montado, se ainda existe, ou um novo. Com `refazer`, o corte é montado de
 * novo dentro do projeto que ele já tem (o modelo aplicado depois). aoAndamento conta a etapa; com ativo() falso no
 * meio (a pessoa saiu da página), devolve null sem criar nada depois.
 */
export async function projetoDoCorte(
  clipagem: Clipagem,
  corte: Corte,
  marca: Marca,
  aoAndamento: (texto: string) => void,
  ativo: () => boolean,
  refazer = false,
): Promise<string | null> {
  const existente = corte.projeto_id && (await projetoExiste(corte.projeto_id)) ? corte.projeto_id : null;
  if (existente && !refazer) return existente;

  aoAndamento("Lendo a fala do corte");
  const de = Math.max(0, corte.trechos[0].inicio - FOLGA_DA_FALA_S);
  const ate = corte.trechos.at(-1)!.fim + FOLGA_DA_FALA_S;
  const [midia, palavras] = await Promise.all([chamarApi<Midia>(`/midias/${clipagem.midia_id}`), falaDaClipagem(clipagem.id, de, ate)]);
  if (!midia.video) throw new Error("O vídeo do corte não tem imagem.");
  const { receita } = modeloDoCorte(clipagem, corte);
  const plano = clipagem.plano_da_edicao;
  const corDaMarca = marca.cores[0] ?? null;
  // O modelo dá as opções; o "Como quer a edição" da clipagem muda o que pedir (a cor que ele pede vale mais que a do kit)
  const opcoes = opcoesDoPlano(plano, opcoesDoModelo(receita, corDaMarca ?? OPCOES_DA_MONTAGEM.corDeDestaque), corDaMarca);
  // O formato que o "Como quer a edição" pedir vale mais que o da página de opções
  const formato = plano?.formato && plano.formato !== "manter" ? plano.formato : clipagem.opcoes.formato;
  const [largura, altura] = formato.split(":").map(Number);
  // O rosto só faz falta quando o formato do corte não é o do vídeo (um vídeo deitado num corte em pé)
  const mesmoFormato = Math.abs(largura / altura - midia.video.largura / midia.video.altura) < 0.02;
  let rosto: Awaited<ReturnType<typeof buscarRosto>> = [];
  if (!mesmoFormato && (opcoes.enquadrar ?? "rosto") === "rosto") {
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
  const vazio = existente
    ? await chamarApi<Projeto>(`/projetos/${existente}`)
    : await chamarApi<Projeto>("/projetos", { metodo: "POST", corpo: { nome: corte.titulo.slice(0, 120) || "Corte", proporcao: formato } });
  // Montando de novo: só a principal, vazia
  const base = { ...vazio, proporcao: formato, faixas: vazio.faixas.filter((faixa) => faixa.tipo === "principal").map((faixa) => ({ ...faixa, clipes: [] })) };
  const { projeto: montado } = montarCorte({
    projeto: base,
    ctx: contextoDasMidias(new Map([[midia.id, midia]])),
    midia: { id: midia.id, largura: midia.video.largura, altura: midia.video.altura },
    corte,
    palavras,
    rosto,
    enfase: receita.enfase ? corte.enfase : [],
    opcoes,
  });
  // O que espera mídias novas: a legenda animada (por cima das legendas montadas), as partes de pregação do modelo
  // e as do "Como quer a edição" (que valem mais), e depois a chamada, o logo e a música do modelo
  let projeto = montado;
  const principal = montado.faixas.find((faixa) => faixa.tipo === "principal")?.clipes ?? [];
  const fala = new Map([[midia.id, palavras]]);
  const doPlano = plano ? partesDoPlano(plano, frasesDaLinha(palavrasDaLinha(falaDosClipes(principal, fala)))) : null;
  const doModelo = partesDoModelo(receita);
  const partes = doModelo || doPlano ? { ...doModelo, ...doPlano } : null;
  // O modelo aplicado só ao corte vale mais que a legenda animada da página de opções
  const legendaAnimada = corte.modelo_corte
    ? (legendaAnimadaDoPlano(plano) ?? receita.legenda_animada)
    : (clipagem.opcoes.legenda_animada ?? legendaAnimadaDoPlano(plano) ?? receita.legenda_animada);
  const midias = new Map([[midia.id, midia]]);
  if (legendaAnimada || partes) {
    const editado = await aplicarLegendaEPartes({ projeto, palavras: fala, titulo: corte.titulo, midias, legendaAnimada, partes, aoAndamento, ativo });
    if (!editado) return null;
    projeto = editado.projeto;
  }
  if (receita.logo || receita.chamada || receita.musica) {
    const comExtras = await extrasDoModelo({ projeto, receita, marca, midias, palavras: fala, aoAndamento, ativo });
    if (!comExtras) return null;
    projeto = comExtras.projeto;
  }
  await chamarApi<Projeto>(`/projetos/${vazio.id}`, {
    metodo: "PUT",
    corpo: { versao: vazio.versao, nome: vazio.nome, proporcao: projeto.proporcao, taxa: projeto.taxa, fundo: projeto.fundo, faixas: projeto.faixas, marcadores: vazio.marcadores ?? [] },
  });
  if (!existente) await chamarApi(`/clipagens/${clipagem.id}/cortes/${corte.id}/projeto`, { metodo: "PUT", corpo: { projeto_id: vazio.id } });
  return vazio.id;
}

/**
 * Exportar o corte (14.4): monta o projeto quando ainda não há (como o "Montar e abrir no editor") e põe o vídeo
 * na fila do render em 1080p. O arquivo aparece em Exportados. Devolve o id do projeto, ou null se a pessoa saiu.
 */
export async function exportarCorte(
  clipagem: Clipagem,
  corte: Corte,
  marca: Marca,
  aoAndamento: (texto: string) => void,
  ativo: () => boolean,
): Promise<string | null> {
  const projetoId = await projetoDoCorte(clipagem, corte, marca, aoAndamento, ativo);
  if (!projetoId) return null;
  aoAndamento("Pondo na fila do vídeo");
  await chamarApi("/exportacoes", { metodo: "POST", corpo: { projeto_id: projetoId, resolucao: "1080p", formato: "mp4" } });
  return projetoId;
}
