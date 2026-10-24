import assert from "node:assert/strict";
import { test } from "node:test";

import { cantosDoGlifo, disporTexto, type FonteCarregada, matrizDoGlifo, pontosDeHifen } from "./layout.ts";
import { aplicarEstilo, textoNovo } from "./modelo.ts";
import { medirTexto } from "./medida.ts";

/** Uma fonte de mentira: 1000 unidades, cada letra 500 de avanço (o espaço 250), "fi" vira uma ligadura. */
const fonte: FonteCarregada = {
  chave: "teste",
  unidades: 1000,
  ascendente: 800,
  descendente: -200,
  sublinhado: { posicao: -100, espessura: 50 },
  tachado: { posicao: 300, espessura: 50 },
  temRecurso: () => false,
  formatar(texto, recursos) {
    const glifos = [];
    for (let i = 0; i < texto.length; i++) {
      const liga = recursos.liga && texto[i] === "f" && texto[i + 1] === "i";
      const espaco = texto[i] === " ";
      glifos.push({ id: texto.charCodeAt(i), avanco: liga ? 800 : espaco ? 250 : 500, dx: 0, dy: 0, letras: liga ? 2 : 1, caminho: () => "", caixa: espaco ? { x0: 0, y0: 0, x1: 0, y1: 0 } : { x0: 50, y0: 0, x1: 450, y1: 700 } });
      if (liga) i++;
    }
    return glifos;
  },
};
const fontes = () => fonte;

test("texto de ponto: os glifos em fila a partir da origem, os cursores e a tinta", () => {
  const texto = textoNovo("ab cd", { tamanho: 10 });
  const d = disporTexto(texto, fontes);
  assert.deepEqual(d.glifos.map((g) => g.x), [0, 5, 10, 12.5, 17.5]);
  assert.deepEqual(d.cursores.map((c) => c.x), [0, 5, 10, 12.5, 17.5, 22.5]);
  assert.deepEqual(d.limites, { x0: 0.5, y0: -7, x1: 22, y1: 0 });
  // Centralizado, a origem fica no meio da linha
  const centro = disporTexto({ ...texto, paragrafo: { ...texto.paragrafo, alinhamento: "centro" } }, fontes);
  assert.equal(centro.glifos[0].x, -11.25);
});

test("a ligadura reparte o cursor; a caixa alta troca as letras", () => {
  const d = disporTexto(textoNovo("fim", { tamanho: 10 }), fontes);
  assert.equal(d.glifos.length, 2);
  assert.deepEqual(d.cursores.map((c) => c.x), [0, 4, 8, 13]);
  const sem = disporTexto(textoNovo("fim", { tamanho: 10, ligaduras: false }), fontes);
  assert.equal(sem.glifos.length, 3);
  const altas = disporTexto(textoNovo("ab", { caixa: "maiusculas" }), fontes);
  assert.deepEqual(altas.glifos.map((g) => g.glifo.id), [65, 66]);
});

test("texto de parágrafo: quebra nas palavras, justifica e hifeniza", () => {
  const base = { ...textoNovo("aa bb cc dd", { tamanho: 10 }, "paragrafo"), caixa: { largura: 26, altura: 100 } };
  const d = disporTexto(base, fontes);
  assert.equal(d.linhas.length, 2);
  assert.deepEqual(d.linhas.map((l) => [l.inicio, l.fim]), [[0, 6], [6, 11]]);
  // A segunda linha fica uma entrelinha (120%) abaixo
  assert.equal(d.linhas[1].baseY - d.linhas[0].baseY, 12);
  const justificado = disporTexto({ ...base, paragrafo: { ...base.paragrafo, alinhamento: "justificado-esquerda" } }, fontes);
  const ultimaDaPrimeira = justificado.glifos.filter((g) => g.indice < 5).at(-1)!;
  assert.ok(Math.abs(ultimaDaPrimeira.x + 5 - 26) < 1e-9, "a primeira linha vai até a borda");
  // Hifenizar: "palavra" não cabe e é cortada em "pala-"
  const hifen = disporTexto({ ...textoNovo("x palavra", { tamanho: 10 }, "paragrafo"), caixa: { largura: 33, altura: 100 }, paragrafo: { ...base.paragrafo, hifenizar: true } }, fontes);
  assert.equal(hifen.linhas.length, 2);
  assert.equal(hifen.glifos.filter((g) => g.y === hifen.linhas[0].baseY).at(-1)!.glifo.id, "-".charCodeAt(0));
  assert.equal(hifen.linhas[1].inicio, 6, "a segunda linha começa em \"vra\"");
  assert.deepEqual(pontosDeHifen("palavra"), [2, 4]);
  assert.deepEqual(pontosDeHifen("cabra"), [2]);
});

test("os parágrafos têm a entrelinha e os espaços; o sublinhado segue o trecho", () => {
  let texto = textoNovo("ab\ncd", { tamanho: 10 });
  texto = { ...texto, paragrafo: { ...texto.paragrafo, espacoDepois: 4 } };
  texto = aplicarEstilo(texto, 3, 5, { sublinhado: true });
  const d = disporTexto(texto, fontes);
  assert.equal(d.linhas[1].baseY, 16);
  assert.deepEqual(d.riscos.map((r) => [r.x0, r.x1, r.y]), [[0, 5, 17], [5, 10, 17]]);
});

