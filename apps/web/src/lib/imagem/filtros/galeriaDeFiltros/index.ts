// A Galeria de filtros (ADR 0003, onda 13.11): os 47 efeitos e a pilha de efeitos dela, que vira um filtro só (o
// `galeria_filtros`) com a pilha guardada como texto curto: "efeito:v1,v2,…" por camada de efeito, separadas por
// ";", na ordem em que são aplicadas (a de baixo primeiro); ":0" no fim é uma camada desligada. Os valores vão na
// ordem das opções do efeito: números, o id das escolhas, 1 e 0 nas marcações e a cor sem o "#".
import type { Valores } from "../catalogo.ts";
import type { ContextoDoFiltro, ImagemDoFiltro } from "../comum.ts";
import { ARTISTICOS } from "./artisticos.ts";
import { ESBOCO } from "./esboco.ts";
import { PINCEIS } from "./pinceis.ts";
import { CATEGORIAS_DA_GALERIA, type EfeitoDaGaleria } from "./tipos.ts";

export { CATEGORIAS_DA_GALERIA, type EfeitoDaGaleria };

export const EFEITOS_DA_GALERIA: EfeitoDaGaleria[] = [...ARTISTICOS, ...PINCEIS, ...ESBOCO];
export const EFEITO_DA_GALERIA = new Map(EFEITOS_DA_GALERIA.map((efeito) => [efeito.id, efeito]));

export type CamadaDeEfeito = { efeito: string; opcoes: Valores; ligado: boolean };

/** As opções completas de um efeito: as que vieram, presas aos limites, e o padrão nas que faltam. */
export function valoresDoEfeito(efeito: EfeitoDaGaleria, v: Valores = {}): Valores {
  const saida: Valores = {};
  for (const opcao of efeito.opcoes) {
    const dado = v[opcao.id];
    if (opcao.tipo === "numero") saida[opcao.id] = typeof dado === "number" && Number.isFinite(dado) ? Math.min(opcao.maximo, Math.max(opcao.minimo, dado)) : opcao.padrao;
    else if (opcao.tipo === "marcar") saida[opcao.id] = typeof dado === "boolean" ? dado : opcao.padrao;
    else if (opcao.tipo === "escolha") saida[opcao.id] = typeof dado === "string" && opcao.opcoes.some((item) => item.id === dado) ? dado : opcao.padrao;
    else if (opcao.tipo === "cor") saida[opcao.id] = typeof dado === "string" && /^#[0-9a-f]{6}$/i.test(dado) ? dado : opcao.padrao;
  }
  return saida;
}

export function textoDaPilha(pilha: CamadaDeEfeito[]): string {
  return pilha
    .flatMap((camada) => {
      const efeito = EFEITO_DA_GALERIA.get(camada.efeito);
      if (!efeito) return [];
      const v = valoresDoEfeito(efeito, camada.opcoes);
      const valores = efeito.opcoes.map((opcao) => {
        const dado = v[opcao.id];
        if (opcao.tipo === "marcar") return dado ? "1" : "0";
        if (opcao.tipo === "cor") return String(dado).slice(1);
        if (opcao.tipo === "numero") return String(Math.round(Number(dado) * 10) / 10);
        return String(dado);
      });
      return [`${efeito.id}:${valores.join(",")}${camada.ligado ? "" : ":0"}`];
    })
    .join(";");
}

export function pilhaDoTexto(texto: string): CamadaDeEfeito[] {
  return String(texto ?? "")
    .split(";")
    .filter(Boolean)
    .flatMap((parte) => {
      const [id, lista = "", ligado] = parte.split(":");
      const efeito = EFEITO_DA_GALERIA.get(id);
      if (!efeito) return [];
      const valores = lista.split(",");
      const opcoes: Valores = {};
      efeito.opcoes.forEach((opcao, i) => {
        const dado = valores[i];
        if (dado === undefined || dado === "") return;
        if (opcao.tipo === "numero") opcoes[opcao.id] = Number(dado);
        else if (opcao.tipo === "marcar") opcoes[opcao.id] = dado === "1";
        else if (opcao.tipo === "cor") opcoes[opcao.id] = `#${dado}`;
        else opcoes[opcao.id] = dado;
      });
      return [{ efeito: id, opcoes: valoresDoEfeito(efeito, opcoes), ligado: ligado !== "0" }];
    });
}

/** A pilha inteira, da camada de baixo para a de cima (só as ligadas). */
export function aplicarGaleriaDeFiltros(imagem: ImagemDoFiltro, pilha: CamadaDeEfeito[], ctx: ContextoDoFiltro): ImagemDoFiltro {
  let atual = imagem;
  for (const camada of pilha) {
    const efeito = EFEITO_DA_GALERIA.get(camada.efeito);
    if (efeito && camada.ligado) atual = efeito.aplicar(atual, valoresDoEfeito(efeito, camada.opcoes), ctx);
  }
  return atual;
}

/** Quanto os efeitos que deslocam podem passar da camada (pixels do documento). */
export function margemDaGaleriaDeFiltros(pilha: CamadaDeEfeito[]): number {
  let margem = 0;
  for (const camada of pilha) {
    if (!camada.ligado) continue;
    const o = camada.opcoes;
    if (camada.efeito === "salpicos") margem += Number(o.raio ?? 0);
    else if (camada.efeito === "tracos_borrifados") margem += Number(o.raio ?? 0) + Number(o.comprimento ?? 0);
    else if (camada.efeito === "vidro") margem += Number(o.distorcao ?? 0) * 2;
    else if (camada.efeito === "ondulacao_oceanica") margem += Number(o.magnitude ?? 0);
  }
  return margem;
}
