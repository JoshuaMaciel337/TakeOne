"use client";

import { useEffect, useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import type { Clipe } from "@/lib/projeto/modelo";
import { TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

const LIMITE_QUADROS = 300;
const PASSO_BARRAS_PX = 3;

type Props = {
  midia: Midia;
  clipe: Clipe;
  /** Pixels por segundo da linha do tempo. */
  zoom: number;
  largura: number;
  altura: number;
};

/** Segundo da mídia que aparece a `x` pixels do começo do clipe. */
function segundoNaMidia(clipe: Clipe, x: number, zoom: number): number {
  return clipe.entrada / TICKS_POR_SEGUNDO + (x / zoom) * clipe.velocidade;
}

/** Fileira de miniaturas, recortadas do sprite que a ingestão gera. */
export function MiniaturasDoClipe({ midia, clipe, zoom, largura, altura }: Props) {
  const plano = midia.miniaturas;
  if (!plano || !midia.arquivos.includes("miniaturas.jpg")) return null;
  const larguraQuadro = Math.max(1, Math.round((altura * plano.largura) / plano.altura));
  const quantos = Math.min(LIMITE_QUADROS, Math.ceil(largura / larguraQuadro));
  const sprite = `url(${arquivoDaMidia(midia.id, "miniaturas.jpg")})`;

  return (
    <div className="pointer-events-none absolute inset-0 flex overflow-hidden" aria-hidden>
      {Array.from({ length: quantos }, (_, i) => {
        const indice = Math.min(plano.total - 1, Math.max(0, Math.floor(segundoNaMidia(clipe, i * larguraQuadro, zoom) / plano.intervalo)));
        return (
          <div
            key={i}
            className="h-full shrink-0"
            style={{
              width: larguraQuadro,
              backgroundImage: sprite,
              backgroundSize: `${plano.colunas * larguraQuadro}px ${plano.linhas * altura}px`,
              backgroundPosition: `-${(indice % plano.colunas) * larguraQuadro}px -${Math.floor(indice / plano.colunas) * altura}px`,
            }}
          />
        );
      })}
    </div>
  );
}

/** `maior` é o pico mais alto da mídia: as barras são desenhadas em relação a ele, para áudio baixo também aparecer. */
type DadosFormaDeOnda = { picos_por_segundo: number; picos: number[]; maior: number };

const formasCarregadas = new Map<string, Promise<DadosFormaDeOnda | null>>();

function carregarFormaDeOnda(midiaId: string): Promise<DadosFormaDeOnda | null> {
  let pedido = formasCarregadas.get(midiaId);
  if (!pedido) {
    pedido = fetch(arquivoDaMidia(midiaId, "forma_de_onda.json"), { credentials: "same-origin" })
      .then((resposta) => (resposta.ok ? resposta.json() : null))
      .then((dados: Omit<DadosFormaDeOnda, "maior"> | null) =>
        dados ? { ...dados, maior: dados.picos.reduce((maior, pico) => Math.max(maior, pico), 1) } : null,
      )
      .catch(() => null);
    formasCarregadas.set(midiaId, pedido);
  }
  return pedido;
}

function useFormaDeOnda(midia: Midia): DadosFormaDeOnda | null {
  const disponivel = midia.arquivos.includes("forma_de_onda.json");
  const [carregada, setCarregada] = useState<{ id: string; dados: DadosFormaDeOnda | null } | null>(null);
  useEffect(() => {
    if (!disponivel) return;
    let ativo = true;
    carregarFormaDeOnda(midia.id).then((dados) => {
      if (ativo) setCarregada({ id: midia.id, dados });
    });
    return () => {
      ativo = false;
    };
  }, [midia.id, disponivel]);
  return carregada?.id === midia.id ? carregada.dados : null;
}

/** Barras dos picos de áudio, do trecho da mídia que o clipe mostra. */
export function FormaDeOndaDoClipe({ midia, clipe, zoom, largura, altura, className = "" }: Props & { className?: string }) {
  const dados = useFormaDeOnda(midia);
  if (!dados || !dados.picos.length) return null;
  const maior = dados.maior;
  let caminho = "";
  for (let x = 1; x < Math.min(largura, 12_000); x += PASSO_BARRAS_PX) {
    const pico = dados.picos[Math.floor(segundoNaMidia(clipe, x, zoom) * dados.picos_por_segundo)] ?? 0;
    const h = Math.max(1, (pico / maior) * altura * 0.9);
    caminho += `M${x} ${altura}V${(altura - h).toFixed(1)}`;
  }
  return (
    <svg className={`pointer-events-none absolute inset-x-0 bottom-0 ${className}`} width={largura} height={altura} aria-hidden>
      <path d={caminho} stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}
