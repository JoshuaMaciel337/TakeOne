// Compositor da prévia em WebGL2: desenha as camadas de baixo para cima, cada uma com a caixa de
// lib/projeto/geometria.ts (posição, tamanho, giro), o recorte e a opacidade, sobre a cor de fundo.
//
// As cores são misturadas como o FFmpeg faz no `overlay` do render: alfa pré-multiplicado, sem
// conversão para luz linear. A mistura em luz linear (ideia do `render` do FilmCraft) entra junto
// com os modos de mesclagem, nos dois lados ao mesmo tempo.
import { type AjustesCor, deslocamentosDasRodas } from "../projeto/cor.ts";
import type { Caixa, Tamanho } from "../projeto/geometria.ts";
import type { Cortes } from "../projeto/letras.ts";
import type { Recorte } from "../projeto/modelo.ts";
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
};

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
// x0, y0, x1, y1 da parte que aparece, em frações do clipe (as cortinas)
uniform vec4 u_revelado;
// Letra a letra (lib/projeto/letras.ts): y0, y1 e x de onde o trecho começa e de onde ele termina
uniform vec3 u_corteDe;
uniform vec3 u_corteAte;
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
    cor = vec4(0.0);
    return;
  }
  // Como as caixas do render: pelo centro do pixel, antes do começo do trecho e a partir do fim
  if (v_local.y < u_corteDe.x || (v_local.y < u_corteDe.y && v_local.x < u_corteDe.z) ||
      v_local.y >= u_corteAte.y || (v_local.y >= u_corteAte.x && v_local.x >= u_corteAte.z)) {
    cor = vec4(0.0);
    return;
  }
  vec4 texel = texture(u_textura, v_uv);
  if (u_comCor && texel.a > 0.0) {
    // A textura vem com o alfa pré-multiplicado: a cor é ajustada sem ele e multiplicada de volta
    vec3 c = aplicarCor(texel.rgb / texel.a);
    float distancia = length((v_local - 0.5) * 2.0) / sqrt(2.0);
    c *= 1.0 - u_cor2.w * smoothstep(0.3, 1.0, distancia);
    texel = vec4(c * texel.a, texel.a);
  }
  cor = texel * u_opacidade;
}`;

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

type Recursos = {
  programa: WebGLProgram;
  uniformes: Record<
    "quadro" | "centro" | "tamanho" | "rotacao" | "recorte" | "opacidade" | "textura" | "comCor" | "cor1" | "cor2" | "rodas" | "revelado" | "corteDe" | "corteAte",
    WebGLUniformLocation | null
  >;
  texturas: WebGLTexture[];
};

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
    gl.linkProgram(programa);
    if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) throw new Error(`Programa da prévia: ${gl.getProgramInfoLog(programa)}`);
    gl.useProgram(programa);

    const vertices = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    const posicao = gl.getAttribLocation(programa, "a_pos");
    gl.enableVertexAttribArray(posicao);
    gl.vertexAttribPointer(posicao, 2, gl.FLOAT, false, 0, 0);

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
        corteAte: local("u_corteAte"),
        textura: local("u_textura"),
      },
      texturas: [],
    };
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
      const ajustes = camada.cor;
      gl.uniform1i(uniformes.comCor, ajustes ? 1 : 0);
      if (ajustes) {
        gl.uniform4f(uniformes.cor1, ajustes.temperatura, ajustes.tom, ajustes.exposicao, ajustes.contraste);
        gl.uniform4f(uniformes.cor2, ajustes.realces, ajustes.sombras, ajustes.saturacao, ajustes.vinheta);
        gl.uniform3fv(uniformes.rodas, deslocamentosDasRodas(ajustes).flat());
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
  }

  destruir() {
    this.canvas.removeEventListener("webglcontextlost", this.aoPerder);
    this.canvas.removeEventListener("webglcontextrestored", this.aoRestaurar);
    const recursos = this.recursos;
    if (recursos && !this.gl.isContextLost()) {
      for (const textura of recursos.texturas) this.gl.deleteTexture(textura);
      this.gl.deleteProgram(recursos.programa);
    }
    this.recursos = null;
  }
}
