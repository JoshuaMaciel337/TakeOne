// As distrações que o detector das fotos do álbum procura (core/utils/distracoes.py, CONSULTAS_PRONTAS): o nome
// em português na tela e a consulta em inglês, a língua do modelo.
export const DISTRACOES_PRONTAS: { nome: string; consulta: string }[] = [
  { nome: "Lixeira", consulta: "trash can" },
  { nome: "Placa de saída", consulta: "exit sign" },
  { nome: "Extintor", consulta: "fire extinguisher" },
  { nome: "Tomada", consulta: "power outlet" },
  { nome: "Fios", consulta: "electrical cables" },
  { nome: "Garrafa", consulta: "plastic bottle" },
  { nome: "Copo", consulta: "disposable cup" },
  { nome: "Cone", consulta: "traffic cone" },
  { nome: "Sacola", consulta: "plastic bag" },
  { nome: "Poste", consulta: "utility pole" },
  { nome: "Ar-condicionado", consulta: "air conditioner" },
  { nome: "Carro", consulta: "parked car" },
  { nome: "Placa", consulta: "street sign" },
  { nome: "Pedestal de microfone", consulta: "microphone stand" },
];

/** As consultas de uma lista de nomes escolhidos e de um texto livre (separado por vírgula). */
export function consultasDe(escolhidas: string[], livre: string): string[] {
  const prontas = DISTRACOES_PRONTAS.filter((d) => escolhidas.includes(d.nome)).map((d) => d.consulta);
  const extras = livre
    .split(",")
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean);
  return [...new Set([...prontas, ...extras])].slice(0, 12);
}
