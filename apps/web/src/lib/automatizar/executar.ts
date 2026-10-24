"use client";

// O que o Automatizar e os Scripts do editor de imagem fazem no navegador (ADR 0003, onda 13.13): carregar as imagens
// (do computador, também PSD, ou da biblioteca), alinhar e juntar com as contas puras (pilha, fotomesclagem, HDR,
// folha de contato, cortar e endireitar) e criar os documentos novos já com as camadas de pixels, num salvamento só.
import { readPsd } from "ag-psd";

import { novoId } from "@/componentes/editor/contexto";
import { arquivoDaMidia, chamarApi } from "@/lib/api";
import { carregarBitmap } from "@/lib/previa/bitmaps";
import { DURACAO_DA_CAMADA, problemaNoTamanho } from "@/lib/projeto/imagem";
import type { Projeto } from "@/lib/projeto/modelo";
import { criarCamadaDePixels, enviarVersao } from "@/lib/pixels";
import { faixasDoPsd, type ItemDoPsd } from "@/lib/psd/mapear";
import type { Midia } from "@/lib/tipos";
import { alinhar, aplicar, type ProjecaoDoAlinhamento } from "@/lib/transformar/alinhar";
import { reamostrar } from "@/lib/transformar/livre";
import type { Quadrilatero } from "@/lib/transformar/malha";
import { mesclarPanorama } from "@/lib/transformar/mesclarCamadas";

import { acharFotos, cantosNaFoto } from "./endireitar";
import { celulasDaFolha, encaixar, type OpcoesDaFolha, paginasDaFolha } from "./folha";
import { mesclarExposicoes, type OpcoesDoHdr } from "./hdr";
import { empilhar, type ModoDePilha, MODOS_DE_PILHA } from "./pilha";

export type Imagem = { dados: Uint8ClampedArray; largura: number; altura: number };
export type FonteDaAutomacao = { tipo: "arquivo"; arquivo: File } | { tipo: "midia"; midia: Midia };
export type Carregada = { nome: string; imagem: Imagem };
type Progresso = (texto: string) => void;

const nomeDaFonte = (fonte: FonteDaAutomacao) => (fonte.tipo === "arquivo" ? fonte.arquivo.name : fonte.midia.nome).replace(/\.[a-z0-9]+$/i, "") || "Imagem";

function pixelsDe(fonte: CanvasImageSource, largura: number, altura: number, ladoMaximo: number): Imagem {
  const escala = Math.min(1, ladoMaximo / Math.max(largura, altura));
  const l = Math.max(1, Math.round(largura * escala));
  const a = Math.max(1, Math.round(altura * escala));
  const canvas = document.createElement("canvas");
  canvas.width = l;
  canvas.height = a;
  const contexto = canvas.getContext("2d", { willReadFrequently: true })!;
  contexto.imageSmoothingQuality = "high";
  contexto.drawImage(fonte, 0, 0, l, a);
  return { dados: contexto.getImageData(0, 0, l, a).data, largura: l, altura: a };
}

/** As imagens em RGBA, no máximo `ladoMaximo` no lado maior. O que o navegador não lê (TIFF, HEIC) vem da biblioteca. */
export async function carregarFontes(fontes: FonteDaAutomacao[], ladoMaximo: number, aoProgresso: Progresso): Promise<Carregada[]> {
  const saida: Carregada[] = [];
  for (const [indice, fonte] of fontes.entries()) {
    aoProgresso(`Lendo a imagem ${indice + 1} de ${fontes.length}…`);
    const nome = nomeDaFonte(fonte);
    if (fonte.tipo === "midia") {
      const bitmap = await carregarBitmap(arquivoDaMidia(fonte.midia.id, "imagem.png")).catch(() => carregarBitmap(arquivoDaMidia(fonte.midia.id, "proxy.webp")));
      saida.push({ nome, imagem: pixelsDe(bitmap, bitmap.width, bitmap.height, ladoMaximo) });
      continue;
    }
    if (/\.(psd|psb)$/i.test(fonte.arquivo.name)) {
      const psd = readPsd(await fonte.arquivo.arrayBuffer(), { skipLayerImageData: true, skipThumbnail: true, skipLinkedFilesData: true });
      if (!psd.canvas) throw new Error(`"${fonte.arquivo.name}" não traz a imagem inteira.`);
      saida.push({ nome, imagem: pixelsDe(psd.canvas, psd.width, psd.height, ladoMaximo) });
      continue;
    }
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(fonte.arquivo);
    } catch {
      throw new Error(`O navegador não lê "${fonte.arquivo.name}". Envie para a biblioteca (Mídias) e escolha de lá.`);
    }
    saida.push({ nome, imagem: pixelsDe(bitmap, bitmap.width, bitmap.height, ladoMaximo) });
    bitmap.close();
  }
  return saida;
}

