// As vagas de um modelo do espaço: os clipes que quem usa o modelo troca. Quem salva o projeto como modelo
// escolhe entre os candidatos (os clipes de mídia e os textos); quem usa preenche na ferramenta Modelos.
import { type Clipe, type Faixa, type Projeto, type VagaDoModelo } from "./modelo.ts";

export type CandidataAVaga = VagaDoModelo & { marcada: boolean; faixa: Faixa["tipo"]; inicio: number };

/** O que a vaga precisa saber da mídia: se é uma forma ou uma animação (essas não viram vaga). */
export type MidiaDaVaga = { elemento?: unknown; animacao?: unknown } | undefined;

/**
 * Os clipes que podem virar vaga, na ordem do tempo dentro de cada tipo: as cenas da principal (já marcadas), as
 * sobreposições e os áudios (desmarcados) e os textos (marcados). Formas e animações não entram: trocá-las é
 * trocar o desenho, não a mídia. As legendas também não, porque saem da fala.
 */
export function candidatasAVaga(projeto: Projeto, midia: (id: string) => MidiaDaVaga): CandidataAVaga[] {
  const porTempo = (a: { clipe: Clipe }, b: { clipe: Clipe }) => a.clipe.inicio - b.clipe.inicio;
  const clipes = (tipos: Faixa["tipo"][]) =>
    projeto.faixas.filter((faixa) => tipos.includes(faixa.tipo)).flatMap((faixa) => faixa.clipes.map((clipe) => ({ clipe, faixa }))).sort(porTempo);
  const ehMidiaComum = ({ clipe }: { clipe: Clipe }) => {
    if (clipe.texto || !clipe.midia_id) return false;
    const info = midia(clipe.midia_id);
    return !info?.elemento && !info?.animacao;
  };
  const resultado: CandidataAVaga[] = [];
  const nomear = (grupo: { clipe: Clipe; faixa: Faixa }[], rotulo: string, marcada: boolean) =>
    grupo.forEach(({ clipe, faixa }, i) =>
      resultado.push({ clipe_id: clipe.id, tipo: "midia", rotulo: `${rotulo} ${i + 1}`, marcada, faixa: faixa.tipo, inicio: clipe.inicio }),
    );
  nomear(clipes(["principal"]).filter(ehMidiaComum), "Cena", true);
  nomear(clipes(["video"]).filter(ehMidiaComum), "Sobreposição", false);
  nomear(clipes(["audio"]).filter(ehMidiaComum), "Áudio", false);
  for (const { clipe, faixa } of clipes(["texto"])) {
    const conteudo = (clipe.texto?.conteudo ?? "").replace(/\s+/g, " ").trim();
    const rotulo = conteudo.length > 40 ? `${conteudo.slice(0, 39)}…` : conteudo || "Texto";
    resultado.push({ clipe_id: clipe.id, tipo: "texto", rotulo, marcada: true, faixa: faixa.tipo, inicio: clipe.inicio });
  }
  return resultado;
}

/** As vagas do modelo de onde o projeto veio cujos clipes ainda existem, na ordem do modelo. */
export function vagasQueRestam(projeto: Projeto): (VagaDoModelo & { clipe: Clipe; faixa: Faixa })[] {
  const vagas = projeto.modelo_origem?.vagas ?? [];
  return vagas.flatMap((vaga) => {
    for (const faixa of projeto.faixas) {
      const clipe = faixa.clipes.find((item) => item.id === vaga.clipe_id);
      if (clipe) return [{ ...vaga, clipe, faixa }];
    }
    return [];
  });
}
