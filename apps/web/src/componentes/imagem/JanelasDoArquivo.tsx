"use client";

// Arquivo › Informações do arquivo, Imagem › Duplicar e Arquivo › Imprimir do editor de imagem (ADR 0003, onda 13.13).
import { useState } from "react";

import { INFORMACOES_VAZIAS, type InformacoesDoArquivo } from "@/lib/exportacao/metadados";
import { type OpcoesDaImpressao, OPCOES_PADRAO_DA_IMPRESSAO } from "@/lib/exportacao/imprimir";

import { Moldura } from "./JanelasDePixels";

const CAMPO = "rounded border border-borda bg-painel-2 px-1.5 py-1 text-xs text-texto";

/** As informações que vão nos metadados e, embaixo, o que o documento é (tamanho, resolução, camadas). */
export function JanelaInformacoesDoArquivo({
  inicial,
  resumo,
  aoFechar,
  aoConfirmar,
}: {
  inicial: InformacoesDoArquivo | null | undefined;
  resumo: { rotulo: string; valor: string }[];
  aoFechar: () => void;
  aoConfirmar: (informacoes: InformacoesDoArquivo) => void;
}) {
  const [info, setInfo] = useState<InformacoesDoArquivo>({ ...INFORMACOES_VAZIAS, ...inicial });
  const [palavras, setPalavras] = useState((inicial?.palavras_chave ?? []).join(", "));
  const mudar = (mudanca: Partial<InformacoesDoArquivo>) => setInfo((atual) => ({ ...atual, ...mudanca }));
  const confirmar = () =>
    aoConfirmar({
      ...info,
      palavras_chave: [...new Set(palavras.split(/[,;]/).map((p) => p.trim().slice(0, 60)).filter(Boolean))].slice(0, 50),
    });
  return (
    <Moldura titulo="Informações do arquivo" aoFechar={aoFechar} aoConfirmar={confirmar}>
      <label className="flex flex-col gap-1">
        Título
        <input className={CAMPO} value={info.titulo} maxLength={200} onChange={(e) => mudar({ titulo: e.currentTarget.value })} />
      </label>
      <label className="flex flex-col gap-1">
        Autor
        <input className={CAMPO} value={info.autor} maxLength={200} onChange={(e) => mudar({ autor: e.currentTarget.value })} />
      </label>
      <label className="flex flex-col gap-1">
        Descrição
        <textarea className={`${CAMPO} min-h-16 resize-y`} value={info.descricao} maxLength={2000} onChange={(e) => mudar({ descricao: e.currentTarget.value })} />
      </label>
      <label className="flex flex-col gap-1">
        Palavras-chave (separadas por vírgula)
        <input className={CAMPO} value={palavras} onChange={(e) => setPalavras(e.currentTarget.value)} />
      </label>
      <label className="flex flex-col gap-1">
        Situação dos direitos
        <select className={CAMPO} value={info.situacao_direitos} onChange={(e) => mudar({ situacao_direitos: e.currentTarget.value as InformacoesDoArquivo["situacao_direitos"] })}>
          <option value="desconhecido">Desconhecida</option>
          <option value="protegido">Protegido por direitos autorais</option>
          <option value="dominio_publico">Domínio público</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Aviso de direitos autorais
        <input className={CAMPO} value={info.direitos} maxLength={500} placeholder="© 2026 Seu nome" onChange={(e) => mudar({ direitos: e.currentTarget.value })} />
      </label>
      <label className="flex flex-col gap-1">
        Endereço dos direitos (URL)
        <input className={CAMPO} type="url" value={info.url} maxLength={500} placeholder="https://" onChange={(e) => mudar({ url: e.currentTarget.value })} />
      </label>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t border-borda pt-2 text-suave">
        {resumo.map((item) => (
          <div key={item.rotulo} className="contents">
            <dt>{item.rotulo}</dt>
            <dd className="text-texto tabular-nums">{item.valor}</dd>
          </div>
        ))}
      </dl>
      <p className="text-suave">Vão nos metadados do PNG, do JPG, do WebP, do TIFF, do PDF e do PSD exportados.</p>
    </Moldura>
  );
}