test("a caixa do texto de ponto cobre as linhas com folga, e a origem fica onde a primeira linha de base começa", () => {
  const texto = textoNovo("ab cd", { tamanho: 10 });
  const medida = medirTexto(texto, disporTexto(texto, fontes));
  // A linha vai de x 0 a 22,5 e de y −8 (a subida) a 2 (a descida); a folga é 2
  assert.deepEqual(medida, { caixa: { largura: 26.5, altura: 14 }, origem: { x: 2, y: 10 } });
});

test("ponto em parágrafo e de volta: as quebras da caixa viram quebras de verdade e o começo fica no lugar", async () => {
  const { converterModo } = await import("./converter.ts");
  const base = { ...textoNovo("aa bb cc dd", { tamanho: 10 }, "paragrafo"), caixa: { largura: 26, altura: 100 } };
  const ponto = converterModo(base, fontes);
  assert.equal(ponto.texto.modo, "ponto");
  assert.deepEqual(ponto.texto.paragrafos.map((p) => p.trechos.map((t) => t.texto).join("")), ["aa bb", "cc dd"]);
  // O começo da primeira linha: (0, 8) na caixa de parágrafo, a origem (folga) no ponto
  assert.deepEqual(ponto.deslocamento, { x: ponto.texto.origem.x - 0, y: ponto.texto.origem.y - 8 });
  const volta = converterModo(ponto.texto, fontes);
  assert.equal(volta.texto.modo, "paragrafo");
  assert.equal(disporTexto(volta.texto, fontes).linhas.length, 2, "a caixa nova cabe as linhas, sem quebrar de novo");
  // Hifenizado: a quebra no meio da palavra ganha o hífen
  const hifen = converterModo({ ...textoNovo("abcdefgh", { tamanho: 10 }, "paragrafo"), caixa: { largura: 22, altura: 100 } }, fontes);
  assert.ok(hifen.texto.paragrafos.length > 1 && hifen.texto.paragrafos[0].trechos[0].texto.endsWith("-"));
});

test("texto vertical: as colunas da direita para a esquerda e a caixa do tamanho delas", () => {
  const texto = { ...textoNovo("abc\nd", { tamanho: 10 }), orientacao: "vertical" as const };
  const d = disporTexto(texto, fontes);
  assert.equal(d.linhas.length, 2);
  assert.ok(d.linhas[1].baseX < d.linhas[0].baseX, "a segunda coluna fica à esquerda");
  const { caixa } = medirTexto(texto, d);
  // Três letras de 10 de altura (a primeira coluna) e duas colunas de 12 (a entrelinha) de largura, mais a folga
  assert.ok(caixa.altura < 3 * 12 + 2 * 3, `altura ${caixa.altura}`);
  assert.ok(caixa.largura < 2 * 12 + 10 + 2 * 3, `largura ${caixa.largura}`);
});

test("texto dentro de uma forma: cada linha quebra no trecho de dentro do triângulo", async () => {
  const { intervalosNaAltura } = await import("./caminho.ts");
  const triangulo = [{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const texto = {
    ...textoNovo("aa bb cc dd ee ff gg hh ii jj kk ll mm nn oo pp qq rr ss tt uu vv", { tamanho: 10 }, "paragrafo"),
    caixa: { largura: 100, altura: 100 },
    caminho: { tipo: "area" as const, nos: triangulo, fechado: true, inicio: 0, inverter: false },
  };
  const d = disporTexto(texto, fontes);
  assert.ok(d.linhas.length >= 4);
  // As linhas de baixo são mais largas, e toda letra fica dentro do triângulo na altura da linha
  assert.ok(d.linhas[d.linhas.length - 2].largura > d.linhas[0].largura);
  for (const linha of d.linhas) {
    const [x0, x1] = intervalosNaAltura(triangulo, linha.baseY)[0] ?? [0, 0];
    assert.ok(linha.baseX >= x0 - 1e-6 && linha.baseX + linha.largura <= x1 + 1e-6, `linha em ${linha.baseY}: ${linha.baseX}..${linha.baseX + linha.largura} fora de ${x0}..${x1}`);
  }
});

test("toque no texto: a letra gira em volta do meio dela e anda para o lado sem empurrar as seguintes", () => {
  const texto = aplicarEstilo(textoNovo("ab", { tamanho: 10 }), 0, 1, { giro: 90, deslocamento: 3 });
  const d = disporTexto(texto, fontes);
  // O "a" anda 3 px; o "b" fica onde estava
  assert.deepEqual(d.glifos.map((g) => g.x), [3, 5]);
  // A caixa do "a" (0,5 a 4,5 por 0 a 7, com o meio em 5,5 por -3,5) girada 90° em volta do meio
  const cantos = cantosDoGlifo(d.glifos[0]).map((p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]);
  assert.deepEqual(cantos, [[9, -5.5], [9, -1.5], [2, -1.5], [2, -5.5]]);
  // O meio não sai do lugar
  const m = matrizDoGlifo(d.glifos[0]);
  const meio = { x: m.a * 250 + m.c * 350 + m.e, y: m.b * 250 + m.d * 350 + m.f };
  assert.ok(Math.abs(meio.x - 5.5) < 1e-9 && Math.abs(meio.y + 3.5) < 1e-9);
  // A medida acompanha a letra girada
  assert.deepEqual(d.limites, { x0: 2, y0: -7, x1: 9.5, y1: 0 });
  // Sem giro, a matriz é a de sempre
  const reta = matrizDoGlifo(disporTexto(textoNovo("a", { tamanho: 10 }), fontes).glifos[0]);
  assert.deepEqual(reta, { a: 0.01, b: 0, c: 0, d: -0.01, e: 0, f: 0 });
});
