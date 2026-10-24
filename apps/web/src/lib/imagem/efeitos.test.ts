import assert from "node:assert/strict";
import { test } from "node:test";

import { caixasDaGaussiana, type Campo, campoDoEfeito, contextoDoAlfa, desfocar, distancias, tabelaDoContorno } from "./efeitos.ts";
import { CONTORNOS_PRONTOS, efeitoPadrao, LUZ_GLOBAL_PADRAO } from "./estiloDeCamada.ts";

/** Um quadrado opaco de `lado` no meio de um campo `n` × `n`. */
function quadrado(n: number, lado: number): Campo {
  const dados = new Float32Array(n * n);
  const a = Math.floor((n - lado) / 2);
  for (let y = a; y < a + lado; y++) for (let x = a; x < a + lado; x++) dados[y * n + x] = 1;
  return { largura: n, altura: n, dados };
}
const no = (campo: Campo, x: number, y: number) => campo.dados[y * campo.largura + x];
const soma = (campo: Campo) => campo.dados.reduce((s, v) => s + v, 0);

test("as três caixas somam a variância da gaussiana, e o desfoque guarda a massa longe das bordas", () => {
  for (const sigma of [2.5, 4, 7]) {
    const variancia = caixasDaGaussiana(sigma).reduce((s, n) => s + (n * n - 1) / 12, 0);
    assert.ok(Math.abs(Math.sqrt(variancia) - sigma) / sigma < 0.1, `sigma ${sigma}: ${Math.sqrt(variancia)}`);
  }
  // Um ponto desfocado: o desvio medido é o pedido (o exato abaixo de 2,5 e as caixas acima)
  for (const sigma of [1, 2, 4]) {
    const linha = desfocar({ largura: 41, altura: 41, dados: (() => {
      const d = new Float32Array(41 * 41);
      d[20 * 41 + 20] = 1;
      return d;
    })() }, sigma);
    let m2 = 0;
    let total = 0;
    for (let x = 0; x < 41; x++) {
      const v = no(linha, x, 20);
      m2 += v * (x - 20) ** 2;
      total += v;
    }
    assert.ok(Math.abs(Math.sqrt(m2 / total) - sigma) / sigma < 0.1, `desvio medido ${Math.sqrt(m2 / total)} para ${sigma}`);
  }
  const q = quadrado(60, 10);
  const borrado = desfocar(q, 3);
  assert.ok(Math.abs(soma(borrado) - soma(q)) < 0.5, "a massa fica");
  assert.ok(no(borrado, 30, 30) < 1 && no(borrado, 30, 30) > 0.8 && no(borrado, 22, 30) > 0.02);
});

test("as distâncias até a borda, por fora e por dentro", () => {
  const q = quadrado(30, 10); // de 10 a 19
  const { fora, dentro } = distancias(q);
  assert.equal(fora[15 * 30 + 15], 0);
  assert.equal(fora[15 * 30 + 22], 2.5, "três pixels para fora da coluna 19: 2,5 da borda");
  assert.equal(dentro[15 * 30 + 12], 2.5);
  assert.equal(dentro[15 * 30 + 25], 0);
});

test("o contorno linear não muda nada; o cone sobe e desce", () => {
  const linear = tabelaDoContorno(null);
  assert.ok(Math.abs(linear[128] - 128 / 255) < 1e-6);
  const cone = tabelaDoContorno(CONTORNOS_PRONTOS[1]);
  assert.ok(cone[128] > 0.98 && cone[0] < 0.01 && cone[255] < 0.01);
});

