// Compositor da prévia em WebGL2: desenha as camadas de baixo para cima, cada uma com a caixa de
// lib/projeto/geometria.ts (posição, tamanho, giro), o recorte e a opacidade, sobre a cor de fundo.
//
// As cores são misturadas como o FFmpeg faz no `overlay` do render: alfa pré-multiplicado, sem
// conversão para luz linear. A mistura em luz linear (ideia do `render` do FilmCraft) entra junto
// com os modos de mesclagem, nos dois lados ao mesmo tempo.
import { type AjustesCor, deslocamentosDasRodas } from "../projeto/cor.ts";
import type { Caixa, Tamanho } from "../projeto/geometria.ts";
import { BRILHO_SIGMA, GRAO_LINHAS, GRAO_TEXTURA, LINHAS_POR_ALTURA, LUZ_COR, LUZ_LARGURA, valoresDoGrao } from "../projeto/efeitos.ts";
import type { Cortes } from "../projeto/letras.ts";
import type { Chroma, Mesclagem, Recorte } from "../projeto/modelo.ts";
import { REVELADO_INTEIRO, type Revelado } from "../projeto/transicao.ts";

export type Camada = {
  /** Um `<video>` com quadro carregado, um `VideoFrame` do WebCodecs ou uma imagem. */
  fonte: TexImageSource;
  recorte: Recorte;
  /** Ajustes de cor já com o filtro somado (lib/projeto/cor.ts); null quando não há. */
  cor?: AjustesCor | null;
  /** Em pixels do quadro passado para `desenhar`. */
  caixa: Caixa;
  /** A parte do clipe que aparece (cortinas); sem ela, o clipe inteiro. */
  revelado?: Revelado;
  /** As letras do texto que aparecem (lib/projeto/letras.ts); sem ela, todas. */
  mascara?: Cortes;
  /** Desfoque gaussiano: sigma em frações da altura do clipe (o render faz a mesma conta). */
  desfoque?: number;
  /** As curvas de cor numa tabela de 256 tons (lib/projeto/cor.ts, tabelaDasCurvas); null sem curvas. */
  curvas?: Uint8Array | null;
  /** Mistura com o que já foi desenhado; sem ela, normal. */
  mesclagem?: Mesclagem;
  /** Efeito brilho: quanto da cópia desfocada soma em "tela" (lib/projeto/efeitos.ts). */
  brilho?: number;
  /** Efeito olho de peixe: o k1 da lente. */
  lente?: number;
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
  /** Recorte do fundo: o quadro da máscara da pessoa (o alfa), no mesmo enquadramento do vídeo. */
  mascaraDoFundo?: TexImageSource | null;
};

