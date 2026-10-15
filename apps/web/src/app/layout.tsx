import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";

import { SCRIPT_TEMA } from "@/lib/tema";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "TakeOne - Edite vídeos. Sem complicação.",
    template: "%s · TakeOne",
  },
  description: "Do corte rápido à edição avançada, tudo no navegador com IA ao seu lado.",
  applicationName: "TakeOne",
};

export const viewport: Viewport = {
  themeColor: "#08090b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // O script do tema muda o data-tema antes da hidratação
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh">
        <Script id="tema" strategy="beforeInteractive">
          {SCRIPT_TEMA}
        </Script>
        {children}
      </body>
    </html>
  );
}
