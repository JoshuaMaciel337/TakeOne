// O que o modelo de corte põe por cima da montagem (ADR 0004, 14.6): o logo do kit de marca no canto, a chamada no fim
// (uma animação da biblioteca, nas cores da marca) e a música da biblioteca, baixa, até o fim do corte e abaixando
// quando alguém fala. comExtras (modelosDeCorte.ts) é puro; extrasDoModelo pede a chamada, espera e busca as mídias.
import { contextoDasMidias } from "@/componentes/editor/contexto";
import { chamarApi } from "@/lib/api";
import { falaDosClipes, type Palavra, palavrasDaLinha } from "@/lib/projeto/fala";
import { type Marca, transformacaoDoLogo } from "@/lib/projeto/marca";
import type { Projeto } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

import { esperarProntas, pedirAnimacao } from "./aplicarPregacao";
import { camposDaAbertura, camposDaChamada, comExtras, DURACAO_DA_ABERTURA, DURACAO_DA_CHAMADA, type Extras, inicioDaChamada, type ReceitaDoCorte } from "./modelosDeCorte";

/**
 * Pede o que os extras precisam (a chamada é gravada pelo worker; o logo e a música vêm da biblioteca), espera e põe
 * no projeto. `palavras` é a fala de cada mídia da principal, para a música abaixar. Devolve null se a pessoa saiu.
 */
export async function extrasDoModelo(opcoes: {
  projeto: Projeto;
  receita: ReceitaDoCorte;
  marca: Marca;
  midias: Map<string, Midia>;
  palavras: Map<string, Palavra[]>;
  /** O título do corte, que vai na abertura. */
  titulo: string;
  aoAndamento: (texto: string) => void;
  ativo: () => boolean;
}): Promise<{ projeto: Projeto; feitos: string[] } | null> {
  const { projeto, receita, marca, palavras, aoAndamento, ativo } = opcoes;
  const midias = new Map(opcoes.midias);
  const buscar = (id: string) => chamarApi<Midia>(`/midias/${id}`).catch(() => null);
  const extras: Extras = {};

  const inicio = receita.chamada ? inicioDaChamada(projeto, receita.cartela) : null;
  let pedida: Midia | null = null;
  if (receita.chamada && inicio !== null) {
    aoAndamento("Gravando a chamada do fim");
    pedida = await pedirAnimacao(receita.chamada.modelo, camposDaChamada(receita, marca), projeto.proporcao, DURACAO_DA_CHAMADA).catch(() => null);
  }
  let abertura: Midia | null = null;
  if (receita.abertura && opcoes.titulo.trim()) {
    aoAndamento("Gravando a abertura");
    abertura = await pedirAnimacao(receita.abertura, camposDaAbertura(receita.abertura, opcoes.titulo, marca), projeto.proporcao, DURACAO_DA_ABERTURA).catch(() => null);
  }
  if (receita.logo && marca.logo_midia_id) {
    const logo = await buscar(marca.logo_midia_id);
    if (logo?.video && logo.status === "pronta") {
      midias.set(logo.id, logo);
      const [largura, altura] = projeto.proporcao.split(":").map(Number);
      extras.logo = { midiaId: logo.id, transformacao: transformacaoDoLogo({ largura: logo.video.largura, altura: logo.video.altura }, { largura, altura }, "superior-direito") };
    }
  }
  if (receita.musica) {
    const musica = await buscar(receita.musica.midia_id);
    if (musica?.audio && !musica.video && musica.status === "pronta") {
      midias.set(musica.id, musica);
      const principal = projeto.faixas.find((faixa) => faixa.tipo === "principal")?.clipes ?? [];
      const falas = receita.musica.abaixar ? palavrasDaLinha(falaDosClipes(principal, palavras)).map(({ inicio: de, fim }) => ({ inicio: de, fim })) : null;
      extras.musica = { midiaId: musica.id, volume: receita.musica.volume, falas };
    }
  }
  const esperar = [abertura, pedida && inicio !== null ? pedida : null].filter((midia): midia is Midia => Boolean(midia));
  if (esperar.length) {
    const prontas = await esperarProntas(esperar.map((midia) => midia.id), aoAndamento, ativo, abertura ? "Gravando a abertura" : "Gravando a chamada do fim");
    if (!prontas) return null;
    for (const pronta of prontas.values()) midias.set(pronta.id, pronta);
    if (abertura && prontas.get(abertura.id)) extras.abertura = { midiaId: abertura.id };
    if (pedida && inicio !== null && prontas.get(pedida.id)) extras.chamada = { midiaId: pedida.id, inicio };
  }
  if (!ativo()) return null;
  return comExtras(projeto, contextoDasMidias(midias), extras);
}
