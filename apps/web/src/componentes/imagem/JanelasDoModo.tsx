"use client";

// Imagem › Modo do editor de imagem (ADR 0003, onda 13.13): as janelas do Bitmap, do Duotone, das Cores indexadas
// (e a Tabela de cores) e do CMYK. O modo vale para a prévia e para os arquivos exportados (lib/imagem/modos.ts).
import { useState } from "react";

import type { PaletaDaExportacao, Pontilhado, Rgb } from "@/lib/exportacao/formatos/quantizar";
import { BITMAP_PADRAO, CMYK_PADRAO, CURVA_LINEAR, DUOTONES_PRONTOS, type FormaDoPonto, type GeracaoDoPreto, type ModoDeCor, type TintaDoDuotone } from "@/lib/imagem/modos";

import { Moldura } from "./JanelasDePixels";

const CAMPO = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";
const hex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const rgb = (cor: string): Rgb => [1, 3, 5].map((i) => parseInt(cor.slice(i, i + 2), 16)) as Rgb;

type Bitmap = Extract<ModoDeCor, { tipo: "bitmap" }>;

export function JanelaBitmap({ inicial, ppi, aoFechar, aoConfirmar }: { inicial: ModoDeCor | null | undefined; ppi: number; aoFechar: () => void; aoConfirmar: (modo: Bitmap) => void }) {
  const [modo, setModo] = useState<Bitmap>(inicial?.tipo === "bitmap" ? inicial : BITMAP_PADRAO);
  const mudar = (mudanca: Partial<Bitmap>) => setModo((atual) => ({ ...atual, ...mudanca }));
  return (
    <Moldura titulo="Bitmap" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(modo)}>
      <p className="text-suave">A imagem vira preto e branco puros (o transparente fica branco).</p>
      <label className="flex items-center gap-2">
        Método:
        <select className={`${CAMPO} flex-1`} value={modo.metodo} onChange={(e) => mudar({ metodo: e.currentTarget.value as Bitmap["metodo"] })} aria-label="Método do bitmap">
          <option value="limiar">Limiar de 50%</option>
          <option value="padrao">Pontilhado padrão</option>
          <option value="difusao">Pontilhado por difusão</option>
          <option value="meio_tom">Retícula de meio-tom</option>
        </select>
      </label>
      {modo.metodo === "limiar" ? (
        <label className="flex items-center gap-2">
          Limiar:
          <input type="range" className="flex-1" min={1} max={255} value={modo.limiar} onChange={(e) => mudar({ limiar: Number(e.currentTarget.value) })} aria-label="Limiar" />
          <span className="w-8 text-right tabular-nums">{modo.limiar}</span>
        </label>
      ) : null}
      {modo.metodo === "meio_tom" ? (
        <>
          <label className="flex items-center gap-2">
            Frequência:
            <input type="number" className={`${CAMPO} w-20`} min={1} max={600} value={modo.frequencia} onChange={(e) => mudar({ frequencia: Math.max(1, Math.min(600, Number(e.currentTarget.value) || 1)) })} aria-label="Frequência da retícula" />
            linhas por polegada ({(ppi / modo.frequencia).toFixed(1).replace(".", ",")} px por célula)
          </label>
          <label className="flex items-center gap-2">
            Ângulo:
            <input type="number" className={`${CAMPO} w-20`} min={-180} max={180} value={modo.angulo} onChange={(e) => mudar({ angulo: Math.max(-180, Math.min(180, Number(e.currentTarget.value) || 0)) })} aria-label="Ângulo da retícula" />
            graus
          </label>
          <label className="flex items-center gap-2">
            Forma:
            <select className={`${CAMPO} flex-1`} value={modo.forma} onChange={(e) => mudar({ forma: e.currentTarget.value as FormaDoPonto })} aria-label="Forma do ponto">
              <option value="redondo">Redondo</option>
              <option value="elipse">Elipse</option>
              <option value="linha">Linha</option>
              <option value="quadrado">Quadrado</option>
              <option value="losango">Losango</option>
              <option value="cruz">Cruz</option>
            </select>
          </label>
        </>
      ) : null}
    </Moldura>
  );
}

