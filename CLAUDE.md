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

## Estado atual (atualizado em 13/10/2026)

- **Fase 0 (fundação):** pronta, rodando no Docker e com o CI verde no GitHub ([JoshuaMaciel337/TakeOne](https://github.com/JoshuaMaciel337/TakeOne)).
  - Do HolyCut, sem as partes de igreja: config, Mongo, fila com lease, storage, FFmpeg, sessão com organizações ("espaços"), jobs, eventos SSE, upload tus, mídias, ingestão (proxy 720p, forma de onda, níveis, miniaturas e capa), backup e Compose.
  - Site: landing, entrar, cadastro e painel com projetos e biblioteca de mídias.
- **Fase 1 (linha do tempo):** pronta, testada no navegador.
  - Projeto em ticks (`lib/tempo.ts` e `core/utils/tempo.py`, portados do FilmCraft) e API `/api/projetos` (listar, criar, abrir, salvar com versão, excluir). A API confere a linha do tempo antes de salvar e não deixa excluir mídia usada em projeto.
  - Editor em `/app/editor/<id>`: faixa principal magnética, faixas de sobreposição por cima e de áudio por baixo; arrastar da biblioteca ou botão "+", mover entre faixas, aparar, dividir, apagar, duplicar, ímã, zoom (também Ctrl + roda), esconder, silenciar e travar faixa.
  - Desfazer e refazer de tudo, salvamento automático 1,2 s depois de cada mudança, cópia no navegador enquanto não salva e aviso de conflito quando outra aba salvou antes.
  - A prévia toca a linha do tempo com elementos `<video>` e `<audio>` que seguem o relógio do editor. O compositor em WebCodecs/WebGL2 é da fase 2.
  - As ferramentas além de Mídia mostram em que fase chegam. Exportar aparece desligado.
- **Fase 2 (prévia e exportação):** em andamento.
  - Pronto: cada clipe tem `transformacao` (x, y, escala, rotação, opacidade) e `recorte`. A prévia desenha num canvas WebGL2 (`lib/previa/compositor.ts`) com os quadros decodificados pelo WebCodecs (`lib/previa/decodificador.ts`) e o som pelo Web Audio. Dá para selecionar, arrastar, redimensionar e girar direto na prévia; há a aba Básico nas propriedades e a cor de fundo do projeto.
  - Falta: render no worker e o teste que compara prévia e render.
- **Próximo passo:** render no worker (precisa do FFmpeg, então no Nitro ou pelo CI).

## Arquitetura em um minuto

- `apps/api` (FastAPI), `apps/worker` (fila), `apps/web` (Next.js) e `core` (config, Mongo, fila, storage, FFmpeg, compartilhado entre API e worker).
- **Fila no Mongo:** o job tem lease e heartbeat, e o de prioridade maior sai primeiro. `ErroDefinitivo` manda o job para erro sem novas tentativas. Uma tarefa é `Tarefa(executar(db, job, reportar), ao_falhar)`, registrada em `REGISTRO` (`apps/worker/tarefas/__init__.py`) e em `TAREFAS` (`core/modelos/job.py`).
- **Eventos ao vivo:** por SSE, sempre começando com o evento "pronto". Se ele não chegar em 5 s, o site passa a consultar a API a cada 3 s, porque o Quick Tunnel da Cloudflare não entrega SSE.
- **Upload:** tus 1.0.0 dentro da própria API, em pedaços de 8 MB ([ADR 0001](docs/decisoes/0001-upload-tus-na-api.md)).
- **Arquivos:** o resto do sistema só conhece "chaves" (`org_<id>/midias/<id>/...`). Trocar a pasta local por R2 ou S3 é trocar o `core/utils/storage.py`.
- **Isolamento:** toda consulta filtra por `organizacao_id`. Cada espaço só vê o que é dele.

## Decisões técnicas que não aparecem de cara no código

- **Portas:** Mongo 27019, API 8010 e site 3010, no Compose e no `npm run dev`. As do HolyCut (27018, 8000, 3000) ficam livres, porque os dois rodam no mesmo Nitro 5. O backup sai às 03:30, meia hora depois do HolyCut.
- **Licenças em `licencas/`, não na raiz:** os `LICENSE-*` do FilmCraft e do LightCraft têm o copyright do ArtCraft Team. Na raiz, pareceriam a licença do TakeOne inteiro.
- **Organização se chama "espaço" na interface.** No cadastro, o nome é opcional; sem ele, vira "Espaço de <primeiro nome>".
- **Editor:** a lista de mídias fica no `Editor` (um `useMidias` só), e a seleção guarda o id. Assim a prévia e as propriedades acompanham a ingestão sem recarregar.
- **Edição é pura:** as operações de `lib/projeto/edicao.ts` nunca alteram o projeto recebido e lançam `ErroEdicao` com a mensagem para a pessoa. Toda mudança passa por um `Comando` (`comandos.ts`); o histórico guarda os projetos de antes. Durante um arrasto, a linha do tempo aplica o comando a cada movimento e mostra o resultado, sem registrar no histórico.
- **Nome e versão fora do histórico:** desfazer não desfaz o nome do projeto nem volta a `versao` do servidor. O PUT manda a versão que o editor conhece; se o banco tiver outra, a API responde 409 e o editor para de salvar e pede para recarregar.
- **Rascunho no navegador** (`takeone-rascunho-<id>`): só é aplicado ao abrir se foi feito sobre a mesma versão que o banco tem. Se outra aba salvou depois, o rascunho é descartado.
- **Prévia:** um elemento por faixa + mídia, para as duas metades de um clipe dividido usarem o mesmo vídeo sem engasgar. O próximo clipe da faixa já fica montado (escondido) 2 s antes de entrar. O vídeo só é reposicionado quando se afasta mais de 0,3 s do relógio.
- **Arrastar da biblioteca:** o id da mídia vai no nome do tipo do `DataTransfer` (`application/x-takeone-midia-<id>`), porque durante o arrasto o navegador só deixa ler os tipos.
- **Posição do clipe em frações do quadro:** `x` e `y` deslocam o centro em frações da largura e da altura do quadro, e `escala` 1 é a mídia inteira cabendo no quadro. Assim o mesmo projeto vale na prévia pequena e no render em 720p, 1080p ou 4K. A conta está em `lib/projeto/geometria.ts` e `core/utils/geometria.py`, e os dois leem os casos de `tests/casos/geometria.json`. Mudou a conta, mude os dois e os casos.
- **Prévia em canvas:** o canvas desenha a cada quadro da tela enquanto toca e, parado, só quando algo muda. Se uma camada ainda não tem quadro, a prévia mantém o desenho anterior por até 400 ms, para não piscar.
- **Quadros pelo WebCodecs:** o decodificador lê do proxy só o cabeçalho (mp4box) e depois cada grupo de quadros por Range, e decodifica a partir do quadro-chave anterior. O tempo de cada quadro desconta a lista de edição (`elst`), como o FFmpeg faz. Guarda poucos `VideoFrame` abertos, porque o decodificador trava com muitos. Se o WebCodecs falhar (navegador sem ele, arquivo que o leitor não entende), aquele clipe volta para um `<video>` escondido, que pode errar o quadro por um.
- **Som separado da imagem:** o som de todo clipe sai de um `<audio>` próprio, ligado a um ganho do Web Audio (`lib/previa/audio.ts`), que segue o relógio do editor. O contexto de áudio só nasce quando a pessoa aperta reproduzir, porque o navegador exige um gesto.
- **Mudança provisória:** arrastar na prévia ou num controle deslizante do painel muda um `Comando` provisório no `Editor`, que só aparece na tela. Ao soltar, vira comando de verdade e um passo do desfazer.
- **Tick em `number`:** exato até cerca de 9 h 50 min; o projeto vai até 6 h. Contas com taxa de quadros são feitas em BigInt (`BigInt(0)` em vez de `0n`, porque o alvo do TypeScript é ES2017).
- **Testes do site:** `npm test` usa o `node --test` com `--experimental-strip-types`. Por isso os arquivos de `lib/tempo.ts` e `lib/projeto/` importam uns aos outros pelo caminho relativo com `.ts`, sem o alias `@/`.
- **Lint do React 19:** a regra `react-hooks/set-state-in-effect` acusa `setState` depois de `await` dentro de um efeito. Use `.then()`, como em `useMidias`. Props que recebem um ref terminam em `Ref`, senão a regra `react-hooks/immutability` reclama ao atribuir.
- **Next.js 16:** o middleware é `proxy.ts`. O Next guarda na memória o corpo de toda requisição a `/api` e corta em 10 MB; os vídeos passam porque o tus manda pedaços de 8 MB.

## Rodar e testar

- Tudo: `docker compose up --build`, com o site em http://localhost:3010. Portas e pasta de armazenamento ficam no `.env` (veja o `.env.example`).
- Python: `ruff check .` e `pytest`. Os testes de integração criam um banco `takeone_teste_*` e o apagam no fim, e o `conftest` recusa qualquer outro banco.
- Os testes com FFmpeg são pulados quando ele não está instalado. Em Windows sem FFmpeg, rode-os dentro da imagem do worker.
- Site: `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`, dentro de `apps/web`.
- Para mexer no site com a pilha no Docker: `next dev -p 3011` com `API_URL_INTERNA=http://localhost:8010`. O cookie de sessão vale para as duas portas.
- O CI (GitHub Actions) roda lint e testes do Python, com FFmpeg, e lint, tipos, testes e build do site. Todo push precisa terminar verde.
