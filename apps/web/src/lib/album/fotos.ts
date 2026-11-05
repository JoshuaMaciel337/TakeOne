// O álbum de fotos (onda 16, docs/decisoes/0006-album-de-fotos.md): os tipos e as contas puras da grade (filtrar,
// ordenar, contar, a mudança das notas). As chamadas à API ficam em api.ts.

import type { EdicaoGuardada } from "./edicao.ts";

export type Genero = "casamento" | "ensaio" | "familia" | "evento" | "esporte" | "escola" | "recem_nascido" | "produto" | "outro";
export type CorDaFoto = "vermelho" | "amarelo" | "verde" | "azul" | "roxo";
export type Marcacao = "escolhida" | "rejeitada";

export const GENEROS: { id: Genero; nome: string }[] = [
  { id: "casamento", nome: "Casamento" },
  { id: "ensaio", nome: "Ensaio e retrato" },
  { id: "familia", nome: "Família e crianças" },
  { id: "evento", nome: "Evento e festa" },
  { id: "esporte", nome: "Esporte" },
  { id: "escola", nome: "Escola e formatura" },
  { id: "recem_nascido", nome: "Recém-nascido" },
  { id: "produto", nome: "Produto" },
  { id: "outro", nome: "Outro" },
];

/** As cores na ordem das teclas 6 a 9 (o roxo fica no menu). */
export const CORES: { id: CorDaFoto; nome: string; tecla?: string }[] = [
  { id: "vermelho", nome: "Vermelho", tecla: "6" },
  { id: "amarelo", nome: "Amarelo", tecla: "7" },
  { id: "verde", nome: "Verde", tecla: "8" },
  { id: "azul", nome: "Azul", tecla: "9" },
  { id: "roxo", nome: "Roxo" },
];

export type Album = {
  id: string;
  nome: string;
  genero: Genero;
  fotos: number;
  prontas: number;
  escolhidas: number;
  capa_midia_id: string | null;
  escolha_opcoes?: Record<string, unknown> | null;
  /** A galeria do cliente (sem o link, que só aparece ao gerar). */
  galeria?: GaleriaDoAlbum | null;
  /** A pasta monitorada. */
  monitorar?: PastaMonitorada | null;
  criado_em: string;
  atualizado_em: string;
};

export type GaleriaDoAlbum = {
  status: "aberta" | "enviada";
  para: string;
  fotos: number;
  favoritas: number;
  expira_em: string;
  pedida_em: string;
  nome: string | null;
  comentario: string | null;
  enviada_em: string | null;
};

export type PastaMonitorada = {
  caminho: string;
  subpastas: boolean;
  analisar: boolean;
  escolher: boolean;
  estilo_pessoal_id: string | null;
  intensidade: number;
  etapa: "olhando" | "importando" | "preparando" | "medindo";
  ultima_volta: string | null;
  ultimas_novas: number;
  erro: string | null;
};

export type Exif = { data?: string; camera?: string; lente?: string; iso?: number; abertura?: number; exposicao?: number; focal?: number };

export type RostoMedido = {
  /** x, y, largura e altura em frações da foto. */
  caixa: [number, number, number, number];
  confianca: number;
  foco: number;
  guinada?: number;
  arfagem?: number;
  /** De 0 (fechado) a 1 (aberto). */
  olho_esq?: number;
  olho_dir?: number;
  sorriso?: number;
  /** De 0 (olhando para o lado) a 1 (para a câmera). */
  olhando?: number;
};

export type Medidas = {
  versao: number;
  foco: { geral: number; melhor_bloco: number };
  exposicao: { mediana: number; estourado: number; afogado: number };
  rostos: RostoMedido[];
  com_vetor_do_modelo: boolean;
};

export type FotoDoAlbum = {
  midia_id: string;
  nome: string;
  status: "enviando" | "processando" | "pronta" | "erro";
  erro: string | null;
  progresso: number | null;
  largura: number | null;
  altura: number | null;
  exif: Exif | null;
  pasta: string;
  nota: number;
  cor: CorDaFoto | null;
  marcacao: Marcacao | null;
  enviado_em: string | null;
  do_album: boolean;
  medidas?: Medidas | null;
  categoria?: Categoria | null;
  grupo?: number | null;
  cena?: number | null;
  nota_ia?: number | null;
  motivo?: string | null;
  /** Os números das pessoas que aparecem na foto (os rostos juntados pelo SFace). */
  pessoas?: number[];
  /** A edição no álbum (lib/album/edicao.ts), desenhada pelo worker. */
  edicao?: EdicaoGuardada | null;
  /** O que o cliente marcou na galeria. */
  cliente?: { favorita: boolean; comentario: string } | null;
};

