"use client";

import { ChevronRight, FileUp, LoaderCircle, RotateCcw, Trash2, WandSparkles } from "lucide-react";
import { useRef, useState } from "react";

import { arquivoDaMidia, chamarApi, ErroApi } from "@/lib/api";
import { amostraDaImagem } from "@/lib/previa/amostra";
import type { Comando } from "@/lib/projeto/comandos";
import {
  AJUSTES_NEUTROS,
  type AjusteDaFaixa,
  type AjustesCor,
  type Cor,
  COR_PADRAO,
  CURVAS_NEUTRAS,
  curvasNeutras,
  FAIXAS_DE_MATIZ,
  type FaixaDeMatiz,
  FILTROS,
  hslNeutro,
  LIMITES_COR,
  RODAS,
} from "@/lib/projeto/cor";
import { INTENSIDADE_MAXIMA } from "@/lib/projeto/edicao";
import { ajustesAutomaticos } from "@/lib/projeto/melhorar";
import { corDoClipeEmPixels, cubeParaIgualar, estatisticasDaCor } from "@/lib/projeto/igualarCor";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";
import { useLuts } from "@/lib/useLuts";

import { ControleNumerico } from "./ControleNumerico";
import { EditorDeCurva } from "./EditorDeCurva";
import { usePedirImagemEstavel } from "./Estabilizar";

/**
 * Melhorar: luz, contraste e balanço de branco escolhidos pela imagem (lib/projeto/melhorar.ts), nos controles de
 * sempre. Lê a cópia leve da foto ou a capa do vídeo; o filtro, as curvas e as rodas ficam como estão.
 */
function Melhorar({ midia, travada, aoAplicar }: { midia: Midia; travada: boolean; aoAplicar: (ajustes: Partial<Cor>) => void }) {
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");
  function melhorar() {
    setLendo(true);
    setErro("");
    amostraDaImagem(amostraDaMidia(midia))
      .then((pixels) => aoAplicar(ajustesAutomaticos(pixels)))
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível ler a imagem."))
      .finally(() => setLendo(false));
  }
  return (
    <div className="mt-2">
      <button type="button" className="botao-secundario w-full px-3 py-1.5 text-xs" disabled={travada || lendo} onClick={melhorar} title="Acerta a luz, o contraste e a cor pela imagem">
        {lendo ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <WandSparkles className="size-3.5" aria-hidden />}
        Melhorar
      </button>
      {erro ? <p className="mt-1 text-[11px] text-erro">{erro}</p> : null}
    </div>
  );
}

/**
 * LUT importada (.cube): escolher uma do espaço ou enviar outra, e a intensidade. Ela entra antes dos ajustes,
 * na mesma LUT 3D da prévia e do render.
 */
