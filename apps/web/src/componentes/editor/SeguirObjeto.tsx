"use client";

import { Crosshair, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Comando } from "@/lib/projeto/comandos";
import { type Clipe, acharClipe, fimDoClipe, type Projeto, tempoNaMidia } from "@/lib/projeto/modelo";
import { type CaixaNaImagem, caminhoDoSeguidor } from "@/lib/projeto/seguirObjeto";
import { chamarApi } from "@/lib/api";
import { seguirObjetoNoWorker } from "@/lib/rastreio";
import { type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import { arquivoDaImagemDoClipe } from "./FontesDaPrevia";

/** O que a prévia devolve quando a pessoa termina de marcar: o clipe de vídeo embaixo e o retângulo na imagem dele. */
export type ObjetoMarcado = { alvoId: string; caixa: CaixaNaImagem };

type Opcoes = {
  projeto: Projeto | null;
  midias: ReadonlyMap<string, Midia>;
  tempo: Tick;
  executar: (comando: Comando) => void;
  aoAvisar: (mensagem: string) => void;
};

/**
 * O fluxo do "Seguir um objeto", no Editor (que não desmonta no meio): a pessoa pede no painel, marca o
 * objeto na prévia, o worker segue e o caminho vira keyframes do clipe que segue.
 */
export function useSeguirObjeto({ projeto, midias, tempo, executar, aoAvisar }: Opcoes) {
  const [marcando, setMarcando] = useState<string | null>(null);
  // "esconder": o objeto é marcado no próprio clipe e vira uma máscara pixelizada; "seguir": o clipe anda junto
  const [modo, setModo] = useState<"seguir" | "esconder">("seguir");
  const [andamento, setAndamento] = useState<{ seguidorId: string; texto: string } | null>(null);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);

  function iniciar(seguidorId: string, novoModo: "seguir" | "esconder" = "seguir") {
    setModo(novoModo);
    setMarcando(seguidorId);
    aoAvisar(novoModo === "esconder" ? "Desenhe na prévia um retângulo em volta do que vai ficar escondido (uma placa, um logo). Esc cancela." : "Desenhe na prévia um retângulo em volta do objeto. Esc cancela.");
  }

  /** Esconder: segue o objeto no próprio clipe e pede a máscara; o clipe ganha o objeto escondido. */
  async function esconder(clipeId: string, caixa: CaixaNaImagem) {
    if (!projeto) return;
    const clipe = acharClipe(projeto, clipeId)?.clipe;
    const midia = clipe?.midia_id ? midias.get(clipe.midia_id) : undefined;
    if (!clipe || !midia?.video) return;
    const segundos = (instante: Tick) => tempoNaMidia(clipe, instante) / TICKS_POR_SEGUNDO;
    const pedido = { arquivo: arquivoDaImagemDoClipe(clipe, midia), t: segundos(tempo), caixa, de: segundos(clipe.inicio), ate: segundos(fimDoClipe(clipe)) };
    try {
      const rastreio = await seguirObjetoNoWorker(midia.id, pedido, (texto) => ativo.current && setAndamento({ seguidorId: clipeId, texto }), () => ativo.current);
      if (!rastreio) return;
      await chamarApi(`/midias/${midia.id}/objetos-escondidos`, { metodo: "POST", corpo: { rastreio_id: rastreio.id } });
      const objetos = [...(clipe.esconder_objetos ?? []), { rastreio: rastreio.id, modo: "pixelizar" as const, forca: 0.7 }];
      executar({ comando: "clipe.esconderObjetos", parametros: { clipeId, objetos } });
      aoAvisar("O objeto vai ficar escondido assim que a máscara for gravada. Ctrl+Z desfaz.");
    } catch (erro) {
      if (ativo.current) aoAvisar(erro instanceof Error ? erro.message : "Não foi possível esconder o objeto agora.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  async function confirmar({ alvoId, caixa }: ObjetoMarcado) {
    const seguidorId = marcando;
    setMarcando(null);
    if (!projeto || !seguidorId) return;
    if (modo === "esconder") return esconder(alvoId, caixa);
    const seguidor = acharClipe(projeto, seguidorId)?.clipe;
    const alvo = acharClipe(projeto, alvoId)?.clipe;
    const midia = alvo?.midia_id ? midias.get(alvo.midia_id) : undefined;
    if (!seguidor || !alvo || !midia?.video) return;
    // O trecho em que os dois aparecem juntos, em segundos da mídia do vídeo
    const inicio = Math.max(seguidor.inicio, alvo.inicio);
    const fim = Math.min(fimDoClipe(seguidor), fimDoClipe(alvo));
    if (tempo < inicio || tempo >= fim) {
      aoAvisar("Marque o objeto num instante em que o clipe que segue também aparece.");
      return;
    }
    const segundos = (instante: Tick) => tempoNaMidia(alvo, instante) / TICKS_POR_SEGUNDO;
    const pedido = { arquivo: arquivoDaImagemDoClipe(alvo, midia), t: segundos(tempo), caixa, de: segundos(inicio), ate: segundos(fim) };
    const tamanho = { largura: midia.video.largura, altura: midia.video.altura };
    const [largura, altura] = projeto.proporcao.split(":").map(Number);
    try {
      const rastreio = await seguirObjetoNoWorker(midia.id, pedido, (texto) => ativo.current && setAndamento({ seguidorId, texto }), () => ativo.current);
      if (!rastreio) return;
      const { pontos } = rastreio;
      const caminho = caminhoDoSeguidor(seguidor, alvo as Clipe, pontos, tamanho, { largura, altura }, projeto.taxa, tempo);
      if (!caminho) {
        aoAvisar("O objeto não foi achado no trecho em que os dois clipes aparecem.");
        return;
      }
      executar({ comando: "clipe.seguirObjeto", parametros: { clipeId: seguidor.id, caminho } });
      aoAvisar(`O clipe agora segue o objeto (${caminho.x.length + caminho.y.length} keyframes). Ctrl+Z desfaz.`);
    } catch (erro) {
      if (ativo.current) aoAvisar(erro instanceof Error ? erro.message : "Não foi possível seguir o objeto agora.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  return { marcando, modo, andamento, iniciar, confirmar: (marcado: ObjetoMarcado) => void confirmar(marcado), cancelar: () => setMarcando(null) };
}

/** O botão da aba Básico, nos clipes que ficam por cima (textos, imagens e vídeos de sobreposição). */
export function BotaoSeguirObjeto({ clipe, travada, marcando, andamento, aoIniciar }: { clipe: Clipe; travada: boolean; marcando: boolean; andamento: string | null; aoIniciar: () => void }) {
  return (
    <div className="mt-2 border-t border-borda/60 pt-2">
      <button type="button" className="botao-secundario w-full px-3 py-1.5 text-xs" disabled={travada || marcando || andamento !== null} onClick={aoIniciar}>
        {andamento ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Crosshair className="size-4" aria-hidden />}
        {andamento ?? (marcando ? "Marque o objeto na prévia" : "Seguir um objeto do vídeo")}
      </button>
      {!andamento && !marcando ? (
        <p className="mt-1 text-[11px] text-suave">
          {clipe.texto ? "O texto" : "O clipe"} anda junto com algo que se move no vídeo de baixo, guardando a distância de agora.
        </p>
      ) : null}
    </div>
  );
}

type PropsMarcador = {
  /** Segue o objeto no retângulo (pixels da prévia); devolve a mensagem se não há vídeo embaixo dele, ou null. */
  aoMarcar: (retangulo: { esquerda: number; topo: number; largura: number; altura: number }) => string | null;
  aoCancelar: () => void;
};

/** Por cima da prévia enquanto a pessoa marca o objeto: arrastar desenha o retângulo. */
export function MarcadorDeObjeto({ aoMarcar, aoCancelar }: PropsMarcador) {
  const [inicio, setInicio] = useState<{ x: number; y: number } | null>(null);
  const [retangulo, setRetangulo] = useState<{ esquerda: number; topo: number; largura: number; altura: number } | null>(null);
  const [erro, setErro] = useState("");
  const cancelarRef = useRef(aoCancelar);
  useEffect(() => {
    cancelarRef.current = aoCancelar;
  });
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        cancelarRef.current();
      }
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, []);

  const ponto = (evento: React.PointerEvent<HTMLDivElement>) => {
    const caixa = evento.currentTarget.getBoundingClientRect();
    return { x: Math.min(Math.max(evento.clientX - caixa.left, 0), caixa.width), y: Math.min(Math.max(evento.clientY - caixa.top, 0), caixa.height) };
  };

  return (
    <div
      className="absolute inset-0 z-10 cursor-crosshair"
      role="application"
      aria-label="Marcar o objeto: arraste para desenhar um retângulo em volta dele"
      onPointerDown={(evento) => {
        if (evento.button !== 0) return;
        evento.stopPropagation();
        evento.currentTarget.setPointerCapture(evento.pointerId);
        const p = ponto(evento);
        setInicio(p);
        setRetangulo({ esquerda: p.x, topo: p.y, largura: 0, altura: 0 });
        setErro("");
      }}
      onPointerMove={(evento) => {
        if (!inicio) return;
        const p = ponto(evento);
        setRetangulo({ esquerda: Math.min(p.x, inicio.x), topo: Math.min(p.y, inicio.y), largura: Math.abs(p.x - inicio.x), altura: Math.abs(p.y - inicio.y) });
      }}
      onPointerUp={() => setInicio(null)}
    >
      <div className="absolute inset-0 bg-black/30" aria-hidden />
      {retangulo && retangulo.largura > 0 ? (
        <div
          className="absolute border-2 border-destaque bg-destaque/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
          style={{ left: retangulo.esquerda, top: retangulo.topo, width: retangulo.largura, height: retangulo.altura }}
          aria-hidden
        />
      ) : null}
      <div className="absolute inset-x-2 top-2 flex flex-wrap items-center justify-center gap-2" onPointerDown={(evento) => evento.stopPropagation()}>
        <span className="rounded bg-black/70 px-2 py-1 text-[11px] text-white">{erro || "Arraste em volta do objeto que o clipe vai seguir"}</span>
        <button type="button" className="botao-secundario px-2 py-1 text-xs" onClick={aoCancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="botao-principal px-2 py-1 text-xs"
          disabled={!retangulo || retangulo.largura < 8 || retangulo.altura < 8 || inicio !== null}
          onClick={() => retangulo && setErro(aoMarcar(retangulo) ?? "")}
        >
          Seguir
        </button>
      </div>
    </div>
  );
}
