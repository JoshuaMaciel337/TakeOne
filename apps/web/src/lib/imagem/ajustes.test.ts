import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ajustePadrao,
  aplicarAjusteNosPixels,
  type AjusteDaImagem,
  cinzaDoPretoBranco,
  compilarAjuste,
  deHsl,
  emHsl,
  pesoDaFaixa,
  quantidadesDaSeletiva,
  type Rgb,
  type TipoDoAjuste,
  valorDosNiveis,
} from "./ajustes.ts";

const perto = (a: number, b: number, folga = 1e-6) => assert.ok(Math.abs(a - b) <= folga, `${a} ≠ ${b}`);
/** O ajuste num pixel de 8 bits, pelo mesmo caminho dos pixels. */
function num(a: AjusteDaImagem, cor: [number, number, number]): [number, number, number] {
  const dados = new Uint8ClampedArray([...cor, 255]);
  aplicarAjusteNosPixels(dados, compilarAjuste(a));
  return [dados[0], dados[1], dados[2]];
}

test("os padrões não mudam a imagem (menos os que existem para mudar)", () => {
  const neutros: TipoDoAjuste[] = ["brilho_contraste", "niveis", "curvas", "exposicao", "vibracao", "matiz_saturacao", "equilibrio", "filtro_de_fotos", "mixer", "pesquisa", "cor_seletiva"];
  const cores: [number, number, number][] = [[0, 0, 0], [255, 255, 255], [200, 30, 90], [12, 140, 250], [128, 128, 128]];
  for (const tipo of neutros) {
    const padrao = ajustePadrao(tipo);
    // O filtro de fotos parte com 25%: sem densidade, nada muda
    const a = tipo === "filtro_de_fotos" ? { ...padrao, densidade: 0 } : padrao;
    for (const cor of cores) {
      const saida = num(a, cor);
      saida.forEach((v, k) => assert.ok(Math.abs(v - cor[k]) <= 1, `${tipo} ${cor} → ${saida}`));
    }
  }
});

test("HSL vai e volta", () => {
  for (const cor of [[0.2, 0.5, 0.9], [1, 0, 0], [0.3, 0.3, 0.3], [0.9, 0.8, 0.1]] as Rgb[]) {
    const [h, s, l] = emHsl(cor);
    deHsl(h, s, l).forEach((v, k) => perto(v, cor[k], 1e-9));
  }
});

test("níveis: preto, branco e gama de entrada e a saída", () => {
  const n = { preto: 50, branco: 200, gama: 1, saida_preto: 0, saida_branco: 255 };
  perto(valorDosNiveis(n, 50 / 255), 0);
  perto(valorDosNiveis(n, 200 / 255), 1);
  perto(valorDosNiveis(n, 125 / 255), 0.5);
  perto(valorDosNiveis({ ...n, gama: 2 }, 125 / 255), Math.SQRT1_2);
  perto(valorDosNiveis({ preto: 0, branco: 255, gama: 1, saida_preto: 20, saida_branco: 220 }, 1), 220 / 255);
  // O canal depois do RGB: o branco do vermelho em 128 dobra o vermelho
  assert.deepEqual(num({ tipo: "niveis", canais: { r: { preto: 0, branco: 128, gama: 1, saida_preto: 0, saida_branco: 255 } } }, [64, 64, 64]), [128, 64, 64]);
});

test("posterizar, limiar, inverter e mapa de degradê são exatos nos 8 bits", () => {
  const dois = { tipo: "posterizar" as const, niveis: 2 };
  assert.deepEqual(num(dois, [127, 128, 0]), [0, 255, 0]);
  assert.deepEqual(num({ tipo: "posterizar", niveis: 4 }, [63, 64, 255]), [0, 85, 255]);
  // Limiar pela luminância: o vermelho puro (76) fica preto, o verde puro (150) fica branco
  assert.deepEqual(num({ tipo: "limiar", nivel: 128 }, [255, 0, 0]), [0, 0, 0]);
  assert.deepEqual(num({ tipo: "limiar", nivel: 128 }, [0, 255, 0]), [255, 255, 255]);
  assert.deepEqual(num({ tipo: "inverter" }, [10, 200, 255]), [245, 55, 0]);
  const mapa = { tipo: "mapa_degrade" as const, cores: [{ posicao: 0, cor: "#ff0000" }, { posicao: 1, cor: "#0000ff" }], inverter: false };
  assert.deepEqual(num(mapa, [0, 0, 0]), [255, 0, 0]);
  assert.deepEqual(num(mapa, [255, 255, 255]), [0, 0, 255]);
  assert.deepEqual(num({ ...mapa, inverter: true }, [0, 0, 0]), [0, 0, 255]);
});

