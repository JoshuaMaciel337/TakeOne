"use client";

// Arquivo › Imprimir do editor de imagem (ADR 0003, onda 13.13): a imagem exportada vai para uma página escondida, com
// o tamanho pedido em polegadas (o tamanho real pela resolução do documento, ou caber na folha), e o navegador abre a
// janela de impressão dele (impressora, folha, margens e o "Salvar como PDF").

export type OpcoesDaImpressao = {
  /** "real": o tamanho pela resolução; "caber": o maior que cabe na área impressa; "escala": o real vezes a escala. */
  tamanho: "real" | "caber" | "escala";
  escala: number;
  orientacao: "automatica" | "retrato" | "paisagem";
  /** Margem da folha, em milímetros. */
  margem: number;
};

export const OPCOES_PADRAO_DA_IMPRESSAO: OpcoesDaImpressao = { tamanho: "caber", escala: 1, orientacao: "automatica", margem: 10 };

/** O CSS da página: a folha (com a orientação) e a imagem no meio, no tamanho pedido. */
export function cssDaImpressao(opcoes: OpcoesDaImpressao, largura: number, altura: number, ppi: number): string {
  const orientacao = opcoes.orientacao === "automatica" ? (largura > altura ? "landscape" : "portrait") : opcoes.orientacao === "paisagem" ? "landscape" : "portrait";
  const medida =
    opcoes.tamanho === "caber"
      ? "max-width: 100%; max-height: 100%; object-fit: contain;"
      : `width: ${((largura / ppi) * (opcoes.tamanho === "escala" ? opcoes.escala : 1)).toFixed(4)}in; height: ${((altura / ppi) * (opcoes.tamanho === "escala" ? opcoes.escala : 1)).toFixed(4)}in;`;
  return [
    `@page { size: ${orientacao}; margin: ${Math.max(0, opcoes.margem)}mm; }`,
    "html, body { margin: 0; height: 100%; }",
    "body { display: flex; align-items: center; justify-content: center; }",
    `img { display: block; ${medida} }`,
  ].join("\n");
}

/** Abre a janela de impressão do navegador com a imagem. */
export function imprimirImagem(png: Blob, titulo: string, opcoes: OpcoesDaImpressao, largura: number, altura: number, ppi: number): Promise<void> {
  return new Promise((pronto, falhou) => {
    const url = URL.createObjectURL(png);
    const quadro = document.createElement("iframe");
    quadro.style.cssText = "position: fixed; right: 0; bottom: 0; width: 0; height: 0; border: 0; visibility: hidden;";
    document.body.appendChild(quadro);
    const doc = quadro.contentDocument!;
    doc.open();
    doc.write("<!doctype html><html><head><meta charset=\"utf-8\"><title></title><style></style></head><body><img alt=\"\"></body></html>");
    doc.close();
    doc.title = titulo;
    doc.querySelector("style")!.textContent = cssDaImpressao(opcoes, largura, altura, ppi);
    const imagem = doc.querySelector("img")!;
    const limpar = () => {
      URL.revokeObjectURL(url);
      quadro.remove();
    };
    imagem.onload = () => {
      quadro.contentWindow!.addEventListener("afterprint", () => setTimeout(limpar, 500), { once: true });
      quadro.contentWindow!.focus();
      quadro.contentWindow!.print();
      pronto();
    };
    imagem.onerror = () => {
      limpar();
      falhou(new Error("Não foi possível preparar a impressão."));
    };
    imagem.src = url;
  });
}
