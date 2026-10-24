// Os documentos abertos do editor de imagem, em abas (ADR 0003, onda 13.14): a lista fica no navegador, abrir um
// documento põe a aba dele no fim, fechar escolhe a aba vizinha e Ctrl+F6 anda entre elas. Cada aba guarda o id e o
// nome que o documento tinha da última vez que foi aberto.

export type DocumentoAberto = { id: string; nome: string };

export const MAXIMO_DE_DOCUMENTOS = 20;
const CHAVE = "takeone-documentos-abertos";

/** Abre (ou atualiza o nome de) um documento; passando do máximo, a aba mais antiga que não é ela sai. */
export function abrirDocumento(lista: DocumentoAberto[], documento: DocumentoAberto): DocumentoAberto[] {
  const existe = lista.some((item) => item.id === documento.id);
  if (existe) return lista.some((item) => item.id === documento.id && item.nome !== documento.nome) ? lista.map((item) => (item.id === documento.id ? { ...item, nome: documento.nome } : item)) : lista;
  const nova = [...lista, documento];
  return nova.length > MAXIMO_DE_DOCUMENTOS ? nova.slice(nova.length - MAXIMO_DE_DOCUMENTOS) : nova;
}

/** Fecha uma aba: a seguinte fica no lugar dela (ou a anterior, quando era a última). */
export function fecharDocumento(lista: DocumentoAberto[], id: string): { lista: DocumentoAberto[]; proximo: string | null } {
  const indice = lista.findIndex((item) => item.id === id);
  if (indice < 0) return { lista, proximo: null };
  const nova = lista.filter((item) => item.id !== id);
  return { lista: nova, proximo: nova[Math.min(indice, nova.length - 1)]?.id ?? null };
}

/** A aba seguinte (1) ou a anterior (-1), dando a volta. */
export function documentoVizinho(lista: DocumentoAberto[], id: string, sentido: 1 | -1): string | null {
  if (lista.length < 2) return null;
  const indice = lista.findIndex((item) => item.id === id);
  if (indice < 0) return lista[0].id;
  return lista[(indice + sentido + lista.length) % lista.length].id;
}

/** A lista guardada, conferida (o navegador pode guardar qualquer coisa ali). */
export function lerDocumentos(texto: string | null): DocumentoAberto[] {
  try {
    const lida = JSON.parse(texto ?? "[]") as unknown;
    if (!Array.isArray(lida)) return [];
    const vistos = new Set<string>();
    return lida
      .filter((item): item is DocumentoAberto => typeof item?.id === "string" && /^[0-9a-f]{24}$/.test(item.id) && typeof item.nome === "string")
      .filter((item) => !vistos.has(item.id) && Boolean(vistos.add(item.id)))
      .slice(-MAXIMO_DE_DOCUMENTOS)
      .map((item) => ({ id: item.id, nome: item.nome.slice(0, 120) }));
  } catch {
    return [];
  }
}

// ——— O armazém: a lista do navegador, que as abas assinam ———
let lista: DocumentoAberto[] | null = null;
const ouvintes = new Set<() => void>();
const VAZIA: DocumentoAberto[] = [];

function carregar(): DocumentoAberto[] {
  if (lista) return lista;
  try {
    lista = lerDocumentos(localStorage.getItem(CHAVE));
  } catch {
    lista = [];
  }
  return lista;
}

export function documentosAbertos(): DocumentoAberto[] {
  return typeof window === "undefined" ? VAZIA : carregar();
}

export const documentosNoServidor = () => VAZIA;

export function mudarDocumentos(nova: DocumentoAberto[]) {
  if (nova === lista) return;
  lista = nova;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(nova));
  } catch {
    // Sem armazenamento (janela privada): as abas valem até recarregar
  }
  for (const ouvinte of ouvintes) ouvinte();
}

export function assinarDocumentos(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  // Outra aba do navegador mudou a lista
  const aoGuardar = (evento: StorageEvent) => {
    if (evento.key !== CHAVE) return;
    lista = lerDocumentos(evento.newValue);
    ouvinte();
  };
  window.addEventListener("storage", aoGuardar);
  return () => {
    ouvintes.delete(ouvinte);
    window.removeEventListener("storage", aoGuardar);
  };
}
