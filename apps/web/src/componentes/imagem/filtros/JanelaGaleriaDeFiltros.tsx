"use client";

// Filtro › Galeria de filtros (ADR 0003, onda 13.11): a prévia da camada à esquerda, os 47 efeitos em pastas com as
// miniaturas no meio e, à direita, o efeito da camada de efeito escolhida com as opções dele e a pilha das camadas de
// efeito (a de cima é aplicada por último): o olho liga e desliga, "Nova camada" repete a escolhida, a lixeira tira.
// Clicar numa miniatura troca o efeito da camada escolhida. O OK devolve a pilha como texto (galeriaDeFiltros).
import { ChevronDown, ChevronRight, Eye, EyeOff, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { DefinicaoDoFiltro } from "@/lib/imagem/filtros/catalogo";
import type { ContextoDoFiltro, ImagemDoFiltro } from "@/lib/imagem/filtros/comum";
import { aplicarGaleriaDeFiltros, type CamadaDeEfeito, CATEGORIAS_DA_GALERIA, EFEITO_DA_GALERIA, EFEITOS_DA_GALERIA, pilhaDoTexto, textoDaPilha, valoresDoEfeito } from "@/lib/imagem/filtros/galeriaDeFiltros";
import type { ImagemRgba } from "@/lib/selecao/varinha";

import { OpcoesDoFiltro } from "./OpcoesDoFiltro";

/** O texto da pilha cabe nas opções do filtro inteligente (400 caracteres). */
const TAMANHO_MAXIMO = 400;
const LADO_DA_MINIATURA = 76;

/** A imagem do canvas (cor reta) no pré-multiplicado dos filtros. */
function preMultiplicada(imagem: ImagemRgba): ImagemDoFiltro {
  const dados = new Uint8ClampedArray(imagem.dados.length);
  for (let i = 0; i < dados.length; i += 4) {
    const a = imagem.dados[i + 3];
    dados[i] = Math.round((imagem.dados[i] * a) / 255);
    dados[i + 1] = Math.round((imagem.dados[i + 1] * a) / 255);
    dados[i + 2] = Math.round((imagem.dados[i + 2] * a) / 255);
    dados[i + 3] = a;
  }
  return { largura: imagem.largura, altura: imagem.altura, dados };
}

function paraCanvas(canvas: HTMLCanvasElement | null, imagem: ImagemDoFiltro) {
  if (!canvas) return;
  canvas.width = imagem.largura;
  canvas.height = imagem.altura;
  // De volta à cor reta para o canvas
  const dados = new Uint8ClampedArray(imagem.dados.length);
  for (let i = 0; i < dados.length; i += 4) {
    const a = imagem.dados[i + 3];
    dados[i + 3] = a;
    if (!a) continue;
    for (let k = 0; k < 3; k++) dados[i + k] = Math.round((imagem.dados[i + k] * 255) / a);
  }
  canvas.getContext("2d")!.putImageData(new ImageData(dados, imagem.largura, imagem.altura), 0, 0);
}

export function JanelaGaleriaDeFiltros({
  imagem,
  documento,
  primeiroPlano,
  fundo,
  inicial,
  aoConfirmar,
  aoCancelar,
}: {
  /** A camada sozinha, no quadro do documento, pequena (cor reta). */
  imagem: ImagemRgba;
  documento: { largura: number; altura: number };
  primeiroPlano: [number, number, number];
  fundo: [number, number, number];
  inicial: string;
  aoConfirmar: (texto: string) => void;
  aoCancelar: () => void;
}) {
  const [pilha, setPilha] = useState<CamadaDeEfeito[]>(() => {
    const lida = pilhaDoTexto(inicial);
    return lida.length ? lida : [{ efeito: "pinceladas", opcoes: valoresDoEfeito(EFEITO_DA_GALERIA.get("pinceladas")!), ligado: true }];
  });
  // A escolhida é contada na ordem da pilha (0 é a de baixo, a primeira aplicada)
  const [escolhida, setEscolhida] = useState(() => Math.max(0, pilhaDoTexto(inicial).length - 1));
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set([EFEITO_DA_GALERIA.get(pilha[0]?.efeito ?? "")?.categoria ?? "artisticos"]));
  const [calculando, setCalculando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const previaRef = useRef<HTMLCanvasElement>(null);
  const fonte = useMemo(() => preMultiplicada(imagem), [imagem]);
  const ctx: ContextoDoFiltro = useMemo(() => ({ escala: imagem.largura / documento.largura, primeiroPlano, fundo, origem: { x: 0, y: 0 }, documento }), [imagem.largura, documento, primeiroPlano, fundo]);
  const atual = pilha[Math.min(escolhida, pilha.length - 1)];
  const efeito = atual ? EFEITO_DA_GALERIA.get(atual.efeito) : undefined;

  // A prévia: a pilha na camada pequena, um pouco depois de mexer
  useEffect(() => {
    const espera = window.setTimeout(() => {
      setCalculando(true);
      window.setTimeout(() => {
        paraCanvas(previaRef.current, aplicarGaleriaDeFiltros(fonte, pilha, ctx));
        setCalculando(false);
      }, 10);
    }, 120);
    return () => window.clearTimeout(espera);
  }, [fonte, pilha, ctx]);

  // As miniaturas: o meio da camada, cada efeito com os padrões, uma de cada vez (sem travar a janela)
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});
  useEffect(() => {
    const lado = Math.min(LADO_DA_MINIATURA * 2, fonte.largura, fonte.altura);
    const x0 = Math.floor((fonte.largura - lado) / 2);
    const y0 = Math.floor((fonte.altura - lado) / 2);
    const dados = new Uint8ClampedArray(lado * lado * 4);
    for (let y = 0; y < lado; y++) dados.set(fonte.dados.subarray(((y0 + y) * fonte.largura + x0) * 4, ((y0 + y) * fonte.largura + x0 + lado) * 4), y * lado * 4);
    const recorte = { largura: lado, altura: lado, dados };
    const ctxDoRecorte = { ...ctx, origem: { x: x0 / ctx.escala, y: y0 / ctx.escala } };
    let vivo = true;
    let i = 0;
    const proxima = () => {
      if (!vivo || i >= EFEITOS_DA_GALERIA.length) return;
      const e = EFEITOS_DA_GALERIA[i++];
      const canvas = document.createElement("canvas");
      paraCanvas(canvas, e.aplicar(recorte, valoresDoEfeito(e), ctxDoRecorte));
      const url = canvas.toDataURL("image/png");
      setMiniaturas((anteriores) => ({ ...anteriores, [e.id]: url }));
      window.setTimeout(proxima, 0);
    };
    window.setTimeout(proxima, 200);
    return () => {
      vivo = false;
    };
  }, [fonte, ctx]);

  const mudar = (nova: CamadaDeEfeito[], novaEscolhida = escolhida) => {
    if (textoDaPilha(nova).length > TAMANHO_MAXIMO) return setAviso("A pilha chegou ao limite: tire uma camada de efeito antes de pôr outra.");
    setAviso(null);
    setPilha(nova);
    setEscolhida(Math.max(0, Math.min(novaEscolhida, nova.length - 1)));
  };
  const trocarEfeito = (id: string) => {
    const e = EFEITO_DA_GALERIA.get(id)!;
    const camada = { efeito: id, opcoes: valoresDoEfeito(e), ligado: true };
    mudar(pilha.length ? pilha.map((c, i) => (i === escolhida ? camada : c)) : [camada], pilha.length ? escolhida : 0);
  };

  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault();
        evento.stopImmediatePropagation();
        aoCancelar();
      }
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [aoCancelar]);

  const definicao = efeito ? ({ ...efeito, grupo: "especial" } as unknown as DefinicaoDoFiltro) : null;
  return (
    <div className="fixed inset-0 z-50 flex bg-fundo text-xs" role="dialog" aria-modal aria-label="Galeria de filtros">
      <div className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#1b1d22] p-4">
        <canvas ref={previaRef} className="max-h-full max-w-full object-contain" aria-label="Prévia da galeria de filtros" style={{ background: "repeating-conic-gradient(#cfcfcf 0 25%, #fff 0 50%) 0 0 / 16px 16px" }} />
        {calculando ? (
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 text-white">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Calculando…
          </span>
        ) : null}
      </div>
      <nav className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-borda bg-painel p-2" aria-label="Efeitos">
        {CATEGORIAS_DA_GALERIA.map((categoria) => {
          const aberta = abertas.has(categoria.id);
          return (
            <section key={categoria.id} className="mb-1">
              <button
                type="button"
                className="flex w-full items-center gap-1 rounded px-1 py-1 text-left font-semibold hover:bg-painel-2"
                aria-expanded={aberta}
                onClick={() =>
                  setAbertas((atuais) => {
                    const novas = new Set(atuais);
                    if (aberta) novas.delete(categoria.id);
                    else novas.add(categoria.id);
                    return novas;
                  })
                }
              >
                {aberta ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
                {categoria.nome}
              </button>
              {aberta ? (
                <div className="grid grid-cols-3 gap-1.5 px-1 pt-1">
                  {EFEITOS_DA_GALERIA.filter((e) => e.categoria === categoria.id).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      title={e.nome}
                      aria-label={e.nome}
                      aria-pressed={atual?.efeito === e.id}
                      className={`flex flex-col items-center gap-0.5 rounded p-0.5 ${atual?.efeito === e.id ? "bg-destaque/20 ring-1 ring-destaque" : "hover:bg-painel-2"}`}
                      onClick={() => trocarEfeito(e.id)}
                    >
                      {miniaturas[e.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a miniatura é um data URL feito aqui
                        <img src={miniaturas[e.id]} alt="" className="aspect-square w-full rounded-sm object-cover" />
                      ) : (
                        <span className="aspect-square w-full animate-pulse rounded-sm bg-painel-2" />
                      )}
                      <span className="line-clamp-2 text-center text-[10px] leading-tight">{e.nome}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </nav>
      <aside className="flex w-80 shrink-0 flex-col border-l border-borda bg-painel">
        <div className="flex items-center justify-between border-b border-borda px-3 py-2">
          <h2 className="text-sm font-semibold">Galeria de filtros</h2>
          <div className="flex items-center gap-2">
            <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoCancelar}>
              Cancelar
            </button>
            <button type="button" className="botao-principal px-3 py-1 text-xs" onClick={() => aoConfirmar(textoDaPilha(pilha))}>
              OK
            </button>
            <button type="button" className="botao-icone" onClick={aoCancelar} aria-label="Fechar">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <label className="mb-3 flex items-center gap-2">
            Efeito:
            <select className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5" value={atual?.efeito ?? ""} aria-label="Efeito da camada escolhida" onChange={(evento) => trocarEfeito(evento.currentTarget.value)}>
              {CATEGORIAS_DA_GALERIA.map((categoria) => (
                <optgroup key={categoria.id} label={categoria.nome}>
                  {EFEITOS_DA_GALERIA.filter((e) => e.categoria === categoria.id).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {definicao && atual ? (
            <OpcoesDoFiltro
              key={`${escolhida}:${atual.efeito}`}
              definicao={definicao}
              valores={atual.opcoes}
              aoPrever={(opcoes) => mudar(pilha.map((c, i) => (i === escolhida ? { ...c, opcoes } : c)))}
              aoMudar={(opcoes) => mudar(pilha.map((c, i) => (i === escolhida ? { ...c, opcoes } : c)))}
            />
          ) : null}
        </div>
        <section className="border-t border-borda p-2" aria-label="Camadas de efeito">
          {aviso ? <p className="mb-1 text-erro">{aviso}</p> : null}
          <ul className="flex max-h-48 flex-col-reverse overflow-y-auto">
            {pilha.map((camada, i) => (
              <li key={i} className={`flex items-center gap-1 rounded px-1 py-0.5 ${i === escolhida ? "bg-destaque/15" : ""}`}>
                <button type="button" className="botao-icone" aria-label={camada.ligado ? `Desligar ${EFEITO_DA_GALERIA.get(camada.efeito)?.nome}` : `Ligar ${EFEITO_DA_GALERIA.get(camada.efeito)?.nome}`} onClick={() => mudar(pilha.map((c, j) => (j === i ? { ...c, ligado: !c.ligado } : c)), escolhida)}>
                  {camada.ligado ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5 text-suave" aria-hidden />}
                </button>
                <button type="button" className="flex-1 truncate text-left" onClick={() => setEscolhida(i)}>
                  {EFEITO_DA_GALERIA.get(camada.efeito)?.nome}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex justify-end gap-1">
            <button type="button" className="botao-icone" aria-label="Nova camada de efeito" title="Nova camada de efeito" onClick={() => atual && mudar([...pilha.slice(0, escolhida + 1), { ...atual, opcoes: { ...atual.opcoes } }, ...pilha.slice(escolhida + 1)], escolhida + 1)}>
              <Plus className="size-3.5" aria-hidden />
            </button>
            <button type="button" className="botao-icone" aria-label="Excluir a camada de efeito" title="Excluir a camada de efeito" disabled={pilha.length <= 1} onClick={() => mudar(pilha.filter((_, j) => j !== escolhida), escolhida - 1)}>
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
