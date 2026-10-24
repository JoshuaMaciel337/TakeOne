// Compositor da prévia em WebGL2: desenha as camadas de baixo para cima, cada uma com a caixa de
// lib/projeto/geometria.ts (posição, tamanho, giro), o recorte e a opacidade, sobre a cor de fundo.
//
// As cores são misturadas como o FFmpeg faz no `overlay` do render: alfa pré-multiplicado, sem
// conversão para luz linear. A mistura em luz linear (ideia do `render` do FilmCraft) entra junto
// com os modos de mesclagem, nos dois lados ao mesmo tempo.
import { COLUNAS_DOS_BLOCOS, FAIXAS_DAS_PERSIANAS, type MascaraDeTransicao, MASCARAS_DE_TRANSICAO, SUAVIDADE_DA_TRANSICAO, ZOOM_DO_DESFOQUE } from "../projeto/transicao.ts";
import { type LutDaCor, PONTOS_DA_LUT } from "../projeto/cor.ts";
import type { TabelaDoAjuste } from "../imagem/ajustes.ts";
import { type Caixa, recorteNaFonte, type Tamanho } from "../projeto/geometria.ts";
import { AMOSTRAS_DO_BORRAO, BRILHO_SIGMA, GRAO_LINHAS, GRAO_TEXTURA, LINHAS_POR_ALTURA, LUZ_COR, LUZ_LARGURA, valoresDoGrao } from "../projeto/efeitos.ts";
import type { Cortes } from "../projeto/letras.ts";
import { type Cantos, type ChaveLuma, type Chroma, type MascaraDeForma, type Mesclagem, PONTOS_MAXIMOS_DO_DESENHO, type Recorte, type Virar } from "../projeto/modelo.ts";
import { REVELADO_INTEIRO, type Revelado } from "../projeto/transicao.ts";
import { type Contorno, deslocamentoDaSombra, LIMIAR_DO_CONTORNO, margemDaSilhueta, rampaDoContorno, type Sombra } from "../projeto/silhueta.ts";
import { type Campo, campoDoEfeito, contextoDoAlfa, margemDosEfeitos } from "../imagem/efeitos.ts";
import type { Efeito, LuzGlobal, TipoDoEfeito } from "../imagem/estiloDeCamada.ts";
import { camadaDoEfeito, pixelsDaTinta, retanguloDoConteudo, tabelaDaTinta } from "../imagem/tintaDoEfeito.ts";

/** A fonte da camada de ajuste: o que já foi desenhado embaixo dela (uma cópia do canvas). */
export const FUNDO = "fundo" as const;

export type Camada = {
  /** Um `<video>` com quadro carregado, um `VideoFrame` do WebCodecs, uma imagem ou o que já foi desenhado (FUNDO). */
  fonte: TexImageSource | typeof FUNDO;
  /** Uma textura já desenhada pelo compositor (a camada com contorno e sombra), no lugar da fonte. */
  texturaPronta?: { textura: WebGLTexture; largura: number; altura: number };
  /** Contorno e sombra em volta do que aparece (lib/projeto/silhueta.ts). */
  silhueta?: { contorno?: Contorno | null; sombra?: Sombra | null; preenchimento?: number };
  /**
   * Estilo de camada do editor de imagem (lib/imagem/estiloDeCamada.ts): os efeitos ligados, a escala deles, a luz
   * global do documento e o preenchimento (a opacidade do conteúdo sem os efeitos).
   */
  estiloDeCamada?: {
    efeitos: Efeito[];
    escala: number;
    luz: LuzGlobal;
    preenchimento: number;
    /** Os efeitos de dentro (sobreposições, cetim, brilho e sombra internos) também no preenchimento. */
    internosComoGrupo?: boolean;
    /** Os efeitos saem da camada sem a máscara, e a máscara corta tudo depois. */
    mascaraEscondeEfeitos?: boolean;
    /** Vazamento: onde o conteúdo cobre (vezes o que o preenchimento esconde), aparece o fundo do documento. */
    vazamento?: boolean;
    /** O fundo do documento (null: transparente), para o vazamento. */
    fundo?: string | null;
  };
  /** Opções de mesclagem › Mesclar se: o canal (0 cinza, 1 a 3 R, G e B) e as faixas, de 0 a 1. */
  mesclarSe?: { canal: number; esta: [number, number, number, number]; abaixo: [number, number, number, number] } | null;
  /** Opções de mesclagem › Canais: os que a camada muda (R, G, B). */
  canais?: [boolean, boolean, boolean] | null;
  /** Interno: a camada apaga o destino pelo alfa dela (o vazamento num documento transparente). */
  apagar?: boolean;
  /** O do que aparece; virado, o compositor lê o pedaço espelhado da textura. */
  recorte: Recorte;
  virar?: Virar | null;
  /** A LUT 3D dos ajustes (já com o filtro) e das curvas, a mesma do render; null quando a cor é a original. */
  lut?: LutDaCor | null;
  /** A vinheta (0 a 1), que fica fora da LUT. */
  vinheta?: number;
  /** A tabela de 256 tons de um ajuste do editor de imagem (lib/imagem/ajustes.ts), depois da LUT. */
  tabela?: TabelaDoAjuste | null;
  /** Em pixels do quadro passado para `desenhar`. */
  caixa: Caixa;
  /** A parte do clipe que aparece (cortinas); sem ela, o clipe inteiro. */
  revelado?: Revelado;
  /** As letras do texto que aparecem (lib/projeto/letras.ts); sem ela, todas. */
  mascara?: Cortes;
  /** Desfoque gaussiano: sigma em frações da altura do clipe (o render faz a mesma conta). */
  desfoque?: number;
  /** Mistura com o que já foi desenhado; sem ela, normal. */
  mesclagem?: Mesclagem;
  /**
   * Uma pasta (grupo de camadas do editor de imagem): as camadas de dentro, de baixo para cima, desenhadas num
   * framebuffer que entra como esta camada (a opacidade e a máscara dela, a caixa do quadro inteiro). Com `passagem`,
   * o framebuffer começa com o que já foi desenhado, e as de dentro misturam direto com o que está embaixo.
   */
  pasta?: { filhos: Camada[]; passagem: boolean };
  /** As camadas presas a esta (máscara de corte), de baixo para cima: só aparecem onde esta tem alfa. */
  recortadas?: Camada[];
  /** Interno: desenhada por cima da base de um recorte. */
  recortada?: boolean;
  /** Efeito brilho: quanto da cópia desfocada soma em "tela" (lib/projeto/efeitos.ts). */
  brilho?: number;
  /** Nitidez ou clareza: a diferença entre a camada e a cópia desfocada (sigma em frações da altura), na força dada. */
  contrasteLocal?: { sigma: number; forca: number; meiosTons: boolean } | null;
  /** Efeito olho de peixe: o k1 da lente. */
  lente?: number;
  /** A máscara da transição que entra (lib/projeto/transicao.ts): o tipo e o limiar. */
  mascaraDaTransicao?: { tipo: MascaraDeTransicao; limiar: number } | null;
  /** Zoom ou giro (lib/projeto/efeitos.ts): a média das cópias no shader. */
  borrao?: { tipo: "zoom" | "giro"; forca: number } | null;
  /** Transição zoom com desfoque: o peso da média das cópias ampliadas (0 fora da janela). */
  zoomDaTransicao?: number;
  /** Pixelizar: quantas células na largura e na altura (0 sem o efeito). */
  celulas?: [number, number];
  /** VHS e glitch: quanto o vermelho anda para a direita (e o azul para a esquerda), em frações da largura. */
  desvio?: number;
  /** VHS: quanto as linhas escuras escurecem. */
  linhas?: number;
  /** Luz: a força e o centro da faixa (frações da largura do clipe). */
  luz?: { forca: number; posicao: number };
  /** Granulação: a força, as colunas de células e o recorte sorteado deste quadro. */
  grao?: { forca: number; colunas: number; deslocamento: [number, number] };
  /** Tela verde (lib/projeto/modelo.ts): a cor que some, como o colorkey do render. */
  chroma?: Chroma | null;
  /** Cantos arredondados e borda (core/utils/cantos.py), entre as curvas e a vinheta, como no render. */
  cantos?: Cantos | null;
  /** Máscara de forma (core/utils/cantos.py, cobertura_da_mascara), junto dos cantos. */
  mascaraDeForma?: MascaraDeForma | null;
  /**
   * A máscara de camada pintável do editor de imagem (lib/projeto/mascaraDePixels.ts): a imagem cinza (o branco
   * mostra), a matriz da posição na camada (0 a 1) para o ponto da máscara, a densidade e o desfoque da borda (pixels
   * da máscara).
   */
  mascaraDaCamada?: { fonte: TexImageSource; matriz: [number, number, number, number, number, number]; densidade: number; difusao: number } | null;
  /** Chave de luminância: o escuro ou o claro que some, depois da tela verde. */
  chaveLuma?: ChaveLuma | null;
  /** Recorte do fundo: o quadro da máscara da pessoa (o alfa), no mesmo enquadramento do vídeo. */
  mascaraDoFundo?: TexImageSource | null;
};

// Os modos de mesclagem são funções de mistura do WebGL, com a opacidade já na cor (alfa
// pré-multiplicado): multiplicar = fundo × (cor·a + 1 − a); tela = cor·a + fundo × (1 − cor·a);
// somar = fundo + cor·a. É a conta do blend do render sobre uma camada achatada na cor neutra.
// Do 4 em diante, os modos que precisam do fundo: o canvas é copiado para a unidade 6 antes da camada, e o
// shader mistura (a fórmula do W3C, com o alfa do fundo), sem a função de mistura do WebGL.
const CODIGO_DA_MESCLAGEM: Record<Mesclagem, number> = {
  normal: 0,
  multiplicar: 1,
  tela: 2,
  somar: 3,
  escurecer: 4,
  clarear: 5,
  sobrepor: 6,
  luz_forte: 7,
  diferenca: 8,
  exclusao: 9,
  // Os do editor de imagem (todos leem o fundo)
  dissolver: 10,
  superexposicao_cores: 11,
  superexposicao_linear: 12,
  cor_mais_escura: 13,
  subexposicao_cores: 14,
  cor_mais_clara: 15,
  luz_suave: 16,
  luz_brilhante: 17,
  luz_linear: 18,
  luz_do_pino: 19,
  mistura_solida: 20,
  subtrair: 21,
  dividir: 22,
  matiz: 23,
  saturacao: 24,
  cor: 25,
  luminosidade: 26,
  // A passagem é da pasta (desenharPasta); um clipe com ela desenha normal
  passagem: 0,
};
const MESCLAGEM_COM_O_FUNDO = 4;

/** Sigma do brilho, em frações da altura do clipe (o mesmo de lib/projeto/efeitos.ts). */
const SIGMA_DO_BRILHO = BRILHO_SIGMA;

// Desfoque em duas passadas (horizontal e vertical) num framebuffer, antes de desenhar a camada.
// Com sigma grande, a primeira passada lê um nível menor do mipmap da textura: o sigma ali fica entre
// 4 e 8 pixels e a conta não pesa. A borda (e a do recorte) se repete, como no render.
const VERTICES_DESFOQUE = `#version 300 es
in vec2 a_pos;
out vec2 v_pos;
void main() {
  gl_Position = vec4(a_pos * 2.0, 0.0, 1.0);
  v_pos = a_pos + 0.5;
}`;

// Junta a camada (unidade 0) com o contorno (modo 1: o alfa desfocado cortado no limiar, por baixo dela) ou com a
// sombra (modo 2: o alfa desfocado e deslocado, na opacidade dela, por baixo de tudo), no alfa pré-multiplicado.
// O modo 3 é o preenchimento do editor de imagem: tira do conjunto a parte da camada sozinha (unidade 2) que o
// preenchimento esconde; o contorno e a sombra continuam inteiros e escondidos embaixo da camada, como lá
const FRAGMENTOS_SILHUETA = `#version 300 es
precision highp float;
in vec2 v_pos;
uniform sampler2D u_camada;
uniform sampler2D u_borrada;
uniform int u_modo;
uniform vec3 u_cor;
uniform float u_rampa;
uniform float u_opacidade;
uniform vec2 u_deslocamento;
out vec4 cor;
void main() {
  vec4 deCima = texture(u_camada, v_pos);
  if (u_modo == 3) {
    cor = deCima - texture(u_borrada, v_pos) * (1.0 - u_opacidade);
    return;
  }
  float a = u_modo == 1
    ? clamp((texture(u_borrada, v_pos).a - ${LIMIAR_DO_CONTORNO}) / u_rampa + 0.5, 0.0, 1.0)
    : texture(u_borrada, v_pos + u_deslocamento).a * u_opacidade;
  cor = deCima + vec4(u_cor * a, a) * (1.0 - deCima.a);
}`;

const FRAGMENTOS_DESFOQUE = `#version 300 es
precision highp float;
in vec2 v_pos;
uniform sampler2D u_fonte;
uniform vec2 u_passo;
uniform float u_sigma;
uniform float u_lod;
uniform vec4 u_limite;
out vec4 cor;
void main() {
  int raio = int(ceil(3.0 * u_sigma));
  vec4 soma = vec4(0.0);
  float pesos = 0.0;
  for (int i = -raio; i <= raio; i++) {
    float peso = exp(-float(i * i) / (2.0 * u_sigma * u_sigma));
    soma += peso * textureLod(u_fonte, clamp(v_pos + u_passo * float(i), u_limite.xy, u_limite.zw), u_lod);
    pesos += peso;
  }
  cor = soma / pesos;
}`;

