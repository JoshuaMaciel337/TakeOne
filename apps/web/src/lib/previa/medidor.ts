// Medidor de loudness da prévia: o som de todos os clipes passa pelo barramento mestre (lib/previa/audio.ts) e,
// dali, pelos filtros K da norma BS.1770, com os mesmos coeficientes da exportação no navegador (somFinal.ts),
// num IIRFilterNode por canal. A cada 100 ms entra um bloco: a energia dos últimos 400 ms. Daí saem o
// momentâneo (o último bloco), o curto (a média dos blocos dos últimos 3 s), o integrado desde que a pessoa
// apertou reproduzir (com os portões da norma) e o pico de amostra.
import { filtrosK, ganhoParaOAlvo, integradoDosBlocos, lufsDaEnergia } from "../exportacao/somFinal.ts";

export type Medida = { momentaneo: number | null; curto: number | null; integrado: number | null; picoDb: number; ganhoNaExportacao: number };

const BLOCO_S = 0.4;
const PASSO_MS = 100;
const BLOCOS_DO_CURTO = 30;
/** Abaixo disso o bloco é silêncio (o mesmo portão absoluto da norma). */
const SILENCIO_LUFS = -70;

/** Os nós do medidor, ligados ao barramento mestre. */
export type Medidor = {
  ler: () => Medida;
  /** Ligado ao apertar reproduzir (o integrado começa de novo); desligado na pausa, para o silêncio não entrar. */
  medindo: (ligado: boolean) => void;
};

export function criarMedidor(ctx: AudioContext, mestre: AudioNode): Medidor {
  const divisor = ctx.createChannelSplitter(2);
  mestre.connect(divisor);
  const [prateleira, passaAltas] = filtrosK(ctx.sampleRate);
  const tamanho = Math.round(BLOCO_S * ctx.sampleRate);
  const canais = [0, 1].map((canal) => {
    const k1 = ctx.createIIRFilter(prateleira.b, prateleira.a);
    const k2 = ctx.createIIRFilter(passaAltas.b, passaAltas.a);
    const ponderado = ctx.createAnalyser();
    ponderado.fftSize = 32768;
    const cru = ctx.createAnalyser();
    cru.fftSize = 8192;
    divisor.connect(k1, canal).connect(k2).connect(ponderado);
    divisor.connect(cru, canal);
    return { ponderado, cru, amostras: new Float32Array(32768), cruas: new Float32Array(8192) };
  });
  let blocos: number[] = [];
  let pico = 0;
  let ligado = false;
  const medir = () => {
    if (!ligado) return;
    let energia = 0;
    for (const canal of canais) {
      canal.ponderado.getFloatTimeDomainData(canal.amostras);
      let soma = 0;
      for (let i = canal.amostras.length - tamanho; i < canal.amostras.length; i++) soma += canal.amostras[i] * canal.amostras[i];
      energia += soma / tamanho;
      canal.cru.getFloatTimeDomainData(canal.cruas);
      for (const valor of canal.cruas) pico = Math.max(pico, Math.abs(valor));
    }
    blocos.push(energia);
  };
  window.setInterval(medir, PASSO_MS);
  return {
    ler: () => {
      const ultimo = blocos[blocos.length - 1];
      const recentes = blocos.slice(-BLOCOS_DO_CURTO);
      const curto = recentes.length ? recentes.reduce((a, b) => a + b, 0) / recentes.length : 0;
      const valor = (energia: number | undefined) => (energia && lufsDaEnergia(energia) > SILENCIO_LUFS ? lufsDaEnergia(energia) : null);
      const integrado = integradoDosBlocos(blocos);
      const medida = { momentaneo: valor(ultimo), curto: valor(curto), integrado, picoDb: pico > 0 ? 20 * Math.log10(pico) : -Infinity, ganhoNaExportacao: ganhoParaOAlvo(integrado) };
      pico *= 0.5;
      return medida;
    },
    medindo: (agora) => {
      if (agora && !ligado) {
        blocos = [];
        pico = 0;
      }
      ligado = agora;
    },
  };
}
