// O modelo de pregação com as mídias (o Clipar, 14.12g): pede os efeitos sonoros, os gráficos, a cartela e as imagens
// de apoio da Pixabay, espera todos ficarem prontos e os põe no projeto (modeloDePregacao.ts faz as contas). O que
// falhar (a Pixabay desligada, um gráfico que não gravou) fica de fora e o resto entra.
import { contextoDasMidias } from "@/componentes/editor/contexto";
import { chamarApi } from "@/lib/api";
import { esperarLegenda, pedirLegendaAnimada } from "@/lib/legendasAnimadas";
import { executarComando } from "@/lib/projeto/comandos";
import type { Contexto } from "@/lib/projeto/edicao";
import { falaDosClipes, type Palavra, type PalavraDaLinha, palavrasDaLinha } from "@/lib/projeto/fala";
import { faixaDasLegendas, pedidoDasLegendas } from "@/lib/projeto/legendaAnimada";
import type { Projeto } from "@/lib/projeto/modelo";
import { TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import { comMidiasDoPlano, type MidiaDoPlano, PARTES_DA_PREGACAO, type PartesDaEdicao, planoDaPregacao } from "./modeloDePregacao";

const INTERVALO_MS = 2500;
/** Quanto esperar pelas mídias: os gráficos e a cartela gravam em uns 30 s cada, as imagens baixam em segundos. */
const ESPERA_MAXIMA_MS = 6 * 60 * 1000;

type ItemDaPixabay = { id: number; duracao: number | null; largura: number | null; altura: number | null };

async function pedirAnimacao(modelo: string, campos: Record<string, string>, proporcao: string, duracao: number): Promise<Midia> {
  return chamarApi<Midia>("/animacoes", { metodo: "POST", corpo: { modelo, campos, proporcao, duracao } });
}

async function imagemDeApoio(busca: string): Promise<{ midia: Midia; largura: number; altura: number } | null> {
  const resposta = await chamarApi<{ itens: ItemDaPixabay[] }>(`/pixabay/buscar?${new URLSearchParams({ tipo: "video", q: busca })}`);
  const item = resposta.itens.find((i) => (i.duracao ?? 0) >= 3 && i.largura && i.altura);
  if (!item) return null;
  const midia = await chamarApi<Midia>("/pixabay/importar", { metodo: "POST", corpo: { tipo: "video", id: item.id } });
  return { midia, largura: item.largura!, altura: item.altura! };
}

/** Espera as mídias saírem do processamento; devolve as prontas pelo id (as que deram erro ficam de fora). */
async function esperarProntas(ids: string[], aoAndamento: (texto: string) => void, ativo: () => boolean): Promise<Map<string, Midia> | null> {
  const prontas = new Map<string, Midia>();
  const faltam = new Set(ids);
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  while (faltam.size && Date.now() < limite) {
    if (!ativo()) return null;
    aoAndamento(`Preparando a edição de pregação · ${ids.length - faltam.size} de ${ids.length}`);
    for (const id of [...faltam]) {
      const midia = await chamarApi<Midia>(`/midias/${id}`).catch(() => null);
      if (!midia || midia.status === "erro") faltam.delete(id);
      else if (midia.status === "pronta") {
        prontas.set(id, midia);
        faltam.delete(id);
      }
    }
    if (faltam.size) await new Promise((ok) => setTimeout(ok, INTERVALO_MS));
  }
  return prontas;
}

/**
 * O projeto com o modelo de pregação inteiro. `contextoDe` monta o contexto da edição com as mídias que o projeto já
 * usa mais as novas. Devolve null se a pessoa saiu no meio.
 */
export async function aplicarModeloDePregacao(
  projeto: Projeto,
  palavras: PalavraDaLinha[],
  titulo: string,
  contextoDe: (novas: Map<string, Midia>) => Contexto,
  aoAndamento: (texto: string) => void,
  ativo: () => boolean,
  partes: PartesDaEdicao = PARTES_DA_PREGACAO,
): Promise<{ projeto: Projeto; feitos: string[] } | null> {
  const plano = planoDaPregacao(projeto, contextoDe(new Map()), palavras, titulo, partes);
  const segundos = (t: number) => Math.round((t / TICKS_POR_SEGUNDO) * 100) / 100;
  aoAndamento("Pedindo os sons, os gráficos e as imagens");
  const sons = new Map<string, Promise<Midia>>();
  for (const som of plano.sons) {
    if (!sons.has(som.efeito)) sons.set(som.efeito, chamarApi<Midia>(`/efeitos-sonoros/${som.efeito}`, { metodo: "POST" }));
  }
  const pedidos: Promise<MidiaDoPlano | null>[] = [
    ...plano.sons.map((som) => sons.get(som.efeito)!.then((midia): MidiaDoPlano => ({ tipo: "som", midiaId: midia.id, inicio: som.inicio }))),
    ...plano.graficos.map((grafico) =>
      pedirAnimacao(grafico.modelo, grafico.campos, projeto.proporcao, segundos(grafico.duracao)).then((midia): MidiaDoPlano => ({ tipo: "grafico", midiaId: midia.id, inicio: grafico.inicio })),
    ),
    ...(plano.cartela
      ? [
          pedirAnimacao("cartela_impacto", { linha_1: plano.cartela.linha_1, linha_2: plano.cartela.linha_2 }, projeto.proporcao, segundos(plano.cartela.duracao)).then(
            (midia): MidiaDoPlano => ({ tipo: "cartela", midiaId: midia.id, inicio: plano.cartela!.inicio }),
          ),
        ]
      : []),
    ...plano.imagens.map((imagem) =>
      imagemDeApoio(imagem.busca).then((achada): MidiaDoPlano | null =>
        achada ? { tipo: "imagem", midiaId: achada.midia.id, inicio: imagem.inicio, duracao: imagem.duracao, largura: achada.largura, altura: achada.altura } : null,
      ),
    ),
  ].map((promessa) => promessa.catch(() => null));
  const itens = (await Promise.all(pedidos)).filter((item): item is MidiaDoPlano => item !== null);
  if (!ativo()) return null;
  const prontas = await esperarProntas([...new Set(itens.map((item) => item.midiaId))], aoAndamento, ativo);
  if (!prontas) return null;
  const final = comMidiasDoPlano(
    plano.projeto,
    contextoDe(prontas),
    itens.filter((item) => prontas.has(item.midiaId)),
  );
  const feitos = [...plano.feitos];
  const contar = (tipo: MidiaDoPlano["tipo"]) => itens.filter((item) => item.tipo === tipo && prontas.has(item.midiaId)).length;
  if (contar("som")) feitos.push(`${contar("som")} efeitos sonoros`);
  if (contar("grafico")) feitos.push(`${contar("grafico")} ${contar("grafico") === 1 ? "gráfico" : "gráficos"}`);
  if (contar("imagem")) feitos.push(`${contar("imagem")} ${contar("imagem") === 1 ? "imagem de apoio" : "imagens de apoio"}`);
  if (contar("cartela")) feitos.push("a cartela final");
  return { projeto: final, feitos };
}

/**
 * A legenda animada (sobre as legendas que o projeto tem) e as partes do modelo de pregação, uma depois da outra: o
 * que o botão do modelo, o "Peça uma edição" e o "Montar e abrir no editor" do Clipar fazem depois da parte que não
 * espera mídias. `palavras` é a fala de cada mídia da principal (em segundos da mídia). Devolve null se a pessoa saiu.
 */
export async function aplicarLegendaEPartes(opcoes: {
  projeto: Projeto;
  palavras: Map<string, Palavra[]>;
  titulo: string;
  midias: Map<string, Midia>;
  legendaAnimada: string | null;
  partes: PartesDaEdicao | null;
  aoAndamento: (texto: string) => void;
  ativo: () => boolean;
}): Promise<{ projeto: Projeto; feitos: string[] } | null> {
  const { palavras, titulo, legendaAnimada, partes, aoAndamento, ativo } = opcoes;
  const midias = new Map(opcoes.midias);
  let projeto = opcoes.projeto;
  const feitos: string[] = [];
  if (legendaAnimada && faixaDasLegendas(projeto)) {
    const pedido = pedidoDasLegendas(projeto);
    aoAndamento("Gravando a legenda animada");
    const trilha = await esperarLegenda(await pedirLegendaAnimada(pedido, legendaAnimada, projeto.proporcao), aoAndamento, ativo);
    if (!trilha) return null;
    midias.set(trilha.id, trilha);
    projeto = executarComando(projeto, { comando: "legenda.animar", parametros: { midiaId: trilha.id, inicio: pedido.inicio, faixaId: pedido.faixaId } }, contextoDasMidias(midias)).projeto;
    feitos.push("a legenda animada");
  }
  if (partes) {
    const principal = projeto.faixas.find((faixa) => faixa.tipo === "principal")?.clipes ?? [];
    const naLinha = palavrasDaLinha(falaDosClipes(principal, palavras));
    const editado = await aplicarModeloDePregacao(projeto, naLinha, titulo, (novas) => contextoDasMidias(new Map([...midias, ...novas])), aoAndamento, ativo, partes);
    if (!editado) return null;
    projeto = editado.projeto;
    feitos.push(...editado.feitos);
  }
  return { projeto, feitos };
}
