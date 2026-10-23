"use client";

// As janelas de Selecionar › Intervalo de cores e Área de foco: a prévia numa cópia pequena da imagem (a seleção em
// cinza ou a própria imagem), os controles e o OK, que faz a conta na imagem inteira.
import { Minus, Pipette, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { areaDeFoco, FAIXAS_DE_CORES, type FaixaDeCores, imagemMenor, INTERVALO_PADRAO, intervaloDeCores, type OpcoesDaAreaDeFoco, type OpcoesDoIntervalo, type Rgb } from "@/lib/selecao/cores";
import type { Canal } from "@/lib/projeto/modelo";
import type { ModoDaSelecao, Selecao } from "@/lib/selecao/mascara";
import type { ImagemRgba } from "@/lib/selecao/varinha";

/** O lado maior da prévia das janelas. */
const LADO_DA_PREVIA = 300;

/** A seleção (em cinza) ou a imagem num canvas. */
function PreviaDaJanela({
  imagem,
  selecao,
  verImagem,
  aoClicar,
  cursor,
}: {
  imagem: ImagemRgba;
  selecao: Selecao | null;
  verImagem: boolean;
  aoClicar?: (x: number, y: number, comShift: boolean, comAlt: boolean) => void;
  cursor?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = imagem.largura;
    canvas.height = imagem.altura;
    const ctx = canvas.getContext("2d")!;
    const dados = ctx.createImageData(imagem.largura, imagem.altura);
    for (let i = 0; i < imagem.largura * imagem.altura; i++) {
      if (verImagem || !selecao) {
        dados.data[i * 4] = imagem.dados[i * 4];
        dados.data[i * 4 + 1] = imagem.dados[i * 4 + 1];
        dados.data[i * 4 + 2] = imagem.dados[i * 4 + 2];
      } else dados.data.fill(selecao.dados[i], i * 4, i * 4 + 3);
      dados.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(dados, 0, 0);
  }, [imagem, selecao, verImagem]);
  return (
    <canvas
      ref={ref}
      className="max-h-[300px] max-w-full rounded border border-borda bg-black"
      style={{ cursor }}
      aria-label={verImagem ? "A imagem" : "A seleção em cinza"}
      onClick={(evento) => {
        if (!aoClicar) return;
        const r = evento.currentTarget.getBoundingClientRect();
        aoClicar(Math.floor(((evento.clientX - r.left) / r.width) * imagem.largura), Math.floor(((evento.clientY - r.top) / r.height) * imagem.altura), evento.shiftKey, evento.altKey);
      }}
    />
  );
}

function Moldura({ titulo, aoFechar, aoConfirmar, children }: { titulo: string; aoFechar: () => void; aoConfirmar: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <div role="dialog" aria-modal aria-label={titulo} className="w-full max-w-lg rounded-lg border border-borda bg-painel shadow-2xl" onClick={(evento) => evento.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="p-4 text-xs">{children}</div>
        <div className="flex justify-end gap-2 border-t border-borda px-4 py-2.5">
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="botao-principal px-3 py-1 text-xs" onClick={aoConfirmar}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

/** Selecionar › Intervalo de cores: a faixa, a imprecisão, o conta-gotas (pegar, somar, tirar) na prévia e inverter. */
export function JanelaIntervaloDeCores({ imagem, aoFechar, aoConfirmar }: { imagem: ImagemRgba; aoFechar: () => void; aoConfirmar: (selecao: Selecao) => void }) {
  const pequena = useMemo(() => imagemMenor(imagem, LADO_DA_PREVIA), [imagem]);
  const [opcoes, setOpcoes] = useState<OpcoesDoIntervalo>(INTERVALO_PADRAO);
  const [contaGotas, setContaGotas] = useState<"pegar" | "somar" | "tirar">("pegar");
  const [verImagem, setVerImagem] = useState(false);
  const previa = useMemo(() => intervaloDeCores(pequena, opcoes), [pequena, opcoes]);
  const mudar = (mudanca: Partial<OpcoesDoIntervalo>) => setOpcoes((atual) => ({ ...atual, ...mudanca }));
  const amostrar = (x: number, y: number, comShift: boolean, comAlt: boolean) => {
    const i = (y * pequena.largura + x) * 4;
    const cor: Rgb = [pequena.dados[i], pequena.dados[i + 1], pequena.dados[i + 2]];
    const jeito = comAlt ? "tirar" : comShift ? "somar" : contaGotas;
    if (jeito === "pegar") mudar({ faixa: "amostradas", amostras: [cor], tiradas: [] });
    else if (jeito === "somar") mudar({ faixa: "amostradas", amostras: [...opcoes.amostras, cor] });
    else mudar({ faixa: "amostradas", tiradas: [...opcoes.tiradas, cor] });
  };
  const amostradas = opcoes.faixa === "amostradas";
  const ehLuz = opcoes.faixa === "realces" || opcoes.faixa === "sombras";
  return (
    <Moldura titulo="Intervalo de cores" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(intervaloDeCores(imagem, opcoes))}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-col items-center gap-2">
          <PreviaDaJanela imagem={pequena} selecao={previa} verImagem={verImagem} cursor="crosshair" aoClicar={amostrar} />
          <div className="flex gap-3">
            <label className="flex items-center gap-1">
              <input type="radio" name="ver" checked={!verImagem} onChange={() => setVerImagem(false)} /> Seleção
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="ver" checked={verImagem} onChange={() => setVerImagem(true)} /> Imagem
            </label>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label className="flex items-center gap-2">
            Selecionar:
            <select className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5" value={opcoes.faixa} onChange={(evento) => mudar({ faixa: evento.currentTarget.value as FaixaDeCores })}>
              {FAIXAS_DE_CORES.map((faixa) => (
                <option key={faixa.id} value={faixa.id}>
                  {faixa.nome}
                </option>
              ))}
            </select>
          </label>
          {amostradas || !ehLuz ? (
            <label className="flex items-center gap-2">
              Imprecisão:
              <input type="range" min={0} max={200} value={opcoes.imprecisao} onChange={(evento) => mudar({ imprecisao: Number(evento.currentTarget.value) })} className="flex-1" aria-label="Imprecisão" />
              <span className="w-8 text-right tabular-nums">{opcoes.imprecisao}</span>
            </label>
          ) : (
            <label className="flex items-center gap-2">
              {opcoes.faixa === "realces" ? "A partir de:" : "Até:"}
              <input type="range" min={0} max={255} value={opcoes.faixa === "realces" ? opcoes.limiar : 255 - opcoes.limiar} onChange={(evento) => mudar({ limiar: opcoes.faixa === "realces" ? Number(evento.currentTarget.value) : 255 - Number(evento.currentTarget.value) })} className="flex-1" aria-label="Limiar" />
            </label>
          )}
          {amostradas ? (
            <div className="flex items-center gap-1" role="group" aria-label="Conta-gotas">
              {(
                [
                  ["pegar", "Conta-gotas: pega a cor", Pipette],
                  ["somar", "Somar à amostra (Shift)", Plus],
                  ["tirar", "Tirar da amostra (Alt)", Minus],
                ] as const
              ).map(([id, nome, Icone]) => (
                <button key={id} type="button" className={`botao-icone size-7 ${contaGotas === id ? "bg-painel-3 text-texto" : ""}`} title={nome} aria-label={nome} aria-pressed={contaGotas === id} onClick={() => setContaGotas(id)}>
                  <Icone className="size-4" aria-hidden />
                </button>
              ))}
              <span className="ml-1 text-suave">
                {opcoes.amostras.length ? `${opcoes.amostras.length} cor(es)${opcoes.tiradas.length ? `, ${opcoes.tiradas.length} tirada(s)` : ""}` : "Clique na prévia para pegar a cor."}
              </span>
            </div>
          ) : null}
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={opcoes.inverter} onChange={(evento) => mudar({ inverter: evento.currentTarget.checked })} />
            Inverter
          </label>
        </div>
      </div>
    </Moldura>
  );
}

/** Selecionar › Área de foco: o intervalo (ou automático) e a limpeza do ruído. */
export function JanelaAreaDeFoco({ imagem, aoFechar, aoConfirmar }: { imagem: ImagemRgba; aoFechar: () => void; aoConfirmar: (selecao: Selecao) => void }) {
  const pequena = useMemo(() => imagemMenor(imagem, LADO_DA_PREVIA), [imagem]);
  const [opcoes, setOpcoes] = useState<OpcoesDaAreaDeFoco>({ intervalo: null, ruido: 0.3 });
  const [verImagem, setVerImagem] = useState(false);
  const previa = useMemo(() => areaDeFoco(pequena, opcoes), [pequena, opcoes]);
  return (
    <Moldura titulo="Área de foco" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(areaDeFoco(imagem, opcoes))}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-col items-center gap-2">
          <PreviaDaJanela imagem={pequena} selecao={previa} verImagem={verImagem} />
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={verImagem} onChange={(evento) => setVerImagem(evento.currentTarget.checked)} /> Ver a imagem
          </label>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={opcoes.intervalo === null} onChange={(evento) => setOpcoes((atual) => ({ ...atual, intervalo: evento.currentTarget.checked ? null : 0.5 }))} />
            Intervalo automático
          </label>
          <label className="flex items-center gap-2">
            Intervalo de foco:
            <input type="range" min={0} max={100} disabled={opcoes.intervalo === null} value={Math.round((opcoes.intervalo ?? 0.5) * 100)} onChange={(evento) => setOpcoes((atual) => ({ ...atual, intervalo: Number(evento.currentTarget.value) / 100 }))} className="flex-1" aria-label="Intervalo de foco" />
          </label>
          <label className="flex items-center gap-2">
            Limpar o ruído:
            <input type="range" min={0} max={100} value={Math.round(opcoes.ruido * 100)} onChange={(evento) => setOpcoes((atual) => ({ ...atual, ruido: Number(evento.currentTarget.value) / 100 }))} className="flex-1" aria-label="Limpar o ruído" />
          </label>
          <p className="text-suave">O que está nítido fica branco na prévia; aumente o intervalo para pegar mais da imagem.</p>
        </div>
      </div>
    </Moldura>
  );
}

/** Uma janela que só pede um nome (Definir predefinição de pincel). */
export function JanelaDeNome({ titulo, rotulo, inicial, aoFechar, aoConfirmar }: { titulo: string; rotulo: string; inicial: string; aoFechar: () => void; aoConfirmar: (nome: string) => void }) {
  const [nome, setNome] = useState(inicial);
  return (
    <Moldura titulo={titulo} aoFechar={aoFechar} aoConfirmar={() => nome.trim() && aoConfirmar(nome.trim())}>
      <label className="flex items-center gap-2">
        {rotulo}:
        <input
          className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5"
          value={nome}
          maxLength={80}
          autoFocus
          onFocus={(evento) => evento.currentTarget.select()}
          onChange={(evento) => setNome(evento.currentTarget.value)}
          onKeyDown={(evento) => evento.key === "Enter" && nome.trim() && aoConfirmar(nome.trim())}
        />
      </label>
    </Moldura>
  );
}

const OPERACOES_NO_CANAL: { id: ModoDaSelecao; nome: string }[] = [
  { id: "nova", nome: "Substituir o canal" },
  { id: "somar", nome: "Adicionar ao canal" },
  { id: "subtrair", nome: "Subtrair do canal" },
  { id: "intersectar", nome: "Fazer interseção com o canal" },
];
const OPERACOES_NA_SELECAO: { id: ModoDaSelecao; nome: string }[] = [
  { id: "nova", nome: "Nova seleção" },
  { id: "somar", nome: "Adicionar à seleção" },
  { id: "subtrair", nome: "Subtrair da seleção" },
  { id: "intersectar", nome: "Fazer interseção com a seleção" },
];
const campoDaJanela = "flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5";

/** Selecionar › Salvar seleção: num canal novo (com nome) ou num que já existe, com a operação. */
export function JanelaSalvarSelecao({ canais, aoFechar, aoConfirmar }: { canais: Canal[]; aoFechar: () => void; aoConfirmar: (destino: string | null, nome: string, operacao: ModoDaSelecao) => void }) {
  const [destino, setDestino] = useState<string>("");
  const [nome, setNome] = useState(`Alfa ${canais.length + 1}`);
  const [operacao, setOperacao] = useState<ModoDaSelecao>("nova");
  return (
    <Moldura titulo="Salvar seleção" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(destino || null, nome.trim() || `Alfa ${canais.length + 1}`, operacao)}>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          Canal:
          <select className={campoDaJanela} value={destino} onChange={(evento) => setDestino(evento.currentTarget.value)}>
            <option value="">Novo</option>
            {canais.map((canal) => (
              <option key={canal.id} value={canal.id}>
                {canal.nome}
              </option>
            ))}
          </select>
        </label>
        {destino ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1">Operação:</legend>
            {OPERACOES_NO_CANAL.map((item) => (
              <label key={item.id} className="flex items-center gap-1.5">
                <input type="radio" name="operacao" checked={operacao === item.id} onChange={() => setOperacao(item.id)} />
                {item.nome}
              </label>
            ))}
          </fieldset>
        ) : (
          <label className="flex items-center gap-2">
            Nome:
            <input className={campoDaJanela} value={nome} maxLength={60} onChange={(evento) => setNome(evento.currentTarget.value)} autoFocus />
          </label>
        )}
      </div>
    </Moldura>
  );
}

