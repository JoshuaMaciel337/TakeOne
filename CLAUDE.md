# TakeOne — contexto para o Claude

O Claude Code lê este arquivo sozinho ao abrir uma conversa nesta pasta. Ele resume o que já foi decidido e feito, para uma conversa nova continuar de onde a outra parou. O plano completo está em [docs/PLANO.md](docs/PLANO.md).

## Manter este arquivo atualizado

- Toda mudança que altera o estado do projeto atualiza, **no mesmo commit**, a seção "Estado atual" daqui e o checklist do `docs/PLANO.md`.
- Decisão técnica nova que não fica óbvia lendo o código vai para "Decisões técnicas" abaixo. Se for grande, vira um ADR em `docs/decisoes/`.
- Não repita aqui o que o código ou o plano já explicam. Este arquivo é o resumo e o "porquê".

## O que é

Editor de vídeo web no estilo CapCut: barra de ferramentas, painel de conteúdo, prévia, propriedades e linha do tempo de várias faixas. Roda no Nitro 5 do dono, ao lado do HolyCut, com modelos de IA abertos e sem custo por uso.

As referências são o CapCut (só funções e fluxo), o OpusClip e o Cut.Pro, analisados com o REA. O código pode vir do HolyCut e dos repositórios MIT/Apache da storytold (FilmCraft, LightCraft, EffectCraft, PhotoCraft, SoundCraft, VectorCraft). O que pode e o que não pode vir de cada um está na seção 1 do plano.

## Pedidos fixos do dono do projeto

- **Nada pago por enquanto:** nenhuma API, modelo ou serviço cobrado por uso. Tudo roda com modelos abertos na máquina.
- **Fora do escopo, não propor:** avatar de IA, personas, dublagem, clonagem de voz, lip-sync e correção de olhar.
- **Nada do CapCut além da ideia:** sem código, ícones, modelos, músicas, efeitos ou marca dele. Nomes de marcas de terceiros (CapCut, Lumetri, Premiere) não aparecem na interface.
- **O TakeOne é independente do HolyCut:** pode copiar código de lá, mas sem ligação por código compartilhado, banco ou login. O HolyCut não é alterado por causa do TakeOne.
- **O repositório é público.** O `.env` nunca vai para o Git. Antes de cada push, procure no diff por senhas, tokens, chaves e e-mails pessoais.
- **Tudo em português:** código, mensagens da interface, logs, testes e commits.
- **Stack aprovado:** FastAPI, Next.js 16 com Tailwind 4, MongoDB, FFmpeg e Docker Compose. Python com pymongo, `logging` em vez de `print`, fuso `America/Sao_Paulo` e scripts com `argparse --agora --automatico`. **Proibido** usar Redis, bancos SQL e ORM. A fila de jobs roda no próprio Mongo.
- **Git:** identidade local `Joshua Maciel <JoshuaMaciel337@users.noreply.github.com>`. Mensagens no formato "Área: descrição curta.", com acento, um corpo curto dizendo o porquê e o trailer `Co-Authored-By` do Claude. Commits pequenos, um por área, direto na `main`.
- **Licenças:** só bibliotecas e modelos com licença permissiva (evite AGPL). Música só com licença. Código portado do FilmCraft ou do LightCraft segue as regras do [THIRD_PARTY.md](THIRD_PARTY.md).
- **Prévia igual ao render:** toda diferença entre a prévia no navegador e o vídeo exportado é medida em números, não só no olho.

## Estado atual (atualizado em 08/10/2026)

- **Fase 0 (fundação):** código pronto. Falta subir no Docker do Nitro 5 e ver o primeiro CI verde no GitHub (o repositório ainda não foi criado lá).
  - Do HolyCut, sem as partes de igreja: config, Mongo, fila com lease, storage, FFmpeg, sessão com organizações ("espaços"), jobs, eventos SSE, upload tus, mídias, ingestão (proxy 720p, forma de onda, níveis, miniaturas e capa), backup e Compose.
  - Site: landing, entrar, cadastro, painel com a biblioteca de mídias e o editor em `/app/editor`.
  - Editor: as quatro áreas com painéis redimensionáveis (tamanho lembrado no navegador), prévia na proporção escolhida que toca a mídia selecionada, propriedades da mídia, linha do tempo com régua, zoom e cursor. No celular, a prévia fica no topo, as ferramentas numa faixa embaixo e o painel abre por cima.
  - As ferramentas além de Mídia mostram em que fase chegam. Desfazer, dividir, apagar, duplicar, ímã e Exportar aparecem desligados.
