"use client";

// As Ações do editor de imagem (ADR 0003, onda 13.15): os conjuntos do espaço (recursos "acoes" da API), a gravação
// (os comandos executados entram na ação que grava) e o tocar (os passos de novo, com as camadas da vez). Sem nenhum
// conjunto salvo, aparece o conjunto padrão, que só vai para o servidor quando muda.
import { useCallback, useEffect, useRef, useState } from "react";

import { type Acao, type CamadasEscolhidas, type ConjuntoDeAcoes, gravavel, ligarCamadas, type PassoDaAcao, passoGravado, trocarIds } from "@/lib/imagem/acoes";
import { ajustePadrao } from "@/lib/imagem/ajustes";
import type { Comando } from "@/lib/projeto/comandos";
import { chamarApi } from "@/lib/api";
import { criarRecurso, excluirRecurso, type Recurso } from "@/lib/recursos";

const ID_DO_PADRAO = "padrao";
const NADA: CamadasEscolhidas = { clipes: [], faixas: [] };

/** O conjunto padrão: ações prontas feitas de camadas de ajuste, que valem em qualquer imagem. */
function conjuntoPadrao(): ConjuntoDeAcoes {
  const ajuste = (id: string, nome: string, comandos: { comando: Comando; nome: string }[]): Acao => ({
    id,
    nome,
    passos: comandos.map(({ comando, nome: passo }) => ({ tipo: "comando", nome: passo, comando, antes: NADA, depois: NADA, ligado: true })),
  });
  const camada = (tipo: Parameters<typeof ajustePadrao>[0], mudanca: Record<string, unknown> = {}): { comando: Comando; nome: string } => ({
    comando: { comando: "imagem.adicionarAjuste", parametros: { acima: null, ajuste: { ...ajustePadrao(tipo), ...mudanca } as ReturnType<typeof ajustePadrao> } },
    nome: "criar a camada de ajuste",
  });
  return {
    id: ID_DO_PADRAO,
    nome: "Ações padrão",
    acoes: [
      ajuste("padrao-pb", "Preto e branco", [camada("preto_branco")]),
      ajuste("padrao-sepia", "Sépia", [camada("preto_branco", { tonalizar: true, matiz: 35, saturacao: 25 })]),
      ajuste("padrao-negativo", "Negativo", [camada("inverter")]),
      ajuste("padrao-posterizar", "Pôster de 4 tons", [camada("posterizar", { niveis: 4 })]),
      ajuste("padrao-vivo", "Cores vivas", [camada("vibracao", { vibracao: 40, saturacao: 10 })]),
    ],
  };
}

export type Gravacao = { conjuntoId: string; acaoId: string };

type Opcoes = {
  /** O executar do editor: devolve o resultado (a seleção nova) ou null se o comando falhou. */
  executar: (comando: Comando) => { selecao?: string[] } | null;
  /** As camadas escolhidas agora (os clipes e as faixas, na ordem). */
  escolhidas: () => CamadasEscolhidas;
  /** As faixas dos clipes dados (para ligar as criadas pelo passo). */
  faixasDosClipes: (clipes: string[]) => string[];
  /** Mostra a parada e espera: true continua. */
  perguntar: (mensagem: string, continuar: boolean) => Promise<boolean>;
  aoAvisar: (mensagem: string) => void;
  novoId: () => string;
};

