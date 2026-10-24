"use client";

// Editar › Preferências (Ctrl+K) do editor de imagem (ADR 0003, onda 13.15): geral (o tema), interface (as dicas da
// barra de status), ferramentas (o zoom com a roda, o Shift para trocar de ferramenta e o cursor de pintura), unidades
// e réguas (a unidade e a resolução dos documentos novos), guias e grade (cores, estilos e espaçamento),
// transparência (o xadrez) e desempenho (a prévia econômica e os estados do histórico). Valem no OK; ficam no navegador.
import { X } from "lucide-react";
import { useState } from "react";

import { MAXIMO_DE_ESTADOS } from "@/lib/imagem/opcoesDoHistorico";
import { CORES_DO_XADREZ, ESTILOS_DA_LINHA, fundoDoXadrez, type PreferenciasDaVista, TAMANHOS_DO_XADREZ, UNIDADES_DA_REGUA, type UnidadeDaRegua, VISTA_PADRAO } from "@/lib/imagem/vista";
import { type Tema, TEMAS, temaAtual, trocarTema } from "@/lib/tema";

const CAMPO = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";
type Secao = "geral" | "interface" | "ferramentas" | "unidades" | "guias" | "transparencia" | "desempenho";
const SECOES: { id: Secao; nome: string }[] = [
  { id: "geral", nome: "Geral" },
  { id: "interface", nome: "Interface" },
  { id: "ferramentas", nome: "Ferramentas" },
  { id: "unidades", nome: "Unidades e réguas" },
  { id: "guias", nome: "Guias e grade" },
  { id: "transparencia", nome: "Transparência" },
  { id: "desempenho", nome: "Desempenho" },
];

type Props = {
  vista: PreferenciasDaVista;
  estadosDoHistorico: number;
  aoFechar: () => void;
  aoConfirmar: (vista: PreferenciasDaVista, estadosDoHistorico: number) => void;
};

