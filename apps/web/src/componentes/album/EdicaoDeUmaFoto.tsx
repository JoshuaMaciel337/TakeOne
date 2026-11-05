"use client";

// A edição de uma foto (Edição automatizada › Edição de uma foto): a mesma edição do álbum, sem a escolha das
// melhores. Por dentro é um álbum de uma foto só (unica), fora da lista da edição em massa, então o worker, as
// medidas, o estilo pessoal, o retoque e a exportação são os de sempre.
import { ArrowLeft, Download, Eye, ImageUp, LoaderCircle, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useAlbum } from "@/componentes/album/Album";
import { JanelaExportarAlbum } from "@/componentes/album/JanelaExportarAlbum";
import { Lupa } from "@/componentes/album/Lupa";
import { PainelDeEdicao } from "@/componentes/album/PainelDeEdicao";
import { PainelDeRetoque } from "@/componentes/album/PainelDeRetoque";
import { PainelEstiloPessoal } from "@/componentes/album/PainelEstiloPessoal";
import { amostra } from "@/componentes/album/amostras";
import { AvisoErro } from "@/componentes/AvisoErro";
import { aplicarEstiloPessoal, analisarAlbum, editarFotos, type EstiloPessoal, estilosPessoais } from "@/lib/album/api";
import { arquivoDaFoto, comCor, type EdicaoDaFoto, edicaoParaEnviar, editandoAgora } from "@/lib/album/edicao";
import { comPredefinicao } from "@/lib/album/retoque";
import { arquivoDaMidia, ErroApi } from "@/lib/api";
import { ACEITAR_IMAGENS, useEnvios } from "@/lib/envios";
import { ajustesAutomaticos } from "@/lib/projeto/melhorar";

