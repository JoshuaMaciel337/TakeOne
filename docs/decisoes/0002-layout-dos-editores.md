# ADR 0002 — Os editores com o layout dos programas profissionais

Data: 23/10/2026. Pedido do dono: quem vem do editor de imagem e do editor de vídeo profissionais mais usados deve abrir o TakeOne e achar cada coisa onde está acostumado, com os mesmos nomes, sem precisar reaprender. A identidade do TakeOne fica nas cores, na marca e nas funções que só ele tem.

## Referências

- **Editor de imagem:** o PhotoCraft (storytold/photocraft, MIT/Apache), que reproduz o editor de imagem profissional mais usado (área de trabalho "Essenciais").
- **Editor de vídeo:** o FilmCraft (storytold/filmcraft, MIT/Apache), que reproduz o editor de vídeo profissional mais usado (área de trabalho "Edição").
- **Cor:** o LightCraft (storytold/lightcraft) e o painel de cor do FilmCraft (seções Correção básica, Criativo, Curvas, Rodas de cor, HSL secundário e Vinheta).
- **Efeitos:** o EffectCraft (storytold/effectcraft), nas pastas do navegador de efeitos e nos controles de efeito com cronômetro.

O estudo de cada um (posições, nomes, ordem, atalhos) foi feito no código deles em 23/10/2026. Só a ideia do layout é usada: nenhum código, ícone ou nome de marca deles entra no TakeOne, e a interface não cita marca nenhuma (nem a dos programas que eles imitam).

## Decisão

As duas telas seguem a estrutura das referências, traduzida para o português que os programas usam no Brasil:

- **Barra de menus** no topo, com os menus na ordem dos programas e os atalhos de sempre.
- **Grupos de painéis com abas**, cada um com o menu "≡" (fechar, recolher, restaurar), redimensionáveis, e **áreas de trabalho** prontas (escolhidas no topo ou em Janela › Áreas de trabalho), lembradas no navegador. Painéis fechados voltam pelo menu Janela.
- **Ferramentas** numa coluna estreita, com atalhos de uma letra e grupos que abrem com o botão direito.
- **Barra de status** embaixo (imagem) e código de tempo azul grande (vídeo).

As funções que só o TakeOne tem entram no lugar mais parecido que os programas têm para elas (abaixo). O celular continua com a tela simplificada de hoje.

## Editor de imagem (área "Essenciais")

| Lugar | Conteúdo |
|---|---|
| Barra de menus | Arquivo, Editar, Imagem, Camada, Texto, Selecionar, Filtro, Exibir, Janela, Ajuda; título no meio; à direita, área de trabalho, tema e Exportar |
| Barra de opções | As opções da ferramenta escolhida (ícone da ferramenta à esquerda) |
| Ferramentas (esquerda) | Mover (V); Letreiro retangular e elíptico (M); Laço e Laço poligonal (L); Seleção de objeto (W); Corte (C); Conta-gotas (I); Remover (J); Texto (T); Retângulo, Elipse, Triângulo, Polígono, Linha e Forma personalizada (U); Mão (H); Zoom (Z); cores de primeiro plano e de fundo (D, X) |
| Documento | Aba "nome @ 50% (camada)", tela com zoom e rolagem |
| Barra de status | Zoom em %, tamanho do documento |
| Painéis (direita) | [Cor \| Amostras], [Propriedades \| Ajustes], [Camadas \| Histórico]; em Janela também Biblioteca, Modelos e Formas |

O que vai para onde:

- **Biblioteca** (painel) junta as imagens do espaço, o envio e "Gerar imagem com IA". **Modelos** vira painel e também Arquivo › Novo a partir de modelo.
- **Objeto** (clique e pincel) vira as ferramentas Seleção de objeto e Remover; apagar e recortar o que foi selecionado ficam na barra de opções e no menu Editar (Preenchimento sensível ao conteúdo, Camada via recorte).
- **Foto com IA:** Ampliar e Expandir em Imagem › Tamanho da imagem com IA e Tamanho da tela com IA, e nas Ações rápidas de Propriedades, junto com Remover fundo, Desfocar fundo e Melhorar.
- **Elementos** viram a ferramenta Forma (desenhar arrastando) e o painel Formas.
- **Fundo e tamanho:** o tamanho em Imagem › Tamanho da tela; a cor de fundo é a cor de fundo do documento (Propriedades do documento).
- **Efeitos** do clipe ficam em Filtro; a cor (camadas de ajuste) em Imagem › Ajustes e no painel Ajustes; contorno e sombra em Camada › Estilo de camada (o botão "fx" do painel Camadas).

