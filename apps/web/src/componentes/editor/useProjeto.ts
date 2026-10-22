"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { chamarApi, ErroApi } from "@/lib/api";
import {
  type Comando,
  desfazer,
  executarComando,
  type Historico,
  iniciarHistorico,
  NOMES_DOS_COMANDOS,
  refazer,
  registrar,
} from "@/lib/projeto/comandos";
import { type Contexto, ErroEdicao } from "@/lib/projeto/edicao";
import { completarProjeto, type Projeto } from "@/lib/projeto/modelo";

export type EstadoSalvamento = "salvo" | "pendente" | "salvando" | "sem-conexao" | "conflito" | "erro";

const ESPERA_SALVAR_MS = 1200;
const ESPERA_NOVA_TENTATIVA_MS = 5000;
const DURACAO_AVISO_MS = 4000;

type Rascunho = { versao: number; nome: string; projeto: Projeto };

type Estado = {
  historico: Historico;
  /** Fora do histórico: desfazer não desfaz o nome. */
  nome: string;
  /** Versão do banco que este editor conhece. Também fora do histórico, para desfazer não voltar a versão. */
  versao: number;
  salvo: { projeto: Projeto; nome: string };
};

type Acao =
  | { tipo: "carregar"; projeto: Projeto; rascunho: Rascunho | null }
  | { tipo: "executar"; projeto: Projeto; nome: string }
  | { tipo: "desfazer" }
  | { tipo: "refazer" }
  | { tipo: "renomear"; nome: string }
  | { tipo: "salvou"; projeto: Projeto; nome: string; versao: number };

function reduzir(estado: Estado | null, acao: Acao): Estado | null {
  if (acao.tipo === "carregar") {
    const { projeto, rascunho } = acao;
    return {
      historico: iniciarHistorico(rascunho?.projeto ?? projeto),
      nome: rascunho?.nome ?? projeto.nome,
      versao: projeto.versao,
      salvo: { projeto, nome: projeto.nome },
    };
  }
  if (!estado) return estado;
  switch (acao.tipo) {
    case "executar":
      return { ...estado, historico: registrar(estado.historico, acao.projeto, acao.nome) };
    case "desfazer":
      return { ...estado, historico: desfazer(estado.historico) };
    case "refazer":
      return { ...estado, historico: refazer(estado.historico) };
    case "renomear":
      return { ...estado, nome: acao.nome };
    case "salvou":
      return { ...estado, versao: acao.versao, salvo: { projeto: acao.projeto, nome: acao.nome } };
  }
}

const chaveRascunho = (projetoId: string) => `takeone-rascunho-${projetoId}`;

/** O rascunho só vale se foi feito em cima da mesma versão que o banco tem agora. */
function lerRascunho(projetoId: string, versao: number): Rascunho | null {
  try {
    const rascunho = JSON.parse(localStorage.getItem(chaveRascunho(projetoId)) ?? "null") as Rascunho | null;
    return rascunho && rascunho.versao === versao ? { ...rascunho, projeto: completarProjeto(rascunho.projeto) } : null;
  } catch {
    return null;
  }
}

function apagarRascunho(projetoId: string) {
  try {
    localStorage.removeItem(chaveRascunho(projetoId));
  } catch {
    // Sem armazenamento: não havia rascunho
  }
}

/**
 * Abre o projeto, guarda o histórico de desfazer e salva sozinho pouco depois de cada mudança.
 * Enquanto não salva, uma cópia fica no navegador; ao reabrir, ela volta.
 */
