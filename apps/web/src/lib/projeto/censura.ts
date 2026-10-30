// A censura de palavras (o Clipar, ADR 0004, 14.8): as palavras da lista do espaço (o kit de marca) que aparecem na
// fala da principal ficam mudas (pelos keyframes de volume do clipe) ou tapadas por um bipe (um efeito sonoro numa
// faixa de áudio, no tamanho da palavra), e nas legendas e nos textos viram a primeira letra e asteriscos. São os caminhos de
// sempre (keyframes de volume, clipes de áudio, o texto da legenda), então a prévia e o render não mudam. Puras.
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import { type Comando, executarComando } from "./comandos.ts";
import type { Contexto } from "./edicao.ts";
import type { PalavraDaLinha } from "./fala.ts";
import { type Keyframe, valorNoTempo } from "./keyframes.ts";
import type { Clipe, Projeto } from "./modelo.ts";

const S = TICKS_POR_SEGUNDO;
export type ModoDaCensura = "bipe" | "silencio";
/** Folga em volta da palavra: o Whisper corta as pontas bem perto da fala. */
export const FOLGA_DA_CENSURA_S = 0.04;
/** O volume do bipe: o tom puro a -1 dBFS é alto demais por cima da fala. */
export const VOLUME_DO_BIPE = 0.3;
/** Os pontos de volume de um clipe têm teto (100 na API); cada palavra usa 3. */
const MAXIMO_POR_CLIPE = 30;

/** A palavra sem acento, em minúsculas e sem pontuação, para comparar com a lista. */
export function palavraNormalizada(palavra: string): string {
  return palavra
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}*]/gu, "");
}

/** Se a palavra está na lista: igual, ou começando pelo que vem antes do * ("palavr*"). */
export function palavraCensurada(palavra: string, lista: string[]): boolean {
  const normal = palavraNormalizada(palavra).replace(/\*/g, "");
  if (!normal) return false;
  return lista.some((item) => {
    const alvo = palavraNormalizada(item);
    if (!alvo) return false;
    return alvo.endsWith("*") ? alvo.length > 1 && normal.startsWith(alvo.slice(0, -1)) : normal === alvo;
  });
}

/** Os trechos da linha do tempo em que as palavras censuradas são ditas, com folga e juntos quando se tocam. */
export function trechosCensurados(palavras: PalavraDaLinha[], lista: string[]): { inicio: Tick; fim: Tick }[] {
  const folga = Math.round(FOLGA_DA_CENSURA_S * S);
  const trechos: { inicio: Tick; fim: Tick }[] = [];
  for (const palavra of palavras) {
    if (!palavraCensurada(palavra.texto, lista)) continue;
    const inicio = Math.max(0, palavra.inicio - folga);
    const fim = Math.min(palavra.fimDoClipe, palavra.fim + folga);
    const ultimo = trechos.at(-1);
    if (ultimo && inicio <= ultimo.fim) ultimo.fim = Math.max(ultimo.fim, fim);
    else trechos.push({ inicio, fim });
  }
  return trechos;
}

/** O texto com as palavras censuradas trocadas pela primeira letra e asteriscos, guardando a pontuação. */
export function textoCensurado(texto: string, lista: string[]): string {
  return texto.replace(/[\p{L}\p{N}]+/gu, (palavra) => (palavraCensurada(palavra, lista) ? palavra[0] + "*".repeat(Math.max(2, palavra.length - 1)) : palavra));
}

/**
 * Os pontos de volume do clipe com o som em zero nos trechos (em ticks desde o começo do clipe): um ponto parado logo
 * antes de cada trecho (o volume de antes), um parado em zero no começo e o volume de antes de volta no fim, com a
 * curva que havia ali. Os pontos de antes dentro dos trechos saem.
 */
