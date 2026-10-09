type Props = {
  /** Altura do símbolo em pixels. O nome acompanha. */
  tamanho?: number;
  /** Só o símbolo, sem o nome (barras estreitas). */
  soSimbolo?: boolean;
  className?: string;
};

export function Simbolo({ tamanho = 28 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="takeone-simbolo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff6a3d" />
          <stop offset="1" stopColor="#ff3d77" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#takeone-simbolo)" />
      <path
        d="M25 19.5v25a1.5 1.5 0 0 0 2.3 1.27l19.6-12.5a1.5 1.5 0 0 0 0-2.54L27.3 18.23A1.5 1.5 0 0 0 25 19.5Z"
        fill="#fff"
      />
      <rect x="14" y="19" width="5" height="26" rx="2.5" fill="#fff" fillOpacity=".85" />
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
        <span className="font-display font-bold tracking-tight" style={{ fontSize: tamanho * 0.68 }}>
          Take<span className="texto-gradiente">One</span>
        </span>
      )}
    </span>
  );
}
