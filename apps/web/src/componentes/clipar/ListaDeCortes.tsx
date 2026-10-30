"use client";

// A lista de cortes (ADR 0004, 14.3 e 14.4): o andamento enquanto o TakeOne procura, e depois os cortes, em grade
// (cartões em pé com a prévia do corte editado, uma tocando de cada vez) ou em lista. Cada corte tem a nota de 0 a
// 100, as quatro notas com a frase do modelo, o título com as palavras de foco, o resumo, a categoria, os trechos
// do original e os avisos (propaganda, parecido com outro). Ordenar, filtrar (avaliação e duração) e buscar nas
// falas; gostei e não gostei; escolher vários para avaliar, baixar o .srt, exportar ou apagar juntos. Em cada
// corte: abrir no editor (montando na primeira vez, 14.5), exportar, baixar o .srt, duplicar, a parte 2 e apagar.
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Captions,
  Clapperboard,
  Copy,
  Download,
  LayoutGrid,
  List,
  ListPlus,
  Loader2,
  RefreshCw,
  Search,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { chamarApi, ErroApi } from "@/lib/api";
import { exportarCorte, projetoDoCorte } from "@/lib/clipar/abrirCorte";
import {
  type AmostraDoRosto,
  DURACOES_DO_FILTRO,
  FILTRO_PADRAO,
  type Filtro,
  type FiltroDaAvaliacao,
  type FiltroDaDuracao,
  filtrarCortes,
  legendasDoCorte,
  nomeDeArquivo,
  type PalavraDaMidia,
  srtDoCorte,
} from "@/lib/clipar/listaDeCortes";
import { descreverPlano } from "@/lib/clipar/pedidoDeEdicao";
import {
  apagarCorte,
  avaliarCorte,
  CATEGORIAS,
  type Clipagem,
  continuarCorte,
  type Corte,
  CRITERIOS,
  duplicarCorte,
  excluirClipagem,
  FAIXAS,
  falaDaClipagem,
  type Ordem,
  ordenarCortes,
  pedacosDoTitulo,
  verClipagem,
} from "@/lib/clipagens";
import { useEventosJobs } from "@/lib/eventos";
import { baixarBlob } from "@/lib/exportacao/exportarComo";
import { zipSemCompressao } from "@/lib/exportacao/zip";
import { formatarTempo } from "@/lib/formatar";
import { useMarca } from "@/lib/marca";
import type { Legenda } from "@/lib/projeto/legendas";
import type { Midia } from "@/lib/tipos";

import { PreviaDoCorte } from "./PreviaDoCorte";

const ORDENS: { id: Ordem; nome: string }[] = [
  { id: "nota", nome: "Maior nota" },
  { id: "video", nome: "Ordem do vídeo" },
  { id: "longos", nome: "Mais longos" },
  { id: "curtos", nome: "Mais curtos" },
];

const AVALIACOES: { id: FiltroDaAvaliacao; nome: string }[] = [
  { id: "todas", nome: "Todos" },
  { id: "gostei", nome: "Gostei" },
  { id: "nao_gostei", nome: "Não gostei" },
  { id: "sem", nome: "Sem avaliação" },
];

type Vista = "grade" | "lista";
const CHAVE_DA_VISTA = "takeone-clipar-vista";
const COR_PADRAO = "#ffd60a";

function corDaNota(nota: number | null): string {
  if (nota === null) return "bg-painel-3 text-suave";
  if (nota >= 80) return "bg-sucesso/20 text-sucesso";
  if (nota >= 60) return "bg-aviso/20 text-aviso";
  return "bg-painel-3 text-suave";
}

type PropsDoCartao = {
  corte: Corte;
  vista: Vista;
  /** Os títulos dos cortes, para o aviso "parecido com" e o "continua". */
  titulos: Map<string, string>;
  escolhido: boolean;
  /** A etapa enquanto este corte é montado ou exportado; null quando não é ele. */
  andamento: string | null;
  ocupado: boolean;
  previa: React.ReactNode;
  aoAvaliar: (avaliacao: Corte["avaliacao"]) => void;
  aoAbrir: () => void;
  aoExportar: () => void;
  aoBaixarSrt: () => void;
  aoDuplicar: () => void;
  aoContinuar: () => void;
  aoApagar: () => void;
  aoEscolher: (escolhido: boolean) => void;
};

