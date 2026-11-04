// O layout do editor de vídeo: o Takecut (a tela simples dos apps de vídeo para criadores: ferramentas com nome à
// esquerda, a prévia no meio, os ajustes à direita) ou o Takepro (o layout dos programas profissionais de vídeo, ADR 0002).
// O editor de imagem é um editor de fotos e tem o layout dele, sem essa escolha. A escolha fica no navegador, como o
// tema; no celular o editor de vídeo usa a tela simples, que é a que cabe.
import { trocarTema, type Tema } from "./tema";

export type Aparencia = "takecut" | "takepro";

export const APARENCIAS: { id: Aparencia; nome: string; descricao: string; tema: Tema }[] = [
  {
    id: "takecut",
    nome: "Takecut",
    descricao: "Simples e direto: as ferramentas com nome à esquerda, a prévia no meio e os ajustes do que está escolhido à direita.",
    tema: "escuro",
  },
  {
    id: "takepro",
    nome: "Takepro",
    descricao: "Como os programas profissionais: barra de menus, painéis com abas, áreas de trabalho e os atalhos de sempre.",
    tema: "cinza",
  },
];

export const CHAVE_APARENCIA = "takeone-aparencia";
const EVENTO = "takeone-aparencia";

const ehAparencia = (valor: string | null): valor is Aparencia => valor === "takecut" || valor === "takepro";

/** A escolhida, ou null quando a pessoa ainda não escolheu (a janela da primeira vez pergunta). */
export function aparenciaEscolhida(): Aparencia | null {
  try {
    const valor = window.localStorage.getItem(CHAVE_APARENCIA);
    return ehAparencia(valor) ? valor : null;
  } catch {
    return null;
  }
}

/**
 * Troca a aparência. Escolhida pela pessoa (não pelo padrão), leva junto o tema de cores dela: o escuro no Takecut e o
 * cinza médio no Takepro; o botão do tema continua trocando depois.
 */
export function escolherAparencia(aparencia: Aparencia, comOTema = true) {
  try {
    window.localStorage.setItem(CHAVE_APARENCIA, aparencia);
  } catch {
    // Sem armazenamento (janela privada): vale até recarregar, pela variável abaixo
  }
  semArmazenamento = aparencia;
  if (comOTema) trocarTema(APARENCIAS.find((item) => item.id === aparencia)!.tema);
  window.dispatchEvent(new Event(EVENTO));
}

let semArmazenamento: Aparencia | null = null;

/** A escolha da vez (nesta aba ou em outra), para o useSyncExternalStore. */
export function assinarAparencia(aoMudar: () => void) {
  const deOutraAba = (evento: StorageEvent) => {
    if (evento.key === CHAVE_APARENCIA) aoMudar();
  };
  window.addEventListener(EVENTO, aoMudar);
  window.addEventListener("storage", deOutraAba);
  return () => {
    window.removeEventListener(EVENTO, aoMudar);
    window.removeEventListener("storage", deOutraAba);
  };
}

/** Para o useSyncExternalStore: a escolhida ou "nenhuma". */
export function lerAparencia(): Aparencia | "nenhuma" {
  return aparenciaEscolhida() ?? semArmazenamento ?? "nenhuma";
}

/** Exibir › Layout, no menu do Takepro: os dois nomes, com a marca no da vez. */
export function itensDaAparencia(atual: Aparencia): { nome: string; marcado: boolean; titulo: string; aoEscolher: () => void }[] {
  return APARENCIAS.map((item) => ({ nome: item.nome, marcado: item.id === atual, titulo: item.descricao, aoEscolher: () => item.id !== atual && escolherAparencia(item.id) }));
}