/** Uma pessoa do álbum: o rosto maior dela representa (a caixa em frações daquela foto). */
export type PessoaDoAlbum = { numero: number; nome: string; fotos: number; capa_midia_id: string; caixa: [number, number, number, number] };

/** As categorias da escolha das melhores (core/modelos/escolha.py), com a cor de cada uma na grade. */
export type Categoria = "destaque" | "escolhida" | "talvez" | "parecida" | "desfocada" | "olhos_fechados";

export const CATEGORIAS: { id: Categoria; nome: string; plural: string }[] = [
  { id: "destaque", nome: "Destaque", plural: "Destaques" },
  { id: "escolhida", nome: "Escolhida", plural: "Escolhidas pela IA" },
  { id: "talvez", nome: "Talvez", plural: "Talvez" },
  { id: "parecida", nome: "Parecida", plural: "Parecidas" },
  { id: "desfocada", nome: "Desfocada", plural: "Desfocadas" },
  { id: "olhos_fechados", nome: "Olhos fechados", plural: "Olhos fechados" },
];

export type Mudanca = { nota?: number; cor?: CorDaFoto; marcacao?: Marcacao; tirar_cor?: boolean; tirar_marcacao?: boolean };

/** A mudança aplicada a uma foto, como o servidor aplica (para a grade mudar antes da resposta). */
export function aplicarMudanca(foto: FotoDoAlbum, mudanca: Mudanca): FotoDoAlbum {
  return {
    ...foto,
    nota: mudanca.nota ?? foto.nota,
    cor: mudanca.tirar_cor ? null : (mudanca.cor ?? foto.cor),
    marcacao: mudanca.tirar_marcacao ? null : (mudanca.marcacao ?? foto.marcacao),
  };
}

export type ComparacaoDaNota = "ao_menos" | "exatamente" | "ate";

export type Filtro = {
  busca: string;
  /** 0: qualquer nota. */
  nota: number;
  comparacao: ComparacaoDaNota;
  cores: CorDaFoto[];
  /** "sem": as que não têm marcação. */
  marcacao: "todas" | Marcacao | "sem";
  pasta: string | null;
  /** As categorias da escolha (vazio: todas). */
  categorias: Categoria[];
  /** As pessoas (vazio: todas as fotos); "alguma": a foto tem pelo menos uma delas, "todas": tem todas juntas. */
  pessoas: number[];
  pessoasModo: "alguma" | "todas";
  /** Só as favoritas do cliente na galeria. */
  doCliente?: boolean;
};

export const FILTRO_VAZIO: Filtro = { busca: "", nota: 0, comparacao: "ao_menos", cores: [], marcacao: "todas", pasta: null, categorias: [], pessoas: [], pessoasModo: "alguma" };

export function filtroAtivo(filtro: Filtro): boolean {
  return (
    Boolean(filtro.busca.trim()) ||
    filtro.nota > 0 ||
    filtro.cores.length > 0 ||
    filtro.marcacao !== "todas" ||
    filtro.pasta !== null ||
    filtro.categorias.length > 0 ||
    filtro.pessoas.length > 0 ||
    Boolean(filtro.doCliente)
  );
}