function TituloDoCorte({ corte }: { corte: Corte }) {
  return (
    <p className="font-semibold leading-snug">
      {pedacosDoTitulo(corte.titulo, corte.foco).map((pedaco, i) =>
        pedaco.foco ? (
          <mark key={i} className="rounded bg-destaque/20 px-0.5 text-texto">
            {pedaco.texto}
          </mark>
        ) : (
          <span key={i}>{pedaco.texto}</span>
        ),
      )}
    </p>
  );
}

function NotasDoCorte({ corte, compactas }: { corte: Corte; compactas: boolean }) {
  const notas = corte.notas;
  if (!notas) return null;
  return (
    <div className={`grid gap-x-3 gap-y-2 ${compactas ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
      {CRITERIOS.map((criterio) => {
        const motivo = corte.motivos?.[criterio.id] ?? "";
        return (
          <div key={criterio.id} className="text-xs" title={`${criterio.dica} ${motivo}`.trim()}>
            <div className="flex justify-between">
              <span className="text-suave">{criterio.nome}</span>
              <span className="tabular-nums">{notas[criterio.id]}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-painel-3">
              <div className="h-full rounded-full bg-destaque" style={{ width: `${notas[criterio.id] * 10}%` }} />
            </div>
            {motivo && !compactas ? <p className="mt-1 line-clamp-2 text-[11px] text-apagado">{motivo}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

function BotaoIcone({ rotulo, aoClicar, desligado, ativo, children }: { rotulo: string; aoClicar: () => void; desligado?: boolean; ativo?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={`botao-icone size-8 ${ativo ?? ""}`} aria-label={rotulo} title={rotulo} disabled={desligado} onClick={aoClicar}>
      {children}
    </button>
  );
}

function CartaoDoCorte(props: PropsDoCartao) {
  const { corte, vista, titulos, escolhido, andamento, ocupado, previa } = props;
  const grade = vista === "grade";
  const parecidos = (corte.parecidos ?? []).filter((id) => titulos.has(id));
  return (
    <li className={`flex gap-3 rounded-xl border bg-painel p-3 ${escolhido ? "border-destaque" : "border-borda"} ${grade ? "flex-col" : "flex-row"}`}>
      <div className={`relative shrink-0 ${grade ? "w-full" : "w-28 sm:w-36"}`}>
        {previa}
        <label className="absolute left-1.5 top-1.5 flex size-6 cursor-pointer items-center justify-center rounded bg-black/60" title="Escolher">
          <input
            type="checkbox"
            className="size-3.5 accent-[var(--to-destaque)]"
            checked={escolhido}
            onChange={(evento) => props.aoEscolher(evento.target.checked)}
            aria-label={`Escolher “${corte.titulo}”`}
          />
        </label>
        <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1 text-[11px] tabular-nums text-white">{formatarTempo(corte.duracao)}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2.5">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-lg font-display text-base font-bold ${corDaNota(corte.nota)}`}
            title={corte.nota === null ? "Sem nota: o modelo não avaliou esta continuação" : "Nota de 0 a 100"}
          >
            {corte.nota ?? "—"}
          </span>
          <div className="min-w-0 flex-1">
            <TituloDoCorte corte={corte} />
            <p className="mt-0.5 text-xs text-suave">
              {CATEGORIAS[corte.categoria] ?? corte.categoria} · {corte.trechos.map((trecho) => `${formatarTempo(trecho.inicio)}–${formatarTempo(trecho.fim)}`).join(" + ")}
            </p>
          </div>
        </div>
        {corte.parte_de && titulos.has(corte.parte_de) ? <p className="text-xs text-suave">Continua “{titulos.get(corte.parte_de)}”.</p> : null}
        {corte.resumo ? <p className={`text-sm text-suave ${grade ? "line-clamp-3" : ""}`}>{corte.resumo}</p> : null}
        <NotasDoCorte corte={corte} compactas={grade} />
        {corte.propaganda ? (
          <p className="flex items-center gap-1.5 text-xs text-aviso">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> Parece ter propaganda ou uma chamada do vídeo original.
          </p>
        ) : null}
        {parecidos.length ? (
          <p className="flex items-start gap-1.5 text-xs text-aviso">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Parecido com {parecidos.map((id) => `“${titulos.get(id)}”`).join(", ")}.
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-1">
          <button type="button" className="botao-principal mr-1 px-3 py-1.5 text-sm" disabled={ocupado} onClick={props.aoAbrir}>
            {andamento ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Clapperboard className="size-4" aria-hidden />}
            {andamento ?? (corte.projeto_id ? "Abrir no editor" : "Montar e abrir")}
          </button>
          <BotaoIcone rotulo="Gostei" aoClicar={() => props.aoAvaliar(corte.avaliacao === "gostei" ? null : "gostei")} ativo={corte.avaliacao === "gostei" ? "text-sucesso" : ""}>
            <ThumbsUp className="size-4" aria-hidden />
          </BotaoIcone>
          <BotaoIcone rotulo="Não gostei" aoClicar={() => props.aoAvaliar(corte.avaliacao === "nao_gostei" ? null : "nao_gostei")} ativo={corte.avaliacao === "nao_gostei" ? "text-erro" : ""}>
            <ThumbsDown className="size-4" aria-hidden />
          </BotaoIcone>
          <BotaoIcone rotulo="Exportar o vídeo (1080p)" aoClicar={props.aoExportar} desligado={ocupado}>
            <Download className="size-4" aria-hidden />
          </BotaoIcone>
          <BotaoIcone rotulo="Baixar as legendas (.srt)" aoClicar={props.aoBaixarSrt}>
            <Captions className="size-4" aria-hidden />
          </BotaoIcone>
          <BotaoIcone rotulo="Duplicar" aoClicar={props.aoDuplicar} desligado={ocupado}>
            <Copy className="size-4" aria-hidden />
          </BotaoIcone>
          <BotaoIcone rotulo="Parte 2: o corte que continua a ideia" aoClicar={props.aoContinuar} desligado={ocupado}>
            <ListPlus className="size-4" aria-hidden />
          </BotaoIcone>
          <BotaoIcone rotulo="Apagar o corte" aoClicar={props.aoApagar} desligado={ocupado}>
            <Trash2 className="size-4" aria-hidden />
          </BotaoIcone>
        </div>
      </div>
    </li>
  );
}

/** O "Como quer a edição" como o modelo entendeu, valendo para todos os cortes montados daqui. */
function EdicaoPedida({ clipagem }: { clipagem: Clipagem }) {
  const plano = clipagem.plano_da_edicao!;
  const itens = descreverPlano(plano);
  return (
    <section className="flex flex-col gap-1.5 rounded-xl border border-destaque/40 bg-destaque/5 p-4 text-sm">
      <p className="flex items-center gap-1.5 font-semibold">
        <WandSparkles className="size-4 text-destaque" aria-hidden /> A edição de todos os cortes
      </p>
      <p className="text-xs text-suave">Você pediu: “{clipagem.opcoes.edicao}”</p>
      {itens.length ? (
        <ul className="list-inside list-disc text-xs">
          {itens.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-suave">O modelo não achou nada para mudar na edição de sempre.</p>
      )}
      {plano.nao_deu.length ? <p className="text-xs text-aviso">Não dá para fazer aqui: {plano.nao_deu.join("; ")}.</p> : null}
    </section>
  );
}

function Seletor<T extends string>({ rotulo, valor, opcoes, aoMudar }: { rotulo: string; valor: T; opcoes: { id: T; nome: string }[]; aoMudar: (valor: T) => void }) {
  return (
    <select className="campo w-auto" aria-label={rotulo} title={rotulo} value={valor} onChange={(evento) => aoMudar(evento.target.value as T)}>
      {opcoes.map((item) => (
        <option key={item.id} value={item.id}>
          {item.nome}
        </option>
      ))}
    </select>
  );
}

export function ListaDeCortes({ clipagemId }: { clipagemId: string }) {
  const router = useRouter();
  const [clipagem, setClipagem] = useState<Clipagem | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<Ordem>("nota");
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_PADRAO);
  const [vista, setVista] = useState<Vista>("grade");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [tocando, setTocando] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const marca = useMarca();
  const [andamento, setAndamento] = useState<{ corte: string; etapa: string } | null>(null);
  const [midia, setMidia] = useState<Midia | null>(null);
  const [rosto, setRosto] = useState<AmostraDoRosto[]>([]);
  const [fala, setFala] = useState<PalavraDaMidia[] | null>(null);
  const pedidoDaFala = useRef<Promise<PalavraDaMidia[]> | null>(null);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);

  useEffect(() => {
    try {
      const salva = localStorage.getItem(CHAVE_DA_VISTA);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage só existe depois de montar
      if (salva === "grade" || salva === "lista") setVista(salva);
    } catch {
      // Sem armazenamento: fica a grade
    }
  }, []);
  function mudarVista(nova: Vista) {
    setVista(nova);
    try {
      localStorage.setItem(CHAVE_DA_VISTA, nova);
    } catch {
      // Sem armazenamento: vale só agora
    }
  }

  useEffect(() => {
    verClipagem(clipagemId)
      .then((doc) => {
        setClipagem(doc);
        setErro("");
      })
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não encontrei a clipagem."));
  }, [clipagemId, versao]);

  // O vídeo (a cópia leve e as miniaturas da prévia) e o rosto, se já foi procurado (a prévia não pede a busca)
  const pronta = clipagem?.status === "pronta";
  const midiaId = clipagem?.midia_id;
  useEffect(() => {
    if (!pronta || !midiaId) return;
    chamarApi<Midia>(`/midias/${midiaId}`)
      .then(setMidia)
      .catch(() => setMidia(null));
    chamarApi<{ status: string; amostras: AmostraDoRosto[] }>(`/midias/${midiaId}/rosto`)
      .then((achado) => setRosto(achado.status === "pronto" ? achado.amostras : []))
      .catch(() => setRosto([]));
  }, [pronta, midiaId]);

  // Enquanto processa: os eventos dos jobs (a busca e a transcrição do vídeo) e, por garantia, a cada 5 s
  const processando = clipagem?.status === "processando";
  useEffect(() => {
    if (!processando) return;
    const intervalo = setInterval(() => setVersao((n) => n + 1), 5000);
    return () => clearInterval(intervalo);
  }, [processando]);
  useEventosJobs((job) => {
    if (!clipagem) return;
    if (job.entrada.clipagem_id === clipagem.id || (job.tipo === "transcricao" && job.entrada.midia_id === clipagem.midia_id)) setVersao((n) => n + 1);
  });

  /** A fala do vídeo inteiro, pedida uma vez (para as legendas das prévias e os .srt). */
  function carregarFala(): Promise<PalavraDaMidia[]> {
    if (!clipagem) return Promise.resolve([]);
    if (!pedidoDaFala.current) {
      const pedido = falaDaClipagem(clipagem.id, 0, clipagem.duracao + 1);
      pedidoDaFala.current = pedido;
      pedido.then(
        (palavras) => ativo.current && setFala(palavras),
        () => {
          pedidoDaFala.current = null;
        },
      );
    }
    return pedidoDaFala.current;
  }

  const formato = clipagem?.opcoes.formato ?? "9:16";
  const legendas = useMemo(() => {
    const mapa = new Map<string, Legenda[]>();
    if (!clipagem || !fala) return mapa;
    for (const corte of clipagem.cortes) mapa.set(corte.id, legendasDoCorte(corte, clipagem.midia_id, fala, formato));
    return mapa;
  }, [clipagem, fala, formato]);

  const cortes = useMemo(() => (clipagem ? ordenarCortes(filtrarCortes(clipagem.cortes, filtro), ordem) : []), [clipagem, filtro, ordem]);
  const titulos = useMemo(() => new Map((clipagem?.cortes ?? []).map((corte) => [corte.id, corte.titulo])), [clipagem]);
  const escolhidosVisiveis = cortes.filter((corte) => escolhidos.has(corte.id));

  function trocar(doc: Clipagem) {
    setClipagem(doc);
    // Os escolhidos que sumiram (apagados) saem da escolha
    setEscolhidos((atual) => new Set([...atual].filter((id) => doc.cortes.some((corte) => corte.id === id))));
  }

  async function avaliar(lista: Corte[], avaliacao: Corte["avaliacao"]) {
    if (!clipagem) return;
    const ids = new Set(lista.map((corte) => corte.id));
    setClipagem({ ...clipagem, cortes: clipagem.cortes.map((item) => (ids.has(item.id) ? { ...item, avaliacao } : item)) });
    try {
      let doc = clipagem;
      for (const corte of lista) doc = await avaliarCorte(clipagem.id, corte.id, avaliacao);
      if (ativo.current) setClipagem(doc);
    } catch {
      setVersao((n) => n + 1);
    }
  }

  async function abrir(corte: Corte) {
    if (!clipagem || andamento) return;
    setErro("");
    setAndamento({ corte: corte.id, etapa: "Preparando" });
    try {
      const id = await projetoDoCorte(clipagem, corte, marca, (etapa) => ativo.current && setAndamento({ corte: corte.id, etapa }), () => ativo.current);
      if (id && ativo.current) router.push(`/app/editor/${id}`);
    } catch (e) {
      if (ativo.current) setErro(e instanceof Error ? e.message : "Não consegui montar o corte.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  /** Monta (se preciso) e põe na fila do vídeo, um depois do outro. */
  async function exportar(lista: Corte[]) {
    if (!clipagem || andamento || !lista.length) return;
    setErro("");
    setAviso(null);
    let feitos = 0;
    try {
      for (const corte of lista) {
        setAndamento({ corte: corte.id, etapa: "Preparando" });
        const id = await exportarCorte(clipagem, corte, marca, (etapa) => ativo.current && setAndamento({ corte: corte.id, etapa }), () => ativo.current);
        if (!id || !ativo.current) return;
        feitos++;
      }
      setAviso(feitos === 1 ? "O corte está na fila do vídeo." : `${feitos} cortes estão na fila do vídeo.`);
    } catch (e) {
      if (ativo.current) setErro(e instanceof Error ? e.message : "Não consegui exportar o corte.");
    } finally {
      if (ativo.current) {
        setAndamento(null);
        // Os cortes montados agora ficam ligados aos projetos deles
        setVersao((n) => n + 1);
      }
    }
  }

  async function baixarSrt(lista: Corte[]) {
    if (!clipagem || !lista.length) return;
    setErro("");
    try {
      const palavras = await carregarFala();
      const arquivos = lista.map((corte) => ({ nome: nomeDeArquivo(corte.titulo, "srt"), texto: srtDoCorte(corte, clipagem.midia_id, palavras, formato) }));
      if (arquivos.length === 1) {
        baixarBlob(new Blob([arquivos[0].texto], { type: "application/x-subrip" }), arquivos[0].nome);
        return;
      }
      // Nomes repetidos (a cópia de um corte) ganham o número
      const usados = new Map<string, number>();
      const zip = zipSemCompressao(
        arquivos.map(({ nome, texto }) => {
          const vezes = (usados.get(nome) ?? 0) + 1;
          usados.set(nome, vezes);
          return { nome: vezes > 1 ? nome.replace(/\.srt$/, `-${vezes}.srt`) : nome, dados: new TextEncoder().encode(texto) };
        }),
      );
      baixarBlob(new Blob([zip], { type: "application/zip" }), nomeDeArquivo(`${clipagem.nome} legendas`, "zip"));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não consegui ler a fala do vídeo.");
    }
  }

  async function mudarLista(acao: () => Promise<Clipagem>, falhou: string) {
    setErro("");
    try {
      const doc = await acao();
      if (ativo.current) trocar(doc);
    } catch (e) {
      if (ativo.current) setErro(e instanceof ErroApi ? e.message : falhou);
    }
  }

  async function apagar(lista: Corte[]) {
    if (!clipagem || !lista.length) return;
    const pergunta = lista.length === 1 ? `Apagar o corte “${lista[0].titulo}”?` : `Apagar ${lista.length} cortes?`;
    if (!window.confirm(`${pergunta} Os projetos já montados continuam em Projetos.`)) return;
    await mudarLista(async () => {
      let doc = clipagem;
      for (const corte of lista) doc = await apagarCorte(clipagem.id, corte.id);
      return doc;
    }, "Não consegui apagar o corte.");
  }

  async function excluir() {
    if (!clipagem || !window.confirm("Excluir esta clipagem e os cortes dela? O vídeo continua na biblioteca.")) return;
    await excluirClipagem(clipagem.id).catch(() => undefined);
    router.push("/app/clipar");
  }

  function tocar(corte: Corte, sim: boolean) {
    if (sim) {
      setTocando(corte.id);
      void carregarFala().catch(() => undefined);
    } else setTocando((atual) => (atual === corte.id ? null : atual));
  }

  function escolher(corte: Corte, sim: boolean) {
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (sim) novo.add(corte.id);
      else novo.delete(corte.id);
      return novo;
    });
  }

  if (!clipagem) {
    return (
      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-5 py-8">
        {erro ? (
          <p className="flex items-center gap-2 text-erro">
            <AlertCircle className="size-4" aria-hidden /> {erro}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-suave">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando…
          </p>
        )}
      </main>
    );
  }

  const faixa = FAIXAS.find((item) => item.id === clipagem.opcoes.faixa)?.nome ?? "";
  const corDestaque = marca.cores[0] ?? COR_PADRAO;
  const filtrando = filtro.busca.trim() !== "" || filtro.avaliacao !== "todas" || filtro.duracao !== "todas";
  const todosEscolhidos = cortes.length > 0 && escolhidosVisiveis.length === cortes.length;
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8">
      <Link href="/app/clipar" className="inline-flex items-center gap-1 text-sm text-suave hover:text-texto">
        <ArrowLeft className="size-4" aria-hidden /> Clipar
      </Link>
      <TituloDaPagina
        titulo={clipagem.nome}
        descricao={`${formatarTempo(clipagem.duracao)} · ${clipagem.status === "pronta" ? `${clipagem.total_de_cortes} cortes` : "procurando os cortes"} · ${faixa}`}
      >
        <Link href={`/app/clipar/novo/${clipagem.midia_id}`} className="botao-secundario" title="A fala já transcrita é usada de novo">
          <RefreshCw className="size-4" aria-hidden /> Recriar com outras opções
        </Link>
        <button type="button" className="botao-secundario" onClick={() => void excluir()}>
          <Trash2 className="size-4" aria-hidden /> Excluir
        </button>
      </TituloDaPagina>

      {clipagem.plano_da_edicao ? <EdicaoPedida clipagem={clipagem} /> : null}

      {clipagem.status === "processando" ? (
        <section className="flex flex-col gap-3 rounded-xl border border-borda bg-painel p-5" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="size-4 animate-spin text-destaque" aria-hidden />
            {clipagem.andamento?.mensagem ?? "Na fila"}
          </p>
          <div className="h-2 rounded-full bg-painel-3">
            <div className="h-full rounded-full bg-destaque transition-all" style={{ width: `${clipagem.andamento?.progresso ?? 0}%` }} />
          </div>
          <p className="text-xs text-suave">
            {clipagem.andamento?.etapa === "transcricao" ? "Primeiro a fala é transcrita; depois o modelo lê e escolhe os momentos." : "O modelo lê a fala em pedaços e escolhe os momentos."} Pode sair
            desta página: os cortes ficam guardados aqui.
          </p>
        </section>
      ) : clipagem.status === "erro" ? (
        <section className="flex flex-col gap-2 rounded-xl border border-erro/40 bg-erro/10 p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-erro">
            <AlertCircle className="size-4" aria-hidden /> {clipagem.erro ?? "Não deu para achar os cortes."}
          </p>
          <Link href={`/app/clipar/novo/${clipagem.midia_id}`} className="text-sm text-destaque">
            Tentar com outras opções
          </Link>
        </section>
      ) : (
        <>
          {erro ? (
            <p className="flex items-center gap-2 text-sm text-erro" role="alert">
              <AlertCircle className="size-4" aria-hidden /> {erro}
            </p>
          ) : null}
          {aviso ? (
            <p className="flex flex-wrap items-center gap-2 rounded-lg border border-sucesso/40 bg-sucesso/10 px-3 py-2 text-sm" role="status">
              {aviso}
              <Link href="/app/exportados" className="font-medium text-destaque">
                Ver em Exportados
              </Link>
            </p>
          ) : null}

          <div className="flex flex-col gap-3 rounded-xl border border-borda bg-painel p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-suave" aria-hidden />
                <input
                  type="search"
                  className="campo w-full pl-8"
                  placeholder="Buscar nas falas e nos títulos"
                  aria-label="Buscar nas falas e nos títulos"
                  value={filtro.busca}
                  onChange={(evento) => setFiltro({ ...filtro, busca: evento.target.value })}
                />
              </label>
              <Seletor rotulo="Avaliação" valor={filtro.avaliacao} opcoes={AVALIACOES} aoMudar={(avaliacao) => setFiltro({ ...filtro, avaliacao })} />
              <Seletor<FiltroDaDuracao> rotulo="Duração" valor={filtro.duracao} opcoes={DURACOES_DO_FILTRO} aoMudar={(duracao) => setFiltro({ ...filtro, duracao })} />
              <Seletor rotulo="Ordenar" valor={ordem} opcoes={ORDENS} aoMudar={setOrdem} />
              <div className="flex rounded-lg border border-borda" role="group" aria-label="Vista">
                <BotaoIcone rotulo="Grade" aoClicar={() => mudarVista("grade")} ativo={vista === "grade" ? "bg-painel-3 text-texto" : ""}>
                  <LayoutGrid className="size-4" aria-hidden />
                </BotaoIcone>
                <BotaoIcone rotulo="Lista" aoClicar={() => mudarVista("lista")} ativo={vista === "lista" ? "bg-painel-3 text-texto" : ""}>
                  <List className="size-4" aria-hidden />
                </BotaoIcone>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1.5 text-suave">
                <input
                  type="checkbox"
                  className="accent-[var(--to-destaque)]"
                  checked={todosEscolhidos}
                  onChange={(evento) => setEscolhidos(evento.target.checked ? new Set(cortes.map((corte) => corte.id)) : new Set())}
                />
                {escolhidosVisiveis.length ? `${escolhidosVisiveis.length} escolhidos` : "Escolher todos"}
              </label>
              {escolhidosVisiveis.length ? (
                <>
                  <button type="button" className="botao-secundario px-2.5 py-1 text-xs" onClick={() => void avaliar(escolhidosVisiveis, "gostei")}>
                    <ThumbsUp className="size-3.5" aria-hidden /> Gostei
                  </button>
                  <button type="button" className="botao-secundario px-2.5 py-1 text-xs" onClick={() => void avaliar(escolhidosVisiveis, "nao_gostei")}>
                    <ThumbsDown className="size-3.5" aria-hidden /> Não gostei
                  </button>
                  <button type="button" className="botao-secundario px-2.5 py-1 text-xs" onClick={() => void baixarSrt(escolhidosVisiveis)}>
                    <Captions className="size-3.5" aria-hidden /> Baixar os .srt
                  </button>
                  <button type="button" className="botao-secundario px-2.5 py-1 text-xs" disabled={andamento !== null} onClick={() => void exportar(escolhidosVisiveis)}>
                    <Download className="size-3.5" aria-hidden /> Exportar
                  </button>
                  <button type="button" className="botao-secundario px-2.5 py-1 text-xs" disabled={andamento !== null} onClick={() => void apagar(escolhidosVisiveis)}>
                    <Trash2 className="size-3.5" aria-hidden /> Apagar
                  </button>
                  <button type="button" className="botao-icone size-7" aria-label="Limpar a escolha" title="Limpar a escolha" onClick={() => setEscolhidos(new Set())}>
                    <X className="size-3.5" aria-hidden />
                  </button>
                </>
              ) : null}
              <span className="ml-auto text-xs text-suave">{filtrando ? `${cortes.length} de ${clipagem.cortes.length} cortes` : `${clipagem.cortes.length} cortes`}</span>
            </div>
          </div>

          {cortes.length ? (
            <ul className={vista === "grade" ? "grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "flex flex-col gap-3"}>
              {cortes.map((corte) => (
                <CartaoDoCorte
                  key={corte.id}
                  corte={corte}
                  vista={vista}
                  titulos={titulos}
                  escolhido={escolhidos.has(corte.id)}
                  andamento={andamento?.corte === corte.id ? andamento.etapa : null}
                  ocupado={andamento !== null}
                  previa={
                    midia ? (
                      <PreviaDoCorte
                        corte={corte}
                        midia={midia}
                        formato={formato}
                        rosto={rosto}
                        legendas={legendas.get(corte.id) ?? null}
                        corDestaque={corDestaque}
                        tocando={tocando === corte.id}
                        aoTocar={(sim) => tocar(corte, sim)}
                      />
                    ) : (
                      <div className="w-full rounded-lg bg-painel-3" style={{ aspectRatio: formato.replace(":", " / ") }} />
                    )
                  }
                  aoAvaliar={(avaliacao) => void avaliar([corte], avaliacao)}
                  aoAbrir={() => void abrir(corte)}
                  aoExportar={() => void exportar([corte])}
                  aoBaixarSrt={() => void baixarSrt([corte])}
                  aoDuplicar={() => void mudarLista(() => duplicarCorte(clipagem.id, corte.id), "Não consegui duplicar o corte.")}
                  aoContinuar={() => void mudarLista(() => continuarCorte(clipagem.id, corte.id), "Não consegui fazer a parte 2.")}
                  aoApagar={() => void apagar([corte])}
                  aoEscolher={(sim) => escolher(corte, sim)}
                />
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-borda p-6 text-center text-sm text-suave">
              {clipagem.cortes.length ? "Nenhum corte com esses filtros." : "Nenhum corte nesta clipagem."}
            </p>
          )}
        </>
      )}
    </main>
  );
}
