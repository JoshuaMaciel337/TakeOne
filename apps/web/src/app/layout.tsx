import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "TakeOne - Editor de vídeo no navegador",
    template: "%s · TakeOne",
  },
  description: "Edite vídeos com várias faixas, textos, legendas e efeitos direto no navegador.",
  applicationName: "TakeOne",
};

export const viewport: Viewport = {
  themeColor: "#0c0c0f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${sora.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
