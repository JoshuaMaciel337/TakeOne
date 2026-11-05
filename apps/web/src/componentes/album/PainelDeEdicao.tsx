"use client";

import { Copy, Crop, LoaderCircle, Palette, RotateCcw, Ruler, Sparkles, Undo2 } from "lucide-react";
import { useState } from "react";

import { type EdicaoDaFoto, arquivoDaFoto, comCor, edicaoParaEnviar, PROPORCOES, type Proporcao } from "@/lib/album/edicao";
import type { FotoDoAlbum } from "@/lib/album/fotos";
import { arquivoDaMidia } from "@/lib/api";
import { type Cor, FILTROS } from "@/lib/projeto/cor";
import { estatisticasDaCor } from "@/lib/projeto/igualarCor";
import { ajustesAutomaticos } from "@/lib/projeto/melhorar";
import { useLuts } from "@/lib/useLuts";

/** Os pixels de uma imagem da API reduzida a `lado` (para o "Melhorar" e o igualar), em RGBA. */
async function amostra(url: string, lado = 160): Promise<Uint8ClampedArray> {
  const imagem = new Image();
  imagem.src = url;
  await imagem.decode();
  const escala = lado / Math.max(imagem.naturalWidth, imagem.naturalHeight);
  const w = Math.max(1, Math.round(imagem.naturalWidth * escala));
  const h = Math.max(1, Math.round(imagem.naturalHeight * escala));
  const canvas = new OffscreenCanvas(w, h);
  const contexto = canvas.getContext("2d")!;
  contexto.drawImage(imagem, 0, 0, w, h);
  return contexto.getImageData(0, 0, w, h).data;
}

/** Roda uma conta em cada item, no máximo `juntas` ao mesmo tempo. */
async function emLotes<T, R>(itens: T[], conta: (item: T) => Promise<R>, juntas = 6): Promise<R[]> {
  const saida: R[] = new Array(itens.length);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(juntas, itens.length) }, async () => {
      while (proximo < itens.length) {
        const i = proximo++;
        saida[i] = await conta(itens[i]);
      }
    }),
  );
  return saida;
}

const AJUSTES_RAPIDOS: { campo: keyof Cor; nome: string; minimo: number; maximo: number; passo: number }[] = [
  { campo: "exposicao", nome: "Exposição", minimo: -2, maximo: 2, passo: 0.05 },
  { campo: "contraste", nome: "Contraste", minimo: -1, maximo: 1, passo: 0.05 },
  { campo: "temperatura", nome: "Temperatura", minimo: -1, maximo: 1, passo: 0.05 },
  { campo: "saturacao", nome: "Saturação", minimo: -1, maximo: 1, passo: 0.05 },
];

/**
 * A edição das fotos escolhidas (as selecionadas, ou a do cursor): "Melhorar" foto a foto, um filtro, uma LUT do
 * espaço, ajustes rápidos, endireitar e recortar sozinho, igualar a cor à foto do cursor e copiar a edição dela para
 * as outras ou para o grupo de parecidas. O worker desenha o resultado (core/utils/edicao_de_foto.py).
 */
