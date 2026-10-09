import { Captions, Layers, Sparkles, Type } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/componentes/Logo";

const RECURSOS = [
  {
    icone: Layers,
    titulo: "Várias faixas",
    texto: "Vídeo, áudio, texto e efeitos em camadas, com cortes precisos no quadro.",
  },
  {
    icone: Type,
    titulo: "Textos animados",
    texto: "Títulos com contorno, sombra e brilho, e animações de entrada e saída.",
  },
  {
    icone: Captions,
    titulo: "Legendas automáticas",
    texto: "A fala vira legenda animada, e dá para editar o vídeo pelo texto.",
  },
  {
    icone: Sparkles,
    titulo: "IA sem custo por uso",
    texto: "Modelos abertos rodando no próprio servidor: nada é cobrado por minuto.",
  },
];

/** Desenho do editor em HTML: barra de ferramentas, prévia, propriedades e linha do tempo. */
function EditorDesenhado() {
  return (
    <div className="cartao overflow-hidden shadow-2xl shadow-black/50" aria-hidden>
      <div className="flex h-8 items-center gap-1.5 border-b border-borda px-3">
        <span className="size-2.5 rounded-full bg-painel-3" />
        <span className="size-2.5 rounded-full bg-painel-3" />
        <span className="size-2.5 rounded-full bg-painel-3" />
      </div>
      <div className="grid h-56 grid-cols-[2.5rem_7rem_1fr_6rem] sm:h-72">
        <div className="flex flex-col items-center gap-3 border-r border-borda py-3">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={`size-5 rounded ${i === 0 ? "bg-destaque/70" : "bg-painel-3"}`} />
          ))}
        </div>
        <div className="grid grid-cols-2 content-start gap-2 border-r border-borda p-2">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="aspect-video rounded bg-painel-3" />
          ))}
        </div>
        <div className="flex items-center justify-center bg-fundo">
          <div className="relative aspect-[9/16] h-[80%] overflow-hidden rounded-md" style={{ background: "var(--to-gradiente)" }}>
            <span className="absolute inset-x-3 bottom-6 h-2 rounded bg-white/90" />
            <span className="absolute inset-x-6 bottom-10 h-2 rounded bg-white/60" />
          </div>
        </div>
        <div className="flex flex-col gap-2 border-l border-borda p-2">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="h-3 rounded bg-painel-3" style={{ width: `${90 - i * 12}%` }} />
          ))}
        </div>
      </div>
      <div className="relative flex h-20 flex-col justify-center gap-1.5 border-t border-borda px-3">
        <div className="flex gap-1">
          <span className="h-4 w-1/3 rounded bg-destaque/60" />
          <span className="h-4 w-1/4 rounded bg-destaque/40" />
        </div>
        <div className="flex gap-1">
          <span className="h-5 w-1/2 rounded bg-painel-3" />
          <span className="h-5 w-1/3 rounded bg-painel-3" />
        </div>
        <span className="h-3 w-2/3 rounded bg-sucesso/30" />
        <span className="absolute inset-y-2 left-[38%] w-0.5 bg-white" />
      </div>
    </div>
  );
}

export default function PaginaInicial() {
  return (
    <div
      className="min-h-dvh"
      style={{
        background:
          "radial-gradient(circle at 10% 0%, rgba(255,106,61,.14), transparent 35%)," +
          "radial-gradient(circle at 90% 30%, rgba(255,61,119,.10), transparent 35%)",
      }}
    >
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo tamanho={32} />
        <nav className="flex items-center gap-2">
          <Link href="/entrar" className="botao-secundario px-4 py-2">
            Entrar
          </Link>
          <Link href="/cadastro" className="botao-principal px-4 py-2">
            Criar conta
          </Link>
        </nav>
      </header>

      <main className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-[1fr_1.15fr] lg:pt-16">
        <section>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Edite vídeos de um jeito <span className="texto-gradiente">simples e rápido</span>, direto no navegador.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-suave">
            Corte, junte, coloque texto, legenda, música e efeitos. Sem instalar nada e com a prévia igual ao vídeo
            exportado.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/cadastro" className="botao-principal px-6 py-3 text-base">
              Começar a editar
            </Link>
            <Link href="/entrar" className="botao-secundario px-6 py-3 text-base">
              Já tenho conta
            </Link>
          </div>
        </section>
        <EditorDesenhado />
      </main>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {RECURSOS.map(({ icone: Icone, titulo, texto }) => (
          <article key={titulo} className="cartao p-5">
            <Icone className="size-6 text-destaque" aria-hidden />
            <h2 className="mt-3 font-display font-semibold">{titulo}</h2>
            <p className="mt-1 text-sm text-suave">{texto}</p>
          </article>
        ))}
      </section>

      <footer className="border-t border-borda py-6 text-center text-xs text-suave">
        TakeOne · editor de vídeo no navegador
      </footer>
    </div>
  );
}