function LutDoClipe({
  cor,
  travada,
  estado,
  aoPrever,
  aoExecutar,
  aoMudar,
}: {
  cor: Cor;
  travada: boolean;
  estado: ReturnType<typeof useLuts>;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
  aoMudar: (mudanca: Partial<Cor>) => Comando;
}) {
  const { luts, erro, importar, excluir } = estado;
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const arquivo = useRef<HTMLInputElement>(null);
  const atual = cor.lut ?? null;
  const conhecida = atual && luts ? luts.some((lut) => lut.id === atual.id) : true;

  function enviar(lista: FileList | null) {
    const escolhido = lista?.[0];
    if (!escolhido) return;
    setEnviando(true);
    setAviso("");
    importar(escolhido)
      .then((nova) => aoExecutar(aoMudar({ lut: { id: nova.id, intensidade: atual?.intensidade ?? 1 } })))
      .catch((e) => setAviso(e instanceof ErroApi ? e.message : "Não foi possível importar a LUT."))
      .finally(() => {
        setEnviando(false);
        if (arquivo.current) arquivo.current.value = "";
      });
  }

  return (
    <section className="border-b border-borda/60 pb-2 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">LUT</h3>
      <div className="mt-1 flex items-center gap-1">
        <select
          value={atual?.id ?? ""}
          disabled={travada}
          aria-label="LUT"
          onChange={(evento) => {
            const id = evento.currentTarget.value;
            aoExecutar(aoMudar({ lut: id ? { id, intensidade: atual?.intensidade ?? 1 } : null }));
          }}
          className="min-w-0 flex-1 rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs outline-none focus:border-destaque"
        >
          <option value="">Nenhuma</option>
          {atual && !conhecida ? <option value={atual.id}>(excluída)</option> : null}
          {(luts ?? []).map((lut) => (
            <option key={lut.id} value={lut.id}>
              {lut.nome}
            </option>
          ))}
        </select>
        <button type="button" className="botao-icone size-7" disabled={travada || enviando} onClick={() => arquivo.current?.click()} aria-label="Importar uma LUT (.cube)" title="Importar uma LUT (.cube)">
          {enviando ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <FileUp className="size-3.5" aria-hidden />}
        </button>
        {atual && conhecida ? (
          <button
            type="button"
            className="botao-icone size-7"
            disabled={travada}
            onClick={() => {
              setAviso("");
              excluir(atual.id).catch((e) => setAviso(e instanceof ErroApi ? e.message : "Não foi possível excluir a LUT."));
            }}
            aria-label="Excluir a LUT do espaço"
            title="Excluir a LUT do espaço"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        ) : null}
        <input ref={arquivo} type="file" accept=".cube" className="hidden" onChange={(evento) => enviar(evento.currentTarget.files)} />
      </div>
      {atual ? (
        <ControleNumerico
          rotulo="Intensidade"
          valor={atual.intensidade * 100}
          minimo={0}
          maximo={100}
          sufixo="%"
          desativado={travada}
          aoPrever={(valor) => aoPrever(aoMudar({ lut: { ...atual, intensidade: valor / 100 } }))}
          aoConfirmar={(valor) => {
            if (Math.abs(valor / 100 - atual.intensidade) < PERTO) aoPrever(null);
            else aoExecutar(aoMudar({ lut: { ...atual, intensidade: valor / 100 } }));
          }}
        />
      ) : (
        <p className="mt-1 text-[11px] text-suave">Um arquivo .cube 3D, de câmera ou de cor pronta. Ela entra antes dos ajustes.</p>
      )}
      {atual && !conhecida ? <p className="mt-1 text-[11px] text-erro">A LUT deste clipe foi excluída. Escolha outra ou tire a LUT para exportar.</p> : null}
      {aviso || erro ? <p className="mt-1 text-[11px] text-erro">{aviso || erro}</p> : null}
    </section>
  );
}

/** A imagem que representa a mídia nas contas da imagem inteira: a cópia leve da foto ou a capa do vídeo. */
const amostraDaMidia = (midia: Midia) => arquivoDaMidia(midia.id, midia.imagem ? "proxy.webp" : "capa.jpg");

/**
 * Igualar a cor a outro clipe: a luz e a cor da capa deste vão para as da referência (já com a cor dela). O resultado
 * é uma LUT do espaço, posta no lugar da cor deste clipe (os ajustes voltam ao original, para não somar duas vezes).
 */
