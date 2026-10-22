"use client";

// O que alimenta a prévia: os quadros de cada clipe de vídeo (WebCodecs, ou o `<video>` quando o
// WebCodecs não dá) e o som de cada clipe (`<audio>` pelo Web Audio). Nenhum deles aparece: quem
// desenha é o compositor, e eles só seguem o relógio do editor.
import { useEffect, useRef, useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import { aplicarEfeitos, aplicarVolume } from "@/lib/previa/audio";
import { arquivoDaImagemDoClipe, arquivoDoSom, arquivoDoTom, usaVozLimpa } from "@/lib/previa/arquivos";
import type { ItemDaPrevia } from "@/lib/previa/camadas";
import { DecodificadorDeVideo, webCodecsDisponivel } from "@/lib/previa/decodificador";
import { fatorDoAbaixamento } from "@/lib/projeto/abaixar";
import { fatorDosFades, tempoNaMidia } from "@/lib/projeto/modelo";
import { type EfeitosVoz, ganhoParaIgualar } from "@/lib/projeto/som";
import { ANDAMENTO_MINIMO, velocidadeNaCurva } from "@/lib/projeto/velocidade";
import { type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";

/** Diferença, em segundos, entre a mídia e o relógio do editor a partir da qual ela é reposicionada. */
const DESVIO_MAXIMO = 0.3;
/**
 * Na passagem para outro clipe da mesma mídia (os pedaços de um corte dividem o elemento), um quadro
 * basta: com os 0,3 s, um corte curto (uma palavra apagada, um "ahn") continuava tocando e o som ficava
 * atrás da boca.
 */
const DESVIO_NA_TROCA = 0.04;

export type { ItemDaPrevia };
export { arquivoDaImagemDoClipe, arquivoDoTom, usaVozLimpa };

/** Entrega o quadro de um instante da mídia, em segundos; null enquanto não tem. */
export type FonteDeQuadros = { quadro: (segundos: number) => TexImageSource | null };

/** Instante da mídia que a prévia quer: o do cursor no clipe ativo, o começo do clipe que vem a seguir. */
function segundosNaMidia(item: ItemDaPrevia, tempo: Tick): number {
  return (item.ativo ? tempoNaMidia(item.clipe, tempo) : item.clipe.entrada) / TICKS_POR_SEGUNDO;
}

/** Faz um `<video>` ou `<audio>` tocar, parar e pular junto com o relógio do editor. */
function useSeguirRelogio(elementoRef: React.RefObject<HTMLMediaElement | null>, item: ItemDaPrevia, tempo: Tick, tocando: boolean) {
  const alvo = segundosNaMidia(item, tempo);
  const tocar = item.ativo && tocando;
  // Com curva, a velocidade do instante (o elemento muda o andamento sem mudar o tom)
  const { clipe } = item;
  const velocidade = clipe.curva_velocidade
    ? Math.max(ANDAMENTO_MINIMO, velocidadeNaCurva(clipe.curva_velocidade, clipe.velocidade, (tempo - clipe.inicio) / clipe.duracao))
    : clipe.velocidade;

  // O clipe que o elemento segue (trocou: a próxima conferência usa o limite de um quadro) e onde ele estava ao
  // começar a tocar. O elemento só anda uns 250 ms depois do play (no primeiro, o contexto de áudio nasce ali),
  // enquanto o relógio já anda: sem conferir de novo quando ele começa de fato, o som ficava esse tanto atrás,
  // abaixo do limite de 0,3 s, até a pessoa pausar
  const seguido = useRef<{ id: string | null; trocou: boolean; partida: number | null }>({ id: null, trocou: false, partida: null });

  useEffect(() => {
    const elemento = elementoRef.current;
    if (!elemento) return;
    if (seguido.current.id !== clipe.id) seguido.current = { id: clipe.id, trocou: seguido.current.id !== null, partida: null };
    elemento.playbackRate = velocidade;
    const desvio = Math.abs(elemento.currentTime - alvo);
    if (tocar) {
      if (elemento.paused) {
        if (desvio > 0.05) elemento.currentTime = alvo;
        elemento.play().catch(() => {});
        seguido.current.trocou = false;
        seguido.current.partida = elemento.currentTime;
      } else if (!elemento.seeking && elemento.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        const { partida, trocou } = seguido.current;
        // Logo depois do play, espera o elemento andar de fato antes de conferir
        if (partida !== null && Math.abs(elemento.currentTime - partida) < 0.05) return;
        if (desvio > (trocou || partida !== null ? DESVIO_NA_TROCA : DESVIO_MAXIMO * velocidade)) elemento.currentTime = alvo;
        seguido.current.trocou = false;
        seguido.current.partida = null;
      }
    } else {
      if (!elemento.paused) elemento.pause();
      if (desvio > 0.01) elemento.currentTime = alvo;
    }
  }, [elementoRef, alvo, tocar, velocidade, clipe.id]);
}

type PropsFonte = {
  item: ItemDaPrevia;
  tempo: Tick;
  tocando: boolean;
  aoRegistrar: (fonte: FonteDeQuadros | null) => void;
  /** Chamado quando há um quadro novo para desenhar com a prévia parada. */
  aoTerQuadro: () => void;
};

/** Quadros de um clipe de vídeo: WebCodecs quando dá, `<video>` quando não. Imagem parada: o bitmap dela. */
export function FonteDoClipe(props: PropsFonte) {
  if (props.item.midia.imagem) return <FonteImagem {...props} />;
  return <FonteDeVideo {...props} />;
}

function FonteDeVideo(props: PropsFonte) {
  const temProxy = props.item.midia.arquivos.includes("proxy.mp4");
  const [usarVideo, setUsarVideo] = useState(() => !temProxy || !webCodecsDisponivel());
  if (usarVideo) return <FonteVideo {...props} />;
  return <FonteWebCodecs {...props} arquivo={arquivoDaImagem(props.item)} aoFalhar={() => setUsarVideo(true)} />;
}

/**
 * Imagem parada: a cópia leve (proxy.webp) vira um ImageBitmap uma vez, e é o mesmo quadro em todo instante.
 * Com o alfa já pré-multiplicado no bitmap: o WebGL ignora o UNPACK_PREMULTIPLY_ALPHA num ImageBitmap, e o
 * compositor espera a cor multiplicada pelo alfa (sem isso, a borda de uma forma clara saía em escada).
 */
function FonteImagem({ item, aoRegistrar, aoTerQuadro }: PropsFonte) {
  const url = arquivoDaMidia(item.midia.id, "proxy.webp");
  const avisos = useRef({ aoRegistrar, aoTerQuadro });
  useEffect(() => {
    avisos.current = { aoRegistrar, aoTerQuadro };
  });
  useEffect(() => {
    let bitmap: ImageBitmap | null = null;
    let vivo = true;
    avisos.current.aoRegistrar({ quadro: () => bitmap });
    fetch(url)
      .then((resposta) => (resposta.ok ? resposta.blob() : Promise.reject(new Error(`proxy.webp: ${resposta.status}`))))
      .then((blob) => createImageBitmap(blob, { premultiplyAlpha: "premultiply" }))
      .then((pronto) => {
        if (!vivo) {
          pronto.close();
          return;
        }
        bitmap = pronto;
        avisos.current.aoTerQuadro();
      })
      .catch(() => {});
    return () => {
      vivo = false;
      avisos.current.aoRegistrar(null);
      bitmap?.close();
    };
  }, [url]);
  return null;
}

function arquivoDaImagem(item: ItemDaPrevia): string {
  return arquivoDaImagemDoClipe(item.clipe, item.midia);
}

/**
 * A máscara da pessoa (recorte do fundo): outro vídeo, no tempo da cópia leve, decodificado junto com
 * ela. Sem WebCodecs, não há máscara na prévia (o clipe aparece inteiro).
 */
export function FonteDaMascara(props: PropsFonte) {
  const [falhou, setFalhou] = useState(() => !webCodecsDisponivel());
  if (falhou) return null;
  return <FonteWebCodecs {...props} arquivo="mascara.mp4" aoFalhar={() => setFalhou(true)} />;
}

function FonteWebCodecs({ item, tempo, aoRegistrar, aoTerQuadro, aoFalhar, arquivo = "proxy.mp4" }: PropsFonte & { aoFalhar: () => void; arquivo?: string }) {
  const url = arquivoDaMidia(item.midia.id, arquivo);
  const decodificadorRef = useRef<DecodificadorDeVideo | null>(null);
  // As funções mudam a cada render; o decodificador é criado uma vez por arquivo
  const avisos = useRef({ aoRegistrar, aoTerQuadro, aoFalhar });
  useEffect(() => {
    avisos.current = { aoRegistrar, aoTerQuadro, aoFalhar };
  });

  useEffect(() => {
    const decodificador = new DecodificadorDeVideo(url, () => {
      if (decodificador.falhou) avisos.current.aoFalhar();
      else avisos.current.aoTerQuadro();
    });
    decodificadorRef.current = decodificador;
    avisos.current.aoRegistrar({ quadro: (segundos) => decodificador.quadroEm(segundos) });
    return () => {
      avisos.current.aoRegistrar(null);
      decodificador.fechar();
      decodificadorRef.current = null;
    };
  }, [url]);

  // O clipe que vem a seguir já começa a decodificar o primeiro quadro
  const alvo = segundosNaMidia(item, tempo);
  useEffect(() => {
    decodificadorRef.current?.quadroEm(alvo);
  }, [alvo]);

  return null;
}

function FonteVideo({ item, tempo, tocando, aoRegistrar, aoTerQuadro }: PropsFonte) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useSeguirRelogio(videoRef, item, tempo, tocando);

  const registrarRef = useRef(aoRegistrar);
  useEffect(() => {
    registrarRef.current = aoRegistrar;
  });
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    registrarRef.current({ quadro: () => (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth ? video : null) });
    return () => registrarRef.current(null);
  }, []);

  const { midia } = item;
  return (
    <video
      ref={videoRef}
      src={arquivoDaMidia(midia.id, midia.arquivos.includes("proxy.mp4") ? arquivoDaImagem(item) : "proxy.m4a")}
      className="absolute inset-0 size-full object-contain"
      muted
      playsInline
      preload="auto"
      onLoadedData={aoTerQuadro}
      onSeeked={aoTerQuadro}
    />
  );
}