export function JanelaDuotone({ inicial, aoFechar, aoConfirmar }: { inicial: ModoDeCor | null | undefined; aoFechar: () => void; aoConfirmar: (modo: Extract<ModoDeCor, { tipo: "duotone" }>) => void }) {
  const [tintas, setTintas] = useState<TintaDoDuotone[]>(inicial?.tipo === "duotone" ? inicial.tintas : DUOTONES_PRONTOS[0].tintas);
  const mudarTinta = (indice: number, mudanca: Partial<TintaDoDuotone>) => setTintas((atual) => atual.map((tinta, i) => (i === indice ? { ...tinta, ...mudanca } : tinta)));
  return (
    <Moldura titulo="Duotone" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar({ tipo: "duotone", tintas })}>
      <label className="flex items-center gap-2">
        Predefinição:
        <select
          className={`${CAMPO} flex-1`}
          value=""
          onChange={(e) => {
            const pronto = DUOTONES_PRONTOS.find((item) => item.nome === e.currentTarget.value);
            if (pronto) setTintas(pronto.tintas);
          }}
          aria-label="Predefinição de duotone"
        >
          <option value="">Escolher…</option>
          {DUOTONES_PRONTOS.map((item) => (
            <option key={item.nome} value={item.nome}>
              {item.nome}
            </option>
          ))}
        </select>
      </label>
      <p className="text-suave">Cada tinta tem a cor e a quantidade dela em 0, 25, 50, 75 e 100% do cinza.</p>
      {tintas.map((tinta, indice) => (
        <div key={indice} className="flex items-center gap-1.5">
          <input type="color" className="h-6 w-8 shrink-0 rounded border border-borda bg-transparent" value={tinta.cor} onChange={(e) => mudarTinta(indice, { cor: e.currentTarget.value })} aria-label={`Cor da tinta ${indice + 1}`} />
          <input className={`${CAMPO} w-16`} value={tinta.nome} maxLength={40} onChange={(e) => mudarTinta(indice, { nome: e.currentTarget.value })} aria-label={`Nome da tinta ${indice + 1}`} />
          {tinta.curva.map((valor, i) => (
            <input
              key={i}
              type="number"
              className={`${CAMPO} w-11 tabular-nums`}
              min={0}
              max={100}
              value={Math.round(valor)}
              aria-label={`Tinta ${indice + 1} em ${i * 25}%`}
              onChange={(e) => mudarTinta(indice, { curva: tinta.curva.map((v, j) => (j === i ? Math.max(0, Math.min(100, Number(e.currentTarget.value) || 0)) : v)) })}
            />
          ))}
          {tintas.length > 1 ? (
            <button type="button" className="botao-icone size-5 text-suave" onClick={() => setTintas(tintas.filter((_, i) => i !== indice))} aria-label={`Tirar a tinta ${indice + 1}`}>
              ×
            </button>
          ) : null}
        </div>
      ))}
      {tintas.length < 4 ? (
        <button type="button" className="botao-secundario self-start px-2 py-0.5 text-xs" onClick={() => setTintas([...tintas, { nome: `Tinta ${tintas.length + 1}`, cor: "#808080", curva: [...CURVA_LINEAR] }])}>
          + Tinta ({["Monotom", "Duotom", "Tritom", "Quadritom"][tintas.length]} → {["Duotom", "Tritom", "Quadritom", ""][tintas.length]})
        </button>
      ) : null}
    </Moldura>
  );
}

type Indexadas = Extract<ModoDeCor, { tipo: "indexadas" }>;

