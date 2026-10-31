// -----------------------------------------------
// TakeOne — porta de entrada pública no Cloudflare
// -----------------------------------------------
// O site continua no Nitro. Este Worker recebe cada requisição em *.workers.dev e a repassa, pelo túnel
// (Workers VPC), ao contêiner "web" do Docker; a API chega pelo próprio site (/api). Nada mais do Nitro
// fica alcançável: o serviço VPC só aponta para web:3000.

const ENDERECO_INTERNO = "http://web:3000";

export default {
  async fetch(request, env) {
    const publico = new URL(request.url);
    const alvo = new URL(publico.pathname + publico.search, ENDERECO_INTERNO);

    const cabecalhos = new Headers(request.headers);
    cabecalhos.set("x-forwarded-host", publico.host);
    cabecalhos.set("x-forwarded-proto", "https");
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) cabecalhos.set("x-forwarded-for", ip);

    let resposta;
    try {
      resposta = await env.SITE.fetch(alvo, {
        method: request.method,
        headers: cabecalhos,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "manual",
      });
    } catch (erro) {
      console.error("Túnel sem resposta:", erro);
      return new Response(PAGINA_FORA_DO_AR, {
        status: 502,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    // O Next monta os redirecionamentos com o endereço que ele vê (web:3000): volta para o público
    const local = resposta.headers.get("location");
    if (local && local.startsWith(ENDERECO_INTERNO)) {
      const novos = new Headers(resposta.headers);
      novos.set("location", publico.origin + local.slice(ENDERECO_INTERNO.length));
      return new Response(resposta.body, { status: resposta.status, statusText: resposta.statusText, headers: novos });
    }
    return resposta;
  },
};

const PAGINA_FORA_DO_AR = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TakeOne fora do ar</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0e12;color:#eee;font:16px/1.5 system-ui,sans-serif;padding:16px}
main{max-width:420px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{color:#aaa;margin:0}</style></head>
<body><main><h1>O TakeOne está fora do ar agora</h1>
<p>O computador que roda o TakeOne está desligado ou reiniciando. Tente de novo em alguns minutos.</p></main></body></html>`;
