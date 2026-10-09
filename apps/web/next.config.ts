import type { NextConfig } from "next";

// Endereço da API vista pelo servidor do Next. No Docker é http://api:8000.
// Fora dele, 8010, para não bater com a API do HolyCut na mesma máquina.
const apiUrlInterna = process.env.API_URL_INTERNA ?? "http://localhost:8010";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // O navegador sempre fala com /api no mesmo endereço do site.
  // Assim o cookie de sessão funciona igual em casa, no túnel e em produção.
  // Com o proxy.ts, o Next guarda na memória o corpo de toda requisição e corta em 10 MB:
  // os vídeos passam porque vão pelo tus em pedaços de 8 MB.
  async rewrites() {
    return [{ source: "/api/:caminho*", destination: `${apiUrlInterna}/api/:caminho*` }];
  },
};

export default nextConfig;
