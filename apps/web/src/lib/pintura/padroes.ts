"use client";

// Os padrões do editor de imagem (Preencher › Padrão, e o carimbo de padrão da 13.5): ladrilhos desenhados no navegador,
// sem arquivos de terceiros. Os geométricos usam as cores de primeiro plano e de fundo; as texturas do pincel
// (lib/pintura/pontas.ts) viram o cinza entre as duas.
import { type IdDaTextura, ladrilhoDaTextura, TEXTURAS } from "./pontas";

export type IdDoPadrao = "xadrez" | "listras" | "pontos" | "tijolos" | "grade" | "ondas" | IdDaTextura;

export const PADROES: { id: IdDoPadrao; nome: string }[] = [
  { id: "xadrez", nome: "Xadrez" },
  { id: "listras", nome: "Listras diagonais" },
  { id: "pontos", nome: "Bolinhas" },
  { id: "tijolos", nome: "Tijolos" },
  { id: "grade", nome: "Grade" },
  { id: "ondas", nome: "Ondas" },
  ...TEXTURAS.map((textura) => ({ id: textura.id, nome: textura.nome })),
];

/** O ladrilho do padrão (um quadrado que se repete sem emenda), nas duas cores. */
export function ladrilhoDoPadrao(id: IdDoPadrao, primeiro: string, fundo: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const geometrico = (lado: number, desenhar: () => void) => {
    canvas.width = lado;
    canvas.height = lado;
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, lado, lado);
    ctx.fillStyle = primeiro;
    ctx.strokeStyle = primeiro;
    desenhar();
    return canvas;
  };
  switch (id) {
    case "xadrez":
      return geometrico(32, () => {
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillRect(16, 16, 16, 16);
      });
    case "listras":
      return geometrico(24, () => {
        ctx.lineWidth = 6;
        for (const desloc of [-24, 0, 24]) {
          ctx.beginPath();
          ctx.moveTo(desloc, 24);
          ctx.lineTo(desloc + 24, 0);
          ctx.stroke();
        }
      });
    case "pontos":
      return geometrico(24, () => {
        for (const [x, y] of [[6, 6], [18, 18]]) {
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    case "tijolos":
      return geometrico(40, () => {
        ctx.fillRect(0, 0, 40, 20);
        ctx.fillRect(0, 20, 40, 20);
        ctx.fillStyle = fundo;
        ctx.fillRect(0, 18, 40, 2);
        ctx.fillRect(0, 38, 40, 2);
        ctx.fillRect(19, 0, 2, 18);
        ctx.fillRect(0, 20, 1, 18);
        ctx.fillRect(39, 20, 1, 18);
      });
    case "grade":
      return geometrico(20, () => {
        ctx.fillRect(0, 0, 20, 2);
        ctx.fillRect(0, 0, 2, 20);
      });
    case "ondas":
      return geometrico(40, () => {
        ctx.lineWidth = 4;
        for (const y of [10, 30]) {
          ctx.beginPath();
          for (let x = 0; x <= 40; x++) ctx.lineTo(x, y + Math.sin((x / 40) * Math.PI * 2) * 5);
          ctx.stroke();
        }
      });
    default: {
      // A textura: o cinza dela vai do fundo (claro) ao primeiro plano (escuro)
      const textura = ladrilhoDaTextura(id);
      canvas.width = textura.width;
      canvas.height = textura.height;
      ctx.drawImage(textura, 0, 0);
      const dados = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const a = corEmNumeros(primeiro);
      const b = corEmNumeros(fundo);
      for (let i = 0; i < dados.data.length; i += 4) {
        const t = (dados.data[i + 3] / 255) * (1 - dados.data[i] / 255) || dados.data[i + 3] / 255;
        for (let c = 0; c < 3; c++) dados.data[i + c] = Math.round(b[c] + (a[c] - b[c]) * t);
        dados.data[i + 3] = 255;
      }
      ctx.putImageData(dados, 0, 0);
      return canvas;
    }
  }
}

function corEmNumeros(cor: string): [number, number, number] {
  const valor = Number.parseInt(cor.replace("#", "").slice(0, 6).padEnd(6, "0"), 16);
  return [(valor >> 16) & 255, (valor >> 8) & 255, valor & 255];
}

/** O ladrilho repetido por toda uma área (largura × altura), como pixels RGBA. */
export function ladrilhar(ladrilho: HTMLCanvasElement, largura: number, altura: number): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = ctx.createPattern(ladrilho, "repeat")!;
  ctx.fillRect(0, 0, largura, altura);
  return ctx.getImageData(0, 0, largura, altura).data;
}
