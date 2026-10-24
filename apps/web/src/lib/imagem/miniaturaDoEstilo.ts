"use client";

// A miniatura de um estilo de camada (o painel Estilos): um quadrado arredondado com o estilo, desenhado pelo mesmo
// compositor da prévia num canvas só para isso, guardada pelo estilo.
import { Compositor } from "../previa/compositor";
import { efeitosLigados, type EstiloDeCamada, LUZ_GLOBAL_PADRAO } from "./estiloDeCamada";

const LADO = 72;
const QUADRADO = 40;
let compositor: Compositor | null = null;
let canvas: HTMLCanvasElement | null = null;
let fonte: HTMLCanvasElement | null = null;
const PRONTAS = new Map<string, string>();

export function miniaturaDoEstilo(estilo: EstiloDeCamada, preenchimento = 1): string {
  const chave = `${preenchimento}:${JSON.stringify(estilo)}`;
  const pronta = PRONTAS.get(chave);
  if (pronta) return pronta;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = canvas.height = LADO;
    compositor = new Compositor(canvas, { comAlfa: true });
    fonte = document.createElement("canvas");
    fonte.width = fonte.height = QUADRADO * 2;
    const ctx = fonte.getContext("2d")!;
    ctx.fillStyle = "#a9b4c6";
    ctx.beginPath();
    ctx.roundRect(0, 0, QUADRADO * 2, QUADRADO * 2, 14);
    ctx.fill();
  }
  const quadro = { largura: LADO, altura: LADO };
  compositor!.desenhar(
    [
      {
        fonte: fonte!,
        recorte: { x: 0, y: 0, largura: 1, altura: 1 },
        caixa: { cx: LADO / 2, cy: LADO / 2, largura: QUADRADO, altura: QUADRADO, rotacao: 0, opacidade: 1 },
        estiloDeCamada: { efeitos: efeitosLigados(estilo), escala: (estilo.escala ?? 1) * 0.6, luz: LUZ_GLOBAL_PADRAO, preenchimento },
      },
    ],
    "#ffffff",
    quadro,
    quadro,
  );
  const url = canvas.toDataURL("image/png");
  PRONTAS.set(chave, url);
  while (PRONTAS.size > 200) PRONTAS.delete(PRONTAS.keys().next().value!);
  return url;
}
