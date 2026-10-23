"use client";

import { BookmarkPlus, LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { chamarApi, ErroApi } from "@/lib/api";
import type { Projeto } from "@/lib/projeto/modelo";
import { MODELOS_DE_PROJETO } from "@/lib/projeto/modelos";
import { candidatasAVaga } from "@/lib/projeto/vagas";
import type { Midia } from "@/lib/tipos";

import type { EstadoSalvamento } from "./useProjeto";

type Props = {
  projetoId: string;
  projeto: Projeto;
  nome: string;
  midias: Midia[];
  salvamento: EstadoSalvamento;
  aoFechar: () => void;
  aoSalvo: (mensagem: string) => void;
};

const CATEGORIAS = ["Do espaço", ...new Set(MODELOS_DE_PROJETO.map((modelo) => modelo.categoria))];
const CAMPO = "rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-sm outline-none focus:border-destaque";

/** "Salvar como modelo": o projeto vira um modelo do espaço, com as mídias e os textos que quem usa vai trocar. */
export function JanelaSalvarModelo({ projetoId, projeto, nome, midias, salvamento, aoFechar, aoSalvo }: Props) {
  const porId = useMemo(() => new Map(midias.map((midia) => [midia.id, midia])), [midias]);
  const [vagas, setVagas] = useState(() => candidatasAVaga(projeto, (id) => porId.get(id)));
  const [nomeDoModelo, setNomeDoModelo] = useState(nome);
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("Do espaço");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  // O servidor copia o projeto como está no banco: com alteração ainda por salvar, o modelo sairia antigo
  const salvo = salvamento === "salvo";
  const preso = salvamento === "erro" || salvamento === "conflito" || salvamento === "sem-conexao";

  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    const marcadas = vagas.filter((vaga) => vaga.marcada).map(({ clipe_id, tipo, rotulo }) => ({ clipe_id, tipo, rotulo: rotulo.trim() || "Sem nome" }));
    chamarApi("/modelos", { metodo: "POST", corpo: { projeto_id: projetoId, nome: nomeDoModelo, descricao, categoria, vagas: marcadas } })
      .then(() => {
        aoSalvo("Modelo salvo. Ele está em Modelos, na aba “Criados no espaço”.");
        aoFechar();
      })
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível salvar o modelo."))
      .finally(() => setEnviando(false));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[6vh]" onPointerDown={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-salvar-modelo"
        className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60"
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-salvar-modelo" className="font-display text-base font-semibold">
            Salvar como modelo
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <form onSubmit={enviar} className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4 text-sm">
          <p className="text-xs text-suave">O modelo fica na biblioteca do espaço. Quem usar ganha um projeto igual a este e troca só o que você marcar abaixo.</p>
          <label className="flex flex-col gap-1 text-xs text-suave">
            Nome
            <input value={nomeDoModelo} onChange={(evento) => setNomeDoModelo(evento.currentTarget.value)} required maxLength={80} className={CAMPO} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-suave">
            Descrição (opcional)
            <input value={descricao} onChange={(evento) => setDescricao(evento.currentTarget.value)} maxLength={300} className={CAMPO} placeholder="Para que serve, como usar" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-suave">
            Categoria
            <input value={categoria} onChange={(evento) => setCategoria(evento.currentTarget.value)} list="categorias-de-modelo" required maxLength={40} className={CAMPO} />
            <datalist id="categorias-de-modelo">
              {CATEGORIAS.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-suave">O que quem usa vai trocar</legend>
            {vagas.length ? null : <p className="text-xs text-suave">Nenhum clipe de mídia ou texto neste projeto.</p>}
            {vagas.map((vaga, indice) => (
              <div key={vaga.clipe_id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={vaga.marcada}
                  aria-label={`Trocar ${vaga.rotulo}`}
                  onChange={(evento) => {
                    const marcada = evento.currentTarget.checked;
                    setVagas((atuais) => atuais.map((item, i) => (i === indice ? { ...item, marcada } : item)));
                  }}
                />
                <span className="w-14 shrink-0 text-[11px] text-apagado">{vaga.tipo === "texto" ? "Texto" : vaga.faixa === "audio" ? "Áudio" : "Mídia"}</span>
                <input
                  value={vaga.rotulo}
                  maxLength={60}
                  aria-label="Nome do que trocar"
                  disabled={!vaga.marcada}
                  onChange={(evento) => {
                    const rotulo = evento.currentTarget.value;
                    setVagas((atuais) => atuais.map((item, i) => (i === indice ? { ...item, rotulo } : item)));
                  }}
                  className={`min-w-0 flex-1 ${CAMPO} py-1 text-xs disabled:opacity-50`}
                />
              </div>
            ))}
          </fieldset>
          {erro ? <AvisoErro>{erro}</AvisoErro> : null}
          {preso ? <AvisoErro>O projeto não está salvo no servidor (veja o aviso no topo do editor). O modelo sai do que está salvo, então resolva isso antes.</AvisoErro> : null}
          <button type="submit" className="botao-principal px-4 py-2" disabled={enviando || !salvo || !nomeDoModelo.trim()}>
            {enviando || (!salvo && !preso) ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <BookmarkPlus className="size-4" aria-hidden />}
            {salvo ? "Salvar o modelo" : preso ? "O projeto não foi salvo" : "Salvando o projeto antes…"}
          </button>
        </form>
      </div>
    </div>
  );
}
