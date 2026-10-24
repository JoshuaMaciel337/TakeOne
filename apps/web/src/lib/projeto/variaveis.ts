// Imagem › Variáveis do editor de imagem (ADR 0003, onda 13.13): camadas ligadas a variáveis (o texto de uma camada de
// texto, a visibilidade de qualquer camada, a foto de uma camada de foto) e os conjuntos de dados, cada um com um valor
// por variável. Aplicar um conjunto troca o documento; exportar os conjuntos faz um arquivo por conjunto (um cartaz por
// produto, um crachá por pessoa). Os conjuntos vêm da tabela da janela ou de um CSV.
import type { Contexto } from "./edicao.ts";
import { mudarTextoRico, trocarImagemDaCamada } from "./imagem.ts";
import type { Projeto } from "./modelo.ts";
import type { Tamanho } from "./geometria.ts";
import { estiloNoIndice, substituir, textoCorrido, type TextoRico } from "../texto/modelo.ts";

export type TipoDaVariavel = "texto" | "visibilidade" | "imagem";
export type Variavel = { nome: string; tipo: TipoDaVariavel; /** A faixa (camada) ligada. */ faixa: string };
export type ConjuntoDeDados = { nome: string; valores: Record<string, string> };
export type VariaveisDoDocumento = { variaveis: Variavel[]; conjuntos: ConjuntoDeDados[] };

export const NOMES_DOS_TIPOS: Record<TipoDaVariavel, string> = { texto: "Substituir o texto", visibilidade: "Visibilidade", imagem: "Substituir a imagem" };

/** O nome da variável: letras, números e sublinhado, começando por letra (como lá), a partir do nome da camada. */
export function nomeDeVariavel(base: string, usados: Iterable<string> = []): string {
  const limpo =
    base
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "v$1")
      .slice(0, 40) || "variavel";
  const ja = new Set([...usados].map((n) => n.toLowerCase()));
  let nome = limpo;
  for (let n = 2; ja.has(nome.toLowerCase()); n++) nome = `${limpo}_${n}`;
  return nome;
}

const VISIVEL = new Set(["sim", "true", "1", "visivel", "visível", "mostrar", "verdadeiro", "s", "x"]);

/** O texto do valor diz que a camada aparece. */
export const valorVisivel = (valor: string) => VISIVEL.has(valor.trim().toLowerCase());

export type ParaAplicar = {
  ctx: Contexto;
  /** O texto medido de novo (a caixa muda com o texto); nos testes, ele mesmo. */
  medir: (texto: TextoRico) => TextoRico;
  /** A foto da biblioteca pelo valor (o nome do arquivo, com ou sem a extensão, ou o id) e o tamanho dela. */
  imagem: (valor: string) => { midiaId: string; tamanho: Tamanho } | null;
  /** O tamanho em pixels da foto que a camada mostra agora. */
  tamanhoDaMidia: (midiaId: string) => Tamanho | null;
};

/** O documento com os valores do conjunto; `avisos` diz o que não deu (a foto que não está na biblioteca). */
export function aplicarConjunto(projeto: Projeto, definicao: VariaveisDoDocumento, conjunto: ConjuntoDeDados, para: ParaAplicar): { projeto: Projeto; avisos: string[] } {
  let atual = projeto;
  const avisos: string[] = [];
  for (const variavel of definicao.variaveis) {
    const valor = conjunto.valores[variavel.nome];
    if (valor === undefined) continue;
    const faixa = atual.faixas.find((item) => item.id === variavel.faixa);
    const clipe = faixa?.clipes[0];
    if (!faixa || !clipe) continue;
    if (variavel.tipo === "visibilidade") {
      atual = { ...atual, faixas: atual.faixas.map((item) => (item.id === faixa.id ? { ...item, oculta: !valorVisivel(valor) } : item)) };
    } else if (variavel.tipo === "texto" && clipe.texto_rico) {
      const texto = clipe.texto_rico;
      if (textoCorrido(texto) === valor) continue;
      // O texto inteiro troca, com o estilo do começo dele
      const novo = para.medir(substituir(texto, 0, textoCorrido(texto).length, valor, estiloNoIndice(texto, 0)));
      atual = mudarTextoRico(atual, clipe.id, novo);
    } else if (variavel.tipo === "imagem" && clipe.midia_id && !clipe.pixels) {
      if (!valor.trim()) continue;
      const achada = para.imagem(valor);
      const tamanhoAtual = para.tamanhoDaMidia(clipe.midia_id);
      if (!achada || !tamanhoAtual) {
        avisos.push(`"${valor}" não está na biblioteca (${variavel.nome}).`);
        continue;
      }
      if (achada.midiaId === clipe.midia_id) continue;
      atual = trocarImagemDaCamada(atual, para.ctx, clipe.id, achada.midiaId, tamanhoAtual, achada.tamanho);
    }
  }
  return { projeto: atual, avisos };
}

