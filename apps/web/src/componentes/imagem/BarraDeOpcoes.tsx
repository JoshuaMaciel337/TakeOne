"use client";

import { AlignCenter, AlignHorizontalJustifyCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, Check, LoaderCircle, X } from "lucide-react";

import type { Comando } from "@/lib/projeto/comandos";
import type { Clipe } from "@/lib/projeto/modelo";
import { type Alinhamento, FONTES_TEXTO, type FonteTexto } from "@/lib/projeto/texto";

import { ferramenta as dadosDa, FORMAS_PERSONALIZADAS, type IdFerramentaDaImagem, MODO_DA_SELECAO } from "./ferramentasDaImagem";
import type { FerramentaObjeto } from "./useObjeto";

/** As opções da ferramenta Forma (a cor de preenchimento é a de primeiro plano). */
export type OpcoesDaForma = { tracoCor: string; traco: number; arredondado: boolean; personalizada: "seta" | "balao" | "coracao" };

export const PROPORCOES_DO_CORTE: { nome: string; valor: number | null }[] = [
  { nome: "Proporção livre", valor: null },
  { nome: "1:1 (quadrado)", valor: 1 },
  { nome: "4:5 (8 × 10)", valor: 4 / 5 },
  { nome: "9:16", valor: 9 / 16 },
  { nome: "16:9", valor: 16 / 9 },
  { nome: "3:2", valor: 3 / 2 },
  { nome: "4:3", valor: 4 / 3 },
];

type Props = {
  ferramenta: IdFerramentaDaImagem;
  /** A camada escolhida (um texto muda pelas opções da ferramenta Texto). */
  clipe: Clipe | null;
  aoExecutar: (comando: Comando) => void;
  objeto: FerramentaObjeto;
  /** Apagar ou recortar a seleção (o pedido vai para o worker). */
  aoUsarSelecao: (acao: "apagar" | "recortar") => void;
  pedindo: boolean;
  removerAoSoltar: boolean;
  aoMudarRemoverAoSoltar: (valor: boolean) => void;
  corte: { proporcao: number | null; largura: number; altura: number } | null;
  aoMudarProporcao: (valor: number | null) => void;
  aoConfirmarCorte: () => void;
  aoCancelarCorte: () => void;
  forma: OpcoesDaForma;
  aoMudarForma: (mudanca: Partial<OpcoesDaForma>) => void;
  primeiroPlano: string;
  aoZoom: (zoom: number | null) => void;
  aoAlinhar: (eixo: "x" | "y") => void;
};

const SEPARADOR = <span className="mx-1 h-5 w-px shrink-0 bg-borda" aria-hidden />;
const campo = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";

/**
 * A barra de opções: o ícone da ferramenta à esquerda e as opções dela, como nos editores de imagem profissionais
 * (os rótulos terminam em dois-pontos). Muda com a ferramenta escolhida.
 */
