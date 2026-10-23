"use client";

// Os painéis Pincéis (as predefinições, em pastas) e Configurações do pincel (F5), como nos editores de imagem: a
// forma da ponta e as seções de variação à esquerda, os controles da escolhida à direita e a prévia do traço embaixo.
import { ChevronDown, ChevronRight, LoaderCircle, Lock, Search, Trash2, Unlock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { desenharAmostraDoTraco } from "@/lib/pintura/amostraDoTraco";
import { amostraDaPonta, type IdDaPontaPersonalizada, PONTAS_DE_AMOSTRA, TEXTURAS, ladrilhoDaTextura } from "@/lib/pintura/pontas";
import { comPredefinicao, PASTAS_DE_PINCEIS, type PastaDePinceis, type Predefinicao, PREDEFINICOES } from "@/lib/pintura/predefinicoes";
import { type Controle, type OpcoesDoPincel, PINCEL_PADRAO, type SecaoDoPincel, type Variacao } from "@/lib/pintura/traco";

const campo = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";

/** A prévia de um traço com estas opções (desenhada pelo motor de verdade). */
function PreviaDoTraco({ opcoes, cor, largura, altura, className = "" }: { opcoes: OpcoesDoPincel; cor: string; largura: number; altura: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chave = JSON.stringify(opcoes) + cor;
  useEffect(() => {
    if (canvasRef.current) desenharAmostraDoTraco(canvasRef.current, opcoes, cor);
    // A chave junta as opções e a cor: desenha de novo só quando mudam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return <canvas ref={canvasRef} width={largura} height={altura} className={className} aria-hidden />;
}

/** A miniatura de uma ponta (a redonda é um círculo macio). */
function MiniaturaDaPonta({ ponta, tamanho = 28 }: { ponta: OpcoesDoPincel["ponta"]; tamanho?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, tamanho, tamanho);
    if (ponta === "redonda") {
      const gradiente = ctx.createRadialGradient(tamanho / 2, tamanho / 2, 0, tamanho / 2, tamanho / 2, tamanho * 0.45);
      gradiente.addColorStop(0.5, "#ffffff");
      gradiente.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradiente;
      ctx.fillRect(0, 0, tamanho, tamanho);
    } else {
      const amostra = amostraDaPonta(ponta);
      if (amostra) {
        // Proporcional, no meio (as pontas importadas não são quadradas)
        const escala = tamanho / Math.max(amostra.width, amostra.height);
        ctx.drawImage(amostra, (tamanho - amostra.width * escala) / 2, (tamanho - amostra.height * escala) / 2, amostra.width * escala, amostra.height * escala);
      }
    }
  }, [ponta, tamanho]);
  return <canvas ref={canvasRef} width={tamanho} height={tamanho} aria-hidden />;
}

/**
 * Painel Pincéis: as predefinições em pastas, com busca e o tamanho das miniaturas, os pincéis do espaço (salvos e
 * importados de um .abr), "Novo pincel" com as opções da vez e "Importar pincéis".
 */
export function PainelPinceis({
  opcoes,
  cor,
  doEspaco,
  ocupado,
  aoEscolher,
  aoAbrirConfiguracoes,
  aoSalvar,
  aoImportar,
  aoExcluir,
}: {
  opcoes: OpcoesDoPincel;
  cor: string;
  doEspaco: Predefinicao[];
  /** O que está acontecendo (importando, salvando), ou null. */
  ocupado: string | null;
  aoEscolher: (predefinicao: Predefinicao) => void;
  aoAbrirConfiguracoes: () => void;
  aoSalvar: (nome: string) => void;
  aoImportar: (arquivo: File) => void;
  aoExcluir: (predefinicao: Predefinicao) => void;
}) {
  const [busca, setBusca] = useState("");
  const [grandes, setGrandes] = useState(true);
  const [fechadas, setFechadas] = useState<Set<PastaDePinceis>>(new Set());
  const [nomeNovo, setNomeNovo] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const procura = busca.trim().toLocaleLowerCase("pt-BR");
  const todas = [...PREDEFINICOES, ...doEspaco];
  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-borda p-2">
        <label className="flex min-w-0 flex-1 items-center gap-1 rounded border border-borda bg-painel-2 px-1.5">
          <Search className="size-3 shrink-0 text-suave" aria-hidden />
          <input value={busca} onChange={(evento) => setBusca(evento.currentTarget.value)} placeholder="Procurar pincéis" aria-label="Procurar pincéis" className="min-w-0 flex-1 bg-transparent py-0.5 outline-none" />
        </label>
        <select aria-label="Tamanho das miniaturas" className={campo} value={grandes ? "grandes" : "pequenas"} onChange={(evento) => setGrandes(evento.currentTarget.value === "grandes")}>
          <option value="grandes">Traço grande</option>
          <option value="pequenas">Lista</option>
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {PASTAS_DE_PINCEIS.map((pasta) => {
          const itens = todas.filter((item) => item.pasta === pasta.id && (!procura || item.nome.toLocaleLowerCase("pt-BR").includes(procura)));
          if (!itens.length) return null;
          const aberta = !fechadas.has(pasta.id) || Boolean(procura);
          return (
            <section key={pasta.id}>
              <button
                type="button"
                className="flex w-full items-center gap-1 border-b border-borda/60 px-2 py-1 text-left font-medium"
                aria-expanded={aberta}
                onClick={() =>
                  setFechadas((atual) => {
                    const novas = new Set(atual);
                    if (novas.has(pasta.id)) novas.delete(pasta.id);
                    else novas.add(pasta.id);
                    return novas;
                  })
                }
              >
                {aberta ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
                {pasta.nome}
              </button>
              {aberta
                ? itens.map((item) => {
                    const amostra = comPredefinicao(opcoes, item);
                    const doEspacoTambem = item.id.startsWith("espaco:");
                    return (
                      <div key={item.id} className="group flex items-center border-b border-borda/40 hover:bg-painel-2">
                        <button type="button" title={item.nome} aria-label={item.nome} onClick={() => aoEscolher(item)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left">
                          <MiniaturaDaPonta ponta={amostra.ponta} tamanho={22} />
                          <span className="w-10 shrink-0 text-right tabular-nums text-suave">{Math.round(amostra.tamanho)}</span>
                          {grandes ? <PreviaDoTraco opcoes={amostra} cor={cor} largura={150} altura={34} className="min-w-0 flex-1" /> : null}
                          <span className="min-w-0 truncate">{item.nome}</span>
                        </button>
                        {doEspacoTambem ? (
                          <button type="button" className="botao-icone mr-1 size-6 opacity-0 group-hover:opacity-100 focus:opacity-100" title={`Excluir ${item.nome}`} aria-label={`Excluir ${item.nome}`} onClick={() => aoExcluir(item)}>
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                : null}
            </section>
          );
        })}
      </div>
      {nomeNovo !== null ? (
        <form
          className="flex shrink-0 items-center gap-1 border-t border-borda p-1.5"
          onSubmit={(evento) => {
            evento.preventDefault();
            if (nomeNovo.trim()) aoSalvar(nomeNovo.trim());
            setNomeNovo(null);
          }}
        >
          <input
            autoFocus
            value={nomeNovo}
            maxLength={80}
            onChange={(evento) => setNomeNovo(evento.currentTarget.value)}
            onKeyDown={(evento) => evento.key === "Escape" && setNomeNovo(null)}
            aria-label="Nome do pincel novo"
            className={`${campo} min-w-0 flex-1`}
          />
          <button type="submit" className="botao-principal px-2 py-0.5 text-xs" disabled={!nomeNovo.trim()}>
            Salvar
          </button>
        </form>
      ) : null}
      <div className="flex h-8 shrink-0 items-center gap-1 border-t border-borda px-1.5">
        {ocupado ? (
          <span className="flex min-w-0 items-center gap-1 truncate text-suave" role="status">
            <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden />
            {ocupado}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className="botao-icone h-6 w-auto px-2 text-xs" onClick={() => setNomeNovo("Meu pincel")} title="Novo pincel predefinido: guarda as opções da vez no espaço">
            Novo…
          </button>
          <button type="button" className="botao-icone h-6 w-auto px-2 text-xs" disabled={Boolean(ocupado)} onClick={() => arquivoRef.current?.click()} title="Importar pincéis de um arquivo .abr (as pontas de amostra)">
            Importar…
          </button>
          <input
            ref={arquivoRef}
            type="file"
            accept=".abr"
            className="hidden"
            aria-label="Arquivo de pincéis"
            onChange={(evento) => {
              const arquivo = evento.currentTarget.files?.[0];
              evento.currentTarget.value = "";
              if (arquivo) aoImportar(arquivo);
            }}
          />
          <button type="button" className="botao-icone h-6 w-auto px-2 text-xs" onClick={aoAbrirConfiguracoes} title="Configurações do pincel (F5)">
            Configurações…
          </button>
        </span>
      </div>
    </div>
  );
}

/** Um número com a régua (o valor do campo vale ao sair ou no Enter). */
function Deslizante({ rotulo, valor, minimo, maximo, passo = 1, sufixo = "%", desativado, aoMudar }: { rotulo: string; valor: number; minimo: number; maximo: number; passo?: number; sufixo?: string; desativado?: boolean; aoMudar: (valor: number) => void }) {
  return (
    <label className={`grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-0.5 ${desativado ? "opacity-40" : ""}`}>
      <span className="text-suave">{rotulo}</span>
      <span className="flex items-center gap-0.5">
        <input
          key={valor}
          aria-label={rotulo}
          disabled={desativado}
          defaultValue={Math.round(valor * 100) / 100}
          inputMode="decimal"
          onBlur={(evento) => {
            const numero = Number(evento.currentTarget.value.replace(",", "."));
            if (Number.isFinite(numero)) aoMudar(Math.min(maximo, Math.max(minimo, numero)));
          }}
          onKeyDown={(evento) => evento.key === "Enter" && evento.currentTarget.blur()}
          className={`${campo} w-12 text-right tabular-nums`}
        />
        <span className="w-4 text-suave">{sufixo}</span>
      </span>
      <input type="range" min={minimo} max={maximo} step={passo} value={valor} disabled={desativado} onChange={(evento) => aoMudar(Number(evento.currentTarget.value))} className="col-span-2" aria-hidden tabIndex={-1} />
    </label>
  );
}

const CONTROLES: { id: Controle; nome: string }[] = [
  { id: "nenhum", nome: "Desativado" },
  { id: "desvanecer", nome: "Desvanecer" },
  { id: "pressao", nome: "Pressão da caneta" },
  { id: "inclinacao", nome: "Inclinação da caneta" },
  { id: "giro", nome: "Giro da caneta" },
  { id: "direcao", nome: "Direção" },
];

/** O tremor, o controle e o mínimo de uma variação. */
function ControlesDaVariacao({ rotulo, variacao, comMinimo = true, comDirecao = false, aoMudar }: { rotulo: string; variacao: Variacao; comMinimo?: boolean; comDirecao?: boolean; aoMudar: (variacao: Variacao) => void }) {
  return (
    <div className="space-y-1.5 border-b border-borda/50 pb-2">
      <Deslizante rotulo={`Tremor ${rotulo}`} valor={variacao.tremor * 100} minimo={0} maximo={100} aoMudar={(valor) => aoMudar({ ...variacao, tremor: valor / 100 })} />
      <label className="flex items-center justify-between gap-2">
        <span className="text-suave">Controle:</span>
        <select aria-label={`Controle ${rotulo}`} className={campo} value={variacao.controle} onChange={(evento) => aoMudar({ ...variacao, controle: evento.currentTarget.value as Controle })}>
          {CONTROLES.filter((controle) => comDirecao || controle.id !== "direcao").map((controle) => (
            <option key={controle.id} value={controle.id}>
              {controle.nome}
            </option>
          ))}
        </select>
      </label>
      {comMinimo ? <Deslizante rotulo="Mínimo" valor={variacao.minimo * 100} minimo={0} maximo={100} desativado={variacao.controle === "nenhum"} aoMudar={(valor) => aoMudar({ ...variacao, minimo: valor / 100 })} /> : null}
    </div>
  );
}

type Aba = "forma" | SecaoDoPincel;
const ABAS: { id: Aba; nome: string; secao?: SecaoDoPincel }[] = [
  { id: "forma", nome: "Forma da ponta do pincel" },
  { id: "dinamicaDeForma", nome: "Dinâmica de forma", secao: "dinamicaDeForma" },
  { id: "dispersao", nome: "Dispersão", secao: "dispersao" },
  { id: "textura", nome: "Textura", secao: "textura" },
  { id: "duplo", nome: "Pincel duplo", secao: "duplo" },
  { id: "dinamicaDeCor", nome: "Dinâmica de cor", secao: "dinamicaDeCor" },
  { id: "transferencia", nome: "Transferência", secao: "transferencia" },
  { id: "pose", nome: "Pose do pincel", secao: "pose" },
];

/** Painel Configurações do pincel (F5). */
export function PainelConfiguracoesDoPincel({
  opcoes,
  cor,
  aoMudar,
  travadas,
  aoTravar,
  aoAbrirPredefinicoes,
  pontasDoEspaco,
}: {
  /** As pontas dos pincéis do espaço, que também aparecem na escolha da ponta. */
  pontasDoEspaco: IdDaPontaPersonalizada[];
  opcoes: OpcoesDoPincel;
  cor: string;
  aoMudar: (mudanca: Partial<OpcoesDoPincel>) => void;
  travadas: ReadonlySet<SecaoDoPincel>;
  aoTravar: (secao: SecaoDoPincel) => void;
  aoAbrirPredefinicoes: () => void;
}) {
  const [aba, setAba] = useState<Aba>("forma");
  const mudarSecao = <S extends SecaoDoPincel>(secao: S, mudanca: Partial<OpcoesDoPincel[S]>) => aoMudar({ [secao]: { ...opcoes[secao], ...mudanca, ligado: true } } as Partial<OpcoesDoPincel>);
  const caixas: { nome: string; valor: boolean; aoMudar: (valor: boolean) => void }[] = [
    { nome: "Ruído", valor: opcoes.ruido, aoMudar: (ruido) => aoMudar({ ruido }) },
    { nome: "Bordas molhadas", valor: opcoes.bordasMolhadas, aoMudar: (bordasMolhadas) => aoMudar({ bordasMolhadas }) },
    { nome: "Acúmulo", valor: opcoes.aerografo, aoMudar: (aerografo) => aoMudar({ aerografo }) },
    { nome: "Suavização", valor: opcoes.suavizacao > 0, aoMudar: (ligada) => aoMudar({ suavizacao: ligada ? Math.max(0.1, PINCEL_PADRAO.suavizacao) : 0 }) },
    { nome: "Proteger textura", valor: opcoes.protegerTextura, aoMudar: (protegerTextura) => aoMudar({ protegerTextura }) },
  ];

  let controles: React.ReactNode = null;
  if (aba === "forma") {
    controles = (
      <div className="space-y-2">
        <div className="grid grid-cols-6 gap-1" role="listbox" aria-label="Ponta do pincel">
          {(["redonda", ...PONTAS_DE_AMOSTRA.map((item) => item.id), ...pontasDoEspaco] as OpcoesDoPincel["ponta"][]).map((ponta) => (
            <button
              key={ponta}
              type="button"
              role="option"
              aria-selected={opcoes.ponta === ponta}
              title={ponta === "redonda" ? "Redonda" : (PONTAS_DE_AMOSTRA.find((item) => item.id === ponta)?.nome ?? "Ponta importada")}
              onClick={() => aoMudar({ ponta })}
              className={`grid aspect-square place-items-center rounded border bg-black ${opcoes.ponta === ponta ? "border-destaque" : "border-borda"}`}
            >
              <MiniaturaDaPonta ponta={ponta} />
            </button>
          ))}
        </div>
        <Deslizante rotulo="Tamanho" valor={opcoes.tamanho} minimo={1} maximo={5000} sufixo="px" aoMudar={(tamanho) => aoMudar({ tamanho })} />
        <div className="flex gap-3">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={opcoes.virarX} onChange={(evento) => aoMudar({ virarX: evento.currentTarget.checked })} />
            Virar X
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={opcoes.virarY} onChange={(evento) => aoMudar({ virarY: evento.currentTarget.checked })} />
            Virar Y
          </label>
        </div>
        <Deslizante rotulo="Ângulo" valor={opcoes.angulo} minimo={-180} maximo={180} sufixo="°" aoMudar={(angulo) => aoMudar({ angulo })} />
        <Deslizante rotulo="Arredondamento" valor={opcoes.arredondamento * 100} minimo={1} maximo={100} aoMudar={(valor) => aoMudar({ arredondamento: valor / 100 })} />
        <Deslizante rotulo="Dureza" valor={opcoes.dureza * 100} minimo={0} maximo={100} desativado={opcoes.ponta !== "redonda"} aoMudar={(valor) => aoMudar({ dureza: valor / 100 })} />
        <Deslizante rotulo="Espaçamento" valor={opcoes.espacamento * 100} minimo={1} maximo={1000} aoMudar={(valor) => aoMudar({ espacamento: valor / 100 })} />
      </div>
    );
  } else if (aba === "dinamicaDeForma") {
    const forma = opcoes.dinamicaDeForma;
    controles = (
      <div className="space-y-2">
        <ControlesDaVariacao rotulo="do tamanho" variacao={forma.tamanho} aoMudar={(tamanho) => mudarSecao("dinamicaDeForma", { tamanho })} />
        <ControlesDaVariacao rotulo="do ângulo" variacao={forma.angulo} comMinimo={false} comDirecao aoMudar={(angulo) => mudarSecao("dinamicaDeForma", { angulo })} />
        <ControlesDaVariacao rotulo="do arredondamento" variacao={forma.arredondamento} aoMudar={(arredondamento) => mudarSecao("dinamicaDeForma", { arredondamento })} />
        <div className="flex gap-3">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={forma.virarX} onChange={(evento) => mudarSecao("dinamicaDeForma", { virarX: evento.currentTarget.checked })} />
            Tremor ao virar X
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={forma.virarY} onChange={(evento) => mudarSecao("dinamicaDeForma", { virarY: evento.currentTarget.checked })} />
            Tremor ao virar Y
          </label>
        </div>
      </div>
    );
  } else if (aba === "dispersao") {
    const dispersao = opcoes.dispersao;
    controles = (
      <div className="space-y-2">
        <Deslizante rotulo="Dispersar" valor={dispersao.quanto * 100} minimo={0} maximo={1000} aoMudar={(valor) => mudarSecao("dispersao", { quanto: valor / 100 })} />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={dispersao.ambosEixos} onChange={(evento) => mudarSecao("dispersao", { ambosEixos: evento.currentTarget.checked })} />
          Ambos os eixos
        </label>
        <Deslizante rotulo="Contagem" valor={dispersao.contagem} minimo={1} maximo={16} sufixo="" aoMudar={(contagem) => mudarSecao("dispersao", { contagem: Math.round(contagem) })} />
        <Deslizante rotulo="Tremor da contagem" valor={dispersao.tremorDaContagem * 100} minimo={0} maximo={100} aoMudar={(valor) => mudarSecao("dispersao", { tremorDaContagem: valor / 100 })} />
      </div>
    );
  } else if (aba === "textura") {
    const textura = opcoes.textura;
    controles = (
      <div className="space-y-2">
        <div className="grid grid-cols-5 gap-1" role="listbox" aria-label="Padrão da textura">
          {TEXTURAS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={textura.id === item.id}
              title={item.nome}
              onClick={() => mudarSecao("textura", { id: item.id })}
              className={`aspect-square rounded border ${textura.id === item.id ? "border-destaque" : "border-borda"}`}
              style={{ backgroundImage: `url(${typeof document === "undefined" ? "" : ladrilhoDaTextura(item.id).toDataURL()})`, backgroundSize: "64px 64px" }}
            />
          ))}
        </div>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={textura.inverter} onChange={(evento) => mudarSecao("textura", { inverter: evento.currentTarget.checked })} />
          Inverter
        </label>
        <Deslizante rotulo="Escala" valor={textura.escala * 100} minimo={10} maximo={1000} aoMudar={(valor) => mudarSecao("textura", { escala: valor / 100 })} />
        <Deslizante rotulo="Profundidade" valor={textura.profundidade * 100} minimo={0} maximo={100} aoMudar={(valor) => mudarSecao("textura", { profundidade: valor / 100 })} />
      </div>
    );
  } else if (aba === "duplo") {
    const duplo = opcoes.duplo;
    controles = (
      <div className="space-y-2">
        <label className="flex items-center justify-between gap-2">
          <span className="text-suave">Segunda ponta:</span>
          <select aria-label="Segunda ponta" className={campo} value={duplo.ponta} onChange={(evento) => mudarSecao("duplo", { ponta: evento.currentTarget.value as OpcoesDoPincel["ponta"] })}>
            <option value="redonda">Redonda</option>
            {PONTAS_DE_AMOSTRA.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
        <Deslizante rotulo="Tamanho" valor={duplo.tamanho * 100} minimo={10} maximo={300} aoMudar={(valor) => mudarSecao("duplo", { tamanho: valor / 100 })} />
        <Deslizante rotulo="Dispersar" valor={duplo.dispersao * 100} minimo={0} maximo={100} aoMudar={(valor) => mudarSecao("duplo", { dispersao: valor / 100 })} />
        <Deslizante rotulo="Contagem" valor={duplo.contagem} minimo={1} maximo={16} sufixo="" aoMudar={(contagem) => mudarSecao("duplo", { contagem: Math.round(contagem) })} />
      </div>
    );
  } else if (aba === "dinamicaDeCor") {
    const dinamica = opcoes.dinamicaDeCor;
    controles = (
      <div className="space-y-2">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={dinamica.porPonta} onChange={(evento) => mudarSecao("dinamicaDeCor", { porPonta: evento.currentTarget.checked })} />
          Aplicar por ponta
        </label>
        <ControlesDaVariacao rotulo="primeiro plano/fundo" variacao={dinamica.primeiroFundo} comMinimo={false} aoMudar={(primeiroFundo) => mudarSecao("dinamicaDeCor", { primeiroFundo })} />
        <Deslizante rotulo="Tremor de matiz" valor={dinamica.matiz * 100} minimo={0} maximo={100} aoMudar={(valor) => mudarSecao("dinamicaDeCor", { matiz: valor / 100 })} />
        <Deslizante rotulo="Tremor de saturação" valor={dinamica.saturacao * 100} minimo={0} maximo={100} aoMudar={(valor) => mudarSecao("dinamicaDeCor", { saturacao: valor / 100 })} />
        <Deslizante rotulo="Tremor de brilho" valor={dinamica.brilho * 100} minimo={0} maximo={100} aoMudar={(valor) => mudarSecao("dinamicaDeCor", { brilho: valor / 100 })} />
        <Deslizante rotulo="Pureza" valor={dinamica.pureza * 100} minimo={-100} maximo={100} aoMudar={(valor) => mudarSecao("dinamicaDeCor", { pureza: valor / 100 })} />
      </div>
    );
  } else if (aba === "transferencia") {
    const transferencia = opcoes.transferencia;
    controles = (
      <div className="space-y-2">
        <ControlesDaVariacao rotulo="da opacidade" variacao={transferencia.opacidade} aoMudar={(opacidade) => mudarSecao("transferencia", { opacidade })} />
        <ControlesDaVariacao rotulo="do fluxo" variacao={transferencia.fluxo} aoMudar={(fluxo) => mudarSecao("transferencia", { fluxo })} />
      </div>
    );
  } else if (aba === "pose") {
    const pose = opcoes.pose;
    controles = (
      <div className="space-y-2">
        <p className="text-suave">Para quem pinta com o mouse: a inclinação, o giro e a pressão que a caneta daria.</p>
        <Deslizante rotulo="Inclinação X" valor={pose.inclinacaoX * 100} minimo={-100} maximo={100} aoMudar={(valor) => mudarSecao("pose", { inclinacaoX: valor / 100 })} />
        <Deslizante rotulo="Inclinação Y" valor={pose.inclinacaoY * 100} minimo={-100} maximo={100} aoMudar={(valor) => mudarSecao("pose", { inclinacaoY: valor / 100 })} />
        <Deslizante rotulo="Giro" valor={pose.giro} minimo={0} maximo={360} sufixo="°" aoMudar={(giro) => mudarSecao("pose", { giro })} />
        <Deslizante rotulo="Pressão" valor={pose.pressao * 100} minimo={0} maximo={100} aoMudar={(valor) => mudarSecao("pose", { pressao: valor / 100 })} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex min-h-0 flex-1">
        <div className="w-36 shrink-0 overflow-y-auto border-r border-borda py-1">
          <button type="button" className="mb-1 w-full px-2 py-1 text-left text-destaque hover:underline" onClick={aoAbrirPredefinicoes}>
            Predefinições de pincel
          </button>
          {ABAS.map((item) => {
            const secao = item.secao;
            const ligada = secao ? (opcoes[secao] as { ligado: boolean }).ligado : true;
            return (
              <div key={item.id} className={`flex items-center gap-1 px-1 ${aba === item.id ? "bg-destaque/20" : "hover:bg-painel-2"}`}>
                {secao ? (
                  <input type="checkbox" aria-label={`Ligar ${item.nome}`} checked={ligada} onChange={(evento) => aoMudar({ [secao]: { ...opcoes[secao], ligado: evento.currentTarget.checked } } as Partial<OpcoesDoPincel>)} />
                ) : (
                  <span className="w-3.5" />
                )}
                <button type="button" className="min-w-0 flex-1 truncate py-1 text-left" onClick={() => setAba(item.id)} aria-pressed={aba === item.id}>
                  {item.nome}
                </button>
                {secao ? (
                  <button type="button" className="text-suave hover:text-texto" title={travadas.has(secao) ? "Destravar: a predefinição escolhida troca esta seção" : "Travar: a seção fica ao escolher outra predefinição"} aria-label={`Travar ${item.nome}`} aria-pressed={travadas.has(secao)} onClick={() => aoTravar(secao)}>
                    {travadas.has(secao) ? <Lock className="size-3" aria-hidden /> : <Unlock className="size-3 opacity-40" aria-hidden />}
                  </button>
                ) : null}
              </div>
            );
          })}
          <div className="mt-1 border-t border-borda pt-1">
            {caixas.map((caixa) => (
              <label key={caixa.nome} className="flex items-center gap-1 px-1 py-0.5">
                <input type="checkbox" checked={caixa.valor} onChange={(evento) => caixa.aoMudar(evento.currentTarget.checked)} />
                {caixa.nome}
              </label>
            ))}
          </div>
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto p-2">{controles}</div>
      </div>
      <div className="shrink-0 border-t border-borda bg-white p-1">
        <PreviaDoTraco opcoes={opcoes} cor={cor === "#ffffff" ? "#000000" : cor} largura={300} altura={70} className="h-[70px] w-full" />
      </div>
    </div>
  );
}

export { comPredefinicao };
