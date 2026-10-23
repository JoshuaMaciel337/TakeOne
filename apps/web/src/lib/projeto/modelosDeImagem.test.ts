import assert from "node:assert/strict";
import { test } from "node:test";

import { caixaDoClipe } from "./geometria.ts";
import { problemaNoTamanho } from "./imagem.ts";
import { camadasDoModelo, camposDoModelo, encaixarNaCaixa, MODELOS_DE_IMAGEM, type MidiasDoModelo, pedidosDoModelo, vagasDoModelo } from "./modelosDeImagem.ts";
import { ESTILOS_DE_TEXTO, LIMITES_TEXTO } from "./texto.ts";

test("encaixar: a mídia cobre a caixa (cortada no meio) ou cabe nela inteira", () => {
  const quadro = { largura: 1080, altura: 1920 };
  const caixa = { cx: 0.5, cy: 0.4, largura: 0.8, altura: 0.3 };
  for (const midia of [{ largura: 4000, altura: 3000 }, { largura: 1080, altura: 1920 }, { largura: 500, altura: 500 }]) {
    const { transformacao, recorte } = encaixarNaCaixa(midia, caixa, quadro, "cobrir");
    const resultado = caixaDoClipe(transformacao, recorte, midia, quadro);
    assert.ok(Math.abs(resultado.largura - 864) < 1e-6 && Math.abs(resultado.altura - 576) < 1e-6, JSON.stringify(resultado));
    assert.ok(Math.abs(resultado.cx - 540) < 1e-6 && Math.abs(resultado.cy - 768) < 1e-6);
    assert.ok(Math.abs(recorte.x * 2 + recorte.largura - 1) < 1e-9 && Math.abs(recorte.y * 2 + recorte.altura - 1) < 1e-9, "cortada no meio");
  }
  const { transformacao, recorte } = encaixarNaCaixa({ largura: 1000, altura: 1000 }, caixa, quadro, "caber");
  const cabe = caixaDoClipe(transformacao, recorte, { largura: 1000, altura: 1000 }, quadro);
  assert.deepEqual(recorte, { x: 0, y: 0, largura: 1, altura: 1 });
  assert.ok(Math.abs(cabe.altura - 576) < 1e-6 && cabe.largura <= 864);
});

test("todo modelo de imagem é válido: tamanho, estilos, campos e vagas sem repetir", () => {
  const ids = new Set<string>();
  for (const modelo of MODELOS_DE_IMAGEM) {
    assert.ok(!ids.has(modelo.id), modelo.id);
    ids.add(modelo.id);
    assert.equal(problemaNoTamanho(modelo.tamanho), null, modelo.id);
    const campos = camposDoModelo(modelo).map((item) => item.campo);
    assert.equal(new Set(campos).size, campos.length, `${modelo.id}: campo repetido`);
    const vagas = vagasDoModelo(modelo).map((item) => item.vaga);
    assert.equal(new Set(vagas).size, vagas.length, `${modelo.id}: vaga repetida`);
    for (const camada of modelo.camadas) {
      if (camada.tipo === "texto") assert.ok(ESTILOS_DE_TEXTO.some((estilo) => estilo.id === camada.estilo), `${modelo.id}: estilo ${camada.estilo}`);
      if (camada.tipo !== "texto") assert.ok(camada.caixa.largura > 0 && camada.caixa.altura > 0);
    }
    // Dentro dos limites da API: o texto e a proporção das formas pedidas
    for (const camada of camadasDoModelo(modelo, [], {})) {
      if (camada.tipo !== "texto") continue;
      const { tamanho, conteudo } = camada.texto;
      assert.ok(tamanho >= LIMITES_TEXTO.tamanho.minimo && tamanho <= LIMITES_TEXTO.tamanho.maximo, `${modelo.id}: tamanho ${tamanho}`);
      assert.ok(conteudo.length <= LIMITES_TEXTO.conteudo);
    }
    for (const { forma } of pedidosDoModelo(modelo, [], new Set())) {
      assert.ok(forma.proporcao === null || (forma.proporcao >= 0.05 && forma.proporcao <= 20), `${modelo.id}: proporção ${forma.proporcao}`);
    }
  }
});

test("as camadas do modelo: sem foto, o lugar dela; com foto, a foto; as cores do kit no lugar das da paleta", () => {
  const modelo = MODELOS_DE_IMAGEM.find((item) => item.id === "img-oferta")!;
  const pedidos = pedidosDoModelo(modelo, ["#00ff00"], new Set());
  assert.ok(pedidos.some((pedido) => pedido.chave === "vaga-produto" && pedido.forma.cor === "#d9dce3"));
  const estrela = pedidos.find((pedido) => pedido.forma.tipo === "estrela")!;
  assert.equal(estrela.forma.cor, "#ffd23f", "sem a terceira cor no kit, a da paleta");
  const midias: MidiasDoModelo = Object.fromEntries(pedidos.map((pedido) => [pedido.chave, { id: pedido.chave, largura: 2048, altura: 2048 }]));
  const camadas = camadasDoModelo(modelo, ["#00ff00"], midias, { titulo: "Queima de estoque" });
  assert.equal(camadas.length, modelo.camadas.length);
  const titulo = camadas.find((camada) => camada.tipo === "texto" && camada.texto.conteudo === "Queima de estoque");
  assert.ok(titulo);
  // Com a foto escolhida, não há o pedido do lugar dela
  assert.ok(!pedidosDoModelo(modelo, [], new Set(["produto"])).some((pedido) => pedido.chave === "vaga-produto"));
});
