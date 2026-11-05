"use client";

import {
  ArrowLeft,
  Brush,
  Check,
  CircleAlert,
  Download,
  Eye,
  Heart,
  Columns2,
  FolderUp,
  HardDrive,
  ImageUp,
  LoaderCircle,
  Palette,
  ScanSearch,
  SlidersHorizontal,
  Search,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CLASSE_DA_CATEGORIA, CLASSE_DA_COR, dataDaFoto, Estrelas, IconeDaCategoria } from "@/componentes/album/comum";
import { Comparacao } from "@/componentes/album/Comparacao";
import { FiltroDePessoas } from "@/componentes/album/FiltroDePessoas";
import { JanelaDeEstilos } from "@/componentes/album/JanelaDeEstilos";
import { JanelaEscolher } from "@/componentes/album/JanelaEscolher";
import { JanelaExportarAlbum } from "@/componentes/album/JanelaExportarAlbum";
import { JanelaGaleria } from "@/componentes/album/JanelaGaleria";
import { Lupa } from "@/componentes/album/Lupa";
import { PainelDeEdicao } from "@/componentes/album/PainelDeEdicao";
import { PainelDeRetoque } from "@/componentes/album/PainelDeRetoque";
import { PainelEstiloPessoal } from "@/componentes/album/PainelEstiloPessoal";
import { JanelaImportarPasta } from "@/componentes/album/JanelaImportarPasta";
import { AvisoErro } from "@/componentes/AvisoErro";
import { analisarAlbum, desligarMonitorar, editarFotos, escolherMelhores, fotosDoAlbum, nomearPessoa, pessoasDoAlbum, mudarAlbum, mudarFotos, pastaDoComputador, removerFotos, verAlbum } from "@/lib/album/api";
import type { OpcoesDaEscolha } from "@/lib/album/api";
import { arquivoDaFoto, type EdicaoDaFoto, edicaoParaEnviar, editandoAgora } from "@/lib/album/edicao";
import {
  type Album as TipoAlbum,
  aplicarMudanca,
  type Categoria,
  CATEGORIAS,
  COMPARAR_NO_MAXIMO,
  type PessoaDoAlbum,
  grupoDaFoto,
  contarCategorias,
  colunasDaGrade,
  contar,
  CORES,
  FILTRO_VAZIO,
  type Filtro,
  filtrarFotos,
  filtroAtivo,
  type FotoDoAlbum,
  GENEROS,
  type Genero,
  linhasVisiveis,
  type Mudanca,
  mudancaDaTecla,
  type Ordem,
  ORDENS,
  ordenarFotos,
  pastas as pastasDasFotos,
  exposicaoEmPalavras,
  posicaoDoFoco,
  resumoDaCamera,
  rostoPrincipal,
} from "@/lib/album/fotos";
import { arquivoDaMidia, ErroApi } from "@/lib/api";
import { ACEITAR_IMAGENS, useEnvios } from "@/lib/envios";
import { useEventosJobs } from "@/lib/eventos";
import type { Job } from "@/lib/tipos";
import { formatarBytes } from "@/lib/formatar";

const VAO = 6;
const TAMANHOS = { minimo: 96, maximo: 360, padrao: 176 };
const CHAVE_DA_VISTA = "takeone-album-vista";
// Muitas fotos chegando de uma vez: a lista é pedida de novo no máximo a cada 1,5 s
const ESPERA_DA_RECARGA_MS = 1500;

type Vista = { tamanho: number; ordem: Ordem };

/** O que o pincel de notas pode pintar. */
const PINCEIS: { chave: string; nome: string; mudanca: Mudanca }[] = [
  ...[5, 4, 3, 2, 1, 0].map((n) => ({ chave: `nota${n}`, nome: n ? `${n} estrela${n > 1 ? "s" : ""}` : "Sem estrelas", mudanca: { nota: n } })),
  { chave: "escolher", nome: "Escolher", mudanca: { marcacao: "escolhida" } },
  { chave: "rejeitar", nome: "Rejeitar", mudanca: { marcacao: "rejeitada" } },
  { chave: "sem_marcacao", nome: "Sem marcação", mudanca: { tirar_marcacao: true } },
  ...CORES.map((cor) => ({ chave: `cor_${cor.id}`, nome: `Cor ${cor.nome.toLowerCase()}`, mudanca: { cor: cor.id } as Mudanca })),
  { chave: "sem_cor", nome: "Sem cor", mudanca: { tirar_cor: true } },
];

function chaveDoPincel(mudanca: Mudanca): string {
  return PINCEIS.find((p) => JSON.stringify(p.mudanca) === JSON.stringify(mudanca))?.chave ?? "nota5";
}

function lerVista(): Vista {
  try {
    const salva = JSON.parse(window.localStorage.getItem(CHAVE_DA_VISTA) ?? "{}") as Partial<Vista>;
    const tamanho = Math.min(TAMANHOS.maximo, Math.max(TAMANHOS.minimo, Number(salva.tamanho) || TAMANHOS.padrao));
    const ordem = ORDENS.some((o) => o.id === salva.ordem) ? (salva.ordem as Ordem) : "captura";
    return { tamanho, ordem };
  } catch {
    return { tamanho: TAMANHOS.padrao, ordem: "captura" };
  }
}

/** Lê uma pasta arrastada (e as de dentro), com o caminho de cada foto a partir dela. */
async function arquivosArrastados(itens: DataTransferItemList): Promise<{ arquivos: File[]; caminhos: Map<File, string> }> {
  const arquivos: File[] = [];
  const caminhos = new Map<File, string>();
  const ler = (entrada: FileSystemEntry, prefixo: string): Promise<void> =>
    new Promise((pronto) => {
      if (entrada.isFile) {
        (entrada as FileSystemFileEntry).file(
          (arquivo) => {
            arquivos.push(arquivo);
            caminhos.set(arquivo, `${prefixo}${arquivo.name}`);
            pronto();
          },
          () => pronto(),
        );
        return;
      }
      const leitor = (entrada as FileSystemDirectoryEntry).createReader();
      const filhos: FileSystemEntry[] = [];
      // readEntries devolve no máximo 100 por vez: lê até vir vazio
      const proximo = () =>
        leitor.readEntries(
          (lote) => {
            if (!lote.length) {
              void Promise.all(filhos.map((filho) => ler(filho, `${prefixo}${entrada.name}/`))).then(() => pronto());
              return;
            }
            filhos.push(...lote);
            proximo();
          },
          () => pronto(),
        );
      proximo();
    });
  const entradas = Array.from(itens)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entrada): entrada is FileSystemEntry => Boolean(entrada));
  await Promise.all(entradas.map((entrada) => ler(entrada, "")));
  return { arquivos, caminhos };
}

const EXTENSOES_DE_FOTO = /\.(jpe?g|png|webp|gif|bmp|tiff?|avif|heic|heif|cr2|cr3|nef|nrw|arw|srf|sr2|raf|dng|orf|rw2|pef|srw)$/i;