export function useAcoes({ executar, escolhidas, faixasDosClipes, perguntar, aoAvisar, novoId }: Opcoes) {
  const [conjuntos, setConjuntos] = useState<ConjuntoDeAcoes[]>([]);
  const [gravacao, setGravacao] = useState<Gravacao | null>(null);
  const [tocando, setTocando] = useState(false);
  const tocandoRef = useRef(false);
  const parar = useRef(false);
  const espera = useRef(new Map<string, number>());
  const conjuntosRef = useRef(conjuntos);
  useEffect(() => {
    conjuntosRef.current = conjuntos;
  });

  useEffect(() => {
    let ativo = true;
    chamarApi<Recurso<{ acoes: Acao[] }>[]>("/recursos?tipo=acoes")
      .then((lista) => {
        if (!ativo) return;
        setConjuntos(lista.length ? lista.map((recurso) => ({ id: recurso.id, nome: recurso.nome, acoes: recurso.dados.acoes ?? [] })) : [conjuntoPadrao()]);
      })
      .catch(() => {
        if (ativo) setConjuntos([conjuntoPadrao()]);
      });
    return () => {
      ativo = false;
    };
  }, []);

  // O conjunto padrão fica com o id "padrao" na tela; o id dele no servidor vem da primeira vez que ele muda
  const idDoPadrao = useRef<Promise<string> | null>(null);
  /** Guarda o conjunto no servidor, um pouco depois da última mudança (gravar manda um passo de cada vez). */
  const guardar = useCallback(
    (conjunto: ConjuntoDeAcoes) => {
      clearTimeout(espera.current.get(conjunto.id));
      espera.current.set(
        conjunto.id,
        window.setTimeout(() => {
          espera.current.delete(conjunto.id);
          const atual = () => conjuntosRef.current.find((item) => item.id === conjunto.id) ?? conjunto;
          const falhou = (e: unknown) => aoAvisar(e instanceof Error ? e.message : "Não foi possível salvar as ações.");
          const atualizar = (id: string) => {
            const dados = atual();
            return chamarApi(`/recursos/${id}`, { metodo: "PUT", corpo: { nome: dados.nome, dados: { acoes: dados.acoes } } });
          };
          if (conjunto.id !== ID_DO_PADRAO) return void atualizar(conjunto.id).catch(falhou);
          if (idDoPadrao.current) return void idDoPadrao.current.then(atualizar).catch(falhou);
          const dados = atual();
          idDoPadrao.current = criarRecurso({ tipo: "acoes", nome: dados.nome, dados: { acoes: dados.acoes } }).then((criado) => criado.id);
          idDoPadrao.current.catch((e: unknown) => {
            idDoPadrao.current = null;
            falhou(e);
          });
        }, 600),
      );
    },
    [aoAvisar],
  );

  /** Muda um conjunto (ou o cria, sem id conhecido) e o guarda. */
  const mudarConjunto = useCallback(
    (id: string, mudar: (conjunto: ConjuntoDeAcoes) => ConjuntoDeAcoes) => {
      const atual = conjuntosRef.current.find((item) => item.id === id);
      if (!atual) return;
      const novo = mudar(atual);
      conjuntosRef.current = conjuntosRef.current.map((item) => (item.id === id ? novo : item));
      setConjuntos(conjuntosRef.current);
      guardar(novo);
    },
    [guardar],
  );

  const mudarAcao = useCallback(
    (conjuntoId: string, acaoId: string, mudar: (acao: Acao) => Acao) => mudarConjunto(conjuntoId, (conjunto) => ({ ...conjunto, acoes: conjunto.acoes.map((acao) => (acao.id === acaoId ? mudar(acao) : acao)) })),
    [mudarConjunto],
  );

  /** O editor chama a cada comando executado: na gravação, ele vira um passo. */
  const registrar = useCallback(
    (comando: Comando, nome: string, antes: CamadasEscolhidas, depois: CamadasEscolhidas) => {
      if (!gravacao || tocandoRef.current || !gravavel(comando)) return;
      mudarAcao(gravacao.conjuntoId, gravacao.acaoId, (acao) => ({ ...acao, passos: [...acao.passos, passoGravado(comando, nome, antes, depois)] }));
    },
    [gravacao, mudarAcao],
  );

  /** Toca os passos ligados da ação, a partir de um (ou só ele); para no primeiro que falha. */
  const tocar = useCallback(
    async (acao: Acao, { desde = 0, soEste = false }: { desde?: number; soEste?: boolean } = {}) => {
      if (tocandoRef.current) return;
      tocandoRef.current = true;
      parar.current = false;
      setTocando(true);
      const mapa = new Map<string, string>();
      const passos = soEste ? acao.passos.slice(desde, desde + 1) : acao.passos.slice(desde);
      // A camada escolhida na gravação (no primeiro passo) vira a escolhida agora
      const primeiro = passos.find((passo): passo is Extract<PassoDaAcao, { tipo: "comando" }> => passo.tipo === "comando" && passo.ligado);
      if (primeiro) ligarCamadas(mapa, primeiro.antes, escolhidas());
      let feitos = 0;
      try {
        for (const [i, passo] of passos.entries()) {
          if (parar.current) break;
          if (!passo.ligado) continue;
          if (passo.tipo === "parada") {
            if (!(await perguntar(passo.mensagem, passo.continuar)) || !passo.continuar) break;
            continue;
          }
          const resultado = executar(trocarIds(passo.comando, mapa));
          if (!resultado) {
            aoAvisar(`A ação "${acao.nome}" parou no passo ${desde + i + 1} (${passo.nome}).`);
            break;
          }
          feitos++;
          const criados = resultado.selecao ?? [];
          if (criados.length) ligarCamadas(mapa, passo.depois, { clipes: criados, faixas: faixasDosClipes(criados) });
        }
      } finally {
        tocandoRef.current = false;
        setTocando(false);
      }
      return feitos;
    },
    [executar, escolhidas, faixasDosClipes, perguntar, aoAvisar],
  );

  const criarConjunto = useCallback(
    async (nome: string) => {
      const criado = await criarRecurso<{ acoes: Acao[] }>({ tipo: "acoes", nome, dados: { acoes: [] } });
      const conjunto = { id: criado.id, nome: criado.nome, acoes: [] };
      conjuntosRef.current = [...conjuntosRef.current, conjunto];
      setConjuntos(conjuntosRef.current);
      return conjunto;
    },
    [],
  );

  const excluirConjunto = useCallback(async (id: string) => {
    if (id !== ID_DO_PADRAO) await excluirRecurso(id);
    else if (idDoPadrao.current) await excluirRecurso(await idDoPadrao.current);
    conjuntosRef.current = conjuntosRef.current.filter((item) => item.id !== id);
    setConjuntos(conjuntosRef.current);
    setGravacao((g) => (g?.conjuntoId === id ? null : g));
  }, []);

  /** Uma ação nova no conjunto; com `gravar`, a gravação começa nela. */
  const criarAcao = useCallback(
    (conjuntoId: string, acao: Omit<Acao, "id" | "passos">, gravar: boolean) => {
      const id = novoId();
      mudarConjunto(conjuntoId, (conjunto) => ({ ...conjunto, acoes: [...conjunto.acoes, { ...acao, id, passos: [] }] }));
      if (gravar) setGravacao({ conjuntoId, acaoId: id });
      return id;
    },
    [mudarConjunto, novoId],
  );

  return {
    conjuntos,
    gravacao,
    tocando,
    gravar: setGravacao,
    pararGravacao: () => setGravacao(null),
    pararDeTocar: () => {
      parar.current = true;
    },
    registrar,
    tocar,
    mudarConjunto,
    mudarAcao,
    criarConjunto,
    excluirConjunto,
    criarAcao,
  };
}

export type Acoes = ReturnType<typeof useAcoes>;
