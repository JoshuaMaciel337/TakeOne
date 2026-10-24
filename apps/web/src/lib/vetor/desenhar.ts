// O desenho de uma camada vetorial num canvas do tamanho pedido (a prévia e a exportação pedem o tamanho em que ela
// aparece, para ficar nítida em qualquer zoom). O preenchimento segue os caminhos com as curvas, combinados pela
// composição do canvas (somar por cima, subtrair apagando, intersectar mantendo só a parte em comum, excluir pelo
// "xor"); o traço segue o contorno da região combinada (contorno.ts) e fica por dentro, no meio ou por fora dele.
import { ladrilhoDoPadrao } from "../pintura/padroes.ts";
import { pixelsDoDegrade, tabelaDoDegrade } from "../pintura/degrade.ts";
import { caminhosDaRegiao, precisaDaRegiao, regiaoDosCaminhos } from "./contorno.ts";
import { type CamadaVetorial, type Subcaminho, temArea, type TintaDaForma, type TracoDaForma } from "./modelo.ts";

type Contexto = CanvasRenderingContext2D;

/** O caminho no Path2D, com as curvas. */
export function path2dDe(subcaminhos: Subcaminho[]): Path2D {
  const caminho = new Path2D();
  for (const sub of subcaminhos) {
    if (!sub.nos.length) continue;
    caminho.moveTo(sub.nos[0].x, sub.nos[0].y);
    const ligar = (a: Subcaminho["nos"][number], b: Subcaminho["nos"][number]) => {
      if (a.sx === undefined && b.ex === undefined) caminho.lineTo(b.x, b.y);
      else caminho.bezierCurveTo(a.sx ?? a.x, a.sy ?? a.y, b.ex ?? b.x, b.ey ?? b.y, b.x, b.y);
    };
    for (let i = 1; i < sub.nos.length; i++) ligar(sub.nos[i - 1], sub.nos[i]);
    if (sub.fechado) {
      ligar(sub.nos[sub.nos.length - 1], sub.nos[0]);
      caminho.closePath();
    }
  }
  return caminho;
}

const COMPOSICAO: Record<Subcaminho["operacao"], GlobalCompositeOperation> = { somar: "source-over", subtrair: "destination-out", intersectar: "destination-in", excluir: "xor" };

function novoCanvas(largura: number, altura: number): [HTMLCanvasElement, Contexto] {
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  return [canvas, canvas.getContext("2d")!];
}

/** De onde vêm as fotos dos quadros, e se o lugar do quadro vazio aparece (na prévia, não no arquivo). */
export type OpcoesDoDesenho = { imagem?: (midiaId: string) => (CanvasImageSource & { width: number; height: number }) | null; marcador?: boolean };

/** A foto do quadro na caixa da forma (sem a margem), cobrindo ou cabendo, com o zoom e o deslocamento. */
function pintarImagem(ctx: Contexto, foto: CanvasImageSource & { width: number; height: number }, tinta: Extract<TintaDaForma, { tipo: "imagem" }>, camada: CamadaVetorial) {
  const margem = camada.margem ?? 0;
  const w = Math.max(1, camada.caixa.largura - 2 * margem);
  const h = Math.max(1, camada.caixa.altura - 2 * margem);
  const base = tinta.ajuste === "cobrir" ? Math.max(w / foto.width, h / foto.height) : Math.min(w / foto.width, h / foto.height);
  const s = base * tinta.escala;
  const cx = margem + w / 2 + tinta.x * w;
  const cy = margem + h / 2 + tinta.y * h;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(foto, cx - (foto.width * s) / 2, cy - (foto.height * s) / 2, foto.width * s, foto.height * s);
}

/** O lugar do quadro sem foto: cinza claro com as duas diagonais (só na prévia). */
function pintarMarcador(ctx: Contexto, camada: CamadaVetorial, escala: { x: number; y: number }) {
  const { largura, altura } = camada.caixa;
  ctx.fillStyle = "#d4d6db";
  ctx.fillRect(0, 0, largura, altura);
  ctx.strokeStyle = "#9aa0aa";
  ctx.lineWidth = 1.5 / Math.max(1e-6, Math.min(escala.x, escala.y));
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(largura, altura);
  ctx.moveTo(largura, 0);
  ctx.lineTo(0, altura);
  ctx.stroke();
}

