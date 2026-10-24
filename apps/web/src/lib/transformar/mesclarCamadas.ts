// Editar › Mesclar camadas automaticamente (ADR 0003, onda 13.6), com as camadas já alinhadas e do tamanho da imagem:
// - panorama: cada pixel vem das camadas que o cobrem, pesadas pela distância à borda de cada uma (quem está mais por
//   dentro manda), com a emenda suave; com tons e cores perfeitos, cada camada é antes levada à luz das vizinhas pela
//   média na parte em comum;
// - empilhar imagens (foco): cada pixel vem da camada mais nítida ali (a energia do laplaciano, borrada em volta), com
//   a troca suave.

type Imagem = { dados: ArrayLike<number>; largura: number; altura: number };

/** A distância (chanfro 3-4, em pixels) de cada pixel opaco até o transparente ou a borda mais perto. */
function distanciaDaBorda(alfa: ArrayLike<number>, largura: number, altura: number): Float32Array {
  const d = new Float32Array(largura * altura);
  const grande = 1e9;
  for (let i = 0; i < d.length; i++) d[i] = alfa[i] > 0 ? grande : 0;
  const ver = (i: number, x: number, y: number) => (x < 0 || y < 0 || x >= largura || y >= altura ? 0 : d[i]);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], ver(i - 1, x - 1, y) + 3, ver(i - largura, x, y - 1) + 3, ver(i - largura - 1, x - 1, y - 1) + 4, ver(i - largura + 1, x + 1, y - 1) + 4);
    }
  }
  for (let y = altura - 1; y >= 0; y--) {
    for (let x = largura - 1; x >= 0; x--) {
      const i = y * largura + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], ver(i + 1, x + 1, y) + 3, ver(i + largura, x, y + 1) + 3, ver(i + largura + 1, x + 1, y + 1) + 4, ver(i + largura - 1, x - 1, y + 1) + 4);
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

const luz = (dados: ArrayLike<number>, i: number) => 0.299 * dados[i * 4] + 0.587 * dados[i * 4 + 1] + 0.114 * dados[i * 4 + 2];

/** O panorama: as camadas emendadas pela distância à borda (ao quadrado, para a emenda ficar estreita). */
export function mesclarPanorama(camadas: Imagem[], opcoes: { tonsECores?: boolean } = {}): Uint8ClampedArray<ArrayBuffer> {
  const { largura, altura } = camadas[0];
  const n = largura * altura;
  const distancias = camadas.map((camada) => distanciaDaBorda(Float32Array.from({ length: n }, (_, i) => camada.dados[i * 4 + 3]), largura, altura));
  // Os ganhos: cada camada levada à luz da primeira (e as seguintes às já levadas) pela média na parte em comum
  const ganhos = camadas.map(() => 1);
  if (opcoes.tonsECores) {
    for (let k = 1; k < camadas.length; k++) {
      let somaA = 0;
      let somaB = 0;
      for (let i = 0; i < n; i++) {
        if (camadas[k].dados[i * 4 + 3] < 250) continue;
        // A luz das anteriores ali (a de maior distância)
        let melhor = -1;
        for (let j = 0; j < k; j++) if (camadas[j].dados[i * 4 + 3] >= 250 && (melhor < 0 || distancias[j][i] > distancias[melhor][i])) melhor = j;
        if (melhor < 0) continue;
        somaA += luz(camadas[melhor].dados, i) * ganhos[melhor];
        somaB += luz(camadas[k].dados, i);
      }
      if (somaB > 0 && somaA > 0) ganhos[k] = Math.min(4, Math.max(0.25, somaA / somaB));
    }
  }
  const saida = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    let soma = 0;
    const cor = [0, 0, 0];
    let alfa = 0;
    camadas.forEach((camada, k) => {
      const a = camada.dados[i * 4 + 3] / 255;
      if (a <= 0) return;
      const w = distancias[k][i] ** 2 * a + 1e-6;
      soma += w;
      for (let c = 0; c < 3; c++) cor[c] += camada.dados[i * 4 + c] * ganhos[k] * w;
      alfa = Math.max(alfa, a);
    });
    if (soma <= 0) continue;
    for (let c = 0; c < 3; c++) saida[i * 4 + c] = cor[c] / soma;
    saida[i * 4 + 3] = alfa * 255;
  }
  return saida;
}

/** A nitidez em cada pixel: o módulo do laplaciano da luz, borrado em volta (uma média de 9 × 9, três vezes). */
function nitidez(camada: Imagem): Float32Array {
  const { largura, altura, dados } = camada;
  const l = Float32Array.from({ length: largura * altura }, (_, i) => luz(dados, i));
  let e = new Float32Array(largura * altura);
  for (let y = 1; y < altura - 1; y++) {
    for (let x = 1; x < largura - 1; x++) {
      const i = y * largura + x;
      e[i] = Math.abs(4 * l[i] - l[i - 1] - l[i + 1] - l[i - largura] - l[i + largura]) * (dados[i * 4 + 3] / 255);
    }
  }
  const raio = 4;
  for (let passada = 0; passada < 3; passada++) {
    const h = new Float32Array(e.length);
    for (let y = 0; y < altura; y++) {
      let soma = 0;
      for (let x = -raio; x <= raio; x++) soma += e[y * largura + Math.min(largura - 1, Math.max(0, x))];
      for (let x = 0; x < largura; x++) {
        h[y * largura + x] = soma / (2 * raio + 1);
        soma += e[y * largura + Math.min(largura - 1, x + raio + 1)] - e[y * largura + Math.max(0, x - raio)];
      }
    }
    const v = new Float32Array(e.length);
    for (let x = 0; x < largura; x++) {
      let soma = 0;
      for (let y = -raio; y <= raio; y++) soma += h[Math.min(altura - 1, Math.max(0, y)) * largura + x];
      for (let y = 0; y < altura; y++) {
        v[y * largura + x] = soma / (2 * raio + 1);
        soma += h[Math.min(altura - 1, y + raio + 1) * largura + x] - h[Math.max(0, y - raio) * largura + x];
      }
    }
    e = v;
  }
  return e;
}

/** Empilhar imagens: cada pixel da camada mais nítida ali (os pesos pela quarta potência da nitidez). */
export function empilharFoco(camadas: Imagem[]): Uint8ClampedArray<ArrayBuffer> {
  const { largura, altura } = camadas[0];
  const n = largura * altura;
  const nitidezes = camadas.map(nitidez);
  const saida = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    let soma = 0;
    const cor = [0, 0, 0, 0];
    camadas.forEach((camada, k) => {
      if (camada.dados[i * 4 + 3] <= 0) return;
      const w = (nitidezes[k][i] + 1e-3) ** 4;
      soma += w;
      for (let c = 0; c < 4; c++) cor[c] += camada.dados[i * 4 + c] * w;
    });
    if (soma <= 0) continue;
    for (let c = 0; c < 4; c++) saida[i * 4 + c] = cor[c] / soma;
  }
  return saida;
}
