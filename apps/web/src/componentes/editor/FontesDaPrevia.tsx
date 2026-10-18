"use client";

// O que alimenta a prévia: os quadros de cada clipe de vídeo (WebCodecs, ou o `<video>` quando o
// WebCodecs não dá) e o som de cada clipe (`<audio>` pelo Web Audio). Nenhum deles aparece: quem
// desenha é o compositor, e eles só seguem o relógio do editor.
import { useEffect, useRef, useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import { aplicarEfeitos, aplicarVolume } from "@/lib/previa/audio";
import { DecodificadorDeVideo, webCodecsDisponivel } from "@/lib/previa/decodificador";
import { fatorDoAbaixamento } from "@/lib/projeto/abaixar";
import { type Clipe, type Faixa, fatorDosFades, tempoNaMidia } from "@/lib/projeto/modelo";
import { chaveDoTom, type EfeitosVoz, ganhoParaIgualar } from "@/lib/projeto/som";
import { ANDAMENTO_MINIMO, velocidadeNaCurva } from "@/lib/projeto/velocidade";
import type { EfeitoDeTransicao } from "@/lib/projeto/transicao";
import { type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

/** Diferença, em segundos, entre a mídia e o relógio do editor a partir da qual ela é reposicionada. */
const DESVIO_MAXIMO = 0.3;

export type ItemDaPrevia = {
  chave: string;
  clipe: Clipe;
  faixa: Faixa;
  midia: Midia;
  ativo: boolean;
  /** Efeitos das transições sobre este clipe (só na principal, durante a janela delas). */
  efeitos?: EfeitoDeTransicao[];
};

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
 * Sem pré-multiplicar o alfa: o compositor faz isso ao enviar a textura, como no PNG dos textos.
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
      .then((blob) => createImageBitmap(blob, { premultiplyAlpha: "none" }))
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

/** A cópia leve da imagem sem ruído, quando o clipe pede e ela está pronta; senão, a de sempre. */
function arquivoDaImagem(item: ItemDaPrevia): string {
  return item.clipe.imagem_limpa && item.midia.arquivos.includes("limpo_proxy.mp4") ? "limpo_proxy.mp4" : "proxy.mp4";
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

/** A voz limpa, quando o clipe pede e ela já está pronta (o mesmo tempo do original); senão, o som do proxy. */
export function usaVozLimpa(item: ItemDaPrevia): boolean {
  return Boolean(item.clipe.voz_limpa) && item.midia.arquivos.includes("voz_limpa.m4a");
}

/** O arquivo da voz no tom do clipe, quando ele pede e o arquivo já está pronto; senão, null. */
export function arquivoDoTom(item: ItemDaPrevia): string | null {
  const tom = item.clipe.tom ?? 0;
  if (!tom) return null;
  const nome = `${chaveDoTom(tom, usaVozLimpa(item))}.m4a`;
  return item.midia.arquivos.includes(nome) ? nome : null;
}

function arquivoDoSom(item: ItemDaPrevia): string {
  const { midia } = item;
  const tom = arquivoDoTom(item);
  if (tom) return arquivoDaMidia(midia.id, tom);
  if (usaVozLimpa(item)) return arquivoDaMidia(midia.id, "voz_limpa.m4a");
  return arquivoDaMidia(midia.id, midia.arquivos.includes("proxy.mp4") ? "proxy.mp4" : "proxy.m4a");
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
