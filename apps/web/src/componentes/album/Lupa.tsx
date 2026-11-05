"use client";

import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, LoaderCircle, Maximize, Minimize, ScanFace, X, ZoomIn } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CLASSE_DA_CATEGORIA, CLASSE_DA_COR, dataDaFoto, Estrelas, IconeDaCategoria } from "@/componentes/album/comum";
import {
  CATEGORIAS,
  CORES,
  estadoDoFocoDoRosto,
  estadoDoOlho,
  type FotoDoAlbum,
  grupoDaFoto,
  type Mudanca,
  type PessoaDoAlbum,
  recorteDoRosto,
  resumoDaCamera,
} from "@/lib/album/fotos";
import { arquivoDaFoto, mudaOEnquadramento, tamanhoExibido } from "@/lib/album/edicao";
import type { TracoDoRetoque } from "@/lib/album/retoque";
import { arquivoDaMidia } from "@/lib/api";

const ZOOM_MAXIMO = 4;
const NOME_DO_OLHO = { aberto: "Olhos abertos", meio: "Olhos meio fechados", fechado: "Olhos fechados" } as const;
const NOME_DO_FOCO = { nitido: "Nítido", macio: "Macio", borrado: "Borrado" } as const;

/** O zoom da lupa: null cabe na tela; senão a escala em pixels da foto e o deslocamento do meio dela, em pixels da tela. */
type Zoom = { escala: number; x: number; y: number } | null;

/**
 * A foto grande: andar pelas setas, dar nota, cor e marcação; zoom pela roda, pelo clique (100% no ponto) ou pela
 * tecla Z, com arrasto; tela cheia (F); a tira com as parecidas do mesmo grupo; e os rostos da foto (R), com os
 * olhos e o foco de cada um.
 */