const pngDe = (imagem: Imagem) => {
  const canvas = document.createElement("canvas");
  canvas.width = imagem.largura;
  canvas.height = imagem.altura;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(imagem.dados), imagem.largura, imagem.altura), 0, 0);
  return new Promise<Blob>((pronto, falhou) => canvas.toBlob((blob) => (blob ? pronto(blob) : falhou(new Error("O navegador não conseguiu gravar a camada."))), "image/png"));
};

export type CamadaNova = { nome: string; imagem: Imagem; oculta?: boolean };

/**
 * Um documento novo com as camadas de pixels (de cima para baixo, todas do tamanho dele): o id do projeto. `fundo`
 * é a cor do documento (sem ela, transparente).
 */
export async function documentoComCamadas(nome: string, largura: number, altura: number, camadas: CamadaNova[], aoProgresso: Progresso, fundo: string | null = null): Promise<string> {
  const problema = problemaNoTamanho({ largura, altura });
  if (problema) throw new Error(problema);
  if (camadas.length > 100) throw new Error("O documento passaria de 100 camadas.");
  const projeto = await chamarApi<Projeto & { versao: number }>("/projetos", { metodo: "POST", corpo: { nome: nome.slice(0, 120), tamanho: { largura, altura } } });
  const itens: ItemDoPsd[] = [];
  for (const [indice, camada] of camadas.entries()) {
    aoProgresso(`Salvando a camada ${indice + 1} de ${camadas.length}…`);
    const midia = await criarCamadaDePixels(largura, altura, camada.nome);
    const versao = await enviarVersao(midia.id, await pngDe(camada.imagem));
    itens.push({ tipo: "pixels", nome: camada.nome.slice(0, 120), oculta: Boolean(camada.oculta), opacidade: 1, mesclagem: "normal", recortada: false, travas: null, rotulo: null, estilo: null, preenchimento: 1, midiaId: midia.id, versao, mascara: null });
  }
  await chamarApi(`/projetos/${projeto.id}`, {
    metodo: "PUT",
    corpo: {
      versao: projeto.versao,
      nome: nome.slice(0, 120),
      proporcao: projeto.proporcao,
      taxa: projeto.taxa,
      fundo: fundo ? { cor: fundo, transparente: false } : { ...projeto.fundo, transparente: true },
      faixas: [...faixasDoPsd(itens, novoId, DURACAO_DA_CAMADA), ...projeto.faixas.filter((faixa) => faixa.tipo === "principal")],
      marcadores: [],
      canais: [],
      tamanho: { largura, altura },
    },
  });
  return projeto.id;
}

/** A imagem no meio de uma tela maior (transparente em volta). */
function noMeio(imagem: Imagem, largura: number, altura: number): Imagem {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  const x0 = Math.floor((largura - imagem.largura) / 2);
  const y0 = Math.floor((altura - imagem.altura) / 2);
  for (let y = 0; y < imagem.altura; y++) dados.set(imagem.dados.subarray(y * imagem.largura * 4, (y + 1) * imagem.largura * 4), ((y + y0) * largura + x0) * 4);
  return { dados, largura, altura };
}

/**
 * As imagens alinhadas à do meio: cada uma pelo modelo que leva os pontos dela aos da do meio. `crescer` aumenta a
 * tela até caber todas (a fotomesclagem); sem ele, ficam no quadro da do meio (a pilha e o HDR).
 */
