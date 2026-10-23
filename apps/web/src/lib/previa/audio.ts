// Som da prévia pelo Web Audio. Cada `<audio>` passa pelos efeitos de voz e por um ganho próprio:
// assim o volume do clipe vai até 400% (o elemento sozinho para em 100%), e a mesma ligação recebe
// os fades, o abaixar na fala e os efeitos, como o render (core/utils/render.py) faz:
//
//   elemento → graves → médios → agudos ─┬─────────────────────┬→ soma do eco ─┬──────────────────┬→ ganho → saída
//                                        └→ 3 atrasos × queda ─┘                └→ sala × reverb ──┘
//
// Os filtros são os do "Audio EQ Cookbook", os mesmos dos filtros do FFmpeg; o reverb usa a mesma
// resposta ao impulso do worker (/api/som/reverb.wav), sem normalizar.
//
// O navegador só deixa o som começar depois de um clique ou tecla da pessoa. Por isso o contexto
// só é criado em `retomarAudio`, chamado quando a pessoa aperta reproduzir.
import { criarMedidor, type Medidor } from "./medidor.ts";
import { ECO_ATRASO_S, ECO_REPETICOES, type EfeitosVoz, FAIXAS_DO_EQ, RONCO_HZ, RONCO_Q_DB, SEM_EFEITOS_VOZ } from "../projeto/som.ts";

export type Cadeia = {
  ganho: GainNode;
  filtros: Record<keyof typeof FAIXAS_DO_EQ | "ronco", BiquadFilterNode>;
  ecos: GainNode[];
  /** A cauda da sala: nasce quando o reverb é ligado pela primeira vez. */
  sala: { convolucao: ConvolverNode; volume: GainNode } | null;
  soma: GainNode;
};

let contexto: AudioContext | null = null;
/** O barramento mestre: o som de todos os clipes passa por ele antes da saída (e o medidor escuta dali). */
let mestre: GainNode | null = null;
let medidor: Medidor | null = null;
const cadeias = new WeakMap<HTMLMediaElement, Cadeia>();
let respostaDaSala: Promise<AudioBuffer> | null = null;

function webAudioDisponivel(): boolean {
  return typeof window !== "undefined" && "AudioContext" in window;
}

/** Cria ou acorda o contexto de áudio. Chamar dentro do clique ou da tecla que começa a reprodução. */
export function retomarAudio() {
  if (!webAudioDisponivel()) return;
  if (!contexto) {
    contexto = new AudioContext({ latencyHint: "interactive" });
    mestre = contexto.createGain();
    mestre.connect(contexto.destination);
  }
  if (contexto.state === "suspended") void contexto.resume();
}

/** O medidor de loudness da prévia (lib/previa/medidor.ts), ou null antes do primeiro reproduzir. */
export function medidorDaPrevia(): Medidor | null {
  if (!contexto || !mestre) return null;
  medidor ??= criarMedidor(contexto, mestre);
  return medidor;
}

/**
 * Os nós de um clipe, da fonte ao destino: equalizador, eco e o ganho do clipe. A prévia liga um elemento
 * `<audio>`; a exportação no navegador, um AudioBuffer num contexto sem tempo real (a mesma cadeia).
 */
export function criarCadeia(ctx: BaseAudioContext, fonte: AudioNode, destino: AudioNode): Cadeia {
  const filtro = (tipo: BiquadFilterType, frequencia: number) => {
    const no = ctx.createBiquadFilter();
    no.type = tipo;
    no.frequency.value = frequencia;
    no.Q.value = 1;
    no.gain.value = 0;
    return no;
  };
  // Tirar o ronco: o passa-altas antes do equalizador, como no render; desligado, a frequência 0 deixa o som passar
  const ronco = filtro("highpass", 0);
  ronco.Q.value = RONCO_Q_DB;
  const filtros = {
    ronco,
    grave: filtro(...FAIXAS_DO_EQ.grave),
    medio: filtro(...FAIXAS_DO_EQ.medio),
    agudo: filtro(...FAIXAS_DO_EQ.agudo),
  };
  const soma = ctx.createGain();
  const ganho = ctx.createGain();
  fonte.connect(filtros.ronco).connect(filtros.grave).connect(filtros.medio).connect(filtros.agudo).connect(soma);
  const ecos = Array.from({ length: ECO_REPETICOES }, (_, i) => {
    const atraso = ctx.createDelay(1);
    atraso.delayTime.value = ECO_ATRASO_S * (i + 1);
    const queda = ctx.createGain();
    queda.gain.value = 0;
    filtros.agudo.connect(atraso).connect(queda).connect(soma);
    return queda;
  });
  soma.connect(ganho).connect(destino);
  return { ganho, filtros, ecos, sala: null, soma };
}