test("preto e branco: o cinza pelos pesos da cor primária e da secundária", () => {
  const pesos = { vermelhos: 40, amarelos: 60, verdes: 40, cianos: 60, azuis: 20, magentas: 80 };
  perto(cinzaDoPretoBranco(pesos, [1, 0, 0]), 0.4);
  perto(cinzaDoPretoBranco(pesos, [1, 1, 0]), 0.6);
  perto(cinzaDoPretoBranco(pesos, [1, 1, 1]), 1);
  perto(cinzaDoPretoBranco(pesos, [0, 0, 1]), 0.2);
  // Com tonalizar, a cor sai no matiz pedido com a luminosidade do cinza
  const [h, , l] = emHsl(deHsl(42, 0.2, 0.6));
  perto(h, 42, 1e-6);
  perto(l, 0.6, 1e-9);
});

test("o peso das faixas sobe, fica e desce, inclusive nos vermelhos que passam do 360", () => {
  const vermelhos: [number, number, number, number] = [315, 345, 15, 45];
  perto(pesoDaFaixa(0, vermelhos), 1);
  perto(pesoDaFaixa(330, vermelhos), 0.5);
  perto(pesoDaFaixa(30, vermelhos), 0.5);
  perto(pesoDaFaixa(90, vermelhos), 0);
  perto(pesoDaFaixa(120, [75, 105, 135, 165]), 1);
});

test("matiz/saturação: o mestre gira e a faixa só mexe na cor dela", () => {
  const girado = num({ ...ajustePadrao("matiz_saturacao"), mestre: { matiz: 120, saturacao: 0, luminosidade: 0 } } as AjusteDaImagem, [255, 0, 0]);
  assert.deepEqual(girado, [0, 255, 0]);
  const soAzuis = { ...ajustePadrao("matiz_saturacao"), faixas: { azuis: { matiz: 0, saturacao: -100, luminosidade: 0, limites: [195, 225, 255, 285] as [number, number, number, number] } } } as AjusteDaImagem;
  assert.deepEqual(num(soAzuis, [255, 0, 0]), [255, 0, 0]);
  assert.deepEqual(num(soAzuis, [0, 0, 255]), [128, 128, 128]);
});

test("mixer de canais troca e soma os canais", () => {
  const trocado = { ...ajustePadrao("mixer"), vermelho: { r: 0, g: 0, b: 100, constante: 0 }, azul: { r: 100, g: 0, b: 0, constante: 0 } } as AjusteDaImagem;
  const [r, g, b] = num(trocado, [200, 100, 20]);
  assert.ok(Math.abs(r - 20) <= 1 && Math.abs(g - 100) <= 1 && Math.abs(b - 200) <= 1);
});

test("cor seletiva: o vermelho puro perde o canal com ciano absoluto", () => {
  const q = quantidadesDaSeletiva([1, 0, 0]);
  perto(q.vermelhos, 1);
  perto(q.neutros, 0);
  const a = { tipo: "cor_seletiva" as const, absoluto: true, cores: { vermelhos: { ciano: 100, magenta: 0, amarelo: 0, preto: 0 } } };
  assert.ok(num(a, [255, 0, 0])[0] <= 2);
  // No relativo, o que não tem tinta (o branco) não muda
  assert.deepEqual(num({ ...a, absoluto: false, cores: { brancos: { ciano: 100, magenta: 100, amarelo: 100, preto: 0 } } }, [255, 255, 255]), [255, 255, 255]);
});

test("a seleção mistura com o de antes", () => {
  const dados = new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 255]);
  aplicarAjusteNosPixels(dados, compilarAjuste({ tipo: "inverter" }), new Float32Array([1, 0.5]));
  assert.deepEqual([...dados], [155, 155, 155, 255, 128, 128, 128, 255]);
});