// A camada já recortada (máscara do fundo e tela verde), pré-multiplicada, num framebuffer: com brilho, o
// desenho e a cópia desfocada saem dela, como no render (o brilho vem depois do alphamerge e do colorkey).
// Desfocando o quadro cru, o fundo removido voltava como névoa e o preto das animações escurecia o vídeo
// Chave de luminância (lib/projeto/modelo.ts, ChaveLuma): 1 some o escuro, 2 o claro, pela luma BT.709 da cor
// direta; a mesma rampa do lutrgb do render
const CHAVE_DE_LUMA = `uniform int u_luma;
uniform float u_lumaLimiar;
uniform float u_lumaSuavidade;
float alfaDaLuma(vec3 c) {
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float d = u_luma == 1 ? y - u_lumaLimiar : u_lumaLimiar - y;
  return u_lumaSuavidade > 0.0001 ? clamp(d / u_lumaSuavidade, 0.0, 1.0) : (d > 0.0 ? 1.0 : 0.0);
}`;

const FRAGMENTOS_RECORTE = `#version 300 es
precision highp float;
in vec2 v_pos;
uniform sampler2D u_fonte;
uniform sampler2D u_mascara;
uniform bool u_comMascara;
uniform bool u_comChroma;
uniform vec3 u_chromaCor;
uniform float u_semelhanca;
uniform float u_suavidade;
${CHAVE_DE_LUMA}
out vec4 cor;
void main() {
  vec4 texel = texture(u_fonte, v_pos);
  if (u_comMascara) texel *= texture(u_mascara, v_pos).r;
  if (u_comChroma && texel.a > 0.0) {
    float d = length(texel.rgb / texel.a - u_chromaCor) / sqrt(3.0);
    texel *= u_suavidade > 0.0001 ? clamp((d - u_semelhanca) / u_suavidade, 0.0, 1.0) : (d > u_semelhanca ? 1.0 : 0.0);
  }
  if (u_luma > 0 && texel.a > 0.0) texel *= alfaDaLuma(texel.rgb / texel.a);
  cor = texel;
}`;

/** Sigma (em pixels do nível do mipmap) acima do qual a passada lê um nível menor. */
const SIGMA_POR_NIVEL = 4;

const SEM_MASCARA: Cortes = { de: [0, 0, 0], ate: [1, 1, 1] };

const VERTICES = `#version 300 es
in vec2 a_pos;
uniform vec2 u_quadro;
uniform vec2 u_centro;
uniform vec2 u_tamanho;
uniform float u_rotacao;
uniform vec4 u_recorte;
// 1 no sentido virado: o render vira depois da cor e antes da cortina, da vinheta, da luz e do grão
uniform vec2 u_virar;
out vec2 v_uv;
out vec2 v_local;
out vec2 v_fonte;

void main() {
  // a_pos vai de -0.5 a 0.5, com y para baixo, como na tela
  vec2 p = a_pos * u_tamanho;
  float c = cos(u_rotacao);
  float s = sin(u_rotacao);
  p = u_centro + vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  gl_Position = vec4(p.x / u_quadro.x * 2.0 - 1.0, 1.0 - p.y / u_quadro.y * 2.0, 0.0, 1.0);
  // Posição dentro do clipe (0 a 1), para a vinheta; e a mesma posição na imagem antes de virar
  v_local = a_pos + 0.5;
  v_fonte = mix(v_local, 1.0 - v_local, u_virar);
  v_uv = u_recorte.xy + v_fonte * u_recorte.zw;
}`;

// A cor é a LUT 3D de lib/projeto/cor.ts (lutDaCor, a mesma do render) lida como o lut3d do FFmpeg, e a
// vinheta é a conta de escurecimentoDaVinheta, linha a linha.
const FRAGMENTOS = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 v_uv;
in vec2 v_local;
in vec2 v_fonte;
uniform sampler2D u_textura;
uniform float u_opacidade;
// A LUT 3D dos ajustes e das curvas (unidade 1), em RGBA de ponto flutuante; a vinheta fica fora
uniform bool u_comLut;
uniform sampler3D u_lut;
// A tabela de 256 tons dos ajustes do editor de imagem (unidade 7): 1 lê cada canal na sua coluna, 2 a cor pela luminância
uniform int u_modoTabela;
uniform sampler2D u_tabela;
uniform float u_vinheta;
// x0, y0, x1, y1 da parte que aparece, em frações do clipe (as cortinas)
uniform vec4 u_revelado;
// Letra a letra (lib/projeto/letras.ts): y0, y1 e x de onde o trecho começa e de onde ele termina
uniform vec3 u_corteDe;
uniform vec3 u_corteAte;
// 0 normal, 1 multiplicar (a cor sai já misturada ao branco pela opacidade), 2 tela, 3 somar; do 4 ao 9, os
// modos que leem o fundo (unidade 6): escurecer, clarear, sobrepor, luz forte, diferença e exclusão
uniform int u_mesclagem;
uniform sampler2D u_fundo;
// Máscara de corte (o editor de imagem): a camada só aparece onde o que já está no destino (a base) tem alfa
uniform bool u_recortada;
// Opções de mesclagem (estilo de camada): Mesclar se (o canal: 0 cinza, 1 a 3 R, G e B; as faixas desta camada e da
// de baixo, de 0 a 1, com as metades) e os canais que a camada muda; u_comFundo pede a cópia do destino
uniform bool u_comFundo;
uniform int u_mesclarSe;
uniform int u_mesclarSeCanal;
uniform vec4 u_mesclarSeEsta;
uniform vec4 u_mesclarSeAbaixo;
uniform vec3 u_canais;
float valorDoCanal(vec3 c, int canal) { return canal == 1 ? c.r : canal == 2 ? c.g : canal == 3 ? c.b : dot(c, vec3(0.3, 0.59, 0.11)); }
// O quanto o valor passa na faixa: entra de [0] a [1] e sai de [2] a [3]
float naFaixa(float v, vec4 f) {
  float entra = f.y > f.x ? clamp((v - f.x) / (f.y - f.x), 0.0, 1.0) : (v >= f.x ? 1.0 : 0.0);
  float sai = f.w > f.z ? clamp((f.w - v) / (f.w - f.z), 0.0, 1.0) : (v <= f.z ? 1.0 : 0.0);
  return entra * sai;
}

