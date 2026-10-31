# O TakeOne na internet (para testar)

O TakeOne continua rodando no Nitro. A Cloudflare só faz a porta de entrada, sem domínio próprio:

```
navegador ──https──> Worker "takeone" (takeone.<conta>.workers.dev)
                          │  Workers VPC (serviço "takeone-site": web:3000)
                          ▼
                     túnel "takeone" (contêiner `tunel`, no Nitro) ──> web:3000 ──(/api)──> api:8000
```

- **Worker** (`infra/cloudflare/`): repassa cada requisição ao site pelo túnel e troca o endereço interno
  (`http://web:3000`) pelo público nos redirecionamentos. Quando o Nitro está desligado, mostra a página "fora do ar".
- **Túnel**: criado na conta da Cloudflare (`wrangler tunnel create takeone`). O token fica só no `.env`
  (`CLOUDFLARE_TUNNEL_TOKEN`) e o contêiner sobe com o perfil `tunel`. O túnel não tem rota pública: só o serviço VPC
  chega nele, e o serviço VPC só chega ao `web:3000`. O Mongo, o ComfyUI e o resto continuam fechados.
- **Cadastro só com convite** (`CADASTRO_SO_COM_CONVITE=true` no `.env`): sem um código válido, ninguém cria conta.
  O login é o do próprio TakeOne (cookie seguro com `COOKIE_SEGURO=true`).

O Workers VPC é gratuito enquanto estiver em beta. O plano gratuito dos Workers aceita 100 mil requisições por dia,
e a prévia do editor lê os vídeos em pedaços. Dá para alguns testadores. Com muita gente, o caminho é um domínio próprio
com o túnel servindo o endereço direto, sem passar pelo Worker.

## Subir

```
docker compose --profile gpu --profile tunel up -d
```

O `.env` precisa de `CLOUDFLARE_TUNNEL_TOKEN`, `COOKIE_SEGURO=true`, `CADASTRO_SO_COM_CONVITE=true` e
`SITE_PUBLICO` (o endereço do Worker, para os links dos convites). O túnel conectado aparece no log:
`docker compose logs tunel` mostra "Registered tunnel connection".

## Convidar alguém

```
docker compose exec worker-cpu python worker/convites.py --agora --nota "Ana" --usos 1 --dias 14
```

O script mostra o código e o link (`<site>/cadastro?convite=...`), que já abre com o código preenchido. O código só
aparece nessa hora: o banco guarda o hash. Um convite pode valer para várias contas (`--usos 10`).

```
docker compose exec worker-cpu python worker/convites.py --listar
docker compose exec worker-cpu python worker/convites.py --agora --revogar ABC
```

Revogar recebe as três primeiras letras do código (as que a lista mostra). Quem já criou a conta continua entrando.

## Atualizar o Worker

Dentro de `infra/cloudflare/`, com o wrangler logado na conta (`npx wrangler login`):

```
npx wrangler deploy
```

## Tirar do ar

- Só por um tempo: `docker compose stop tunel`. O endereço mostra "fora do ar".
- De vez: `npx wrangler delete` em `infra/cloudflare/`, `npx wrangler vpc service delete <id>` e
  `npx wrangler tunnel delete takeone`, e apagar o token do `.env`.
