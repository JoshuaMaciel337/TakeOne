// A biblioteca de formas personalizadas (ADR 0003, onda 13.7), desenhadas do zero para o TakeOne numa caixa de
// 100 × 100: formas básicas, estrelas e explosões, setas (nas quatro direções), balões de fala, selos e fitas,
// natureza, símbolos, molduras e enfeites. Cada forma é feita de construtores pequenos (polígonos, círculos, anéis,
// estrelas, engrenagens) ou de um caminho SVG, e as operações (somar, subtrair) fazem os furos.
import { transformarCaminhos } from "./edicao.ts";
import { deslocar, KAPPA, type OperacaoDoCaminho, type Subcaminho, subcaminhosDaForma } from "./modelo.ts";
import { caminhosDoSvg } from "./svg.ts";

export type CategoriaDaForma = "basicas" | "estrelas" | "setas" | "baloes" | "selos" | "natureza" | "simbolos" | "molduras" | "enfeites";
export const CATEGORIAS_DAS_FORMAS: { id: CategoriaDaForma; nome: string }[] = [
  { id: "basicas", nome: "Formas básicas" },
  { id: "estrelas", nome: "Estrelas e explosões" },
  { id: "setas", nome: "Setas" },
  { id: "baloes", nome: "Balões de fala" },
  { id: "selos", nome: "Selos e fitas" },
  { id: "natureza", nome: "Natureza" },
  { id: "simbolos", nome: "Símbolos" },
  { id: "molduras", nome: "Molduras" },
  { id: "enfeites", nome: "Enfeites" },
];

export type FormaPronta = { id: string; nome: string; categoria: CategoriaDaForma; caminhos: () => Subcaminho[] };

// ——— Construtores ———

