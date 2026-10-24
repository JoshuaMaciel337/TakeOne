import assert from "node:assert/strict";
import { test } from "node:test";

import { MESCLAGENS } from "../projeto/modelo.ts";
import type { Mesclagem } from "../projeto/modelo.ts";
import {
  ajusteDoPsd,
  ajusteParaPsd,
  corDoPsd,
  corParaPsd,
  estiloDoPsd,
  estiloParaPsd,
  faixasDoPsd,
  type ItemDoPsd,
  mesclagemDoPsd,
  mesclagemParaPsd,
  rotuloDoPsd,
  rotuloParaPsd,
  travasDoPsd,
  travasParaPsd,
} from "./mapear.ts";

test("todo modo de mesclagem vai e volta igual", () => {
  for (const { id } of MESCLAGENS) assert.equal(mesclagemDoPsd(mesclagemParaPsd(id, false), false), id, id);
  assert.equal(mesclagemDoPsd("pass through", true), "passagem");
  // Passagem fora de um grupo e os modos do 3D ficam normais
  assert.equal(mesclagemDoPsd("pass through", false), "normal");
  assert.equal(mesclagemDoPsd("height", false), "normal");
  assert.equal(mesclagemDoPsd(undefined, true), "passagem");
  assert.equal(mesclagemParaPsd(undefined as Mesclagem | undefined, true), "pass through");
});

test("rótulos, travas e cores", () => {
  assert.equal(rotuloDoPsd("violet"), "violeta");
  assert.equal(rotuloDoPsd("none"), null);
  assert.equal(rotuloParaPsd("fucsia"), "violet");
  assert.equal(rotuloParaPsd("azul"), "blue");
  assert.deepEqual(travasDoPsd({ transparency: true, position: true }), { transparencia: true, posicao: true });
  assert.equal(travasDoPsd({}), null);
  assert.deepEqual(travasParaPsd({ travada: true }), { transparency: true, composite: true, position: true });
  assert.equal(travasParaPsd({ travada: false, travas: null }), undefined);
  assert.equal(corDoPsd({ r: 255, g: 128, b: 0 }), "#ff8000");
  assert.equal(corDoPsd({ fr: 1, fg: 0, fb: 0.5 }), "#ff0080");
  assert.equal(corDoPsd({ k: 100 }), "#000000");
  assert.deepEqual(corParaPsd("#0a141e"), { r: 10, g: 20, b: 30 });
});

test("os ajustes com par vão e voltam iguais", () => {
  const ajustes = [
    { tipo: "brilho_contraste", brilho: 30, contraste: -20, antigo: false },
    { tipo: "niveis", canais: { rgb: { preto: 10, branco: 240, gama: 1.2, saida_preto: 0, saida_branco: 255 }, b: { preto: 0, branco: 200, gama: 0.8, saida_preto: 5, saida_branco: 250 } } },
    { tipo: "curvas", canais: { rgb: { pontos: [[0, 0], [0.5, 0.6], [1, 1]] } } },
    { tipo: "exposicao", exposicao: 0.5, deslocamento: -0.01, gama: 1.1 },
    { tipo: "vibracao", vibracao: 40, saturacao: -10 },
    { tipo: "inverter" },
    { tipo: "posterizar", niveis: 6 },
    { tipo: "limiar", nivel: 100 },
  ] as const;
  for (const ajuste of ajustes) {
    const psd = ajusteParaPsd(ajuste as never);
    assert.ok(psd, ajuste.tipo);
    const volta = ajusteDoPsd(psd);
    if (ajuste.tipo === "curvas") assert.deepEqual(volta, { tipo: "curvas", canais: { rgb: { pontos: [[0, 0], [128 / 255, 153 / 255], [1, 1]] } } });
    else assert.deepEqual(volta, ajuste, ajuste.tipo);
  }
  // Sem par: os que o arquivo guardaria diferente
  assert.equal(ajusteParaPsd({ tipo: "curvas", canais: { rgb: { pontos: [], lapis: new Array(256).fill(0) } } }), null);
  assert.equal(ajusteParaPsd({ tipo: "mapa_degrade", cores: [], inverter: false }), null);
  assert.equal(ajusteDoPsd({ type: "gradient map" }), null);
});

