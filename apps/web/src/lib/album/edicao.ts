// A edição das fotos do álbum (onda 16.5): o que cada foto guarda (a cor da aba Cor, o igualar, o giro e o recorte),
// as contas puras para montar a edição de um lote e qual arquivo mostrar. O desenho é do worker
// (core/utils/edicao_de_foto.py): a grade e a lupa mostram a capa e a cópia leve que ele grava.
import type { Cor } from "../projeto/cor.ts";
import type { Estatisticas } from "../projeto/igualarCor.ts";

export type RecorteDaFoto = { x: number; y: number; largura: number; altura: number };
export type Proporcao = "1:1" | "4:5" | "5:4" | "2:3" | "3:2" | "9:16" | "16:9";

export type EdicaoDaFoto = {
  cor?: Partial<Cor> | null;
  igualar?: { alvo: Estatisticas; referencia: Estatisticas } | null;
  /** Graus no sentido horário, de -45 a 45. */
  giro?: number;
  /** Em frações da foto já girada. */
  recorte?: RecorteDaFoto | null;
  /** Endireitar e recortar sozinho, quando o worker desenhar. */
  auto?: { endireitar?: boolean; proporcao?: Proporcao | null } | null;
};

/** Como o servidor guarda: a versão (sobe a cada mudança), a última desenhada e o tamanho da cópia leve editada. */
export type EdicaoGuardada = EdicaoDaFoto & { versao: number; gerada: number | null; largura?: number; altura?: number };

export const PROPORCOES: { id: Proporcao; nome: string }[] = [
  { id: "1:1", nome: "Quadrado (1:1)" },
  { id: "4:5", nome: "Retrato (4:5)" },
  { id: "2:3", nome: "Retrato (2:3)" },
  { id: "9:16", nome: "Story (9:16)" },
  { id: "5:4", nome: "Paisagem (5:4)" },
  { id: "3:2", nome: "Paisagem (3:2)" },
  { id: "16:9", nome: "Paisagem (16:9)" },
];

/** A edição sem o que é do servidor (versão, gerada, tamanho), para mandar de volta. */
export function edicaoParaEnviar(edicao: EdicaoGuardada | EdicaoDaFoto | null | undefined): EdicaoDaFoto {
  if (!edicao) return {};
  const saida: EdicaoDaFoto = {};
  if (edicao.cor) saida.cor = edicao.cor;
  if (edicao.igualar) saida.igualar = edicao.igualar;
  if (edicao.giro) saida.giro = edicao.giro;
  if (edicao.recorte) saida.recorte = edicao.recorte;
  if (edicao.auto) saida.auto = edicao.auto;
  return saida;
}

/** A edição com os campos de cor trocados (o resto da cor e da edição fica). */
export function comCor(edicao: EdicaoGuardada | EdicaoDaFoto | null | undefined, campos: Partial<Cor>): EdicaoDaFoto {
  const base = edicaoParaEnviar(edicao);
  return { ...base, cor: { ...(base.cor ?? {}), ...campos } };
}

/** A edição sem nada que mude a foto vira null (o servidor também trata assim). */
export function semNada(edicao: EdicaoDaFoto): boolean {
  const cor = edicao.cor ?? {};
  const corNeutra = Object.entries(cor).every(([chave, valor]) => (chave === "intensidade" ? true : !valor));
  return corNeutra && !edicao.igualar && !edicao.giro && !edicao.recorte && !edicao.auto;
}

type FotoComEdicao = { midia_id: string; largura: number | null; altura: number | null; edicao?: EdicaoGuardada | null };

/** A capa ou a cópia leve que a grade e a lupa mostram: a editada (a última desenhada) ou a original. */
export function arquivoDaFoto(foto: FotoComEdicao, albumId: string, tipo: "capa" | "proxy"): string {
  const gerada = foto.edicao?.gerada;
  if (gerada) return `album_${albumId}_${gerada}_${tipo === "capa" ? "capa.jpg" : "proxy.webp"}`;
  return tipo === "capa" ? "capa.jpg" : "proxy.webp";
}

/** A foto tem uma edição que ainda não foi desenhada (a grade mostra que está editando). */
export function editandoAgora(foto: FotoComEdicao): boolean {
  return Boolean(foto.edicao && foto.edicao.versao !== foto.edicao.gerada);
}

/**
 * O tamanho em que a foto aparece: o da original, ou, editada com recorte ou giro, o da cópia leve editada levado à
 * resolução da original (a cópia leve tem no máximo 1920 de lado).
 */
export function tamanhoExibido(foto: FotoComEdicao): [number, number] {
  const largura = foto.largura ?? 1;
  const altura = foto.altura ?? 1;
  const e = foto.edicao;
  if (!e?.gerada || !e.largura || !e.altura) return [largura, altura];
  const escala = Math.max(largura, altura) / Math.min(Math.max(largura, altura), 1920);
  return [Math.round(e.largura * escala), Math.round(e.altura * escala)];
}

/** A edição muda o enquadramento (os rostos medidos na original não caem no mesmo lugar). */
export function mudaOEnquadramento(foto: FotoComEdicao): boolean {
  return Boolean(foto.edicao?.gerada && (foto.edicao.giro || foto.edicao.recorte));
}
