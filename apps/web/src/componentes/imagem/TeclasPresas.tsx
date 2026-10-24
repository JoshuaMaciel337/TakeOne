"use client";

// O painel Teclas modificadoras do editor de imagem (ADR 0003, onda 13.15): Shift, Ctrl e Alt presos por botões, para a
// tela de toque (sem teclado). Enquanto um está preso, os eventos do ponteiro, da roda e do teclado chegam ao editor
// como se a tecla estivesse apertada: um ouvinte do navegador na captura, antes do React, marca o evento. Com "Só no
// próximo uso", a tecla solta depois do próximo toque ou tecla.
import { useEffect, useSyncExternalStore } from "react";

type Presas = { shift: boolean; ctrl: boolean; alt: boolean; soUmaVez: boolean };
let presas: Presas = { shift: false, ctrl: false, alt: false, soUmaVez: true };
const ouvintes = new Set<() => void>();
const mudar = (mudanca: Partial<Presas>) => {
  presas = { ...presas, ...mudanca };
  for (const ouvinte of ouvintes) ouvinte();
};
const assinar = (ouvinte: () => void) => {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
};
const ler = () => presas;
const NADA_PRESO: Presas = { shift: false, ctrl: false, alt: false, soUmaVez: true };

const TIPOS = ["pointerdown", "pointermove", "pointerup", "click", "dblclick", "contextmenu", "wheel", "keydown", "keyup"] as const;
const MODIFICADORAS = new Set(["Shift", "Control", "Alt", "Meta"]);

/** Liga as teclas presas aos eventos enquanto o editor está aberto. */
export function useTeclasPresas() {
  useEffect(() => {
    const marcar = (evento: Event) => {
      // Os botões do próprio painel não recebem as teclas
      if ((evento.target as Element | null)?.closest?.("[data-teclas-presas]")) return;
      const { shift, ctrl, alt, soUmaVez } = presas;
      if (!shift && !ctrl && !alt) return;
      const e = evento as MouseEvent | KeyboardEvent;
      if (shift && !e.shiftKey) Object.defineProperty(e, "shiftKey", { value: true });
      if (ctrl && !e.ctrlKey) Object.defineProperty(e, "ctrlKey", { value: true });
      if (alt && !e.altKey) Object.defineProperty(e, "altKey", { value: true });
      // Só no próximo uso: soltam depois do toque (ao levantar) ou da tecla, quando o evento já passou
      const usou = evento.type === "pointerup" || (evento.type === "keydown" && !MODIFICADORAS.has((evento as KeyboardEvent).key));
      if (soUmaVez && usou) setTimeout(() => mudar({ shift: false, ctrl: false, alt: false }), 0);
    };
    for (const tipo of TIPOS) window.addEventListener(tipo, marcar, { capture: true });
    return () => {
      for (const tipo of TIPOS) window.removeEventListener(tipo, marcar, { capture: true });
      mudar({ shift: false, ctrl: false, alt: false });
    };
  }, []);
}

export function PainelTeclasModificadoras() {
  const estado = useSyncExternalStore(assinar, ler, () => NADA_PRESO);
  const botao = (chave: "shift" | "ctrl" | "alt", rotulo: string) => (
    <button
      type="button"
      aria-pressed={estado[chave]}
      onClick={() => mudar({ [chave]: !estado[chave] })}
      className={`h-12 flex-1 rounded-md border text-sm font-semibold transition ${estado[chave] ? "border-destaque bg-destaque text-white" : "border-borda bg-painel-2 text-texto hover:bg-painel-3"}`}
    >
      {rotulo}
    </button>
  );
  return (
    <div data-teclas-presas className="space-y-2 p-2 text-xs">
      <div className="flex gap-1.5">
        {botao("shift", "Shift")}
        {botao("ctrl", "Ctrl")}
        {botao("alt", "Alt")}
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={estado.soUmaVez} onChange={(e) => mudar({ soUmaVez: e.currentTarget.checked })} />
        Só no próximo uso (soltam depois do toque)
      </label>
      <p className="text-suave">Para a tela de toque: a tecla presa vale nos toques, na roda e nas teclas, como se estivesse apertada.</p>
    </div>
  );
}
