// Kit de marca no projeto: onde o logo fica e como a fonte e a cor da marca vão para os textos. Funções puras.
import type { Tamanho } from "./geometria.ts";
import type { Transformacao } from "./modelo.ts";
import type { FonteTexto } from "./texto.ts";

export type Marca = { cores: string[]; fonte_titulo: FonteTexto; fonte_texto: FonteTexto; logo_midia_id: string | null };

export const MARCA_VAZIA: Marca = { cores: [], fonte_titulo: "display", fonte_texto: "texto", logo_midia_id: null };
export const CORES_DA_MARCA_MAXIMO = 6;

export type Canto = "superior-esquerdo" | "superior-direito" | "inferior-esquerdo" | "inferior-direito";

/** O lado maior do logo, em fração do lado menor do quadro. */
export const TAMANHO_DO_LOGO = 0.18;
/** A distância do logo até a borda, em fração do lado menor do quadro. */
export const MARGEM_DO_LOGO = 0.04;

/** A transformação que põe o logo (imagem do tamanho dado) no canto, do tamanho da marca d'água. */
export function transformacaoDoLogo(imagem: Tamanho, quadro: Tamanho, canto: Canto): Transformacao {
  const menor = Math.min(quadro.largura, quadro.altura);
  const encaixe = Math.min(quadro.largura / imagem.largura, quadro.altura / imagem.altura);
  const escala = (TAMANHO_DO_LOGO * menor) / (Math.max(imagem.largura, imagem.altura) * encaixe);
  const largura = imagem.largura * encaixe * escala;
  const altura = imagem.altura * encaixe * escala;
  const margem = MARGEM_DO_LOGO * menor;
  const x = (quadro.largura / 2 - margem - largura / 2) / quadro.largura;
  const y = (quadro.altura / 2 - margem - altura / 2) / quadro.altura;
  return {
    x: canto.endsWith("esquerdo") ? -x : x,
    y: canto.startsWith("superior") ? -y : y,
    escala,
    rotacao: 0,
    opacidade: 0.9,
  };
}
