"use client";

import { Check, ChevronLeft, Download, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { BarraDeMenus, useAtalhosDosMenus } from "@/componentes/area/BarraDeMenus";
import { ColunaDePaineis, type Painel, useAreaDeTrabalho } from "@/componentes/area/Paineis";
import { BotaoTema } from "@/componentes/BotaoTema";
import { Simbolo } from "@/componentes/Logo";
import { contextoDasMidias } from "@/componentes/editor/contexto";
import { PainelEfeitos } from "@/componentes/editor/PainelEfeitos";
import { PainelFormas } from "@/componentes/editor/PainelFormas";
import { type IdAba, PainelPropriedades } from "@/componentes/editor/PainelPropriedades";
import { MiniaturaDoEstilo } from "@/componentes/editor/PainelTexto";
import { useProjeto } from "@/componentes/editor/useProjeto";
import { Redirecionar } from "@/componentes/projeto/Redirecionar";
import { criarForma } from "@/lib/elementos";
import type { EstadoDaArea } from "@/lib/areaDeTrabalho";
import { enderecoDoProjeto } from "@/lib/hub";
import { useMarca } from "@/lib/marca";
import type { Comando } from "@/lib/projeto/comandos";
import { executarComando } from "@/lib/projeto/comandos";
import { INTENSIDADE_PADRAO, type TipoEfeito } from "@/lib/projeto/efeitos";
import { camadasDaImagem, type RetanguloDaImagem, tamanhoDaImagem } from "@/lib/projeto/imagem";
import { acharClipe, MASCARA_PADRAO, type Transformacao } from "@/lib/projeto/modelo";
import { camadasDoModelo, fundoDoModelo, type MidiasDoModelo, type ModeloDeImagem, modeloDeImagem, pedidosDoModelo } from "@/lib/projeto/modelosDeImagem";
import { CONTORNO_PADRAO, SOMBRA_PADRAO } from "@/lib/projeto/silhueta";
import { ESTILOS_DE_TEXTO, type Texto, TEXTO_PADRAO } from "@/lib/projeto/texto";
import type { Midia } from "@/lib/tipos";
import { useMidias } from "@/lib/useMidias";

import type { Ajuste } from "./ajustesDaImagem";
import { BarraDeOpcoes, type OpcoesDaForma } from "./BarraDeOpcoes";
import { CaixaDeFerramentas } from "./CaixaDeFerramentas";
import { ferramenta as dadosDa, FORMA_DA_FERRAMENTA, GRUPOS_DE_FERRAMENTAS, grupoDa, type IdFerramentaDaImagem, MODO_DA_SELECAO, TODAS_AS_FERRAMENTAS } from "./ferramentasDaImagem";
import { JanelaEscolherImagem } from "./JanelaEscolherImagem";
import { JanelaExportarImagem } from "./JanelaExportarImagem";
import { type AcoesDosMenus, AREAS_DA_IMAGEM, type IdPainelDaImagem, menusDaImagem, PAINEIS_DA_IMAGEM } from "./menusDaImagem";
import { nomeDaCamada, PainelCamadas } from "./PainelCamadas";
import { PainelFotoIA } from "./PainelFotoIA";
import { PainelAjustes, PainelAmostras, PainelBiblioteca, PainelCor, PainelHistorico, PainelModelosDaImagem } from "./PaineisDaImagem";
import { PreviaDaImagem, proximoZoom } from "./PreviaDaImagem";
import { PropriedadesDoDocumento } from "./PropriedadesDoDocumento";
import { useObjeto } from "./useObjeto";

const SEM_SEGUIR = {
  marcando: null,
  andamento: null,
  aoIniciar: () => undefined,
};
const NADA = () => undefined;

/** As áreas de trabalho: uma coluna de grupos à direita, como nos editores de imagem profissionais. */
const AREAS: Record<string, EstadoDaArea> = {
  essenciais: {
    direita: [
      { id: "g-cor", abas: ["cor", "amostras", "formas"], ativa: "cor", altura: 190 },
      { id: "g-propriedades", abas: ["propriedades", "ajustes", "biblioteca", "modelos"], ativa: "propriedades", altura: 340 },
      { id: "g-camadas", abas: ["camadas", "historico"], ativa: "camadas" },
    ],
  },
  fotografia: {
    direita: [
      { id: "g-propriedades", abas: ["propriedades", "ajustes", "filtros"], ativa: "propriedades", altura: 360 },
      { id: "g-biblioteca", abas: ["biblioteca", "fotoIA"], ativa: "biblioteca", altura: 220 },
      { id: "g-camadas", abas: ["camadas", "historico"], ativa: "camadas" },
    ],
  },
  grafico: {
    direita: [
      { id: "g-cor", abas: ["cor", "amostras"], ativa: "cor", altura: 190 },
      { id: "g-propriedades", abas: ["propriedades", "estilos", "formas", "modelos"], ativa: "propriedades", altura: 340 },
      { id: "g-camadas", abas: ["camadas", "historico", "biblioteca"], ativa: "camadas" },
    ],
  },
};
const IDS_DOS_PAINEIS = Object.keys(PAINEIS_DA_IMAGEM);

type Pendente = { trocar?: string[]; camadaDe?: string; caixa?: RetanguloDaImagem };

function porcentagem(zoom: number): string {
  return `${(Math.round(zoom * 1000) / 10).toLocaleString("pt-BR")}%`;
}

/**
 * O editor de imagem (ADR 0002): menus, barra de opções, caixa de ferramentas à esquerda, o documento no meio e os
 * painéis encaixados à direita, nos lugares e com os nomes dos editores de imagem profissionais. O projeto, o
 * desfazer e o salvamento são os do editor de vídeo; as camadas são faixas com um clipe só.
 */
export function EditorDeImagem({ projetoId, modeloInicial }: { projetoId: string; modeloInicial?: string }) {
  const router = useRouter();
  const marca = useMarca();
  const biblioteca = useMidias();
  const midias = useMemo(() => new Map((biblioteca.midias ?? []).map((midia) => [midia.id, midia])), [biblioteca.midias]);
  const ctx = useMemo(() => contextoDasMidias(midias), [midias]);
  const edicao = useProjeto(projetoId, ctx);
  const { projeto, executar: executarNoProjeto, desfazer, refazer, mostrarAviso } = edicao;
  const area = useAreaDeTrabalho("imagem", AREAS, "essenciais", IDS_DOS_PAINEIS);

  const [ferramenta, setFerramenta] = useState<IdFerramentaDaImagem>("mover");
  const [ultimas, setUltimas] = useState<Partial<Record<number, IdFerramentaDaImagem>>>({});
  const [cores, setCores] = useState<{ primeiroPlano: string; fundo: string; editando: "primeiroPlano" | "fundo" }>({ primeiroPlano: "#000000", fundo: "#ffffff", editando: "primeiroPlano" });
  const [forma, setForma] = useState<OpcoesDaForma>({ tracoCor: "#000000", traco: 0, arredondado: false, personalizada: "seta" });
  const [zoom, setZoom] = useState<number | null>(null);
  const [zoomMedido, setZoomMedido] = useState(1);
  const [removerAoSoltar, setRemoverAoSoltar] = useState(true);
  const [pedindo, setPedindo] = useState(false);
  const [pedidoDeAba, setPedidoDeAba] = useState<{ aba: IdAba; vez: number } | undefined>(undefined);

  const [selecao, definirSelecao] = useState<string[]>([]);
  const [exportando, setExportando] = useState(false);
  const [atalhos, setAtalhos] = useState(false);
  const [provisorio, setProvisorio] = useState<Comando | null>(null);
  // As mídias pedidas (formas, fotos da IA) entram como camada quando ficam prontas; a troca de uma foto também espera
  const pendentes = useRef(new Map<string, Pendente>());
  // O modelo escolhido espera as formas dele aparecerem na biblioteca, como as formas avulsas
  const modeloPendente = useRef<{ modelo: ModeloDeImagem; cores: string[]; midias: Record<string, Midia> } | null>(null);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [trocando, setTrocando] = useState<string | null>(null);
  const [recorte, setRecorte] = useState<{ retangulo: RetanguloDaImagem; proporcao: number | null } | null>(null);
  const modeloDoEndereco = useRef(false);

  const setSelecao = useCallback((ids: string[]) => {
    const ativo = document.activeElement;
    if (ativo instanceof HTMLElement && ativo.matches("input, textarea, select")) ativo.blur();
    definirSelecao(ids);
  }, []);
  const executar = useCallback(
    (comando: Comando) => {
      const resultado = executarNoProjeto(comando);
      if (resultado?.selecao) setSelecao(resultado.selecao);
      return resultado;
    },
    [executarNoProjeto, setSelecao],
  );
  const projetoNaTela = useMemo(() => {
    if (!projeto || !provisorio) return projeto;
    try {
      return executarComando(projeto, provisorio, ctx).projeto;
    } catch {
      return projeto;
    }
  }, [projeto, provisorio, ctx]);
  const preverDoPainel = (comando: Comando | null) => {
    if (comando !== null || !provisorio) {
      setProvisorio(comando);
      return;
    }
    setProvisorio(null);
    if (JSON.stringify(projetoNaTela) !== JSON.stringify(projeto)) executar(provisorio);
  };
  const abrirAba = (aba: IdAba) => {
    area.abrir("propriedades");
    setPedidoDeAba((atual) => ({ aba, vez: (atual?.vez ?? 0) + 1 }));
  };

  /** Pede as formas do modelo (e o lugar das fotos); o modelo entra quando todas aparecem na biblioteca. */
  const aplicarModelo = (modelo: ModeloDeImagem) => {
    setAplicando(modelo.id);
    const coresDaMarca = marca.cores;
    Promise.all(pedidosDoModelo(modelo, coresDaMarca, new Set()).map(({ chave, forma: pedido }) => criarForma(pedido).then((midia) => [chave, midia] as const)))
      .then((lista) => {
        modeloPendente.current = { modelo, cores: coresDaMarca, midias: Object.fromEntries(lista) };
        void biblioteca.recarregar();
      })
      .catch((e: unknown) => {
        mostrarAviso(e instanceof Error ? e.message : "Não foi possível aplicar o modelo agora.");
        setAplicando(null);
      });
  };
  const esperarMidia = (midia: Midia, pendente: Pendente = {}) => {
    pendentes.current.set(midia.id, pendente);
    void biblioteca.recarregar();
  };

  const resolverPendentes = useEffectEvent(() => {
    const pendente = modeloPendente.current;
    if (pendente && Object.values(pendente.midias).every((midia) => midias.get(midia.id)?.status === "pronta")) {
      modeloPendente.current = null;
      setAplicando(null);
      const doModelo: MidiasDoModelo = {};
      for (const [chave, midia] of Object.entries(pendente.midias)) doModelo[chave] = { id: midia.id, largura: midia.video?.largura ?? 1, altura: midia.video?.altura ?? 1 };
      executar({
        comando: "imagem.aplicarModelo",
        parametros: { camadas: camadasDoModelo(pendente.modelo, pendente.cores, doModelo), tamanho: pendente.modelo.tamanho, fundo: fundoDoModelo(pendente.modelo, pendente.cores) },
      });
    }
    for (const [id, acao] of pendentes.current) {
      const midia = midias.get(id);
      if (!midia || midia.status === "processando" || midia.status === "enviando") continue;
      pendentes.current.delete(id);
      if (midia.status === "erro") mostrarAviso(`"${midia.nome}" não ficou pronta: ${midia.erro ?? "erro desconhecido"}`);
      else if (acao.camadaDe) executar({ comando: "imagem.camadaComOutraMidia", parametros: { faixaId: acao.camadaDe, midiaId: id } });
      else if (acao.trocar) executar({ comando: "clipe.trocarMidia", parametros: { clipeIds: acao.trocar, midiaId: id } });
      else executar({ comando: "imagem.adicionarMidia", parametros: { midiaId: id, transformacao: acao.caixa && projeto ? transformacaoDaCaixa(acao.caixa, midia, tamanhoDaImagem(projeto)) : undefined } });
    }
  });
  useEffect(() => {
    if (pendentes.current.size || modeloPendente.current) resolverPendentes();
  }, [midias]);

  // O modelo escolhido na biblioteca (?modelo=): entra uma vez, na imagem ainda vazia, e sai do endereço
  const aplicarDoEndereco = useEffectEvent(() => {
    if (modeloDoEndereco.current || !projeto || !modeloInicial) return;
    modeloDoEndereco.current = true;
    router.replace(`/app/imagem/${projetoId}`);
    const modelo = modeloDeImagem(modeloInicial);
    // Depois do efeito: aplicar muda o estado (o modelo sendo aplicado)
    if (modelo && camadasDaImagem(projeto).length === 0) void Promise.resolve().then(() => aplicarModelo(modelo));
  });
  useEffect(() => {
    if (projeto) aplicarDoEndereco();
  }, [projeto]);

  const selecaoValida = projeto ? selecao.filter((id) => acharClipe(projeto, id)) : [];
  const selecionado = projetoNaTela && selecaoValida.length === 1 ? acharClipe(projetoNaTela, selecaoValida[0]) : null;
  const midiaDoClipe = selecionado?.clipe.midia_id ? (midias.get(selecionado.clipe.midia_id) ?? null) : null;
  const foto = midiaDoClipe?.imagem && !midiaDoClipe.elemento && !midiaDoClipe.animacao ? midiaDoClipe : null;
  const objeto = useObjeto(selecionado?.clipe ?? null, midiaDoClipe);
  const temSelecao = Boolean(objeto.selecao) || objeto.temPincel;
  const camadaEscolhida = projeto && selecionado ? camadasDaImagem(projeto).find(({ clipe }) => clipe.id === selecionado.clipe.id) : undefined;

  const escolherFerramenta = (id: IdFerramentaDaImagem) => {
    setFerramenta(id);
    const indice = GRUPOS_DE_FERRAMENTAS.findIndex((grupo) => grupo.some((item) => item.id === id));
    setUltimas((atual) => ({ ...atual, [indice]: id }));
    const modo = MODO_DA_SELECAO[id];
    if (modo) objeto.setModo(modo);
    if (id === "corte" && projeto) {
      const { largura, altura } = tamanhoDaImagem(projeto);
      setRecorte({ retangulo: { x: 0, y: 0, largura, altura }, proporcao: null });
    } else setRecorte(null);
  };

  const confirmarCorte = () => {
    if (!recorte) return;
    // O tamanho de cada mídia usada, para as camadas ficarem do mesmo tamanho em pixels
    const tamanhos: Record<string, { largura: number; altura: number }> = {};
    for (const midia of midias.values()) if (midia.video) tamanhos[midia.id] = { largura: midia.video.largura, altura: midia.video.altura };
    const r = recorte.retangulo;
    const retangulo = { x: Math.round(r.x), y: Math.round(r.y), largura: Math.round(r.largura), altura: Math.round(r.altura) };
    if (executar({ comando: "imagem.recortar", parametros: { retangulo, tamanhos } })) {
      setRecorte(null);
      setFerramenta("mover");
    }
  };
  const cancelarCorte = () => {
    setRecorte(null);
    setFerramenta("mover");
  };

  /** Apagar (a IA refaz o fundo e a foto da camada troca) ou recortar (vira uma camada nova) a seleção da foto. */
  async function usarSelecao(acao: "apagar" | "recortar") {
    if (!selecionado || pedindo) return;
    setPedindo(true);
    const midia = await objeto.pedir(acao);
    setPedindo(false);
    if (!midia) return;
    esperarMidia(midia, acao === "apagar" ? { trocar: [selecionado.clipe.id] } : { camadaDe: selecionado.faixa.id });
    objeto.limpar();
    mostrarAviso(acao === "apagar" ? "Removendo: a foto troca quando ficar pronta." : "Recortando: o objeto entra numa camada nova quando ficar pronto.");
  }
  // O "Remover após cada traço" roda depois que o traço entra no estado do pincel
  const usarSelecaoRef = useRef(usarSelecao);
  useEffect(() => {
    usarSelecaoRef.current = usarSelecao;
  });

  const criarAjuste = (ajuste: Ajuste) => {
    const resultado = executar({ comando: "imagem.adicionarAjuste", parametros: {} });
    const id = resultado?.selecao?.[0];
    if (id && ajuste.cor) executar({ comando: "clipe.cor", parametros: { clipeIds: [id], cor: ajuste.cor } });
    if (resultado) abrirAba("cor");
  };
  const porTexto = (texto?: Texto, onde?: { x: number; y: number }) => {
    const base = texto ?? { ...TEXTO_PADRAO, cor: cores.primeiroPlano };
    const resultado = executar({ comando: "imagem.adicionarTexto", parametros: { texto: base, transformacao: onde } });
    if (resultado) abrirAba("texto");
  };
  const desenharForma = (caixa: RetanguloDaImagem) => {
    const tipo = ferramenta === "formaPersonalizada" ? forma.personalizada : ferramenta === "retangulo" && forma.arredondado ? "arredondado" : FORMA_DA_FERRAMENTA[ferramenta];
    if (!tipo) return;
    // A linha é fina: a proporção é a do arrasto (com um mínimo, para a imagem não sumir)
    const proporcao = Math.min(20, Math.max(0.05, caixa.largura / Math.max(1, caixa.altura)));
    criarForma({ tipo, cor: cores.primeiroPlano, contorno_cor: forma.tracoCor, contorno: forma.traco, proporcao })
      .then((midia) => esperarMidia(midia, { caixa }))
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível desenhar a forma agora."));
  };
  const aplicarFiltro = (efeito: TipoEfeito) => {
    if (!selecionado) return;
    if (executar({ comando: "clipe.efeito", parametros: { clipeIds: [selecionado.clipe.id], efeito: { tipo: efeito, intensidade: INTENSIDADE_PADRAO } } })) area.abrir("filtros");
  };
  const mudarZoom = (para: "mais" | "menos" | "ajustar" | 1) => setZoom(para === "ajustar" ? null : para === 1 ? 1 : proximoZoom(zoom ?? zoomMedido, para === "mais" ? 1 : -1));
  const ordenar = (para: "topo" | "cima" | "baixo" | "fundo") => camadaEscolhida && executar({ comando: "imagem.mover", parametros: { faixaId: camadaEscolhida.faixa.id, para } });

  const acoes: AcoesDosMenus = {
    temCamada: Boolean(camadaEscolhida),
    temFoto: Boolean(foto),
    temSelecao,
    podeDesfazer: edicao.nomeDesfazer,
    podeRefazer: edicao.nomeRefazer,
    area: area.area,
    painelAberto: (painel) => area.aberto(painel),
    novo: () => router.push("/app/ferramentas/editor-de-imagem"),
    abrir: () => router.push("/app/ferramentas/editor-de-imagem"),
    exportar: () => setExportando(true),
    salvar: () => mostrarAviso(edicao.salvamento === "salvo" ? "Tudo salvo: o TakeOne salva a cada mudança." : "Salvando: o TakeOne salva a cada mudança."),
    desfazer,
    refazer,
    ferramenta: escolherFerramenta,
    ajuste: criarAjuste,
    documento: () => {
      setSelecao([]);
      area.abrir("propriedades");
    },
    painel: (painel) => area.abrir(painel),
    alternarPainel: (painel) => area.alternar(painel),
    duplicar: () => camadaEscolhida && executar({ comando: "imagem.duplicar", parametros: { faixaId: camadaEscolhida.faixa.id } }),
    excluir: () => camadaEscolhida && executar({ comando: "imagem.apagar", parametros: { faixaId: camadaEscolhida.faixa.id } }),
    ordenar,
    esconder: () => camadaEscolhida && executar({ comando: "faixa.alternar", parametros: { faixaId: camadaEscolhida.faixa.id, propriedade: "oculta" } }),
    bloquear: () => camadaEscolhida && executar({ comando: "faixa.alternar", parametros: { faixaId: camadaEscolhida.faixa.id, propriedade: "travada" } }),
    estilo: (qual) => {
      if (!camadaEscolhida) return;
      const clipe = camadaEscolhida.clipe;
      const parametros = qual === "contorno" ? { clipeIds: [clipe.id], contorno: clipe.contorno ?? CONTORNO_PADRAO } : { clipeIds: [clipe.id], sombra: clipe.sombra ?? SOMBRA_PADRAO };
      if (executar({ comando: "clipe.silhueta", parametros })) abrirAba("basico");
    },
    mascara: () => {
      if (camadaEscolhida && executar({ comando: "clipe.mascara", parametros: { clipeIds: [camadaEscolhida.clipe.id], mascara: camadaEscolhida.clipe.mascara ?? MASCARA_PADRAO } })) abrirAba("basico");
    },
    viaRecorte: () => void usarSelecao("recortar"),
    preencher: () => void usarSelecao("apagar"),
    desmarcar: () => objeto.limpar(),
    todasAsCamadas: () => projeto && setSelecao(camadasDaImagem(projeto).map(({ clipe }) => clipe.id)),
    desmarcarCamadas: () => setSelecao([]),
    texto: (texto) => porTexto(texto),
    filtro: aplicarFiltro,
    zoom: mudarZoom,
    area_: area.escolherArea,
    restaurarArea: area.restaurar,
    atalhos: () => setAtalhos(true),
  };
  const janelaAberta = exportando || atalhos || trocando !== null;

  // As teclas sem Ctrl: as ferramentas, as cores, as setas e o Enter e o Esc do corte e da seleção
  const teclas = useEffectEvent((evento: KeyboardEvent) => {
    if (!projeto || janelaAberta) return;
    const alvo = evento.target as HTMLElement;
    if (alvo.closest("input, textarea, select, [contenteditable='true'], [role='menu']")) return;
    if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
    const tecla = evento.key.length === 1 ? evento.key.toUpperCase() : evento.key;
    const comTecla = TODAS_AS_FERRAMENTAS.filter((item) => item.tecla === tecla);
    if (comTecla.length) {
      // Shift + a tecla passa à seguinte do grupo; sem Shift, volta à última usada do grupo
      const atualNoGrupo = comTecla.some((item) => item.id === ferramenta);
      const grupo = grupoDa(comTecla[0].id);
      const indice = GRUPOS_DE_FERRAMENTAS.indexOf(grupo);
      let id = ultimas[indice] ?? comTecla[0].id;
      if (evento.shiftKey && atualNoGrupo) id = grupo[(grupo.findIndex((item) => item.id === ferramenta) + 1) % grupo.length].id;
      escolherFerramenta(id);
    } else if (tecla === "D") setCores((atual) => ({ ...atual, primeiroPlano: "#000000", fundo: "#ffffff" }));
    else if (tecla === "X") setCores((atual) => ({ ...atual, primeiroPlano: atual.fundo, fundo: atual.primeiroPlano }));
    else if ((tecla === "[" || tecla === "]") && ferramenta === "remover") objeto.setTamanhoDoPincel(Math.min(0.2, Math.max(0.01, objeto.tamanhoDoPincel * (tecla === "]" ? 1.25 : 0.8))));
    else if (tecla === "Enter" && recorte) confirmarCorte();
    else if (tecla === "Escape") {
      if (recorte) cancelarCorte();
      else if (temSelecao || objeto.pontos.length) objeto.limpar();
      else setSelecao([]);
    } else if ((tecla === "Delete" || tecla === "Backspace") && camadaEscolhida && !camadaEscolhida.faixa.travada) executar({ comando: "imagem.apagar", parametros: { faixaId: camadaEscolhida.faixa.id } });
    else if (camadaEscolhida && !camadaEscolhida.faixa.travada && evento.key.startsWith("Arrow")) {
      // Um pixel da imagem por toque (dez com Shift), em frações do quadro
      const { largura, altura } = tamanhoDaImagem(projeto);
      const passo = evento.shiftKey ? 10 : 1;
      const t = camadaEscolhida.clipe.transformacao;
      const mudanca: Partial<Transformacao> =
        evento.key === "ArrowLeft" ? { x: t.x - passo / largura } : evento.key === "ArrowRight" ? { x: t.x + passo / largura } : evento.key === "ArrowUp" ? { y: t.y - passo / altura } : { y: t.y + passo / altura };
      executar({ comando: "clipe.transformar", parametros: { clipeIds: [camadaEscolhida.clipe.id], transformacao: mudanca } });
    } else return;
    evento.preventDefault();
  });
  useEffect(() => {
    const ouvir = (evento: KeyboardEvent) => teclas(evento);
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, []);

  if (edicao.erroCarga) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-fundo p-6 text-center">
        <p className="text-sm">{edicao.erroCarga}</p>
        <Link href="/app" className="botao-secundario px-3 py-1.5">
          Voltar ao início
        </Link>
      </div>
    );
  }
  if (!projeto || !projetoNaTela) {
    return (
      <div className="flex h-dvh items-center justify-center gap-2 bg-fundo text-sm text-suave">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Abrindo a imagem…
      </div>
    );
  }
  if (projeto.tipo !== "imagem") return <Redirecionar para={enderecoDoProjeto({ id: projetoId, tipo: projeto.tipo })} />;

  const imagensProntas = (biblioteca.midias ?? []).filter((midia) => midia.imagem && !midia.elemento && !midia.animacao);
  const tamanho = tamanhoDaImagem(projetoNaTela);
  const zoomNaTela = zoom ?? zoomMedido;

  const paineis: Record<IdPainelDaImagem, Painel> = {
    cor: { nome: PAINEIS_DA_IMAGEM.cor, conteudo: <PainelCor cores={cores} aoMudar={(qual, cor) => setCores((atual) => ({ ...atual, [qual]: cor }))} aoEscolherEditada={(qual) => setCores((atual) => ({ ...atual, editando: qual }))} /> },
    amostras: { nome: PAINEIS_DA_IMAGEM.amostras, conteudo: <PainelAmostras aoEscolher={(cor, paraOFundo) => setCores((atual) => ({ ...atual, [paraOFundo ? "fundo" : "primeiroPlano"]: cor }))} /> },
    formas: {
      nome: PAINEIS_DA_IMAGEM.formas,
      conteudo: (
        <div className="p-3">
          <PainelFormas aoPedir={(midia) => esperarMidia(midia)} aoAvisar={mostrarAviso} />
        </div>
      ),
    },
    propriedades: {
      nome: PAINEIS_DA_IMAGEM.propriedades,
      conteudo: (
        <PainelPropriedades
          modo="imagem"
          midia={midiaDoClipe}
          selecionado={selecionado}
          taxa={projeto.taxa}
          tempo={0}
          aoBuscar={NADA}
          proporcao={projeto.proporcao}
          faixas={projeto.faixas}
          aoAvisar={mostrarAviso}
          aoTrocarMidia={(clipeIds, midia) => esperarMidia(midia, { trocar: clipeIds })}
          seguirObjeto={SEM_SEGUIR}
          aoTrocarImagem={setTrocando}
          fundo={projeto.fundo.cor}
          aoPrever={preverDoPainel}
          aoExecutar={executar}
          pedidoDeAba={pedidoDeAba}
          semSelecao={<PropriedadesDoDocumento projeto={projetoNaTela} aoPrever={preverDoPainel} aoExecutar={executar} />}
          className="h-full"
        />
      ),
    },
    ajustes: { nome: PAINEIS_DA_IMAGEM.ajustes, conteudo: <PainelAjustes aoCriar={criarAjuste} /> },
    biblioteca: {
      nome: PAINEIS_DA_IMAGEM.biblioteca,
      conteudo: (
        <PainelBiblioteca
          imagens={imagensProntas}
          erro={biblioteca.erro}
          quadro={tamanho}
          aoPorImagem={(midia) => executar({ comando: "imagem.adicionarMidia", parametros: { midiaId: midia.id } })}
          aoGerada={(midia) => {
            esperarMidia(midia);
            mostrarAviso("Gerando a imagem: ela entra como camada quando ficar pronta (uns 3 min).");
          }}
        />
      ),
    },
    modelos: { nome: PAINEIS_DA_IMAGEM.modelos, conteudo: <PainelModelosDaImagem aplicando={aplicando} aoAplicar={aplicarModelo} /> },
    estilos: {
      nome: PAINEIS_DA_IMAGEM.estilos,
      conteudo: (
        <div className="grid grid-cols-2 gap-1.5 p-3">
          {ESTILOS_DE_TEXTO.map((estilo) => (
            <button key={estilo.id} type="button" onClick={() => porTexto(estilo.texto)} className="flex h-16 items-center justify-center rounded border border-borda bg-painel-3 p-1 transition hover:border-destaque" title={estilo.nome}>
              <MiniaturaDoEstilo texto={estilo.texto} nome={estilo.nome} />
            </button>
          ))}
        </div>
      ),
    },
    filtros: {
      nome: PAINEIS_DA_IMAGEM.filtros,
      conteudo: (
        <div className="p-3">
          <PainelEfeitos selecionado={selecionado} aoPrever={preverDoPainel} aoExecutar={executar} />
        </div>
      ),
    },
    fotoIA: {
      nome: PAINEIS_DA_IMAGEM.fotoIA,
      conteudo: (
        <div className="p-3">
          <PainelFotoIA
            foto={foto}
            quadro={tamanho}
            aoPedir={(acao, midia) => {
              if (!selecionado) return;
              // Ampliada: a foto da camada é trocada; expandida: entra uma camada nova com tudo da camada
              esperarMidia(midia, acao === "ampliar" ? { trocar: [selecionado.clipe.id] } : { camadaDe: selecionado.faixa.id });
              mostrarAviso(acao === "ampliar" ? "Ampliando a foto: ela troca quando ficar pronta." : "Expandindo a foto: ela entra numa camada nova quando ficar pronta.");
            }}
          />
        </div>
      ),
    },
    camadas: {
      nome: PAINEIS_DA_IMAGEM.camadas,
      conteudo: <PainelCamadas projeto={projetoNaTela} midias={midias} selecao={selecaoValida} aoSelecionar={setSelecao} aoExecutar={executar} aoCriarAjuste={criarAjuste} aoAbrirPropriedades={() => abrirAba("basico")} />,
    },
    historico: { nome: PAINEIS_DA_IMAGEM.historico, conteudo: <PainelHistorico nome={edicao.nome} feitos={edicao.passos.feitos} desfeitos={edicao.passos.desfeitos} aoIr={edicao.irParaPasso} /> },
  };

  const salvamento =
    edicao.salvamento === "salvo"
      ? "Salvo"
      : edicao.salvamento === "conflito"
        ? "Alterado em outra aba"
        : edicao.salvamento === "erro"
          ? "Não foi possível salvar"
          : edicao.salvamento === "sem-conexao"
            ? "Sem conexão"
            : "Salvando…";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-fundo text-texto">
      <header className="flex h-8 shrink-0 items-center gap-1 border-b border-borda bg-painel px-1.5">
        <Link href="/app" className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-suave transition hover:text-texto" title="Voltar ao início">
          <ChevronLeft className="size-3.5" aria-hidden />
          <Simbolo tamanho={18} />
        </Link>
        <MenusDaImagem acoes={acoes} ativo={!janelaAberta} />
        <span className="ml-auto hidden items-center gap-1 text-[11px] text-suave sm:flex" role="status">
          {edicao.salvamento === "salvo" ? <Check className="size-3" aria-hidden /> : <LoaderCircle className="size-3 animate-spin" aria-hidden />}
          {salvamento}
        </span>
        <select
          aria-label="Área de trabalho"
          title="Área de trabalho"
          value={area.area}
          onChange={(evento) => area.escolherArea(evento.currentTarget.value)}
          className="ml-2 rounded border border-borda bg-painel-2 px-1 py-0.5 text-[11px] max-md:hidden"
        >
          {Object.entries(AREAS_DA_IMAGEM).map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
        <BotaoTema />
        <button type="button" className="botao-principal shrink-0 px-2.5 py-0.5 text-xs" onClick={() => setExportando(true)} title="Exportar como PNG, JPG ou WebP (Ctrl+Alt+Shift+W)">
          <Download className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Exportar</span>
        </button>
      </header>

      <BarraDeOpcoes
        ferramenta={ferramenta}
        clipe={selecionado?.clipe ?? null}
        aoExecutar={executar}
        objeto={objeto}
        aoUsarSelecao={(acao) => void usarSelecao(acao)}
        pedindo={pedindo}
        removerAoSoltar={removerAoSoltar}
        aoMudarRemoverAoSoltar={setRemoverAoSoltar}
        corte={recorte ? { proporcao: recorte.proporcao, largura: recorte.retangulo.largura, altura: recorte.retangulo.altura } : null}
        aoMudarProporcao={(proporcao) => {
          if (!recorte) return;
          const inteiro = { x: 0, y: 0, ...tamanho };
          setRecorte({ proporcao, retangulo: proporcao ? encaixarProporcao(inteiro, proporcao) : recorte.retangulo });
        }}
        aoConfirmarCorte={confirmarCorte}
        aoCancelarCorte={cancelarCorte}
        forma={forma}
        aoMudarForma={(mudanca) => setForma((atual) => ({ ...atual, ...mudanca }))}
        primeiroPlano={cores.primeiroPlano}
        aoZoom={setZoom}
        aoAlinhar={(eixo) => camadaEscolhida && executar({ comando: "clipe.transformar", parametros: { clipeIds: [camadaEscolhida.clipe.id], transformacao: { [eixo]: 0 } } })}
      />

      <div className="flex min-h-0 flex-1 max-md:flex-wrap max-md:content-start max-md:overflow-y-auto">
        <CaixaDeFerramentas
          ativa={ferramenta}
          aoEscolher={escolherFerramenta}
          ultimas={ultimas}
          primeiroPlano={cores.primeiroPlano}
          fundo={cores.fundo}
          aoEditarCor={(qual) => {
            setCores((atual) => ({ ...atual, editando: qual }));
            area.abrir("cor");
          }}
          aoTrocarCores={() => setCores((atual) => ({ ...atual, primeiroPlano: atual.fundo, fundo: atual.primeiroPlano }))}
          aoCoresPadrao={() => setCores((atual) => ({ ...atual, primeiroPlano: "#000000", fundo: "#ffffff" }))}
          aoDuploClique={(id) => setZoom(id === "zoom" ? 1 : null)}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col max-md:h-[62vh]">
          <div role="tablist" aria-label="Documentos" className="flex h-7 shrink-0 items-end border-b border-borda bg-painel-2">
            <div role="tab" aria-selected className="flex h-full max-w-full items-center gap-1 border-r border-borda bg-fundo px-2 text-[11px]">
              <input
                id="nome-projeto"
                value={edicao.nome}
                onChange={(evento) => edicao.renomear(evento.currentTarget.value)}
                aria-label="Nome da imagem"
                maxLength={120}
                size={Math.max(6, Math.min(40, edicao.nome.length + 1))}
                className="min-w-0 bg-transparent font-medium outline-none focus:bg-painel-2"
              />
              <span className="shrink-0 truncate text-suave">
                @ {porcentagem(zoomNaTela)} ({selecionado ? nomeDaCamada(selecionado.clipe, midias) : "Fundo"}, RGB/8)
              </span>
            </div>
          </div>
          <PreviaDaImagem
            projeto={projetoNaTela}
            midias={midias}
            selecao={selecaoValida}
            aoSelecionar={setSelecao}
            aoPrever={(clipeId, mudanca) => setProvisorio(mudanca ? { comando: "clipe.transformar", parametros: { clipeIds: [clipeId], transformacao: mudanca } } : null)}
            aoTransformar={(clipeId, mudanca) => executar({ comando: "clipe.transformar", parametros: { clipeIds: [clipeId], transformacao: mudanca } })}
            ferramenta={ferramenta}
            zoom={zoom}
            aoMudarZoom={setZoom}
            aoMedirZoom={setZoomMedido}
            recorte={recorte ? { ...recorte, aoMudar: (retangulo) => setRecorte({ ...recorte, retangulo }) } : null}
            objeto={MODO_DA_SELECAO[ferramenta] && objeto.foto && selecionado ? { clipeId: selecionado.clipe.id, ferramenta: objeto } : null}
            aoTerminarTraco={ferramenta === "remover" && removerAoSoltar ? () => window.setTimeout(() => void usarSelecaoRef.current("apagar"), 0) : undefined}
            aoClicarTexto={(x, y) => porTexto(undefined, { x: x / tamanho.largura - 0.5, y: y / tamanho.altura - 0.5 })}
            aoDesenharForma={desenharForma}
            aoPegarCor={(cor, paraOFundo) => setCores((atual) => ({ ...atual, [paraOFundo ? "fundo" : "primeiroPlano"]: cor }))}
          />
          <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-borda bg-painel px-2 text-[11px] text-suave">
            <span className="tabular-nums">{porcentagem(zoomNaTela)}</span>
            <span className="tabular-nums">
              {tamanho.largura} px × {tamanho.altura} px (72 ppp)
            </span>
            <span className="min-w-0 truncate max-md:hidden">{dadosDa(ferramenta).dica}</span>
          </footer>
        </main>

        <ColunaDePaineis grupos={area.estado.direita ?? []} paineis={paineis} area={area} className="shrink-0 border-l border-borda bg-painel max-md:h-[70vh] max-md:w-full max-md:border-l-0 max-md:border-t md:w-80" />
      </div>

      {trocando ? (
        <JanelaEscolherImagem
          imagens={imagensProntas}
          aoFechar={() => setTrocando(null)}
          aoEscolher={(nova) => {
            const clipe = acharClipe(projeto, trocando)?.clipe;
            const atual = clipe?.midia_id ? midias.get(clipe.midia_id) : undefined;
            setTrocando(null);
            if (!clipe || !atual?.video || !nova.video) return;
            executar({
              comando: "imagem.trocarImagem",
              parametros: {
                clipeId: clipe.id,
                midiaId: nova.id,
                tamanhoAtual: { largura: atual.video.largura, altura: atual.video.altura },
                tamanhoNovo: { largura: nova.video.largura, altura: nova.video.altura },
              },
            });
          }}
        />
      ) : null}
      {exportando ? <JanelaExportarImagem projeto={projeto} nome={edicao.nome} midias={midias} aoFechar={() => setExportando(false)} aoAvisar={mostrarAviso} /> : null}
      {atalhos ? <JanelaDeAtalhos acoes={acoes} aoFechar={() => setAtalhos(false)} /> : null}
      {edicao.aviso ? (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-8 z-50 flex justify-center px-4">
          <p className="rounded-lg border border-borda bg-painel-3 px-4 py-2 text-sm shadow-xl shadow-black/40">{edicao.aviso}</p>
        </div>
      ) : null}
    </div>
  );
}

