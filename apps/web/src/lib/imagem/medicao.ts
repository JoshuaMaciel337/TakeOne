// A medição do editor de imagem (ADR 0003, onda 13.14): a Contagem (pontos numerados em grupos), as notas presas a um
// ponto, a escala de medida (tantos pixels são tanto de uma unidade) e o Registro de medições: a seleção (área,
// perímetro, circularidade, caixa, cinza e densidade integrada), a régua (comprimento e ângulo) e a contagem, numa
// tabela que sai em CSV. Tudo em pixels do documento.

export type PontoDaContagem = { x: number; y: number };
export type GrupoDaContagem = {
  id: string;
  nome: string;
  cor: string;
  /** O raio do círculo do ponto (0 é só o número), como lá: de 0 a 10. */
  tamanho_do_marcador: number;
  tamanho_do_rotulo: number;
  visivel: boolean;
  pontos: PontoDaContagem[];
};
export type Contagem = { grupos: GrupoDaContagem[]; ativo: string | null };
export type Nota = { id: string; x: number; y: number; autor: string; texto: string; cor: string };
export type EscalaDeMedida = { pixels: number; comprimento: number; unidade: string };

export const MAXIMO_DE_GRUPOS = 30;
export const MAXIMO_DE_PONTOS = 5000;
export const MAXIMO_DE_NOTAS = 200;
/** As cores dos grupos novos, uma a uma. */
export const CORES_DA_CONTAGEM = ["#ff3b30", "#34c759", "#0a84ff", "#ffcc00", "#af52de", "#ff9500", "#5ac8fa", "#ff2d55"];
export const ESCALA_PADRAO: EscalaDeMedida = { pixels: 1, comprimento: 1, unidade: "pixels" };

export function totalDaContagem(contagem: Contagem | null | undefined): number {
  return (contagem?.grupos ?? []).reduce((soma, grupo) => soma + grupo.pontos.length, 0);
}

export function novoGrupo(contagem: Contagem | null | undefined, id: string): Contagem {
  const grupos = contagem?.grupos ?? [];
  if (grupos.length >= MAXIMO_DE_GRUPOS) throw new Error(`São no máximo ${MAXIMO_DE_GRUPOS} grupos de contagem.`);
  // O primeiro número livre no nome
  let n = grupos.length + 1;
  while (grupos.some((grupo) => grupo.nome === `Grupo de contagem ${n}`)) n++;
  const grupo: GrupoDaContagem = { id, nome: `Grupo de contagem ${n}`, cor: CORES_DA_CONTAGEM[grupos.length % CORES_DA_CONTAGEM.length], tamanho_do_marcador: 1, tamanho_do_rotulo: 12, visivel: true, pontos: [] };
  return { grupos: [...grupos, grupo], ativo: id };
}

/** O grupo em que o clique conta: o ativo, ou o primeiro. */
export function grupoAtivo(contagem: Contagem | null | undefined): GrupoDaContagem | null {
  const grupos = contagem?.grupos ?? [];
  return grupos.find((grupo) => grupo.id === contagem?.ativo) ?? grupos[0] ?? null;
}

/** Um ponto a mais no grupo ativo (sem grupo, nasce o primeiro com o id dado). */
export function somarPonto(contagem: Contagem | null | undefined, ponto: PontoDaContagem, idDoGrupoNovo: string): Contagem {
  let atual: Contagem = contagem?.grupos.length ? contagem : novoGrupo(null, idDoGrupoNovo);
  const grupo = grupoAtivo(atual)!;
  if (!grupo.visivel) atual = mudarGrupo(atual, grupo.id, { visivel: true });
  if (totalDaContagem(atual) >= MAXIMO_DE_PONTOS) throw new Error(`São no máximo ${MAXIMO_DE_PONTOS} pontos de contagem.`);
  return { ...atual, ativo: grupo.id, grupos: atual.grupos.map((g) => (g.id === grupo.id ? { ...g, pontos: [...g.pontos, { x: ponto.x, y: ponto.y }] } : g)) };
}