/** Pinta o canvas inteiro com a tinta (as coordenadas são da caixa da camada, pela transformação de `ctx`). */
function pintar(ctx: Contexto, tinta: TintaDaForma, camada: CamadaVetorial, escala: { x: number; y: number }, opcoes: OpcoesDoDesenho = {}) {
  const { largura, altura } = camada.caixa;
  if (tinta.tipo === "imagem") {
    const foto = opcoes.imagem?.(tinta.midia_id);
    if (foto) pintarImagem(ctx, foto, tinta, camada);
    else if (opcoes.marcador) pintarMarcador(ctx, camada, escala);
    return;
  }
  if (tinta.tipo === "cor") {
    ctx.fillStyle = tinta.cor;
    ctx.fillRect(0, 0, largura, altura);
    return;
  }
  if (tinta.tipo === "padrao") {
    const padrao = ctx.createPattern(ladrilhoDoPadrao(tinta.padrao, "#000000", "#ffffff"), "repeat");
    if (!padrao) return;
    padrao.setTransform(new DOMMatrix().scaleSelf(tinta.escala, tinta.escala));
    ctx.fillStyle = padrao;
    ctx.fillRect(0, 0, largura, altura);
    return;
  }
  if (tinta.tipo === "degrade") {
    // O degradê vai na caixa da forma (sem a margem), no ângulo, de um lado ao outro (ou do meio para fora)
    const margem = camada.margem ?? 0;
    const w = Math.max(1, largura - 2 * margem);
    const h = Math.max(1, altura - 2 * margem);
    const r = (tinta.angulo * Math.PI) / 180;
    const dx = Math.cos(r);
    const dy = -Math.sin(r);
    const meio = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
    const linear = tinta.forma === "linear";
    const alcance = meio * tinta.escala;
    const cx = largura / 2;
    const cy = altura / 2;
    const de = linear ? { x: cx - dx * alcance, y: cy - dy * alcance } : { x: cx, y: cy };
    const ate = { x: cx + dx * alcance, y: cy + dy * alcance };
    // Em pixels do canvas de destino, para o pontilhado e a nitidez saírem na resolução do desenho
    const pl = Math.max(1, Math.round(largura * escala.x));
    const pa = Math.max(1, Math.round(altura * escala.y));
    const tabela = tabelaDoDegrade(tinta.degrade, "#000000", "#ffffff");
    const naTela = (p: { x: number; y: number }) => ({ x: p.x * escala.x, y: p.y * escala.y });
    const dados = pixelsDoDegrade(pl, pa, naTela(de), naTela(ate), tinta.forma, tabela, { inverter: tinta.inverter });
    const [imagem, ictx] = novoCanvas(pl, pa);
    ictx.putImageData(new ImageData(new Uint8ClampedArray(dados), pl, pa), 0, 0);
    ctx.drawImage(imagem, 0, 0, largura, altura);
  }
}

/** A seta na ponta de uma linha: um triângulo de `tamanho` com a ponta em `ponta`, apontando de `de` para ela. */
function seta(ponta: { x: number; y: number }, de: { x: number; y: number }, tamanho: number): Path2D {
  const d = Math.hypot(ponta.x - de.x, ponta.y - de.y) || 1;
  const ux = (ponta.x - de.x) / d;
  const uy = (ponta.y - de.y) / d;
  const base = { x: ponta.x - ux * tamanho, y: ponta.y - uy * tamanho };
  const caminho = new Path2D();
  caminho.moveTo(ponta.x, ponta.y);
  caminho.lineTo(base.x - uy * tamanho * 0.5, base.y + ux * tamanho * 0.5);
  caminho.lineTo(base.x + uy * tamanho * 0.5, base.y - ux * tamanho * 0.5);
  caminho.closePath();
  return caminho;
}

