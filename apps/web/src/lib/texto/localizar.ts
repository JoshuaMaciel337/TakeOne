// Localizar e substituir nos textos do editor de imagem (ADR 0003, onda 13.8). A busca é no texto corrido (os
// parágrafos separados por "\n"), sem diferenciar acentos só quando pedido; a troca fica com o estilo do primeiro
// caractere achado.
import { estiloNoIndice, substituir, textoCorrido, type TextoRico } from "./modelo.ts";

export type OpcoesDaBusca = { maiusculas: boolean; palavraInteira: boolean; acentos: boolean };

const semAcento = (texto: string) => texto.normalize("NFD").replace(/\p{M}/gu, "");
const LETRA = /[\p{L}\p{N}_]/u;

/**
 * Os trechos [de, ate) do texto que batem com a busca. Sem diferenciar acentos, a comparação é caractere a caractere
 * sem a marca (o "ã" vira "a"), então os índices continuam os do texto.
 */
export function ocorrencias(corrido: string, busca: string, opcoes: OpcoesDaBusca): { de: number; ate: number }[] {
  if (!busca) return [];
  const preparar = (texto: string) => {
    let saida = texto;
    if (!opcoes.maiusculas) saida = saida.toLocaleLowerCase("pt-BR");
    // Caractere a caractere, para os índices não mudarem (cada letra acentuada é uma unidade no texto que o campo dá)
    if (!opcoes.acentos) saida = [...saida].map((c) => (c.length === 1 ? (semAcento(c)[0] ?? c) : c)).join("");
    return saida;
  };
  const texto = preparar(corrido);
  const alvo = preparar(busca);
  const achados: { de: number; ate: number }[] = [];
  for (let i = texto.indexOf(alvo); i >= 0; i = texto.indexOf(alvo, i + Math.max(1, alvo.length))) {
    const ate = i + alvo.length;
    if (opcoes.palavraInteira && (LETRA.test(corrido[i - 1] ?? "") || LETRA.test(corrido[ate] ?? ""))) continue;
    achados.push({ de: i, ate });
  }
  return achados;
}

/** Troca todas as ocorrências (do fim para o começo, para os índices valerem). */
export function substituirTodas(texto: TextoRico, busca: string, troca: string, opcoes: OpcoesDaBusca): { texto: TextoRico; quantas: number } {
  const achados = ocorrencias(textoCorrido(texto), busca, opcoes);
  let novo = texto;
  for (const { de, ate } of [...achados].reverse()) novo = substituir(novo, de, ate, troca, estiloNoIndice(novo, de + 1));
  return { texto: novo, quantas: achados.length };
}

/** O texto de exemplo (o lorem ipsum de sempre): uma frase no texto de ponto, vários parágrafos na caixa. */
export const LOREM_IPSUM = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
  "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
];
