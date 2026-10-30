// A retenção que o modelo de corte põe (ADR 0004, 14.8): pede as formas da barra (desenhadas na hora pela API) e a
// foto do quadro do original (o worker de CPU), busca o vídeo de distração na biblioteca, espera e põe tudo pelas
// contas de retencao.ts. O quadro e a distração saem do sorteio do projeto, então cortes diferentes pegam quadros,
// vídeos e trechos diferentes.
import { contextoDasMidias } from "@/componentes/editor/contexto";
import { chamarApi } from "@/lib/api";
import { criarForma } from "@/lib/elementos";
import type { Marca } from "@/lib/projeto/marca";
import type { Projeto } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

import { esperarProntas } from "./aplicarPregacao";
import { trechosNoCorte } from "./editorDoCorte";
import type { ReceitaDoCorte } from "./modelosDeCorte";
import {
  comBarraDeProgresso,
  comDistracao,
  comQuadroNaCaixa,
  COR_DA_BARRA,
  ehDistracao,
  ehQuadroNaCaixa,
  COR_DO_TRILHO,
  escolhaDaDistracao,
  instanteDoQuadro,
  pedidoDaBarra,
  type PosicaoDaBarra,
  type QuandoDoQuadro,
  semOsClipes,
} from "./retencao";

export type PedidoDeRetencao = { barra?: PosicaoDaBarra | null; quadro?: QuandoDoQuadro | null; distracao?: string[] };

export const temRetencao = (receita: Pick<ReceitaDoCorte, "barra" | "quadro_original" | "distracao">) =>
  Boolean(receita.barra || receita.quadro_original || receita.distracao.length);

const principalDe = (projeto: Projeto) => projeto.faixas.find((faixa) => faixa.tipo === "principal")?.clipes ?? [];

/** As formas da barra (o trilho escuro e a barra na cor da marca), prontas na biblioteca. */
export async function formasDaBarra(marca: Marca): Promise<[Midia, Midia]> {
  return Promise.all([criarForma(pedidoDaBarra(COR_DO_TRILHO)), criarForma(pedidoDaBarra((marca.cores[0] ?? COR_DA_BARRA).toLowerCase()))]);
}

/** O vídeo do original na principal (o que mais aparece) e os trechos dele. */
export function originalDoProjeto(projeto: Projeto, midias: Map<string, Midia>): { midia: Midia; trechos: { de: number; ate: number }[] } | null {
  const contagem = new Map<string, number>();
  for (const clipe of principalDe(projeto)) {
    const midia = clipe.midia_id ? midias.get(clipe.midia_id) : undefined;
    if (midia?.video && !midia.imagem) contagem.set(midia.id, (contagem.get(midia.id) ?? 0) + clipe.duracao);
  }
  const id = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!id) return null;
  const trechos = trechosNoCorte(principalDe(projeto), id);
  return trechos.length ? { midia: midias.get(id)!, trechos } : null;
}

/** Pede a foto do quadro do original (o worker tira do vídeo pela regra do render). */
export function pedirQuadro(midiaId: string, segundos: number): Promise<Midia> {
  return chamarApi<Midia>(`/midias/${midiaId}/quadro`, { metodo: "POST", corpo: { segundos, imagem_limpa: false, estabilizar: false } });
}

/**
 * Põe a retenção pedida. Um item que não entra (a mídia sumiu, o vídeo é curto demais) fica de fora e os outros
 * seguem; `feitos` diz o que entrou. Devolve null se a pessoa saiu no meio da espera.
 */
export async function retencaoNoProjeto(opcoes: {
  projeto: Projeto;
  pedido: PedidoDeRetencao;
  marca: Marca;
  midias: Map<string, Midia>;
  semente: string;
  aoAndamento: (texto: string) => void;
  ativo: () => boolean;
}): Promise<{ projeto: Projeto; feitos: string[] } | null> {
  const { pedido, marca, semente, aoAndamento, ativo } = opcoes;
  const midias = new Map(opcoes.midias);
  const original = originalDoProjeto(opcoes.projeto, midias);
  const feitos: string[] = [];

  // Os pedidos ao servidor saem juntos; o quadro é o único que espera o worker
  aoAndamento("Preparando a retenção");
  const [formas, quadroPedido, distracao] = await Promise.all([
    pedido.barra ? formasDaBarra(marca).catch(() => null) : null,
    pedido.quadro && original ? pedirQuadro(original.midia.id, instanteDoQuadro(original.trechos, pedido.quadro, semente)).catch(() => null) : null,
    (async () => {
      const escolha = escolhaDaDistracao(pedido.distracao ?? [], semente);
      if (!escolha) return null;
      const midia = await chamarApi<Midia>(`/midias/${escolha.midiaId}`).catch(() => null);
      return midia?.video && !midia.imagem && midia.status === "pronta" ? { midia, fracao: escolha.fracao } : null;
    })(),
  ]);
  if (formas) for (const forma of formas) midias.set(forma.id, forma);
  if (distracao) midias.set(distracao.midia.id, distracao.midia);
  let quadro: Midia | null = null;
  if (quadroPedido) {
    const prontas = await esperarProntas([quadroPedido.id], aoAndamento, ativo, "Tirando o quadro do original");
    if (!prontas) return null;
    quadro = prontas.get(quadroPedido.id) ?? null;
    if (quadro) midias.set(quadro.id, quadro);
  }
  if (!ativo()) return null;

  const ctx = contextoDasMidias(midias);
  // Aplicado de novo (o modelo no editor), o quadro e a distração de antes saem
  const midiaDe = (id: string | null) => (id ? midias.get(id) : undefined);
  let projeto = semOsClipes(
    opcoes.projeto,
    (clipe) => (Boolean(quadro) && ehQuadroNaCaixa(clipe, midiaDe(clipe.midia_id))) || (Boolean(distracao) && ehDistracao(clipe, midiaDe(clipe.midia_id))),
  );
  if (distracao?.midia.video) {
    try {
      projeto = comDistracao(projeto, ctx, { midiaId: distracao.midia.id, largura: distracao.midia.video.largura, altura: distracao.midia.video.altura, fracao: distracao.fracao }).projeto;
      feitos.push("o vídeo de distração");
    } catch {
      // Fica de fora
    }
  }
  if (quadro?.video) {
    try {
      projeto = comQuadroNaCaixa(projeto, ctx, { midiaId: quadro.id, largura: quadro.video.largura, altura: quadro.video.altura }).projeto;
      feitos.push("o quadro do original");
    } catch {
      // Fica de fora
    }
  }
  if (formas && pedido.barra) {
    try {
      projeto = comBarraDeProgresso(projeto, ctx, { trilhoId: formas[0].id, barraId: formas[1].id, posicao: pedido.barra });
      feitos.push("a barra de progresso");
    } catch {
      // Fica de fora
    }
  }
  return { projeto, feitos };
}
