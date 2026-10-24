"use client";

// Filtro › Filtros neurais (ADR 0003, onda 13.12): a transferência de estilo (um estilo pronto ou descrito, com a
// mistura), o colorir (uma dica do que tem cor e a saturação) e o restaurar foto (a força). O pedido vai ao worker e o
// resultado entra numa camada nova, no lugar da foto; a foto não muda.
import { useState } from "react";

import { ControleNumerico } from "@/componentes/editor/ControleNumerico";

import { JanelaFlutuante } from "../ajustes/JanelaDeAjusteNosPixels";

/** Os estilos prontos (os mesmos ids de core/modelos/geracao.py, que guarda o texto de cada um). */
export const ESTILOS_NEURAIS: { id: string; nome: string }[] = [
  { id: "oleo", nome: "Pintura a óleo" },
  { id: "aquarela", nome: "Aquarela" },
  { id: "lapis", nome: "Desenho a lápis" },
  { id: "quadrinhos", nome: "Quadrinhos" },
  { id: "anime", nome: "Anime" },
  { id: "pop", nome: "Pop art" },
  { id: "vitral", nome: "Vitral" },
  { id: "mosaico", nome: "Mosaico" },
  { id: "digital", nome: "Arte digital" },
];

export type FiltroNeural = "estilo" | "colorir" | "restaurar";
const TITULOS: Record<FiltroNeural, string> = { estilo: "Transferência de estilo", colorir: "Colorir", restaurar: "Restaurar foto" };

export function JanelaFiltroNeural({ tipo, aoConfirmar, aoCancelar }: { tipo: FiltroNeural; aoConfirmar: (corpo: Record<string, unknown>) => void; aoCancelar: () => void }) {
  const [estilo, setEstilo] = useState("oleo");
  const [descricao, setDescricao] = useState("");
  const [intensidade, setIntensidade] = useState(100);
  const [saturacao, setSaturacao] = useState(100);
  const [forca, setForca] = useState(60);
  const corpo = (): Record<string, unknown> =>
    tipo === "estilo" ? { estilo: descricao.trim() ? "livre" : estilo, descricao: descricao.trim(), intensidade } : tipo === "colorir" ? { descricao: descricao.trim(), saturacao } : { forca };
  return (
    <JanelaFlutuante titulo={TITULOS[tipo]} aoConfirmar={() => aoConfirmar(corpo())} aoCancelar={aoCancelar}>
      <div className="flex flex-col gap-3 p-3 text-xs">
        {tipo === "estilo" ? (
          <>
            <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Estilo">
              {ESTILOS_NEURAIS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={estilo === item.id && !descricao.trim()}
                  className={`rounded border px-1 py-1.5 ${estilo === item.id && !descricao.trim() ? "border-destaque bg-destaque/15" : "border-borda"}`}
                  onClick={() => {
                    setEstilo(item.id);
                    setDescricao("");
                  }}
                >
                  {item.nome}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1">
              Ou descreva o estilo
              <input className="rounded border border-borda bg-painel-2 px-2 py-1 text-texto" value={descricao} maxLength={400} placeholder="Por exemplo: gravura em madeira, tinta preta" onChange={(evento) => setDescricao(evento.currentTarget.value)} aria-label="Descreva o estilo" />
            </label>
            <ControleNumerico rotulo="Intensidade" valor={intensidade} minimo={10} maximo={100} sufixo="%" aoPrever={setIntensidade} aoConfirmar={setIntensidade} />
          </>
        ) : null}
        {tipo === "colorir" ? (
          <>
            <label className="flex flex-col gap-1">
              O que tem cor (opcional)
              <input className="rounded border border-borda bg-painel-2 px-2 py-1 text-texto" value={descricao} maxLength={400} placeholder="Por exemplo: céu azul, vestido vermelho" onChange={(evento) => setDescricao(evento.currentTarget.value)} aria-label="O que tem cor" />
            </label>
            <ControleNumerico rotulo="Saturação" valor={saturacao} minimo={0} maximo={200} sufixo="%" aoPrever={setSaturacao} aoConfirmar={setSaturacao} />
            <p className="text-suave">Só a cor muda: a luz e o detalhe são os da foto.</p>
          </>
        ) : null}
        {tipo === "restaurar" ? (
          <>
            <ControleNumerico rotulo="Força" valor={forca} minimo={0} maximo={100} sufixo="%" aoPrever={setForca} aoConfirmar={setForca} />
            <p className="text-suave">Tira os riscos e as manchas finas, o ruído, e devolve o contraste.</p>
          </>
        ) : null}
        <p className="text-suave">{tipo === "restaurar" ? "Feito na sua máquina, no worker de CPU." : "Gerado na sua máquina, no worker de GPU (a primeira vez leva uns 2 min)."} O resultado entra numa camada nova, no lugar da foto.</p>
      </div>
    </JanelaFlutuante>
  );
}
