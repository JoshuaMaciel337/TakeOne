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
import { ECO_ATRASO_S, ECO_REPETICOES, type EfeitosVoz, FAIXAS_DO_EQ, SEM_EFEITOS_VOZ } from "../projeto/som.ts";

type Cadeia = {
  ganho: GainNode;
  filtros: Record<keyof typeof FAIXAS_DO_EQ, BiquadFilterNode>;
  ecos: GainNode[];
  /** A cauda da sala: nasce quando o reverb é ligado pela primeira vez. */
  sala: { convolucao: ConvolverNode; volume: GainNode } | null;
  soma: GainNode;
};

let contexto: AudioContext | null = null;
const cadeias = new WeakMap<HTMLMediaElement, Cadeia>();
let respostaDaSala: Promise<AudioBuffer> | null = null;

function webAudioDisponivel(): boolean {
  return typeof window !== "undefined" && "AudioContext" in window;
}

/** Cria ou acorda o contexto de áudio. Chamar dentro do clique ou da tecla que começa a reprodução. */
export function retomarAudio() {
  if (!webAudioDisponivel()) return;
  contexto ??= new AudioContext({ latencyHint: "interactive" });
  if (contexto.state === "suspended") void contexto.resume();
}

function criarCadeia(ctx: AudioContext, elemento: HTMLMediaElement): Cadeia {
  // Um elemento só pode ser ligado uma vez; depois disso o som dele sai só por esta cadeia
  const fonte = ctx.createMediaElementSource(elemento);
  const filtro = (tipo: BiquadFilterType, frequencia: number) => {
    const no = ctx.createBiquadFilter();
    no.type = tipo;
    no.frequency.value = frequencia;
    no.Q.value = 1;
    no.gain.value = 0;
    return no;
  };
  const filtros = {
    grave: filtro(...FAIXAS_DO_EQ.grave),
    medio: filtro(...FAIXAS_DO_EQ.medio),
    agudo: filtro(...FAIXAS_DO_EQ.agudo),
  };
  const soma = ctx.createGain();
  const ganho = ctx.createGain();
  fonte.connect(filtros.grave).connect(filtros.medio).connect(filtros.agudo).connect(soma);
  const ecos = Array.from({ length: ECO_REPETICOES }, (_, i) => {
    const atraso = ctx.createDelay(1);
    atraso.delayTime.value = ECO_ATRASO_S * (i + 1);
    const queda = ctx.createGain();
    queda.gain.value = 0;
    filtros.agudo.connect(atraso).connect(queda).connect(soma);
    return queda;
  });
  soma.connect(ganho).connect(ctx.destination);
  return { ganho, filtros, ecos, sala: null, soma };
}

function cadeiaDo(elemento: HTMLMediaElement): Cadeia | null {
  let cadeia = cadeias.get(elemento) ?? null;
  if (!cadeia && contexto) {
    cadeia = criarCadeia(contexto, elemento);
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
  const valores = efeitos ?? SEM_EFEITOS_VOZ;
  cadeia.filtros.grave.gain.value = valores.grave;
  cadeia.filtros.medio.gain.value = valores.medio;
  cadeia.filtros.agudo.gain.value = valores.agudo;
  cadeia.ecos.forEach((queda, i) => (queda.gain.value = valores.eco ** (i + 1)));
  if (valores.reverb > 0 && !cadeia.sala) {
    const ctx = contexto;
    // Sem normalizar: a mesma convolução do afir do render (irnorm=-1)
    const convolucao = ctx.createConvolver();
    convolucao.normalize = false;
    const volume = ctx.createGain();
    volume.gain.value = valores.reverb;
    cadeia.sala = { convolucao, volume };
    void carregarSala(ctx).then((buffer) => {
      convolucao.buffer = buffer;
      cadeia.soma.connect(convolucao).connect(volume).connect(cadeia.ganho);
    });
  }
  if (cadeia.sala) cadeia.sala.volume.gain.value = valores.reverb;
}