function alinharTodas(carregadas: Carregada[], projecao: ProjecaoDoAlinhamento, crescer: boolean): { imagens: Imagem[]; largura: number; altura: number; sem: string[] } {
  const referencia = carregadas[Math.floor(carregadas.length / 2)].imagem;
  const sem: string[] = [];
  const levadas = carregadas.map(({ nome, imagem }) => {
    const cantos = [
      { x: 0, y: 0 },
      { x: imagem.largura, y: 0 },
      { x: imagem.largura, y: imagem.altura },
      { x: 0, y: imagem.altura },
    ];
    if (imagem === referencia) return { imagem, quad: cantos as Quadrilatero };
    const achado = alinhar(imagem, referencia, projecao);
    if (!achado) {
      sem.push(nome);
      // Sem pontos em comum, fica centrada na do meio
      const dx = (referencia.largura - imagem.largura) / 2;
      const dy = (referencia.altura - imagem.altura) / 2;
      return { imagem, quad: cantos.map((p) => ({ x: p.x + dx, y: p.y + dy })) as Quadrilatero };
    }
    return { imagem, quad: cantos.map((p) => aplicar(achado.modelo, p)) as Quadrilatero };
  });
  let x0 = 0;
  let y0 = 0;
  let largura = referencia.largura;
  let altura = referencia.altura;
  if (crescer) {
    const xs = levadas.flatMap(({ quad }) => quad.map((p) => p.x));
    const ys = levadas.flatMap(({ quad }) => quad.map((p) => p.y));
    x0 = Math.floor(Math.min(0, ...xs));
    y0 = Math.floor(Math.min(0, ...ys));
    largura = Math.ceil(Math.max(referencia.largura, ...xs)) - x0;
    altura = Math.ceil(Math.max(referencia.altura, ...ys)) - y0;
    if (largura > 8192 || altura > 8192 || largura * altura > 36_000_000) throw new Error("O resultado passaria de 8192 px de lado ou de 36 milhões de pixels. Use imagens menores.");
  }
  const imagens = levadas.map(({ imagem, quad }) => ({
    dados: reamostrar(imagem, quad.map((p) => ({ x: p.x - x0, y: p.y - y0 })) as Quadrilatero, { largura, altura }, "bicubica"),
    largura,
    altura,
  }));
  return { imagens, largura, altura, sem };
}

const avisoDosSemPontos = (sem: string[]) => (sem.length ? [`Sem pontos em comum que bastem: ${sem.join(", ")} (no meio, sem alinhar).`] : []);

/** Arquivo › Scripts › Carregar arquivos em pilha: uma camada por imagem e, se pedido, a pilha calculada por cima. */
export async function carregarEmPilha(fontes: FonteDaAutomacao[], opcoes: { alinhar: boolean; modo: ModoDePilha | null }, aoProgresso: Progresso): Promise<{ id: string; avisos: string[] }> {
  const carregadas = await carregarFontes(fontes, 8192, aoProgresso);
  let imagens: Imagem[];
  let largura: number;
  let altura: number;
  let avisos: string[] = [];
  if (opcoes.alinhar && carregadas.length > 1) {
    aoProgresso("Alinhando…");
    const alinhadas = alinharTodas(carregadas, "auto", false);
    ({ imagens, largura, altura } = alinhadas);
    avisos = avisoDosSemPontos(alinhadas.sem);
  } else {
    largura = Math.max(...carregadas.map((c) => c.imagem.largura));
    altura = Math.max(...carregadas.map((c) => c.imagem.altura));
    imagens = carregadas.map((c) => noMeio(c.imagem, largura, altura));
  }
  const camadas: CamadaNova[] = carregadas.map((c, i) => ({ nome: c.nome, imagem: imagens[i] })).reverse();
  if (opcoes.modo) {
    aoProgresso("Calculando a pilha…");
    camadas.unshift({ nome: `Pilha (${MODOS_DE_PILHA.find((m) => m.id === opcoes.modo)!.nome})`, imagem: { dados: empilhar(imagens, opcoes.modo), largura, altura } });
  }
  return { id: await documentoComCamadas(`Pilha de ${carregadas.length} imagens`, largura, altura, camadas, aoProgresso), avisos };
}

