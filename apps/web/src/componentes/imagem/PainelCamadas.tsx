"use client";

import { Brush, ChevronDown, ChevronRight, Copy, CornerLeftDown, Eye, Folder, FolderOpen, FolderPlus, Grid2x2, LayoutTemplate, Link2, Lock, Move, Search, Shapes, SlidersHorizontal, SquareDashed, SquarePlus, Trash2, Type } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { arquivoDaMidia } from "@/lib/api";
import { arquivoDaVersao } from "@/lib/pixels";
import { arvoreDaImagem, camadaVisivel, type NoDaCamada, paiDaCamada } from "@/lib/projeto/arvore";
import type { Comando } from "@/lib/projeto/comandos";
import { CORES_DOS_ROTULOS, type Clipe, type Faixa, MESCLAGENS_DA_IMAGEM, type Mesclagem, nomeDaMesclagem, type Projeto, type TravasDaCamada } from "@/lib/projeto/modelo";
import { CONTORNO_PADRAO, SOMBRA_PADRAO } from "@/lib/projeto/silhueta";
import { NOMES_DOS_EFEITOS, type TipoDoEfeito } from "@/lib/imagem/estiloDeCamada";
import type { ModoDaSelecao } from "@/lib/selecao/mascara";
import type { Midia } from "@/lib/tipos";

import { AJUSTES, type Ajuste } from "./ajustesDaImagem";
import { svgDosCaminhos } from "@/lib/vetor/contorno";
import type { CamadaVetorial, TintaDaForma } from "@/lib/vetor/modelo";
import type { MascaraVetorial } from "@/lib/vetor/mascaraVetorial";
import { tamanhoDaImagem } from "@/lib/projeto/imagem";
import { NOMES_DO_PREENCHIMENTO } from "@/lib/imagem/camadaDePreenchimento";
import { NOMES_DOS_AJUSTES } from "@/lib/imagem/ajustes";
import { AmostraDaTinta } from "./OpcoesDaForma";

type Props = {
  projeto: Projeto;
  midias: ReadonlyMap<string, Midia>;
  /** Os clipes das camadas escolhidas (uma camada é uma faixa com um clipe). */
  selecao: string[];
  aoSelecionar: (ids: string[]) => void;
  aoExecutar: (comando: Comando) => void;
  /** Uma camada de ajuste nova, do tipo escolhido no botão de ajuste. */
  aoCriarAjuste: (ajuste: Ajuste) => void;
  /** Uma camada de preenchimento nova (cor sólida, degradê ou padrão), e a janela dela com o clique duplo na miniatura. */
  aoCriarPreenchimento?: (tipo: "cor" | "degrade" | "padrao") => void;
  aoEditarPreenchimento?: (clipeId: string) => void;
  /** Um estilo de camada novo: abre o painel Propriedades na parte dele. */
  aoAbrirPropriedades: () => void;
  /** A janela Estilo de camada da escolhida, aberta num efeito (ou nas opções de mesclagem). */
  aoAbrirEstilo?: (foco: TipoDoEfeito | "mesclagem") => void;
  /** Uma camada de pixels vazia acima da escolhida (Ctrl+Shift+N). */
  aoNovaCamada: () => void;
  /** Camada a partir do fundo (duplo clique na linha do fundo). */
  aoCamadaDoFundo: () => void;
  /** A máscara de camada pintável: a camada cuja máscara recebe o pincel, a que está à vista, e as ações. */
  mascaraEmFoco: string | null;
  mascaraAVista: string | null;
  aoFocarMascara: (clipeId: string | null) => void;
  aoVerMascara: (clipeId: string | null) => void;
  aoCriarMascara: (como: "revelar" | "ocultar") => void;
  aoVincularMascara: (clipeId: string, ligar: boolean) => void;
  /** A máscara vetorial: a camada cuja máscara as ferramentas de caminho editam, e as ações da miniatura dela. */
  mascaraVetorialEmFoco?: string | null;
  aoFocarMascaraVetorial?: (clipeId: string | null) => void;
  aoAcaoMascaraVetorial?: (clipeId: string, acao: "ligar" | "vincular" | "selecionar", modo?: ModoDaSelecao) => void;
  /** Ctrl + clique na miniatura: a seleção do documento pela transparência da camada (ou pelo cinza da máscara). */
  aoSelecionarDaCamada?: (clipeId: string, modo: ModoDaSelecao, de: "camada" | "mascara") => void;
  /** Selecionar › Encontrar camadas (o campo da busca) e Isolar camadas (só as faixas pedidas no painel). */
  pedido?: { tipo: "procurar" | "isolar"; vez: number; faixaIds: string[] } | null;
};

/** O modo da seleção pelas teclas junto do Ctrl: Shift soma, Alt subtrai, os dois intersectam. */
function modoDoCtrl(evento: React.MouseEvent): ModoDaSelecao {
  return evento.shiftKey && evento.altKey ? "intersectar" : evento.shiftKey ? "somar" : evento.altKey ? "subtrair" : "nova";
}

/** O nome de cada camada: o que a pessoa deu, o do texto, "Camada de ajuste", "Grupo" ou o da mídia. */
export function nomeDaCamada(clipe: Clipe, midias: ReadonlyMap<string, Midia>, faixa?: Faixa): string {
  if (faixa?.nome) return faixa.nome;
  if (clipe.pasta) return "Grupo";
  if (clipe.texto) return clipe.texto.conteudo.replace(/\s+/g, " ").trim() || "Texto";
  if (clipe.ajuste) return clipe.ajuste_imagem ? NOMES_DOS_AJUSTES[clipe.ajuste_imagem.tipo] : "Camada de ajuste";
  if (clipe.camada_de_preenchimento) return NOMES_DO_PREENCHIMENTO[clipe.camada_de_preenchimento.tinta.tipo];
  if (clipe.vetor) return "Forma";
  if (clipe.texto_rico) return clipe.texto_rico.paragrafos.map((paragrafo) => paragrafo.trechos.map((trecho) => trecho.texto).join("")).join(" ").replace(/\s+/g, " ").trim() || "Texto";
  return (clipe.midia_id ? midias.get(clipe.midia_id)?.nome : undefined) ?? "Imagem";
}

/** A miniatura da forma: o caminho no tamanho da caixa, com a cor do preenchimento (ou do traço) quando é uma cor. */
function MiniaturaDoVetor({ vetor }: { vetor: CamadaVetorial }) {
  const cor = (tinta: TintaDaForma) => (tinta.tipo === "cor" ? tinta.cor : tinta.tipo === "nenhuma" ? "none" : "#9aa0aa");
  const traco = vetor.traco ? cor(vetor.traco.tinta) : "none";
  return (
    <svg viewBox={`0 0 ${vetor.caixa.largura} ${vetor.caixa.altura}`} className="size-full" style={{ background: "repeating-conic-gradient(#c8cad0 0% 25%, #ffffff 0% 50%) 50% / 8px 8px" }} aria-hidden>
      <path d={svgDosCaminhos(vetor.subcaminhos)} fill={cor(vetor.preenchimento)} fillRule="evenodd" stroke={traco} strokeWidth={vetor.traco?.largura ?? 0} />
    </svg>
  );
}

