import { redirect } from "next/navigation";

/** Sem projeto escolhido, volta para a lista. Os projetos novos são criados pelo painel. */
export default function PaginaEditor() {
  redirect("/app");
}
