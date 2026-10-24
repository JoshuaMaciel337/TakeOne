// Arquivo › Gerar › Ativos de imagem (ADR 0003, onda 13.13): a camada ou o grupo cujo nome termina numa extensão de
// imagem vira um arquivo, como no gerador de ativos dos editores de imagem. O nome pode ter vários pedidos separados
// por vírgula, cada um com o tamanho antes ("200% logo@2x.png", "300x200 capa.jpg", "64x? icone.png"), a qualidade
// colada na extensão ("foto.jpg80", "foto.jpg8", "foto.webp60") e pastas ("icones/menu.png"). O que não termina numa
// extensão é só o nome da camada.
import type { FormatoDeExportacao } from "./exportarComo.ts";

export type PedidoDeAtivo = {
  /** O caminho no ZIP, com a extensão do arquivo. */
  arquivo: string;
  formato: FormatoDeExportacao;
  /** 0 a 1, quando o nome pede. */
  qualidade: number | null;
  /** O tamanho: uma escala, ou a largura e a altura (null deixa na proporção). */
  tamanho: { escala: number } | { largura: number | null; altura: number | null } | null;
};

const EXTENSOES: Record<string, { formato: FormatoDeExportacao; extensao: string }> = {
  png: { formato: "png", extensao: "png" },
  png32: { formato: "png", extensao: "png" },
  png24: { formato: "png", extensao: "png" },
  png8: { formato: "png8", extensao: "png" },
  jpg: { formato: "jpeg", extensao: "jpg" },
  jpeg: { formato: "jpeg", extensao: "jpg" },
  gif: { formato: "gif", extensao: "gif" },
  webp: { formato: "webp", extensao: "webp" },
  avif: { formato: "avif", extensao: "avif" },
};

/** O pedido de um trecho do nome, ou null quando ele não é um ativo. */
function pedidoDoTrecho(trecho: string): PedidoDeAtivo | null {
  let resto = trecho.trim();
  let tamanho: PedidoDeAtivo["tamanho"] = null;
  // O tamanho vem antes do nome do arquivo, separado por espaço
  const porcentagem = /^(\d+(?:[.,]\d+)?)%\s+(.+)$/.exec(resto);
  const medidas = /^(\d+|\?)(?:px)?\s*x\s*(\d+|\?)(?:px)?\s+(.+)$/i.exec(resto);
  if (porcentagem) {
    tamanho = { escala: Number(porcentagem[1].replace(",", ".")) / 100 };
    resto = porcentagem[2];
  } else if (medidas) {
    const largura = medidas[1] === "?" ? null : Number(medidas[1]);
    const altura = medidas[2] === "?" ? null : Number(medidas[2]);
    if (largura === null && altura === null) return null;
    tamanho = { largura, altura };
    resto = medidas[3];
  }
  const fim = /^(.*\S)\.([a-z]+?)(\d{0,3})$/i.exec(resto.trim());
  if (!fim) return null;
  const [, base, extensao, numero] = fim;
  const tipo = EXTENSOES[`${extensao}${numero}`.toLowerCase()] ?? EXTENSOES[extensao.toLowerCase()];
  if (!tipo) return null;
  // png8 e png24 são o tipo, não a qualidade; nas outras, os números são a qualidade (8 = 80%, 80 = 80%)
  const ehTipo = Boolean(EXTENSOES[`${extensao}${numero}`.toLowerCase()]);
  let qualidade: number | null = null;
  if (numero && !ehTipo) {
    const n = Number(numero);
    qualidade = Math.min(1, Math.max(0.01, n <= 10 ? n / 10 : n / 100));
  }
  if (tamanho && "escala" in tamanho && !(tamanho.escala > 0)) return null;
  // As pastas ficam; ".." e as barras do começo não
  const caminho = base
    .split(/[\\/]+/)
    .map((parte) => parte.replace(/[:*?"<>|]+/g, "-").trim())
    .filter((parte) => parte && parte !== "." && parte !== "..")
    .join("/");
  if (!caminho) return null;
  return { arquivo: `${caminho}.${tipo.extensao}`, formato: tipo.formato, qualidade, tamanho };
}

/** Os ativos que o nome da camada pede (nenhum, quando ele é só um nome). */
export function pedidosDoNome(nome: string): PedidoDeAtivo[] {
  return nome.split(",").flatMap((trecho) => {
    const pedido = pedidoDoTrecho(trecho);
    return pedido ? [pedido] : [];
  });
}

/** A escala da exportação e o tamanho final do arquivo para um conteúdo de largura × altura (na escala 1). */
export function tamanhoDoAtivo(pedido: PedidoDeAtivo, largura: number, altura: number): { escala: number; largura: number; altura: number } {
  const t = pedido.tamanho;
  if (!t) return { escala: 1, largura, altura };
  if ("escala" in t) return { escala: t.escala, largura: Math.max(1, Math.round(largura * t.escala)), altura: Math.max(1, Math.round(altura * t.escala)) };
  const l = t.largura ?? Math.round((largura * t.altura!) / Math.max(1, altura));
  const a = t.altura ?? Math.round((altura * t.largura!) / Math.max(1, largura));
  return { escala: Math.max(l / Math.max(1, largura), a / Math.max(1, altura)), largura: Math.max(1, l), altura: Math.max(1, a) };
}