// Os modos de mesclagem por canal (b o fundo, s a camada, sem o alfa), nas contas dos editores de imagem
float queimarCor(float b, float s) { return b >= 1.0 ? 1.0 : s <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - b) / s); }
float esquivarCor(float b, float s) { return b <= 0.0 ? 0.0 : s >= 1.0 ? 1.0 : min(1.0, b / (1.0 - s)); }
float luzSuave(float b, float s) { return s < 0.5 ? 2.0 * b * s + b * b * (1.0 - 2.0 * s) : 2.0 * b * (1.0 - s) + sqrt(b) * (2.0 * s - 1.0); }
float luzBrilhante(float b, float s) { return s <= 0.5 ? queimarCor(b, 2.0 * s) : esquivarCor(b, 2.0 * (s - 0.5)); }
float luzDoPino(float b, float s) { return s < 0.5 ? min(b, 2.0 * s) : max(b, 2.0 * (s - 0.5)); }
float dividirCanal(float b, float s) { return s <= 0.0 ? (b <= 0.0 ? 0.0 : 1.0) : min(1.0, b / s); }
// Os não separáveis (matiz, saturação, cor, luminosidade), pelas funções do W3C
float lumDe(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
vec3 cortarCor(vec3 c) {
  float l = lumDe(c);
  float n = min(min(c.r, c.g), c.b);
  float x = max(max(c.r, c.g), c.b);
  if (n < 0.0) c = l + (c - l) * l / max(l - n, 1e-6);
  if (x > 1.0) c = l + (c - l) * (1.0 - l) / max(x - l, 1e-6);
  return c;
}
vec3 comLum(vec3 c, float l) { return cortarCor(c + (l - lumDe(c))); }
float satDe(vec3 c) { return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }
vec3 comSat(vec3 c, float s) {
  float n = min(min(c.r, c.g), c.b);
  float x = max(max(c.r, c.g), c.b);
  return x > n ? (c - n) * s / (x - n) : vec3(0.0);
}
vec3 misturarModo(int modo, vec3 b, vec3 s) {
  if (modo == 1) return b * s;
  if (modo == 2) return b + s - b * s;
  if (modo == 3) return min(b + s, 1.0);
  if (modo == 4) return min(b, s);
  if (modo == 5) return max(b, s);
  if (modo == 6) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
  if (modo == 7) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, s));
  if (modo == 8) return abs(b - s);
  if (modo == 9) return b + s - 2.0 * b * s;
  if (modo == 11) return vec3(queimarCor(b.r, s.r), queimarCor(b.g, s.g), queimarCor(b.b, s.b));
  if (modo == 12) return max(b + s - 1.0, 0.0);
  if (modo == 13) return lumDe(s) < lumDe(b) ? s : b;
  if (modo == 14) return vec3(esquivarCor(b.r, s.r), esquivarCor(b.g, s.g), esquivarCor(b.b, s.b));
  if (modo == 15) return lumDe(s) > lumDe(b) ? s : b;
  if (modo == 16) return vec3(luzSuave(b.r, s.r), luzSuave(b.g, s.g), luzSuave(b.b, s.b));
  if (modo == 17) return vec3(luzBrilhante(b.r, s.r), luzBrilhante(b.g, s.g), luzBrilhante(b.b, s.b));
  if (modo == 18) return clamp(b + 2.0 * s - 1.0, 0.0, 1.0);
  if (modo == 19) return vec3(luzDoPino(b.r, s.r), luzDoPino(b.g, s.g), luzDoPino(b.b, s.b));
  if (modo == 20) return step(1.0, b + s);
  if (modo == 21) return max(b - s, 0.0);
  if (modo == 22) return vec3(dividirCanal(b.r, s.r), dividirCanal(b.g, s.g), dividirCanal(b.b, s.b));
  if (modo == 23) return comLum(comSat(s, satDe(b)), lumDe(b));
  if (modo == 24) return comLum(comSat(b, satDe(s)), lumDe(b));
  if (modo == 25) return comLum(s, lumDe(b));
  if (modo == 26) return comLum(b, lumDe(s));
  return s;
}
// Brilho: a cópia desfocada (unidade 2) somada em "tela", na força u_brilho
uniform float u_brilho;
// Nitidez e clareza: a diferença entre a camada e a cópia desfocada (a mesma unidade 2), na força u_nitidez; a
// clareza pesa pelos meios-tons
uniform float u_nitidez;
uniform bool u_meiosTons;
uniform sampler2D u_desfocada;
// Olho de peixe: o k1 da lente e o tamanho do clipe (só a proporção conta), como o lenscorrection
uniform float u_lente;
uniform vec2 u_tamanho;
uniform vec4 u_recorte;
// Transição de máscara (1 relógio, 2 íris, 3 losango, 4 persianas, 5 diagonal): o campo abaixo do limiar
// aparece, com a borda suave, como o geq do alfa no render
uniform int u_transicao;
uniform float u_transicaoLimiar;
const float SUAVIDADE_DA_TRANSICAO = ${SUAVIDADE_DA_TRANSICAO.toFixed(4)};
const float FAIXAS_DAS_PERSIANAS = ${FAIXAS_DAS_PERSIANAS.toFixed(1)};
float campoDaTransicao(vec2 local, vec2 tamanho) {
  vec2 d = (local - 0.5) * tamanho;
  if (u_transicao == 1) return fract(atan(d.x, -d.y) / 6.283185307179586 + 1.0);
  if (u_transicao == 2) return length(d) / (0.5 * length(tamanho));
  if (u_transicao == 3) return (abs(d.x) + abs(d.y)) / (0.5 * (tamanho.x + tamanho.y));
  if (u_transicao == 4) return fract(local.y * FAIXAS_DAS_PERSIANAS);
  if (u_transicao == 6) {
    // Blocos: o valor sorteado do bloco, em inteiros como valorDoBloco (lib/projeto/transicao.ts)
    uint linhas = uint(max(1.0, floor(${COLUNAS_DOS_BLOCOS}.0 * tamanho.y / tamanho.x + 0.5)));
    uint coluna = min(uint(floor(local.x * ${COLUNAS_DOS_BLOCOS}.0)), ${COLUNAS_DOS_BLOCOS - 1}u);
    uint linha = min(uint(floor(local.y * float(linhas))), linhas - 1u);
    uint n = linha * ${COLUNAS_DOS_BLOCOS}u + coluna;
    return float((n * n * 631u + n * 313u + 17u) % 1009u) / 1009.0;
  }
  return (local.x * tamanho.x + local.y * tamanho.y) / (tamanho.x + tamanho.y);
}
// Zoom (1) e giro (2): a média de AMOSTRAS cópias, como o mix do render; pixelizar: a média de cada célula
uniform int u_borrao;
uniform float u_borraoForca;
// Transição zoom com desfoque: o peso da média das cópias ampliadas de 1 a 1 + ZOOM_DO_DESFOQUE
uniform float u_zoomTransicao;
const float ZOOM_DO_DESFOQUE = ${ZOOM_DO_DESFOQUE.toFixed(6)};
uniform vec2 u_celulas;
const int AMOSTRAS = ${AMOSTRAS_DO_BORRAO};
// VHS e glitch: o vermelho e o azul lidos deslocados (como o rgbashift, com a borda repetida)
uniform float u_desvio;
// Recorte do fundo: o alfa vem da máscara da pessoa (unidade 4), como o alphamerge do render
uniform bool u_comMascaraDoFundo;
uniform sampler2D u_mascaraDoFundo;
// A máscara de camada pintável (unidade 5): a posição na camada (v_local) vai pela matriz ao ponto da máscara, e o
// cinza dela (com a densidade) multiplica o alfa, junto da máscara de forma
uniform bool u_comMascaraCamada;
uniform sampler2D u_mascaraCamada;
uniform mat3 u_mascaraCamadaMatriz;
uniform float u_mascaraCamadaDensidade;
// O texel do ponto do clipe (frações de 0 a 1), transparente fora dele, já com a máscara do recorte do fundo
vec4 noClipe(vec2 local) {
  if (local.x < 0.0 || local.x > 1.0 || local.y < 0.0 || local.y > 1.0) return vec4(0.0);
  vec2 p = u_recorte.xy + local * u_recorte.zw;
  vec4 t = texture(u_textura, p);
  if (u_comMascaraDoFundo) t *= texture(u_mascaraDoFundo, p).r;
  return t;
}
// Tela verde: o alfa vira a distância à cor (em RGB, de 0 a 1), como o colorkey do FFmpeg
uniform bool u_comChroma;
uniform vec3 u_chromaCor;
uniform float u_semelhanca;
uniform float u_suavidade;
// VHS: as faixas ímpares (de LINHAS_POR_ALTURA na altura do clipe) escurecem
uniform float u_linhas;
const float LINHAS = ${LINHAS_POR_ALTURA.toFixed(1)};
// Luz: a faixa quente somada em "tela", depois da cor
uniform float u_luz;
uniform float u_luzPosicao;
const vec3 LUZ_COR = vec3(${LUZ_COR.map((v) => v.toFixed(3)).join(", ")});
const float LUZ_LARGURA = ${LUZ_LARGURA.toFixed(3)};
// Granulação: a célula do grão lida na imagem fixa (unidade 3), no recorte deste quadro
uniform float u_grao;
uniform float u_graoColunas;
uniform vec2 u_graoDeslocamento;
uniform sampler2D u_graoTextura;
const vec2 GRAO_TEXTURA = vec2(${GRAO_TEXTURA[0].toFixed(1)}, ${GRAO_TEXTURA[1].toFixed(1)});
const float GRAO_LINHAS = ${GRAO_LINHAS.toFixed(1)};
${CHAVE_DE_LUMA}
// Cantos arredondados (core/utils/cantos.py): raio e borda em frações do lado menor do clipe; a distância de cada
// pixel da tela ao retângulo arredondado, com 1 pixel de borda suave
uniform vec2 u_cantos;
uniform vec3 u_corDaBorda;
uniform float u_pixelsPorUnidade;
// Máscara de forma: 0 sem ela, 1 retângulo, 2 elipse; centro e tamanho em frações do clipe; suavidade (fração do
// lado menor) e inverter. A distância até a borda da forma, em pixels, vira a cobertura (cobertura_da_mascara)
uniform int u_mascaraForma;
// O desenho (forma 3): o polígono em frações do clipe
uniform vec2 u_poligono[${PONTOS_MAXIMOS_DO_DESENHO}];
uniform int u_pontosDoPoligono;
// A distância com sinal (negativa dentro) até o polígono, em pixels: o lado mais perto e a regra par-ímpar
// (distancia_ao_poligono em core/utils/cantos.py faz a mesma conta)
float distanciaAoPoligono(vec2 p, vec2 tamanho) {
  vec2 v0 = u_poligono[0] * tamanho;
  float d = dot(p - v0, p - v0);
  float s = 1.0;
  for (int i = 0; i < ${PONTOS_MAXIMOS_DO_DESENHO}; i++) {
    if (i >= u_pontosDoPoligono) break;
    int j = i == 0 ? u_pontosDoPoligono - 1 : i - 1;
    vec2 vi = u_poligono[i] * tamanho;
    vec2 vj = u_poligono[j] * tamanho;
    vec2 e = vj - vi;
    vec2 w = p - vi;
    vec2 b = w - e * clamp(dot(w, e) / max(dot(e, e), 1e-12), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= vi.y, p.y < vj.y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
  }
  return s * sqrt(d);
}
uniform vec4 u_mascara;
uniform vec2 u_mascaraSuave;
float coberturaDaMascara(vec2 local, vec2 tamanho) {
  if (u_mascaraForma == 0) return 1.0;
  if (u_mascaraForma == 3) {
    float suaveDoDesenho = max(u_mascaraSuave.x * min(tamanho.x, tamanho.y), 1.0);
    float coberturaDoDesenho = clamp(0.5 - distanciaAoPoligono(local * tamanho, tamanho) / suaveDoDesenho, 0.0, 1.0);
    return u_mascaraSuave.y > 0.5 ? 1.0 - coberturaDoDesenho : coberturaDoDesenho;
  }
  vec2 p = (local - u_mascara.xy) * tamanho;
  vec2 meia = max(u_mascara.zw * tamanho / 2.0, vec2(1e-6));
  float distancia;
  if (u_mascaraForma == 1) {
    vec2 q = abs(p) - meia;
    distancia = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  } else {
    distancia = (length(p / meia) - 1.0) * min(meia.x, meia.y);
  }
  float suave = max(u_mascaraSuave.x * min(tamanho.x, tamanho.y), 1.0);
  float cobertura = clamp(0.5 - distancia / suave, 0.0, 1.0);
  return u_mascaraSuave.y > 0.5 ? 1.0 - cobertura : cobertura;
}
float coberturaDoCanto(vec2 p, vec2 meia, float raio) {
  if (meia.x <= 0.0 || meia.y <= 0.0) return 0.0;
  raio = min(raio, min(meia.x, meia.y));
  vec2 q = abs(p) - (meia - raio);
  return clamp(0.5 - (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - raio), 0.0, 1.0);
}
out vec4 cor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// A leitura tetraédrica do lut3d do FFmpeg (e de lerLut em lib/projeto/cor.ts): seis tetraedros pela ordem
// das frações, com as comparações estritas dele
vec3 ponto(ivec3 p) { return texelFetch(u_lut, p, 0).rgb; }
vec3 lerLut(vec3 c) {
  vec3 s = clamp(c, 0.0, 1.0) * float(${PONTOS_DA_LUT - 1});
  ivec3 p = ivec3(floor(s));
  ivec3 q = min(p + 1, ivec3(${PONTOS_DA_LUT - 1}));
  vec3 d = s - vec3(p);
  vec3 c000 = ponto(p);
  vec3 c111 = ponto(q);
  if (d.r > d.g) {
    if (d.g > d.b) return (1.0 - d.r) * c000 + (d.r - d.g) * ponto(ivec3(q.x, p.y, p.z)) + (d.g - d.b) * ponto(ivec3(q.x, q.y, p.z)) + d.b * c111;
    if (d.r > d.b) return (1.0 - d.r) * c000 + (d.r - d.b) * ponto(ivec3(q.x, p.y, p.z)) + (d.b - d.g) * ponto(ivec3(q.x, p.y, q.z)) + d.g * c111;
    return (1.0 - d.b) * c000 + (d.b - d.r) * ponto(ivec3(p.x, p.y, q.z)) + (d.r - d.g) * ponto(ivec3(q.x, p.y, q.z)) + d.g * c111;
  }
  if (d.b > d.g) return (1.0 - d.b) * c000 + (d.b - d.g) * ponto(ivec3(p.x, p.y, q.z)) + (d.g - d.r) * ponto(ivec3(p.x, q.y, q.z)) + d.r * c111;
  if (d.b > d.r) return (1.0 - d.g) * c000 + (d.g - d.b) * ponto(ivec3(p.x, q.y, p.z)) + (d.b - d.r) * ponto(ivec3(p.x, q.y, q.z)) + d.r * c111;
  return (1.0 - d.g) * c000 + (d.g - d.r) * ponto(ivec3(p.x, q.y, p.z)) + (d.r - d.b) * ponto(ivec3(q.x, q.y, p.z)) + d.b * c111;
}

void main() {
  // Como o geq do render: o centro do pixel dentro da faixa revelada, com as bordas incluídas
  if (v_local.x < u_revelado.x || v_local.x > u_revelado.z || v_local.y < u_revelado.y || v_local.y > u_revelado.w) {
    discard;
  }
  // Como as caixas do render: pelo centro do pixel, antes do começo do trecho e a partir do fim (nas letras
  // como estão na imagem: o render esconde antes de virar)
  if (v_fonte.y < u_corteDe.x || (v_fonte.y < u_corteDe.y && v_fonte.x < u_corteDe.z) ||
      v_fonte.y >= u_corteAte.y || (v_fonte.y >= u_corteAte.x && v_fonte.x >= u_corteAte.z)) {
    discard;
  }
  vec2 uv = v_uv;
  // O ponto do clipe que cai neste pixel (a lente muda)
  vec2 fonte = v_fonte;
  if (u_lente > 0.0) {
    // O zoom de (1 + k) no meio e depois a lente: o ponto da imagem que cai neste pixel
    vec2 s = 0.5 + (v_fonte - 0.5) / (1.0 + u_lente);
    vec2 desvio = (s - 0.5) * u_tamanho;
    float r2 = dot(desvio, desvio) / (dot(u_tamanho, u_tamanho) / 4.0);
    vec2 p = 0.5 + (s - 0.5) * (1.0 + u_lente * r2);
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
    uv = u_recorte.xy + p * u_recorte.zw;
    fonte = p;
  }
  vec4 texel;
  bool jaMascarado = false;
  if (u_celulas.x > 0.0) {
    // Pixelizar: a média da célula (8 × 8 pontos dentro dela), presa ao canto do clipe
    vec2 celula = floor(v_fonte * u_celulas);
    vec4 soma = vec4(0.0);
    for (int i = 0; i < 8; i++) {
      for (int j = 0; j < 8; j++) soma += noClipe((celula + (vec2(float(i), float(j)) + 0.5) / 8.0) / u_celulas);
    }
    texel = soma / 64.0;
    jaMascarado = true;
  } else if (u_borrao > 0) {
    // Zoom: cada cópia lê mais perto do meio; giro: cada cópia girada em volta do meio, simétricas
    vec4 soma = vec4(0.0);
    for (int i = 0; i < AMOSTRAS; i++) {
      float parte = float(i) / float(AMOSTRAS - 1);
      vec2 local;
      if (u_borrao == 1) {
        local = 0.5 + (v_fonte - 0.5) * (1.0 - u_borraoForca * parte);
      } else {
        float a = u_borraoForca * (parte - 0.5);
        vec2 d = (v_fonte - 0.5) * u_tamanho;
        local = 0.5 + vec2(cos(a) * d.x - sin(a) * d.y, sin(a) * d.x + cos(a) * d.y) / u_tamanho;
      }
      soma += noClipe(local);
    }
    texel = soma / float(AMOSTRAS);
    jaMascarado = true;
  } else if (u_zoomTransicao > 0.0) {
    // Zoom com desfoque: a imagem misturada à média das cópias ampliadas (antes da lente, como no render)
    vec4 soma = vec4(0.0);
    for (int i = 0; i < AMOSTRAS; i++) {
      float parte = float(i) / float(AMOSTRAS - 1);
      soma += noClipe(0.5 + (fonte - 0.5) / (1.0 + ZOOM_DO_DESFOQUE * parte));
    }
    texel = mix(noClipe(fonte), soma / float(AMOSTRAS), u_zoomTransicao);
    jaMascarado = true;
  } else {
    texel = texture(u_textura, uv);
  }
  if (u_desvio != 0.0) {
    vec2 d = vec2(u_desvio * u_recorte.z, 0.0);
    vec2 minimo = u_recorte.xy;
    vec2 maximo = u_recorte.xy + u_recorte.zw;
    // Em cor direta e com o alfa deste pixel, como o rgbashift do render: com a cor pré-multiplicada do
    // vizinho, fora das letras sobravam fantasmas vermelho e azul que o vídeo não tem
    vec4 vermelho = texture(u_textura, clamp(uv - d, minimo, maximo));
    vec4 azul = texture(u_textura, clamp(uv + d, minimo, maximo));
    texel.r = vermelho.a > 0.0 ? vermelho.r / vermelho.a * texel.a : 0.0;
    texel.b = azul.a > 0.0 ? azul.b / azul.a * texel.a : 0.0;
  }
  if (u_comMascaraDoFundo && !jaMascarado) texel *= texture(u_mascaraDoFundo, uv).r;
  if (u_comChroma && texel.a > 0.0) {
    vec3 c = texel.rgb / texel.a;
    float d = length(c - u_chromaCor) / sqrt(3.0);
    float k = u_suavidade > 0.0001 ? clamp((d - u_semelhanca) / u_suavidade, 0.0, 1.0) : (d > u_semelhanca ? 1.0 : 0.0);
    // Multiplica o alfa que já havia (logo, recorte do fundo, borda suave), como o render
    texel = texel * k;
  }
  if (u_luma > 0 && texel.a > 0.0) texel *= alfaDaLuma(texel.rgb / texel.a);
  if (u_nitidez > 0.0) {
    // Como o lut2 do render: no alfa pré-multiplicado, cada canal preso entre 0 e 1
    vec3 borrada = texture(u_desfocada, uv).rgb;
    vec3 peso = u_meiosTons ? 4.0 * texel.rgb * (1.0 - texel.rgb) : vec3(1.0);
    texel.rgb = clamp(texel.rgb + u_nitidez * peso * (texel.rgb - borrada), 0.0, 1.0);
  }
  if (u_brilho > 0.0) {
    vec4 luz = texture(u_desfocada, uv) * u_brilho;
    texel = texel + luz - texel * luz;
  }
  bool comCantos = u_cantos.x > 0.0 || u_cantos.y > 0.0 || u_mascaraForma > 0;
  if ((u_comLut || u_modoTabela > 0 || u_vinheta > 0.0 || u_linhas > 0.0 || u_luz > 0.0 || u_grao > 0.0 || comCantos || u_comMascaraCamada) && (texel.a > 0.0 || comCantos)) {
    // A textura vem com o alfa pré-multiplicado: a cor é ajustada sem ele e multiplicada de volta.
    // A ordem é a do render: a LUT (ajustes e curvas), os cantos e depois a vinheta
    vec3 c = texel.a > 0.0 ? texel.rgb / texel.a : vec3(0.0);
    float alfa = texel.a;
    if (u_comLut) c = lerLut(c);
    // O tom de 8 bits mais perto, o mesmo índice de aplicarAjusteNosPixels
    if (u_modoTabela == 1) {
      ivec3 i = ivec3(clamp(c, 0.0, 1.0) * 255.0 + 0.5);
      c = vec3(texelFetch(u_tabela, ivec2(i.r, 0), 0).r, texelFetch(u_tabela, ivec2(i.g, 0), 0).g, texelFetch(u_tabela, ivec2(i.b, 0), 0).b);
    } else if (u_modoTabela == 2) {
      int i = int(clamp(dot(c, vec3(0.299, 0.587, 0.114)), 0.0, 1.0) * 255.0 + 0.5);
      c = texelFetch(u_tabela, ivec2(i, 0), 0).rgb;
    }
    if (comCantos) {
      // O clipe fica com a parte de dentro e a borda (o anel) vai por cima, como o alphamerge e o overlay do render
      vec2 meia = u_tamanho * u_pixelsPorUnidade / 2.0;
      vec2 p = (v_local - 0.5) * meia * 2.0;
      float lado = 2.0 * min(meia.x, meia.y);
      float raio = u_cantos.x * lado;
      float borda = u_cantos.y * lado;
      float forma = coberturaDaMascara(v_local, meia * 2.0);
      float dentro = coberturaDoCanto(p, meia - borda, max(raio - borda, 0.0));
      float anel = clamp(coberturaDoCanto(p, meia, raio) - dentro, 0.0, 1.0) * forma;
      dentro *= forma;
      float a = alfa * dentro;
      alfa = anel + a * (1.0 - anel);
      c = alfa > 0.0 ? (u_corDaBorda * anel + c * a * (1.0 - anel)) / alfa : c;
    }
    if (u_comMascaraCamada) {
      vec2 noDocumento = (u_mascaraCamadaMatriz * vec3(v_local, 1.0)).xy;
      alfa *= 1.0 - u_mascaraCamadaDensidade * (1.0 - texture(u_mascaraCamada, noDocumento).r);
    }
    if (u_vinheta > 0.0) {
      float distancia = length((v_local - 0.5) * 2.0) / sqrt(2.0);
      c *= 1.0 - u_vinheta * smoothstep(0.3, 1.0, distancia);
    }
    if (u_linhas > 0.0 && mod(floor(v_local.y * LINHAS), 2.0) >= 1.0) c *= 1.0 - u_linhas;
    if (u_luz > 0.0) {
      float s = v_local.x - u_luzPosicao;
      vec3 luz = u_luz * LUZ_COR * exp(-(s * s) / (2.0 * LUZ_LARGURA * LUZ_LARGURA));
      c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - luz);
    }
    if (u_grao > 0.0) {
      vec2 celula = floor(v_local * vec2(u_graoColunas, GRAO_LINHAS));
      float n = texture(u_graoTextura, (celula + u_graoDeslocamento + 0.5) / GRAO_TEXTURA).r;
      c = clamp(c + (n - 0.5) * u_grao, 0.0, 1.0);
    }
    texel = vec4(c * alfa, alfa);
  }
  if (u_transicao > 0) {
    texel *= clamp((u_transicaoLimiar - campoDaTransicao(v_local, u_tamanho)) / SUAVIDADE_DA_TRANSICAO + 0.5, 0.0, 1.0);
  }
  cor = texel * u_opacidade;
  bool comFundo = u_mesclagem >= 4 || u_recortada || u_comFundo;
  if (u_mesclagem == 1 && !comFundo) cor = vec4(cor.rgb + (1.0 - cor.a), 1.0);
  if (comFundo) {
    // O blend do render: o primeiro é o fundo (b), o segundo a camada (s), sem o alfa; o alfa mistura depois
    vec4 fundo = texelFetch(u_fundo, ivec2(gl_FragCoord.xy), 0);
    vec3 b = fundo.a > 0.0 ? fundo.rgb / fundo.a : vec3(0.0);
    vec3 s = cor.a > 0.0 ? clamp(cor.rgb / cor.a, 0.0, 1.0) : vec3(0.0);
    // Mesclar se: a camada some onde o valor dela ou o do fundo sai das faixas
    if (u_mesclarSe == 1) cor *= naFaixa(valorDoCanal(s, u_mesclarSeCanal), u_mesclarSeEsta) * mix(1.0, naFaixa(valorDoCanal(b, u_mesclarSeCanal), u_mesclarSeAbaixo), fundo.a);
    if (u_mesclagem == 10) {
      // Dissolver: cada pixel aparece inteiro ou some, com a chance da opacidade (o sorteio é fixo por pixel)
      float sorte = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
      cor = sorte < cor.a ? vec4(s, 1.0) : vec4(0.0);
    }
    vec3 m = misturarModo(u_mesclagem, b, s);
    if (u_recortada) {
      // Por cima da base, só onde ela tem alfa (a conta "source-atop"): o alfa continua o da base
      cor = vec4(fundo.a * (cor.a * m + (1.0 - cor.a) * b), fundo.a);
    } else {
      vec3 misturada = (1.0 - fundo.a) * s + fundo.a * m;
      cor = vec4(cor.a * misturada + (1.0 - cor.a) * fundo.rgb, cor.a + fundo.a * (1.0 - cor.a));
    }
    // Os canais desligados ficam como estavam
    cor.rgb = mix(fundo.rgb, cor.rgb, u_canais);
  }
}`;

/** Uma cor sólida no alfa dos pixels lidos do framebuffer (linhas de baixo para cima), pré-multiplicada e de cima para baixo. */
function camadaDeCorNoAlfa(pixels: Uint8Array, w: number, h: number, cor: string): Uint8Array {
  const [r, g, b] = corParaRgb(cor);
  const saida = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = pixels[((h - 1 - y) * w + x) * 4 + 3];
      const i = (y * w + x) * 4;
      saida[i] = Math.round(r * a);
      saida[i + 1] = Math.round(g * a);
      saida[i + 2] = Math.round(b * a);
      saida[i + 3] = a;
    }
  }
  return saida;
}

/** Largura e altura em pixels de uma fonte de textura. */
function tamanhoDaFonte(fonte: TexImageSource): { largura: number; altura: number } {
  if (typeof VideoFrame !== "undefined" && fonte instanceof VideoFrame) return { largura: fonte.displayWidth, altura: fonte.displayHeight };
  if (fonte instanceof HTMLVideoElement) return { largura: fonte.videoWidth, altura: fonte.videoHeight };
  const { width, height } = fonte as { width: number; height: number };
  return { largura: width, altura: height };
}

function compilar(gl: WebGL2RenderingContext, tipo: number, codigo: string): WebGLShader {
  const shader = gl.createShader(tipo)!;
  gl.shaderSource(shader, codigo);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Shader da prévia: ${gl.getShaderInfoLog(shader)}`);
  return shader;
}