export function Lupa({
  albumId,
  foto,
  fotos,
  pessoas,
  indice,
  total,
  aoFechar,
  aoAndar,
  aoIr,
  aoAplicar,
  proxima,
  retocando = false,
  aoSalvarPincel,
  aoSairDoPincel,
}: {
  albumId: string;
  foto: FotoDoAlbum;
  fotos: FotoDoAlbum[];
  pessoas: PessoaDoAlbum[];
  indice: number;
  total: number;
  aoFechar: () => void;
  aoAndar: (passo: number) => void;
  aoIr: (midiaId: string) => void;
  aoAplicar: (mudanca: Mudanca) => void;
  proxima?: FotoDoAlbum;
  /** O pincel do retoque: pinta na foto original o que é pele (incluir) e o que não se retoca (excluir). */
  retocando?: boolean;
  aoSalvarPincel?: (tracos: TracoDoRetoque[]) => void;
  aoSairDoPincel?: () => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<Zoom>(null);
  const [rostosVisiveis, setRostosVisiveis] = useState(true);
  const [rostoEmFoco, setRostoEmFoco] = useState<number | null>(null);
  const [cheia, setCheia] = useState(false);
  const arrasto = useRef<{ x: number; y: number; zx: number; zy: number; moveu: boolean } | null>(null);
  const [fotoAnterior, setFotoAnterior] = useState(foto.midia_id);
  // Outra foto: o zoom volta a caber (ajustado durante a renderização, sem efeito)
  if (fotoAnterior !== foto.midia_id) {
    setFotoAnterior(foto.midia_id);
    setZoom(null);
    setRostoEmFoco(null);
  }

  // Antes e depois (\ ou o botão): a original, sem a edição
  const [antes, setAntes] = useState(false);
  const editada = Boolean(foto.edicao?.gerada);
  const mostrandoAntes = (antes || retocando) && editada;
  const [tracos, setTracos] = useState<TracoDoRetoque[]>(() => foto.edicao?.retoque?.pincel ?? []);
  const [modoDoPincel, setModoDoPincel] = useState<"incluir" | "excluir">("incluir");
  const [raioDoPincel, setRaioDoPincel] = useState(0.025);
  const imagem = useRef<HTMLDivElement>(null);
  const pintando = useRef(false);
  /** O ponto do ponteiro em frações da foto original. */
  const naFoto = (evento: React.PointerEvent): [number, number] | null => {
    const caixa = imagem.current?.getBoundingClientRect();
    if (!caixa) return null;
    const x = (evento.clientX - caixa.left) / caixa.width;
    const y = (evento.clientY - caixa.top) / caixa.height;
    return [Math.round(Math.min(1, Math.max(0, x)) * 10000) / 10000, Math.round(Math.min(1, Math.max(0, y)) * 10000) / 10000];
  };
  const [largura, altura] = mostrandoAntes ? [foto.largura ?? 1, foto.altura ?? 1] : tamanhoExibido(foto);
  const [tamanhoDaArea, setTamanhoDaArea] = useState({ largura: 0, altura: 0 });
  useEffect(() => {
    const elemento = area.current;
    if (!elemento) return;
    const medir = () => setTamanhoDaArea({ largura: elemento.clientWidth, altura: elemento.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);
  /** A escala em que a foto cabe na área (com folga dos lados para as setas). */
  const caber = Math.min(1, Math.max(1, tamanhoDaArea.largura - 112) / largura, Math.max(1, tamanhoDaArea.altura - 16) / altura);
  const escalaDeCaber = useCallback(() => caber, [caber]);

  /** Muda a escala mantendo parado o ponto da tela p (em relação ao meio da área). */
  const escalar = useCallback(
    (nova: number, px: number, py: number) => {
      const caber = escalaDeCaber();
      setZoom((atual) => {
        const de = atual ?? { escala: caber, x: 0, y: 0 };
        const escala = Math.min(ZOOM_MAXIMO, Math.max(caber, nova));
        if (escala <= caber * 1.001) return null;
        const r = escala / de.escala;
        return { escala, x: px - (px - de.x) * r, y: py - (py - de.y) * r };
      });
    },
    [escalaDeCaber],
  );

  const alternarCheia = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void raiz.current?.requestFullscreen?.();
  }, []);
  useEffect(() => {
    const mudou = () => setCheia(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", mudou);
    return () => document.removeEventListener("fullscreenchange", mudou);
  }, []);

  // Z (100% no meio ou de volta a caber), F (tela cheia), R (os rostos); o resto é do álbum
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
      const alvo = evento.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) return;
      const letra = evento.key.toLowerCase();
      if (letra === "z") {
        evento.preventDefault();
        if (zoom) setZoom(null);
        else escalar(1, 0, 0);
      } else if (letra === "f") {
        evento.preventDefault();
        alternarCheia();
      } else if (letra === "r") {
        evento.preventDefault();
        setRostosVisiveis((v) => !v);
      } else if (evento.key === "\\") {
        evento.preventDefault();
        setAntes((a) => !a);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [zoom, escalar, alternarCheia]);

  // A roda aproxima e afasta no ponteiro (ouvinte não passivo, para segurar a rolagem da página)
  useEffect(() => {
    const elemento = area.current;
    if (!elemento) return;
    const roda = (evento: WheelEvent) => {
      evento.preventDefault();
      const caixa = elemento.getBoundingClientRect();
      const atual = zoom?.escala ?? escalaDeCaber();
      escalar(atual * Math.exp(-evento.deltaY * 0.0015), evento.clientX - caixa.left - caixa.width / 2, evento.clientY - caixa.top - caixa.height / 2);
    };
    elemento.addEventListener("wheel", roda, { passive: false });
    return () => elemento.removeEventListener("wheel", roda);
  }, [zoom, escalar, escalaDeCaber]);

  const doPonteiro = (evento: React.PointerEvent) => {
    const caixa = area.current!.getBoundingClientRect();
    return { px: evento.clientX - caixa.left - caixa.width / 2, py: evento.clientY - caixa.top - caixa.height / 2 };
  };

  const grupo = grupoDaFoto(fotos, foto);
  const rostos = foto.medidas?.rostos ?? [];
  const nomeDaPessoa = (n: number) => pessoas.find((p) => p.numero === n)?.nome || `Pessoa ${n}`;
  const categoria = foto.categoria ? CATEGORIAS.find((c) => c.id === foto.categoria) : null;
  const escala = zoom?.escala ?? null;
  const exibida = { largura: largura * (escala ?? caber), altura: altura * (escala ?? caber) };
  // Acima da cópia leve (1920 px no lado maior), o zoom lê a imagem de resolução cheia
  // A cópia leve editada não tem versão de resolução cheia: o zoom fica nela
  const leve = mostrandoAntes ? "proxy.webp" : arquivoDaFoto(foto, albumId, "proxy");
  const arquivo = escala && !(editada && !mostrandoAntes) && Math.max(largura, altura) * escala > Math.min(Math.max(largura, altura), 1920) * 1.05 ? "imagem.png" : leve;
  // Os rostos foram medidos na original: com giro ou recorte, as caixas não caem no lugar
  const caixasNoLugar = mostrandoAntes || !mudaOEnquadramento(foto);

  return (
    <div ref={raiz} className="fixed inset-0 z-40 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={`Foto ${foto.nome}`}>
      <div className="flex h-12 shrink-0 items-center gap-3 px-3 text-sm">
        <span className="min-w-0 flex-1 truncate">
          {foto.nome}
          <span className="ml-2 text-white/60 tabular-nums">
            {(indice + 1).toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}
          </span>
        </span>
        {categoria ? (
          <span className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium md:flex ${CLASSE_DA_CATEGORIA[categoria.id]}`} title={foto.motivo ?? undefined}>
            <IconeDaCategoria categoria={categoria.id} />
            {categoria.nome}
            {foto.nota_ia !== null && foto.nota_ia !== undefined ? ` · ${foto.nota_ia}` : ""}
          </span>
        ) : null}
        <span className="hidden text-xs text-white/60 lg:inline">{[dataDaFoto(foto.exif?.data), resumoDaCamera(foto.exif)].filter(Boolean).join(" · ")}</span>
        <button
          type="button"
          className="flex h-8 items-center gap-1 rounded-md px-2 text-xs tabular-nums hover:bg-white/10"
          onClick={() => (zoom ? setZoom(null) : escalar(1, 0, 0))}
          title="Zoom: 100% ou caber (Z)"
          aria-label="Zoom"
        >
          <ZoomIn className="size-4" aria-hidden />
          {escala ? `${Math.round(escala * 100)}%` : "Caber"}
        </button>
        {editada ? (
          <button
            type="button"
            className={`flex h-8 items-center gap-1 rounded-md px-2 text-xs hover:bg-white/10 ${mostrandoAntes ? "bg-white/15" : ""}`}
            onClick={() => setAntes((a) => !a)}
            aria-pressed={mostrandoAntes}
            title="Antes e depois da edição (\)"
          >
            {mostrandoAntes ? "Antes" : "Depois"}
          </button>
        ) : null}
        {rostos.length ? (
          <button
            type="button"
            className={`flex size-8 items-center justify-center rounded-md hover:bg-white/10 ${rostosVisiveis ? "text-destaque" : ""}`}
            onClick={() => setRostosVisiveis((v) => !v)}
            aria-pressed={rostosVisiveis}
            aria-label="Rostos (R)"
            title="Rostos (R)"
          >
            <ScanFace className="size-5" aria-hidden />
          </button>
        ) : null}
        <button type="button" className="flex size-8 items-center justify-center rounded-md hover:bg-white/10" onClick={alternarCheia} aria-label="Tela cheia (F)" title="Tela cheia (F)">
          {cheia ? <Minimize className="size-5" aria-hidden /> : <Maximize className="size-5" aria-hidden />}
        </button>
        <button type="button" className="flex size-8 items-center justify-center rounded-md hover:bg-white/10" onClick={aoFechar} aria-label="Fechar (Esc)">
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          ref={area}
          className={`relative min-w-0 flex-1 touch-none overflow-hidden select-none ${retocando ? "cursor-crosshair" : zoom ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
          onPointerDown={(evento) => {
            if (evento.button !== 0) return;
            if (retocando) {
              const ponto = naFoto(evento);
              if (!ponto || tracos.length >= 200) return;
              pintando.current = true;
              const modo = evento.altKey ? (modoDoPincel === "incluir" ? "excluir" : "incluir") : modoDoPincel;
              setTracos((lista) => [...lista, { modo, raio: raioDoPincel, pontos: [ponto] }]);
              evento.currentTarget.setPointerCapture(evento.pointerId);
              return;
            }
            arrasto.current = { x: evento.clientX, y: evento.clientY, zx: zoom?.x ?? 0, zy: zoom?.y ?? 0, moveu: false };
            evento.currentTarget.setPointerCapture(evento.pointerId);
          }}
          onPointerMove={(evento) => {
            if (retocando) {
              const ponto = pintando.current ? naFoto(evento) : null;
              if (ponto)
                setTracos((lista) => {
                  const ultimo = lista[lista.length - 1];
                  const [px, py] = ultimo.pontos[ultimo.pontos.length - 1];
                  // Um ponto a cada pedaço de um terço do raio (o traço fica leve)
                  if (Math.hypot(ponto[0] - px, ponto[1] - py) < ultimo.raio / 3 || ultimo.pontos.length >= 600) return lista;
                  return [...lista.slice(0, -1), { ...ultimo, pontos: [...ultimo.pontos, ponto] }];
                });
              return;
            }
            const a = arrasto.current;
            if (!a) return;
            const dx = evento.clientX - a.x;
            const dy = evento.clientY - a.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) a.moveu = true;
            if (zoom && a.moveu) setZoom({ ...zoom, x: a.zx + dx, y: a.zy + dy });
          }}
          onPointerUp={(evento) => {
            if (retocando) {
              pintando.current = false;
              return;
            }
            const a = arrasto.current;
            arrasto.current = null;
            if (!a || a.moveu) return;
            // O clique sem arrastar: 100% no ponto, ou de volta a caber
            if (zoom) setZoom(null);
            else {
              const { px, py } = doPonteiro(evento);
              escalar(1, px, py);
            }
          }}
        >
          {foto.status === "pronta" ? (
            <div
              ref={imagem}
              className="absolute left-1/2 top-1/2"
              style={{
                width: exibida.largura,
                height: exibida.altura,
                transform: `translate(calc(-50% + ${zoom?.x ?? 0}px), calc(-50% + ${zoom?.y ?? 0}px))`,
                backgroundImage: `url(${arquivoDaMidia(foto.midia_id, leve)})`,
                backgroundSize: "100% 100%",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- imagem da API com a sessão do cookie */}
              <img key={`${foto.midia_id}-${arquivo}`} src={arquivoDaMidia(foto.midia_id, arquivo)} alt={foto.nome} draggable={false} className="size-full" />
              <CaixasDosRostos foto={foto} visiveis={rostosVisiveis && caixasNoLugar} emFoco={rostoEmFoco} />
              {mostrandoAntes && !retocando ? <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs">Antes</span> : null}
              {retocando ? (
                <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none" aria-hidden>
                  {tracos.map((t, i) => (
                    <polyline
                      key={i}
                      points={t.pontos.map(([x, y]) => `${x * largura},${y * altura}`).join(" ")}
                      fill="none"
                      stroke={t.modo === "incluir" ? "rgba(40,200,120,0.45)" : "rgba(240,70,70,0.45)"}
                      strokeWidth={2 * t.raio * Math.min(largura, altura)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </svg>
              ) : null}
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <LoaderCircle className="size-8 animate-spin" aria-label="Preparando" />
            </div>
          )}
          {proxima ? (
            // eslint-disable-next-line @next/next/no-img-element -- pré-carga da próxima
            <img src={arquivoDaMidia(proxima.midia_id, arquivoDaFoto(proxima, albumId, "proxy"))} alt="" className="hidden" aria-hidden />
          ) : null}
          <button
            type="button"
            className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
            onPointerDown={(evento) => evento.stopPropagation()}
            onClick={() => aoAndar(-1)}
            disabled={indice <= 0}
            aria-label="Anterior (←)"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </button>
          <button
            type="button"
            className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
            onPointerDown={(evento) => evento.stopPropagation()}
            onClick={() => aoAndar(1)}
            disabled={indice >= total - 1}
            aria-label="Próxima (→)"
          >
            <ChevronRight className="size-6" aria-hidden />
          </button>
        </div>

        {rostosVisiveis && rostos.length ? (
          <aside className="hidden w-52 shrink-0 flex-col gap-2 overflow-y-auto border-l border-white/10 p-2 md:flex" aria-label="Rostos da foto">
            <p className="px-1 text-[11px] font-semibold tracking-wide text-white/60 uppercase">Rostos ({rostos.length})</p>
            {rostos.map((rosto, i) => {
              const olho = estadoDoOlho(rosto);
              const nitidez = estadoDoFocoDoRosto(rosto, fotos);
              const numero = foto.pessoas?.[i];
              return (
                <div
                  key={i}
                  className={`flex items-center gap-2 rounded-md p-1 ${rostoEmFoco === i ? "bg-white/15" : "hover:bg-white/10"}`}
                  onPointerEnter={() => setRostoEmFoco(i)}
                  onPointerLeave={() => setRostoEmFoco(null)}
                >
                  <span
                    className="size-14 shrink-0 rounded bg-white/5 bg-no-repeat"
                    style={{ backgroundImage: `url(${arquivoDaMidia(foto.midia_id, "proxy.webp")})`, ...recorteDoRosto(rosto.caixa, foto.largura ?? 1, foto.altura ?? 1) }}
                    aria-hidden
                  />
                  <span className="flex min-w-0 flex-col gap-0.5 text-[11px]">
                    {numero !== undefined ? <span className="truncate font-medium">{nomeDaPessoa(numero)}</span> : null}
                    {olho ? (
                      <span className={`flex items-center gap-1 ${olho === "fechado" ? "text-erro" : olho === "meio" ? "text-aviso" : "text-sucesso"}`}>
                        {olho === "fechado" ? <EyeOff className="size-3" aria-hidden /> : <Eye className="size-3" aria-hidden />}
                        {NOME_DO_OLHO[olho]}
                      </span>
                    ) : null}
                    <span className={nitidez === "borrado" ? "text-erro" : nitidez === "macio" ? "text-aviso" : "text-white/70"}>{NOME_DO_FOCO[nitidez]}</span>
                  </span>
                </div>
              );
            })}
          </aside>
        ) : null}
      </div>

      {grupo.length > 1 ? (
        <div className="flex h-20 shrink-0 items-center justify-center gap-1.5 overflow-x-auto border-t border-white/10 px-3" role="listbox" aria-label="Parecidas do mesmo grupo">
          {grupo.map((f) => (
            <button
              key={f.midia_id}
              type="button"
              role="option"
              aria-selected={f.midia_id === foto.midia_id}
              onClick={() => aoIr(f.midia_id)}
              title={`${f.nome}${f.categoria ? ` · ${CATEGORIAS.find((c) => c.id === f.categoria)?.nome}` : ""}`}
              className={`relative h-16 w-24 shrink-0 overflow-hidden rounded ${f.midia_id === foto.midia_id ? "ring-2 ring-white" : "opacity-70 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- imagem da API com a sessão do cookie */}
              <img src={arquivoDaMidia(f.midia_id, arquivoDaFoto(f, albumId, "capa"))} alt="" className="size-full object-cover" />
              {f.categoria ? <span className={`absolute inset-x-0 top-0 h-1 ${CLASSE_DA_CATEGORIA[f.categoria]}`} /> : null}
              {f.marcacao === "escolhida" ? (
                <span className="absolute left-0.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-sucesso">
                  <Check className="size-3" aria-hidden />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {retocando ? (
        <div className="flex h-14 shrink-0 flex-wrap items-center justify-center gap-3 text-xs" role="toolbar" aria-label="Pincel do retoque">
          <span className="flex rounded-md bg-white/10 p-0.5">
            {(
              [
                ["incluir", "É pele"],
                ["excluir", "Não retocar"],
              ] as const
            ).map(([id, nome]) => (
              <button key={id} type="button" aria-pressed={modoDoPincel === id} onClick={() => setModoDoPincel(id)} className={`rounded px-2.5 py-1 ${modoDoPincel === id ? (id === "incluir" ? "bg-sucesso" : "bg-erro") : "hover:bg-white/10"}`}>
                {nome}
              </button>
            ))}
          </span>
          <label className="flex items-center gap-1.5">
            Tamanho
            <input type="range" min={0.005} max={0.1} step={0.005} value={raioDoPincel} onChange={(evento) => setRaioDoPincel(Number(evento.target.value))} className="w-24 accent-[var(--to-destaque)]" aria-label="Tamanho do pincel" />
          </label>
          <button type="button" className="rounded-md bg-white/10 px-2.5 py-1 hover:bg-white/20 disabled:opacity-40" onClick={() => setTracos((l) => l.slice(0, -1))} disabled={!tracos.length}>
            Desfazer
          </button>
          <button type="button" className="rounded-md bg-white/10 px-2.5 py-1 hover:bg-white/20 disabled:opacity-40" onClick={() => setTracos([])} disabled={!tracos.length}>
            Limpar
          </button>
          <button type="button" className="rounded-md px-2.5 py-1 hover:bg-white/10" onClick={aoSairDoPincel}>
            Cancelar
          </button>
          <button type="button" className="botao-principal px-3 py-1" onClick={() => aoSalvarPincel?.(tracos)}>
            Salvar o pincel
          </button>
          <span className="text-white/50">Alt troca entre os dois</span>
        </div>
      ) : (
      <div className="flex h-14 shrink-0 items-center justify-center gap-5">
        <Estrelas nota={foto.nota} aoMudar={(nota) => aoAplicar({ nota })} tamanho="size-5" />
        <span className="flex gap-2">
          {CORES.map((cor) => (
            <button
              key={cor.id}
              type="button"
              onClick={() => aoAplicar(foto.cor === cor.id ? { tirar_cor: true } : { cor: cor.id })}
              className={`size-5 rounded-full ${CLASSE_DA_COR[cor.id]} ${foto.cor === cor.id ? "ring-2 ring-white ring-offset-2 ring-offset-black" : "opacity-70 hover:opacity-100"}`}
              aria-label={cor.nome}
            />
          ))}
        </span>
        <span className="flex gap-1">
          <button
            type="button"
            onClick={() => aoAplicar(foto.marcacao === "escolhida" ? { tirar_marcacao: true } : { marcacao: "escolhida" })}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs ${foto.marcacao === "escolhida" ? "bg-sucesso text-white" : "bg-white/10 hover:bg-white/20"}`}
          >
            <Check className="size-4" aria-hidden />
            Escolher
          </button>
          <button
            type="button"
            onClick={() => aoAplicar(foto.marcacao === "rejeitada" ? { tirar_marcacao: true } : { marcacao: "rejeitada" })}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs ${foto.marcacao === "rejeitada" ? "bg-erro text-white" : "bg-white/10 hover:bg-white/20"}`}
          >
            <X className="size-4" aria-hidden />
            Rejeitar
          </button>
        </span>
      </div>
      )}
    </div>
  );
}

/** As caixas dos rostos sobre a foto (em frações, então valem com qualquer zoom); a do rosto em foco, acesa. */
function CaixasDosRostos({ foto, visiveis, emFoco }: { foto: FotoDoAlbum; visiveis: boolean; emFoco: number | null }) {
  if (!visiveis || !foto.medidas?.rostos.length) return null;
  return (
    <>
      {foto.medidas.rostos.map((rosto, i) => {
        const olho = estadoDoOlho(rosto);
        const [x, y, w, h] = rosto.caixa;
        return (
          <span
            key={i}
            className={`pointer-events-none absolute rounded-sm border ${emFoco === i ? "border-2 border-white" : olho === "fechado" ? "border-erro/80" : "border-white/40"}`}
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}
            aria-hidden
          />
        );
      })}
    </>
  );
}
