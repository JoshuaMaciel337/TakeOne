"use client";

// As janelas de Imagem › Tamanho da imagem (Ctrl+Alt+I) e Imagem › Tamanho da tela (Ctrl+Alt+C) (ADR 0003, onda 13.6).
import { Link2, Link2Off } from "lucide-react";
import { useState } from "react";

import { METODOS_DE_REAMOSTRAGEM, type MetodoDeReamostragem } from "@/lib/transformar/reamostragem";

import { Moldura } from "./JanelasDePixels";

const campo = "rounded border border-borda bg-painel-2 px-1.5 py-0.5";

/** As unidades de medida e quantas polegadas cada uma tem (os pixels e a porcentagem são à parte). */
const UNIDADES = [
  { id: "px", nome: "Pixels" },
  { id: "pct", nome: "Porcentagem" },
  { id: "pol", nome: "Polegadas", polegadas: 1 },
  { id: "cm", nome: "Centímetros", polegadas: 1 / 2.54 },
  { id: "mm", nome: "Milímetros", polegadas: 1 / 25.4 },
  { id: "pt", nome: "Pontos", polegadas: 1 / 72 },
  { id: "pica", nome: "Paicas", polegadas: 1 / 6 },
] as const;
type Unidade = (typeof UNIDADES)[number]["id"];

