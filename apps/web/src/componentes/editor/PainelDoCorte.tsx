"use client";

// A ferramenta Corte (ADR 0004, 14.7), quando o projeto veio de um corte do Clipar: estender o corte pelo original,
// o layout de cada cena no formato em pé (preencher, caber sobre o fundo desfocado, duas pessoas ou tela e rosto) com
// o enquadramento arrastado sobre o quadro do original (o rastreador manual), as cenas separadas nas trocas de
// câmera, a retenção (a barra de progresso, o quadro do original e o vídeo de distração, 14.8), o gancho narrado e a transcrição
// inteira do original, para pôr e tirar trechos. As contas ficam em lib/clipar/editorDoCorte.ts.
import { ArrowLeft, Camera, LoaderCircle, Mic, Minus, Plus, ScanFace, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { arquivoDaMidia, chamarApi } from "@/lib/api";
import { type CapaDoCorte, enderecoDaCapa, falaDaClipagem } from "@/lib/clipagens";
import type { CorteDoProjeto } from "@/lib/clipar/corteDoProjeto";
import { ehMidiaDeGancho, ganchoDoProjeto, semGancho, textoDoProjeto, VOZES_DO_GANCHO } from "@/lib/clipar/gancho";
import { escreverGancho, ganchoNoProjeto } from "@/lib/clipar/ganchoNarrado";
import {
  type Cena,
  cenasDaPrincipal,
  divisoesNasTrocas,
  enquadramentoParado,
  foraDosTrechos,
  intervalosDoTrecho,
  janelaNoQuadro,
  layoutAutomatico,
  porTrechoNoCorte,
  preencherACena,
  trechoDasPalavrasDoOriginal,
  trechoDoClipe,
  trechoParaEstender,
  trechosNoCorte,
  trocasDaQualidade,
} from "@/lib/clipar/editorDoCorte";
import { type Comando, executarComando, type ResultadoDoComando } from "@/lib/projeto/comandos";
import type { Palavra } from "@/lib/projeto/fala";
import { type LayoutDaCena, escalaParaCobrir, partesDaDivisao, quadroDaProporcao, recorteDaRegiao, type RegiaoDoLayout } from "@/lib/projeto/layoutDaCena";
import type { Clipe, Projeto, Recorte } from "@/lib/projeto/modelo";
import type { AmostraDeRosto } from "@/lib/projeto/reenquadrar";
import { buscarQualidade } from "@/lib/qualidade";
import { barraDoProjeto, comABarraAtualizada, ehFormaDaBarra, type PosicaoDaBarra, QUANDO_DO_QUADRO, type QuandoDoQuadro, semABarra } from "@/lib/clipar/retencao";
import { type PedidoDeRetencao, retencaoNoProjeto } from "@/lib/clipar/retencaoDoCorte";
import { censuraNoProjeto } from "@/lib/clipar/censuraDoCorte";
import type { ModoDaCensura } from "@/lib/projeto/censura";
import { buscarRosto } from "@/lib/rosto";
import { formatarTimecode, type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import { useMarca } from "@/lib/marca";

import { contextoDasMidias } from "./contexto";
import { ControleNumerico } from "./ControleNumerico";
import type { PropsLegendas } from "./PainelLegendas";

type Props = PropsLegendas & {
  corte: CorteDoProjeto;
  midias: Midia[];
  aoPrever: (comando: Comando | null) => void;
  /** Tira a prévia e executa o comando final, num passo só. */
  aoConfirmar: (comando: Comando) => ResultadoDoComando;
  /** Se o projeto já está salvo no servidor: a capa do quadro é exportada do projeto salvo. */
  salvo?: boolean;
};

const S = TICKS_POR_SEGUNDO;

const LAYOUTS: { id: "preencher" | LayoutDaCena["tipo"]; nome: string; descricao: string }[] = [
  { id: "preencher", nome: "Preencher", descricao: "A imagem cobre o quadro, no rosto ou onde você puser" },
  { id: "caber", nome: "Caber", descricao: "A imagem inteira no meio, sobre ela mesma desfocada" },
  { id: "duas_pessoas", nome: "Duas pessoas", descricao: "Uma em cima e outra embaixo" },
  { id: "tela_rosto", nome: "Tela e rosto", descricao: "A imagem inteira em cima e o rosto embaixo" },
];
const CORES_DAS_REGIOES = ["#22d3ee", "#f472b6"];
const POSICOES_DA_BARRA: { posicao: PosicaoDaBarra | null; rotulo: string }[] = [
  { posicao: "baixo", rotulo: "Embaixo" },
  { posicao: "alto", rotulo: "No alto" },
  { posicao: null, rotulo: "Sem barra" },
];

const principalDe = (projeto: Projeto): Clipe[] => projeto.faixas.find((faixa) => faixa.tipo === "principal")?.clipes ?? [];

/** O quadro do original, com as caixas do que aparece no vídeo; arrastar uma caixa muda o centro dela. */
function QuadroDoOriginal({
  midia,
  instante,
  caixas,
  aoArrastar,
}: {
  midia: Midia;
  instante: number;
  caixas: { recorte: Recorte; rotulo: string; cor: string }[];
  aoArrastar: (indice: number, centro: { x: number; y: number }, soltou: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ indice: number; inicio: { x: number; y: number }; centro: { x: number; y: number } } | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const ir = () => {
      video.currentTime = Math.max(0, instante);
    };
    if (video.readyState >= 1) ir();
    else video.addEventListener("loadedmetadata", ir, { once: true });
    return () => video.removeEventListener("loadedmetadata", ir);
  }, [instante]);
  const largura = midia.video?.largura ?? 16;
  const altura = midia.video?.altura ?? 9;

  function mover(evento: React.PointerEvent, soltou: boolean) {
    const atual = arrasto.current;
    const area = areaRef.current?.getBoundingClientRect();
    if (!atual || !area) return;
    const centro = {
      x: Math.min(1, Math.max(0, atual.centro.x + (evento.clientX - atual.inicio.x) / area.width)),
      y: Math.min(1, Math.max(0, atual.centro.y + (evento.clientY - atual.inicio.y) / area.height)),
    };
    aoArrastar(atual.indice, centro, soltou);
    if (soltou) arrasto.current = null;
  }

  return (
    <div ref={areaRef} className="relative w-full touch-none select-none overflow-hidden rounded-md bg-black" style={{ aspectRatio: `${largura} / ${altura}` }}>
      <video ref={videoRef} src={arquivoDaMidia(midia.id, "proxy.mp4")} muted playsInline preload="auto" className="absolute inset-0 size-full object-contain" aria-label="Quadro do vídeo original" />
      {caixas.map((caixa, indice) => (
        <div
          key={indice}
          role="slider"
          tabIndex={0}
          aria-label={`Posição: ${caixa.rotulo}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((caixa.recorte.x + caixa.recorte.largura / 2) * 100)}
          aria-valuetext={`${Math.round((caixa.recorte.x + caixa.recorte.largura / 2) * 100)}% da largura`}
          onPointerDown={(evento) => {
            evento.currentTarget.setPointerCapture(evento.pointerId);
            arrasto.current = { indice, inicio: { x: evento.clientX, y: evento.clientY }, centro: { x: caixa.recorte.x + caixa.recorte.largura / 2, y: caixa.recorte.y + caixa.recorte.altura / 2 } };
          }}
          onPointerMove={(evento) => mover(evento, false)}
          onPointerUp={(evento) => mover(evento, true)}
          onKeyDown={(evento) => {
            const passo = evento.shiftKey ? 0.05 : 0.01;
            const dx = evento.key === "ArrowLeft" ? -passo : evento.key === "ArrowRight" ? passo : 0;
            const dy = evento.key === "ArrowUp" ? -passo : evento.key === "ArrowDown" ? passo : 0;
            if (!dx && !dy) return;
            evento.preventDefault();
            aoArrastar(indice, { x: caixa.recorte.x + caixa.recorte.largura / 2 + dx, y: caixa.recorte.y + caixa.recorte.altura / 2 + dy }, true);
          }}
          className="absolute cursor-move border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] outline-none focus-visible:ring-2 focus-visible:ring-white"
          style={{
            left: `${caixa.recorte.x * 100}%`,
            top: `${caixa.recorte.y * 100}%`,
            width: `${caixa.recorte.largura * 100}%`,
            height: `${caixa.recorte.altura * 100}%`,
            borderColor: caixa.cor,
            boxShadow: caixas.length > 1 ? "none" : undefined,
          }}
        >
          <span className="absolute left-0 top-0 px-1 text-[10px] font-semibold text-black" style={{ background: caixa.cor }}>
            {caixa.rotulo}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PainelDoCorte({ projeto, tempo, aoExecutar, aoBuscar, aoSelecionar, aoAvisar, corte: { clipagem, corte }, midias, aoPrever, aoConfirmar, salvo = true }: Props) {
  const midia = midias.find((item) => item.id === clipagem.midia_id) ?? null;
  const principal = principalDe(projeto);
  const quadro = quadroDaProporcao(projeto.proporcao);
  const tamanho = midia?.video ? { largura: midia.video.largura, altura: midia.video.altura } : null;
  const mapaDasMidias = useMemo(() => new Map(midias.map((item) => [item.id, item])), [midias]);
  const marca = useMarca();
  const [palavras, setPalavras] = useState<Palavra[] | null>(null);
  const [rosto, setRosto] = useState<{ amostras: AmostraDeRosto[]; todos: boolean } | null>(null);
  const [trocas, setTrocas] = useState<number[]>([]);
  const [andamento, setAndamento] = useState<string | null>(null);
  const [escolhida, setEscolhida] = useState<number | null>(null);
  const [arrasto, setArrasto] = useState<{ indice: number; centro: { x: number; y: number } } | null>(null);
  const [selecao, setSelecao] = useState<{ de: number; ate: number } | null>(null);
  const [quando, setQuando] = useState<QuandoDoQuadro>("meio");
  const [distracaoId, setDistracaoId] = useState("");
  const [frase, setFrase] = useState("");
  // A capa escolhida nesta sessão (o corte do Editor não é buscado de novo); undefined: a que o corte já tinha
  const [capaEscolhida, setCapaEscolhida] = useState<CapaDoCorte | null | undefined>(undefined);
  const [capaPronta, setCapaPronta] = useState(false);
  const [imagemDaCapa, setImagemDaCapa] = useState("");
  const [voz, setVoz] = useState<(typeof VOZES_DO_GANCHO)[number]["id"]>("pf_dora");
  // Quantas vezes a retenção foi pedida: entra no sorteio, para pedir de novo dar outro quadro e outro trecho
  const vezes = useRef(0);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);

  // A fala inteira do original, uma vez
  useEffect(() => {
    let vale = true;
    falaDaClipagem(clipagem.id, 0, clipagem.duracao + 1)
      .then((lista) => {
        if (vale) setPalavras(lista);
      })
      .catch(() => {
        if (vale) setPalavras([]);
      });
    return () => {
      vale = false;
    };
  }, [clipagem.id, clipagem.duracao]);

  const cenas = cenasDaPrincipal(principal, trocas);
  const naCursor = cenas.findIndex((cena) => tempo >= cena.inicio && tempo < cena.fim);
  const indice = escolhida !== null && escolhida < cenas.length ? escolhida : Math.max(0, naCursor);
  const cena: Cena | undefined = cenas[indice];
  const clipesDaCena = cena ? principal.filter((clipe) => cena.clipeIds.includes(clipe.id)) : [];
  const primeiro = clipesDaCena[0];
  const layout = primeiro?.layout ?? null;
  const tipoAtual = layout?.tipo ?? "preencher";
  // O clipe e o instante que o quadro do original mostra: o do cursor, se ele está na cena
  const noCursor = clipesDaCena.find((clipe) => tempo >= clipe.inicio && tempo < clipe.inicio + clipe.duracao) ?? primeiro;
  const tempoNaCena = noCursor && tempo >= noCursor.inicio && tempo < noCursor.inicio + noCursor.duracao ? tempo : (noCursor?.inicio ?? 0);
  const instante = noCursor ? trechoDoClipe(noCursor).de + ((tempoNaCena - noCursor.inicio) / S) * noCursor.velocidade : 0;
  const comAFala = useMemo(() => new Set(midias.filter((item) => item.legenda_animada).map((item) => item.id)), [midias]);

  async function rostoDoVideo(todos: boolean): Promise<AmostraDeRosto[] | null> {
    if (rosto && (rosto.todos || !todos)) return rosto.amostras;
    if (!midia) return [];
    try {
      const amostras = await buscarRosto(midia.id, setAndamento, () => ativo.current, todos);
      if (amostras) setRosto({ amostras, todos });
      return amostras;
    } catch {
      return [];
    }
  }

  /** Toda edição do corte passa aqui: a barra de progresso volta a ir do começo ao fim do vídeo. */
  function editar(novo: Projeto, nome: string, selecao?: string[]) {
    const comBarra = comABarraAtualizada(novo, contextoDasMidias(mapaDasMidias), daBarra);
    return aoExecutar({ comando: "corte.editar", parametros: { projeto: comBarra, nome, selecao } });
  }
  function daBarra(id: string) {
    return ehFormaDaBarra(mapaDasMidias.get(id)?.elemento);
  }

  // -----------------------------------------------
  // Retenção: a barra de progresso, o quadro do original e o vídeo de distração
  // -----------------------------------------------
  const barra = barraDoProjeto(projeto, daBarra);
  const videosDaBiblioteca = midias.filter(
    (item) => item.video && !item.imagem && item.status === "pronta" && item.id !== midia?.id && !item.animacao && !item.legenda_animada && !item.camada_pixels,
  );
  const escolhidaParaDistracao = videosDaBiblioteca.find((item) => item.id === distracaoId) ?? videosDaBiblioteca[0];

  async function porRetencao(pedido: PedidoDeRetencao, nome: string) {
    setAndamento("Preparando");
    try {
      const feito = await retencaoNoProjeto({ projeto, pedido, marca, midias: mapaDasMidias, semente: `${projeto.id}:${projeto.versao}:${++vezes.current}`, aoAndamento: setAndamento, ativo: () => ativo.current });
      if (!feito || !ativo.current) return;
      if (!feito.feitos.length) {
        aoAvisar("Não deu para pôr agora. Confira se o vídeo tem pelo menos alguns segundos.");
        return;
      }
      if (editar(feito.projeto, nome)) aoAvisar(`Pronto: ${feito.feitos.join(", ")}. Ctrl+Z desfaz.`);
    } catch (erro) {
      aoAvisar(erro instanceof Error ? erro.message : "Não deu para pôr agora.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  // -----------------------------------------------
  // O gancho narrado
  // -----------------------------------------------
  const ehGancho = (id: string) => ehMidiaDeGancho(mapaDasMidias.get(id));
  const gancho = ganchoDoProjeto(projeto, ehGancho);

  async function escreverOGancho() {
    setAndamento("Escrevendo o gancho");
    try {
      const escrita = await escreverGancho(corte.titulo, textoDoProjeto(projeto), setAndamento, () => ativo.current);
      if (escrita && ativo.current) setFrase(escrita);
    } catch (erro) {
      aoAvisar(erro instanceof Error ? erro.message : "O gancho não foi escrito.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  async function porOGancho() {
    setAndamento("Falando o gancho");
    try {
      const feito = await ganchoNoProjeto({ projeto, midias: mapaDasMidias, frase, titulo: corte.titulo, voz, aoAndamento: setAndamento, ativo: () => ativo.current });
      if (!feito || !ativo.current) return;
      setFrase(feito.frase);
      if (editar(feito.projeto, "pôr o gancho narrado")) aoAvisar("O gancho entrou no começo, com o som do vídeo abaixando por baixo. Ctrl+Z desfaz.");
    } catch (erro) {
      aoAvisar(erro instanceof Error ? erro.message : "O gancho não entrou.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  // -----------------------------------------------
  // A capa: o quadro do cursor (exportado em PNG do projeto salvo) ou uma imagem da biblioteca
  // -----------------------------------------------
  const capa = capaEscolhida === undefined ? (corte.capa ?? null) : capaEscolhida;
  const imagensDaBiblioteca = midias.filter((item) => item.imagem && item.status === "pronta" && !item.elemento && !item.camada_pixels);
  const imagemParaCapa = imagensDaBiblioteca.find((item) => item.id === imagemDaCapa) ?? imagensDaBiblioteca[0];
  const exportacaoDaCapa = capa?.tipo === "quadro" ? capa.exportacao_id : null;
  const capaVisivel = capa?.tipo === "imagem" || capaPronta;
  // O PNG do quadro fica pronto em alguns segundos: a prévia da capa espera
  useEffect(() => {
    if (!exportacaoDaCapa) return;
    let vale = true;
    const olhar = async () => {
      while (vale) {
        const exportacao = await chamarApi<{ status: string }>(`/exportacoes/${exportacaoDaCapa}`).catch(() => null);
        if (!vale) return;
        if (exportacao?.status === "pronta" || exportacao?.status === "erro" || !exportacao) {
          setCapaPronta(exportacao?.status === "pronta");
          return;
        }
        await new Promise((ok) => setTimeout(ok, 1500));
      }
    };
    void olhar();
    return () => {
      vale = false;
    };
  }, [exportacaoDaCapa]);

  async function guardarCapa(nova: CapaDoCorte | null, aviso: string) {
    await chamarApi(`/clipagens/${clipagem.id}/cortes/${corte.id}/capa`, { metodo: "PUT", corpo: { capa: nova } });
    if (!ativo.current) return;
    setCapaPronta(false);
    setCapaEscolhida(nova);
    aoAvisar(aviso);
  }

  async function capaDoCursor() {
    setAndamento("Tirando o quadro da capa");
    try {
      const exportacao = await chamarApi<{ id: string }>("/exportacoes", { metodo: "POST", corpo: { projeto_id: projeto.id, resolucao: "1080p", formato: "png", tempo } });
      await guardarCapa({ tipo: "quadro", exportacao_id: exportacao.id, segundos: tempo / S }, "A capa é o quadro do cursor; o PNG fica pronto em alguns segundos.");
    } catch (erro) {
      aoAvisar(erro instanceof Error ? erro.message : "A capa não foi tirada.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  // -----------------------------------------------
  // A censura das palavras da lista do espaço
  // -----------------------------------------------
  async function censurar(modo: ModoDaCensura) {
    if (!midia) return;
    setAndamento("Procurando as palavras");
    try {
      const fala = palavras ?? (await falaDaClipagem(clipagem.id, 0, clipagem.duracao + 1));
      const feito = await censuraNoProjeto({ projeto, midias: mapaDasMidias, palavras: new Map([[midia.id, fala]]), lista: marca.censura, modo, aoAndamento: setAndamento, ativo: () => ativo.current });
      if (!feito || !ativo.current) return;
      if (!feito.quantas) {
        aoAvisar("Nenhuma palavra da lista é dita neste corte.");
        return;
      }
      if (editar(feito.projeto, "censurar as palavras")) aoAvisar(`${feito.quantas === 1 ? "1 palavra censurada" : `${feito.quantas} palavras censuradas`}, também nas legendas e no título. Ctrl+Z desfaz.`);
    } catch (erro) {
      aoAvisar(erro instanceof Error ? erro.message : "A censura não foi feita.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  function tirarABarra() {
    if (editar(semABarra(projeto, daBarra), "tirar a barra de progresso")) aoAvisar("A barra de progresso saiu. Ctrl+Z desfaz.");
  }


  // -----------------------------------------------
  // Estender e pôr trechos do original
  // -----------------------------------------------
  async function porTrechos(pedacos: { de: number; ate: number }[], nome: string, aviso: string) {
    if (!midia || !tamanho || !pedacos.length) return;
    setAndamento("Pondo o trecho");
    try {
      const fala = palavras ?? (await falaDaClipagem(clipagem.id, 0, clipagem.duracao + 1));
      const amostras = (await rostoDoVideo(false)) ?? [];
      if (!ativo.current) return;
      const ctx = contextoDasMidias(mapaDasMidias);
      let atual = projeto;
      let ultimo = "";
      for (const pedaco of pedacos) {
        const feito = porTrechoNoCorte(atual, ctx, { midiaId: midia.id, ...pedaco, palavras: fala, rosto: amostras, midia: tamanho, comAFala });
        atual = feito.projeto;
        ultimo = feito.clipeId;
      }
      if (editar(atual, nome, [ultimo])) aoAvisar(aviso);
    } catch (erro) {
      aoAvisar(erro instanceof Error ? erro.message : "O trecho não entrou no corte.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  function estender(lado: "comeco" | "fim") {
    if (!midia) return;
    const trecho = trechoParaEstender(principal, midia.id, lado, midia.duracao ?? clipagem.duracao);
    if (!trecho) {
      aoAvisar(lado === "comeco" ? "O corte já começa no início do vídeo." : "O corte já vai até o fim do vídeo.");
      return;
    }
    const segundos = (trecho.ate - trecho.de).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    void porTrechos([trecho], lado === "comeco" ? "estender o começo" : "estender o fim", `${segundos} s do original entraram no ${lado === "comeco" ? "começo" : "fim"}. Ctrl+Z desfaz.`);
  }

  // -----------------------------------------------
  // Layout e enquadramento da cena
  // -----------------------------------------------
  function comandoDoLayout(cenasAlvo: Cena[], layoutDe: (cena: Cena) => LayoutDaCena | null): Comando {
    const ctx = contextoDasMidias(mapaDasMidias);
    let atual = projeto;
    for (const alvo of cenasAlvo) atual = executarComando(atual, { comando: "clipe.layout", parametros: { clipeIds: alvo.clipeIds, layout: layoutDe(alvo) } }, ctx).projeto;
    return { comando: "corte.editar", parametros: { projeto: atual, nome: cenasAlvo.length > 1 ? "mudar o layout das cenas" : "mudar o layout da cena" } };
  }

  async function escolherLayout(tipo: (typeof LAYOUTS)[number]["id"], todas = false) {
    if (!cena || !tamanho) return;
    const alvo = todas ? cenas : [cena];
    if (tipo === "preencher") {
      // O clipe que entrou sem enquadramento passa a cobrir o quadro (no rosto, se ele aparece)
      const amostras = (await rostoDoVideo(false)) ?? [];
      setAndamento(null);
      if (!ativo.current) return;
      const { projeto: novo } = preencherACena(projeto, contextoDasMidias(mapaDasMidias), alvo.flatMap((item) => item.clipeIds), amostras, tamanho);
      editar(novo, alvo.length > 1 ? "mudar o layout das cenas" : "mudar o layout da cena");
      return;
    }
    if (tipo === "caber") {
      const desfoque = layout?.tipo === "caber" ? layout.desfoque : 0.6;
      aoExecutar(comandoDoLayout(alvo, () => ({ tipo: "caber", desfoque })));
      return;
    }
    const amostras = (await rostoDoVideo(true)) ?? [];
    if (!ativo.current) return;
    setAndamento(null);
    aoExecutar(comandoDoLayout(alvo, (item) => layoutAutomatico(tipo, amostras, item, tamanho, quadro)));
  }

  /** Seguir o rosto de novo em todos os clipes da cena (o preencher automático). */
  async function seguirORosto() {
    if (!cena || !tamanho) return;
    const amostras = (await rostoDoVideo(false)) ?? [];
    setAndamento(null);
    if (!ativo.current) return;
    const { projeto: atual, seguiu: achou } = preencherACena(projeto, contextoDasMidias(mapaDasMidias), cena.clipeIds, amostras, tamanho, true);
    if (editar(atual, "seguir o rosto na cena")) aoAvisar(achou ? "A cena segue o rosto de novo." : "Nenhum rosto nesta cena: ela ficou no meio da imagem.");
  }

  /** O preencher parado no ponto escolhido (o rastreador manual), com o zoom, em todos os clipes da cena. */
  function comandoParado(ponto: { x: number; y: number }, zoom: number): Comando | null {
    if (!cena || !tamanho) return null;
    const ctx = contextoDasMidias(mapaDasMidias);
    let atual = projeto;
    for (const clipe of clipesDaCena) {
      atual = executarComando(atual, { comando: "clipe.reenquadrar", parametros: { clipeId: clipe.id, reenquadramento: enquadramentoParado(clipe, ponto, zoom, tamanho, quadro) } }, ctx).projeto;
    }
    return { comando: "corte.editar", parametros: { projeto: atual, nome: "enquadrar a cena" } };
  }

  function comandoDasRegioes(mudar: (atual: Extract<LayoutDaCena, { quadros: unknown }>) => Partial<Extract<LayoutDaCena, { quadros: unknown }>>): Comando | null {
    if (!cena || !layout || layout.tipo === "caber") return null;
    return comandoDoLayout([cena], () => ({ ...layout, ...mudar(layout) }) as LayoutDaCena);
  }

  function confirmar(comando: Comando | null, soltou: boolean) {
    if (!comando) return;
    if (!soltou) {
      aoPrever(comando);
      return;
    }
    setArrasto(null);
    aoConfirmar(comando);
  }

  // O que o quadro do original mostra: a janela do preencher ou as duas regiões do dividido
  let caixas: { recorte: Recorte; rotulo: string; cor: string }[] = [];
  let zoomDoPreencher = 1;
  let centroDoPreencher = { x: 0.5, y: 0.5 };
  if (noCursor && tamanho && tipoAtual === "preencher") {
    const janela = janelaNoQuadro(noCursor, tempoNaCena, tamanho, quadro);
    const recortada = { largura: tamanho.largura * noCursor.recorte.largura, altura: tamanho.altura * noCursor.recorte.altura };
    zoomDoPreencher = Math.max(1, noCursor.transformacao.escala / escalaParaCobrir(recortada, quadro));
    centroDoPreencher = arrasto?.centro ?? { x: janela.x + janela.largura / 2, y: janela.y + janela.altura / 2 };
    const vista = arrasto ? { ...janela, x: centroDoPreencher.x - janela.largura / 2, y: centroDoPreencher.y - janela.altura / 2 } : janela;
    caixas = [{ recorte: vista, rotulo: "No vídeo", cor: CORES_DAS_REGIOES[0] }];
  } else if (tamanho && layout && layout.tipo !== "caber") {
    const partes = partesDaDivisao(layout.divisao);
    caixas = layout.quadros.map((regiao, i) => {
      const centro = arrasto?.indice === i ? arrasto.centro : regiao;
      return {
        recorte: recorteDaRegiao({ ...regiao, ...centro }, tamanho, { largura: quadro.largura, altura: quadro.altura * partes[i] }),
        rotulo: i === 0 ? "Em cima" : "Embaixo",
        cor: CORES_DAS_REGIOES[i],
      };
    });
  }

  function arrastar(i: number, centro: { x: number; y: number }, soltou: boolean) {
    if (!soltou) setArrasto({ indice: i, centro });
    if (tipoAtual === "preencher") confirmar(comandoParado(centro, zoomDoPreencher), soltou);
    else confirmar(comandoDasRegioes((atual) => ({ quadros: atual.quadros.map((regiao, j) => (j === i ? { ...regiao, ...centro } : regiao)) as [RegiaoDoLayout, RegiaoDoLayout] })), soltou);
    if (soltou) setArrasto(null);
  }

  async function separarNasTrocas() {
    if (!midia) return;
    setAndamento("Procurando as trocas de câmera");
    try {
      const qualidade = await buscarQualidade(midia.id, (progresso) => setAndamento(`Procurando as trocas de câmera · ${progresso}%`), () => ativo.current);
      if (!qualidade || !ativo.current) return;
      const achadas = trocasDaQualidade(qualidade);
      setTrocas(achadas);
      const divisoes = divisoesNasTrocas(principal, achadas);
      if (!divisoes.length) {
        aoAvisar(achadas.length ? "As trocas de câmera já caem entre as cenas." : "Nenhuma troca de câmera no corte.");
        return;
      }
      const ctx = contextoDasMidias(mapaDasMidias);
      let atual = projeto;
      // Do fim para o começo: cada divisão não muda os instantes das de antes
      for (const divisao of divisoes) {
        const clipe = principalDe(atual).find((item) => item.inicio < divisao.tempo && divisao.tempo < item.inicio + item.duracao);
        if (clipe) atual = executarComando(atual, { comando: "linha.dividir", parametros: { tempo: divisao.tempo, clipeIds: [clipe.id] } }, ctx).projeto;
      }
      if (editar(atual, "separar as cenas nas trocas de câmera")) aoAvisar(`${divisoes.length === 1 ? "1 troca de câmera virou" : `${divisoes.length} trocas de câmera viraram`} divisa de cena. Ctrl+Z desfaz.`);
    } catch (erro) {
      aoAvisar(erro instanceof Error ? erro.message : "As trocas de câmera não foram achadas.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  // -----------------------------------------------
  // A transcrição do original
  // -----------------------------------------------
  const cobertos = midia ? trechosNoCorte(principal, midia.id) : [];
  const noCorte = (palavra: Palavra) => {
    const meio = (palavra.inicio + palavra.fim) / 2;
    return cobertos.some((trecho) => meio >= trecho.de && meio <= trecho.ate);
  };
  const listaRef = useRef<HTMLParagraphElement>(null);
  const rolou = useRef(false);
  useEffect(() => {
    if (rolou.current || !palavras?.length) return;
    const primeira = listaRef.current?.querySelector("[data-no-corte='true']");
    if (primeira) {
      primeira.scrollIntoView({ block: "center" });
      rolou.current = true;
    }
  }, [palavras]);
  const marcadas = selecao ? { de: Math.min(selecao.de, selecao.ate), ate: Math.max(selecao.de, selecao.ate) } : null;
  const trechoMarcado = marcadas && palavras ? trechoDasPalavrasDoOriginal(palavras, marcadas.de, marcadas.ate) : null;
  const faltam = trechoMarcado ? foraDosTrechos(trechoMarcado.de, trechoMarcado.ate, cobertos) : [];
  const tirar = trechoMarcado && midia ? intervalosDoTrecho(principal, midia.id, trechoMarcado.de, trechoMarcado.ate) : [];

  function clicarPalavra(i: number, shift: boolean) {
    if (shift && selecao) setSelecao({ ...selecao, ate: i });
    else setSelecao({ de: i, ate: i });
    if (!palavras || !midia) return;
    // Uma palavra que está no corte leva o cursor até ela
    const palavra = palavras[i];
    const clipe = principal.find((item) => item.midia_id === midia.id && palavra.inicio >= trechoDoClipe(item).de && palavra.inicio < trechoDoClipe(item).ate);
    if (clipe && !shift) aoBuscar(clipe.inicio + Math.round(((palavra.inicio - trechoDoClipe(clipe).de) / clipe.velocidade) * S));
  }

  if (!midia || !tamanho) return <p className="text-xs text-suave">O vídeo original deste corte não está na biblioteca.</p>;

  const pontoNaLinha = (t: Tick) => formatarTimecode(t, projeto.taxa).slice(3, 8);
  return (
    <div className="flex flex-col gap-3 text-xs">
      <section className="flex flex-col gap-1" aria-label="O corte">
        <p className="text-[11px] text-suave">Corte de “{clipagem.nome}”</p>
        <h3 className="text-sm font-semibold leading-snug">{corte.titulo}</h3>
        <Link href={`/app/clipar/${clipagem.id}`} className="flex items-center gap-1 text-[11px] text-suave hover:text-texto">
          <ArrowLeft className="size-3" aria-hidden />
          Voltar à lista de cortes
        </Link>
      </section>

      {andamento ? (
        <p role="status" className="flex items-center gap-2 rounded-md bg-painel-2 px-2 py-1.5 text-suave">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          {andamento}
        </p>
      ) : null}

      <section className="flex flex-col gap-2 rounded-lg border border-borda p-2" aria-label="Estender pelo original">
        <h3 className="font-semibold uppercase tracking-wide text-suave">Estender pelo original</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className="botao-secundario px-2 py-1.5" disabled={andamento !== null} onClick={() => estender("comeco")}>
            <Plus className="size-3.5" aria-hidden />5 s no começo
          </button>
          <button type="button" className="botao-secundario px-2 py-1.5" disabled={andamento !== null} onClick={() => estender("fim")}>
            <Plus className="size-3.5" aria-hidden />5 s no fim
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-borda p-2" aria-label="Cenas e layout">
        <h3 className="font-semibold uppercase tracking-wide text-suave">Cenas e layout</h3>
        <ol className="flex flex-wrap gap-1" aria-label="Cenas">
          {cenas.map((item, i) => (
            <li key={item.clipeIds[0]}>
              <button
                type="button"
                aria-pressed={i === indice}
                onClick={() => {
                  setEscolhida(i);
                  aoSelecionar(item.clipeIds);
                  aoBuscar(item.inicio);
                }}
                className={`rounded-md border px-2 py-1 tabular-nums ${i === indice ? "border-destaque bg-destaque/15" : "border-borda text-suave hover:text-texto"}`}
                title={LAYOUTS.find((l) => l.id === (principal.find((c) => c.id === item.clipeIds[0])?.layout?.tipo ?? "preencher"))?.nome}
              >
                {i + 1} · {pontoNaLinha(item.inicio)}
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="flex items-center gap-1 self-start text-[11px] text-suave hover:text-texto" disabled={andamento !== null} onClick={() => void separarNasTrocas()}>
          <Camera className="size-3" aria-hidden />
          Separar as cenas nas trocas de câmera
        </button>
        {cena ? (
          <>
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={`Layout da cena ${indice + 1}`}>
              {LAYOUTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={tipoAtual === item.id}
                  disabled={andamento !== null}
                  title={item.descricao}
                  onClick={() => void escolherLayout(item.id)}
                  className={`rounded-md border px-2 py-1.5 text-left ${tipoAtual === item.id ? "border-destaque bg-destaque/15" : "border-borda text-suave hover:text-texto"}`}
                >
                  <span className="block font-medium text-texto">{item.nome}</span>
                  <span className="block text-[10px] leading-tight">{item.descricao}</span>
                </button>
              ))}
            </div>
            {caixas.length ? (
              <>
                <QuadroDoOriginal midia={midia} instante={instante} caixas={caixas} aoArrastar={arrastar} />
                <p className="text-[11px] text-suave">Arraste {caixas.length > 1 ? "cada retângulo" : "o retângulo"} para escolher o que aparece; as setas movem de pouco em pouco.</p>
              </>
            ) : null}
            {tipoAtual === "preencher" ? (
              <>
                <ControleNumerico
                  rotulo="Zoom"
                  valor={Math.round(zoomDoPreencher * 100)}
                  minimo={100}
                  maximo={300}
                  passo={5}
                  sufixo="%"
                  aoPrever={(valor) => aoPrever(comandoParado(centroDoPreencher, valor / 100))}
                  aoConfirmar={(valor) => confirmar(comandoParado(centroDoPreencher, valor / 100), true)}
                />
                <button type="button" className="botao-secundario px-2 py-1.5" disabled={andamento !== null} onClick={() => void seguirORosto()}>
                  <ScanFace className="size-3.5" aria-hidden />
                  Seguir o rosto nesta cena
                </button>
              </>
            ) : layout?.tipo === "caber" ? (
              <ControleNumerico
                rotulo="Desfoque do fundo"
                valor={Math.round(layout.desfoque * 100)}
                minimo={5}
                maximo={100}
                passo={5}
                sufixo="%"
                aoPrever={(valor) => aoPrever(comandoDoLayout([cena], () => ({ tipo: "caber", desfoque: valor / 100 })))}
                aoConfirmar={(valor) => confirmar(comandoDoLayout([cena], () => ({ tipo: "caber", desfoque: valor / 100 })), true)}
              />
            ) : layout ? (
              <>
                <ControleNumerico
                  rotulo="Altura da parte de cima"
                  valor={Math.round(layout.divisao * 100)}
                  minimo={20}
                  maximo={80}
                  passo={1}
                  sufixo="%"
                  aoPrever={(valor) => aoPrever(comandoDasRegioes(() => ({ divisao: valor / 100 })))}
                  aoConfirmar={(valor) => confirmar(comandoDasRegioes(() => ({ divisao: valor / 100 })), true)}
                />
                {layout.quadros.map((regiao, i) => (
                  <ControleNumerico
                    key={i}
                    rotulo={`Zoom ${i === 0 ? "em cima" : "embaixo"}`}
                    valor={Math.round(regiao.zoom * 100)}
                    minimo={100}
                    maximo={400}
                    passo={5}
                    sufixo="%"
                    aoPrever={(valor) => aoPrever(comandoDasRegioes((atual) => ({ quadros: atual.quadros.map((r, j) => (j === i ? { ...r, zoom: valor / 100 } : r)) as [RegiaoDoLayout, RegiaoDoLayout] })))}
                    aoConfirmar={(valor) => confirmar(comandoDasRegioes((atual) => ({ quadros: atual.quadros.map((r, j) => (j === i ? { ...r, zoom: valor / 100 } : r)) as [RegiaoDoLayout, RegiaoDoLayout] })), true)}
                  />
                ))}
                <button type="button" className="botao-secundario px-2 py-1.5" disabled={andamento !== null} onClick={() => void escolherLayout(layout.tipo)}>
                  <ScanFace className="size-3.5" aria-hidden />
                  Achar os rostos de novo
                </button>
              </>
            ) : null}
            {cenas.length > 1 ? (
              <button type="button" className="text-left text-[11px] text-suave underline-offset-2 hover:underline" disabled={andamento !== null} onClick={() => void escolherLayout(tipoAtual, true)}>
                Usar “{LAYOUTS.find((item) => item.id === tipoAtual)?.nome}” em todas as {cenas.length} cenas
              </button>
            ) : null}
          </>
        ) : (
          <p className="text-suave">A faixa principal não tem vídeo.</p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-borda p-2" aria-label="Retenção">
        <h3 className="font-semibold uppercase tracking-wide text-suave">Retenção</h3>
        <div className="flex flex-col gap-1">
          <span className="font-medium">Barra de progresso</span>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Barra de progresso">
            {POSICOES_DA_BARRA.map(({ posicao, rotulo }) => (
              <button
                key={rotulo}
                type="button"
                role="radio"
                aria-checked={(barra?.posicao ?? null) === posicao}
                disabled={andamento !== null}
                onClick={() => {
                  if (posicao) void porRetencao({ barra: posicao }, "pôr a barra de progresso");
                  else if (barra) tirarABarra();
                }}
                className={`rounded-md border px-2 py-1 ${(barra?.posicao ?? null) === posicao ? "border-destaque bg-destaque/15" : "border-borda text-suave hover:text-texto"}`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-suave">Na cor principal do kit de marca. Ela acompanha quando o corte cresce ou diminui.</p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="quadro-do-original" className="font-medium">
            Quadro do original numa caixa
          </label>
          <div className="flex gap-1.5">
            <select id="quadro-do-original" value={quando} onChange={(evento) => setQuando(evento.target.value as QuandoDoQuadro)} className="campo min-w-0 flex-1 px-2 py-1">
              {QUANDO_DO_QUADRO.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
            <button type="button" className="botao-secundario px-2 py-1" disabled={andamento !== null} onClick={() => void porRetencao({ quadro: quando }, "pôr o quadro do original")}>
              <Plus className="size-3.5" aria-hidden />
              Pôr
            </button>
          </div>
          <p className="text-[11px] text-suave">A imagem inteira do vídeo original, com os cantos arredondados, logo depois do título.</p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="video-de-distracao" className="font-medium">
            Vídeo de distração
          </label>
          {videosDaBiblioteca.length ? (
            <div className="flex gap-1.5">
              <select id="video-de-distracao" value={escolhidaParaDistracao?.id ?? ""} onChange={(evento) => setDistracaoId(evento.target.value)} className="campo min-w-0 flex-1 px-2 py-1">
                {videosDaBiblioteca.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="botao-secundario px-2 py-1"
                disabled={andamento !== null || !escolhidaParaDistracao}
                onClick={() => {
                  if (escolhidaParaDistracao) void porRetencao({ distracao: [escolhidaParaDistracao.id] }, "pôr o vídeo de distração");
                }}
              >
                <Plus className="size-3.5" aria-hidden />
                Pôr
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-suave">Envie um vídeo (areia, slime, uma receita) ou busque um no banco da Pixabay, no painel Mídia.</p>
          )}
          <p className="text-[11px] text-suave">
            Mudo, {quadro.largura < quadro.altura ? "na parte de baixo do vídeo" : "numa caixa no canto de baixo"}, do começo ao fim; cada vez começa num trecho diferente.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-borda p-2" aria-label="Gancho narrado">
        <h3 className="font-semibold uppercase tracking-wide text-suave">Gancho narrado</h3>
        <label htmlFor="frase-do-gancho" className="text-[11px] text-suave">
          Uma frase falada no começo, com o som do vídeo abaixando por baixo dela.
        </label>
        <textarea
          id="frase-do-gancho"
          value={frase}
          maxLength={200}
          rows={2}
          onChange={(evento) => setFrase(evento.target.value)}
          placeholder="Escreva, ou deixe a IA escrever pelo que é dito no corte"
          className="campo resize-none px-2 py-1.5"
        />
        <div className="flex gap-1.5">
          <button type="button" className="botao-secundario flex-1 px-2 py-1" disabled={andamento !== null} onClick={() => void escreverOGancho()}>
            <Sparkles className="size-3.5" aria-hidden />
            Escrever com IA
          </button>
          <select aria-label="Voz do gancho" value={voz} onChange={(evento) => setVoz(evento.target.value as typeof voz)} className="campo px-2 py-1">
            {VOZES_DO_GANCHO.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-1.5">
          <button type="button" className="botao-principal flex-1 px-2 py-1.5" disabled={andamento !== null} onClick={() => void porOGancho()}>
            <Mic className="size-3.5" aria-hidden />
            {gancho ? "Trocar o gancho" : "Pôr o gancho"}
          </button>
          {gancho ? (
            <button
              type="button"
              className="botao-secundario px-2 py-1.5"
              disabled={andamento !== null}
              onClick={() => {
                if (editar(semGancho(projeto, contextoDasMidias(mapaDasMidias), ehGancho), "tirar o gancho narrado")) aoAvisar("O gancho saiu. Ctrl+Z desfaz.");
              }}
            >
              Tirar
            </button>
          ) : null}
        </div>
        {!frase.trim() ? <p className="text-[11px] text-suave">Sem frase, “Pôr o gancho” pede uma à IA antes.</p> : null}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-borda p-2" aria-label="Censura">
        <h3 className="font-semibold uppercase tracking-wide text-suave">Censura</h3>
        {marca.censura.length ? (
          <>
            <p className="text-[11px] text-suave">
              {marca.censura.length === 1 ? "1 palavra" : `${marca.censura.length} palavras`} na lista do kit de marca. Onde forem ditas, o som some ou toca um bipe, e nas legendas e no título
              viram asteriscos.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" className="botao-secundario px-2 py-1.5" disabled={andamento !== null} onClick={() => void censurar("bipe")}>
                Com bipe
              </button>
              <button type="button" className="botao-secundario px-2 py-1.5" disabled={andamento !== null} onClick={() => void censurar("silencio")}>
                No silêncio
              </button>
            </div>
          </>
        ) : (
          <p className="text-[11px] text-suave">Escreva as palavras para censurar no Kit de marca (menu Janela). Elas valem em todos os cortes do espaço.</p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-borda p-2" aria-label="Capa">
        <h3 className="font-semibold uppercase tracking-wide text-suave">Capa</h3>
        {capa ? (
          <div className="flex items-start gap-2">
            {capaVisivel ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={enderecoDaCapa(capa)} alt="A capa do corte" className="h-24 w-auto max-w-[45%] rounded-md border border-borda object-contain" />
            ) : (
              <p className="flex items-center gap-1 text-suave">
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                Preparando a capa
              </p>
            )}
            <div className="flex flex-col gap-1 text-[11px]">
              <span className="text-suave">{capa.tipo === "quadro" ? `Quadro em ${pontoNaLinha(Math.round(capa.segundos * S))}` : "Imagem da biblioteca"}</span>
              {capaVisivel ? (
                <a href={enderecoDaCapa(capa, true)} download className="text-destaque hover:underline">
                  Baixar a capa
                </a>
              ) : null}
              <button type="button" className="self-start text-suave hover:text-texto hover:underline" onClick={() => void guardarCapa(null, "A capa saiu.")}>
                Tirar a capa
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-suave">A imagem que as redes mostram antes do play. Ela fica na lista de cortes e em Exportados.</p>
        )}
        <button type="button" className="botao-secundario px-2 py-1.5" disabled={andamento !== null || !salvo} onClick={() => void capaDoCursor()}>
          <Camera className="size-3.5" aria-hidden />
          {salvo ? `Usar o quadro do cursor (${pontoNaLinha(tempo)})` : "Esperando salvar…"}
        </button>
        {imagensDaBiblioteca.length ? (
          <div className="flex gap-1.5">
            <select aria-label="Imagem para a capa" value={imagemParaCapa?.id ?? ""} onChange={(evento) => setImagemDaCapa(evento.target.value)} className="campo min-w-0 flex-1 px-2 py-1">
              {imagensDaBiblioteca.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="botao-secundario px-2 py-1"
              disabled={andamento !== null || !imagemParaCapa}
              onClick={() => {
                if (imagemParaCapa) void guardarCapa({ tipo: "imagem", midia_id: imagemParaCapa.id }, "A capa é a imagem escolhida.").catch((erro: unknown) => aoAvisar(erro instanceof Error ? erro.message : "A capa não mudou."));
              }}
            >
              Usar
            </button>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-borda p-2" aria-label="Transcrição do original">
        <h3 className="font-semibold uppercase tracking-wide text-suave">Transcrição do original</h3>
        <p className="text-[11px] text-suave">O que está no corte aparece aceso. Clique numa palavra e, com Shift, noutra para marcar um trecho.</p>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className="botao-secundario px-2 py-1.5"
            disabled={!faltam.length || andamento !== null}
            onClick={() => {
              void porTrechos(faltam, "pôr um trecho do original", "O trecho entrou no corte, na ordem do original. Ctrl+Z desfaz.");
              setSelecao(null);
            }}
          >
            <Plus className="size-3.5" aria-hidden />
            Pôr no corte
          </button>
          <button
            type="button"
            className="botao-secundario px-2 py-1.5"
            disabled={!tirar.length || andamento !== null}
            onClick={() => {
              try {
                const sem = executarComando(projeto, { comando: "linha.removerIntervalos", parametros: { intervalos: tirar } }, contextoDasMidias(mapaDasMidias)).projeto;
                if (editar(sem, "tirar um trecho do corte")) aoAvisar("O trecho saiu do corte. Ctrl+Z desfaz.");
              } catch (erro) {
                aoAvisar(erro instanceof Error ? erro.message : "O trecho não saiu do corte.");
              }
              setSelecao(null);
            }}
          >
            <Minus className="size-3.5" aria-hidden />
            Tirar do corte
          </button>
        </div>
        {palavras === null ? (
          <p className="flex items-center gap-2 text-suave">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            Lendo a fala do original
          </p>
        ) : palavras.length ? (
          <p ref={listaRef} className="max-h-80 overflow-y-auto rounded-md bg-painel-2 p-2 text-sm leading-relaxed" aria-label="Fala do vídeo original">
            {palavras.map((palavra, i) => {
              const dentro = noCorte(palavra);
              const marcada = marcadas !== null && i >= marcadas.de && i <= marcadas.ate;
              return (
                <span key={`${palavra.inicio}-${i}`}>
                  {i > 0 ? " " : null}
                  <button
                    type="button"
                    data-no-corte={dentro}
                    aria-pressed={marcada}
                    onClick={(evento) => clicarPalavra(i, evento.shiftKey)}
                    className={`rounded px-0.5 ${marcada ? "bg-destaque/40" : dentro ? "text-texto" : "text-apagado hover:text-suave"} ${dentro && !marcada ? "bg-painel-3" : ""}`}
                  >
                    {palavra.texto}
                  </button>
                </span>
              );
            })}
          </p>
        ) : (
          <p className="text-suave">O vídeo original não tem fala transcrita.</p>
        )}
      </section>
    </div>
  );
}
