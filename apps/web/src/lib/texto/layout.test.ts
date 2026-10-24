import assert from "node:assert/strict";
import { test } from "node:test";

import { disporTexto, type FonteCarregada, pontosDeHifen } from "./layout.ts";
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