const semAcento = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filtrarFotos(fotos: FotoDoAlbum[], filtro: Filtro): FotoDoAlbum[] {
  const busca = semAcento(filtro.busca.trim());
  return fotos.filter((foto) => {
    if (busca && !semAcento(`${foto.nome} ${foto.pasta} ${foto.exif?.camera ?? ""}`).includes(busca)) return false;
    if (filtro.nota > 0) {
      if (filtro.comparacao === "ao_menos" && foto.nota < filtro.nota) return false;
      if (filtro.comparacao === "exatamente" && foto.nota !== filtro.nota) return false;
      if (filtro.comparacao === "ate" && foto.nota > filtro.nota) return false;
    }
    if (filtro.cores.length && (!foto.cor || !filtro.cores.includes(foto.cor))) return false;
    if (filtro.marcacao === "sem" && foto.marcacao) return false;
    if (filtro.marcacao !== "todas" && filtro.marcacao !== "sem" && foto.marcacao !== filtro.marcacao) return false;
    if (filtro.pasta !== null && foto.pasta !== filtro.pasta) return false;
    if (filtro.doCliente && !foto.cliente?.favorita) return false;
    if (filtro.categorias.length && (!foto.categoria || !filtro.categorias.includes(foto.categoria))) return false;
    if (filtro.pessoas.length) {
      const nela = foto.pessoas ?? [];
      const tem = (n: number) => nela.includes(n);
      if (filtro.pessoasModo === "todas" ? !filtro.pessoas.every(tem) : !filtro.pessoas.some(tem)) return false;
    }
    return true;
  });
}

export type Ordem = "captura" | "nome" | "envio" | "nota" | "nota_ia";

export const ORDENS: { id: Ordem; nome: string }[] = [
  { id: "captura", nome: "Hora da foto" },
  { id: "nome", nome: "Nome do arquivo" },
  { id: "envio", nome: "Ordem de envio" },
  { id: "nota", nome: "Nota" },
  { id: "nota_ia", nome: "Nota da IA" },
];

const nomes = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/**
 * A hora da foto ordena um ensaio do começo ao fim, mesmo com várias câmeras (sem a hora, vale a do envio, depois o
 * nome). O nome compara os números pelo valor ("IMG_2" antes de "IMG_10"). A nota vai da maior para a menor.
 */
export function ordenarFotos(fotos: FotoDoAlbum[], ordem: Ordem): FotoDoAlbum[] {
  const porNome = (a: FotoDoAlbum, b: FotoDoAlbum) => nomes.compare(`${a.pasta}/${a.nome}`, `${b.pasta}/${b.nome}`);
  const porEnvio = (a: FotoDoAlbum, b: FotoDoAlbum) => (a.enviado_em ?? "￿").localeCompare(b.enviado_em ?? "￿") || porNome(a, b);
  const comparar: Record<Ordem, (a: FotoDoAlbum, b: FotoDoAlbum) => number> = {
    captura: (a, b) => {
      const ha = a.exif?.data, hb = b.exif?.data;
      if (ha && hb) return ha.localeCompare(hb) || porNome(a, b);
      if (ha || hb) return ha ? -1 : 1;
      return porEnvio(a, b);
    },
    nome: porNome,
    envio: porEnvio,
    nota: (a, b) => b.nota - a.nota || comparar.captura(a, b),
    nota_ia: (a, b) => (b.nota_ia ?? -1) - (a.nota_ia ?? -1) || comparar.captura(a, b),
  };
  return [...fotos].sort(comparar[ordem]);
}

export type Contagens = { total: number; prontas: number; processando: number; erros: number; escolhidas: number; rejeitadas: number; comNota: number };

export function contar(fotos: FotoDoAlbum[]): Contagens {
  const c: Contagens = { total: fotos.length, prontas: 0, processando: 0, erros: 0, escolhidas: 0, rejeitadas: 0, comNota: 0 };
  for (const foto of fotos) {
    if (foto.status === "pronta") c.prontas++;
    else if (foto.status === "erro") c.erros++;
    else c.processando++;
    if (foto.marcacao === "escolhida") c.escolhidas++;
    if (foto.marcacao === "rejeitada") c.rejeitadas++;
    if (foto.nota > 0) c.comNota++;
  }
  return c;
}

/** As pastas de onde as fotos vieram (envio de pasta), com quantas fotos cada uma. */
export function pastas(fotos: FotoDoAlbum[]): { pasta: string; fotos: number }[] {
  const conta = new Map<string, number>();
  for (const foto of fotos) conta.set(foto.pasta, (conta.get(foto.pasta) ?? 0) + 1);
  return [...conta].map(([pasta, n]) => ({ pasta, fotos: n })).sort((a, b) => nomes.compare(a.pasta, b.pasta));
}

/**
 * A ação de uma tecla na grade (0 a 5 dão a nota, 6 a 9 a cor, P escolhe, X rejeita, U tira a marcação), ou null.
 * A cor que a foto já tem sai com a mesma tecla, como nos programas de fotos.
 */
