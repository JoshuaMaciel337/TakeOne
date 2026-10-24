// Os estilos prontos do painel Estilos do editor de imagem (ADR 0003, onda 13.9), desenhados aqui: cada um é um
// estilo de camada com o preenchimento que ele pede (o vidro, por exemplo, deixa o conteúdo quase transparente).
import type { Degrade } from "../pintura/degrade.ts";
import { CONTORNOS_PRONTOS, type Efeito, efeitoPadrao, type EstiloDeCamada, type TipoDoEfeito } from "./estiloDeCamada.ts";

export type EstiloPronto = { id: string; nome: string; estilo: EstiloDeCamada; preenchimento: number };

const degrade = (nome: string, cores: [number, string][]): Degrade => ({
  nome,
  tipo: "solido",
  cores: cores.map(([posicao, cor]) => ({ posicao, cor, meio: 0.5 })),
  opacidades: [
    { posicao: 0, opacidade: 1, meio: 0.5 },
    { posicao: 1, opacidade: 1, meio: 0.5 },
  ],
  suavidade: 1,
  aspereza: 0.5,
  semente: 1,
});

let contador = 0;
/** Um efeito com os padrões e o que muda. */
const efeito = (tipo: TipoDoEfeito, mudanca: Partial<Efeito> = {}): Efeito => ({ ...efeitoPadrao(tipo, `pronto${++contador}`), ...mudanca });
const pronto = (id: string, nome: string, efeitos: Efeito[], preenchimento = 1): EstiloPronto => ({ id, nome, estilo: { efeitos }, preenchimento });

const OURO = degrade("Ouro", [[0, "#7a5410"], [0.35, "#f6d365"], [0.55, "#fff1b8"], [0.75, "#c8902a"], [1, "#6b4a0e"]]);
const CROMO = degrade("Cromado", [[0, "#3a3f47"], [0.3, "#e9eef5"], [0.5, "#7d8794"], [0.52, "#2b2f36"], [0.8, "#d8dee8"], [1, "#59616d"]]);
const FOGO = degrade("Fogo", [[0, "#7a0b00"], [0.45, "#ff4d00"], [0.8, "#ffb300"], [1, "#fff2a8"]]);
const GELO = degrade("Gelo", [[0, "#0b3d6e"], [0.5, "#5fc8ff"], [1, "#eaf9ff"]]);
const POR_DO_SOL = degrade("Pôr do sol", [[0, "#2e1a6b"], [0.5, "#e8467c"], [1, "#ffcc5c"]]);
const BOTAO = degrade("Botão", [[0, "#2f6fe0"], [1, "#7fb2ff"]]);

