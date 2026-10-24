"use client";

// O painel Ações do editor de imagem (ADR 0003, onda 13.15): os conjuntos, as ações e os passos, com a caixa de cada
// um (ligado ou não), e embaixo parar, gravar, tocar, conjunto novo, ação nova e excluir. No menu: inserir parada,
// duplicar, opções da ação, salvar e carregar o conjunto (.json), limpar e o modo de botão.
import { ChevronDown, ChevronRight, Circle, FilePlus, Folder, FolderPlus, MoreHorizontal, Play, Square, Trash2 } from "lucide-react";
import { useState } from "react";

import { arquivoDoConjunto, conjuntoDoArquivo, CORES_DAS_ACOES, type ConjuntoDeAcoes, mesmaTecla, nomeDoPasso, TECLAS_DAS_ACOES, type TeclaDaAcao, textoDaTecla } from "@/lib/imagem/acoes";

import { Moldura } from "./JanelasDePixels";
import type { Acoes } from "./useAcoes";

const CAMPO = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";
type Escolha = { conjunto: string; acao?: string; passo?: number } | null;

function JanelaDaAcao({ titulo, conjuntos, inicial, aoFechar, aoConfirmar, comConjunto, ocupadas }: {
  titulo: string;
  conjuntos: ConjuntoDeAcoes[];
  inicial: { nome: string; conjunto: string; tecla: TeclaDaAcao | null; cor: string };
  comConjunto: boolean;
  ocupadas: TeclaDaAcao[];
  aoFechar: () => void;
  aoConfirmar: (valor: { nome: string; conjunto: string; tecla: TeclaDaAcao | null; cor: string }) => void;
}) {
  const [valor, setValor] = useState(inicial);
  const ocupada = valor.tecla && ocupadas.some((tecla) => mesmaTecla(tecla, valor.tecla));
  return (
    <Moldura titulo={titulo} aoFechar={aoFechar} aoConfirmar={() => valor.nome.trim() && !ocupada && aoConfirmar({ ...valor, nome: valor.nome.trim() })}>
      <label className="flex items-center gap-2">
        Nome:
        <input aria-label="Nome da ação" className={`${CAMPO} flex-1`} value={valor.nome} maxLength={80} autoFocus onFocus={(e) => e.currentTarget.select()} onChange={(e) => setValor({ ...valor, nome: e.currentTarget.value })} />
      </label>
      {comConjunto ? (
        <label className="flex items-center gap-2">
          Conjunto:
          <select aria-label="Conjunto da ação" className={CAMPO} value={valor.conjunto} onChange={(e) => setValor({ ...valor, conjunto: e.currentTarget.value })}>
            {conjuntos.map((conjunto) => (
              <option key={conjunto.id} value={conjunto.id}>
                {conjunto.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        Tecla de função:
        <select aria-label="Tecla de função" className={CAMPO} value={valor.tecla?.tecla ?? ""} onChange={(e) => setValor({ ...valor, tecla: e.currentTarget.value ? { tecla: e.currentTarget.value, shift: valor.tecla?.shift ?? false, ctrl: valor.tecla?.ctrl ?? false } : null })}>
          <option value="">Nenhuma</option>
          {TECLAS_DAS_ACOES.map((tecla) => (
            <option key={tecla} value={tecla}>
              {tecla}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" disabled={!valor.tecla} checked={Boolean(valor.tecla?.shift)} onChange={(e) => valor.tecla && setValor({ ...valor, tecla: { ...valor.tecla, shift: e.currentTarget.checked } })} />
          Shift
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" disabled={!valor.tecla} checked={Boolean(valor.tecla?.ctrl)} onChange={(e) => valor.tecla && setValor({ ...valor, tecla: { ...valor.tecla, ctrl: e.currentTarget.checked } })} />
          Ctrl
        </label>
      </div>
      {ocupada ? <p className="text-erro">Outra ação já usa {textoDaTecla(valor.tecla)}.</p> : null}
      <label className="flex items-center gap-2">
        Cor:
        <select aria-label="Cor da ação" className={CAMPO} value={valor.cor} onChange={(e) => setValor({ ...valor, cor: e.currentTarget.value })}>
          {CORES_DAS_ACOES.map((cor) => (
            <option key={cor.id} value={cor.id}>
              {cor.nome}
            </option>
          ))}
        </select>
      </label>
    </Moldura>
  );
}

function JanelaDaParada({ aoFechar, aoConfirmar }: { aoFechar: () => void; aoConfirmar: (mensagem: string, continuar: boolean) => void }) {
  const [mensagem, setMensagem] = useState("");
  const [continuar, setContinuar] = useState(true);
  return (
    <Moldura titulo="Inserir parada" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(mensagem.trim(), continuar)}>
      <label className="flex flex-col gap-1">
        Mensagem:
        <textarea aria-label="Mensagem da parada" className={`${CAMPO} min-h-20`} value={mensagem} maxLength={500} autoFocus onChange={(e) => setMensagem(e.currentTarget.value)} />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={continuar} onChange={(e) => setContinuar(e.currentTarget.checked)} />
        Permitir continuar
      </label>
    </Moldura>
  );
}

/** A parada ao tocar: a mensagem, com Continuar (quando pode) e Parar. */
export function JanelaParadaAoTocar({ mensagem, continuar, aoResponder }: { mensagem: string; continuar: boolean; aoResponder: (seguir: boolean) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div role="alertdialog" aria-label="Parada da ação" className="w-full max-w-sm space-y-3 rounded-lg border border-borda bg-painel p-4 text-xs shadow-2xl">
        <p className="whitespace-pre-wrap text-sm">{mensagem || "A ação parou aqui."}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="botao-secundario px-3 py-1" onClick={() => aoResponder(false)} autoFocus={!continuar}>
            Parar
          </button>
          {continuar ? (
            <button type="button" className="botao-principal px-3 py-1" onClick={() => aoResponder(true)} autoFocus>
              Continuar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PainelAcoes({ acoes, aoAvisar }: { acoes: Acoes; aoAvisar: (mensagem: string) => void }) {
  const { conjuntos, gravacao, tocando } = acoes;
  const [escolha, setEscolha] = useState<Escolha>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [janela, setJanela] = useState<"nova" | "opcoes" | "parada" | null>(null);
  const [menu, setMenu] = useState(false);
  const [modoDeBotao, setModoDeBotao] = useState(false);
  const conjunto = conjuntos.find((item) => item.id === escolha?.conjunto) ?? null;
  const acao = conjunto?.acoes.find((item) => item.id === escolha?.acao) ?? null;
  const todasAsTeclas = conjuntos.flatMap((c) => c.acoes.filter((a) => a.id !== acao?.id && a.tecla).map((a) => a.tecla!));
  const alternar = (id: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  const linha = (ativa: boolean) => `flex w-full items-center gap-1 px-1 py-0.5 text-left text-xs ${ativa ? "bg-destaque/25" : "hover:bg-painel-2"}`;
  const tocarEscolha = () => {
    if (!conjunto) return;
    if (acao) void acoes.tocar(acao, escolha?.passo !== undefined ? { desde: escolha.passo } : {});
    else aoAvisar("Escolha uma ação (ou um passo, para começar dele) para tocar.");
  };
  const excluir = () => {
    if (!conjunto || !escolha) return;
    if (acao && escolha.passo !== undefined) acoes.mudarAcao(conjunto.id, acao.id, (a) => ({ ...a, passos: a.passos.filter((_, i) => i !== escolha.passo) }));
    else if (acao) acoes.mudarConjunto(conjunto.id, (c) => ({ ...c, acoes: c.acoes.filter((a) => a.id !== acao.id) }));
    else void acoes.excluirConjunto(conjunto.id).catch((e: unknown) => aoAvisar(e instanceof Error ? e.message : "Não foi possível excluir."));
    setEscolha(escolha.passo !== undefined ? { conjunto: conjunto.id, acao: acao?.id } : acao ? { conjunto: conjunto.id } : null);
  };
  const salvarConjunto = () => {
    if (!conjunto) return aoAvisar("Escolha o conjunto para salvar.");
    const url = URL.createObjectURL(new Blob([arquivoDoConjunto(conjunto)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${conjunto.nome.replace(/[\\/:*?"<>|]/g, "_")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const carregarConjunto = () => {
    const entrada = document.createElement("input");
    entrada.type = "file";
    entrada.accept = ".json,application/json";
    entrada.onchange = () => {
      const arquivo = entrada.files?.[0];
      if (!arquivo) return;
      void arquivo
        .text()
        .then(async (texto) => {
          const lido = conjuntoDoArquivo(texto, () => crypto.randomUUID().slice(0, 12));
          const criado = await acoes.criarConjunto(lido.nome);
          acoes.mudarConjunto(criado.id, (c) => ({ ...c, acoes: lido.acoes }));
          setAbertos((atual) => new Set(atual).add(criado.id));
          aoAvisar(`Carregado: ${lido.nome} (${lido.acoes.length} ${lido.acoes.length === 1 ? "ação" : "ações"}).`);
        })
        .catch((e: unknown) => aoAvisar(e instanceof Error ? e.message : "Não foi possível carregar as ações."));
    };
    entrada.click();
  };
  const itemDoMenu = (rotulo: string, aoEscolher: () => void, desativado = false) => (
    <button
      type="button"
      role="menuitem"
      disabled={desativado}
      className="block w-full px-3 py-1 text-left text-xs hover:bg-painel-2 disabled:opacity-40"
      onClick={() => {
        setMenu(false);
        aoEscolher();
      }}
    >
      {rotulo}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {modoDeBotao ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-1 overflow-y-auto p-2" aria-label="Ações em botões">
          {conjuntos.flatMap((c) =>
            c.acoes.map((a) => (
              <button key={a.id} type="button" disabled={tocando} className="truncate rounded border border-borda px-2 py-1 text-left text-xs hover:brightness-110" style={a.cor ? { background: `${a.cor}55` } : undefined} onClick={() => void acoes.tocar(a)} title={textoDaTecla(a.tecla)}>
                {a.nome}
              </button>
            )),
          )}
        </div>
      ) : (
        <ol aria-label="Ações" className="min-h-0 flex-1 overflow-y-auto py-1">
          {conjuntos.map((c) => (
            <li key={c.id}>
              <div className={linha(escolha?.conjunto === c.id && !escolha.acao)}>
                <button type="button" className="grid size-4 place-items-center" onClick={() => alternar(c.id)} aria-label={abertos.has(c.id) ? `Fechar ${c.nome}` : `Abrir ${c.nome}`}>
                  {abertos.has(c.id) ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
                </button>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-1" onClick={() => setEscolha({ conjunto: c.id })} onDoubleClick={() => alternar(c.id)}>
                  <Folder className="size-3.5 text-suave" aria-hidden />
                  <span className="truncate">{c.nome}</span>
                </button>
              </div>
              {abertos.has(c.id) ? (
                <ol>
                  {c.acoes.map((a) => {
                    const chave = `${c.id}/${a.id}`;
                    const gravandoEsta = gravacao?.acaoId === a.id;
                    return (
                      <li key={a.id}>
                        <div className={linha(escolha?.acao === a.id && escolha.passo === undefined)}>
                          <input type="checkbox" aria-label={`Ligar todos os passos de ${a.nome}`} checked={a.passos.length > 0 && a.passos.every((p) => p.ligado)} onChange={(e) => acoes.mudarAcao(c.id, a.id, (x) => ({ ...x, passos: x.passos.map((p) => ({ ...p, ligado: e.currentTarget.checked })) }))} />
                          <button type="button" className="grid size-4 place-items-center pl-3" onClick={() => alternar(chave)} aria-label={abertos.has(chave) ? `Fechar ${a.nome}` : `Abrir ${a.nome}`}>
                            {abertos.has(chave) ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
                          </button>
                          <button type="button" className="flex min-w-0 flex-1 items-center gap-1" onClick={() => setEscolha({ conjunto: c.id, acao: a.id })} onDoubleClick={() => setJanela("opcoes")}>
                            {a.cor ? <span className="size-2 shrink-0 rounded-full" style={{ background: a.cor }} aria-hidden /> : null}
                            <span className="truncate">{a.nome}</span>
                            {gravandoEsta ? <Circle className="size-2.5 shrink-0 fill-red-500 text-red-500" aria-label="Gravando" /> : null}
                            <span className="ml-auto shrink-0 text-[10px] text-suave">{textoDaTecla(a.tecla)}</span>
                          </button>
                        </div>
                        {abertos.has(chave) ? (
                          <ol>
                            {a.passos.map((passo, i) => (
                              <li key={i} className={linha(escolha?.acao === a.id && escolha.passo === i)}>
                                <input type="checkbox" aria-label={`Ligar o passo ${i + 1}`} checked={passo.ligado} onChange={(e) => acoes.mudarAcao(c.id, a.id, (x) => ({ ...x, passos: x.passos.map((p, j) => (j === i ? { ...p, ligado: e.currentTarget.checked } : p)) }))} />
                                <button type="button" className="min-w-0 flex-1 truncate pl-8 text-left first-letter:uppercase" onClick={() => setEscolha({ conjunto: c.id, acao: a.id, passo: i })} data-passo-da-acao={i + 1}>
                                  {nomeDoPasso(passo)}
                                </button>
                              </li>
                            ))}
                            {!a.passos.length ? <li className="py-0.5 pl-12 text-[11px] text-suave">{gravandoEsta ? "Gravando: o que você fizer entra aqui." : "Sem passos."}</li> : null}
                          </ol>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <p className="border-t border-borda px-2 py-0.5 text-[10px] text-suave">As pinceladas e os pixels pintados não entram na gravação.</p>
      <div className="relative flex h-8 shrink-0 items-center gap-0.5 border-t border-borda px-1.5">
        <button type="button" className="botao-icone size-6" onClick={() => setMenu((m) => !m)} aria-label="Menu das ações" aria-haspopup="menu" aria-expanded={menu}>
          <MoreHorizontal className="size-3.5" aria-hidden />
        </button>
        {menu ? (
          <div role="menu" className="absolute bottom-8 left-1 z-30 w-56 rounded-md border border-borda bg-painel-2 py-1 shadow-xl">
            {itemDoMenu("Inserir parada…", () => setJanela("parada"), !acao)}
            {itemDoMenu("Duplicar", () => conjunto && acao && acoes.mudarConjunto(conjunto.id, (c) => ({ ...c, acoes: [...c.acoes, { ...acao, id: crypto.randomUUID().slice(0, 12), nome: `${acao.nome} cópia`, tecla: null }] })), !acao)}
            {itemDoMenu("Opções da ação…", () => setJanela("opcoes"), !acao)}
            {itemDoMenu("Tocar só este passo", () => acao && escolha?.passo !== undefined && void acoes.tocar(acao, { desde: escolha.passo, soEste: true }), escolha?.passo === undefined)}
            <div className="my-1 border-t border-borda" />
            {itemDoMenu(modoDeBotao ? "Modo de lista" : "Modo de botão", () => setModoDeBotao((m) => !m))}
            {itemDoMenu("Salvar ações…", salvarConjunto, !conjunto)}
            {itemDoMenu("Carregar ações…", carregarConjunto)}
            {itemDoMenu("Limpar todas as ações", () => conjunto && acoes.mudarConjunto(conjunto.id, (c) => ({ ...c, acoes: [] })), !conjunto?.acoes.length)}
          </div>
        ) : null}
        <span className="ml-auto" />
        <button type="button" className="botao-icone size-6" disabled={!gravacao && !tocando} onClick={() => (tocando ? acoes.pararDeTocar() : acoes.pararGravacao())} aria-label="Parar a gravação ou a ação" title="Parar">
          <Square className="size-3.5" aria-hidden />
        </button>
        <button type="button" className={`botao-icone size-6 ${gravacao ? "text-red-500" : ""}`} disabled={!acao || Boolean(gravacao) || tocando} onClick={() => conjunto && acao && acoes.gravar({ conjuntoId: conjunto.id, acaoId: acao.id })} aria-label="Começar a gravar" title="Gravar mais passos na ação escolhida">
          <Circle className={`size-3.5 ${gravacao ? "fill-red-500" : ""}`} aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" disabled={!acao || tocando || Boolean(gravacao)} onClick={tocarEscolha} aria-label="Tocar a ação" title="Tocar a ação escolhida (ou a partir do passo escolhido)">
          <Play className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="botao-icone size-6"
          onClick={() =>
            void acoes
              .criarConjunto(`Conjunto ${conjuntos.length + 1}`)
              .then((c) => setEscolha({ conjunto: c.id }))
              .catch((e: unknown) => aoAvisar(e instanceof Error ? e.message : "Não foi possível criar o conjunto."))
          }
          aria-label="Criar um conjunto"
          title="Novo conjunto"
        >
          <FolderPlus className="size-3.5" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" disabled={!conjuntos.length || Boolean(gravacao)} onClick={() => setJanela("nova")} aria-label="Criar uma ação" title="Nova ação (começa a gravar)">
          <FilePlus className="size-3.5" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" disabled={!escolha || Boolean(gravacao)} onClick={excluir} aria-label="Excluir" title="Excluir o passo, a ação ou o conjunto escolhido">
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
      {janela === "nova" ? (
        <JanelaDaAcao
          titulo="Nova ação"
          conjuntos={conjuntos}
          comConjunto
          ocupadas={todasAsTeclas}
          inicial={{ nome: `Ação ${conjuntos.reduce((n, c) => n + c.acoes.length, 0) + 1}`, conjunto: conjunto?.id ?? conjuntos[0].id, tecla: null, cor: "" }}
          aoFechar={() => setJanela(null)}
          aoConfirmar={(valor) => {
            setJanela(null);
            const id = acoes.criarAcao(valor.conjunto, { nome: valor.nome, tecla: valor.tecla, cor: valor.cor || null }, true);
            setEscolha({ conjunto: valor.conjunto, acao: id });
            setAbertos((atual) => new Set(atual).add(valor.conjunto).add(`${valor.conjunto}/${id}`));
          }}
        />
      ) : null}
      {janela === "opcoes" && conjunto && acao ? (
        <JanelaDaAcao
          titulo="Opções da ação"
          conjuntos={conjuntos}
          comConjunto={false}
          ocupadas={todasAsTeclas}
          inicial={{ nome: acao.nome, conjunto: conjunto.id, tecla: acao.tecla ?? null, cor: acao.cor ?? "" }}
          aoFechar={() => setJanela(null)}
          aoConfirmar={(valor) => {
            setJanela(null);
            acoes.mudarAcao(conjunto.id, acao.id, (a) => ({ ...a, nome: valor.nome, tecla: valor.tecla, cor: valor.cor || null }));
          }}
        />
      ) : null}
      {janela === "parada" && conjunto && acao ? (
        <JanelaDaParada
          aoFechar={() => setJanela(null)}
          aoConfirmar={(mensagem, continuar) => {
            setJanela(null);
            // Depois do passo escolhido, ou no fim
            const onde = escolha?.passo !== undefined ? escolha.passo + 1 : acao.passos.length;
            acoes.mudarAcao(conjunto.id, acao.id, (a) => ({ ...a, passos: [...a.passos.slice(0, onde), { tipo: "parada", mensagem, continuar, ligado: true }, ...a.passos.slice(onde)] }));
          }}
        />
      ) : null}
    </div>
  );
}