function IgualarCor({
  clipe,
  midia,
  faixas,
  midias,
  travada,
  importar,
  aoExecutar,
}: {
  clipe: Clipe;
  midia: Midia;
  faixas: Faixa[];
  midias: ReadonlyMap<string, Midia>;
  travada: boolean;
  importar: ReturnType<typeof useLuts>["importar"];
  aoExecutar: (comando: Comando) => void;
}) {
  const opcoes = faixas
    .filter((faixa) => faixa.tipo !== "audio")
    .flatMap((faixa) => faixa.clipes)
    .filter((outro) => outro.id !== clipe.id && outro.midia_id && !outro.ajuste)
    .map((outro) => ({ clipe: outro, midia: midias.get(outro.midia_id!) }))
    .filter((opcao): opcao is { clipe: Clipe; midia: Midia } => Boolean(opcao.midia?.video && opcao.midia.status === "pronta" && !opcao.midia.elemento && !opcao.midia.animacao));
  const [referenciaId, setReferenciaId] = useState("");
  const [lendo, setLendo] = useState(false);
  const [aviso, setAviso] = useState("");
  const referencia = opcoes.find((opcao) => opcao.clipe.id === referenciaId) ?? null;
  if (!opcoes.length) return null;

  function igualar() {
    if (!referencia) return;
    setLendo(true);
    setAviso("");
    Promise.all([amostraDaImagem(amostraDaMidia(midia)), amostraDaImagem(amostraDaMidia(referencia.midia))])
      .then(([doClipe, daReferencia]) => {
        const alvo = estatisticasDaCor(doClipe);
        const destino = estatisticasDaCor(daReferencia, corDoClipeEmPixels(referencia.clipe.cor) ?? undefined);
        if (!alvo || !destino) throw new Error("As imagens não têm pixels para medir.");
        const nome = `Igualar a ${referencia.midia.nome}`.slice(0, 110);
        return importar(new File([cubeParaIgualar(alvo, destino, nome)], `${nome}.cube`, { type: "text/plain" }));
      })
      .then((lut) => aoExecutar({ comando: "clipe.cor", parametros: { clipeIds: [clipe.id], cor: { ...COR_PADRAO, lut: { id: lut.id, intensidade: 1 } } } }))
      .catch((e: unknown) => setAviso(e instanceof Error ? e.message : "Não foi possível igualar a cor."))
      .finally(() => setLendo(false));
  }

  return (
    <section className="border-b border-borda/60 pb-2 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Igualar a cor</h3>
      <div className="mt-1 flex items-center gap-1">
        <select
          value={referenciaId}
          disabled={travada || lendo}
          aria-label="Clipe de referência"
          onChange={(evento) => setReferenciaId(evento.currentTarget.value)}
          className="min-w-0 flex-1 rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs outline-none focus:border-destaque"
        >
          <option value="">Escolha um clipe</option>
          {opcoes.map((opcao) => (
            <option key={opcao.clipe.id} value={opcao.clipe.id}>
              {opcao.midia.nome}
            </option>
          ))}
        </select>
        <button type="button" className="botao-secundario px-3 py-1.5 text-xs" disabled={travada || lendo || !referencia} onClick={igualar}>
          {lendo ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
          Igualar
        </button>
      </div>
      <p className="mt-1 text-[11px] text-suave">A luz e a cor deste clipe passam a ser as do outro (pela capa de cada um). Vira uma LUT, que dá para suavizar na intensidade.</p>
      {aviso ? <p className="mt-1 text-[11px] text-erro">{aviso}</p> : null}
    </section>
  );
}

/** Tirar o ruído (o granulado) da imagem: o worker gera a versão limpa e a prévia e o render usam ela. */
function TirarRuido({ clipe, midia, travada, aoExecutar }: { clipe: Clipe; midia: Midia; travada: boolean; aoExecutar: (comando: Comando) => void }) {
  const [erroDoPedido, setErroDoPedido] = useState("");
  const limpa = midia.imagem_limpa;
  // Ligar o ruído num clipe estabilizado pede a versão estável sobre a imagem sem ruído
  usePedirImagemEstavel(clipe, midia);
  function mudar(ligar: boolean) {
    aoExecutar({ comando: "clipe.limparImagem", parametros: { clipeIds: [clipe.id], ligar } });
    if (!ligar || limpa?.status === "pronta" || limpa?.status === "processando") return;
    setErroDoPedido("");
    chamarApi(`/midias/${midia.id}/limpeza-imagem`, { metodo: "POST" }).catch((erro: unknown) =>
      setErroDoPedido(erro instanceof Error ? erro.message : "Não foi possível pedir a limpeza agora."),
    );
  }
  return (
    <section className="pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Ruído</h3>
      <label className="mt-1 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={Boolean(clipe.imagem_limpa)} disabled={travada} onChange={(evento) => mudar(evento.currentTarget.checked)} />
        <span className="flex-1">Tirar o ruído da imagem (o granulado de pouca luz)</span>
      </label>
      {clipe.imagem_limpa ? (
        <p className="mt-1 text-[11px] text-suave" role="status">
          {limpa?.status === "pronta"
            ? "Pronta. A prévia e o vídeo exportado usam a imagem sem ruído."
            : limpa?.status === "erro" || erroDoPedido
              ? `A limpeza falhou: ${erroDoPedido || limpa?.erro}`
              : `Tirando o ruído${limpa?.progresso ? ` · ${limpa.progresso}%` : ""}. Até terminar, a prévia mostra a imagem original.`}
        </p>
      ) : null}
    </section>
  );
}
import { RodaDeCor } from "./RodaDeCor";

type Props = {
  clipe: Clipe;
  faixa: Faixa;
  /** A mídia do clipe: a limpeza do ruído é dela. */
  midia: Midia | null;
  /** As faixas e as mídias do projeto: o "Igualar a cor" escolhe a referência entre os outros clipes. */
  faixas?: Faixa[];
  midias?: ReadonlyMap<string, Midia>;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
};

// As seções do painel de cor dos editores profissionais, na ordem de lá (ADR 0002)
type Grupo = "balanco" | "tom" | "basica" | "criativo" | "niveis" | "vinheta";

const AJUSTES: { chave: keyof AjustesCor; nome: string; grupo: Grupo }[] = [
  { chave: "temperatura", nome: "Temperatura", grupo: "balanco" },
  { chave: "tom", nome: "Matiz", grupo: "balanco" },
  { chave: "exposicao", nome: "Exposição", grupo: "tom" },
  { chave: "contraste", nome: "Contraste", grupo: "tom" },
  { chave: "realces", nome: "Realces", grupo: "tom" },
  { chave: "sombras", nome: "Sombras", grupo: "tom" },
  { chave: "brancos", nome: "Brancos", grupo: "tom" },
  { chave: "pretos", nome: "Pretos", grupo: "tom" },
  { chave: "saturacao", nome: "Saturação", grupo: "basica" },
  { chave: "nevoa", nome: "Tirar a névoa", grupo: "criativo" },
  { chave: "vibracao", nome: "Vibração", grupo: "criativo" },
  { chave: "niveis_preto", nome: "Preto de entrada", grupo: "niveis" },
  { chave: "niveis_branco", nome: "Branco de entrada", grupo: "niveis" },
  { chave: "niveis_gama", nome: "Meio-tom (gama)", grupo: "niveis" },
  { chave: "vinheta", nome: "Quantidade", grupo: "vinheta" },
];
/** Os nomes das rodas no painel de cor dos editores profissionais. */
const NOMES_DAS_RODAS: Record<(typeof RODAS)[number]["id"], string> = { escuros: "Sombras", medios: "Meios-tons", claros: "Realces" };
type IdSecao = "basica" | "criativo" | "curvas" | "rodas" | "hsl" | "vinheta" | "ruido";

/** Uma seção do painel de cor: a faixa com o nome abre e fecha, como lá. */
function SecaoDobravel({ id, titulo, abertas, aoAlternar, children }: { id: IdSecao; titulo: string; abertas: IdSecao[]; aoAlternar: (id: IdSecao) => void; children: React.ReactNode }) {
  const aberta = abertas.includes(id);
  return (
    <section className="border-b border-borda">
      <button type="button" aria-expanded={aberta} onClick={() => aoAlternar(id)} className="flex w-full items-center gap-1.5 bg-painel-2/60 px-2 py-1.5 text-left text-xs font-semibold hover:bg-painel-2">
        <ChevronRight className={`size-3.5 text-suave transition ${aberta ? "rotate-90" : ""}`} aria-hidden />
        {titulo}
      </button>
      {aberta ? <div className="px-3 pb-3 pt-1">{children}</div> : null}
    </section>
  );
}

const PERTO = 1e-6;

const FAIXA_NEUTRA: AjusteDaFaixa = { matiz: 0, saturacao: 0, luminancia: 0 };

/** Cor por matiz: escolhe a faixa (vermelho, laranja...) e mexe no matiz, na saturação e na luminância dela. */
function CorPorMatiz({ cor, travada, aoPrever, aoExecutar }: { cor: Cor; travada: boolean; aoPrever: (hsl: Cor["hsl"] | null) => void; aoExecutar: (hsl: Cor["hsl"]) => void }) {
  const [faixa, setFaixa] = useState<FaixaDeMatiz>("vermelho");
  const atual = { ...FAIXA_NEUTRA, ...cor.hsl?.[faixa] };
  const comFaixa = (mudanca: Partial<AjusteDaFaixa>) => ({ ...cor.hsl, [faixa]: { ...atual, ...mudanca } });
  const controle = (campo: keyof AjusteDaFaixa) => ({
    valor: atual[campo] * 100,
    minimo: -100,
    maximo: 100,
    sufixo: "",
    desativado: travada,
    aoPrever: (valor: number) => aoPrever(comFaixa({ [campo]: valor / 100 })),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor / 100 - atual[campo]) < PERTO) aoPrever(null);
      else aoExecutar(comFaixa({ [campo]: valor / 100 }));
    },
  });
  const mexida = (id: FaixaDeMatiz) => Object.values({ ...FAIXA_NEUTRA, ...cor.hsl?.[id] }).some((v) => Math.abs(v) > PERTO);
  return (
    <section className="border-b border-borda/60 pb-3 pt-3">
      <div className="flex min-h-6 items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Cor por matiz</h3>
        <button type="button" className="botao-icone size-6" disabled={travada || hslNeutro(cor.hsl)} onClick={() => aoExecutar(null)} aria-label="Voltar as cores por matiz" title="Voltar as cores por matiz">
          <RotateCcw className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Faixa de cor">
        {FAIXAS_DE_MATIZ.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={faixa === item.id}
            aria-label={item.nome}
            title={item.nome}
            onClick={() => setFaixa(item.id)}
            className={`relative size-6 rounded-full border-2 transition ${faixa === item.id ? "border-texto" : "border-transparent"}`}
            style={{ backgroundColor: item.amostra }}
          >
            {mexida(item.id) ? <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border border-painel bg-texto" aria-hidden /> : null}
          </button>
        ))}
      </div>
      <ControleNumerico rotulo="Matiz" {...controle("matiz")} />
      <ControleNumerico rotulo="Saturação" {...controle("saturacao")} />
      <ControleNumerico rotulo="Luminância" {...controle("luminancia")} />
    </section>
  );
}

