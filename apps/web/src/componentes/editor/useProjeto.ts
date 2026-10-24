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
/** Depois de um comando que falhou, os avisos deste intervalo (o sucesso do painel) não aparecem. */
const JANELA_DO_ERRO_MS = 100;

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
  // Quando um comando falhou: o aviso que chega logo depois, no mesmo clique, é o "pronto, Ctrl+Z desfaz" do
  // painel, que não aconteceu. Ele trocava o erro por um sucesso, e o Ctrl+Z sugerido desfazia a edição anterior
  const falhaDoComando = useRef(-Infinity);

  const mostrarAviso = useCallback((mensagem: string) => {
    if (performance.now() - falhaDoComando.current < JANELA_DO_ERRO_MS) return;
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

  // O salvamento que está esperando o tempo: ao sair do editor (outro documento, o hub), ele vai na hora
  const salvarAoSair = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!estado || !pendente || situacao === "salvando" || situacao === "conflito" || situacao === "erro") {
      salvarAoSair.current = null;
      return;
    }
    const { historico, nome, versao } = estado;
    const projeto = historico.presente;
    const salvar = () => {
      salvarAoSair.current = null;
      setSituacao("salvando");
      chamarApi<Projeto>(`/projetos/${projetoId}`, {
        metodo: "PUT",
        corpo: {
          versao,
          nome: nome.trim() || (projeto.tipo === "imagem" ? "Imagem sem título" : "Projeto sem título"),
          proporcao: projeto.proporcao,
          taxa: projeto.taxa,
          fundo: projeto.fundo,
          faixas: projeto.faixas,
          marcadores: projeto.marcadores ?? [],
          canais: projeto.canais ?? [],
          caminhos: projeto.caminhos ?? [],
          luz_global: projeto.luz_global ?? undefined,
          informacoes: projeto.informacoes ?? undefined,
          modo: projeto.modo ?? undefined,
          variaveis: projeto.variaveis ?? undefined,
          guias: projeto.guias ?? undefined,
          contagem: projeto.contagem ?? undefined,
          notas: projeto.notas ?? [],
          escala_de_medida: projeto.escala_de_medida ?? undefined,
          tamanho: projeto.tamanho ?? undefined,
        },
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
    };
    salvarAoSair.current = salvar;
    const temporizador = setTimeout(salvar, situacao === "sem-conexao" ? ESPERA_NOVA_TENTATIVA_MS : ESPERA_SALVAR_MS);
    return () => clearTimeout(temporizador);
  }, [estado, pendente, situacao, projetoId, mostrarAviso]);
  useEffect(() => () => salvarAoSair.current?.(), []);

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
        despachar({ tipo: "executar", projeto: resultado.projeto, nome: comando.comando === "imagem.contagem" && comando.parametros.nome ? comando.parametros.nome : NOMES_DOS_COMANDOS[comando.comando] });
        setSituacao((atual) => (atual === "erro" ? "ocioso" : atual));
        return resultado;
      } catch (e) {
        if (e instanceof ErroEdicao) {
          mostrarAviso(e.message);
          falhaDoComando.current = performance.now();
          return null;
        }
        // Erro de programação: a ação não acontece, mas a pessoa fica sabendo (antes, nada mudava em silêncio)
        console.error(`Comando ${comando.comando} falhou:`, e);
        mostrarAviso("Não foi possível fazer isso. Tente de novo; se continuar, recarregue a página.");
        falhaDoComando.current = performance.now();
        return null;
      }
    },
    [estado, ctx, mostrarAviso],
  );

  const salvamento: EstadoSalvamento = situacao !== "ocioso" ? situacao : pendente ? "pendente" : "salvo";

  return {
    projeto: estado?.historico.presente ?? null,
    nome: estado?.nome ?? "",
    // Depois de um salvamento recusado, desfazer, refazer e renomear também voltam a salvar (a dica da barra manda
    // desfazer; antes, só um comando novo destravava, e o que já estava certo não ia para o servidor)
    renomear: useCallback((nome: string) => {
      despachar({ tipo: "renomear", nome });
      setSituacao((atual) => (atual === "erro" ? "ocioso" : atual));
    }, []),
    executar,
    desfazer: useCallback(() => {
      despachar({ tipo: "desfazer" });
      setSituacao((atual) => (atual === "erro" ? "ocioso" : atual));
    }, []),
    refazer: useCallback(() => {
      despachar({ tipo: "refazer" });
      setSituacao((atual) => (atual === "erro" ? "ocioso" : atual));
    }, []),
    nomeDesfazer: estado?.historico.passado.at(-1)?.nome ?? null,
    nomeRefazer: estado?.historico.futuro[0]?.nome ?? null,
    /** Os nomes dos passos, para o painel Histórico: os feitos (o mais antigo primeiro) e os que dá para refazer. */
    passos: { feitos: estado?.historico.passado.map((passo) => passo.nome) ?? [], desfeitos: estado?.historico.futuro.map((passo) => passo.nome) ?? [] },
    /**
     * O projeto como estava num passo do Histórico: 0 é o de abertura, n o depois do n-ésimo passo feito (o último
     * é o de agora). Os pincéis do histórico pintam com ele.
     */
    projetoDoPasso: useCallback(
      (indice: number): Projeto | null => {
        if (!estado) return null;
        const { passado, presente } = estado.historico;
        if (indice < 0 || indice > passado.length) return null;
        return indice === passado.length ? presente : passado[indice].projeto;
      },
      [estado],
    ),
    /** Volta ou avança até o passo: desfaz ou refaz um de cada vez, como os botões. */
    irParaPasso: useCallback((desfazer: number, refazer: number) => {
      for (let i = 0; i < desfazer; i++) despachar({ tipo: "desfazer" });
      for (let i = 0; i < refazer; i++) despachar({ tipo: "refazer" });
      if (desfazer || refazer) setSituacao((atual) => (atual === "erro" ? "ocioso" : atual));
    }, []),
    salvamento,
    erroCarga,
    aviso,
    mostrarAviso,
  };
}