/** O ponto visível mais perto (até o raio, em pixels do documento): o grupo e o índice dele. */
export function pontoPerto(contagem: Contagem | null | undefined, ponto: PontoDaContagem, raio: number): { grupo: string; indice: number } | null {
  let melhor: { grupo: string; indice: number; d: number } | null = null;
  for (const grupo of contagem?.grupos ?? []) {
    if (!grupo.visivel) continue;
    grupo.pontos.forEach((p, indice) => {
      const d = Math.hypot(p.x - ponto.x, p.y - ponto.y);
      if (d <= raio && (!melhor || d < melhor.d)) melhor = { grupo: grupo.id, indice, d };
    });
  }
  return melhor ? { grupo: (melhor as { grupo: string }).grupo, indice: (melhor as { indice: number }).indice } : null;
}

/** Tira um ponto: os seguintes do grupo passam a ter um número a menos, como lá. */
export function tirarPonto(contagem: Contagem, grupoId: string, indice: number): Contagem {
  return { ...contagem, grupos: contagem.grupos.map((g) => (g.id === grupoId ? { ...g, pontos: g.pontos.filter((_, i) => i !== indice) } : g)) };
}

export function moverPonto(contagem: Contagem, grupoId: string, indice: number, ponto: PontoDaContagem): Contagem {
  return { ...contagem, grupos: contagem.grupos.map((g) => (g.id === grupoId ? { ...g, pontos: g.pontos.map((p, i) => (i === indice ? { x: ponto.x, y: ponto.y } : p)) } : g)) };
}

export function mudarGrupo(contagem: Contagem, grupoId: string, mudanca: Partial<Omit<GrupoDaContagem, "id">>): Contagem {
  return { ...contagem, grupos: contagem.grupos.map((g) => (g.id === grupoId ? { ...g, ...mudanca } : g)) };
}

/** Tira o grupo; sem grupos, a contagem some (null). */
export function tirarGrupo(contagem: Contagem, grupoId: string): Contagem | null {
  const grupos = contagem.grupos.filter((g) => g.id !== grupoId);
  if (!grupos.length) return null;
  return { grupos, ativo: contagem.ativo === grupoId ? grupos[0].id : contagem.ativo };
}

// ——— A escala de medida ———
const numero = (v: number, casas: number) => (Math.round(v * 10 ** casas) / 10 ** casas + 0).toLocaleString("pt-BR", { maximumFractionDigits: casas });

/** Uma medida em pixels (potência 1, comprimentos; 2, áreas) na unidade da escala. */
export function naEscala(pixels: number, escala: EscalaDeMedida | null | undefined, potencia: 1 | 2 = 1): number {
  const e = escala ?? ESCALA_PADRAO;
  return (pixels * e.comprimento ** potencia) / e.pixels ** potencia;
}

/** "100 pixels = 2,5 cm" */
export function textoDaEscala(escala: EscalaDeMedida | null | undefined): string {
  const e = escala ?? ESCALA_PADRAO;
  return `${numero(e.pixels, 3)} ${e.pixels === 1 ? "pixel" : "pixels"} = ${numero(e.comprimento, 4)} ${e.unidade}`;
}

// ——— As medidas da seleção ———
export type MascaraDeMedida = { largura: number; altura: number; dados: Uint8Array | Uint8ClampedArray };
export type ImagemDeMedida = { largura: number; altura: number; dados: Uint8Array | Uint8ClampedArray };

/**
 * O perímetro do contorno da seleção: a linha de nível 0,5 de uma cópia da máscara (o que passa de 128) suavizada por
 * uma média 3 × 3, pelos quadrados em marcha com o ponto de cada aresta interpolado. A média tira os degraus dos
 * pixels sem mover as bordas retas (entre dois centros, a linha cai na divisa dos pixels): num círculo e num quadrado
 * girado, o perímetro fica a menos de 1% do certo (contando os degraus, 5% a 8% acima); os cantos vivos perdem uns
 * 0,85 px cada.
 */
