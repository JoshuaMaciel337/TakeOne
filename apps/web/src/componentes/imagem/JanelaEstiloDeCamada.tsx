"use client";

// Camada › Estilo de camada (ADR 0003, onda 13.9): a janela dos efeitos, como nos editores de imagem. À esquerda, as
// opções de mesclagem e os dez efeitos (a caixa liga e desliga; o "+" põe outro do mesmo tipo nos que empilham); à
// direita, as opções do escolhido. A camada mostra o estilo enquanto ele muda; OK guarda num passo do desfazer e
// Cancelar volta como estava.
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { Degrade } from "@/lib/pintura/degrade";
import { MESCLAGENS_DA_IMAGEM, type Mesclagem } from "@/lib/projeto/modelo";
import { CONTORNOS_PRONTOS, type ContornoDoEfeito, type Efeito, efeitoPadrao, type EstiloDeCamada, LINEAR, type LuzGlobal, NOMES_DOS_EFEITOS, type TipoDoEfeito } from "@/lib/imagem/estiloDeCamada";
import { tabelaDoContorno } from "@/lib/imagem/efeitos";
import type { TintaDaForma } from "@/lib/vetor/modelo";
import { usePadroes } from "@/lib/pintura/padroes";
import { SeletorDeTinta } from "./OpcoesDaForma";

type Props = {
  inicial: EstiloDeCamada | null;
  luz: LuzGlobal;
  /** O efeito que a janela abre escolhido ("mesclagem": as opções de mesclagem). */
  foco?: TipoDoEfeito | "mesclagem";
  primeiroPlano: string;
  fundo: string;
  degradesDoEspaco: Degrade[];
  aoPrever: (estilo: EstiloDeCamada, luz: LuzGlobal) => void;
  aoConfirmar: (estilo: EstiloDeCamada, luz: LuzGlobal) => void;
  aoCancelar: () => void;
};

const campo = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";
const novoId = () => Math.random().toString(36).slice(2, 10);

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[8.5rem_1fr] items-center gap-2 text-xs text-suave">
      <span>{rotulo}</span>
      <span className="flex min-w-0 items-center gap-2 text-texto">{children}</span>
    </label>
  );
}

/** Um deslizante com o número ao lado (a unidade depois). */
function Deslizante({ rotulo, valor, min, max, passo = 1, unidade, fator = 1, aoMudar }: { rotulo: string; valor: number; min: number; max: number; passo?: number; unidade?: string; fator?: number; aoMudar: (valor: number) => void }) {
  const mostrado = Math.round(valor * fator * 100) / 100;
  return (
    <Linha rotulo={rotulo}>
      <input type="range" aria-label={rotulo} className="min-w-0 flex-1" min={min * fator} max={max * fator} step={passo} value={mostrado} onChange={(evento) => aoMudar(Number(evento.currentTarget.value) / fator)} />
      <input
        key={mostrado}
        aria-label={`${rotulo} (número)`}
        className={`${campo} w-14 text-right`}
        defaultValue={String(mostrado).replace(".", ",")}
        inputMode="decimal"
        onBlur={(evento) => {
          const numero = Number(evento.currentTarget.value.replace(",", "."));
          if (Number.isFinite(numero)) aoMudar(Math.min(max, Math.max(min, numero / fator)));
        }}
        onKeyDown={(evento) => {
          if (evento.key === "Enter") evento.currentTarget.blur();
          evento.stopPropagation();
        }}
      />
      {unidade ? <span className="w-5 text-suave">{unidade}</span> : null}
    </Linha>
  );
}

