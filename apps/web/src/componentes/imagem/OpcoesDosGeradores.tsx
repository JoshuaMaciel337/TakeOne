"use client";

// As opções das ferramentas de linha na barra (ADR 0003, onda 13.16): a espessura do traço e o preenchimento, e as
// medidas de cada uma (o arco, a espiral e as duas grades).
import type { GeradorDeCaminhos, OpcoesDosGeradores } from "@/lib/vetor/geradores";

const CAMPO = "w-14 rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto";

type Props = { tipo: GeradorDeCaminhos; opcoes: OpcoesDosGeradores; aoMudar: (opcoes: OpcoesDosGeradores) => void };

export function OpcoesDosGeradoresNaBarra({ tipo, opcoes, aoMudar }: Props) {
  const numero = (rotulo: string, valor: number, min: number, max: number, aoMudarValor: (valor: number) => void, sufixo = "") => (
    <label className="flex items-center gap-1">
      {rotulo}
      <input type="number" aria-label={rotulo} className={CAMPO} min={min} max={max} value={valor} onChange={(e) => aoMudarValor(Math.min(max, Math.max(min, Number(e.currentTarget.value) || 0)))} />
      {sufixo ? <span className="text-suave">{sufixo}</span> : null}
    </label>
  );
  const marca = (rotulo: string, valor: boolean, aoMudarValor: (valor: boolean) => void) => (
    <label className="flex items-center gap-1">
      <input type="checkbox" checked={valor} onChange={(e) => aoMudarValor(e.currentTarget.checked)} />
      {rotulo}
    </label>
  );
  const { arco, espiral, grade, polar } = opcoes;
  return (
    <>
      {numero("Traço", opcoes.espessura, 0.5, 1000, (espessura) => aoMudar({ ...opcoes, espessura }), "px")}
      {tipo === "arco" || tipo === "gradeRetangular" || tipo === "gradePolar" ? marca("Preencher (cor de fundo)", opcoes.preencher, (preencher) => aoMudar({ ...opcoes, preencher })) : null}
      {tipo === "arco" ? (
        <>
          {marca("Fechado", arco.fechado, (fechado) => aoMudar({ ...opcoes, arco: { ...arco, fechado } }))}
          <label className="flex items-center gap-1">
            Base
            <select aria-label="Base do arco" className={CAMPO} value={arco.base} onChange={(e) => aoMudar({ ...opcoes, arco: { ...arco, base: e.currentTarget.value as "x" | "y" } })}>
              <option value="x">Eixo X</option>
              <option value="y">Eixo Y</option>
            </select>
          </label>
          {numero("Inclinação", arco.inclinacao, -100, 100, (inclinacao) => aoMudar({ ...opcoes, arco: { ...arco, inclinacao } }))}
          <span className="text-suave">(negativa: côncavo)</span>
        </>
      ) : tipo === "espiral" ? (
        <>
          {numero("Decaimento", espiral.decaimento, 5, 150, (decaimento) => aoMudar({ ...opcoes, espiral: { ...espiral, decaimento } }), "%")}
          {numero("Segmentos", espiral.segmentos, 1, 1000, (segmentos) => aoMudar({ ...opcoes, espiral: { ...espiral, segmentos: Math.round(segmentos) } }))}
          <label className="flex items-center gap-1">
            Sentido
            <select aria-label="Sentido da espiral" className="rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto" value={espiral.sentido} onChange={(e) => aoMudar({ ...opcoes, espiral: { ...espiral, sentido: e.currentTarget.value as "horario" | "antiHorario" } })}>
              <option value="horario">Horário</option>
              <option value="antiHorario">Anti-horário</option>
            </select>
          </label>
        </>
      ) : tipo === "gradeRetangular" ? (
        <>
          {numero("Divisões horizontais", grade.horizontais, 0, 499, (horizontais) => aoMudar({ ...opcoes, grade: { ...grade, horizontais: Math.round(horizontais) } }))}
          {numero("Inclinação horizontal", grade.inclinacaoH, -100, 100, (inclinacaoH) => aoMudar({ ...opcoes, grade: { ...grade, inclinacaoH } }))}
          {numero("Divisões verticais", grade.verticais, 0, 499, (verticais) => aoMudar({ ...opcoes, grade: { ...grade, verticais: Math.round(verticais) } }))}
          {numero("Inclinação vertical", grade.inclinacaoV, -100, 100, (inclinacaoV) => aoMudar({ ...opcoes, grade: { ...grade, inclinacaoV } }))}
          {marca("Moldura", grade.moldura, (moldura) => aoMudar({ ...opcoes, grade: { ...grade, moldura } }))}
        </>
      ) : tipo === "gradePolar" ? (
        <>
          {numero("Divisões concêntricas", polar.concentricas, 0, 499, (concentricas) => aoMudar({ ...opcoes, polar: { ...polar, concentricas: Math.round(concentricas) } }))}
          {numero("Inclinação concêntrica", polar.inclinacaoC, -100, 100, (inclinacaoC) => aoMudar({ ...opcoes, polar: { ...polar, inclinacaoC } }))}
          {numero("Divisões radiais", polar.radiais, 0, 499, (radiais) => aoMudar({ ...opcoes, polar: { ...polar, radiais: Math.round(radiais) } }))}
          {numero("Inclinação radial", polar.inclinacaoR, -100, 100, (inclinacaoR) => aoMudar({ ...opcoes, polar: { ...polar, inclinacaoR } }))}
          {marca("Caminho composto (anéis)", polar.composto, (composto) => aoMudar({ ...opcoes, polar: { ...polar, composto } }))}
        </>
      ) : null}
    </>
  );
}
