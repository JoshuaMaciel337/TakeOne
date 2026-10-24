// As predefinições do painel Propriedades de cada ajuste (ADR 0003, onda 13.10), desenhadas aqui: os nomes de
// sempre (mais claro, mais contraste, filtros de lente no preto e branco, infravermelho no mixer...), com valores do
// TakeOne. A escolha troca o ajuste inteiro; mexer depois volta a "Personalizado".
import { ajustePadrao, type AjusteDaImagem, type NiveisDoCanal, type TipoDoAjuste } from "./ajustes.ts";

export type Predefinicao = { nome: string; ajuste: AjusteDaImagem };

const niveis = (preto: number, gama: number, branco: number, saida: [number, number] = [0, 255]): NiveisDoCanal => ({ preto, gama, branco, saida_preto: saida[0], saida_branco: saida[1] });
const curva = (...pontos: [number, number][]) => ({ pontos: pontos.map(([x, y]) => [x / 255, y / 255] as [number, number]) });
const pesos = (vermelhos: number, amarelos: number, verdes: number, cianos: number, azuis: number, magentas: number) => ({ vermelhos, amarelos, verdes, cianos, azuis, magentas });
const mono = (r: number, g: number, b: number): AjusteDaImagem => ({ ...(ajustePadrao("mixer") as Extract<AjusteDaImagem, { tipo: "mixer" }>), monocromatico: true, cinza: { r, g, b, constante: 0 } });
const matiz = (mudanca: Partial<Extract<AjusteDaImagem, { tipo: "matiz_saturacao" }>>): AjusteDaImagem => ({ ...(ajustePadrao("matiz_saturacao") as Extract<AjusteDaImagem, { tipo: "matiz_saturacao" }>), ...mudanca });

