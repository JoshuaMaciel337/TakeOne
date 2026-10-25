"use client";

// As opções dos pincéis e do lápis do editor vetorial na barra (ADR 0003, onda 13.16): a fidelidade, a espessura, o
// continuar e fechar caminhos, o raio da bolha e o do Suavizar e da Borracha de caminho.
import type { OpcoesDoPincelVetorial } from "@/lib/vetor/pincelVetorial";

const CAMPO = "w-14 rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto";

export type FerramentaDoPincelVetorial = "pincelDeTraco" | "pincelDeBolha" | "lapisVetorial" | "modelador" | "suavizar" | "borrachaDeCaminho" | "unir";

export function OpcoesDoPincelVetorialNaBarra({ ferramenta, opcoes, aoMudar }: { ferramenta: FerramentaDoPincelVetorial; opcoes: OpcoesDoPincelVetorial; aoMudar: (opcoes: OpcoesDoPincelVetorial) => void }) {
  const numero = (chave: "espessura" | "distancia" | "raioDaBolha" | "raio" | "suavidade", rotulo: string, min: number, max: number, sufixo = "") => (
    <label className="flex items-center gap-1">
      {rotulo}
      <input type="number" aria-label={rotulo} className={CAMPO} min={min} max={max} value={opcoes[chave]} onChange={(e) => aoMudar({ ...opcoes, [chave]: Math.min(max, Math.max(min, Number(e.currentTarget.value) || 0)) })} />
      {sufixo ? <span className="text-suave">{sufixo}</span> : null}
    </label>
  );
  const marca = (chave: "editarSelecionados" | "fechar" | "mesclarBolha", rotulo: string) => (
    <label className="flex items-center gap-1">
      <input type="checkbox" checked={opcoes[chave]} onChange={(e) => aoMudar({ ...opcoes, [chave]: e.currentTarget.checked })} />
      {rotulo}
    </label>
  );
  const desenha = ferramenta === "pincelDeTraco" || ferramenta === "lapisVetorial";
  return (
    <>
      {desenha || ferramenta === "pincelDeBolha" ? (
        <label className="flex items-center gap-1">
          Fidelidade
          <input type="range" aria-label="Fidelidade" min={1} max={5} step={1} value={opcoes.fidelidade} onChange={(e) => aoMudar({ ...opcoes, fidelidade: Number(e.currentTarget.value) })} />
          <span className="text-suave">{["Precisa", "", "", "", "Suave"][opcoes.fidelidade - 1] || opcoes.fidelidade}</span>
        </label>
      ) : null}
      {desenha ? (
        <>
          {numero("espessura", "Espessura", 0.5, 500, "px")}
          {marca("editarSelecionados", "Continuar o caminho escolhido")}
          {marca("fechar", "Fechar perto do começo")}
        </>
      ) : null}
      {ferramenta === "pincelDeBolha" ? (
        <>
          {numero("raioDaBolha", "Raio", 0.5, 1000, "px")}
          {marca("mesclarBolha", "Juntar à forma escolhida da mesma cor")}
        </>
      ) : null}
      {ferramenta === "suavizar" || ferramenta === "borrachaDeCaminho" ? numero("raio", "Raio", 1, 1000, "px") : null}
      {ferramenta === "suavizar" ? numero("suavidade", "Suavidade", 0, 100, "%") : null}
      {desenha || ferramenta === "unir" ? numero("distancia", "Distância", 1, 100, "px da tela") : null}
      <span className="text-suave">
        {ferramenta === "modelador"
          ? "Desenhe uma linha, um retângulo, uma elipse, um triângulo ou um polígono; um rabisco sobre formas apaga uma ou junta várias"
          : ferramenta === "suavizar" || ferramenta === "borrachaDeCaminho" || ferramenta === "unir"
            ? "Vale na forma ou no caminho escolhido"
            : "A cor de primeiro plano"}
      </span>
    </>
  );
}
