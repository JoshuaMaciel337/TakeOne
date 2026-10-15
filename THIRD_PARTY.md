# Código e material de terceiros

O que veio de fora do TakeOne, de onde e com que licença. Todo arquivo copiado ou portado de outro projeto leva no topo a origem e a licença, e entra nesta lista no mesmo commit.

## HolyCut

Projeto do mesmo dono ([JoshuaMaciel337/HolyCut](https://github.com/JoshuaMaciel337/HolyCut)). Na fase 0 vieram de lá, adaptados e sem as partes de igreja:

- `core/`: configuração, Mongo, fila de jobs, armazenamento por chaves e FFmpeg
- `apps/api/`: sessão, organizações, jobs, eventos ao vivo, upload tus e mídias
- `apps/worker/`: laço do worker, tarefas `teste` e `ingestao`
- `infra/`: Dockerfiles e agendador de backup
- `apps/web/src/lib/`: sessão, eventos ao vivo e envios
- `tests/`, `compose.yaml`, `.github/workflows/ci.yml`

Os dois projetos continuam independentes: nada de código compartilhado, banco ou login em comum.

## FilmCraft e LightCraft (storytold)

- [storytold/filmcraft](https://github.com/storytold/filmcraft): MIT ou Apache-2.0, à escolha. Copyright (c) 2026 ArtCraft Team and the FilmCraft contributors.
- [storytold/lightcraft](https://github.com/storytold/lightcraft): MIT ou Apache-2.0, à escolha. Copyright (c) 2026 ArtCraft Team and the LightCraft contributors.

Os textos das licenças e o `NOTICE` de cada um estão em [`licencas/filmcraft/`](licencas/filmcraft) e [`licencas/lightcraft/`](licencas/lightcraft).

Portado do FilmCraft (commit `5231852`), com a origem no topo de cada arquivo:

| No TakeOne | Origem no FilmCraft | O que mudou |
| --- | --- | --- |
| `apps/web/src/lib/tempo.ts` e `core/utils/tempo.py` | `crates/time/src/lib.rs` | Traduzido para TypeScript e Python, só a parte que o editor usa |
| `apps/web/src/lib/projeto/edicao.ts` | `crates/edit/src/lib.rs` | Escrito em TypeScript, com as regras do CapCut (faixa principal magnética) |
| `apps/web/src/lib/tempo.test.ts` | testes de `crates/time/src/lib.rs` | Casos traduzidos para o `node:test` |

O sistema de comandos (`lib/projeto/comandos.ts`) segue a ideia do `crates/engine`, mas o código é do TakeOne. Do LightCraft ainda não há nada. Ao portar:

- O arquivo portado diz no topo de onde veio (repositório, caminho e commit) e a licença ("MIT OR Apache-2.0").
- O `crates/segment` do LightCraft é **só Apache-2.0**, porque deriva do SAM 3 dos Transformers. Código portado dele segue só a Apache-2.0, com o aviso de modificação.
- A marca ArtCraft (nome, logotipo e o que está em `docs/brand/`) não é coberta pelas licenças e não entra no TakeOne.
- Fontes e imagens desses repositórios têm licença própria (OFL, domínio público, CC0) e só entram com o arquivo de licença ao lado.

## Bibliotecas

As dependências estão em `apps/api/requirements.txt`, `apps/worker/requirements.txt` e `apps/web/package.json`. Só entram bibliotecas com licença permissiva (MIT, BSD, Apache-2.0, ISC). Os ícones são do [Lucide](https://lucide.dev) (ISC), e as fontes Inter e Sora (OFL) vêm do Google Fonts pelo `next/font`. As fontes que vão para dentro do vídeo (Montserrat, Inter e Caveat, OFL) ficam em `core/fontes`, com o texto da licença de cada uma ao lado.

## Programas e modelos usados pelos workers

Não fazem parte do código do repositório: são baixados quando a imagem do Docker é montada.

- **DeepFilterNet 0.5.6** ([Rikorose/DeepFilterNet](https://github.com/Rikorose/DeepFilterNet)), MIT ou Apache-2.0: o binário `deep-filter`, com o modelo DeepFilterNet3 dentro, tira o ruído da voz no worker de CPU. Baixado no `worker.Dockerfile`, conferido pelo SHA-256.
- **MODNet** ([ZHKKKe/MODNet](https://github.com/ZHKKKe/MODNet)), Apache-2.0: o recorte de retrato que recorta o fundo do vídeo, em ONNX (a cópia do [Xenova/modnet](https://huggingface.co/Xenova/modnet), Apache-2.0, numa revisão fixa), rodado pelo onnxruntime (MIT) no worker de CPU. Baixado no `worker.Dockerfile`, conferido pelo SHA-256.
- **YuNet 2023mar** ([opencv/opencv_zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)), MIT, Copyright (c) 2020 Shiqi Yu: o detector de rostos do reenquadramento, rodado pelo OpenCV (Apache-2.0) no worker de CPU. Baixado no `worker.Dockerfile`, conferido pelo SHA-256.
- **faster-whisper** (MIT) e o modelo **large-v3-turbo** do Whisper (MIT): transcrição no worker de GPU. O modelo vem do Hugging Face na primeira transcrição e fica no volume `modelos_ia`.
