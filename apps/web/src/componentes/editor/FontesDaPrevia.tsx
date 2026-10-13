"use client";

// O que alimenta a prévia: os quadros de cada clipe de vídeo (WebCodecs, ou o `<video>` quando o
// WebCodecs não dá) e o som de cada clipe (`<audio>` pelo Web Audio). Nenhum deles aparece: quem
// desenha é o compositor, e eles só seguem o relógio do editor.
import { useEffect, useRef, useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import { aplicarVolume } from "@/lib/previa/audio";
import { DecodificadorDeVideo, webCodecsDisponivel } from "@/lib/previa/decodificador";
import { type Clipe, type Faixa, fatorDosFades, tempoNaMidia } from "@/lib/projeto/modelo";
import { type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

/** Diferença, em segundos, entre a mídia e o relógio do editor a partir da qual ela é reposicionada. */
const DESVIO_MAXIMO = 0.3;

export type ItemDaPrevia = { chave: string; clipe: Clipe; faixa: Faixa; midia: Midia; ativo: boolean };

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
  const { velocidade } = item.clipe;

  useEffect(() => {
    const elemento = elementoRef.current;
    if (!elemento) return;
    elemento.playbackRate = velocidade;
    const desvio = Math.abs(elemento.currentTime - alvo);
    if (tocar) {
      if (elemento.paused) {
        if (desvio > 0.05) elemento.currentTime = alvo;
        elemento.play().catch(() => {});
      } else if (!elemento.seeking && elemento.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && desvio > DESVIO_MAXIMO * velocidade) {
        elemento.currentTime = alvo;
      }
    } else {
      if (!elemento.paused) elemento.pause();
      if (desvio > 0.01) elemento.currentTime = alvo;
    }
  }, [elementoRef, alvo, tocar, velocidade]);
}

type PropsFonte = {
  item: ItemDaPrevia;
  tempo: Tick;
  tocando: boolean;
  aoRegistrar: (fonte: FonteDeQuadros | null) => void;
  /** Chamado quando há um quadro novo para desenhar com a prévia parada. */
  aoTerQuadro: () => void;
};

/** Quadros de um clipe de vídeo: WebCodecs quando dá, `<video>` quando não. */
export function FonteDoClipe(props: PropsFonte) {
  const temProxy = props.item.midia.arquivos.includes("proxy.mp4");
  const [usarVideo, setUsarVideo] = useState(() => !temProxy || !webCodecsDisponivel());
  if (usarVideo) return <FonteVideo {...props} />;
  return <FonteWebCodecs {...props} aoFalhar={() => setUsarVideo(true)} />;
}

function FonteWebCodecs({ item, tempo, aoRegistrar, aoTerQuadro, aoFalhar }: PropsFonte & { aoFalhar: () => void }) {
  const url = arquivoDaMidia(item.midia.id, "proxy.mp4");
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
      src={arquivoDaMidia(midia.id, midia.arquivos.includes("proxy.mp4") ? "proxy.mp4" : "proxy.m4a")}
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

  // Os fades mudam o ganho a cada quadro da tela enquanto toca, como o afade do render
  const ganho = item.ativo ? item.clipe.volume * fatorDosFades(item.clipe, tempo) : 0;
  useEffect(() => {
    if (audioRef.current) aplicarVolume(audioRef.current, ganho);
  }, [ganho, tocando]);

  const { midia } = item;
  return <audio ref={audioRef} src={arquivoDaMidia(midia.id, midia.arquivos.includes("proxy.mp4") ? "proxy.mp4" : "proxy.m4a")} preload="auto" />;
}
