"use client";

import { AlignCenter, AlignHorizontalJustifyCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, Check, LoaderCircle, PenTool, SprayCan, Square, SquaresIntersect, SquaresSubtract, SquaresUnite, X } from "lucide-react";
import { Fragment } from "react";

import { ESTILOS_ARTISTICOS, LIMITES_DO_PINCEL, type ModoDaPintura, type OpcoesDoPincel, type Simetria, TIPOS_DE_SIMETRIA } from "@/lib/pintura/traco";
import type { Comando } from "@/lib/projeto/comandos";
import { MESCLAGENS_DA_IMAGEM } from "@/lib/projeto/modelo";
import type { Clipe } from "@/lib/projeto/modelo";
import { type Alinhamento, FONTES_TEXTO, type FonteTexto } from "@/lib/projeto/texto";
import type { ModoDaSelecao } from "@/lib/selecao/mascara";
import { AMOSTRAS, type TamanhoDaAmostra } from "@/lib/selecao/varinha";

import { ferramenta as dadosDa, FERRAMENTAS_DA_SELECAO, FERRAMENTAS_DE_PINTURA, FERRAMENTAS_DE_RETOQUE, FORMAS_PERSONALIZADAS, type IdFerramentaDaImagem, MODO_DA_SELECAO } from "./ferramentasDaImagem";
import type { OpcoesDaSelecao } from "./SelecaoNaPrevia";
import type { ModoDaTransformacao } from "./TransformacaoNaPrevia";

const MODOS_DA_TRANSFORMACAO: { id: ModoDaTransformacao; nome: string }[] = [
  { id: "livre", nome: "Livre" },
  { id: "inclinar", nome: "Inclinar" },
  { id: "distorcer", nome: "Distorcer" },
  { id: "perspectiva", nome: "Perspectiva" },
  { id: "deformar", nome: "Deformar" },
];
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
  /** As opções do pincel, do lápis ou da borracha (a ferramenta escolhida). */
  pincel?: OpcoesDoPincel;
  aoMudarPincel?: (mudanca: Partial<OpcoesDoPincel>) => void;
  simetria?: Simetria | null;
  aoMudarSimetria?: (simetria: Simetria | null) => void;
  /** As ferramentas da seleção do documento: as opções, se há seleção (e numa foto) e o Desmarcar. */
  selecaoDoDocumento?: { opcoes: OpcoesDaSelecao; aoMudar: (mudanca: Partial<OpcoesDaSelecao>) => void; temSelecao: boolean; naFoto: boolean; aoDesmarcar: () => void };
  /** As opções próprias de uma ferramenta de pintura (o carimbo: alinhado e amostra), depois das do pincel. */
  extraDoPincel?: React.ReactNode;
  /** As opções que o editor monta (Degradê, Balde de tinta, Borracha mágica): ficam no lugar das daqui. */
  opcoesProprias?: React.ReactNode;
  /** A transformação livre em andamento: os modos, confirmar (Enter) e cancelar (Esc). */
  transformacao?: { modo: ModoDaTransformacao; aoModo: (modo: ModoDaTransformacao) => void; aoConfirmar: () => void; aoCancelar: () => void } | null;
  /** A seleção de objeto: o localizador (o realce com o ponteiro parado) ligado ou não. */
  localizador?: boolean;
  aoMudarLocalizador?: (ligado: boolean) => void;
};

const MODOS_DA_SELECAO: { modo: ModoDaSelecao; nome: string; icone: typeof Square }[] = [
  { modo: "nova", nome: "Nova seleção", icone: Square },
  { modo: "somar", nome: "Adicionar à seleção (Shift)", icone: SquaresUnite },
  { modo: "subtrair", nome: "Subtrair da seleção (Alt)", icone: SquaresSubtract },
  { modo: "intersectar", nome: "Fazer interseção com a seleção (Shift+Alt)", icone: SquaresIntersect },
];