export function JanelaPreferencias({ vista: inicial, estadosDoHistorico, aoFechar, aoConfirmar }: Props) {
  const [secao, setSecao] = useState<Secao>("geral");
  const [v, setV] = useState(inicial);
  const [estados, setEstados] = useState(estadosDoHistorico);
  const [tema, setTema] = useState<Tema>(temaAtual);
  const mudar = (mudanca: Partial<PreferenciasDaVista>) => setV((atual) => ({ ...atual, ...mudanca }));
  const marca = (chave: "dicas" | "zoomComRoda" | "shiftTrocaFerramenta" | "prevaEconomica", rotulo: string, dica?: string) => (
    <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-0.5" checked={v[chave]} onChange={(e) => mudar({ [chave]: e.currentTarget.checked })} />
      <span>
        {rotulo}
        {dica ? <span className="block text-suave">{dica}</span> : null}
      </span>
    </label>
  );
  const estilo = (rotulo: string, valor: string, aoMudar: (estilo: PreferenciasDaVista["estiloDaGrade"]) => void, comPontos: boolean) => (
    <label className="flex items-center gap-2">
      {rotulo}
      <select aria-label={rotulo} className={CAMPO} value={valor} onChange={(e) => aoMudar(e.currentTarget.value as PreferenciasDaVista["estiloDaGrade"])}>
        {ESTILOS_DA_LINHA.filter((item) => comPontos || item.id !== "pontos").map((item) => (
          <option key={item.id} value={item.id}>
            {item.nome}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <div role="dialog" aria-modal aria-label="Preferências" className="flex h-[70vh] max-h-[560px] w-full max-w-2xl flex-col rounded-lg border border-borda bg-painel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
          <h2 className="text-sm font-semibold">Preferências</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <nav aria-label="Seções das preferências" className="w-40 shrink-0 border-r border-borda py-2">
            {SECOES.map((item) => (
              <button key={item.id} type="button" aria-current={secao === item.id} className={`block w-full px-3 py-1.5 text-left text-xs ${secao === item.id ? "bg-destaque/25 text-texto" : "text-suave hover:bg-painel-2 hover:text-texto"}`} onClick={() => setSecao(item.id)}>
                {item.nome}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-xs">
            {secao === "geral" ? (
              <>
                <label className="flex items-center gap-2">
                  Tema da interface:
                  <select aria-label="Tema da interface" className={CAMPO} value={tema} onChange={(e) => setTema(e.currentTarget.value as Tema)}>
                    {TEMAS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="botao-secundario px-2 py-1 text-xs" onClick={() => setV({ ...VISTA_PADRAO, unidade: v.unidade, reguas: v.reguas })}>
                  Restaurar as preferências de fábrica
                </button>
              </>
            ) : secao === "interface" ? (
              marca("dicas", "Mostrar a dica da ferramenta na barra de status")
            ) : secao === "ferramentas" ? (
              <>
                {marca("zoomComRoda", "Zoom com a roda do mouse", "Sem Ctrl: a roda aproxima e afasta a imagem.")}
                {marca("shiftTrocaFerramenta", "Usar o Shift para trocar de ferramenta", "Desligado, apertar de novo a tecla de um grupo passa à ferramenta seguinte dele.")}
                <label className="flex items-center gap-2">
                  Cursor das ferramentas de pintura:
                  <select aria-label="Cursor das ferramentas de pintura" className={CAMPO} value={v.cursorDePintura} onChange={(e) => mudar({ cursorDePintura: e.currentTarget.value as PreferenciasDaVista["cursorDePintura"] })}>
                    <option value="pincel">A ponta do pincel</option>
                    <option value="preciso">Preciso (mira)</option>
                  </select>
                </label>
              </>
            ) : secao === "unidades" ? (
              <>
                <label className="flex items-center gap-2">
                  Unidade das réguas:
                  <select aria-label="Unidade das réguas" className={CAMPO} value={v.unidade} onChange={(e) => mudar({ unidade: e.currentTarget.value as UnidadeDaRegua })}>
                    {UNIDADES_DA_REGUA.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  Resolução dos documentos novos:
                  <input type="number" aria-label="Resolução dos documentos novos" className={`${CAMPO} w-20`} min={1} max={10000} value={v.resolucaoPadrao} onChange={(e) => mudar({ resolucaoPadrao: Math.min(10000, Math.max(1, Math.round(Number(e.currentTarget.value) || 72))) })} />
                  pixels por polegada
                </label>
              </>
            ) : secao === "guias" ? (
              <>
                <fieldset className="space-y-2">
                  <legend className="mb-1 font-medium">Guias</legend>
                  <label className="flex items-center gap-2">
                    Cor:
                    <input type="color" aria-label="Cor das guias" className="h-6 w-10 cursor-pointer rounded border border-borda bg-transparent" value={v.corDasGuias} onChange={(e) => mudar({ corDasGuias: e.currentTarget.value })} />
                  </label>
                  {estilo("Estilo das guias", v.estiloDasGuias, (estiloDasGuias) => mudar({ estiloDasGuias }), false)}
                </fieldset>
                <fieldset className="space-y-2">
                  <legend className="mb-1 font-medium">Grade</legend>
                  <label className="flex items-center gap-2">
                    Cor:
                    <input type="color" aria-label="Cor da grade" className="h-6 w-10 cursor-pointer rounded border border-borda bg-transparent" value={v.corDaGrade} onChange={(e) => mudar({ corDaGrade: e.currentTarget.value })} />
                  </label>
                  {estilo("Estilo da grade", v.estiloDaGrade, (estiloDaGrade) => mudar({ estiloDaGrade }), true)}
                  <label className="flex items-center gap-2">
                    Uma linha a cada:
                    <input type="number" aria-label="Espaço da grade" className={`${CAMPO} w-20`} min={1} max={4096} value={v.espacoDaGrade} onChange={(e) => mudar({ espacoDaGrade: Math.min(4096, Math.max(1, Number(e.currentTarget.value) || 100)) })} />
                    pixels
                  </label>
                  <label className="flex items-center gap-2">
                    Subdivisões:
                    <input type="number" aria-label="Subdivisões da grade" className={`${CAMPO} w-16`} min={1} max={32} value={v.subdivisoes} onChange={(e) => mudar({ subdivisoes: Math.min(32, Math.max(1, Math.round(Number(e.currentTarget.value) || 4))) })} />
                  </label>
                </fieldset>
              </>
            ) : secao === "transparencia" ? (
              <>
                <label className="flex items-center gap-2">
                  Tamanho da grade:
                  <select aria-label="Tamanho do xadrez" className={CAMPO} value={v.xadrez} onChange={(e) => mudar({ xadrez: e.currentTarget.value as PreferenciasDaVista["xadrez"] })}>
                    {TAMANHOS_DO_XADREZ.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  Cores da grade:
                  <select aria-label="Cores do xadrez" className={CAMPO} value={v.coresDoXadrez} onChange={(e) => mudar({ coresDoXadrez: e.currentTarget.value as PreferenciasDaVista["coresDoXadrez"] })}>
                    {CORES_DO_XADREZ.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="size-24 rounded border border-borda" style={{ background: fundoDoXadrez(v) }} aria-label="Amostra da transparência" />
              </>
            ) : (
              <>
                {marca("prevaEconomica", "Prévia econômica", "Um pixel do desenho por pixel da página: menos nítida nas telas de alta densidade, e mais leve.")}
                <label className="flex items-center gap-2">
                  Estados do histórico:
                  <input type="number" aria-label="Estados do histórico" className={`${CAMPO} w-20`} min={1} max={MAXIMO_DE_ESTADOS} value={estados} onChange={(e) => setEstados(Math.min(MAXIMO_DE_ESTADOS, Math.max(1, Math.round(Number(e.currentTarget.value) || 1))))} />
                </label>
              </>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-borda px-4 py-2.5">
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="botao-principal px-3 py-1 text-xs"
            onClick={() => {
              if (tema !== temaAtual()) trocarTema(tema);
              aoConfirmar(v, estados);
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
