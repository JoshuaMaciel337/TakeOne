"use client";

// Os painéis Caractere e Parágrafo do editor de imagem (ADR 0003, onda 13.8). Mudam o trecho selecionado do texto em
// edição, o texto escolhido inteiro ou, sem nenhum, o próximo texto (como a barra da ferramenta). O que varia entre os
// caracteres escolhidos aparece em branco.
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold, CaseSensitive, CaseUpper, Italic, Plus, Strikethrough, Subscript, Superscript, Trash2, Underline } from "lucide-react";
import { useEffect, useState } from "react";

import { caracteresDoEstilo, eixosDoEstilo, useCatalogoDeFontes, useVersaoDasFontes } from "@/lib/texto/fontes";
import { type Alinhamento, ESTILO_PADRAO, type EstiloDoCaractere, type EstiloDoParagrafo, type Suavizacao } from "@/lib/texto/modelo";
import { CampoNumerico, carregarAmostra, estilosDaFamilia, nomeDoEstilo, SeletorDeFonte } from "./OpcoesDoTexto";

const campo = "h-6 rounded border border-borda bg-fundo px-1.5 text-xs text-texto";
const rotulo = "flex items-center gap-1 text-[11px] text-suave";

function Alternar({ ligado, titulo, aoMudar, children }: { ligado: boolean | undefined; titulo: string; aoMudar: (ligado: boolean) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ligado === true}
      title={titulo}
      aria-label={titulo}
      className={`botao-icone size-7 ${ligado ? "bg-superficie-2 text-destaque" : ligado === undefined ? "opacity-70" : ""}`}
      onClick={() => aoMudar(!ligado)}
    >
      {children}
    </button>
  );
}

const SUAVIZACOES: { id: Suavizacao; nome: string }[] = [
  { id: "nenhuma", nome: "Nenhum" },
  { id: "nitida", nome: "Nítido" },
  { id: "forte", nome: "Forte" },
  { id: "suave", nome: "Suave" },
];

type PropsDoCaractere = {
  estilo: Partial<EstiloDoCaractere>;
  aoEstilo: (mudanca: Partial<EstiloDoCaractere>) => void;
  aoPreverFonte: (familia: string | null) => void;
  /** O kerning manual vale entre os dois caracteres do cursor; com seleção, o campo fica em branco. */
  kernManual: number | null;
  aoKern: (valor: number) => void;
  /** A suavização é da camada inteira. */
  suavizacao: Suavizacao | undefined;
  aoSuavizacao: (suavizacao: Suavizacao) => void;
  /** Os estilos de caractere salvos (embaixo do painel). */
  estilosSalvos?: React.ReactNode;
};