// -----------------------------------------------
// Os dados do álbum: a lista, a recarga quando as fotos chegam e o andamento de cada uma
// -----------------------------------------------
export function useAlbum(albumId: string) {
  const [album, setAlbum] = useState<TipoAlbum | null>(null);
  const [fotos, setFotos] = useState<FotoDoAlbum[] | null>(null);
  const [pessoas, setPessoas] = useState<PessoaDoAlbum[]>([]);
  const [erro, setErro] = useState("");
  const [analise, setAnalise] = useState<{ progresso: number; mensagem: string } | null>(null);
  // O último job do estilo pessoal que terminou (o painel dele recarrega e avisa)
  const [eventoDoEstilo, setEventoDoEstilo] = useState<Job | null>(null);
  const espera = useRef<number | null>(null);
  const esperaDaAnalise = useRef<((deuCerto: boolean) => void) | null>(null);
  /** Uma promessa que se resolve quando a análise em andamento termina (true se deu certo). */
  const esperarAnalise = useCallback(() => new Promise<boolean>((pronto) => (esperaDaAnalise.current = pronto)), []);
  const pedido = useRef(0);

  const recarregar = useCallback(() => {
    const numero = ++pedido.current;
    return Promise.all([verAlbum(albumId), fotosDoAlbum(albumId), pessoasDoAlbum(albumId)])
      .then(([novo, lista, achadas]) => {
        if (numero !== pedido.current) return;
        setAlbum(novo);
        setFotos(lista);
        setPessoas(achadas);
        setErro("");
      })
      .catch((e) => {
        if (numero === pedido.current) setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar o álbum.");
      });
  }, [albumId]);

  /** Recarrega daqui a pouco, juntando os pedidos (uma pasta de fotos termina uma depois da outra). */
  const pedirRecarga = useCallback(() => {
    if (espera.current !== null) return;
    espera.current = window.setTimeout(() => {
      espera.current = null;
      void recarregar();
    }, ESPERA_DA_RECARGA_MS);
  }, [recarregar]);

  useEffect(() => {
    void recarregar();
    return () => {
      if (espera.current !== null) window.clearTimeout(espera.current);
    };
  }, [recarregar]);

  useEventosJobs((job) => {
    if (job.entrada.album_id !== albumId) return;
    // A análise das fotos: o andamento na barra de cima; no fim, as medidas chegam com a lista
    if (job.tipo === "medir_album") {
      if (job.status === "concluido" || job.status === "erro") {
        setAnalise(null);
        if (job.status === "erro") setErro(job.erro ?? "A análise das fotos falhou.");
        void recarregar();
        // Quem esperava a análise (a escolha das melhores) segue
        esperaDaAnalise.current?.(job.status === "concluido");
        esperaDaAnalise.current = null;
      } else {
        setAnalise({ progresso: job.progresso, mensagem: job.mensagem });
      }
      return;
    }
    // O estilo pessoal: ensinar e aplicar (aplicar já desenha as fotos)
    if (job.tipo === "ensinar_estilo" || job.tipo === "aplicar_estilo_pessoal") {
      if (job.status === "concluido" || job.status === "erro") {
        setEventoDoEstilo(job);
        pedirRecarga();
      }
      return;
    }
    // A edição desenhada pelo worker: a grade troca as imagens aos poucos
    if (job.tipo === "editar_album") {
      pedirRecarga();
      return;
    }
    // A pasta importada do computador: as fotos já estão no álbum quando o job termina
    if (job.tipo === "importar_pasta") {
      if (job.status === "concluido" || job.status === "erro") pedirRecarga();
      if (job.status === "erro") setErro(job.erro ?? "A pasta não pôde ser importada.");
      return;
    }
    if (job.tipo !== "ingestao") return;
    if (job.status === "concluido" || job.status === "erro") {
      pedirRecarga();
      return;
    }
    const midiaId = String(job.entrada.midia_id ?? "");
    setFotos((lista) => lista?.map((foto) => (foto.midia_id === midiaId ? { ...foto, status: "processando", progresso: job.progresso } : foto)) ?? lista);
  });

  // Cada foto que começa a subir já está no álbum (enviando): a grade mostra o lugar dela
  const { envios } = useEnvios();
  const criados = envios.filter((envio) => envio.album === albumId && envio.midiaId).length;
  useEffect(() => {
    if (criados) pedirRecarga();
  }, [criados, pedirRecarga]);

  return { album, setAlbum, fotos, setFotos, pessoas, setPessoas, erro, setErro, recarregar, analise, setAnalise, esperarAnalise, eventoDoEstilo };
}

