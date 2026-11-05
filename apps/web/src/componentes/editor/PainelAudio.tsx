"use client";

import { AudioLines, Clock, Mic, Plus } from "lucide-react";
import { useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { chamarApi, ErroApi } from "@/lib/api";
import { formatarTempo } from "@/lib/formatar";
import type { Midia } from "@/lib/tipos";

import { EfeitosSonoros } from "./EfeitosSonoros";
import { GravarNarracao, type PropsGravacao } from "./GravarNarracao";

// As vozes pt-BR do Kokoro (core/utils/fala.py)
const VOZES = [
  { id: "pf_dora", nome: "Dora (feminina)" },
  { id: "pm_alex", nome: "Alex (masculina)" },
  { id: "pm_santa", nome: "Santa (masculina, grave)" },
] as const;
const MAXIMO = 3000;
// Uns 15 caracteres por segundo de fala, e o worker fala umas 3 vezes mais rápido que o tempo real
const LETRAS_POR_SEGUNDO = 15;

type Props = {
  /** A fala pedida entra no cursor, numa faixa de áudio, quando ficar pronta. */
  aoPedir: (midia: Midia) => void;
  /** Fora do editor (no hub): a fala só entra na biblioteca. */
  soNaBiblioteca?: boolean;
  /** No editor: gravar narração no cursor. */
  gravacao?: PropsGravacao;
  /** No editor: os sons da biblioteca do espaço e o som dos vídeos dela, para pôr no cursor. */
  doEspaco?: { midias: Midia[]; aoPor: (midiaId: string, somenteSom: boolean) => void };
};

/** Os áudios do espaço e os vídeos com som, cada um com o "+" que põe no cursor (o vídeo, só o som dele). */
function SonsDoEspaco({ midias, aoPor }: { midias: Midia[]; aoPor: (midiaId: string, somenteSom: boolean) => void }) {
  const [aba, setAba] = useState<"audios" | "videos">("audios");
  const lista = midias.filter((midia) => (aba === "audios" ? !midia.video : midia.video));
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-borda bg-painel-2 p-3" aria-label="Sons do espaço">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <AudioLines className="size-4 text-destaque" aria-hidden /> Do espaço
      </p>
      <div className="flex gap-1 text-[11px]" role="tablist">
        <button type="button" role="tab" aria-selected={aba === "audios"} onClick={() => setAba("audios")} className={`rounded-full px-2 py-0.5 ${aba === "audios" ? "bg-painel-3" : "text-suave"}`}>
          Áudios
        </button>
        <button type="button" role="tab" aria-selected={aba === "videos"} onClick={() => setAba("videos")} className={`rounded-full px-2 py-0.5 ${aba === "videos" ? "bg-painel-3" : "text-suave"}`}>
          Extrair de um vídeo
        </button>
      </div>
      {lista.length ? (
        <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto">
          {lista.map((midia) => (
            <li key={midia.id} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-painel-3">
              <span className="min-w-0 flex-1 truncate text-xs" title={midia.nome}>
                {midia.nome}
              </span>
              {midia.duracao ? <span className="text-[11px] tabular-nums text-suave">{formatarTempo(midia.duracao)}</span> : null}
              <button
                type="button"
                className="botao-icone size-7 shrink-0"
                onClick={() => aoPor(midia.id, aba === "videos")}
                aria-label={aba === "videos" ? `Pôr o som de ${midia.nome} no cursor` : `Pôr ${midia.nome} no cursor`}
                title={aba === "videos" ? "O som do vídeo entra no cursor, numa faixa de áudio" : "Entra no cursor, numa faixa de áudio"}
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-suave">{aba === "audios" ? "Nenhum áudio na biblioteca ainda (envie pela Mídia)." : "Nenhum vídeo com som na biblioteca."}</p>
      )}
    </section>
  );
}

/** Ferramenta Áudio: texto em fala com as vozes abertas do Kokoro, geradas no worker de CPU. */
export function PainelAudio({ aoPedir, soNaBiblioteca = false, gravacao, doEspaco }: Props) {
  const [texto, setTexto] = useState("");
  const [voz, setVoz] = useState<string>(VOZES[0].id);
  const [velocidade, setVelocidade] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  const segundos = Math.max(1, Math.round(texto.trim().length / LETRAS_POR_SEGUNDO / velocidade));

  function pedir(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    chamarApi<Midia>("/midias/fala", { metodo: "POST", corpo: { texto, voz, velocidade } })
      .then((midia) => {
        setAviso(soNaBiblioteca ? "Gerando a fala. Ela aparece em Mídias quando ficar pronta." : "Gerando a fala. Ela entra no cursor, numa faixa de áudio, quando ficar pronta.");
        aoPedir(midia);
      })
      .catch((e: unknown) => setErro(e instanceof ErroApi ? e.message : "Não foi possível pedir a fala agora."))
      .finally(() => setEnviando(false));
  }

  return (
    <div className="flex flex-col gap-3">
      {doEspaco ? <SonsDoEspaco {...doEspaco} /> : null}
      {gravacao ? <GravarNarracao {...gravacao} /> : null}
      <form onSubmit={pedir} className="flex flex-col gap-2 rounded-lg border border-borda bg-painel-2 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <Mic className="size-4 text-destaque" aria-hidden /> Texto em fala
        </p>
        <textarea
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          rows={5}
          maxLength={MAXIMO}
          required
          aria-label="Texto para falar"
          placeholder="Escreva o que a voz vai falar. A pontuação faz as pausas: vírgula é curta, ponto é mais longa."
          className="resize-y rounded-md border border-borda bg-painel px-2 py-1.5 text-xs outline-none focus:border-destaque"
        />
        <p className="text-right text-[10px] tabular-nums text-suave">
          {texto.length}/{MAXIMO}
        </p>
        <label className="flex flex-col gap-1 text-[11px] text-suave">
          Voz
          <select
            value={voz}
            onChange={(evento) => setVoz(evento.target.value)}
            className="rounded-md border border-borda bg-painel px-2 py-1 text-xs text-texto outline-none focus:border-destaque"
          >
            {VOZES.map(({ id, nome }) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-suave">
          Velocidade · {velocidade.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}×
          <input type="range" min={0.7} max={1.4} step={0.05} value={velocidade} onChange={(evento) => setVelocidade(Number(evento.target.value))} />
        </label>
        {texto.trim() ? <p className="text-[11px] text-suave">Uns {segundos} s de fala.</p> : null}
        {erro ? <AvisoErro>{erro}</AvisoErro> : null}
        {aviso ? (
          <p className="text-[11px] text-suave" role="status">
            {aviso}
          </p>
        ) : null}
        <button type="submit" className="botao-principal px-3 py-1.5" disabled={enviando || texto.trim().length < 2}>
          <Mic className="size-4" aria-hidden />
          {enviando ? "Pedindo…" : "Gerar a fala"}
        </button>
        <p className="text-[11px] text-suave">Vozes abertas, geradas no servidor, sem custo. Não imitam a voz de ninguém.</p>
      </form>
      {soNaBiblioteca ? null : <EfeitosSonoros aoPedir={aoPedir} />}
      <div className="flex items-start gap-2 rounded-lg border border-dashed border-borda p-3 text-[11px] text-suave">
        <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        O banco de músicas com licença chega com a Pixabay. Volume, fades, abaixar na fala, ritmo e efeitos de voz estão na aba Áudio de cada clipe.
      </div>
    </div>
  );
}
