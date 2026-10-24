"use client";

// As opções da barra do Corte (C) (ADR 0003, onda 13.6): a proporção ou L × A × resolução, trocar e limpar, o
// Endireitar, a sobreposição, o escudo e a área cortada, apagar os pixels cortados e preencher sensível ao conteúdo.
import { ArrowLeftRight, Check, Ruler, X } from "lucide-react";

import { SOBREPOSICOES_DO_CORTE, type SobreposicaoDoCorte } from "./RecorteNaPrevia";

export type OpcoesDoCorte = {
  /** "livre", "original", uma proporção (largura sobre altura) ou "tamanho" (L × A × resolução). */
  predefinicao: "livre" | "original" | "tamanho" | number;
  tamanhoFinal: { largura: number; altura: number; resolucao: number };
  sobreposicao: SobreposicaoDoCorte;
  orientacaoDaEspiral: number;
  escudo: { ligado: boolean; opacidade: number };
  mostrarCortada: boolean;
  endireitando: boolean;
  apagar: boolean;
  preencher: boolean;
  /** Como o vazio é preenchido: pelo que está em volta, ou pelo texto no worker de GPU (a expansão generativa). */
  preencherCom: "sensivel" | "generativo";
  textoDoPreenchimento: string;
};

export const CORTE_PADRAO: OpcoesDoCorte = {
  predefinicao: "livre",
  tamanhoFinal: { largura: 1080, altura: 1080, resolucao: 72 },
  sobreposicao: "tercos",
  orientacaoDaEspiral: 0,
  escudo: { ligado: true, opacidade: 0.55 },
  mostrarCortada: true,
  endireitando: false,
  apagar: false,
  preencher: false,
  preencherCom: "sensivel",
  textoDoPreenchimento: "",
};

export const PROPORCOES_DO_CORTE: { nome: string; valor: OpcoesDoCorte["predefinicao"] }[] = [
  { nome: "Proporção livre", valor: "livre" },
  { nome: "Original", valor: "original" },
  { nome: "1:1 (quadrado)", valor: 1 },
  { nome: "4:5 (8 × 10)", valor: 4 / 5 },
  { nome: "5:7", valor: 5 / 7 },
  { nome: "2:3 (4 × 6)", valor: 2 / 3 },
  { nome: "9:16", valor: 9 / 16 },
  { nome: "16:9", valor: 16 / 9 },
  { nome: "3:2", valor: 3 / 2 },
  { nome: "4:3", valor: 4 / 3 },
  { nome: "L × A × Resolução", valor: "tamanho" },
];

const campo = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";
const SEPARADOR = <span className="mx-1 h-5 w-px shrink-0 bg-borda" aria-hidden />;

function Numero({ rotulo, valor, aoMudar, sufixo }: { rotulo: string; valor: number; aoMudar: (valor: number) => void; sufixo?: string }) {
  return (
    <label className="flex items-center gap-1 text-suave">
      {rotulo}
      <input
        key={valor}
        className={`${campo} w-14 text-right tabular-nums`}
        defaultValue={valor}
        inputMode="numeric"
        aria-label={rotulo}
        onBlur={(evento) => {
          const numero = Math.round(Number(evento.currentTarget.value));
          if (Number.isFinite(numero) && numero > 0) aoMudar(numero);
        }}
        onKeyDown={(evento) => evento.key === "Enter" && evento.currentTarget.blur()}
      />
      {sufixo}
    </label>
  );
}