export function BarraDeOpcoes(props: Props) {
  const { ferramenta, clipe, aoExecutar, objeto } = props;
  const dados = dadosDa(ferramenta);
  const Icone = dados.icone;
  const selecao = MODO_DA_SELECAO[ferramenta];

  let opcoes: React.ReactNode = null;
  if (ferramenta === "mover") {
    opcoes = (
      <>
        <span className="text-suave">Selecionar automaticamente: Camada</span>
        {SEPARADOR}
        <span className="text-suave">Alinhar ao centro:</span>
        <button type="button" className="botao-icone size-6" disabled={!clipe} title="Alinhar os centros na horizontal" aria-label="Alinhar os centros na horizontal" onClick={() => props.aoAlinhar("x")}>
          <AlignHorizontalJustifyCenter className="size-4" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" disabled={!clipe} title="Alinhar os centros na vertical" aria-label="Alinhar os centros na vertical" onClick={() => props.aoAlinhar("y")}>
          <AlignVerticalJustifyCenter className="size-4" aria-hidden />
        </button>
      </>
    );
  } else if (selecao) {
    const temSelecao = Boolean(objeto.selecao) || objeto.temPincel;
    opcoes = (
      <>
        {ferramenta === "remover" ? (
          <>
            <label className="flex items-center gap-1.5 text-suave">
              Tamanho:
              <input type="range" min={0.01} max={0.2} step={0.005} value={objeto.tamanhoDoPincel} onChange={(evento) => objeto.setTamanhoDoPincel(Number(evento.currentTarget.value))} className="w-24" aria-label="Tamanho do pincel" />
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={props.removerAoSoltar} onChange={(evento) => props.aoMudarRemoverAoSoltar(evento.currentTarget.checked)} />
              Remover após cada traço
            </label>
          </>
        ) : (
          <span className="text-suave">{ferramenta === "objeto" ? "Clique no objeto; Shift + clique tira uma parte." : "Sem tecla, seleção nova; Shift soma; Alt subtrai."}</span>
        )}
        {SEPARADOR}
        {objeto.selecionando ? (
          <span className="flex items-center gap-1 text-suave">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Achando o objeto…
          </span>
        ) : null}
        <button type="button" className="botao-secundario px-2 py-0.5 text-xs" disabled={!temSelecao || props.pedindo} onClick={() => props.aoUsarSelecao("apagar")} title="Preencher sensível ao conteúdo: a IA refaz o que estava atrás (Shift+F5)">
          {ferramenta === "remover" ? "Remover agora" : "Preencher sensível ao conteúdo"}
        </button>
        {ferramenta === "remover" ? null : (
          <button type="button" className="botao-secundario px-2 py-0.5 text-xs" disabled={!temSelecao || props.pedindo} onClick={() => props.aoUsarSelecao("recortar")} title="Camada via recorte: o que foi selecionado vira uma camada nova (Ctrl+Shift+J)">
            Camada via recorte
          </button>
        )}
        <button type="button" className="botao-icone h-6 w-auto px-2 text-xs" disabled={!temSelecao && !objeto.pontos.length} onClick={objeto.limpar} title="Desmarcar (Ctrl+D)">
          Desmarcar
        </button>
        {objeto.erro ? <span className="truncate text-erro">{objeto.erro}</span> : null}
        {!clipe ? <span className="text-suave">Clique numa foto para começar.</span> : null}
      </>
    );
  } else if (ferramenta === "corte" && props.corte) {
    opcoes = (
      <>
        <select aria-label="Proporção" className={campo} value={String(props.corte.proporcao)} onChange={(evento) => props.aoMudarProporcao(evento.currentTarget.value === "null" ? null : Number(evento.currentTarget.value))}>
          {PROPORCOES_DO_CORTE.map((item) => (
            <option key={item.nome} value={String(item.valor)}>
              {item.nome}
            </option>
          ))}
        </select>
        <span className="tabular-nums text-suave">
          {Math.round(props.corte.largura)} × {Math.round(props.corte.altura)} px
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className="botao-icone size-6" onClick={props.aoCancelarCorte} title="Cancelar o corte (Esc)" aria-label="Cancelar o corte">
            <X className="size-4" aria-hidden />
          </button>
          <button type="button" className="botao-icone size-6 text-destaque" onClick={props.aoConfirmarCorte} title="Confirmar o corte (Enter)" aria-label="Confirmar o corte">
            <Check className="size-4" aria-hidden />
          </button>
        </span>
      </>
    );
  } else if (ferramenta === "contaGotas") {
    opcoes = <span className="text-suave">Tamanho da amostra: ponto · Amostra: todas as camadas · Alt + clique pega a cor de fundo</span>;
  } else if (ferramenta === "texto") {
    const texto = clipe?.texto;
    const mudar = (mudanca: Record<string, unknown>) => clipe && aoExecutar({ comando: "texto.mudar", parametros: { clipeIds: [clipe.id], texto: mudanca } });
    opcoes = texto ? (
      <>
        <select aria-label="Fonte" className={campo} value={texto.fonte} onChange={(evento) => mudar({ fonte: evento.currentTarget.value as FonteTexto })}>
          {FONTES_TEXTO.map((fonte) => (
            <option key={fonte.id} value={fonte.id}>
              {fonte.nome}
            </option>
          ))}
        </select>
        <select aria-label="Estilo" className={campo} value={texto.negrito ? "negrito" : "normal"} onChange={(evento) => mudar({ negrito: evento.currentTarget.value === "negrito" })}>
          <option value="normal">Normal</option>
          <option value="negrito">Negrito</option>
        </select>
        <label className="flex items-center gap-1 text-suave">
          Tamanho:
          <input
            key={texto.tamanho}
            aria-label="Tamanho da letra em % do lado menor"
            defaultValue={Math.round(texto.tamanho * 1000) / 10}
            inputMode="decimal"
            onBlur={(evento) => {
              const valor = Number(evento.currentTarget.value.replace(",", "."));
              if (Number.isFinite(valor) && valor > 0) mudar({ tamanho: valor / 100 });
            }}
            onKeyDown={(evento) => evento.key === "Enter" && evento.currentTarget.blur()}
            className={`${campo} w-12 text-right`}
          />
          %
        </label>
        {SEPARADOR}
        {(
          [
            ["esquerda", AlignLeft, "Alinhar o texto à esquerda"],
            ["centro", AlignCenter, "Centralizar o texto"],
            ["direita", AlignRight, "Alinhar o texto à direita"],
          ] as const
        ).map(([valor, IconeAlinhar, titulo]) => (
          <button key={valor} type="button" className={`botao-icone size-6 ${texto.alinhamento === valor ? "bg-painel-3 text-texto" : ""}`} aria-pressed={texto.alinhamento === valor} title={titulo} aria-label={titulo} onClick={() => mudar({ alinhamento: valor as Alinhamento })}>
            <IconeAlinhar className="size-4" aria-hidden />
          </button>
        ))}
        {SEPARADOR}
        <label className="flex items-center gap-1 text-suave">
          Cor:
          <input type="color" value={texto.cor} onChange={(evento) => mudar({ cor: evento.currentTarget.value })} className="h-5 w-8 cursor-pointer rounded border border-borda" aria-label="Cor do texto" />
        </label>
      </>
    ) : (
      <span className="text-suave">Clique na imagem para escrever; o texto sai na cor de primeiro plano. Clique num texto para mudar a fonte, o tamanho e a cor.</span>
    );
  } else if (ferramenta === "mao" || ferramenta === "zoom") {
    opcoes = (
      <>
        <button type="button" className="botao-secundario px-2 py-0.5 text-xs" onClick={() => props.aoZoom(1)}>
          100%
        </button>
        <button type="button" className="botao-secundario px-2 py-0.5 text-xs" onClick={() => props.aoZoom(null)}>
          Ajustar à tela
        </button>
        <span className="text-suave">{dados.dica}</span>
      </>
    );
  } else {
    // As formas
    opcoes = (
      <>
        <span className="text-suave">Forma</span>
        {SEPARADOR}
        <span className="flex items-center gap-1 text-suave">
          Preenchimento:
          <span className="size-5 rounded border border-white/40" style={{ background: props.primeiroPlano }} title="A cor de primeiro plano" />
        </span>
        <label className="flex items-center gap-1 text-suave">
          Traçado:
          <input type="color" value={props.forma.tracoCor} onChange={(evento) => props.aoMudarForma({ tracoCor: evento.currentTarget.value })} className="h-5 w-8 cursor-pointer rounded border border-borda" aria-label="Cor do traçado" />
          <select aria-label="Espessura do traçado" className={campo} value={props.forma.traco} onChange={(evento) => props.aoMudarForma({ traco: Number(evento.currentTarget.value) })}>
            {[0, 0.01, 0.02, 0.04, 0.06].map((valor) => (
              <option key={valor} value={valor}>
                {valor === 0 ? "Sem traçado" : `${Math.round(valor * 100)}%`}
              </option>
            ))}
          </select>
        </label>
        {ferramenta === "retangulo" ? (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={props.forma.arredondado} onChange={(evento) => props.aoMudarForma({ arredondado: evento.currentTarget.checked })} />
            Cantos arredondados
          </label>
        ) : null}
        {ferramenta === "formaPersonalizada" ? (
          <label className="flex items-center gap-1 text-suave">
            Forma:
            <select aria-label="Forma personalizada" className={campo} value={props.forma.personalizada} onChange={(evento) => props.aoMudarForma({ personalizada: evento.currentTarget.value as OpcoesDaForma["personalizada"] })}>
              {FORMAS_PERSONALIZADAS.map((item) => (
                <option key={item.tipo} value={item.tipo}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 overflow-x-auto border-b border-borda bg-painel px-2 text-xs max-md:hidden">
      <span className="flex items-center gap-1 pr-1" title={dados.nome}>
        <Icone className="size-4" aria-hidden />
      </span>
      {SEPARADOR}
      {opcoes}
    </div>
  );
}