/** A miniatura da máscara vetorial: a base e os caminhos (que somam em branco, que subtraem em preto). */
function MiniaturaDaMascaraVetorial({ mascara, documento }: { mascara: MascaraVetorial; documento: { largura: number; altura: number } }) {
  return (
    <svg viewBox={`0 0 ${documento.largura} ${documento.altura}`} className="size-full" preserveAspectRatio="xMidYMid meet" style={{ background: mascara.base === "revelar" ? "#fff" : "#000" }} aria-hidden>
      {mascara.subcaminhos.map((sub, i) => (
        <path key={i} d={svgDosCaminhos([{ ...sub, fechado: true }])} fill={sub.operacao === "somar" ? "#fff" : sub.operacao === "subtrair" ? "#000" : "#888"} />
      ))}
    </svg>
  );
}

/** O tipo da camada, para o filtro do painel. */
type TipoDaCamada = "imagem" | "texto" | "forma" | "ajuste" | "grupo";
/** Os filtros do painel, como lá: por tipo, modo, atributo, efeito e cor ("tipo:texto", "modo:multiplicar"...). */
const FILTROS: { grupo: string; itens: { id: string; nome: string }[] }[] = [
  {
    grupo: "Tipo",
    itens: [
      { id: "tipo:imagem", nome: "Imagens" },
      { id: "tipo:texto", nome: "Textos" },
      { id: "tipo:forma", nome: "Formas" },
      { id: "tipo:ajuste", nome: "Ajustes" },
      { id: "tipo:grupo", nome: "Grupos" },
    ],
  },
  {
    grupo: "Atributo",
    itens: [
      { id: "atributo:visivel", nome: "Visíveis" },
      { id: "atributo:oculta", nome: "Ocultas" },
      { id: "atributo:travada", nome: "Bloqueadas" },
      { id: "atributo:vinculada", nome: "Vinculadas" },
      { id: "atributo:recortada", nome: "Com máscara de corte" },
      { id: "atributo:mascara", nome: "Com máscara" },
    ],
  },
  {
    grupo: "Efeito",
    itens: [
      { id: "efeito:contorno", nome: "Com contorno" },
      { id: "efeito:sombra", nome: "Com sombra projetada" },
      { id: "efeito:filtro", nome: "Com filtro" },
    ],
  },
  { grupo: "Modo", itens: [{ id: "modo:passagem", nome: nomeDaMesclagem("passagem") }, ...MESCLAGENS_DA_IMAGEM.flat().map((modo) => ({ id: `modo:${modo.id}`, nome: modo.nome }))] },
  { grupo: "Cor", itens: CORES_DOS_ROTULOS.map((cor) => ({ id: `cor:${cor.id}`, nome: cor.nome })) },
];
function tipoDaCamada(clipe: Clipe, midias: ReadonlyMap<string, Midia>): TipoDaCamada {
  if (clipe.pasta) return "grupo";
  if (clipe.texto || clipe.texto_rico) return "texto";
  if (clipe.ajuste || clipe.camada_de_preenchimento) return "ajuste";
  return clipe.vetor || (clipe.midia_id && midias.get(clipe.midia_id)?.elemento) ? "forma" : "imagem";
}

/** As travas parciais, na ordem dos editores de imagem (a de tudo vem depois, pelo `travada` da faixa). */
const TRAVAS: { id: keyof TravasDaCamada; nome: string; icone: typeof Lock }[] = [
  { id: "transparencia", nome: "Bloquear pixels transparentes", icone: Grid2x2 },
  { id: "pixels", nome: "Bloquear pixels da imagem", icone: Brush },
  { id: "posicao", nome: "Bloquear posição", icone: Move },
];

/** Uma linha do painel: a camada, o nível (dentro de quantas pastas) e se está presa à de baixo. */
type Linha = { no: NoDaCamada; nivel: number; presa: boolean };

/** Onde a camada arrastada vai cair: acima ou abaixo de uma linha, ou dentro de uma pasta. */
type Alvo = { faixaId: string; zona: "acima" | "abaixo" | "dentro" };

/** Um item do menu de contexto (ou do botão com lista); "-" é o separador. */
type Item = { nome: string; aoEscolher: () => void; desativado?: boolean; cor?: string } | "-";

function ListaDeItens({ itens, aoFechar }: { itens: Item[]; aoFechar: () => void }) {
  return itens.map((item, indice) =>
    item === "-" ? (
      <hr key={`-${indice}`} className="my-1 border-borda" />
    ) : (
      <button
        key={item.nome}
        type="button"
        role="menuitem"
        disabled={item.desativado}
        className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-destaque/20 disabled:opacity-40 disabled:hover:bg-transparent"
        onClick={() => {
          aoFechar();
          item.aoEscolher();
        }}
      >
        {item.cor ? <span className="size-2.5 shrink-0 rounded-sm" style={{ background: item.cor }} aria-hidden /> : null}
        {item.nome}
      </button>
    ),
  );
}

/** Fecha ao clicar fora ou com Esc. */
function useFecharFora(aberto: boolean, aoFechar: () => void, listaRef?: React.RefObject<HTMLDivElement | null>) {
  const caixaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    // A lista pode estar fora da caixa (num portal): clicar nela não conta como fora
    const fora = (evento: PointerEvent) => !caixaRef.current?.contains(evento.target as Node) && !listaRef?.current?.contains(evento.target as Node) && aoFechar();
    const tecla = (evento: KeyboardEvent) => evento.key === "Escape" && aoFechar();
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("pointerdown", fora);
      window.removeEventListener("keydown", tecla);
    };
  }, [aberto, aoFechar, listaRef]);
  return caixaRef;
}

/**
 * Um botão de rodapé que abre uma lista para cima. A lista vai num portal, em posição fixa: dentro do painel ela era
 * cortada (com as camadas de preenchimento e os dezesseis ajustes, os primeiros itens sumiam acima dele).
 */
