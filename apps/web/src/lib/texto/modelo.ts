// O texto do editor de imagem (ADR 0003, onda 13.8), desenhado no navegador com as fontes da biblioteca: parágrafos de
// trechos, cada trecho com o que muda do estilo do texto (fonte, tamanho, cor, espaçamentos, OpenType...). O texto é de
// ponto (as linhas são as que a pessoa digitou, a caixa é medida) ou de parágrafo (a caixa é da pessoa e as linhas
// quebram nela), na horizontal ou na vertical. As posições são índices de caracteres (UTF-16) do texto inteiro, com uma
// quebra ("\n") entre os parágrafos, como num campo de texto.

export type CaixaDasLetras = "normal" | "maiusculas" | "versalete";
export type PosicaoDasLetras = "normal" | "sobrescrito" | "subscrito";
export type Suavizacao = "nenhuma" | "nitida" | "forte" | "suave";

export type EstiloDoCaractere = {
  /** A família no catálogo (/api/fontes), pelo id. */
  familia: string;
  /** 100 a 900: o eixo wght da variável, ou o arquivo de peso mais perto da estática. */
  peso: number;
  italico: boolean;
  /** Em pixels do documento. */
  tamanho: number;
  cor: string;
  /** Em pixels; null é a automática (120% do tamanho). */
  entrelinha: number | null;
  /** O espaço entre as letras, em milésimos do em. */
  tracking: number;
  /** O kerning da fonte (métrica), um acerto pelos contornos (óptico) ou nenhum. */
  kerning: "metrica" | "optico" | "nenhum";
  /** O kerning manual depois deste caractere, em milésimos do em (o par com o seguinte). */
  kern: number;
  escalaH: number;
  escalaV: number;
  /** O deslocamento da linha de base, em pixels (positivo sobe). */
  linhaDeBase: number;
  negritoFalso: boolean;
  italicoFalso: boolean;
  caixa: CaixaDasLetras;
  posicao: PosicaoDasLetras;
  sublinhado: boolean;
  tachado: boolean;
  ligaduras: boolean;
  alternativos: boolean;
  fracoes: boolean;
  ordinais: boolean;
  /** Os outros eixos da fonte variável (wdth, opsz...). */
  eixos: Record<string, number>;
  suavizacao: Suavizacao;
};

export type Alinhamento = "esquerda" | "centro" | "direita" | "justificado-esquerda" | "justificado-centro" | "justificado-direita" | "justificado";

export type EstiloDoParagrafo = {
  alinhamento: Alinhamento;
  /** Em pixels do documento. */
  recuoInicio: number;
  recuoFim: number;
  recuoPrimeira: number;
  espacoAntes: number;
  espacoDepois: number;
  hifenizar: boolean;
};

export type Trecho = { texto: string; estilo: Partial<EstiloDoCaractere> };
export type ParagrafoRico = { trechos: Trecho[]; estilo: Partial<EstiloDoParagrafo> };

export type TextoRico = {
  paragrafos: ParagrafoRico[];
  /** O estilo de base: cada trecho guarda só o que muda dele. */
  estilo: EstiloDoCaractere;
  paragrafo: EstiloDoParagrafo;
  modo: "ponto" | "paragrafo";
  orientacao: "horizontal" | "vertical";
  /**
   * A área do texto em pixels do documento: no parágrafo, a caixa que a pessoa desenhou (as linhas quebram nela); no
   * ponto, o que as letras ocupam (medido a cada mudança).
   */
  caixa: { largura: number; altura: number };
  /** No ponto, onde fica o começo da primeira linha de base dentro da caixa (o texto cresce a partir dele). */
  origem: { x: number; y: number };
};

export const ESTILO_PADRAO: EstiloDoCaractere = {
  familia: "inter",
  peso: 400,
  italico: false,
  tamanho: 48,
  cor: "#000000",
  entrelinha: null,
  tracking: 0,
  kerning: "metrica",
  kern: 0,
  escalaH: 1,
  escalaV: 1,
  linhaDeBase: 0,
  negritoFalso: false,
  italicoFalso: false,
  caixa: "normal",
  posicao: "normal",
  sublinhado: false,
  tachado: false,
  ligaduras: true,
  alternativos: false,
  fracoes: false,
  ordinais: false,
  eixos: {},
  suavizacao: "nitida",
};

