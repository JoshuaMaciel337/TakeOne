import assert from "node:assert/strict";
import { test } from "node:test";

import { corDoEstilo, corDoXmp, ESTILO_NEUTRO, ESTILOS_PRONTOS, melhoradosConsistentes, nomeDoXmp } from "./estilos.ts";

test("a cor de um estilo: intensidade, gosto, melhorar e os modos dos controles", () => {
  const estilo = { ...ESTILO_NEUTRO, cor: { contraste: 0.2, saturacao: -0.4, matiz_claros: 40, forca_claros: 0.5, filtro: "quente", intensidade: 1 }, intensidade: 0.5 };
  assert.deepEqual(corDoEstilo(estilo), { contraste: 0.1, saturacao: -0.2, matiz_claros: 40, forca_claros: 0.25, filtro: "quente", intensidade: 0.5 });
  // O "Melhorar" da foto entra por baixo; sem o melhorar, não
  assert.equal(corDoEstilo({ ...estilo, melhorar: true }, { exposicao: 0.4 }).exposicao, 0.4);
  assert.equal(corDoEstilo({ ...estilo, melhorar: false }, { exposicao: 0.4 }).exposicao, undefined);
  // O gosto soma; fixo ignora o resto; desligado zera
  const claro = corDoEstilo({ ...estilo, gosto: { luz: "clara", contraste: "forte", temperatura: "quente" } });
  assert.equal(claro.exposicao, 0.3);
  assert.equal(claro.contraste, 0.3);
  assert.equal(claro.temperatura, 0.15);
  const controlado = corDoEstilo({ ...estilo, controles: { contraste: { modo: "fixo", valor: -0.3 }, saturacao: { modo: "desligado", valor: 0 }, exposicao: { modo: "somar", valor: 0.2 } } }, { exposicao: 0.4 });
  assert.equal(controlado.contraste, -0.3);
  assert.equal(controlado.saturacao, undefined);
  assert.equal(controlado.exposicao, 0.6);
  // As curvas vão para a reta pela intensidade
  const filme = ESTILOS_PRONTOS.find((e) => e.id === "filme")!.estilo;
  assert.deepEqual(corDoEstilo({ ...filme, intensidade: 0 }).curvas!.rgb, [[0, 0], [0.25, 0.25], [0.75, 0.75], [1, 1]]);
  // Limites da aba Cor
  assert.equal(corDoEstilo({ ...ESTILO_NEUTRO, cor: { exposicao: 1.8 }, intensidade: 1.5 }).exposicao, 2);
});

test("a consistência entre parecidas puxa o Melhorar para a média do grupo", () => {
  const grupos = new Map([["g1", ["a", "b"]], ["g2", ["c"]]]);
  const melhorados = new Map([
    ["a", { exposicao: 0.8 }],
    ["b", { exposicao: 0 }],
    ["c", { exposicao: 0.3 }],
  ]);
  const juntos = melhoradosConsistentes(grupos, melhorados);
  assert.equal(juntos.get("a")!.exposicao, 0.5);
  assert.equal(juntos.get("b")!.exposicao, 0.3);
  assert.equal(juntos.get("c")!.exposicao, 0.3);
});

test("uma predefinição XMP vira a cor da aba Cor", () => {
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description crs:Version="15.0"
    crs:Exposure2012="+0.50" crs:Contrast2012="+40" crs:Highlights2012="-60" crs:Shadows2012="+30" crs:Vibrance="+20"
    crs:Saturation="-10" crs:IncrementalTemperature="+15" crs:PostCropVignetteAmount="-25"
    crs:HueAdjustmentOrange="-8" crs:SaturationAdjustmentBlue="-40" crs:LuminanceAdjustmentGreen="+20"
    crs:SplitToningShadowHue="210" crs:SplitToningShadowSaturation="20" crs:ColorGradeHighlightHue="45" crs:ColorGradeHighlightSat="15">
    <crs:Name><rdf:Alt><rdf:li xml:lang="x-default">Casamento Claro</rdf:li></rdf:Alt></crs:Name>
    <crs:ToneCurvePV2012><rdf:Seq><rdf:li>0, 20</rdf:li><rdf:li>128, 132</rdf:li><rdf:li>255, 245</rdf:li></rdf:Seq></crs:ToneCurvePV2012>
    <crs:ToneCurvePV2012Red><rdf:Seq><rdf:li>0, 0</rdf:li><rdf:li>255, 255</rdf:li></rdf:Seq></crs:ToneCurvePV2012Red>
    </rdf:Description></rdf:RDF></x:xmpmeta>`;
  const cor = corDoXmp(xmp);
  assert.equal(cor.exposicao, 0.5);
  assert.equal(cor.contraste, 0.2);
  assert.equal(cor.realces, -0.6);
  assert.equal(cor.sombras, 0.3);
  assert.equal(cor.vibracao, 0.2);
  assert.equal(cor.saturacao, -0.1);
  assert.equal(cor.temperatura, 0.15);
  assert.equal(cor.vinheta, 0.25);
  assert.deepEqual(cor.hsl, { laranja: { matiz: -0.08, saturacao: 0, luminancia: 0 }, verde: { matiz: 0, saturacao: 0, luminancia: 0.2 }, azul: { matiz: 0, saturacao: -0.4, luminancia: 0 } });
  assert.deepEqual([cor.matiz_escuros, cor.forca_escuros, cor.matiz_claros, cor.forca_claros], [210, 0.2, 45, 0.15]);
  assert.deepEqual(cor.curvas!.rgb, [[0, 0.078], [0.502, 0.518], [1, 0.961]]);
  assert.deepEqual(cor.curvas!.r, [[0, 0], [1, 1]]);
  assert.equal(nomeDoXmp(xmp), "Casamento Claro");
  assert.throws(() => corDoXmp("<html></html>"));
});