/** Cores indexadas: a paleta sai da imagem como está agora (ou é uma das fixas) e fica guardada no documento. */
export function JanelaCoresIndexadas({
  inicial,
  aoFechar,
  aoConfirmar,
}: {
  inicial: ModoDeCor | null | undefined;
  aoFechar: () => void;
  aoConfirmar: (opcoes: { paleta: PaletaDaExportacao; cores: number; pontilhado: Pontilhado; quantidade: number; transparencia: boolean }) => void;
}) {
  const antes = inicial?.tipo === "indexadas" ? inicial : null;
  const [paleta, setPaleta] = useState<PaletaDaExportacao>("adaptavel");
  const [cores, setCores] = useState(antes?.paleta.length ?? 256);
  const [pontilhado, setPontilhado] = useState<Pontilhado>(antes?.pontilhado ?? "difusao");
  const [quantidade, setQuantidade] = useState(antes?.quantidade ?? 1);
  const [transparencia, setTransparencia] = useState(antes?.transparencia ?? true);
  return (
    <Moldura titulo="Cores indexadas" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar({ paleta, cores, pontilhado, quantidade, transparencia })}>
      <label className="flex items-center gap-2">
        Paleta:
        <select className={`${CAMPO} flex-1`} value={paleta} onChange={(e) => setPaleta(e.currentTarget.value as PaletaDaExportacao)} aria-label="Paleta">
          <option value="adaptavel">Local (adaptável)</option>
          <option value="perceptual">Local (perceptual)</option>
          <option value="web">Web (216 cores)</option>
          <option value="cinza">Tons de cinza</option>
          <option value="preto_branco">Preto e branco</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        Cores:
        <input type="number" className={`${CAMPO} w-20`} min={2} max={256} value={cores} disabled={paleta === "web" || paleta === "preto_branco"} onChange={(e) => setCores(Math.max(2, Math.min(256, Number(e.currentTarget.value) || 2)))} aria-label="Quantidade de cores" />
      </label>
      <label className="flex items-center gap-2">
        Pontilhado:
        <select className={`${CAMPO} flex-1`} value={pontilhado} onChange={(e) => setPontilhado(e.currentTarget.value as Pontilhado)} aria-label="Pontilhado">
          <option value="nenhum">Nenhum</option>
          <option value="difusao">Difusão</option>
          <option value="padrao">Padrão</option>
          <option value="ruido">Ruído</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        Quantidade:
        <input type="range" className="flex-1" min={0} max={1} step={0.01} value={quantidade} disabled={pontilhado === "nenhum"} onChange={(e) => setQuantidade(Number(e.currentTarget.value))} aria-label="Quantidade do pontilhado" />
        <span className="w-9 text-right tabular-nums">{Math.round(quantidade * 100)}%</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={transparencia} onChange={(e) => setTransparencia(e.currentTarget.checked)} />
        Transparência (um índice da paleta)
      </label>
      <p className="text-suave">A paleta sai da imagem como está agora e fica no documento; a Tabela de cores muda cada cor.</p>
    </Moldura>
  );
}

export function JanelaTabelaDeCores({ modo, aoFechar, aoConfirmar }: { modo: Indexadas; aoFechar: () => void; aoConfirmar: (paleta: Rgb[]) => void }) {
  const [paleta, setPaleta] = useState<Rgb[]>(modo.paleta);
  return (
    <Moldura titulo="Tabela de cores" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(paleta)}>
      <p className="text-suave">{paleta.length} cores. Clique numa cor para trocá-la.</p>
      <div className="grid grid-cols-16 gap-px" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
        {paleta.map((cor, indice) => (
          <label key={indice} className="relative aspect-square cursor-pointer border border-borda/60" style={{ background: hex(cor) }} title={`${indice}: ${hex(cor)}`}>
            <input
              type="color"
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              value={hex(cor)}
              aria-label={`Cor ${indice}`}
              onChange={(e) => {
                const nova = rgb(e.currentTarget.value);
                setPaleta((atual) => atual.map((item, i) => (i === indice ? nova : item)));
              }}
            />
          </label>
        ))}
      </div>
    </Moldura>
  );
}

export function JanelaCmyk({ inicial, aoFechar, aoConfirmar }: { inicial: ModoDeCor | null | undefined; aoFechar: () => void; aoConfirmar: (modo: Extract<ModoDeCor, { tipo: "cmyk" }>) => void }) {
  const [modo, setModo] = useState(inicial?.tipo === "cmyk" ? inicial : CMYK_PADRAO);
  return (
    <Moldura titulo="Cor CMYK" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(modo)}>
      <p className="text-suave">A tela mostra a prova da impressão; o TIFF e o PDF saem em CMYK. É uma aproximação, sem perfil de cor da gráfica.</p>
      <label className="flex items-center gap-2">
        Geração de preto:
        <select className={`${CAMPO} flex-1`} value={modo.preto} onChange={(e) => setModo({ ...modo, preto: e.currentTarget.value as GeracaoDoPreto })} aria-label="Geração de preto">
          <option value="nenhuma">Nenhuma</option>
          <option value="leve">Leve</option>
          <option value="media">Média</option>
          <option value="pesada">Pesada</option>
          <option value="maxima">Máxima</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        Limite de tinta:
        <input type="number" className={`${CAMPO} w-20`} min={100} max={400} value={modo.limite} onChange={(e) => setModo({ ...modo, limite: Math.max(100, Math.min(400, Number(e.currentTarget.value) || 300)) })} aria-label="Limite de tinta" />
        %
      </label>
    </Moldura>
  );
}
