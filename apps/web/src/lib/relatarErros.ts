"use client";

// Os erros de JavaScript do navegador vão para o log da API (POST /api/erros-do-site): num celular que não está
// aqui, é o jeito de saber o que travou. No máximo 10 por página, sem repetir a mesma mensagem.
const enviados = new Set<string>();

export function relatarErro(mensagem: string) {
  const texto = mensagem.slice(0, 1900);
  if (!texto || enviados.has(texto) || enviados.size >= 10) return;
  enviados.add(texto);
  try {
    void fetch("/api/erros-do-site", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensagem: texto, pagina: window.location.pathname.slice(0, 300), navegador: navigator.userAgent.slice(0, 300) }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Sem rede: fica sem relatar
  }
}

/** Liga o relato dos erros sem tratamento da página (devolve a função que desliga). */
export function ouvirErros(): () => void {
  const aoErro = (evento: ErrorEvent) => relatarErro(`${evento.message} @ ${evento.filename}:${evento.lineno}:${evento.colno} ${evento.error?.stack ?? ""}`);
  const aoRejeitar = (evento: PromiseRejectionEvent) => {
    const motivo = evento.reason;
    relatarErro(`promessa: ${motivo instanceof Error ? `${motivo.message} ${motivo.stack ?? ""}` : String(motivo)}`);
  };
  window.addEventListener("error", aoErro);
  window.addEventListener("unhandledrejection", aoRejeitar);
  return () => {
    window.removeEventListener("error", aoErro);
    window.removeEventListener("unhandledrejection", aoRejeitar);
  };
}