export function EdicaoDeUmaFoto({ albumId }: { albumId: string }) {
  const { album, fotos, setFotos, pessoas, erro, setErro, recarregar, analise, eventoDoEstilo } = useAlbum(albumId);
  const foto = fotos?.[0] ?? null;
  const pronta = foto?.status === "pronta";
  const [aviso, setAviso] = useState("");
  const [antes, setAntes] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [fazendo, setFazendo] = useState(false);
  const [estilos, setEstilos] = useState<EstiloPessoal[]>([]);
  const [estiloId, setEstiloId] = useState("");
  const [comRetoque, setComRetoque] = useState(true);
  // O pincel do retoque, na lupa (o mesmo do álbum)
  const [pincel, setPincel] = useState(false);
  const analisada = useRef(false);
  // O envio da foto (ele começa na página de antes): o andamento, ou o erro e outra foto
  const { envios, iniciar } = useEnvios();
  const envio = envios.find((item) => item.album === albumId);
  const outraFoto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    estilosPessoais()
      .then((lista) => {
        const treinados = lista.filter((estilo) => estilo.pares > 0);
        setEstilos(treinados);
        if (treinados.length) setEstiloId((atual) => atual || treinados[0].id);
      })
      .catch(() => undefined);
  }, []);

  // A foto pronta é medida uma vez (os rostos do retoque e o vetor do estilo pessoal vêm daí)
  useEffect(() => {
    if (!pronta || foto?.medidas || analisada.current) return;
    analisada.current = true;
    analisarAlbum(albumId).catch(() => undefined);
  }, [albumId, pronta, foto?.medidas]);

  async function editar(edicoes: { midia_id: string; edicao: EdicaoDaFoto | null }[], texto: string) {
    setFotos((lista) => lista?.map((f) => {
      const nova = edicoes.find((e) => e.midia_id === f.midia_id);
      if (!nova) return f;
      return { ...f, edicao: nova.edicao ? { ...nova.edicao, versao: (f.edicao?.versao ?? 0) + 1, gerada: f.edicao?.gerada ?? null } : null };
    }) ?? lista);
    try {
      await editarFotos(albumId, edicoes);
      setAviso(texto);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível guardar a edição.");
      void recarregar();
    }
  }

  /**
   * Fazer tudo: a luz e a cor sugeridas pela foto, endireitar, o retoque leve quando há rosto e, por último, o
   * estilo pessoal escolhido (ele troca só a cor, por cima do resto).
   */
  async function fazerTudo() {
    if (!foto || fazendo) return;
    setFazendo(true);
    try {
      const melhorada = comCor(foto.edicao, ajustesAutomaticos(await amostra(arquivoDaMidia(foto.midia_id, "capa.jpg"))));
      const temRosto = Boolean(foto.medidas?.rostos.length);
      const edicao: EdicaoDaFoto = {
        ...edicaoParaEnviar(melhorada),
        auto: { ...(foto.edicao?.auto ?? {}), endireitar: true },
        ...(comRetoque && temRosto ? { retoque: comPredefinicao(foto.edicao?.retoque, "leve") } : {}),
      };
      await editar([{ midia_id: foto.midia_id, edicao }], temRosto && comRetoque ? "Foto melhorada, endireitada e retocada." : "Foto melhorada e endireitada.");
      if (estiloId) {
        await aplicarEstiloPessoal(estiloId, albumId, [foto.midia_id], 1);
        setAviso("Aplicando o seu estilo pessoal: a foto muda quando ficar pronta.");
      }
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível editar a foto.");
    } finally {
      setFazendo(false);
    }
  }

  const imagem = foto ? arquivoDaMidia(foto.midia_id, antes ? "proxy.webp" : arquivoDaFoto(foto, albumId, "proxy")) : null;
  const desenhando = foto ? editandoAgora(foto) : false;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-fundo text-texto">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-borda bg-painel px-3">
        <Link href="/app/edicao-automatizada" className="botao-icone" aria-label="Voltar à edição de uma foto" title="Edição de uma foto">
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{album?.nome ?? "Edição de uma foto"}</h1>
        {analise ? (
          <span className="hidden items-center gap-1.5 text-xs text-suave sm:flex">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            Analisando a foto
          </span>
        ) : null}
        <button type="button" className="botao-principal px-3 py-1.5 text-xs" disabled={!pronta} onClick={() => setBaixando(true)}>
          <Download className="size-4" aria-hidden />
          Baixar
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="relative flex min-h-[45dvh] flex-1 items-center justify-center bg-black/40 p-3 lg:min-h-0">
          {!foto || !pronta ? (
            envio?.estado === "erro" || foto?.status === "erro" || (fotos?.length === 0 && !envio) ? (
              // A foto não chegou (o envio falhou, ou a página foi aberta depois): o porquê e outra foto
              <div className="flex max-w-sm flex-col items-center gap-3 text-center">
                <p className="text-sm text-erro">
                  {envio?.estado === "erro" ? envio.erro : foto?.status === "erro" ? (foto.erro ?? "A foto não pôde ser preparada.") : "A foto não chegou ao TakeOne."}
                </p>
                <button type="button" className="botao-principal px-4 py-2 text-sm" onClick={() => outraFoto.current?.click()}>
                  <ImageUp className="size-4" aria-hidden />
                  Escolher a foto
                </button>
                <input
                  ref={outraFoto}
                  type="file"
                  accept={ACEITAR_IMAGENS}
                  className="hidden"
                  onChange={(evento) => {
                    const arquivo = evento.target.files?.[0];
                    if (arquivo) iniciar([arquivo], { album: albumId });
                  }}
                />
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-suave">
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                {envio && envio.estado !== "preparando" && envio.tamanho
                  ? `Enviando a foto… ${Math.round((100 * envio.enviado) / envio.tamanho)}%`
                  : foto
                    ? "Preparando a foto…"
                    : "Enviando a foto…"}
              </p>
            )
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- a cópia leve servida pela API */}
              <img src={imagem!} alt={foto.nome} className="max-h-full max-w-full object-contain shadow-2xl shadow-black/50" />
              {desenhando ? (
                <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-xs text-white">
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                  Aplicando a edição
                </span>
              ) : null}
              {foto.edicao?.gerada ? (
                // Segurar mostra a original (o antes), soltar volta à editada
                <button
                  type="button"
                  className="absolute bottom-4 left-1/2 flex -translate-x-1/2 touch-none select-none items-center gap-1.5 rounded-full bg-black/70 px-4 py-2 text-xs text-white"
                  onPointerDown={() => setAntes(true)}
                  onPointerUp={() => setAntes(false)}
                  onPointerLeave={() => setAntes(false)}
                  onPointerCancel={() => setAntes(false)}
                  onContextMenu={(evento) => evento.preventDefault()}
                >
                  <Eye className="size-4" aria-hidden />
                  {antes ? "Original" : "Segure para ver o antes"}
                </button>
              ) : null}
            </>
          )}
        </main>

        <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-borda bg-painel p-4 max-lg:max-h-[55dvh] max-lg:border-t lg:w-80 lg:border-l" aria-label="Edição">
          {erro ? <AvisoErro>{erro}</AvisoErro> : null}
          {aviso ? (
            <p role="status" className="text-xs text-suave">
              {aviso}
            </p>
          ) : null}
          <section className="flex flex-col gap-2 rounded-lg border border-borda bg-painel-2/60 p-3">
            <h2 className="text-sm font-semibold">Edição automática</h2>
            <p className="text-xs text-suave">Luz e cor pela foto, endireitar e, num retrato, um retoque leve. Depois, o seu estilo pessoal.</p>
            <label className="flex items-center gap-2 text-xs">
              <span className="text-suave">Estilo</span>
              <select value={estiloId} onChange={(evento) => setEstiloId(evento.target.value)} className="min-w-0 flex-1 rounded border border-borda bg-painel px-1.5 py-1">
                <option value="">Só o melhorar</option>
                {estilos.map((estilo) => (
                  <option key={estilo.id} value={estilo.id}>
                    {estilo.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={comRetoque} onChange={(evento) => setComRetoque(evento.target.checked)} />
              Retoque leve nos rostos
            </label>
            <button type="button" className="botao-principal justify-center py-2 text-sm" disabled={!pronta || fazendo} onClick={() => void fazerTudo()}>
              {fazendo ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <WandSparkles className="size-4" aria-hidden />}
              Fazer tudo
            </button>
          </section>
          {foto && pronta ? (
            <>
              <PainelDeEdicao albumId={albumId} alvos={[foto]} referencia={foto} grupoDa={() => [foto]} aoEditar={editar} />
              <PainelDeRetoque alvos={[foto]} referencia={foto} pessoas={pessoas} aoEditar={editar} aoPincel={() => setPincel(true)} />
              <PainelEstiloPessoal albumId={albumId} alvos={[foto]} referencia={foto} evento={eventoDoEstilo} aoAviso={(texto, comErro) => (comErro ? setErro(texto) : setAviso(texto))} />
            </>
          ) : null}
        </aside>
      </div>

      {pincel && foto ? (
        <Lupa
          key={`pincel-${foto.midia_id}`}
          albumId={albumId}
          retocando
          foto={foto}
          fotos={[foto]}
          pessoas={pessoas}
          indice={0}
          total={1}
          aoIr={() => undefined}
          aoAndar={() => undefined}
          aoAplicar={() => undefined}
          aoFechar={() => setPincel(false)}
          aoSairDoPincel={() => setPincel(false)}
          aoSalvarPincel={(tracos) => {
            setPincel(false);
            const base = edicaoParaEnviar(foto.edicao);
            void editar([{ midia_id: foto.midia_id, edicao: { ...base, retoque: { ...(base.retoque ?? {}), pincel: tracos } } }], `Pincel do retoque salvo (${tracos.length} traço(s)).`);
          }}
        />
      ) : null}
      {baixando && foto ? <JanelaExportarAlbum albumId={albumId} escolhidas={[]} selecionadas={[foto]} visiveis={[foto]} aoFechar={() => setBaixando(false)} /> : null}
    </div>
  );
}