export function mudancaDaTecla(tecla: string, atual?: Pick<FotoDoAlbum, "cor">): Mudanca | null {
  if (/^[0-5]$/.test(tecla)) return { nota: Number(tecla) };
  const cor = CORES.find((c) => c.tecla === tecla);
  if (cor) return atual?.cor === cor.id ? { tirar_cor: true } : { cor: cor.id };
  const letra = tecla.toLowerCase();
  if (letra === "p") return { marcacao: "escolhida" };
  if (letra === "x") return { marcacao: "rejeitada" };
  if (letra === "u") return { tirar_marcacao: true };
  return null;
}

/** Quantas colunas cabem na largura, com o tamanho pedido do cartão e o vão entre eles. */
export function colunasDaGrade(largura: number, tamanho: number, vao: number): number {
  return Math.max(1, Math.floor((largura + vao) / (tamanho + vao)));
}

/** As linhas da grade que aparecem (com uma de folga em cima e embaixo), para desenhar só elas. */
export function linhasVisiveis(rolagem: number, altura: number, alturaDaLinha: number, linhas: number): [number, number] {
  const primeira = Math.max(0, Math.floor(rolagem / alturaDaLinha) - 1);
  const ultima = Math.min(linhas, Math.ceil((rolagem + altura) / alturaDaLinha) + 1);
  return [primeira, Math.max(primeira, ultima)];
}

/** A descrição curta da câmera ("ISO 800 · f/2.8 · 1/250 s · 50 mm"), só com o que existe. */
export function resumoDaCamera(exif: Exif | null): string {
  if (!exif) return "";
  const partes: string[] = [];
  if (exif.iso) partes.push(`ISO ${exif.iso}`);
  if (exif.abertura) partes.push(`f/${Number(exif.abertura.toFixed(1))}`);
  if (exif.exposicao) partes.push(exif.exposicao >= 1 ? `${Number(exif.exposicao.toFixed(1))} s` : `1/${Math.round(1 / exif.exposicao)} s`);
  if (exif.focal) partes.push(`${Math.round(exif.focal)} mm`);
  return partes.join(" · ");
}

// -----------------------------------------------
// As medidas em palavras (a gaveta e, depois, a escolha das melhores)
// -----------------------------------------------
/** Olho fechado abaixo disso; sorrindo acima disso (medido nos quadros de teste: aberto 0,74, piscando 0,24). */
export const LIMIAR_OLHO_ABERTO = 0.5;
export const LIMIAR_SORRISO = 0.5;

/** Que fração das fotos medidas do álbum tem o foco abaixo do desta (0 a 1): o foco é relativo ao ensaio. */
export function posicaoDoFoco(foto: FotoDoAlbum, fotos: FotoDoAlbum[]): number | null {
  const valor = foto.medidas?.foco.melhor_bloco;
  if (valor === undefined) return null;
  const todos = fotos.map((f) => f.medidas?.foco.melhor_bloco).filter((v): v is number => v !== undefined);
  if (todos.length < 2) return null;
  return todos.filter((v) => v < valor).length / (todos.length - 1);
}

export function exposicaoEmPalavras(medidas: Medidas): string {
  const { mediana, estourado, afogado } = medidas.exposicao;
  if (estourado > 0.08) return "estourada";
  if (afogado > 0.25 || mediana < 0.15) return "escura";
  if (mediana > 0.85) return "clara demais";
  return "boa";
}

/** O rosto principal (o maior) e como ele está: olhos, sorriso, olhar. */
export function rostoPrincipal(medidas: Medidas): { rosto: RostoMedido; olhosFechados: boolean; sorrindo: boolean; olhando: boolean } | null {
  const rosto = medidas.rostos[0];
  if (!rosto) return null;
  // A média dos dois olhos, como a escolha (core/modelos/escolha.py): um olho só costuma ser a cabeça inclinada
  const olho = ((rosto.olho_esq ?? 1) + (rosto.olho_dir ?? 1)) / 2;
  return { rosto, olhosFechados: olho < LIMIAR_OLHO_ABERTO, sorrindo: (rosto.sorriso ?? 0) >= LIMIAR_SORRISO, olhando: (rosto.olhando ?? 1) >= 0.5 };
}