function BotaoComLista({ titulo, rotulo, itens, desativado }: { titulo: string; rotulo: React.ReactNode; itens: Item[]; desativado?: boolean }) {
  const [lugar, setLugar] = useState<{ left: number; bottom: number; maxHeight: number } | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const caixaRef = useFecharFora(Boolean(lugar), () => setLugar(null), listaRef);
  return (
    <div ref={caixaRef} className="relative">
      <button
        type="button"
        className="botao-icone h-6 w-auto gap-0.5 px-1"
        title={titulo}
        aria-label={titulo}
        aria-expanded={Boolean(lugar)}
        disabled={desativado}
        onClick={(evento) => {
          if (lugar) return setLugar(null);
          const r = evento.currentTarget.getBoundingClientRect();
          setLugar({ left: Math.max(8, Math.min(r.left, window.innerWidth - 216)), bottom: window.innerHeight - r.top + 4, maxHeight: Math.max(120, r.top - 12) });
        }}
      >
        {rotulo}
        <ChevronDown className="size-2.5" aria-hidden />
      </button>
      {lugar
        ? createPortal(
            <div ref={listaRef} role="menu" className="fixed z-50 min-w-48 overflow-y-auto rounded-md border border-borda bg-painel-2 py-1 text-xs shadow-xl shadow-black/50" style={lugar}>
              <ListaDeItens itens={itens} aoFechar={() => setLugar(null)} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** Um campo de porcentagem que só aplica ao sair (ou no Enter). */
function CampoDePorcentagem({ rotulo, valor, desativado, aoMudar }: { rotulo: string; valor: number | null; desativado: boolean; aoMudar: (valor: number) => void }) {
  const [digitado, setDigitado] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-1 text-suave">
      {rotulo}:
      <input
        aria-label={rotulo}
        disabled={desativado}
        inputMode="numeric"
        value={digitado ?? (valor === null ? "" : String(Math.round(valor * 100)))}
        onChange={(evento) => setDigitado(evento.currentTarget.value)}
        onBlur={() => {
          const numero = Number(digitado);
          setDigitado(null);
          if (digitado !== null && digitado.trim() !== "" && Number.isFinite(numero)) aoMudar(Math.min(100, Math.max(0, numero)) / 100);
        }}
        onKeyDown={(evento) => evento.key === "Enter" && evento.currentTarget.blur()}
        className="w-10 rounded border border-borda bg-painel-2 px-1 py-0.5 text-right text-texto tabular-nums disabled:opacity-50"
      />
      %
    </label>
  );
}

/**
 * O painel Camadas, como nos editores de imagem profissionais: em cima, o filtro, o modo de mesclagem, a opacidade, o
 * preenchimento e as travas da camada escolhida; as camadas de cima para baixo, com as pastas (que abrem e fecham), as
 * presas à de baixo (máscara de corte, com a seta), o olho (Alt + clique mostra só ela), o rótulo em cor e o nome
 * (duplo clique renomeia); arrastar muda a ordem e põe dentro ou fora das pastas; Ctrl e Shift escolhem várias; o
 * botão direito abre o menu da camada. No rodapé: vincular, estilo (fx), máscara, ajuste, pasta, duplicar e apagar.
 */
export function PainelCamadas({
  projeto,
  midias,
  selecao,
  aoSelecionar,
  aoExecutar,
  aoCriarAjuste,
  aoCriarPreenchimento,
  aoEditarPreenchimento,
  aoAbrirPropriedades,
  aoAbrirEstilo,
  aoNovaCamada,
  aoCamadaDoFundo,
  mascaraEmFoco,
  mascaraAVista,
  aoFocarMascara,
  aoVerMascara,
  aoCriarMascara,
  aoVincularMascara,
  mascaraVetorialEmFoco = null,
  aoFocarMascaraVetorial,
  aoAcaoMascaraVetorial,
  aoSelecionarDaCamada,
  pedido = null,
}: Props) {
  // Pastas abertas e fechadas só nesta tela (abrir uma pasta não é um passo do desfazer)
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  const [arrastadas, setArrastadas] = useState<string[] | null>(null);
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todas");
  // Isolar camadas: o filtro "isoladas" mostra só estas faixas
  const [isoladas, setIsoladas] = useState<ReadonlySet<string>>(new Set());
  const buscaRef = useRef<HTMLInputElement>(null);
  const [pedidoVisto, setPedidoVisto] = useState(0);
  if (pedido && pedido.vez !== pedidoVisto) {
    setPedidoVisto(pedido.vez);
    if (pedido.tipo === "isolar" && pedido.faixaIds.length) {
      setIsoladas(new Set(pedido.faixaIds));
      setFiltro("isoladas");
    }
  }
  // Encontrar camadas: o cursor vai para a busca
  useEffect(() => {
    if (pedido?.tipo === "procurar") buscaRef.current?.focus();
  }, [pedido]);
  // Arrastar na coluna do olho: o valor do primeiro (esconder ou mostrar) vai para as outras por onde o mouse passa
  const [pintandoOlho, setPintandoOlho] = useState<{ oculta: boolean; ids: string[] } | null>(null);
  const ancora = useRef<string | null>(null);
  const menuRef = useFecharFora(menu !== null, () => setMenu(null));

  const aberta = (faixa: Faixa) => abertas[faixa.id] ?? faixa.aberta !== false;
  const filtrando = busca.trim() !== "" || filtro !== "todas";
  const procura = busca.trim().toLocaleLowerCase("pt-BR");
  const passaNoFiltro = ({ faixa, clipe }: NoDaCamada): boolean => {
    const [tipo, valor] = filtro.split(":");
    if (tipo === "isoladas") return isoladas.has(faixa.id);
    if (tipo === "tipo") return tipoDaCamada(clipe, midias) === valor;
    if (tipo === "modo") return (clipe.mesclagem ?? (clipe.pasta ? "passagem" : "normal")) === valor;
    if (tipo === "cor") return faixa.rotulo === valor;
    if (tipo === "efeito") return valor === "contorno" ? Boolean(clipe.contorno) : valor === "sombra" ? Boolean(clipe.sombra) : Boolean(clipe.efeito);
    if (tipo === "atributo") {
      if (valor === "visivel") return camadaVisivel(projeto, faixa);
      if (valor === "oculta") return !camadaVisivel(projeto, faixa);
      if (valor === "travada") return faixa.travada || Boolean(faixa.travas);
      if (valor === "vinculada") return Boolean(faixa.vinculo);
      if (valor === "recortada") return Boolean(faixa.recortada);
      return Boolean(clipe.mascara);
    }
    return true;
  };
  const passa = (no: NoDaCamada) => passaNoFiltro(no) && (!procura || nomeDaCamada(no.clipe, midias, no.faixa).toLocaleLowerCase("pt-BR").includes(procura));

  const linhas: Linha[] = [];
  const andar = (nos: NoDaCamada[], nivel: number) => {
    for (const no of nos) {
      for (const presa of no.recortadas) {
        if (!filtrando || passa(presa)) linhas.push({ no: presa, nivel, presa: true });
        if (presa.clipe.pasta && (filtrando || aberta(presa.faixa))) andar(presa.filhos, nivel + 1);
      }
      if (!filtrando || passa(no)) linhas.push({ no, nivel, presa: false });
      if (no.clipe.pasta && (filtrando || aberta(no.faixa))) andar(no.filhos, nivel + 1);
    }
  };
  andar(arvoreDaImagem(projeto), 0);

  const todas = projeto.faixas.filter((faixa) => faixa.tipo !== "principal" && faixa.clipes.length);
  const escolhidas = todas.filter((faixa) => selecao.includes(faixa.clipes[0].id));
  const ids = escolhidas.map((faixa) => faixa.id);
  const clipeIds = escolhidas.map((faixa) => faixa.clipes[0].id);
  const primeira = escolhidas[0];
  const algumaTravada = escolhidas.some((faixa) => faixa.travada);
  const soPastas = escolhidas.length > 0 && escolhidas.every((faixa) => faixa.clipes[0].pasta);
  const temPasta = escolhidas.some((faixa) => faixa.clipes[0].pasta);
  const mesmaMesclagem = escolhidas.every((faixa) => (faixa.clipes[0].mesclagem ?? (faixa.clipes[0].pasta ? "passagem" : "normal")) === (primeira?.clipes[0].mesclagem ?? (primeira?.clipes[0].pasta ? "passagem" : "normal")));
  const mesmo = (ler: (faixa: Faixa) => number) => (primeira && escolhidas.every((faixa) => ler(faixa) === ler(primeira)) ? ler(primeira) : null);
  const opacidade = mesmo((faixa) => faixa.clipes[0].transformacao.opacidade);
  const preenchimento = mesmo((faixa) => faixa.clipes[0].preenchimento ?? 1);
  const vinculadas = escolhidas.length > 0 && escolhidas.every((faixa) => faixa.vinculo && faixa.vinculo === primeira.vinculo);

  /** Clique na linha: só ela; Ctrl junta ou tira; Shift escolhe do último clique até ela. */
  const escolher = (faixa: Faixa, evento: React.MouseEvent) => {
    const clipeId = faixa.clipes[0].id;
    // O clique na camada (não na miniatura da máscara) volta o pincel para a imagem dela
    if (mascaraEmFoco === clipeId) aoFocarMascara(null);
    if (evento.ctrlKey || evento.metaKey) {
      aoSelecionar(selecao.includes(clipeId) ? selecao.filter((id) => id !== clipeId) : [...selecao, clipeId]);
    } else if (evento.shiftKey && ancora.current) {
      const ordem = linhas.map((linha) => linha.no.faixa.id);
      const de = ordem.indexOf(ancora.current);
      const ate = ordem.indexOf(faixa.id);
      if (de >= 0 && ate >= 0) {
        aoSelecionar(linhas.slice(Math.min(de, ate), Math.max(de, ate) + 1).map((linha) => linha.no.clipe.id));
        return;
      }
      aoSelecionar([clipeId]);
    } else aoSelecionar([clipeId]);
    ancora.current = faixa.id;
  };

  const mudar = (mudanca: Extract<Comando, { comando: "imagem.camada" }>["parametros"]["mudanca"], faixaIds = ids) => aoExecutar({ comando: "imagem.camada", parametros: { faixaIds, mudanca } });
  const alternarTrava = (trava: keyof TravasDaCamada) => {
    const ligar = !escolhidas.every((faixa) => faixa.travas?.[trava]);
    mudar({ travas: { [trava]: ligar } });
  };
  const travarTudo = () => mudar({ travada: !escolhidas.every((faixa) => faixa.travada) });
  const recortar = (ligar: boolean) => mudar({ recortada: ligar });
  const agrupar = () => aoExecutar({ comando: "imagem.agrupar", parametros: { faixaIds: ids } });
  const desagrupar = () => {
    for (const faixa of escolhidas) if (faixa.clipes[0].pasta) aoExecutar({ comando: "imagem.desagrupar", parametros: { faixaId: faixa.id } });
  };
  const duplicar = () => aoExecutar({ comando: "imagem.duplicarVarias", parametros: { faixaIds: ids } });
  const apagar = () => aoExecutar({ comando: "imagem.apagarVarias", parametros: { faixaIds: ids } });
  const vincular = () => aoExecutar({ comando: "imagem.vincular", parametros: { faixaIds: ids, ligar: !vinculadas } });
  const vinculos = new Set(escolhidas.flatMap((faixa) => (faixa.vinculo ? [faixa.vinculo] : [])));
  const selecionarVinculadas = () => aoSelecionar(todas.filter((faixa) => faixa.vinculo && vinculos.has(faixa.vinculo)).map((faixa) => faixa.clipes[0].id));

  // Solta o arrasto do olho onde quer que o mouse seja solto: todas as tocadas mudam num passo só
  useEffect(() => {
    if (!pintandoOlho) return;
    const soltar = () => {
      setPintandoOlho(null);
      aoExecutar({ comando: "imagem.camada", parametros: { faixaIds: pintandoOlho.ids, mudanca: { oculta: pintandoOlho.oculta } } });
    };
    window.addEventListener("pointerup", soltar);
    return () => window.removeEventListener("pointerup", soltar);
  }, [pintandoOlho, aoExecutar]);

  /** Solta as arrastadas no alvo: acima ou abaixo de uma linha (entre as irmãs dela) ou no topo de uma pasta. */
  const soltar = (arrastadasAgora: string[], destino: Alvo) => {
    const faixa = projeto.faixas.find((item) => item.id === destino.faixaId);
    if (!faixa || arrastadasAgora.includes(faixa.id)) return;
    const primeiraDentro = (pasta: Faixa) => todas.find((item) => paiDaCamada(projeto, item) === pasta.id && !arrastadasAgora.includes(item.id))?.id ?? null;
    if (destino.zona === "dentro" || (destino.zona === "abaixo" && faixa.clipes[0].pasta && aberta(faixa) && !filtrando)) {
      aoExecutar({ comando: "imagem.moverPara", parametros: { faixaIds: arrastadasAgora, pai: faixa.id, acimaDe: primeiraDentro(faixa) } });
      return;
    }
    const pai = paiDaCamada(projeto, faixa);
    const irmas = todas.filter((item) => paiDaCamada(projeto, item) === pai && !arrastadasAgora.includes(item.id));
    const acimaDe = destino.zona === "acima" ? faixa.id : (irmas[irmas.indexOf(faixa) + 1]?.id ?? null);
    aoExecutar({ comando: "imagem.moverPara", parametros: { faixaIds: arrastadasAgora, pai, acimaDe } });
  };

  const itensDoMenu: Item[] = [
    { nome: "Renomear camada", desativado: escolhidas.length !== 1, aoEscolher: () => primeira && setRenomeando(primeira.id) },
    { nome: escolhidas.length > 1 ? "Duplicar camadas" : "Duplicar camada", desativado: !escolhidas.length, aoEscolher: duplicar },
    { nome: escolhidas.length > 1 ? "Excluir camadas" : "Excluir camada", desativado: !escolhidas.length || algumaTravada, aoEscolher: apagar },
    "-",
    { nome: "Agrupar camadas", desativado: !escolhidas.length, aoEscolher: agrupar },
    { nome: "Desagrupar camadas", desativado: !temPasta, aoEscolher: desagrupar },
    escolhidas.length && escolhidas.every((faixa) => faixa.recortada)
      ? { nome: "Liberar máscara de corte", aoEscolher: () => recortar(false) }
      : { nome: "Criar máscara de corte", desativado: !escolhidas.length, aoEscolher: () => recortar(true) },
    { nome: vinculadas ? "Desvincular camadas" : "Vincular camadas", desativado: vinculadas ? false : escolhidas.length < 2, aoEscolher: vincular },
    { nome: "Selecionar camadas vinculadas", desativado: vinculos.size === 0, aoEscolher: selecionarVinculadas },
    "-",
    { nome: "Mostrar só esta camada", desativado: escolhidas.length !== 1, aoEscolher: () => primeira && aoExecutar({ comando: "imagem.soEsta", parametros: { faixaId: primeira.id } }) },
    { nome: escolhidas.every((faixa) => faixa.travada) && escolhidas.length ? "Desbloquear camada" : "Bloquear tudo", desativado: !escolhidas.length, aoEscolher: travarTudo },
    "-",
    { nome: "Sem cor", desativado: !escolhidas.length, aoEscolher: () => mudar({ rotulo: null }) },
    ...CORES_DOS_ROTULOS.map((rotulo): Item => ({ nome: rotulo.nome, cor: rotulo.cor, desativado: !escolhidas.length, aoEscolher: () => mudar({ rotulo: rotulo.id }) })),
  ];

  return (
    <div data-painel-camadas className="relative flex h-full min-h-0 flex-col text-xs">
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-borda p-2">
        <div className="flex items-center gap-1.5">
          <label className="flex min-w-0 flex-1 items-center gap-1 rounded border border-borda bg-painel-2 px-1.5">
            <Search className="size-3 shrink-0 text-suave" aria-hidden />
            <input ref={buscaRef} value={busca} onChange={(evento) => setBusca(evento.currentTarget.value)} placeholder="Procurar camadas" aria-label="Procurar camadas pelo nome" className="min-w-0 flex-1 bg-transparent py-0.5 outline-none" />
          </label>
          <select aria-label="Filtrar as camadas" value={filtro} onChange={(evento) => setFiltro(evento.currentTarget.value)} className="w-24 rounded border border-borda bg-painel-2 px-1 py-0.5">
            <option value="todas">Todas</option>
            {isoladas.size ? <option value="isoladas">Isoladas</option> : null}
            {FILTROS.map((grupo) => (
              <optgroup key={grupo.grupo} label={grupo.grupo}>
                {grupo.itens.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Modo de mesclagem"
            disabled={!escolhidas.length || algumaTravada}
            value={mesmaMesclagem && primeira ? (primeira.clipes[0].mesclagem ?? (primeira.clipes[0].pasta ? "passagem" : "normal")) : ""}
            onChange={(evento) => aoExecutar({ comando: "clipe.mesclar", parametros: { clipeIds, mesclagem: evento.currentTarget.value as Mesclagem } })}
            onWheel={(evento) => {
              // A roda passa pelos modos, como nos editores de imagem (o separador não conta)
              const campo = evento.currentTarget;
              if (campo.disabled || document.activeElement !== campo) return;
              const modos = [...(soPastas ? ["passagem"] : []), ...MESCLAGENS_DA_IMAGEM.flat().map((modo) => modo.id)];
              const proximo = modos[modos.indexOf(campo.value) + (evento.deltaY > 0 ? 1 : -1)];
              if (proximo) aoExecutar({ comando: "clipe.mesclar", parametros: { clipeIds, mesclagem: proximo as Mesclagem } });
            }}
            className="min-w-0 flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5 disabled:opacity-50"
          >
            {!mesmaMesclagem ? <option value="">—</option> : null}
            {soPastas ? <option value="passagem">{nomeDaMesclagem("passagem")}</option> : null}
            {MESCLAGENS_DA_IMAGEM.map((grupo, indice) => (
              <Fragment key={grupo[0].id}>
                {indice > 0 || soPastas ? <option disabled>──────────</option> : null}
                {grupo.map((modo) => (
                  <option key={modo.id} value={modo.id}>
                    {modo.nome}
                  </option>
                ))}
              </Fragment>
            ))}
          </select>
          <CampoDePorcentagem
            rotulo="Opacidade"
            valor={opacidade}
            desativado={!escolhidas.length || algumaTravada}
            aoMudar={(valor) => aoExecutar({ comando: "clipe.transformar", parametros: { clipeIds, transformacao: { opacidade: valor } } })}
          />
        </div>
        <div className="flex items-center gap-1 text-suave">
          Bloquear:
          {TRAVAS.map(({ id, nome, icone: Icone }) => {
            const ligada = escolhidas.length > 0 && escolhidas.every((faixa) => faixa.travas?.[id]);
            return (
              <button
                key={id}
                type="button"
                disabled={!escolhidas.length}
                aria-pressed={ligada}
                title={nome}
                aria-label={nome}
                onClick={() => alternarTrava(id)}
                className={`grid size-5 place-items-center rounded border ${ligada ? "border-destaque bg-destaque/20 text-texto" : "border-borda hover:text-texto"} disabled:opacity-40`}
              >
                <Icone className="size-3" aria-hidden />
              </button>
            );
          })}
          <button
            type="button"
            disabled={!escolhidas.length}
            aria-pressed={escolhidas.length > 0 && escolhidas.every((faixa) => faixa.travada)}
            title="Bloquear tudo (a camada não se move nem muda)"
            aria-label="Bloquear tudo"
            onClick={travarTudo}
            className={`grid size-5 place-items-center rounded border ${escolhidas.length && escolhidas.every((faixa) => faixa.travada) ? "border-destaque bg-destaque/20 text-texto" : "border-borda hover:text-texto"} disabled:opacity-40`}
          >
            <Lock className="size-3" aria-hidden />
          </button>
          <span className="ml-auto">
            <CampoDePorcentagem rotulo="Preenchimento" valor={temPasta ? null : preenchimento} desativado={!escolhidas.length || algumaTravada || temPasta} aoMudar={(valor) => mudar({ preenchimento: valor })} />
          </span>
        </div>
      </div>

      <ol
        aria-label="Camadas, de cima para baixo"
        className="min-h-0 flex-1 overflow-y-auto"
        onDragLeave={(evento) => !evento.currentTarget.contains(evento.relatedTarget as Node) && setAlvo(null)}
        onClick={(evento) => evento.target === evento.currentTarget && aoSelecionar([])}
      >
        {linhas.length === 0 ? <li className="px-3 py-4 text-center text-suave">{filtrando ? "Nenhuma camada com esse filtro." : "Nenhuma camada ainda."}</li> : null}
        {linhas.map(({ no, nivel, presa }, indiceDaLinha) => {
          const { faixa, clipe } = no;
          const midia = clipe.midia_id ? midias.get(clipe.midia_id) : undefined;
          const nome = nomeDaCamada(clipe, midias, faixa);
          const marcada = selecao.includes(clipe.id);
          const comEstilo = Boolean(clipe.contorno || clipe.sombra || clipe.estilo_camada?.efeitos.length);
          const mesclagem = clipe.pasta ? (clipe.mesclagem && clipe.mesclagem !== "passagem" ? nomeDaMesclagem(clipe.mesclagem) : null) : clipe.mesclagem && clipe.mesclagem !== "normal" ? nomeDaMesclagem(clipe.mesclagem) : null;
          const visivel = camadaVisivel(projeto, faixa);
          const rotulo = faixa.rotulo ? CORES_DOS_ROTULOS.find((cor) => cor.id === faixa.rotulo)?.cor : undefined;
          const temTrava = faixa.travada || Boolean(faixa.travas);
          const alvoAqui = alvo?.faixaId === faixa.id ? alvo.zona : null;
          return (
            <li
              key={faixa.id}
              draggable={renomeando !== faixa.id}
              onDragStart={(evento) => {
                setArrastadas(marcada ? ids : [faixa.id]);
                evento.dataTransfer.effectAllowed = "move";
                evento.dataTransfer.setData("text/plain", nome);
              }}
              onDragOver={(evento) => {
                if (!arrastadas) return;
                evento.preventDefault();
                const caixa = evento.currentTarget.getBoundingClientRect();
                const fracao = (evento.clientY - caixa.top) / caixa.height;
                const zona: Alvo["zona"] = clipe.pasta && fracao > 0.25 && fracao < 0.75 ? "dentro" : fracao < 0.5 ? "acima" : "abaixo";
                if (alvo?.faixaId !== faixa.id || alvo.zona !== zona) setAlvo({ faixaId: faixa.id, zona });
              }}
              onDrop={(evento) => {
                evento.preventDefault();
                if (arrastadas && alvo) soltar(arrastadas, alvo);
                setArrastadas(null);
                setAlvo(null);
              }}
              onDragEnd={() => {
                setArrastadas(null);
                setAlvo(null);
              }}
              onContextMenu={(evento) => {
                evento.preventDefault();
                if (!marcada) aoSelecionar([clipe.id]);
                const caixa = evento.currentTarget.closest("[data-painel-camadas]")?.getBoundingClientRect();
                setMenu({ x: evento.clientX - (caixa?.left ?? 0), y: evento.clientY - (caixa?.top ?? 0) });
              }}
              className={`relative flex h-9 items-stretch border-b border-borda/60 ${marcada ? "bg-destaque/25" : "hover:bg-painel-2"} ${arrastadas?.includes(faixa.id) ? "opacity-50" : ""} ${alvoAqui === "dentro" ? "outline outline-2 -outline-offset-2 outline-destaque" : ""}`}
            >
              {alvoAqui === "acima" ? <span className="absolute inset-x-0 top-0 h-0.5 bg-destaque" aria-hidden /> : null}
              {alvoAqui === "abaixo" ? <span className="absolute inset-x-0 -bottom-px h-0.5 bg-destaque" aria-hidden /> : null}
              <button
                type="button"
                onPointerDown={(evento) => {
                  if (evento.button !== 0) return;
                  // Sem o arrasto da linha: o olho pinta (Alt + clique mostra só esta)
                  evento.preventDefault();
                  if (evento.altKey) aoExecutar({ comando: "imagem.soEsta", parametros: { faixaId: faixa.id } });
                  else setPintandoOlho({ oculta: !faixa.oculta, ids: [faixa.id] });
                }}
                onPointerEnter={() => pintandoOlho && !pintandoOlho.ids.includes(faixa.id) && setPintandoOlho({ ...pintandoOlho, ids: [...pintandoOlho.ids, faixa.id] })}
                onClick={(evento) => {
                  // Pelo teclado (Enter ou espaço), o clique não passa pelo ponteiro
                  if (evento.detail === 0) aoExecutar({ comando: "faixa.alternar", parametros: { faixaId: faixa.id, propriedade: "oculta" } });
                }}
                aria-label={faixa.oculta ? `Mostrar ${nome}` : `Esconder ${nome}`}
                title={faixa.oculta ? "Mostrar a camada (arraste para mais; Alt + clique: só ela)" : "Esconder a camada (arraste para mais; Alt + clique: só ela)"}
                className="grid w-7 shrink-0 touch-none place-items-center border-r border-borda/60 text-suave hover:text-texto"
                style={rotulo ? { background: `${rotulo}55` } : undefined}
              >
                {(pintandoOlho?.ids.includes(faixa.id) ? pintandoOlho.oculta : faixa.oculta) ? <span className="size-3.5" /> : <Eye className={`size-3.5 ${visivel ? "" : "opacity-40"}`} aria-hidden />}
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-1.5 pr-1.5" style={{ paddingLeft: 4 + nivel * 14 }}>
                {clipe.pasta ? (
                  <button
                    type="button"
                    className="grid size-4 shrink-0 place-items-center text-suave hover:text-texto"
                    aria-label={aberta(faixa) ? `Fechar ${nome}` : `Abrir ${nome}`}
                    aria-expanded={aberta(faixa)}
                    onClick={() => setAbertas((atual) => ({ ...atual, [faixa.id]: !aberta(faixa) }))}
                  >
                    {aberta(faixa) ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
                  </button>
                ) : null}
                {presa ? <CornerLeftDown className="size-3 shrink-0 text-suave" aria-label="Presa à camada de baixo" /> : null}
                <button
                  type="button"
                  onClick={(evento) => {
                    // Alt + clique prende a camada à de baixo (ou solta), como o Alt entre as duas nos editores de imagem
                    if (evento.altKey) mudar({ recortada: !faixa.recortada }, [faixa.id]);
                    else escolher(faixa, evento);
                  }}
                  onDoubleClick={() => setRenomeando(faixa.id)}
                  title="Alt + clique: prende à camada de baixo (máscara de corte) ou solta" 
                  aria-pressed={marcada}
                  className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-left"
                >
                  <span
                    className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-borda bg-painel-3"
                    title={clipe.pasta ? undefined : "Ctrl + clique: seleciona pela transparência da camada (Shift soma, Alt subtrai)"}
                    onDoubleClick={(evento) => {
                      // O clique duplo na miniatura do preenchimento abre a janela dele (no nome, renomeia)
                      if (!clipe.camada_de_preenchimento || !aoEditarPreenchimento) return;
                      evento.stopPropagation();
                      aoEditarPreenchimento(clipe.id);
                    }}
                    onClick={(evento) => {
                      if (!(evento.ctrlKey || evento.metaKey) || clipe.pasta || !aoSelecionarDaCamada) return;
                      evento.stopPropagation();
                      evento.preventDefault();
                      aoSelecionarDaCamada(clipe.id, modoDoCtrl(evento), "camada");
                    }}
                  >
                    {clipe.prancheta ? (
                      <LayoutTemplate className="size-3.5 text-suave" aria-label="Prancheta" />
                    ) : clipe.pasta ? (
                      aberta(faixa) ? (
                        <FolderOpen className="size-3.5 text-suave" aria-hidden />
                      ) : (
                        <Folder className="size-3.5 text-suave" aria-hidden />
                      )
                    ) : clipe.pixels ? (
                      // A camada de pixels: a versão que ela mostra, sobre o xadrez da transparência
                      <span className="size-full" style={{ background: "repeating-conic-gradient(#c8cad0 0% 25%, #ffffff 0% 50%) 50% / 8px 8px" }}>
                        {clipe.pixels.versao > 0 && clipe.midia_id ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a versão da API com a sessão do cookie
                          <img src={arquivoDaMidia(clipe.midia_id, arquivoDaVersao(clipe.pixels.versao))} alt="" className="size-full object-contain" />
                        ) : null}
                      </span>
                    ) : clipe.texto || clipe.texto_rico ? (
                      <Type className="size-3.5 text-suave" aria-hidden />
                    ) : clipe.ajuste ? (
                      <SlidersHorizontal className="size-3.5 text-suave" aria-hidden />
                    ) : clipe.camada_de_preenchimento ? (
                      <span title="Clique duplo: muda o preenchimento" className="block size-full">
                        <AmostraDaTinta tinta={clipe.camada_de_preenchimento.tinta} className="size-full" />
                      </span>
                    ) : clipe.vetor ? (
                      <MiniaturaDoVetor vetor={clipe.vetor} />
                    ) : midia?.elemento ? (
                      <Shapes className="size-3.5 text-suave" aria-hidden />
                    ) : midia ? (
                      // eslint-disable-next-line @next/next/no-img-element -- capa da API com a sessão do cookie
                      <img src={arquivoDaMidia(midia.id, "capa.jpg")} alt="" className="size-full object-cover" />
                    ) : null}
                  </span>
                  {clipe.mascara ? <SquareDashed className="size-3.5 shrink-0 text-suave" aria-label="Com máscara de forma" /> : null}
                  {renomeando === faixa.id ? null : <span className={`min-w-0 flex-1 truncate ${presa ? "underline decoration-dotted underline-offset-2" : ""} ${visivel ? "" : "text-apagado"}`}>{nome}</span>}
                </button>
                {renomeando === faixa.id ? (
                  <input
                    autoFocus
                    defaultValue={nome}
                    maxLength={60}
                    aria-label="Nome da camada"
                    onFocus={(evento) => evento.currentTarget.select()}
                    onBlur={(evento) => {
                      const valor = evento.currentTarget.value.trim();
                      setRenomeando(null);
                      if (valor !== nome) mudar({ nome: valor || null }, [faixa.id]);
                    }}
                    onKeyDown={(evento) => {
                      if (evento.key === "Enter") evento.currentTarget.blur();
                      else if (evento.key === "Tab") {
                        // Tab passa a renomear a de baixo (Shift+Tab, a de cima)
                        evento.preventDefault();
                        const valor = evento.currentTarget.value.trim();
                        const proxima = linhas[indiceDaLinha + (evento.shiftKey ? -1 : 1)]?.no.faixa.id ?? null;
                        if (valor !== nome) mudar({ nome: valor || null }, [faixa.id]);
                        setRenomeando(proxima);
                      } else if (evento.key === "Escape") {
                        evento.currentTarget.value = nome;
                        evento.currentTarget.blur();
                      }
                    }}
                    className="min-w-0 flex-1 rounded border border-destaque bg-painel-2 px-1 py-0.5 outline-none"
                  />
                ) : null}
                {clipe.mascara_pixels ? (
                  <>
                    <button
                      type="button"
                      className={`grid size-4 shrink-0 place-items-center ${clipe.mascara_pixels.vinculada ? "text-suave" : "text-suave/30"} hover:text-texto`}
                      title={clipe.mascara_pixels.vinculada ? "Máscara vinculada: anda com a camada (clique para soltar)" : "Máscara solta: fica no lugar (clique para vincular)"}
                      aria-label={clipe.mascara_pixels.vinculada ? `Desvincular a máscara de ${nome}` : `Vincular a máscara de ${nome}`}
                      aria-pressed={clipe.mascara_pixels.vinculada}
                      onClick={() => aoVincularMascara(clipe.id, !clipe.mascara_pixels!.vinculada)}
                    >
                      <Link2 className="size-3" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(evento) => {
                        const mascara = clipe.mascara_pixels!;
                        if ((evento.ctrlKey || evento.metaKey) && aoSelecionarDaCamada) aoSelecionarDaCamada(clipe.id, modoDoCtrl(evento), "mascara");
                        else if (evento.altKey) aoVerMascara(mascaraAVista === clipe.id ? null : clipe.id);
                        else if (evento.shiftKey) aoExecutar({ comando: "mascara.mudar", parametros: { clipeId: clipe.id, mudanca: { ligada: !mascara.ligada } } });
                        else {
                          if (!marcada) aoSelecionar([clipe.id]);
                          aoFocarMascara(clipe.id);
                        }
                      }}
                      title="Máscara de camada: clique para pintar nela, Alt + clique para vê-la, Shift + clique para desativar, Ctrl + clique para selecionar por ela"
                      aria-label={`Máscara de ${nome}`}
                      aria-pressed={mascaraEmFoco === clipe.id}
                      className={`relative size-7 shrink-0 overflow-hidden rounded-sm border bg-black ${mascaraEmFoco === clipe.id ? "border-2 border-texto" : "border-borda"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- a versão da API com a sessão do cookie */}
                      <img src={arquivoDaMidia(clipe.mascara_pixels.midia_id, arquivoDaVersao(clipe.mascara_pixels.versao))} alt="" className="size-full object-contain" />
                      {!clipe.mascara_pixels.ligada ? <span className="absolute inset-0 grid place-items-center text-sm font-bold text-erro" aria-label="Desativada">✕</span> : null}
                    </button>
                  </>
                ) : null}
                {clipe.mascara_vetorial ? (
                  <>
                    <button
                      type="button"
                      className={`grid size-4 shrink-0 place-items-center ${clipe.mascara_vetorial.vinculada ? "text-suave" : "text-suave/30"} hover:text-texto`}
                      title={clipe.mascara_vetorial.vinculada ? "Máscara vetorial vinculada (clique para soltar)" : "Máscara vetorial solta (clique para vincular)"}
                      aria-label={clipe.mascara_vetorial.vinculada ? `Desvincular a máscara vetorial de ${nome}` : `Vincular a máscara vetorial de ${nome}`}
                      onClick={() => aoAcaoMascaraVetorial?.(clipe.id, "vincular")}
                    >
                      <Link2 className="size-3" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(evento) => {
                        if (evento.ctrlKey || evento.metaKey) aoAcaoMascaraVetorial?.(clipe.id, "selecionar", modoDoCtrl(evento));
                        else if (evento.shiftKey) aoAcaoMascaraVetorial?.(clipe.id, "ligar");
                        else {
                          if (!marcada) aoSelecionar([clipe.id]);
                          aoFocarMascaraVetorial?.(mascaraVetorialEmFoco === clipe.id ? null : clipe.id);
                        }
                      }}
                      title="Máscara vetorial: clique para editar os caminhos dela, Shift + clique para desativar, Ctrl + clique para selecionar por ela"
                      aria-label={`Máscara vetorial de ${nome}`}
                      aria-pressed={mascaraVetorialEmFoco === clipe.id}
                      className={`relative size-7 shrink-0 overflow-hidden rounded-sm border ${mascaraVetorialEmFoco === clipe.id ? "border-2 border-texto" : "border-borda"}`}
                    >
                      <MiniaturaDaMascaraVetorial mascara={clipe.mascara_vetorial} documento={tamanhoDaImagem(projeto)} />
                      {!clipe.mascara_vetorial.ligada ? <span className="absolute inset-0 grid place-items-center text-sm font-bold text-erro" aria-label="Desativada">✕</span> : null}
                    </button>
                  </>
                ) : null}
                {mesclagem ? <span className="shrink-0 text-[10px] text-suave">{mesclagem}</span> : null}
                {faixa.vinculo ? <Link2 className="size-3 shrink-0 text-suave" aria-label="Vinculada" /> : null}
                {comEstilo ? <span className="shrink-0 font-serif text-[11px] italic text-suave">fx</span> : null}
                {temTrava ? <Lock className={`size-3 shrink-0 ${faixa.travada ? "text-texto" : "text-suave/70"}`} aria-label={faixa.travada ? "Bloqueada" : "Com bloqueio parcial"} /> : null}
              </div>
            </li>
          );
        })}
        {!filtrando && !projeto.fundo.transparente && !todas.some((faixa) => faixa.fundo) ? (
          // O fundo da imagem (a cor do documento), como a camada de fundo travada dos editores de imagem: o duplo
          // clique o transforma numa camada comum
          <li className="flex h-9 items-stretch border-b border-borda/60" title="Duplo clique: Camada a partir do fundo">
            <span className="grid w-7 shrink-0 place-items-center border-r border-borda/60 text-suave">
              <Eye className="size-3.5" aria-hidden />
            </span>
            <button type="button" onDoubleClick={aoCamadaDoFundo} className="flex min-w-0 flex-1 items-center gap-2 px-1.5 text-left" aria-label="Fundo (duplo clique: camada a partir do fundo)">
              <span className="size-7 shrink-0 rounded-sm border border-borda" style={{ background: projeto.fundo.cor }} aria-hidden />
              <span className="min-w-0 flex-1 truncate italic">Fundo</span>
              <Lock className="size-3 shrink-0 text-suave" aria-label="Travada" />
            </button>
          </li>
        ) : null}
      </ol>

      {menu ? (
        <div ref={menuRef} role="menu" className="absolute z-50 min-w-52 rounded-md border border-borda bg-painel-2 py-1 text-xs shadow-xl shadow-black/50" style={{ left: Math.max(4, Math.min(menu.x, 140)), top: menu.y }}>
          <ListaDeItens itens={itensDoMenu} aoFechar={() => setMenu(null)} />
        </div>
      ) : null}

      <div className="flex h-8 shrink-0 items-center justify-end gap-0.5 border-t border-borda px-1.5">
        <button
          type="button"
          className={`botao-icone size-6 ${vinculadas ? "text-destaque" : ""}`}
          title={vinculadas ? "Desvincular as camadas" : "Vincular as camadas (andam juntas)"}
          aria-label={vinculadas ? "Desvincular as camadas" : "Vincular as camadas"}
          aria-pressed={vinculadas}
          disabled={vinculadas ? false : escolhidas.length < 2}
          onClick={vincular}
        >
          <Link2 className="size-3.5" aria-hidden />
        </button>
        <BotaoComLista
          titulo="Adicionar um estilo de camada"
          rotulo={<span className="font-serif text-[13px] italic">fx</span>}
          desativado={escolhidas.length !== 1 || algumaTravada || temPasta}
          itens={
            aoAbrirEstilo
              ? [{ nome: "Opções de mesclagem…", aoEscolher: () => aoAbrirEstilo("mesclagem") }, ...NOMES_DOS_EFEITOS.map(({ tipo, nome }) => ({ nome: `${nome}…`, aoEscolher: () => aoAbrirEstilo(tipo) }))]
              : [
                  {
                    nome: "Contorno…",
                    aoEscolher: () => {
                      aoExecutar({ comando: "clipe.silhueta", parametros: { clipeIds, contorno: primeira?.clipes[0].contorno ?? CONTORNO_PADRAO } });
                      aoAbrirPropriedades();
                    },
                  },
                  {
                    nome: "Sombra projetada…",
                    aoEscolher: () => {
                      aoExecutar({ comando: "clipe.silhueta", parametros: { clipeIds, sombra: primeira?.clipes[0].sombra ?? SOMBRA_PADRAO } });
                      aoAbrirPropriedades();
                    },
                  },
                ]
          }
        />
        <button
          type="button"
          className="botao-icone size-6"
          title="Adicionar uma máscara de camada (Alt: ocultar tudo)"
          aria-label="Adicionar uma máscara de camada"
          disabled={escolhidas.length !== 1 || algumaTravada || Boolean(primeira?.clipes[0].mascara_pixels) || Boolean(primeira?.clipes[0].pasta)}
          onClick={(evento) => aoCriarMascara(evento.altKey ? "ocultar" : "revelar")}
        >
          <SquareDashed className="size-3.5" aria-hidden />
        </button>
        <BotaoComLista
          titulo="Criar uma camada de preenchimento ou de ajuste"
          rotulo={<SlidersHorizontal className="size-3.5" aria-hidden />}
          itens={[
            ...(aoCriarPreenchimento
              ? ([
                  { nome: "Cor sólida…", aoEscolher: () => aoCriarPreenchimento("cor") },
                  { nome: "Degradê…", aoEscolher: () => aoCriarPreenchimento("degrade") },
                  { nome: "Padrão…", aoEscolher: () => aoCriarPreenchimento("padrao") },
                  "-",
                ] as Item[])
              : []),
            ...AJUSTES.map((ajuste) => ({ nome: `${ajuste.nome}…`, aoEscolher: () => aoCriarAjuste(ajuste) })),
          ]}
        />
        <button type="button" className="botao-icone size-6" title="Criar uma camada (Ctrl+Shift+N)" aria-label="Criar uma camada" onClick={aoNovaCamada}>
          <SquarePlus className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="botao-icone size-6"
          title={escolhidas.length ? "Agrupar as camadas escolhidas (Ctrl+G)" : "Criar um grupo"}
          aria-label={escolhidas.length ? "Agrupar as camadas" : "Criar um grupo"}
          onClick={agrupar}
        >
          <FolderPlus className="size-3.5" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" title="Duplicar a camada (Ctrl+J)" aria-label="Duplicar a camada" disabled={!escolhidas.length} onClick={duplicar}>
          <Copy className="size-3.5" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" title="Excluir a camada (Delete)" aria-label="Excluir a camada" disabled={!escolhidas.length || algumaTravada} onClick={apagar}>
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