export function perimetroDaMascara(mascara: MascaraDeMedida): number {
  const { largura: w, altura: h, dados } = mascara;
  // A máscara com uma borda vazia de 2 pixels, para o contorno fechar, e a média 3 × 3
  const W = w + 4;
  const H = h + 4;
  const binaria = new Float32Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) binaria[(y + 2) * W + x + 2] = dados[y * w + x] >= 128 ? 1 : 0;
  const v = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += binaria[(y + dy) * W + x + dx];
      v[y * W + x] = s / 9;
    }
  }
  const t = (a: number, b: number) => (0.5 - a) / (b - a);
  let total = 0;
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const a = v[y * W + x];
      const b = v[y * W + x + 1];
      const c = v[(y + 1) * W + x + 1];
      const d = v[(y + 1) * W + x];
      const dentro = [a > 0.5, b > 0.5, c > 0.5, d > 0.5];
      const n = dentro.filter(Boolean).length;
      if (n === 0 || n === 4) continue;
      // Os pontos em que a linha cruza cada aresta (em cima, à direita, embaixo, à esquerda)
      const pontos: [number, number][] = [];
      if (dentro[0] !== dentro[1]) pontos.push([x + t(a, b), y]);
      if (dentro[1] !== dentro[2]) pontos.push([x + 1, y + t(b, c)]);
      if (dentro[2] !== dentro[3]) pontos.push([x + 1 - t(c, d), y + 1]);
      if (dentro[3] !== dentro[0]) pontos.push([x, y + 1 - t(d, a)]);
      const segmento = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (pontos.length === 2) total += segmento(pontos[0], pontos[1]);
      // A sela (dois cantos opostos): dois segmentos, cada um cortando um canto
      else if (pontos.length === 4) total += Math.min(segmento(pontos[0], pontos[1]) + segmento(pontos[2], pontos[3]), segmento(pontos[0], pontos[3]) + segmento(pontos[1], pontos[2]));
    }
  }
  return total;
}

/** Quantas regiões separadas (8 vizinhos) a seleção tem. */
export function regioesDaMascara(mascara: MascaraDeMedida): number {
  const { largura: w, altura: h, dados } = mascara;
  const visto = new Uint8Array(w * h);
  const pilha = new Int32Array(w * h);
  let regioes = 0;
  for (let i = 0; i < w * h; i++) {
    if (visto[i] || dados[i] < 128) continue;
    regioes++;
    let topo = 0;
    pilha[topo++] = i;
    visto[i] = 1;
    while (topo) {
      const j = pilha[--topo];
      const x = j % w;
      const y = (j - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (!visto[k] && dados[k] >= 128) {
            visto[k] = 1;
            pilha[topo++] = k;
          }
        }
      }
    }
  }
  return regioes;
}

export type MedidasDaSelecao = {
  area: number;
  perimetro: number;
  circularidade: number;
  largura: number;
  altura: number;
  regioes: number;
  /** O cinza (0 a 255, pela luz 0,299/0,587/0,114) dentro da seleção, quando a imagem é dada. */
  cinza: { media: number; minimo: number; maximo: number; mediana: number } | null;
};

export function medirSelecao(mascara: MascaraDeMedida, imagem: ImagemDeMedida | null): MedidasDaSelecao | null {
  const { largura: w, altura: h, dados } = mascara;
  let area = 0;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  const contas = new Float64Array(256);
  let somaCinza = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (dados[y * w + x] < 128) continue;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
      if (imagem && imagem.largura === w && imagem.altura === h) {
        const i = (y * w + x) * 4;
        const cinza = Math.round(0.299 * imagem.dados[i] + 0.587 * imagem.dados[i + 1] + 0.114 * imagem.dados[i + 2]);
        contas[cinza]++;
        somaCinza += cinza;
      }
    }
  }
  if (!area) return null;
  const perimetro = perimetroDaMascara(mascara);
  let cinza: MedidasDaSelecao["cinza"] = null;
  if (imagem && imagem.largura === w && imagem.altura === h) {
    let minimo = 0;
    while (!contas[minimo]) minimo++;
    let maximo = 255;
    while (!contas[maximo]) maximo--;
    let acumulado = 0;
    let mediana = minimo;
    for (let v = 0; v < 256; v++) {
      acumulado += contas[v];
      if (acumulado >= area / 2) {
        mediana = v;
        break;
      }
    }
    cinza = { media: somaCinza / area, minimo, maximo, mediana };
  }
  return { area, perimetro, circularidade: perimetro ? Math.min(1, (4 * Math.PI * area) / (perimetro * perimetro)) : 0, largura: x1 - x0 + 1, altura: y1 - y0 + 1, regioes: regioesDaMascara(mascara), cinza };
}