## Editor de vídeo (área "Edição")

| Lugar | Conteúdo |
|---|---|
| Barra de menus | Arquivo, Editar, Clipe, Sequência, Marcadores, Gráficos e títulos, Exibir, Janela, Ajuda; título no meio; à direita, área de trabalho, tema e Exportar |
| Em cima à esquerda | [Controles de efeito \| Metadados] |
| Em cima no meio | Programa (o monitor, com os controles embaixo) |
| Em cima à direita | [Propriedades \| Gráficos essenciais \| Texto] |
| Embaixo à esquerda | [Projeto \| Efeitos \| Marcadores \| Histórico] |
| Embaixo | Ferramentas (coluna) \| Linha do tempo \| Medidores de áudio |

O que vai para onde:

- **Mídia** vira o painel Projeto (ícones ou lista, busca, "Novo item": Camada de ajuste, Gerar vídeo com IA, Gerar imagem com IA, Texto em fala, Montar com vários clipes).
- **Efeitos, Transições e Filtros** viram o painel Efeitos, em pastas: Predefinições de cor, Efeitos de vídeo, Transições de vídeo, Efeitos de áudio, Transições de áudio.
- **Texto, Legendas e Transcrição** viram o painel Texto, com as abas Transcrição, Legendas e Gráficos. O "Criar automaticamente" fica no topo da Transcrição e em Sequência.
- **Elementos, Modelos e animações** viram Gráficos essenciais (abas Navegar e Editar). O **Kit de marca** fica em Janela › Kit de marca (o lugar das bibliotecas da equipe).
- **Áudio** (texto em fala, narração, música) vira o painel Som essencial (Diálogo, Música, Efeitos sonoros, Ambiente). A narração também ganha o microfone no cabeçalho das faixas de áudio.
- O **painel de propriedades de hoje** se divide: Controles de efeito (Movimento, Opacidade, Remapeamento de tempo, Volume e os efeitos, com os keyframes à direita) e Cor (Correção básica, Criativo, Curvas, Rodas de cor e correspondência, HSL secundário, Vinheta). As funções de IA do clipe (recorte do fundo, seguir rosto e objeto, estabilizar, esconder rostos, multicâmera, foto em 3D) ficam em Clipe e em Propriedades.
- **Linha do tempo:** faixas V1, V2… acima de A1, A2…; cabeçalho com travar, ligar a saída, mudo e solo; código de tempo azul em cima à esquerda, com ímã, seleção vinculada, marcador e configurações.
- **Ferramentas:** Seleção (V), Seleção de faixa adiante (A), Edição em ondulação (B), Edição contínua (N), Esticar a velocidade (R), Navalha (C), Deslizar (Y), Mão (H), Zoom (Z) e Texto (T).
- **Programa:** marcador (M), entrada (I) e saída (O), ir para a entrada e a saída, quadro anterior e seguinte, reproduzir, elevar (;) e extrair ('), exportar quadro.
- **Atalhos:** os de sempre (J, K e L; I e O; C; V; Q e W; + e - de zoom).

Outras áreas de trabalho: Montagem, Cor, Efeitos, Áudio e Legendas e gráficos, com os mesmos painéis em outra disposição.

## Ondas

1. **Fundação:** barra de menus, grupos de painéis com abas, áreas de trabalho guardadas e barra de status, compartilhados pelos dois editores.
2. **Editor de imagem:** layout, ferramentas, barra de opções, Camadas, Propriedades e Ajustes, Histórico, Cor e Amostras.
3. **Editor de vídeo:** layout da Edição, Projeto, Efeitos, Texto, Gráficos essenciais, monitor Programa, cabeçalhos da linha do tempo e medidores.
4. **Controles de efeito** com os keyframes, **Cor** nas seções do painel de cor e **Som essencial**.
5. **Ferramentas da linha do tempo** (navalha, ondulação, contínua, velocidade, deslizar), entrada e saída com elevar e extrair, e os atalhos.
6. **Monitor de origem** (Fonte), com Inserir e Sobrescrever.
7. **As outras áreas de trabalho** e os ajustes finais (celular, testes, documentação).

## O que fica para o dono confirmar

- Se o tema padrão fica o escuro de hoje (com a cor de destaque do TakeOne) ou passa ao cinza médio dos programas.
- Se a área de trabalho padrão do vídeo fica a "Edição" ou a "Montagem" (mais simples, com o Projeto grande).
