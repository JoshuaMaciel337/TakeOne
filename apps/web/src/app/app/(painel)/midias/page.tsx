"use client";

import { AvisoErro } from "@/componentes/AvisoErro";
import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { CartaoMidia } from "@/componentes/midia/CartaoMidia";
import { ListaEnvios } from "@/componentes/midia/ListaEnvios";
import { ZonaDeEnvio } from "@/componentes/midia/ZonaDeEnvio";
import { ErroApi } from "@/lib/api";
import { useMidias } from "@/lib/useMidias";

export default function PaginaMidias() {
  const { midias, erro, excluir } = useMidias();
  // As formas desenhadas para os clipes não são da biblioteca
  const daBiblioteca = midias?.filter((midia) => !midia.elemento && !midia.camada_pixels) ?? null;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina titulo="Mídias" descricao="Vídeos, áudios e imagens do espaço, e o que as ferramentas geram." />
      <ZonaDeEnvio />
      <ListaEnvios />
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {daBiblioteca && daBiblioteca.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {daBiblioteca.map((midia) => (
            <CartaoMidia
              key={midia.id}
              midia={midia}
              aoExcluir={(alvo) => {
                if (!window.confirm(`Excluir "${alvo.nome}"? O arquivo sai da biblioteca.`)) return;
                excluir(alvo.id).catch((e) => window.alert(e instanceof ErroApi ? e.message : "Não foi possível excluir a mídia."));
              }}
            />
          ))}
        </div>
      ) : daBiblioteca ? (
        <p className="text-sm text-suave">Nenhuma mídia ainda. Envie o primeiro vídeo acima.</p>
      ) : null}
    </main>
  );
}
