"use client";

// As opções de um filtro (ADR 0003, onda 13.11), desenhadas pelo catálogo (lib/imagem/filtros/catalogo.ts): números
// com o controle deslizante, escolhas, ligar e desligar, cores e a matriz 5 × 5 do Personalizado. Mexer prevê;
// soltar confirma (a janela decide o que cada um faz).
import { ControleNumerico } from "@/componentes/editor/ControleNumerico";
import { type DefinicaoDoFiltro, type ValorDaOpcao, type Valores, valoresDoFiltro } from "@/lib/imagem/filtros/catalogo";

const caixa = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-texto";

export function OpcoesDoFiltro({
  definicao,
  valores,
  aoPrever,
  aoMudar,
  canais = [],
}: {
  definicao: DefinicaoDoFiltro;
  valores: Valores;
  aoPrever: (valores: Valores) => void;
  aoMudar: (valores: Valores) => void;
  /** Os canais alfa do documento (o mapa de profundidade do desfoque de lente). */
  canais?: { id: string; nome: string }[];
}) {
  const v = valoresDoFiltro(definicao, valores);
  const com = (id: string, valor: ValorDaOpcao) => ({ ...v, [id]: valor });
  if (!definicao.opcoes.length) return <p className="text-suave">Este filtro não tem opções.</p>;
  const controle = (opcao: DefinicaoDoFiltro["opcoes"][number]) => {
    if (opcao.tipo === "numero")
      return (
        <ControleNumerico
          key={opcao.id}
          rotulo={opcao.nome}
          valor={Number(v[opcao.id])}
          minimo={opcao.minimo}
          maximo={opcao.maximo}
          passo={opcao.passo ?? (opcao.maximo - opcao.minimo <= 10 ? 0.1 : 1)}
          sufixo={opcao.sufixo ?? ""}
          aoPrever={(valor) => aoPrever(com(opcao.id, valor))}
          aoConfirmar={(valor) => aoMudar(com(opcao.id, valor))}
        />
      );
    if (opcao.tipo === "escolha")
      return (
        <label key={opcao.id} className="flex items-center gap-2 text-suave">
          {opcao.nome}:
          <select className={`${caixa} flex-1`} value={String(v[opcao.id])} aria-label={opcao.nome} onChange={(evento) => aoMudar(com(opcao.id, evento.currentTarget.value))}>
            {[...opcao.opcoes, ...(opcao.comCanais ? canais.map((canal) => ({ id: `canal:${canal.id}`, nome: `Canal: ${canal.nome}` })) : [])].map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
      );
    if (opcao.tipo === "marcar")
      return (
        <label key={opcao.id} className="flex items-center gap-1.5">
          <input type="checkbox" checked={Boolean(v[opcao.id])} onChange={(evento) => aoMudar(com(opcao.id, evento.currentTarget.checked))} />
          {opcao.nome}
        </label>
      );
    if (opcao.tipo === "cor")
      return (
        <label key={opcao.id} className="flex items-center gap-2 text-suave">
          {opcao.nome}:
          <input type="color" className="h-6 w-12 cursor-pointer rounded border border-borda" aria-label={opcao.nome} value={String(v[opcao.id])} onChange={(evento) => aoMudar(com(opcao.id, evento.currentTarget.value))} />
        </label>
      );
    if (opcao.tipo === "texto") return null;
    // A matriz 5 × 5 do Personalizado
    const numeros = String(v[opcao.id])
      .split(",")
      .map((x) => Number(x) || 0)
      .concat(Array(25).fill(0))
      .slice(0, 25);
    return (
      <div key={opcao.id} className="grid grid-cols-5 gap-1" role="group" aria-label={opcao.nome}>
        {numeros.map((numero, i) => (
          <input
            key={`${i}-${numero}`}
            aria-label={`Matriz, linha ${Math.floor(i / 5) + 1}, coluna ${(i % 5) + 1}`}
            className={`${caixa} w-full text-center tabular-nums`}
            defaultValue={numero || ""}
            inputMode="numeric"
            onBlur={(evento) => {
              const novo = Math.max(-999, Math.min(999, Math.round(Number(evento.currentTarget.value) || 0)));
              if (novo === numero) return;
              const lista = [...numeros];
              lista[i] = novo;
              aoMudar(com(opcao.id, lista.join(",")));
            }}
            onKeyDown={(evento) => evento.key === "Enter" && evento.currentTarget.blur()}
          />
        ))}
      </div>
    );
  };
  // Em seções (o filtro de revelação), cada uma abrindo e fechando; a primeira começa aberta
  if (definicao.secoes)
    return (
      <div className="flex flex-col gap-1">
        {definicao.secoes.map((secao, i) => (
          <details key={secao.nome} open={i === 0} className="rounded border border-borda">
            <summary className="cursor-pointer select-none px-2 py-1 font-semibold">{secao.nome}</summary>
            <div className="flex flex-col gap-2 px-2 pb-2 pt-1">{secao.opcoes.map((id) => definicao.opcoes.find((opcao) => opcao.id === id)).map((opcao) => (opcao ? controle(opcao) : null))}</div>
          </details>
        ))}
      </div>
    );
  return <div className="flex flex-col gap-2">{definicao.opcoes.map(controle)}</div>;
}