/**
 * Os valores dos efeitos na cadeia. O reverb precisa da resposta da sala: na primeira vez que ele liga, a
 * cauda nasce e soma ao som seco antes do ganho, sem normalizar (como o afir do render, irnorm=-1).
 */
export function ajustarCadeia(ctx: BaseAudioContext, cadeia: Cadeia, efeitos: EfeitosVoz | null | undefined, sala: AudioBuffer | null) {
  const valores = efeitos ?? SEM_EFEITOS_VOZ;
  cadeia.filtros.ronco.frequency.value = (valores.ronco ?? 0) > 0.5 ? RONCO_HZ : 0;
  cadeia.filtros.grave.gain.value = valores.grave;
  cadeia.filtros.medio.gain.value = valores.medio;
  cadeia.filtros.agudo.gain.value = valores.agudo;
  cadeia.ecos.forEach((queda, i) => (queda.gain.value = valores.eco ** (i + 1)));
  if (valores.reverb > 0 && !cadeia.sala && sala) {
    const convolucao = ctx.createConvolver();
    convolucao.normalize = false;
    convolucao.buffer = sala;
    const volume = ctx.createGain();
    cadeia.sala = { convolucao, volume };
    cadeia.soma.connect(convolucao).connect(volume).connect(cadeia.ganho);
  }
  if (cadeia.sala) cadeia.sala.volume.gain.value = valores.reverb;
}

function cadeiaDo(elemento: HTMLMediaElement): Cadeia | null {
  let cadeia = cadeias.get(elemento) ?? null;
  if (!cadeia && contexto) {
    // Um elemento só pode ser ligado uma vez; depois disso o som dele sai só por esta cadeia
    cadeia = criarCadeia(contexto, contexto.createMediaElementSource(elemento), mestre ?? contexto.destination);
    cadeias.set(elemento, cadeia);
  }
  return cadeia;
}

/** A resposta ao impulso da sala, a mesma do render, baixada uma vez. */
function carregarSala(ctx: AudioContext): Promise<AudioBuffer> {
  respostaDaSala ??= fetch("/api/som/reverb.wav")
    .then((resposta) => resposta.arrayBuffer())
    .then((dados) => ctx.decodeAudioData(dados));
  return respostaDaSala;
}

/**
 * Volume do elemento, de 0 a 4. Sem o contexto ainda (a pessoa não apertou reproduzir) ou sem Web
 * Audio, usa o volume do próprio elemento, que vai só até 1.
 */
export function aplicarVolume(elemento: HTMLMediaElement, volume: number) {
  const cadeia = cadeiaDo(elemento);
  if (cadeia) {
    elemento.volume = 1;
    cadeia.ganho.gain.value = Math.max(0, volume);
  } else {
    elemento.volume = Math.min(1, Math.max(0, volume));
  }
}

/** Equalizador, eco e reverb do clipe. Sem o contexto ainda, ficam para quando ele nascer. */
export function aplicarEfeitos(elemento: HTMLMediaElement, efeitos: EfeitosVoz | null | undefined) {
  const cadeia = cadeiaDo(elemento);
  if (!cadeia || !contexto) return;
  const ctx = contexto;
  ajustarCadeia(ctx, cadeia, efeitos, null);
  // A sala chega depois (baixada uma vez): o reverb liga quando ela estiver aqui
  if ((efeitos?.reverb ?? 0) > 0 && !cadeia.sala) void carregarSala(ctx).then((sala) => ajustarCadeia(ctx, cadeia, efeitos, sala));
}
