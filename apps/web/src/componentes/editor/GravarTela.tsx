"use client";

import { Camera, MonitorUp, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import type { Tick } from "@/lib/tempo";

/** O que gravar: a tela, a câmera ou as duas juntas (a câmera num canto, por cima). */
export type FonteDaGravacao = "tela" | "camera" | "ambas";

type Estado = { fase: "parado" } | { fase: "contando"; falta: number } | { fase: "gravando"; desde: number };

const CONTAGEM_S = 3;
/** O formato que o Chrome e o Edge gravam; o Safari grava MP4. */
const FORMATOS = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

function formatoQueGrava(): string | undefined {
  return FORMATOS.find((formato) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(formato));
}

/**
 * Gravar a tela e a câmera pelo navegador (ADR 0007, 17.9): a tela (com o som dela, se a pessoa compartilhar), a
 * câmera e o microfone, com a contagem de 3 s. Cada fonte vira um arquivo à parte (faixas separadas): a tela entra na
 * principal no cursor e a câmera numa faixa por cima, num canto, no mesmo instante; o microfone vai junto da câmera
 * (ou da tela, quando só ela é gravada).
 */
export function GravarTela({ tempo, aoGravar }: { tempo: Tick; aoGravar: (arquivos: { arquivo: File; papel: "tela" | "camera" }[], inicio: Tick) => void }) {
  const [fonte, setFonte] = useState<FonteDaGravacao>("ambas");
  const [comMicrofone, setComMicrofone] = useState(true);
  const [estado, setEstado] = useState<Estado>({ fase: "parado" });
  const [erro, setErro] = useState("");
  const [agora, setAgora] = useState(0);
  const previaDaCamera = useRef<HTMLVideoElement>(null);
  const recursos = useRef<{ fluxos: MediaStream[]; gravadores: { papel: "tela" | "camera"; gravador: MediaRecorder; partes: Blob[] }[]; inicio: Tick; relogio: number; contagem: number } | null>(null);
  const cursor = useRef(tempo);
  useEffect(() => {
    cursor.current = tempo;
  }, [tempo]);

  const soltar = () => {
    const r = recursos.current;
    if (!r) return;
    window.clearInterval(r.relogio);
    window.clearInterval(r.contagem);
    r.fluxos.forEach((fluxo) => fluxo.getTracks().forEach((faixa) => faixa.stop()));
    recursos.current = null;
  };
  useEffect(() => soltar, []);

  async function comecar() {
    setErro("");
    const fluxos: MediaStream[] = [];
    let tela: MediaStream | null = null;
    let camera: MediaStream | null = null;
    try {
      if (fonte !== "camera") {
        tela = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
        fluxos.push(tela);
      }
      if (fonte !== "tela" || comMicrofone) {
        camera = await navigator.mediaDevices.getUserMedia({
          video: fonte !== "tela" ? { width: 1280, height: 720 } : false,
          audio: comMicrofone ? { echoCancellation: true, noiseSuppression: true, autoGainControl: false } : false,
        });
        fluxos.push(camera);
      }
    } catch {
      fluxos.forEach((fluxo) => fluxo.getTracks().forEach((faixa) => faixa.stop()));
      setErro("O navegador não liberou a tela, a câmera ou o microfone. Permita o acesso e tente de novo.");
      return;
    }
    if (previaDaCamera.current && camera?.getVideoTracks().length) {
      previaDaCamera.current.srcObject = new MediaStream(camera.getVideoTracks());
      void previaDaCamera.current.play().catch(() => undefined);
    }
    const formato = formatoQueGrava();
    const gravadores: { papel: "tela" | "camera"; gravador: MediaRecorder; partes: Blob[] }[] = [];
    if (tela) {
      // Só a tela: o microfone entra no mesmo arquivo; com a câmera, ele vai no arquivo dela
      const faixas = [...tela.getTracks(), ...(fonte === "tela" && camera ? camera.getAudioTracks() : [])];
      gravadores.push({ papel: "tela", gravador: new MediaRecorder(new MediaStream(faixas), formato ? { mimeType: formato } : undefined), partes: [] });
    }
    if (camera && fonte !== "tela") gravadores.push({ papel: "camera", gravador: new MediaRecorder(camera, formato ? { mimeType: formato } : undefined), partes: [] });
    const r = { fluxos, gravadores, inicio: 0, relogio: 0, contagem: 0 };
    recursos.current = r;
    // A tela que a pessoa para de compartilhar pelo navegador encerra a gravação
    tela?.getVideoTracks()[0]?.addEventListener("ended", () => parar());
    let falta = CONTAGEM_S;
    setEstado({ fase: "contando", falta });
    r.contagem = window.setInterval(() => {
      falta -= 1;
      if (falta > 0) {
        setEstado({ fase: "contando", falta });
        return;
      }
      window.clearInterval(r.contagem);
      r.inicio = cursor.current;
      for (const item of r.gravadores) {
        item.gravador.ondataavailable = (evento) => {
          if (evento.data.size) item.partes.push(evento.data);
        };
        item.gravador.start(1000);
      }
      const desde = performance.now();
      setEstado({ fase: "gravando", desde });
      r.relogio = window.setInterval(() => setAgora(performance.now()), 250);
    }, 1000);
  }

  function parar() {
    const r = recursos.current;
    if (!r) return;
    // Na contagem nenhum gravador começou: parar é cancelar
    if (!r.gravadores.some((item) => item.gravador.state === "recording")) {
      soltar();
      setEstado({ fase: "parado" });
      return;
    }
    const inicio = r.inicio;
    const prontos = r.gravadores.map(
      (item) =>
        new Promise<{ arquivo: File; papel: "tela" | "camera" }>((pronto) => {
          item.gravador.onstop = () => {
            const tipo = item.gravador.mimeType || "video/webm";
            const extensao = tipo.includes("mp4") ? "mp4" : "webm";
            const nome = `${item.papel === "tela" ? "Tela" : "Câmera"} ${new Date().toLocaleString("pt-BR").replace(/[/:]/g, "-")}.${extensao}`;
            pronto({ arquivo: new File(item.partes, nome, { type: tipo.split(";")[0] }), papel: item.papel });
          };
          item.gravador.stop();
        }),
    );
    void Promise.all(prontos).then((arquivos) => {
      soltar();
      if (previaDaCamera.current) previaDaCamera.current.srcObject = null;
      setEstado({ fase: "parado" });
      const comConteudo = arquivos.filter((item) => item.arquivo.size > 0);
      if (comConteudo.length) aoGravar(comConteudo, inicio);
      else setErro("A gravação saiu vazia. Tente de novo.");
    });
  }

  const gravando = estado.fase === "gravando";
  const segundos = gravando ? Math.max(0, Math.floor((agora - estado.desde) / 1000)) : 0;
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-borda bg-painel-2 p-3" aria-label="Gravar tela e câmera">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <MonitorUp className="size-4 text-destaque" aria-hidden /> Gravar tela e câmera
      </p>
      <div className="grid grid-cols-3 gap-1 rounded-md bg-painel p-0.5 text-[11px]" role="group" aria-label="O que gravar">
        {(
          [
            ["tela", "Tela"],
            ["camera", "Câmera"],
            ["ambas", "As duas"],
          ] as const
        ).map(([id, nome]) => (
          <button key={id} type="button" disabled={estado.fase !== "parado"} aria-pressed={fonte === id} onClick={() => setFonte(id)} className={`rounded px-2 py-1 ${fonte === id ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`}>
            {nome}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[11px] text-suave">
        <input type="checkbox" checked={comMicrofone} disabled={estado.fase !== "parado"} onChange={(evento) => setComMicrofone(evento.target.checked)} />
        Com o microfone
      </label>
      <video ref={previaDaCamera} muted playsInline className={`aspect-video w-full rounded bg-black ${fonte !== "tela" && estado.fase !== "parado" ? "" : "hidden"}`} aria-label="A câmera" />
      {estado.fase === "contando" ? <p className="text-center text-2xl font-bold tabular-nums text-destaque">{estado.falta}</p> : null}
      {gravando ? (
        <p className="flex items-center justify-center gap-2 text-xs" role="status">
          <span className="size-2 animate-pulse rounded-full bg-erro" aria-hidden />
          Gravando · {String(Math.floor(segundos / 60)).padStart(2, "0")}:{String(segundos % 60).padStart(2, "0")}
        </p>
      ) : null}
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {estado.fase === "parado" ? (
        <button type="button" className="botao-principal px-3 py-1.5" onClick={() => void comecar()}>
          {fonte === "camera" ? <Camera className="size-4" aria-hidden /> : <MonitorUp className="size-4" aria-hidden />}
          Começar a gravar
        </button>
      ) : (
        <button type="button" className="botao-secundario px-3 py-1.5" onClick={parar}>
          <Square className="size-4 fill-current" aria-hidden />
          {estado.fase === "contando" ? "Cancelar" : "Parar e pôr no projeto"}
        </button>
      )}
      <p className="text-[11px] text-suave">A tela entra na principal no cursor e a câmera por cima, num canto, no mesmo instante. Cada uma é um arquivo da biblioteca.</p>
    </section>
  );
}