- **Próximo passo:** fase 1 (modelo de dados do projeto, ticks, comandos com desfazer, linha do tempo de várias faixas e salvamento automático).

## Arquitetura em um minuto

- `apps/api` (FastAPI), `apps/worker` (fila), `apps/web` (Next.js) e `core` (config, Mongo, fila, storage, FFmpeg, compartilhado entre API e worker).
- **Fila no Mongo:** o job tem lease e heartbeat, e o de prioridade maior sai primeiro. `ErroDefinitivo` manda o job para erro sem novas tentativas. Uma tarefa é `Tarefa(executar(db, job, reportar), ao_falhar)`, registrada em `REGISTRO` (`apps/worker/tarefas/__init__.py`) e em `TAREFAS` (`core/modelos/job.py`).
- **Eventos ao vivo:** por SSE, sempre começando com o evento "pronto". Se ele não chegar em 5 s, o site passa a consultar a API a cada 3 s, porque o Quick Tunnel da Cloudflare não entrega SSE.
- **Upload:** tus 1.0.0 dentro da própria API, em pedaços de 8 MB ([ADR 0001](docs/decisoes/0001-upload-tus-na-api.md)).
- **Arquivos:** o resto do sistema só conhece "chaves" (`org_<id>/midias/<id>/...`). Trocar a pasta local por R2 ou S3 é trocar o `core/utils/storage.py`.
- **Isolamento:** toda consulta filtra por `organizacao_id`. Cada espaço só vê o que é dele.

## Decisões técnicas que não aparecem de cara no código

- **Portas:** Mongo 27018, API 8010 e site 3010, no Compose e no `npm run dev`. As do HolyCut (27017, 8000, 3000) ficam livres, porque os dois rodam no mesmo Nitro 5. O backup sai às 03:30, meia hora depois do HolyCut.
- **Licenças em `licencas/`, não na raiz:** os `LICENSE-*` do FilmCraft e do LightCraft têm o copyright do ArtCraft Team. Na raiz, pareceriam a licença do TakeOne inteiro.
- **Organização se chama "espaço" na interface.** No cadastro, o nome é opcional; sem ele, vira "Espaço de <primeiro nome>".
- **Editor:** a lista de mídias fica no `Editor` (um `useMidias` só), e a seleção guarda o id. Assim a prévia e as propriedades acompanham a ingestão sem recarregar. O elemento de vídeo ou áudio da prévia é passado por ref para a linha do tempo mover o cursor.
- **Lint do React 19:** a regra `react-hooks/set-state-in-effect` acusa `setState` depois de `await` dentro de um efeito. Use `.then()`, como em `useMidias`. Props que recebem um ref terminam em `Ref`, senão a regra `react-hooks/immutability` reclama ao atribuir.
- **Next.js 16:** o middleware é `proxy.ts`. O Next guarda na memória o corpo de toda requisição a `/api` e corta em 10 MB; os vídeos passam porque o tus manda pedaços de 8 MB.

## Rodar e testar

- Tudo: `docker compose up --build`, com o site em http://localhost:3010. Portas e pasta de armazenamento ficam no `.env` (veja o `.env.example`).
- Python: `ruff check .` e `pytest`. Os testes de integração criam um banco `takeone_teste_*` e o apagam no fim, e o `conftest` recusa qualquer outro banco.
- Os testes com FFmpeg são pulados quando ele não está instalado. Em Windows sem FFmpeg, rode-os dentro da imagem do worker.
- Site: `npm run lint`, `npm run typecheck` e `npm run build`, dentro de `apps/web`.
- O CI (GitHub Actions) roda lint e testes do Python, com FFmpeg, e lint, tipos e build do site. Todo push precisa terminar verde.
