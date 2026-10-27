"use client";

// A página de opções do Clipar (ADR 0004, 14.2): a estratégia (as prontas e as guardadas no espaço), a duração dos
// cortes, como quer a edição (em palavras), o trecho a analisar sobre a forma de onda, o gênero, o idioma, os
// momentos pedidos, um .srt no lugar da transcrição, o formato e quantos cortes, com o tempo estimado. As escolhas podem virar o padrão (no navegador).
import { AlertCircle, ArrowLeft, FileText, Loader2, Save, Scissors, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PreviaDaAnimacao } from "@/componentes/editor/PainelAnimacoes";
import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { arquivoDaMidia, chamarApi, ErroApi } from "@/lib/api";
import {
  type Estrategia,
  type EstrategiaDoEspaco,
  FAIXAS,
  filaDaPlaca,
  GENEROS,
  type LegendaDaFala,
  legendasDoArquivo,
  listarEstrategias,
  OPCOES_PADRAO,
  type OpcoesDaClipagem,
  pedirClipagem,
  picosDaOnda,
  tempoEstimado,
  tempoLegivel,
} from "@/lib/clipagens";
import { formatarTempo } from "@/lib/formatar";
import { enderecoDaPrevia } from "@/lib/legendasAnimadas";
import { lerNiveis } from "@/lib/niveis";
import { ESTILOS_ANIMADOS } from "@/lib/projeto/legendaAnimada";
import { criarRecurso, excluirRecurso, useRecursos } from "@/lib/recursos";
import type { Midia } from "@/lib/tipos";

const CHAVE_PADRAO = "takeone-clipar-padrao";
const FORMATOS: OpcoesDaClipagem["formato"][] = ["9:16", "1:1", "4:5", "16:9"];
const SUGESTOES_DE_EDICAO = ["legendas maiores", "legendas amarelas", "legenda no meio", "estilo karaokê", "sem título", "sem zoom", "palavras fortes em verde"];

function padraoGuardado(): OpcoesDaClipagem {
  try {
    const guardado = JSON.parse(localStorage.getItem(CHAVE_PADRAO) ?? "null") as Partial<OpcoesDaClipagem> | null;
    // O trecho é de cada vídeo: nunca vem do padrão
    return { ...OPCOES_PADRAO, ...(guardado ?? {}), inicio: 0, fim: null };
  } catch {
    return OPCOES_PADRAO;
  }
}

function Escolha({ ativo, children, aoEscolher }: { ativo: boolean; children: React.ReactNode; aoEscolher: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoEscolher}
      className={`rounded-lg border px-3 py-1.5 text-sm transition ${ativo ? "border-destaque bg-destaque/15 text-texto" : "border-borda text-suave hover:text-texto"}`}
    >
      {children}
    </button>
  );
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-borda bg-painel p-5">
      <div>
        <h2 className="font-display text-base font-semibold">{titulo}</h2>
        {descricao ? <p className="mt-0.5 text-xs text-suave">{descricao}</p> : null}
      </div>
      {children}
    </section>
  );
}

const COLUNAS_DA_ONDA = 240;

/** A forma de onda do vídeo, com o trecho a analisar aceso e o resto apagado. */
function FormaDeOnda({ midiaId, duracao, inicio, fim }: { midiaId: string; duracao: number; inicio: number; fim: number }) {
  const [picos, setPicos] = useState<number[] | null>(null);
  useEffect(() => {
    lerNiveis(midiaId)
      .then((niveis) => setPicos(picosDaOnda(niveis, COLUNAS_DA_ONDA)))
      .catch(() => setPicos(null));
  }, [midiaId]);
  if (!picos || duracao <= 0) return null;
  return (
    <svg viewBox={`0 0 ${COLUNAS_DA_ONDA} 40`} preserveAspectRatio="none" className="h-12 w-full" aria-hidden>
      {picos.map((pico, coluna) => {
        const t = ((coluna + 0.5) / COLUNAS_DA_ONDA) * duracao;
        const altura = Math.max(0.5, pico * 38);
        return <rect key={coluna} x={coluna + 0.15} y={20 - altura / 2} width={0.7} height={altura} className={t >= inicio && t <= fim ? "fill-destaque" : "fill-painel-3"} />;
      })}
    </svg>
  );
}