/** Imagem › Duplicar: o nome da cópia e se ela leva as camadas ou só a imagem achatada. */
export function JanelaDuplicarDocumento({ nome, aoFechar, aoConfirmar }: { nome: string; aoFechar: () => void; aoConfirmar: (nome: string, mescladas: boolean) => void }) {
  const [novo, setNovo] = useState(`${nome} cópia`.slice(0, 120));
  const [mescladas, setMescladas] = useState(false);
  return (
    <Moldura titulo="Duplicar a imagem" aoFechar={aoFechar} aoConfirmar={() => novo.trim() && aoConfirmar(novo.trim(), mescladas)}>
      <label className="flex flex-col gap-1">
        Nome
        <input className={CAMPO} value={novo} maxLength={120} autoFocus onChange={(e) => setNovo(e.currentTarget.value)} />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={mescladas} onChange={(e) => setMescladas(e.currentTarget.checked)} />
        Só as camadas mescladas (a imagem achatada numa camada)
      </label>
    </Moldura>
  );
}

/** Arquivo › Imprimir: o tamanho na folha, a orientação e a margem; o resto é a janela de impressão do navegador. */
export function JanelaImprimir({ tamanho, ppi, aoFechar, aoConfirmar }: { tamanho: { largura: number; altura: number }; ppi: number; aoFechar: () => void; aoConfirmar: (opcoes: OpcoesDaImpressao) => void }) {
  const [opcoes, setOpcoes] = useState(OPCOES_PADRAO_DA_IMPRESSAO);
  const mudar = (mudanca: Partial<OpcoesDaImpressao>) => setOpcoes((atual) => ({ ...atual, ...mudanca }));
  const cm = (px: number) => ((px / ppi) * 2.54 * (opcoes.tamanho === "escala" ? opcoes.escala : 1)).toFixed(1).replace(".", ",");
  return (
    <Moldura titulo="Imprimir" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(opcoes)}>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1">Tamanho na folha</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="tamanho-impressao" checked={opcoes.tamanho === "caber"} onChange={() => mudar({ tamanho: "caber" })} />
          Caber na folha
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="tamanho-impressao" checked={opcoes.tamanho === "real"} onChange={() => mudar({ tamanho: "real" })} />
          Tamanho real ({cm(tamanho.largura)} × {cm(tamanho.altura)} cm, a {Math.round(ppi)} ppp)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="tamanho-impressao" checked={opcoes.tamanho === "escala"} onChange={() => mudar({ tamanho: "escala" })} />
          Escala
          <input
            type="number"
            className={`${CAMPO} w-16`}
            min={1}
            max={1000}
            value={Math.round(opcoes.escala * 100)}
            aria-label="Escala da impressão em porcentagem"
            onChange={(e) => mudar({ tamanho: "escala", escala: Math.max(0.01, Number(e.currentTarget.value) / 100 || 1) })}
          />
          %{opcoes.tamanho === "escala" ? ` (${cm(tamanho.largura)} × ${cm(tamanho.altura)} cm)` : ""}
        </label>
      </fieldset>
      <label className="flex items-center gap-2">
        Orientação:
        <select className={`${CAMPO} flex-1`} value={opcoes.orientacao} onChange={(e) => mudar({ orientacao: e.currentTarget.value as OpcoesDaImpressao["orientacao"] })}>
          <option value="automatica">Pela imagem</option>
          <option value="retrato">Retrato</option>
          <option value="paisagem">Paisagem</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        Margem:
        <input type="number" className={`${CAMPO} w-16`} min={0} max={50} value={opcoes.margem} onChange={(e) => mudar({ margem: Math.max(0, Math.min(50, Number(e.currentTarget.value) || 0)) })} />
        mm
      </label>
      <p className="text-suave">A impressora, a folha e o &quot;Salvar como PDF&quot; ficam na janela de impressão do navegador.</p>
    </Moldura>
  );
}