/** Quantas fotos há em cada categoria da escolha (vazio antes de escolher). */
export function contarCategorias(fotos: FotoDoAlbum[]): Partial<Record<Categoria, number>> {
  const conta: Partial<Record<Categoria, number>> = {};
  for (const foto of fotos) if (foto.categoria) conta[foto.categoria] = (conta[foto.categoria] ?? 0) + 1;
  return conta;
}


// -----------------------------------------------
// As vistas (onda 16.4): o recorte do rosto, o grupo de parecidas, o estado do olho e do foco, a comparação
// -----------------------------------------------
/**
 * O fundo CSS que mostra um rosto num quadrado: a caixa (em frações da foto) vira um quadrado em pixels da foto,
 * com folga em volta, preso dentro dela; o tamanho e a posição do fundo saem em porcentagem, então valem com
 * qualquer arquivo da mesma foto (a capa ou a cópia leve).
 */
export function recorteDoRosto(
  caixa: [number, number, number, number],
  largura: number,
  altura: number,
  folga = 1.6,
): { backgroundSize: string; backgroundPosition: string } {
  const [x, y, w, h] = caixa;
  const lado = Math.min(largura, altura, Math.max(w * largura, h * altura) * folga);
  const cx = (x + w / 2) * largura;
  const cy = (y + h / 2) * altura;
  const esquerda = Math.min(Math.max(0, cx - lado / 2), largura - lado);
  const topo = Math.min(Math.max(0, cy - lado / 2), altura - lado);
  const pos = (inicio: number, total: number) => (total - lado > 0.5 ? (inicio / (total - lado)) * 100 : 0);
  const n = (v: number) => Number(v.toFixed(3));
  return {
    backgroundSize: `${n((largura / lado) * 100)}% ${n((altura / lado) * 100)}%`,
    backgroundPosition: `${n(pos(esquerda, largura))}% ${n(pos(topo, altura))}%`,
  };
}

/** As fotos do mesmo grupo de parecidas (a escolha das melhores), na ordem da hora; só ela, se não houver grupo. */
export function grupoDaFoto(fotos: FotoDoAlbum[], foto: FotoDoAlbum): FotoDoAlbum[] {
  if (foto.grupo === null || foto.grupo === undefined) return [foto];
  return ordenarFotos(
    fotos.filter((f) => f.grupo === foto.grupo),
    "captura",
  );
}

export type EstadoDoOlho = "aberto" | "meio" | "fechado";

/** Os olhos de um rosto em três estados, pela média dos dois (como a escolha). */
export function estadoDoOlho(rosto: RostoMedido): EstadoDoOlho | null {
  if (rosto.olho_esq === undefined && rosto.olho_dir === undefined) return null;
  const media = ((rosto.olho_esq ?? 1) + (rosto.olho_dir ?? 1)) / 2;
  return media < 0.35 ? "fechado" : media < LIMIAR_OLHO_ABERTO ? "meio" : "aberto";
}

export type EstadoDoFoco = "nitido" | "macio" | "borrado";

/** O foco de um rosto comparado à mediana do foco dos rostos do ensaio (o recorte tem sempre o mesmo tamanho). */
export function estadoDoFocoDoRosto(rosto: RostoMedido, fotos: FotoDoAlbum[]): EstadoDoFoco {
  const todos = fotos.flatMap((f) => f.medidas?.rostos.map((r) => r.foco) ?? []).sort((a, b) => a - b);
  if (todos.length < 3) return rosto.foco >= 150 ? "nitido" : rosto.foco >= 60 ? "macio" : "borrado";
  const mediana = todos[Math.floor(todos.length / 2)];
  const razao = rosto.foco / (mediana || 1);
  return razao >= 0.6 ? "nitido" : razao >= 0.3 ? "macio" : "borrado";
}

export const COMPARAR_NO_MAXIMO = 12;

/** Colunas e linhas da comparação de n fotos numa área (a grade que deixa cada foto maior). */
export function gradeDaComparacao(n: number, largura: number, altura: number, proporcao = 1.5): { colunas: number; linhas: number } {
  let melhor = { colunas: 1, linhas: n, lado: 0 };
  for (let colunas = 1; colunas <= n; colunas++) {
    const linhas = Math.ceil(n / colunas);
    const celula = Math.min(largura / colunas / proporcao, altura / linhas);
    if (celula > melhor.lado) melhor = { colunas, linhas, lado: celula };
  }
  return { colunas: melhor.colunas, linhas: melhor.linhas };
}