// ——— O Registro de medições ———
export type FonteDaMedicao = "Seleção" | "Régua" | "Ferramenta Contagem";
export type Medicao = {
  id: string;
  rotulo: string;
  data: string;
  documento: string;
  fonte: FonteDaMedicao;
  escala: string;
  unidade: string;
  fator: number;
  contagem?: number;
  area?: number;
  perimetro?: number;
  circularidade?: number;
  altura?: number;
  largura?: number;
  cinzaMedio?: number;
  cinzaMinimo?: number;
  cinzaMaximo?: number;
  cinzaMediano?: number;
  densidadeIntegrada?: number;
  comprimento?: number;
  angulo?: number;
};

export const COLUNAS_DO_REGISTRO: { id: keyof Medicao; nome: string }[] = [
  { id: "rotulo", nome: "Rótulo" },
  { id: "data", nome: "Data e hora" },
  { id: "documento", nome: "Documento" },
  { id: "fonte", nome: "Fonte" },
  { id: "escala", nome: "Escala" },
  { id: "unidade", nome: "Unidades da escala" },
  { id: "fator", nome: "Fator da escala" },
  { id: "contagem", nome: "Contagem" },
  { id: "area", nome: "Área" },
  { id: "perimetro", nome: "Perímetro" },
  { id: "circularidade", nome: "Circularidade" },
  { id: "altura", nome: "Altura" },
  { id: "largura", nome: "Largura" },
  { id: "cinzaMedio", nome: "Cinza (média)" },
  { id: "cinzaMinimo", nome: "Cinza (mínimo)" },
  { id: "cinzaMaximo", nome: "Cinza (máximo)" },
  { id: "cinzaMediano", nome: "Cinza (mediana)" },
  { id: "densidadeIntegrada", nome: "Densidade integrada" },
  { id: "comprimento", nome: "Comprimento" },
  { id: "angulo", nome: "Ângulo" },
];

type Comum = { id: string; rotulo: string; data: string; documento: string; escala: EscalaDeMedida | null | undefined };
const comum = ({ id, rotulo, data, documento, escala }: Comum, fonte: FonteDaMedicao) => {
  const e = escala ?? ESCALA_PADRAO;
  return { id, rotulo, data, documento, fonte, escala: textoDaEscala(e), unidade: e.unidade, fator: e.comprimento / e.pixels };
};

export function medicaoDaSelecao(base: Comum, medidas: MedidasDaSelecao): Medicao {
  const e = base.escala;
  return {
    ...comum(base, "Seleção"),
    contagem: medidas.regioes,
    area: naEscala(medidas.area, e, 2),
    perimetro: naEscala(medidas.perimetro, e),
    circularidade: medidas.circularidade,
    altura: naEscala(medidas.altura, e),
    largura: naEscala(medidas.largura, e),
    ...(medidas.cinza
      ? { cinzaMedio: medidas.cinza.media, cinzaMinimo: medidas.cinza.minimo, cinzaMaximo: medidas.cinza.maximo, cinzaMediano: medidas.cinza.mediana, densidadeIntegrada: naEscala(medidas.area, e, 2) * medidas.cinza.media }
      : {}),
  };
}

export function medicaoDaRegua(base: Comum, de: PontoDaContagem, ate: PontoDaContagem): Medicao {
  const dx = ate.x - de.x;
  const dy = ate.y - de.y;
  // O ângulo como na régua: anti-horário positivo, a partir da horizontal
  return { ...comum(base, "Régua"), comprimento: naEscala(Math.hypot(dx, dy), base.escala), angulo: (-Math.atan2(dy, dx) * 180) / Math.PI + 0 };
}

export function medicaoDaContagem(base: Comum, contagem: Contagem | null | undefined): Medicao {
  return { ...comum(base, "Ferramenta Contagem"), contagem: totalDaContagem(contagem) };
}

/** Um número da tabela: até 4 casas, com vírgula. */
export function valorDaColuna(medicao: Medicao, coluna: keyof Medicao): string {
  const valor = medicao[coluna];
  if (valor === undefined) return "";
  if (typeof valor === "number") return numero(valor, 4);
  return String(valor);
}

/** O CSV do registro, com ponto e vírgula (a vírgula é a dos decimais) e as aspas onde precisa. */
export function csvDoRegistro(medicoes: Medicao[], colunas = COLUNAS_DO_REGISTRO): string {
  const celula = (texto: string) => (/[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto);
  const linhas = [colunas.map((c) => celula(c.nome)).join(";"), ...medicoes.map((m) => colunas.map((c) => celula(valorDaColuna(m, c.id))).join(";"))];
  return `${linhas.join("\r\n")}\r\n`;
}