// Os modos de mesclagem são funções de mistura do WebGL, com a opacidade já na cor (alfa
// pré-multiplicado): multiplicar = fundo × (cor·a + 1 − a); tela = cor·a + fundo × (1 − cor·a);
// somar = fundo + cor·a. É a conta do blend do render sobre uma camada achatada na cor neutra.
const CODIGO_DA_MESCLAGEM: Record<Mesclagem, number> = { normal: 0, multiplicar: 1, tela: 2, somar: 3 };

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
out vec4 cor;
void main() {
  vec4 texel = texture(u_fonte, v_pos);
  if (u_comMascara) texel *= texture(u_mascara, v_pos).r;
  if (u_comChroma && texel.a > 0.0) {
    float d = length(texel.rgb / texel.a - u_chromaCor) / sqrt(3.0);
    texel *= u_suavidade > 0.0001 ? clamp((d - u_semelhanca) / u_suavidade, 0.0, 1.0) : (d > u_semelhanca ? 1.0 : 0.0);
  }
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
out vec2 v_uv;
out vec2 v_local;

void main() {
  // a_pos vai de -0.5 a 0.5, com y para baixo, como na tela
  vec2 p = a_pos * u_tamanho;
  float c = cos(u_rotacao);
  float s = sin(u_rotacao);
  p = u_centro + vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  gl_Position = vec4(p.x / u_quadro.x * 2.0 - 1.0, 1.0 - p.y / u_quadro.y * 2.0, 0.0, 1.0);
  v_uv = u_recorte.xy + (a_pos + 0.5) * u_recorte.zw;
  // Posição dentro do clipe (0 a 1), para a vinheta
  v_local = a_pos + 0.5;
}`;

// A conta da cor é a de lib/projeto/cor.ts (aplicarCor e escurecimentoDaVinheta), linha a linha.
const FRAGMENTOS = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec2 v_local;
uniform sampler2D u_textura;
uniform float u_opacidade;
uniform bool u_comCor;
// temperatura, tom, exposicao, contraste
uniform vec4 u_cor1;
// realces, sombras, saturacao, vinheta
uniform vec4 u_cor2;
// Rodas de cor (escuros, meios-tons, claros): o deslocamento de cada uma, já com a força
uniform vec3 u_rodas[3];
// Curvas: o tom de cada canal (0 a 255) lido numa tabela de 256, depois dos ajustes e antes da vinheta
uniform bool u_comCurvas;
uniform sampler2D u_curvas;
// x0, y0, x1, y1 da parte que aparece, em frações do clipe (as cortinas)
uniform vec4 u_revelado;
// Letra a letra (lib/projeto/letras.ts): y0, y1 e x de onde o trecho começa e de onde ele termina
uniform vec3 u_corteDe;
uniform vec3 u_corteAte;
// 0 normal, 1 multiplicar (a cor sai já misturada ao branco pela opacidade), 2 tela, 3 somar
uniform int u_mesclagem;
// Brilho: a cópia desfocada (unidade 2) somada em "tela", na força u_brilho
uniform float u_brilho;
uniform sampler2D u_desfocada;
// Olho de peixe: o k1 da lente e o tamanho do clipe (só a proporção conta), como o lenscorrection
uniform float u_lente;
uniform vec2 u_tamanho;
uniform vec4 u_recorte;
// VHS e glitch: o vermelho e o azul lidos deslocados (como o rgbashift, com a borda repetida)
uniform float u_desvio;
// Recorte do fundo: o alfa vem da máscara da pessoa (unidade 4), como o alphamerge do render
uniform bool u_comMascaraDoFundo;
uniform sampler2D u_mascaraDoFundo;
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
out vec4 cor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float paraLinear(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float paraTela(float c) { c = clamp(c, 0.0, 1.0); return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }

vec3 aplicarCor(vec3 c) {
  float ganho = exp2(u_cor1.z);
  vec3 l = vec3(
    paraTela(paraLinear(c.r) * ganho * (1.0 + 0.15 * u_cor1.x)),
    paraTela(paraLinear(c.g) * ganho * (1.0 - 0.1 * u_cor1.y)),
    paraTela(paraLinear(c.b) * ganho * (1.0 - 0.15 * u_cor1.x))
  );
  l = clamp((l - 0.5) * (1.0 + u_cor1.w) + 0.5, 0.0, 1.0);
  float y = dot(l, LUMA);
  l = clamp(l + 0.25 * (u_cor2.x * y * y + u_cor2.y * (1.0 - y) * (1.0 - y)), 0.0, 1.0);
  float yr = dot(l, LUMA);
  l = clamp(l + (1.0 - yr) * (1.0 - yr) * u_rodas[0] + 2.0 * yr * (1.0 - yr) * u_rodas[1] + yr * yr * u_rodas[2], 0.0, 1.0);
  float y2 = dot(l, LUMA);
  return clamp(y2 + (l - y2) * (1.0 + u_cor2.z), 0.0, 1.0);
}

void main() {
  // Como o geq do render: o centro do pixel dentro da faixa revelada, com as bordas incluídas
  if (v_local.x < u_revelado.x || v_local.x > u_revelado.z || v_local.y < u_revelado.y || v_local.y > u_revelado.w) {
    discard;
  }
  // Como as caixas do render: pelo centro do pixel, antes do começo do trecho e a partir do fim
  if (v_local.y < u_corteDe.x || (v_local.y < u_corteDe.y && v_local.x < u_corteDe.z) ||
      v_local.y >= u_corteAte.y || (v_local.y >= u_corteAte.x && v_local.x >= u_corteAte.z)) {
    discard;
  }
  vec2 uv = v_uv;
  if (u_lente > 0.0) {
    // O zoom de (1 + k) no meio e depois a lente: o ponto da imagem que cai neste pixel
    vec2 s = 0.5 + (v_local - 0.5) / (1.0 + u_lente);
    vec2 desvio = (s - 0.5) * u_tamanho;
    float r2 = dot(desvio, desvio) / (dot(u_tamanho, u_tamanho) / 4.0);
    vec2 p = 0.5 + (s - 0.5) * (1.0 + u_lente * r2);
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
    uv = u_recorte.xy + p * u_recorte.zw;
  }
  vec4 texel = texture(u_textura, uv);
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
  if (u_comMascaraDoFundo) texel *= texture(u_mascaraDoFundo, uv).r;
  if (u_comChroma && texel.a > 0.0) {
    vec3 c = texel.rgb / texel.a;
    float d = length(c - u_chromaCor) / sqrt(3.0);
    float k = u_suavidade > 0.0001 ? clamp((d - u_semelhanca) / u_suavidade, 0.0, 1.0) : (d > u_semelhanca ? 1.0 : 0.0);
    // Multiplica o alfa que já havia (logo, recorte do fundo, borda suave), como o render
    texel = texel * k;
  }
  if (u_brilho > 0.0) {
    vec4 luz = texture(u_desfocada, uv) * u_brilho;
    texel = texel + luz - texel * luz;
  }
  if ((u_comCor || u_comCurvas || u_linhas > 0.0 || u_luz > 0.0 || u_grao > 0.0) && texel.a > 0.0) {
    // A textura vem com o alfa pré-multiplicado: a cor é ajustada sem ele e multiplicada de volta.
    // A ordem é a do render: a LUT (ajustes e curvas) e depois a vinheta
    vec3 c = texel.rgb / texel.a;
    if (u_comCor) c = aplicarCor(c);
    if (u_comCurvas) {
      vec3 i = (clamp(c, 0.0, 1.0) * 255.0 + 0.5) / 256.0;
      c = vec3(texture(u_curvas, vec2(i.r, 0.5)).r, texture(u_curvas, vec2(i.g, 0.5)).g, texture(u_curvas, vec2(i.b, 0.5)).b);
    }
    if (u_comCor) {
      float distancia = length((v_local - 0.5) * 2.0) / sqrt(2.0);
      c *= 1.0 - u_cor2.w * smoothstep(0.3, 1.0, distancia);
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
    texel = vec4(c * texel.a, texel.a);
  }
  cor = texel * u_opacidade;
  if (u_mesclagem == 1) cor = vec4(cor.rgb + (1.0 - cor.a), 1.0);
}`;

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

/** "#ff6a3d" → [1, 0.416, 0.239]. */
export function corParaRgb(hex: string): [number, number, number] {
  const valor = Number.parseInt(hex.slice(1, 7), 16);
  if (!/^#[0-9a-f]{6}$/i.test(hex) || Number.isNaN(valor)) return [0, 0, 0];
  return [((valor >> 16) & 255) / 255, ((valor >> 8) & 255) / 255, (valor & 255) / 255];
}

type Alvo = { buffer: WebGLFramebuffer; textura: WebGLTexture; largura: number; altura: number };

type Recursos = {
  programa: WebGLProgram;
  desfoque: { programa: WebGLProgram; uniformes: Record<"fonte" | "passo" | "sigma" | "lod" | "limite", WebGLUniformLocation | null> };
  recorte: {
    programa: WebGLProgram;
    uniformes: Record<"fonte" | "mascara" | "comMascara" | "comChroma" | "chromaCor" | "semelhanca" | "suavidade", WebGLUniformLocation | null>;
  };
  /** Os dois framebuffers das passadas do desfoque. */
  alvos: Alvo[];
  /** A tabela das curvas de cada camada (256 × 1), na unidade de textura 1. */
  tabelas: WebGLTexture[];
  /** A imagem fixa do grão, feita na primeira vez que um clipe usa granulação. */
  grao: WebGLTexture | null;
  /** O quadro da máscara do fundo de cada camada, na unidade 4. */
  mascaras: WebGLTexture[];
  uniformes: Record<
    "quadro" | "centro" | "tamanho" | "rotacao" | "recorte" | "opacidade" | "textura" | "comCor" | "cor1" | "cor2" | "rodas" | "revelado" | "corteDe" | "corteAte" | "comCurvas" | "curvas" | "mesclagem" | "brilho" | "desfocada" | "lente" | "desvio" | "linhas" | "luz" | "luzPosicao" | "grao" | "graoColunas" | "graoDeslocamento" | "graoTextura" | "comChroma" | "chromaCor" | "semelhanca" | "suavidade" | "comMascaraDoFundo" | "mascaraDoFundo",
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

  /** Lança erro quando o navegador não tem WebGL2. */
  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error("Este navegador não tem WebGL2, que a prévia usa para desenhar o vídeo.");
    this.canvas = canvas;
    this.gl = gl;
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
        quadro: local("u_quadro"),
        centro: local("u_centro"),
        tamanho: local("u_tamanho"),
        rotacao: local("u_rotacao"),
        recorte: local("u_recorte"),
        opacidade: local("u_opacidade"),
        comCor: local("u_comCor"),
        cor1: local("u_cor1"),
        cor2: local("u_cor2"),
        rodas: local("u_rodas"),
        revelado: local("u_revelado"),
        corteDe: local("u_corteDe"),
        comCurvas: local("u_comCurvas"),
        mesclagem: local("u_mesclagem"),
        brilho: local("u_brilho"),
        desfocada: local("u_desfocada"),
        lente: local("u_lente"),
        desvio: local("u_desvio"),
        linhas: local("u_linhas"),
        luz: local("u_luz"),
        luzPosicao: local("u_luzPosicao"),
        grao: local("u_grao"),
        graoColunas: local("u_graoColunas"),
        graoDeslocamento: local("u_graoDeslocamento"),
        graoTextura: local("u_graoTextura"),
        comChroma: local("u_comChroma"),
        comMascaraDoFundo: local("u_comMascaraDoFundo"),
        mascaraDoFundo: local("u_mascaraDoFundo"),
        chromaCor: local("u_chromaCor"),
        semelhanca: local("u_semelhanca"),
        suavidade: local("u_suavidade"),
        curvas: local("u_curvas"),
        corteAte: local("u_corteAte"),
        textura: local("u_textura"),
      },
      texturas: [],
      tabelas: [],
      grao: null,
      mascaras: [],
      desfoque,
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
  private alvo(indice: number, largura: number, altura: number): Alvo {
    const gl = this.gl;
    const recursos = this.recursos!;
    let alvo = recursos.alvos[indice];
    if (!alvo) {
      alvo = { buffer: gl.createFramebuffer()!, textura: gl.createTexture()!, largura: 0, altura: 0 };
      recursos.alvos[indice] = alvo;
    }
    if (alvo.largura !== largura || alvo.altura !== altura) {
      gl.bindTexture(gl.TEXTURE_2D, alvo.textura);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, largura, altura, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, alvo.buffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, alvo.textura, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      alvo.largura = largura;
      alvo.altura = altura;
    }
    return alvo;
  }

  /**
   * Desfoca a textura já carregada (largura × altura) e devolve a textura desfocada, do mesmo
   * enquadramento. sigma em pixels da textura; o recorte limita a área lida, como o crop do render.
   */
  private desfocar(textura: WebGLTexture, largura: number, altura: number, sigma: number, recorte: Recorte, primeiroAlvo = 0): WebGLTexture {
    const gl = this.gl;
    const { desfoque, programa } = this.recursos!;
    const nivel = Math.max(0, Math.floor(Math.log2(sigma / SIGMA_POR_NIVEL)));
    const fator = 2 ** nivel;
    const w = Math.max(1, Math.ceil(largura / fator));
    const h = Math.max(1, Math.ceil(altura / fator));
    const primeiro = this.alvo(primeiroAlvo, w, h);
    const segundo = this.alvo(primeiroAlvo + 1, w, h);
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
  desenhar(camadas: Camada[], fundo: string, quadro: Tamanho, resolucao: Tamanho) {
    const gl = this.gl;
    const recursos = this.recursos;
    if (!recursos || gl.isContextLost()) return;
    if (this.canvas.width !== resolucao.largura || this.canvas.height !== resolucao.altura) {
      this.canvas.width = resolucao.largura;
      this.canvas.height = resolucao.altura;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const [r, g, b] = corParaRgb(fundo);
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const { uniformes } = recursos;
    gl.uniform2f(uniformes.quadro, quadro.largura, quadro.altura);
    gl.uniform1i(uniformes.textura, 0);
    gl.activeTexture(gl.TEXTURE0);
    camadas.forEach((camada, indice) => {
      const { caixa, recorte } = camada;
      if (caixa.opacidade <= 0 || caixa.largura <= 0 || caixa.altura <= 0) return;
      gl.bindTexture(gl.TEXTURE_2D, this.textura(indice));
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, camada.fonte);
      const { largura, altura } = tamanhoDaFonte(camada.fonte);
      // Imagem ou texto bem maior que o lugar dele na tela: lido do mipmap, senão cada pixel da tela pega
      // um ponto só da textura e as bordas finas saem em escada (o render reduz com média)
      const reducao = (largura * recorte.largura) / Math.max(1, (caixa.largura * this.canvas.width) / quadro.largura);
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
          gl.viewport(0, 0, this.canvas.width, this.canvas.height);
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
      gl.uniform1f(uniformes.brilho, brilho > 0 && largura > 0 ? brilho : 0);
      // Com brilho, a camada é recortada antes (máscara e tela verde) e o shader não recorta de novo
      const recortadaAntes = brilho > 0 && largura > 0 && Boolean(camada.mascaraDoFundo || camada.chroma);
      if (recortadaAntes) {
        this.recortarCamada(gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture, camada, largura, altura);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        if (reducao > REDUCAO_COM_MIPMAP) {
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        } else {
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        }
      }
      if (brilho > 0 && largura > 0) {
        // A cópia desfocada do brilho, nos framebuffers 2 e 3, na unidade 2
        const atual = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture;
        const luz = this.desfocar(atual, largura, altura, SIGMA_DO_BRILHO * recorte.altura * altura, recorte, 2);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, luz);
        gl.uniform1i(uniformes.desfocada, 2);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, atual);
      }
      gl.uniform1f(uniformes.lente, camada.lente ?? 0);
      gl.uniform1f(uniformes.desvio, camada.desvio ?? 0);
      gl.uniform1f(uniformes.linhas, camada.linhas ?? 0);
      gl.uniform1i(uniformes.comMascaraDoFundo, camada.mascaraDoFundo && !recortadaAntes ? 1 : 0);
      gl.uniform1i(uniformes.comChroma, camada.chroma && !recortadaAntes ? 1 : 0);
      if (camada.chroma) {
        gl.uniform3f(uniformes.chromaCor, ...corParaRgb(camada.chroma.cor));
        gl.uniform1f(uniformes.semelhanca, camada.chroma.semelhanca);
        gl.uniform1f(uniformes.suavidade, camada.chroma.suavidade);
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
      gl.uniform1f(uniformes.opacidade, caixa.opacidade);
      const revelado = camada.revelado ?? REVELADO_INTEIRO;
      gl.uniform4f(uniformes.revelado, revelado.x0, revelado.y0, revelado.x1, revelado.y1);
      const mascara = camada.mascara ?? SEM_MASCARA;
      gl.uniform3f(uniformes.corteDe, ...mascara.de);
      gl.uniform3f(uniformes.corteAte, ...mascara.ate);
      gl.uniform1i(uniformes.comCurvas, camada.curvas ? 1 : 0);
      if (camada.curvas) {
        let tabela = recursos.tabelas[indice];
        if (!tabela) {
          tabela = gl.createTexture()!;
          recursos.tabelas[indice] = tabela;
        }
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, tabela);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, camada.curvas);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(uniformes.curvas, 1);
        gl.activeTexture(gl.TEXTURE0);
      }
      const ajustes = camada.cor;
      gl.uniform1i(uniformes.comCor, ajustes ? 1 : 0);
      if (ajustes) {
        gl.uniform4f(uniformes.cor1, ajustes.temperatura, ajustes.tom, ajustes.exposicao, ajustes.contraste);
        gl.uniform4f(uniformes.cor2, ajustes.realces, ajustes.sombras, ajustes.saturacao, ajustes.vinheta);
        gl.uniform3fv(uniformes.rodas, deslocamentosDasRodas(ajustes).flat());
      }
      const mesclagem = camada.mesclagem ?? "normal";
      gl.uniform1i(uniformes.mesclagem, CODIGO_DA_MESCLAGEM[mesclagem]);
      if (mesclagem === "multiplicar") gl.blendFunc(gl.DST_COLOR, gl.ZERO);
      else if (mesclagem === "tela") gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
      else if (mesclagem === "somar") gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (mesclagem !== "normal") gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    });
  }

  destruir() {
    this.canvas.removeEventListener("webglcontextlost", this.aoPerder);
    this.canvas.removeEventListener("webglcontextrestored", this.aoRestaurar);
    const recursos = this.recursos;
    if (recursos && !this.gl.isContextLost()) {
      // As listas podem ter buracos (o brilho cria os framebuffers 2 e 3 sem o 0 e o 1)
      for (const textura of [...recursos.texturas, ...recursos.tabelas, ...recursos.mascaras, recursos.grao]) if (textura) this.gl.deleteTexture(textura);
      for (const alvo of recursos.alvos) {
        if (!alvo) continue;
        this.gl.deleteTexture(alvo.textura);
        this.gl.deleteFramebuffer(alvo.buffer);
      }
      this.gl.deleteProgram(recursos.programa);
      this.gl.deleteProgram(recursos.desfoque.programa);
      this.gl.deleteProgram(recursos.recorte.programa);
    }
    this.recursos = null;
  }
}
