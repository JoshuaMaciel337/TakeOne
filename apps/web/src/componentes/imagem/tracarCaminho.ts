// O "Traçar caminho" do painel Caminhos (ADR 0003, onda 13.7): o pincel escolhido anda pelos pontos de cada componente
// do caminho, com o espaçamento dele, como um traço feito com o mouse (sem a corda: o caminho já é liso). A pressão
// simulada afina as pontas: sobe do começo até um quarto do comprimento e desce no último quarto.
import type { Pintura } from "@/lib/pintura/motor";
import { Espacador, type FerramentaDePintura, type OpcoesDoPincel, pontoNaCamada, type PontoDoTraco } from "@/lib/pintura/traco";
import type { Caixa, Tamanho } from "@/lib/projeto/geometria";
import { matrizDaMascaraNoDocumento, matrizDaMidiaNoDocumento, pontoNaMascara } from "@/lib/projeto/mascaraDePixels";
import type { Selecao } from "@/lib/selecao/mascara";
import { selecaoNaMidia } from "@/lib/selecao/naTela";
import { pontosAoLongo } from "@/lib/vetor/contorno";
import type { Subcaminho } from "@/lib/vetor/modelo";

import type { AlvoDaPintura } from "./PinturaNaPrevia";

/** A pressão simulada numa fração do caminho (as pontas finas, o meio cheio). */
export function pressaoSimulada(fracao: number): number {
  const ponta = Math.min(fracao, 1 - fracao) / 0.25;
  return Math.max(0.05, Math.min(1, ponta));
}

/** Os traços (um por componente) em pixels do documento, um ponto por pixel. */
export function tracosDoCaminho(subcaminhos: Subcaminho[], simularPressao: boolean): PontoDoTraco[][] {
  return subcaminhos.filter((sub) => sub.nos.length >= 2).map((sub) => pontosAoLongo(sub, 1).map((p) => ({ x: p.x, y: p.y, pressao: simularPressao ? pressaoSimulada(p.fracao) : 1 })));
}

/** Pinta os traços no alvo; devolve se algum mudou a camada. */
export function tracarNoAlvo(
  alvo: Omit<AlvoDaPintura, "caixa"> & { caixa: Caixa | null; pintura: Pintura },
  tracos: PontoDoTraco[][],
  { ferramenta, opcoes, cores, documento, selecao }: { ferramenta: FerramentaDePintura; opcoes: OpcoesDoPincel; cores: { primeiroPlano: string; fundo: string }; documento: Tamanho; selecao: Selecao | null },
): boolean {
  const caixa = alvo.caixa ?? { cx: documento.largura / 2, cy: documento.altura / 2, largura: documento.largura, altura: documento.altura, rotacao: 0, opacidade: 1 };
  const midia = { largura: alvo.pintura.largura, altura: alvo.pintura.altura };
  const mascara = alvo.mascara;
  const escala = mascara ? 1 : pontoNaCamada({ x: caixa.cx, y: caixa.cy }, caixa, alvo.recorte, alvo.virar, midia).escala;
  const mapear = mascara ? (p: PontoDoTraco) => ({ ...p, ...pontoNaMascara(p, mascara, caixa, documento, documento) }) : (p: PontoDoTraco) => ({ ...pontoNaCamada(p, caixa, alvo.recorte, alvo.virar, midia), pressao: p.pressao });
  const diametro = Math.max(1, opcoes.tamanho * escala);
  const limite = selecao ? selecaoNaMidia(selecao, mascara ? matrizDaMascaraNoDocumento(mascara, caixa, documento, documento) : matrizDaMidiaNoDocumento(caixa, alvo.recorte, alvo.virar, midia, documento, documento), midia) : null;
  let mudou = false;
  for (const pontos of tracos) {
    if (!pontos.length) continue;
    const espacador = new Espacador();
    const primeiro = mapear(pontos[0]);
    alvo.pintura.iniciar({ ferramenta, opcoes, diametro, ...cores, travarTransparencia: alvo.travarTransparencia, fonteDaTinta: alvo.fonteDaTinta, porMarca: alvo.porMarca, limite }, primeiro);
    espacador.ate(primeiro, () => diametro * opcoes.espacamento);
    for (const p of pontos.slice(1)) for (const marca of espacador.ate(mapear(p), (pressao) => alvo.pintura.diametroEm(pressao) * opcoes.espacamento)) alvo.pintura.marcar(marca);
    alvo.pintura.atualizarTela();
    if (alvo.pintura.terminar()) mudou = true;
  }
  return mudou;
}
