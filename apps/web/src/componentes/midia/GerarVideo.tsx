"use client";

import { ChevronDown, ImageOff, Sparkles } from "lucide-react";
import { useState } from "react";

import { arquivoDaMidia, chamarApi, ErroApi } from "@/lib/api";
import type { Midia } from "@/lib/tipos";

// Os mesmos formatos e tempos de core/modelos/geracao.py (480p, como o Wan 2.2 cabe na placa do Nitro 5)
const FORMATOS = { "16:9": [832, 480], "9:16": [480, 832], "1:1": [640, 640] } as const;
type Formato = keyof typeof FORMATOS;
const DURACOES = [2, 3, 4, 5] as const;

/** Minutos que a geração deve levar: o medido no Nitro 5 (uns 4,5 s por quadro em 832×480), em proporção. */
function minutosEstimados(duracao: number, formato: Formato): number {
  const [largura, altura] = FORMATOS[formato];
  const segundos = 4.47 * (24 * duracao + 1) * ((largura * altura) / (832 * 480));
  return Math.max(1, Math.round(segundos / 60));
}

/** O formato mais perto da proporção da imagem, como `formato_da_imagem` em core/modelos/geracao.py. */
function formatoDaImagem(largura: number, altura: number): Formato {
  const distancia = (f: Formato) => Math.abs(Math.log(largura / altura / (FORMATOS[f][0] / FORMATOS[f][1])));
  return (Object.keys(FORMATOS) as Formato[]).reduce((melhor, f) => (distancia(f) < distancia(melhor) ? f : melhor));
}

type Props = {
  /** A proporção do projeto, para começar no mesmo formato. */
  proporcao: string;
  /** As imagens prontas da biblioteca: qualquer uma pode ser o primeiro quadro. */
  imagens: Midia[];
  aoPedir: (midia: Midia) => void;
  /** Na página própria do hub o formulário já começa aberto; no painel do editor, fechado. */
  abertoDeInicio?: boolean;
};

/** Gerar um clipe curto com IA (Wan 2.2) a partir de um texto, ou de uma imagem e um texto. Ele entra na biblioteca quando fica pronto. */
export function GerarVideo({ proporcao, imagens, aoPedir, abertoDeInicio = false }: Props) {
  const [aberto, setAberto] = useState(abertoDeInicio);
  const [descricao, setDescricao] = useState("");
  const [formato, setFormato] = useState<Formato>(proporcao in FORMATOS ? (proporcao as Formato) : "16:9");
  const [duracao, setDuracao] = useState<number>(5);
  const [imagemId, setImagemId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const minutos = minutosEstimados(duracao, formato);
  // A imagem escolhida pode ter saído da biblioteca
  const imagem = imagens.find((item) => item.id === imagemId) ?? null;

  function escolherImagem(alvo: Midia | null) {
    setImagemId(alvo?.id ?? null);
    if (alvo?.video) setFormato(formatoDaImagem(alvo.video.largura, alvo.video.altura));
  }

  function pedir(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    const corpo = { descricao, formato, duracao, imagem_id: imagem?.id ?? null };
    chamarApi<Midia>("/midias/gerar-video", { metodo: "POST", corpo })
      .then((midia) => {
        setDescricao("");
        aoPedir(midia);
      })
      .catch((e: unknown) => setErro(e instanceof ErroApi ? e.message : "Não foi possível pedir o vídeo agora."))
      .finally(() => setEnviando(false));
  }

  return (
    <section className="rounded-lg border border-borda bg-painel-2">
      <button
        type="button"
        onClick={() => setAberto((valor) => !valor)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold"
      >
        <Sparkles className="size-4 text-destaque" aria-hidden />
        <span className="flex-1">Gerar vídeo com IA</span>
        <ChevronDown className={`size-4 text-suave transition ${aberto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {aberto ? (
        <form onSubmit={pedir} className="flex flex-col gap-2 border-t border-borda p-3">
          {imagens.length > 0 ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-[11px] text-suave">Começar de uma imagem (opcional)</legend>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => escolherImagem(null)}
                  aria-pressed={!imagem}
                  title="Sem imagem: o vídeo sai só do texto"
                  className={`flex size-12 shrink-0 items-center justify-center rounded-md border bg-painel ${
                    !imagem ? "border-destaque ring-1 ring-destaque" : "border-borda"
                  }`}
                >
                  <ImageOff className="size-4 text-suave" aria-hidden />
                  <span className="sr-only">Sem imagem</span>
                </button>
                {imagens.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => escolherImagem(item)}
                    aria-pressed={item.id === imagem?.id}
                    title={item.nome}
                    className={`size-12 shrink-0 overflow-hidden rounded-md border ${
                      item.id === imagem?.id ? "border-destaque ring-1 ring-destaque" : "border-borda"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- capa da API com a sessão do cookie */}
                    <img src={arquivoDaMidia(item.id, "capa.jpg")} alt={item.nome} className="size-full object-cover" draggable={false} />
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
          <label className="text-xs text-suave" htmlFor="descricao-video">
            {imagem
              ? `Descreva o que acontece a partir de "${imagem.nome}": o movimento e a câmera`
              : "Descreva a cena: o que aparece, a luz e o movimento da câmera"}
          </label>
          <textarea
            id="descricao-video"
            value={descricao}
            onChange={(evento) => setDescricao(evento.target.value)}
            rows={3}
            maxLength={800}
            required
            minLength={3}
            placeholder={
              imagem
                ? "A câmera se aproxima devagar, o vento mexe o cabelo e as luzes da cidade piscam"
                : "Ondas do mar quebrando numa praia ao pôr do sol, câmera lenta, luz dourada"
            }
            className="resize-y rounded-md border border-borda bg-painel px-2 py-1.5 text-xs outline-none focus:border-destaque"
          />
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-[11px] text-suave">
              Formato
              <select
                value={formato}
                onChange={(evento) => setFormato(evento.target.value as Formato)}
                className="rounded-md border border-borda bg-painel px-2 py-1 text-xs text-texto outline-none focus:border-destaque"
              >
                <option value="16:9">16:9 deitado</option>
                <option value="9:16">9:16 em pé</option>
                <option value="1:1">1:1 quadrado</option>
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-[11px] text-suave">
              Duração
              <select
                value={duracao}
                onChange={(evento) => setDuracao(Number(evento.target.value))}
                className="rounded-md border border-borda bg-painel px-2 py-1 text-xs text-texto outline-none focus:border-destaque"
              >
                {DURACOES.map((segundos) => (
                  <option key={segundos} value={segundos}>
                    {segundos} s
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-suave">
            Leva uns {minutos} min na placa de vídeo, em 480p e sem som.
            {imagem ? " A imagem é cortada no meio para caber no formato." : ""} O clipe aparece na biblioteca e você pode continuar editando.
          </p>
          {erro ? (
            <p className="text-[11px] text-erro" role="alert">
              {erro}
            </p>
          ) : null}
          <button type="submit" className="botao-principal px-3 py-1.5" disabled={enviando || descricao.trim().length < 3}>
            <Sparkles className="size-4" aria-hidden />
            {enviando ? "Pedindo…" : "Gerar vídeo"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
