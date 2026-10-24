"use client";

// As opções da barra do retoque com pincel (ADR 0003, onda 13.5): Desfoque, Nitidez, Borrar, Subexposição,
// Superexposição, Esponja, Pincel misturador, Substituição de cor e Borracha de fundo.
import { MODOS_DO_RETOQUE, type OpcoesDaSubstituicao, type OpcoesDoMisturador, type OpcoesDoRetoque } from "@/lib/pintura/retoque";
import type { ModoDaPintura } from "@/lib/pintura/traco";

export type FerramentaDoRetoque = "desfoque" | "nitidez" | "borrar" | "subexposicao" | "superexposicao" | "esponja";

const campo = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";

function Porcentagem({ rotulo, valor, minimo = 1, aoMudar }: { rotulo: string; valor: number; minimo?: number; aoMudar: (valor: number) => void }) {
  return (
    <label className="flex items-center gap-1 text-suave">
      {rotulo}:
      <input type="number" min={minimo} max={100} value={Math.round(valor * 100)} onChange={(evento) => aoMudar(Math.min(1, Math.max(minimo / 100, Number(evento.currentTarget.value) / 100)))} className={`${campo} w-12 text-right`} aria-label={rotulo} />%
    </label>
  );
}

function Caixa({ rotulo, valor, aoMudar }: { rotulo: string; valor: boolean; aoMudar: (valor: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <input type="checkbox" checked={valor} onChange={(evento) => aoMudar(evento.currentTarget.checked)} />
      {rotulo}
    </label>
  );
}

function Escolha<T extends string>({ rotulo, valor, opcoes, aoMudar }: { rotulo: string; valor: T; opcoes: readonly (readonly [T, string])[]; aoMudar: (valor: T) => void }) {
  return (
    <label className="flex items-center gap-1 text-suave">
      {rotulo}:
      <select className={campo} value={valor} onChange={(evento) => aoMudar(evento.currentTarget.value as T)} aria-label={rotulo}>
        {opcoes.map(([id, nome]) => (
          <option key={id} value={id}>
            {nome}
          </option>
        ))}
      </select>
    </label>
  );
}

export function OpcoesDoRetoqueNaBarra({ ferramenta, opcoes, aoMudar }: { ferramenta: FerramentaDoRetoque; opcoes: OpcoesDoRetoque; aoMudar: (mudanca: Partial<OpcoesDoRetoque>) => void }) {
  if (ferramenta === "subexposicao" || ferramenta === "superexposicao") {
    return (
      <>
        <Escolha
          rotulo="Intervalo"
          valor={opcoes.intervalo}
          opcoes={[
            ["sombras", "Sombras"],
            ["meiosTons", "Meios-tons"],
            ["realces", "Realces"],
          ]}
          aoMudar={(intervalo) => aoMudar({ intervalo })}
        />
        <Porcentagem rotulo="Exposição" valor={opcoes.forca} aoMudar={(forca) => aoMudar({ forca })} />
        <Caixa rotulo="Proteger tons" valor={opcoes.protegerTons} aoMudar={(protegerTons) => aoMudar({ protegerTons })} />
      </>
    );
  }
  if (ferramenta === "esponja") {
    return (
      <>
        <Escolha
          rotulo="Modo"
          valor={opcoes.esponja}
          opcoes={[
            ["dessaturar", "Dessaturar"],
            ["saturar", "Saturar"],
          ]}
          aoMudar={(esponja) => aoMudar({ esponja })}
        />
        <Porcentagem rotulo="Fluxo" valor={opcoes.forca} aoMudar={(forca) => aoMudar({ forca })} />
        <Caixa rotulo="Vibração" valor={opcoes.vibracao} aoMudar={(vibracao) => aoMudar({ vibracao })} />
      </>
    );
  }
  return (
    <>
      <Escolha<ModoDaPintura> rotulo="Modo" valor={opcoes.modo} opcoes={MODOS_DO_RETOQUE.map((modo) => [modo.id, modo.nome] as const)} aoMudar={(modo) => aoMudar({ modo })} />
      <Porcentagem rotulo="Força" valor={opcoes.forca} aoMudar={(forca) => aoMudar({ forca })} />
      {ferramenta === "nitidez" ? <Caixa rotulo="Proteger detalhes" valor={opcoes.protegerDetalhes} aoMudar={(protegerDetalhes) => aoMudar({ protegerDetalhes })} /> : null}
      {ferramenta === "borrar" ? <Caixa rotulo="Pintura com o dedo" valor={opcoes.pinturaComDedo} aoMudar={(pinturaComDedo) => aoMudar({ pinturaComDedo })} /> : null}
    </>
  );
}

/** As combinações prontas do misturador (úmido, carga e mistura). */
const MISTURAS_PRONTAS: { nome: string; umido: number; carga: number; mistura: number }[] = [
  { nome: "Seco", umido: 0, carga: 0.5, mistura: 0 },
  { nome: "Úmido", umido: 0.5, carga: 0.5, mistura: 0.5 },
  { nome: "Úmido, muita mistura", umido: 0.5, carga: 0.25, mistura: 0.9 },
  { nome: "Muito úmido", umido: 0.9, carga: 0.5, mistura: 0.5 },
  { nome: "Molhado, só mistura", umido: 1, carga: 0, mistura: 1 },
];

export function OpcoesDoMisturadorNaBarra({ opcoes, aoMudar, aoCarregar, aoLimpar }: { opcoes: OpcoesDoMisturador; aoMudar: (mudanca: Partial<OpcoesDoMisturador>) => void; aoCarregar: () => void; aoLimpar: () => void }) {
  const pronta = MISTURAS_PRONTAS.findIndex((item) => item.umido === opcoes.umido && item.carga === opcoes.carga && item.mistura === opcoes.mistura);
  return (
    <>
      <button type="button" className="rounded px-1.5 py-0.5 text-xs hover:bg-painel-3" onClick={aoCarregar}>
        Carregar o pincel
      </button>
      <button type="button" className="rounded px-1.5 py-0.5 text-xs hover:bg-painel-3" onClick={aoLimpar}>
        Limpar o pincel
      </button>
      <label className="flex items-center gap-1 text-suave">
        Mistura pronta:
        <select
          className={campo}
          value={pronta}
          aria-label="Mistura pronta"
          onChange={(evento) => {
            const item = MISTURAS_PRONTAS[Number(evento.currentTarget.value)];
            if (item) aoMudar({ umido: item.umido, carga: item.carga, mistura: item.mistura });
          }}
        >
          <option value={-1}>Personalizada</option>
          {MISTURAS_PRONTAS.map((item, indice) => (
            <option key={item.nome} value={indice}>
              {item.nome}
            </option>
          ))}
        </select>
      </label>
      <Porcentagem rotulo="Úmido" minimo={0} valor={opcoes.umido} aoMudar={(umido) => aoMudar({ umido })} />
      <Porcentagem rotulo="Carga" minimo={0} valor={opcoes.carga} aoMudar={(carga) => aoMudar({ carga })} />
      <Porcentagem rotulo="Mistura" minimo={0} valor={opcoes.mistura} aoMudar={(mistura) => aoMudar({ mistura })} />
      <Porcentagem rotulo="Fluxo" valor={opcoes.fluxo} aoMudar={(fluxo) => aoMudar({ fluxo })} />
      <Caixa rotulo="Carregar depois de cada traço" valor={opcoes.carregarDepois} aoMudar={(carregarDepois) => aoMudar({ carregarDepois })} />
      <Caixa rotulo="Limpar depois de cada traço" valor={opcoes.limparDepois} aoMudar={(limparDepois) => aoMudar({ limparDepois })} />
    </>
  );
}

export function OpcoesDaSubstituicaoNaBarra({ borracha, opcoes, aoMudar }: { borracha: boolean; opcoes: OpcoesDaSubstituicao; aoMudar: (mudanca: Partial<OpcoesDaSubstituicao>) => void }) {
  return (
    <>
      {borracha ? null : (
        <Escolha
          rotulo="Modo"
          valor={opcoes.modo}
          opcoes={[
            ["matiz", "Matiz"],
            ["saturacao", "Saturação"],
            ["cor", "Cor"],
            ["luminosidade", "Luminosidade"],
          ]}
          aoMudar={(modo) => aoMudar({ modo })}
        />
      )}
      <Escolha
        rotulo="Amostragem"
        valor={opcoes.amostragem}
        opcoes={[
          ["continua", "Contínua"],
          ["umaVez", "Uma vez"],
          ["fundo", "Amostra de fundo"],
        ]}
        aoMudar={(amostragem) => aoMudar({ amostragem })}
      />
      <Escolha
        rotulo="Limites"
        valor={opcoes.limites}
        opcoes={[
          ["naoContiguo", "Não contíguo"],
          ["contiguo", "Contíguo"],
          ["arestas", "Encontrar arestas"],
        ]}
        aoMudar={(limites) => aoMudar({ limites })}
      />
      <Porcentagem rotulo="Tolerância" minimo={0} valor={opcoes.tolerancia / 255} aoMudar={(valor) => aoMudar({ tolerancia: Math.round(valor * 255) })} />
      {borracha ? (
        <Caixa rotulo="Proteger a cor do primeiro plano" valor={opcoes.protegerPrimeiroPlano} aoMudar={(protegerPrimeiroPlano) => aoMudar({ protegerPrimeiroPlano })} />
      ) : (
        <Caixa rotulo="Suavização de serrilhado" valor={opcoes.suavizar} aoMudar={(suavizar) => aoMudar({ suavizar })} />
      )}
    </>
  );
}
