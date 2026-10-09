import { Cabecalho } from "@/componentes/Cabecalho";

export default function LayoutPainel({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh min-w-0 overflow-x-clip">
      <Cabecalho />
      {children}
    </div>
  );
}