export function useProjeto(projetoId: string, ctx: Contexto) {
  const [estado, despachar] = useReducer(reduzir, null);
  const [erroCarga, setErroCarga] = useState("");
  const [situacao, setSituacao] = useState<"ocioso" | "salvando" | "sem-conexao" | "conflito" | "erro">("ocioso");
  const [aviso, setAviso] = useState("");
  const temporizadorAviso = useRef<ReturnType<typeof setTimeout>>(undefined);

  const mostrarAviso = useCallback((mensagem: string) => {
    setAviso(mensagem);
    clearTimeout(temporizadorAviso.current);
    temporizadorAviso.current = setTimeout(() => setAviso(""), DURACAO_AVISO_MS);
  }, []);

  useEffect(() => {
    let ativo = true;
    chamarApi<Projeto>(`/projetos/${projetoId}`)
      .then((projeto) => {
        if (!ativo) return;
        const rascunho = lerRascunho(projetoId, projeto.versao);
        despachar({ tipo: "carregar", projeto, rascunho });
        if (rascunho) mostrarAviso("Recuperamos as alterações que ainda não tinham sido salvas.");
      })
      .catch((e) => {
        if (ativo) setErroCarga(e instanceof ErroApi ? e.message : "Não foi possível abrir o projeto.");
      });
    return () => {
      ativo = false;
    };
  }, [projetoId, mostrarAviso]);

  const pendente = estado !== null && (estado.historico.presente !== estado.salvo.projeto || estado.nome !== estado.salvo.nome);

  // Cópia no navegador, para não perder nada se a aba fechar antes de salvar
  useEffect(() => {
    if (!estado || !pendente) return;
    try {
      const rascunho: Rascunho = { versao: estado.versao, nome: estado.nome, projeto: estado.historico.presente };
      localStorage.setItem(chaveRascunho(projetoId), JSON.stringify(rascunho));
    } catch {
      // Sem armazenamento (aba anônima cheia): fica só o salvamento no servidor
    }
  }, [estado, pendente, projetoId]);

  useEffect(() => {
    if (!estado || !pendente || situacao === "salvando" || situacao === "conflito" || situacao === "erro") return;
    const { historico, nome, versao } = estado;
    const projeto = historico.presente;
    const temporizador = setTimeout(() => {
      setSituacao("salvando");
      chamarApi<Projeto>(`/projetos/${projetoId}`, {
        metodo: "PUT",
        corpo: { versao, nome: nome.trim() || "Projeto sem título", proporcao: projeto.proporcao, taxa: projeto.taxa, fundo: projeto.fundo, faixas: projeto.faixas },
      })
        .then((salvo) => {
          despachar({ tipo: "salvou", projeto, nome, versao: salvo.versao });
          setSituacao("ocioso");
        })
        .catch((e) => {
          if (e instanceof ErroApi && e.status === 409) {
            setSituacao("conflito");
          } else if (e instanceof ErroApi && e.status === 422) {
            setSituacao("erro");
            mostrarAviso(e.message);
          } else {
            setSituacao("sem-conexao");
          }
        });
    }, situacao === "sem-conexao" ? ESPERA_NOVA_TENTATIVA_MS : ESPERA_SALVAR_MS);
    return () => clearTimeout(temporizador);
  }, [estado, pendente, situacao, projetoId, mostrarAviso]);

  // Salvo e sem nada pendente: o rascunho não serve mais
  useEffect(() => {
    if (estado && !pendente) apagarRascunho(projetoId);
  }, [estado, pendente, projetoId]);

  useEffect(() => {
    if (!pendente) return;
    const avisarAoSair = (evento: BeforeUnloadEvent) => evento.preventDefault();
    window.addEventListener("beforeunload", avisarAoSair);
    return () => window.removeEventListener("beforeunload", avisarAoSair);
  }, [pendente]);

  // O projeto mais novo, já com os comandos que ainda não renderizaram: dois comandos seguidos (o
  // "Criar automaticamente" manda vários) partem um do outro, e não os dois do projeto da tela
  const maisNovo = useRef<Projeto | null>(null);
  useEffect(() => {
    maisNovo.current = estado?.historico.presente ?? null;
  }, [estado]);

  const executar = useCallback(
    (comando: Comando): { projeto: Projeto; selecao?: string[] } | null => {
      if (!estado) return null;
      try {
        const resultado = executarComando(maisNovo.current ?? estado.historico.presente, comando, ctx);
        maisNovo.current = resultado.projeto;
        despachar({ tipo: "executar", projeto: resultado.projeto, nome: NOMES_DOS_COMANDOS[comando.comando] });
        setSituacao((atual) => (atual === "erro" ? "ocioso" : atual));
        return resultado;
      } catch (e) {
        if (e instanceof ErroEdicao) {
          mostrarAviso(e.message);
          return null;
        }
        // Erro de programação: a ação não acontece, mas a pessoa fica sabendo (antes, nada mudava em silêncio)
        console.error(`Comando ${comando.comando} falhou:`, e);
        mostrarAviso("Não foi possível fazer isso. Tente de novo; se continuar, recarregue a página.");
        return null;
      }
    },
    [estado, ctx, mostrarAviso],
  );

  const salvamento: EstadoSalvamento = situacao !== "ocioso" ? situacao : pendente ? "pendente" : "salvo";

  return {
    projeto: estado?.historico.presente ?? null,
    nome: estado?.nome ?? "",
    renomear: useCallback((nome: string) => despachar({ tipo: "renomear", nome }), []),
    executar,
    desfazer: useCallback(() => despachar({ tipo: "desfazer" }), []),
    refazer: useCallback(() => despachar({ tipo: "refazer" }), []),
    nomeDesfazer: estado?.historico.passado.at(-1)?.nome ?? null,
    nomeRefazer: estado?.historico.futuro[0]?.nome ?? null,
    salvamento,
    erroCarga,
    aviso,
    mostrarAviso,
  };
}
