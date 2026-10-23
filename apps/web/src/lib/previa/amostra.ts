// Uma amostra pequena dos pixels de uma imagem da API (a cópia leve de uma foto, a capa de um vídeo), para as
// contas que olham a imagem inteira, como o "Melhorar".

/** Os pixels em RGBA, com o lado maior em `lado`. */
export async function amostraDaImagem(url: string, lado = 160): Promise<Uint8ClampedArray> {
  const resposta = await fetch(url, { credentials: "include" });
  if (!resposta.ok) throw new Error("Não foi possível ler a imagem.");
  const bitmap = await createImageBitmap(await resposta.blob());
  try {
    const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const contexto = canvas.getContext("2d", { willReadFrequently: true });
    if (!contexto) throw new Error("O navegador não deixou ler a imagem.");
    contexto.imageSmoothingQuality = "high";
    contexto.drawImage(bitmap, 0, 0, largura, altura);
    return contexto.getImageData(0, 0, largura, altura).data;
  } finally {
    bitmap.close();
  }
}