/** Arquivo › Automatizar › Fotomesclagem: as fotos alinhadas numa tela que cabe todas e o panorama por cima. */
export async function fotomesclagem(fontes: FonteDaAutomacao[], opcoes: { projecao: ProjecaoDoAlinhamento; misturar: boolean; tonsECores: boolean }, aoProgresso: Progresso): Promise<{ id: string; avisos: string[] }> {
  if (fontes.length < 2) throw new Error("Escolha duas ou mais imagens.");
  const carregadas = await carregarFontes(fontes, 4096, aoProgresso);
  aoProgresso("Alinhando as fotos…");
  const { imagens, largura, altura, sem } = alinharTodas(carregadas, opcoes.projecao, true);
  const camadas: CamadaNova[] = carregadas.map((c, i) => ({ nome: c.nome, imagem: imagens[i], oculta: opcoes.misturar })).reverse();
  if (opcoes.misturar) {
    aoProgresso("Misturando o panorama…");
    camadas.unshift({ nome: "Panorama", imagem: { dados: mesclarPanorama(imagens, { tonsECores: opcoes.tonsECores }), largura, altura } });
  }
  return { id: await documentoComCamadas("Panorama", largura, altura, camadas, aoProgresso), avisos: avisoDosSemPontos(sem) };
}

/** Arquivo › Automatizar › Mesclar para HDR: as exposições alinhadas e a fusão delas por cima (as fotos ficam escondidas). */
export async function mesclarParaHdr(fontes: FonteDaAutomacao[], opcoes: { alinhar: boolean; hdr: OpcoesDoHdr }, aoProgresso: Progresso): Promise<{ id: string; avisos: string[] }> {
  if (fontes.length < 2) throw new Error("Escolha duas ou mais exposições da mesma cena.");
  // A fusão guarda pirâmides em ponto flutuante: as fotos vão até 3000 px
  const carregadas = await carregarFontes(fontes, 3000, aoProgresso);
  let imagens: Imagem[];
  let largura: number;
  let altura: number;
  let avisos: string[] = [];
  if (opcoes.alinhar) {
    aoProgresso("Alinhando as exposições…");
    const alinhadas = alinharTodas(carregadas, "colagem", false);
    ({ imagens, largura, altura } = alinhadas);
    avisos = avisoDosSemPontos(alinhadas.sem);
  } else {
    largura = carregadas[0].imagem.largura;
    altura = carregadas[0].imagem.altura;
    if (carregadas.some((c) => c.imagem.largura !== largura || c.imagem.altura !== altura)) throw new Error("Sem alinhar, as exposições precisam ter o mesmo tamanho.");
    imagens = carregadas.map((c) => c.imagem);
  }
  aoProgresso("Mesclando as exposições…");
  const hdr = mesclarExposicoes(imagens, opcoes.hdr);
  // Onde alguma exposição alinhada não cobre, a fusão leva o transparente dela: a borda fica com as que cobrem
  const camadas: CamadaNova[] = [{ nome: "HDR", imagem: { dados: hdr, largura, altura } }, ...carregadas.map((c, i) => ({ nome: c.nome, imagem: imagens[i], oculta: true })).reverse()];
  return { id: await documentoComCamadas("HDR", largura, altura, camadas, aoProgresso), avisos };
}

