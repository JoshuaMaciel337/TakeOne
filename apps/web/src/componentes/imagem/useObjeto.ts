"use client";

// A ferramenta Objeto do editor de imagem: os cliques e o retângulo viram uma seleção (MobileSAM, no worker), o pincel
// marca à mão, e as duas juntas vão para "apagar" ou "recortar". Parado sobre a foto, o localizador mostra o objeto
// que um clique pegaria. O estado vale para a camada escolhida e recomeça quando ela muda.
import { useRef, useState } from "react";

import { arquivoDaMidia, chamarApi, ErroApi } from "@/lib/api";
import { caixaDaCamadaNaFoto, pontoDaCamadaNaFoto } from "@/lib/projeto/objeto";
import type { Clipe } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

export type PontoDoObjeto = { u: number; v: number; incluir: boolean };
/** O retângulo em volta do objeto, em frações da camada como aparece. */
export type CaixaDoObjeto = { u0: number; v0: number; u1: number; v1: number };
/** Como a seleção é marcada: o clique da IA ou o pincel (a ferramenta Remover). */
export type ModoDaSelecao = "clique" | "pincel";
type Job = { status: string; erro: string | null };

/** O lado maior do desenho do pincel mandado à API. */
const LADO_DO_PINCEL = 2048;

function esperar(ms: number) {
  return new Promise((pronto) => setTimeout(pronto, ms));
}

/** A máscara cinza da seleção vira uma imagem colorida e meio transparente para pintar por cima da camada. */
async function mascaraParaVer(url: string, cor: [number, number, number] = [255, 40, 170]): Promise<string> {
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
    dados.data.set([...cor, Math.round(valor * 0.5)], i);
  }
  contexto.putImageData(dados, 0, 0);
  return canvas.toDataURL("image/png");
}

export function useObjeto(clipe: Clipe | null, midia: Midia | null) {
  const [modo, setModo] = useState<ModoDaSelecao>("clique");
  const [pontos, setPontos] = useState<PontoDoObjeto[]>([]);
  const [caixa, setCaixa] = useState<CaixaDoObjeto | null>(null);
  const [selecao, setSelecao] = useState<{ arquivo: string; ver: string } | null>(null);
  // O localizador: o objeto que um clique no ponto parado pegaria
  const [realce, setRealce] = useState<string | null>(null);
  const pedidoDoRealce = useRef(0);
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
    setCaixa(null);
    setSelecao(null);
    setRealce(null);
    setErro("");
    setTemPincel(false);
  }

  const foto = Boolean(midia?.imagem && !midia.elemento && !midia.camada_pixels && !midia.animacao && midia.status === "pronta");

  /** Pede a máscara ao worker (os pontos e o retângulo na foto) e espera ficar pronta. Devolve o nome dela. */
  async function pedirMascara(novos: PontoDoObjeto[], retangulo: CaixaDoObjeto | null): Promise<string> {
    if (!clipe || !midia) throw new Error("Escolha uma foto.");
    const naFoto = (u: number, v: number) => {
      const ponto = pontoDaCamadaNaFoto(u, v, clipe.recorte, clipe.virar);
      return { x: Math.min(1, Math.max(0, ponto.x)), y: Math.min(1, Math.max(0, ponto.y)) };
    };
    const corpo: { pontos: { x: number; y: number; incluir: boolean }[]; caixa?: { x0: number; y0: number; x1: number; y1: number } } = {
      pontos: novos.map(({ u, v, incluir }) => ({ ...naFoto(u, v), incluir })),
    };
    if (retangulo) {
      // A camada pode estar virada: os cantos na foto podem trocar de lado (a API ordena)
      const a = naFoto(retangulo.u0, retangulo.v0);
      const b = naFoto(retangulo.u1, retangulo.v1);
      corpo.caixa = { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    }
    const resposta = await chamarApi<{ arquivo: string; job_id: string | null }>(`/midias/${midia.id}/selecao`, { metodo: "POST", corpo });
    if (resposta.job_id) {
      for (;;) {
        const job = await chamarApi<Job>(`/jobs/${resposta.job_id}`);
        if (job.status === "concluido") break;
        if (job.status === "erro") throw new Error(job.erro ?? "A seleção falhou.");
        await esperar(250);
      }
    }
    return resposta.arquivo;
  }

  async function selecionar(novos: PontoDoObjeto[], retangulo: CaixaDoObjeto | null = caixa) {
    if (!clipe || !midia) return;
    const numero = ++pedido.current;
    setPontos(novos);
    setCaixa(retangulo);
    setRealce(null);
    pedidoDoRealce.current++;
    if (!retangulo && !novos.some((ponto) => ponto.incluir)) {
      setSelecao(null);
      return;
    }
    setSelecionando(true);
    setErro("");
    try {
      const arquivo = await pedirMascara(novos, retangulo);
      const ver = await mascaraParaVer(arquivoDaMidia(midia.id, arquivo));
      if (numero === pedido.current) setSelecao({ arquivo, ver });
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

  /** `externo`: a seleção do documento já levada à foto (PNG em base64), quando não há seleção da IA nem pincel. */
  async function pedir(acao: "apagar" | "recortar", externo?: string | null): Promise<Midia | null> {
    if (!midia) return null;
    const pincel = desenhoDoPincel() ?? (selecao ? null : (externo ?? null));
    if (!selecao && !pincel) {
      setErro("Selecione uma parte da foto antes (letreiro, laço, seleção de objeto ou o pincel).");
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

  /** O localizador: com o ponteiro parado sobre a foto, o objeto daquele ponto aparece em azul (sem selecionar). */
  function realcar(u: number, v: number) {
    if (!clipe || !midia || selecionando) return;
    const numero = ++pedidoDoRealce.current;
    pedirMascara([{ u, v, incluir: true }], null)
      .then((arquivo) => mascaraParaVer(arquivoDaMidia(midia.id, arquivo), [40, 150, 255]))
      .then((ver) => {
        if (numero === pedidoDoRealce.current) setRealce(ver);
      })
      .catch(() => undefined);
  }

  function limpar() {
    pedido.current++;
    pedidoDoRealce.current++;
    setPontos([]);
    setCaixa(null);
    setRealce(null);
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
    /** Sem tecla, um objeto novo; Shift soma o ponto ao objeto, Alt tira a parte dele. */
    clicar: (u: number, v: number, modo: "nova" | "somar" | "subtrair") =>
      void (modo === "nova" || (!pontos.length && !caixa) ? selecionar([{ u, v, incluir: modo !== "subtrair" }], null) : selecionar([...pontos, { u, v, incluir: modo === "somar" }])),
    /** Um retângulo novo começa outra seleção (os cliques depois dele a refinam). */
    arrastar: (retangulo: CaixaDoObjeto) => void selecionar([], retangulo),
    caixa,
    realce,
    realcar,
    esquecerRealce: () => {
      pedidoDoRealce.current++;
      setRealce(null);
    },
    pedir,
    limpar,
  };
}

export type FerramentaObjeto = ReturnType<typeof useObjeto>;