test("os efeitos com par vão e voltam", () => {
  let n = 0;
  const novoId = () => `e${++n}`;
  const { estilo, faltaram } = estiloDoPsd(
    {
      dropShadow: [{ enabled: true, blendMode: "multiply", opacity: 0.5, color: { r: 0, g: 0, b: 255 }, angle: 45, distance: { units: "Pixels", value: 8 }, size: { units: "Pixels", value: 12 }, choke: { units: "Pixels", value: 20 } }],
      stroke: [
        { enabled: true, position: "inside", fillType: "color", size: { units: "Pixels", value: 4 }, color: { r: 255, g: 0, b: 0 }, opacity: 1, blendMode: "normal" },
        { enabled: true, fillType: "gradient" },
      ],
      bevel: {},
    },
    novoId,
  );
  assert.equal(faltaram, 2);
  assert.ok(estilo);
  const sombra = estilo.efeitos.find((e) => e.tipo === "sombra")!;
  assert.equal(sombra.cor, "#0000ff");
  assert.equal(sombra.distancia, 8);
  assert.equal(sombra.espalhar, 0.2);
  assert.equal(estilo.efeitos.find((e) => e.tipo === "tracado")!.posicao, "dentro");
  const volta = estiloParaPsd(estilo);
  assert.ok(volta);
  assert.equal(volta.dropShadow![0].distance!.value, 8);
  assert.equal(volta.dropShadow![0].choke!.value, 20);
  assert.equal(volta.stroke![0].position, "inside");
  // O chanfro não tem par: o estilo vai desenhado nos pixels
  assert.equal(estiloParaPsd({ efeitos: [{ ...sombra, tipo: "chanfro" }] }), null);
});

test("a árvore vira faixas com as pastas antes das de dentro", () => {
  let n = 0;
  const novoId = () => `i${++n}`;
  const comum = { oculta: false, opacidade: 1, mesclagem: "normal" as const, recortada: false, travas: null, rotulo: null, estilo: null, preenchimento: 1 };
  const itens: ItemDoPsd[] = [
    { ...comum, nome: "Título", tipo: "pixels", midiaId: "m1", versao: 1, mascara: null },
    {
      ...comum,
      nome: "Grupo",
      mesclagem: "passagem",
      tipo: "pasta",
      aberta: false,
      filhos: [
        { ...comum, nome: "Sombra", recortada: true, opacidade: 0.5, mesclagem: "multiplicar", tipo: "pixels", midiaId: "m2", versao: 2, mascara: { midia_id: "m3", versao: 1, ligada: true, densidade: 1, difusao: 0 } },
        { ...comum, nome: "Ajuste", tipo: "ajuste", ajuste: { tipo: "inverter" }, mascara: null },
      ],
    },
  ];
  const faixas = faixasDoPsd(itens, novoId, 100);
  assert.deepEqual(
    faixas.map((f) => f.nome),
    ["Título", "Grupo", "Sombra", "Ajuste"],
  );
  const grupo = faixas[1];
  assert.equal(grupo.clipes[0].pasta, true);
  assert.equal(grupo.clipes[0].mesclagem, "passagem");
  assert.equal(grupo.aberta, false);
  assert.equal(faixas[2].pai, grupo.id);
  assert.equal(faixas[2].recortada, true);
  assert.equal(faixas[2].clipes[0].transformacao.opacidade, 0.5);
  assert.deepEqual(faixas[2].clipes[0].mascara_pixels?.matriz, [1, 0, 0, 1, 0, 0]);
  assert.equal(faixas[3].clipes[0].ajuste, true);
  assert.equal(faixas[0].clipes[0].pixels?.versao, 1);
  assert.equal(faixas[0].clipes[0].mesclagem, undefined);
});
