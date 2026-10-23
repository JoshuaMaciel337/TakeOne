"use client";

import { Check, ChevronLeft, Download, Image as ImageIcon, LayoutTemplate, LoaderCircle, PaintBucket, Redo2, Shapes, Sparkles, Type, Undo2, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { BotaoTema } from "@/componentes/BotaoTema";
import { Simbolo } from "@/componentes/Logo";
import { CampoCor } from "@/componentes/editor/CampoCor";
import { contextoDasMidias } from "@/componentes/editor/contexto";
import { PainelFormas } from "@/componentes/editor/PainelFormas";
import { PainelPropriedades } from "@/componentes/editor/PainelPropriedades";
import { MiniaturaDoEstilo } from "@/componentes/editor/PainelTexto";
import { useProjeto } from "@/componentes/editor/useProjeto";
import { MiniaturaDeImagem } from "@/componentes/hub/CartaoModelo";
import { Redirecionar } from "@/componentes/projeto/Redirecionar";
import { ListaEnvios } from "@/componentes/midia/ListaEnvios";
import { ZonaDeEnvio } from "@/componentes/midia/ZonaDeEnvio";
import { arquivoDaMidia } from "@/lib/api";
import { criarForma } from "@/lib/elementos";
import { enderecoDoProjeto } from "@/lib/hub";
import { useMarca } from "@/lib/marca";
import type { Comando } from "@/lib/projeto/comandos";
import { executarComando } from "@/lib/projeto/comandos";
import { camadasDaImagem, problemaNoTamanho, type RetanguloDaImagem, TAMANHOS_PRONTOS, tamanhoDaImagem } from "@/lib/projeto/imagem";
import { acharClipe, type Transformacao } from "@/lib/projeto/modelo";
import { camadasDoModelo, fundoDoModelo, type MidiasDoModelo, MODELOS_DE_IMAGEM, type ModeloDeImagem, modeloDeImagem, pedidosDoModelo } from "@/lib/projeto/modelosDeImagem";
import { ESTILOS_DE_TEXTO, TEXTO_PADRAO } from "@/lib/projeto/texto";
import type { Midia } from "@/lib/tipos";
import { useMidias } from "@/lib/useMidias";

import { JanelaEscolherImagem } from "./JanelaEscolherImagem";
import { JanelaExportarImagem } from "./JanelaExportarImagem";
import { PainelCamadas } from "./PainelCamadas";
import { PainelFotoIA } from "./PainelFotoIA";
import { PainelObjeto } from "./PainelObjeto";
import { useObjeto } from "./useObjeto";
import { PreviaDaImagem } from "./PreviaDaImagem";

type Ferramenta = "modelos" | "imagens" | "objeto" | "ia" | "texto" | "elementos" | "fundo";
const FERRAMENTAS: { id: Ferramenta; nome: string; icone: typeof ImageIcon }[] = [
  { id: "modelos", nome: "Modelos", icone: LayoutTemplate },
  { id: "imagens", nome: "Imagens", icone: ImageIcon },
  { id: "objeto", nome: "Objeto", icone: WandSparkles },
  { id: "ia", nome: "Foto com IA", icone: Sparkles },
  { id: "texto", nome: "Texto", icone: Type },
  { id: "elementos", nome: "Elementos", icone: Shapes },
  { id: "fundo", nome: "Fundo e tamanho", icone: PaintBucket },
];
const SEM_SEGUIR = {
  marcando: null,
  andamento: null,
  aoIniciar: () => undefined,
};
const NADA = () => undefined;

/** O editor de imagem: o mesmo projeto, desfazer e salvamento do editor de vídeo, com camadas no lugar da linha do tempo. */
export function EditorDeImagem({ projetoId, modeloInicial }: { projetoId: string; modeloInicial?: string }) {
  const router = useRouter();
  const marca = useMarca();
  const biblioteca = useMidias();
  const midias = useMemo(() => new Map((biblioteca.midias ?? []).map((midia) => [midia.id, midia])), [biblioteca.midias]);
  const ctx = useMemo(() => contextoDasMidias(midias), [midias]);
  const edicao = useProjeto(projetoId, ctx);
  const { projeto, executar: executarNoProjeto, desfazer, refazer, mostrarAviso } = edicao;
  const [ferramenta, setFerramenta] = useState<Ferramenta>(modeloInicial ? "modelos" : "imagens");
  const [selecao, definirSelecao] = useState<string[]>([]);
  const [exportando, setExportando] = useState(false);
  const [provisorio, setProvisorio] = useState<Comando | null>(null);
  // As mídias pedidas (as formas) entram como camada quando ficam prontas; a troca de cor de uma forma também espera
  const pendentes = useRef(new Map<string, { trocar?: string[]; camadaDe?: string }>());
  // O modelo escolhido espera as formas dele aparecerem na biblioteca, como as formas avulsas
  const modeloPendente = useRef<{ modelo: ModeloDeImagem; cores: string[]; midias: Record<string, Midia> } | null>(null);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [trocando, setTrocando] = useState<string | null>(null);
  const [recorte, setRecorte] = useState<{ retangulo: RetanguloDaImagem; proporcao: number | null } | null>(null);
  const modeloDoEndereco = useRef(false);

  const setSelecao = useCallback((ids: string[]) => {
    const ativo = document.activeElement;
    if (ativo instanceof HTMLElement && ativo.matches("input, textarea, select")) ativo.blur();
    definirSelecao(ids);
  }, []);
  const executar = useCallback(
    (comando: Comando) => {
      const resultado = executarNoProjeto(comando);
      if (resultado?.selecao) setSelecao(resultado.selecao);
      return resultado;
    },
    [executarNoProjeto, setSelecao],
  );
  const projetoNaTela = useMemo(() => {
    if (!projeto || !provisorio) return projeto;
    try {
      return executarComando(projeto, provisorio, ctx).projeto;
    } catch {
      return projeto;
    }
  }, [projeto, provisorio, ctx]);
  const preverDoPainel = (comando: Comando | null) => {
    if (comando !== null || !provisorio) {
      setProvisorio(comando);
      return;
    }
    setProvisorio(null);
    if (JSON.stringify(projetoNaTela) !== JSON.stringify(projeto)) executar(provisorio);
  };

  /** Pede as formas do modelo (e o lugar das fotos); o modelo entra quando todas aparecem na biblioteca. */
  const aplicarModelo = (modelo: ModeloDeImagem) => {
    setAplicando(modelo.id);
    const cores = marca.cores;
    Promise.all(pedidosDoModelo(modelo, cores, new Set()).map(({ chave, forma }) => criarForma(forma).then((midia) => [chave, midia] as const)))
      .then((lista) => {
        modeloPendente.current = { modelo, cores, midias: Object.fromEntries(lista) };
        void biblioteca.recarregar();
      })
      .catch((e: unknown) => {
        mostrarAviso(e instanceof Error ? e.message : "Não foi possível aplicar o modelo agora.");
        setAplicando(null);
      });
  };

  const resolverPendentes = useEffectEvent(() => {
    const pendente = modeloPendente.current;
    if (pendente && Object.values(pendente.midias).every((midia) => midias.get(midia.id)?.status === "pronta")) {
      modeloPendente.current = null;
      setAplicando(null);
      const doModelo: MidiasDoModelo = {};
      for (const [chave, midia] of Object.entries(pendente.midias)) doModelo[chave] = { id: midia.id, largura: midia.video?.largura ?? 1, altura: midia.video?.altura ?? 1 };
      executar({
        comando: "imagem.aplicarModelo",
        parametros: { camadas: camadasDoModelo(pendente.modelo, pendente.cores, doModelo), tamanho: pendente.modelo.tamanho, fundo: fundoDoModelo(pendente.modelo, pendente.cores) },
      });
    }
    for (const [id, acao] of pendentes.current) {
      const midia = midias.get(id);
      if (!midia || midia.status === "processando" || midia.status === "enviando") continue;
      pendentes.current.delete(id);
      if (midia.status === "erro") mostrarAviso(`"${midia.nome}" não ficou pronta: ${midia.erro ?? "erro desconhecido"}`);
      else if (acao.camadaDe)
        executar({
          comando: "imagem.camadaComOutraMidia",
          parametros: { faixaId: acao.camadaDe, midiaId: id },
        });
      else if (acao.trocar)
        executar({
          comando: "clipe.trocarMidia",
          parametros: { clipeIds: acao.trocar, midiaId: id },
        });
      else
        executar({
          comando: "imagem.adicionarMidia",
          parametros: { midiaId: id },
        });
    }
  });
  useEffect(() => {
    if (pendentes.current.size || modeloPendente.current) resolverPendentes();
  }, [midias]);

  // O modelo escolhido na biblioteca (?modelo=): entra uma vez, na imagem ainda vazia, e sai do endereço
  const aplicarDoEndereco = useEffectEvent(() => {
    if (modeloDoEndereco.current || !projeto || !modeloInicial) return;
    modeloDoEndereco.current = true;
    router.replace(`/app/imagem/${projetoId}`);
    const modelo = modeloDeImagem(modeloInicial);
    // Depois do efeito: aplicar muda o estado (o modelo sendo aplicado)
    if (modelo && camadasDaImagem(projeto).length === 0) void Promise.resolve().then(() => aplicarModelo(modelo));
  });
  useEffect(() => {
    if (projeto) aplicarDoEndereco();
  }, [projeto]);

  const selecaoValida = projeto ? selecao.filter((id) => acharClipe(projeto, id)) : [];
  const selecionado = projetoNaTela && selecaoValida.length === 1 ? acharClipe(projetoNaTela, selecaoValida[0]) : null;
  const midiaDoClipe = selecionado?.clipe.midia_id ? (midias.get(selecionado.clipe.midia_id) ?? null) : null;
  const objeto = useObjeto(selecionado?.clipe ?? null, midiaDoClipe);

  const teclas = useEffectEvent((evento: KeyboardEvent) => {
    if (!projeto || exportando) return;
    const alvo = evento.target as HTMLElement;
    if (alvo.matches("input, textarea, select, [contenteditable]")) return;
    const ctrl = evento.ctrlKey || evento.metaKey;
    const tecla = evento.key.toLowerCase();
    const camada = selecionado ? camadasDaImagem(projeto).find(({ clipe }) => clipe.id === selecionado.clipe.id) : undefined;
    if (ctrl && tecla === "z" && !evento.shiftKey) desfazer();
    else if (ctrl && (tecla === "y" || (tecla === "z" && evento.shiftKey))) refazer();
    else if (ctrl && tecla === "d" && camada)
      executar({
        comando: "imagem.duplicar",
        parametros: { faixaId: camada.faixa.id },
      });
    else if ((tecla === "delete" || tecla === "backspace") && camada)
      executar({
        comando: "imagem.apagar",
        parametros: { faixaId: camada.faixa.id },
      });
    else if (tecla === "escape") setSelecao([]);
    else if (camada && evento.key.startsWith("Arrow")) {
      // Um pixel da imagem por toque (dez com Shift), em frações do quadro
      const { largura, altura } = tamanhoDaImagem(projeto);
      const passo = evento.shiftKey ? 10 : 1;
      const t = camada.clipe.transformacao;
      const mudanca: Partial<Transformacao> =
        evento.key === "ArrowLeft"
          ? { x: t.x - passo / largura }
          : evento.key === "ArrowRight"
            ? { x: t.x + passo / largura }
            : evento.key === "ArrowUp"
              ? { y: t.y - passo / altura }
              : { y: t.y + passo / altura };
      executar({
        comando: "clipe.transformar",
        parametros: { clipeIds: [camada.clipe.id], transformacao: mudanca },
      });
    } else return;
    evento.preventDefault();
  });
  useEffect(() => {
    const ouvir = (evento: KeyboardEvent) => teclas(evento);
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, []);

  if (edicao.erroCarga) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-fundo p-6 text-center">
        <p className="text-sm">{edicao.erroCarga}</p>
        <Link href="/app" className="botao-secundario px-3 py-1.5">
          Voltar ao início
        </Link>
      </div>
    );
  }
  if (!projeto || !projetoNaTela) {
    return (
      <div className="flex h-dvh items-center justify-center gap-2 bg-fundo text-sm text-suave">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Abrindo a imagem…
      </div>
    );
  }
  if (projeto.tipo !== "imagem") return <Redirecionar para={enderecoDoProjeto({ id: projetoId, tipo: projeto.tipo })} />;

  const imagensProntas = (biblioteca.midias ?? []).filter((midia) => midia.imagem && !midia.elemento && !midia.animacao);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-fundo text-texto">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-borda bg-painel px-2 sm:px-3">
        <Link href="/app" className="flex shrink-0 items-center gap-1 rounded-md px-1 py-1 text-suave transition hover:text-texto" title="Voltar ao início">
          <ChevronLeft className="size-4" aria-hidden />
          <Simbolo tamanho={22} />
        </Link>
        <input
          id="nome-projeto"
          value={edicao.nome}
          onChange={(evento) => edicao.renomear(evento.currentTarget.value)}
          aria-label="Nome da imagem"
          maxLength={120}
          className="min-w-0 max-w-64 flex-1 rounded-md bg-transparent px-2 py-1 text-sm font-medium outline-none hover:bg-painel-2 focus:bg-painel-2"
        />
        <span className="hidden items-center gap-1 text-xs text-suave sm:flex">
          {edicao.salvamento === "salvo" ? <Check className="size-3.5" aria-hidden /> : <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
          {edicao.salvamento === "salvo"
            ? "Salvo"
            : edicao.salvamento === "conflito"
              ? "Alterado em outra aba"
              : edicao.salvamento === "erro"
                ? "Não foi possível salvar"
                : edicao.salvamento === "sem-conexao"
                  ? "Sem conexão"
                  : "Salvando…"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="botao-icone"
            onClick={desfazer}
            disabled={!edicao.nomeDesfazer}
            aria-label="Desfazer"
            title={edicao.nomeDesfazer ? `Desfazer: ${edicao.nomeDesfazer} (Ctrl+Z)` : "Nada para desfazer"}
          >
            <Undo2 className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            className="botao-icone"
            onClick={refazer}
            disabled={!edicao.nomeRefazer}
            aria-label="Refazer"
            title={edicao.nomeRefazer ? `Refazer: ${edicao.nomeRefazer}` : "Nada para refazer"}
          >
            <Redo2 className="size-4" aria-hidden />
          </button>
          <BotaoTema />
          <button type="button" className="botao-principal shrink-0 px-3 py-1.5" onClick={() => setExportando(true)} title="Exportar em PNG, JPG ou WebP">
            <Download className="size-4" aria-hidden />
            <span className="hidden sm:inline">Exportar</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 max-md:flex-col max-md:overflow-y-auto">
        <nav
          aria-label="Ferramentas"
          className="z-10 flex shrink-0 gap-1 border-borda bg-painel p-1.5 max-md:sticky max-md:bottom-0 max-md:order-last max-md:border-t md:w-[72px] md:flex-col md:border-r"
        >
          {FERRAMENTAS.map((item) => {
            const Icone = item.icone;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFerramenta(item.id)}
                aria-pressed={ferramenta === item.id}
                className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] transition md:flex-none ${ferramenta === item.id ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`}
              >
                <Icone className="size-5" aria-hidden />
                {item.nome}
              </button>
            );
          })}
        </nav>

        <aside
          aria-label={FERRAMENTAS.find((item) => item.id === ferramenta)!.nome}
          className="flex shrink-0 flex-col border-borda bg-painel max-md:border-b md:min-h-0 md:w-72 md:border-r"
        >
          <h2 className="border-b border-borda px-3 py-2.5 text-sm font-semibold">{FERRAMENTAS.find((item) => item.id === ferramenta)!.nome}</h2>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {ferramenta === "modelos" ? (
              <div className="flex flex-col gap-3">
                <p className="text-[11px] text-suave">O modelo entra por cima do que já existe, com o tamanho e o fundo dele, nas cores do kit de marca. Depois, troque as fotos e os textos.</p>
                <div className="grid grid-cols-2 gap-2">
                  {MODELOS_DE_IMAGEM.map((modelo) => (
                    <button
                      key={modelo.id}
                      type="button"
                      disabled={aplicando !== null}
                      onClick={() => aplicarModelo(modelo)}
                      title={modelo.descricao}
                      className="flex flex-col gap-1 rounded-lg border border-borda bg-painel-2 p-1.5 text-left transition hover:border-destaque disabled:opacity-60"
                    >
                      <span className="relative flex h-24 items-center justify-center">
                        <MiniaturaDeImagem modeloId={modelo.id} />
                        {aplicando === modelo.id ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <LoaderCircle className="size-5 animate-spin text-white" aria-label="Aplicando" />
                          </span>
                        ) : null}
                      </span>
                      <span className="truncate text-[11px] font-medium">{modelo.nome}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : ferramenta === "objeto" ? (
              <PainelObjeto
                objeto={objeto}
                aoPedir={(acao, midia) => {
                  if (!selecionado) return;
                  // Apagado: a foto da camada é trocada; recortado: entra uma camada nova por cima, no mesmo lugar
                  pendentes.current.set(midia.id, acao === "apagar" ? { trocar: [selecionado.clipe.id] } : { camadaDe: selecionado.faixa.id });
                  void biblioteca.recarregar();
                  mostrarAviso(acao === "apagar" ? "Apagando o objeto: a foto troca quando ficar pronta." : "Recortando o objeto: ele entra numa camada nova quando ficar pronto.");
                }}
              />
            ) : ferramenta === "ia" ? (
              <PainelFotoIA
                foto={midiaDoClipe?.imagem && !midiaDoClipe.elemento && !midiaDoClipe.animacao ? midiaDoClipe : null}
                quadro={tamanhoDaImagem(projetoNaTela)}
                aoPedir={(acao, midia) => {
                  if (!selecionado) return;
                  // Ampliada: a foto da camada é trocada; expandida: entra uma camada nova com tudo da camada
                  pendentes.current.set(midia.id, acao === "ampliar" ? { trocar: [selecionado.clipe.id] } : { camadaDe: selecionado.faixa.id });
                  void biblioteca.recarregar();
                  mostrarAviso(acao === "ampliar" ? "Ampliando a foto: ela troca quando ficar pronta." : "Expandindo a foto: ela entra numa camada nova quando ficar pronta.");
                }}
              />
            ) : ferramenta === "imagens" ? (
              <div className="flex flex-col gap-3">
                <ZonaDeEnvio compacta />
                <ListaEnvios />
                {biblioteca.erro ? <AvisoErro>{biblioteca.erro}</AvisoErro> : null}
                {imagensProntas.length ? (
                  <p className="text-[11px] text-suave">Clique numa imagem para pôr como camada.</p>
                ) : (
                  <p className="text-[11px] text-suave">Envie fotos, logos e PNGs com fundo transparente.</p>
                )}
                <div className="grid grid-cols-3 gap-1.5">
                  {imagensProntas.map((midia: Midia) => (
                    <button
                      key={midia.id}
                      type="button"
                      disabled={midia.status !== "pronta"}
                      onClick={() =>
                        executar({
                          comando: "imagem.adicionarMidia",
                          parametros: { midiaId: midia.id },
                        })
                      }
                      title={midia.nome}
                      className="aspect-square overflow-hidden rounded-md border border-borda bg-painel-3 transition hover:border-destaque disabled:opacity-50"
                    >
                      {midia.status === "pronta" ? (
                        // eslint-disable-next-line @next/next/no-img-element -- capa da API com a sessão do cookie
                        <img src={arquivoDaMidia(midia.id, "capa.jpg")} alt={midia.nome} className="size-full object-cover" loading="lazy" />
                      ) : (
                        <LoaderCircle className="m-auto size-4 animate-spin text-suave" aria-label="Preparando" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : ferramenta === "texto" ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="botao-principal px-3 py-1.5"
                  onClick={() =>
                    executar({
                      comando: "imagem.adicionarTexto",
                      parametros: { texto: TEXTO_PADRAO },
                    })
                  }
                >
                  <Type className="size-4" aria-hidden /> Texto em branco
                </button>
                <p className="text-[11px] text-suave">Estilos prontos</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {ESTILOS_DE_TEXTO.map((estilo) => (
                    <button
                      key={estilo.id}
                      type="button"
                      onClick={() =>
                        executar({
                          comando: "imagem.adicionarTexto",
                          parametros: { texto: estilo.texto },
                        })
                      }
                      className="flex h-16 items-center justify-center rounded-md border border-borda bg-painel-3 p-1 transition hover:border-destaque"
                      title={estilo.nome}
                    >
                      <MiniaturaDoEstilo texto={estilo.texto} nome={estilo.nome} />
                    </button>
                  ))}
                </div>
              </div>
            ) : ferramenta === "elementos" ? (
              <PainelFormas
                aoPedir={(midia) => {
                  pendentes.current.set(midia.id, {});
                  void biblioteca.recarregar();
                }}
                aoAvisar={mostrarAviso}
              />
            ) : (
              <FundoETamanho
                projeto={projetoNaTela}
                aoPrever={preverDoPainel}
                aoExecutar={executar}
                recorte={recorte}
                aoRecortar={setRecorte}
                aoAplicarRecorte={() => {
                  if (!recorte) return;
                  // O tamanho de cada mídia usada, para as camadas ficarem do mesmo tamanho em pixels
                  const tamanhos: Record<string, { largura: number; altura: number }> = {};
                  for (const midia of midias.values()) if (midia.video) tamanhos[midia.id] = { largura: midia.video.largura, altura: midia.video.altura };
                  const r = recorte.retangulo;
                  const retangulo = { x: Math.round(r.x), y: Math.round(r.y), largura: Math.round(r.largura), altura: Math.round(r.altura) };
                  if (executar({ comando: "imagem.recortar", parametros: { retangulo, tamanhos } })) setRecorte(null);
                }}
              />
            )}
          </div>
        </aside>

        <PreviaDaImagem
          projeto={projetoNaTela}
          midias={midias}
          selecao={selecaoValida}
          aoSelecionar={setSelecao}
          aoPrever={(clipeId, mudanca) =>
            setProvisorio(
              mudanca
                ? {
                    comando: "clipe.transformar",
                    parametros: { clipeIds: [clipeId], transformacao: mudanca },
                  }
                : null,
            )
          }
          aoTransformar={(clipeId, mudanca) =>
            executar({
              comando: "clipe.transformar",
              parametros: { clipeIds: [clipeId], transformacao: mudanca },
            })
          }
          recorte={recorte ? { ...recorte, aoMudar: (retangulo) => setRecorte({ ...recorte, retangulo }) } : null}
          objeto={ferramenta === "objeto" && objeto.foto && selecionado ? { clipeId: selecionado.clipe.id, ferramenta: objeto } : null}
        />

        <div className="flex shrink-0 flex-col border-borda bg-painel md:min-h-0 md:w-80 md:border-l">
          <section aria-label="Camadas" className="max-h-[40%] shrink-0 overflow-y-auto border-b border-borda">
            <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
              <h2 className="text-sm font-semibold">Camadas</h2>
              <button
                type="button"
                className="botao-secundario px-2 py-0.5 text-[11px]"
                onClick={() => executar({ comando: "imagem.adicionarAjuste", parametros: {} })}
                title="Uma camada sem imagem: a cor dela (aba Cor) vale para tudo o que está embaixo"
              >
                + Camada de ajuste
              </button>
            </div>
            <PainelCamadas projeto={projetoNaTela} midias={midias} selecao={selecaoValida} aoSelecionar={setSelecao} aoExecutar={executar} />
          </section>
          <PainelPropriedades
            modo="imagem"
            midia={midiaDoClipe}
            selecionado={selecionado}
            taxa={projeto.taxa}
            tempo={0}
            aoBuscar={NADA}
            proporcao={projeto.proporcao}
            faixas={projeto.faixas}
            aoAvisar={mostrarAviso}
            aoTrocarMidia={(clipeIds, midia) => {
              pendentes.current.set(midia.id, { trocar: clipeIds });
              void biblioteca.recarregar();
            }}
            seguirObjeto={SEM_SEGUIR}
            aoTrocarImagem={setTrocando}
            fundo={projeto.fundo.cor}
            aoPrever={preverDoPainel}
            aoExecutar={executar}
            className="min-h-0 flex-1"
          />
        </div>
      </div>

      {trocando ? (
        <JanelaEscolherImagem
          imagens={imagensProntas}
          aoFechar={() => setTrocando(null)}
          aoEscolher={(nova) => {
            const clipe = acharClipe(projeto, trocando)?.clipe;
            const atual = clipe?.midia_id ? midias.get(clipe.midia_id) : undefined;
            setTrocando(null);
            if (!clipe || !atual?.video || !nova.video) return;
            executar({
              comando: "imagem.trocarImagem",
              parametros: {
                clipeId: clipe.id,
                midiaId: nova.id,
                tamanhoAtual: { largura: atual.video.largura, altura: atual.video.altura },
                tamanhoNovo: { largura: nova.video.largura, altura: nova.video.altura },
              },
            });
          }}
        />
      ) : null}
      {exportando ? <JanelaExportarImagem projeto={projeto} nome={edicao.nome} midias={midias} aoFechar={() => setExportando(false)} aoAvisar={mostrarAviso} /> : null}
      {edicao.aviso ? (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <p className="rounded-lg border border-borda bg-painel-3 px-4 py-2 text-sm shadow-xl shadow-black/40">{edicao.aviso}</p>
        </div>
      ) : null}
    </div>
  );
}

/** A cor do fundo (ou sem fundo) e o tamanho, com os tamanhos prontos. */
/** As proporções do recorte; null é livre. */
const PROPORCOES_DO_RECORTE: { nome: string; valor: number | null }[] = [
  { nome: "Livre", valor: null },
  { nome: "1:1", valor: 1 },
  { nome: "4:5", valor: 4 / 5 },
  { nome: "9:16", valor: 9 / 16 },
  { nome: "16:9", valor: 16 / 9 },
];

/** O maior retângulo na proporção, no meio do atual (ou da imagem). */
function encaixarProporcao(r: RetanguloDaImagem, proporcao: number): RetanguloDaImagem {
  const largura = Math.min(r.largura, r.altura * proporcao);
  const altura = largura / proporcao;
  return { x: r.x + (r.largura - largura) / 2, y: r.y + (r.altura - altura) / 2, largura, altura };
}

function FundoETamanho({
  projeto,
  aoPrever,
  aoExecutar,
  recorte,
  aoRecortar,
  aoAplicarRecorte,
}: {
  projeto: NonNullable<ReturnType<typeof useProjeto>["projeto"]>;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
  recorte: { retangulo: RetanguloDaImagem; proporcao: number | null } | null;
  aoRecortar: (recorte: { retangulo: RetanguloDaImagem; proporcao: number | null } | null) => void;
  aoAplicarRecorte: () => void;
}) {
  const atual = tamanhoDaImagem(projeto);
  const [largura, setLargura] = useState(String(atual.largura));
  const [altura, setAltura] = useState(String(atual.altura));
  const [erro, setErro] = useState("");
  function aplicar(evento: React.FormEvent) {
    evento.preventDefault();
    const tamanho = { largura: Number(largura), altura: Number(altura) };
    const problema = problemaNoTamanho(tamanho);
    setErro(problema ?? "");
    if (!problema) aoExecutar({ comando: "imagem.tamanho", parametros: tamanho });
  }
  const inteiro = { x: 0, y: 0, largura: atual.largura, altura: atual.altura };
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Recortar</h3>
        {recorte ? (
          <>
            <p className="text-[11px] text-suave">Arraste o retângulo e os cantos na prévia. As camadas ficam onde estão; o que sair dele some.</p>
            <div className="flex flex-wrap gap-1">
              {PROPORCOES_DO_RECORTE.map((item) => (
                <button
                  key={item.nome}
                  type="button"
                  aria-pressed={recorte.proporcao === item.valor}
                  onClick={() => aoRecortar({ proporcao: item.valor, retangulo: item.valor ? encaixarProporcao(inteiro, item.valor) : recorte.retangulo })}
                  className={`rounded-md border px-2 py-1 text-[11px] ${recorte.proporcao === item.valor ? "border-destaque bg-destaque/10" : "border-borda hover:bg-painel-2"}`}
                >
                  {item.nome}
                </button>
              ))}
            </div>
            <p className="text-[11px] tabular-nums text-apagado">
              {Math.round(recorte.retangulo.largura)} × {Math.round(recorte.retangulo.altura)} px
            </p>
            <div className="flex gap-1.5">
              <button type="button" className="botao-principal flex-1 px-2 py-1 text-xs" onClick={aoAplicarRecorte}>
                Recortar
              </button>
              <button type="button" className="botao-secundario flex-1 px-2 py-1 text-xs" onClick={() => aoRecortar(null)}>
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="botao-secundario px-2 py-1 text-xs" onClick={() => aoRecortar({ retangulo: inteiro, proporcao: null })}>
            Recortar a imagem
          </button>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Fundo</h3>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={Boolean(projeto.fundo.transparente)}
            onChange={(evento) =>
              aoExecutar({
                comando: "imagem.fundo",
                parametros: { transparente: evento.currentTarget.checked },
              })
            }
          />
          Sem fundo (transparente no PNG e no WebP)
        </label>
        {projeto.fundo.transparente ? null : (
          <CampoCor
            rotulo="Cor do fundo"
            cor={projeto.fundo.cor}
            aoPrever={(cor) => aoPrever({ comando: "imagem.fundo", parametros: { cor } })}
            aoConfirmar={(cor) => aoExecutar({ comando: "imagem.fundo", parametros: { cor } })}
          />
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Tamanho</h3>
        <div className="flex flex-col gap-1">
          {TAMANHOS_PRONTOS.map((item) => {
            const marcado = item.largura === atual.largura && item.altura === atual.altura;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={marcado}
                onClick={() => {
                  setLargura(String(item.largura));
                  setAltura(String(item.altura));
                  aoExecutar({
                    comando: "imagem.tamanho",
                    parametros: { largura: item.largura, altura: item.altura },
                  });
                }}
                className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-xs ${marcado ? "border-destaque bg-destaque/10" : "border-borda hover:bg-painel-2"}`}
              >
                <span>{item.nome}</span>
                <span className="text-apagado tabular-nums">
                  {item.largura} × {item.altura}
                </span>
              </button>
            );
          })}
        </div>
        <form onSubmit={aplicar} className="flex items-end gap-1.5">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-suave">
            Largura
            <input
              value={largura}
              onChange={(evento) => setLargura(evento.currentTarget.value)}
              inputMode="numeric"
              className="min-w-0 rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs text-texto outline-none focus:border-destaque"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-suave">
            Altura
            <input
              value={altura}
              onChange={(evento) => setAltura(evento.currentTarget.value)}
              inputMode="numeric"
              className="min-w-0 rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs text-texto outline-none focus:border-destaque"
            />
          </label>
          <button type="submit" className="botao-secundario px-2.5 py-1 text-xs">
            Aplicar
          </button>
        </form>
        {erro ? <AvisoErro>{erro}</AvisoErro> : null}
        <p className="text-[11px] text-suave">As camadas ficam no mesmo lugar em relação ao quadro.</p>
      </section>
    </div>
  );
}
