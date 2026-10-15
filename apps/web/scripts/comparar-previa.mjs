// -----------------------------------------------
// TakeOne — compara a prévia do editor com o vídeo exportado, no Chrome
//
// Abre o projeto no editor, para em alguns instantes e lê o canvas da prévia. Depois toca a última
// exportação pronta do projeto num <video> do mesmo navegador (como a pessoa vai assistir), no mesmo
// quadro e no mesmo tamanho, e mede a diferença. Também confere os quadros vizinhos: se um deles bate
// melhor, a prévia mostrou o quadro errado.
//
// Precisa da pilha rodando e do Chrome instalado. Fica fora do CI.
//   TAKEONE_EMAIL=... TAKEONE_SENHA=... npm run comparar-previa -- <id do projeto> [site]
// Sai com código 1 se algum instante passar dos limites. Com TAKEONE_SALVAR=<pasta>, guarda a prévia e
// o vídeo de cada instante em PNG, para ver onde está a diferença.
// -----------------------------------------------
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

const [projetoId, site = "http://localhost:3010"] = process.argv.slice(2);
const { TAKEONE_EMAIL: email, TAKEONE_SENHA: senha, TAKEONE_SALVAR: pastaSalvar } = process.env;
if (!projetoId || !email || !senha) {
  console.error("Uso: TAKEONE_EMAIL=... TAKEONE_SENHA=... npm run comparar-previa -- <id do projeto> [site]");
  process.exit(2);
}

// Limites: média da diferença (0 a 255) e fração dos pixels com diferença acima de 32.
// Bordas finas e a suavização da escala dão uns 3% acima de 32; cor trocada dá bem mais.
const LIMITE_MEDIA = 6;
const LIMITE_FORA = 0.08;
// O vizinho só conta como "quadro errado" se bater claramente melhor: num trecho parado os quadros são iguais
const FOLGA_VIZINHO = 0.5;
const PARTES = [0.05, 0.25, 0.5, 0.75, 0.95];

const navegador = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=d3d11"] });
try {
  const contexto = await navegador.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  const pagina = await contexto.newPage();
  const entrou = await pagina.request.post(`${site}/api/auth/entrar`, { data: { email, senha } });
  if (!entrou.ok()) throw new Error(`Não foi possível entrar: ${entrou.status()}`);

  const projeto = await (await pagina.request.get(`${site}/api/projetos/${projetoId}`)).json();
  const exportacoes = await (await pagina.request.get(`${site}/api/exportacoes?projeto_id=${projetoId}`)).json();
  const exportacao = exportacoes.find((e) => e.status === "pronta");
  if (!exportacao) throw new Error("O projeto não tem exportação pronta. Exporte antes de comparar.");
  const fps = projeto.taxa.num / projeto.taxa.den;
  const quadrosNoTotal = Math.floor(exportacao.duracao * fps);

  await pagina.goto(`${site}/app/editor/${projetoId}`);
  await pagina.waitForSelector("canvas");
  await pagina.waitForTimeout(4000);

  const resultados = [];
  for (const parte of PARTES) {
    const quadro = Math.min(Math.round(quadrosNoTotal * parte), quadrosNoTotal - 2);
    await pagina.keyboard.press("Escape");
    await pagina.keyboard.press("Home");
    for (let i = 0; i < Math.floor(quadro / fps); i++) await pagina.keyboard.press("Shift+ArrowRight");
    for (let i = 0; i < Math.round(quadro % fps); i++) await pagina.keyboard.press("ArrowRight");
    await pagina.waitForTimeout(2000);
    const medida = await pagina.evaluate(async ({ url, quadro, fps, folga, salvar }) => {
      const previa = document.querySelector("canvas");
      const largura = previa.width;
      const altura = previa.height;
      const ler = (fonte) => {
        const c = new OffscreenCanvas(largura, altura);
        const g = c.getContext("2d");
        g.drawImage(fonte, 0, 0, largura, altura);
        return g.getImageData(0, 0, largura, altura).data;
      };
      const daPrevia = ler(previa);
      const video = document.createElement("video");
      video.muted = true;
      video.src = url;
      await new Promise((ok, erro) => {
        video.addEventListener("loadeddata", ok, { once: true });
        video.addEventListener("error", () => erro(new Error("O vídeo exportado não abriu")), { once: true });
      });
      const comparar = async (n) => {
        video.currentTime = (n + 0.5) / fps;
        await new Promise((ok) => video.addEventListener("seeked", ok, { once: true }));
        const doVideo = ler(video);
        let soma = 0;
        let fora = 0;
        for (let i = 0; i < daPrevia.length; i += 4) {
          let maior = 0;
          for (let k = 0; k < 3; k++) {
            const d = Math.abs(daPrevia[i + k] - doVideo[i + k]);
            soma += d;
            maior = Math.max(maior, d);
          }
          if (maior > 32) fora++;
        }
        const pixels = daPrevia.length / 4;
        return { media: soma / (pixels * 3), fora: fora / pixels };
      };
      const antes = await comparar(quadro - 1);
      const depois = await comparar(quadro + 1);
      const mesmo = await comparar(quadro);
      const vizinho = Math.min(antes.media, depois.media);
      // As duas imagens do instante, em PNG (o vídeo já está no quadro certo)
      const png = async (fonte) => {
        const c = new OffscreenCanvas(largura, altura);
        c.getContext("2d").drawImage(fonte, 0, 0, largura, altura);
        const blob = await c.convertToBlob({ type: "image/png" });
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      };
      const imagens = salvar ? { previa: await png(previa), video: await png(video) } : null;
      return { largura, altura, ...mesmo, vizinhoMaisParecido: vizinho < mesmo.media - folga, imagens };
    }, { url: `${site}/api/exportacoes/${exportacao.id}/arquivos/video.mp4`, quadro, fps, folga: FOLGA_VIZINHO, salvar: Boolean(pastaSalvar) });
    if (medida.imagens) {
      writeFileSync(join(pastaSalvar, `previa_${quadro}.png`), Buffer.from(medida.imagens.previa));
      writeFileSync(join(pastaSalvar, `video_${quadro}.png`), Buffer.from(medida.imagens.video));
      delete medida.imagens;
    }
    const ok = medida.media <= LIMITE_MEDIA && medida.fora <= LIMITE_FORA && !medida.vizinhoMaisParecido;
    resultados.push({ quadro, segundos: (quadro / fps).toFixed(2), ...medida, ok });
  }

  for (const r of resultados) {
    console.log(`${r.ok ? "ok   " : "FALHA"} ${r.segundos}s (quadro ${r.quadro}, ${r.largura}x${r.altura}): ` +
      `média ${r.media.toFixed(2)}, ${(r.fora * 100).toFixed(1)}% acima de 32` +
      (r.vizinhoMaisParecido ? ", o quadro vizinho bate melhor" : ""));
  }
  process.exitCode = resultados.every((r) => r.ok) ? 0 : 1;
} finally {
  await navegador.close();
}