export function PainelDeEdicao({
  albumId,
  alvos,
  referencia,
  grupoDa,
  aoEditar,
}: {
  albumId: string;
  /** As fotos que recebem a edição. */
  alvos: FotoDoAlbum[];
  /** A foto do cursor: a dos valores mostrados, a do igualar e a do copiar. */
  referencia: FotoDoAlbum | null;
  grupoDa: (foto: FotoDoAlbum) => FotoDoAlbum[];
  aoEditar: (edicoes: { midia_id: string; edicao: EdicaoDaFoto | null }[], aviso: string) => Promise<void>;
}) {
  const { luts } = useLuts();
  const [ocupado, setOcupado] = useState("");
  const [rapidos, setRapidos] = useState<Partial<Record<keyof Cor, number>>>({});
  const [proporcao, setProporcao] = useState<Proporcao>("4:5");
  const prontas = alvos.filter((foto) => foto.status === "pronta");
  const cor = referencia?.edicao?.cor ?? {};
  const outras = referencia ? prontas.filter((foto) => foto.midia_id !== referencia.midia_id) : [];
  const nomeDosAlvos = prontas.length > 1 ? `as ${prontas.length.toLocaleString("pt-BR")} fotos` : "a foto";

  async function fazer(rotulo: string, conta: () => Promise<{ midia_id: string; edicao: EdicaoDaFoto | null }[]>, aviso: string) {
    if (ocupado) return;
    setOcupado(rotulo);
    try {
      const edicoes = await conta();
      if (edicoes.length) await aoEditar(edicoes, aviso);
    } finally {
      setOcupado("");
    }
  }
  const emTodas = (mudar: (foto: FotoDoAlbum) => EdicaoDaFoto | null) => async () => prontas.map((foto) => ({ midia_id: foto.midia_id, edicao: mudar(foto) }));
  const botao = "flex items-center justify-center gap-1.5 rounded-md bg-painel-2 px-2 py-1.5 text-xs hover:bg-painel-3 disabled:opacity-40";

  if (!prontas.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Edição">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-apagado uppercase">
        Edição {prontas.length > 1 ? `das ${prontas.length.toLocaleString("pt-BR")} fotos` : "da foto"}
        {ocupado ? <LoaderCircle className="size-3 animate-spin" aria-label={ocupado} /> : null}
      </h3>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className={botao}
          disabled={Boolean(ocupado)}
          title="Luz, contraste, branco e saturação sugeridos por foto"
          onClick={() =>
            void fazer(
              "Melhorando",
              async () =>
                emLotes(prontas, async (foto) => ({
                  midia_id: foto.midia_id,
                  edicao: comCor(foto.edicao, ajustesAutomaticos(await amostra(arquivoDaMidia(foto.midia_id, "capa.jpg")))),
                })),
              `Melhorando ${nomeDosAlvos}.`,
            )
          }
        >
          <Sparkles className="size-3.5" aria-hidden />
          Melhorar
        </button>
        <button
          type="button"
          className={botao}
          disabled={Boolean(ocupado)}
          title="Deixa o horizonte e as verticais retos"
          onClick={() => void fazer("Endireitando", emTodas((foto) => ({ ...edicaoParaEnviar(foto.edicao), auto: { ...(foto.edicao?.auto ?? {}), endireitar: true } })), `Endireitando ${nomeDosAlvos}.`)}
        >
          <Ruler className="size-3.5" aria-hidden />
          Endireitar
        </button>
      </div>

      <label className="flex items-center gap-1.5 text-xs">
        <Palette className="size-3.5 text-suave" aria-hidden />
        <select
          className="min-w-0 flex-1 rounded border border-borda bg-painel-2 px-1.5 py-1"
          value={cor.filtro ?? ""}
          disabled={Boolean(ocupado)}
          aria-label="Filtro"
          onChange={(evento) => {
            const filtro = evento.target.value || null;
            void fazer("Aplicando o filtro", emTodas((foto) => comCor(foto.edicao, { filtro, intensidade: foto.edicao?.cor?.intensidade ?? 1 })), filtro ? `Filtro em ${nomeDosAlvos}.` : "Filtro tirado.");
          }}
        >
          <option value="">Sem filtro</option>
          {FILTROS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
      </label>
      {luts?.length ? (
        <label className="flex items-center gap-1.5 text-xs">
          <span className="w-8 text-suave">LUT</span>
          <select
            className="min-w-0 flex-1 rounded border border-borda bg-painel-2 px-1.5 py-1"
            value={cor.lut?.id ?? ""}
            disabled={Boolean(ocupado)}
            aria-label="LUT"
            onChange={(evento) => {
              const id = evento.target.value;
              void fazer("Aplicando a LUT", emTodas((foto) => comCor(foto.edicao, { lut: id ? { id, intensidade: 1 } : null })), id ? `LUT em ${nomeDosAlvos}.` : "LUT tirada.");
            }}
          >
            <option value="">Nenhuma</option>
            {luts.map((lut) => (
              <option key={lut.id} value={lut.id}>
                {lut.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="flex flex-col gap-1">
        {AJUSTES_RAPIDOS.map((a) => {
          const valor = rapidos[a.campo] ?? (cor[a.campo] as number | undefined) ?? 0;
          const enviar = () => {
            const novo = rapidos[a.campo];
            if (novo === undefined) return;
            void fazer("Ajustando", emTodas((foto) => comCor(foto.edicao, { [a.campo]: novo })), `${a.nome} em ${nomeDosAlvos}.`).then(() =>
              setRapidos((r) => {
                const resto = { ...r };
                delete resto[a.campo];
                return resto;
              }),
            );
          };
          return (
            <label key={a.campo} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-1.5 text-xs">
              <span className="text-suave">{a.nome}</span>
              <input
                type="range"
                min={a.minimo}
                max={a.maximo}
                step={a.passo}
                value={valor}
                disabled={Boolean(ocupado)}
                onChange={(evento) => setRapidos((r) => ({ ...r, [a.campo]: Number(evento.target.value) }))}
                onPointerUp={enviar}
                onKeyUp={enviar}
                className="accent-[var(--to-destaque)]"
                aria-label={a.nome}
              />
              <span className="text-right tabular-nums text-suave">{valor > 0 ? "+" : ""}{valor.toFixed(2)}</span>
            </label>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <select className="min-w-0 flex-1 rounded border border-borda bg-painel-2 px-1.5 py-1 text-xs" value={proporcao} onChange={(evento) => setProporcao(evento.target.value as Proporcao)} aria-label="Proporção do corte">
          {PROPORCOES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={botao}
          disabled={Boolean(ocupado)}
          title="Recorta na proporção com os rostos no lugar"
          onClick={() => void fazer("Recortando", emTodas((foto) => ({ ...edicaoParaEnviar(foto.edicao), auto: { endireitar: foto.edicao?.auto?.endireitar, proporcao } })), `Recortando ${nomeDosAlvos} em ${proporcao}.`)}
        >
          <Crop className="size-3.5" aria-hidden />
          Cortar
        </button>
        <button
          type="button"
          className="botao-icone"
          disabled={Boolean(ocupado)}
          title="Tirar o corte e o giro"
          aria-label="Tirar o corte e o giro"
          onClick={() => void fazer("Tirando o corte", emTodas((foto) => ({ ...edicaoParaEnviar(foto.edicao), recorte: null, giro: 0, auto: null })), "Corte e giro tirados.")}
        >
          <RotateCcw className="size-3.5" aria-hidden />
        </button>
      </div>

      {referencia && outras.length ? (
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className={botao}
            disabled={Boolean(ocupado)}
            title={`A luz e a cor de ${referencia.nome} nas outras selecionadas`}
            onClick={() =>
              void fazer(
                "Igualando a cor",
                async () => {
                  const daReferencia = estatisticasDaCor(await amostra(arquivoDaMidia(referencia.midia_id, arquivoDaFoto(referencia, albumId, "capa"))));
                  if (!daReferencia) return [];
                  return emLotes(outras, async (foto) => {
                    const alvo = estatisticasDaCor(await amostra(arquivoDaMidia(foto.midia_id, "capa.jpg")));
                    const base = edicaoParaEnviar(foto.edicao);
                    delete base.cor;
                    return { midia_id: foto.midia_id, edicao: alvo ? { ...base, igualar: { alvo, referencia: daReferencia } } : null };
                  });
                },
                `A cor de ${outras.length} foto(s) igualada à de ${referencia.nome}.`,
              )
            }
          >
            Igualar a cor
          </button>
          <button
            type="button"
            className={botao}
            disabled={Boolean(ocupado) || !referencia.edicao}
            title={`A edição de ${referencia.nome} nas outras selecionadas`}
            onClick={() => void fazer("Copiando", async () => outras.map((foto) => ({ midia_id: foto.midia_id, edicao: edicaoParaEnviar(referencia.edicao) })), `Edição copiada para ${outras.length} foto(s).`)}
          >
            <Copy className="size-3.5" aria-hidden />
            Copiar edição
          </button>
        </div>
      ) : null}
      {referencia?.edicao && grupoDa(referencia).length > 1 ? (
        <button
          type="button"
          className={botao}
          disabled={Boolean(ocupado)}
          title="A edição desta foto nas parecidas do mesmo grupo"
          onClick={() =>
            void fazer(
              "Sincronizando",
              async () => grupoDa(referencia).filter((foto) => foto.midia_id !== referencia.midia_id).map((foto) => ({ midia_id: foto.midia_id, edicao: edicaoParaEnviar(referencia.edicao) })),
              "Edição sincronizada com o grupo.",
            )
          }
        >
          <Copy className="size-3.5" aria-hidden />
          Sincronizar com o grupo
        </button>
      ) : null}
      {prontas.some((foto) => foto.edicao) ? (
        <button type="button" className={`${botao} text-suave`} disabled={Boolean(ocupado)} onClick={() => void fazer("Tirando", emTodas(() => null), "Edição tirada.")}>
          <Undo2 className="size-3.5" aria-hidden />
          Tirar a edição
        </button>
      ) : null}
    </section>
  );
}