type Par = [number, number];
const com = (subs: Subcaminho[], operacao: OperacaoDoCaminho): Subcaminho[] => subs.map((sub) => ({ ...sub, operacao }));
const menos = (subs: Subcaminho[]) => com(subs, "subtrair");
const P = (pontos: Par[]): Subcaminho[] => [{ nos: pontos.map(([x, y]) => ({ x, y })), fechado: true, operacao: "somar" }];
const svg = (d: string): Subcaminho[] => caminhosDoSvg(d);
function E(cx: number, cy: number, rx: number, ry = rx): Subcaminho[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    {
      nos: [
        { x: cx, y: cy - ry, ex: cx - kx, ey: cy - ry, sx: cx + kx, sy: cy - ry },
        { x: cx + rx, y: cy, ex: cx + rx, ey: cy - ky, sx: cx + rx, sy: cy + ky },
        { x: cx, y: cy + ry, ex: cx + kx, ey: cy + ry, sx: cx - kx, sy: cy + ry },
        { x: cx - rx, y: cy, ex: cx - rx, ey: cy + ky, sx: cx - rx, sy: cy - ky },
      ],
      fechado: true,
      operacao: "somar",
    },
  ];
}
const R = (x: number, y: number, l: number, a: number, raio = 0): Subcaminho[] => deslocar(subcaminhosDaForma({ tipo: "retangulo", largura: l, altura: a, raios: [raio, raio, raio, raio] }), x, y);
const anel = (cx: number, cy: number, r1: number, r2: number) => [...E(cx, cy, r1), ...menos(E(cx, cy, r2))];
function regular(n: number, r = 50, giro = -90, cx = 50, cy = 50): Par[] {
  return Array.from({ length: n }, (_, i) => {
    const a = ((giro + (360 * i) / n) * Math.PI) / 180;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}
function estrela(n: number, interno: number, r = 50, giro = -90, cx = 50, cy = 50): Par[] {
  return Array.from({ length: 2 * n }, (_, i) => {
    const a = ((giro + (180 * i) / n) * Math.PI) / 180;
    const raio = i % 2 ? r * interno : r;
    return [cx + Math.cos(a) * raio, cy + Math.sin(a) * raio];
  });
}
/** Uma explosão de pontas irregulares (o sorteio é fixo por semente, a mesma forma sempre). */
function explosao(n: number, interno: number, semente: number): Par[] {
  let s = semente;
  const sorteio = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  return Array.from({ length: 2 * n }, (_, i) => {
    const a = ((-90 + (180 * i) / n + (sorteio() - 0.5) * (120 / n)) * Math.PI) / 180;
    const raio = i % 2 ? 50 * interno * (0.85 + sorteio() * 0.3) : 50 * (0.8 + sorteio() * 0.2);
    return [50 + Math.cos(a) * raio, 50 + Math.sin(a) * raio];
  });
}
function engrenagem(dentes: number, furo: number): Subcaminho[] {
  const pontos: Par[] = [];
  for (let i = 0; i < dentes; i++) {
    const base = (360 * i) / dentes;
    const passo = 360 / dentes;
    for (const [frac, raio] of [
      [0, 38],
      [0.12, 38],
      [0.22, 50],
      [0.48, 50],
      [0.58, 38],
      [0.7, 38],
    ] as const) {
      const a = ((base + passo * frac - 90) * Math.PI) / 180;
      pontos.push([50 + Math.cos(a) * raio, 50 + Math.sin(a) * raio]);
    }
  }
  return [...P(pontos), ...menos(E(50, 50, furo))];
}
const girar = (subs: Subcaminho[], graus: number, cx = 50, cy = 50) => {
  const a = (graus * Math.PI) / 180;
  const cos = Math.cos(a);
  const sen = Math.sin(a);
  return transformarCaminhos(subs, (p) => ({ x: cx + (p.x - cx) * cos - (p.y - cy) * sen, y: cy + (p.x - cx) * sen + (p.y - cy) * cos }));
};
const espelhar = (subs: Subcaminho[]) => transformarCaminhos(subs, (p) => ({ x: 100 - p.x, y: p.y }));
/** Um setor de anel (de `de` a `ate` graus, no sentido horário), para arcos grossos. */
function setor(r1: number, r2: number, de: number, ate: number, cx = 50, cy = 50): Subcaminho[] {
  const ponto = (r: number, g: number) => `${cx + r * Math.cos((g * Math.PI) / 180)} ${cy + r * Math.sin((g * Math.PI) / 180)}`;
  const grande = ate - de > 180 ? 1 : 0;
  return svg(`M${ponto(r1, de)} A${r1} ${r1} 0 ${grande} 1 ${ponto(r1, ate)} L${ponto(r2, ate)} A${r2} ${r2} 0 ${grande} 0 ${ponto(r2, de)} Z`);
}

// ——— As formas ———

const DIRECOES: { sufixo: string; nome: string; graus: number }[] = [
  { sufixo: "direita", nome: "para a direita", graus: 0 },
  { sufixo: "baixo", nome: "para baixo", graus: 90 },
  { sufixo: "esquerda", nome: "para a esquerda", graus: 180 },
  { sufixo: "cima", nome: "para cima", graus: 270 },
];
const SETAS: { id: string; nome: string; desenho: () => Subcaminho[] }[] = [
  { id: "seta", nome: "Seta", desenho: () => P([[0, 35], [60, 35], [60, 15], [100, 50], [60, 85], [60, 65], [0, 65]]) },
  { id: "seta-fina", nome: "Seta fina", desenho: () => P([[0, 45], [72, 45], [72, 32], [100, 50], [72, 68], [72, 55], [0, 55]]) },
  { id: "seta-larga", nome: "Seta larga", desenho: () => P([[0, 25], [50, 25], [50, 3], [100, 50], [50, 97], [50, 75], [0, 75]]) },
  { id: "seta-entalhe", nome: "Seta com entalhe", desenho: () => P([[0, 30], [60, 30], [60, 10], [100, 50], [60, 90], [60, 70], [0, 70], [16, 50]]) },
  { id: "seta-dupla", nome: "Seta dupla", desenho: () => P([[0, 50], [25, 18], [25, 38], [75, 38], [75, 18], [100, 50], [75, 82], [75, 62], [25, 62], [25, 82]]) },
  { id: "divisa", nome: "Divisa", desenho: () => P([[0, 8], [55, 8], [100, 50], [55, 92], [0, 92], [45, 50]]) },
  { id: "placa", nome: "Placa de seta", desenho: () => P([[0, 18], [70, 18], [100, 50], [70, 82], [0, 82]]) },
  { id: "ponta", nome: "Ponta de seta", desenho: () => P([[8, 8], [100, 50], [8, 92], [30, 50]]) },
  { id: "seta-redonda", nome: "Seta arredondada", desenho: () => svg("M0 40 H55 V20 Q57 14 62 18 L98 46 Q102 50 98 54 L62 82 Q57 86 55 80 V60 H0 Z") },
  { id: "divisa-dupla", nome: "Divisa dupla", desenho: () => [...P([[0, 10], [30, 10], [62, 50], [30, 90], [0, 90], [32, 50]]), ...P([[38, 10], [68, 10], [100, 50], [68, 90], [38, 90], [70, 50]])] },
];
const setasNasDirecoes: FormaPronta[] = SETAS.flatMap((seta) => DIRECOES.map((d) => ({ id: `${seta.id}-${d.sufixo}`, nome: `${seta.nome} ${d.nome}`, categoria: "setas" as const, caminhos: () => girar(seta.desenho(), d.graus) })));
const setaCurva = () => svg("M8 95 C8 48 36 26 68 26 V8 L98 38 L68 68 V48 C46 48 30 62 30 95 Z");
const setaDeVolta = () => svg("M18 98 V42 A32 32 0 0 1 82 42 V56 H96 L70 88 L44 56 H58 V42 A8 8 0 0 0 42 42 V98 Z");
const setaCircular = () => [...setor(44, 30, -60, 220), ...P([[50 + 37 * Math.cos((-60 * Math.PI) / 180) - 14, 50 + 37 * Math.sin((-60 * Math.PI) / 180) - 18], [50 + 37 * Math.cos((-60 * Math.PI) / 180) + 20, 50 + 37 * Math.sin((-60 * Math.PI) / 180) - 4], [50 + 37 * Math.cos((-60 * Math.PI) / 180) - 4, 50 + 37 * Math.sin((-60 * Math.PI) / 180) + 22]])];

export const FORMAS_PRONTAS: FormaPronta[] = [
  // Formas básicas
  ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({ id: `poligono-${n}`, nome: `Polígono de ${n} lados`, categoria: "basicas" as const, caminhos: () => P(regular(n, 50, n === 4 ? -45 : -90)) })),
  { id: "losango", nome: "Losango", categoria: "basicas", caminhos: () => P([[50, 0], [100, 50], [50, 100], [0, 50]]) },
  { id: "paralelogramo", nome: "Paralelogramo", categoria: "basicas", caminhos: () => P([[25, 15], [100, 15], [75, 85], [0, 85]]) },
  { id: "trapezio", nome: "Trapézio", categoria: "basicas", caminhos: () => P([[25, 15], [75, 15], [100, 85], [0, 85]]) },
  { id: "triangulo-retangulo", nome: "Triângulo retângulo", categoria: "basicas", caminhos: () => P([[5, 5], [95, 95], [5, 95]]) },
  { id: "semicirculo", nome: "Semicírculo", categoria: "basicas", caminhos: () => svg("M0 75 A50 50 0 0 1 100 75 Z") },
  { id: "quarto-de-circulo", nome: "Quarto de círculo", categoria: "basicas", caminhos: () => svg("M5 95 V5 A90 90 0 0 1 95 95 Z") },
  { id: "capsula", nome: "Cápsula", categoria: "basicas", caminhos: () => R(0, 30, 100, 40, 20) },
  { id: "anel", nome: "Anel", categoria: "basicas", caminhos: () => anel(50, 50, 50, 32) },
  { id: "arco", nome: "Arco", categoria: "basicas", caminhos: () => setor(50, 30, 180, 360, 50, 75) },
  { id: "cruz", nome: "Cruz", categoria: "basicas", caminhos: () => [...R(35, 0, 30, 100), ...R(0, 35, 100, 30)] },
  { id: "cruz-diagonal", nome: "Cruz em X", categoria: "basicas", caminhos: () => [...girar(R(38, -10, 24, 120), 45), ...girar(R(38, -10, 24, 120), -45)] },
  { id: "gota", nome: "Gota", categoria: "basicas", caminhos: () => svg("M50 2 C50 2 85 45 85 65 C85 85 69 98 50 98 C31 98 15 85 15 65 C15 45 50 2 50 2 Z") },
  { id: "lua", nome: "Meia-lua", categoria: "basicas", caminhos: () => [...E(46, 50, 44), ...menos(E(66, 40, 38))] },
  { id: "coracao", nome: "Coração", categoria: "basicas", caminhos: () => svg("M50 92 C20 70 2 52 2 30 C2 14 14 4 28 4 C38 4 46 10 50 18 C54 10 62 4 72 4 C86 4 98 14 98 30 C98 52 80 70 50 92 Z") },
  { id: "bandeira", nome: "Bandeirola", categoria: "basicas", caminhos: () => P([[10, 0], [90, 0], [90, 100], [50, 72], [10, 100]]) },

  // Estrelas e explosões
  ...[4, 5, 6, 7, 8, 10, 12].flatMap((n) => [
    { id: `estrela-${n}`, nome: `Estrela de ${n} pontas`, categoria: "estrelas" as const, caminhos: () => P(estrela(n, n === 5 ? 0.4 : 0.5)) },
    { id: `estrela-${n}-gorda`, nome: `Estrela de ${n} pontas cheia`, categoria: "estrelas" as const, caminhos: () => P(estrela(n, 0.7)) },
  ]),
  { id: "estrela-fina", nome: "Estrela fina", categoria: "estrelas", caminhos: () => P(estrela(4, 0.2)) },
  { id: "brilho", nome: "Brilho", categoria: "estrelas", caminhos: () => svg("M50 0 C53 35 65 47 100 50 C65 53 53 65 50 100 C47 65 35 53 0 50 C35 47 47 35 50 0 Z") },
  { id: "estrela-vazada", nome: "Estrela vazada", categoria: "estrelas", caminhos: () => [...P(estrela(5, 0.4)), ...menos(P(estrela(5, 0.4, 30, -90, 50, 54)))] },
  ...[16, 24, 32].map((n) => ({ id: `explosao-${n}`, nome: `Explosão de ${n} pontas`, categoria: "estrelas" as const, caminhos: () => P(estrela(n, 0.8)) })),
  ...[1, 2, 3].map((k) => ({ id: `estouro-${k}`, nome: `Estouro ${k}`, categoria: "estrelas" as const, caminhos: () => P(explosao(10 + k * 2, 0.62, k * 97)) })),

  // Setas
  ...setasNasDirecoes,
  { id: "seta-curva", nome: "Seta curva", categoria: "setas", caminhos: setaCurva },
  { id: "seta-curva-espelhada", nome: "Seta curva para a esquerda", categoria: "setas", caminhos: () => espelhar(setaCurva()) },
  { id: "seta-de-volta", nome: "Seta de volta", categoria: "setas", caminhos: setaDeVolta },
  { id: "seta-de-volta-espelhada", nome: "Seta de volta espelhada", categoria: "setas", caminhos: () => espelhar(setaDeVolta()) },
  { id: "seta-circular", nome: "Seta circular", categoria: "setas", caminhos: setaCircular },
  { id: "seta-circular-espelhada", nome: "Seta circular espelhada", categoria: "setas", caminhos: () => espelhar(setaCircular()) },
  { id: "setas-quatro", nome: "Setas para os quatro lados", categoria: "setas", caminhos: () => P([[50, 0], [68, 20], [58, 20], [58, 42], [80, 42], [80, 32], [100, 50], [80, 68], [80, 58], [58, 58], [58, 80], [68, 80], [50, 100], [32, 80], [42, 80], [42, 58], [20, 58], [20, 68], [0, 50], [20, 32], [20, 42], [42, 42], [42, 20], [32, 20]]) },

  // Balões de fala
  { id: "balao-retangular", nome: "Balão retangular", categoria: "baloes", caminhos: () => svg("M10 8 H90 Q96 8 96 14 V60 Q96 66 90 66 H46 L24 88 L30 66 H10 Q4 66 4 60 V14 Q4 8 10 8 Z") },
  { id: "balao-oval", nome: "Balão oval", categoria: "baloes", caminhos: () => svg("M50 6 C77 6 98 22 98 42 C98 62 77 78 50 78 C45 78 40 77.4 36 76.5 L12 94 L22 71 C10 64 2 54 2 42 C2 22 23 6 50 6 Z") },
  { id: "balao-redondo", nome: "Balão redondo", categoria: "baloes", caminhos: () => svg("M50 4 C75 4 94 23 94 46 C94 69 75 88 50 88 C42 88 35 86 29 83 L8 96 L16 74 C9 66 6 56 6 46 C6 23 25 4 50 4 Z") },
  { id: "balao-quadrado", nome: "Balão quadrado", categoria: "baloes", caminhos: () => P([[4, 6], [96, 6], [96, 70], [60, 70], [50, 94], [40, 70], [4, 70]]) },
  { id: "balao-pensamento", nome: "Balão de pensamento", categoria: "baloes", caminhos: () => [...E(56, 38, 42, 32), ...E(20, 80, 8), ...E(8, 94, 5)] },
  { id: "balao-nuvem", nome: "Balão em nuvem", categoria: "baloes", caminhos: () => [...E(30, 40, 22), ...E(52, 28, 24), ...E(74, 40, 22), ...E(62, 58, 20), ...E(38, 58, 20), ...P([[30, 70], [40, 74], [18, 96]])] },
  { id: "balao-grito", nome: "Balão de grito", categoria: "baloes", caminhos: () => P(explosao(14, 0.7, 41)) },
  { id: "balao-legenda", nome: "Caixa de legenda", categoria: "baloes", caminhos: () => [...R(2, 20, 96, 60, 8), ...P([[70, 78], [88, 78], [94, 98]])] },

  // Selos e fitas
  { id: "selo", nome: "Selo", categoria: "selos", caminhos: () => P(estrela(20, 0.86)) },
  { id: "selo-furado", nome: "Selo com aro", categoria: "selos", caminhos: () => [...P(estrela(20, 0.86)), ...menos(E(50, 50, 36)), ...E(50, 50, 32)] },
  { id: "escudo", nome: "Escudo", categoria: "selos", caminhos: () => svg("M50 3 L92 17 C92 55 75 82 50 97 C25 82 8 55 8 17 Z") },
  { id: "etiqueta", nome: "Etiqueta", categoria: "selos", caminhos: () => [...P([[4, 50], [30, 20], [96, 20], [96, 80], [30, 80]]), ...menos(E(28, 50, 7))] },
  { id: "ingresso", nome: "Ingresso", categoria: "selos", caminhos: () => [...R(4, 24, 92, 52, 4), ...menos(E(4, 50, 10)), ...menos(E(96, 50, 10))] },
  { id: "fita", nome: "Fita", categoria: "selos", caminhos: () => [...R(16, 28, 68, 32), ...P([[0, 40], [20, 40], [20, 72], [0, 72], [9, 56]]), ...P([[80, 40], [100, 40], [91, 56], [100, 72], [80, 72]])] },
  { id: "medalha", nome: "Medalha", categoria: "selos", caminhos: () => [...P([[28, 0], [44, 0], [56, 34], [40, 34]]), ...P([[72, 0], [56, 0], [44, 34], [60, 34]]), ...E(50, 64, 34), ...menos(E(50, 64, 24)), ...P(estrela(5, 0.45, 20, -90, 50, 65))] },
  { id: "laco", nome: "Laço", categoria: "selos", caminhos: () => [...svg("M50 50 C35 25 5 15 5 35 C5 55 35 60 50 50 Z"), ...svg("M50 50 C65 25 95 15 95 35 C95 55 65 60 50 50 Z"), ...E(50, 50, 8), ...P([[46, 54], [34, 92], [44, 86], [50, 96], [52, 56]]), ...P([[54, 54], [66, 92], [56, 86], [50, 96], [48, 56]])] },

  // Natureza
  { id: "folha", nome: "Folha", categoria: "natureza", caminhos: () => svg("M8 92 C8 42 40 10 96 4 C90 60 58 92 8 92 Z") },
  { id: "folha-com-veio", nome: "Folha com veio", categoria: "natureza", caminhos: () => [...svg("M8 92 C8 42 40 10 96 4 C90 60 58 92 8 92 Z"), ...menos(P([[10, 92], [92, 8], [94, 10], [14, 94]]))] },
  { id: "chama", nome: "Chama", categoria: "natureza", caminhos: () => svg("M50 2 C55 25 80 35 80 62 C80 84 66 98 50 98 C34 98 20 84 20 64 C20 48 30 40 34 30 C36 42 42 48 46 50 C44 34 46 16 50 2 Z") },
  { id: "raio", nome: "Raio", categoria: "natureza", caminhos: () => P([[60, 0], [18, 56], [45, 56], [34, 100], [84, 40], [56, 40], [72, 0]]) },
  { id: "sol", nome: "Sol", categoria: "natureza", caminhos: () => [...E(50, 50, 22), ...Array.from({ length: 12 }, (_, i) => girar(P([[47, 2], [53, 2], [50, 20]]), i * 30)).flat()] },
  { id: "nuvem", nome: "Nuvem", categoria: "natureza", caminhos: () => [...E(30, 58, 20), ...E(52, 44, 26), ...E(74, 58, 20), ...R(10, 56, 80, 30, 15)] },
  { id: "floco", nome: "Floco de neve", categoria: "natureza", caminhos: () => Array.from({ length: 6 }, (_, i) => girar([...R(47, 2, 6, 48), ...girar(R(47, 10, 5, 18), 40, 50, 22), ...girar(R(48, 10, 5, 18), -40, 50, 22)], i * 60)).flat() },
  { id: "arvore", nome: "Árvore", categoria: "natureza", caminhos: () => [...P([[50, 0], [80, 34], [66, 34], [90, 62], [72, 62], [96, 86], [4, 86], [28, 62], [10, 62], [34, 34], [20, 34]]), ...R(43, 84, 14, 16)] },
  { id: "montanha", nome: "Montanhas", categoria: "natureza", caminhos: () => P([[0, 90], [34, 30], [50, 52], [66, 18], [100, 90]]) },
  { id: "onda", nome: "Onda", categoria: "natureza", caminhos: () => svg("M0 60 C15 40 35 40 50 60 C65 80 85 80 100 60 V100 H0 Z") },
  { id: "flor-5", nome: "Flor de cinco pétalas", categoria: "natureza", caminhos: () => [...Array.from({ length: 5 }, (_, i) => girar(E(50, 26, 14, 24), i * 72)).flat(), ...E(50, 50, 13)] },
  { id: "margarida", nome: "Margarida", categoria: "natureza", caminhos: () => [...Array.from({ length: 12 }, (_, i) => girar(E(50, 22, 7, 22), i * 30)).flat(), ...E(50, 50, 14)] },
  { id: "trevo", nome: "Trevo", categoria: "natureza", caminhos: () => [...E(50, 30, 18), ...E(32, 56, 18), ...E(68, 56, 18), ...R(47, 60, 6, 38, 3)] },
  { id: "pegada", nome: "Pegada", categoria: "natureza", caminhos: () => [...E(50, 66, 22, 26), ...E(22, 36, 9, 11), ...E(40, 22, 9, 11), ...E(60, 22, 9, 11), ...E(78, 36, 9, 11)] },

  // Símbolos
  { id: "certo", nome: "Certo", categoria: "simbolos", caminhos: () => P([[4, 56], [20, 40], [40, 60], [82, 14], [98, 30], [40, 92]]) },
  { id: "errado", nome: "Errado", categoria: "simbolos", caminhos: () => [...girar(R(40, 0, 20, 100), 45), ...girar(R(40, 0, 20, 100), -45)] },
  { id: "mais", nome: "Mais", categoria: "simbolos", caminhos: () => [...R(38, 5, 24, 90, 4), ...R(5, 38, 90, 24, 4)] },
  { id: "menos", nome: "Menos", categoria: "simbolos", caminhos: () => R(5, 38, 90, 24, 4) },
  { id: "igual", nome: "Igual", categoria: "simbolos", caminhos: () => [...R(5, 24, 90, 18, 3), ...R(5, 58, 90, 18, 3)] },
  { id: "dividir", nome: "Dividir", categoria: "simbolos", caminhos: () => [...R(5, 42, 90, 16, 3), ...E(50, 20, 11), ...E(50, 80, 11)] },
  { id: "porcentagem", nome: "Porcentagem", categoria: "simbolos", caminhos: () => [...P([[78, 4], [92, 12], [22, 96], [8, 88]]), ...anel(24, 24, 18, 9), ...anel(76, 76, 18, 9)] },
  { id: "exclamacao", nome: "Exclamação", categoria: "simbolos", caminhos: () => [...svg("M38 6 H62 L57 66 H43 Z"), ...E(50, 84, 11)] },
  { id: "interrogacao", nome: "Interrogação", categoria: "simbolos", caminhos: () => [...svg("M28 34 C28 16 40 4 54 4 C70 4 82 16 82 31 C82 47 63 51 61 63 V69 H44 V60 C44 44 64 41 64 31 C64 24 60 20 54 20 C48 20 45 25 45 34 Z"), ...E(52, 86, 10)] },
  { id: "alvo", nome: "Alvo", categoria: "simbolos", caminhos: () => [...E(50, 50, 48), ...menos(E(50, 50, 38)), ...E(50, 50, 28), ...menos(E(50, 50, 18)), ...E(50, 50, 8)] },
  { id: "local", nome: "Localização", categoria: "simbolos", caminhos: () => [...svg("M50 2 C30 2 14 18 14 38 C14 62 50 98 50 98 C50 98 86 62 86 38 C86 18 70 2 50 2 Z"), ...menos(E(50, 37, 13))] },
  { id: "casa", nome: "Casa", categoria: "simbolos", caminhos: () => [...P([[50, 5], [96, 46], [82, 46], [82, 95], [18, 95], [18, 46], [4, 46]]), ...menos(R(40, 62, 20, 33))] },
  { id: "lupa", nome: "Lupa", categoria: "simbolos", caminhos: () => [...anel(40, 40, 34, 24), ...girar(R(62, 32, 40, 16, 6), 45, 40, 40)] },
  { id: "cadeado", nome: "Cadeado", categoria: "simbolos", caminhos: () => [...svg("M28 46 V32 C28 16 38 6 50 6 C62 6 72 16 72 32 V46 H62 V32 C62 22 57 16 50 16 C43 16 38 22 38 32 V46 Z"), ...R(16, 44, 68, 52, 6), ...menos(E(50, 64, 7)), ...menos(R(47, 66, 6, 16))] },
  { id: "envelope", nome: "Envelope", categoria: "simbolos", caminhos: () => [...R(4, 18, 92, 64, 4), ...menos(P([[12, 26], [88, 26], [50, 56]]))] },
  { id: "tocar", nome: "Tocar", categoria: "simbolos", caminhos: () => P([[20, 8], [92, 50], [20, 92]]) },
  { id: "pausar", nome: "Pausar", categoria: "simbolos", caminhos: () => [...R(18, 8, 24, 84, 3), ...R(58, 8, 24, 84, 3)] },
  { id: "parar", nome: "Parar", categoria: "simbolos", caminhos: () => R(12, 12, 76, 76, 8) },
  { id: "avancar", nome: "Avançar", categoria: "simbolos", caminhos: () => [...P([[4, 12], [48, 50], [4, 88]]), ...P([[44, 12], [88, 50], [44, 88]]), ...R(88, 12, 8, 76)] },
  { id: "nota-musical", nome: "Nota musical", categoria: "simbolos", caminhos: () => [...girar(E(30, 80, 18, 13), -20, 30, 80), ...R(42, 8, 8, 74), ...svg("M42 8 C55 14 72 18 76 34 C78 26 70 16 50 6 Z")] },
  { id: "wifi", nome: "Sinal sem fio", categoria: "simbolos", caminhos: () => [...setor(48, 38, 225, 315, 50, 86), ...setor(30, 20, 225, 315, 50, 86), ...E(50, 82, 8)] },
  { id: "bateria", nome: "Bateria", categoria: "simbolos", caminhos: () => [...R(4, 26, 84, 48, 6), ...menos(R(11, 33, 70, 34, 3)), ...R(16, 38, 40, 24), ...R(88, 40, 8, 20, 2)] },
  { id: "coroa", nome: "Coroa", categoria: "simbolos", caminhos: () => P([[5, 86], [10, 24], [32, 54], [50, 14], [68, 54], [90, 24], [95, 86]]) },
  { id: "diamante", nome: "Diamante", categoria: "simbolos", caminhos: () => P([[24, 10], [76, 10], [96, 36], [50, 94], [4, 36]]) },
  { id: "infinito", nome: "Infinito", categoria: "simbolos", caminhos: () => [...E(28, 50, 24), ...E(72, 50, 24), ...menos(E(28, 50, 12)), ...menos(E(72, 50, 12))] },
  { id: "olho", nome: "Olho", categoria: "simbolos", caminhos: () => [...svg("M2 50 C20 18 80 18 98 50 C80 82 20 82 2 50 Z"), ...menos(E(50, 50, 18)), ...E(50, 50, 9)] },
  { id: "sino", nome: "Sino", categoria: "simbolos", caminhos: () => [...svg("M50 8 C30 8 20 25 20 45 V64 L10 78 H90 L80 64 V45 C80 25 70 8 50 8 Z"), ...E(50, 87, 8)] },
  { id: "engrenagem-6", nome: "Engrenagem de 6 dentes", categoria: "simbolos", caminhos: () => engrenagem(6, 14) },
  { id: "engrenagem-8", nome: "Engrenagem de 8 dentes", categoria: "simbolos", caminhos: () => engrenagem(8, 16) },
  { id: "engrenagem-12", nome: "Engrenagem de 12 dentes", categoria: "simbolos", caminhos: () => engrenagem(12, 18) },
  { id: "engrenagem-16", nome: "Engrenagem de 16 dentes", categoria: "simbolos", caminhos: () => engrenagem(16, 20) },
  { id: "pare", nome: "Placa de parar", categoria: "simbolos", caminhos: () => [...P(regular(8, 50, -112.5)), ...menos(P(regular(8, 42, -112.5))), ...P(regular(8, 38, -112.5))] },
  { id: "proibido", nome: "Proibido", categoria: "simbolos", caminhos: () => [...anel(50, 50, 48, 36), ...girar(R(14, 44, 72, 12), 45)] },
  { id: "aviso", nome: "Aviso", categoria: "simbolos", caminhos: () => [...P([[50, 4], [98, 92], [2, 92]]), ...menos(svg("M45 34 H55 L53 66 H47 Z")), ...menos(E(50, 78, 6))] },
  { id: "relogio", nome: "Relógio", categoria: "simbolos", caminhos: () => [...anel(50, 50, 48, 40), ...R(46, 20, 8, 34, 3), ...girar(R(46, 46, 8, 26, 3), -60, 50, 50)] },
  { id: "chat", nome: "Conversa", categoria: "simbolos", caminhos: () => [...svg("M8 10 H70 Q76 10 76 16 V50 Q76 56 70 56 H34 L18 70 V56 H8 Q2 56 2 50 V16 Q2 10 8 10 Z"), ...svg("M84 34 H92 Q98 34 98 40 V72 Q98 78 92 78 H86 V90 L72 78 H40 Q34 78 34 72 V62 H72 Q84 62 84 50 Z")] },
  { id: "usuario", nome: "Pessoa", categoria: "simbolos", caminhos: () => [...E(50, 28, 20), ...svg("M12 96 C12 70 30 56 50 56 C70 56 88 70 88 96 Z")] },
  { id: "compartilhar", nome: "Compartilhar", categoria: "simbolos", caminhos: () => [...E(78, 20, 14), ...E(22, 50, 14), ...E(78, 80, 14), ...P([[22, 46], [76, 16], [80, 24], [26, 54]]), ...P([[26, 46], [80, 76], [76, 84], [22, 54]])] },

  // Molduras
  { id: "moldura-quadrada", nome: "Moldura quadrada", categoria: "molduras", caminhos: () => [...R(0, 0, 100, 100), ...menos(R(10, 10, 80, 80))] },
  { id: "moldura-arredondada", nome: "Moldura arredondada", categoria: "molduras", caminhos: () => [...R(0, 0, 100, 100, 16), ...menos(R(10, 10, 80, 80, 8))] },
  { id: "moldura-redonda", nome: "Moldura redonda", categoria: "molduras", caminhos: () => anel(50, 50, 50, 42) },
  { id: "moldura-dupla", nome: "Moldura dupla", categoria: "molduras", caminhos: () => [...R(0, 0, 100, 100), ...menos(R(5, 5, 90, 90)), ...R(9, 9, 82, 82), ...menos(R(13, 13, 74, 74))] },
  { id: "moldura-foto", nome: "Moldura de foto instantânea", categoria: "molduras", caminhos: () => [...R(4, 0, 92, 100, 2), ...menos(R(12, 8, 76, 70))] },
  { id: "moldura-filme", nome: "Tira de filme", categoria: "molduras", caminhos: () => [...R(0, 12, 100, 76), ...menos(R(6, 26, 40, 48)), ...menos(R(54, 26, 40, 48)), ...Array.from({ length: 8 }, (_, i) => menos(R(4 + i * 12.5, 15, 6, 7, 1))).flat(), ...Array.from({ length: 8 }, (_, i) => menos(R(4 + i * 12.5, 78, 6, 7, 1))).flat()] },
  { id: "moldura-cantos", nome: "Cantos", categoria: "molduras", caminhos: () => [0, 90, 180, 270].flatMap((g) => girar(P([[0, 0], [36, 0], [36, 8], [8, 8], [8, 36], [0, 36]]), g)) },
  { id: "moldura-oval", nome: "Moldura oval", categoria: "molduras", caminhos: () => [...E(50, 50, 50, 50), ...menos(E(50, 50, 40, 46))] },

  // Enfeites
  { id: "coracao-vazado", nome: "Coração vazado", categoria: "enfeites", caminhos: () => [...svg("M50 92 C20 70 2 52 2 30 C2 14 14 4 28 4 C38 4 46 10 50 18 C54 10 62 4 72 4 C86 4 98 14 98 30 C98 52 80 70 50 92 Z"), ...menos(svg("M50 78 C28 61 14 47 14 31 C14 21 21 15 29 15 C37 15 44 21 50 32 C56 21 63 15 71 15 C79 15 86 21 86 31 C86 47 72 61 50 78 Z"))] },
  { id: "coracoes", nome: "Dois corações", categoria: "enfeites", caminhos: () => [...transformarCaminhos(svg("M50 92 C20 70 2 52 2 30 C2 14 14 4 28 4 C38 4 46 10 50 18 C54 10 62 4 72 4 C86 4 98 14 98 30 C98 52 80 70 50 92 Z"), (p) => ({ x: p.x * 0.6, y: p.y * 0.6 + 10 })), ...transformarCaminhos(svg("M50 92 C20 70 2 52 2 30 C2 14 14 4 28 4 C38 4 46 10 50 18 C54 10 62 4 72 4 C86 4 98 14 98 30 C98 52 80 70 50 92 Z"), (p) => ({ x: p.x * 0.5 + 48, y: p.y * 0.5 + 40 }))] },
  { id: "flor-8", nome: "Flor de oito pétalas", categoria: "enfeites", caminhos: () => [...Array.from({ length: 8 }, (_, i) => girar(svg("M50 50 C40 35 40 10 50 2 C60 10 60 35 50 50 Z"), i * 45)).flat(), ...menos(E(50, 50, 8))] },
  { id: "rosacea", nome: "Rosácea", categoria: "enfeites", caminhos: () => Array.from({ length: 6 }, (_, i) => girar(anel(50, 26, 24, 18), i * 60)).flat() },
  { id: "estrela-de-davi", nome: "Estrela de seis pontas vazada", categoria: "enfeites", caminhos: () => [...P(regular(3, 50)), ...P(regular(3, 50, 90)), ...menos(P(regular(6, 24, 0)))] },
  { id: "divisor", nome: "Divisor", categoria: "enfeites", caminhos: () => [...R(0, 47, 38, 6, 3), ...R(62, 47, 38, 6, 3), ...P([[50, 38], [62, 50], [50, 62], [38, 50]])] },
  { id: "espiral", nome: "Espiral", categoria: "enfeites", caminhos: () => svg("M50 50 m0 -4 a4 4 0 0 1 4 4 a8 8 0 0 1 -8 8 a12 12 0 0 1 -12 -12 a16 16 0 0 1 16 -16 a20 20 0 0 1 20 20 a24 24 0 0 1 -24 24 a28 28 0 0 1 -28 -28 a32 32 0 0 1 32 -32 l0 6 a26 26 0 0 0 -26 26 a22 22 0 0 0 22 22 a18 18 0 0 0 18 -18 a14 14 0 0 0 -14 -14 a10 10 0 0 0 -10 10 a6 6 0 0 0 6 6 a2 2 0 0 0 2 -2 Z") },
  { id: "pingos", nome: "Pingos", categoria: "enfeites", caminhos: () => [...E(20, 30, 12), ...E(55, 18, 9), ...E(80, 45, 14), ...E(40, 70, 16), ...E(78, 84, 8)] },
  { id: "estrelinhas", nome: "Estrelinhas", categoria: "enfeites", caminhos: () => [...P(estrela(4, 0.3, 26, -90, 30, 30)), ...P(estrela(4, 0.3, 16, -90, 74, 26)), ...P(estrela(4, 0.3, 20, -90, 66, 72))] },
];

/** A forma pelo id (as do espaço vêm de fora). */
export function formaPronta(id: string): FormaPronta | undefined {
  return FORMAS_PRONTAS.find((forma) => forma.id === id);
}
