"use client";

// "Peça uma edição" (ADR 0004, 14.10): a pessoa escreve como quer o vídeo, o modelo local devolve um plano de um
// conjunto fechado de ações (lib/clipar/pedidoDeEdicao.ts), o painel mostra o plano (e pergunta com botões
// quando falta algo) e "Aplicar" faz tudo num passo só do desfazer, dizendo o que mudou e o que não deu.
import { Check, LoaderCircle, MessageSquareText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { contextoDasMidias } from "@/componentes/editor/contexto";
import { aplicarPlano, descreverPlano, estadoDoProjeto, type FraseDaLinha, frasesCortadas, frasesDaLinha, type PlanoDaEdicao } from "@/lib/clipar/pedidoDeEdicao";
import { pedirPlanoDaEdicao } from "@/lib/clipar/pedirEdicao";
import { useMarca } from "@/lib/marca";
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

  async function aplicar() {
    if (!resposta || andamento) return;
    const { plano, palavras } = resposta;
    const atual = projetoAgora.current;
    // As frases valem se a fala da linha de agora é a mesma que foi ao modelo; se a pessoa cortou algo durante a
    // espera, cortar e dar zoom em frases ficam de fora (o resto do plano não depende delas)
    const frasesDeAgora = frasesDaLinha(palavrasDaLinha(falaDosClipes(principalDe(atual), palavras)));
    const frases = textoDasFrases(frasesDeAgora) === textoDasFrases(resposta.frases) ? frasesDeAgora : [];
    const porId = new Map(midias.map((midia) => [midia.id, midia]));
    const tamanhos = new Map(
      midias.flatMap((midia) => (midia.video ? [[midia.id, { largura: midia.video.largura, altura: midia.video.altura }] as const] : [])),
    );
    try {
      const rostos = new Map<string, AmostraDeRosto[]>();
      const mudaFormato = plano.formato !== "manter" && plano.formato !== atual.proporcao;
      if (plano.enquadrar === "rosto" || (mudaFormato && plano.enquadrar === "manter")) {
        for (const id of midiasDaPrincipal(atual)) {
          if (!porId.get(id)?.video || porId.get(id)?.imagem) continue;
          const amostras = await buscarRosto(id, setAndamento, () => ativo.current).catch(() => []);
          if (!ativo.current || amostras === null) return;
          rostos.set(id, amostras);
        }
      }
      setAndamento("Aplicando");
      const titulo = atual.nome && !/^Projeto sem título/.test(atual.nome) ? { texto: atual.nome, foco: [] } : null;
      const { projeto: novo, feitos, naoDeu } = aplicarPlano(projetoAgora.current, plano, {
        ctx: contextoDasMidias(porId),
        palavras,
        frases,
        tamanhos,
        rostos,
        corDaMarca: marca.cores[0] ?? null,
        tituloPadrao: titulo,
      });
      if (feitos.length) aoExecutar({ comando: "edicao.pedido", parametros: { projeto: novo } });
      const partes = [feitos.length ? `Pronto: ${feitos.join(", ")}. Ctrl+Z desfaz tudo de uma vez.` : "Nada mudou no vídeo."];
      if (naoDeu.length) partes.push(`Não deu: ${naoDeu.join("; ")}.`);
      aoAvisar(partes.join(" "));
      setResposta(null);
      if (feitos.length) setPedido("");
    } catch (erro) {
      aoAvisar(erro instanceof Error ? erro.message : "Não deu para aplicar o pedido.");
    } finally {
      if (ativo.current) setAndamento(null);
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
        <button type="button" className="botao-principal px-3 py-2 text-xs" disabled={andamento !== null || pedido.trim().length < 3} onClick={() => void pedir(pedido)}>
          {andamento ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <MessageSquareText className="size-4" aria-hidden />}
          {andamento ?? "Pedir"}
        </button>
      )}
    </section>
  );
}
