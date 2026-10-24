// O tema do site: o escuro (o padrão), o cinza médio, o cinza claro e o claro. A escolha fica no navegador e vira o
// atributo data-tema do <html>; as cores de cada tema estão no globals.css.

export type Tema = "escuro" | "cinza" | "cinza-claro" | "claro";

/** Do mais escuro ao mais claro (Shift+F1 e Shift+F2 andam por eles no editor de imagem). */
export const TEMAS: { id: Tema; nome: string }[] = [
  { id: "escuro", nome: "Escuro" },
  { id: "cinza", nome: "Cinza médio" },
  { id: "cinza-claro", nome: "Cinza claro" },
  { id: "claro", nome: "Claro" },
];

export const CHAVE_TEMA = "takeone-tema";

/** Os temas com fundo claro (o botão do tema passa ao escuro; a home usa as cores claras). */
export const temaClaro = (tema: Tema) => tema === "claro" || tema === "cinza-claro";

/**
 * Roda antes da primeira pintura (no layout), para a página não piscar no tema errado. Também marca o
 * <html> com "js": a home só esconde o que vai aparecer com animação quando há script para mostrar.
 */
export const SCRIPT_TEMA = `document.documentElement.classList.add("js");try{var t=localStorage.getItem("${CHAVE_TEMA}");if(t==="claro"||t==="cinza"||t==="cinza-claro")document.documentElement.dataset.tema=t}catch(e){}`;

const ehTema = (valor: string | null | undefined): valor is Tema => TEMAS.some((tema) => tema.id === valor);

export function temaAtual(): Tema {
  const tema = document.documentElement.dataset.tema;
  return ehTema(tema) ? tema : "escuro";
}

function aplicarTema(tema: Tema) {
  if (tema === "escuro") delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = tema;
}

export function trocarTema(tema: Tema) {
  aplicarTema(tema);
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
    aplicarTema(ehTema(evento.newValue) ? evento.newValue : "escuro");
  };
  window.addEventListener("storage", deOutraAba);
  return () => {
    observador.disconnect();
    window.removeEventListener("storage", deOutraAba);
  };
}
