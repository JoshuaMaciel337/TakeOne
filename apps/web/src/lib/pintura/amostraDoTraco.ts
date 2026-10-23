"use client";

// A prévia do traço (painel Pincéis e Configurações do pincel): um S pintado pelo motor de verdade, com a pressão
// subindo e descendo, para as variações aparecerem como no traço da pessoa.
import { Pintura } from "./motor.ts";
import { Espacador, type OpcoesDoPincel } from "./traco.ts";

export function desenharAmostraDoTraco(destino: HTMLCanvasElement, opcoes: OpcoesDoPincel, cor: string, fundo = "#ffffff") {
  const largura = destino.width;
  const altura = destino.height;
  const pintura = new Pintura(largura, altura);
  // O tamanho cabe na altura da prévia (o desenho do pincel, não o tamanho de verdade)
  const diametro = Math.max(2, Math.min(opcoes.tamanho, altura * 0.45));
  const ponto = (t: number) => ({ x: largura * (0.08 + 0.84 * t), y: altura * (0.5 + 0.28 * Math.sin(t * Math.PI * 2)), pressao: Math.sin(t * Math.PI) * 0.9 + 0.1 });
  const inicio = ponto(0);
  pintura.iniciar({ ferramenta: "pincel", opcoes: { ...opcoes, aerografo: false }, diametro, primeiroPlano: cor, fundo, travarTransparencia: false }, inicio);
  const espacador = new Espacador();
  espacador.ate(inicio, () => diametro * opcoes.espacamento);
  for (let i = 1; i <= 120; i++) {
    for (const marca of espacador.ate(ponto(i / 120), (pressao) => pintura.diametroEm(pressao) * opcoes.espacamento)) pintura.marcar(marca);
  }
  pintura.terminar();
  const ctx = destino.getContext("2d")!;
  ctx.clearRect(0, 0, largura, altura);
  ctx.drawImage(pintura.camada, 0, 0);
}
