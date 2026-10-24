"use client";

// Editar › Substituição do céu (ADR 0003, onda 13.12): a prévia da imagem com o céu novo e, ao lado, os céus (os
// prontos e as imagens da biblioteca), a borda (deslocar e esmaecer), o céu (brilho, temperatura, escala, virar) e a
// luz do primeiro plano (o modo e a força). O OK monta as camadas no editor, na resolução cheia.
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ControleNumerico } from "@/componentes/editor/ControleNumerico";
import { arquivoDaMidia } from "@/lib/api";
import { CEUS_PRONTOS, pintarCeu } from "@/lib/imagem/ceus";
import { baseDaMascara, CEU_PADRAO, COMPOSICAO_DA_LUZ, corDoCeuNovo, desenharCeuNovo, desenharLuz, mascaraDoCeu, type ModoDaLuz, type OpcoesDoCeu } from "@/lib/imagem/substituirCeu";
import { carregarBitmap } from "@/lib/previa/bitmaps";
import { difusao, type Selecao } from "@/lib/selecao/mascara";
import type { ImagemRgba } from "@/lib/selecao/varinha";
import type { Midia } from "@/lib/tipos";

/** A miniatura de um céu pronto, desenhada uma vez. */
function MiniaturaDoCeu({ id }: { id: (typeof CEUS_PRONTOS)[number]["id"] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = 96;
    canvas.height = 54;
    canvas.getContext("2d")!.putImageData(new ImageData(pintarCeu(id, 96, 54) as Uint8ClampedArray<ArrayBuffer>, 96, 54), 0, 0);
  }, [id]);
  return <canvas ref={ref} className="aspect-video w-full rounded-sm" aria-hidden />;
}