/** O traço (só a forma, em branco opaco) num canvas à parte. */
function mascaraDoTraco(camada: CamadaVetorial, traco: TracoDaForma, transformar: (ctx: Contexto) => void, largura: number, altura: number, regiao: Path2D): HTMLCanvasElement {
  const [canvas, ctx] = novoCanvas(largura, altura);
  transformar(ctx);
  const abertos = camada.subcaminhos.filter((sub) => !sub.fechado);
  const fechados = camada.subcaminhos.filter((sub) => sub.fechado);
  // O contorno que o traço segue: os caminhos, ou a região combinada quando há mais de um componente
  const contorno = precisaDaRegiao(fechados) ? path2dDe(caminhosDaRegiao(regiaoDosCaminhos(fechados))) : path2dDe(fechados);
  const w = traco.largura;
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineJoin = traco.cantos === "vivo" ? "miter" : traco.cantos === "redondo" ? "round" : "bevel";
  ctx.miterLimit = Math.max(1, traco.mitra);
  const tracejar = (largura: number) => {
    ctx.lineWidth = largura;
    if (traco.tipo === "tracejado") ctx.setLineDash([4 * w, 2 * w]);
    else if (traco.tipo === "pontilhado") ctx.setLineDash([0, 2 * w]);
    else ctx.setLineDash([]);
    ctx.lineCap = traco.tipo === "pontilhado" ? "round" : traco.pontas === "reta" ? "butt" : traco.pontas === "redonda" ? "round" : "square";
  };
  if (fechados.length) {
    if (traco.alinhamento === "centro") {
      tracejar(w);
      ctx.stroke(contorno);
    } else {
      // Por dentro ou por fora: o dobro da largura, e só a metade de dentro (ou a de fora) da região
      tracejar(2 * w);
      ctx.stroke(contorno);
      ctx.globalCompositeOperation = traco.alinhamento === "dentro" ? "destination-in" : "destination-out";
      ctx.setLineDash([]);
      ctx.fill(regiao);
      ctx.globalCompositeOperation = "source-over";
    }
  }
  if (abertos.length) {
    const forma = camada.forma?.tipo === "linha" ? camada.forma : null;
    const tamanho = forma ? forma.tamanhoDaSeta * w : 0;
    for (const sub of abertos) {
      if (sub.nos.length < 2) continue;
      const nos = sub.nos.map((no) => ({ ...no }));
      const primeiro = nos[0];
      const ultimo = nos[nos.length - 1];
      const inicio = { x: primeiro.x, y: primeiro.y };
      const fim = { x: ultimo.x, y: ultimo.y };
      const antesDoFim = { x: ultimo.ex ?? nos[nos.length - 2].x, y: ultimo.ey ?? nos[nos.length - 2].y };
      const depoisDoInicio = { x: primeiro.sx ?? nos[1].x, y: primeiro.sy ?? nos[1].y };
      // A linha para na base da seta, para a ponta reta não passar dela
      const recuar = (no: typeof primeiro, de: { x: number; y: number }) => {
        const d = Math.hypot(no.x - de.x, no.y - de.y) || 1;
        const k = Math.min(tamanho * 0.9, d * 0.9) / d;
        no.x -= (no.x - de.x) * k;
        no.y -= (no.y - de.y) * k;
      };
      if (forma?.setaFim) recuar(ultimo, antesDoFim);
      if (forma?.setaInicio) recuar(primeiro, depoisDoInicio);
      tracejar(w);
      ctx.stroke(path2dDe([{ ...sub, nos }]));
      ctx.setLineDash([]);
      if (forma?.setaFim) ctx.fill(seta(fim, antesDoFim, tamanho));
      if (forma?.setaInicio) ctx.fill(seta(inicio, depoisDoInicio, tamanho));
    }
  }
  return canvas;
}

/**
 * A região dos caminhos em branco opaco (com a borda suave) num canvas: cada caminho entra com a composição dele (o
 * primeiro sempre soma), e os abertos fecham sozinhos. A seleção a partir de um caminho sai daqui também.
 */
export function regiaoNoCanvas(subcaminhos: Subcaminho[], largura: number, altura: number, escala = { x: 1, y: 1 }): HTMLCanvasElement {
  const [canvas, ctx] = novoCanvas(largura, altura);
  ctx.setTransform(escala.x, 0, 0, escala.y, 0, 0);
  ctx.fillStyle = "#ffffff";
  subcaminhos
    .filter(temArea)
    .forEach((sub, i) => {
      ctx.globalCompositeOperation = i === 0 ? "source-over" : COMPOSICAO[sub.operacao];
      ctx.fill(path2dDe([sub]));
    });
  return canvas;
}

