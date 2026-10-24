// A disposição do texto do editor de imagem (ADR 0003, onda 13.8): cada trecho formatado pela fonte dele (o fontkit faz
// as ligaduras, o kerning e os recursos OpenType), as linhas quebradas na caixa (no texto de parágrafo), a entrelinha,
// os espaços dos parágrafos, o alinhamento e a justificação, o texto vertical, os sublinhados e tachados, a posição de
// cada caractere (o cursor) e o retângulo do que aparece. A fonte entra por uma interface, para os testes usarem uma de
// mentira; lib/texto/fontes.ts liga ela ao fontkit.
import { type EstiloDoCaractere, type EstiloDoParagrafo, estiloDe, estiloDoParagrafo, type TextoRico } from "./modelo.ts";
import { faixaNaArea, poligonoDaArea } from "./caminho.ts";

export type GlifoFormatado = {
  id: number;
  /** O avanço e o deslocamento, em unidades da fonte. */
  avanco: number;
  dx: number;
  dy: number;
  /** Quantas unidades de UTF-16 do texto o glifo cobre (uma ligadura cobre várias). */
  letras: number;
  /** O contorno (o atributo d de um caminho SVG), em unidades da fonte com o y para cima. */
  caminho: () => string;
  /** A tinta do glifo, em unidades da fonte (y para cima). */
  caixa: { x0: number; y0: number; x1: number; y1: number };
};

export interface FonteCarregada {
  /** A chave da fonte (o arquivo e os eixos): quem desenha guarda os caminhos por ela. */
  chave: string;
  unidades: number;
  ascendente: number;
  descendente: number;
  sublinhado: { posicao: number; espessura: number };
  tachado: { posicao: number; espessura: number };
  formatar(texto: string, recursos: Record<string, boolean>): GlifoFormatado[];
  temRecurso(tag: string): boolean;
}

/** A fonte de um estilo (null enquanto ela não carregou). */
export type Fontes = (estilo: EstiloDoCaractere) => FonteCarregada | null;

export type GlifoPosto = {
  fonte: FonteCarregada;
  glifo: GlifoFormatado;
  /** A origem do glifo (a linha de base), em pixels do documento. */
  x: number;
  y: number;
  /** Pixels por unidade da fonte em cada eixo. */
  escalaX: number;
  escalaY: number;
  cor: string;
  negrito: boolean;
  italico: boolean;
  /** O primeiro caractere do texto que o glifo cobre. */
  indice: number;
  /** O giro do toque no texto, em radianos (horário), em volta do meio da caixa do glifo. */
  giro: number;
};

const INCLINACAO_DO_ITALICO = Math.tan((12 * Math.PI) / 180);

/**
 * A matriz do glifo: de um ponto da fonte (unidades, y para cima) ao ponto da disposição, com a escala, a inclinação
 * do itálico falso e o giro do toque no texto. É a conta do desenho (setTransform), dos contornos e da medida.
 */
export function matrizDoGlifo(g: GlifoPosto): { a: number; b: number; c: number; d: number; e: number; f: number } {
  const k = g.italico ? INCLINACAO_DO_ITALICO * g.escalaY : 0;
  if (!g.giro) return { a: g.escalaX, b: 0, c: k, d: -g.escalaY, e: g.x, f: g.y };
  const cos = Math.cos(g.giro);
  const sen = Math.sin(g.giro);
  const caixa = g.glifo.caixa;
  const cx = ((caixa.x0 + caixa.x1) / 2) * g.escalaX;
  const cy = (-(caixa.y0 + caixa.y1) / 2) * g.escalaY;
  return {
    a: cos * g.escalaX,
    b: sen * g.escalaX,
    c: cos * k + sen * g.escalaY,
    d: sen * k - cos * g.escalaY,
    e: g.x + cx - (cos * cx - sen * cy),
    f: g.y + cy - (sen * cx + cos * cy),
  };
}

