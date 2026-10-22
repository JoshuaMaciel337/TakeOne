// Texto (ou qualquer clipe por cima) que segue um objeto do vídeo: com o caminho do objeto que o worker
// seguiu (VitTrack, em frações da imagem e em segundos da mídia), o seguidor ganha keyframes de posição que
// mantêm a distância que ele tinha do objeto no instante marcado. Função pura.
//
// O objeto é levado da mídia para o quadro do projeto pela caixa do clipe de vídeo em cada instante (com
// os keyframes dele, o recorte e o giro), então o texto continua no lugar mesmo com o vídeo ampliado ou
// andando. Os pontos em que o rastreador perdeu o objeto ficam de fora e o caminho passa reto por eles.
// Quadro a quadro dá pontos demais: o caminho é simplificado (Ramer–Douglas–Peucker) até caber no limite
// de keyframes, com a menor tolerância que couber.
import { duracaoDoQuadro, type Taxa, type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import { type Caixa, caixaDoClipe, deslocamentoDoCentro, type Ponto, pontoNaCaixa, pontoVirado, type Tamanho } from "./geometria.ts";
import { KEYFRAMES_POR_PROPRIEDADE, type Keyframe, transformacaoNoTempo } from "./keyframes.ts";
import { type Clipe, fimDoClipe, type Recorte, tempoNaMidia, type Virar } from "./modelo.ts";

/** Um ponto do caminho: [segundos da mídia, centro x, centro y, largura, altura, nota de 0 a 1]. */
export type PontoDoObjeto = [number, number, number, number, number, number];

/** Abaixo desta nota o rastreador perdeu o objeto (encoberto, fora do quadro). */
export const NOTA_MINIMA = 0.3;
/** Tolerância inicial da simplificação, em frações do quadro: 0,1% (1 pixel em 1080). */
const TOLERANCIA_INICIAL = 0.001;
/** Média de quantos quadros tira o tremido do rastreador (de cada lado e o do meio). */
const VIZINHOS_DA_MEDIA = 2;

/** O caminho do objeto num instante da mídia, entre os pontos achados (reto nos buracos, parado nas pontas). */
export function objetoNoInstante(pontos: PontoDoObjeto[], segundos: number): { x: number; y: number } | null {
  if (!pontos.length) return null;
  if (segundos <= pontos[0][0]) return { x: pontos[0][1], y: pontos[0][2] };
  const ultimo = pontos[pontos.length - 1];
  if (segundos >= ultimo[0]) return { x: ultimo[1], y: ultimo[2] };
  let baixo = 0;
  let alto = pontos.length - 1;
  while (alto - baixo > 1) {
    const meio = (baixo + alto) >> 1;
    if (pontos[meio][0] <= segundos) baixo = meio;
    else alto = meio;
  }
  const a = pontos[baixo];
  const b = pontos[alto];
  const p = (segundos - a[0]) / (b[0] - a[0]);
  return { x: a[1] + (b[1] - a[1]) * p, y: a[2] + (b[2] - a[2]) * p };
}

/**
 * Só os pontos confiáveis, com a média dos vizinhos (tira o tremido de um ou dois pixels do rastreador).
 * A janela é simétrica e encolhe nas pontas e na beira dos buracos, para não entortar o caminho: num
 * movimento reto, a média de vizinhos igualmente espaçados cai no próprio ponto.
 */
export function caminhoConfiavel(pontos: PontoDoObjeto[]): PontoDoObjeto[] {
  const bons = pontos.filter((p) => p[5] >= NOTA_MINIMA);
  const passo = bons.length > 1 ? Math.min(...bons.slice(1).map((p, i) => p[0] - bons[i][0])) : 0;
  return bons.map((ponto, i) => {
    let raio = Math.min(VIZINHOS_DA_MEDIA, i, bons.length - 1 - i);
    while (raio > 0 && bons[i + raio][0] - bons[i - raio][0] > (2 * raio + 0.5) * passo) raio--;
    const vizinhos = bons.slice(i - raio, i + raio + 1);
    const media = (k: 1 | 2) => vizinhos.reduce((soma, v) => soma + v[k], 0) / vizinhos.length;
    return [ponto[0], media(1), media(2), ponto[3], ponto[4], ponto[5]];
  });
}

/** O ponto da imagem (frações) no quadro do projeto, como deslocamento do centro (a unidade de x e y). */
export function pontoNoQuadro(alvo: Pick<Clipe, "inicio" | "transformacao" | "keyframes" | "recorte" | "virar">, instante: Tick, naMidia: { x: number; y: number }, midia: Tamanho, quadro: Tamanho): Ponto {
  const caixa = caixaDoClipe(transformacaoNoTempo(alvo, instante), alvo.recorte, midia, quadro);
  const { recorte } = alvo;
  // O rastreador mede na mídia como ela é; no vídeo virado, o objeto aparece espelhado
  const imagem = pontoVirado(naMidia, alvo.virar);
  // Dentro da caixa, sem o giro e com a origem no centro
  const lx = ((imagem.x - recorte.x) / recorte.largura - 0.5) * caixa.largura;
  const ly = ((imagem.y - recorte.y) / recorte.altura - 0.5) * caixa.altura;
  const angulo = (caixa.rotacao * Math.PI) / 180;
  const centro = {
    x: caixa.cx + lx * Math.cos(angulo) - ly * Math.sin(angulo),
    y: caixa.cy + lx * Math.sin(angulo) + ly * Math.cos(angulo),
  };
  return deslocamentoDoCentro(centro, quadro);
}

/** Retângulo em frações da imagem como ela aparece (canto de cima à esquerda e tamanho), como a API pede. */
export type CaixaNaImagem = { x: number; y: number; largura: number; altura: number };

/**
 * O retângulo desenhado na prévia (em pixels da prévia, sem giro) em frações da imagem do clipe que está
 * embaixo, ou null se ele cai fora da imagem. Com o clipe girado, fica o retângulo da imagem que contém
 * os quatro cantos.
 */
export function retanguloNaImagem(caixa: Caixa, recorte: Recorte, retangulo: { esquerda: number; topo: number; largura: number; altura: number }, virar?: Virar | null): CaixaNaImagem | null {
  const cantos = [
    { x: retangulo.esquerda, y: retangulo.topo },
    { x: retangulo.esquerda + retangulo.largura, y: retangulo.topo },
    { x: retangulo.esquerda + retangulo.largura, y: retangulo.topo + retangulo.altura },
    { x: retangulo.esquerda, y: retangulo.topo + retangulo.altura },
  ].map((canto) => {
    const local = pontoNaCaixa(caixa, canto);
    // Da caixa (origem no centro) para a imagem inteira, passando pelo recorte; e da imagem virada para a mídia
    return pontoVirado({ x: recorte.x + (local.x / caixa.largura + 0.5) * recorte.largura, y: recorte.y + (local.y / caixa.altura + 0.5) * recorte.altura }, virar);
  });
  const limite = (v: number) => Math.min(1, Math.max(0, v));
  const x0 = limite(Math.min(...cantos.map((c) => c.x)));
  const x1 = limite(Math.max(...cantos.map((c) => c.x)));
  const y0 = limite(Math.min(...cantos.map((c) => c.y)));
  const y1 = limite(Math.max(...cantos.map((c) => c.y)));
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return null;
  return { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 };
}

/** Ramer–Douglas–Peucker num eixo: os índices que ficam para o caminho não se afastar mais que `tolerancia`. */
function simplificar(ts: number[], valores: number[], tolerancia: number): number[] {
  const ficam = new Set([0, valores.length - 1]);
  const pilha: [number, number][] = [[0, valores.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop()!;
    let pior = -1;
    let distancia = tolerancia;
    for (let i = a + 1; i < b; i++) {
      const p = (ts[i] - ts[a]) / (ts[b] - ts[a]);
      const d = Math.abs(valores[i] - (valores[a] + (valores[b] - valores[a]) * p));
      if (d > distancia) {
        distancia = d;
        pior = i;
      }
    }
    if (pior >= 0) {
      ficam.add(pior);
      pilha.push([a, pior], [pior, b]);
    }
  }
  return [...ficam].sort((x, y) => x - y);
}

/** Os keyframes de um eixo com no máximo KEYFRAMES_POR_PROPRIEDADE pontos (a tolerância dobra até caber). */
function keyframesQueCabem(ts: Tick[], valores: number[]): Keyframe[] {
  let tolerancia = TOLERANCIA_INICIAL;
  let indices = simplificar(ts, valores, tolerancia);
  while (indices.length > KEYFRAMES_POR_PROPRIEDADE) {
    tolerancia *= 2;
    indices = simplificar(ts, valores, tolerancia);
  }
  return indices.map((i) => ({ t: ts[i], valor: valores[i], curva: "linear" as const }));
}

export type CaminhoDoSeguidor = { x: Keyframe[]; y: Keyframe[] };

/**
 * Os keyframes de posição do seguidor, ou null se o objeto não foi achado no trecho em que os dois clipes
 * aparecem juntos. `marcado` é o instante da linha do tempo em que a pessoa marcou o objeto: ali o
 * seguidor fica onde está, e no resto do tempo ele anda o mesmo que o objeto.
 */
export function caminhoDoSeguidor(
  seguidor: Pick<Clipe, "inicio" | "duracao" | "transformacao" | "keyframes">,
  alvo: Clipe,
  pontos: PontoDoObjeto[],
  midia: Tamanho,
  quadro: Tamanho,
  taxa: Taxa,
  marcado: Tick,
): CaminhoDoSeguidor | null {
  const caminho = caminhoConfiavel(pontos);
  const inicio = Math.max(seguidor.inicio, alvo.inicio);
  const fim = Math.min(seguidor.inicio + seguidor.duracao, fimDoClipe(alvo));
  if (!caminho.length || fim <= inicio) return null;
  const objetoEm = (instante: Tick) => {
    const imagem = objetoNoInstante(caminho, tempoNaMidia(alvo, instante) / TICKS_POR_SEGUNDO)!;
    return pontoNoQuadro(alvo, instante, imagem, midia, quadro);
  };
  // A distância do seguidor ao objeto no instante marcado fica igual o tempo todo
  const noMarcado = Math.min(Math.max(marcado, inicio), fim - 1);
  const objetoMarcado = objetoEm(noMarcado);
  const seguidorMarcado = transformacaoNoTempo(seguidor, noMarcado);
  const dx = seguidorMarcado.x - objetoMarcado.x;
  const dy = seguidorMarcado.y - objetoMarcado.y;

  // Um valor por quadro, no tempo do seguidor (desde o começo dele)
  const passo = duracaoDoQuadro(taxa);
  const ts: Tick[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let instante = inicio; instante < fim; instante += passo) {
    const objeto = objetoEm(instante);
    ts.push(instante - seguidor.inicio);
    xs.push(objeto.x + dx);
    ys.push(objeto.y + dy);
  }
  if (ts.length === 1) {
    return { x: [{ t: ts[0], valor: xs[0], curva: "linear" }], y: [{ t: ts[0], valor: ys[0], curva: "linear" }] };
  }
  return { x: keyframesQueCabem(ts, xs), y: keyframesQueCabem(ts, ys) };
}