/** Os pixels de uma medida na unidade (a porcentagem é da medida de antes). */
function paraPixels(valor: number, unidade: Unidade, ppi: number, antes: number): number {
  if (unidade === "px") return valor;
  if (unidade === "pct") return (valor / 100) * antes;
  return valor * (UNIDADES.find((item) => item.id === unidade) as { polegadas: number }).polegadas * ppi;
}
function daUnidade(pixels: number, unidade: Unidade, ppi: number, antes: number): number {
  if (unidade === "px") return pixels;
  if (unidade === "pct") return (pixels / antes) * 100;
  return pixels / ((UNIDADES.find((item) => item.id === unidade) as { polegadas: number }).polegadas * ppi);
}
const arredondar = (valor: number, unidade: Unidade) => (unidade === "px" ? Math.round(valor) : Math.round(valor * 100) / 100);
const megabytes = (largura: number, altura: number) => `${((largura * altura * 4) / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

function Medida({ rotulo, valor, unidade, aoMudar, desativado = false }: { rotulo: string; valor: number; unidade: Unidade; aoMudar: (valor: number) => void; desativado?: boolean }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-14 text-suave">{rotulo}:</span>
      <input
        key={`${valor}-${unidade}`}
        className={`${campo} w-24 text-right tabular-nums disabled:opacity-50`}
        defaultValue={arredondar(valor, unidade)}
        inputMode="decimal"
        disabled={desativado}
        aria-label={rotulo}
        onBlur={(evento) => {
          const numero = Number(evento.currentTarget.value.replace(",", "."));
          if (Number.isFinite(numero) && numero > 0) aoMudar(numero);
        }}
        onKeyDown={(evento) => evento.key === "Enter" && evento.currentTarget.blur()}
      />
    </label>
  );
}

function EscolhaDaUnidade({ unidade, aoMudar, comPorcentagem = true }: { unidade: Unidade; aoMudar: (unidade: Unidade) => void; comPorcentagem?: boolean }) {
  return (
    <select className={campo} value={unidade} onChange={(evento) => aoMudar(evento.currentTarget.value as Unidade)} aria-label="Unidade">
      {UNIDADES.filter((item) => comPorcentagem || item.id !== "pct").map((item) => (
        <option key={item.id} value={item.id}>
          {item.nome}
        </option>
      ))}
    </select>
  );
}

export type NovoTamanho = { largura: number; altura: number; resolucao: number; reamostrar: boolean; metodo: MetodoDeReamostragem };

/**
 * Tamanho da imagem: a largura e a altura numa unidade (ligadas pela proporção), a resolução e a reamostragem. Sem
 * reamostrar, os pixels ficam e as medidas em centímetros e polegadas mudam a resolução.
 */
export function JanelaTamanhoDaImagem({ antes, aoFechar, aoConfirmar }: { antes: { largura: number; altura: number; resolucao: number }; aoFechar: () => void; aoConfirmar: (novo: NovoTamanho) => void }) {
  const [largura, setLargura] = useState(antes.largura);
  const [altura, setAltura] = useState(antes.altura);
  const [ppi, setPpi] = useState(antes.resolucao);
  const [unidade, setUnidade] = useState<Unidade>("px");
  const [ligado, setLigado] = useState(true);
  const [reamostrar, setReamostrar] = useState(true);
  const [metodo, setMetodo] = useState<MetodoDeReamostragem>("automatica");
  const [ppiPorCm, setPpiPorCm] = useState(false);
  const proporcao = antes.altura / antes.largura;
  const fisica = unidade !== "px" && unidade !== "pct";

  const mudarMedida = (eixo: "largura" | "altura", valor: number) => {
    const total = eixo === "largura" ? antes.largura : antes.altura;
    if (!reamostrar) {
      // Os pixels ficam: a medida física muda a resolução
      if (!fisica) return;
      const pixels = eixo === "largura" ? largura : altura;
      setPpi(Math.max(1, pixels / paraPixels(valor, unidade, 1, total)));
      return;
    }
    const pixels = Math.max(1, paraPixels(valor, unidade, ppi, total));
    if (eixo === "largura") {
      setLargura(pixels);
      if (ligado) setAltura(pixels * proporcao);
    } else {
      setAltura(pixels);
      if (ligado) setLargura(pixels / proporcao);
    }
  };
  const mudarResolucao = (valor: number) => {
    const novo = ppiPorCm ? valor * 2.54 : valor;
    // Reamostrando, a medida física fica e os pixels acompanham a resolução
    if (reamostrar && fisica) {
      setLargura((atual) => (atual * novo) / ppi);
      setAltura((atual) => (atual * novo) / ppi);
    }
    setPpi(novo);
  };
  const final = { largura: Math.round(largura), altura: Math.round(altura) };
  const grande = final.largura > 8192 || final.altura > 8192 || final.largura * final.altura > 36_000_000 || final.largura < 16 || final.altura < 16;
  return (
    <Moldura titulo="Tamanho da imagem" aoFechar={aoFechar} aoConfirmar={() => !grande && aoConfirmar({ ...final, resolucao: Math.round(ppi), reamostrar, metodo })}>
      <p className="text-suave">
        Tamanho: {final.largura} × {final.altura} px ({megabytes(final.largura, final.altura)}
        {final.largura !== antes.largura || final.altura !== antes.altura ? `; antes ${megabytes(antes.largura, antes.altura)}` : ""})
      </p>
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-1.5">
          <Medida rotulo="Largura" valor={daUnidade(largura, unidade, ppi, antes.largura)} unidade={unidade} aoMudar={(valor) => mudarMedida("largura", valor)} desativado={!reamostrar && !fisica} />
          <Medida rotulo="Altura" valor={daUnidade(altura, unidade, ppi, antes.altura)} unidade={unidade} aoMudar={(valor) => mudarMedida("altura", valor)} desativado={!reamostrar && !fisica} />
        </div>
        <button type="button" className="botao-icone" onClick={() => setLigado((atual) => !atual)} aria-pressed={ligado} title={ligado ? "Proporção ligada" : "Proporção solta"} aria-label="Manter a proporção" disabled={!reamostrar}>
          {ligado || !reamostrar ? <Link2 className="size-4" aria-hidden /> : <Link2Off className="size-4" aria-hidden />}
        </button>
        <EscolhaDaUnidade unidade={unidade} aoMudar={setUnidade} />
      </div>
      <div className="flex items-center gap-2">
        <Medida rotulo="Resolução" valor={ppiPorCm ? ppi / 2.54 : ppi} unidade="pct" aoMudar={mudarResolucao} />
        <select className={campo} value={ppiPorCm ? "cm" : "pol"} onChange={(evento) => setPpiPorCm(evento.currentTarget.value === "cm")} aria-label="Unidade da resolução">
          <option value="pol">Pixels/polegada</option>
          <option value="cm">Pixels/centímetro</option>
        </select>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={reamostrar} onChange={(evento) => setReamostrar(evento.currentTarget.checked)} />
        Reamostrar
        <select className={`${campo} flex-1`} value={metodo} onChange={(evento) => setMetodo(evento.currentTarget.value as MetodoDeReamostragem)} disabled={!reamostrar} aria-label="Método de reamostragem">
          {METODOS_DE_REAMOSTRAGEM.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </label>
      {!ligado && reamostrar ? <p className="text-suave">Com a proporção solta, as camadas de pixels esticam; fotos e textos continuam na proporção deles.</p> : null}
      {grande ? <p className="text-erro">A imagem precisa ter de 16 a 8192 px de lado e até 36 milhões de pixels.</p> : null}
    </Moldura>
  );
}

export type NovaTela = { largura: number; altura: number; ancora: { u: number; v: number }; extensao: { cor: string; transparente: boolean } | null };

/** Tamanho da tela: a medida nova (ou o quanto aumentar, no relativo), a âncora e a cor do que aumentar. */
export function JanelaTamanhoDaTela({
  antes,
  primeiroPlano,
  fundo,
  aoFechar,
  aoConfirmar,
}: {
  antes: { largura: number; altura: number; resolucao: number };
  primeiroPlano: string;
  fundo: string;
  aoFechar: () => void;
  aoConfirmar: (nova: NovaTela) => void;
}) {
  const [largura, setLargura] = useState(antes.largura);
  const [altura, setAltura] = useState(antes.altura);
  const [unidade, setUnidade] = useState<Unidade>("px");
  const [relativo, setRelativo] = useState(false);
  const [ancora, setAncora] = useState({ u: 0.5, v: 0.5 });
  const [extensao, setExtensao] = useState<"manter" | "primeiroPlano" | "fundo" | "branco" | "preto" | "cinza" | "outra" | "transparente">("manter");
  const [outra, setOutra] = useState("#ff0000");
  const ppi = antes.resolucao;
  // No relativo, os campos são o quanto aumenta (ou diminui)
  const mostrada = (eixo: "largura" | "altura") => {
    const atual = eixo === "largura" ? largura : altura;
    const total = eixo === "largura" ? antes.largura : antes.altura;
    return relativo ? daUnidade(atual - total, unidade, ppi, total) : daUnidade(atual, unidade, ppi, total);
  };
  const mudar = (eixo: "largura" | "altura", valor: number) => {
    const total = eixo === "largura" ? antes.largura : antes.altura;
    const pixels = relativo ? total + paraPixels(valor, unidade, ppi, total) : paraPixels(valor, unidade, ppi, total);
    (eixo === "largura" ? setLargura : setAltura)(Math.max(1, pixels));
  };
  const final = { largura: Math.round(largura), altura: Math.round(altura) };
  const grande = final.largura > 8192 || final.altura > 8192 || final.largura * final.altura > 36_000_000 || final.largura < 16 || final.altura < 16;
  const corDaExtensao = (): NovaTela["extensao"] => {
    if (extensao === "manter") return null;
    if (extensao === "transparente") return { cor: "#ffffff", transparente: true };
    const cor = { primeiroPlano, fundo, branco: "#ffffff", preto: "#000000", cinza: "#808080", outra }[extensao];
    return { cor, transparente: false };
  };
  return (
    <Moldura titulo="Tamanho da tela" aoFechar={aoFechar} aoConfirmar={() => !grande && aoConfirmar({ ...final, ancora, extensao: corDaExtensao() })}>
      <p className="text-suave">
        Atual: {antes.largura} × {antes.altura} px. Nova: {final.largura} × {final.altura} px.
      </p>
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-1.5">
          <Medida rotulo="Largura" valor={mostrada("largura")} unidade={unidade} aoMudar={(valor) => mudar("largura", valor)} />
          <Medida rotulo="Altura" valor={mostrada("altura")} unidade={unidade} aoMudar={(valor) => mudar("altura", valor)} />
        </div>
        <EscolhaDaUnidade unidade={unidade} aoMudar={setUnidade} />
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={relativo} onChange={(evento) => setRelativo(evento.currentTarget.checked)} />
        Relativo (o quanto aumentar)
      </label>
      <div className="flex items-center gap-3">
        <span className="text-suave">Âncora:</span>
        <span className="grid grid-cols-3 gap-0.5" role="group" aria-label="Âncora">
          {[0, 0.5, 1].flatMap((v) =>
            [0, 0.5, 1].map((u) => (
              <button
                key={`${u}-${v}`}
                type="button"
                className={`size-5 rounded-sm border border-borda ${ancora.u === u && ancora.v === v ? "bg-destaque" : "bg-painel-2 hover:bg-painel-3"}`}
                aria-label={`Âncora ${v === 0 ? "em cima" : v === 1 ? "embaixo" : "no meio"} ${u === 0 ? "à esquerda" : u === 1 ? "à direita" : "no centro"}`}
                aria-pressed={ancora.u === u && ancora.v === v}
                onClick={() => setAncora({ u, v })}
              />
            )),
          )}
        </span>
      </div>
      <label className="flex items-center gap-2">
        <span className="text-suave">Cor da extensão da tela:</span>
        <select className={`${campo} flex-1`} value={extensao} onChange={(evento) => setExtensao(evento.currentTarget.value as typeof extensao)} aria-label="Cor da extensão da tela">
          <option value="manter">A do fundo da imagem</option>
          <option value="primeiroPlano">Primeiro plano</option>
          <option value="fundo">Fundo</option>
          <option value="branco">Branco</option>
          <option value="preto">Preto</option>
          <option value="cinza">Cinza</option>
          <option value="outra">Outra…</option>
          <option value="transparente">Transparente</option>
        </select>
        {extensao === "outra" ? <input type="color" value={outra} onChange={(evento) => setOutra(evento.currentTarget.value)} aria-label="Outra cor" /> : null}
      </label>
      {grande ? <p className="text-erro">A imagem precisa ter de 16 a 8192 px de lado e até 36 milhões de pixels.</p> : null}
    </Moldura>
  );
}

export type NovaEscalaSensivel = { largura: number; altura: number; protecao: string; pele: boolean; quantidade: number };

/**
 * Editar › Escala sensível ao conteúdo: o tamanho novo do que tem conteúdo na camada (em % ou pixels, ligados ou não),
 * o que proteger (a seleção ou um canal), os tons de pele e a quantidade (100% é toda pelas costuras).
 */
export function JanelaEscalaSensivel({
  antes,
  canais,
  temSelecao,
  aoFechar,
  aoConfirmar,
}: {
  antes: { largura: number; altura: number };
  canais: { id: string; nome: string }[];
  temSelecao: boolean;
  aoFechar: () => void;
  aoConfirmar: (nova: NovaEscalaSensivel) => void;
}) {
  const [largura, setLargura] = useState(antes.largura);
  const [altura, setAltura] = useState(antes.altura);
  const [unidade, setUnidade] = useState<Unidade>("pct");
  const [ligado, setLigado] = useState(false);
  const [protecao, setProtecao] = useState(temSelecao ? "selecao" : "nenhuma");
  const [pele, setPele] = useState(false);
  const [quantidade, setQuantidade] = useState(100);
  const mudar = (eixo: "largura" | "altura", valor: number) => {
    const total = eixo === "largura" ? antes.largura : antes.altura;
    const pixels = Math.max(1, paraPixels(valor, unidade, 72, total));
    if (eixo === "largura") {
      setLargura(pixels);
      if (ligado) setAltura((pixels * antes.altura) / antes.largura);
    } else {
      setAltura(pixels);
      if (ligado) setLargura((pixels * antes.largura) / antes.altura);
    }
  };
  return (
    <Moldura titulo="Escala sensível ao conteúdo" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar({ largura: Math.round(largura), altura: Math.round(altura), protecao, pele, quantidade: quantidade / 100 })}>
      <p className="text-suave">
        O que tem conteúdo na camada: {antes.largura} × {antes.altura} px. Novo: {Math.round(largura)} × {Math.round(altura)} px. O que é liso (céu, parede, chão) cede primeiro; o que tem detalhe fica.
      </p>
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-1.5">
          <Medida rotulo="Largura" valor={daUnidade(largura, unidade, 72, antes.largura)} unidade={unidade} aoMudar={(valor) => mudar("largura", valor)} />
          <Medida rotulo="Altura" valor={daUnidade(altura, unidade, 72, antes.altura)} unidade={unidade} aoMudar={(valor) => mudar("altura", valor)} />
        </div>
        <button type="button" className="botao-icone" onClick={() => setLigado((atual) => !atual)} aria-pressed={ligado} title={ligado ? "Proporção ligada" : "Proporção solta"} aria-label="Manter a proporção">
          {ligado ? <Link2 className="size-4" aria-hidden /> : <Link2Off className="size-4" aria-hidden />}
        </button>
        <select className={campo} value={unidade} onChange={(evento) => setUnidade(evento.currentTarget.value as Unidade)} aria-label="Unidade">
          <option value="pct">Porcentagem</option>
          <option value="px">Pixels</option>
        </select>
      </div>
      <label className="flex items-center gap-2">
        <span className="text-suave">Proteger:</span>
        <select className={`${campo} flex-1`} value={protecao} onChange={(evento) => setProtecao(evento.currentTarget.value)} aria-label="Proteger">
          <option value="nenhuma">Nenhum</option>
          {temSelecao ? <option value="selecao">A seleção</option> : null}
          {canais.map((canal) => (
            <option key={canal.id} value={canal.id}>
              {canal.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={pele} onChange={(evento) => setPele(evento.currentTarget.checked)} />
        Proteger tons de pele
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="flex justify-between">
          <span>Quantidade</span>
          <span className="tabular-nums text-suave">{quantidade}%</span>
        </span>
        <input type="range" min={0} max={100} value={quantidade} onChange={(evento) => setQuantidade(Number(evento.currentTarget.value))} aria-label="Quantidade" />
      </label>
    </Moldura>
  );
}

/** Editar › Alinhar camadas automaticamente: a projeção (o tipo de movimento que pode haver entre as fotos). */
export function JanelaAlinhar({ aoFechar, aoConfirmar }: { aoFechar: () => void; aoConfirmar: (projecao: "auto" | "perspectiva" | "colagem" | "reposicionar") => void }) {
  const [projecao, setProjecao] = useState<"auto" | "perspectiva" | "colagem" | "reposicionar">("auto");
  const opcoes = [
    ["auto", "Automático", "A perspectiva, ou a colagem quando ela não acha."],
    ["perspectiva", "Perspectiva", "Um panorama de um ponto só (as fotos podem tombar umas em relação às outras)."],
    ["colagem", "Colagem", "Mover, girar e escalar por igual, sem tombar."],
    ["reposicionar", "Reposicionar", "Só mover (fotos da mesma câmera parada)."],
  ] as const;
  return (
    <Moldura titulo="Alinhar camadas automaticamente" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(projecao)}>
      <p className="text-suave">A camada do meio fica parada e as outras vão para o lugar dela, pelos pontos que as fotos têm em comum. A tela cresce até caber todas.</p>
      {opcoes.map(([id, nome, dica]) => (
        <label key={id} className="flex items-start gap-2">
          <input type="radio" name="projecao" checked={projecao === id} onChange={() => setProjecao(id)} className="mt-0.5" />
          <span>
            {nome}
            <span className="block text-suave">{dica}</span>
          </span>
        </label>
      ))}
    </Moldura>
  );
}

/** Editar › Mesclar camadas automaticamente: panorama ou empilhar imagens (o foco), e os tons e as cores. */
export function JanelaMesclarCamadas({ aoFechar, aoConfirmar }: { aoFechar: () => void; aoConfirmar: (metodo: "panorama" | "empilhar", tonsECores: boolean) => void }) {
  const [metodo, setMetodo] = useState<"panorama" | "empilhar">("panorama");
  const [tons, setTons] = useState(true);
  return (
    <Moldura titulo="Mesclar camadas automaticamente" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(metodo, tons)}>
      <label className="flex items-start gap-2">
        <input type="radio" name="metodo" checked={metodo === "panorama"} onChange={() => setMetodo("panorama")} className="mt-0.5" />
        <span>
          Panorama
          <span className="block text-suave">As fotos alinhadas emendadas pela parte em comum.</span>
        </span>
      </label>
      <label className="flex items-start gap-2">
        <input type="radio" name="metodo" checked={metodo === "empilhar"} onChange={() => setMetodo("empilhar")} className="mt-0.5" />
        <span>
          Empilhar imagens
          <span className="block text-suave">Da mesma cena com o foco em lugares diferentes: fica o que está nítido em cada uma.</span>
        </span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={tons} disabled={metodo !== "panorama"} onChange={(evento) => setTons(evento.currentTarget.checked)} />
        Tons e cores perfeitos
      </label>
    </Moldura>
  );
}