/** Os quatro cantos da caixa do glifo na disposição (com o giro e o itálico). */
export function cantosDoGlifo(g: GlifoPosto, folga = 0): { x: number; y: number }[] {
  const m = matrizDoGlifo(g);
  const c = g.glifo.caixa;
  // A folga é em pixels: nas unidades da fonte, dividida pela escala
  const fx = folga / Math.max(1e-9, g.escalaX);
  const fy = folga / Math.max(1e-9, g.escalaY);
  return [
    [c.x0 - fx, c.y1 + fy],
    [c.x1 + fx, c.y1 + fy],
    [c.x1 + fx, c.y0 - fy],
    [c.x0 - fx, c.y0 - fy],
  ].map(([x, y]) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }));
}
export type Risco = { x0: number; x1: number; y: number; espessura: number; cor: string };
export type LinhaPosta = { inicio: number; fim: number; baseX: number; baseY: number; ascendente: number; descendente: number; largura: number };

export type Disposicao = {
  glifos: GlifoPosto[];
  riscos: Risco[];
  linhas: LinhaPosta[];
  /** Onde fica o cursor antes de cada caractere (e depois do último): a linha de base, a altura e a linha. */
  cursores: { x: number; y: number; ascendente: number; descendente: number; linha: number }[];
  /** O que aparece (as tintas e os riscos), em pixels do documento. */
  limites: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Faltou alguma fonte (a disposição ainda não vale). */
  incompleta: boolean;
};

type Atomo = {
  fonte: FonteCarregada;
  glifo: GlifoFormatado;
  indice: number;
  avanco: number;
  /** A distância vertical (texto vertical) que ele ocupa. */
  alto: number;
  escalaX: number;
  escalaY: number;
  subida: number;
  estilo: EstiloDoCaractere;
  espaco: boolean;
  quebraDepois: boolean;
  /** O caractere (o primeiro, numa ligadura). */
  c: string;
  /** O hífen posto pela hifenização (não é um caractere do texto: o cursor não para nele). */
  hifen?: boolean;
};

const ESPACOS = new Set([" ", " ", "\t", " ", " ", " "]);

