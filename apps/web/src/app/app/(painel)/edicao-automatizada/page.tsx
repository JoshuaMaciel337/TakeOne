"use client";

import { ImageUp, LoaderCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { criarAlbum, excluirAlbum, listarAlbuns } from "@/lib/album/api";
import type { Album } from "@/lib/album/fotos";
import { arquivoDaMidia, ErroApi } from "@/lib/api";
import { ACEITAR_IMAGENS, useEnvios } from "@/lib/envios";

/**
 * Edição automatizada › Edição de uma foto: envia uma foto e ela abre na edição (a mesma do álbum, sem a escolha das
 * melhores). As edições de antes ficam embaixo. Cada uma é um álbum de uma foto só, fora da edição em massa.
 */
export default function PaginaEdicaoDeUmaFoto() {
  const router = useRouter();
  const { iniciar } = useEnvios();
  const entrada = useRef<HTMLInputElement>(null);
  const [edicoes, setEdicoes] = useState<Album[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    listarAlbuns(true)
      .then(setEdicoes)
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar as edições."));
  }, []);

  async function enviar(arquivo: File | undefined) {
    if (!arquivo || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      const nome = arquivo.name.replace(/\.[^.]+$/, "") || "Foto";
      const album = await criarAlbum(nome.slice(0, 120), "ensaio", true);
      iniciar([arquivo], { album: album.id });
      router.push(`/app/foto/${album.id}`);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível começar a edição.");
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina
        titulo="Edição de uma foto"
        descricao="Envie uma foto e o TakeOne melhora a luz e a cor, endireita, retoca o rosto e aplica o seu estilo. Para um ensaio inteiro, use a edição em massa."
      />
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        onDragOver={(evento) => evento.preventDefault()}
        onDrop={(evento) => {
          evento.preventDefault();
          void enviar(evento.dataTransfer.files[0]);
        }}
        disabled={enviando}
        className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-borda bg-painel px-6 py-12 text-center transition hover:border-destaque"
      >
        {enviando ? <LoaderCircle className="size-8 animate-spin text-destaque" aria-hidden /> : <ImageUp className="size-8 text-destaque" aria-hidden />}
        <span className="text-base font-semibold">Escolher uma foto</span>
        <span className="text-sm text-suave">ou solte aqui. JPG, PNG, HEIC e o RAW das câmeras.</span>
      </button>
      <input ref={entrada} type="file" accept={ACEITAR_IMAGENS} className="hidden" onChange={(evento) => void enviar(evento.target.files?.[0])} />
      <p className="text-sm text-suave">
        Um ensaio com muitas fotos? A{" "}
        <Link href="/app/albuns" className="text-destaque underline-offset-2 hover:underline">
          edição em massa
        </Link>{" "}
        escolhe as melhores e edita todas no mesmo estilo.
      </p>

      {edicoes?.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Edições recentes</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {edicoes.map((edicao) => (
              <li key={edicao.id} className="group relative overflow-hidden rounded-xl border border-borda bg-painel">
                <Link href={`/app/foto/${edicao.id}`} className="block">
                  <div className="aspect-[4/5] bg-painel-2">
                    {edicao.capa_midia_id ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a capa servida pela API
                      <img src={arquivoDaMidia(edicao.capa_midia_id, "capa.jpg")} alt="" className="size-full object-cover" loading="lazy" />
                    ) : null}
                  </div>
                  <p className="truncate px-2 py-1.5 text-xs">{edicao.nome}</p>
                </Link>
                <button
                  type="button"
                  className="botao-icone absolute right-1.5 top-1.5 bg-black/60 text-white"
                  aria-label={`Excluir a edição ${edicao.nome}`}
                  onClick={() => {
                    if (!window.confirm(`Excluir a edição "${edicao.nome}"? A foto enviada sai junto.`)) return;
                    excluirAlbum(edicao.id)
                      .then(() => setEdicoes((lista) => lista?.filter((item) => item.id !== edicao.id) ?? lista))
                      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível excluir."));
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
