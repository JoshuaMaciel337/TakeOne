import Link from "next/link";

import { Logo } from "@/componentes/Logo";

export default function LayoutConta({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center px-4 py-12"
      style={{
        background:
          "radial-gradient(circle at 15% 10%, rgba(255,106,61,.12), transparent 40%)," +
          "radial-gradient(circle at 85% 90%, rgba(255,61,119,.10), transparent 40%)",
      }}
    >
      <Link href="/" aria-label="Voltar para a página inicial">
        <Logo tamanho={40} />
      </Link>
      <main className="cartao mt-8 w-full max-w-md p-6 sm:p-8">{children}</main>
    </div>
  );
}