/** Onde uma palavra portuguesa pode ser hifenizada (entre sílabas, com duas letras de cada lado, no mínimo). */
export function pontosDeHifen(palavra: string): number[] {
  const vogal = (c: string) => /[aeiouáéíóúâêôãõàü]/i.test(c);
  const letra = (c: string) => /\p{L}/u.test(c);
  const encontros = new Set(["bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "pl", "pr", "tr", "vr", "ch", "lh", "nh", "gu", "qu"]);
  const pontos: number[] = [];
  for (let i = 1; i < palavra.length - 1; i++) {
    const a = palavra[i - 1];
    const b = palavra[i];
    const c = palavra[i + 1];
    if (!letra(a) || !letra(b) || !letra(c)) continue;
    // V-CV (pa-to) e VC-CV (par-te), sem separar os encontros que ficam juntos (ca-bra, ma-lha)
    if (vogal(a) && !vogal(b) && vogal(c)) pontos.push(i);
    else if (!vogal(a) && !vogal(b) && vogal(c) && i >= 2 && !encontros.has((a + b).toLowerCase())) pontos.push(i);
    // V-CCV com o encontro que não se separa (pala-vra, ca-bra): a quebra vem antes dele
    else if (vogal(a) && !vogal(b) && !vogal(c) && encontros.has((b + c).toLowerCase()) && vogal(palavra[i + 2] ?? "")) pontos.push(i);
  }
  return pontos.filter((p) => p >= 2 && palavra.length - p >= 2);
}

/** As letras do trecho como saem (caixa alta, versalete sem o recurso) e a escala de cada uma. */
function letrasDoTrecho(texto: string, estilo: EstiloDoCaractere, fonte: FonteCarregada): { texto: string; escala: number[] } {
  let saida = "";
  const escala: number[] = [];
  const versaleteFalso = estilo.caixa === "versalete" && !fonte.temRecurso("smcp");
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    const maiuscula = c.toUpperCase();
    const trocar = (estilo.caixa === "maiusculas" || versaleteFalso) && maiuscula.length === 1;
    saida += trocar ? maiuscula : c;
    escala.push(versaleteFalso && maiuscula.length === 1 && maiuscula !== c ? 0.78 : 1);
  }
  return { texto: saida, escala };
}

/** Os átomos (glifos com o tamanho em pixels) de um trecho, a partir do índice do primeiro caractere. */
function atomosDoTrecho(texto: string, estilo: EstiloDoCaractere, fonte: FonteCarregada, inicio: number, vertical: boolean): Atomo[] {
  const recursos: Record<string, boolean> = {
    liga: estilo.ligaduras,
    clig: estilo.ligaduras,
    kern: estilo.kerning === "metrica",
    salt: estilo.alternativos,
    frac: estilo.fracoes,
    ordn: estilo.ordinais,
    smcp: estilo.caixa === "versalete" && fonte.temRecurso("smcp"),
  };
  // Sobrescrito e subscrito: o recurso da fonte, ou a letra menor e deslocada
  const posicaoReal = estilo.posicao !== "normal" && fonte.temRecurso(estilo.posicao === "sobrescrito" ? "sups" : "subs");
  if (posicaoReal) recursos[estilo.posicao === "sobrescrito" ? "sups" : "subs"] = true;
  const posicaoFalsa = estilo.posicao !== "normal" && !posicaoReal;
  const { texto: letras, escala } = letrasDoTrecho(texto, estilo, fonte);
  const glifos = fonte.formatar(letras, recursos);
  const atomos: Atomo[] = [];
  let indice = inicio;
  for (const glifo of glifos) {
    const reducao = (posicaoFalsa ? 0.583 : 1) * (escala[indice - inicio] ?? 1);
    const pxPorUnidade = (estilo.tamanho / fonte.unidades) * reducao;
    const escalaX = pxPorUnidade * estilo.escalaH;
    const escalaY = pxPorUnidade * estilo.escalaV;
    const c = texto[indice - inicio] ?? "";
    const tracking = (estilo.tracking * estilo.tamanho) / 1000;
    const subida = estilo.linhaDeBase + (posicaoFalsa ? (estilo.posicao === "sobrescrito" ? 0.333 : -0.15) * estilo.tamanho : 0);
    atomos.push({
      fonte,
      glifo,
      indice,
      avanco: glifo.avanco * escalaX + tracking,
      alto: estilo.tamanho * estilo.escalaV * reducao + tracking,
      escalaX,
      escalaY,
      subida,
      estilo,
      espaco: ESPACOS.has(c),
      quebraDepois: ESPACOS.has(c) || c === "-" || c === "­" || c === "/",
      c,
    });
    indice += Math.max(0, glifo.letras);
  }
  void vertical;
  return atomos;
}

/**
 * Hifeniza a palavra que passou da linha: o último ponto de sílaba (pontosDeHifen) em que ela, com o hífen, ainda cabe.
 * Devolve quantos átomos ficam na linha e o hífen; null quando não cabe nenhum pedaço.
 */
function hifenizar(atual: Atomo[], seguintes: Atomo[], inicioDaPalavra: number, limite: number, medida: (atomo: Atomo) => number): { corte: number; hifen: Atomo } | null {
  // A palavra inteira (o que já entrou na linha e o resto dela, que ainda vem), para achar as sílabas
  const palavra: Atomo[] = [];
  for (const atomo of [...atual.slice(inicioDaPalavra), ...seguintes]) {
    if (atomo.glifo.letras !== 1 || atomo.espaco) break;
    palavra.push(atomo);
  }
  if (palavra.length < 5) return null;
  const antes = atual.slice(0, inicioDaPalavra).reduce((soma, atomo) => soma + medida(atomo), 0);
  const base = palavra[0];
  const [glifoDoHifen] = base.fonte.formatar("-", {});
  if (!glifoDoHifen) return null;
  const hifenLargura = glifoDoHifen.avanco * base.escalaX;
  const pontos = pontosDeHifen(palavra.map((atomo) => atomo.c).join(""));
  const naLinha = atual.length - inicioDaPalavra;
  for (let k = pontos.length - 1; k >= 0; k--) {
    const p = pontos[k];
    if (p > naLinha) continue;
    const largura = antes + palavra.slice(0, p).reduce((soma, atomo) => soma + medida(atomo), 0) + hifenLargura;
    if (largura <= limite) {
      const anterior = palavra[p - 1];
      return { corte: inicioDaPalavra + p, hifen: { ...anterior, glifo: glifoDoHifen, avanco: hifenLargura, espaco: false, quebraDepois: false, c: "-", hifen: true } };
    }
  }
  return null;
}

/** O kerning óptico: aproxima o vão entre as tintas vizinhas do vão médio da fonte ("nn"). */
function kerningOptico(atomos: Atomo[]): void {
  for (let i = 0; i + 1 < atomos.length; i++) {
    const a = atomos[i];
    const b = atomos[i + 1];
    if (a.estilo.kerning !== "optico" || b.estilo.kerning !== "optico" || a.fonte !== b.fonte || a.espaco || b.espaco) continue;
    const ca = a.glifo.caixa;
    const cb = b.glifo.caixa;
    if (ca.x1 <= ca.x0 || cb.x1 <= cb.x0) continue;
    const vao = (a.glifo.avanco - ca.x1 + cb.x0) * a.escalaX;
    const alvo = a.fonte.unidades * 0.06 * a.escalaX;
    a.avanco += (alvo - vao) * 0.5;
  }
}

/** O kerning manual do caractere (o par com o seguinte). */
function kerningManual(atomos: Atomo[]): void {
  for (const atomo of atomos) if (atomo.estilo.kern) atomo.avanco += (atomo.estilo.kern * atomo.estilo.tamanho) / 1000;
}

const entrelinhaDe = (estilo: EstiloDoCaractere) => estilo.entrelinha ?? estilo.tamanho * 1.2;

/**
 * A disposição do texto. As coordenadas são do texto: no de ponto, a origem é o começo da primeira linha de base; no de
 * parágrafo, o canto de cima à esquerda da caixa.
 */
export function disporTexto(texto: TextoRico, fontes: Fontes): Disposicao {
  const vertical = texto.orientacao === "vertical";
  const paragrafo = texto.modo === "paragrafo";
  const glifos: GlifoPosto[] = [];
  const riscos: Risco[] = [];
  const linhas: LinhaPosta[] = [];
  const cursores: Disposicao["cursores"] = [];
  let incompleta = false;
  let indice = 0;
  // O avanço na direção das linhas (y no horizontal, x para a esquerda no vertical)
  let posicaoDaLinha = 0;
  let primeiraLinha = true;
  texto.paragrafos.forEach((p, numeroDoParagrafo) => {
    const estiloP: EstiloDoParagrafo = estiloDoParagrafo(texto, p);
    // Os átomos do parágrafo
    const atomos: Atomo[] = [];
    let estiloDoFim = estiloDe(texto, p.trechos[p.trechos.length - 1] ?? { texto: "", estilo: {} });
    for (const trecho of p.trechos) {
      const estilo = estiloDe(texto, trecho);
      estiloDoFim = estilo;
      const fonte = fontes(estilo);
      if (!fonte) {
        incompleta = true;
        indice += trecho.texto.length;
        continue;
      }
      if (trecho.texto) atomos.push(...atomosDoTrecho(trecho.texto, estilo, fonte, indice, vertical));
      indice += trecho.texto.length;
    }
    kerningOptico(atomos);
    kerningManual(atomos);
    const inicioDoParagrafo = indice - p.trechos.reduce((soma, trecho) => soma + trecho.texto.length, 0);
    if (!primeiraLinha) posicaoDaLinha += estiloP.espacoAntes;
    // As linhas do parágrafo (no de parágrafo, quebradas na caixa)
    const medida = (atomo: Atomo) => (vertical ? atomo.alto : atomo.avanco);
    // Dentro de uma forma, cada linha tem o trecho de dentro dela na altura em que cai (pela entrelinha do começo do
    // parágrafo; a altura sem trecho é pulada); fora dela, a caixa inteira
    const area = paragrafo && !vertical && texto.caminho?.tipo === "area" ? poligonoDaArea(texto.caminho) : null;
    const estiloDoComeco = estiloDe(texto, p.trechos[0] ?? { texto: "", estilo: {} });
    const passo = entrelinhaDe(estiloDoComeco);
    const subida = estiloDoComeco.tamanho * 0.8;
    const descida = estiloDoComeco.tamanho * 0.25;
    const inicioDasLinhas = primeiraLinha ? subida : posicaoDaLinha + estiloP.espacoAntes + passo;
    const faixas: { x0: number; largura: number; base: number }[] = [];
    const faixa = (linha: number) => {
      if (!area) return { x0: 0, largura: vertical ? texto.caixa.altura : texto.caixa.largura, base: NaN };
      for (let k = faixas.length; k <= linha; k++) {
        let base = k === 0 ? inicioDasLinhas : faixas[k - 1].base + passo;
        let achada = faixaNaArea(area, base - subida, base + descida);
        while (!achada && base < texto.caixa.altura) {
          base += passo / 4;
          achada = faixaNaArea(area, base - subida, base + descida);
        }
        // O que não cabe mais na forma fica abaixo da caixa (não aparece, como o resto do parágrafo que passa dela)
        faixas.push(achada ? { x0: achada.x0, largura: achada.x1 - achada.x0, base } : { x0: 0, largura: texto.caixa.largura, base: Math.max(base, texto.caixa.altura + subida + descida) });
      }
      return faixas[linha];
    };
    const disponivel = (linha: number) => faixa(linha).largura - estiloP.recuoInicio - estiloP.recuoFim - (linha === 0 ? estiloP.recuoPrimeira : 0);
    const grupos: Atomo[][] = [];
    if (!paragrafo) grupos.push(atomos);
    else {
      let atual: Atomo[] = [];
      let largura = 0;
      let ultimaQuebra = -1;
      for (let k = 0; k < atomos.length; k++) {
        const atomo = atomos[k];
        atual.push(atomo);
        largura += medida(atomo);
        if (atomo.quebraDepois) ultimaQuebra = atual.length - 1;
        const limite = disponivel(grupos.length);
        // Os espaços no fim não contam: a palavra que passou é hifenizada (se pedido) ou vai inteira para a linha de
        // baixo; sem onde quebrar, ela é cortada
        if (largura > limite && atual.length > 1 && !atomo.espaco) {
          const tentativa = estiloP.hifenizar ? hifenizar(atual, atomos.slice(k + 1), ultimaQuebra + 1, limite, medida) : null;
          let corte = tentativa ? tentativa.corte : ultimaQuebra >= 0 ? ultimaQuebra + 1 : atual.length - 1;
          if (corte <= 0 || corte > atual.length) corte = atual.length - 1;
          grupos.push(tentativa ? [...atual.slice(0, corte), tentativa.hifen] : atual.slice(0, corte));
          atual = atual.slice(corte);
          largura = atual.reduce((soma, item) => soma + medida(item), 0);
          ultimaQuebra = -1;
          atual.forEach((item, i) => item.quebraDepois && (ultimaQuebra = i));
        }
      }
      grupos.push(atual);
    }
    grupos.forEach((grupo, numeroDaLinha) => {
      const primeiraDoParagrafo = numeroDaLinha === 0;
      const ultimaDoParagrafo = numeroDaLinha === grupos.length - 1;
      const estilosDaLinha = grupo.length ? grupo.map((atomo) => atomo.estilo) : [estiloDoFim];
      const fontesDaLinha = grupo.length ? grupo.map((atomo) => atomo.fonte) : [fontes(estiloDoFim)].filter((f): f is FonteCarregada => Boolean(f));
      const ascendente = Math.max(...estilosDaLinha.map((estilo, i) => ((fontesDaLinha[i] ?? fontesDaLinha[0])?.ascendente ?? 0.9 * (fontesDaLinha[0]?.unidades ?? 1)) * (estilo.tamanho / ((fontesDaLinha[i] ?? fontesDaLinha[0])?.unidades ?? 1))), 0);
      const descendente = Math.max(...estilosDaLinha.map((estilo, i) => -((fontesDaLinha[i] ?? fontesDaLinha[0])?.descendente ?? -0.25 * (fontesDaLinha[0]?.unidades ?? 1)) * (estilo.tamanho / ((fontesDaLinha[i] ?? fontesDaLinha[0])?.unidades ?? 1))), 0);
      const entrelinha = Math.max(...estilosDaLinha.map(entrelinhaDe));
      // A primeira linha do texto fica na origem (ponto) ou com a subida dentro da caixa (parágrafo)
      if (primeiraLinha) posicaoDaLinha = paragrafo ? (vertical ? texto.caixa.largura - entrelinha / 2 : ascendente) : 0;
      else posicaoDaLinha += vertical ? -entrelinha : entrelinha;
      if (vertical && primeiraLinha && !paragrafo) posicaoDaLinha = 0;
      // Dentro de uma forma, a linha fica na altura em que o trecho dela foi achado
      if (area) posicaoDaLinha = faixa(numeroDaLinha).base;
      primeiraLinha = false;
      // Os espaços do fim da linha não contam para o alinhamento
      let ocupados = grupo.length;
      while (ocupados > 0 && grupo[ocupados - 1].espaco) ocupados--;
      const comprimento = grupo.slice(0, ocupados).reduce((soma, atomo) => soma + medida(atomo), 0);
      const recuo = (area ? faixa(numeroDaLinha).x0 : 0) + estiloP.recuoInicio + (primeiraDoParagrafo ? estiloP.recuoPrimeira : 0);
      const espacoTotal = paragrafo ? disponivel(numeroDaLinha) : 0;
      const sobra = Math.max(0, espacoTotal - comprimento);
      const al = estiloP.alinhamento;
      const justificar = paragrafo && al.startsWith("justificado") && (!ultimaDoParagrafo || al === "justificado");
      const espacosDaLinha = grupo.slice(0, ocupados).filter((atomo) => atomo.espaco).length;
      const extra = justificar && espacosDaLinha ? sobra / espacosDaLinha : 0;
      const alinhamentoDaSobra = justificar ? "esquerda" : al === "justificado-centro" ? "centro" : al === "justificado-direita" ? "direita" : al.startsWith("justificado") ? "esquerda" : al;
      // No texto de ponto, o alinhamento é em volta da origem (centro: a origem no meio da linha)
      const deslocamento = paragrafo
        ? recuo + (alinhamentoDaSobra === "centro" ? sobra / 2 : alinhamentoDaSobra === "direita" ? sobra : 0)
        : recuo + (al === "centro" || al === "justificado-centro" ? -comprimento / 2 : al === "direita" || al === "justificado-direita" ? -comprimento : 0);
      let avancado = deslocamento;
      const inicioDaLinha = grupo[0]?.indice ?? inicioDoParagrafo;
      const baseX = vertical ? posicaoDaLinha : deslocamento;
      const baseY = vertical ? deslocamento : posicaoDaLinha;
      // Os riscos (sublinhado e tachado) por trecho seguido de estilo igual
      for (const atomo of grupo) {
        const x = vertical ? posicaoDaLinha - (atomo.glifo.avanco * atomo.escalaX) / 2 : avancado;
        const y = vertical ? avancado + ascendente * 0.85 : posicaoDaLinha;
        glifos.push({
          fonte: atomo.fonte,
          glifo: atomo.glifo,
          x: x + atomo.glifo.dx * atomo.escalaX + (atomo.estilo.deslocamento ?? 0),
          y: y - atomo.subida - atomo.glifo.dy * atomo.escalaY,
          escalaX: atomo.escalaX,
          escalaY: atomo.escalaY,
          cor: atomo.estilo.cor,
          negrito: atomo.estilo.negritoFalso,
          italico: atomo.estilo.italicoFalso,
          indice: atomo.indice,
          giro: ((atomo.estilo.giro ?? 0) * Math.PI) / 180,
        });
        // O cursor de cada caractere do glifo (a ligadura reparte o avanço); o hífen da hifenização não tem
        const passos = atomo.hifen ? 0 : atomo.glifo.letras;
        const passo = (medida(atomo) + (atomo.espaco ? extra : 0)) / Math.max(1, passos);
        for (let q = 0; q < passos; q++) {
          cursores[atomo.indice + q] = vertical
            ? { x: posicaoDaLinha, y: avancado + passo * q, ascendente: entrelinha / 2, descendente: entrelinha / 2, linha: linhas.length }
            : { x: avancado + passo * q, y: posicaoDaLinha, ascendente, descendente, linha: linhas.length };
        }
        if (!vertical && (atomo.estilo.sublinhado || atomo.estilo.tachado)) {
          const fim = avancado + medida(atomo) + (atomo.espaco ? extra : 0);
          const pxPorUnidade = atomo.estilo.tamanho / atomo.fonte.unidades;
          if (atomo.estilo.sublinhado) riscos.push({ x0: avancado, x1: fim, y: posicaoDaLinha - atomo.fonte.sublinhado.posicao * pxPorUnidade, espessura: Math.max(1, atomo.fonte.sublinhado.espessura * pxPorUnidade), cor: atomo.estilo.cor });
          if (atomo.estilo.tachado) riscos.push({ x0: avancado, x1: fim, y: posicaoDaLinha - atomo.subida - atomo.fonte.tachado.posicao * pxPorUnidade, espessura: Math.max(1, atomo.fonte.tachado.espessura * pxPorUnidade), cor: atomo.estilo.cor });
        }
        avancado += medida(atomo) + (atomo.espaco ? extra : 0);
      }
      const reais = grupo.filter((atomo) => !atomo.hifen);
      const fimDaLinha = reais.length ? reais[reais.length - 1].indice + Math.max(1, reais[reais.length - 1].glifo.letras) : inicioDaLinha;
      linhas.push({ inicio: inicioDaLinha, fim: fimDaLinha, baseX, baseY, ascendente, descendente, largura: comprimento });
      // O cursor no fim da linha (o último caractere do parágrafo, ou a quebra automática)
      if (ultimaDoParagrafo) {
        cursores[fimDaLinha] = vertical
          ? { x: posicaoDaLinha, y: avancado, ascendente: entrelinha / 2, descendente: entrelinha / 2, linha: linhas.length - 1 }
          : { x: avancado, y: posicaoDaLinha, ascendente, descendente, linha: linhas.length - 1 };
      }
    });
    posicaoDaLinha += estiloP.espacoDepois;
    // A quebra do parágrafo
    indice += numeroDoParagrafo < texto.paragrafos.length - 1 ? 1 : 0;
  });
  // Os cursores que faltam (caracteres sem fonte ainda) ficam no anterior
  for (let i = 0; i <= indice; i++) if (!cursores[i]) cursores[i] = cursores[i - 1] ?? { x: 0, y: 0, ascendente: 0, descendente: 0, linha: 0 };
  let limites: Disposicao["limites"] = null;
  const somar = (x0: number, y0: number, x1: number, y1: number) => {
    limites = limites ? { x0: Math.min(limites.x0, x0), y0: Math.min(limites.y0, y0), x1: Math.max(limites.x1, x1), y1: Math.max(limites.y1, y1) } : { x0, y0, x1, y1 };
  };
  for (const g of glifos) {
    const c = g.glifo.caixa;
    if (c.x1 <= c.x0 && c.y1 <= c.y0) continue;
    // A inclinação do itálico falso e o negrito falso alargam a tinta
    const folga = g.negrito ? g.escalaX * g.fonte.unidades * 0.02 : 0;
    if (g.giro) {
      // A letra girada: os cantos da caixa dela
      const cantos = cantosDoGlifo(g, folga);
      somar(Math.min(...cantos.map((p) => p.x)), Math.min(...cantos.map((p) => p.y)), Math.max(...cantos.map((p) => p.x)), Math.max(...cantos.map((p) => p.y)));
      continue;
    }
    const inclinacao = g.italico ? Math.tan((12 * Math.PI) / 180) * c.y1 * g.escalaY : 0;
    somar(g.x + c.x0 * g.escalaX - folga, g.y - c.y1 * g.escalaY - folga, g.x + c.x1 * g.escalaX + folga + Math.max(0, inclinacao), g.y - c.y0 * g.escalaY + folga);
  }
  for (const r of riscos) somar(r.x0, r.y - r.espessura / 2, r.x1, r.y + r.espessura / 2);
  return { glifos, riscos, linhas, cursores, limites, incompleta };
}