export function OpcoesDoCorteNaBarra({
  opcoes,
  medidas,
  aoMudar,
  aoTrocar,
  aoLimpar,
  aoConfirmar,
  aoCancelar,
}: {
  opcoes: OpcoesDoCorte;
  medidas: { largura: number; altura: number; angulo: number };
  aoMudar: (mudanca: Partial<OpcoesDoCorte>) => void;
  aoTrocar: () => void;
  aoLimpar: () => void;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  const indice = PROPORCOES_DO_CORTE.findIndex((item) => item.valor === opcoes.predefinicao);
  return (
    <>
      <select
        aria-label="Proporção"
        className={campo}
        value={indice < 0 ? 0 : indice}
        onChange={(evento) => aoMudar({ predefinicao: PROPORCOES_DO_CORTE[Number(evento.currentTarget.value)].valor })}
      >
        {PROPORCOES_DO_CORTE.map((item, i) => (
          <option key={item.nome} value={i}>
            {item.nome}
          </option>
        ))}
      </select>
      {opcoes.predefinicao === "tamanho" ? (
        <>
          <Numero rotulo="L" valor={opcoes.tamanhoFinal.largura} sufixo="px" aoMudar={(largura) => aoMudar({ tamanhoFinal: { ...opcoes.tamanhoFinal, largura } })} />
          <Numero rotulo="A" valor={opcoes.tamanhoFinal.altura} sufixo="px" aoMudar={(altura) => aoMudar({ tamanhoFinal: { ...opcoes.tamanhoFinal, altura } })} />
          <Numero rotulo="Resolução" valor={opcoes.tamanhoFinal.resolucao} sufixo="ppi" aoMudar={(resolucao) => aoMudar({ tamanhoFinal: { ...opcoes.tamanhoFinal, resolucao } })} />
        </>
      ) : null}
      <button type="button" className="botao-icone size-6" onClick={aoTrocar} title="Trocar a largura e a altura (X)" aria-label="Trocar a largura e a altura">
        <ArrowLeftRight className="size-4" aria-hidden />
      </button>
      <button type="button" className="botao-icone h-6 w-auto px-2 text-xs" onClick={aoLimpar} title="A imagem inteira, sem giro e na proporção livre">
        Limpar
      </button>
      {SEPARADOR}
      <button
        type="button"
        className={`botao-icone h-6 w-auto gap-1 px-2 text-xs ${opcoes.endireitando ? "bg-painel-3 text-texto" : ""}`}
        aria-pressed={opcoes.endireitando}
        onClick={() => aoMudar({ endireitando: !opcoes.endireitando })}
        title="Endireitar: arraste uma linha sobre o que deveria ficar reto (o horizonte, uma parede)"
      >
        <Ruler className="size-3.5" aria-hidden /> Endireitar
      </button>
      <label className="flex items-center gap-1 text-suave">
        Sobreposição:
        <select className={campo} value={opcoes.sobreposicao} onChange={(evento) => aoMudar({ sobreposicao: evento.currentTarget.value as SobreposicaoDoCorte })} aria-label="Sobreposição" title="O na tecla passa à seguinte">
          {SOBREPOSICOES_DO_CORTE.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </label>
      {opcoes.sobreposicao === "espiral" ? (
        <button type="button" className="botao-icone h-6 w-auto px-2 text-xs" onClick={() => aoMudar({ orientacaoDaEspiral: (opcoes.orientacaoDaEspiral + 1) % 4 })} title="Girar a espiral (Shift+O)">
          Girar a espiral
        </button>
      ) : null}
      {SEPARADOR}
      <label className="flex items-center gap-1.5" title="Escurece o que fica fora do corte">
        <input type="checkbox" checked={opcoes.escudo.ligado} onChange={(evento) => aoMudar({ escudo: { ...opcoes.escudo, ligado: evento.currentTarget.checked } })} />
        Escudo
      </label>
      {opcoes.escudo.ligado ? (
        <label className="flex items-center gap-1 text-suave">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={opcoes.escudo.opacidade}
            onChange={(evento) => aoMudar({ escudo: { ...opcoes.escudo, opacidade: Number(evento.currentTarget.value) } })}
            className="w-16"
            aria-label="Opacidade do escudo"
          />
        </label>
      ) : null}
      <label className="flex items-center gap-1.5" title="H mostra e esconde">
        <input type="checkbox" checked={opcoes.mostrarCortada} onChange={(evento) => aoMudar({ mostrarCortada: evento.currentTarget.checked })} />
        Mostrar a área cortada
      </label>
      <label className="flex items-center gap-1.5" title="As camadas de pixels perdem o que fica fora (sem isso, Imagem › Revelar tudo traz de volta)">
        <input type="checkbox" checked={opcoes.apagar} onChange={(evento) => aoMudar({ apagar: evento.currentTarget.checked })} />
        Apagar os pixels cortados
      </label>
      <label className="flex items-center gap-1.5" title="O que ficar vazio (girando ou aumentando além da imagem) é refeito numa camada nova">
        <input type="checkbox" checked={opcoes.preencher} onChange={(evento) => aoMudar({ preencher: evento.currentTarget.checked })} />
        Preencher o vazio:
      </label>
      <select className="rounded border border-borda bg-painel-2 px-1 py-0.5" value={opcoes.preencherCom} disabled={!opcoes.preencher} aria-label="Como preencher o vazio" onChange={(evento) => aoMudar({ preencherCom: evento.currentTarget.value as OpcoesDoCorte["preencherCom"] })}>
        <option value="sensivel">Sensível ao conteúdo</option>
        <option value="generativo">Expansão generativa</option>
      </select>
      {opcoes.preencher && opcoes.preencherCom === "generativo" ? (
        <input
          className="w-56 rounded border border-borda bg-painel-2 px-1.5 py-0.5"
          value={opcoes.textoDoPreenchimento}
          maxLength={800}
          placeholder="O que pôr no vazio (vazio: a cena continua)"
          aria-label="O que pôr no vazio"
          onChange={(evento) => aoMudar({ textoDoPreenchimento: evento.currentTarget.value })}
          onKeyDown={(evento) => evento.stopPropagation()}
        />
      ) : null}
      <span className="tabular-nums text-suave">
        {Math.round(medidas.largura)} × {Math.round(medidas.altura)} px{medidas.angulo ? ` · ${medidas.angulo.toFixed(1).replace(".", ",")}°` : ""}
      </span>
      <span className="ml-auto flex items-center gap-1">
        <button type="button" className="botao-icone size-6" onClick={aoCancelar} title="Cancelar o corte (Esc)" aria-label="Cancelar o corte">
          <X className="size-4" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6 text-destaque" onClick={aoConfirmar} title="Confirmar o corte (Enter)" aria-label="Confirmar o corte">
          <Check className="size-4" aria-hidden />
        </button>
      </span>
    </>
  );
}
