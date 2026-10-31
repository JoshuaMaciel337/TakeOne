"use client";

// "Peça uma edição" (ADR 0004, 14.10): a pessoa escreve como quer o vídeo, o modelo local devolve um plano de um
// conjunto fechado de ações (lib/clipar/pedidoDeEdicao.ts), o painel mostra o plano (e pergunta com botões
// quando falta algo) e "Aplicar" faz tudo num passo só do desfazer, dizendo o que mudou e o que não deu. Embaixo, os
// modelos de corte (14.6): aplicar um ao vídeo aberto (também num passo só) e salvar o vídeo aberto como modelo.
import { Check, LoaderCircle, MessageSquareText, Palette, Save, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { avisarModelosMudaram, EscolhaDoModelo } from "@/componentes/clipar/ModelosDeCorte";
import { contextoDasMidias } from "@/componentes/editor/contexto";
import { aplicarPlano, descreverPlano, estadoDoProjeto, type FraseDaLinha, frasesCortadas, frasesDaLinha, legendaAnimadaDoPlano, partesDoPlano, type PlanoDaEdicao } from "@/lib/clipar/pedidoDeEdicao";
import { aplicarLegendaEPartes } from "@/lib/clipar/aplicarPregacao";
import { extrasDoModelo } from "@/lib/clipar/extrasDoModelo";
import { censuraNoProjeto } from "@/lib/clipar/censuraDoCorte";
import { ganchoNoProjeto } from "@/lib/clipar/ganchoNarrado";
import { retencaoNoProjeto, temRetencao } from "@/lib/clipar/retencaoDoCorte";
import { emojisNoProjeto } from "@/lib/emojis";
import { type ModeloDeCorte, partesDoModelo, planoDoModelo, type ReceitaDoCorte, receitaDoProjeto, resumoDaReceita } from "@/lib/clipar/modelosDeCorte";
import { pedirPlanoDaEdicao } from "@/lib/clipar/pedirEdicao";
import { useMarca } from "@/lib/marca";
import { criarRecurso } from "@/lib/recursos";
import type { Comando, ResultadoDoComando } from "@/lib/projeto/comandos";
import { falaDosClipes, type Palavra, palavrasDaLinha } from "@/lib/projeto/fala";
import type { Projeto } from "@/lib/projeto/modelo";
import type { AmostraDeRosto } from "@/lib/projeto/reenquadrar";
import { buscarRosto } from "@/lib/rosto";
import type { Midia } from "@/lib/tipos";
import { transcreverMidias } from "@/lib/transcricao";

type Props = {
  projeto: Projeto;
  midias: Midia[];
  aoExecutar: (comando: Comando) => ResultadoDoComando;
  aoAvisar: (mensagem: string) => void;
};

const EXEMPLOS = ["legendas amarelas e maiores", "tira as pausas", "zoom quando ele fala do principal", "título: Três dicas para economizar", "abaixa a música"];

const principalDe = (projeto: Projeto) => projeto.faixas.find((faixa) => faixa.tipo === "principal")?.clipes ?? [];
const textoDasFrases = (frases: FraseDaLinha[]) => frases.map((frase) => frase.texto).join("\n");

export function PecaUmaEdicao({ projeto, midias, aoExecutar, aoAvisar }: Props) {
  const marca = useMarca();
  const [pedido, setPedido] = useState("");
  const [andamento, setAndamento] = useState<string | null>(null);
  const [resposta, setResposta] = useState<{ plano: PlanoDaEdicao; frases: FraseDaLinha[]; palavras: Map<string, Palavra[]> } | null>(null);
  const [modelo, setModelo] = useState<ModeloDeCorte | null>(null);
  const ativo = useRef(true);
  // O projeto mais novo, para aplicar sobre o que está na tela depois da espera pelo modelo
  const projetoAgora = useRef(projeto);
  useEffect(() => {
    projetoAgora.current = projeto;
  });
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);

  const midiasDaPrincipal = (alvo: Projeto) => [...new Set(principalDe(alvo).flatMap((clipe) => (clipe.midia_id ? [clipe.midia_id] : [])))];

  async function pedir(texto: string) {
    const limpo = texto.trim();
    if (limpo.length < 3 || andamento) return;
    setResposta(null);
    try {
      // A fala da principal: as frases vão ao modelo, para ele apontar onde cortar e dar zoom
      const ids = midiasDaPrincipal(projeto).filter((id) => midias.find((midia) => midia.id === id)?.audio);
      const palavras = ids.length ? await transcreverMidias(ids, "auto", setAndamento, () => ativo.current) : new Map<string, Palavra[]>();
      if (!palavras || !ativo.current) return;
      const frases = frasesDaLinha(palavrasDaLinha(falaDosClipes(principalDe(projeto), palavras)));
      setAndamento("Pedido enviado");
      const plano = await pedirPlanoDaEdicao(limpo, frases, estadoDoProjeto(projeto), setAndamento, () => ativo.current);
      if (!plano || !ativo.current) return;
      setResposta({ plano, frases, palavras });
    } catch (erro) {
      if (ativo.current) aoAvisar(erro instanceof Error ? erro.message : "Não deu para ler o pedido agora.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  /** Os rostos das mídias da principal, quando o plano enquadra no rosto (ou muda o formato). */
  async function rostosDoPlano(plano: PlanoDaEdicao, atual: Projeto): Promise<Map<string, AmostraDeRosto[]> | null> {
    const porId = new Map(midias.map((midia) => [midia.id, midia]));
    const rostos = new Map<string, AmostraDeRosto[]>();
    const mudaFormato = plano.formato !== "manter" && plano.formato !== atual.proporcao;
    if (plano.enquadrar === "rosto" || (mudaFormato && plano.enquadrar === "manter")) {
      for (const id of midiasDaPrincipal(atual)) {
        if (!porId.get(id)?.video || porId.get(id)?.imagem) continue;
        const amostras = await buscarRosto(id, setAndamento, () => ativo.current).catch(() => []);
        if (!ativo.current || amostras === null) return null;
        rostos.set(id, amostras);
      }
    }
    return rostos;
  }

  /**
   * O plano no projeto de agora, e depois o que espera mídias novas (a legenda animada, as partes de pregação e, num
   * modelo de corte, o logo, a chamada e a música), num passo só do desfazer. Devolve o aviso, ou null se parou.
   */
  async function aplicarComMidias(plano: PlanoDaEdicao, palavras: Map<string, Palavra[]>, frases: FraseDaLinha[], receita: ReceitaDoCorte | null): Promise<string | null> {
    const atual = projetoAgora.current;
    const porId = new Map(midias.map((midia) => [midia.id, midia]));
    const tamanhos = new Map(
      midias.flatMap((midia) => (midia.video ? [[midia.id, { largura: midia.video.largura, altura: midia.video.altura }] as const] : [])),
    );
    const rostos = await rostosDoPlano(plano, atual);
    if (!rostos) return null;
    setAndamento("Aplicando");
    const titulo = atual.nome && !/^Projeto sem título/.test(atual.nome) ? { texto: atual.nome, foco: [] } : null;
    const principalNoComeco = JSON.stringify(principalDe(projetoAgora.current));
    const aplicado = aplicarPlano(projetoAgora.current, plano, {
      ctx: contextoDasMidias(porId),
      palavras,
      frases,
      tamanhos,
      rostos,
      corDaMarca: marca.cores[0] ?? null,
      tituloPadrao: titulo,
    });
    let novo = aplicado.projeto;
    const feitos = [...aplicado.feitos];
    // Num modelo, o que já está como ele pede não é um "não deu"
    const naoDeu = receita ? aplicado.naoDeu.filter((item) => !/^tirar as pausas|^tirar os zooms|^tirar o título|^tirar as legendas|^pôr o título: o vídeo já tem/.test(item)) : aplicado.naoDeu;
    // O que espera mídias novas: a legenda animada e as partes de pregação (sons, gráficos, imagens...)
    const doPlano = partesDoPlano(plano, frases);
    const doModelo = receita ? partesDoModelo(receita) : null;
    const partesPedidas = doModelo || doPlano ? { ...doModelo, ...doPlano } : null;
    const animada = legendaAnimadaDoPlano(plano);
    const mudou = () => JSON.stringify(principalDe(projetoAgora.current)) !== principalNoComeco;
    if (partesPedidas || animada) {
      const editado = await aplicarLegendaEPartes({
        projeto: novo,
        palavras,
        titulo: titulo?.texto ?? "",
        midias: porId,
        legendaAnimada: animada,
        partes: partesPedidas,
        aoAndamento: setAndamento,
        ativo: () => ativo.current,
        coresDaMarca: marca.cores,
      });
      if (!editado) return null;
      novo = editado.projeto;
      feitos.push(...editado.feitos);
    }
    if (receita && (receita.logo || receita.chamada || receita.musica || receita.abertura)) {
      const comExtras = await extrasDoModelo({ projeto: novo, receita, marca, midias: porId, palavras, titulo: titulo?.texto ?? "", aoAndamento: setAndamento, ativo: () => ativo.current });
      if (!comExtras) return null;
      novo = comExtras.projeto;
      feitos.push(...comExtras.feitos);
    }
    if (receita?.emojis) {
      const comEmojis = await emojisNoProjeto(novo, porId, setAndamento, () => ativo.current);
      if (!comEmojis) return null;
      novo = comEmojis.projeto;
      if (comEmojis.quantos) feitos.push(`emojis em ${comEmojis.quantos} legendas`);
    }
    if (receita?.gancho) {
      const comGancho = await ganchoNoProjeto({ projeto: novo, midias: porId, titulo: atual.nome, voz: "pf_dora", aoAndamento: setAndamento, ativo: () => ativo.current });
      if (!comGancho) return null;
      novo = comGancho.projeto;
      feitos.push(`o gancho “${comGancho.frase}”`);
    }
    if (receita?.censura && marca.censura.length) {
      const comCensura = await censuraNoProjeto({ projeto: novo, midias: porId, palavras, lista: marca.censura, modo: receita.censura, aoAndamento: setAndamento, ativo: () => ativo.current });
      if (!comCensura) return null;
      novo = comCensura.projeto;
      if (comCensura.quantas) feitos.push(`${comCensura.quantas} ${comCensura.quantas === 1 ? "palavra censurada" : "palavras censuradas"}`);
    }
    if (receita && temRetencao(receita)) {
      const pedido = { barra: receita.barra, quadro: receita.quadro_original, distracao: receita.distracao };
      const comRetencao = await retencaoNoProjeto({ projeto: novo, pedido, marca, midias: porId, semente: atual.id, aoAndamento: setAndamento, ativo: () => ativo.current });
      if (!comRetencao) return null;
      novo = comRetencao.projeto;
      feitos.push(...comRetencao.feitos);
    }
    if (mudou()) return "O vídeo mudou enquanto a edição era preparada. Peça de novo.";
    if (feitos.length) aoExecutar({ comando: "edicao.pedido", parametros: { projeto: novo } });
    const partes = [feitos.length ? `Pronto: ${feitos.join(", ")}. Ctrl+Z desfaz tudo de uma vez.` : "Nada mudou no vídeo."];
    if (naoDeu.length) partes.push(`Não deu: ${naoDeu.join("; ")}.`);
    return partes.join(" ");
  }

  async function aplicar() {
    if (!resposta || andamento) return;
    const { plano, palavras } = resposta;
    // As frases valem se a fala da linha de agora é a mesma que foi ao modelo; se a pessoa cortou algo durante a
    // espera, cortar e dar zoom em frases ficam de fora (o resto do plano não depende delas)
    const frasesDeAgora = frasesDaLinha(palavrasDaLinha(falaDosClipes(principalDe(projetoAgora.current), palavras)));
    const frases = textoDasFrases(frasesDeAgora) === textoDasFrases(resposta.frases) ? frasesDeAgora : [];
    try {
      const aviso = await aplicarComMidias(plano, palavras, frases, null);
      if (aviso === null || !ativo.current) return;
      aoAvisar(aviso);
      setResposta(null);
      if (aviso.startsWith("Pronto")) setPedido("");
    } catch (erro) {
      aoAvisar(erro instanceof Error ? erro.message : "Não deu para aplicar o pedido.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  /** Um modelo de corte no vídeo aberto: a receita vira um plano, com as partes e os extras dela. */
  async function aplicarModelo(escolhido: ModeloDeCorte) {
    if (andamento) return;
    try {
      const ids = midiasDaPrincipal(projetoAgora.current).filter((id) => midias.find((midia) => midia.id === id)?.audio);
      const palavras = ids.length ? await transcreverMidias(ids, "auto", setAndamento, () => ativo.current) : new Map<string, Palavra[]>();
      if (!palavras || !ativo.current) return;
      const estado = estadoDoProjeto(projetoAgora.current);
      const plano = planoDoModelo(escolhido.receita);
      // O título que o vídeo já tem fica (o modelo pede um, e ele já está lá)
      if (plano.titulo.acao === "por" && estado.titulo) plano.titulo.acao = "manter";
      const aviso = await aplicarComMidias(plano, palavras, [], escolhido.receita);
      if (aviso !== null && ativo.current) aoAvisar(`${escolhido.nome}: ${aviso}`);
    } catch (erro) {
      if (ativo.current) aoAvisar(erro instanceof Error ? erro.message : "Não deu para aplicar o modelo.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  /** O vídeo aberto como modelo de corte do espaço: o que ele tem vira o que o modelo põe. */
  async function salvarComoModelo() {
    const receita = receitaDoProjeto(projetoAgora.current, new Map(midias.map((midia) => [midia.id, midia])), marca.logo_midia_id);
    const nome = window.prompt(`Nome do modelo de corte:\n(${resumoDaReceita(receita).join(", ")})`, "")?.trim();
    if (!nome) return;
    try {
      await criarRecurso({ tipo: "modelo_corte", nome: nome.slice(0, 60), dados: { receita } });
      avisarModelosMudaram();
      aoAvisar(`Modelo “${nome}” salvo: ele aparece na página de opções do Clipar, na lista de cortes e aqui.`);
    } catch (erro) {
      aoAvisar(erro instanceof Error ? erro.message : "Não deu para salvar o modelo.");
    }
  }

  const itens = resposta ? descreverPlano(resposta.plano) : [];
  const cortadas = resposta ? frasesCortadas(resposta.plano, resposta.frases) : [];
  const pergunta = resposta?.plano.pergunta;
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-destaque/40 bg-destaque/5 p-2" aria-label="Peça uma edição">
      <h3 className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-suave">
        <MessageSquareText className="size-3.5 text-destaque" aria-hidden /> Peça uma edição
      </h3>
      <textarea
        aria-label="Como quer a edição"
        rows={2}
        maxLength={500}
        disabled={andamento !== null}
        value={pedido}
        placeholder="Ex.: legendas amarelas e maiores, zoom quando ele fala de dinheiro, sem título"
        onChange={(evento) => setPedido(evento.currentTarget.value)}
        onKeyDown={(evento) => {
          if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) {
            evento.preventDefault();
            void pedir(pedido);
          }
        }}
        className="rounded-md border border-borda bg-painel-2 p-2 text-xs outline-none focus:border-destaque"
      />
      {!pedido && !resposta ? (
        <div className="flex flex-wrap gap-1">
          {EXEMPLOS.map((exemplo) => (
            <button key={exemplo} type="button" className="rounded-full border border-borda px-2 py-0.5 text-[11px] text-suave hover:text-texto" onClick={() => setPedido(exemplo)}>
              {exemplo}
            </button>
          ))}
        </div>
      ) : null}
      {resposta ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-borda bg-painel p-2" aria-live="polite">
          {resposta.plano.resumo ? <p className="font-medium">{resposta.plano.resumo}</p> : null}
          {pergunta?.texto ? (
            <div className="flex flex-col gap-1">
              <p>{pergunta.texto}</p>
              <div className="flex flex-wrap gap-1">
                {pergunta.opcoes.map((opcao) => (
                  <button key={opcao} type="button" className="botao-secundario px-2 py-1 text-[11px]" onClick={() => void pedir(`${pedido.trim()} (${pergunta.texto} ${opcao})`)}>
                    {opcao}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {itens.length ? (
            <ul className="list-inside list-disc text-[11px]">
              {itens.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-suave">O modelo não achou nada para mudar com esse pedido.</p>
          )}
          {cortadas.length ? (
            <details className="text-[11px] text-suave">
              <summary className="cursor-pointer">As frases que saem</summary>
              <ul className="mt-1 list-inside list-disc">
                {cortadas.map((frase) => (
                  <li key={frase}>{frase}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {resposta.plano.nao_deu.length ? <p className="text-[11px] text-aviso">Não dá para fazer aqui: {resposta.plano.nao_deu.join("; ")}.</p> : null}
          <div className="flex gap-1.5">
            <button
              type="button"
              // Com uma pergunta, a resposta vem primeiro: aplicar o plano do jeito que está fica como segunda opção
              className={`${pergunta?.texto ? "botao-secundario" : "botao-principal"} flex-1 px-2 py-1.5 text-xs`}
              disabled={!itens.length || andamento !== null}
              onClick={() => void aplicar()}
            >
              {andamento ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
              {andamento ?? (pergunta?.texto ? "Aplicar assim mesmo" : "Aplicar")}
            </button>
            <button type="button" className="botao-secundario px-2 py-1.5 text-xs" disabled={andamento !== null} onClick={() => setResposta(null)}>
              <X className="size-4" aria-hidden /> Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" className="botao-principal px-3 py-2 text-xs" disabled={andamento !== null || pedido.trim().length < 3} onClick={() => void pedir(pedido)}>
            {andamento ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <MessageSquareText className="size-4" aria-hidden />}
            {andamento ?? "Pedir"}
          </button>
          <details className="rounded-md border border-borda bg-painel p-2">
            <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium">
              <Palette className="size-3.5 text-destaque" aria-hidden /> Modelos de corte
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <EscolhaDoModelo escolhido={modelo?.id ?? null} aoEscolher={setModelo} compacto />
              <button type="button" className="botao-principal px-3 py-1.5 text-xs" disabled={!modelo || andamento !== null} onClick={() => modelo && void aplicarModelo(modelo)}>
                <Check className="size-4" aria-hidden /> {modelo ? `Aplicar “${modelo.nome}”` : "Escolha um modelo"}
              </button>
              <button type="button" className="botao-secundario px-3 py-1.5 text-xs" disabled={andamento !== null} onClick={() => void salvarComoModelo()}>
                <Save className="size-4" aria-hidden /> Salvar como modelo de corte
              </button>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