/** Selecionar › Carregar seleção: de um canal (ou da transparência da camada escolhida), invertida ou não, com a operação. */
export function JanelaCarregarSelecao({
  canais,
  camada,
  temSelecao,
  aoFechar,
  aoConfirmar,
}: {
  canais: Canal[];
  /** O nome da camada escolhida, para carregar a transparência dela (null sem camada). */
  camada: string | null;
  temSelecao: boolean;
  aoFechar: () => void;
  aoConfirmar: (fonte: string, inverter: boolean, operacao: ModoDaSelecao) => void;
}) {
  const [fonte, setFonte] = useState<string>(canais[0]?.id ?? (camada ? "transparencia" : ""));
  const [inverter, setInverter] = useState(false);
  const [operacao, setOperacao] = useState<ModoDaSelecao>("nova");
  return (
    <Moldura titulo="Carregar seleção" aoFechar={aoFechar} aoConfirmar={() => fonte && aoConfirmar(fonte, inverter, operacao)}>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          Canal:
          <select className={campoDaJanela} value={fonte} onChange={(evento) => setFonte(evento.currentTarget.value)}>
            {canais.map((canal) => (
              <option key={canal.id} value={canal.id}>
                {canal.nome}
              </option>
            ))}
            {camada ? <option value="transparencia">Transparência de “{camada}”</option> : null}
          </select>
        </label>
        {!fonte ? <p className="text-suave">Não há canal salvo nem camada escolhida.</p> : null}
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={inverter} onChange={(evento) => setInverter(evento.currentTarget.checked)} />
          Inverter
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1">Operação:</legend>
          {OPERACOES_NA_SELECAO.map((item) => (
            <label key={item.id} className="flex items-center gap-1.5">
              <input type="radio" name="operacao" disabled={item.id !== "nova" && !temSelecao} checked={operacao === item.id} onChange={() => setOperacao(item.id)} />
              {item.nome}
            </label>
          ))}
        </fieldset>
      </div>
    </Moldura>
  );
}