test("traçado por fora, por dentro e no centro", () => {
  const q = quadrado(40, 10); // de 15 a 24
  const ctx = contextoDoAlfa(q, 1, 0, LUZ_GLOBAL_PADRAO);
  const fora = campoDoEfeito({ ...efeitoPadrao("tracado", "a"), tamanho: 3, posicao: "fora" }, ctx).cobertura;
  assert.equal(no(fora, 26, 20), 1, "dois pixels para fora: dentro do traço");
  assert.equal(no(fora, 29, 20), 0, "cinco pixels para fora: fora do traço");
  assert.equal(no(fora, 20, 20), 0, "o traço de fora não cobre o conteúdo");
  const dentro = campoDoEfeito({ ...efeitoPadrao("tracado", "b"), tamanho: 3, posicao: "dentro" }, ctx).cobertura;
  assert.equal(no(dentro, 23, 20), 1);
  assert.equal(no(dentro, 19, 20), 0);
  const centro = campoDoEfeito({ ...efeitoPadrao("tracado", "c"), tamanho: 4, posicao: "centro" }, ctx).cobertura;
  assert.equal(no(centro, 25, 20), 1);
  assert.equal(no(centro, 24, 20), 1);
});

test("a sombra vai para longe da luz e não aparece por baixo da camada", () => {
  const q = quadrado(60, 16);
  const ctx = contextoDoAlfa(q, 1, 0, LUZ_GLOBAL_PADRAO);
  // Luz de cima (90°): a sombra desce
  const s = campoDoEfeito({ ...efeitoPadrao("sombra", "s"), luz_global: false, angulo: 90, distancia: 6, tamanho: 2 }, ctx).cobertura;
  let cy = 0;
  let total = 0;
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
    cy += y * no(s, x, y);
    total += no(s, x, y);
  }
  assert.ok(cy / total > 30 + 6, `o meio da sombra fica embaixo: ${cy / total}`);
  assert.equal(no(s, 30, 30), 0, "vazada pela camada");
  // Com o giro da camada de 90° (horário), a mesma luz da imagem empurra para o lado no campo da camada
  const girada = campoDoEfeito({ ...efeitoPadrao("sombra", "s"), luz_global: false, angulo: 90, distancia: 6, tamanho: 2 }, contextoDoAlfa(q, 1, 90, LUZ_GLOBAL_PADRAO)).cobertura;
  let cx = 0;
  total = 0;
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
    cx += x * no(girada, x, y);
    total += no(girada, x, y);
  }
  assert.ok(Math.abs(cx / total - 30) > 3, `no campo girado a sombra anda em x: ${cx / total}`);
});

test("sombra interna fica dentro, do lado da luz", () => {
  const q = quadrado(50, 20); // de 15 a 34
  const ctx = contextoDoAlfa(q, 1, 0, LUZ_GLOBAL_PADRAO);
  const s = campoDoEfeito({ ...efeitoPadrao("sombra_interna", "i"), luz_global: false, angulo: 90, distancia: 4, tamanho: 2 }, ctx).cobertura;
  assert.ok(no(s, 25, 16) > 0.5, "junto da borda de cima (a luz vem de cima)");
  assert.ok(no(s, 25, 33) < 0.1, "a de baixo fica limpa");
  assert.equal(no(s, 5, 5), 0, "nada fora da camada");
});

test("chanfro interno com a luz da esquerda: realce na borda da esquerda, sombra na da direita", () => {
  const q = quadrado(60, 30); // de 15 a 44
  const ctx = contextoDoAlfa(q, 1, 0, LUZ_GLOBAL_PADRAO);
  const { realce, sombra } = campoDoEfeito({ ...efeitoPadrao("chanfro", "c"), luz_global: false, angulo: 180, altitude: 30, tamanho: 6, tecnica: "cinzel_duro" }, ctx);
  assert.ok(no(realce!, 17, 30) > 0.3 && no(sombra!, 17, 30) === 0, `esquerda: ${no(realce!, 17, 30)}`);
  assert.ok(no(sombra!, 42, 30) > 0.3 && no(realce!, 42, 30) === 0, `direita: ${no(sombra!, 42, 30)}`);
  assert.equal(no(realce!, 30, 30), 0, "o meio é plano");
  assert.equal(no(realce!, 5, 30) + no(sombra!, 5, 30), 0, "o interno não sai da forma");
});
