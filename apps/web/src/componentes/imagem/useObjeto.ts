"use client";

// A ferramenta Objeto do editor de imagem: os cliques viram uma seleção (MobileSAM, no worker), o pincel marca à mão,
// e as duas juntas vão para "apagar" ou "recortar". O estado vale para a camada escolhida e recomeça quando ela muda.
import { useRef, useState } from "react";

import { arquivoDaMidia, chamarApi, ErroApi } from "@/lib/api";
import { caixaDaCamadaNaFoto, pontoDaCamadaNaFoto } from "@/lib/projeto/objeto";
import type { Clipe } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

export type PontoDoObjeto = { u: number; v: number; incluir: boolean };
type Job = { status: string; erro: string | null };

/** O lado maior do desenho do pincel mandado à API. */
const LADO_DO_PINCEL = 2048;

function esperar(ms: number) {
  return new Promise((pronto) => setTimeout(pronto, ms));
}

/** A máscara cinza da seleção vira uma imagem colorida e meio transparente para pintar por cima da camada. */
async function mascaraParaVer(url: string): Promise<string> {
  const resposta = await fetch(url, { credentials: "same-origin" });
  if (!resposta.ok) throw new Error("A seleção não chegou.");
  const bitmap = await createImageBitmap(await resposta.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const contexto = canvas.getContext("2d")!;
  contexto.drawImage(bitmap, 0, 0);
  bitmap.close();
  const dados = contexto.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < dados.data.length; i += 4) {
    const valor = dados.data[i];
    dados.data.set([255, 40, 170, Math.round(valor * 0.5)], i);
  }
  contexto.putImageData(dados, 0, 0);
  return canvas.toDataURL("image/png");
}

export function useObjeto(clipe: Clipe | null, midia: Midia | null) {
  const [modo, setModo] = useState<"clique" | "pincel">("clique");
  const [pontos, setPontos] = useState<PontoDoObjeto[]>([]);
  const [selecao, setSelecao] = useState<{ arquivo: string; ver: string } | null>(null);
  const [selecionando, setSelecionando] = useState(false);
  const [erro, setErro] = useState("");
  const [tamanhoDoPincel, setTamanhoDoPincel] = useState(0.05);
  const [temPincel, setTemPincel] = useState(false);
  const pincelRef = useRef<HTMLCanvasElement | null>(null);
  const pedido = useRef(0);
  const [camadaAtual, setCamadaAtual] = useState<string | null>(null);

  // Outra camada: a seleção recomeça
  if ((clipe?.id ?? null) !== camadaAtual) {
    setCamadaAtual(clipe?.id ?? null);
    setPontos([]);
    setSelecao(null);
    setErro("");
    setTemPincel(false);
  }

  const foto = Boolean(midia?.imagem && !midia.elemento && !midia.animacao && midia.status === "pronta");

  async function selecionar(novos: PontoDoObjeto[]) {
    if (!clipe || !midia) return;
    const numero = ++pedido.current;
    setPontos(novos);
    if (!novos.some((ponto) => ponto.incluir)) {
      setSelecao(null);
      return;
    }
    setSelecionando(true);
    setErro("");
    try {
      const corpo = {
        pontos: novos.map(({ u, v, incluir }) => {
          const ponto = pontoDaCamadaNaFoto(u, v, clipe.recorte, clipe.virar);
          return { x: Math.min(1, Math.max(0, ponto.x)), y: Math.min(1, Math.max(0, ponto.y)), incluir };
        }),
      };
      const resposta = await chamarApi<{ arquivo: string; job_id: string | null }>(`/midias/${midia.id}/selecao`, { metodo: "POST", corpo });
      if (resposta.job_id) {
        for (;;) {
          const job = await chamarApi<Job>(`/jobs/${resposta.job_id}`);
          if (job.status === "concluido") break;
          if (job.status === "erro") throw new Error(job.erro ?? "A seleção falhou.");
          await esperar(350);
        }
      }
      const ver = await mascaraParaVer(arquivoDaMidia(midia.id, resposta.arquivo));
      if (numero === pedido.current) setSelecao({ arquivo: resposta.arquivo, ver });
    } catch (e) {
      if (numero === pedido.current) setErro(e instanceof ErroApi || e instanceof Error ? e.message : "A seleção falhou.");
    } finally {
      if (numero === pedido.current) setSelecionando(false);
    }
  }

  /** O pincel na resolução da foto (branco é o que entra), em base64; null sem nada pintado. */
  function desenhoDoPincel(): string | null {
    const pincel = pincelRef.current;
    if (!pincel || !temPincel || !clipe || !midia?.video) return null;
    const fator = Math.min(1, LADO_DO_PINCEL / Math.max(midia.video.largura, midia.video.altura));
    const largura = Math.round(midia.video.largura * fator);
    const altura = Math.round(midia.video.altura * fator);
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const contexto = canvas.getContext("2d")!;
    contexto.fillStyle = "#000";
    contexto.fillRect(0, 0, largura, altura);
    const caixa = caixaDaCamadaNaFoto(clipe.recorte, clipe.virar, largura, altura);
    contexto.save();
    contexto.translate(caixa.x + (caixa.espelharX ? caixa.largura : 0), caixa.y + (caixa.espelharY ? caixa.altura : 0));
    contexto.scale(caixa.espelharX ? -1 : 1, caixa.espelharY ? -1 : 1);
    contexto.drawImage(pincel, 0, 0, caixa.largura, caixa.altura);
    contexto.restore();
    return canvas.toDataURL("image/png");
  }

  async function pedir(acao: "apagar" | "recortar"): Promise<Midia | null> {
    if (!midia) return null;
    const pincel = desenhoDoPincel();
    if (!selecao && !pincel) {
      setErro("Marque o objeto com um clique ou com o pincel.");
      return null;
    }
    setErro("");
    try {
      return await chamarApi<Midia>(`/midias/${midia.id}/objeto`, { metodo: "POST", corpo: { acao, selecao: selecao?.arquivo ?? null, pincel } });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível pedir agora.");
      return null;
    }
  }

  function limpar() {
    pedido.current++;
    setPontos([]);
    setSelecao(null);
    setSelecionando(false);
    setErro("");
    const pincel = pincelRef.current;
    pincel?.getContext("2d")?.clearRect(0, 0, pincel.width, pincel.height);
    setTemPincel(false);
  }

  return {
    foto,
    modo,
    setModo,
    pontos,
    selecao,
    selecionando,
    erro,
    tamanhoDoPincel,
    setTamanhoDoPincel,
    temPincel,
    marcarPincel: () => setTemPincel(true),
    pincelRef,
    clicar: (u: number, v: number, incluir: boolean) => void selecionar([...pontos, { u, v, incluir }]),
    pedir,
    limpar,
  };
}

export type FerramentaObjeto = ReturnType<typeof useObjeto>;
