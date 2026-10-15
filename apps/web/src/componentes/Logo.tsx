type Props = {
  /** Altura do símbolo em pixels. O nome acompanha. */
  tamanho?: number;
  /** Só o símbolo, sem o nome (barras estreitas). */
  soSimbolo?: boolean;
  className?: string;
};

/** O símbolo do kit da marca (public/marca/simbolo.svg), desenhado aqui para não esperar um arquivo. */
export function Simbolo({ tamanho = 28, className = "" }: { tamanho?: number; className?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 64 64" aria-hidden className={`shrink-0 ${className}`}>
      <defs>
        <linearGradient id="takeone-simbolo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff624a" />
          <stop offset="1" stopColor="#ff3478" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill="url(#takeone-simbolo)" />
      <path d="M26 16c0-2.8 2.8-4.4 5.2-2.8l19 14.1c2.1 1.5 2.1 4.6 0 6.1l-19 14.1C28.8 49.2 26 47.6 26 44.8V16z" fill="#fff" />
      <path d="M15 20v24" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ tamanho = 28, soSimbolo = false, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Simbolo tamanho={tamanho} />
      {soSimbolo ? (
        <span className="sr-only">TakeOne</span>
      ) : (
        <span className="font-bold leading-none" style={{ fontSize: tamanho * 0.76, fontWeight: 750, letterSpacing: "-0.037em" }}>
          Take<span className="texto-gradiente">One</span>
        </span>
      )}
    </span>
  );
}