/** O som de um clipe, com o volume e os fades pelo Web Audio (até 400%). */
export function SomDoClipe({ item, tempo, tocando }: { item: ItemDaPrevia; tempo: Tick; tocando: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  useSeguirRelogio(audioRef, item, tempo, tocando);

  // Os fades e o abaixar na fala mudam o ganho a cada quadro da tela enquanto toca, como no render
  const igualar = item.clipe.igualar_volume ? 10 ** (ganhoParaIgualar(item.midia.audio?.lufs) / 20) : 1;
  const ganho = item.ativo ? item.clipe.volume * igualar * fatorDosFades(item.clipe, tempo) * fatorDoAbaixamento(item.clipe, tempo) : 0;
  useEffect(() => {
    if (audioRef.current) aplicarVolume(audioRef.current, ganho);
  }, [ganho, tocando]);
  // Os efeitos de voz mudam pouco: só quando o clipe muda (ou a reprodução cria o contexto)
  const efeitos = JSON.stringify(item.clipe.efeitos_voz ?? null);
  useEffect(() => {
    if (audioRef.current) aplicarEfeitos(audioRef.current, JSON.parse(efeitos) as EfeitosVoz | null);
  }, [efeitos, tocando]);

  return <audio ref={audioRef} src={arquivoDoSom(item)} preload="auto" />;
}