/** Os valores de agora do documento, como um conjunto novo. */
export function conjuntoDoDocumento(projeto: Projeto, definicao: VariaveisDoDocumento, nome: string, nomeDaMidia: (midiaId: string) => string): ConjuntoDeDados {
  const valores: Record<string, string> = {};
  for (const variavel of definicao.variaveis) {
    const faixa = projeto.faixas.find((item) => item.id === variavel.faixa);
    const clipe = faixa?.clipes[0];
    if (!faixa || !clipe) continue;
    if (variavel.tipo === "visibilidade") valores[variavel.nome] = faixa.oculta ? "não" : "sim";
    else if (variavel.tipo === "texto" && clipe.texto_rico) valores[variavel.nome] = textoCorrido(clipe.texto_rico);
    else if (variavel.tipo === "imagem" && clipe.midia_id) valores[variavel.nome] = nomeDaMidia(clipe.midia_id);
  }
  return { nome, valores };
}

/** O CSV (ou o texto com tabulação ou ponto e vírgula): o cabeçalho e as linhas, com aspas e quebras dentro delas. */
export function lerCsv(texto: string): { cabecalho: string[]; linhas: string[][] } {
  const limpo = texto.replace(/^﻿/, "");
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? "";
  const contar = (c: string) => primeira.split(c).length - 1;
  const separador = ["\t", ";", ","].reduce((melhor, c) => (contar(c) > contar(melhor) ? c : melhor), ",");
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"' && campo === "") aspas = true;
    else if (c === separador) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpo[i + 1] === "\n") i++;
      linha.push(campo);
      campo = "";
      if (linha.some((v) => v !== "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((v) => v !== "")) linhas.push(linha);
  const [cabecalho = [], ...resto] = linhas;
  return { cabecalho: cabecalho.map((v) => v.trim()), linhas: resto };
}

/**
 * Os conjuntos do CSV: as colunas com o nome de uma variável viram os valores (as outras ficam de fora); a coluna
 * "nome" ou "conjunto", quando há, dá o nome de cada um.
 */
export function conjuntosDoCsv(texto: string, variaveis: Variavel[]): { conjuntos: ConjuntoDeDados[]; ignoradas: string[] } {
  const { cabecalho, linhas } = lerCsv(texto);
  const porNome = new Map(variaveis.map((v) => [v.nome.toLowerCase(), v.nome]));
  const colunaDoNome = cabecalho.findIndex((c) => ["nome", "conjunto"].includes(c.toLowerCase()) && !porNome.has(c.toLowerCase()));
  const ignoradas = cabecalho.filter((c, i) => i !== colunaDoNome && !porNome.has(c.toLowerCase()));
  const conjuntos = linhas.map((linha, i) => {
    const valores: Record<string, string> = {};
    cabecalho.forEach((coluna, j) => {
      const variavel = porNome.get(coluna.toLowerCase());
      if (variavel) valores[variavel] = linha[j] ?? "";
    });
    return { nome: (colunaDoNome >= 0 ? linha[colunaDoNome]?.trim() : "") || `Conjunto ${i + 1}`, valores };
  });
  return { conjuntos, ignoradas };
}
