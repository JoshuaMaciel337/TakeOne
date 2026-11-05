// O álbum de fotos (onda 16, docs/decisoes/0006-album-de-fotos.md): os tipos e as contas puras da grade (filtrar,
// ordenar, contar, a mudança das notas). As chamadas à API ficam em api.ts.

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
  criado_em: string;
  atualizado_em: string;
};

export type Exif = { data?: string; camera?: string; lente?: string; iso?: number; abertura?: number; exposicao?: number; focal?: number };

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
};

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
};

export const FILTRO_VAZIO: Filtro = { busca: "", nota: 0, comparacao: "ao_menos", cores: [], marcacao: "todas", pasta: null };

export function filtroAtivo(filtro: Filtro): boolean {
  return Boolean(filtro.busca.trim()) || filtro.nota > 0 || filtro.cores.length > 0 || filtro.marcacao !== "todas" || filtro.pasta !== null;
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
    return true;
  });
}

export type Ordem = "captura" | "nome" | "envio" | "nota";

export const ORDENS: { id: Ordem; nome: string }[] = [
  { id: "captura", nome: "Hora da foto" },
  { id: "nome", nome: "Nome do arquivo" },
  { id: "envio", nome: "Ordem de envio" },
  { id: "nota", nome: "Nota" },
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
