"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { chamarApi, ErroApi } from "@/lib/api";
import {
  alternarSalvo,
  type AnimacaoDaBiblioteca,
  type ItemDaBiblioteca,
  itensDeAnimacao,
  itensDeImagem,
  itensDeProjeto,
  type ModeloDoEspaco,
} from "@/lib/biblioteca";
import { MODELOS_DE_PROJETO } from "@/lib/projeto/modelos";
import { MODELOS_DE_IMAGEM } from "@/lib/projeto/modelosDeImagem";

type Resposta = { do_espaco: ModeloDoEspaco[]; salvos: string[]; usos: Record<string, number> };

/**
 * A biblioteca do hub: os modelos (prontos e do espaço), os salvos de quem abriu e os usos. Com
 * `comAnimacoes`, também as mais de mil animações (a lista é grande; a página inicial não pede).
 */
export function useBiblioteca({ comAnimacoes = false } = {}) {
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [animacoes, setAnimacoes] = useState<AnimacaoDaBiblioteca[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    chamarApi<Resposta>("/modelos")
      .then((dados) => {
        if (ativo) setResposta(dados);
      })
      .catch((e) => {
        if (ativo) setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar a biblioteca.");
      });
    if (comAnimacoes) {
      chamarApi<AnimacaoDaBiblioteca[]>("/animacoes/modelos")
        .then((lista) => {
          if (ativo) setAnimacoes(lista);
        })
        .catch((e) => {
          if (ativo) setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar as animações.");
        });
    }
    return () => {
      ativo = false;
    };
  }, [comAnimacoes]);

  const base = useMemo(() => ({ salvos: resposta?.salvos ?? [], usos: resposta?.usos ?? {} }), [resposta]);
  const projetos = useMemo(() => (resposta ? itensDeProjeto(MODELOS_DE_PROJETO, resposta.do_espaco, base) : null), [resposta, base]);
  const imagens = useMemo(() => (resposta ? itensDeImagem(MODELOS_DE_IMAGEM, base) : null), [resposta, base]);
  const deAnimacao = useMemo(() => (resposta && animacoes ? itensDeAnimacao(animacoes, base) : null), [resposta, animacoes, base]);

  /** Guarda ou tira dos salvos, já na tela; se a API recusar, volta. */
  const salvar = useCallback(
    (item: ItemDaBiblioteca) => {
      if (!resposta) return;
      const antes = resposta.salvos;
      const depois = alternarSalvo(antes, item.chave);
      setResposta({ ...resposta, salvos: depois });
      chamarApi<string[]>("/modelos/salvos", { metodo: "PUT", corpo: { ids: depois } }).catch((e) => {
        setResposta((atual) => (atual ? { ...atual, salvos: antes } : atual));
        setErro(e instanceof ErroApi ? e.message : "Não foi possível salvar agora.");
      });
    },
    [resposta],
  );

  /** Um modelo pronto ou uma animação foi usado (o do espaço conta sozinho, no /usar). */
  const contarUso = useCallback((item: ItemDaBiblioteca) => {
    setResposta((atual) => (atual ? { ...atual, usos: { ...atual.usos, [item.chave]: (atual.usos[item.chave] ?? 0) + 1 } } : atual));
    chamarApi("/modelos/usos", { metodo: "POST", corpo: { modelo_id: item.chave } }).catch(() => undefined);
  }, []);

  const excluirDoEspaco = useCallback((item: ItemDaBiblioteca) => {
    return chamarApi(`/modelos/${item.id}`, { metodo: "DELETE" }).then(() =>
      setResposta((atual) => (atual ? { ...atual, do_espaco: atual.do_espaco.filter((modelo) => modelo.id !== item.id) } : atual)),
    );
  }, []);

  return { projetos, imagens, animacoes: deAnimacao, erro, salvar, contarUso, excluirDoEspaco };
}
