"use client";

// As automações do Clipar (ADR 0004, 14.9): as esteiras (cada vídeo indo sozinho do link aos cortes exportados) e
// os canais do YouTube acompanhados, em que cada vídeo novo vira uma esteira com as opções padrão do Clipar.
import { AlertCircle, Clock, Link2, Loader2, Radio, RefreshCw, Rss, Scissors, Trash2, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { SecaoDoHub, TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { ErroApi } from "@/lib/api";
import {
  type Automacao,
  criarAutomacao,
  type Esteira,
  excluirAutomacao,
  listarAutomacoes,
  listarEsteiras,
  mudarAutomacao,
  pararEsteira,
  situacaoDaEsteira,
  verificarAutomacao,
} from "@/lib/automacoes";
import { opcoesPadraoGuardadas } from "@/lib/clipagens";

const QUANTOS = [1, 2, 3, 4, 5, 6, 8, 10];

function IconeDaOrigem({ origem }: { origem: Esteira["origem"] }) {
  const Icone = origem === "canal" ? Rss : origem === "envio" ? UploadCloud : Link2;
  return <Icone className="size-4 shrink-0 text-suave" aria-label={origem === "canal" ? "Do canal" : origem === "envio" ? "Enviado" : "Do link"} />;
}

function LinhaDaEsteira({ esteira, aoParar }: { esteira: Esteira; aoParar: () => void }) {
  const situacao = situacaoDaEsteira(esteira);
  return (
    <li className="flex items-center gap-3 rounded-lg border border-borda bg-painel p-3">
      <IconeDaOrigem origem={esteira.origem} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={esteira.titulo}>
          {esteira.titulo || "Vídeo"}
        </p>
        <p className={`flex items-center gap-1 truncate text-xs ${situacao.erro ? "text-erro" : esteira.status === "pronta" && esteira.videos ? "text-sucesso" : "text-suave"}`}>
          {situacao.andando ? <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden /> : null}
          {esteira.status === "esperando" ? <Clock className="size-3 shrink-0" aria-hidden /> : null}
          {situacao.erro ? <AlertCircle className="size-3 shrink-0" aria-hidden /> : null}
          <span className="truncate" title={situacao.texto}>
            {situacao.texto}
          </span>
          <span className="shrink-0 text-apagado">· {esteira.quantos === 1 ? "o melhor" : `os ${esteira.quantos} melhores`}</span>
        </p>
      </div>
      {esteira.clipagem_id ? (
        <Link href={`/app/clipar/${esteira.clipagem_id}`} className="botao-secundario shrink-0 px-2.5 py-1 text-xs" aria-label="Ver os cortes" title="Ver os cortes">
          <Scissors className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Ver os cortes</span>
        </Link>
      ) : null}
      <button
        type="button"
        className="botao-icone size-8 shrink-0"
        aria-label={situacao.andando ? "Parar a esteira" : "Tirar da lista"}
        title={situacao.andando ? "Parar a esteira (o que já foi feito continua)" : "Tirar da lista"}
        onClick={aoParar}
      >
        <X className="size-4" aria-hidden />
      </button>
    </li>
  );
}

function quandoFoi(iso: string | null): string {
  if (!iso) return "ainda não olhado";
  const data = new Date(iso);
  return `olhado ${data.toDateString() === new Date().toDateString() ? "hoje" : `em ${data.toLocaleDateString("pt-BR")}`} às ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function LinhaDoCanal({ automacao, aoMudar, aoExcluir }: { automacao: Automacao; aoMudar: (nova: Automacao) => void; aoExcluir: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  async function fazer(acao: () => Promise<Automacao>) {
    setOcupado(true);
    try {
      aoMudar(await acao());
    } finally {
      setOcupado(false);
    }
  }
  const nome = automacao.canal.nome || automacao.canal.handle || automacao.canal.id;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-borda bg-painel p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Rss className={`size-5 shrink-0 ${automacao.ativa ? "text-destaque" : "text-apagado"}`} aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {nome}
            {automacao.canal.handle && automacao.canal.handle !== nome ? <span className="font-normal text-suave"> {automacao.canal.handle}</span> : null}
          </p>
          <p className="truncate text-xs text-suave">
            {automacao.quantos === 1 ? "O melhor corte" : `Os ${automacao.quantos} melhores cortes`} de cada vídeo de {automacao.duracao_minima} min ou mais
            {automacao.horario ? `, procurados às ${automacao.horario}` : ""} · {quandoFoi(automacao.ultima_verificacao)}
          </p>
          {automacao.ultimo_erro ? (
            <p className="flex items-center gap-1 truncate text-xs text-erro" title={automacao.ultimo_erro}>
              <AlertCircle className="size-3 shrink-0" aria-hidden /> {automacao.ultimo_erro}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            className="accent-[var(--to-destaque)]"
            checked={automacao.ativa}
            disabled={ocupado}
            onChange={(evento) => void fazer(() => mudarAutomacao(automacao.id, { ativa: evento.target.checked }))}
          />
          Ligada
        </label>
        <button type="button" className="botao-secundario px-2.5 py-1 text-xs" disabled={ocupado || !automacao.ativa} onClick={() => void fazer(() => verificarAutomacao(automacao.id))}>
          <RefreshCw className="size-3.5" aria-hidden /> Olhar agora
        </button>
        <button type="button" className="botao-icone size-8" aria-label="Deixar de acompanhar" title="Deixar de acompanhar" disabled={ocupado} onClick={aoExcluir}>
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}

function NovoCanal({ aoCriar }: { aoCriar: (automacao: Automacao) => void }) {
  const [canal, setCanal] = useState("");
  const [quantos, setQuantos] = useState(3);
  const [horario, setHorario] = useState("");
  const [minimo, setMinimo] = useState(5);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  async function criar() {
    if (!canal.trim() || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      aoCriar(await criarAutomacao({ canal: canal.trim(), opcoes: opcoesPadraoGuardadas(), quantos, horario: horario || null, duracao_minima: minimo }));
      setCanal("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não consegui acompanhar o canal.");
    } finally {
      setEnviando(false);
    }
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-borda bg-painel p-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        void criar();
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-borda bg-painel-2 px-3 focus-within:border-destaque">
          <Rss className="size-4 shrink-0 text-suave" aria-hidden />
          <input
            aria-label="Canal do YouTube"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
            placeholder="O @ do canal ou o endereço dele"
            value={canal}
            onChange={(evento) => setCanal(evento.target.value)}
          />
        </label>
        <button type="submit" className="botao-principal justify-center" disabled={!canal.trim() || enviando}>
          {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Radio className="size-4" aria-hidden />}
          {enviando ? "Conferindo o canal…" : "Acompanhar"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-suave">
        <label className="flex items-center gap-1.5">
          exportar os
          <select aria-label="Quantos cortes exportar" className="campo px-1.5 py-1" value={quantos} onChange={(evento) => setQuantos(Number(evento.target.value))}>
            {QUANTOS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          melhores de cada vídeo
        </label>
        <label className="flex items-center gap-1.5">
          de
          <input aria-label="Duração mínima em minutos" type="number" min={1} max={240} className="campo w-16 px-1.5 py-1" value={minimo} onChange={(evento) => setMinimo(Math.max(1, Math.min(240, Number(evento.target.value) || 1)))} />
          min ou mais
        </label>
        <label className="flex items-center gap-1.5" title="O download começa já; a busca dos cortes, que usa a placa de vídeo, espera o horário">
          procurar os cortes às
          <input aria-label="Horário da busca" type="time" className="campo px-1.5 py-1" value={horario} onChange={(evento) => setHorario(evento.target.value)} />
          {horario ? null : <span className="text-xs">(vazio: assim que o vídeo chegar)</span>}
        </label>
      </div>
      <p className="text-xs text-suave">
        A cada 10 minutos o TakeOne lê o feed público do canal. Os vídeos que já estão lá ficam de fora; cada vídeo novo entra numa esteira com as opções padrão do Clipar. As lives entram
        quando terminam.
      </p>
      {erro ? (
        <p className="flex items-start gap-2 text-sm text-erro" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}
    </form>
  );
}

export default function PaginaDasAutomacoes() {
  const [esteiras, setEsteiras] = useState<Esteira[] | null>(null);
  const [automacoes, setAutomacoes] = useState<Automacao[] | null>(null);
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState("");
  useEffect(() => {
    listarEsteiras()
      .then(setEsteiras)
      .catch(() => setEsteiras([]));
  }, [versao]);
  useEffect(() => {
    listarAutomacoes()
      .then(setAutomacoes)
      .catch(() => setAutomacoes([]));
  }, []);
  // Enquanto alguma esteira anda: olhar de novo a cada 5 s
  const andando = Boolean(esteiras?.some((esteira) => situacaoDaEsteira(esteira).andando));
  useEffect(() => {
    if (!andando) return;
    const intervalo = setInterval(() => setVersao((n) => n + 1), 5000);
    return () => clearInterval(intervalo);
  }, [andando]);

  async function parar(esteira: Esteira) {
    if (situacaoDaEsteira(esteira).andando && !window.confirm(`Parar a esteira de “${esteira.titulo}”? O que já foi feito continua na biblioteca e no Clipar.`)) return;
    try {
      await pararEsteira(esteira.id);
      setVersao((n) => n + 1);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não consegui parar a esteira.");
    }
  }

  async function excluir(automacao: Automacao) {
    if (!window.confirm(`Deixar de acompanhar ${automacao.canal.nome ?? automacao.canal.handle}? As esteiras já começadas continuam.`)) return;
    try {
      await excluirAutomacao(automacao.id);
      setAutomacoes((lista) => (lista ?? []).filter((item) => item.id !== automacao.id));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não consegui excluir.");
    }
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina
        titulo="Automações do Clipar"
        descricao="Vídeos indo sozinhos até os cortes prontos: do link colado com “Fazer tudo sozinho”, do vídeo enviado ou de um canal acompanhado. Tudo roda no servidor; a página pode ficar fechada."
      >
        <Link href="/app/clipar" className="botao-secundario">
          <Scissors className="size-4" aria-hidden /> Clipar
        </Link>
      </TituloDaPagina>
      {erro ? (
        <p className="flex items-start gap-2 text-sm text-erro" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      <SecaoDoHub titulo="Esteiras">
        {esteiras === null ? (
          <p className="text-sm text-suave">Carregando…</p>
        ) : esteiras.length ? (
          <ul className="flex flex-col gap-2">
            {esteiras.map((esteira) => (
              <LinhaDaEsteira key={esteira.id} esteira={esteira} aoParar={() => void parar(esteira)} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-borda p-5 text-center text-sm text-suave">
            Nenhuma esteira ainda. No{" "}
            <Link href="/app/clipar" className="text-destaque hover:underline">
              Clipar
            </Link>
            , marque “Fazer tudo sozinho” antes de importar o link ou enviar o vídeo.
          </p>
        )}
      </SecaoDoHub>

      <SecaoDoHub titulo="Canais acompanhados">
        <NovoCanal aoCriar={(automacao) => setAutomacoes((lista) => [...(lista ?? []), automacao])} />
        {automacoes?.length ? (
          <ul className="flex flex-col gap-2">
            {automacoes.map((automacao) => (
              <LinhaDoCanal
                key={automacao.id}
                automacao={automacao}
                aoMudar={(nova) => setAutomacoes((lista) => (lista ?? []).map((item) => (item.id === nova.id ? nova : item)))}
                aoExcluir={() => void excluir(automacao)}
              />
            ))}
          </ul>
        ) : null}
      </SecaoDoHub>
    </main>
  );
}