/** A barra de menus e os atalhos dela (os menus são montados aqui, com o estado da vez). */
function MenusDaImagem({ acoes, ativo }: { acoes: AcoesDosMenus; ativo: boolean }) {
  const menus = menusDaImagem(acoes);
  useAtalhosDosMenus(menus, ativo);
  return (
    <>
      <BarraDeMenus menus={menus} className="min-w-0 max-md:hidden" />
      {/* No celular, os menus num só, como submenus */}
      <BarraDeMenus menus={[{ nome: "Menu", itens: menus.map((menu) => ({ nome: menu.nome, itens: menu.itens })) }]} className="md:hidden" />
    </>
  );
}

/** A camada da forma desenhada: o centro no meio da caixa e a escala que dá à imagem a largura da caixa. */
function transformacaoDaCaixa(caixa: RetanguloDaImagem, midia: Midia, quadro: { largura: number; altura: number }): Partial<Transformacao> {
  const largura = midia.video?.largura ?? 1;
  const altura = midia.video?.altura ?? 1;
  // Escala 1 é a imagem inteira cabendo no quadro
  const cabe = Math.min(quadro.largura / largura, quadro.altura / altura);
  return {
    x: (caixa.x + caixa.largura / 2) / quadro.largura - 0.5,
    y: (caixa.y + caixa.altura / 2) / quadro.altura - 0.5,
    escala: Math.max(caixa.largura / (largura * cabe), caixa.altura / (altura * cabe)),
  };
}

