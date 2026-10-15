// Os ícones de traço da home do kit da marca (24×24, traço 1,7).

const DESENHOS = {
  seta: <path d="M4 12h16M13 5l7 7-7 7" />,
  reproduzir: (
    <>
      <path d="m9 6 10 6-10 6z" />
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
    </>
  ),
  brilho: (
    <>
      <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z" />
      <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </>
  ),
  camadas: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  filme: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" />
    </>
  ),
  legendas: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M7 10h4M7 14h2M14 10h3M14 14h3" />
    </>
  ),
  varinha: <path d="m15 4 5 5M4 20 16 8M3 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />,
  audio: <path d="M3 10v4M7 6v12M11 3v18M15 7v10M19 10v4" />,
  onda: <path d="M3 10v4M7 6v12M11 3v18M15 8v8M19 5v14M23 10v4" />,
  recorte: <path d="M7 3v14a2 2 0 0 0 2 2h12M3 7h14a2 2 0 0 1 2 2v12" />,
  baixar: <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />,
  certo: <path d="m5 12 4 4L19 6" />,
  tesoura: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M8.2 8.2 20 20M8.2 15.8 20 4" />
    </>
  ),
};

export type NomeIcone = keyof typeof DESENHOS;

export function Icone({ nome, seta = false }: { nome: NomeIcone; seta?: boolean }) {
  return (
    <svg
      className={seta ? "i arrow" : "i"}
      aria-hidden
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {DESENHOS[nome]}
    </svg>
  );
}
