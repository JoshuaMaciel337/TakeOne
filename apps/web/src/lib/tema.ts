// Tema escuro (o padrão) ou claro. A escolha fica no navegador e vira o atributo data-tema do <html>;
// as cores de cada tema estão no globals.css.

export type Tema = "escuro" | "claro";

export const CHAVE_TEMA = "takeone-tema";

/**
 * Roda antes da primeira pintura (no layout), para a página não piscar no tema errado. Também marca o
 * <html> com "js": a home só esconde o que vai aparecer com animação quando há script para mostrar.
 */
export const SCRIPT_TEMA = `document.documentElement.classList.add("js");try{if(localStorage.getItem("${CHAVE_TEMA}")==="claro")document.documentElement.dataset.tema="claro"}catch(e){}`;

export function temaAtual(): Tema {
  return document.documentElement.dataset.tema === "claro" ? "claro" : "escuro";
}

export function trocarTema(tema: Tema) {
  if (tema === "claro") document.documentElement.dataset.tema = "claro";
  else delete document.documentElement.dataset.tema;
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // Sem armazenamento (janela privada): o tema vale só até recarregar
  }
}

/** Avisa quando o tema muda (nesta aba ou em outra). */
export function assinarTema(aoMudar: () => void) {
  const observador = new MutationObserver(aoMudar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });
  const deOutraAba = (evento: StorageEvent) => {
    if (evento.key !== CHAVE_TEMA) return;
    if (evento.newValue === "claro") document.documentElement.dataset.tema = "claro";
    else delete document.documentElement.dataset.tema;
  };
  window.addEventListener("storage", deOutraAba);
  return () => {
    observador.disconnect();
    window.removeEventListener("storage", deOutraAba);
  };
}
