// O que a exportação no navegador não pode fazer ainda: as mesmas recusas do render do servidor
// (core/utils/render.py) para arquivos que o worker ainda está gerando. A prévia mostra o clipe com o arquivo
// de sempre enquanto isso; a exportação no navegador, sem esta conferência, baixava um MP4 "pronto" sem o
// recorte, o tom ou a estabilização pedidos, e sem aviso.
import type { Midia } from "../tipos.ts";
import { lutGuardada } from "./lutImportada.ts";
import { chaveDaEstabilizacao, type Projeto, zeroDoFluido } from "./modelo.ts";
import { chaveDoTom } from "./som.ts";

/**
 * A partir desta duração, uma mídia com som não vai pelo navegador: ele decodifica o som inteiro da fonte
 * (uns 1,4 GB de memória por hora), mesmo que o projeto use só um trecho.
 */
export const FONTE_DE_SOM_MAXIMA_S = 15 * 60;

/** Por que o projeto ainda não pode sair no navegador, ou null. */
export function pendenciaParaONavegador(projeto: Projeto, midias: ReadonlyMap<string, Midia>): string | null {
  for (const faixa of projeto.faixas) {
    for (const clipe of faixa.clipes) {
      if (clipe.cor?.lut && clipe.cor.lut.intensidade > 0 && !lutGuardada(clipe.cor.lut.id)) return "A LUT de um clipe ainda está carregando (ou foi excluída). Espere um instante.";
      if (!clipe.midia_id) continue;
      const midia = midias.get(clipe.midia_id);
      if (!midia || midia.status !== "pronta") return "Uma mídia do projeto ainda está sendo preparada (ou foi excluída). Espere terminar.";
      const tem = (arquivo: string) => midia.arquivos.includes(arquivo);
      if (clipe.remover_fundo && !midia.imagem && !tem("mascara.mp4")) return "O recorte do fundo de um clipe ainda está sendo preparado. Espere terminar.";
      if (clipe.estabilizar && !tem(`${chaveDaEstabilizacao(Boolean(clipe.imagem_limpa))}_proxy.mp4`)) return "A estabilização de um clipe ainda está sendo preparada. Espere terminar.";
      if (clipe.imagem_limpa && !clipe.estabilizar && !tem("limpo_proxy.mp4")) return "A imagem sem ruído de um clipe ainda está sendo preparada. Espere terminar.";
      if (clipe.inverter && !midia.imagem && !tem("invertido_proxy.mp4")) return "O vídeo ao contrário de um clipe ainda está sendo preparado. Espere terminar.";
      if (clipe.fluido && !clipe.inverter && zeroDoFluido(clipe, midia) === null) return "A câmera lenta suave de um clipe ainda está sendo preparada (ou o clipe passou do trecho dela). Espere terminar ou ligue a opção de novo.";
      if (!midia.audio || faixa.muda || clipe.som_separado) continue;
      if (clipe.voz_limpa && !tem("voz_limpa.m4a")) return "A voz limpa de um clipe ainda está sendo preparada. Espere terminar.";
      if (clipe.tom && !tem(`${chaveDoTom(clipe.tom, Boolean(clipe.voz_limpa))}.m4a`)) return "O tom da voz de um clipe ainda está sendo preparado. Espere terminar.";
      if ((midia.duracao ?? 0) > FONTE_DE_SOM_MAXIMA_S) return `Uma mídia com som tem mais de ${FONTE_DE_SOM_MAXIMA_S / 60} minutos: o navegador teria de decodificar o som inteiro dela.`;
    }
  }
  return null;
}