export const ESTILOS_PRONTOS: EstiloPronto[] = [
  pronto("sombra-suave", "Sombra suave", [efeito("sombra", { opacidade: 0.45, distancia: 6, tamanho: 14 })]),
  pronto("sombra-dura", "Sombra dura", [efeito("sombra", { modo: "normal", opacidade: 1, distancia: 8, tamanho: 0, angulo: 135, luz_global: false })]),
  pronto("sombra-longa", "Sombra longa", [
    efeito("sombra", { opacidade: 0.35, distancia: 8, tamanho: 2, angulo: 135, luz_global: false }),
    efeito("sombra", { opacidade: 0.25, distancia: 16, tamanho: 4, angulo: 135, luz_global: false }),
    efeito("sombra", { opacidade: 0.15, distancia: 26, tamanho: 8, angulo: 135, luz_global: false }),
  ]),
  pronto("contorno-branco", "Contorno branco", [efeito("tracado", { tamanho: 6, tinta: { tipo: "cor", cor: "#ffffff" } }), efeito("sombra", { opacidade: 0.4, distancia: 3, tamanho: 6 })]),
  pronto("contorno-duplo", "Contorno duplo", [efeito("tracado", { tamanho: 4, tinta: { tipo: "cor", cor: "#ffffff" } }), efeito("tracado", { tamanho: 9, tinta: { tipo: "cor", cor: "#111111" } })]),
  pronto("neon", "Neon", [
    efeito("sobreposicao_cor", { cor: "#e8fdff" }),
    efeito("brilho_interno", { modo: "normal", cor: "#3ff5ff", tamanho: 6, opacidade: 0.9 }),
    efeito("brilho_externo", { modo: "tela", cor: "#00d5ff", tamanho: 22, espalhar: 0.1, opacidade: 0.9 }),
  ]),
  pronto("neon-rosa", "Neon rosa", [
    efeito("sobreposicao_cor", { cor: "#fff0fa" }),
    efeito("brilho_interno", { modo: "normal", cor: "#ff4fd8", tamanho: 6, opacidade: 0.9 }),
    efeito("brilho_externo", { modo: "tela", cor: "#ff2bc2", tamanho: 22, espalhar: 0.1, opacidade: 0.9 }),
  ]),
  pronto("ouro", "Ouro", [
    efeito("sobreposicao_degrade", { tinta: { tipo: "degrade", degrade: OURO, forma: "linear", angulo: 90, escala: 1, inverter: false } }),
    efeito("chanfro", { tamanho: 6, profundidade: 2, tecnica: "cinzel_suave", contorno_brilho: CONTORNOS_PRONTOS[5] }),
    efeito("sombra", { opacidade: 0.5, distancia: 4, tamanho: 8 }),
  ]),
  pronto("cromado", "Cromado", [
    efeito("sobreposicao_degrade", { tinta: { tipo: "degrade", degrade: CROMO, forma: "linear", angulo: 90, escala: 1, inverter: false } }),
    efeito("chanfro", { tamanho: 5, profundidade: 3, tecnica: "cinzel_duro", contorno_brilho: CONTORNOS_PRONTOS[6] }),
    efeito("tracado", { tamanho: 1, tinta: { tipo: "cor", cor: "#2b2f36" } }),
  ]),
  pronto("fogo", "Fogo", [
    efeito("sobreposicao_degrade", { tinta: { tipo: "degrade", degrade: FOGO, forma: "linear", angulo: 90, escala: 1, inverter: false } }),
    efeito("brilho_externo", { modo: "tela", cor: "#ff6a00", tamanho: 18, espalhar: 0.05, opacidade: 0.85 }),
    efeito("brilho_interno", { modo: "sobrepor", cor: "#ffe08a", tamanho: 8, opacidade: 0.7 }),
  ]),
  pronto("gelo", "Gelo", [
    efeito("sobreposicao_degrade", { tinta: { tipo: "degrade", degrade: GELO, forma: "linear", angulo: -90, escala: 1, inverter: false } }),
    efeito("chanfro", { tamanho: 8, profundidade: 1.5, cor_realce: "#ffffff", opacidade_realce: 0.9, cor_sombra: "#0b3d6e", opacidade_sombra: 0.5 }),
    efeito("brilho_externo", { modo: "tela", cor: "#bfeaff", tamanho: 10, opacidade: 0.6 }),
  ]),
  pronto(
    "vidro",
    "Vidro",
    [
      efeito("brilho_interno", { modo: "tela", cor: "#ffffff", tamanho: 10, opacidade: 0.6 }),
      efeito("chanfro", { tamanho: 10, profundidade: 1.2, opacidade_realce: 0.8, opacidade_sombra: 0.35 }),
      efeito("sombra", { opacidade: 0.3, distancia: 6, tamanho: 12 }),
    ],
    0.15,
  ),
  pronto("plastico", "Plástico", [
    efeito("chanfro", { tamanho: 10, profundidade: 2, suavidade: 3, contorno_brilho: CONTORNOS_PRONTOS[3], opacidade_realce: 0.9 }),
    efeito("sombra_interna", { opacidade: 0.3, distancia: 3, tamanho: 6, angulo: -60, luz_global: false }),
    efeito("sombra", { opacidade: 0.45, distancia: 5, tamanho: 10 }),
  ]),
  pronto("relevo", "Relevo", [efeito("chanfro", { estilo: "entalhe", tamanho: 4, profundidade: 2, tecnica: "cinzel_duro" })]),
  pronto("almofada", "Almofada", [efeito("chanfro", { estilo: "almofada", tamanho: 8, profundidade: 1.5 })]),
  pronto("pressionado", "Pressionado", [efeito("sombra_interna", { opacidade: 0.6, distancia: 4, tamanho: 6 }), efeito("tracado", { tamanho: 1, posicao: "dentro", tinta: { tipo: "cor", cor: "#000000" }, opacidade: 0.3 })]),
  pronto("cetim", "Cetim", [efeito("cetim", { opacidade: 0.6 }), efeito("chanfro", { tamanho: 4, profundidade: 1 })]),
  pronto("botao", "Botão", [
    efeito("sobreposicao_degrade", { tinta: { tipo: "degrade", degrade: BOTAO, forma: "linear", angulo: 90, escala: 1, inverter: false } }),
    efeito("chanfro", { tamanho: 4, profundidade: 1 }),
    efeito("tracado", { tamanho: 1, tinta: { tipo: "cor", cor: "#1d4fae" } }),
    efeito("sombra", { opacidade: 0.4, distancia: 3, tamanho: 6 }),
  ]),
  pronto("retro", "Retrô", [
    efeito("tracado", { tamanho: 3, tinta: { tipo: "cor", cor: "#1b1b1b" } }),
    efeito("sombra", { modo: "normal", cor: "#e8467c", opacidade: 1, distancia: 7, tamanho: 0, espalhar: 1, angulo: 135, luz_global: false }),
  ]),
  pronto("por-do-sol", "Pôr do sol", [
    efeito("sobreposicao_degrade", { tinta: { tipo: "degrade", degrade: POR_DO_SOL, forma: "linear", angulo: 90, escala: 1, inverter: false } }),
    efeito("sombra", { opacidade: 0.35, distancia: 4, tamanho: 10 }),
  ]),
  pronto("carimbo", "Carimbo", [
    efeito("sobreposicao_cor", { cor: "#c0392b" }),
    efeito("chanfro", { estilo: "interno", tamanho: 2, profundidade: 1, textura: { padrao: "pontos", escala: 0.5, profundidade: 2, inverter: true } }),
  ]),
];
