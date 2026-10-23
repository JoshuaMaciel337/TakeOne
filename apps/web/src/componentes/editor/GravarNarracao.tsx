"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { formatarTimecode, type Taxa, type Tick } from "@/lib/tempo";

export type PropsGravacao = {
  /** O cursor: a narração entra aqui, no instante em que a gravação começa. */
  tempo: Tick;
  taxa: Taxa;
  tocando: boolean;
  /** Toca ou pausa a linha do tempo (o mesmo botão da prévia). */
  aoAlternar: () => void;
  /** O arquivo gravado sobe para a biblioteca e entra numa faixa de áudio em `inicio` quando ficar pronto. */
  aoGravar: (arquivo: File, inicio: Tick) => void;
};

type Estado = { fase: "parado" } | { fase: "contando"; falta: number } | { fase: "gravando"; desde: number };

const CONTAGEM_S = 3;
/** O formato que o Chrome e o Edge gravam; o Safari grava MP4. */
const FORMATOS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

/**
 * Gravar narração (ferramenta Áudio): o microfone do navegador, com contagem, medidor de nível e o vídeo
 * tocando junto (opcional), para a pessoa falar em cima da imagem. Ao parar, o arquivo vai para a biblioteca
 * e entra numa faixa de áudio no instante em que a gravação começou.
 */
