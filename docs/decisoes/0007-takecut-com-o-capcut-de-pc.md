# ADR 0007 — Takecut: o layout e as funções a partir do CapCut de PC

Data: 04/11/2026. Pedido do dono: "melhorar as funções e o layout do Takecut, pois agora temos o CapCut completo para
análise", com o REA. A análise anterior (fase 1 e seção "Do CapCut" do plano) foi feita na versão web, que mostra
pouco; agora o dono instalou o CapCut 9.7 de PC. Este documento é o plano (as partes, com a caixa marcada quando cada
uma estiver pronta) e as decisões que o sustentam.

## De onde vem

- **CapCut 9.7.0.4153 de PC**, analisado em 04/11/2026 sem abrir o programa e sem ler os dados do usuário. É um
  programa nativo (C++ com Qt 6), não Electron: o REA fez o inventário da pasta instalada, mas a captura das telas de
  programa nativo só existe no macOS e a descompilação pediria o Ghidra em DLLs de 150 a 270 MB. As telas vieram do
  QML que o `VECreator.dll` guarda em texto (2.063 arquivos) e dos textos da interface (`pt-BR.po` e `en.po`, umas 18
  mil frases). Os cinco relatórios (layout, materiais, propriedades e linha do tempo, IA, início/exportação/atalhos)
  ficam fora do repositório, em `REA/analise/capcut-pc/`. Só a ideia do layout e das funções vem dele; nada de código,
  ícones, textos, efeitos, filtros, modelos, músicas nem o nome na interface.
- **O que o CapCut não mostra no QML** (fica no C++): os tamanhos padrão dos painéis, a altura das faixas, as faixas de
  vários controles e as listas da exportação. Onde o relatório não achou o número, o Takecut decide pelo uso.

### O que muda em relação ao Takecut de hoje

| Parte | CapCut de PC | Takecut hoje |
|---|---|---|
| Esqueleto | quatro painéis em cartões (raio 8, vão de 8 px); a linha do tempo de ponta a ponta embaixo; ferramentas em abas deitadas em cima do painel de materiais | coluna de ferramentas e painel de conteúdo na altura toda; a linha do tempo só embaixo da prévia |
| Barra de cima | Menu, salvo às hh:mm, nome do projeto no centro, layouts prontos e Exportar | layout, tema, salvar como modelo e Exportar |
| Materiais | dois níveis (abas e categorias que acompanham a rolagem), busca, favoritos e recentes, cartões com miniatura e prévia ao passar o mouse, arrastar tudo para a linha, selo "Adicionado", "Aplicar a todos" nas transições | tudo empilhado numa coluna; efeitos, filtros e transições como botões de texto; busca só nas animações |
| Propriedades | abas numa linha e sub-abas; cada bloco com ligar/desligar, Redefinir, keyframe do grupo e recolher; vários clipes de uma vez; detalhes do projeto sem nada escolhido; mais de 80 propriedades com keyframe | abas largas; a aba Básico com quase tudo dentro de "Posição e tamanho"; um clipe por vez; 6 propriedades com keyframe; 3 fontes no texto do vídeo |
| Linha do tempo | barra completa (desfazer, modo do mouse, ímãs, vínculo, ajustar zoom), menu do botão direito, seleção em caixa, alças de fade e linha de volume no clipe, selos, prévia seguindo o mouse, cabeçalho das faixas dobrável e com altura, estado vazio clicável, grupos e clipes compostos | barra curta, sem menu de contexto nem seleção em caixa |
| IA | quase toda na nuvem e paga (legendas, voz, geração, agente); local: recorte, cenas, batidas, ruído, reenquadrar, reiluminar, retoque. O assistente executa ferramentas e o plano vem do servidor; a "análise do projeto" sugere correções | transcrição, limpeza, "Criar automaticamente", "Peça uma edição", legendas, Clipar, tudo local e sem custo |
| Início e saída | criar arrastando arquivos com proporção automática, projetos com busca, ordem e Lixeira de 30 dias; exportação com vídeo, áudio, GIF e legendas ligáveis juntos, nome do arquivo, qualidade, capa, transparência e aviso ao terminar; tour de 6 passos; atalhos em 5 conjuntos | uma saída por vez, sempre `video.mp4`; projetos sem busca nem lixeira; janela de atalhos simples |

O Takecut já está à frente em várias coisas que a reorganização não pode perder: expressões nos keyframes,
multicâmera, esconder rostos e objetos, chave de luminância, camada de ajuste, igualar a cor, abaixar na fala, nivelar
a voz, ajustar a música, o Clipar e a IA toda local.

## Fora do escopo, com o motivo

- Clonagem de voz, vozes personalizadas, "overdub", dublagem e correção de olhar: vetados pelo dono.
- O que o CapCut faz na nuvem com créditos (geração de música e de fontes, editar vídeo por texto, efeitos de IA
  pagos): só entra o que um modelo aberto faz no Nitro; apagar e expandir vídeo com IA ficam de fora (o modelo aberto
  mais usado não é de uso comercial).