/** Um número da barra (o valor digitado só vale ao sair ou no Enter). */
function Numero({ rotulo, valor, minimo, maximo, sufixo, aoMudar, largura = "w-12" }: { rotulo: string; valor: number; minimo: number; maximo: number; sufixo?: string; aoMudar: (valor: number) => void; largura?: string }) {
  return (
    <label className="flex items-center gap-1 text-suave">
      {rotulo}:
      <input
        key={valor}
        aria-label={rotulo}
        defaultValue={valor}
        inputMode="decimal"
        onBlur={(evento) => {
          const numero = Number(evento.currentTarget.value.replace(",", "."));
          if (Number.isFinite(numero)) aoMudar(Math.min(maximo, Math.max(minimo, numero)));
        }}
        onKeyDown={(evento) => evento.key === "Enter" && evento.currentTarget.blur()}
        className={`${campo} ${largura} text-right tabular-nums`}
      />
      {sufixo}
    </label>
  );
}

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
  if (props.opcoesProprias && !props.transformacao) opcoes = props.opcoesProprias;
  else if (props.transformacao) {
    const t = props.transformacao;
    opcoes = (
      <>
        <span className="flex items-center gap-0.5" role="group" aria-label="Modo da transformação">
          {MODOS_DA_TRANSFORMACAO.map((item) => (
            <button key={item.id} type="button" className={`rounded px-2 py-0.5 text-xs ${t.modo === item.id ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`} aria-pressed={t.modo === item.id} onClick={() => t.aoModo(item.id)}>
              {item.nome}
            </button>
          ))}
        </span>
        <span className="text-suave">Arraste as alças; fora dos cantos gira (Shift de 15°); Ctrl num canto distorce.</span>
        {SEPARADOR}
        <button type="button" className="botao-icone size-6" title="Cancelar (Esc)" aria-label="Cancelar a transformação" onClick={t.aoCancelar}>
          <X className="size-4" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6 text-sucesso" title="Confirmar (Enter)" aria-label="Confirmar a transformação" onClick={t.aoConfirmar}>
          <Check className="size-4" aria-hidden />
        </button>
      </>
    );
  } else if (ferramenta === "mover") {
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
  } else if (FERRAMENTAS_DA_SELECAO.has(ferramenta) && props.selecaoDoDocumento) {
    const { opcoes: o, aoMudar, temSelecao, naFoto } = props.selecaoDoDocumento;
    const letreiro = ferramenta === "letreiro" || ferramenta === "letreiroEliptico";
    opcoes = (
      <>
        <span className="flex items-center" role="group" aria-label="Modo da seleção">
          {MODOS_DA_SELECAO.filter(({ modo }) => ferramenta !== "selecaoRapida" || modo !== "intersectar").map(({ modo, nome, icone: IconeDoModo }) => (
            <button key={modo} type="button" className={`botao-icone size-6 ${o.modo === modo ? "bg-painel-3 text-texto" : ""}`} title={nome} aria-label={nome} aria-pressed={o.modo === modo} onClick={() => aoMudar({ modo })}>
              <IconeDoModo className="size-4" aria-hidden />
            </button>
          ))}
        </span>
        {SEPARADOR}
        {ferramenta === "selecaoRapida" ? (
          <>
            <Numero rotulo="Tamanho" valor={o.tamanhoRapida} minimo={1} maximo={500} sufixo="px" aoMudar={(tamanhoRapida) => aoMudar({ tamanhoRapida: Math.round(tamanhoRapida) })} largura="w-10" />
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={o.todasAsCamadas} onChange={(evento) => aoMudar({ todasAsCamadas: evento.currentTarget.checked })} />
              Usar todas as camadas
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={o.aprimorar} onChange={(evento) => aoMudar({ aprimorar: evento.currentTarget.checked })} />
              Aprimorar borda
            </label>
          </>
        ) : ferramenta === "varinha" ? (
          <>
            <label className="flex items-center gap-1 text-suave">
              Tamanho da amostra:
              <select className={campo} value={o.amostra} onChange={(evento) => aoMudar({ amostra: Number(evento.currentTarget.value) as TamanhoDaAmostra })}>
                {AMOSTRAS.map((lado) => (
                  <option key={lado} value={lado}>
                    {lado === 1 ? "Ponto" : `Média ${lado} × ${lado}`}
                  </option>
                ))}
              </select>
            </label>
            <Numero rotulo="Tolerância" valor={o.tolerancia} minimo={0} maximo={255} aoMudar={(tolerancia) => aoMudar({ tolerancia: Math.round(tolerancia) })} largura="w-10" />
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={o.suavizar} onChange={(evento) => aoMudar({ suavizar: evento.currentTarget.checked })} />
              Suavização de serrilhado
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={o.contigua} onChange={(evento) => aoMudar({ contigua: evento.currentTarget.checked })} />
              Contígua
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={o.todasAsCamadas} onChange={(evento) => aoMudar({ todasAsCamadas: evento.currentTarget.checked })} />
              Usar todas as camadas
            </label>
          </>
        ) : ferramenta === "linhaUnica" || ferramenta === "colunaUnica" ? null : (
          <>
            <Numero rotulo="Difusão" valor={o.difusao} minimo={0} maximo={1000} sufixo="px" aoMudar={(difusao) => aoMudar({ difusao })} />
            {ferramenta === "letreiro" ? null : (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={o.suavizar} onChange={(evento) => aoMudar({ suavizar: evento.currentTarget.checked })} />
                Suavização de serrilhado
              </label>
            )}
          </>
        )}
        {ferramenta === "lacoMagnetico" ? (
          <>
            {SEPARADOR}
            <Numero rotulo="Largura" valor={o.larguraDoLaco} minimo={1} maximo={256} sufixo="px" aoMudar={(larguraDoLaco) => aoMudar({ larguraDoLaco: Math.round(larguraDoLaco) })} largura="w-10" />
            <Numero rotulo="Contraste" valor={Math.round(o.contraste * 100)} minimo={1} maximo={100} sufixo="%" aoMudar={(contraste) => aoMudar({ contraste: contraste / 100 })} largura="w-10" />
            <Numero rotulo="Frequência" valor={o.frequencia} minimo={0} maximo={100} aoMudar={(frequencia) => aoMudar({ frequencia: Math.round(frequencia) })} largura="w-10" />
          </>
        ) : null}
        {letreiro ? (
          <>
            {SEPARADOR}
            <label className="flex items-center gap-1 text-suave">
              Estilo:
              <select className={campo} value={o.estilo} onChange={(evento) => aoMudar({ estilo: evento.currentTarget.value as OpcoesDaSelecao["estilo"] })}>
                <option value="normal">Normal</option>
                <option value="proporcao">Proporção fixa</option>
                <option value="tamanho">Tamanho fixo</option>
              </select>
            </label>
            {o.estilo !== "normal" ? (
              <>
                <Numero rotulo="L" valor={o.largura} minimo={o.estilo === "tamanho" ? 1 : 0.01} maximo={o.estilo === "tamanho" ? 8192 : 1000} sufixo={o.estilo === "tamanho" ? "px" : undefined} aoMudar={(largura) => aoMudar({ largura })} />
                <button type="button" className="botao-icone size-6 text-xs" title="Trocar a largura e a altura" aria-label="Trocar a largura e a altura" onClick={() => aoMudar({ largura: o.altura, altura: o.largura })}>
                  ⇄
                </button>
                <Numero rotulo="A" valor={o.altura} minimo={o.estilo === "tamanho" ? 1 : 0.01} maximo={o.estilo === "tamanho" ? 8192 : 1000} sufixo={o.estilo === "tamanho" ? "px" : undefined} aoMudar={(altura) => aoMudar({ altura })} />
              </>
            ) : null}
          </>
        ) : null}
        {SEPARADOR}
        <button type="button" className="botao-secundario px-2 py-0.5 text-xs" disabled={!temSelecao || !naFoto || props.pedindo} onClick={() => props.aoUsarSelecao("apagar")} title="Preencher sensível ao conteúdo: a IA refaz o que estava atrás, na foto escolhida (Shift+F5)">
          Preencher sensível ao conteúdo
        </button>
        <button type="button" className="botao-secundario px-2 py-0.5 text-xs" disabled={!temSelecao || !naFoto || props.pedindo} onClick={() => props.aoUsarSelecao("recortar")} title="Camada via recorte: o que foi selecionado na foto escolhida vira uma camada nova (Ctrl+Shift+J)">
          Camada via recorte
        </button>
        <button type="button" className="botao-icone h-6 w-auto px-2 text-xs" disabled={!temSelecao} onClick={props.selecaoDoDocumento.aoDesmarcar} title="Desmarcar (Ctrl+D)">
          Desmarcar
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
          <>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={props.localizador ?? true} onChange={(evento) => props.aoMudarLocalizador?.(evento.currentTarget.checked)} />
              Localizador de objetos
            </label>
            <span className="text-suave">Clique ou arraste um retângulo no objeto; Shift + clique soma, Alt + clique tira uma parte.</span>
          </>
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
  } else if (FERRAMENTAS_DE_PINTURA.has(ferramenta) && props.pincel && props.aoMudarPincel) {
    const pincel = props.pincel;
    const mudar = props.aoMudarPincel;
    const porcento = (valor: number) => Math.round(valor * 100);
    const alternar = (ligado: boolean, titulo: string, Icone: typeof PenTool, aoMudar: () => void) => (
      <button type="button" className={`botao-icone size-6 ${ligado ? "bg-destaque/25 text-texto" : ""}`} aria-pressed={ligado} title={titulo} aria-label={titulo} onClick={aoMudar}>
        <Icone className="size-3.5" aria-hidden />
      </button>
    );
    const bloco = ferramenta === "borracha" && pincel.borracha === "bloco";
    opcoes = (
      <>
        <Numero rotulo="Tamanho" valor={Math.round(pincel.tamanho)} minimo={LIMITES_DO_PINCEL.tamanho[0]} maximo={LIMITES_DO_PINCEL.tamanho[1]} sufixo="px" aoMudar={(tamanho) => mudar({ tamanho })} />
        {ferramenta === "pincel" || ferramenta === "historico" || ferramenta === "historicoArtistico" || (ferramenta === "borracha" && pincel.borracha === "pincel") ? (
          <Numero rotulo="Dureza" valor={porcento(pincel.dureza)} minimo={0} maximo={100} sufixo="%" aoMudar={(valor) => mudar({ dureza: valor / 100 })} />
        ) : null}
        {ferramenta === "historicoArtistico" ? (
          <>
            <label className="flex items-center gap-1 text-suave">
              Estilo:
              <select aria-label="Estilo dos traços" className={campo} value={pincel.artistico.estilo} onChange={(evento) => mudar({ artistico: { ...pincel.artistico, estilo: evento.currentTarget.value as OpcoesDoPincel["artistico"]["estilo"] } })}>
                {ESTILOS_ARTISTICOS.map((estilo) => (
                  <option key={estilo.id} value={estilo.id}>
                    {estilo.nome}
                  </option>
                ))}
              </select>
            </label>
            <Numero rotulo="Área" valor={pincel.artistico.area} minimo={1} maximo={500} sufixo="px" aoMudar={(area) => mudar({ artistico: { ...pincel.artistico, area } })} />
            <Numero rotulo="Traços" valor={pincel.artistico.quantos} minimo={1} maximo={20} largura="w-9" aoMudar={(quantos) => mudar({ artistico: { ...pincel.artistico, quantos: Math.round(quantos) } })} />
          </>
        ) : ferramenta === "historico" ? (
          <span className="text-suave">Fonte: a marcada no painel Histórico</span>
        ) : FERRAMENTAS_DE_RETOQUE.has(ferramenta) ? null : ferramenta === "borracha" ? (
          <label className="flex items-center gap-1 text-suave">
            Modo:
            <select aria-label="Modo da borracha" className={campo} value={pincel.borracha} onChange={(evento) => mudar({ borracha: evento.currentTarget.value as OpcoesDoPincel["borracha"] })}>
              <option value="pincel">Pincel</option>
              <option value="lapis">Lápis</option>
              <option value="bloco">Bloco</option>
            </select>
          </label>
        ) : (
          <label className="flex items-center gap-1 text-suave">
            Modo:
            <select aria-label="Modo da pintura" className={campo} value={pincel.modo} onChange={(evento) => mudar({ modo: evento.currentTarget.value as ModoDaPintura })}>
              {MESCLAGENS_DA_IMAGEM.map((grupo, indice) => (
                <Fragment key={grupo[0].id}>
                  {indice > 0 ? <option disabled>──────────</option> : null}
                  {grupo.map((modo) => (
                    <option key={modo.id} value={modo.id}>
                      {modo.nome}
                    </option>
                  ))}
                  {indice === 0 ? <option value="limpar">Limpar</option> : null}
                </Fragment>
              ))}
            </select>
          </label>
        )}
        {SEPARADOR}
        {bloco || FERRAMENTAS_DE_RETOQUE.has(ferramenta) ? null : (
          <>
            <Numero rotulo="Opacidade" valor={porcento(pincel.opacidade)} minimo={1} maximo={100} sufixo="%" aoMudar={(valor) => mudar({ opacidade: valor / 100 })} />
            {alternar(pincel.pressaoNaOpacidade, "A pressão da caneta muda a opacidade", PenTool, () => mudar({ pressaoNaOpacidade: !pincel.pressaoNaOpacidade }))}
            {ferramenta === "lapis" ? null : <Numero rotulo="Fluxo" valor={porcento(pincel.fluxo)} minimo={1} maximo={100} sufixo="%" aoMudar={(valor) => mudar({ fluxo: valor / 100 })} />}
            {ferramenta === "pincel" ? alternar(pincel.aerografo, "Aerógrafo: segurar parado continua pintando", SprayCan, () => mudar({ aerografo: !pincel.aerografo })) : null}
            {ferramenta === "lapis" || (ferramenta === "borracha" && pincel.borracha !== "pincel") ? null : (
              <Numero rotulo="Suavização" valor={porcento(pincel.suavizacao)} minimo={0} maximo={100} sufixo="%" aoMudar={(valor) => mudar({ suavizacao: valor / 100 })} />
            )}
            {alternar(pincel.pressaoNoTamanho, "A pressão da caneta muda o tamanho", PenTool, () => mudar({ pressaoNoTamanho: !pincel.pressaoNoTamanho }))}
          </>
        )}
        {ferramenta === "lapis" ? (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={pincel.apagarAutomaticamente} onChange={(evento) => mudar({ apagarAutomaticamente: evento.currentTarget.checked })} />
            Apagar automaticamente
          </label>
        ) : null}
        {props.aoMudarSimetria ? (
          <>
            {SEPARADOR}
            <label className="flex items-center gap-1 text-suave">
              Simetria:
              <select
                aria-label="Simetria da pintura"
                className={campo}
                value={props.simetria?.tipo ?? ""}
                onChange={(evento) => {
                  const tipo = evento.currentTarget.value as Simetria["tipo"] | "";
                  props.aoMudarSimetria!(tipo ? { tipo, segmentos: props.simetria?.segmentos ?? 6 } : null);
                }}
              >
                <option value="">Desligada</option>
                {TIPOS_DE_SIMETRIA.map((tipo) => (
                  <option key={tipo.id} value={tipo.id}>
                    {tipo.nome}
                  </option>
                ))}
              </select>
            </label>
            {props.simetria && (props.simetria.tipo === "radial" || props.simetria.tipo === "mandala") ? (
              <Numero rotulo="Segmentos" valor={props.simetria.segmentos} minimo={2} maximo={12} largura="w-9" aoMudar={(segmentos) => props.aoMudarSimetria!({ ...props.simetria!, segmentos: Math.round(segmentos) })} />
            ) : null}
          </>
        ) : null}
        {props.extraDoPincel ? (
          <>
            {SEPARADOR}
            {props.extraDoPincel}
          </>
        ) : null}
      </>
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