export function GravarNarracao({ tempo, taxa, tocando, aoAlternar, aoGravar }: PropsGravacao) {
  const [estado, setEstado] = useState<Estado>({ fase: "parado" });
  const [tocarJunto, setTocarJunto] = useState(true);
  const [nivel, setNivel] = useState(0);
  const [agora, setAgora] = useState(0);
  const [erro, setErro] = useState("");
  const [contador, setContador] = useState(1);
  const recursos = useRef<{ fluxo: MediaStream; gravador: MediaRecorder | null; contexto: AudioContext; partes: Blob[]; inicio: Tick; quadro: number; contagem: number } | null>(null);
  // Os valores mais novos do cursor e da reprodução, para os callbacks da contagem e do gravador
  const reproducao = useRef({ tempo, tocando, aoAlternar });
  useEffect(() => {
    reproducao.current = { tempo, tocando, aoAlternar };
  }, [tempo, tocando, aoAlternar]);

  const soltar = () => {
    const r = recursos.current;
    if (!r) return;
    cancelAnimationFrame(r.quadro);
    window.clearInterval(r.contagem);
    r.fluxo.getTracks().forEach((faixa) => faixa.stop());
    void r.contexto.close();
    recursos.current = null;
  };
  useEffect(() => soltar, []);

  async function comecar() {
    setErro("");
    let fluxo: MediaStream;
    try {
      // Sem ganho automático: o volume da narração fica o que a pessoa falou (o "Igualar o volume" acerta depois)
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
    } catch {
      setErro("O navegador não liberou o microfone. Permita o acesso no ícone do cadeado, ao lado do endereço.");
      return;
    }
    // O medidor: o pico de cada quadro da tela
    const contexto = new AudioContext();
    const analisador = contexto.createAnalyser();
    analisador.fftSize = 1024;
    contexto.createMediaStreamSource(fluxo).connect(analisador);
    const amostras = new Float32Array(analisador.fftSize);
    const r = { fluxo, gravador: null as MediaRecorder | null, contexto, partes: [] as Blob[], inicio: 0, quadro: 0, contagem: 0 };
    recursos.current = r;
    const medir = () => {
      analisador.getFloatTimeDomainData(amostras);
      let pico = 0;
      for (const valor of amostras) pico = Math.max(pico, Math.abs(valor));
      setNivel(pico);
      setAgora(performance.now());
      r.quadro = requestAnimationFrame(medir);
    };
    r.quadro = requestAnimationFrame(medir);

    let falta = CONTAGEM_S;
    setEstado({ fase: "contando", falta });
    r.contagem = window.setInterval(() => {
      falta -= 1;
      if (falta > 0) {
        setEstado({ fase: "contando", falta });
        return;
      }
      window.clearInterval(r.contagem);
      gravar(r);
    }, 1000);
  }

  function gravar(r: NonNullable<typeof recursos.current>) {
    const tipo = FORMATOS.find((formato) => MediaRecorder.isTypeSupported(formato)) ?? "";
    const gravador = new MediaRecorder(r.fluxo, tipo ? { mimeType: tipo } : undefined);
    r.gravador = gravador;
    r.inicio = reproducao.current.tempo;
    gravador.ondataavailable = (evento) => {
      if (evento.data.size) r.partes.push(evento.data);
    };
    gravador.onstop = () => {
      const tipoFinal = gravador.mimeType || tipo || "audio/webm";
      const extensao = tipoFinal.includes("mp4") ? "m4a" : "webm";
      const arquivo = new File(r.partes, `Narração ${contador}.${extensao}`, { type: tipoFinal.split(";")[0] });
      setContador((valor) => valor + 1);
      soltar();
      setEstado({ fase: "parado" });
      if (arquivo.size) aoGravar(arquivo, r.inicio);
    };
    gravador.start(1000);
    if (tocarJunto && !reproducao.current.tocando) reproducao.current.aoAlternar();
    setEstado({ fase: "gravando", desde: performance.now() });
  }

  function parar() {
    const r = recursos.current;
    if (!r) return;
    if (reproducao.current.tocando) reproducao.current.aoAlternar();
    if (r.gravador && r.gravador.state !== "inactive") r.gravador.stop();
    else {
      // Parou ainda na contagem
      soltar();
      setEstado({ fase: "parado" });
    }
  }

  const segundos = estado.fase === "gravando" ? Math.max(0, (agora - estado.desde) / 1000) : 0;
  const db = nivel > 0 ? 20 * Math.log10(nivel) : -Infinity;
  // O medidor vai de -60 dB a 0; acima de -3 dB fica vermelho (perto de estourar)
  const largura = Math.max(0, Math.min(1, (db + 60) / 60));

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-borda bg-painel-2 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <Mic className="size-4 text-destaque" aria-hidden /> Gravar narração
      </p>
      {estado.fase === "parado" ? (
        <>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={tocarJunto} onChange={(evento) => setTocarJunto(evento.currentTarget.checked)} />
            Tocar o vídeo enquanto grava (use fone, para o som do vídeo não entrar no microfone)
          </label>
          <p className="text-[11px] text-suave">A narração entra no cursor ({formatarTimecode(tempo, taxa)}), numa faixa de áudio. A gravação começa depois de uma contagem de {CONTAGEM_S} s.</p>
          <button type="button" className="botao-principal px-3 py-1.5" onClick={() => void comecar()}>
            <Mic className="size-4" aria-hidden />
            Gravar
          </button>
        </>
      ) : (
        <>
          <p className="text-center text-2xl font-semibold tabular-nums" role="status" aria-live="polite">
            {estado.fase === "contando" ? estado.falta : `${Math.floor(segundos / 60)}:${String(Math.floor(segundos % 60)).padStart(2, "0")}`}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-painel" role="meter" aria-label="Nível do microfone" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Number.isFinite(db) ? Math.round(db) : -60}>
            <div className={`h-full transition-[width] duration-75 ${db > -3 ? "bg-red-500" : "bg-destaque"}`} style={{ width: `${largura * 100}%` }} />
          </div>
          <p className="text-[11px] text-suave">{estado.fase === "contando" ? "Prepare-se: a gravação começa no zero." : db > -3 ? "Alto demais: afaste um pouco o microfone." : "Gravando."}</p>
          <button type="button" className="botao-secundario px-3 py-1.5" onClick={parar}>
            <Square className="size-4" aria-hidden />
            {estado.fase === "contando" ? "Cancelar" : "Parar"}
          </button>
        </>
      )}
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
    </div>
  );
}
