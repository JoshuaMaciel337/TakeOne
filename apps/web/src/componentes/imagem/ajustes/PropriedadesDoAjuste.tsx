"use client";

// O painel Propriedades de uma camada de ajuste do editor de imagem (ADR 0003, onda 13.10): as predefinições, os
// controles do tipo (os dezesseis ajustes) e o rodapé de lá: prender à camada de baixo, ver sem o ajuste (enquanto
// aperta), redefinir, mostrar ou esconder e excluir. Mexer prevê na tela; soltar vira um passo do desfazer.
import { Eye, EyeOff, CornerLeftDown, RotateCcw, Trash2, Pipette, Plus, Minus, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { ControleNumerico } from "@/componentes/editor/ControleNumerico";
import {
  ajustePadrao,
  type AjusteDaImagem,
  CORES_DA_SELETIVA,
  type AjusteDaFaixa,
  type CorDaSeletiva,
  emHsl,
  FAIXAS_DO_MATIZ,
  type FaixaDoMatiz,
  FILTROS_DE_FOTOS,
  type LinhaDoMixer,
  NOMES_DOS_AJUSTES,
  type Rgb,
  type Tintas,
  type TomHsl,
  type TonsDoEquilibrio,
} from "@/lib/imagem/ajustes";
import { histogramas as contarHistogramas, niveisAutomaticos } from "@/lib/imagem/histograma";
import { PREDEFINICOES } from "@/lib/imagem/predefinicoesDosAjustes";
import { type Degrade, DEGRADES_PRONTOS, rgbDe } from "@/lib/pintura/degrade";
import type { Comando } from "@/lib/projeto/comandos";
import type { Faixa } from "@/lib/projeto/modelo";
import type { ImagemRgba } from "@/lib/selecao/varinha";
import { useLuts } from "@/lib/useLuts";

import { AmostraDoDegrade, JanelaEditorDeDegrade } from "../Degrades";
import { GraficoDoHistograma } from "./GraficoDoHistograma";
import { type ContaGotas, EditorDeCurvas, EditorDeNiveis, type Mudancas, niveisDoContaGotas } from "./NiveisECurvas";

type De<T extends AjusteDaImagem["tipo"]> = Extract<AjusteDaImagem, { tipo: T }>;
const caixa = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-texto";
const hex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;

/** Um controle deslizante de um número do ajuste. */
function Controle<T extends AjusteDaImagem>({ rotulo, valor, minimo, maximo, passo, sufixo = "", com, mudancas }: { rotulo: string; valor: number; minimo: number; maximo: number; passo?: number; sufixo?: string; com: (valor: number) => T; mudancas: Mudancas<T> }) {
  return <ControleNumerico rotulo={rotulo} valor={valor} minimo={minimo} maximo={maximo} passo={passo} sufixo={sufixo} aoPrever={(v) => mudancas.prever(com(v))} aoConfirmar={(v) => mudancas.confirmar(com(v))} />;
}

function Marcar({ rotulo, marcado, aoMudar }: { rotulo: string; marcado: boolean; aoMudar: (marcado: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <input type="checkbox" checked={marcado} onChange={(evento) => aoMudar(evento.currentTarget.checked)} />
      {rotulo}
    </label>
  );
}

function Escolha<T extends string>({ rotulo, valor, opcoes, aoMudar }: { rotulo: string; valor: T; opcoes: { id: T; nome: string }[]; aoMudar: (valor: T) => void }) {
  return (
    <label className="flex items-center gap-2 text-suave">
      {rotulo}:
      <select className={`${caixa} flex-1`} value={valor} onChange={(evento) => aoMudar(evento.currentTarget.value as T)} aria-label={rotulo}>
        {opcoes.map((opcao) => (
          <option key={opcao.id} value={opcao.id}>
            {opcao.nome}
          </option>
        ))}
      </select>
    </label>
  );
}

// ——— Matiz/Saturação ———
const ESPECTRO = "linear-gradient(to right, #f00, #ff0 16.67%, #0f0 33.33%, #0ff 50%, #00f 66.67%, #f0f 83.33%, #f00)";
const girar = (graus: number) => ((graus % 360) + 360) % 360;

function MatizSaturacao({ ajuste, mudancas, pedirAmostra, amostrando }: { ajuste: De<"matiz_saturacao">; mudancas: Mudancas<De<"matiz_saturacao">>; pedirAmostra: (receber: (cor: Rgb) => void) => void; amostrando: string | null }) {
  const [faixa, setFaixa] = useState<FaixaDoMatiz | "mestre">("mestre");
  const padrao = FAIXAS_DO_MATIZ.find((item) => item.id === faixa);
  const daFaixa: AjusteDaFaixa | null = faixa === "mestre" ? null : (ajuste.faixas[faixa] ?? { matiz: 0, saturacao: 0, luminosidade: 0, limites: padrao!.limites });
  const atual: TomHsl = daFaixa ?? ajuste.mestre;
  const com = (mudanca: Partial<AjusteDaFaixa>): De<"matiz_saturacao"> => {
    if (ajuste.colorir) return { ...ajuste, cor_colorir: { ...ajuste.cor_colorir, ...mudanca } };
    if (faixa === "mestre") return { ...ajuste, mestre: { ...ajuste.mestre, ...mudanca } };
    return { ...ajuste, faixas: { ...ajuste.faixas, [faixa]: { ...daFaixa!, ...mudanca } } };
  };
  const tom = ajuste.colorir ? ajuste.cor_colorir : atual;
  const limites = daFaixa?.limites ?? null;
  // O conta-gotas da faixa: pegar centra a faixa no matiz clicado; somar e tirar alargam ou estreitam o lado mais perto
  const amostrar = (jeito: "pegar" | "somar" | "tirar") =>
    pedirAmostra((cor) => {
      const [h, s] = emHsl(cor);
      if (s <= 0.02 || !limites || faixa === "mestre") return;
      const [a, b, c, d] = limites;
      let novos: [number, number, number, number];
      if (jeito === "pegar") novos = [girar(h - 45), girar(h - 15), girar(h + 15), girar(h + 45)];
      else {
        const meio = girar(b + girar(c - b) / 2);
        const depois = girar(h - meio) <= 180;
        if (jeito === "somar") novos = depois ? [a, b, girar(h), girar(h + 30)] : [girar(h - 30), girar(h), c, d];
        else novos = depois ? [a, b, girar(h - 30), girar(h)] : [girar(h), girar(h + 30), c, d];
      }
      mudancas.confirmar(com({ limites: novos }));
    });
  return (
    <div className="flex flex-col gap-2">
      {ajuste.colorir ? null : (
        <Escolha rotulo="Cores" valor={faixa} opcoes={[{ id: "mestre", nome: "Principal" }, ...FAIXAS_DO_MATIZ.map(({ id, nome }) => ({ id, nome }))]} aoMudar={setFaixa} />
      )}
      <Controle rotulo="Matiz" valor={tom.matiz} minimo={ajuste.colorir ? 0 : -180} maximo={ajuste.colorir ? 360 : 180} sufixo="°" com={(matiz) => com({ matiz })} mudancas={mudancas} />
      <Controle rotulo="Saturação" valor={tom.saturacao} minimo={ajuste.colorir ? 0 : -100} maximo={100} com={(saturacao) => com({ saturacao })} mudancas={mudancas} />
      <Controle rotulo="Luminosidade" valor={tom.luminosidade} minimo={-100} maximo={100} com={(luminosidade) => com({ luminosidade })} mudancas={mudancas} />
      <Marcar rotulo="Colorir" marcado={ajuste.colorir} aoMudar={(colorir) => mudancas.confirmar({ ...ajuste, colorir })} />
      <div className="flex flex-col gap-1" aria-label="Espectro">
        <div className="h-2.5 rounded-sm" style={{ background: ESPECTRO }} />
        <div className="h-2.5 rounded-sm" style={{ background: ESPECTRO, filter: `hue-rotate(${ajuste.colorir ? 0 : (faixa === "mestre" ? ajuste.mestre.matiz : 0)}deg)` }} />
      </div>
      {limites && !ajuste.colorir ? (
        <>
          <div className="relative h-3" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="absolute top-0 -ml-px h-3 w-0.5 bg-texto" style={{ left: `${(limites[i] / 360) * 100}%`, opacity: i === 1 || i === 2 ? 1 : 0.5 }} />
            ))}
          </div>
          <div className="flex items-center gap-1 text-suave">
            Faixa:
            {limites.map((v, i) => (
              <input
                key={`${i}-${v}`}
                aria-label={`Limite ${i + 1} da faixa`}
                className={`${caixa} w-11 text-right tabular-nums`}
                defaultValue={Math.round(v)}
                onBlur={(evento) => {
                  const numero = Number(evento.currentTarget.value);
                  if (!Number.isFinite(numero) || Math.round(numero) === Math.round(v)) return;
                  const novos = [...limites] as [number, number, number, number];
                  novos[i] = girar(numero);
                  mudancas.confirmar(com({ limites: novos }));
                }}
                onKeyDown={(evento) => evento.key === "Enter" && evento.currentTarget.blur()}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            {([["pegar", Pipette, "Pegar a faixa na imagem"], ["somar", Plus, "Somar à faixa"], ["tirar", Minus, "Tirar da faixa"]] as const).map(([jeito, Icone, nome]) => (
              <button key={jeito} type="button" className={`botao-icone size-7 ${amostrando === jeito ? "bg-painel-3 ring-1 ring-destaque" : ""}`} title={nome} aria-label={nome} onClick={() => amostrar(jeito)}>
                <Icone className="size-4" aria-hidden />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ——— Equilíbrio de cores ———
function Equilibrio({ ajuste, mudancas }: { ajuste: De<"equilibrio">; mudancas: Mudancas<De<"equilibrio">> }) {
  const [tom, setTom] = useState<"sombras" | "meios" | "realces">("meios");
  const valores = ajuste[tom];
  const com = (campo: keyof TonsDoEquilibrio) => (v: number) => ({ ...ajuste, [tom]: { ...valores, [campo]: v } });
  return (
    <div className="flex flex-col gap-2">
      <Escolha rotulo="Tom" valor={tom} opcoes={[{ id: "sombras", nome: "Sombras" }, { id: "meios", nome: "Meios-tons" }, { id: "realces", nome: "Realces" }]} aoMudar={setTom} />
      <Controle rotulo="Ciano ↔ Vermelho" valor={valores.ciano_vermelho} minimo={-100} maximo={100} com={com("ciano_vermelho")} mudancas={mudancas} />
      <Controle rotulo="Magenta ↔ Verde" valor={valores.magenta_verde} minimo={-100} maximo={100} com={com("magenta_verde")} mudancas={mudancas} />
      <Controle rotulo="Amarelo ↔ Azul" valor={valores.amarelo_azul} minimo={-100} maximo={100} com={com("amarelo_azul")} mudancas={mudancas} />
      <Marcar rotulo="Preservar a luminosidade" marcado={ajuste.preservar} aoMudar={(preservar) => mudancas.confirmar({ ...ajuste, preservar })} />
    </div>
  );
}

// ——— Preto e branco ———
function PretoBranco({ ajuste, mudancas, imagem }: { ajuste: De<"preto_branco">; mudancas: Mudancas<De<"preto_branco">>; imagem: ImagemRgba | null }) {
  // O automático dá a cada cor um peso que espalha os tons: as cores mais presentes ficam mais perto do meio
  const automatico = () => {
    if (!imagem) return;
    const soma: Record<FaixaDoMatiz, number> = { vermelhos: 0, amarelos: 0, verdes: 0, cianos: 0, azuis: 0, magentas: 0 };
    for (let i = 0; i < imagem.dados.length; i += 16) {
      const [h, s] = emHsl([imagem.dados[i] / 255, imagem.dados[i + 1] / 255, imagem.dados[i + 2] / 255]);
      if (s < 0.1) continue;
      const faixa = FAIXAS_DO_MATIZ[Math.floor(girar(h + 30) / 60)].id;
      soma[faixa] += s;
    }
    const total = Object.values(soma).reduce((a, b) => a + b, 0) || 1;
    const pesos = { ...ajuste.pesos };
    for (const { id } of FAIXAS_DO_MATIZ) pesos[id] = Math.round(30 + 50 * (1 - soma[id] / total) + (id === "amarelos" || id === "magentas" ? 10 : 0));
    mudancas.confirmar({ ...ajuste, pesos });
  };
  return (
    <div className="flex flex-col gap-2">
      {FAIXAS_DO_MATIZ.map((faixa) => (
        <Controle key={faixa.id} rotulo={faixa.nome} valor={ajuste.pesos[faixa.id]} minimo={-200} maximo={300} sufixo="%" com={(v) => ({ ...ajuste, pesos: { ...ajuste.pesos, [faixa.id]: v } })} mudancas={mudancas} />
      ))}
      <button type="button" className="botao-secundario self-start px-2 py-1 text-xs" disabled={!imagem} onClick={automatico}>
        Automático
      </button>
      <Marcar rotulo="Tonalizar" marcado={ajuste.tonalizar} aoMudar={(tonalizar) => mudancas.confirmar({ ...ajuste, tonalizar })} />
      {ajuste.tonalizar ? (
        <>
          <Controle rotulo="Matiz" valor={ajuste.matiz} minimo={0} maximo={360} sufixo="°" com={(matiz) => ({ ...ajuste, matiz })} mudancas={mudancas} />
          <Controle rotulo="Saturação" valor={ajuste.saturacao} minimo={0} maximo={100} sufixo="%" com={(saturacao) => ({ ...ajuste, saturacao })} mudancas={mudancas} />
        </>
      ) : null}
    </div>
  );
}

// ——— Mixer de canais ———
function Mixer({ ajuste, mudancas }: { ajuste: De<"mixer">; mudancas: Mudancas<De<"mixer">> }) {
  const [saida, setSaida] = useState<"vermelho" | "verde" | "azul">("vermelho");
  const chave = ajuste.monocromatico ? "cinza" : saida;
  const linha = ajuste[chave];
  const com = (campo: keyof LinhaDoMixer) => (v: number) => ({ ...ajuste, [chave]: { ...linha, [campo]: v } });
  const total = linha.r + linha.g + linha.b;
  return (
    <div className="flex flex-col gap-2">
      {ajuste.monocromatico ? null : <Escolha rotulo="Canal de saída" valor={saida} opcoes={[{ id: "vermelho", nome: "Vermelho" }, { id: "verde", nome: "Verde" }, { id: "azul", nome: "Azul" }]} aoMudar={setSaida} />}
      <Marcar rotulo="Monocromático" marcado={ajuste.monocromatico} aoMudar={(monocromatico) => mudancas.confirmar({ ...ajuste, monocromatico })} />
      <Controle rotulo="Vermelho" valor={linha.r} minimo={-200} maximo={200} sufixo="%" com={com("r")} mudancas={mudancas} />
      <Controle rotulo="Verde" valor={linha.g} minimo={-200} maximo={200} sufixo="%" com={com("g")} mudancas={mudancas} />
      <Controle rotulo="Azul" valor={linha.b} minimo={-200} maximo={200} sufixo="%" com={com("b")} mudancas={mudancas} />
      <span className={`text-right ${total > 100 ? "text-amber-500" : "text-suave"}`} title={total > 100 ? "Acima de 100%, os claros estouram" : undefined}>
        Total: {total > 0 ? "+" : ""}
        {Math.round(total)}%
      </span>
      <Controle rotulo="Constante" valor={linha.constante} minimo={-200} maximo={200} sufixo="%" com={com("constante")} mudancas={mudancas} />
    </div>
  );
}

// ——— Cor seletiva ———
function CorSeletiva({ ajuste, mudancas }: { ajuste: De<"cor_seletiva">; mudancas: Mudancas<De<"cor_seletiva">> }) {
  const [cor, setCor] = useState<CorDaSeletiva>("vermelhos");
  const tintas: Tintas = ajuste.cores[cor] ?? { ciano: 0, magenta: 0, amarelo: 0, preto: 0 };
  const com = (campo: keyof Tintas) => (v: number) => ({ ...ajuste, cores: { ...ajuste.cores, [cor]: { ...tintas, [campo]: v } } });
  return (
    <div className="flex flex-col gap-2">
      <Escolha rotulo="Cores" valor={cor} opcoes={CORES_DA_SELETIVA} aoMudar={setCor} />
      <Controle rotulo="Ciano" valor={tintas.ciano} minimo={-100} maximo={100} sufixo="%" com={com("ciano")} mudancas={mudancas} />
      <Controle rotulo="Magenta" valor={tintas.magenta} minimo={-100} maximo={100} sufixo="%" com={com("magenta")} mudancas={mudancas} />
      <Controle rotulo="Amarelo" valor={tintas.amarelo} minimo={-100} maximo={100} sufixo="%" com={com("amarelo")} mudancas={mudancas} />
      <Controle rotulo="Preto" valor={tintas.preto} minimo={-100} maximo={100} sufixo="%" com={com("preto")} mudancas={mudancas} />
      <span className="flex gap-3">
        <label className="flex items-center gap-1">
          <input type="radio" checked={!ajuste.absoluto} onChange={() => mudancas.confirmar({ ...ajuste, absoluto: false })} /> Relativo
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={ajuste.absoluto} onChange={() => mudancas.confirmar({ ...ajuste, absoluto: true })} /> Absoluto
        </label>
      </span>
    </div>
  );
}

// ——— Mapa de degradê ———
/** O mapa como um degradê do editor de degradês (para editar) e de volta. */
const degradeDoMapa = (ajuste: De<"mapa_degrade">): Degrade => ({
  nome: "Mapa",
  tipo: "solido",
  cores: ajuste.cores.map((parada) => ({ posicao: parada.posicao, cor: parada.cor, meio: 0.5 })),
  opacidades: [
    { posicao: 0, opacidade: 1, meio: 0.5 },
    { posicao: 1, opacidade: 1, meio: 0.5 },
  ],
  suavidade: 1,
  aspereza: 0.5,
  semente: 1,
});

function MapaDeDegrade({ ajuste, mudancas, primeiroPlano, fundo, degradesDoEspaco }: { ajuste: De<"mapa_degrade">; mudancas: Mudancas<De<"mapa_degrade">>; primeiroPlano: string; fundo: string; degradesDoEspaco: Degrade[] }) {
  const [editando, setEditando] = useState(false);
  const doDegrade = (degrade: Degrade): De<"mapa_degrade"> => ({
    ...ajuste,
    // As paradas do editor podem ter o meio fora de 0,5: o mapa guarda as cores resolvidas, e um meio mexido vira uma parada a mais
    cores: degrade.cores.flatMap((parada, i) => {
      const cor = hex(rgbDe(parada.cor, primeiroPlano, fundo).map((v) => v / 255) as Rgb);
      const proxima = degrade.cores[i + 1];
      if (!proxima || Math.abs(parada.meio - 0.5) < 0.01) return [{ posicao: parada.posicao, cor }];
      const a = rgbDe(parada.cor, primeiroPlano, fundo);
      const b = rgbDe(proxima.cor, primeiroPlano, fundo);
      const meio = hex(a.map((v, k) => (v + b[k]) / 2 / 255) as Rgb);
      return [{ posicao: parada.posicao, cor }, { posicao: parada.posicao + (proxima.posicao - parada.posicao) * parada.meio, cor: meio }];
    }).slice(0, 32),
  });
  const prontos = [...DEGRADES_PRONTOS.flatMap((pasta) => pasta.degrades), ...degradesDoEspaco];
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="rounded hover:ring-2 hover:ring-destaque" title="Editar o degradê" aria-label="Editar o degradê do mapa" onClick={() => setEditando(true)}>
        <AmostraDoDegrade degrade={degradeDoMapa(ajuste)} primeiroPlano={primeiroPlano} fundo={fundo} className="h-6 w-full" />
      </button>
      <div className="grid max-h-24 grid-cols-6 gap-1 overflow-y-auto" role="group" aria-label="Degradês prontos">
        {prontos.map((degrade, i) => (
          <button key={`${degrade.nome}-${i}`} type="button" title={degrade.nome} aria-label={degrade.nome} className="rounded hover:ring-2 hover:ring-destaque" onClick={() => mudancas.confirmar(doDegrade(degrade))}>
            <AmostraDoDegrade degrade={degrade} primeiroPlano={primeiroPlano} fundo={fundo} className="h-5 w-full" />
          </button>
        ))}
      </div>
      <Marcar rotulo="Inverter" marcado={ajuste.inverter} aoMudar={(inverter) => mudancas.confirmar({ ...ajuste, inverter })} />
      {editando ? (
        <JanelaEditorDeDegrade
          inicial={degradeDoMapa(ajuste)}
          doEspaco={degradesDoEspaco}
          primeiroPlano={primeiroPlano}
          fundo={fundo}
          aoFechar={() => setEditando(false)}
          aoConfirmar={(degrade) => {
            setEditando(false);
            mudancas.confirmar(doDegrade(degrade));
          }}
          aoSalvar={() => undefined}
        />
      ) : null}
    </div>
  );
}

// ——— Pesquisa de cores ———
function Pesquisa({ ajuste, mudancas }: { ajuste: De<"pesquisa">; mudancas: Mudancas<De<"pesquisa">> }) {
  const { luts, erro, importar } = useLuts();
  const [enviando, setEnviando] = useState("");
  const arquivoRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-suave">
        LUT:
        <select
          className={`${caixa} flex-1`}
          aria-label="LUT"
          value={ajuste.lut?.id ?? ""}
          onChange={(evento) => mudancas.confirmar({ ...ajuste, lut: evento.currentTarget.value ? { id: evento.currentTarget.value, intensidade: ajuste.lut?.intensidade ?? 1 } : null })}
        >
          <option value="">Nenhuma</option>
          {(luts ?? []).map((lut) => (
            <option key={lut.id} value={lut.id}>
              {lut.nome}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="botao-secundario flex items-center gap-1.5 self-start px-2 py-1 text-xs" onClick={() => arquivoRef.current?.click()}>
        <Upload className="size-3.5" aria-hidden />
        Carregar um .cube…
      </button>
      <input
        ref={arquivoRef}
        type="file"
        accept=".cube"
        className="hidden"
        onChange={(evento) => {
          const arquivo = evento.currentTarget.files?.[0];
          evento.currentTarget.value = "";
          if (!arquivo) return;
          setEnviando("Enviando…");
          importar(arquivo)
            .then((nova) => {
              setEnviando("");
              mudancas.confirmar({ ...ajuste, lut: { id: nova.id, intensidade: 1 } });
            })
            .catch((e: unknown) => setEnviando(e instanceof Error ? e.message : "Não foi possível carregar a LUT."));
        }}
      />
      {enviando || erro ? <p className="text-suave">{enviando || erro}</p> : null}
      {ajuste.lut ? <Controle rotulo="Intensidade" valor={ajuste.lut.intensidade * 100} minimo={0} maximo={100} sufixo="%" com={(v) => ({ ...ajuste, lut: { ...ajuste.lut!, intensidade: v / 100 } })} mudancas={mudancas} /> : null}
    </div>
  );
}

export type Props = {
  clipeId: string;
  /** Sem a faixa, o painel fica sem o rodapé (a janela de Imagem › Ajustes, que aplica nos pixels). */
  faixa?: Faixa | null;
  ajuste: AjusteDaImagem;
  /** O que está embaixo da camada (o histograma, os conta-gotas e os automáticos). */
  imagem: ImagemRgba | null;
  primeiroPlano: string;
  fundo: string;
  degradesDoEspaco: Degrade[];
  /** O conta-gotas: a próxima cor clicada na imagem vai para `receber` (null desiste). */
  aoPedirAmostra: (receber: ((cor: Rgb) => void) | null) => void;
  amostrando: boolean;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => unknown;
  /** Enquanto aperta o olho de "ver sem o ajuste". */
  aoVerSem?: (ver: boolean) => void;
  aoExcluir?: () => void;
  /** No lugar dos comandos: a janela de Imagem › Ajustes guarda o ajuste nela e prevê nos pixels. */
  mudancasLocais?: Mudancas<AjusteDaImagem>;
  /** Sem o título (a janela já tem o dela). */
  semTitulo?: boolean;
};

export function PropriedadesDoAjuste({ clipeId, faixa, ajuste, imagem, primeiroPlano, fundo, degradesDoEspaco, aoPedirAmostra, amostrando, aoPrever, aoExecutar, aoVerSem, aoExcluir, mudancasLocais, semTitulo }: Props) {
  const [qualAmostra, setQualAmostra] = useState<string | null>(null);
  const [predefinicao, setPredefinicao] = useState("");
  const vendoSem = useRef(false);
  const hist = useMemo(() => (imagem ? contarHistogramas(imagem.dados) : null), [imagem]);
  const comando = (novo: AjusteDaImagem): Comando => ({ comando: "imagem.ajuste", parametros: { clipeId, ajuste: novo } });
  const mudancas: Mudancas<AjusteDaImagem> = {
    prever: (novo) => {
      setPredefinicao("");
      if (mudancasLocais) mudancasLocais.prever(novo);
      else aoPrever(comando(novo));
    },
    confirmar: (novo) => {
      setPredefinicao("");
      if (mudancasLocais) return mudancasLocais.confirmar(novo);
      aoPrever(null);
      aoExecutar(comando(novo));
    },
  };
  const pedirAmostra = (qual: string, receber: (cor: Rgb) => void) => {
    setQualAmostra(qual);
    aoPedirAmostra((cor) => {
      setQualAmostra(null);
      receber(cor);
    });
  };
  const ativo = amostrando ? qualAmostra : null;
  const predefinicoes = PREDEFINICOES[ajuste.tipo] ?? [];
  const automatico = (jeito: "tom" | "contraste" | "cor") => {
    if (!hist) return;
    const canais = niveisAutomaticos(hist, jeito);
    if (ajuste.tipo === "niveis") mudancas.confirmar({ tipo: "niveis", canais });
    else if (ajuste.tipo === "curvas") {
      // Os níveis automáticos em pontos de curva (o preto e o branco de cada canal; a gama num ponto do meio)
      const curvas = Object.fromEntries(
        Object.entries(canais).map(([canal, n]) => {
          const meio = n.preto + (n.branco - n.preto) * 0.5 ** n.gama;
          const pontos: [number, number][] = [[n.preto / 255, 0], ...(Math.abs(n.gama - 1) > 0.01 ? [[meio / 255, 0.5] as [number, number]] : []), [n.branco / 255, 1]];
          return [canal, { pontos }];
        }),
      );
      mudancas.confirmar({ tipo: "curvas", canais: curvas });
    }
  };
  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        {semTitulo ? <span /> : <h3 className="font-semibold">{NOMES_DOS_AJUSTES[ajuste.tipo]}</h3>}
        {ajuste.tipo === "niveis" || ajuste.tipo === "curvas" ? (
          <select className={caixa} aria-label="Automático" value="" disabled={!hist} onChange={(evento) => evento.currentTarget.value && automatico(evento.currentTarget.value as "tom" | "contraste" | "cor")}>
            <option value="">Automático…</option>
            <option value="tom">Tom (cada canal)</option>
            <option value="contraste">Contraste (sem mudar a cor)</option>
            <option value="cor">Cor (e os meios-tons neutros)</option>
          </select>
        ) : null}
      </div>
      {predefinicoes.length ? (
        <label className="flex items-center gap-2 text-suave">
          Predefinição:
          <select
            className={`${caixa} flex-1`}
            aria-label="Predefinição"
            value={predefinicao}
            onChange={(evento) => {
              const escolhida = predefinicoes.find((item) => item.nome === evento.currentTarget.value);
              const valor = evento.currentTarget.value;
              mudancas.confirmar(escolhida ? escolhida.ajuste : ajustePadrao(ajuste.tipo, primeiroPlano, fundo));
              setPredefinicao(valor);
            }}
          >
            <option value="">{predefinicao ? "Padrão" : "Personalizado"}</option>
            {predefinicoes.map((item) => (
              <option key={item.nome} value={item.nome}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {ajuste.tipo === "brilho_contraste" ? (
        <div className="flex flex-col gap-2">
          <Controle rotulo="Brilho" valor={ajuste.brilho} minimo={ajuste.antigo ? -100 : -150} maximo={ajuste.antigo ? 100 : 150} com={(brilho) => ({ ...ajuste, brilho })} mudancas={mudancas} />
          <Controle rotulo="Contraste" valor={ajuste.contraste} minimo={ajuste.antigo ? -100 : -50} maximo={100} com={(contraste) => ({ ...ajuste, contraste })} mudancas={mudancas} />
          <Marcar rotulo="Usar o antigo" marcado={ajuste.antigo} aoMudar={(antigo) => mudancas.confirmar({ ...ajuste, antigo, contraste: antigo ? ajuste.contraste : Math.max(-50, ajuste.contraste) })} />
          <button
            type="button"
            className="botao-secundario self-start px-2 py-1 text-xs"
            disabled={!hist}
            onClick={() => {
              // O automático leva a média ao meio (brilho) e espalha os tons até as pontas (contraste)
              if (!hist) return;
              let soma = 0;
              for (let i = 0; i < 256; i++) soma += i * hist.luma[i];
              const media = soma / Math.max(1, hist.pixels) / 255;
              // O brilho de hoje: 1 − (1 − m)^e clareia e m^e escurece, com e = 2^(|brilho|/100); acha o e que leva m a 0,5
              const m = Math.min(0.99, Math.max(0.01, media));
              const e = m < 0.5 ? Math.log(0.5) / Math.log(1 - m) : Math.log(0.5) / Math.log(m);
              const brilho = Math.round(Math.max(-150, Math.min(150, (m < 0.5 ? 1 : -1) * 100 * Math.log2(e))));
              mudancas.confirmar({ ...ajuste, antigo: false, brilho: Math.abs(brilho) < 3 ? 0 : brilho, contraste: 15 });
            }}
          >
            Automático
          </button>
        </div>
      ) : null}
      {ajuste.tipo === "niveis" ? (
        <EditorDeNiveis
          ajuste={ajuste}
          histogramas={hist}
          amostrando={(ativo as ContaGotas | null) ?? null}
          aoAmostrar={(qual) => (qual ? pedirAmostra(qual, (cor) => mudancas.confirmar(niveisDoContaGotas(ajuste, qual, cor))) : (setQualAmostra(null), aoPedirAmostra(null)))}
          mudancas={mudancas}
        />
      ) : null}
      {ajuste.tipo === "curvas" ? <EditorDeCurvas ajuste={ajuste} histogramas={hist} mudancas={mudancas} /> : null}
      {ajuste.tipo === "exposicao" ? (
        <div className="flex flex-col gap-2">
          <Controle rotulo="Exposição" valor={ajuste.exposicao} minimo={-20} maximo={20} passo={0.01} com={(exposicao) => ({ ...ajuste, exposicao })} mudancas={mudancas} />
          <Controle rotulo="Deslocamento" valor={ajuste.deslocamento} minimo={-0.5} maximo={0.5} passo={0.0001} com={(deslocamento) => ({ ...ajuste, deslocamento })} mudancas={mudancas} />
          <Controle rotulo="Correção de gama" valor={ajuste.gama} minimo={0.01} maximo={9.99} passo={0.01} com={(gama) => ({ ...ajuste, gama })} mudancas={mudancas} />
        </div>
      ) : null}
      {ajuste.tipo === "vibracao" ? (
        <div className="flex flex-col gap-2">
          <Controle rotulo="Vibração" valor={ajuste.vibracao} minimo={-100} maximo={100} com={(vibracao) => ({ ...ajuste, vibracao })} mudancas={mudancas} />
          <Controle rotulo="Saturação" valor={ajuste.saturacao} minimo={-100} maximo={100} com={(saturacao) => ({ ...ajuste, saturacao })} mudancas={mudancas} />
        </div>
      ) : null}
      {ajuste.tipo === "matiz_saturacao" ? <MatizSaturacao ajuste={ajuste} mudancas={mudancas} pedirAmostra={(receber) => pedirAmostra("pegar", receber)} amostrando={ativo} /> : null}
      {ajuste.tipo === "equilibrio" ? <Equilibrio ajuste={ajuste} mudancas={mudancas} /> : null}
      {ajuste.tipo === "preto_branco" ? <PretoBranco ajuste={ajuste} mudancas={mudancas} imagem={imagem} /> : null}
      {ajuste.tipo === "filtro_de_fotos" ? (
        <div className="flex flex-col gap-2">
          <Escolha rotulo="Filtro" valor={FILTROS_DE_FOTOS.find((f) => f.cor === ajuste.cor)?.cor ?? ""} opcoes={[...FILTROS_DE_FOTOS.map((f) => ({ id: f.cor, nome: f.nome })), ...(FILTROS_DE_FOTOS.some((f) => f.cor === ajuste.cor) ? [] : [{ id: "", nome: "Cor própria" }])]} aoMudar={(cor) => cor && mudancas.confirmar({ ...ajuste, cor })} />
          <label className="flex items-center gap-2 text-suave">
            Cor:
            <input type="color" className="h-6 w-12 cursor-pointer rounded border border-borda" aria-label="Cor do filtro" value={ajuste.cor} onChange={(evento) => mudancas.confirmar({ ...ajuste, cor: evento.currentTarget.value })} />
          </label>
          <Controle rotulo="Densidade" valor={ajuste.densidade} minimo={0} maximo={100} sufixo="%" com={(densidade) => ({ ...ajuste, densidade })} mudancas={mudancas} />
          <Marcar rotulo="Preservar a luminosidade" marcado={ajuste.preservar} aoMudar={(preservar) => mudancas.confirmar({ ...ajuste, preservar })} />
        </div>
      ) : null}
      {ajuste.tipo === "mixer" ? <Mixer ajuste={ajuste} mudancas={mudancas} /> : null}
      {ajuste.tipo === "pesquisa" ? <Pesquisa ajuste={ajuste} mudancas={mudancas} /> : null}
      {ajuste.tipo === "inverter" ? <p className="text-suave">As cores de tudo o que está embaixo viram o negativo.</p> : null}
      {ajuste.tipo === "posterizar" ? <Controle rotulo="Níveis" valor={ajuste.niveis} minimo={2} maximo={255} com={(niveis) => ({ ...ajuste, niveis: Math.round(niveis) })} mudancas={mudancas} /> : null}
      {ajuste.tipo === "limiar" ? (
        <div className="flex flex-col gap-2">
          <div className="rounded border border-borda bg-black/40">{hist ? <GraficoDoHistograma contagens={[{ contagem: hist.luma, cor: "#9aa0aa" }]} altura={80} intervalo={[ajuste.nivel, ajuste.nivel]} /> : <div className="h-20" />}</div>
          <Controle rotulo="Nível do limiar" valor={ajuste.nivel} minimo={1} maximo={255} com={(nivel) => ({ ...ajuste, nivel: Math.round(nivel) })} mudancas={mudancas} />
        </div>
      ) : null}
      {ajuste.tipo === "mapa_degrade" ? <MapaDeDegrade ajuste={ajuste} mudancas={mudancas} primeiroPlano={primeiroPlano} fundo={fundo} degradesDoEspaco={degradesDoEspaco} /> : null}
      {ajuste.tipo === "cor_seletiva" ? <CorSeletiva ajuste={ajuste} mudancas={mudancas} /> : null}
      {faixa ? (
      <div className="flex items-center gap-1 border-t border-borda pt-2">
        <button
          type="button"
          className={`botao-icone size-7 ${faixa.recortada ? "bg-painel-3 text-texto" : ""}`}
          title={faixa.recortada ? "Este ajuste vale só para a camada de baixo (clique para valer para todas)" : "Fazer este ajuste valer só para a camada de baixo"}
          aria-label="Prender o ajuste à camada de baixo"
          aria-pressed={Boolean(faixa.recortada)}
          onClick={() => aoExecutar({ comando: "imagem.camada", parametros: { faixaIds: [faixa.id], mudanca: { recortada: !faixa.recortada } } })}
        >
          <CornerLeftDown className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="botao-icone size-7"
          title="Ver sem o ajuste (enquanto aperta)"
          aria-label="Ver sem o ajuste"
          onPointerDown={() => {
            vendoSem.current = true;
            aoVerSem?.(true);
          }}
          onPointerUp={() => {
            vendoSem.current = false;
            aoVerSem?.(false);
          }}
          onPointerLeave={() => {
            if (!vendoSem.current) return;
            vendoSem.current = false;
            aoVerSem?.(false);
          }}
        >
          <EyeOff className="size-4" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-7" title="Redefinir os padrões do ajuste" aria-label="Redefinir os padrões do ajuste" onClick={() => mudancas.confirmar(ajustePadrao(ajuste.tipo, primeiroPlano, fundo))}>
          <RotateCcw className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="botao-icone size-7"
          title={faixa.oculta ? "Mostrar a camada" : "Esconder a camada"}
          aria-label={faixa.oculta ? "Mostrar a camada" : "Esconder a camada"}
          onClick={() => aoExecutar({ comando: "imagem.camada", parametros: { faixaIds: [faixa.id], mudanca: { oculta: !faixa.oculta } } })}
        >
          <Eye className={`size-4 ${faixa.oculta ? "opacity-40" : ""}`} aria-hidden />
        </button>
        <button type="button" className="botao-icone ml-auto size-7" title="Excluir a camada de ajuste" aria-label="Excluir a camada de ajuste" onClick={aoExcluir}>
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
      ) : null}
    </div>
  );
}