export function PainelCaractere({ estilo, aoEstilo, aoPreverFonte, kernManual, aoKern, suavizacao, aoSuavizacao, estilosSalvos }: PropsDoCaractere) {
  const catalogo = useCatalogoDeFontes();
  useVersaoDasFontes();
  const familia = catalogo.find((item) => item.id === estilo.familia);
  const estilos = estilosDaFamilia(familia);
  const valorDoEstilo = estilo.peso !== undefined && estilo.italico !== undefined ? `${estilo.peso}${estilo.italico ? "i" : ""}` : "";
  const eixos = estilo.familia ? eixosDoEstilo({ ...ESTILO_PADRAO, ...estilo } as EstiloDoCaractere) : [];
  const automatica = estilo.entrelinha === null;
  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      <div className="flex items-center gap-1">
        <SeletorDeFonte
          valor={estilo.familia}
          aoPrever={aoPreverFonte}
          aoEscolher={(id) => {
            const disponiveis = estilosDaFamilia(catalogo.find((item) => item.id === id));
            const peso = estilo.peso ?? 400;
            const italico = estilo.italico ?? false;
            const perto = disponiveis.find((item) => item.peso === peso && item.italico === italico) ?? [...disponiveis].sort((a, b) => Math.abs(a.peso - peso) + Number(a.italico !== italico) * 1000 - (Math.abs(b.peso - peso) + Number(b.italico !== italico) * 1000))[0];
            aoEstilo({ familia: id, peso: perto?.peso ?? 400, italico: perto?.italico ?? false });
          }}
        />
        <select
          aria-label="Estilo da fonte"
          className={`${campo} min-w-0 flex-1`}
          value={valorDoEstilo}
          onChange={(evento) => {
            const escolhido = estilos.find((item) => `${item.peso}${item.italico ? "i" : ""}` === evento.currentTarget.value);
            if (escolhido) aoEstilo({ peso: escolhido.peso, italico: escolhido.italico });
          }}
        >
          {valorDoEstilo ? null : <option value="">Vários</option>}
          {estilos.map((item) => (
            <option key={`${item.peso}${item.italico ? "i" : ""}`} value={`${item.peso}${item.italico ? "i" : ""}`}>
              {nomeDoEstilo(item)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <label className={rotulo} title="O tamanho da fonte, em pixels">
          Tamanho
          <CampoNumerico rotulo="Tamanho da fonte" valor={estilo.tamanho} unidade="px" min={1} max={5000} aoMudar={(tamanho) => aoEstilo({ tamanho })} />
        </label>
        <label className={rotulo} title="A entrelinha, em pixels (vazio é a automática: 120% do tamanho)">
          Entrelinha
          <input
            key={String(estilo.entrelinha)}
            aria-label="Entrelinha"
            placeholder={automatica ? "Auto" : ""}
            defaultValue={estilo.entrelinha === null || estilo.entrelinha === undefined ? "" : String(Math.round(estilo.entrelinha * 100) / 100).replace(".", ",")}
            inputMode="decimal"
            onBlur={(evento) => {
              const texto = evento.currentTarget.value.trim();
              if (!texto || /^auto/i.test(texto)) aoEstilo({ entrelinha: null });
              else {
                const numero = Number(texto.replace(",", "."));
                if (Number.isFinite(numero) && numero >= 0) aoEstilo({ entrelinha: Math.min(20000, numero) });
              }
            }}
            onKeyDown={(evento) => {
              if (evento.key === "Enter") evento.currentTarget.blur();
              evento.stopPropagation();
            }}
            className={`${campo} w-14 text-right`}
          />
        </label>
        <label className={rotulo} title="O kerning entre os pares de letras: o da fonte (métrica), pelos contornos (óptico) ou nenhum">
          Kerning
          <select aria-label="Kerning" className={`${campo} w-20`} value={estilo.kerning ?? ""} onChange={(evento) => aoEstilo({ kerning: evento.currentTarget.value as EstiloDoCaractere["kerning"] })}>
            {estilo.kerning ? null : <option value="">Vários</option>}
            <option value="metrica">Métrica</option>
            <option value="optico">Óptico</option>
            <option value="nenhum">0</option>
          </select>
        </label>
        <label className={rotulo} title="O kerning manual entre os dois caracteres do cursor, em milésimos do em (Alt + setas, com o cursor entre eles)">
          Par
          <CampoNumerico rotulo="Kerning manual" valor={kernManual ?? undefined} min={-1000} max={1000} aoMudar={aoKern} />
        </label>
        <label className={rotulo} title="O espaço entre as letras (tracking), em milésimos do em (Alt + setas, com uma seleção)">
          Tracking
          <CampoNumerico rotulo="Tracking" valor={estilo.tracking} min={-1000} max={10000} aoMudar={(tracking) => aoEstilo({ tracking })} />
        </label>
        <label className={rotulo} title="O deslocamento da linha de base, em pixels (positivo sobe)">
          Linha de base
          <CampoNumerico rotulo="Deslocamento da linha de base" valor={estilo.linhaDeBase} unidade="px" min={-10000} max={10000} aoMudar={(linhaDeBase) => aoEstilo({ linhaDeBase })} />
        </label>
        <label className={rotulo} title="A escala vertical das letras">
          Escala V
          <CampoNumerico rotulo="Escala vertical" valor={estilo.escalaV === undefined ? undefined : estilo.escalaV * 100} unidade="%" min={1} max={1000} aoMudar={(valor) => aoEstilo({ escalaV: valor / 100 })} />
        </label>
        <label className={rotulo} title="A escala horizontal das letras">
          Escala H
          <CampoNumerico rotulo="Escala horizontal" valor={estilo.escalaH === undefined ? undefined : estilo.escalaH * 100} unidade="%" min={1} max={1000} aoMudar={(valor) => aoEstilo({ escalaH: valor / 100 })} />
        </label>
        <label className={rotulo} title="A cor das letras">
          Cor
          <input type="color" aria-label="Cor das letras" value={estilo.cor ?? "#000000"} onChange={(evento) => aoEstilo({ cor: evento.currentTarget.value })} className="h-6 w-10 cursor-pointer rounded border border-borda bg-fundo p-0" />
        </label>
      </div>
      <div className="flex flex-wrap gap-0.5" role="group" aria-label="Estilos das letras">
        <Alternar ligado={estilo.negritoFalso} titulo="Negrito falso (Ctrl+Shift+B)" aoMudar={(negritoFalso) => aoEstilo({ negritoFalso })}>
          <Bold className="size-3.5" aria-hidden />
        </Alternar>
        <Alternar ligado={estilo.italicoFalso} titulo="Itálico falso (Ctrl+Shift+I)" aoMudar={(italicoFalso) => aoEstilo({ italicoFalso })}>
          <Italic className="size-3.5" aria-hidden />
        </Alternar>
        <Alternar ligado={estilo.caixa === undefined ? undefined : estilo.caixa === "maiusculas"} titulo="Todas maiúsculas (Ctrl+Shift+K)" aoMudar={(ligado) => aoEstilo({ caixa: ligado ? "maiusculas" : "normal" })}>
          <CaseUpper className="size-3.5" aria-hidden />
        </Alternar>
        <Alternar ligado={estilo.caixa === undefined ? undefined : estilo.caixa === "versalete"} titulo="Versalete (Ctrl+Shift+H)" aoMudar={(ligado) => aoEstilo({ caixa: ligado ? "versalete" : "normal" })}>
          <CaseSensitive className="size-3.5" aria-hidden />
        </Alternar>
        <Alternar ligado={estilo.posicao === undefined ? undefined : estilo.posicao === "sobrescrito"} titulo="Sobrescrito (Ctrl+Shift+=)" aoMudar={(ligado) => aoEstilo({ posicao: ligado ? "sobrescrito" : "normal" })}>
          <Superscript className="size-3.5" aria-hidden />
        </Alternar>
        <Alternar ligado={estilo.posicao === undefined ? undefined : estilo.posicao === "subscrito"} titulo="Subscrito (Ctrl+Alt+Shift+=)" aoMudar={(ligado) => aoEstilo({ posicao: ligado ? "subscrito" : "normal" })}>
          <Subscript className="size-3.5" aria-hidden />
        </Alternar>
        <Alternar ligado={estilo.sublinhado} titulo="Sublinhado (Ctrl+Shift+U)" aoMudar={(sublinhado) => aoEstilo({ sublinhado })}>
          <Underline className="size-3.5" aria-hidden />
        </Alternar>
        <Alternar ligado={estilo.tachado} titulo="Tachado (Ctrl+Shift+/)" aoMudar={(tachado) => aoEstilo({ tachado })}>
          <Strikethrough className="size-3.5" aria-hidden />
        </Alternar>
      </div>
      <fieldset className="flex flex-wrap gap-x-3 gap-y-1">
        <legend className="mb-0.5 text-[11px] font-semibold text-suave">OpenType</legend>
        {(
          [
            ["ligaduras", "Ligaduras padrão"],
            ["alternativos", "Alternativos"],
            ["fracoes", "Frações"],
            ["ordinais", "Ordinais"],
          ] as const
        ).map(([chave, nome]) => (
          <label key={chave} className="flex items-center gap-1 text-texto">
            <input
              type="checkbox"
              checked={estilo[chave] === true}
              ref={(elemento) => {
                if (elemento) elemento.indeterminate = estilo[chave] === undefined;
              }}
              onChange={(evento) => aoEstilo({ [chave]: evento.currentTarget.checked })}
            />
            {nome}
          </label>
        ))}
      </fieldset>
      {eixos.length ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-0.5 text-[11px] font-semibold text-suave">Eixos da fonte variável</legend>
          {eixos.map((eixo) => {
            const valor = estilo.eixos?.[eixo.tag] ?? eixo.padrao;
            return (
              <label key={eixo.tag} className="grid grid-cols-[5rem_1fr_3rem] items-center gap-1 text-suave" title={`${eixo.nome} (${eixo.tag})`}>
                <span className="truncate">{eixo.nome}</span>
                <input type="range" aria-label={eixo.nome} min={eixo.min} max={eixo.max} step={(eixo.max - eixo.min) / 100} value={valor} onChange={(evento) => aoEstilo({ eixos: { ...(estilo.eixos ?? {}), [eixo.tag]: Number(evento.currentTarget.value) } })} />
                <span className="text-right tabular-nums text-texto">{Math.round(valor * 10) / 10}</span>
              </label>
            );
          })}
        </fieldset>
      ) : null}
      <label className={rotulo} title="Como as bordas das letras são suavizadas (vale para a camada inteira)">
        <Baseline className="size-3.5" aria-hidden />
        Suavização
        <select aria-label="Suavização das bordas" className={campo} value={suavizacao ?? "nitida"} onChange={(evento) => aoSuavizacao(evento.currentTarget.value as Suavizacao)}>
          {SUAVIZACOES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </label>
      {estilosSalvos}
    </div>
  );
}

const ALINHAMENTOS: { id: Alinhamento; titulo: string; icone: typeof AlignLeft; marca?: string }[] = [
  { id: "esquerda", titulo: "Alinhar à esquerda (Ctrl+Shift+L)", icone: AlignLeft },
  { id: "centro", titulo: "Centralizar (Ctrl+Shift+C)", icone: AlignCenter },
  { id: "direita", titulo: "Alinhar à direita (Ctrl+Shift+R)", icone: AlignRight },
  { id: "justificado-esquerda", titulo: "Justificar com a última linha à esquerda (Ctrl+Shift+J)", icone: AlignJustify, marca: "◧" },
  { id: "justificado-centro", titulo: "Justificar com a última linha ao centro", icone: AlignJustify, marca: "◫" },
  { id: "justificado-direita", titulo: "Justificar com a última linha à direita", icone: AlignJustify, marca: "◨" },
  { id: "justificado", titulo: "Justificar tudo (Ctrl+Shift+F)", icone: AlignJustify, marca: "■" },
];

export function PainelParagrafo({ paragrafo, aoParagrafo, deParagrafo }: { paragrafo: Partial<EstiloDoParagrafo>; aoParagrafo: (mudanca: Partial<EstiloDoParagrafo>) => void; deParagrafo: boolean }) {
  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      <div className="flex flex-wrap gap-0.5" role="group" aria-label="Alinhamento">
        {ALINHAMENTOS.map((item) => {
          const Icone = item.icone;
          // Justificar só tem efeito na caixa de parágrafo
          const desligado = item.id.startsWith("justificado") && !deParagrafo;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={paragrafo.alinhamento === item.id}
              disabled={desligado}
              title={desligado ? `${item.titulo}: só no texto de parágrafo` : item.titulo}
              aria-label={item.titulo}
              className={`botao-icone relative size-7 disabled:opacity-40 ${paragrafo.alinhamento === item.id ? "bg-superficie-2 text-destaque" : ""}`}
              onClick={() => aoParagrafo({ alinhamento: item.id })}
            >
              <Icone className="size-3.5" aria-hidden />
              {item.marca ? <span className="absolute bottom-0 right-0.5 text-[7px] leading-none">{item.marca}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <label className={rotulo} title="O recuo do começo das linhas, em pixels">
          Recuo à esquerda
          <CampoNumerico rotulo="Recuo à esquerda" valor={paragrafo.recuoInicio} unidade="px" min={-10000} max={10000} aoMudar={(recuoInicio) => aoParagrafo({ recuoInicio })} />
        </label>
        <label className={rotulo} title="O recuo do fim das linhas, em pixels">
          Recuo à direita
          <CampoNumerico rotulo="Recuo à direita" valor={paragrafo.recuoFim} unidade="px" min={-10000} max={10000} aoMudar={(recuoFim) => aoParagrafo({ recuoFim })} />
        </label>
        <label className={rotulo} title="O recuo da primeira linha do parágrafo, em pixels">
          Primeira linha
          <CampoNumerico rotulo="Recuo da primeira linha" valor={paragrafo.recuoPrimeira} unidade="px" min={-10000} max={10000} aoMudar={(recuoPrimeira) => aoParagrafo({ recuoPrimeira })} />
        </label>
        <span />
        <label className={rotulo} title="O espaço antes do parágrafo, em pixels">
          Espaço antes
          <CampoNumerico rotulo="Espaço antes do parágrafo" valor={paragrafo.espacoAntes} unidade="px" min={-10000} max={10000} aoMudar={(espacoAntes) => aoParagrafo({ espacoAntes })} />
        </label>
        <label className={rotulo} title="O espaço depois do parágrafo, em pixels">
          Espaço depois
          <CampoNumerico rotulo="Espaço depois do parágrafo" valor={paragrafo.espacoDepois} unidade="px" min={-10000} max={10000} aoMudar={(espacoDepois) => aoParagrafo({ espacoDepois })} />
        </label>
      </div>
      <label className="flex items-center gap-1.5 text-texto" title="Separa as palavras que não cabem na linha pelas sílabas (só no texto de parágrafo)">
        <input
          type="checkbox"
          checked={paragrafo.hifenizar === true}
          disabled={!deParagrafo}
          ref={(elemento) => {
            if (elemento) elemento.indeterminate = paragrafo.hifenizar === undefined;
          }}
          onChange={(evento) => aoParagrafo({ hifenizar: evento.currentTarget.checked })}
        />
        Hifenizar
      </label>
    </div>
  );
}

/**
 * Os estilos salvos do espaço (de caractere ou de parágrafo): clique aplica, "+" salva o que está escolhido com um
 * nome, a lixeira exclui.
 */
export function EstilosSalvos({ titulo, estilos, aoAplicar, aoSalvar, aoExcluir }: { titulo: string; estilos: { id: string; nome: string }[]; aoAplicar: (id: string) => void; aoSalvar: (nome: string) => void; aoExcluir: (id: string) => void }) {
  const [nome, setNome] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-1 border-t border-borda p-2 text-xs" aria-label={titulo}>
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-suave">{titulo}</h3>
        <button type="button" className="botao-icone size-6" title="Novo estilo com o que está escolhido" aria-label={`Novo: ${titulo}`} onClick={() => setNome(`Estilo ${estilos.length + 1}`)}>
          <Plus className="size-3.5" aria-hidden />
        </button>
      </div>
      {nome !== null ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(evento) => {
            evento.preventDefault();
            if (nome.trim()) aoSalvar(nome.trim());
            setNome(null);
          }}
        >
          <input autoFocus aria-label="Nome do estilo" className={`${campo} min-w-0 flex-1`} value={nome} maxLength={80} onChange={(evento) => setNome(evento.currentTarget.value)} onKeyDown={(evento) => evento.stopPropagation()} />
          <button type="submit" className="botao-principal px-2 py-0.5 text-xs">
            Salvar
          </button>
        </form>
      ) : null}
      {estilos.length ? (
        <ul className="flex flex-col">
          {estilos.map((estilo) => (
            <li key={estilo.id} className="group flex items-center rounded hover:bg-superficie-2">
              <button type="button" className="min-w-0 flex-1 truncate px-1.5 py-1 text-left text-texto" title={`Aplicar o estilo ${estilo.nome}`} onClick={() => aoAplicar(estilo.id)}>
                {estilo.nome}
              </button>
              <button type="button" className="botao-icone size-6 opacity-0 group-hover:opacity-100" title={`Excluir o estilo ${estilo.nome}`} aria-label={`Excluir o estilo ${estilo.nome}`} onClick={() => aoExcluir(estilo.id)}>
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : nome === null ? (
        <p className="text-suave">Nenhum estilo salvo no espaço.</p>
      ) : null}
    </section>
  );
}

/**
 * Janela › Glifos: os caracteres da fonte escolhida; o clique põe o caractere no cursor do texto em edição. Os usados
 * por último ficam em cima.
 */
export function PainelGlifos({ estilo, editando, aoInserir }: { estilo: Partial<EstiloDoCaractere>; editando: boolean; aoInserir: (caractere: string) => void }) {
  useVersaoDasFontes();
  const catalogo = useCatalogoDeFontes();
  const [busca, setBusca] = useState("");
  const [recentes, setRecentes] = useState<string[]>([]);
  const [, setAmostraPronta] = useState("");
  const completo = { ...ESTILO_PADRAO, ...estilo } as EstiloDoCaractere;
  // A amostra da família (a mesma do seletor de fontes) desenha os caracteres na grade
  const familiaDoCatalogo = catalogo.find((item) => item.id === completo.familia);
  useEffect(() => {
    if (familiaDoCatalogo) void carregarAmostra(familiaDoCatalogo).then(() => setAmostraPronta(familiaDoCatalogo.id));
  }, [familiaDoCatalogo]);
  const caracteres = caracteresDoEstilo(completo);
  const termo = busca.trim();
  const lista = (caracteres ?? [])
    .map((codigo) => String.fromCodePoint(codigo))
    .filter((c) => !termo || c === termo || c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0").includes(termo.toUpperCase().replace(/^U\+/, "")))
    .slice(0, 2000);
  const familia = `"amostra-${completo.familia}"`;
  const inserir = (c: string) => {
    aoInserir(c);
    setRecentes((atual) => [c, ...atual.filter((item) => item !== c)].slice(0, 16));
  };
  const botao = (c: string) => (
    <button
      key={c}
      type="button"
      disabled={!editando}
      title={`U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}${editando ? "" : " (escreva num texto para pôr o caractere)"}`}
      className="flex aspect-square items-center justify-center rounded border border-transparent text-lg text-texto hover:border-borda hover:bg-superficie-2 disabled:opacity-60"
      style={{ fontFamily: familia }}
      onClick={() => inserir(c)}
    >
      {c}
    </button>
  );
  return (
    <div className="flex h-full flex-col gap-2 p-2 text-xs">
      <input aria-label="Procurar glifo" placeholder="Caractere ou código (00E9)" className={campo} value={busca} onChange={(evento) => setBusca(evento.currentTarget.value)} onKeyDown={(evento) => evento.stopPropagation()} />
      {recentes.length ? (
        <div className="grid grid-cols-8 gap-0.5 border-b border-borda pb-1" aria-label="Usados por último">
          {recentes.map(botao)}
        </div>
      ) : null}
      {!caracteres ? <p className="text-suave">Carregando a fonte…</p> : null}
      <div className="grid grid-cols-8 gap-0.5 overflow-y-auto" role="list" aria-label="Glifos da fonte">
        {lista.map(botao)}
      </div>
      {!editando ? <p className="text-suave">Clique num texto com a ferramenta Texto para pôr os caracteres no cursor.</p> : null}
    </div>
  );
}
