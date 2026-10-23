// O que a edição (lib/projeto/edicao.ts) precisa saber da biblioteca, nos dois editores (vídeo e imagem).
import type { Contexto } from "@/lib/projeto/edicao";
import { segundosParaTicks } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

export function novoId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

/** O contexto das mídias prontas da biblioteca: o tamanho no tempo, se têm imagem, som e transparência. */
export function contextoDasMidias(midias: ReadonlyMap<string, Midia>): Contexto {
  return {
    novoId,
    midia: (id) => {
      const midia = midias.get(id);
      if (!midia || midia.status !== "pronta") return null;
      if (midia.imagem && midia.video) {
        // Imagem parada: sem fim, sem som; com transparência, entra numa faixa por cima
        return { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, transparente: Boolean(midia.video.transparente), imagem: true };
      }
      if (!midia.duracao) return null;
      return {
        duracao: segundosParaTicks(midia.duracao),
        video: Boolean(midia.video),
        audio: Boolean(midia.audio),
        transparente: Boolean(midia.animacao) && midia.arquivos.includes("mascara.mp4"),
      };
    },
  };
}