function SeletorDeModo({ rotulo = "Modo de mesclagem", valor, aoMudar }: { rotulo?: string; valor: Mesclagem; aoMudar: (modo: Exclude<Mesclagem, "passagem">) => void }) {
  return (
    <Linha rotulo={rotulo}>
      <select aria-label={rotulo} className={`${campo} flex-1`} value={valor} onChange={(evento) => aoMudar(evento.currentTarget.value as Exclude<Mesclagem, "passagem">)}>
        {MESCLAGENS_DA_IMAGEM.map((grupo, i) => (
          <optgroup key={i} label="—">
            {grupo.map((modo) => (
              <option key={modo.id} value={modo.id}>
                {modo.nome}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </Linha>
  );
}

function CampoDeCor({ rotulo, valor, aoMudar }: { rotulo: string; valor: string; aoMudar: (cor: string) => void }) {
  return (
    <Linha rotulo={rotulo}>
      <input type="color" aria-label={rotulo} value={valor} onChange={(evento) => aoMudar(evento.currentTarget.value)} className="h-6 w-10 cursor-pointer rounded border border-borda bg-fundo p-0" />
    </Linha>
  );
}

/** O desenho pequeno da curva de um contorno. */
function DesenhoDoContorno({ contorno }: { contorno: ContornoDoEfeito }) {
  const tabela = tabelaDoContorno(contorno);
  const pontos = Array.from({ length: 33 }, (_, i) => `${i},${32 - tabela[Math.round((i / 32) * 255)] * 32}`).join(" ");
  return (
    <svg viewBox="0 0 32 32" className="size-6 rounded border border-borda bg-fundo" aria-hidden>
      <polyline points={pontos} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

function SeletorDeContorno({ rotulo = "Contorno", valor, aoMudar }: { rotulo?: string; valor: ContornoDoEfeito | undefined; aoMudar: (contorno: ContornoDoEfeito) => void }) {
  const atual = valor ?? LINEAR;
  return (
    <Linha rotulo={rotulo}>
      <DesenhoDoContorno contorno={atual} />
      <select aria-label={rotulo} className={`${campo} flex-1`} value={atual.nome ?? ""} onChange={(evento) => aoMudar(CONTORNOS_PRONTOS.find((item) => item.nome === evento.currentTarget.value) ?? LINEAR)}>
        {atual.nome && CONTORNOS_PRONTOS.some((item) => item.nome === atual.nome) ? null : <option value={atual.nome ?? ""}>Personalizado</option>}
        {CONTORNOS_PRONTOS.map((item) => (
          <option key={item.nome} value={item.nome}>
            {item.nome}
          </option>
        ))}
      </select>
    </Linha>
  );
}

function Caixa({ rotulo, valor, aoMudar }: { rotulo: string; valor: boolean; aoMudar: (valor: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-texto">
      <input type="checkbox" checked={valor} onChange={(evento) => aoMudar(evento.currentTarget.checked)} />
      {rotulo}
    </label>
  );
}

export function JanelaEstiloDeCamada({ inicial, luz: luzInicial, foco, primeiroPlano, fundo, degradesDoEspaco, aoPrever, aoConfirmar, aoCancelar }: Props) {
  const [estilo, setEstilo] = useState<EstiloDeCamada>(() => {
    const base = inicial ?? { efeitos: [] };
    // Aberta num efeito que a camada ainda não tem: ele entra ligado, com os padrões
    if (foco && foco !== "mesclagem" && !base.efeitos.some((efeito) => efeito.tipo === foco)) return { ...base, efeitos: [...base.efeitos, efeitoPadrao(foco, novoId())] };
    return base;
  });
  const [luz, setLuz] = useState(luzInicial);
  const [escolhido, setEscolhido] = useState<string>(() => (foco && foco !== "mesclagem" ? (estilo.efeitos.find((efeito) => efeito.tipo === foco)?.id ?? "mesclagem") : "mesclagem"));
  const padroes = usePadroes();
  useEffect(() => {
    aoPrever(estilo, luz);
  }, [estilo, luz, aoPrever]);
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoCancelar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoCancelar]);

  const mudarEfeito = (id: string, mudanca: Partial<Efeito>) => setEstilo((atual) => ({ ...atual, efeitos: atual.efeitos.map((efeito) => (efeito.id === id ? { ...efeito, ...mudanca } : efeito)) }));
  const ligar = (tipo: TipoDoEfeito, ligado: boolean, id?: string) => {
    const existente = id ? estilo.efeitos.find((efeito) => efeito.id === id) : estilo.efeitos.find((efeito) => efeito.tipo === tipo);
    if (existente) {
      mudarEfeito(existente.id, { ligado });
      if (ligado) setEscolhido(existente.id);
      return;
    }
    const novo = efeitoPadrao(tipo, novoId());
    setEstilo((atual) => ({ ...atual, efeitos: [...atual.efeitos, novo] }));
    setEscolhido(novo.id);
  };
  const outro = (tipo: TipoDoEfeito) => {
    const novo = efeitoPadrao(tipo, novoId());
    setEstilo((atual) => ({ ...atual, efeitos: [...atual.efeitos, novo] }));
    setEscolhido(novo.id);
  };
  const tirar = (id: string) => {
    setEstilo((atual) => ({ ...atual, efeitos: atual.efeitos.filter((efeito) => efeito.id !== id) }));
    setEscolhido("mesclagem");
  };
  const efeito = estilo.efeitos.find((item) => item.id === escolhido) ?? null;

  /** O ângulo (e a altitude) de um efeito: com a luz global, quem muda é ela. */
  const anguloDe = (e: Efeito) => (e.luz_global ? luz.angulo : (e.angulo ?? 120));
  const altitudeDe = (e: Efeito) => (e.luz_global ? luz.altitude : (e.altitude ?? 30));
  const mudarAngulo = (e: Efeito, angulo: number) => (e.luz_global ? setLuz((atual) => ({ ...atual, angulo })) : mudarEfeito(e.id, { angulo }));
  const mudarAltitude = (e: Efeito, altitude: number) => (e.luz_global ? setLuz((atual) => ({ ...atual, altitude })) : mudarEfeito(e.id, { altitude }));

  const tinta = (e: Efeito, rotulo: string) => (
    <Linha rotulo={rotulo}>
      <SeletorDeTinta rotulo={rotulo} tinta={e.tinta ?? { tipo: "cor", cor: e.cor ?? "#000000" }} primeiroPlano={primeiroPlano} fundo={fundo} doEspaco={degradesDoEspaco} aoMudar={(nova: TintaDaForma) => mudarEfeito(e.id, { tinta: nova.tipo === "nenhuma" ? { tipo: "cor", cor: e.cor ?? "#000000" } : nova })} />
    </Linha>
  );
  const angulo = (e: Efeito, comAltitude = false) => (
    <>
      <Deslizante rotulo="Ângulo" valor={anguloDe(e)} min={-180} max={180} unidade="°" aoMudar={(v) => mudarAngulo(e, v)} />
      {comAltitude ? <Deslizante rotulo="Altitude" valor={altitudeDe(e)} min={0} max={90} unidade="°" aoMudar={(v) => mudarAltitude(e, v)} /> : null}
      <div className="pl-[8.5rem]">
        <Caixa rotulo="Usar a luz global" valor={Boolean(e.luz_global)} aoMudar={(v) => mudarEfeito(e.id, { luz_global: v, angulo: anguloDe(e), altitude: altitudeDe(e) })} />
      </div>
    </>
  );

  const opcoes = (e: Efeito) => {
    const comum = (
      <>
        <SeletorDeModo valor={e.modo} aoMudar={(modo) => mudarEfeito(e.id, { modo })} />
        <Deslizante rotulo="Opacidade" valor={e.opacidade} min={0} max={1} fator={100} unidade="%" aoMudar={(opacidade) => mudarEfeito(e.id, { opacidade })} />
      </>
    );
    switch (e.tipo) {
      case "sombra":
      case "sombra_interna":
        return (
          <>
            {comum}
            <CampoDeCor rotulo="Cor" valor={e.cor ?? "#000000"} aoMudar={(cor) => mudarEfeito(e.id, { cor })} />
            {angulo(e)}
            <Deslizante rotulo="Distância" valor={e.distancia ?? 0} min={0} max={500} unidade="px" aoMudar={(distancia) => mudarEfeito(e.id, { distancia })} />
            <Deslizante rotulo={e.tipo === "sombra" ? "Espalhar" : "Obstruir"} valor={e.espalhar ?? 0} min={0} max={1} fator={100} unidade="%" aoMudar={(espalhar) => mudarEfeito(e.id, { espalhar })} />
            <Deslizante rotulo="Tamanho" valor={e.tamanho ?? 0} min={0} max={250} unidade="px" aoMudar={(tamanho) => mudarEfeito(e.id, { tamanho })} />
            <SeletorDeContorno valor={e.contorno} aoMudar={(contorno) => mudarEfeito(e.id, { contorno })} />
            <Deslizante rotulo="Ruído" valor={e.ruido ?? 0} min={0} max={1} fator={100} unidade="%" aoMudar={(ruido) => mudarEfeito(e.id, { ruido })} />
            {e.tipo === "sombra" ? (
              <div className="pl-[8.5rem]">
                <Caixa rotulo="A camada vaza a sombra projetada" valor={e.vazar !== false} aoMudar={(vazar) => mudarEfeito(e.id, { vazar })} />
              </div>
            ) : null}
          </>
        );
      case "brilho_externo":
      case "brilho_interno":
        return (
          <>
            {comum}
            <Deslizante rotulo="Ruído" valor={e.ruido ?? 0} min={0} max={1} fator={100} unidade="%" aoMudar={(ruido) => mudarEfeito(e.id, { ruido })} />
            <Linha rotulo="Cor ou degradê">
              <select aria-label="Cor ou degradê do brilho" className={campo} value={e.tinta?.tipo === "degrade" ? "degrade" : "cor"} onChange={(evento) => mudarEfeito(e.id, { tinta: evento.currentTarget.value === "degrade" ? (efeitoPadrao("sobreposicao_degrade", "x").tinta as TintaDaForma) : undefined })}>
                <option value="cor">Cor</option>
                <option value="degrade">Degradê</option>
              </select>
              {e.tinta?.tipo === "degrade" ? null : <input type="color" aria-label="Cor do brilho" value={e.cor ?? "#ffffbe"} onChange={(evento) => mudarEfeito(e.id, { cor: evento.currentTarget.value })} className="h-6 w-10 cursor-pointer rounded border border-borda bg-fundo p-0" />}
            </Linha>
            {e.tinta?.tipo === "degrade" ? tinta(e, "Degradê") : null}
            <Linha rotulo="Técnica">
              <select aria-label="Técnica" className={campo} value={e.tecnica ?? "suave"} onChange={(evento) => mudarEfeito(e.id, { tecnica: evento.currentTarget.value as Efeito["tecnica"] })}>
                <option value="suave">Mais suave</option>
                <option value="preciso">Preciso</option>
              </select>
            </Linha>
            {e.tipo === "brilho_interno" ? (
              <Linha rotulo="Origem">
                <select aria-label="Origem" className={campo} value={e.origem ?? "borda"} onChange={(evento) => mudarEfeito(e.id, { origem: evento.currentTarget.value as Efeito["origem"] })}>
                  <option value="centro">Centro</option>
                  <option value="borda">Borda</option>
                </select>
              </Linha>
            ) : null}
            <Deslizante rotulo={e.tipo === "brilho_externo" ? "Espalhar" : "Obstruir"} valor={e.espalhar ?? 0} min={0} max={1} fator={100} unidade="%" aoMudar={(espalhar) => mudarEfeito(e.id, { espalhar })} />
            <Deslizante rotulo="Tamanho" valor={e.tamanho ?? 0} min={0} max={250} unidade="px" aoMudar={(tamanho) => mudarEfeito(e.id, { tamanho })} />
            <SeletorDeContorno valor={e.contorno} aoMudar={(contorno) => mudarEfeito(e.id, { contorno })} />
          </>
        );
      case "cetim":
        return (
          <>
            {comum}
            <CampoDeCor rotulo="Cor" valor={e.cor ?? "#000000"} aoMudar={(cor) => mudarEfeito(e.id, { cor })} />
            <Deslizante rotulo="Ângulo" valor={e.angulo ?? 19} min={-180} max={180} unidade="°" aoMudar={(v) => mudarEfeito(e.id, { angulo: v })} />
            <Deslizante rotulo="Distância" valor={e.distancia ?? 11} min={1} max={250} unidade="px" aoMudar={(distancia) => mudarEfeito(e.id, { distancia })} />
            <Deslizante rotulo="Tamanho" valor={e.tamanho ?? 14} min={0} max={250} unidade="px" aoMudar={(tamanho) => mudarEfeito(e.id, { tamanho })} />
            <SeletorDeContorno valor={e.contorno} aoMudar={(contorno) => mudarEfeito(e.id, { contorno })} />
            <div className="pl-[8.5rem]">
              <Caixa rotulo="Inverter" valor={Boolean(e.inverter)} aoMudar={(inverter) => mudarEfeito(e.id, { inverter })} />
            </div>
          </>
        );
      case "sobreposicao_cor":
        return (
          <>
            {comum}
            <CampoDeCor rotulo="Cor" valor={e.cor ?? "#ff0000"} aoMudar={(cor) => mudarEfeito(e.id, { cor })} />
          </>
        );
      case "sobreposicao_degrade":
        return (
          <>
            {comum}
            {tinta(e, "Degradê")}
            <div className="pl-[8.5rem]">
              <Caixa rotulo="Alinhar com a camada" valor={e.alinhar !== false} aoMudar={(alinhar) => mudarEfeito(e.id, { alinhar })} />
            </div>
          </>
        );
      case "sobreposicao_padrao":
        return (
          <>
            {comum}
            <Linha rotulo="Padrão">
              <select aria-label="Padrão" className={`${campo} flex-1`} value={e.tinta?.tipo === "padrao" ? e.tinta.padrao : ""} onChange={(evento) => mudarEfeito(e.id, { tinta: { tipo: "padrao", padrao: evento.currentTarget.value as never, escala: e.tinta?.tipo === "padrao" ? e.tinta.escala : 1 } })}>
                {padroes.map((padrao) => (
                  <option key={padrao.id} value={padrao.id}>
                    {padrao.nome}
                  </option>
                ))}
              </select>
            </Linha>
            <Deslizante rotulo="Escala" valor={e.tinta?.tipo === "padrao" ? e.tinta.escala : 1} min={0.01} max={10} fator={100} unidade="%" aoMudar={(escala) => e.tinta?.tipo === "padrao" && mudarEfeito(e.id, { tinta: { ...e.tinta, escala } })} />
          </>
        );
      case "tracado":
        return (
          <>
            <Deslizante rotulo="Tamanho" valor={e.tamanho ?? 3} min={1} max={250} unidade="px" aoMudar={(tamanho) => mudarEfeito(e.id, { tamanho })} />
            <Linha rotulo="Posição">
              <select aria-label="Posição do traçado" className={campo} value={e.posicao ?? "fora"} onChange={(evento) => mudarEfeito(e.id, { posicao: evento.currentTarget.value as Efeito["posicao"] })}>
                <option value="fora">Fora</option>
                <option value="dentro">Dentro</option>
                <option value="centro">Centro</option>
              </select>
            </Linha>
            {comum}
            {tinta(e, "Tipo de preenchimento")}
          </>
        );
      case "chanfro":
        return (
          <>
            <Linha rotulo="Estilo">
              <select aria-label="Estilo do chanfro" className={campo} value={e.estilo ?? "interno"} onChange={(evento) => mudarEfeito(e.id, { estilo: evento.currentTarget.value as Efeito["estilo"] })}>
                <option value="externo">Chanfro externo</option>
                <option value="interno">Chanfro interno</option>
                <option value="entalhe">Entalhe</option>
                <option value="almofada">Entalhe almofadado</option>
                <option value="tracado">Entalhe de traçado</option>
              </select>
            </Linha>
            <Linha rotulo="Técnica">
              <select aria-label="Técnica do chanfro" className={campo} value={e.tecnica ?? "suave"} onChange={(evento) => mudarEfeito(e.id, { tecnica: evento.currentTarget.value as Efeito["tecnica"] })}>
                <option value="suave">Suave</option>
                <option value="cinzel_duro">Cinzel duro</option>
                <option value="cinzel_suave">Cinzel suave</option>
              </select>
            </Linha>
            <Deslizante rotulo="Profundidade" valor={e.profundidade ?? 1} min={0.01} max={10} fator={100} unidade="%" aoMudar={(profundidade) => mudarEfeito(e.id, { profundidade })} />
            <Linha rotulo="Direção">
              <select aria-label="Direção do chanfro" className={campo} value={e.direcao ?? "cima"} onChange={(evento) => mudarEfeito(e.id, { direcao: evento.currentTarget.value as Efeito["direcao"] })}>
                <option value="cima">Para cima</option>
                <option value="baixo">Para baixo</option>
              </select>
            </Linha>
            <Deslizante rotulo="Tamanho" valor={e.tamanho ?? 5} min={0} max={250} unidade="px" aoMudar={(tamanho) => mudarEfeito(e.id, { tamanho })} />
            <Deslizante rotulo="Suavizar" valor={e.suavidade ?? 0} min={0} max={16} unidade="px" aoMudar={(suavidade) => mudarEfeito(e.id, { suavidade })} />
            {angulo(e, true)}
            <SeletorDeContorno rotulo="Contorno de brilho" valor={e.contorno_brilho} aoMudar={(contorno_brilho) => mudarEfeito(e.id, { contorno_brilho })} />
            <SeletorDeModo rotulo="Modo de realce" valor={e.modo_realce ?? "tela"} aoMudar={(modo_realce) => mudarEfeito(e.id, { modo_realce })} />
            <CampoDeCor rotulo="Cor do realce" valor={e.cor_realce ?? "#ffffff"} aoMudar={(cor_realce) => mudarEfeito(e.id, { cor_realce })} />
            <Deslizante rotulo="Opacidade do realce" valor={e.opacidade_realce ?? 0.75} min={0} max={1} fator={100} unidade="%" aoMudar={(opacidade_realce) => mudarEfeito(e.id, { opacidade_realce })} />
            <SeletorDeModo rotulo="Modo de sombra" valor={e.modo_sombra ?? "multiplicar"} aoMudar={(modo_sombra) => mudarEfeito(e.id, { modo_sombra })} />
            <CampoDeCor rotulo="Cor da sombra" valor={e.cor_sombra ?? "#000000"} aoMudar={(cor_sombra) => mudarEfeito(e.id, { cor_sombra })} />
            <Deslizante rotulo="Opacidade da sombra" valor={e.opacidade_sombra ?? 0.75} min={0} max={1} fator={100} unidade="%" aoMudar={(opacidade_sombra) => mudarEfeito(e.id, { opacidade_sombra })} />
            <div className="pl-[8.5rem]">
              <Caixa rotulo="Contorno do relevo" valor={Boolean(e.contorno_chanfro)} aoMudar={(ligado) => mudarEfeito(e.id, { contorno_chanfro: ligado ? LINEAR : undefined })} />
            </div>
            {e.contorno_chanfro ? <SeletorDeContorno rotulo="Contorno do relevo" valor={e.contorno_chanfro} aoMudar={(contorno_chanfro) => mudarEfeito(e.id, { contorno_chanfro })} /> : null}
          </>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoCancelar}>
      <div role="dialog" aria-modal aria-label="Estilo de camada" className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-borda bg-painel shadow-2xl" onClick={(evento) => evento.stopPropagation()} onKeyDown={(evento) => evento.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
          <h2 className="text-sm font-semibold">Estilo de camada</h2>
          <button type="button" className="botao-icone" onClick={aoCancelar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <ul className="w-56 shrink-0 overflow-y-auto border-r border-borda p-1.5 text-xs" aria-label="Efeitos">
            <li>
              <button type="button" className={`w-full rounded px-2 py-1 text-left ${escolhido === "mesclagem" ? "bg-superficie-2 font-semibold text-texto" : "text-texto hover:bg-superficie-2"}`} onClick={() => setEscolhido("mesclagem")}>
                Opções de mesclagem
              </button>
            </li>
            {NOMES_DOS_EFEITOS.map(({ tipo, nome, empilha }) => {
              const doTipo = estilo.efeitos.filter((item) => item.tipo === tipo);
              const linhas = doTipo.length ? doTipo : [null];
              return linhas.map((item, i) => (
                <li key={item?.id ?? tipo} className={`group flex items-center gap-1 rounded px-1 ${item && escolhido === item.id ? "bg-superficie-2" : "hover:bg-superficie-2"}`}>
                  <input type="checkbox" aria-label={nome} checked={Boolean(item?.ligado)} onChange={(evento) => ligar(tipo, evento.currentTarget.checked, item?.id)} />
                  <button type="button" className={`min-w-0 flex-1 truncate px-1 py-1 text-left ${item && escolhido === item.id ? "font-semibold text-texto" : "text-texto"}`} onClick={() => (item ? setEscolhido(item.id) : ligar(tipo, true))}>
                    {nome}
                  </button>
                  {empilha && i === 0 && item ? (
                    <button type="button" className="botao-icone size-5" title={`Outro: ${nome}`} aria-label={`Outro: ${nome}`} onClick={() => outro(tipo)}>
                      <Plus className="size-3" aria-hidden />
                    </button>
                  ) : null}
                  {item && i > 0 ? (
                    <button type="button" className="botao-icone size-5" title={`Tirar este: ${nome}`} aria-label={`Tirar este: ${nome}`} onClick={() => tirar(item.id)}>
                      <X className="size-3" aria-hidden />
                    </button>
                  ) : null}
                </li>
              ));
            })}
          </ul>
          <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
            {efeito ? (
              <>
                <h3 className="text-xs font-semibold text-texto">{NOMES_DOS_EFEITOS.find((item) => item.tipo === efeito.tipo)?.nome}</h3>
                {opcoes(efeito)}
              </>
            ) : (
              <>
                <h3 className="text-xs font-semibold text-texto">Opções de mesclagem</h3>
                <div className="pl-[8.5rem]">
                  <Caixa rotulo="Mostrar os efeitos" valor={estilo.ligado !== false} aoMudar={(ligado) => setEstilo((atual) => ({ ...atual, ligado }))} />
                </div>
                <Deslizante rotulo="Escala dos efeitos" valor={estilo.escala ?? 1} min={0.01} max={10} fator={100} unidade="%" aoMudar={(escala) => setEstilo((atual) => ({ ...atual, escala }))} />
                <Deslizante rotulo="Ângulo da luz global" valor={luz.angulo} min={-180} max={180} unidade="°" aoMudar={(angulo) => setLuz((atual) => ({ ...atual, angulo }))} />
                <Deslizante rotulo="Altitude da luz global" valor={luz.altitude} min={0} max={90} unidade="°" aoMudar={(altitude) => setLuz((atual) => ({ ...atual, altitude }))} />
              </>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-borda px-4 py-2.5">
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoCancelar}>
            Cancelar
          </button>
          <button type="button" className="botao-principal px-3 py-1 text-xs" onClick={() => aoConfirmar(estilo, luz)}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
