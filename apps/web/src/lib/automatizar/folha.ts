// Arquivo › Automatizar › Folha de contato (ADR 0003, onda 13.13): as imagens numa grade, em páginas do tamanho
// escolhido, cada uma cabendo na célula dela (girada quando cabe melhor deitada, se pedido), com o nome embaixo.

export type OpcoesDaFolha = {
  largura: number;
  altura: number;
  colunas: number;
  linhas: number;
  /** A margem da página e o espaço entre as células, em pixels. */
  margem: number;
  espaco: number;
  /** A altura da faixa do nome embaixo de cada imagem (0: sem nome). */
  legenda: number;
  girar: boolean;
};

export const OPCOES_PADRAO_DA_FOLHA: OpcoesDaFolha = { largura: 2480, altura: 3508, colunas: 4, linhas: 5, margem: 120, espaco: 40, legenda: 48, girar: false };

export type Retangulo = { x: number; y: number; largura: number; altura: number };
export type Celula = { imagem: Retangulo; legenda: Retangulo | null };

/** As células de uma página, da esquerda de cima para a direita de baixo. */
export function celulasDaFolha(o: OpcoesDaFolha): Celula[] {
  const largura = (o.largura - 2 * o.margem - (o.colunas - 1) * o.espaco) / o.colunas;
  const altura = (o.altura - 2 * o.margem - (o.linhas - 1) * o.espaco) / o.linhas;
  if (largura <= 0 || altura <= o.legenda) throw new Error("As células não cabem na página: diminua a margem, o espaço, as colunas ou as linhas.");
  const celulas: Celula[] = [];
  for (let linha = 0; linha < o.linhas; linha++)
    for (let coluna = 0; coluna < o.colunas; coluna++) {
      const x = o.margem + coluna * (largura + o.espaco);
      const y = o.margem + linha * (altura + o.espaco);
      celulas.push({
        imagem: { x, y, largura, altura: altura - o.legenda },
        legenda: o.legenda > 0 ? { x, y: y + altura - o.legenda, largura, altura: o.legenda } : null,
      });
    }
  return celulas;
}

/** Onde a imagem fica dentro do retângulo, cabendo e no meio; `girada` quando ela cabe maior deitada de lado. */
export function encaixar(imagem: { largura: number; altura: number }, ret: Retangulo, girar: boolean): Retangulo & { girada: boolean } {
  const caber = (l: number, a: number) => Math.min(ret.largura / l, ret.altura / a);
  const girada = girar && caber(imagem.altura, imagem.largura) > caber(imagem.largura, imagem.altura) * 1.0001;
  const [l, a] = girada ? [imagem.altura, imagem.largura] : [imagem.largura, imagem.altura];
  const escala = caber(l, a);
  const largura = l * escala;
  const altura = a * escala;
  return { x: ret.x + (ret.largura - largura) / 2, y: ret.y + (ret.altura - altura) / 2, largura, altura, girada };
}

/** Quantas páginas cabem as imagens. */
export const paginasDaFolha = (quantas: number, o: OpcoesDaFolha) => Math.max(1, Math.ceil(quantas / (o.colunas * o.linhas)));