/** O maior retângulo na proporção, no meio do atual (ou da imagem). */
function encaixarProporcao(r: RetanguloDaImagem, proporcao: number): RetanguloDaImagem {
  const largura = Math.min(r.largura, r.altura * proporcao);
  const altura = largura / proporcao;
  return { x: r.x + (r.largura - largura) / 2, y: r.y + (r.altura - altura) / 2, largura, altura };
}

/** Ajuda > Atalhos do teclado: as ferramentas e os atalhos dos menus. */
function JanelaDeAtalhos({ acoes, aoFechar }: { acoes: AcoesDosMenus; aoFechar: () => void }) {
  const menus = menusDaImagem(acoes);
  type Linha = { nome: string; atalho: string };
  const doMenu = (itens: ReturnType<typeof menusDaImagem>[number]["itens"]): Linha[] =>
    itens.flatMap((item) => (item === "-" ? [] : "itens" in item ? doMenu(item.itens) : item.atalho ? [{ nome: item.nome.replace(/…$/, ""), atalho: item.atalho }] : []));
  useEffect(() => {
    const esc = (evento: KeyboardEvent) => evento.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <div role="dialog" aria-modal aria-label="Atalhos do teclado" className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-borda bg-painel shadow-2xl" onClick={(evento) => evento.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
          <h2 className="text-sm font-semibold">Atalhos do teclado</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="grid min-h-0 gap-6 overflow-y-auto p-4 text-xs sm:grid-cols-2">
          <section>
            <h3 className="mb-2 font-semibold">Ferramentas</h3>
            <dl>
              {TODAS_AS_FERRAMENTAS.map((item) => (
                <div key={item.id} className="flex justify-between gap-3 border-b border-borda/50 py-1">
                  <dt>{item.nome}</dt>
                  <dd className="font-mono text-suave">{item.tecla}</dd>
                </div>
              ))}
              {[
                ["Mão temporária", "Espaço"],
                ["Cores padrão", "D"],
                ["Trocar as cores", "X"],
                ["Pincel menor / maior (Remover)", "[ / ]"],
                ["Empurrar a camada 1 px (10 com Shift)", "Setas"],
                ["Excluir a camada", "Delete"],
              ].map(([nome, atalho]) => (
                <div key={nome} className="flex justify-between gap-3 border-b border-borda/50 py-1">
                  <dt>{nome}</dt>
                  <dd className="font-mono text-suave">{atalho}</dd>
                </div>
              ))}
            </dl>
          </section>
          {menus.map((menu) => {
            const linhas = doMenu(menu.itens);
            return linhas.length ? (
              <section key={menu.nome}>
                <h3 className="mb-2 font-semibold">{menu.nome}</h3>
                <dl>
                  {linhas.map((linha) => (
                    <div key={linha.nome} className="flex justify-between gap-3 border-b border-borda/50 py-1">
                      <dt>{linha.nome}</dt>
                      <dd className="font-mono text-suave">{linha.atalho}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
}
