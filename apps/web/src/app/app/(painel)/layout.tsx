import { LayoutDoHub } from "@/componentes/hub/LayoutDoHub";

export default function LayoutPainel({ children }: Readonly<{ children: React.ReactNode }>) {
  return <LayoutDoHub>{children}</LayoutDoHub>;
}