export const PARAGRAFO_PADRAO: EstiloDoParagrafo = { alinhamento: "esquerda", recuoInicio: 0, recuoFim: 0, recuoPrimeira: 0, espacoAntes: 0, espacoDepois: 0, hifenizar: false };

/** Um texto novo, de ponto, com uma linha. */
export function textoNovo(conteudo: string, estilo: Partial<EstiloDoCaractere> = {}, modo: TextoRico["modo"] = "ponto"): TextoRico {
  return {
    paragrafos: conteudo.split("\n").map((linha) => ({ trechos: [{ texto: linha, estilo: {} }], estilo: {} })),
    estilo: { ...ESTILO_PADRAO, ...estilo },
    paragrafo: { ...PARAGRAFO_PADRAO },
    modo,
    orientacao: "horizontal",
    caixa: { largura: 1, altura: 1 },
    origem: { x: 0, y: 0 },
  };
}

/** O nome da camada de texto: o começo do texto, como nos editores de imagem. */
export const nomeDoTexto = (texto: TextoRico) => textoCorrido(texto).replace(/\s+/g, " ").trim().slice(0, 40) || "Texto";

/** O texto corrido (os parágrafos separados por "\n"). */
export function textoCorrido(texto: TextoRico): string {
  return texto.paragrafos.map((paragrafo) => paragrafo.trechos.map((trecho) => trecho.texto).join("")).join("\n");
}

/** O estilo de um trecho (o de base com o que muda). */
export const estiloDe = (texto: TextoRico, trecho: Trecho): EstiloDoCaractere => ({ ...texto.estilo, ...trecho.estilo, eixos: { ...texto.estilo.eixos, ...(trecho.estilo.eixos ?? {}) } });
export const estiloDoParagrafo = (texto: TextoRico, paragrafo: ParagrafoRico): EstiloDoParagrafo => ({ ...texto.paragrafo, ...paragrafo.estilo });

