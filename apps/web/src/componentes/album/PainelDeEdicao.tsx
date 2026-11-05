"use client";

import { Copy, Crop, LoaderCircle, Palette, RotateCcw, Ruler, Sparkles, Undo2 } from "lucide-react";
import { useState } from "react";

import { type EdicaoDaFoto, arquivoDaFoto, comCor, edicaoParaEnviar, type FundoDaFoto, PROPORCOES, type Proporcao } from "@/lib/album/edicao";
import type { FotoDoAlbum } from "@/lib/album/fotos";
import { arquivoDaMidia } from "@/lib/api";
import { type Cor, FILTROS } from "@/lib/projeto/cor";
import { estatisticasDaCor } from "@/lib/projeto/igualarCor";
import { ajustesAutomaticos } from "@/lib/projeto/melhorar";
import { useLuts } from "@/lib/useLuts";
import { consultasDe, DISTRACOES_PRONTAS } from "@/lib/album/distracoes";

import { amostra, emLotes } from "./amostras";

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
  const [corDoFundo, setCorDoFundo] = useState("#f2f2f2");
  const [comSombra, setComSombra] = useState(true);
  const fundoAtual = referencia?.edicao?.fundo ?? null;
  const [distracoes, setDistracoes] = useState<string[]>(["Lixeira", "Placa de saída", "Extintor", "Fios"]);
  const [outraDistracao, setOutraDistracao] = useState("");
  const [ruido, setRuido] = useState<number | null>(null);
  const achadas = referencia?.edicao?.distracoes?.achadas;
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

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="w-10 text-xs text-suave">Fundo</span>
          <select
            className="min-w-0 flex-1 rounded border border-borda bg-painel-2 px-1.5 py-1 text-xs"
            value={fundoAtual?.tipo ?? ""}
            disabled={Boolean(ocupado)}
            aria-label="Fundo"
            onChange={(evento) => {
              const tipo = evento.target.value as FundoDaFoto["tipo"] | "";
              const sombra = comSombra ? { opacidade: 0.35, desfoque: 0.04, distancia: 0.03, direcao: 135 } : null;
              const fundo: FundoDaFoto | null = !tipo
                ? null
                : tipo === "imagem"
                  ? { tipo, midia_id: referencia?.midia_id ?? null, sombra }
                  : tipo === "desfoque"
                    ? { tipo, desfoque: 0.6 }
                    : { tipo, cor: corDoFundo, sombra };
              const alvosDoFundo = tipo === "imagem" ? outras : prontas;
              void fazer(
                "Trocando o fundo",
                async () => alvosDoFundo.map((foto) => ({ midia_id: foto.midia_id, edicao: { ...edicaoParaEnviar(foto.edicao), fundo } })),
                fundo ? `Fundo novo em ${alvosDoFundo.length} foto(s).` : "Fundo original de volta.",
              );
            }}
          >
            <option value="">Original</option>
            <option value="cor">Cor lisa</option>
            <option value="degrade">Estúdio (degradê)</option>
            <option value="desfoque">Desfocado</option>
            {referencia && outras.length ? <option value="imagem">A foto do cursor</option> : null}
          </select>
          <input type="color" value={corDoFundo} onChange={(evento) => setCorDoFundo(evento.target.value)} className="h-7 w-8 rounded border border-borda bg-painel-2" aria-label="Cor do fundo" title="A cor do fundo (escolha antes do tipo)" />
        </div>
        <label className="flex items-center gap-2 text-xs text-suave">
          <input type="checkbox" checked={comSombra} onChange={(evento) => setComSombra(evento.target.checked)} />
          Sombra da pessoa no fundo novo
        </label>
      </div>

      <details>
        <summary className="cursor-pointer text-xs text-suave">Ruído e distrações</summary>
        <div className="mt-2 flex flex-col gap-2">
          <label className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-1.5 text-xs">
            <span className="text-suave">Tirar o ruído</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={ruido ?? referencia?.edicao?.ruido ?? 0}
              disabled={Boolean(ocupado)}
              onChange={(evento) => setRuido(Number(evento.target.value))}
              onPointerUp={() => {
                if (ruido === null) return;
                const valor = ruido;
                void fazer("Tirando o ruído", emTodas((foto) => ({ ...edicaoParaEnviar(foto.edicao), ruido: valor })), `Ruído tirado de ${nomeDosAlvos}.`).then(() => setRuido(null));
              }}
              className="accent-[var(--to-destaque)]"
              aria-label="Tirar o ruído"
            />
            <span className="text-right tabular-nums text-suave">{ruido ?? referencia?.edicao?.ruido ?? 0}</span>
          </label>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Distrações para apagar">
            {DISTRACOES_PRONTAS.map((d) => {
              const ligada = distracoes.includes(d.nome);
              return (
                <button
                  key={d.nome}
                  type="button"
                  aria-pressed={ligada}
                  onClick={() => setDistracoes((lista) => (ligada ? lista.filter((n) => n !== d.nome) : [...lista, d.nome]))}
                  className={`rounded-full px-2 py-0.5 text-[11px] ${ligada ? "bg-destaque text-white" : "bg-painel-2 text-suave hover:text-texto"}`}
                >
                  {d.nome}
                </button>
              );
            })}
          </div>
          <input
            value={outraDistracao}
            onChange={(evento) => setOutraDistracao(evento.target.value)}
            maxLength={120}
            placeholder="Outras, em inglês (ex.: ladder, backpack)"
            className="rounded border border-borda bg-painel-2 px-2 py-1 text-xs"
            aria-label="Outras distrações"
          />
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className={botao}
              disabled={Boolean(ocupado) || !consultasDe(distracoes, outraDistracao).length}
              title="Acha essas coisas longe da pessoa e refaz o fundo atrás delas"
              onClick={() => {
                const consultas = consultasDe(distracoes, outraDistracao);
                void fazer("Apagando as distrações", emTodas((foto) => ({ ...edicaoParaEnviar(foto.edicao), distracoes: { consultas } })), `Procurando distrações em ${nomeDosAlvos}.`);
              }}
            >
              Apagar distrações
            </button>
            <button
              type="button"
              className={botao}
              disabled={Boolean(ocupado) || !prontas.some((foto) => foto.edicao?.distracoes)}
              onClick={() => void fazer("Devolvendo", emTodas((foto) => ({ ...edicaoParaEnviar(foto.edicao), distracoes: null })), "Distrações de volta.")}
            >
              Devolver
            </button>
          </div>
          {achadas ? <p className="text-[11px] text-suave">{achadas.length ? `Nesta foto: ${achadas.map((a) => DISTRACOES_PRONTAS.find((d) => d.consulta === a.consulta)?.nome ?? a.consulta).join(", ")}.` : "Nesta foto, nenhuma distração achada."}</p> : null}
        </div>
      </details>

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