export const PREDEFINICOES: Partial<Record<TipoDoAjuste, Predefinicao[]>> = {
  niveis: [
    { nome: "Mais claro", ajuste: { tipo: "niveis", canais: { rgb: niveis(0, 1.3, 230) } } },
    { nome: "Mais escuro", ajuste: { tipo: "niveis", canais: { rgb: niveis(15, 0.75, 255) } } },
    { nome: "Aumentar o contraste 1", ajuste: { tipo: "niveis", canais: { rgb: niveis(10, 1, 245) } } },
    { nome: "Aumentar o contraste 2", ajuste: { tipo: "niveis", canais: { rgb: niveis(20, 1, 235) } } },
    { nome: "Aumentar o contraste 3", ajuste: { tipo: "niveis", canais: { rgb: niveis(30, 1, 225) } } },
    { nome: "Clarear as sombras", ajuste: { tipo: "niveis", canais: { rgb: niveis(0, 1.6, 255) } } },
    { nome: "Escurecer os meios-tons", ajuste: { tipo: "niveis", canais: { rgb: niveis(0, 0.7, 255) } } },
    { nome: "Esmaecido", ajuste: { tipo: "niveis", canais: { rgb: niveis(0, 1, 255, [40, 225]) } } },
  ],
  curvas: [
    { nome: "Contraste maior", ajuste: { tipo: "curvas", canais: { rgb: curva([0, 0], [64, 48], [192, 208], [255, 255]) } } },
    { nome: "Contraste médio", ajuste: { tipo: "curvas", canais: { rgb: curva([0, 0], [64, 56], [192, 200], [255, 255]) } } },
    { nome: "Contraste menor", ajuste: { tipo: "curvas", canais: { rgb: curva([0, 0], [64, 72], [192, 184], [255, 255]) } } },
    { nome: "Mais claro", ajuste: { tipo: "curvas", canais: { rgb: curva([0, 0], [128, 160], [255, 255]) } } },
    { nome: "Mais escuro", ajuste: { tipo: "curvas", canais: { rgb: curva([0, 0], [128, 96], [255, 255]) } } },
    { nome: "Negativo", ajuste: { tipo: "curvas", canais: { rgb: curva([0, 255], [255, 0]) } } },
    { nome: "Esmaecido", ajuste: { tipo: "curvas", canais: { rgb: curva([0, 40], [128, 132], [255, 230]) } } },
    {
      nome: "Processo cruzado",
      ajuste: { tipo: "curvas", canais: { r: curva([0, 0], [64, 48], [192, 210], [255, 255]), g: curva([0, 0], [64, 52], [192, 205], [255, 255]), b: curva([0, 40], [255, 215]) } },
    },
  ],
  exposicao: [
    { nome: "Menos 2 pontos", ajuste: { tipo: "exposicao", exposicao: -2, deslocamento: 0, gama: 1 } },
    { nome: "Menos 1 ponto", ajuste: { tipo: "exposicao", exposicao: -1, deslocamento: 0, gama: 1 } },
    { nome: "Mais 1 ponto", ajuste: { tipo: "exposicao", exposicao: 1, deslocamento: 0, gama: 1 } },
    { nome: "Mais 2 pontos", ajuste: { tipo: "exposicao", exposicao: 2, deslocamento: 0, gama: 1 } },
  ],
  matiz_saturacao: [
    { nome: "Cianotipia", ajuste: matiz({ colorir: true, cor_colorir: { matiz: 210, saturacao: 25, luminosidade: 0 } }) },
    { nome: "Sépia", ajuste: matiz({ colorir: true, cor_colorir: { matiz: 35, saturacao: 25, luminosidade: 0 } }) },
    { nome: "Mais saturação", ajuste: matiz({ mestre: { matiz: 0, saturacao: 30, luminosidade: 0 } }) },
    { nome: "Menos saturação", ajuste: matiz({ mestre: { matiz: 0, saturacao: -30, luminosidade: 0 } }) },
    { nome: "Antigo", ajuste: matiz({ mestre: { matiz: 0, saturacao: -40, luminosidade: 5 } }) },
    { nome: "Vermelhos mais fortes", ajuste: matiz({ faixas: { vermelhos: { matiz: 0, saturacao: 35, luminosidade: 0, limites: [315, 345, 15, 45] } } }) },
  ],
  preto_branco: [
    { nome: "Padrão", ajuste: ajustePadrao("preto_branco") },
    { nome: "Filtro azul", ajuste: { ...(ajustePadrao("preto_branco") as Extract<AjusteDaImagem, { tipo: "preto_branco" }>), pesos: pesos(0, 0, 0, 110, 140, 110) } },
    { nome: "Filtro verde", ajuste: { ...(ajustePadrao("preto_branco") as Extract<AjusteDaImagem, { tipo: "preto_branco" }>), pesos: pesos(40, 110, 140, 110, 0, 0) } },
    { nome: "Filtro vermelho", ajuste: { ...(ajustePadrao("preto_branco") as Extract<AjusteDaImagem, { tipo: "preto_branco" }>), pesos: pesos(120, 110, -10, -50, -50, 120) } },
    { nome: "Filtro amarelo", ajuste: { ...(ajustePadrao("preto_branco") as Extract<AjusteDaImagem, { tipo: "preto_branco" }>), pesos: pesos(100, 120, 40, -30, -40, 50) } },
    { nome: "Infravermelho", ajuste: { ...(ajustePadrao("preto_branco") as Extract<AjusteDaImagem, { tipo: "preto_branco" }>), pesos: pesos(-40, 235, 145, -70, -65, -45) } },
    { nome: "Mais claro", ajuste: { ...(ajustePadrao("preto_branco") as Extract<AjusteDaImagem, { tipo: "preto_branco" }>), pesos: pesos(70, 90, 70, 90, 50, 110) } },
    { nome: "Mais escuro", ajuste: { ...(ajustePadrao("preto_branco") as Extract<AjusteDaImagem, { tipo: "preto_branco" }>), pesos: pesos(20, 40, 20, 40, 0, 60) } },
    { nome: "Contraste alto", ajuste: { ...(ajustePadrao("preto_branco") as Extract<AjusteDaImagem, { tipo: "preto_branco" }>), pesos: pesos(120, 120, -40, -40, -40, 120) } },
  ],
  mixer: [
    { nome: "Preto e branco infravermelho", ajuste: mono(-70, 200, -30) },
    { nome: "Preto e branco com filtro azul", ajuste: mono(0, 0, 100) },
    { nome: "Preto e branco com filtro verde", ajuste: mono(0, 100, 0) },
    { nome: "Preto e branco com filtro laranja", ajuste: mono(50, 50, 0) },
    { nome: "Preto e branco com filtro vermelho", ajuste: mono(100, 0, 0) },
    { nome: "Preto e branco com filtro amarelo", ajuste: mono(34, 66, 0) },
    { nome: "Trocar o vermelho e o azul", ajuste: { ...(ajustePadrao("mixer") as Extract<AjusteDaImagem, { tipo: "mixer" }>), vermelho: { r: 0, g: 0, b: 100, constante: 0 }, azul: { r: 100, g: 0, b: 0, constante: 0 } } },
  ],
};