export function JanelaSubstituirCeu({
  base,
  mascara,
  escala,
  imagens,
  aoConfirmar,
  aoCancelar,
}: {
  /** A imagem pequena (como aparece) e a máscara do céu no mesmo tamanho. */
  base: ImagemRgba;
  mascara: Selecao;
  /** Pixels da imagem pequena por pixel do documento (as medidas das opções são do documento). */
  escala: number;
  imagens: Midia[];
  aoConfirmar: (opcoes: OpcoesDoCeu) => void;
  aoCancelar: () => void;
}) {
  const [opcoes, setOpcoes] = useState<OpcoesDoCeu>(CEU_PADRAO);
  const [imagemDoCeu, setImagemDoCeu] = useState<{ id: string; imagem: ImageBitmap } | null>(null);
  const previaRef = useRef<HTMLCanvasElement>(null);
  const mudar = (mudanca: Partial<OpcoesDoCeu>) => setOpcoes((atual) => ({ ...atual, ...mudanca }));
  const fundo = useMemo(() => new ImageData(new Uint8ClampedArray(base.dados), base.largura, base.altura), [base]);

  // A imagem da biblioteca escolhida (a cópia leve basta para a prévia)
  const idDaMidia = opcoes.fonte.tipo === "midia" ? opcoes.fonte.id : null;
  useEffect(() => {
    if (!idDaMidia) return;
    let vivo = true;
    carregarBitmap(arquivoDaMidia(idDaMidia, "proxy.webp"))
      .then((imagem) => vivo && setImagemDoCeu({ id: idDaMidia, imagem }))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [idDaMidia]);

  // A prévia, um pouco depois de mexer
  useEffect(() => {
    const espera = window.setTimeout(() => {
      const canvas = previaRef.current;
      if (!canvas) return;
      canvas.width = base.largura;
      canvas.height = base.altura;
      const ctx = canvas.getContext("2d")!;
      ctx.putImageData(fundo, 0, 0);
      const imagem = opcoes.fonte.tipo === "midia" && imagemDoCeu?.id === opcoes.fonte.id ? imagemDoCeu.imagem : null;
      if (opcoes.fonte.tipo === "midia" && !imagem) return;
      const nova = mascaraDoCeu(mascara, opcoes.deslocar * escala);
      const suave = opcoes.esmaecer > 0 ? difusao(nova, (opcoes.esmaecer * escala) / 2) : nova;
      const ceu = desenharCeuNovo(opcoes, base.largura, base.altura, baseDaMascara(nova), imagem);
      // O céu entra só onde a máscara cobre
      const comMascara = document.createElement("canvas");
      comMascara.width = base.largura;
      comMascara.height = base.altura;
      const ctxDoCeu = comMascara.getContext("2d")!;
      ctxDoCeu.drawImage(ceu, 0, 0);
      const dados = ctxDoCeu.getImageData(0, 0, base.largura, base.altura);
      for (let p = 0; p < suave.dados.length; p++) dados.data[p * 4 + 3] = suave.dados[p];
      ctxDoCeu.putImageData(dados, 0, 0);
      ctx.drawImage(comMascara, 0, 0);
      if (opcoes.luz > 0) {
        ctx.save();
        ctx.globalAlpha = opcoes.luz / 100;
        ctx.globalCompositeOperation = COMPOSICAO_DA_LUZ[opcoes.modoDaLuz];
        ctx.drawImage(desenharLuz(corDoCeuNovo(ceu, nova), suave), 0, 0);
        ctx.restore();
      }
    }, 80);
    return () => window.clearTimeout(espera);
  }, [opcoes, imagemDoCeu, base, fundo, mascara, escala]);

  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      evento.preventDefault();
      evento.stopImmediatePropagation();
      aoCancelar();
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [aoCancelar]);

  const numero = (rotulo: string, chave: keyof OpcoesDoCeu, minimo: number, maximo: number, sufixo = "") => (
    <ControleNumerico rotulo={rotulo} valor={Number(opcoes[chave])} minimo={minimo} maximo={maximo} sufixo={sufixo} aoPrever={(valor) => mudar({ [chave]: valor })} aoConfirmar={(valor) => mudar({ [chave]: valor })} />
  );
  const escolhido = (tipo: "pronto" | "midia", id: string) => opcoes.fonte.tipo === tipo && opcoes.fonte.id === id;
  return (
    <div className="fixed inset-0 z-50 flex bg-fundo text-xs" role="dialog" aria-modal aria-label="Substituição do céu">
      <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#1b1d22] p-4">
        <canvas ref={previaRef} className="max-h-full max-w-full object-contain" aria-label="Prévia da substituição do céu" />
      </div>
      <aside className="flex w-80 shrink-0 flex-col border-l border-borda bg-painel">
        <div className="flex items-center justify-between border-b border-borda px-3 py-2">
          <h2 className="text-sm font-semibold">Substituição do céu</h2>
          <div className="flex items-center gap-2">
            <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoCancelar}>
              Cancelar
            </button>
            <button type="button" className="botao-principal px-3 py-1 text-xs" onClick={() => aoConfirmar(opcoes)}>
              OK
            </button>
            <button type="button" className="botao-icone" onClick={aoCancelar} aria-label="Fechar">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <section aria-label="Céus">
            <h3 className="mb-1.5 font-semibold">Céu</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {CEUS_PRONTOS.map((ceu) => (
                <button key={ceu.id} type="button" title={ceu.nome} aria-label={ceu.nome} aria-pressed={escolhido("pronto", ceu.id)} className={`flex flex-col gap-0.5 rounded p-0.5 ${escolhido("pronto", ceu.id) ? "bg-destaque/20 ring-1 ring-destaque" : "hover:bg-painel-2"}`} onClick={() => mudar({ fonte: { tipo: "pronto", id: ceu.id } })}>
                  <MiniaturaDoCeu id={ceu.id} />
                  <span className="truncate text-[10px]">{ceu.nome}</span>
                </button>
              ))}
              {imagens.map((midia) => (
                <button key={midia.id} type="button" title={midia.nome} aria-label={`Céu da imagem ${midia.nome}`} aria-pressed={escolhido("midia", midia.id)} className={`flex flex-col gap-0.5 rounded p-0.5 ${escolhido("midia", midia.id) ? "bg-destaque/20 ring-1 ring-destaque" : "hover:bg-painel-2"}`} onClick={() => mudar({ fonte: { tipo: "midia", id: midia.id } })}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a cópia leve da imagem, servida pela API */}
                  <img src={arquivoDaMidia(midia.id, "proxy.webp")} alt="" className="aspect-video w-full rounded-sm object-cover" />
                  <span className="truncate text-[10px]">{midia.nome}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-2 border-t border-borda pt-2" aria-label="Borda">
            <h3 className="font-semibold">Borda</h3>
            {numero("Deslocar a borda", "deslocar", -50, 50, " px")}
            {numero("Esmaecer a borda", "esmaecer", 0, 100, " px")}
          </section>
          <section className="flex flex-col gap-2 border-t border-borda pt-2" aria-label="Ajustes do céu">
            <h3 className="font-semibold">Ajustes do céu</h3>
            {numero("Brilho", "brilho", -100, 100)}
            {numero("Temperatura", "temperatura", -100, 100)}
            {numero("Escala", "escala", 50, 200, "%")}
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={opcoes.virar} onChange={(evento) => mudar({ virar: evento.currentTarget.checked })} />
              Virar na horizontal
            </label>
          </section>
          <section className="flex flex-col gap-2 border-t border-borda pt-2" aria-label="Primeiro plano">
            <h3 className="font-semibold">Ajustes do primeiro plano</h3>
            <label className="flex items-center gap-2 text-suave">
              Modo da luz:
              <select className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-texto" value={opcoes.modoDaLuz} aria-label="Modo da luz" onChange={(evento) => mudar({ modoDaLuz: evento.currentTarget.value as ModoDaLuz })}>
                <option value="luz_suave">Luz suave</option>
                <option value="multiplicar">Multiplicar</option>
                <option value="tela">Tela</option>
              </select>
            </label>
            {numero("Ajuste da luz", "luz", 0, 100)}
            <p className="text-suave">O OK cria um grupo com o céu (com a máscara, que dá para pintar) e a luz do primeiro plano, por cima da foto.</p>
          </section>
        </div>
      </aside>
    </div>
  );
}
