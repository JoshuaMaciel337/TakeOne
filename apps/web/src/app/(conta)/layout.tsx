import Link from "next/link";

import { BotaoTema } from "@/componentes/BotaoTema";
import { Logo } from "@/componentes/Logo";

export default function LayoutConta({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-12"
      style={{
        background:
          "radial-gradient(circle at 15% 10%, rgba(255,98,74,.12), transparent 40%)," +
          "radial-gradient(circle at 85% 90%, rgba(255,52,120,.10), transparent 40%)",
      }}
    >
      <BotaoTema className="botao-icone absolute right-4 top-4" />
      <Link href="/" aria-label="Voltar para a página inicial">
        <Logo tamanho={40} />
      </Link>
      <main className="cartao mt-8 w-full max-w-md p-6 sm:p-8">{children}</main>
    </div>
  );
}
