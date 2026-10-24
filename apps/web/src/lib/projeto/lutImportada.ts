// LUTs importadas (.cube): a mesma leitura tetraédrica de core/utils/lut.py, para a prévia montar a mesma LUT 3D
// do render. As tabelas chegam da API (/api/luts/<id>/dados, float32) e ficam guardadas aqui pelo id: a prévia,
// a exportação no navegador e o painel leem do mesmo lugar.

/** Uma LUT importada: o tamanho de cada eixo, a tabela (R, G e B por ponto, o vermelho mais rápido) e o domínio. */
export type LutImportada = {
  tamanho: number;
  dados: Float32Array;
  minimo: [number, number, number];
  maximo: [number, number, number];
};

/** A LUT do clipe na aba Cor: qual (o id da API) e quanto (de 0 a 1). */
export type LutDoClipe = { id: string; intensidade: number };

/** A cor da LUT no ponto rgb (0 a 1), pela leitura tetraédrica do lut3d do FFmpeg (ler_lut em core/utils/lut.py). */
export function lerLutImportada(lut: LutImportada, rgb: [number, number, number]): [number, number, number] {
  const n = lut.tamanho;
  const s = rgb.map((v, k) => Math.min(Math.max((v - lut.minimo[k]) / (lut.maximo[k] - lut.minimo[k]), 0), 1) * (n - 1));
  const p = s.map((v) => Math.min(Math.floor(v), n - 2));
  const [dr, dg, db] = s.map((v, k) => v - p[k]);
  const [x0, y0, z0] = p;
  const [x1, y1, z1] = [x0 + 1, y0 + 1, z0 + 1];
  const ponto = (x: number, y: number, z: number) => {
    const j = ((z * n + y) * n + x) * 3;
    return [lut.dados[j], lut.dados[j + 1], lut.dados[j + 2]];
  };
  let pesos: number[];
  let cantos: [number, number, number][];
  if (dr > dg) {
    if (dg > db) [pesos, cantos] = [[1 - dr, dr - dg, dg - db, db], [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]];
    else if (dr > db) [pesos, cantos] = [[1 - dr, dr - db, db - dg, dg], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1]]];
    else [pesos, cantos] = [[1 - db, db - dr, dr - dg, dg], [[x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1]]];
  } else if (db > dg) [pesos, cantos] = [[1 - db, db - dg, dg - dr, dr], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]]];
  else if (db > dr) [pesos, cantos] = [[1 - dg, dg - db, db - dr, dr], [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]]];
  else [pesos, cantos] = [[1 - dg, dg - dr, dr - db, db], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1]]];
  const soma: [number, number, number] = [0, 0, 0];
  pesos.forEach((peso, m) => {
    const cor = ponto(...cantos[m]);
    for (let k = 0; k < 3; k++) soma[k] += peso * cor[k];
  });
  return soma;
}

/** O pixel pela LUT, misturado ao original pela intensidade e preso entre 0 e 1 (aplicar_lut). */
export function aplicarLutImportada(rgb: [number, number, number], lut: LutImportada, intensidade: number): [number, number, number] {
  const saida = lerLutImportada(lut, rgb);
  return rgb.map((v, k) => Math.min(Math.max(v + (saida[k] - v) * intensidade, 0), 1)) as [number, number, number];
}

// As tabelas já baixadas, pelo id. Uma LUT nunca muda (outra versão é outro id), então não há validade.
const tabelas = new Map<string, LutImportada>();
const ouvintes = new Set<() => void>();

export function guardarLut(id: string, lut: LutImportada) {
  tabelas.set(id, lut);
  for (const ouvinte of ouvintes) ouvinte();
}

export function lutGuardada(id: string): LutImportada | null {
  return tabelas.get(id) ?? null;
}

/** Avisa quando uma tabela chega (a prévia redesenha com ela). Devolve a função que tira o aviso. */
export function aoGuardarLut(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** As LUTs que os clipes do projeto usam. */
export function lutsDoProjeto(projeto: { faixas: { clipes: { cor?: { lut?: LutDoClipe | null } | null; ajuste_imagem?: { tipo: string; lut?: LutDoClipe | null } | null }[] }[] }): string[] {
  const ids = new Set<string>();
  for (const faixa of projeto.faixas) {
    for (const clipe of faixa.clipes) {
      if (clipe.cor?.lut?.id) ids.add(clipe.cor.lut.id);
      // A Pesquisa de cores da camada de ajuste do editor de imagem
      if (clipe.ajuste_imagem?.lut?.id) ids.add(clipe.ajuste_imagem.lut.id);
    }
  }
  return [...ids];
}
