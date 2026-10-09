# TakeOne

Editor de vídeo no navegador, com o fluxo e a organização do CapCut, mas visual e código próprios. A prévia e a edição rodam no navegador; a exportação e a IA rodam em máquina própria, com modelos abertos e sem custo por uso.

- **Plano do projeto:** [docs/PLANO.md](docs/PLANO.md)
- **Código e licenças de terceiros:** [THIRD_PARTY.md](THIRD_PARTY.md)
- **Contexto para o Claude Code** (estado atual, pedidos fixos e decisões): [CLAUDE.md](CLAUDE.md)

## Estrutura

```
apps/web/       Next.js - landing, login, painel e editor
apps/api/       FastAPI - sessão, organizações, mídias, upload, jobs e eventos ao vivo
apps/worker/    Worker da fila de jobs (ingestão das mídias)
core/           Código Python compartilhado: config, Mongo, fila, storage, FFmpeg
infra/          Dockerfiles e agendador de backup
licencas/       Licenças dos projetos de onde vem código portado
tests/          Testes unitários e de integração
compose.yaml    Todos os serviços
```

## Rodar com Docker

```
cp .env.example .env        # e defina JWT_SEGREDO
docker compose up --build
```

Abra http://localhost:3010, crie uma conta, envie um vídeo e clique em **Novo projeto** para abrir o editor.

As portas padrão (Mongo 27018, API 8010, site 3010) foram escolhidas para o TakeOne rodar ao lado do HolyCut no mesmo computador. Para trocar, mude `MONGO_PORTA`, `API_PORTA` ou `WEB_PORTA` no `.env`. Os vídeos enviados ficam em `./armazenamento`; aponte `PASTA_ARMAZENAMENTO_HOST` para o disco com mais espaço.

| Onde | Comando |
|---|---|
| Neste computador | `docker compose up --build` |
| Acesso de fora por túnel temporário | acrescente `--profile tunel-rapido` |
| Produção com túnel fixo | acrescente `--profile tunel` |

## Rodar sem Docker

Útil para desenvolver com recarga automática. Precisa de um MongoDB acessível e do FFmpeg no PATH.

```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
set PYTHONPATH=.;apps;infra
set MONGO_URI=mongodb://localhost:27017/?directConnection=true

uvicorn api.main:app --reload --port 8010
python -m worker.worker_principal --automatico --recursos cpu
```

Em outro terminal:

```
cd apps/web
npm install
npm run dev
```

O site em http://localhost:3010 repassa `/api` para a API na porta 8010.

> Sem replica set no Mongo, os eventos ao vivo usam consulta a cada 3 segundos. No Docker o Mongo já sobe como replica set.

## Testes e qualidade

```
ruff check .
pytest                      # os testes de integração usam um banco takeone_teste_* e apagam no fim

cd apps/web
npm run lint
npm run typecheck
npm run build
```

O GitHub Actions roda tudo isso a cada push.

## Padrões

Python com MongoDB via pymongo, nomes em português no formato `verbo_objeto()`, `logging` em vez de `print`, credenciais só por variável de ambiente, fuso `America/Sao_Paulo` e scripts agendáveis com `--agora` e `--automatico`. Sem Redis, sem SQL e sem ORM.