/** A camada desenhada num canvas de `largura` × `altura` (a caixa dela esticada até esse tamanho). */
export function desenharVetor(camada: CamadaVetorial, largura: number, altura: number, opcoes: OpcoesDoDesenho = {}): HTMLCanvasElement {
  const pl = Math.max(1, Math.round(largura));
  const pa = Math.max(1, Math.round(altura));
  const escala = { x: pl / camada.caixa.largura, y: pa / camada.caixa.altura };
  const transformar = (ctx: Contexto) => ctx.setTransform(escala.x, 0, 0, escala.y, 0, 0);
  const [saida, sctx] = novoCanvas(pl, pa);

  const regiaoCanvas = regiaoNoCanvas(camada.subcaminhos, pl, pa, escala);
  const comArea = camada.subcaminhos.filter(temArea);
  const regiao = path2dDe(camada.subcaminhos.filter((sub) => sub.fechado));

  // O quadro vazio mostra o lugar da foto na prévia
  const vazio = camada.quadro && camada.preenchimento.tipo !== "imagem";
  if ((camada.preenchimento.tipo !== "nenhuma" || (vazio && opcoes.marcador)) && comArea.length) {
    const [tinta, tctx] = novoCanvas(pl, pa);
    transformar(tctx);
    if (vazio && opcoes.marcador) pintarMarcador(tctx, camada, escala);
    else pintar(tctx, camada.preenchimento, camada, escala, opcoes);
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(regiaoCanvas, 0, 0);
    sctx.drawImage(tinta, 0, 0);
  }
  const traco = camada.traco;
  if (traco && traco.tinta.tipo !== "nenhuma" && traco.largura > 0) {
    // A região como Path2D só serve para cortar o traço por dentro ou por fora; com componentes, vale a combinada
    const fechados = camada.subcaminhos.filter((sub) => sub.fechado);
    const cortar = precisaDaRegiao(fechados) ? path2dDe(caminhosDaRegiao(regiaoDosCaminhos(fechados))) : regiao;
    const mascara = mascaraDoTraco(camada, traco, transformar, pl, pa, cortar);
    const [tinta, tctx] = novoCanvas(pl, pa);
    transformar(tctx);
    pintar(tctx, traco.tinta, camada, escala, opcoes);
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(mascara, 0, 0);
    sctx.drawImage(tinta, 0, 0);
  }
  return saida;
}

const DESENHADOS = new Map<string, { chave: string; canvas: HTMLCanvasElement }>();
const IDS_DAS_FOTOS = new WeakMap<object, number>();
let proximaFoto = 1;
const idDaFoto = (foto: object) => {
  if (!IDS_DAS_FOTOS.has(foto)) IDS_DAS_FOTOS.set(foto, proximaFoto++);
  return IDS_DAS_FOTOS.get(foto)!;
};
const LADO_MAXIMO = 8192;

/**
 * A camada de um clipe no tamanho em que ela aparece (`largura` × `altura` em pixels de destino, já sem o recorte),
 * guardada enquanto nada muda: arrastar ou mudar o zoom não redesenha a cada quadro se o tamanho é o mesmo.
 */
export function vetorNoTamanho(id: string, camada: CamadaVetorial, largura: number, altura: number, opcoes: OpcoesDoDesenho = {}): HTMLCanvasElement {
  const reducao = Math.min(1, LADO_MAXIMO / Math.max(largura, altura), Math.sqrt(36_000_000 / Math.max(1, largura * altura)));
  const pl = Math.max(1, Math.round(largura * reducao));
  const pa = Math.max(1, Math.round(altura * reducao));
  // A foto do quadro entra na chave pela identidade dela (a cópia leve e a de resolução cheia são outras)
  const foto = camada.preenchimento.tipo === "imagem" ? (opcoes.imagem?.(camada.preenchimento.midia_id) ?? null) : null;
  const chave = `${pl}x${pa}:${opcoes.marcador ? 1 : 0}:${foto ? idDaFoto(foto) : 0}:${JSON.stringify(camada)}`;
  const guardado = DESENHADOS.get(id);
  if (guardado?.chave === chave) return guardado.canvas;
  const canvas = desenharVetor(camada, pl, pa, opcoes);
  DESENHADOS.delete(id);
  DESENHADOS.set(id, { chave, canvas });
  // As mais antigas saem (a ordem do Map é a de inserção)
  while (DESENHADOS.size > 64) DESENHADOS.delete(DESENHADOS.keys().next().value!);
  return canvas;
}