/** Arquivo › Automatizar › Folha de contato: uma página por documento, uma camada por imagem e os nomes numa camada. */
export async function folhaDeContato(fontes: FonteDaAutomacao[], opcoes: OpcoesDaFolha & { fundo: string }, aoProgresso: Progresso): Promise<string[]> {
  const celulas = celulasDaFolha(opcoes);
  const porPagina = celulas.length;
  if (porPagina > 99) throw new Error("Uma página tem no máximo 99 células (o documento vai até 100 camadas).");
  const paginas = paginasDaFolha(fontes.length, opcoes);
  const ladoDaCelula = Math.max(celulas[0].imagem.largura, celulas[0].imagem.altura) * 2;
  const ids: string[] = [];
  for (let pagina = 0; pagina < paginas; pagina++) {
    const daPagina = fontes.slice(pagina * porPagina, (pagina + 1) * porPagina);
    const carregadas = await carregarFontes(daPagina, ladoDaCelula, (texto) => aoProgresso(`Página ${pagina + 1} de ${paginas}: ${texto}`));
    const camadas: CamadaNova[] = [];
    const nomes = document.createElement("canvas");
    nomes.width = opcoes.largura;
    nomes.height = opcoes.altura;
    const ctxNomes = nomes.getContext("2d")!;
    for (const [i, { nome, imagem }] of carregadas.entries()) {
      const celula = celulas[i];
      const lugar = encaixar(imagem, celula.imagem, opcoes.girar);
      const canvas = document.createElement("canvas");
      canvas.width = opcoes.largura;
      canvas.height = opcoes.altura;
      const contexto = canvas.getContext("2d", { willReadFrequently: true })!;
      contexto.imageSmoothingQuality = "high";
      const origem = document.createElement("canvas");
      origem.width = imagem.largura;
      origem.height = imagem.altura;
      origem.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(imagem.dados), imagem.largura, imagem.altura), 0, 0);
      if (lugar.girada) {
        contexto.translate(lugar.x + lugar.largura / 2, lugar.y + lugar.altura / 2);
        contexto.rotate(-Math.PI / 2);
        contexto.drawImage(origem, -lugar.altura / 2, -lugar.largura / 2, lugar.altura, lugar.largura);
      } else contexto.drawImage(origem, lugar.x, lugar.y, lugar.largura, lugar.altura);
      camadas.push({ nome, imagem: { dados: contexto.getImageData(0, 0, opcoes.largura, opcoes.altura).data, largura: opcoes.largura, altura: opcoes.altura } });
      if (celula.legenda) {
        const tamanho = Math.max(8, Math.round(celula.legenda.altura * 0.6));
        ctxNomes.font = `${tamanho}px Inter, system-ui, sans-serif`;
        ctxNomes.fillStyle = "#333333";
        ctxNomes.textAlign = "center";
        ctxNomes.textBaseline = "middle";
        let texto = nome;
        while (texto.length > 1 && ctxNomes.measureText(texto).width > celula.legenda.largura) texto = `${texto.slice(0, -2)}…`;
        ctxNomes.fillText(texto, celula.legenda.x + celula.legenda.largura / 2, celula.legenda.y + celula.legenda.altura / 2);
      }
    }
    const comNomes = opcoes.legenda > 0 ? [{ nome: "Nomes", imagem: { dados: ctxNomes.getImageData(0, 0, opcoes.largura, opcoes.altura).data, largura: opcoes.largura, altura: opcoes.altura } }] : [];
    ids.push(await documentoComCamadas(`Folha de contato ${pagina + 1}`, opcoes.largura, opcoes.altura, [...comNomes, ...camadas.reverse()], aoProgresso, opcoes.fundo));
  }
  return ids;
}

/** Arquivo › Automatizar › Cortar e endireitar fotos: cada foto achada num documento novo (os ids, na ordem delas). */
export async function cortarEEndireitar(imagem: Imagem, nome: string, aoProgresso: Progresso): Promise<string[]> {
  aoProgresso("Procurando as fotos…");
  const fotos = acharFotos(imagem);
  if (!fotos.length) throw new Error("Não achei fotos separadas do fundo. Ponha as fotos sobre um fundo liso, com espaço entre elas.");
  const ids: string[] = [];
  for (const [i, foto] of fotos.entries()) {
    // Um pixel para dentro de cada lado: a borda da foto mistura o fundo
    const dentro = { ...foto, largura: foto.largura - 2, altura: foto.altura - 2 };
    const largura = Math.max(16, Math.round(dentro.largura));
    const altura = Math.max(16, Math.round(dentro.altura));
    const dados = reamostrar(imagem, cantosNaFoto({ ...dentro, largura, altura }, imagem), { largura, altura }, "bicubica");
    ids.push(await documentoComCamadas(`${nome} ${i + 1}`, largura, altura, [{ nome: `${nome} ${i + 1}`, imagem: { dados, largura, altura } }], (texto) => aoProgresso(`Foto ${i + 1} de ${fotos.length}: ${texto}`)));
  }
  return ids;
}
