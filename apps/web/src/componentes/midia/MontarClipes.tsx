"use client";

import { ChevronDown, Clapperboard, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import { buscarBatidas } from "@/lib/batidas";
import type { Comando } from "@/lib/projeto/comandos";
import { type ClipeParaMontar, montar } from "@/lib/projeto/montagem";
import { buscarQualidade } from "@/lib/qualidade";
import { segundosParaTicks } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

const DURACOES = [
  { valor: 15, nome: "15 s" },
  { valor: 30, nome: "30 s" },
  { valor: 60, nome: "1 min" },
  { valor: 0, nome: "Todos os bons trechos" },
] as const;

type Props = {
  midias: Midia[];
  aoExecutar: (comando: Comando) => void;
  aoAvisar: (mensagem: string) => void;
};

/**
 * Montagem automática: a pessoa escolhe os vídeos (e imagens), uma música e a duração; o worker dá nota a
 * cada instante dos vídeos, a música tem as batidas achadas, e os melhores trechos entram no fim da
 * faixa principal, cortados no ritmo (lib/projeto/montagem.ts).
 */
export function MontarClipes({ midias, aoExecutar, aoAvisar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [musicaId, setMusicaId] = useState("");
  const [duracao, setDuracao] = useState<number>(30);
  const [andamento, setAndamento] = useState<string | null>(null);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);

  const visuais = midias.filter((midia) => midia.status === "pronta" && midia.video && !midia.animacao);
  const musicas = midias.filter((midia) => midia.status === "pronta" && midia.audio && !midia.video);
  // Os escolhidos que ainda estão na biblioteca, na ordem em que foram escolhidos
  const validos = escolhidos.filter((id) => visuais.some((midia) => midia.id === id));
  const musica = musicas.find((midia) => midia.id === musicaId) ?? null;

  function alternar(id: string) {
    setEscolhidos((lista) => (lista.includes(id) ? lista.filter((item) => item !== id) : [...lista, id]));
  }

  async function montarAgora() {
    const selecionadas = validos.map((id) => visuais.find((midia) => midia.id === id)!);
    const videos = selecionadas.filter((midia) => !midia.imagem);
    const progresso = new Map<string, number>();
    const mostrar = () => {
      const media = videos.length ? [...progresso.values()].reduce((a, b) => a + b, 0) / videos.length : 100;
      if (ativo.current) setAndamento(`Avaliando os vídeos · ${Math.round(media)}%`);
    };
    try {
      setAndamento("Avaliando os vídeos");
      const [qualidades, batidas] = await Promise.all([
        Promise.all(
          videos.map((midia) =>
            buscarQualidade(
              midia.id,
              (p) => {
                progresso.set(midia.id, p);
                mostrar();
              },
              () => ativo.current,
            ),
          ),
        ),
        musica ? buscarBatidas(musica.id, () => {}, () => ativo.current) : Promise.resolve(null),
      ]);
      if (!ativo.current) return;
      const clipes: ClipeParaMontar[] = selecionadas.map((midia) =>
        midia.imagem
          ? { midiaId: midia.id, duracaoS: Number.POSITIVE_INFINITY, imagem: true }
          : { midiaId: midia.id, duracaoS: midia.duracao ?? 0, qualidade: qualidades[videos.indexOf(midia)] ?? undefined },
      );
      const montagem = montar(clipes, batidas?.batidas.length ? batidas.batidas : null, duracao || null);
      if (!montagem.trechos.length) {
        aoAvisar("Não achei trechos bons o bastante nesses vídeos (nítidos, com luz e sem tremer).");
        return;
      }
      aoExecutar({
        comando: "linha.montar",
        parametros: {
          trechos: montagem.trechos.map((t) => ({ midiaId: t.midiaId, entrada: segundosParaTicks(t.entradaS), duracao: segundosParaTicks(t.duracaoS) })),
          musica: musica ? { midiaId: musica.id, entrada: segundosParaTicks(montagem.entradaDaMusicaS) } : null,
        },
      });
      const total = montagem.trechos.reduce((soma, t) => soma + t.duracaoS, 0);
      const segundos = (valor: number) => `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
      // Mais curta que o pedido: diz o porquê (a música acabou ou faltaram trechos bons)
      const motivo =
        duracao && total < duracao - 1
          ? musica?.duracao && musica.duracao < duracao
            ? ` A música tem ${segundos(musica.duracao)}, e a montagem acompanha ela.`
            : " Não havia mais trechos bons nos vídeos escolhidos."
          : "";
      aoAvisar(`Montagem pronta: ${montagem.trechos.length} trechos, ${segundos(total)}.${motivo} Ctrl+Z desfaz.`);
    } catch (erro) {
      if (ativo.current) aoAvisar(erro instanceof Error ? erro.message : "Não foi possível montar agora.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  return (
    <section className="rounded-lg border border-borda bg-painel-2">
      <button
        type="button"
        onClick={() => setAberto((valor) => !valor)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold"
      >
        <Clapperboard className="size-4 text-destaque" aria-hidden />
        <span className="flex-1">Montar com vários clipes</span>
        <ChevronDown className={`size-4 text-suave transition ${aberto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {aberto ? (
        <div className="flex flex-col gap-2 border-t border-borda p-3">
          {visuais.length < 2 ? (
            <p className="text-[11px] text-suave">Envie pelo menos dois vídeos ou imagens para montar.</p>
          ) : (
            <>
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-[11px] text-suave">Escolha os clipes, na ordem em que devem se revezar</legend>
                <div className="grid grid-cols-4 gap-1.5">
                  {visuais.map((midia) => {
                    const ordem = validos.indexOf(midia.id);
                    return (
                      <button
                        key={midia.id}
                        type="button"
                        onClick={() => alternar(midia.id)}
                        aria-pressed={ordem >= 0}
                        title={midia.nome}
                        className={`relative aspect-square overflow-hidden rounded-md border ${ordem >= 0 ? "border-destaque ring-1 ring-destaque" : "border-borda opacity-70"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- capa da API com a sessão do cookie */}
                        <img src={arquivoDaMidia(midia.id, "capa.jpg")} alt={midia.nome} className="size-full object-cover" draggable={false} />
                        {ordem >= 0 ? (
                          <span className="absolute left-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-destaque text-[10px] font-bold text-white">{ordem + 1}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1 text-[11px] text-suave">
                  Música
                  <select
                    value={musica?.id ?? ""}
                    onChange={(evento) => setMusicaId(evento.target.value)}
                    className="rounded-md border border-borda bg-painel px-2 py-1 text-xs text-texto outline-none focus:border-destaque"
                  >
                    <option value="">Sem música</option>
                    {musicas.map((midia) => (
                      <option key={midia.id} value={midia.id}>
                        {midia.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1 text-[11px] text-suave">
                  Duração
                  <select
                    value={duracao}
                    onChange={(evento) => setDuracao(Number(evento.target.value))}
                    className="rounded-md border border-borda bg-painel px-2 py-1 text-xs text-texto outline-none focus:border-destaque"
                  >
                    {DURACOES.map((opcao) => (
                      <option key={opcao.valor} value={opcao.valor}>
                        {opcao.nome}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-[11px] text-suave">
                Os melhores trechos de cada vídeo (nítidos, com luz e sem tremer) entram no fim da faixa principal
                {musica ? ", cortados nas batidas da música e com o som dos clipes mudo" : ""}.
              </p>
              <button type="button" className="botao-principal px-3 py-1.5" disabled={validos.length < 2 || andamento !== null} onClick={() => void montarAgora()}>
                {andamento ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Clapperboard className="size-4" aria-hidden />}
                {andamento ?? `Montar com ${validos.length} clipes`}
              </button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
