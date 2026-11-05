"use client";

import { LoaderCircle, Plus, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { useAbrirNoEditor } from "@/componentes/hub/AbrirNoEditor";
import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { LixeiraDeProjetos, ListaProjetos } from "@/componentes/projeto/ListaProjetos";
import { chamarApi, ErroApi } from "@/lib/api";
import { guardarArquivos, proporcaoDosArquivos } from "@/lib/arquivosDoNovoProjeto";

export default function PaginaProjetos() {
  const abrirNoEditor = useAbrirNoEditor();
  const router = useRouter();
  const [aba, setAba] = useState<"projetos" | "lixeira">("projetos");
  const [arrastando, setArrastando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");
  const novo = () => abrirNoEditor({ titulo: "Editor de vídeo", ferramenta: "midia" });

  /** Soltar arquivos aqui cria um projeto na proporção da primeira mídia e abre o editor com eles (ADR 0007, 17.7). */
  async function criarComArquivos(arquivos: File[]) {
    const midias = arquivos.filter((arquivo) => /^(video|image|audio)\//.test(arquivo.type));
    if (!midias.length) {
      setErro("Solte vídeos, fotos ou áudios para criar um projeto.");
      return;
    }
    setCriando(true);
    setErro("");
    try {
      const proporcao = await proporcaoDosArquivos(midias);
      const nome = midias[0].name.replace(/\.[^.]+$/, "").slice(0, 120) || undefined;
      const projeto = await chamarApi<{ id: string }>("/projetos", { metodo: "POST", corpo: { proporcao, nome } });
      guardarArquivos(projeto.id, midias);
      router.push(`/app/editor/${projeto.id}`);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível criar o projeto.");
      setCriando(false);
    }
  }

  return (
    <main
      className="relative mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8"
      onDragOver={(evento) => {
        if (![...evento.dataTransfer.types].includes("Files")) return;
        evento.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) setArrastando(false);
      }}
      onDrop={(evento) => {
        if (!evento.dataTransfer.files.length) return;
        evento.preventDefault();
        setArrastando(false);
        void criarComArquivos([...evento.dataTransfer.files]);
      }}
    >
      <TituloDaPagina titulo="Projetos" descricao="Todos os projetos do espaço. Solte vídeos e fotos aqui para começar um projeto com eles.">
        <button type="button" className="botao-principal px-5 py-2.5" onClick={novo} disabled={criando}>
          {criando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          Novo projeto
        </button>
      </TituloDaPagina>
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <div className="flex gap-1 text-sm" role="tablist" aria-label="Projetos ou lixeira">
        <button type="button" role="tab" aria-selected={aba === "projetos"} onClick={() => setAba("projetos")} className={`rounded-full px-3 py-1 ${aba === "projetos" ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`}>
          Projetos
        </button>
        <button type="button" role="tab" aria-selected={aba === "lixeira"} onClick={() => setAba("lixeira")} className={`flex items-center gap-1 rounded-full px-3 py-1 ${aba === "lixeira" ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`}>
          <Trash2 className="size-3.5" aria-hidden />
          Lixeira
        </button>
      </div>
      {aba === "projetos" ? <ListaProjetos aoCriar={novo} criando={criando} comFiltros /> : <LixeiraDeProjetos />}
      {arrastando || criando ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-destaque bg-painel/90 px-10 py-8 text-center">
            {criando ? <LoaderCircle className="size-8 animate-spin text-destaque" aria-hidden /> : <Upload className="size-8 text-destaque" aria-hidden />}
            <p className="font-medium">{criando ? "Criando o projeto…" : "Solte para criar um projeto com estes arquivos"}</p>
            <p className="text-xs text-suave">O formato sai da primeira foto ou vídeo.</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
