# ADR 0005 — Personagens: criar uma pessoa uma vez e usá-la nas imagens e nos vídeos gerados

Data: 04/11/2026. Pedido do dono: criar um personagem (o exemplo é a Rose, feita por ele no Nano Banana), escolher o
personagem na hora de gerar, subir uma imagem de referência (o produto) e escrever o que deve acontecer, e sair com uma
imagem nova ou um vídeo, com a personagem falando com uma das vozes prontas. Este documento é o plano (as partes, com a
caixa marcada quando cada uma estiver pronta) e as decisões que o sustentam.

## A regra mudou

Até aqui, avatar de IA, personas e lip-sync estavam fora do escopo. O dono liberou em 04/11/2026:

- **Liberado:** personagens para gerar imagens e vídeos, e a personagem falando, com a boca seguindo a fala, nas vozes
  prontas do texto em fala (Dora, Alex e Santa, do Kokoro).
- **Continua fora:** clonagem de voz, dublagem (traduzir a fala de um vídeo gravado) e correção de olhar.

## O exemplo do dono

- A imagem: a Rose no sofá, segurando almofadas de Natal bordadas, em 720 × 1280.
- O vídeo: 576 × 1024, 24 quadros por segundo, 7,9 s, com música; a câmera anda devagar ao longo das almofadas e uma
  mão as toca. O rosto da Rose não aparece, e as almofadas do vídeo não são as da imagem (o gerador inventou outras).
- A meta: chegar a esse tipo de movimento guardando o rosto da personagem e o produto de verdade.

## O limite da máquina

RTX 3070 Ti de 8 GB e 16 GB de RAM (12 GB no WSL). Os modelos de vídeo de 14 bilhões de parâmetros (Wan 2.2 A14B, o
S2V, o InfiniteTalk) não cabem; o teto de vídeo é o Wan 2.2 TI2V-5B, que já está no ComfyUI. Por isso o Wan 5B não
recebe o personagem como referência: ele guarda o rosto quando o rosto já está no primeiro quadro. O caminho é sempre
imagem primeiro (com o personagem e o produto), depois o movimento, depois a fala.

## Candidatos (a confirmar na medição)

| Para quê | Modelo | Licença | Por que |
|---|---|---|---|
| Imagem com o personagem e o produto | FLUX.2 [klein] 4B | Apache-2.0 (o 9B não é) | várias imagens de referência, 4B cabe em 8 GB |
| Idem, a alternativa | Qwen-Image-Edit-2511 (GGUF) | a conferir | melhor em pessoas, mas 20B: só reduzido e com offload |
| Movimento | Wan 2.2 TI2V-5B (já instalado) | Apache-2.0 | o único que cabe; medir em 720p e emendando trechos |
| Movimento mais rápido | FastWan 2.2 5B | a conferir | 3 passos no lugar de 20 |
| Boca seguindo a fala | MuseTalk 1.5 | MIT (os pesos, a conferir) | refaz só a boca, 4 a 8 GB |
| Idem, a alternativa | LatentSync 1.5 | código Apache-2.0, pesos openrail++ (a conferir) | 8 GB no mínimo |
| Idem, de uma foto e da fala | EchoMimicV3 1.3B | Apache-2.0 | anima o corpo pela fala; pede mais de 8 GB sem dividir |
| Rosto igual, medido | SFace (OpenCV Zoo) | Apache-2.0 | a distância entre o rosto da personagem e o gerado |
| Fala | Kokoro-82M (já instalado) | Apache-2.0 | as vozes prontas |

Ficam de fora: o Wav2Lip (só pesquisa), o InstantID e o IP-Adapter FaceID (usam o insightface, que não é comercial), o
FLUX.1 Kontext dev e o FLUX.2 [klein] 9B (licença não comercial).

## Medido até aqui (04/11/2026)

- **Imagem:** o FLUX.2 [klein] 4B pôs a Rose com a almofada de referência na mesma cena.
- **Fala, primeiro caminho:** o Wan 5B anima e o MuseTalk refaz a boca. A boca saiu borrada, como um remendo colado.
- **Fala, segundo caminho:** o EchoMimicV3 1.3B (Flash, Apache-2.0), a partir da foto e da fala, foi bem melhor. A boca
  é de gente, ela pisca, mexe a cabeça e gesticula, sem tremido. O rosto ficou entre 0,68 e 0,79 do SFace com a foto.
  - Em 480 × 848 e 25 quadros por segundo, cabe na placa de uma vez só até 3,2 s (81 quadros).
  - Passando disso, a memória transborda e o driver cai.
- **Decisão do dono (05/11/2026):** o vídeo da personagem falando é gerado em trechos emendados. Para os 9,8 s da fala
  de teste, foram 4 trechos de 81 quadros, cada um começando nos 8 últimos quadros do anterior e misturado na emenda.
  - Sem o TeaCache, para não travar a boca, e com a força da voz em 4,5.
  - Mediu 21 min no total (3,5 min carregando os modelos) e pico de 5,5 GB na placa.
  - O rosto cai de 0,77 no começo a 0,55 no fim: continua sendo ela, mas cada emenda perde um pouco.
  - A almofada troca de desenho a partir do segundo trecho.
  - O próximo passo da 15.4/15.5 é guardar o rosto e o produto em todos os trechos.

## Partes

- [ ] 15.1 Medir: os modelos acima no Nitro, com a Rose e fotos de produto. O rosto pela distância do SFace, o produto
  pelo olho e por uma medida de cor e forma na região dele, o tempo e o pico de memória (sem travar o Docker). Escolher
  um modelo de imagem, a resolução e a duração do vídeo e o modelo da boca.
- [ ] 15.2 Personagens: uma página no hub e uma coleção do espaço. Nome, descrição, de 1 a 4 fotos (rosto e corpo) ou
  gerar a partir da descrição, e a voz padrão dela (uma das vozes prontas, com a velocidade).
- [ ] 15.3 Imagem com personagem: no "Gerar imagem com IA" (página, editor de imagem e painel Mídia), escolher o
  personagem, as imagens de referência e a descrição; de 1 a 3 variações.
- [ ] 15.4 Vídeo com personagem: a imagem de abertura (da 15.3, para aprovar) animada pelo Wan, em 720p e mais longo
  emendando trechos; e o começo e fim, se a medição mostrar que o Wan 5B segura o último quadro.
- [ ] 15.5 A personagem falando: o texto, a voz dela, a fala pelo Kokoro e a boca seguindo a fala no vídeo (ou numa
  imagem, que vira vídeo).
- [ ] 15.6 Repetir até o dono aprovar: a cada rodada, o nosso resultado ao lado do exemplo dele, com os números.

## O que esperar

O Nano Banana e os geradores de vídeo comerciais são modelos muito maiores. Aqui a meta é 720p, alguns segundos por
trecho e dezenas de minutos por vídeo; mãos e texturas finas erram mais, e cada geração ocupa a placa inteira (a
transcrição e o LLM esperam na fila).
