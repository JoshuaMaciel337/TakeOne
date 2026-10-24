"use client";

// As opções das ferramentas de forma (ADR 0003, onda 13.7) e os seletores de tinta e de traço, que a seção Forma das
// propriedades também usa: a tinta é nenhuma, uma cor, um degradê (com a forma, o ângulo e a escala) ou um padrão.
import { type ReactNode, useEffect, useRef, useState } from "react";

import { type Degrade, degradeComCores, DEGRADES_PRONTOS, FORMAS_DO_DEGRADE } from "@/lib/pintura/degrade";
import { type IdDoPadrao, usePadroes } from "@/lib/pintura/padroes";
import type { OpcoesDasFormas, TipoDaFormaViva } from "@/lib/vetor/arrasto";
import type { OperacaoDoCaminho, TintaDaForma, TracoDaForma } from "@/lib/vetor/modelo";

import { AmostraDoDegrade } from "./Degrades";
import { Moldura } from "./JanelasDePixels";

const campo = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";
const SEPARADOR = <span className="mx-1 h-5 w-px shrink-0 bg-borda" aria-hidden />;
const XADREZ = "repeating-conic-gradient(#c8cad0 0% 25%, #ffffff 0% 50%) 50% / 8px 8px";

/** Um balão preso a um botão, em posição fixa (a barra de opções corta o que passa dela), que fecha clicando fora. */
export function Balao({ ancora, aoFechar, children }: { ancora: HTMLElement; aoFechar: () => void; children: ReactNode }) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const [lugar] = useState(() => {
    const r = ancora.getBoundingClientRect();
    return { left: Math.max(8, Math.min(r.left, window.innerWidth - 300)), top: r.bottom + 4 };
  });
  useEffect(() => {
    const fora = (evento: PointerEvent) => {
      if (!caixaRef.current?.contains(evento.target as Node) && !ancora.contains(evento.target as Node)) aoFechar();
    };
    // O Esc fecha só o balão (sem chegar ao editor, que tiraria a camada escolhida)
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      evento.stopPropagation();
      evento.preventDefault();
      aoFechar();
    };
    window.addEventListener("pointerdown", fora, true);
    window.addEventListener("keydown", tecla, true);
    return () => {
      window.removeEventListener("pointerdown", fora, true);
      window.removeEventListener("keydown", tecla, true);
    };
  }, [ancora, aoFechar]);
  return (
    <div ref={caixaRef} role="dialog" className="fixed z-50 flex w-72 flex-col gap-2 rounded-md border border-borda bg-painel p-2 text-xs shadow-xl" style={lugar}>
      {children}
    </div>
  );
}

/** A amostra de uma tinta (o quadradinho do botão). */
export function AmostraDaTinta({ tinta, className = "size-5" }: { tinta: TintaDaForma; className?: string }) {
  if (tinta.tipo === "cor") return <span className={`block rounded border border-borda ${className}`} style={{ background: tinta.cor }} aria-hidden />;
  if (tinta.tipo === "degrade") return <AmostraDoDegrade degrade={tinta.degrade} primeiroPlano="#000000" fundo="#ffffff" className={className} />;
  if (tinta.tipo === "padrao") return <span className={`block rounded border border-borda ${className}`} style={{ background: XADREZ }} aria-hidden />;
  if (tinta.tipo === "imagem") return <span className={`block rounded border border-borda bg-painel-3 ${className}`} aria-hidden />;
  // Nenhuma: o quadrado branco cortado pela diagonal vermelha
  return <span className={`block rounded border border-borda ${className}`} style={{ background: "linear-gradient(to top right, #fff calc(50% - 1px), #e5484d calc(50% - 1px), #e5484d calc(50% + 1px), #fff calc(50% + 1px))" }} aria-hidden />;
}

