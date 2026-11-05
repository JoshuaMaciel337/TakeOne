"use client";

import { Images, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { criarAlbum, excluirAlbum, listarAlbuns } from "@/lib/album/api";
import { type Album, GENEROS, type Genero } from "@/lib/album/fotos";
import { arquivoDaMidia, ErroApi } from "@/lib/api";
import { formatarQuando } from "@/lib/formatar";

const nomeDoGenero = (genero: Genero) => GENEROS.find((g) => g.id === genero)?.nome ?? "";

function plural(n: number, um: string, varios: string) {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
}

/** Os álbuns de fotos do espaço, em cartões, com o de criar na frente. */
export function ListaAlbuns() {
  const [albuns, setAlbuns] = useState<Album[] | null>(null);
  const [erro, setErro] = useState("");
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    listarAlbuns()
      .then(setAlbuns)
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar os álbuns."));
  }, []);

  function excluir(album: Album) {
    const aviso = album.fotos
      ? `Excluir o álbum "${album.nome}" e as ${album.fotos.toLocaleString("pt-BR")} fotos dele? As que estão em algum projeto voltam para a biblioteca.`
      : `Excluir o álbum "${album.nome}"?`;
    if (!window.confirm(aviso)) return;
    excluirAlbum(album.id)
      .then(() => setAlbuns((lista) => lista?.filter((item) => item.id !== album.id) ?? lista))
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível excluir o álbum."));
  }

  return (
    <>
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-4">
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borda text-suave transition hover:border-destaque hover:text-texto"
        >
          <Plus className="size-6" aria-hidden />
          <span className="text-sm font-medium">Novo álbum</span>
        </button>
        {albuns?.map((album) => (
          <div key={album.id} className="group relative min-w-0">
            <Link
              href={`/app/album/${album.id}`}
              className="block overflow-hidden rounded-xl border border-borda bg-painel-2 transition hover:border-suave/50 focus-visible:outline-2 focus-visible:outline-destaque"
            >
              <span className="relative flex aspect-[4/3] items-center justify-center bg-painel-3">
                {album.capa_midia_id ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem da API com a sessão do cookie
                  <img src={arquivoDaMidia(album.capa_midia_id, "capa.jpg")} alt="" className="size-full object-cover" loading="lazy" />
                ) : (
                  <Images className="size-8 text-suave" aria-hidden />
                )}
                <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
                  {plural(album.fotos, "foto", "fotos")}
                  {album.escolhidas ? ` · ${plural(album.escolhidas, "escolhida", "escolhidas")}` : ""}
                </span>
                {album.prontas < album.fotos ? (
                  <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
                    <LoaderCircle className="size-3 animate-spin" aria-hidden />
                    preparando
                  </span>
                ) : null}
              </span>
              <span className="block px-3 py-2">
                <span className="block truncate text-sm font-medium">{album.nome}</span>
                <span className="block truncate text-xs text-suave">
                  {nomeDoGenero(album.genero)} · {formatarQuando(album.atualizado_em)}
                </span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => excluir(album)}
              className="absolute right-1.5 top-1.5 hidden size-7 items-center justify-center rounded-md bg-black/70 text-white transition hover:bg-erro group-hover:flex group-focus-within:flex [@media(hover:none)]:flex"
              aria-label={`Excluir o álbum ${album.nome}`}
              title="Excluir álbum"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
      {albuns && albuns.length === 0 ? (
        <p className="text-xs text-suave">Nenhum álbum ainda. Crie um e envie a pasta do ensaio: o TakeOne prepara as fotos para você escolher as melhores.</p>
      ) : null}
      {criando ? <JanelaNovoAlbum aoFechar={() => setCriando(false)} /> : null}
    </>
  );
}

/** Nome e tipo do ensaio; o álbum abre logo depois, pronto para receber as fotos. */
export function JanelaNovoAlbum({ aoFechar }: { aoFechar: () => void }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [genero, setGenero] = useState<Genero>("ensaio");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onPointerDown={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-novo-album"
        className="w-full max-w-sm rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60"
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-novo-album" className="font-display text-base font-semibold">
            Novo álbum
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <form
          className="flex flex-col gap-3 p-4 text-sm"
          onSubmit={(evento) => {
            evento.preventDefault();
            setSalvando(true);
            setErro("");
            criarAlbum(nome.trim() || "Álbum sem nome", genero)
              .then((album) => router.push(`/app/album/${album.id}`))
              .catch((e) => {
                setErro(e instanceof ErroApi ? e.message : "Não foi possível criar o álbum.");
                setSalvando(false);
              });
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-suave">
            Nome
            <input
              autoFocus
              value={nome}
              maxLength={120}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Casamento de Ana e Leo"
              className="rounded-lg border border-borda bg-painel-2 px-3 py-2 text-sm text-texto outline-none focus:border-destaque"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-suave">
            Tipo do ensaio
            <select
              value={genero}
              onChange={(evento) => setGenero(evento.target.value as Genero)}
              className="rounded-lg border border-borda bg-painel-2 px-3 py-2 text-sm text-texto outline-none focus:border-destaque"
            >
              {GENEROS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-apagado">Ajuda a escolher as melhores fotos: num casamento, olhos abertos e sorrisos pesam mais.</span>
          </label>
          {erro ? <p className="text-xs text-erro">{erro}</p> : null}
          <button type="submit" className="botao-principal mt-1 px-3 py-2" disabled={salvando}>
            {salvando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            Criar e enviar as fotos
          </button>
        </form>
      </div>
    </div>
  );
}
