// As cópias que um clipe ganha na hora de desenhar, iguais na prévia e no render (core/utils/fundo_desfocado.py):
//  - fundo desfocado: o clipe vira a cópia desfocada (sem a máscara) e uma faixa logo acima recebe a cópia recortada
//    pela máscara da pessoa (o recorte do fundo), sem som;
//  - esconder os rostos: uma faixa acima recebe uma cópia pixelizada ou desfocada, recortada pela máscara dos rostos.
// O clipe guarda só a intenção (`fundo_desfocado`, `esconder_rostos`); duplicar o clipe de verdade deixaria as cópias
// se desalinharem a cada corte.
import type { Clipe, Faixa, Projeto } from "./modelo.ts";

/** O sufixo do id da cópia recortada e da faixa dela (não aparecem na linha do tempo). */
export const SUFIXO_DO_RECORTE = "~recorte";
export const SUFIXO_DOS_ROSTOS = "~rostos";
export const SUFIXO_DOS_OBJETOS = "~objeto";

/** Um objeto escondido: o rastreio dele (a máscara é objeto_<rastreio>.mp4), o jeito e a força. */
export type ObjetoEscondido = { rastreio: string; modo: "pixelizar" | "desfocar"; forca: number };

export function objetosEscondidos(clipe: Pick<Clipe, "esconder_objetos" | "texto" | "ajuste">): ObjetoEscondido[] {
  if (clipe.texto || clipe.ajuste) return [];
  return (clipe.esconder_objetos ?? []).filter((objeto) => objeto.forca > 0);
}

/** As cópias desenhadas têm "~" no id: a prévia não deixa selecioná-las. */
export function ehCopiaDesenhada(id: string): boolean {
  return id.includes("~");
}

export function temFundoDesfocado(clipe: Pick<Clipe, "fundo_desfocado" | "texto" | "ajuste">): boolean {
  return Boolean(clipe.fundo_desfocado && clipe.fundo_desfocado > 0 && !clipe.texto && !clipe.ajuste);
}

export function temRostosEscondidos(clipe: Pick<Clipe, "esconder_rostos" | "texto" | "ajuste">): boolean {
  return Boolean(clipe.esconder_rostos && clipe.esconder_rostos.forca > 0 && !clipe.texto && !clipe.ajuste);
}

/** O vídeo da máscara que recorta o clipe: o da pessoa ou o dos rostos. */
export function arquivoDaMascara(clipe: Pick<Clipe, "mascara_do_recorte">): string {
  const qual = clipe.mascara_do_recorte ?? "";
  if (qual === "rostos") return "rostos_mascara.mp4";
  if (qual.startsWith("objeto:")) return `objeto_${qual.slice("objeto:".length)}.mp4`;
  return "mascara.mp4";
}

/** O projeto como é desenhado, com as cópias de cada clipe nas faixas logo acima da dele. */
export function expandirParaDesenhar(projeto: Projeto): Projeto {
  if (!projeto.faixas.some((faixa) => faixa.clipes.some((clipe) => temFundoDesfocado(clipe) || temRostosEscondidos(clipe) || objetosEscondidos(clipe).length))) return projeto;
  const faixas: Faixa[] = [];
  for (const faixa of projeto.faixas) {
    const comFundo = faixa.clipes.filter(temFundoDesfocado);
    const comRostos = faixa.clipes.filter(temRostosEscondidos);
    const comObjetos = faixa.clipes.filter((clipe) => objetosEscondidos(clipe).length);
    if (!comFundo.length && !comRostos.length && !comObjetos.length) {
      faixas.push(faixa);
      continue;
    }
    const tipo = faixa.tipo === "principal" ? "video" : faixa.tipo;
    const copia = (clipe: Clipe, sufixo: string): Clipe => ({
      ...clipe,
      id: `${clipe.id}${sufixo}`,
      fundo_desfocado: null,
      esconder_rostos: null,
      esconder_objetos: null,
      som_separado: true,
      transicao: null,
      contorno: null,
      sombra: null,
    });
    // A lista vai de cima para baixo: os objetos e os rostos por cima, depois a pessoa recortada e a original
    const maisObjetos = Math.max(0, ...comObjetos.map((clipe) => objetosEscondidos(clipe).length));
    for (let ordem = 0; ordem < maisObjetos; ordem++) {
      faixas.push({
        ...faixa,
        id: `${faixa.id}${SUFIXO_DOS_OBJETOS}${ordem}`,
        tipo,
        clipes: comObjetos
          .filter((clipe) => objetosEscondidos(clipe).length > ordem)
          .map((clipe) => {
            const objeto = objetosEscondidos(clipe)[ordem];
            return {
              ...copia(clipe, `${SUFIXO_DOS_OBJETOS}${ordem}`),
              remover_fundo: true,
              mascara_do_recorte: `objeto:${objeto.rastreio}`,
              efeito: { tipo: objeto.modo === "desfocar" ? "desfoque" : "pixelizar", intensidade: objeto.forca },
            };
          }),
      });
    }
    if (comRostos.length) {
      faixas.push({
        ...faixa,
        id: `${faixa.id}${SUFIXO_DOS_ROSTOS}`,
        tipo,
        clipes: comRostos.map((clipe) => ({
          ...copia(clipe, SUFIXO_DOS_ROSTOS),
          remover_fundo: true,
          mascara_do_recorte: "rostos",
          efeito: { tipo: clipe.esconder_rostos!.modo === "desfocar" ? "desfoque" : "pixelizar", intensidade: clipe.esconder_rostos!.forca },
        })),
      });
    }
    if (comFundo.length) {
      // O contorno e a sombra ficam em volta da pessoa recortada, não do vídeo desfocado
      faixas.push({
        ...faixa,
        id: `${faixa.id}${SUFIXO_DO_RECORTE}`,
        tipo,
        clipes: comFundo.map((clipe) => ({ ...copia(clipe, SUFIXO_DO_RECORTE), remover_fundo: true, contorno: clipe.contorno, sombra: clipe.sombra })),
      });
    }
    faixas.push({
      ...faixa,
      clipes: faixa.clipes.map((clipe) => {
        const semIntencao = { ...clipe, fundo_desfocado: null, esconder_rostos: null, esconder_objetos: null };
        return temFundoDesfocado(clipe)
          ? { ...semIntencao, remover_fundo: false, contorno: null, sombra: null, efeito: { tipo: "desfoque" as const, intensidade: clipe.fundo_desfocado! } }
          : temRostosEscondidos(clipe) || objetosEscondidos(clipe).length
            ? semIntencao
            : clipe;
      }),
    });
  }
  return { ...projeto, faixas };
}