/** Filtro pronto e ajustes de luz e cor do clipe. */
export function AbaCor({ clipe, faixa, midia, faixas, midias, aoPrever, aoExecutar }: Props) {
  const estadoDasLuts = useLuts();
  const [abertas, setAbertas] = useState<IdSecao[]>(["basica"]);
  const alternar = (id: IdSecao) => setAbertas((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]));
  const cor: Cor = { ...COR_PADRAO, ...clipe.cor };
  const travada = faixa.travada;
  const comando = (mudanca: Partial<Cor>): Comando => ({ comando: "clipe.cor", parametros: { clipeIds: [clipe.id], cor: mudanca } });
  /** Os ajustes aparecem de -100 a 100 (a exposição, em pontos de luz, de -2 a 2). */
  const fator = (chave: keyof AjustesCor) => (chave === "exposicao" ? 1 : 100);
  const mudou =
    (Object.keys(AJUSTES_NEUTROS) as (keyof AjustesCor)[]).some((chave) => Math.abs(cor[chave]) > PERTO) ||
    cor.filtro !== null ||
    !curvasNeutras(cor.curvas) ||
    !hslNeutro(cor.hsl) ||
    Boolean(cor.lut);

  const controle = (chave: keyof AjustesCor) => ({
    valor: cor[chave] * fator(chave),
    minimo: LIMITES_COR[chave].minimo * fator(chave),
    maximo: LIMITES_COR[chave].maximo * fator(chave),
    passo: chave === "exposicao" ? 0.05 : 1,
    sufixo: chave === "exposicao" ? "EV" : "",
    desativado: travada,
    aoPrever: (valor: number) => aoPrever(comando({ [chave]: valor / fator(chave) })),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor / fator(chave) - cor[chave]) < PERTO) aoPrever(null);
      else aoExecutar(comando({ [chave]: valor / fator(chave) }));
    },
  });

  const ajustes = (grupo: Grupo, titulo?: string) => (
    <div className="pt-2">
      {titulo ? <h4 className="text-[11px] font-semibold text-suave">{titulo}</h4> : null}
      {AJUSTES.filter((ajuste) => ajuste.grupo === grupo).map((ajuste) => (
        <ControleNumerico key={ajuste.chave} rotulo={ajuste.nome} {...controle(ajuste.chave)} />
      ))}
    </div>
  );
  const ehMidia = Boolean(midia?.video && !midia.elemento && !midia.animacao);

  return (
    <div className="-mx-3 -mt-3">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        {travada ? <p className="text-xs text-suave">A faixa está travada. Destrave o cadeado para editar.</p> : <span />}
        <button type="button" className="botao-icone size-6" disabled={travada || !mudou} onClick={() => aoExecutar(comando(COR_PADRAO))} aria-label="Redefinir a cor" title="Redefinir: volta à cor original">
          <RotateCcw className="size-3.5" aria-hidden />
        </button>
      </div>
      <SecaoDobravel id="basica" titulo="Correção básica" abertas={abertas} aoAlternar={alternar}>
        <LutDoClipe cor={cor} travada={travada} estado={estadoDasLuts} aoPrever={aoPrever} aoExecutar={aoExecutar} aoMudar={comando} />
        {ehMidia && midia ? <Melhorar midia={midia} travada={travada} aoAplicar={(mudanca) => aoExecutar(comando(mudanca))} /> : null}
        {ajustes("balanco", "Balanço de branco")}
        {ajustes("tom", "Tom")}
        {ajustes("basica")}
      </SecaoDobravel>
      <SecaoDobravel id="criativo" titulo="Criativo" abertas={abertas} aoAlternar={alternar}>
        <h4 className="pt-2 text-[11px] font-semibold text-suave">Aparência</h4>
        <select
          value={cor.filtro ?? ""}
          disabled={travada}
          aria-label="Filtro"
          onChange={(evento) => aoExecutar(comando({ filtro: evento.currentTarget.value || null }))}
          className="mt-1 w-full rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs outline-none focus:border-destaque"
        >
          <option value="">Nenhum</option>
          {FILTROS.map((filtro) => (
            <option key={filtro.id} value={filtro.id}>
              {filtro.nome}
            </option>
          ))}
        </select>
        {cor.filtro ? (
          <ControleNumerico
            rotulo="Intensidade"
            valor={cor.intensidade * 100}
            minimo={0}
            maximo={INTENSIDADE_MAXIMA * 100}
            sufixo="%"
            desativado={travada}
            aoPrever={(valor) => aoPrever(comando({ intensidade: valor / 100 }))}
            aoConfirmar={(valor) => {
              if (Math.abs(valor / 100 - cor.intensidade) < PERTO) aoPrever(null);
              else aoExecutar(comando({ intensidade: valor / 100 }));
            }}
          />
        ) : null}
        {ajustes("criativo", "Ajustes")}
      </SecaoDobravel>
      <SecaoDobravel id="curvas" titulo="Curvas" abertas={abertas} aoAlternar={alternar}>
        <EditorDeCurva
          curvas={{ ...CURVAS_NEUTRAS, ...cor.curvas }}
          desativado={travada}
          aoPrever={(curvas) => aoPrever(curvas ? comando({ curvas }) : null)}
          aoConfirmar={(curvas) => aoExecutar(comando({ curvas }))}
        />
        {ajustes("niveis", "Níveis")}
      </SecaoDobravel>
      <SecaoDobravel id="rodas" titulo="Rodas de cor e correspondência" abertas={abertas} aoAlternar={alternar}>
        {ehMidia && midia && faixas && midias ? (
          <IgualarCor clipe={clipe} midia={midia} faixas={faixas} midias={midias} travada={travada} importar={estadoDasLuts.importar} aoExecutar={aoExecutar} />
        ) : null}
        <div className="mt-2 grid grid-cols-3 gap-1">
          {RODAS.map((roda) => (
            <RodaDeCor
              key={roda.id}
              nome={NOMES_DAS_RODAS[roda.id]}
              matiz={cor[roda.matiz]}
              forca={cor[roda.forca]}
              desativado={travada}
              aoPrever={(matiz, forca) => aoPrever(comando({ [roda.matiz]: matiz, [roda.forca]: forca }))}
              aoConfirmar={(matiz, forca) => {
                if (Math.abs(matiz - cor[roda.matiz]) < PERTO && Math.abs(forca - cor[roda.forca]) < PERTO) aoPrever(null);
                else aoExecutar(comando({ [roda.matiz]: matiz, [roda.forca]: forca }));
              }}
            />
          ))}
        </div>
      </SecaoDobravel>
      <SecaoDobravel id="hsl" titulo="HSL secundário" abertas={abertas} aoAlternar={alternar}>
        <CorPorMatiz cor={cor} travada={travada} aoPrever={(hsl) => aoPrever(hsl ? comando({ hsl }) : null)} aoExecutar={(hsl) => aoExecutar(comando({ hsl }))} />
      </SecaoDobravel>
      <SecaoDobravel id="vinheta" titulo="Vinheta" abertas={abertas} aoAlternar={alternar}>
        {ajustes("vinheta")}
      </SecaoDobravel>
      {!clipe.texto && midia?.video && !midia.imagem ? (
        <SecaoDobravel id="ruido" titulo="Redução de ruído" abertas={abertas} aoAlternar={alternar}>
          <TirarRuido clipe={clipe} midia={midia} travada={travada} aoExecutar={aoExecutar} />
        </SecaoDobravel>
      ) : null}
    </div>
  );
}
