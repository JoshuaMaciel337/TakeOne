// "Melhorar o projeto" (ADR 0007, 17.6): o que dá para melhorar no projeto inteiro, achado pelo que já está medido:
// o loudness de cada mídia (a ingestão mede), a cor que nunca foi mexida, a fala sem legendas, a voz sem a limpeza e
// os vídeos longos da principal (as trocas de cena). Cada sugestão diz quais clipes recebem a melhoria.
import { corNeutra } from "./cor.ts";
import type { Projeto } from "./modelo.ts";

export type TipoDeSugestao = "volume" | "cor" | "legendas" | "voz" | "cenas";
export type SugestaoDoProjeto = { tipo: TipoDeSugestao; titulo: string; descricao: string; clipeIds: string[] };

/** O que a análise lê de cada mídia. */
export type MidiaParaAnalise = {
  imagem?: boolean;
  video: { transparente?: boolean } | null;
  audio: { lufs?: number | null } | null;
  elemento?: unknown;
  animacao?: unknown;
  legenda_animada?: unknown;
};

const ALVO_LUFS = -14;
const FOLGA_LUFS = 3;
const VIDEO_LONGO_S = 20;
const TICKS_POR_SEGUNDO = 254_016_000_000;

export function analisarProjeto(projeto: Projeto, midias: ReadonlyMap<string, MidiaParaAnalise>): SugestaoDoProjeto[] {
  const volume: string[] = [];
  const cor: string[] = [];
  const voz: string[] = [];
  const cenas: string[] = [];
  let falaNaPrincipal = false;
  for (const faixa of projeto.faixas) {
    if (faixa.travada) continue;
    for (const clipe of faixa.clipes) {
      const midia = clipe.midia_id ? midias.get(clipe.midia_id) : undefined;
      if (!midia) continue;
      const temSom = Boolean(midia.audio) && (faixa.tipo === "audio" || !clipe.som_separado);
      const lufs = midia.audio?.lufs;
      if (temSom && typeof lufs === "number" && Math.abs(lufs - ALVO_LUFS) > FOLGA_LUFS && !clipe.igualar_volume) volume.push(clipe.id);
      const ehFotoOuVideo = faixa.tipo !== "audio" && Boolean(midia.video) && !midia.elemento && !midia.animacao && !midia.legenda_animada && !midia.video?.transparente && !clipe.texto;
      const corIntacta = !clipe.cor || (corNeutra(clipe.cor) && !clipe.cor.filtro && !clipe.cor.lut && !clipe.cor.curvas && !clipe.cor.hsl);
      if (ehFotoOuVideo && corIntacta && !clipe.ajuste) cor.push(clipe.id);
      if (faixa.tipo === "principal" && temSom && !midia.imagem) {
        falaNaPrincipal = true;
        if (!clipe.voz_limpa) voz.push(clipe.id);
        if (clipe.duracao / TICKS_POR_SEGUNDO >= VIDEO_LONGO_S) cenas.push(clipe.id);
      }
    }
  }
  const temLegendas = projeto.faixas.some((faixa) => faixa.tipo === "legenda" && faixa.clipes.length > 0);
  const sugestoes: SugestaoDoProjeto[] = [];
  if (volume.length) sugestoes.push({ tipo: "volume", titulo: "Igualar o volume", descricao: `${contar(volume.length)} com o som longe de ${ALVO_LUFS} LUFS (mais alto ou mais baixo que o resto).`, clipeIds: volume });
  if (cor.length) sugestoes.push({ tipo: "cor", titulo: "Melhorar a cor", descricao: `${contar(cor.length)} com a cor como veio: a luz, o contraste e o branco acertados pela imagem de cada um.`, clipeIds: cor });
  if (falaNaPrincipal && !temLegendas) sugestoes.push({ tipo: "legendas", titulo: "Pôr legendas", descricao: "O vídeo tem fala e nenhuma legenda: elas saem da transcrição.", clipeIds: [] });
  if (voz.length) sugestoes.push({ tipo: "voz", titulo: "Limpar a voz", descricao: `${contar(voz.length)} da principal com fala: o ruído de fundo sai (o servidor prepara a voz limpa).`, clipeIds: voz });
  if (cenas.length) sugestoes.push({ tipo: "cenas", titulo: "Dividir nas trocas de cena", descricao: `${contar(cenas.length)} longos na principal: um clipe por cena, para cortar e reordenar.`, clipeIds: cenas });
  return sugestoes;
}

function contar(n: number): string {
  return n === 1 ? "1 clipe" : `${n} clipes`;
}
