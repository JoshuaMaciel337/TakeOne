import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aplicarMudanca,
  colunasDaGrade,
  contar,
  FILTRO_VAZIO,
  filtrarFotos,
  type FotoDoAlbum,
  linhasVisiveis,
  mudancaDaTecla,
  ordenarFotos,
  pastas,
  resumoDaCamera,
} from "./fotos.ts";

function foto(campos: Partial<FotoDoAlbum> & { midia_id: string }): FotoDoAlbum {
  return {
    nome: campos.midia_id,
    status: "pronta",
    erro: null,
    progresso: null,
    largura: 64,
    altura: 48,
    exif: null,
    pasta: "",
    nota: 0,
    cor: null,
    marcacao: null,
    enviado_em: null,
    do_album: true,
    ...campos,
  };
}

const FOTOS = [
  foto({ midia_id: "a", nome: "IMG_10", nota: 5, cor: "verde", marcacao: "escolhida", exif: { data: "2026-05-10T15:00:00", camera: "Câmera B" }, pasta: "Festa" }),
  foto({ midia_id: "b", nome: "IMG_2", nota: 3, exif: { data: "2026-05-10T14:00:00" }, pasta: "Cerimônia" }),
  foto({ midia_id: "c", nome: "IMG_1", nota: 0, marcacao: "rejeitada", enviado_em: "2026-11-04T10:00:00", pasta: "Cerimônia" }),
  foto({ midia_id: "d", nome: "Making of", status: "processando", cor: "azul", enviado_em: "2026-11-04T09:00:00" }),
];

test("filtrar pela nota, pela cor, pela marcação, pela pasta e pela busca sem acento", () => {
  const ids = (filtro: Partial<typeof FILTRO_VAZIO>) => filtrarFotos(FOTOS, { ...FILTRO_VAZIO, ...filtro }).map((f) => f.midia_id);
  assert.deepEqual(ids({}), ["a", "b", "c", "d"]);
  assert.deepEqual(ids({ nota: 3 }), ["a", "b"]);
  assert.deepEqual(ids({ nota: 3, comparacao: "exatamente" }), ["b"]);
  assert.deepEqual(ids({ nota: 3, comparacao: "ate" }), ["b", "c", "d"]);
  assert.deepEqual(ids({ cores: ["verde", "azul"] }), ["a", "d"]);
  assert.deepEqual(ids({ marcacao: "escolhida" }), ["a"]);
  assert.deepEqual(ids({ marcacao: "sem" }), ["b", "d"]);
  assert.deepEqual(ids({ pasta: "Cerimônia" }), ["b", "c"]);
  assert.deepEqual(ids({ busca: "cerimonia" }), ["b", "c"]);
  assert.deepEqual(ids({ busca: "camera b" }), ["a"]);
});

test("ordenar pela hora da foto, pelo nome (números pelo valor), pelo envio e pela nota", () => {
  const ids = (ordem: Parameters<typeof ordenarFotos>[1]) => ordenarFotos(FOTOS, ordem).map((f) => f.midia_id);
  // Com hora antes; sem hora, pela ordem de envio
  assert.deepEqual(ids("captura"), ["b", "a", "d", "c"]);
  assert.deepEqual(ids("nome"), ["d", "c", "b", "a"]);
  assert.deepEqual(ids("envio"), ["d", "c", "b", "a"]);
  assert.deepEqual(ids("nota"), ["a", "b", "d", "c"]);
});

test("contar e listar as pastas", () => {
  assert.deepEqual(contar(FOTOS), { total: 4, prontas: 3, processando: 1, erros: 0, escolhidas: 1, rejeitadas: 1, comNota: 2 });
  assert.deepEqual(pastas(FOTOS), [{ pasta: "", fotos: 1 }, { pasta: "Cerimônia", fotos: 2 }, { pasta: "Festa", fotos: 1 }]);
});

test("as teclas da grade", () => {
  assert.deepEqual(mudancaDaTecla("4"), { nota: 4 });
  assert.deepEqual(mudancaDaTecla("0"), { nota: 0 });
  assert.deepEqual(mudancaDaTecla("8"), { cor: "verde" });
  // A mesma cor de novo tira a cor
  assert.deepEqual(mudancaDaTecla("8", { cor: "verde" }), { tirar_cor: true });
  assert.deepEqual(mudancaDaTecla("P"), { marcacao: "escolhida" });
  assert.deepEqual(mudancaDaTecla("x"), { marcacao: "rejeitada" });
  assert.deepEqual(mudancaDaTecla("u"), { tirar_marcacao: true });
  assert.equal(mudancaDaTecla("7".repeat(2)), null);
  assert.equal(mudancaDaTecla("a"), null);
  const mudada = aplicarMudanca(FOTOS[0], { tirar_cor: true, nota: 2 });
  assert.deepEqual([mudada.nota, mudada.cor, mudada.marcacao], [2, null, "escolhida"]);
});