- Plugins nativos (VST, OFX): não cabem num editor web.
- Banco de músicas comercial: só com licença; um banco CC0 curado depende do dono.

## Decisões técnicas

1. **O Takecut e o Takepro continuam com os mesmos componentes.** A casca nova (linha do tempo de ponta a ponta,
   abas deitadas, cartões) é do Takecut; os painéis, as abas e os comandos são os mesmos, e cada melhoria comum é
   conferida nos dois layouts.
2. **Nada muda no render por causa do layout.** As partes de interface (menus, seleção, selos, cartões) não mexem no
   projeto; as que mudam o projeto (vários clipes, aplicar a todos, keyframes novos) passam pelos comandos de sempre,
   com desfazer, e as propriedades novas com keyframe entram na conta da prévia e do render ao mesmo tempo, medidas em
   números como sempre.
3. **O assistente fica no navegador e o plano no Qwen3.** Como o modelo é de 8B, um passo de roteamento escolhe o
   grupo de ações antes do plano (cabendo no contexto de 8.192), e o que ele não sabe fazer vira um "levar à função".
4. **IA nova só com licença aberta, na CPU quando der:** Demucs v4 (MIT) para separar voz e música, SigLIP 2
   (Apache-2.0) para buscar por cena, SFace (Apache-2.0) para agrupar rostos, um detector de cortes de cena aberto, e o
   que já temos (MODNet, MobileSAM, Depth Anything, Real-ESRGAN).

## Para o dono decidir

- **Ordem:** o dono pediu para terminar antes os personagens (onda 15); o álbum de fotos é a onda 16. Esta é a onda 17,
  a menos que o dono a queira antes do álbum.
- **HEVC na exportação:** o libx265 é GPL, como o libx264 que já usamos.
- **Banco de músicas:** curado pelo dono, com licença CC0 ou comercial.

## Partes

- [x] 17.1 Casca: a linha do tempo de ponta a ponta, as ferramentas em abas deitadas em cima do painel de conteúdo, os
  painéis em cartões, a barra de cima com Menu, "salvo às hh:mm" e o nome no centro, layouts prontos com Redefinir, e os
  detalhes do projeto nas propriedades quando nada está escolhido.
- [ ] 17.2 Linha do tempo: a barra completa (desfazer, refazer, modo do mouse, ajustar o zoom), o menu do botão
  direito, a seleção em caixa, as alças de fade e a linha de volume no clipe, os selos (velocidade, efeito, keyframes),
  a prévia seguindo o mouse, o cabeçalho das faixas dobrável e com altura ajustável, o estado vazio clicável e o cursor
  que avisa o encaixe.
- [ ] 17.3 Materiais: a navegação em dois níveis, os cartões com miniatura (o filtro no quadro do clipe escolhido) e a
  prévia ao passar o mouse, arrastar efeitos, filtros, transições e textos para a linha, busca, filtro, ordem e grade ou
  lista na mídia, o selo "No projeto", favoritos e recentes, "Aplicar a todos os cortes" nas transições, os áudios do
  espaço no painel Áudio e extrair o áudio de um vídeo.
- [ ] 17.4 Propriedades: as abas numa linha e as sub-abas, a aba Básico em grupos recolhíveis (com ligar, Redefinir e o
  keyframe do grupo), vários clipes de uma vez, "Aplicar a todos", cobrir, caber e alinhar, a velocidade em × com a
  duração editável e o tom opcional, as fontes do editor de imagem no texto do vídeo e os modos de mesclagem que faltam.
- [ ] 17.5 Keyframes: cor, filtro, LUT, máscara, tela verde e texto com keyframe, na prévia e no render.
- [ ] 17.6 IA no Takecut: "Melhorar o projeto" (uma análise de loudness, ruído, tremor, cor e legenda com "aplicar em
  todos"), o assistente flutuante com o roteador e o plano em etapas, a transcrição como editor completo, a IA no
  botão direito do clipe, casar um roteiro colado com a fala, dividir por cena, separar voz e música e buscar por cena.
- [ ] 17.7 Início e exportação: criar projeto arrastando arquivos (com a proporção da primeira mídia), a lista de
  projetos com busca, ordem, renomear, duplicar e Lixeira de 30 dias, e a exportação com vídeo, áudio, GIF e legendas
  ligáveis juntos, o nome do arquivo, a qualidade com a estimativa de tamanho, a capa, a transparência e o aviso do
  navegador ao terminar.
- [ ] 17.8 Atalhos e primeira vez: a janela de atalhos em abas com busca, os atalhos que faltam para funções que já
  existem, atalhos editáveis com conjuntos prontos sem nome de marca, o tour de 6 passos, as novidades e as preferências
  do vídeo.
- [ ] 17.9 Gravar tela e câmera pelo navegador, com o microfone, a contagem e as faixas separadas.