// -----------------------------------------------
// A tela
// -----------------------------------------------
export function Album({ albumId }: { albumId: string }) {
  const { album, setAlbum, fotos, setFotos, pessoas, setPessoas, erro, setErro, recarregar, analise, setAnalise, esperarAnalise, eventoDoEstilo } = useAlbum(albumId);
  // A comparação (as fotos lado a lado) e o pincel de notas (a mudança que o arrasto pinta nas fotos)
  const [comparando, setComparando] = useState<string[] | null>(null);
  const [pincel, setPincel] = useState<Mudanca | null>(null);
  const [estilando, setEstilando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [galeriaAberta, setGaleriaAberta] = useState(false);
  // O pincel do retoque na lupa da foto do cursor
  const [retocando, setRetocando] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [ocupado, setOcupado] = useState("");

  const { iniciar, envios } = useEnvios();
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_VAZIO);
  const [vista, setVista] = useState<Vista>({ tamanho: TAMANHOS.padrao, ordem: "captura" });
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [ancora, setAncora] = useState<string | null>(null);
  const [lupa, setLupa] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [importando, setImportando] = useState(false);
  // O servidor tem a pasta das fotos montada? Só então aparece "Do computador"
  const [noComputador, setNoComputador] = useState(false);
  useEffect(() => {
    pastaDoComputador("")
      .then((pasta) => setNoComputador(pasta.disponivel))
      .catch(() => setNoComputador(false));
  }, []);
  const entradaArquivos = useRef<HTMLInputElement>(null);
  const entradaPasta = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Só no navegador: o tamanho dos cartões e a ordem ficam guardados
    const salva = lerVista();
    const id = window.requestAnimationFrame(() => setVista(salva));
    return () => window.cancelAnimationFrame(id);
  }, []);
  const mudarVista = (campos: Partial<Vista>) => {
    const nova = { ...vista, ...campos };
    setVista(nova);
    try {
      window.localStorage.setItem(CHAVE_DA_VISTA, JSON.stringify(nova));
    } catch {
      // sem o armazenamento do navegador, a vista vale só nesta aba
    }
  };

  const visiveis = useMemo(() => ordenarFotos(filtrarFotos(fotos ?? [], filtro), vista.ordem), [fotos, filtro, vista.ordem]);
  const contagens = useMemo(() => contar(fotos ?? []), [fotos]);
  const listaDePastas = useMemo(() => pastasDasFotos(fotos ?? []), [fotos]);
  const porCategoria = useMemo(() => contarCategorias(fotos ?? []), [fotos]);
  const indiceDoCursor = cursor ? visiveis.findIndex((foto) => foto.midia_id === cursor) : -1;
  const fotoDoCursor = indiceDoCursor >= 0 ? visiveis[indiceDoCursor] : null;
  const semMedida = (fotos ?? []).filter((foto) => foto.status === "pronta" && !foto.medidas).length;

  const envioDoAlbum = envios.filter((envio) => envio.album === albumId);
  const faltam = envioDoAlbum.filter((envio) => envio.estado !== "erro");
  const comErro = envioDoAlbum.filter((envio) => envio.estado === "erro");
  const bytes = faltam.reduce((soma, envio) => [soma[0] + envio.enviado, soma[1] + envio.tamanho], [0, 0]);

  function enviar(arquivos: File[], caminhos?: Map<File, string>) {
    const fotosDaLeva = arquivos.filter((arquivo) => EXTENSOES_DE_FOTO.test(arquivo.name));
    const fora = arquivos.length - fotosDaLeva.length;
    setAviso(fora ? `${fora.toLocaleString("pt-BR")} arquivo(s) que não são fotos ficaram de fora.` : "");
    if (fotosDaLeva.length) iniciar(fotosDaLeva, { album: albumId, caminhos });
  }

  /** Analisa o que falta (se faltar) e escolhe as melhores com as opções; no fim, o resumo no aviso. */
  async function escolherAsMelhores(opcoes: OpcoesDaEscolha) {
    setErro("");
    try {
      if (semMedida > 0) {
        setOcupado("Analisando as fotos…");
        const terminou = esperarAnalise();
        setAnalise({ progresso: 0, mensagem: "Na fila" });
        await analisarAlbum(albumId);
        if (!(await terminou)) throw new Error("A análise das fotos falhou.");
      }
      setOcupado("Escolhendo…");
      const resultado = await escolherMelhores(albumId, opcoes);
      await recarregar();
      const partes = CATEGORIAS.filter((c) => resultado.categorias[c.id]).map((c) => {
        const n = resultado.categorias[c.id];
        const nome = n === 1 ? c.nome : c.plural;
        return `${n} ${nome.charAt(0).toLowerCase()}${nome.slice(1)}`;
      });
      setAviso(`Pronto: ${partes.join(", ")}.`);
      setFiltro({ ...FILTRO_VAZIO, categorias: ["destaque", "escolhida"] });
      setEscolhendo(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível escolher as melhores.");
    } finally {
      setOcupado("");
    }
  }

  /** Guarda a edição das fotos: a grade já mostra que estão editando, e o worker desenha. */
  async function editarAsFotos(edicoes: { midia_id: string; edicao: EdicaoDaFoto | null }[], texto: string) {
    const porId = new Map(edicoes.map((e) => [e.midia_id, e.edicao]));
    setFotos(
      (lista) =>
        lista?.map((foto) => {
          if (!porId.has(foto.midia_id)) return foto;
          const nova = porId.get(foto.midia_id);
          return { ...foto, edicao: nova ? { ...nova, versao: (foto.edicao?.versao ?? 0) + 1, gerada: foto.edicao?.gerada ?? null } : null };
        }) ?? lista,
    );
    try {
      await editarFotos(albumId, edicoes);
      setAviso(texto);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível guardar a edição.");
      void recarregar();
    }
  }

  /** As fotos que recebem a ação: as escolhidas, ou a do cursor. */
  const alvosDaGaveta = (selecao.size ? [...selecao] : cursor ? [cursor] : [])
    .map((id) => (fotos ?? []).find((foto) => foto.midia_id === id))
    .filter((foto): foto is FotoDoAlbum => Boolean(foto));
  const alvos = useCallback((): string[] => (selecao.size ? [...selecao] : cursor ? [cursor] : []), [selecao, cursor]);

  const aplicar = useCallback(
    (mudanca: Mudanca, ids = alvos()) => {
      if (!ids.length) return;
      const conjunto = new Set(ids);
      setFotos((lista) => lista?.map((foto) => (conjunto.has(foto.midia_id) ? aplicarMudanca(foto, mudanca) : foto)) ?? lista);
      mudarFotos(albumId, ids, mudanca).catch((e) => {
        setErro(e instanceof ErroApi ? e.message : "Não foi possível salvar a nota.");
        void recarregar();
      });
    },
    [albumId, alvos, recarregar, setErro, setFotos],
  );

  const remover = useCallback(() => {
    const ids = alvos();
    if (!ids.length) return;
    const texto = ids.length === 1 ? "esta foto" : `estas ${ids.length.toLocaleString("pt-BR")} fotos`;
    if (!window.confirm(`Tirar ${texto} do álbum? As enviadas para ele são apagadas; as que estão em algum projeto voltam para a biblioteca.`)) return;
    removerFotos(albumId, ids)
      .then((resultado) => {
        setSelecao(new Set());
        setAviso(resultado.na_biblioteca ? `${resultado.na_biblioteca} foto(s) estão em projetos e foram para a biblioteca.` : "");
        return recarregar();
      })
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível tirar as fotos."));
  }, [albumId, alvos, recarregar, setErro]);

  // O clique: só ela; com Ctrl, entra ou sai; com Shift, o intervalo desde a última clicada
  const clicar = useCallback(
    (midiaId: string, evento: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
      setCursor(midiaId);
      if (evento.shiftKey && ancora) {
        const a = visiveis.findIndex((foto) => foto.midia_id === ancora);
        const b = visiveis.findIndex((foto) => foto.midia_id === midiaId);
        if (a >= 0 && b >= 0) {
          const [de, ate] = a < b ? [a, b] : [b, a];
          setSelecao(new Set(visiveis.slice(de, ate + 1).map((foto) => foto.midia_id)));
          return;
        }
      }
      setAncora(midiaId);
      if (evento.ctrlKey || evento.metaKey) {
        setSelecao((atual) => {
          const nova = new Set(atual);
          if (nova.has(midiaId)) nova.delete(midiaId);
          else nova.add(midiaId);
          return nova;
        });
        return;
      }
      setSelecao(new Set([midiaId]));
    },
    [ancora, visiveis],
  );

  const colunas = useRef(1);
  const mover = useCallback(
    (passo: number, estender: boolean) => {
      if (!visiveis.length) return;
      const atual = indiceDoCursor >= 0 ? indiceDoCursor : 0;
      const proximo = Math.min(visiveis.length - 1, Math.max(0, indiceDoCursor < 0 ? 0 : atual + passo));
      const id = visiveis[proximo].midia_id;
      setCursor(id);
      if (estender && ancora) {
        const a = visiveis.findIndex((foto) => foto.midia_id === ancora);
        const [de, ate] = a < proximo ? [a, proximo] : [proximo, a];
        setSelecao(new Set(visiveis.slice(de, ate + 1).map((foto) => foto.midia_id)));
      } else {
        setAncora(id);
        setSelecao(new Set([id]));
      }
    },
    [visiveis, indiceDoCursor, ancora],
  );

  /** Abre a comparação com as selecionadas (de 2 a 12), na ordem da grade. */
  const comparar = useCallback(() => {
    const ids = visiveis.filter((foto) => selecao.has(foto.midia_id) && foto.status === "pronta").map((foto) => foto.midia_id);
    if (ids.length < 2) {
      setAviso("Escolha de 2 a 12 fotos (Ctrl ou Shift + clique) para comparar.");
      return;
    }
    if (ids.length > COMPARAR_NO_MAXIMO) setAviso(`A comparação mostra as ${COMPARAR_NO_MAXIMO} primeiras das selecionadas.`);
    setComparando(ids.slice(0, COMPARAR_NO_MAXIMO));
  }, [visiveis, selecao]);

  // O teclado da grade e da lupa
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.defaultPrevented || comparando || estilando || exportando || galeriaAberta) return;
      const alvo = evento.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable)) return;
      const ctrl = evento.ctrlKey || evento.metaKey;
      if (ctrl && evento.key.toLowerCase() === "a") {
        evento.preventDefault();
        setSelecao(new Set(visiveis.map((foto) => foto.midia_id)));
        return;
      }
      if (ctrl || evento.altKey) return;
      const passos: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: lupa ? 1 : colunas.current, ArrowUp: lupa ? -1 : -colunas.current };
      if (evento.key in passos) {
        evento.preventDefault();
        mover(passos[evento.key], evento.shiftKey && !lupa);
        return;
      }
      if (evento.key === "Enter" || evento.key === " ") {
        if (!fotoDoCursor) return;
        evento.preventDefault();
        setLupa((aberta) => !aberta);
        return;
      }
      if (evento.key === "Escape") {
        if (lupa) setLupa(false);
        else setSelecao(new Set());
        return;
      }
      if (evento.key === "Delete") {
        evento.preventDefault();
        remover();
        return;
      }
      if (evento.key.toLowerCase() === "c" && !lupa) {
        evento.preventDefault();
        comparar();
        return;
      }
      if (evento.key.toLowerCase() === "b" && !lupa) {
        evento.preventDefault();
        setPincel((atual) => (atual ? null : { nota: 5 }));
        return;
      }
      const ids = alvos();
      const atual = ids.length === 1 ? (fotos ?? []).find((foto) => foto.midia_id === ids[0]) : undefined;
      const mudanca = mudancaDaTecla(evento.key, atual);
      if (mudanca) {
        evento.preventDefault();
        aplicar(mudanca, ids);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [visiveis, lupa, mover, fotoDoCursor, remover, alvos, aplicar, fotos, comparando, comparar, estilando, exportando, galeriaAberta]);

  if (!album || !fotos) {
    return (
      <div className="flex h-dvh items-center justify-center bg-fundo text-suave">
        {erro ? <AvisoErro>{erro}</AvisoErro> : <LoaderCircle className="size-6 animate-spin" aria-label="Carregando o álbum" />}
      </div>
    );
  }

  const quantosSelecionados = selecao.size;

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-fundo text-texto"
      onDragOver={(evento) => {
        if (!evento.dataTransfer.types.includes("Files")) return;
        evento.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={(evento) => {
        if (evento.currentTarget === evento.target) setArrastando(false);
      }}
      onDrop={(evento) => {
        if (!evento.dataTransfer.types.includes("Files")) return;
        evento.preventDefault();
        setArrastando(false);
        const itens = evento.dataTransfer.items;
        if (itens?.length && typeof itens[0].webkitGetAsEntry === "function") {
          void arquivosArrastados(itens).then(({ arquivos, caminhos }) => enviar(arquivos, caminhos));
        } else {
          enviar(Array.from(evento.dataTransfer.files));
        }
      }}
    >
      {/* A barra de cima: voltar, o nome, o tipo do ensaio e os envios */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-borda bg-painel px-3 sm:grid sm:grid-cols-[1fr_auto_1fr]">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link href="/app/albuns" className="botao-icone" aria-label="Voltar à edição em massa" title="Edição em massa">
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <input
            key={album.nome}
            defaultValue={album.nome}
            maxLength={120}
            aria-label="Nome do álbum"
            className="min-w-0 flex-1 truncate rounded-md bg-transparent px-2 py-1 text-sm font-semibold outline-none hover:bg-painel-2 focus:bg-painel-2"
            onKeyDown={(evento) => {
              if (evento.key === "Enter") evento.currentTarget.blur();
            }}
            onBlur={(evento) => {
              const nome = evento.currentTarget.value.trim();
              if (!nome || nome === album.nome) return;
              mudarAlbum(album.id, { nome })
                .then(setAlbum)
                .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível renomear."));
            }}
          />
        </div>
        <select
          value={album.genero}
          aria-label="Tipo do ensaio"
          className="hidden rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs sm:block"
          onChange={(evento) =>
            mudarAlbum(album.id, { genero: evento.target.value as Genero })
              .then(setAlbum)
              .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível mudar o tipo."))
          }
        >
          {GENEROS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nome}
            </option>
          ))}
        </select>
        <div className="flex items-center justify-end gap-2">
          {faltam.length ? (
            <span className="hidden items-center gap-2 text-xs text-suave sm:flex" title={`${formatarBytes(bytes[0])} de ${formatarBytes(bytes[1])}`}>
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              Enviando {faltam.length.toLocaleString("pt-BR")} {faltam.length === 1 ? "foto" : "fotos"}
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-painel-3">
                <span className="block h-full rounded-full" style={{ width: `${bytes[1] ? (100 * bytes[0]) / bytes[1] : 0}%`, background: "var(--to-gradiente)" }} />
              </span>
            </span>
          ) : null}
          {analise ? (
            <span className="hidden items-center gap-2 text-xs text-suave md:flex" title={analise.mensagem}>
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              {analise.mensagem || "Analisando"}
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-painel-3">
                <span className="block h-full rounded-full" style={{ width: `${analise.progresso}%`, background: "var(--to-gradiente)" }} />
              </span>
            </span>
          ) : semMedida > 0 ? (
            <button
              type="button"
              className="botao-secundario px-3 py-1.5 text-xs whitespace-nowrap"
              title="Mede o foco, a exposição, os rostos, os olhos e o sorriso de cada foto"
              onClick={() => {
                setAnalise({ progresso: 0, mensagem: "Na fila" });
                analisarAlbum(albumId).catch((e) => {
                  setAnalise(null);
                  setErro(e instanceof ErroApi ? e.message : "Não foi possível analisar as fotos.");
                });
              }}
            >
              <ScanSearch className="size-4" aria-hidden />
              <span className="hidden lg:inline">Analisar {semMedida.toLocaleString("pt-BR")}</span>
            </button>
          ) : null}
          {album.monitorar ? (
            <span className="hidden items-center gap-1 rounded-full bg-painel-2 py-1 pr-1 pl-2 text-xs text-suave lg:flex" title={album.monitorar.erro ?? `As fotos novas de "${album.monitorar.caminho || "Fotos"}" entram sozinhas`}>
              <Eye className={`size-3.5 ${album.monitorar.erro ? "text-erro" : album.monitorar.etapa === "olhando" ? "" : "animate-pulse text-destaque"}`} aria-hidden />
              <span className="max-w-32 truncate">{album.monitorar.caminho.split("/").pop() || "Fotos"}</span>
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-painel-3 hover:text-texto"
                aria-label="Parar de monitorar a pasta"
                onClick={() => {
                  desligarMonitorar(albumId)
                    .then(() => recarregar())
                    .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível parar o monitor."));
                }}
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ) : null}
          {noComputador ? (
            <button type="button" className="botao-secundario px-3 py-1.5 text-xs whitespace-nowrap" onClick={() => setImportando(true)} title="Importar uma pasta do computador do servidor, sem copiar">
              <HardDrive className="size-4" aria-hidden />
              <span className="hidden 2xl:inline">Do computador</span>
            </button>
          ) : null}
          <button type="button" className="botao-secundario px-3 py-1.5 text-xs whitespace-nowrap" onClick={() => entradaArquivos.current?.click()} title="Enviar fotos">
            <ImageUp className="size-4" aria-hidden />
            <span className="hidden 2xl:inline">Enviar fotos</span>
          </button>
          {fotos.length ? (
            <button
              type="button"
              className="botao-secundario px-3 py-1.5 text-xs whitespace-nowrap"
              onClick={() => {
                void recarregar();
                setGaleriaAberta(true);
              }}
              title="Um link para o cliente marcar as favoritas, sem conta"
            >
              <Heart className={`size-4 ${album.galeria?.favoritas ? "fill-current text-destaque" : ""}`} aria-hidden />
              <span className="hidden xl:inline">Galeria{album.galeria ? ` (${album.galeria.favoritas})` : ""}</span>
            </button>
          ) : null}
          {fotos.length ? (
            <button type="button" className="botao-secundario px-3 py-1.5 text-xs whitespace-nowrap" onClick={() => setExportando(true)} title="As fotos num ZIP, com a edição, a marca d'água e o XMP">
              <Download className="size-4" aria-hidden />
              <span className="hidden xl:inline">Exportar</span>
            </button>
          ) : null}
          {fotos.length ? (
            <button
              type="button"
              className="botao-secundario px-3 py-1.5 text-xs whitespace-nowrap"
              onClick={() => setEstilando(true)}
              title="Um estilo de cor em todas as fotos (ou nas selecionadas), com a prévia na foto do cursor"
            >
              <Palette className="size-4" aria-hidden />
              <span className="hidden xl:inline">Estilos</span>
            </button>
          ) : null}
          {fotos.length ? (
            <button type="button" className="botao-principal px-3 py-1.5 text-xs whitespace-nowrap" onClick={() => setEscolhendo(true)} title="A IA agrupa as parecidas, tira as desfocadas e as de olhos fechados e escolhe as melhores">
              <WandSparkles className="size-4" aria-hidden />
              <span className="hidden sm:inline">Escolher as melhores</span>
            </button>
          ) : null}
          <button type="button" className={`${fotos.length ? "botao-secundario" : "botao-principal"} px-3 py-1.5 text-xs whitespace-nowrap`} onClick={() => entradaPasta.current?.click()} title="Enviar pasta">
            <FolderUp className="size-4" aria-hidden />
            <span className="hidden sm:inline">Enviar pasta</span>
          </button>
          <input
            ref={entradaArquivos}
            type="file"
            multiple
            accept={ACEITAR_IMAGENS}
            hidden
            onChange={(evento) => {
              if (evento.target.files?.length) enviar(Array.from(evento.target.files));
              evento.target.value = "";
            }}
          />
          <input
            ref={(elemento) => {
              entradaPasta.current = elemento;
              // A escolha de pasta não tem atributo no React: vai direto no elemento
              elemento?.setAttribute("webkitdirectory", "");
            }}
            type="file"
            multiple
            hidden
            onChange={(evento) => {
              if (evento.target.files?.length) enviar(Array.from(evento.target.files));
              evento.target.value = "";
            }}
          />
        </div>
      </header>

      <BarraDeFiltros
        filtro={filtro}
        aoMudar={setFiltro}
        ordem={vista.ordem}
        aoOrdenar={(ordem) => mudarVista({ ordem })}
        pastas={listaDePastas}
        porCategoria={porCategoria}
        pessoas={
          <FiltroDePessoas
            pessoas={pessoas}
            fotos={fotos}
            filtro={filtro}
            aoMudar={setFiltro}
            aoNomear={(numero, nome) => {
              setPessoas((lista) => lista.map((p) => (p.numero === numero ? { ...p, nome } : p)));
              nomearPessoa(albumId, numero, nome).catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível dar o nome."));
            }}
          />
        }
      />

      {erro || aviso || comErro.length ? (
        <div className="flex flex-col gap-1 border-b border-borda bg-painel px-3 py-2 text-xs">
          {erro ? <p className="text-erro">{erro}</p> : null}
          {aviso ? <p className="text-suave">{aviso}</p> : null}
          {comErro.length ? (
            <p className="text-erro">
              {comErro.length} foto(s) não subiram: {comErro[0].erro}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {fotos.length === 0 ? (
            <EstadoVazio
              aoEnviarPasta={() => entradaPasta.current?.click()}
              aoEnviarFotos={() => entradaArquivos.current?.click()}
              aoImportar={noComputador ? () => setImportando(true) : undefined}
            />
          ) : visiveis.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-suave">
              Nenhuma foto com esses filtros.
              <button type="button" className="botao-secundario px-3 py-1.5 text-xs" onClick={() => setFiltro(FILTRO_VAZIO)}>
                Limpar os filtros
              </button>
            </div>
          ) : (
            <Grade
              albumId={albumId}
              pincel={pincel}
              aoPintar={(ids) => {
                if (pincel) aplicar(pincel, ids);
              }}
              fotos={visiveis}
              tamanho={vista.tamanho}
              selecao={selecao}
              cursor={cursor}
              aoClicar={clicar}
              aoAbrir={(midiaId) => {
                setCursor(midiaId);
                setSelecao(new Set([midiaId]));
                setLupa(true);
              }}
              aoColunas={(n) => {
                colunas.current = n;
              }}
            />
          )}
          {arrastando ? (
            <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-xl border-2 border-dashed border-destaque bg-black/40 text-sm font-medium text-white">
              Solte as fotos ou a pasta para enviar ao álbum
            </div>
          ) : null}
        </div>
        <Gaveta
          contagens={contagens}
          filtro={filtro}
          aoFiltrar={setFiltro}
          foto={fotoDoCursor}
          quantos={quantosSelecionados}
          aoAplicar={(mudanca) => aplicar(mudanca)}
          aoRemover={remover}
          todas={fotos}
          pessoas={pessoas}
          edicao={
            <>
              <PainelDeEdicao
                albumId={albumId}
                alvos={alvosDaGaveta}
                referencia={fotoDoCursor}
                grupoDa={(foto) => grupoDaFoto(fotos, foto)}
                aoEditar={editarAsFotos}
              />
              <PainelDeRetoque
                alvos={alvosDaGaveta}
                referencia={fotoDoCursor}
                pessoas={pessoas}
                aoEditar={editarAsFotos}
                aoPincel={() => {
                  setRetocando(true);
                  setLupa(true);
                }}
              />
              <PainelEstiloPessoal
                albumId={albumId}
                alvos={alvosDaGaveta}
                referencia={fotoDoCursor}
                evento={eventoDoEstilo}
                aoAviso={(texto, comErro) => (comErro ? setErro(texto) : setAviso(texto))}
              />
            </>
          }
        />
      </div>

      <footer className="grid h-10 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-borda bg-painel px-3 text-xs text-suave">
        <span className="truncate tabular-nums">
          {fotoDoCursor ? `${fotoDoCursor.nome} · ` : ""}
          {indiceDoCursor >= 0 ? `${(indiceDoCursor + 1).toLocaleString("pt-BR")} de ` : ""}
          {visiveis.length.toLocaleString("pt-BR")}
          {filtroAtivo(filtro) ? ` (de ${fotos.length.toLocaleString("pt-BR")})` : ""} fotos
          {quantosSelecionados > 1 ? ` · ${quantosSelecionados.toLocaleString("pt-BR")} selecionadas` : ""}
        </span>
        <span className="hidden items-center gap-3 md:flex">
          {fotoDoCursor && !pincel ? <Estrelas nota={fotoDoCursor.nota} aoMudar={(nota) => aplicar({ nota })} /> : null}
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-painel-2 hover:text-texto disabled:opacity-40"
            onClick={comparar}
            disabled={quantosSelecionados < 2}
            title="Comparar as selecionadas lado a lado (C)"
          >
            <Columns2 className="size-3.5" aria-hidden />
            Comparar
          </button>
          <span className={`flex items-center gap-1 rounded px-1 ${pincel ? "bg-aviso/15 text-texto" : ""}`}>
            <button
              type="button"
              className="flex items-center gap-1 rounded px-1 py-0.5 hover:text-texto"
              onClick={() => setPincel((atual) => (atual ? null : { nota: 5 }))}
              aria-pressed={Boolean(pincel)}
              title="Pincel de notas: clique e arraste sobre as fotos (B)"
            >
              <Brush className="size-3.5" aria-hidden />
              Pincel
            </button>
            {pincel ? (
              <select
                value={chaveDoPincel(pincel)}
                onChange={(evento) => setPincel(PINCEIS.find((p) => p.chave === evento.target.value)?.mudanca ?? null)}
                className="rounded border border-borda bg-painel-2 px-1 py-0.5"
                aria-label="O que o pincel pinta"
              >
                {PINCEIS.map((p) => (
                  <option key={p.chave} value={p.chave}>
                    {p.nome}
                  </option>
                ))}
              </select>
            ) : null}
          </span>
        </span>
        <label className="flex items-center justify-end gap-2">
          <span className="sr-only">Tamanho das fotos</span>
          <input
            type="range"
            min={TAMANHOS.minimo}
            max={TAMANHOS.maximo}
            value={vista.tamanho}
            onChange={(evento) => mudarVista({ tamanho: Number(evento.target.value) })}
            className="w-28 accent-[var(--to-destaque)]"
            aria-label="Tamanho das fotos"
          />
        </label>
      </footer>

      {importando ? <JanelaImportarPasta albumId={albumId} aoFechar={() => setImportando(false)} aoImportar={setAviso} aoMonitorar={setAlbum} /> : null}
      {galeriaAberta ? (
        <JanelaGaleria
          albumId={albumId}
          galeria={album.galeria ?? null}
          escolhidas={fotos.filter((foto) => foto.marcacao === "escolhida")}
          selecionadas={visiveis.filter((foto) => selecao.has(foto.midia_id))}
          visiveis={visiveis}
          aoMudar={() => void recarregar()}
          aoVerFavoritas={() => {
            setFiltro({ ...FILTRO_VAZIO, doCliente: true });
            setGaleriaAberta(false);
          }}
          aoFechar={() => setGaleriaAberta(false)}
        />
      ) : null}
      {escolhendo ? (
        <JanelaEscolher
          iniciais={(album.escolha_opcoes as Partial<OpcoesDaEscolha> | null) ?? null}
          faltamAnalisar={semMedida}
          total={contagens.prontas}
          ocupado={ocupado}
          aoEscolher={(opcoes) => void escolherAsMelhores(opcoes)}
          aoFechar={() => setEscolhendo(false)}
        />
      ) : null}

      {lupa && fotoDoCursor ? (
        <Lupa
          key={retocando ? `pincel-${fotoDoCursor.midia_id}` : "lupa"}
          albumId={albumId}
          retocando={retocando}
          aoSairDoPincel={() => setRetocando(false)}
          aoSalvarPincel={(tracos) => {
            setRetocando(false);
            const base = edicaoParaEnviar(fotoDoCursor.edicao);
            void editarAsFotos([{ midia_id: fotoDoCursor.midia_id, edicao: { ...base, retoque: { ...(base.retoque ?? {}), pincel: tracos } } }], `Pincel do retoque salvo (${tracos.length} traço(s)).`);
          }}
          foto={fotoDoCursor}
          fotos={fotos}
          pessoas={pessoas}
          aoIr={(midiaId) => {
            setCursor(midiaId);
            setSelecao(new Set([midiaId]));
          }}
          indice={indiceDoCursor}
          total={visiveis.length}
          aoFechar={() => {
            setLupa(false);
            setRetocando(false);
          }}
          aoAndar={(passo) => mover(passo, false)}
          aoAplicar={(mudanca) => aplicar(mudanca, [fotoDoCursor.midia_id])}
          proxima={visiveis[indiceDoCursor + 1]}
        />
      ) : null}
      {estilando && (fotoDoCursor ?? visiveis.find((foto) => foto.status === "pronta")) ? (
        <JanelaDeEstilos
          alvos={selecao.size > 1 ? visiveis.filter((foto) => selecao.has(foto.midia_id)) : visiveis}
          referencia={(fotoDoCursor ?? visiveis.find((foto) => foto.status === "pronta"))!}
          grupoDe={(foto) => String(foto.grupo ?? foto.midia_id)}
          aoAplicar={editarAsFotos}
          aoFechar={() => setEstilando(false)}
        />
      ) : null}
      {exportando ? (
        <JanelaExportarAlbum
          albumId={albumId}
          escolhidas={fotos.filter((foto) => foto.marcacao === "escolhida")}
          selecionadas={visiveis.filter((foto) => selecao.has(foto.midia_id))}
          visiveis={visiveis}
          aoFechar={() => setExportando(false)}
        />
      ) : null}
      {comparando ? (
        <Comparacao
          albumId={albumId}
          fotos={comparando.map((id) => fotos.find((foto) => foto.midia_id === id)).filter((foto): foto is FotoDoAlbum => Boolean(foto))}
          aoAplicar={aplicar}
          aoTirar={(midiaId) => setComparando((ids) => ids?.filter((id) => id !== midiaId) ?? null)}
          aoFechar={() => setComparando(null)}
        />
      ) : null}
    </div>
  );
}

// -----------------------------------------------
// Peças
// -----------------------------------------------
function EstadoVazio({ aoEnviarPasta, aoEnviarFotos, aoImportar }: { aoEnviarPasta: () => void; aoEnviarFotos: () => void; aoImportar?: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-borda p-10 text-center">
        <FolderUp className="size-10 text-suave" aria-hidden />
        <h2 className="font-display text-lg font-semibold">Envie as fotos do ensaio</h2>
        <p className="text-sm text-suave">Arraste a pasta inteira para cá, ou escolha a pasta ou as fotos. As subpastas viram filtros, e cada foto fica pronta em segundos.</p>
        <div className="flex gap-2">
          <button type="button" className="botao-principal px-4 py-2 text-sm" onClick={aoEnviarPasta}>
            <FolderUp className="size-4" aria-hidden />
            Escolher a pasta
          </button>
          <button type="button" className="botao-secundario px-4 py-2 text-sm" onClick={aoEnviarFotos}>
            <ImageUp className="size-4" aria-hidden />
            Escolher fotos
          </button>
        </div>
        {aoImportar ? (
          <button type="button" className="flex items-center gap-1.5 text-xs text-suave hover:text-texto" onClick={aoImportar}>
            <HardDrive className="size-3.5" aria-hidden />
            Ou importe uma pasta do computador do servidor, sem copiar
          </button>
        ) : null}
      </div>
    </div>
  );
}

function BarraDeFiltros({
  filtro,
  aoMudar,
  ordem,
  aoOrdenar,
  pastas,
  porCategoria,
  pessoas,
}: {
  filtro: Filtro;
  aoMudar: (filtro: Filtro) => void;
  ordem: Ordem;
  aoOrdenar: (ordem: Ordem) => void;
  pastas: { pasta: string; fotos: number }[];
  /** Quantas fotos em cada categoria da escolha (vazio: o álbum ainda não passou pela escolha). */
  porCategoria: Partial<Record<Categoria, number>>;
  /** O filtro das pessoas (FiltroDePessoas), que tem estado próprio. */
  pessoas: React.ReactNode;
}) {
  const muda = (campos: Partial<Filtro>) => aoMudar({ ...filtro, ...campos });
  const separador = <span className="h-4 w-px bg-borda" aria-hidden />;
  return (
    <div className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-borda bg-painel px-3 text-xs">
      <div className="flex rounded-md bg-painel-2 p-0.5" role="group" aria-label="Marcação">
        {(
          [
            ["todas", "Todas"],
            ["escolhida", "Escolhidas"],
            ["rejeitada", "Rejeitadas"],
            ["sem", "Sem marcação"],
          ] as const
        ).map(([id, nome]) => (
          <button
            key={id}
            type="button"
            onClick={() => muda({ marcacao: id })}
            className={`rounded px-2 py-1 whitespace-nowrap transition ${filtro.marcacao === id ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`}
            aria-pressed={filtro.marcacao === id}
          >
            {nome}
          </button>
        ))}
      </div>
      {separador}
      <div className="flex items-center gap-1">
        <select
          value={filtro.comparacao}
          onChange={(evento) => muda({ comparacao: evento.target.value as Filtro["comparacao"] })}
          className="rounded border border-borda bg-painel-2 px-1 py-0.5"
          aria-label="Comparação da nota"
        >
          <option value="ao_menos">≥</option>
          <option value="exatamente">=</option>
          <option value="ate">≤</option>
        </select>
        <Estrelas nota={filtro.nota} aoMudar={(nota) => muda({ nota })} />
      </div>
      {separador}
      <div className="flex items-center gap-1.5" role="group" aria-label="Cores">
        {CORES.map((cor) => {
          const ligada = filtro.cores.includes(cor.id);
          return (
            <button
              key={cor.id}
              type="button"
              onClick={() => muda({ cores: ligada ? filtro.cores.filter((c) => c !== cor.id) : [...filtro.cores, cor.id] })}
              className={`size-4 rounded-full ${CLASSE_DA_COR[cor.id]} transition ${ligada ? "ring-2 ring-texto ring-offset-1 ring-offset-painel" : "opacity-60 hover:opacity-100"}`}
              aria-pressed={ligada}
              aria-label={cor.nome}
              title={cor.nome}
            />
          );
        })}
      </div>
      {pessoas}
      {Object.keys(porCategoria).length ? (
        <>
          {separador}
          <select
            value={filtro.categorias.join(",")}
            onChange={(evento) => muda({ categorias: evento.target.value ? (evento.target.value.split(",") as Categoria[]) : [] })}
            className="max-w-52 rounded border border-borda bg-painel-2 px-1.5 py-0.5"
            aria-label="Escolha da IA"
          >
            <option value="">Todas as categorias</option>
            <option value="destaque,escolhida">
              As melhores · {(porCategoria.destaque ?? 0) + (porCategoria.escolhida ?? 0)}
            </option>
            {CATEGORIAS.filter((c) => porCategoria[c.id]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.plural} · {porCategoria[c.id]}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {pastas.length > 1 ? (
        <>
          {separador}
          <select
            value={filtro.pasta ?? "\u0000"}
            onChange={(evento) => muda({ pasta: evento.target.value === "\u0000" ? null : evento.target.value })}
            className="max-w-48 rounded border border-borda bg-painel-2 px-1.5 py-0.5"
            aria-label="Pasta"
          >
            <option value={"\u0000"}>Todas as pastas</option>
            {pastas.map((p) => (
              <option key={p.pasta} value={p.pasta}>
                {p.pasta || "(sem pasta)"} · {p.fotos}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {separador}
      <label className="flex min-w-36 items-center gap-1 rounded border border-borda bg-painel-2 px-1.5">
        <Search className="size-3.5 text-suave" aria-hidden />
        <input
          value={filtro.busca}
          onChange={(evento) => muda({ busca: evento.target.value })}
          placeholder="Nome, pasta ou câmera"
          className="w-full bg-transparent py-1 outline-none"
          aria-label="Buscar"
        />
      </label>
      {filtroAtivo(filtro) ? (
        <button type="button" className="flex items-center gap-1 whitespace-nowrap text-suave hover:text-texto" onClick={() => aoMudar(FILTRO_VAZIO)}>
          <X className="size-3.5" aria-hidden />
          Limpar
        </button>
      ) : null}
      <span className="ml-auto flex items-center gap-1 whitespace-nowrap text-suave">
        Ordem
        <select value={ordem} onChange={(evento) => aoOrdenar(evento.target.value as Ordem)} className="rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-texto" aria-label="Ordem">
          {ORDENS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

function Grade({
  albumId,
  pincel,
  aoPintar,
  fotos,
  tamanho,
  selecao,
  cursor,
  aoClicar,
  aoAbrir,
  aoColunas,
}: {
  albumId: string;
  pincel: Mudanca | null;
  aoPintar: (ids: string[]) => void;
  fotos: FotoDoAlbum[];
  tamanho: number;
  selecao: Set<string>;
  cursor: string | null;
  aoClicar: (midiaId: string, evento: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void;
  aoAbrir: (midiaId: string) => void;
  aoColunas: (colunas: number) => void;
}) {
  const rolagem = useRef<HTMLDivElement>(null);
  const [medida, setMedida] = useState({ largura: 0, altura: 0, topo: 0 });
  // O traço do pincel: as fotos por onde ele passou, aplicadas de uma vez ao soltar
  const [pintadas, setPintadas] = useState<Set<string> | null>(null);
  const pintar = (midiaId: string) => setPintadas((atual) => (atual && !atual.has(midiaId) ? new Set(atual).add(midiaId) : atual));
  useEffect(() => {
    if (!pintadas) return;
    const soltar = () => {
      setPintadas(null);
      if (pintadas.size) aoPintar([...pintadas]);
    };
    window.addEventListener("pointerup", soltar);
    return () => window.removeEventListener("pointerup", soltar);
  }, [pintadas, aoPintar]);

  useEffect(() => {
    const elemento = rolagem.current;
    if (!elemento) return;
    const medir = () => setMedida({ largura: elemento.clientWidth - 2 * VAO, altura: elemento.clientHeight, topo: elemento.scrollTop });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    elemento.addEventListener("scroll", medir, { passive: true });
    return () => {
      observador.disconnect();
      elemento.removeEventListener("scroll", medir);
    };
  }, []);

  const colunas = colunasDaGrade(medida.largura, tamanho, VAO);
  useEffect(() => aoColunas(colunas), [colunas, aoColunas]);
  const lado = medida.largura ? Math.floor((medida.largura - (colunas - 1) * VAO) / colunas) : tamanho;
  const alturaDaLinha = lado + VAO;
  const linhas = Math.ceil(fotos.length / colunas);
  const [primeira, ultima] = linhasVisiveis(medida.topo, medida.altura || 800, alturaDaLinha, linhas);

  // O cursor sempre à vista quando anda pelo teclado
  const indiceDoCursor = cursor ? fotos.findIndex((foto) => foto.midia_id === cursor) : -1;
  useEffect(() => {
    const elemento = rolagem.current;
    if (!elemento || indiceDoCursor < 0) return;
    const topo = Math.floor(indiceDoCursor / colunas) * alturaDaLinha + VAO;
    if (topo < elemento.scrollTop) elemento.scrollTop = topo - VAO;
    else if (topo + lado > elemento.scrollTop + elemento.clientHeight) elemento.scrollTop = topo + lado - elemento.clientHeight + VAO;
  }, [indiceDoCursor, colunas, alturaDaLinha, lado]);

  const cartoes = [];
  for (let linha = primeira; linha < ultima; linha++) {
    for (let coluna = 0; coluna < colunas; coluna++) {
      const indice = linha * colunas + coluna;
      const foto = fotos[indice];
      if (!foto) break;
      cartoes.push(
        <Cartao
          key={foto.midia_id}
          albumId={albumId}
          foto={foto}
          lado={lado}
          x={VAO + coluna * (lado + VAO)}
          y={VAO + linha * alturaDaLinha}
          selecionada={selecao.has(foto.midia_id)}
          noCursor={foto.midia_id === cursor}
          aoClicar={aoClicar}
          aoAbrir={aoAbrir}
          pincel={
            pincel
              ? {
                  pintada: pintadas?.has(foto.midia_id) ?? false,
                  aoComecar: () => setPintadas(new Set([foto.midia_id])),
                  aoPassar: () => pintar(foto.midia_id),
                }
              : null
          }
        />,
      );
    }
  }

  return (
    <div ref={rolagem} className={`absolute inset-0 overflow-y-auto ${pincel ? "cursor-crosshair" : ""}`} role="grid" aria-label="Fotos do álbum" aria-rowcount={linhas}>
      <div className="relative" style={{ height: linhas * alturaDaLinha + VAO }}>
        {cartoes}
      </div>
    </div>
  );
}

function Cartao({
  albumId,
  foto,
  lado,
  x,
  y,
  selecionada,
  noCursor,
  aoClicar,
  aoAbrir,
  pincel,
}: {
  albumId: string;
  foto: FotoDoAlbum;
  lado: number;
  x: number;
  y: number;
  selecionada: boolean;
  noCursor: boolean;
  aoClicar: (midiaId: string, evento: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void;
  aoAbrir: (midiaId: string) => void;
  /** Com o pincel de notas ligado: o clique e o arrasto pintam em vez de escolher. */
  pincel: { pintada: boolean; aoComecar: () => void; aoPassar: () => void } | null;
}) {
  const rejeitada = foto.marcacao === "rejeitada";
  return (
    <div
      role="gridcell"
      aria-selected={selecionada}
      title={foto.nome}
      onClick={(evento) => {
        if (!pincel) aoClicar(foto.midia_id, evento);
      }}
      onDoubleClick={() => {
        if (!pincel) aoAbrir(foto.midia_id);
      }}
      onPointerDown={(evento) => {
        if (pincel && evento.button === 0) {
          evento.preventDefault();
          pincel.aoComecar();
        }
      }}
      onPointerEnter={() => pincel?.aoPassar()}
      className={`absolute overflow-hidden rounded-md bg-painel-2 select-none ${pincel ? "" : "cursor-pointer"} ${pincel?.pintada ? "ring-2 ring-aviso" : selecionada ? "ring-2 ring-destaque" : noCursor ? "ring-1 ring-suave" : "hover:ring-1 hover:ring-borda-forte"}`}
      style={{ left: x, top: y, width: lado, height: lado }}
    >
      {foto.status === "pronta" ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagem da API com a sessão do cookie
        <img src={arquivoDaMidia(foto.midia_id, arquivoDaFoto(foto, albumId, "capa"))} alt="" draggable={false} loading="lazy" className={`size-full object-contain ${rejeitada ? "opacity-35" : ""}`} />
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-suave">
          {foto.status === "erro" ? <CircleAlert className="size-5 text-erro" aria-hidden /> : <LoaderCircle className="size-5 animate-spin" aria-hidden />}
          <span className="line-clamp-2 break-all">{foto.status === "erro" ? (foto.erro ?? "Erro") : foto.status === "enviando" ? "Enviando" : `Preparando${foto.progresso ? ` ${foto.progresso}%` : ""}`}</span>
        </span>
      )}
      {foto.marcacao ? (
        <span className={`absolute left-1 top-1 flex size-5 items-center justify-center rounded-full text-white ${rejeitada ? "bg-erro" : "bg-sucesso"}`} title={rejeitada ? "Rejeitada" : "Escolhida"}>
          {rejeitada ? <X className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
        </span>
      ) : null}
      {foto.nota > 0 && lado >= 120 ? (
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1 py-0.5">
          <Estrelas nota={foto.nota} tamanho="size-3" />
        </span>
      ) : foto.nota > 0 ? (
        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-aviso">{foto.nota}★</span>
      ) : null}
      {foto.cliente?.favorita ? (
        <span className="absolute left-1 top-7 flex size-5 items-center justify-center rounded-full bg-black/60 text-destaque" title={foto.cliente.comentario ? `Favorita do cliente: ${foto.cliente.comentario}` : "Favorita do cliente"}>
          <Heart className="size-3 fill-current" aria-label="Favorita do cliente" />
        </span>
      ) : null}
      {foto.cor ? <span className={`absolute inset-x-0 bottom-0 h-1 ${CLASSE_DA_COR[foto.cor]}`} aria-label={`Cor ${foto.cor}`} /> : null}
      {foto.edicao ? (
        <span className="absolute bottom-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white" title={editandoAgora(foto) ? "Editando…" : "Editada"}>
          {editandoAgora(foto) ? <LoaderCircle className="size-3 animate-spin" aria-label="Editando" /> : <SlidersHorizontal className="size-3" aria-label="Editada" />}
        </span>
      ) : null}
      {foto.categoria ? (
        <>
          <span className={`absolute inset-x-0 top-0 h-1 ${CLASSE_DA_CATEGORIA[foto.categoria]}`} />
          <span
            className={`absolute right-1 top-1.5 flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-semibold text-white ${CLASSE_DA_CATEGORIA[foto.categoria]}`}
            title={`${CATEGORIAS.find((c) => c.id === foto.categoria)?.nome}${foto.motivo ? `: ${foto.motivo}` : ""}`}
          >
            <IconeDaCategoria categoria={foto.categoria} />
            {lado >= 150 && foto.nota_ia !== null && foto.nota_ia !== undefined ? foto.nota_ia : null}
          </span>
        </>
      ) : null}
    </div>
  );
}

function Gaveta({
  contagens,
  filtro,
  aoFiltrar,
  foto,
  quantos,
  aoAplicar,
  aoRemover,
  todas,
  pessoas,
  edicao,
}: {
  contagens: ReturnType<typeof contar>;
  filtro: Filtro;
  aoFiltrar: (filtro: Filtro) => void;
  foto: FotoDoAlbum | null;
  quantos: number;
  aoAplicar: (mudanca: Mudanca) => void;
  aoRemover: () => void;
  todas: FotoDoAlbum[];
  pessoas: PessoaDoAlbum[];
  /** O painel de edição das fotos escolhidas (PainelDeEdicao). */
  edicao: React.ReactNode;
}) {
  const linha = (rotulo: string, numero: number, ativo: boolean, aoClicar?: () => void, classe = "") => (
    <button
      type="button"
      disabled={!aoClicar}
      onClick={aoClicar}
      className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ${ativo ? "bg-painel-3 text-texto" : "text-suave hover:bg-painel-2 hover:text-texto"} disabled:hover:bg-transparent`}
    >
      <span className={classe}>{rotulo}</span>
      <span className="tabular-nums">{numero.toLocaleString("pt-BR")}</span>
    </button>
  );
  const alvo = quantos > 1 ? `as ${quantos.toLocaleString("pt-BR")} selecionadas` : "a foto";
  const porCategoria = contarCategorias(todas);
  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-borda bg-painel p-3 lg:flex" aria-label="Resultado e detalhes">
      <section>
        <h2 className="mb-1 text-[11px] font-semibold tracking-wide text-apagado uppercase">Resultado</h2>
        {linha("Todas", contagens.total, filtro.marcacao === "todas" && !filtroAtivo(filtro), () => aoFiltrar(FILTRO_VAZIO))}
        {linha("Escolhidas", contagens.escolhidas, filtro.marcacao === "escolhida", () => aoFiltrar({ ...FILTRO_VAZIO, marcacao: "escolhida" }), "text-sucesso")}
        {linha("Rejeitadas", contagens.rejeitadas, filtro.marcacao === "rejeitada", () => aoFiltrar({ ...FILTRO_VAZIO, marcacao: "rejeitada" }), "text-erro")}
        {linha("Sem marcação", contagens.total - contagens.escolhidas - contagens.rejeitadas, filtro.marcacao === "sem", () => aoFiltrar({ ...FILTRO_VAZIO, marcacao: "sem" }))}
        {linha("Com nota", contagens.comNota, filtro.nota === 1 && filtro.comparacao === "ao_menos", () => aoFiltrar({ ...FILTRO_VAZIO, nota: 1 }))}
        {todas.some((f) => f.cliente?.favorita)
          ? linha("Favoritas do cliente", todas.filter((f) => f.cliente?.favorita).length, Boolean(filtro.doCliente), () => aoFiltrar({ ...FILTRO_VAZIO, doCliente: true }), "text-destaque")
          : null}
        {contagens.processando ? linha("Preparando", contagens.processando, false) : null}
        {contagens.erros ? linha("Com erro", contagens.erros, false, undefined, "text-erro") : null}
      </section>

      {Object.keys(porCategoria).length ? (
        <section>
          <h2 className="mb-1 text-[11px] font-semibold tracking-wide text-apagado uppercase">Escolha da IA</h2>
          {CATEGORIAS.filter((c) => porCategoria[c.id]).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => aoFiltrar({ ...FILTRO_VAZIO, categorias: filtro.categorias.length === 1 && filtro.categorias[0] === c.id ? [] : [c.id] })}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${filtro.categorias.length === 1 && filtro.categorias[0] === c.id ? "bg-painel-3 text-texto" : "text-suave hover:bg-painel-2 hover:text-texto"}`}
            >
              <span className={`size-2.5 rounded-full ${CLASSE_DA_CATEGORIA[c.id]}`} aria-hidden />
              <span className="flex-1">{c.plural}</span>
              <span className="tabular-nums">{porCategoria[c.id]!.toLocaleString("pt-BR")}</span>
            </button>
          ))}
        </section>
      ) : null}

      {foto ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-semibold tracking-wide text-apagado uppercase">{quantos > 1 ? `${quantos} selecionadas` : "Foto"}</h2>
          {quantos <= 1 ? (
            <>
              <p className="truncate text-sm font-medium" title={foto.nome}>
                {foto.nome}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                {foto.exif?.data ? (
                  <>
                    <dt className="text-apagado">Tirada</dt>
                    <dd>{dataDaFoto(foto.exif.data)}</dd>
                  </>
                ) : null}
                {foto.pasta ? (
                  <>
                    <dt className="text-apagado">Pasta</dt>
                    <dd className="truncate" title={foto.pasta}>
                      {foto.pasta}
                    </dd>
                  </>
                ) : null}
                {foto.largura ? (
                  <>
                    <dt className="text-apagado">Tamanho</dt>
                    <dd>
                      {foto.largura} × {foto.altura}
                    </dd>
                  </>
                ) : null}
                {foto.exif?.camera ? (
                  <>
                    <dt className="text-apagado">Câmera</dt>
                    <dd className="truncate">{foto.exif.camera}</dd>
                  </>
                ) : null}
                {foto.exif?.lente ? (
                  <>
                    <dt className="text-apagado">Lente</dt>
                    <dd className="truncate">{foto.exif.lente}</dd>
                  </>
                ) : null}
              </dl>
              {resumoDaCamera(foto.exif) ? <p className="text-xs text-suave">{resumoDaCamera(foto.exif)}</p> : null}
              {foto.categoria ? (
                <p className="flex items-start gap-1.5 text-xs">
                  <span className={`mt-1 size-2.5 shrink-0 rounded-full ${CLASSE_DA_CATEGORIA[foto.categoria]}`} aria-hidden />
                  <span>
                    <strong>{CATEGORIAS.find((c) => c.id === foto.categoria)?.nome}</strong>
                    {foto.nota_ia !== null && foto.nota_ia !== undefined ? ` · nota ${foto.nota_ia}` : ""}
                    {foto.motivo ? <span className="block text-suave">{foto.motivo}</span> : null}
                  </span>
                </p>
              ) : null}
              <MedidasDaFoto foto={foto} fotos={todas} pessoas={pessoas} />
            </>
          ) : null}
          <div className="flex items-center justify-between">
            <span className="text-xs text-apagado">Nota</span>
            <Estrelas nota={quantos > 1 ? 0 : foto.nota} aoMudar={(nota) => aoAplicar({ nota })} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-apagado">Cor</span>
            <span className="flex gap-1.5">
              {CORES.map((cor) => (
                <button
                  key={cor.id}
                  type="button"
                  onClick={() => aoAplicar(quantos <= 1 && foto.cor === cor.id ? { tirar_cor: true } : { cor: cor.id })}
                  className={`size-4 rounded-full ${CLASSE_DA_COR[cor.id]} ${quantos <= 1 && foto.cor === cor.id ? "ring-2 ring-texto ring-offset-1 ring-offset-painel" : ""}`}
                  aria-label={cor.nome}
                  title={`${cor.nome}${cor.tecla ? ` (tecla ${cor.tecla})` : ""}`}
                />
              ))}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <button type="button" className="botao-secundario px-2 py-1 text-xs" onClick={() => aoAplicar({ marcacao: "escolhida" })} title="Escolher (P)">
              <Check className="size-3.5 text-sucesso" aria-hidden />
              Escolher
            </button>
            <button type="button" className="botao-secundario px-2 py-1 text-xs" onClick={() => aoAplicar({ marcacao: "rejeitada" })} title="Rejeitar (X)">
              <X className="size-3.5 text-erro" aria-hidden />
              Rejeitar
            </button>
            <button type="button" className="botao-secundario px-2 py-1 text-xs" onClick={() => aoAplicar({ tirar_marcacao: true })} title="Tirar a marcação (U)">
              Tirar
            </button>
          </div>
          {edicao}
          <button type="button" className="flex items-center gap-1.5 self-start text-xs text-suave hover:text-erro" onClick={aoRemover} title="Tirar do álbum (Delete)">
            <Trash2 className="size-3.5" aria-hidden />
            Tirar {alvo} do álbum
          </button>
        </section>
      ) : (
        <p className="text-xs text-suave">Clique numa foto para ver os detalhes. Com Ctrl ou Shift, escolha várias.</p>
      )}

      <section className="mt-auto text-[11px] leading-relaxed text-apagado">
        <h2 className="mb-1 font-semibold tracking-wide uppercase">Teclas</h2>
        <p>0–5 nota · 6–9 cor · P escolher · X rejeitar · U tirar · setas andam · Enter ou Espaço abre a foto · Ctrl+A todas · Delete tira do álbum</p>
      </section>
    </aside>
  );
}

/** As medidas da análise em palavras: o foco comparado ao resto do ensaio, a exposição e o rosto principal. */
function MedidasDaFoto({ foto, fotos, pessoas }: { foto: FotoDoAlbum; fotos: FotoDoAlbum[]; pessoas: PessoaDoAlbum[] }) {
  if (!foto.medidas) return foto.status === "pronta" ? <p className="text-[11px] text-apagado">Ainda não analisada.</p> : null;
  const posicao = posicaoDoFoco(foto, fotos);
  const principal = rostoPrincipal(foto.medidas);
  const linha = (rotulo: string, valor: string, classe = "") => (
    <>
      <dt className="text-apagado">{rotulo}</dt>
      <dd className={classe}>{valor}</dd>
    </>
  );
  const exposicao = exposicaoEmPalavras(foto.medidas);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded-md bg-painel-2 p-2 text-xs">
      {posicao !== null
        ? linha("Foco", posicao >= 0.66 ? "dos mais nítidos do ensaio" : posicao >= 0.25 ? "na média do ensaio" : "dos menos nítidos", posicao < 0.25 ? "text-aviso" : "")
        : null}
      {linha("Exposição", exposicao, exposicao === "boa" ? "" : "text-aviso")}
      {linha("Rostos", foto.medidas.rostos.length ? String(foto.medidas.rostos.length) : "nenhum")}
      {foto.pessoas?.length ? linha("Pessoas", foto.pessoas.map((n) => pessoas.find((p) => p.numero === n)?.nome || `Pessoa ${n}`).join(", ")) : null}
      {principal ? linha("Olhos", principal.olhosFechados ? "fechados" : "abertos", principal.olhosFechados ? "text-erro" : "") : null}
      {principal?.rosto.sorriso !== undefined ? linha("Sorriso", principal.sorrindo ? "sim" : "não") : null}
      {principal?.rosto.olhando !== undefined ? linha("Olhar", principal.olhando ? "para a câmera" : "para o lado") : null}
    </dl>
  );
}