test("a grade virtual: colunas e as linhas que aparecem", () => {
  assert.equal(colunasDaGrade(1000, 180, 8), 5);
  assert.equal(colunasDaGrade(100, 180, 8), 1);
  // 300 linhas de 200 px, rolada até 4000 numa janela de 800: da 19 à 25
  assert.deepEqual(linhasVisiveis(4000, 800, 200, 300), [19, 25]);
  assert.deepEqual(linhasVisiveis(0, 800, 200, 2), [0, 2]);
});

test("o resumo da câmera", () => {
  assert.equal(resumoDaCamera({ iso: 800, abertura: 2.8, exposicao: 0.004, focal: 50 }), "ISO 800 · f/2.8 · 1/250 s · 50 mm");
  assert.equal(resumoDaCamera({ exposicao: 2 }), "2 s");
  assert.equal(resumoDaCamera(null), "");
});

test("as medidas em palavras", async () => {
  const { posicaoDoFoco, exposicaoEmPalavras, rostoPrincipal } = await import("./fotos.ts");
  const medidas = (melhor: number, extra: Partial<import("./fotos.ts").Medidas> = {}) => ({
    versao: 1,
    foco: { geral: melhor / 2, melhor_bloco: melhor },
    exposicao: { mediana: 0.45, estourado: 0, afogado: 0.01 },
    rostos: [],
    com_vetor_do_modelo: true,
    ...extra,
  });
  const fotos = [10, 50, 90, 200].map((v, i) => foto({ midia_id: `f${i}`, medidas: medidas(v) }));
  assert.equal(posicaoDoFoco(fotos[0], fotos), 0);
  assert.equal(posicaoDoFoco(fotos[3], fotos), 1);
  assert.equal(posicaoDoFoco(foto({ midia_id: "x" }), fotos), null);
  assert.equal(exposicaoEmPalavras(medidas(1)), "boa");
  assert.equal(exposicaoEmPalavras(medidas(1, { exposicao: { mediana: 0.9, estourado: 0.2, afogado: 0 } })), "estourada");
  assert.equal(exposicaoEmPalavras(medidas(1, { exposicao: { mediana: 0.1, estourado: 0, afogado: 0.4 } })), "escura");
  const rosto = { caixa: [0, 0, 0.2, 0.2] as [number, number, number, number], confianca: 0.9, foco: 100 };
  assert.equal(rostoPrincipal(medidas(1)), null);
  const piscando = rostoPrincipal(medidas(1, { rostos: [{ ...rosto, olho_esq: 0.24, olho_dir: 0.32, sorriso: 0.83, olhando: 0.2 }] }))!;
  assert.deepEqual([piscando.olhosFechados, piscando.sorrindo, piscando.olhando], [true, true, false]);
  const aberto = rostoPrincipal(medidas(1, { rostos: [{ ...rosto, olho_esq: 0.74, olho_dir: 0.76, sorriso: 0.1, olhando: 0.7 }] }))!;
  assert.deepEqual([aberto.olhosFechados, aberto.sorrindo, aberto.olhando], [false, false, true]);
});

test("as categorias da escolha: filtro, ordem e contagem", async () => {
  const { contarCategorias } = await import("./fotos.ts");
  const comCategoria = [
    foto({ midia_id: "a", categoria: "destaque", nota_ia: 90 }),
    foto({ midia_id: "b", categoria: "parecida", nota_ia: 70 }),
    foto({ midia_id: "c", categoria: "desfocada", nota_ia: 20 }),
    foto({ midia_id: "d" }),
  ];
  assert.deepEqual(filtrarFotos(comCategoria, { ...FILTRO_VAZIO, categorias: ["destaque", "parecida"] }).map((f) => f.midia_id), ["a", "b"]);
  assert.deepEqual(ordenarFotos(comCategoria, "nota_ia").map((f) => f.midia_id), ["a", "b", "c", "d"]);
  assert.deepEqual(contarCategorias(comCategoria), { destaque: 1, parecida: 1, desfocada: 1 });
});