/** Os uniformes da chave de luminância (0 desligada, 1 tira o escuro, 2 o claro). */
function definirChaveDeLuma(
  gl: WebGL2RenderingContext,
  uniformes: Record<"luma" | "lumaLimiar" | "lumaSuavidade", WebGLUniformLocation | null>,
  chave: ChaveLuma | null | undefined,
) {
  gl.uniform1i(uniformes.luma, chave ? (chave.tirar === "escuro" ? 1 : 2) : 0);
  if (!chave) return;
  gl.uniform1f(uniformes.lumaLimiar, chave.limiar);
  gl.uniform1f(uniformes.lumaSuavidade, chave.suavidade);
}

/** "#ff6a3d" → [1, 0.416, 0.239]. */
export function corParaRgb(hex: string): [number, number, number] {
  const valor = Number.parseInt(hex.slice(1, 7), 16);
  if (!/^#[0-9a-f]{6}$/i.test(hex) || Number.isNaN(valor)) return [0, 0, 0];
  return [((valor >> 16) & 255) / 255, ((valor >> 8) & 255) / 255, (valor & 255) / 255];
}

type Alvo = { buffer: WebGLFramebuffer; textura: WebGLTexture; largura: number; altura: number };

/** O framebuffer da cópia do que já foi desenhado, para a camada de ajuste (os de 0 a 4 são dos desfoques e do recorte). */
const ALVO_DO_FUNDO = 6;
/** O da cópia do fundo para os modos de mesclagem que leem o fundo (unidade de textura 6). */
const ALVO_DA_MESCLAGEM = 7;
/** Os da camada com contorno e sombra: ela sozinha (8), o desfoque do contorno (10 e 11, em ponto flutuante), com o
 * contorno (9), o desfoque da sombra (12 e 13) e com a sombra (14). */
const ALVO_DA_SILHUETA = 8;
const ALVO_COM_CONTORNO = 9;
const ALVO_DO_CONTORNO = 10;
const ALVO_DA_SOMBRA = 12;
const ALVO_COM_SOMBRA = 14;
/** A cópia do destino quando ele é um framebuffer (RGBA, sem as amostras do canvas). */
/** O conjunto com o preenchimento (a camada sem a parte que o preenchimento esconde). */
const ALVO_COM_PREENCHIMENTO = 17;
/** O desfoque da difusão da máscara de camada (18 e 19). */
const ALVO_DA_MASCARA_DA_CAMADA = 18;
const ALVO_DO_FUNDO_EM_FRAMEBUFFER = 15;
const ALVO_DA_MESCLAGEM_EM_FRAMEBUFFER = 16;
/** Um framebuffer do tamanho do destino por nível de pasta (ou de recorte), a partir deste. */
const ALVO_DAS_PASTAS = 20;
const RECORTE_INTEIRO: Recorte = { x: 0, y: 0, largura: 1, altura: 1 };

type Recursos = {
  programa: WebGLProgram;
  desfoque: { programa: WebGLProgram; uniformes: Record<"fonte" | "passo" | "sigma" | "lod" | "limite", WebGLUniformLocation | null> };
  silhueta: { programa: WebGLProgram; uniformes: Record<"camada" | "borrada" | "modo" | "cor" | "rampa" | "opacidade" | "deslocamento", WebGLUniformLocation | null> };
  recorte: {
    programa: WebGLProgram;
    uniformes: Record<"fonte" | "mascara" | "comMascara" | "comChroma" | "chromaCor" | "semelhanca" | "suavidade" | "luma" | "lumaLimiar" | "lumaSuavidade", WebGLUniformLocation | null>;
  };
  /** Os dois framebuffers das passadas do desfoque. */
  alvos: Alvo[];
  /** A LUT 3D de cada camada, na unidade de textura 1, com a chave da que está nela (para não subir de novo). */
  luts: ({ textura: WebGLTexture; chave: string } | undefined)[];
  /** A tabela de 256 tons de cada camada, na unidade 7, também com a chave. */
  tabelas: ({ textura: WebGLTexture; chave: string } | undefined)[];
  /** A imagem fixa do grão, feita na primeira vez que um clipe usa granulação. */
  grao: WebGLTexture | null;
  /** O quadro da máscara do fundo de cada camada, na unidade 4. */
  mascaras: WebGLTexture[];
  /** As máscaras de camada pintáveis, uma por camada (unidade 5). */
  mascarasDaCamada: WebGLTexture[];
  uniformes: Record<
    "recortada" | "quadro" | "centro" | "tamanho" | "rotacao" | "recorte" | "virar" | "opacidade" | "textura" | "comLut" | "lut" | "modoTabela" | "tabela" | "vinheta" | "revelado" | "corteDe" | "corteAte" | "mesclagem" | "brilho" | "nitidez" | "meiosTons" | "desfocada" | "lente" | "transicao" | "transicaoLimiar" | "borrao" | "borraoForca" | "zoomTransicao" | "celulas" | "desvio" | "linhas" | "luz" | "luzPosicao" | "grao" | "graoColunas" | "graoDeslocamento" | "graoTextura" | "comChroma" | "chromaCor" | "semelhanca" | "suavidade" | "luma" | "lumaLimiar" | "lumaSuavidade" | "cantos" | "mascaraForma" | "mascara" | "mascaraSuave" | "corDaBorda" | "pixelsPorUnidade" | "comMascaraDoFundo" | "mascaraDoFundo" | "fundo" | "poligono" | "pontosDoPoligono" | "comMascaraCamada" | "mascaraCamada" | "mascaraCamadaMatriz" | "mascaraCamadaDensidade" | "comFundo" | "mesclarSe" | "mesclarSeCanal" | "mesclarSeEsta" | "mesclarSeAbaixo" | "canais",
    WebGLUniformLocation | null
  >;
  texturas: WebGLTexture[];
};

/** A partir de quantas vezes de redução a textura é lida do mipmap. */
const REDUCAO_COM_MIPMAP = 1.5;

export class Compositor {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private recursos: Recursos | null;
  private comFlutuante = false;
  /** Onde as camadas estão sendo desenhadas: o canvas, ou o framebuffer da camada com contorno e sombra. */
  private destino: { buffer: WebGLFramebuffer | null; largura: number; altura: number; quadro: Tamanho } = {
    buffer: null,
    largura: 1,
    altura: 1,
    quadro: { largura: 1, altura: 1 },
  };
  /** O nível de pasta (ou de recorte) que está sendo desenhado: cada um tem o framebuffer dele. */
  private nivel = 0;
  /** O número da camada folha da vez (as texturas e as LUTs ficam guardadas por ele, de um quadro para o outro). */
  private proximaFolha = 0;

  /** Lança erro quando o navegador não tem WebGL2. `comAlfa`: o canvas guarda a transparência (o editor de imagem sem fundo). */
  constructor(canvas: HTMLCanvasElement, { comAlfa = false } = {}) {
    const gl = canvas.getContext("webgl2", { alpha: comAlfa, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error("Este navegador não tem WebGL2, que a prévia usa para desenhar o vídeo.");
    this.canvas = canvas;
    this.gl = gl;
    // Para desenhar em ponto flutuante (o desfoque do contorno); sem a extensão, fica em 8 bits
    this.comFlutuante = Boolean(gl.getExtension("EXT_color_buffer_float"));
    this.recursos = this.criarRecursos();
    canvas.addEventListener("webglcontextlost", this.aoPerder);
    canvas.addEventListener("webglcontextrestored", this.aoRestaurar);
  }

  private aoPerder = (evento: Event) => {
    // Sem isto o navegador não devolve o contexto
    evento.preventDefault();
    this.recursos = null;
  };

  private aoRestaurar = () => {
    this.recursos = this.criarRecursos();
  };

  private criarRecursos(): Recursos {
    const gl = this.gl;
    const programa = gl.createProgram()!;
    gl.attachShader(programa, compilar(gl, gl.VERTEX_SHADER, VERTICES));
    gl.attachShader(programa, compilar(gl, gl.FRAGMENT_SHADER, FRAGMENTOS));
    gl.bindAttribLocation(programa, 0, "a_pos");
    gl.linkProgram(programa);
    if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) throw new Error(`Programa da prévia: ${gl.getProgramInfoLog(programa)}`);
    const programaDesfoque = gl.createProgram()!;
    gl.attachShader(programaDesfoque, compilar(gl, gl.VERTEX_SHADER, VERTICES_DESFOQUE));
    gl.attachShader(programaDesfoque, compilar(gl, gl.FRAGMENT_SHADER, FRAGMENTOS_DESFOQUE));
    gl.bindAttribLocation(programaDesfoque, 0, "a_pos");
    gl.linkProgram(programaDesfoque);
    if (!gl.getProgramParameter(programaDesfoque, gl.LINK_STATUS)) throw new Error(`Desfoque da prévia: ${gl.getProgramInfoLog(programaDesfoque)}`);
    const localDesfoque = (nome: string) => gl.getUniformLocation(programaDesfoque, nome);
    const desfoque = {
      programa: programaDesfoque,
      uniformes: {
        fonte: localDesfoque("u_fonte"),
        passo: localDesfoque("u_passo"),
        sigma: localDesfoque("u_sigma"),
        lod: localDesfoque("u_lod"),
        limite: localDesfoque("u_limite"),
      },
    };
    const programaSilhueta = gl.createProgram()!;
    gl.attachShader(programaSilhueta, compilar(gl, gl.VERTEX_SHADER, VERTICES_DESFOQUE));
    gl.attachShader(programaSilhueta, compilar(gl, gl.FRAGMENT_SHADER, FRAGMENTOS_SILHUETA));
    gl.bindAttribLocation(programaSilhueta, 0, "a_pos");
    gl.linkProgram(programaSilhueta);
    if (!gl.getProgramParameter(programaSilhueta, gl.LINK_STATUS)) throw new Error(`Silhueta da prévia: ${gl.getProgramInfoLog(programaSilhueta)}`);
    const localSilhueta = (nome: string) => gl.getUniformLocation(programaSilhueta, nome);
    const silhueta = {
      programa: programaSilhueta,
      uniformes: {
        camada: localSilhueta("u_camada"),
        borrada: localSilhueta("u_borrada"),
        modo: localSilhueta("u_modo"),
        cor: localSilhueta("u_cor"),
        rampa: localSilhueta("u_rampa"),
        opacidade: localSilhueta("u_opacidade"),
        deslocamento: localSilhueta("u_deslocamento"),
      },
    };
    const programaRecorte = gl.createProgram()!;
    gl.attachShader(programaRecorte, compilar(gl, gl.VERTEX_SHADER, VERTICES_DESFOQUE));
    gl.attachShader(programaRecorte, compilar(gl, gl.FRAGMENT_SHADER, FRAGMENTOS_RECORTE));
    gl.bindAttribLocation(programaRecorte, 0, "a_pos");
    gl.linkProgram(programaRecorte);
    if (!gl.getProgramParameter(programaRecorte, gl.LINK_STATUS)) throw new Error(`Recorte da prévia: ${gl.getProgramInfoLog(programaRecorte)}`);
    const localRecorte = (nome: string) => gl.getUniformLocation(programaRecorte, nome);
    const recorte = {
      programa: programaRecorte,
      uniformes: {
        fonte: localRecorte("u_fonte"),
        mascara: localRecorte("u_mascara"),
        comMascara: localRecorte("u_comMascara"),
        comChroma: localRecorte("u_comChroma"),
        chromaCor: localRecorte("u_chromaCor"),
        semelhanca: localRecorte("u_semelhanca"),
        suavidade: localRecorte("u_suavidade"),
        luma: localRecorte("u_luma"),
        lumaLimiar: localRecorte("u_lumaLimiar"),
        lumaSuavidade: localRecorte("u_lumaSuavidade"),
      },
    };
    gl.useProgram(programa);

    const vertices = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

    const local = (nome: string) => gl.getUniformLocation(programa, nome);
    return {
      programa,
      uniformes: {
        recortada: local("u_recortada"),
        comFundo: local("u_comFundo"),
        mesclarSe: local("u_mesclarSe"),
        mesclarSeCanal: local("u_mesclarSeCanal"),
        mesclarSeEsta: local("u_mesclarSeEsta"),
        mesclarSeAbaixo: local("u_mesclarSeAbaixo"),
        canais: local("u_canais"),
        quadro: local("u_quadro"),
        centro: local("u_centro"),
        tamanho: local("u_tamanho"),
        rotacao: local("u_rotacao"),
        recorte: local("u_recorte"),
        virar: local("u_virar"),
        opacidade: local("u_opacidade"),
        comLut: local("u_comLut"),
        lut: local("u_lut"),
        modoTabela: local("u_modoTabela"),
        tabela: local("u_tabela"),
        vinheta: local("u_vinheta"),
        revelado: local("u_revelado"),
        corteDe: local("u_corteDe"),
        mesclagem: local("u_mesclagem"),
        fundo: local("u_fundo"),
        poligono: local("u_poligono[0]"),
        pontosDoPoligono: local("u_pontosDoPoligono"),
        brilho: local("u_brilho"),
        nitidez: local("u_nitidez"),
        meiosTons: local("u_meiosTons"),
        desfocada: local("u_desfocada"),
        lente: local("u_lente"),
        transicao: local("u_transicao"),
        transicaoLimiar: local("u_transicaoLimiar"),
        borrao: local("u_borrao"),
        borraoForca: local("u_borraoForca"),
        zoomTransicao: local("u_zoomTransicao"),
        celulas: local("u_celulas"),
        desvio: local("u_desvio"),
        linhas: local("u_linhas"),
        luz: local("u_luz"),
        luzPosicao: local("u_luzPosicao"),
        grao: local("u_grao"),
        graoColunas: local("u_graoColunas"),
        graoDeslocamento: local("u_graoDeslocamento"),
        graoTextura: local("u_graoTextura"),
        comChroma: local("u_comChroma"),
        cantos: local("u_cantos"),
        mascaraForma: local("u_mascaraForma"),
        mascara: local("u_mascara"),
        mascaraSuave: local("u_mascaraSuave"),
        corDaBorda: local("u_corDaBorda"),
        pixelsPorUnidade: local("u_pixelsPorUnidade"),
        luma: local("u_luma"),
        lumaLimiar: local("u_lumaLimiar"),
        lumaSuavidade: local("u_lumaSuavidade"),
        comMascaraDoFundo: local("u_comMascaraDoFundo"),
        mascaraDoFundo: local("u_mascaraDoFundo"),
        comMascaraCamada: local("u_comMascaraCamada"),
        mascaraCamada: local("u_mascaraCamada"),
        mascaraCamadaMatriz: local("u_mascaraCamadaMatriz"),
        mascaraCamadaDensidade: local("u_mascaraCamadaDensidade"),
        chromaCor: local("u_chromaCor"),
        semelhanca: local("u_semelhanca"),
        suavidade: local("u_suavidade"),
        corteAte: local("u_corteAte"),
        textura: local("u_textura"),
      },
      texturas: [],
      luts: [],
      tabelas: [],
      grao: null,
      mascaras: [],
      mascarasDaCamada: [],
      desfoque,
      silhueta,
      recorte,
      alvos: [],
    };
  }

  /** A imagem fixa do grão (lib/projeto/efeitos.ts), feita uma vez, na unidade 3. */
  private texturaDoGrao(): WebGLTexture {
    const recursos = this.recursos!;
    if (!recursos.grao) {
      const gl = this.gl;
      const textura = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, textura);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, GRAO_TEXTURA[0], GRAO_TEXTURA[1], 0, gl.RED, gl.UNSIGNED_BYTE, valoresDoGrao());
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      recursos.grao = textura;
    }
    return recursos.grao;
  }

  /** O framebuffer `indice` com uma textura do tamanho pedido. */
  private alvo(indice: number, largura: number, altura: number, semAlfa = false, flutuante = false): Alvo {
    const gl = this.gl;
    const recursos = this.recursos!;
    let alvo = recursos.alvos[indice];
    if (!alvo) {
      alvo = { buffer: gl.createFramebuffer()!, textura: gl.createTexture()!, largura: 0, altura: 0 };
      recursos.alvos[indice] = alvo;
    }
    if (alvo.largura !== largura || alvo.altura !== altura) {
      // Criar ou mudar o tamanho liga a textura nova na unidade ativa: a camada que já estava ligada ali volta no
      // fim (sem isso, o primeiro quadro depois de criar o framebuffer de uma mesclagem ou de um recorte lia esta)
      const ligada = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
      const destino = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      gl.bindTexture(gl.TEXTURE_2D, alvo.textura);
      if (flutuante && this.comFlutuante) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, largura, altura, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else if (semAlfa) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, largura, altura, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, largura, altura, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, alvo.buffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, alvo.textura, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, destino);
      gl.bindTexture(gl.TEXTURE_2D, ligada);
      alvo.largura = largura;
      alvo.altura = altura;
    }
    return alvo;
  }

  /**
   * Desfoca a textura já carregada (largura × altura) e devolve a textura desfocada, do mesmo
   * enquadramento. sigma em pixels da textura; o recorte limita a área lida, como o crop do render.
   */
  private desfocar(textura: WebGLTexture, largura: number, altura: number, sigma: number, recorte: Recorte, primeiroAlvo = 0, flutuante = false): WebGLTexture {
    const gl = this.gl;
    const { desfoque, programa } = this.recursos!;
    const nivel = Math.max(0, Math.floor(Math.log2(sigma / SIGMA_POR_NIVEL)));
    const fator = 2 ** nivel;
    const w = Math.max(1, Math.ceil(largura / fator));
    const h = Math.max(1, Math.ceil(altura / fator));
    const primeiro = this.alvo(primeiroAlvo, w, h, false, flutuante);
    const segundo = this.alvo(primeiroAlvo + 1, w, h, false, flutuante);
    gl.bindTexture(gl.TEXTURE_2D, textura);
    const filtro = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER) as number;
    if (nivel > 0) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    gl.useProgram(desfoque.programa);
    gl.disable(gl.BLEND);
    gl.uniform1i(desfoque.uniformes.fonte, 0);
    gl.uniform1f(desfoque.uniformes.sigma, sigma / fator);
    // Os centros dos pixels das bordas do recorte, no nível lido
    gl.uniform4f(desfoque.uniformes.limite, recorte.x + 0.5 / w, recorte.y + 0.5 / h, recorte.x + recorte.largura - 0.5 / w, recorte.y + recorte.altura - 0.5 / h);
    gl.viewport(0, 0, w, h);
    // Horizontal: da textura (no nível do mipmap) para o primeiro framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, primeiro.buffer);
    gl.uniform2f(desfoque.uniformes.passo, 1 / w, 0);
    gl.uniform1f(desfoque.uniformes.lod, nivel);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // Vertical: do primeiro para o segundo
    gl.bindFramebuffer(gl.FRAMEBUFFER, segundo.buffer);
    gl.bindTexture(gl.TEXTURE_2D, primeiro.textura);
    gl.uniform2f(desfoque.uniformes.passo, 0, 1 / h);
    gl.uniform1f(desfoque.uniformes.lod, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, textura);
    // O filtro de antes: forçar LINEAR tirava o mipmap da camada reduzida e o texto com brilho serrilhava
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtro);
    gl.enable(gl.BLEND);
    gl.useProgram(programa);
    return segundo.textura;
  }

  /**
   * A camada (a textura ligada na unidade 0) já com a máscara do fundo (unidade 4) e a tela verde, no
   * framebuffer 4, do tamanho da textura. Devolve a textura dele, ligada na unidade 0.
   */
  private recortarCamada(textura: WebGLTexture, camada: Camada, largura: number, altura: number): WebGLTexture {
    const gl = this.gl;
    const { recorte, programa } = this.recursos!;
    const alvo = this.alvo(4, largura, altura);
    gl.useProgram(recorte.programa);
    gl.disable(gl.BLEND);
    gl.uniform1i(recorte.uniformes.fonte, 0);
    gl.uniform1i(recorte.uniformes.mascara, 4);
    gl.uniform1i(recorte.uniformes.comMascara, camada.mascaraDoFundo ? 1 : 0);
    gl.uniform1i(recorte.uniformes.comChroma, camada.chroma ? 1 : 0);
    if (camada.chroma) {
      gl.uniform3f(recorte.uniformes.chromaCor, ...corParaRgb(camada.chroma.cor));
      gl.uniform1f(recorte.uniformes.semelhanca, camada.chroma.semelhanca);
      gl.uniform1f(recorte.uniformes.suavidade, camada.chroma.suavidade);
    }
    definirChaveDeLuma(gl, recorte.uniformes, camada.chaveLuma);
    gl.viewport(0, 0, largura, altura);
    gl.bindFramebuffer(gl.FRAMEBUFFER, alvo.buffer);
    gl.bindTexture(gl.TEXTURE_2D, textura);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.BLEND);
    gl.useProgram(programa);
    gl.bindTexture(gl.TEXTURE_2D, alvo.textura);
    return alvo.textura;
  }

  private textura(indice: number): WebGLTexture {
    const gl = this.gl;
    const recursos = this.recursos!;
    if (!recursos.texturas[indice]) {
      const textura = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, textura);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      recursos.texturas[indice] = textura;
    }
    return recursos.texturas[indice];
  }

  /**
   * Desenha um quadro. `quadro` é o tamanho em que as caixas foram calculadas; o canvas pode ter
   * outra resolução (a da tela, com a densidade de pixels), e a imagem é esticada para ele.
   */
  desenhar(camadas: Camada[], fundo: string | null, quadro: Tamanho, resolucao: Tamanho) {
    const gl = this.gl;
    const recursos = this.recursos;
    if (!recursos || gl.isContextLost()) return;
    if (this.canvas.width !== resolucao.largura || this.canvas.height !== resolucao.altura) {
      this.canvas.width = resolucao.largura;
      this.canvas.height = resolucao.altura;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // Sem fundo (imagem transparente), o canvas começa transparente; as camadas somam o alfa em cima
    const [r, g, b] = fundo ? corParaRgb(fundo) : [0, 0, 0];
    gl.clearColor(r, g, b, fundo ? 1 : 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const { uniformes } = recursos;
    gl.uniform2f(uniformes.quadro, quadro.largura, quadro.altura);
    gl.uniform1i(uniformes.textura, 0);
    gl.activeTexture(gl.TEXTURE0);
    this.destino = { buffer: null, largura: this.canvas.width, altura: this.canvas.height, quadro };
    this.nivel = 0;
    this.proximaFolha = 0;
    for (const camada of camadas) this.desenharNo(camada);
    gl.uniform1i(uniformes.recortada, 0);
  }

  /** Uma camada, uma pasta ou uma base de recorte (com as presas a ela). */
  private desenharNo(camada: Camada) {
    if (camada.recortadas?.length) this.desenharComRecorte(camada);
    else if (camada.pasta) this.desenharPasta(camada);
    else if (camada.estiloDeCamada && camada.fonte !== FUNDO) this.desenharComEstilo(camada, this.proximaFolha++);
    else if (camada.silhueta && camada.fonte !== FUNDO) this.desenharComSilhueta(camada, this.proximaFolha++);
    else this.desenharCamada(camada, this.proximaFolha++);
  }

  /** A caixa do quadro inteiro do destino, para o framebuffer de uma pasta voltar como camada. */
  private caixaDoQuadro(opacidade: number): Caixa {
    const { quadro } = this.destino;
    return { cx: quadro.largura / 2, cy: quadro.altura / 2, largura: quadro.largura, altura: quadro.altura, rotacao: 0, opacidade };
  }

  /**
   * Copia o que já foi desenhado no destino da vez para uma textura comum (as linhas de baixo para cima). O canvas tem
   * várias amostras por pixel, que só o blit resolve, e pede o mesmo formato dos dois lados; um framebuffer é RGBA.
   */
  private copiarDestino(indiceDoCanvas: number, indiceDoFramebuffer: number): Alvo {
    const gl = this.gl;
    const { buffer, largura, altura } = this.destino;
    const copia = buffer ? this.alvo(indiceDoFramebuffer, largura, altura) : this.alvo(indiceDoCanvas, largura, altura, !gl.getContextAttributes()?.alpha);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, buffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, copia.buffer);
    gl.blitFramebuffer(0, 0, largura, altura, 0, 0, largura, altura, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    this.irAoDestino();
    return copia;
  }

  /** Começa um nível novo: um framebuffer do tamanho do destino, transparente, que passa a ser o destino. */
  private abrirNivel(): { tela: Compositor["destino"]; alvo: Alvo } {
    const gl = this.gl;
    const tela = this.destino;
    const alvo = this.alvo(ALVO_DAS_PASTAS + this.nivel, tela.largura, tela.altura);
    this.nivel++;
    this.destino = { buffer: alvo.buffer, largura: tela.largura, altura: tela.altura, quadro: tela.quadro };
    this.irAoDestino();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tela, alvo };
  }

  /** Fecha o nível: o destino volta e o framebuffer entra nele como uma camada do quadro inteiro. */
  private fecharNivel(tela: Compositor["destino"], alvo: Alvo, como: Pick<Camada, "mesclagem" | "mascaraDeForma" | "recortada"> & { opacidade: number }) {
    this.nivel--;
    this.destino = tela;
    this.irAoDestino();
    this.desenharCamada(
      {
        fonte: FUNDO,
        texturaPronta: { textura: alvo.textura, largura: tela.largura, altura: tela.altura },
        recorte: RECORTE_INTEIRO,
        // As linhas do framebuffer vêm de baixo para cima
        virar: { horizontal: false, vertical: true },
        caixa: this.caixaDoQuadro(como.opacidade),
        mesclagem: como.mesclagem,
        mascaraDeForma: como.mascaraDeForma,
        recortada: como.recortada,
      },
      this.proximaFolha++,
    );
  }

  /**
   * Uma pasta: as de dentro num framebuffer, que volta com a opacidade, a mesclagem e a máscara da pasta. Na passagem,
   * o framebuffer começa com o que já foi desenhado (as de dentro misturam com o que está embaixo) e volta por cima.
   */
  private desenharPasta(pasta: Camada) {
    if (pasta.caixa.opacidade <= 0 || this.nivel >= 16) return;
    const { passagem, filhos } = pasta.pasta!;
    const fundo = passagem ? this.copiarDestino(ALVO_DO_FUNDO, ALVO_DO_FUNDO_EM_FRAMEBUFFER) : null;
    const { tela, alvo } = this.abrirNivel();
    if (fundo) {
      this.desenharCamada(
        { fonte: FUNDO, texturaPronta: { textura: fundo.textura, largura: tela.largura, altura: tela.altura }, recorte: RECORTE_INTEIRO, virar: { horizontal: false, vertical: true }, caixa: this.caixaDoQuadro(1) },
        this.proximaFolha++,
      );
    }
    for (const filho of filhos) this.desenharNo(filho);
    this.fecharNivel(tela, alvo, { opacidade: pasta.caixa.opacidade, mesclagem: passagem ? "normal" : pasta.mesclagem, mascaraDeForma: pasta.mascaraDeForma, recortada: pasta.recortada });
  }

  /**
   * A base de um recorte e as presas a ela: a base sozinha (normal e opaca) num framebuffer, as recortadas por cima só
   * onde ela tem alfa, e o conjunto volta com a mesclagem e a opacidade da base, como nos editores de imagem.
   */
  private desenharComRecorte(base: Camada) {
    if (base.caixa.opacidade <= 0 || this.nivel >= 16) return;
    const { tela, alvo } = this.abrirNivel();
    this.desenharNo({ ...base, recortadas: undefined, recortada: false, mesclagem: base.pasta ? base.mesclagem : "normal", caixa: { ...base.caixa, opacidade: 1 } });
    for (const presa of base.recortadas!) this.desenharNo({ ...presa, recortada: true });
    this.fecharNivel(tela, alvo, { opacidade: base.caixa.opacidade, mesclagem: base.pasta?.passagem ? "normal" : base.mesclagem, recortada: base.recortada });
  }

  /** Liga o framebuffer em que as camadas estão sendo desenhadas (o canvas ou o da silhueta). */
  private irAoDestino() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.destino.buffer);
    gl.viewport(0, 0, this.destino.largura, this.destino.altura);
  }

  /** Uma camada no destino atual, com todos os efeitos dela. */
  private desenharCamada(camada: Camada, indice: number) {
    const gl = this.gl;
    const recursos = this.recursos!;
    const { uniformes } = recursos;
    const quadro = this.destino.quadro;
    gl.uniform2f(uniformes.quadro, quadro.largura, quadro.altura);
    const { caixa } = camada;
    // Daqui em diante, o recorte na textura: o pedaço espelhado quando o clipe está virado
    const recorte = recorteNaFonte(camada.recorte, camada.virar);
    if (caixa.opacidade <= 0 || caixa.largura <= 0 || caixa.altura <= 0) return;
    // A máscara de camada antes de tudo (o desfoque da difusão usa a unidade 0, que depois recebe a camada)
    let texturaDaMascara: WebGLTexture | null = null;
    if (camada.mascaraDaCamada) {
      const { fonte, difusao } = camada.mascaraDaCamada;
      gl.activeTexture(gl.TEXTURE0);
      let textura = recursos.mascarasDaCamada[indice];
      if (!textura) {
        textura = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, textura);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        recursos.mascarasDaCamada[indice] = textura;
      }
      gl.bindTexture(gl.TEXTURE_2D, textura);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fonte);
      texturaDaMascara = textura;
      const { largura: lm, altura: am } = tamanhoDaFonte(fonte);
      if (difusao > 0.05 && lm > 0 && am > 0) {
        texturaDaMascara = this.desfocar(textura, lm, am, difusao, RECORTE_INTEIRO, ALVO_DA_MASCARA_DA_CAMADA);
        this.irAoDestino();
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, this.textura(indice));
    let largura: number;
    let altura: number;
    if (camada.texturaPronta) {
      // Uma textura já desenhada pelo próprio compositor (a camada com contorno e sombra)
      ({ largura, altura } = camada.texturaPronta);
      gl.bindTexture(gl.TEXTURE_2D, camada.texturaPronta.textura);
    } else if (camada.fonte === FUNDO) {
      // A camada de ajuste lê o que já foi desenhado. O canvas tem antialias (várias amostras por pixel), que o
      // copyTexImage2D não lê (a cópia saía preta): o blit resolve as amostras numa textura comum. As linhas vêm
      // de baixo para cima, e quem monta a camada a vira na vertical. O blit de várias amostras pede o mesmo
      // formato dos dois lados: o canvas sem alfa é RGB, e a cópia também
      [largura, altura] = [this.destino.largura, this.destino.altura];
      // Dentro de uma pasta, o que já foi desenhado nela
      const copia = this.copiarDestino(ALVO_DO_FUNDO, ALVO_DO_FUNDO_EM_FRAMEBUFFER);
      gl.bindTexture(gl.TEXTURE_2D, copia.textura);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, camada.fonte);
      ({ largura, altura } = tamanhoDaFonte(camada.fonte));
    }
    // Imagem ou texto bem maior que o lugar dele na tela: lido do mipmap, senão cada pixel da tela pega
    // um ponto só da textura e as bordas finas saem em escada (o render reduz com média)
    const reducao = (largura * recorte.largura) / Math.max(1, (caixa.largura * this.destino.largura) / quadro.largura);
    if (reducao > REDUCAO_COM_MIPMAP && largura > 0 && altura > 0) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    if (camada.desfoque && camada.desfoque > 0) {
      // O sigma é uma fração da altura do clipe; na textura, da altura do recorte
      const sigma = camada.desfoque * recorte.altura * altura;
      if (sigma >= 0.05 && largura > 0 && altura > 0) {
        const desfocada = this.desfocar(this.textura(indice), largura, altura, sigma, recorte);
        this.irAoDestino();
        gl.bindTexture(gl.TEXTURE_2D, desfocada);
      }
    }
    if (camada.mascaraDoFundo) {
      // A unidade 4 fica ativa antes de criar e ligar a textura: com a 0 ativa, o quadro do vídeo era trocado
      // pela máscara e o primeiro quadro da camada saía com a silhueta branca
      gl.activeTexture(gl.TEXTURE4);
      let textura = recursos.mascaras[indice];
      if (!textura) {
        textura = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, textura);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        recursos.mascaras[indice] = textura;
      }
      gl.bindTexture(gl.TEXTURE_2D, textura);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, camada.mascaraDoFundo);
      gl.uniform1i(uniformes.mascaraDoFundo, 4);
      gl.activeTexture(gl.TEXTURE0);
    }
    const brilho = camada.brilho ?? 0;
    const realce = camada.contrasteLocal ?? null;
    gl.uniform1f(uniformes.brilho, brilho > 0 && largura > 0 ? brilho : 0);
    gl.uniform1f(uniformes.nitidez, realce && largura > 0 ? realce.forca : 0);
    gl.uniform1i(uniformes.meiosTons, realce?.meiosTons ? 1 : 0);
    // A cópia desfocada do brilho, da nitidez ou da clareza (um efeito por clipe: nunca dois)
    const sigmaDaCopia = brilho > 0 ? SIGMA_DO_BRILHO : realce ? realce.sigma : 0;
    // Com brilho ou nitidez, a camada é recortada antes (máscara e tela verde) e o shader não recorta de novo
    const recortadaAntes = sigmaDaCopia > 0 && largura > 0 && Boolean(camada.mascaraDoFundo || camada.chroma || camada.chaveLuma);
    if (recortadaAntes) {
      this.recortarCamada(gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture, camada, largura, altura);
      this.irAoDestino();
      if (reducao > REDUCAO_COM_MIPMAP) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
    }
    if (sigmaDaCopia > 0 && largura > 0) {
      // A cópia desfocada do brilho ou da nitidez, nos framebuffers 2 e 3, na unidade 2
      const atual = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture;
      const luz = this.desfocar(atual, largura, altura, sigmaDaCopia * recorte.altura * altura, recorte, 2);
      this.irAoDestino();
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, luz);
      gl.uniform1i(uniformes.desfocada, 2);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atual);
    }
    gl.uniform1f(uniformes.lente, camada.lente ?? 0);
    const mascaraDaTransicao = camada.mascaraDaTransicao;
    gl.uniform1i(uniformes.transicao, mascaraDaTransicao ? MASCARAS_DE_TRANSICAO.indexOf(mascaraDaTransicao.tipo) + 1 : 0);
    gl.uniform1f(uniformes.transicaoLimiar, mascaraDaTransicao?.limiar ?? 0);
    gl.uniform1i(uniformes.borrao, camada.borrao ? (camada.borrao.tipo === "zoom" ? 1 : 2) : 0);
    gl.uniform1f(uniformes.borraoForca, camada.borrao?.forca ?? 0);
    // A transição não soma ao zoom, ao giro e ao pixelizar do clipe (o render também não)
    gl.uniform1f(uniformes.zoomTransicao, camada.borrao || camada.celulas?.[0] ? 0 : (camada.zoomDaTransicao ?? 0));
    gl.uniform2f(uniformes.celulas, camada.celulas?.[0] ?? 0, camada.celulas?.[1] ?? 0);
    gl.uniform1f(uniformes.desvio, camada.desvio ?? 0);
    gl.uniform1f(uniformes.linhas, camada.linhas ?? 0);
    gl.uniform1i(uniformes.comMascaraDoFundo, camada.mascaraDoFundo && !recortadaAntes ? 1 : 0);
    gl.uniform1i(uniformes.comChroma, camada.chroma && !recortadaAntes ? 1 : 0);
    if (camada.chroma) {
      gl.uniform3f(uniformes.chromaCor, ...corParaRgb(camada.chroma.cor));
      gl.uniform1f(uniformes.semelhanca, camada.chroma.semelhanca);
      gl.uniform1f(uniformes.suavidade, camada.chroma.suavidade);
    }
    definirChaveDeLuma(gl, uniformes, recortadaAntes ? null : camada.chaveLuma);
    gl.uniform2f(uniformes.cantos, camada.cantos?.raio ?? 0, camada.cantos?.borda ?? 0);
    const forma = camada.mascaraDeForma;
    gl.uniform1i(uniformes.mascaraForma, forma ? (forma.forma === "retangulo" ? 1 : forma.forma === "desenho" ? 3 : 2) : 0);
    if (forma?.forma === "desenho" && forma.pontos?.length) {
      gl.uniform2fv(uniformes.poligono, new Float32Array(forma.pontos.flat()));
      gl.uniform1i(uniformes.pontosDoPoligono, forma.pontos.length);
    }
    if (forma) {
      gl.uniform4f(uniformes.mascara, forma.x, forma.y, forma.largura, forma.altura);
      gl.uniform2f(uniformes.mascaraSuave, forma.suavidade, forma.inverter ? 1 : 0);
    }
    if (camada.cantos || forma) {
      gl.uniform3f(uniformes.corDaBorda, ...corParaRgb(camada.cantos?.cor ?? "#ffffff"));
      gl.uniform1f(uniformes.pixelsPorUnidade, this.destino.largura / quadro.largura);
    }
    gl.uniform1f(uniformes.luz, camada.luz?.forca ?? 0);
    gl.uniform1f(uniformes.luzPosicao, camada.luz?.posicao ?? 0);
    gl.uniform1f(uniformes.grao, camada.grao?.forca ?? 0);
    if (camada.grao) {
      gl.uniform1f(uniformes.graoColunas, camada.grao.colunas);
      gl.uniform2f(uniformes.graoDeslocamento, ...camada.grao.deslocamento);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.texturaDoGrao());
      gl.uniform1i(uniformes.graoTextura, 3);
      gl.activeTexture(gl.TEXTURE0);
    }
    gl.uniform2f(uniformes.centro, caixa.cx, caixa.cy);
    gl.uniform2f(uniformes.tamanho, caixa.largura, caixa.altura);
    gl.uniform1f(uniformes.rotacao, (caixa.rotacao * Math.PI) / 180);
    gl.uniform4f(uniformes.recorte, recorte.x, recorte.y, recorte.largura, recorte.altura);
    gl.uniform2f(uniformes.virar, camada.virar?.horizontal ? 1 : 0, camada.virar?.vertical ? 1 : 0);
    gl.uniform1f(uniformes.opacidade, caixa.opacidade);
    const revelado = camada.revelado ?? REVELADO_INTEIRO;
    gl.uniform4f(uniformes.revelado, revelado.x0, revelado.y0, revelado.x1, revelado.y1);
    const mascara = camada.mascara ?? SEM_MASCARA;
    gl.uniform3f(uniformes.corteDe, ...mascara.de);
    gl.uniform3f(uniformes.corteAte, ...mascara.ate);
    gl.uniform1i(uniformes.comLut, camada.lut ? 1 : 0);
    // A unidade 1 é sempre do sampler3D: com o padrão (0), ela dividiria a unidade com a textura 2D
    gl.uniform1i(uniformes.lut, 1);
    if (camada.lut) {
      let lut = recursos.luts[indice];
      if (!lut) {
        lut = { textura: gl.createTexture()!, chave: "" };
        recursos.luts[indice] = lut;
      }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, lut.textura);
      if (lut.chave !== camada.lut.chave) {
        const n = PONTOS_DA_LUT;
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA32F, n, n, n, 0, gl.RGBA, gl.FLOAT, camada.lut.dados);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        // Lida só com texelFetch; sem filtro, a textura de ponto flutuante fica completa sem extensão
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        lut.chave = camada.lut.chave;
      }
      gl.activeTexture(gl.TEXTURE0);
    }
    gl.uniform1i(uniformes.tabela, 7);
    gl.uniform1i(uniformes.modoTabela, camada.tabela ? (camada.tabela.modo === "canais" ? 1 : 2) : 0);
    if (camada.tabela) {
      let tabela = recursos.tabelas[indice];
      if (!tabela) {
        tabela = { textura: gl.createTexture()!, chave: "" };
        recursos.tabelas[indice] = tabela;
      }
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_2D, tabela.textura);
      if (tabela.chave !== camada.tabela.chave) {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 256, 1, 0, gl.RGBA, gl.FLOAT, camada.tabela.dados);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        // Lida só com texelFetch, como a LUT 3D
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        tabela.chave = camada.tabela.chave;
      }
      gl.activeTexture(gl.TEXTURE0);
    }
    gl.uniform1f(uniformes.vinheta, camada.vinheta ?? 0);
    gl.uniform1i(uniformes.comMascaraCamada, texturaDaMascara ? 1 : 0);
    if (texturaDaMascara && camada.mascaraDaCamada) {
      const [a, b, c, d, e, f] = camada.mascaraDaCamada.matriz;
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, texturaDaMascara);
      gl.uniform1i(uniformes.mascaraCamada, 5);
      gl.uniformMatrix3fv(uniformes.mascaraCamadaMatriz, false, [a, b, 0, c, d, 0, e, f, 1]);
      gl.uniform1f(uniformes.mascaraCamadaDensidade, camada.mascaraDaCamada.densidade);
      gl.activeTexture(gl.TEXTURE0);
    }
    const mesclagem = camada.mesclagem ?? "normal";
    const codigo = CODIGO_DA_MESCLAGEM[mesclagem];
    const recortada = Boolean(camada.recortada);
    // As opções de mesclagem precisam do fundo (o caminho que lê a cópia do destino)
    const canais = camada.canais && !camada.canais.every(Boolean) ? camada.canais : null;
    const opcoes = Boolean(camada.mesclarSe || canais);
    gl.uniform1i(uniformes.mesclagem, codigo);
    gl.uniform1i(uniformes.recortada, recortada ? 1 : 0);
    gl.uniform1i(uniformes.comFundo, opcoes ? 1 : 0);
    gl.uniform1i(uniformes.mesclarSe, camada.mesclarSe ? 1 : 0);
    if (camada.mesclarSe) {
      gl.uniform1i(uniformes.mesclarSeCanal, camada.mesclarSe.canal);
      gl.uniform4f(uniformes.mesclarSeEsta, ...camada.mesclarSe.esta);
      gl.uniform4f(uniformes.mesclarSeAbaixo, ...camada.mesclarSe.abaixo);
    }
    gl.uniform3f(uniformes.canais, ...((canais ?? [true, true, true]).map((ligado) => (ligado ? 1 : 0)) as [number, number, number]));
    if (camada.apagar) gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    else if (mesclagem === "multiplicar" && !recortada && !opcoes) gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    else if (mesclagem === "tela" && !recortada && !opcoes) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    else if (mesclagem === "somar" && !recortada && !opcoes) gl.blendFunc(gl.ONE, gl.ONE);
    else if (codigo >= MESCLAGEM_COM_O_FUNDO || recortada || opcoes) {
      // O fundo até aqui (o canvas, ou o framebuffer da pasta ou do recorte), copiado pelo blit como na camada de
      // ajuste: o shader mistura e escreve o resultado no lugar
      const copia = this.copiarDestino(ALVO_DA_MESCLAGEM, ALVO_DA_MESCLAGEM_EM_FRAMEBUFFER);
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, copia.textura);
      gl.uniform1i(uniformes.fundo, 6);
      gl.activeTexture(gl.TEXTURE0);
      gl.blendFunc(gl.ONE, gl.ZERO);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (mesclagem !== "normal" || recortada || opcoes || camada.apagar) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (recortada) gl.uniform1i(uniformes.recortada, 0);
    if (opcoes) {
      gl.uniform1i(uniformes.comFundo, 0);
      gl.uniform1i(uniformes.mesclarSe, 0);
      gl.uniform3f(uniformes.canais, 1, 1, 1);
    }
  }

  /**
   * Contorno e sombra (lib/projeto/silhueta.ts): a camada sozinha, sem giro e opaca, num framebuffer com a margem
   * em volta; o contorno é o alfa desfocado (em ponto flutuante: o limiar fica em 2,3%) cortado no limiar, por baixo
   * da camada; a sombra é o alfa do conjunto desfocado e deslocado, por baixo de tudo. O resultado volta para o
   * destino como uma camada com o giro, a opacidade e a mesclagem do clipe (como o render, antes da opacidade).
   */
  private desenharComSilhueta(camada: Camada, indice: number) {
    const gl = this.gl;
    const recursos = this.recursos!;
    const tela = this.destino;
    const { caixa } = camada;
    const silhueta = camada.silhueta!;
    if (caixa.opacidade <= 0 || caixa.largura <= 0 || caixa.altura <= 0) return;
    const escala = tela.largura / tela.quadro.largura;
    const alturaEmPixels = caixa.altura * escala;
    const margem = margemDaSilhueta(silhueta, alturaEmPixels);
    const quadroLocal = { largura: caixa.largura + (2 * margem) / escala, altura: caixa.altura + (2 * margem) / escala };
    const w = Math.max(1, Math.round(quadroLocal.largura * escala));
    const h = Math.max(1, Math.round(quadroLocal.altura * escala));
    const local = this.alvo(ALVO_DA_SILHUETA, w, h);
    this.destino = { buffer: local.buffer, largura: w, altura: h, quadro: quadroLocal };
    this.irAoDestino();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.desenharCamada(
      { ...camada, silhueta: undefined, mesclagem: "normal", caixa: { ...caixa, cx: quadroLocal.largura / 2, cy: quadroLocal.altura / 2, rotacao: 0, opacidade: 1 } },
      indice,
    );
    this.destino = tela;
    let resultado = local.textura;
    const juntar = (borrada: WebGLTexture, alvoIndice: number, modo: 1 | 2 | 3, ajustar: (uniformes: Recursos["silhueta"]["uniformes"]) => void) => {
      const alvo = this.alvo(alvoIndice, w, h);
      gl.useProgram(recursos.silhueta.programa);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, alvo.buffer);
      gl.viewport(0, 0, w, h);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, borrada);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, resultado);
      gl.uniform1i(recursos.silhueta.uniformes.camada, 0);
      gl.uniform1i(recursos.silhueta.uniformes.borrada, 2);
      gl.uniform1i(recursos.silhueta.uniformes.modo, modo);
      ajustar(recursos.silhueta.uniformes);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.enable(gl.BLEND);
      gl.useProgram(recursos.programa);
      resultado = alvo.textura;
    };
    if (silhueta.contorno && silhueta.contorno.largura > 0) {
      const contorno = silhueta.contorno;
      const sigma = (contorno.largura * alturaEmPixels) / 2;
      const borrada = this.desfocar(local.textura, w, h, Math.max(sigma, 0.05), RECORTE_INTEIRO, ALVO_DO_CONTORNO, true);
      juntar(borrada, ALVO_COM_CONTORNO, 1, (uniformes) => {
        gl.uniform3f(uniformes.cor, ...corParaRgb(contorno.cor));
        gl.uniform1f(uniformes.rampa, rampaDoContorno(sigma));
      });
    }
    if (silhueta.sombra && silhueta.sombra.opacidade > 0) {
      const sombra = silhueta.sombra;
      const sigma = sombra.desfoque * alturaEmPixels;
      const borrada = sigma >= 0.05 ? this.desfocar(resultado, w, h, sigma, RECORTE_INTEIRO, ALVO_DA_SOMBRA) : resultado;
      const [dx, dy] = deslocamentoDaSombra(sombra, alturaEmPixels);
      juntar(borrada, ALVO_COM_SOMBRA, 2, (uniformes) => {
        gl.uniform3f(uniformes.cor, ...corParaRgb(sombra.cor));
        gl.uniform1f(uniformes.opacidade, sombra.opacidade);
        // As linhas do framebuffer vêm de baixo para cima: a sombra para baixo lê mais acima
        gl.uniform2f(uniformes.deslocamento, -dx / w, dy / h);
      });
    }
    const preenchimento = silhueta.preenchimento ?? 1;
    if (preenchimento < 1) juntar(local.textura, ALVO_COM_PREENCHIMENTO, 3, (uniformes) => gl.uniform1f(uniformes.opacidade, Math.max(0, preenchimento)));
    this.irAoDestino();
    // A textura pronta vem de baixo para cima, como a cópia da camada de ajuste: a camada nova é virada na vertical
    this.desenharCamada(
      {
        fonte: camada.fonte,
        texturaPronta: { textura: resultado, largura: w, altura: h },
        recorte: RECORTE_INTEIRO,
        virar: { horizontal: false, vertical: true },
        caixa: { ...caixa, largura: quadroLocal.largura, altura: quadroLocal.altura },
        mesclagem: camada.mesclagem,
        recortada: camada.recortada,
      },
      indice,
    );
  }

  /**
   * Estilo de camada (lib/imagem/efeitos.ts): a camada sozinha, sem giro e opaca, num framebuffer com a margem dos
   * efeitos; o alfa dela vai para a CPU, e cada efeito vira uma textura (a tinta vezes a cobertura) que entra como uma
   * camada com o giro da camada, a opacidade e o modo do efeito: os de fora por baixo do conteúdo (no preenchimento) e
   * os de dentro por cima, na ordem dos editores de imagem. As contas ficam guardadas enquanto a camada e o estilo
   * não mudam.
   */
  private desenharComEstilo(camada: Camada, indice: number) {
    const gl = this.gl;
    const tela = this.destino;
    const { caixa } = camada;
    const estilo = camada.estiloDeCamada!;
    if (caixa.opacidade <= 0 || caixa.largura <= 0 || caixa.altura <= 0) return;
    const escala = tela.largura / tela.quadro.largura;
    const escalaDosEfeitos = escala * estilo.escala;
    const margem = margemDosEfeitos(estilo.efeitos, escalaDosEfeitos);
    const quadroLocal = { largura: caixa.largura + (2 * margem) / escala, altura: caixa.altura + (2 * margem) / escala };
    const w = Math.max(1, Math.round(quadroLocal.largura * escala));
    const h = Math.max(1, Math.round(quadroLocal.altura * escala));
    const local = this.alvo(ALVO_DA_SILHUETA, w, h);
    const caixaLocal = { ...caixa, cx: quadroLocal.largura / 2, cy: quadroLocal.altura / 2, rotacao: 0, opacidade: 1 };
    const lerLocal = (desenho: Camada) => {
      this.destino = { buffer: local.buffer, largura: w, altura: h, quadro: quadroLocal };
      this.irAoDestino();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.desenharCamada(desenho, indice);
      const lidos = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, local.buffer);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, lidos);
      return lidos;
    };
    const sozinha: Camada = { ...camada, estiloDeCamada: undefined, silhueta: undefined, mesclagem: "normal", mesclarSe: null, canais: null, recortada: false, caixa: caixaLocal };
    // Com "a máscara esconde os efeitos", os efeitos saem da camada sem a máscara, e a máscara (lida num quadro branco)
    // corta cada um deles depois
    const esconder = Boolean(estilo.mascaraEscondeEfeitos && camada.mascaraDaCamada);
    let mascara: Uint8Array | null = null;
    if (esconder) {
      const branco = document.createElement("canvas");
      branco.width = branco.height = 1;
      const ctx2d = branco.getContext("2d")!;
      ctx2d.fillStyle = "#ffffff";
      ctx2d.fillRect(0, 0, 1, 1);
      mascara = lerLocal({ fonte: branco, recorte: RECORTE_INTEIRO, caixa: caixaLocal, mascaraDaCamada: camada.mascaraDaCamada, mascaraDeForma: camada.mascaraDeForma });
    }
    const semMascara = esconder ? lerLocal({ ...sozinha, mascaraDaCamada: null }) : null;
    // O conteúdo (com a máscara) fica no framebuffer para entrar como camada
    const pixels = lerLocal(sozinha);
    this.destino = tela;
    this.irAoDestino();
    const camadas = this.camadasDosEfeitos(semMascara ?? pixels, w, h, estilo, caixa.rotacao, mascara);
    const comoCamada = (dados: Uint8Array, opacidade: number, mesclagem: Mesclagem) => {
      const textura = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textura);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, dados);
      // As linhas da CPU vêm de cima para baixo, como uma imagem
      this.desenharCamada(
        {
          fonte: camada.fonte,
          texturaPronta: { textura, largura: w, altura: h },
          recorte: RECORTE_INTEIRO,
          virar: { horizontal: false, vertical: false },
          caixa: { ...caixa, largura: quadroLocal.largura, altura: quadroLocal.altura, opacidade: caixa.opacidade * opacidade },
          mesclagem,
          recortada: camada.recortada,
        },
        indice,
      );
      gl.deleteTexture(textura);
    };
    for (const efeito of camadas.abaixo) comoCamada(efeito.dados, efeito.opacidade, efeito.modo);
    // O vazamento: onde o conteúdo cobre (no que o preenchimento esconde), o fundo do documento aparece por baixo dele
    if (estilo.vazamento && estilo.preenchimento < 1) {
      this.desenharCamada(
        {
          fonte: camada.fonte,
          texturaPronta: { textura: local.textura, largura: w, altura: h },
          recorte: RECORTE_INTEIRO,
          virar: { horizontal: false, vertical: true },
          caixa: { ...caixa, largura: quadroLocal.largura, altura: quadroLocal.altura, opacidade: 1 - estilo.preenchimento },
          apagar: !estilo.fundo,
          recortada: camada.recortada,
        },
        indice,
      );
      if (estilo.fundo) comoCamada(camadaDeCorNoAlfa(pixels, w, h, estilo.fundo), 1 - estilo.preenchimento, "normal");
    }
    // O conteúdo, no preenchimento; a textura do framebuffer vem de baixo para cima
    this.desenharCamada(
      {
        fonte: camada.fonte,
        texturaPronta: { textura: local.textura, largura: w, altura: h },
        recorte: RECORTE_INTEIRO,
        virar: { horizontal: false, vertical: true },
        caixa: { ...caixa, largura: quadroLocal.largura, altura: quadroLocal.altura, opacidade: caixa.opacidade * estilo.preenchimento },
        mesclagem: camada.mesclagem,
        mesclarSe: camada.mesclarSe,
        canais: camada.canais,
        recortada: camada.recortada,
      },
      indice,
    );
    // Os de dentro como grupo: também no preenchimento
    const internos: TipoDoEfeito[] = ["sobreposicao_padrao", "sobreposicao_degrade", "sobreposicao_cor", "cetim", "brilho_interno", "sombra_interna"];
    for (const efeito of camadas.acima) comoCamada(efeito.dados, efeito.opacidade * (estilo.internosComoGrupo && internos.includes(efeito.tipo) ? estilo.preenchimento : 1), efeito.modo);
    // Opções de mesclagem: o conteúdo com o Mesclar se e os canais passa por cima de novo (no lugar do de antes)
  }

  /** As contas dos efeitos guardadas: o mesmo alfa com o mesmo estilo dá as mesmas camadas. */
  private efeitosGuardados = new Map<string, ReturnType<Compositor["calcularEfeitos"]>>();

  private camadasDosEfeitos(pixels: Uint8Array, w: number, h: number, estilo: NonNullable<Camada["estiloDeCamada"]>, giro: number, mascara: Uint8Array | null = null) {
    // Um resumo dos pixels (FNV-1a de 32 bits nas palavras de 4 bytes) e do estilo
    const palavras = new Uint32Array(pixels.buffer);
    let resumo = 0x811c9dc5;
    for (let i = 0; i < palavras.length; i++) resumo = Math.imul(resumo ^ palavras[i], 0x01000193) >>> 0;
    if (mascara) {
      const daMascara = new Uint32Array(mascara.buffer);
      for (let i = 0; i < daMascara.length; i += 7) resumo = Math.imul(resumo ^ daMascara[i], 0x01000193) >>> 0;
    }
    const chave = `${w}x${h}:${resumo}:${giro}:${JSON.stringify(estilo)}`;
    let pronto = this.efeitosGuardados.get(chave);
    if (!pronto) {
      pronto = this.calcularEfeitos(pixels, w, h, estilo, giro);
      // A máscara corta cada efeito (as linhas da máscara vêm de baixo para cima)
      if (mascara) {
        for (const feita of [...pronto.abaixo, ...pronto.acima]) {
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const m = mascara[((h - 1 - y) * w + x) * 4 + 3] / 255;
              const i = (y * w + x) * 4;
              for (let c = 0; c < 4; c++) feita.dados[i + c] = Math.round(feita.dados[i + c] * m);
            }
          }
        }
      }
      this.efeitosGuardados.set(chave, pronto);
      while (this.efeitosGuardados.size > 24) this.efeitosGuardados.delete(this.efeitosGuardados.keys().next().value!);
    }
    return pronto;
  }

  private calcularEfeitos(pixels: Uint8Array, w: number, h: number, estilo: NonNullable<Camada["estiloDeCamada"]>, giro: number) {
    // O alfa da camada, com as linhas de cima para baixo
    const alfa: Campo = { largura: w, altura: h, dados: new Float32Array(w * h) };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) alfa.dados[y * w + x] = pixels[((h - 1 - y) * w + x) * 4 + 3] / 255;
    const escala = (this.destino.largura / this.destino.quadro.largura) * estilo.escala;
    const ctx = contextoDoAlfa(alfa, escala, giro, estilo.luz);
    const retangulo = retanguloDoConteudo(alfa);
    type Feita = { dados: Uint8Array; opacidade: number; modo: Mesclagem; tipo: TipoDoEfeito };
    const feitas: Feita[] = [];
    for (const efeito of estilo.efeitos) {
      // A textura do chanfro: a luminância do padrão na escala dele
      let textura: Campo | null = null;
      if (efeito.tipo === "chanfro" && efeito.textura) {
        const pixels = pixelsDaTinta({ tipo: "padrao", padrao: efeito.textura.padrao as never, escala: efeito.textura.escala }, w, h, retangulo, escala, giro);
        textura = { largura: w, altura: h, dados: new Float32Array(w * h) };
        for (let i = 0; i < w * h; i++) textura.dados[i] = (0.2126 * pixels[i * 4] + 0.7152 * pixels[i * 4 + 1] + 0.0722 * pixels[i * 4 + 2]) / 255;
      }
      const campo = campoDoEfeito(efeito, ctx, { textura });
      const modo = efeito.modo;
      if (efeito.tipo === "chanfro") {
        if (campo.sombra) feitas.push({ tipo: "chanfro", dados: camadaDoEfeito(campo.sombra, { cor: efeito.cor_sombra ?? "#000000" }), opacidade: (efeito.opacidade_sombra ?? 0.75) * efeito.opacidade, modo: efeito.modo_sombra ?? "multiplicar" });
        if (campo.realce) feitas.push({ tipo: "chanfro", dados: camadaDoEfeito(campo.realce, { cor: efeito.cor_realce ?? "#ffffff" }), opacidade: (efeito.opacidade_realce ?? 0.75) * efeito.opacidade, modo: efeito.modo_realce ?? "tela" });
        continue;
      }
      let tinta: Parameters<typeof camadaDoEfeito>[1];
      if (efeito.tipo === "tracado" || efeito.tipo === "sobreposicao_degrade" || efeito.tipo === "sobreposicao_padrao") {
        tinta = { pixels: pixelsDaTinta(efeito.tinta ?? { tipo: "cor", cor: efeito.cor ?? "#000000" }, w, h, efeito.alinhar === false ? { x0: 0, y0: 0, x1: w, y1: h } : retangulo, escala, giro) };
      } else {
        const tabela = (efeito.tipo === "brilho_externo" || efeito.tipo === "brilho_interno") && efeito.tinta ? tabelaDaTinta(efeito.tinta) : null;
        tinta = tabela && campo.t ? { tabela, t: campo.t } : { cor: efeito.cor ?? "#000000" };
      }
      feitas.push({ tipo: efeito.tipo, dados: camadaDoEfeito(campo.cobertura, tinta), opacidade: efeito.opacidade, modo });
    }
    // A ordem dos editores de imagem: por baixo, a sombra e o brilho de fora; por cima, das sobreposições ao chanfro.
    // Dois do mesmo tipo: o primeiro da lista fica por cima
    const ordem: TipoDoEfeito[] = ["sombra", "brilho_externo", "sobreposicao_padrao", "sobreposicao_degrade", "sobreposicao_cor", "cetim", "brilho_interno", "sombra_interna", "tracado", "chanfro"];
    const ordenadas = feitas.map((feita, i) => ({ feita, i })).sort((a, b) => ordem.indexOf(a.feita.tipo) - ordem.indexOf(b.feita.tipo) || (a.feita.tipo === "chanfro" ? a.i - b.i : b.i - a.i)).map(({ feita }) => feita);
    return {
      abaixo: ordenadas.filter((feita) => feita.tipo === "sombra" || feita.tipo === "brilho_externo"),
      acima: ordenadas.filter((feita) => feita.tipo !== "sombra" && feita.tipo !== "brilho_externo"),
    };
  }

  destruir() {
    this.canvas.removeEventListener("webglcontextlost", this.aoPerder);
    this.canvas.removeEventListener("webglcontextrestored", this.aoRestaurar);
    const recursos = this.recursos;
    if (recursos && !this.gl.isContextLost()) {
      // As listas podem ter buracos (o brilho cria os framebuffers 2 e 3 sem o 0 e o 1)
      for (const textura of [...recursos.texturas, ...recursos.luts.map((lut) => lut?.textura), ...recursos.tabelas.map((tabela) => tabela?.textura), ...recursos.mascaras, ...recursos.mascarasDaCamada, recursos.grao]) if (textura) this.gl.deleteTexture(textura);
      for (const alvo of recursos.alvos) {
        if (!alvo) continue;
        this.gl.deleteTexture(alvo.textura);
        this.gl.deleteFramebuffer(alvo.buffer);
      }
      this.gl.deleteProgram(recursos.programa);
      this.gl.deleteProgram(recursos.desfoque.programa);
      this.gl.deleteProgram(recursos.silhueta.programa);
      this.gl.deleteProgram(recursos.recorte.programa);
    }
    this.recursos = null;
  }
}