export function volumeSemOsTrechos(clipe: Pick<Clipe, "volume" | "keyframes" | "duracao">, trechos: { de: Tick; ate: Tick }[]): Keyframe[] {
  let pontos: Keyframe[] = clipe.keyframes?.volume?.length ? [...clipe.keyframes.volume] : [];
  const valor = (t: Tick) => (pontos.length ? valorNoTempo(pontos, t) : clipe.volume);
  const curvaEm = (t: Tick) => [...pontos].reverse().find((ponto) => ponto.t <= t)?.curva ?? "linear";
  for (const { de, ate } of trechos) {
    const antes = valor(de - 1);
    const depois = valor(ate);
    const curva = curvaEm(ate);
    pontos = pontos.filter((ponto) => ponto.t < de - 1 || ponto.t > ate);
    const novos: Keyframe[] = [...(de > 0 ? [{ t: de - 1, valor: antes, curva: "parado" as const }] : []), { t: de, valor: 0, curva: "parado" }, { t: ate, valor: depois, curva }];
    pontos = [...pontos, ...novos].sort((a, b) => a.t - b.t);
  }
  return pontos;
}

const aplicar = (projeto: Projeto, ctx: Contexto, comando: Comando) => executarComando(projeto, comando, ctx).projeto;

/**
 * Censura as palavras: o som da principal some nos trechos e, no modo "bipe", o bipe toca neles; as legendas trocam
 * as palavras por asteriscos. `bipeId` é a mídia do bipe (pronta no contexto), só no modo "bipe".
 */
export function comCensura(projetoInicial: Projeto, ctx: Contexto, trechos: { inicio: Tick; fim: Tick }[], lista: string[], modo: ModoDaCensura, bipeId: string | null): Projeto {
  let projeto: Projeto = {
    ...projetoInicial,
    faixas: projetoInicial.faixas.map((faixa) => {
      if (faixa.tipo === "principal") {
        return {
          ...faixa,
          clipes: faixa.clipes.map((clipe) => {
            const locais = trechos
              .filter((trecho) => trecho.fim > clipe.inicio && trecho.inicio < clipe.inicio + clipe.duracao)
              .slice(0, MAXIMO_POR_CLIPE)
              .map((trecho) => ({ de: Math.max(0, trecho.inicio - clipe.inicio), ate: Math.min(clipe.duracao, trecho.fim - clipe.inicio) }));
            if (!locais.length || !ctx.midia(clipe.midia_id ?? "")?.audio) return clipe;
            return { ...clipe, keyframes: { ...clipe.keyframes, volume: volumeSemOsTrechos(clipe, locais) } };
          }),
        };
      }
      // As legendas e os textos (o título repete o que é dito)
      if (faixa.tipo !== "legenda" && faixa.tipo !== "texto") return faixa;
      return {
        ...faixa,
        clipes: faixa.clipes.map((clipe) => {
          if (!clipe.texto) return clipe;
          const conteudo = textoCensurado(clipe.texto.conteudo, lista);
          return conteudo === clipe.texto.conteudo ? clipe : { ...clipe, texto: { ...clipe.texto, conteudo } };
        }),
      };
    }),
  };
  if (modo === "bipe" && bipeId) {
    for (const trecho of trechos) {
      const posto = executarComando(projeto, { comando: "clipe.adicionar", parametros: { midiaId: bipeId, inicio: trecho.inicio } }, ctx);
      const clipeId = posto.selecao![0];
      const bipe = posto.projeto.faixas.flatMap((faixa) => faixa.clipes).find((clipe) => clipe.id === clipeId)!;
      const fim = Math.min(trecho.fim, bipe.inicio + bipe.duracao);
      projeto = fim < bipe.inicio + bipe.duracao ? aplicar(posto.projeto, ctx, { comando: "clipe.aparar", parametros: { clipeId, borda: "fim", tempo: fim } }) : posto.projeto;
      const fade = Math.min(Math.round(0.01 * S), Math.floor((fim - bipe.inicio) / 2));
      projeto = aplicar(projeto, ctx, { comando: "clipe.audio", parametros: { clipeIds: [clipeId], volume: VOLUME_DO_BIPE, fade_entrada: fade, fade_saida: fade } });
    }
  }
  return projeto;
}
