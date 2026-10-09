"use client";

import { useCallback, useRef, useState } from "react";

import { useMidias } from "@/lib/useMidias";
import { useTamanhoSalvo } from "@/lib/useTamanhoSalvo";

import { BarraFerramentas } from "./BarraFerramentas";
import { BarraSuperior } from "./BarraSuperior";
import { Divisor } from "./Divisor";
import { FERRAMENTAS, type IdFerramenta } from "./ferramentas";
import { LinhaDoTempo } from "./LinhaDoTempo";
import { PainelConteudo } from "./PainelConteudo";
import { PainelPropriedades } from "./PainelPropriedades";
import { Previa } from "./Previa";
import { type Proporcao } from "./proporcoes";

const CONTEUDO = { padrao: 320, minimo: 240, maximo: 520 };
const PROPRIEDADES = { padrao: 300, minimo: 240, maximo: 440 };
const LINHA_DO_TEMPO = { padrao: 240, minimo: 150, maximo: 520 };

/**
 * As quatro áreas: ferramentas e painel de conteúdo à esquerda, prévia no centro,
 * propriedades à direita e linha do tempo embaixo. No celular, a prévia ocupa o
 * topo, as ferramentas viram uma faixa embaixo e o painel abre por cima.
 */
export function Editor() {
  const biblioteca = useMidias();
  const [nome, setNome] = useState("Projeto sem título");
  const [proporcao, setProporcao] = useState<Proporcao>("9:16");
  const [ferramenta, setFerramenta] = useState<IdFerramenta>("midia");
  const [painelNoCelular, setPainelNoCelular] = useState(false);
  const [midiaId, setMidiaId] = useState<string | null>(null);
  const [tempo, setTempo] = useState(0);
  const reprodutorRef = useRef<HTMLMediaElement | null>(null);

  const [larguraConteudo, setLarguraConteudo] = useTamanhoSalvo("largura-conteudo", CONTEUDO.padrao, CONTEUDO.minimo, CONTEUDO.maximo);
  const [larguraPropriedades, setLarguraPropriedades] = useTamanhoSalvo(
    "largura-propriedades",
    PROPRIEDADES.padrao,
    PROPRIEDADES.minimo,
    PROPRIEDADES.maximo,
  );
  const [alturaLinha, setAlturaLinha] = useTamanhoSalvo("altura-linha", LINHA_DO_TEMPO.padrao, LINHA_DO_TEMPO.minimo, LINHA_DO_TEMPO.maximo);

  const midia = biblioteca.midias?.find((item) => item.id === midiaId) ?? null;
  const duracao = midia?.status === "pronta" ? (midia.duracao ?? 0) : 0;
  const ferramentaAtual = FERRAMENTAS.find((item) => item.id === ferramenta)!;

  const selecionarMidia = useCallback((id: string | null) => {
    setMidiaId(id);
    setTempo(0);
  }, []);

  const buscar = useCallback((segundos: number) => {
    setTempo(segundos);
    if (reprodutorRef.current) reprodutorRef.current.currentTime = segundos;
  }, []);

  const tamanhos = {
    "--largura-conteudo": `${larguraConteudo}px`,
    "--largura-propriedades": `${larguraPropriedades}px`,
    "--altura-linha": `${alturaLinha}px`,
  } as React.CSSProperties;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-fundo text-texto" style={tamanhos}>
      <BarraSuperior nome={nome} aoMudarNome={setNome} proporcao={proporcao} aoMudarProporcao={setProporcao} />

      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <BarraFerramentas
          ativa={ferramenta}
          aoEscolher={(id) => {
            setFerramenta(id);
            setPainelNoCelular(true);
          }}
          className="max-md:order-2"
        />

        <PainelConteudo
          ferramenta={ferramentaAtual}
          biblioteca={biblioteca}
          midiaSelecionadaId={midiaId}
          aoSelecionarMidia={selecionarMidia}
          aoFechar={() => setPainelNoCelular(false)}
          className={`md:w-[var(--largura-conteudo)] max-md:fixed max-md:inset-x-0 max-md:bottom-16 max-md:z-30 max-md:h-[55dvh] ${
            painelNoCelular ? "" : "max-md:hidden"
          }`}
        />
        <Divisor
          direcao="coluna"
          valor={larguraConteudo}
          minimo={CONTEUDO.minimo}
          maximo={CONTEUDO.maximo}
          aoMudar={setLarguraConteudo}
          rotulo="Largura do painel de conteúdo"
          className="max-md:hidden"
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:order-1">
          <div className="flex min-h-0 flex-1">
            <Previa
              proporcao={proporcao}
              midia={midia}
              reprodutorRef={reprodutorRef}
              tempo={tempo}
              aoMudarTempo={setTempo}
              className="flex-1"
            />
            <Divisor
              direcao="coluna"
              valor={larguraPropriedades}
              minimo={PROPRIEDADES.minimo}
              maximo={PROPRIEDADES.maximo}
              aoMudar={setLarguraPropriedades}
              sentido={-1}
              rotulo="Largura do painel de propriedades"
              className="max-lg:hidden"
            />
            <PainelPropriedades midia={midia} className="w-[var(--largura-propriedades)] max-lg:hidden" />
          </div>
          <Divisor
            direcao="linha"
            valor={alturaLinha}
            minimo={LINHA_DO_TEMPO.minimo}
            maximo={LINHA_DO_TEMPO.maximo}
            aoMudar={setAlturaLinha}
            sentido={-1}
            rotulo="Altura da linha do tempo"
            className="max-md:hidden"
          />
          <LinhaDoTempo duracao={duracao} tempo={tempo} aoBuscar={buscar} className="h-40 md:h-[var(--altura-linha)]" />
        </div>
      </div>
    </div>
  );
}
