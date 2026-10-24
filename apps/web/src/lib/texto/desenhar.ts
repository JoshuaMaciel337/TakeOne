"use client";

// O desenho do texto do editor de imagem (ADR 0003, onda 13.8): os contornos dos glifos (os do fontkit, como Path2D) na
// caixa do texto, no tamanho em que ela aparece (nítido em qualquer zoom), com o itálico e o negrito falsos e os
// sublinhados e tachados. No de parágrafo, o que passa da caixa não aparece.
import { type Disposicao, disporTexto } from "./layout";
import type { Suavizacao, TextoRico } from "./modelo";
import { fonteDoEstilo } from "./fontes";

const CAMINHOS = new Map<string, Path2D>();
const INCLINACAO = Math.tan((12 * Math.PI) / 180);

function caminhoDo(chave: string, svg: () => string): Path2D {
  let caminho = CAMINHOS.get(chave);
  if (!caminho) {
    caminho = new Path2D(svg());
    CAMINHOS.set(chave, caminho);
  }
  return caminho;
}

/** Desenha a disposição: `escala` pixels do canvas por pixel do documento, com a origem do texto em `origem`. */
export function desenharDisposicao(ctx: CanvasRenderingContext2D, disposicao: Disposicao, origem: { x: number; y: number }, escala: number, suavizacao: Suavizacao = "nitida") {
  // A suavização da camada: forte engrossa as letras um pouco; suave desfoca um terço de pixel do documento
  if (suavizacao === "suave") ctx.filter = `blur(${(0.35 * escala).toFixed(3)}px)`;
  for (const g of disposicao.glifos) {
    if (g.glifo.caixa.x1 <= g.glifo.caixa.x0) continue;
    const caminho = caminhoDo(`${g.fonte.chave}#${g.glifo.id}`, g.glifo.caminho);
    ctx.save();
    ctx.setTransform(escala, 0, 0, escala, (g.x + origem.x) * escala, (g.y + origem.y) * escala);
    // O itálico falso inclina (o alto vai para a direita); os glifos têm o y para cima
    if (g.italico) ctx.transform(1, 0, -INCLINACAO, 1, 0, 0);
    ctx.scale(g.escalaX, -g.escalaY);
    ctx.fillStyle = g.cor;
    ctx.fill(caminho);
    if (g.negrito || suavizacao === "forte") {
      ctx.strokeStyle = g.cor;
      ctx.lineJoin = "round";
      ctx.lineWidth = g.fonte.unidades * ((g.negrito ? 0.035 : 0) + (suavizacao === "forte" ? 0.012 : 0));
      ctx.stroke(caminho);
    }
    ctx.restore();
  }
  for (const r of disposicao.riscos) {
    ctx.fillStyle = r.cor;
    ctx.fillRect((r.x0 + origem.x) * escala, (r.y - r.espessura / 2 + origem.y) * escala, (r.x1 - r.x0) * escala, r.espessura * escala);
  }
  ctx.filter = "none";
}

const DESENHADOS = new Map<string, { chave: string; canvas: HTMLCanvasElement }>();
const LADO_MAXIMO = 8192;

/**
 * O texto de um clipe no tamanho em que ele aparece (`largura` × `altura` em pixels de destino), ou null enquanto
 * falta alguma fonte. Guardado enquanto nada muda.
 */
export function textoNoTamanho(id: string, texto: TextoRico, largura: number, altura: number, versaoDasFontes = 0): HTMLCanvasElement | null {
  const reducao = Math.min(1, LADO_MAXIMO / Math.max(largura, altura), Math.sqrt(36_000_000 / Math.max(1, largura * altura)));
  const pl = Math.max(1, Math.round(largura * reducao));
  const pa = Math.max(1, Math.round(altura * reducao));
  const chave = `${pl}x${pa}:${versaoDasFontes}:${JSON.stringify(texto)}`;
  const guardado = DESENHADOS.get(id);
  if (guardado?.chave === chave) return guardado.canvas;
  const disposicao = disporTexto(texto, fonteDoEstilo);
  if (disposicao.incompleta) return null;
  const canvas = document.createElement("canvas");
  canvas.width = pl;
  canvas.height = pa;
  const ctx = canvas.getContext("2d")!;
  const escala = pl / texto.caixa.largura;
  if (texto.modo === "paragrafo") {
    ctx.beginPath();
    ctx.rect(0, 0, pl, pa);
    ctx.clip();
  }
  desenharDisposicao(ctx, disposicao, texto.origem, escala, texto.estilo.suavizacao);
  // Sem suavização, cada pixel fica inteiro ou vazio (a cor de quem fica é a das letras)
  if (texto.estilo.suavizacao === "nenhuma") {
    const dados = ctx.getImageData(0, 0, pl, pa);
    for (let i = 3; i < dados.data.length; i += 4) dados.data[i] = dados.data[i] >= 128 ? 255 : 0;
    ctx.putImageData(dados, 0, 0);
  }
  DESENHADOS.delete(id);
  DESENHADOS.set(id, { chave, canvas });
  while (DESENHADOS.size > 64) DESENHADOS.delete(DESENHADOS.keys().next().value!);
  return canvas;
}