export function OpcoesDoClipar({ midiaId }: { midiaId: string }) {
  const router = useRouter();
  const [midia, setMidia] = useState<Midia | null>(null);
  const [transcrito, setTranscrito] = useState(false);
  const [estrategias, setEstrategias] = useState<Estrategia[]>([]);
  const [opcoes, setOpcoes] = useState<OpcoesDaClipagem>(OPCOES_PADRAO);
  const [salvarPadrao, setSalvarPadrao] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const guardadas = useRecursos<EstrategiaDoEspaco>("estrategia");
  const [guardadaEscolhida, setGuardadaEscolhida] = useState<string | null>(null);
  const [nomeDaEstrategia, setNomeDaEstrategia] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [legendas, setLegendas] = useState<{ nome: string; lista: LegendaDaFala[] } | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [naFrente, setNaFrente] = useState(0);

  useEffect(() => {
    chamarApi<Midia>(`/midias/${midiaId}`)
      .then((carregada) => {
        // O padrão guardado entra aqui, depois de montar: lido na renderização, o servidor e o navegador discordariam
        setOpcoes(padraoGuardado());
        setMidia(carregada);
      })
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não encontrei o vídeo."));
    chamarApi<{ status: string }>(`/midias/${midiaId}/transcricao`)
      .then((t) => setTranscrito(t.status === "pronta"))
      .catch(() => setTranscrito(false));
    listarEstrategias()
      .then(setEstrategias)
      .catch(() => setEstrategias([]));
    filaDaPlaca()
      .then((fila) => setNaFrente(fila.na_frente))
      .catch(() => setNaFrente(0));
  }, [midiaId]);

  const mudar = (parcial: Partial<OpcoesDaClipagem>) => setOpcoes((atual) => ({ ...atual, ...parcial }));
  const duracao = midia?.duracao ?? 0;
  const fim = opcoes.fim ?? duracao;
  const analisado = Math.max(0, fim - opcoes.inicio);
  const propria = opcoes.estrategia === "propria";
  const podeGerar = Boolean(midia) && midia!.status === "pronta" && analisado >= 60 && (!propria || opcoes.instrucoes.trim().length >= 10);

  async function guardarEstrategia() {
    const nome = nomeDaEstrategia.trim();
    if (!nome || guardando) return;
    setGuardando(true);
    try {
      const criada = await criarRecurso<EstrategiaDoEspaco>({ tipo: "estrategia", nome, dados: { instrucoes: opcoes.instrucoes, faixa: opcoes.faixa } });
      setGuardadaEscolhida(criada.id);
      setNomeDaEstrategia("");
      guardadas.recarregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não consegui guardar a estratégia.");
    } finally {
      setGuardando(false);
    }
  }

  async function excluirEstrategia(id: string) {
    await excluirRecurso(id).catch(() => undefined);
    if (guardadaEscolhida === id) setGuardadaEscolhida(null);
    guardadas.recarregar();
  }

  async function lerArquivoDeLegendas(arquivo: File) {
    try {
      const lista = legendasDoArquivo(new Uint8Array(await arquivo.arrayBuffer()));
      if (lista.length < 3) {
        setErro("Esse arquivo não tem legendas que deem para ler (o TakeOne lê .srt e .vtt).");
        return;
      }
      setErro("");
      setLegendas({ nome: arquivo.name, lista });
    } catch {
      setErro("Não consegui ler esse arquivo.");
    }
  }

  async function gerar() {
    if (!midia || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      if (salvarPadrao) {
        try {
          localStorage.setItem(CHAVE_PADRAO, JSON.stringify({ ...opcoes, inicio: 0, fim: null }));
        } catch {
          // Sem armazenamento (janela anônima), o padrão vale só agora
        }
      }
      const enviadas = { ...opcoes, fim: opcoes.fim !== null && opcoes.fim >= duracao - 0.5 ? null : opcoes.fim };
      const clipagem = await pedirClipagem(midia.id, enviadas, legendas?.lista);
      router.push(`/app/clipar/${clipagem.id}`);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não consegui pedir os cortes.");
      setEnviando(false);
    }
  }

  if (erro && !midia) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-8">
        <p className="flex items-center gap-2 text-erro">
          <AlertCircle className="size-4" aria-hidden /> {erro}
        </p>
        <Link href="/app/clipar" className="text-sm text-destaque">
          Voltar ao Clipar
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8">
      <Link href="/app/clipar" className="inline-flex items-center gap-1 text-sm text-suave hover:text-texto">
        <ArrowLeft className="size-4" aria-hidden /> Clipar
      </Link>
      <TituloDaPagina titulo="Gerar os cortes" descricao="Escolha como o TakeOne procura os momentos. Dá para refazer depois com outras opções." />
      {midia ? (
        <div className="flex items-center gap-3 rounded-xl border border-borda bg-painel p-3">
          {midia.arquivos.includes("capa.jpg") ? (
            // eslint-disable-next-line @next/next/no-img-element -- a capa da API, com a sessão do cookie
            <img src={arquivoDaMidia(midia.id, "capa.jpg")} alt="" className="aspect-video w-28 rounded-md object-cover" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate font-semibold">{midia.nome}</p>
            <p className="text-xs text-suave">
              {formatarTempo(duracao)}
              {legendas ? " · a fala vem do arquivo de legendas" : transcrito ? " · a fala já está transcrita" : ""}
            </p>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-suave">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando o vídeo…
        </p>
      )}

      <Secao titulo="O que procurar" descricao="A estratégia diz ao modelo que tipo de momento vale um corte.">
        <div className="grid gap-2 sm:grid-cols-2">
          {[...estrategias, { id: "propria" as const, nome: "Do meu jeito", faixa: "auto" as const, descricao: "Você escreve o que buscar e o estilo do título." }].map((estrategia) => (
            <button
              key={estrategia.id}
              type="button"
              aria-pressed={opcoes.estrategia === estrategia.id && !guardadaEscolhida}
              onClick={() => {
                // Sair de uma estratégia guardada para "Do meu jeito" começa o texto do zero
                if (estrategia.id === "propria" && guardadaEscolhida) mudar({ instrucoes: "" });
                setGuardadaEscolhida(null);
                mudar({ estrategia: estrategia.id });
              }}
              className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition ${opcoes.estrategia === estrategia.id && !guardadaEscolhida ? "border-destaque bg-destaque/10" : "border-borda hover:border-suave/60"}`}
            >
              <span className="text-sm font-semibold">{estrategia.nome}</span>
              <span className="text-xs text-suave">{estrategia.descricao}</span>
            </button>
          ))}
          {guardadas.recursos.map((guardada) => (
            <div
              key={guardada.id}
              className={`flex items-start gap-2 rounded-lg border p-3 transition ${guardadaEscolhida === guardada.id ? "border-destaque bg-destaque/10" : "border-borda hover:border-suave/60"}`}
            >
              <button
                type="button"
                aria-pressed={guardadaEscolhida === guardada.id}
                className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                onClick={() => {
                  setGuardadaEscolhida(guardada.id);
                  mudar({ estrategia: "propria", instrucoes: guardada.dados.instrucoes, faixa: guardada.dados.faixa });
                }}
              >
                <span className="text-sm font-semibold">{guardada.nome}</span>
                <span className="line-clamp-2 text-xs text-suave">{guardada.dados.instrucoes}</span>
              </button>
              <button
                type="button"
                className="botao-icone size-7 shrink-0"
                aria-label={`Excluir a estratégia ${guardada.nome}`}
                title="Excluir do espaço"
                onClick={() => void excluirEstrategia(guardada.id)}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          {propria ? "O que buscar e o estilo do título" : "Algo a mais? (opcional)"}
          <textarea
            aria-label="O que buscar e o estilo do título"
            maxLength={500}
            rows={2}
            className="rounded-lg border border-borda bg-painel-2 p-2 text-sm"
            placeholder="Ex.: os momentos em que ele conta da família; títulos curtos, em forma de pergunta."
            value={opcoes.instrucoes}
            onChange={(e) => {
              setGuardadaEscolhida(null);
              mudar({ instrucoes: e.target.value });
            }}
          />
        </label>
        {propria && !guardadaEscolhida && opcoes.instrucoes.trim().length >= 10 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input
              aria-label="Nome da estratégia"
              maxLength={60}
              className="min-w-0 flex-1 rounded-lg border border-borda bg-painel-2 p-2 text-sm"
              placeholder="Dê um nome para usar de novo (ex.: Cortes do culto)"
              value={nomeDaEstrategia}
              onChange={(e) => setNomeDaEstrategia(e.target.value)}
            />
            <button type="button" className="botao-secundario" disabled={!nomeDaEstrategia.trim() || guardando} onClick={() => void guardarEstrategia()}>
              <Save className="size-4" aria-hidden /> Guardar no espaço
            </button>
          </div>
        ) : null}
        <label className="flex flex-col gap-1 text-sm">
          Incluir momentos específicos (opcional)
          <input
            aria-label="Momentos específicos"
            maxLength={300}
            className="rounded-lg border border-borda bg-painel-2 p-2 text-sm"
            placeholder="Ex.: quando falam de dinheiro"
            value={opcoes.momentos}
            onChange={(e) => mudar({ momentos: e.target.value })}
          />
        </label>
      </Secao>

      <Secao
        titulo="Como quer a edição"
        descricao="Escreva do seu jeito: o modelo transforma em legendas, título, zooms e enquadramento de todos os cortes. Dentro do editor dá para pedir mais em cada corte."
      >
        <textarea
          aria-label="Como quer a edição"
          maxLength={500}
          rows={2}
          className="rounded-lg border border-borda bg-painel-2 p-2 text-sm"
          placeholder="Ex.: legendas amarelas e maiores no meio da tela, sem título, zoom quando ele falar de dinheiro."
          value={opcoes.edicao}
          onChange={(e) => mudar({ edicao: e.target.value })}
        />
        <div className="flex flex-wrap gap-1.5">
          {SUGESTOES_DE_EDICAO.map((sugestao) => (
            <button
              key={sugestao}
              type="button"
              className="rounded-full border border-borda px-2.5 py-1 text-xs text-suave hover:text-texto"
              onClick={() => mudar({ edicao: [opcoes.edicao.trim().replace(/[.,;]$/, ""), sugestao].filter(Boolean).join(", ").slice(0, 500) })}
            >
              + {sugestao}
            </button>
          ))}
        </div>
      </Secao>

      <Secao titulo="Legenda animada" descricao="As legendas de cada corte gravadas com a palavra entrando no ritmo da fala, e a palavra forte destacada.">
        <div className="flex flex-wrap gap-2">
          <Escolha ativo={opcoes.legenda_animada === null} aoEscolher={() => mudar({ legenda_animada: null })}>
            Sem animação
          </Escolha>
          {ESTILOS_ANIMADOS.map((estilo) => (
            <Escolha key={estilo.id} ativo={opcoes.legenda_animada === estilo.id} aoEscolher={() => mudar({ legenda_animada: estilo.id })}>
              {estilo.nome}
            </Escolha>
          ))}
        </div>
        {opcoes.legenda_animada ? (
          <div className="w-32">
            <PreviaDaAnimacao endereco={enderecoDaPrevia(opcoes.legenda_animada, opcoes.formato, {}, 0.72)} proporcao={opcoes.formato} alturaMaxima={240} />
          </div>
        ) : null}
      </Secao>

      <Secao titulo="Duração de cada corte">
        <div className="flex flex-wrap gap-2">
          {FAIXAS.map((faixa) => (
            <Escolha key={faixa.id} ativo={opcoes.faixa === faixa.id} aoEscolher={() => mudar({ faixa: faixa.id })}>
              {faixa.nome}
            </Escolha>
          ))}
        </div>
      </Secao>

      <Secao titulo="Trecho do vídeo" descricao="Só o trecho escolhido é analisado: tire a abertura e o encerramento para ir mais rápido.">
        <div className="flex flex-col gap-2">
          {midia ? <FormaDeOnda midiaId={midia.id} duracao={duracao} inicio={opcoes.inicio} fim={fim} /> : null}
          <label className="flex items-center gap-3 text-sm">
            <span className="w-14 text-suave">Começo</span>
            <input
              type="range"
              aria-label="Começo do trecho"
              min={0}
              max={Math.max(0, duracao)}
              step={1}
              value={opcoes.inicio}
              onChange={(e) => mudar({ inicio: Math.min(Number(e.target.value), Math.max(0, fim - 60)) })}
              className="flex-1"
            />
            <span className="w-16 text-right tabular-nums">{formatarTempo(opcoes.inicio)}</span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <span className="w-14 text-suave">Fim</span>
            <input
              type="range"
              aria-label="Fim do trecho"
              min={0}
              max={Math.max(0, duracao)}
              step={1}
              value={fim}
              onChange={(e) => mudar({ fim: Math.max(Number(e.target.value), Math.min(duracao, opcoes.inicio + 60)) })}
              className="flex-1"
            />
            <span className="w-16 text-right tabular-nums">{formatarTempo(fim)}</span>
          </label>
          <p className="text-xs text-suave">Analisa {formatarTempo(analisado)} de {formatarTempo(duracao)}.</p>
        </div>
      </Secao>

      <Secao titulo="Mais opções">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Tipo de vídeo
            <select aria-label="Tipo de vídeo" className="rounded-lg border border-borda bg-painel-2 p-2 text-sm" value={opcoes.genero} onChange={(e) => mudar({ genero: e.target.value })}>
              {GENEROS.map((genero) => (
                <option key={genero.id} value={genero.id}>
                  {genero.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Idioma da fala
            <select
              aria-label="Idioma da fala"
              className="rounded-lg border border-borda bg-painel-2 p-2 text-sm"
              value={opcoes.idioma}
              onChange={(e) => mudar({ idioma: e.target.value as OpcoesDaClipagem["idioma"] })}
            >
              <option value="auto">Descobrir sozinho</option>
              <option value="pt">Português</option>
              <option value="en">Inglês</option>
              <option value="es">Espanhol</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Quantos cortes, no máximo
            <input
              type="number"
              aria-label="Quantos cortes, no máximo"
              min={1}
              max={50}
              placeholder="Automático (uns 2 por minuto)"
              className="rounded-lg border border-borda bg-painel-2 p-2 text-sm"
              value={opcoes.maximo ?? ""}
              onChange={(e) => mudar({ maximo: e.target.value ? Math.max(1, Math.min(50, Number(e.target.value))) : null })}
            />
          </label>
          <div className="flex flex-col gap-1 text-sm">
            Formato dos cortes
            <div className="flex flex-wrap gap-2">
              {FORMATOS.map((formato) => (
                <Escolha key={formato} ativo={opcoes.formato === formato} aoEscolher={() => mudar({ formato })}>
                  {formato}
                </Escolha>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1 text-sm">
          Legendas próprias (opcional)
          {legendas ? (
            <div className="flex items-center gap-2 rounded-lg border border-borda bg-painel-2 p-2">
              <FileText className="size-4 text-destaque" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {legendas.nome} · {legendas.lista.length} legendas
              </span>
              <button type="button" className="botao-icone size-7" aria-label="Tirar o arquivo de legendas" onClick={() => setLegendas(null)}>
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : (
            <button type="button" className="botao-secundario self-start" onClick={() => arquivoRef.current?.click()}>
              <FileText className="size-4" aria-hidden /> Usar um .srt no lugar da transcrição
            </button>
          )}
          <input
            ref={arquivoRef}
            type="file"
            accept=".srt,.vtt,text/vtt,application/x-subrip"
            className="hidden"
            aria-label="Arquivo de legendas"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              e.target.value = "";
              if (arquivo) void lerArquivoDeLegendas(arquivo);
            }}
          />
          <p className="text-xs text-suave">
            Com as legendas do vídeo em mãos, os cortes saem sem esperar a transcrição; o tempo de cada palavra é repartido dentro da legenda dela.
          </p>
        </div>
      </Secao>

      {erro ? (
        <p className="flex items-start gap-2 text-sm text-erro" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {erro}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 rounded-xl border border-borda bg-painel p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p>
            Deve levar <strong>{tempoLegivel(tempoEstimado(analisado, transcrito || Boolean(legendas)))}</strong> na sua máquina.
          </p>
          {naFrente > 0 ? (
            <p className="text-xs text-aviso">
              {naFrente === 1 ? "Há 1 pedido" : `Há ${naFrente} pedidos`} na frente na placa de vídeo: a clipagem começa quando {naFrente === 1 ? "ele terminar" : "eles terminarem"}.
            </p>
          ) : null}
          <label className="mt-1 flex items-center gap-2 text-xs text-suave">
            <input type="checkbox" checked={salvarPadrao} onChange={(e) => setSalvarPadrao(e.target.checked)} /> Usar estas opções como padrão
          </label>
        </div>
        <button type="button" className="botao-principal justify-center" disabled={!podeGerar || enviando} onClick={() => void gerar()}>
          {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Scissors className="size-4" aria-hidden />}
          Gerar os cortes
        </button>
      </div>
    </main>
  );
}
