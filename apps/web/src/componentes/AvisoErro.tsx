export function AvisoErro({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-erro/40 bg-erro/10 px-3.5 py-2.5 text-sm text-erro">
      {children}
    </p>
  );
}
