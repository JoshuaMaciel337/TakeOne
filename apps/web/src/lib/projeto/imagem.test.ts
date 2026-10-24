import assert from "node:assert/strict";
import { test } from "node:test";

import { executarComando } from "./comandos.ts";
import type { Contexto } from "./edicao.ts";
import { camadasDaImagem, DESFOQUE_DO_FUNDO, DURACAO_DA_CAMADA, ESCALA_DO_RECORTADO, problemaNoTamanho, TAMANHOS_PRONTOS } from "./imagem.ts";
import { caixaDoClipe } from "./geometria.ts";
import type { Projeto } from "./modelo.ts";
import type { CamadaPronta } from "./modelosDeImagem.ts";
import { TEXTO_PADRAO } from "./texto.ts";

function contexto(): Contexto {
  let n = 0;
  const midias: Record<string, { duracao: number; video: boolean; audio: boolean; imagem?: boolean; transparente?: boolean }> = {
    foto: { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, imagem: true },
    logo: { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, imagem: true, transparente: true },
    video: { duracao: 10, video: true, audio: true },
  };
  return { novoId: () => `n${++n}`, midia: (id) => midias[id] ?? null };
}

function vazio(): Projeto {
  return {
    id: "p",
    nome: "Imagem",
    proporcao: "1:1",
    tipo: "imagem",
    tamanho: { largura: 1080, altura: 1080 },
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#ffffff" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
}

test("camadas entram por cima, mudam de ordem, duplicam e saem; a principal fica embaixo", () => {
  const ctx = contexto();
  let r = executarComando(vazio(), { comando: "imagem.adicionarMidia", parametros: { midiaId: "foto" } }, ctx);
  const foto = r.selecao![0];
  r = executarComando(r.projeto, { comando: "imagem.adicionarTexto", parametros: { texto: TEXTO_PADRAO } }, ctx);
  const texto = r.selecao![0];
  let projeto = r.projeto;
  const ordem = () => camadasDaImagem(projeto).map(({ clipe }) => clipe.id);
  assert.deepEqual(ordem(), [texto, foto], "a mais nova fica na frente");
  assert.equal(projeto.faixas.at(-1)!.tipo, "principal");
  assert.equal(camadasDaImagem(projeto)[1].clipe.duracao, DURACAO_DA_CAMADA);

  // O texto vai para trás da foto (no vídeo, texto fica sempre por cima; na imagem não)
  const faixaDoTexto = camadasDaImagem(projeto)[0].faixa.id;
  projeto = executarComando(projeto, { comando: "imagem.mover", parametros: { faixaId: faixaDoTexto, para: "baixo" } }, ctx).projeto;
  assert.deepEqual(ordem(), [foto, texto]);
  projeto = executarComando(projeto, { comando: "imagem.mover", parametros: { faixaId: faixaDoTexto, para: "baixo" } }, ctx).projeto;
  assert.deepEqual(ordem(), [foto, texto], "no fundo, não passa da principal");
  assert.equal(projeto.faixas.at(-1)!.tipo, "principal");

  // Duplicar põe a cópia logo acima, com outro id e um pouco deslocada
  const faixaDaFoto = camadasDaImagem(projeto)[0].faixa.id;
  r = executarComando(projeto, { comando: "imagem.duplicar", parametros: { faixaId: faixaDaFoto } }, ctx);
  projeto = r.projeto;
  const copia = camadasDaImagem(projeto)[0].clipe;
  assert.equal(copia.id, r.selecao![0]);
  assert.equal(copia.midia_id, "foto");
  assert.ok(copia.transformacao.x > 0);
  assert.equal(camadasDaImagem(projeto).length, 3);

  // As propriedades usam os comandos do clipe de sempre
  projeto = executarComando(projeto, { comando: "clipe.transformar", parametros: { clipeIds: [foto], transformacao: { escala: 2 } } }, ctx).projeto;
  assert.equal(camadasDaImagem(projeto).find(({ clipe }) => clipe.id === foto)!.clipe.transformacao.escala, 2);

  projeto = executarComando(projeto, { comando: "imagem.apagar", parametros: { faixaId: camadasDaImagem(projeto)[0].faixa.id } }, ctx).projeto;
  assert.deepEqual(ordem(), [foto, texto]);
});

test("só imagens entram; fundo transparente e tamanho com limites", () => {
  const ctx = contexto();
  assert.throws(() => executarComando(vazio(), { comando: "imagem.adicionarMidia", parametros: { midiaId: "video" } }, ctx), /imagens/);
  let projeto = executarComando(vazio(), { comando: "imagem.fundo", parametros: { transparente: true } }, ctx).projeto;
  assert.deepEqual(projeto.fundo, { cor: "#ffffff", transparente: true });
  projeto = executarComando(projeto, { comando: "imagem.tamanho", parametros: { largura: 1080, altura: 1920 } }, ctx).projeto;
  assert.deepEqual(projeto.tamanho, { largura: 1080, altura: 1920 });
  assert.throws(() => executarComando(projeto, { comando: "imagem.tamanho", parametros: { largura: 9000, altura: 10 } }, ctx), /16 a 8192/);
  assert.match(problemaNoTamanho({ largura: 7000, altura: 7000 })!, /36 milhões/);
  for (const pronto of TAMANHOS_PRONTOS) assert.equal(problemaNoTamanho(pronto), null, pronto.id);
});

test("a foto cabe no quadro e o logo entra com metade do tamanho", () => {
  const ctx = contexto();
  let projeto = executarComando(vazio(), { comando: "imagem.adicionarMidia", parametros: { midiaId: "foto" } }, ctx).projeto;
  projeto = executarComando(projeto, { comando: "imagem.adicionarMidia", parametros: { midiaId: "logo" } }, ctx).projeto;
  const [logo, foto] = camadasDaImagem(projeto);
  assert.equal(foto.clipe.transformacao.escala, 1);
  assert.equal(logo.clipe.transformacao.escala, ESCALA_DO_RECORTADO);
});

test("desfocar o fundo: a foto recortada por cima e uma cópia desfocada embaixo, num passo", () => {
  const ctx = contexto();
  let r = executarComando(vazio(), { comando: "imagem.adicionarMidia", parametros: { midiaId: "foto" } }, ctx);
  const [foto] = camadasDaImagem(r.projeto);
  r = executarComando(r.projeto, { comando: "imagem.desfocarFundo", parametros: { faixaId: foto.faixa.id } }, ctx);
  const [cima, baixo] = camadasDaImagem(r.projeto);
  assert.equal(cima.clipe.id, foto.clipe.id);
  assert.deepEqual(r.selecao, [foto.clipe.id]);
  assert.equal(cima.clipe.remover_fundo, true);
  assert.equal(baixo.clipe.remover_fundo, false);
  assert.deepEqual(baixo.clipe.efeito, { tipo: "desfoque", intensidade: DESFOQUE_DO_FUNDO });
  assert.equal(baixo.clipe.midia_id, "foto");
  assert.notEqual(baixo.faixa.id, cima.faixa.id);
  // Num logo (com transparência) não vale
  r = executarComando(r.projeto, { comando: "imagem.adicionarMidia", parametros: { midiaId: "logo" } }, ctx);
  const [logo] = camadasDaImagem(r.projeto);
  assert.throws(() => executarComando(r.projeto, { comando: "imagem.desfocarFundo", parametros: { faixaId: logo.faixa.id } }, ctx), /fotos/);
});

test("modelo de imagem: camadas por cima, tamanho e fundo do modelo, num passo", () => {
  const ctx = contexto();
  const camadas: CamadaPronta[] = [
    { tipo: "midia", midiaId: "foto", transformacao: { x: 0, y: -0.1, escala: 0.8, rotacao: 0, opacidade: 1 }, recorte: { x: 0.1, y: 0, largura: 0.8, altura: 1 }, cantos: { raio: 0.1, borda: 0, cor: "#ffffff" }, filtro: "cinema" },
    { tipo: "texto", texto: { ...TEXTO_PADRAO, conteudo: "Oferta" }, transformacao: { x: 0, y: 0.3, escala: 1, rotacao: 0, opacidade: 1 } },
  ];
  const r = executarComando(vazio(), { comando: "imagem.aplicarModelo", parametros: { camadas, tamanho: { largura: 1080, altura: 1920 }, fundo: "#123456" } }, ctx);
  assert.deepEqual(r.projeto.tamanho, { largura: 1080, altura: 1920 });
  assert.deepEqual(r.projeto.fundo, { cor: "#123456", transparente: false });
  const [texto, foto] = camadasDaImagem(r.projeto);
  assert.equal(texto.clipe.texto?.conteudo, "Oferta");
  assert.equal(foto.clipe.midia_id, "foto");
  assert.equal(foto.clipe.cor?.filtro, "cinema");
  assert.deepEqual(foto.clipe.cantos, { raio: 0.1, borda: 0, cor: "#ffffff" });
  assert.equal(r.projeto.faixas.at(-1)?.tipo, "principal");
});

test("trocar a imagem: a nova cobre a mesma caixa, cortada no meio", () => {
  const ctx = contexto();
  let projeto = executarComando(vazio(), { comando: "imagem.adicionarMidia", parametros: { midiaId: "logo" } }, ctx).projeto;
  const [camada] = camadasDaImagem(projeto);
  const quadro = { largura: 1080, altura: 1080 };
  // O logo (2:1) ocupa metade do quadro de largura; a foto (1:1) entra no mesmo lugar, cortada para 2:1
  const antes = caixaDoClipe(camada.clipe.transformacao, camada.clipe.recorte, { largura: 2000, altura: 1000 }, quadro);
  projeto = executarComando(projeto, { comando: "imagem.trocarImagem", parametros: { clipeId: camada.clipe.id, midiaId: "foto", tamanhoAtual: { largura: 2000, altura: 1000 }, tamanhoNovo: { largura: 800, altura: 800 } } }, ctx).projeto;
  const [depois] = camadasDaImagem(projeto);
  assert.equal(depois.clipe.midia_id, "foto");
  assert.deepEqual(depois.clipe.recorte, { x: 0, y: 0.25, largura: 1, altura: 0.5 });
  const caixa = caixaDoClipe(depois.clipe.transformacao, depois.clipe.recorte, { largura: 800, altura: 800 }, quadro);
  assert.ok(Math.abs(caixa.largura - antes.largura) < 1e-6 && Math.abs(caixa.altura - antes.altura) < 1e-6);
});

test("recortar a imagem: o quadro fica do tamanho do recorte e as camadas no mesmo lugar em pixels", () => {
  const ctx = contexto();
  let r = executarComando(vazio(), { comando: "imagem.adicionarMidia", parametros: { midiaId: "foto" } }, ctx);
  r = executarComando(r.projeto, { comando: "imagem.adicionarTexto", parametros: { texto: TEXTO_PADRAO } }, ctx);
  const antes = r.projeto;
  const quadroAntes = { largura: 1080, altura: 1080 };
  const tamanhos = { foto: { largura: 2000, altura: 1000 } };
  const [, fotoAntes] = camadasDaImagem(antes);
  const caixaAntes = caixaDoClipe(fotoAntes.clipe.transformacao, fotoAntes.clipe.recorte, tamanhos.foto, quadroAntes);
  const retangulo = { x: 100, y: 200, largura: 800, altura: 600 };
  const depois = executarComando(antes, { comando: "imagem.recortar", parametros: { retangulo, tamanhos } }, ctx).projeto;
  assert.deepEqual(depois.tamanho, { largura: 800, altura: 600 });
  const [texto, foto] = camadasDaImagem(depois);
  const caixa = caixaDoClipe(foto.clipe.transformacao, foto.clipe.recorte, tamanhos.foto, { largura: 800, altura: 600 });
  assert.ok(Math.abs(caixa.largura - caixaAntes.largura) < 1e-6 && Math.abs(caixa.altura - caixaAntes.altura) < 1e-6);
  assert.ok(Math.abs(caixa.cx - (caixaAntes.cx - 100)) < 1e-6 && Math.abs(caixa.cy - (caixaAntes.cy - 200)) < 1e-6);
  // O texto: o lado menor era 1080 e passa a 600, então a escala cresce na mesma proporção
  assert.ok(Math.abs(texto.clipe.transformacao.escala - 1080 / 600) < 1e-9);
});

test("o objeto recortado entra numa camada logo acima da foto, no mesmo lugar", () => {
  const ctx = contexto();
  let projeto = executarComando(vazio(), { comando: "imagem.adicionarMidia", parametros: { midiaId: "foto" } }, ctx).projeto;
  projeto = executarComando(projeto, { comando: "clipe.transformar", parametros: { clipeIds: [camadasDaImagem(projeto)[0].clipe.id], transformacao: { x: 0.1, escala: 0.7 } } }, ctx).projeto;
  const [foto] = camadasDaImagem(projeto);
  const r = executarComando(projeto, { comando: "imagem.camadaComOutraMidia", parametros: { faixaId: foto.faixa.id, midiaId: "logo" } }, ctx);
  const [objeto, embaixo] = camadasDaImagem(r.projeto);
  assert.equal(objeto.clipe.midia_id, "logo");
  assert.deepEqual(objeto.clipe.transformacao, foto.clipe.transformacao);
  assert.equal(embaixo.clipe.id, foto.clipe.id);
  assert.deepEqual(r.selecao, [objeto.clipe.id]);
});

test("arrastar no painel Camadas põe a camada na posição, e a camada nova pode nascer num ponto", () => {
  const ctx = contexto();
  let projeto = vazio();
  const ids: string[] = [];
  for (const midiaId of ["foto", "logo", "foto"]) {
    const r = executarComando(projeto, { comando: "imagem.adicionarMidia", parametros: { midiaId } }, ctx);
    projeto = r.projeto;
    ids.unshift(r.selecao![0]);
  }
  const ordem = () => camadasDaImagem(projeto).map(({ clipe }) => clipe.id);
  assert.deepEqual(ordem(), ids);
  const faixaDe = (id: string) => camadasDaImagem(projeto).find(({ clipe }) => clipe.id === id)!.faixa.id;
  // A de cima vai para a posição 2 (a última); um número fora dos limites fica na ponta
  projeto = executarComando(projeto, { comando: "imagem.mover", parametros: { faixaId: faixaDe(ids[0]), para: 2 } }, ctx).projeto;
  assert.deepEqual(ordem(), [ids[1], ids[2], ids[0]]);
  projeto = executarComando(projeto, { comando: "imagem.mover", parametros: { faixaId: faixaDe(ids[0]), para: -5 } }, ctx).projeto;
  assert.deepEqual(ordem(), ids);
  assert.equal(projeto.faixas.at(-1)!.tipo, "principal");

  // A ferramenta Texto e as formas desenhadas mandam o lugar (e o tamanho) da camada nova
  const r = executarComando(projeto, { comando: "imagem.adicionarTexto", parametros: { texto: TEXTO_PADRAO, transformacao: { x: -0.25, y: 0.1 } } }, ctx);
  const t = camadasDaImagem(r.projeto)[0].clipe.transformacao;
  assert.deepEqual([t.x, t.y], [-0.25, 0.1]);
  const f = executarComando(r.projeto, { comando: "imagem.adicionarMidia", parametros: { midiaId: "logo", transformacao: { x: 0.2, escala: 0.3 } } }, ctx);
  const tf = camadasDaImagem(f.projeto)[0].clipe.transformacao;
  assert.deepEqual([tf.x, tf.y, tf.escala], [0.2, 0, 0.3]);
});

test("a imagem vai até 100 camadas, mais que as 30 faixas do vídeo, e recusa a seguinte com aviso", () => {
  const ctx = contexto();
  let projeto = vazio();
  for (let i = 0; i < 100; i++) projeto = executarComando(projeto, { comando: "imagem.adicionarTexto", parametros: { texto: TEXTO_PADRAO } }, ctx).projeto;
  assert.equal(camadasDaImagem(projeto).length, 100);
  // Mexer numa camada passa pelo finalizar do vídeo, que não pode cortar a imagem em 30
  const id = camadasDaImagem(projeto)[50].clipe.id;
  projeto = executarComando(projeto, { comando: "clipe.transformar", parametros: { clipeIds: [id], transformacao: { x: 0.1 } } }, ctx).projeto;
  assert.throws(() => executarComando(projeto, { comando: "imagem.adicionarTexto", parametros: { texto: TEXTO_PADRAO } }, ctx), /100 camadas/);
  assert.throws(() => executarComando(projeto, { comando: "imagem.duplicar", parametros: { faixaId: camadasDaImagem(projeto)[0].faixa.id } }, ctx), /100 camadas/);
});

test("transformar a camada: posição, escala, giro e virar num passo só; a posição travada recusa", () => {
  const ctx = contexto();
  const r = executarComando(vazio(), { comando: "imagem.adicionarMidia", parametros: { midiaId: "foto" } }, ctx);
  const clipeId = r.selecao![0];
  const projeto = executarComando(r.projeto, { comando: "imagem.transformarCamada", parametros: { clipeId, transformacao: { x: 0.1, escala: 2, rotacao: 270 }, virar: { horizontal: true, vertical: false } } }, ctx).projeto;
  const clipe = camadasDaImagem(projeto)[0].clipe;
  assert.equal(clipe.transformacao.x, 0.1);
  assert.equal(clipe.transformacao.escala, 2);
  assert.equal(clipe.transformacao.rotacao, -90);
  assert.deepEqual(clipe.virar, { horizontal: true, vertical: false });
  const travado = { ...projeto, faixas: projeto.faixas.map((faixa) => (faixa.clipes[0]?.id === clipeId ? { ...faixa, travas: { posicao: true } } : faixa)) };
  assert.throws(() => executarComando(travado, { comando: "imagem.transformarCamada", parametros: { clipeId, transformacao: { x: 0 } } }, ctx), /travada/);
});

test("girar a imagem 90°: o quadro troca de lado, as camadas giram em volta do meio e ficam do mesmo tamanho em pixels", () => {
  const ctx = contexto();
  let projeto: Projeto = { ...vazio(), tamanho: { largura: 1200, altura: 800, resolucao: 300 } };
  const r = executarComando(projeto, { comando: "imagem.adicionarMidia", parametros: { midiaId: "foto" } }, ctx);
  const clipeId = r.selecao![0];
  projeto = executarComando(r.projeto, { comando: "imagem.transformarCamada", parametros: { clipeId, transformacao: { x: 0.25, y: 0, escala: 0.5, rotacao: 10 } } }, ctx).projeto;
  const tamanhos = { foto: { largura: 600, altura: 400 } };
  const caixaAntes = caixaDoClipe(camadasDaImagem(projeto)[0].clipe.transformacao, camadasDaImagem(projeto)[0].clipe.recorte, tamanhos.foto, projeto.tamanho!);
  const girado = executarComando(projeto, { comando: "imagem.girar", parametros: { giro: "90", tamanhos } }, ctx).projeto;
  assert.deepEqual(girado.tamanho, { largura: 800, altura: 1200, resolucao: 300 });
  const clipe = camadasDaImagem(girado)[0].clipe;
  const caixa = caixaDoClipe(clipe.transformacao, clipe.recorte, tamanhos.foto, girado.tamanho!);
  // O centro estava 300 px à direita do meio: agora está 300 px abaixo
  assert.ok(Math.abs(caixa.cx - 400) < 1e-6 && Math.abs(caixa.cy - 900) < 1e-6, `${caixa.cx} ${caixa.cy}`);
  assert.ok(Math.abs(caixa.largura - caixaAntes.largura) < 1e-6);
  assert.equal(clipe.transformacao.rotacao, 100);
  // Virar a tela na horizontal: o lado troca e o giro inverte
  const virado = executarComando(projeto, { comando: "imagem.girar", parametros: { giro: "virarH", tamanhos } }, ctx).projeto;
  const v = camadasDaImagem(virado)[0].clipe;
  assert.equal(v.transformacao.x, -0.25);
  assert.equal(v.transformacao.rotacao, -10);
  assert.deepEqual(v.virar, { horizontal: true, vertical: false });
  // Um ângulo qualquer: o quadro cresce até caber
  const torto = executarComando(projeto, { comando: "imagem.girar", parametros: { giro: { graus: 30 }, tamanhos } }, ctx).projeto;
  assert.deepEqual(torto.tamanho, { largura: Math.round(1200 * Math.cos(Math.PI / 6) + 800 * 0.5), altura: Math.round(1200 * 0.5 + 800 * Math.cos(Math.PI / 6)), resolucao: 300 });
});

test("tamanho da tela com âncora e cor; tamanho da imagem troca as camadas de pixels", () => {
  const ctx = contexto();
  const projeto = { ...vazio(), tamanho: { largura: 1000, altura: 1000 } };
  const tela = executarComando(projeto, { comando: "imagem.tamanhoDaTela", parametros: { retangulo: { x: -200, y: 0, largura: 1200, altura: 1000 }, tamanhos: {}, fundo: { cor: "#000000", transparente: false } } }, ctx).projeto;
  assert.deepEqual(tela.tamanho, { largura: 1200, altura: 1000 });
  assert.equal(tela.fundo.cor, "#000000");
  const comPixels = {
    ...projeto,
    faixas: [{ id: "f", tipo: "video" as const, oculta: false, muda: false, travada: false, clipes: [{ ...camadasDaImagem(executarComando(projeto, { comando: "imagem.adicionarMidia", parametros: { midiaId: "foto" } }, ctx).projeto)[0].clipe, id: "px", pixels: { versao: 1 } }] }, ...projeto.faixas],
    canais: [{ id: "c1", nome: "Alfa 1", midia_id: "canal", versao: 1 }],
  };
  const novo = executarComando(comPixels, { comando: "imagem.tamanhoComPixels", parametros: { tamanho: { largura: 500, altura: 500, resolucao: 150 }, pixels: [{ id: "px", midiaId: "nova", versao: 1 }], canais: [{ id: "c1", midiaId: "canal2", versao: 1 }] } }, ctx).projeto;
  assert.deepEqual(novo.tamanho, { largura: 500, altura: 500, resolucao: 150 });
  assert.equal(camadasDaImagem(novo)[0].clipe.midia_id, "nova");
  assert.equal(novo.canais![0].midia_id, "canal2");
});
