// Som da prévia pelo Web Audio. Cada `<audio>` passa por um ganho próprio: assim o volume do clipe
// vai até 400% (o elemento sozinho para em 100%), e a mesma ligação recebe depois o ducking e os
// efeitos de voz da fase 3.
//
// O navegador só deixa o som começar depois de um clique ou tecla da pessoa. Por isso o contexto
// só é criado em `retomarAudio`, chamado quando a pessoa aperta reproduzir.

let contexto: AudioContext | null = null;
const ganhos = new WeakMap<HTMLMediaElement, GainNode>();

function webAudioDisponivel(): boolean {
  return typeof window !== "undefined" && "AudioContext" in window;
}

/** Cria ou acorda o contexto de áudio. Chamar dentro do clique ou da tecla que começa a reprodução. */
export function retomarAudio() {
  if (!webAudioDisponivel()) return;
  contexto ??= new AudioContext({ latencyHint: "interactive" });
  if (contexto.state === "suspended") void contexto.resume();
}

/**
 * Volume do elemento, de 0 a 4. Sem o contexto ainda (a pessoa não apertou reproduzir) ou sem Web
 * Audio, usa o volume do próprio elemento, que vai só até 1.
 */
export function aplicarVolume(elemento: HTMLMediaElement, volume: number) {
  let ganho = ganhos.get(elemento);
  if (!ganho && contexto) {
    // Um elemento só pode ser ligado uma vez; depois disso o som dele sai só pelo ganho
    ganho = contexto.createGain();
    contexto.createMediaElementSource(elemento).connect(ganho).connect(contexto.destination);
    ganhos.set(elemento, ganho);
  }
  if (ganho) {
    elemento.volume = 1;
    ganho.gain.value = Math.max(0, volume);
  } else {
    elemento.volume = Math.min(1, Math.max(0, volume));
  }
}