/** O seletor de tinta: o botão com a amostra e o balão com as quatro maneiras de pintar. */
export function SeletorDeTinta({
  rotulo,
  tinta,
  primeiroPlano,
  fundo,
  doEspaco,
  aoMudar,
}: {
  rotulo: string;
  tinta: TintaDaForma;
  primeiroPlano: string;
  fundo: string;
  doEspaco: Degrade[];
  aoMudar: (tinta: TintaDaForma) => void;
}) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const padroes = usePadroes();
  const degrades = [...DEGRADES_PRONTOS.flatMap((pasta) => pasta.degrades), ...doEspaco];
  const tipos: { id: Exclude<TintaDaForma["tipo"], "imagem">; nome: string }[] = [
    { id: "nenhuma", nome: "Nenhuma" },
    { id: "cor", nome: "Cor" },
    { id: "degrade", nome: "Degradê" },
    { id: "padrao", nome: "Padrão" },
  ];
  const paraTipo = (tipo: Exclude<TintaDaForma["tipo"], "imagem">): TintaDaForma => {
    if (tipo === "nenhuma") return { tipo };
    if (tipo === "cor") return { tipo, cor: primeiroPlano };
    if (tipo === "degrade") return { tipo, degrade: degradeComCores(DEGRADES_PRONTOS[0].degrades[0], primeiroPlano, fundo), forma: "linear", angulo: 90, escala: 1, inverter: false };
    return { tipo, padrao: padroes[0]?.id ?? "xadrez", escala: 1 };
  };
  return (
    <span className="flex items-center gap-1 text-suave">
      {rotulo}:
      <button type="button" aria-label={`${rotulo}: escolher a tinta`} aria-expanded={Boolean(ancora)} className="rounded p-0.5 hover:ring-2 hover:ring-destaque" onClick={(evento) => setAncora(ancora ? null : evento.currentTarget)}>
        <AmostraDaTinta tinta={tinta} className={tinta.tipo === "degrade" ? "h-5 w-10" : "size-5"} />
      </button>
      {ancora ? (
        <Balao ancora={ancora} aoFechar={() => setAncora(null)}>
          <span className="flex gap-0.5" role="group" aria-label={`${rotulo}: tipo de tinta`}>
            {tipos.map((tipo) => (
              <button key={tipo.id} type="button" aria-pressed={tinta.tipo === tipo.id} className={`flex-1 rounded px-1.5 py-1 ${tinta.tipo === tipo.id ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`} onClick={() => tinta.tipo !== tipo.id && aoMudar(paraTipo(tipo.id))}>
                {tipo.nome}
              </button>
            ))}
          </span>
          {tinta.tipo === "cor" ? (
            <label className="flex items-center gap-2 text-suave">
              Cor:
              <input type="color" value={tinta.cor} onChange={(evento) => aoMudar({ tipo: "cor", cor: evento.currentTarget.value })} className="h-6 w-12 cursor-pointer rounded border border-borda" aria-label={`${rotulo}: cor`} />
              <button type="button" className="rounded px-1.5 py-0.5 text-suave hover:text-texto" onClick={() => aoMudar({ tipo: "cor", cor: primeiroPlano })}>
                Primeiro plano
              </button>
            </label>
          ) : null}
          {tinta.tipo === "degrade" ? (
            <>
              <div className="grid max-h-40 grid-cols-4 gap-1 overflow-y-auto">
                {degrades.map((degrade, i) => (
                  <button key={`${degrade.nome}-${i}`} type="button" title={degrade.nome} aria-label={degrade.nome} className="rounded hover:ring-2 hover:ring-destaque" onClick={() => aoMudar({ ...tinta, degrade: degradeComCores(degrade, primeiroPlano, fundo) })}>
                    <AmostraDoDegrade degrade={degrade} primeiroPlano={primeiroPlano} fundo={fundo} className="h-5 w-full" />
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-suave">
                Estilo:
                <select className={`${campo} flex-1`} value={tinta.forma} onChange={(evento) => aoMudar({ ...tinta, forma: evento.currentTarget.value as typeof tinta.forma })} aria-label={`${rotulo}: estilo do degradê`}>
                  {FORMAS_DO_DEGRADE.map((forma) => (
                    <option key={forma.id} value={forma.id}>
                      {forma.nome}
                    </option>
                  ))}
                </select>
              </label>
              <Deslizante rotulo="Ângulo" valor={tinta.angulo} minimo={-180} maximo={180} sufixo="°" aoMudar={(angulo) => aoMudar({ ...tinta, angulo })} />
              <Deslizante rotulo="Escala" valor={Math.round(tinta.escala * 100)} minimo={10} maximo={300} sufixo="%" aoMudar={(escala) => aoMudar({ ...tinta, escala: escala / 100 })} />
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={tinta.inverter} onChange={(evento) => aoMudar({ ...tinta, inverter: evento.currentTarget.checked })} />
                Inverter
              </label>
            </>
          ) : null}
          {tinta.tipo === "padrao" ? (
            <>
              <label className="flex items-center gap-2 text-suave">
                Padrão:
                <select className={`${campo} flex-1`} value={tinta.padrao} onChange={(evento) => aoMudar({ ...tinta, padrao: evento.currentTarget.value as IdDoPadrao })} aria-label={`${rotulo}: padrão`}>
                  {padroes.map((padrao) => (
                    <option key={padrao.id} value={padrao.id}>
                      {padrao.nome}
                    </option>
                  ))}
                </select>
              </label>
              <Deslizante rotulo="Escala" valor={Math.round(tinta.escala * 100)} minimo={10} maximo={400} sufixo="%" aoMudar={(escala) => aoMudar({ ...tinta, escala: escala / 100 })} />
            </>
          ) : null}
        </Balao>
      ) : null}
    </span>
  );
}

function Deslizante({ rotulo, valor, minimo, maximo, sufixo, aoMudar }: { rotulo: string; valor: number; minimo: number; maximo: number; sufixo: string; aoMudar: (valor: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-suave">
      <span className="w-14">{rotulo}:</span>
      <input type="range" min={minimo} max={maximo} value={valor} onChange={(evento) => aoMudar(Number(evento.currentTarget.value))} className="flex-1" aria-label={rotulo} />
      <span className="w-10 text-right tabular-nums text-texto">
        {Math.round(valor)}
        {sufixo}
      </span>
    </label>
  );
}

/** Um número digitado (confirma ao sair do campo ou com Enter). */
export function NumeroDaForma({ rotulo, valor, minimo, maximo, sufixo, aoMudar, largura = "w-12" }: { rotulo: string; valor: number; minimo: number; maximo: number; sufixo?: string; aoMudar: (valor: number) => void; largura?: string }) {
  return (
    <label className="flex items-center gap-1 text-suave">
      {rotulo}:
      <input
        key={valor}
        aria-label={rotulo}
        defaultValue={Math.round(valor * 100) / 100}
        inputMode="decimal"
        onBlur={(evento) => {
          const numero = Number(evento.currentTarget.value.replace(",", "."));
          if (Number.isFinite(numero) && numero !== valor) aoMudar(Math.min(maximo, Math.max(minimo, numero)));
        }}
        onKeyDown={(evento) => evento.key === "Enter" && evento.currentTarget.blur()}
        className={`${campo} ${largura} text-right tabular-nums`}
      />
      {sufixo}
    </label>
  );
}

/** As opções do traço (o alinhamento, o tipo, as pontas, os cantos e o limite dos cantos vivos), num balão. */
export function OpcoesDoTraco({ traco, aoMudar }: { traco: TracoDaForma; aoMudar: (traco: TracoDaForma) => void }) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const opcao = <K extends keyof TracoDaForma>(chave: K, nome: string, lista: { id: TracoDaForma[K]; nome: string }[]) => (
    <label className="flex items-center gap-2 text-suave">
      <span className="w-20">{nome}:</span>
      <select className={`${campo} flex-1`} value={String(traco[chave])} onChange={(evento) => aoMudar({ ...traco, [chave]: evento.currentTarget.value })} aria-label={nome}>
        {lista.map((item) => (
          <option key={String(item.id)} value={String(item.id)}>
            {item.nome}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <button type="button" aria-expanded={Boolean(ancora)} className={`${campo} hover:text-texto`} onClick={(evento) => setAncora(ancora ? null : evento.currentTarget)} title="Opções do traçado">
        {traco.tipo === "solido" ? "———" : traco.tipo === "tracejado" ? "– – –" : "· · · ·"}
      </button>
      {ancora ? (
        <Balao ancora={ancora} aoFechar={() => setAncora(null)}>
          {opcao("tipo", "Tipo", [
            { id: "solido", nome: "Sólido" },
            { id: "tracejado", nome: "Tracejado" },
            { id: "pontilhado", nome: "Pontilhado" },
          ])}
          {opcao("alinhamento", "Alinhar", [
            { id: "dentro", nome: "Por dentro" },
            { id: "centro", nome: "No meio" },
            { id: "fora", nome: "Por fora" },
          ])}
          {opcao("pontas", "Pontas", [
            { id: "reta", nome: "Retas" },
            { id: "redonda", nome: "Redondas" },
            { id: "quadrada", nome: "Quadradas" },
          ])}
          {opcao("cantos", "Cantos", [
            { id: "vivo", nome: "Vivos" },
            { id: "redondo", nome: "Redondos" },
            { id: "chanfrado", nome: "Chanfrados" },
          ])}
          {traco.cantos === "vivo" ? <NumeroDaForma rotulo="Limite dos cantos" valor={traco.mitra} minimo={1} maximo={100} aoMudar={(mitra) => aoMudar({ ...traco, mitra })} /> : null}
        </Balao>
      ) : null}
    </>
  );
}

/** O preenchimento e o traço (a tinta, a largura e as opções), juntos: a barra das formas e a seção Forma usam. */
export function TintasDaForma({
  preenchimento,
  traco,
  semPreenchimento = false,
  primeiroPlano,
  fundo,
  doEspaco,
  aoMudarPreenchimento,
  aoMudarTraco,
}: {
  preenchimento: TintaDaForma;
  traco: TracoDaForma;
  semPreenchimento?: boolean;
  primeiroPlano: string;
  fundo: string;
  doEspaco: Degrade[];
  aoMudarPreenchimento: (tinta: TintaDaForma) => void;
  aoMudarTraco: (traco: TracoDaForma) => void;
}) {
  return (
    <>
      {semPreenchimento ? null : <SeletorDeTinta rotulo="Preenchimento" tinta={preenchimento} primeiroPlano={primeiroPlano} fundo={fundo} doEspaco={doEspaco} aoMudar={aoMudarPreenchimento} />}
      <SeletorDeTinta rotulo="Traçado" tinta={traco.tinta} primeiroPlano={primeiroPlano} fundo={fundo} doEspaco={doEspaco} aoMudar={(tinta) => aoMudarTraco({ ...traco, tinta })} />
      <NumeroDaForma rotulo="Largura do traçado" valor={traco.largura} minimo={0} maximo={1000} sufixo="px" aoMudar={(largura) => aoMudarTraco({ ...traco, largura })} />
      <OpcoesDoTraco traco={traco} aoMudar={aoMudarTraco} />
    </>
  );
}

/** A barra das ferramentas de forma: as operações, as tintas e as medidas de cada forma. */
export function OpcoesDaFormaNaBarra({
  tipo,
  opcoes,
  primeiroPlano,
  fundo,
  doEspaco,
  comFormaEscolhida,
  aoMudar,
  seletor,
}: {
  tipo: TipoDaFormaViva | "personalizada";
  opcoes: OpcoesDasFormas;
  primeiroPlano: string;
  fundo: string;
  doEspaco: Degrade[];
  /** Se há uma camada de forma escolhida (as operações que juntam só valem nela). */
  comFormaEscolhida: boolean;
  aoMudar: (mudanca: Partial<OpcoesDasFormas>) => void;
  /** A Forma personalizada: o seletor da forma, antes das tintas. */
  seletor?: ReactNode;
}) {
  const linha = tipo === "linha";
  return (
    <>
      <label className="flex items-center gap-1 text-suave">
        Operação:
        <select className={campo} value={comFormaEscolhida ? opcoes.operacao : "nova"} disabled={!comFormaEscolhida} title={comFormaEscolhida ? undefined : "Escolha uma camada de forma para juntar as formas"} onChange={(evento) => aoMudar({ operacao: evento.currentTarget.value as OpcoesDasFormas["operacao"] })} aria-label="Operação da forma">
          <option value="nova">Nova camada</option>
          <option value="somar">Combinar formas</option>
          <option value="subtrair">Subtrair a forma da frente</option>
          <option value="intersectar">Intersectar as áreas</option>
          <option value="excluir">Excluir a sobreposição</option>
        </select>
      </label>
      {SEPARADOR}
      {seletor ? (
        <>
          {seletor}
          {SEPARADOR}
        </>
      ) : null}
      <TintasDaForma
        preenchimento={opcoes.preenchimento ?? { tipo: "cor", cor: primeiroPlano }}
        traco={linha ? { ...opcoes.traco, largura: opcoes.espessuraDaLinha } : opcoes.traco}
        semPreenchimento={linha}
        primeiroPlano={primeiroPlano}
        fundo={fundo}
        doEspaco={doEspaco}
        aoMudarPreenchimento={(preenchimento) => aoMudar({ preenchimento })}
        aoMudarTraco={(traco) => (linha ? aoMudar({ traco: { ...traco, largura: opcoes.traco.largura }, espessuraDaLinha: Math.max(0.5, traco.largura) }) : aoMudar({ traco }))}
      />
      {SEPARADOR}
      {tipo === "retangulo" ? <NumeroDaForma rotulo="Raio dos cantos" valor={opcoes.raio} minimo={0} maximo={10000} sufixo="px" aoMudar={(raio) => aoMudar({ raio })} /> : null}
      {tipo === "triangulo" ? <NumeroDaForma rotulo="Raio dos cantos" valor={opcoes.raioDoPoligono} minimo={0} maximo={10000} sufixo="px" aoMudar={(raioDoPoligono) => aoMudar({ raioDoPoligono })} /> : null}
      {tipo === "poligono" ? (
        <>
          <NumeroDaForma rotulo="Lados" valor={opcoes.lados} minimo={3} maximo={100} aoMudar={(lados) => aoMudar({ lados: Math.round(lados) })} largura="w-10" />
          <NumeroDaForma rotulo="Estrela" valor={Math.round(opcoes.estrela * 100)} minimo={0} maximo={99} sufixo="%" aoMudar={(estrela) => aoMudar({ estrela: estrela / 100 })} largura="w-10" />
          <NumeroDaForma rotulo="Raio dos cantos" valor={opcoes.raioDoPoligono} minimo={0} maximo={10000} sufixo="px" aoMudar={(raioDoPoligono) => aoMudar({ raioDoPoligono })} />
        </>
      ) : null}
      {linha ? (
        <>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={opcoes.setaInicio} onChange={(evento) => aoMudar({ setaInicio: evento.currentTarget.checked })} />
            Seta no início
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={opcoes.setaFim} onChange={(evento) => aoMudar({ setaFim: evento.currentTarget.checked })} />
            Seta no fim
          </label>
          {opcoes.setaInicio || opcoes.setaFim ? <NumeroDaForma rotulo="Tamanho da seta" valor={opcoes.tamanhoDaSeta} minimo={1} maximo={50} sufixo="×" aoMudar={(tamanhoDaSeta) => aoMudar({ tamanhoDaSeta })} largura="w-10" /> : null}
        </>
      ) : null}
      <span className="text-suave">Shift: proporção · Alt: do meio</span>
    </>
  );
}

/** O clique sem arrastar: as medidas da forma (a linha tem o comprimento e o ângulo), a partir do ponto ou com ele no meio. */
export function JanelaCriarForma({ tipo, aoFechar, aoConfirmar }: { tipo: TipoDaFormaViva; aoFechar: () => void; aoConfirmar: (medidas: { largura: number; altura: number; doMeio: boolean }) => void }) {
  const linha = tipo === "linha";
  const [largura, setLargura] = useState(linha ? 200 : 100);
  const [altura, setAltura] = useState(linha ? 0 : 100);
  const [doMeio, setDoMeio] = useState(false);
  const titulo = { retangulo: "Criar retângulo", elipse: "Criar elipse", triangulo: "Criar triângulo", poligono: "Criar polígono", linha: "Criar linha" }[tipo];
  return (
    <Moldura titulo={titulo} aoFechar={aoFechar} aoConfirmar={() => aoConfirmar({ largura, altura, doMeio })}>
      <NumeroDaForma rotulo={linha ? "Comprimento" : "Largura"} valor={largura} minimo={1} maximo={30000} sufixo="px" aoMudar={setLargura} largura="w-20" />
      <NumeroDaForma rotulo={linha ? "Ângulo" : "Altura"} valor={altura} minimo={linha ? -360 : 1} maximo={linha ? 360 : 30000} sufixo={linha ? "°" : "px"} aoMudar={setAltura} largura="w-20" />
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={doMeio} onChange={(evento) => setDoMeio(evento.currentTarget.checked)} />
        Do meio
      </label>
    </Moldura>
  );
}

export type OpcoesDaCaneta = { modo: "forma" | "caminho"; elastico: boolean; ajuste: number; autoAdicionar: boolean };
export const CANETA_PADRAO: OpcoesDaCaneta = { modo: "caminho", elastico: true, ajuste: 2, autoAdicionar: true };

/** A barra das canetas e das seleções de caminho: o modo, as tintas (no modo Forma) e o que criar do caminho. */
export function OpcoesDaCanetaNaBarra({
  ferramenta,
  caneta,
  formas,
  primeiroPlano,
  fundo,
  doEspaco,
  comFormaEscolhida,
  comCaminho,
  aoMudarCaneta,
  aoMudarFormas,
  aoCriarSelecao,
  aoCriarForma,
  componentes,
}: {
  ferramenta: string;
  caneta: OpcoesDaCaneta;
  formas: OpcoesDasFormas;
  primeiroPlano: string;
  fundo: string;
  doEspaco: Degrade[];
  comFormaEscolhida: boolean;
  /** Se há um caminho do painel escolhido (para os botões Seleção e Forma). */
  comCaminho: boolean;
  aoMudarCaneta: (mudanca: Partial<OpcoesDaCaneta>) => void;
  aoMudarFormas: (mudanca: Partial<OpcoesDasFormas>) => void;
  aoCriarSelecao: () => void;
  aoCriarForma: () => void;
  /** A Seleção de caminho: a operação dos componentes escolhidos e o mesclar (todos os componentes). */
  componentes?: { quantos: number; operacao: OperacaoDoCaminho | null; aoOperacao: (operacao: OperacaoDoCaminho) => void; aoMesclar: (() => void) | null };
}) {
  const ehCaneta = ferramenta === "caneta" || ferramenta === "canetaLivre" || ferramenta === "canetaDeCurvatura";
  return (
    <>
      {ehCaneta ? (
        <label className="flex items-center gap-1 text-suave">
          Modo:
          <select className={campo} value={caneta.modo} onChange={(evento) => aoMudarCaneta({ modo: evento.currentTarget.value as OpcoesDaCaneta["modo"] })} aria-label="Modo da caneta">
            <option value="caminho">Caminho</option>
            <option value="forma">Forma</option>
          </select>
        </label>
      ) : null}
      {ehCaneta && caneta.modo === "forma" ? (
        <>
          {SEPARADOR}
          <label className="flex items-center gap-1 text-suave">
            Operação:
            <select className={campo} value={comFormaEscolhida ? formas.operacao : "nova"} disabled={!comFormaEscolhida} onChange={(evento) => aoMudarFormas({ operacao: evento.currentTarget.value as OpcoesDasFormas["operacao"] })} aria-label="Operação da forma">
              <option value="nova">Nova camada</option>
              <option value="somar">Combinar formas</option>
              <option value="subtrair">Subtrair a forma da frente</option>
              <option value="intersectar">Intersectar as áreas</option>
              <option value="excluir">Excluir a sobreposição</option>
            </select>
          </label>
          {SEPARADOR}
          <TintasDaForma
            preenchimento={formas.preenchimento ?? { tipo: "cor", cor: primeiroPlano }}
            traco={formas.traco}
            primeiroPlano={primeiroPlano}
            fundo={fundo}
            doEspaco={doEspaco}
            aoMudarPreenchimento={(preenchimento) => aoMudarFormas({ preenchimento })}
            aoMudarTraco={(traco) => aoMudarFormas({ traco })}
          />
        </>
      ) : null}
      {!ehCaneta || caneta.modo === "caminho" ? (
        <>
          {ehCaneta ? SEPARADOR : null}
          <span className="text-suave">Criar:</span>
          <button type="button" className={`${campo} hover:text-texto disabled:opacity-50`} disabled={!comCaminho} onClick={aoCriarSelecao} title="O caminho escolhido vira a seleção (Ctrl+Enter)">
            Seleção
          </button>
          <button type="button" className={`${campo} hover:text-texto disabled:opacity-50`} disabled={!comCaminho} onClick={aoCriarForma} title="O caminho escolhido vira uma camada de forma, com o preenchimento e o traçado das formas">
            Forma
          </button>
        </>
      ) : null}
      {ferramenta === "caneta" ? (
        <>
          {SEPARADOR}
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={caneta.elastico} onChange={(evento) => aoMudarCaneta({ elastico: evento.currentTarget.checked })} />
            Elástico
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={caneta.autoAdicionar} onChange={(evento) => aoMudarCaneta({ autoAdicionar: evento.currentTarget.checked })} />
            Adicionar e excluir automaticamente
          </label>
        </>
      ) : null}
      {componentes ? (
        <>
          {SEPARADOR}
          <label className="flex items-center gap-1 text-suave">
            Componentes:
            <select className={campo} disabled={!componentes.quantos} value={componentes.operacao ?? ""} onChange={(evento) => componentes.aoOperacao(evento.currentTarget.value as OperacaoDoCaminho)} aria-label="Operação dos componentes" title={componentes.quantos ? undefined : "Clique num componente do caminho para escolhê-lo"}>
              {componentes.operacao === null ? <option value="">{componentes.quantos ? "Várias" : "Nenhum escolhido"}</option> : null}
              <option value="somar">Combinar formas</option>
              <option value="subtrair">Subtrair a forma da frente</option>
              <option value="intersectar">Intersectar as áreas</option>
              <option value="excluir">Excluir a sobreposição</option>
            </select>
          </label>
          <button type="button" className={`${campo} hover:text-texto disabled:opacity-50`} disabled={!componentes.aoMesclar} onClick={() => componentes.aoMesclar?.()} title="Junta os componentes num contorno só, com as operações aplicadas">
            Mesclar componentes
          </button>
        </>
      ) : null}
      {ferramenta === "canetaLivre" ? (
        <>
          {SEPARADOR}
          <NumeroDaForma rotulo="Ajuste de curva" valor={caneta.ajuste} minimo={0.5} maximo={10} sufixo="px" aoMudar={(ajuste) => aoMudarCaneta({ ajuste })} largura="w-10" />
        </>
      ) : null}
    </>
  );
}

/** Os tamanhos prontos das pranchetas (os do editor de imagem e telas comuns). */
export const TAMANHOS_DE_PRANCHETA: { nome: string; largura: number; altura: number }[] = [
  { nome: "Post quadrado", largura: 1080, altura: 1080 },
  { nome: "Post retrato", largura: 1080, altura: 1350 },
  { nome: "Story e status", largura: 1080, altura: 1920 },
  { nome: "Capa de vídeo", largura: 1280, altura: 720 },
  { nome: "Banner largo", largura: 1500, altura: 500 },
  { nome: "Slide", largura: 1920, altura: 1080 },
  { nome: "Celular", largura: 1170, altura: 2532 },
  { nome: "Tablet", largura: 1640, altura: 2360 },
  { nome: "Computador", largura: 1440, altura: 1024 },
  { nome: "Ícone", largura: 1024, altura: 1024 },
  { nome: "Folha A4", largura: 2480, altura: 3508 },
  { nome: "Cartão de visita", largura: 1050, altura: 600 },
];

/** A barra da ferramenta Prancheta: o tamanho pronto, a largura e a altura, retrato ou paisagem e o fundo. */
export function OpcoesDaPranchetaNaBarra({
  prancheta,
  tamanho,
  aoMudarTamanho,
  aoMudarPrancheta,
  aoNova,
}: {
  /** A prancheta escolhida (a barra muda ela); sem ela, o tamanho da próxima. */
  prancheta: { largura: number; altura: number; fundo: { cor: string; transparente: boolean } } | null;
  tamanho: { largura: number; altura: number };
  aoMudarTamanho: (tamanho: { largura: number; altura: number }) => void;
  aoMudarPrancheta: (mudanca: Partial<{ largura: number; altura: number; fundo: { cor: string; transparente: boolean } }>) => void;
  aoNova: () => void;
}) {
  const atual = prancheta ?? tamanho;
  const mudar = (novo: { largura: number; altura: number }) => (prancheta ? aoMudarPrancheta(novo) : aoMudarTamanho(novo));
  const pronto = TAMANHOS_DE_PRANCHETA.findIndex((item) => item.largura === Math.round(atual.largura) && item.altura === Math.round(atual.altura));
  return (
    <>
      <span className="text-suave">{prancheta ? "Prancheta escolhida:" : "Próxima prancheta:"}</span>
      <select className={campo} value={pronto} onChange={(evento) => Number(evento.currentTarget.value) >= 0 && mudar(TAMANHOS_DE_PRANCHETA[Number(evento.currentTarget.value)])} aria-label="Tamanho pronto da prancheta">
        <option value={-1}>Tamanho próprio</option>
        {TAMANHOS_DE_PRANCHETA.map((item, i) => (
          <option key={item.nome} value={i}>
            {item.nome} ({item.largura} × {item.altura})
          </option>
        ))}
      </select>
      <NumeroDaForma rotulo="L" valor={Math.round(atual.largura)} minimo={1} maximo={8192} sufixo="px" aoMudar={(largura) => mudar({ largura: Math.round(largura), altura: atual.altura })} largura="w-14" />
      <NumeroDaForma rotulo="A" valor={Math.round(atual.altura)} minimo={1} maximo={8192} sufixo="px" aoMudar={(altura) => mudar({ largura: atual.largura, altura: Math.round(altura) })} largura="w-14" />
      <button type="button" className={`${campo} hover:text-texto`} title={atual.largura >= atual.altura ? "Virar para retrato" : "Virar para paisagem"} onClick={() => mudar({ largura: atual.altura, altura: atual.largura })}>
        {atual.largura >= atual.altura ? "Paisagem" : "Retrato"}
      </button>
      {prancheta ? (
        <>
          {SEPARADOR}
          <label className="flex items-center gap-1 text-suave">
            Fundo:
            <input type="color" value={prancheta.fundo.cor} disabled={prancheta.fundo.transparente} onChange={(evento) => aoMudarPrancheta({ fundo: { ...prancheta.fundo, cor: evento.currentTarget.value } })} className="h-5 w-8 cursor-pointer rounded border border-borda" aria-label="Cor do fundo da prancheta" />
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={prancheta.fundo.transparente} onChange={(evento) => aoMudarPrancheta({ fundo: { ...prancheta.fundo, transparente: evento.currentTarget.checked } })} />
            Transparente
          </label>
        </>
      ) : null}
      {SEPARADOR}
      <button type="button" className={`${campo} hover:text-texto`} onClick={aoNova} title="Uma prancheta nova à direita das outras">
        + Prancheta
      </button>
    </>
  );
}

/** O "Traçar caminho": a ferramenta de pintura (com as opções dela) e a pressão simulada. */
export function JanelaTracarCaminho({ aoFechar, aoConfirmar }: { aoFechar: () => void; aoConfirmar: (ferramenta: FerramentaDoTracado, simular: boolean) => void }) {
  const [ferramenta, setFerramenta] = useState<FerramentaDoTracado>("pincel");
  const [simular, setSimular] = useState(false);
  return (
    <Moldura titulo="Traçar caminho" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(ferramenta, simular)}>
      <label className="flex items-center gap-2">
        Ferramenta:
        <select className={`${campo} flex-1`} value={ferramenta} onChange={(evento) => setFerramenta(evento.currentTarget.value as FerramentaDoTracado)} aria-label="Ferramenta do traçado">
          {FERRAMENTAS_DO_TRACADO.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={simular} onChange={(evento) => setSimular(evento.currentTarget.checked)} />
        Simular pressão
      </label>
      <p className="text-[11px] text-suave">O traço usa o tamanho e as opções da ferramenta escolhida.</p>
    </Moldura>
  );
}

export const FERRAMENTAS_DO_TRACADO = [
  { id: "lapis", nome: "Lápis" },
  { id: "pincel", nome: "Pincel" },
  { id: "borracha", nome: "Borracha" },
  { id: "misturador", nome: "Pincel misturador" },
  { id: "substituicaoDeCor", nome: "Substituição de cor" },
  { id: "carimbo", nome: "Carimbo" },
  { id: "carimboDePadrao", nome: "Carimbo de padrão" },
  { id: "historico", nome: "Pincel do histórico" },
  { id: "desfoque", nome: "Desfoque" },
  { id: "nitidez", nome: "Nitidez" },
  { id: "borrar", nome: "Borrar" },
  { id: "subexposicao", nome: "Subexposição" },
  { id: "superexposicao", nome: "Superexposição" },
  { id: "esponja", nome: "Esponja" },
] as const;
export type FerramentaDoTracado = (typeof FERRAMENTAS_DO_TRACADO)[number]["id"];

/** O "Criar caminho de trabalho" da seleção: a tolerância (quanto o caminho pode se afastar da borda). */
export function JanelaCaminhoDaSelecao({ aoFechar, aoConfirmar }: { aoFechar: () => void; aoConfirmar: (tolerancia: number) => void }) {
  const [tolerancia, setTolerancia] = useState(2);
  return (
    <Moldura titulo="Criar caminho de trabalho" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(tolerancia)}>
      <NumeroDaForma rotulo="Tolerância" valor={tolerancia} minimo={0.5} maximo={10} sufixo="pixels" aoMudar={setTolerancia} largura="w-14" />
    </Moldura>
  );
}