const iguais = (a: Partial<EstiloDoCaractere>, b: Partial<EstiloDoCaractere>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/** Junta os trechos vizinhos de estilo igual e tira os vazios (deixa um, para o parágrafo vazio guardar o estilo). */
function juntar(trechos: Trecho[]): Trecho[] {
  const saida: Trecho[] = [];
  for (const trecho of trechos) {
    const ultimo = saida[saida.length - 1];
    if (ultimo && iguais(ultimo.estilo, trecho.estilo)) ultimo.texto += trecho.texto;
    else if (trecho.texto || !saida.length) saida.push({ texto: trecho.texto, estilo: { ...trecho.estilo } });
  }
  const cheios = saida.filter((trecho) => trecho.texto);
  return cheios.length ? cheios : saida.slice(0, 1);
}

/** Os caracteres do texto com o estilo de cada um e a quebra entre os parágrafos (o estilo e o parágrafo da quebra). */
type Letra = { c: string; estilo: Partial<EstiloDoCaractere> } | { quebra: true; paragrafo: Partial<EstiloDoParagrafo>; estilo: Partial<EstiloDoCaractere> };

function letras(texto: TextoRico): Letra[] {
  const saida: Letra[] = [];
  texto.paragrafos.forEach((paragrafo, i) => {
    // Por unidade de UTF-16 (o índice de um campo de texto): um emoji são duas, que voltam juntas ao montar o texto
    for (const trecho of paragrafo.trechos) for (let i = 0; i < trecho.texto.length; i++) saida.push({ c: trecho.texto[i], estilo: trecho.estilo });
    // A quebra leva o estilo do último trecho do parágrafo (o do parágrafo vazio) e o estilo do parágrafo
    if (i < texto.paragrafos.length - 1) saida.push({ quebra: true, paragrafo: paragrafo.estilo, estilo: paragrafo.trechos[paragrafo.trechos.length - 1]?.estilo ?? {} });
  });
  return saida;
}

function deLetras(texto: TextoRico, lista: Letra[], ultimo: { paragrafo: Partial<EstiloDoParagrafo>; estilo: Partial<EstiloDoCaractere> }): TextoRico {
  const paragrafos: ParagrafoRico[] = [];
  let trechos: Trecho[] = [];
  let estiloVazio: Partial<EstiloDoCaractere> = {};
  for (const letra of lista) {
    if ("quebra" in letra) {
      paragrafos.push({ trechos: juntar(trechos.length ? trechos : [{ texto: "", estilo: letra.estilo }]), estilo: letra.paragrafo });
      trechos = [];
      estiloVazio = letra.estilo;
      continue;
    }
    trechos.push({ texto: letra.c, estilo: letra.estilo });
  }
  paragrafos.push({ trechos: juntar(trechos.length ? trechos : [{ texto: "", estilo: paragrafos.length ? estiloVazio : ultimo.estilo }]), estilo: ultimo.paragrafo });
  return { ...texto, paragrafos };
}

/** O estilo do caractere antes de `indice` (o que um texto digitado ali herda); no começo, o do primeiro. */
export function estiloNoIndice(texto: TextoRico, indice: number): Partial<EstiloDoCaractere> {
  const lista = letras(texto);
  const letra = lista[Math.max(0, Math.min(lista.length - 1, indice - 1))];
  return letra?.estilo ?? texto.paragrafos[0]?.trechos[0]?.estilo ?? {};
}

/** Troca o trecho [de, ate) por `inserido` ("\n" quebra o parágrafo), com o estilo dado (ou o de antes de `de`). */
export function substituir(texto: TextoRico, de: number, ate: number, inserido: string, estilo?: Partial<EstiloDoCaractere>): TextoRico {
  const lista = letras(texto);
  const a = Math.max(0, Math.min(de, ate, lista.length));
  const b = Math.max(a, Math.min(Math.max(de, ate), lista.length));
  const herdado = estilo ?? estiloNoIndice(texto, a === 0 && b > 0 ? 1 : a);
  // O parágrafo que a quebra nova fecha guarda o estilo do parágrafo em que ela entrou
  const ultimoParagrafo = texto.paragrafos[texto.paragrafos.length - 1];
  const paragrafoAqui = paragrafoDoIndice(texto, a);
  const novos: Letra[] = [];
  for (let i = 0; i < inserido.length; i++) {
    const c = inserido[i];
    novos.push(c === "\n" ? { quebra: true, paragrafo: texto.paragrafos[paragrafoAqui].estilo, estilo: herdado } : { c, estilo: herdado });
  }
  return deLetras(texto, [...lista.slice(0, a), ...novos, ...lista.slice(b)], { paragrafo: ultimoParagrafo.estilo, estilo: ultimoParagrafo.trechos[ultimoParagrafo.trechos.length - 1]?.estilo ?? {} });
}

/** Aplica uma mudança de estilo aos caracteres de [de, ate) (sem seleção, a quem chama cabe guardar para o próximo). */
export function aplicarEstilo(texto: TextoRico, de: number, ate: number, mudanca: Partial<EstiloDoCaractere>): TextoRico {
  const lista = letras(texto);
  const a = Math.max(0, Math.min(de, ate));
  const b = Math.min(lista.length, Math.max(de, ate));
  const limpar = (estilo: Partial<EstiloDoCaractere>) => {
    // O que fica igual ao de base sai do trecho (o trecho guarda só o que muda)
    const saida: Partial<EstiloDoCaractere> = {};
    for (const [chave, valor] of Object.entries(estilo) as [keyof EstiloDoCaractere, unknown][]) {
      if (JSON.stringify(valor) !== JSON.stringify(texto.estilo[chave])) (saida as Record<string, unknown>)[chave] = valor;
    }
    return saida;
  };
  const novas = lista.map((letra, i) => (i >= a && i < b ? { ...letra, estilo: limpar({ ...letra.estilo, ...mudanca }) } : letra));
  const ultimo = texto.paragrafos[texto.paragrafos.length - 1];
  const fim = b >= lista.length ? limpar({ ...(ultimo.trechos[ultimo.trechos.length - 1]?.estilo ?? {}), ...mudanca }) : (ultimo.trechos[ultimo.trechos.length - 1]?.estilo ?? {});
  // Um parágrafo vazio no fim da seleção também guarda o estilo novo
  return deLetras(texto, novas, { paragrafo: ultimo.estilo, estilo: fim });
}

/** Uma mudança de estilo no texto inteiro: entra no estilo de base e sai dos trechos. */
export function estiloEmTudo(texto: TextoRico, mudanca: Partial<EstiloDoCaractere>): TextoRico {
  const chaves = Object.keys(mudanca) as (keyof EstiloDoCaractere)[];
  const tirar = (estilo: Partial<EstiloDoCaractere>) => {
    const saida = { ...estilo };
    for (const chave of chaves) delete saida[chave];
    return saida;
  };
  return {
    ...texto,
    estilo: { ...texto.estilo, ...mudanca },
    paragrafos: texto.paragrafos.map((paragrafo) => ({ ...paragrafo, trechos: juntar(paragrafo.trechos.map((trecho) => ({ ...trecho, estilo: tirar(trecho.estilo) }))) })),
  };
}

/** Uma mudança de parágrafo no texto inteiro. */
export function paragrafoEmTudo(texto: TextoRico, mudanca: Partial<EstiloDoParagrafo>): TextoRico {
  const chaves = Object.keys(mudanca) as (keyof EstiloDoParagrafo)[];
  return {
    ...texto,
    paragrafo: { ...texto.paragrafo, ...mudanca },
    paragrafos: texto.paragrafos.map((paragrafo) => {
      const estilo = { ...paragrafo.estilo };
      for (const chave of chaves) delete estilo[chave];
      return { ...paragrafo, estilo };
    }),
  };
}

/** O parágrafo em que fica o índice. */
export function paragrafoDoIndice(texto: TextoRico, indice: number): number {
  let inicio = 0;
  for (let i = 0; i < texto.paragrafos.length; i++) {
    const tamanho = texto.paragrafos[i].trechos.reduce((soma, trecho) => soma + trecho.texto.length, 0);
    if (indice <= inicio + tamanho) return i;
    inicio += tamanho + 1;
  }
  return texto.paragrafos.length - 1;
}

/** Aplica uma mudança de estilo de parágrafo aos parágrafos que [de, ate) toca. */
export function aplicarParagrafo(texto: TextoRico, de: number, ate: number, mudanca: Partial<EstiloDoParagrafo>): TextoRico {
  const a = paragrafoDoIndice(texto, Math.min(de, ate));
  const b = paragrafoDoIndice(texto, Math.max(de, ate));
  return { ...texto, paragrafos: texto.paragrafos.map((paragrafo, i) => (i >= a && i <= b ? { ...paragrafo, estilo: { ...paragrafo.estilo, ...mudanca } } : paragrafo)) };
}

/** O estilo comum dos caracteres de [de, ate) (o que muda entre eles fica de fora: o painel mostra em branco). */
export function estiloComum(texto: TextoRico, de: number, ate: number): Partial<EstiloDoCaractere> {
  const lista = letras(texto);
  const a = Math.max(0, Math.min(de, ate));
  const b = Math.min(lista.length, Math.max(de, ate));
  const estilos = (b > a ? lista.slice(a, b) : [{ estilo: estiloNoIndice(texto, a) }]).map((letra) => ({ ...texto.estilo, ...letra.estilo }) as EstiloDoCaractere);
  const comum: Partial<EstiloDoCaractere> = { ...estilos[0] };
  for (const estilo of estilos.slice(1)) {
    for (const chave of Object.keys(comum) as (keyof EstiloDoCaractere)[]) if (JSON.stringify(comum[chave]) !== JSON.stringify(estilo[chave])) delete comum[chave];
  }
  return comum;
}
