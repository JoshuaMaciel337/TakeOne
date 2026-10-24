# ADR 0003 — O editor de imagem completo

Data: 23/10/2026. Pedido do dono: "é para ser possível fazer tudo que se faz no Photoshop e no ArtCraft aqui, todas as
ferramentas, sem faltar uma". Este documento é o inventário (a lista do que tem de existir, com a caixa marcada quando
existe) e as decisões técnicas que tornam isso possível. O layout já segue os programas profissionais (ADR 0002).

Fontes do inventário: o editor de imagem profissional mais usado (versão atual, área de trabalho Essenciais), nos
nomes do português do Brasil; o PhotoCraft (storytold/photocraft, 0.6.0), lido no código (67 ferramentas, 631 itens de
menu, 30 painéis, `crates/ui-egui/src/menu_catalog.rs`, `state.rs`, `panels.rs`); e o VectorCraft, o editor vetorial da
mesma suíte, cujas ferramentas entram como camadas vetoriais (onda 13.16). Os nomes das marcas não aparecem na
interface.

## Fora do escopo, com o motivo

- **Retoque de rosto** (Dissolver aplicado a rostos, "Retrato inteligente", Olhos vermelhos, suavizar pele): o dono
  vetou o retoque de pele e rosto (plano, seção 6). O Dissolver geral entra (deformar qualquer imagem com o pincel).
- **3D** (Extrusão 3D, Nova camada 3D, materiais): saiu do próprio programa de referência em 2023.
- **Editar em CMYK, Lab, Multicanal e 16/32 bits**: o navegador desenha em RGB de 8 bits. Esses modos entram onde dá
  de verdade: Escala de cinza, Bitmap, Duotone e Cores indexadas viram conversões do documento; CMYK e Lab entram na
  prova de cores e na exportação (pelo servidor, com perfil ICC livre); 16 e 32 bits aparecem desligados, com o motivo.
- **Verificar ortografia**: o navegador já sublinha no campo de texto.

## Decisões técnicas

1. **O que é só da imagem é desenhado só no navegador.** A exportação da imagem já é no navegador, com o compositor
   da prévia; então camada de pixels, grupos, estilos de camada, filtros novos e texto rico não precisam de conta no
   FFmpeg. A API recusa esses campos num projeto de vídeo (o render não saberia desenhá-los). O que for levado também ao
   vídeo continua com a regra de sempre: a mesma conta no TS e no Python, medida.
2. **Camada de pixels.** Uma mídia própria (`camada_pixels`, fora da biblioteca, como as formas), com um arquivo por
   versão (`v<n>.png`, no tamanho do documento, até 8192 de lado). O clipe guarda `pixels: { versao }`. A edição
   acontece num canvas do navegador por camada; ao soltar o traço (ou 600 ms depois do último traço seguido), o canvas
   vira PNG, sobe em partes de 8 MB (o proxy do Next corta em 10 MB) e o comando `camada.pixels` troca a versão: o
   desfazer volta a versão anterior, que continua no servidor. Enquanto sobe, a prévia mostra o canvas local. Uma tarefa
   apaga as versões que nenhum projeto (nem o histórico de uma aba aberta, com folga de 3 dias) usa.
3. **Árvore de camadas.** Grupos (pastas), máscara de corte, máscara de camada em pixels, máscara vetorial e as
   travas (transparência, pixels, posição, tudo) ficam nas faixas do projeto de imagem (`grupo` aponta a faixa-pasta,
   `recortada` prende na de baixo). O compositor desenha a árvore: um grupo ou uma base de recorte vira um framebuffer,
   e o resultado entra com a opacidade, a mesclagem e a máscara dele.
4. **Seleção do documento.** A seleção é uma máscara em tons de cinza no tamanho do documento, guardada no editor (não
   no projeto), com as formigas andando por cima. Toda ferramenta de seleção escreve nela (nova, somar, subtrair,
   intersectar) e todo o resto (pintar, preencher, apagar, copiar, filtros, ajustes) respeita ela. "Salvar seleção"
   guarda num canal alfa do projeto (uma mídia como a de pixels).
5. **Formas e caminhos vetoriais no navegador.** No projeto de imagem, forma e caminho são dados (pontos de Bézier)
   desenhados com `Path2D`, nítidos em qualquer escala, com combinação (unir, subtrair, intersectar, excluir). As formas
   do vídeo continuam imagens do servidor.
6. **Texto da imagem no navegador.** No projeto de imagem o texto é desenhado no canvas com as mesmas fontes do servidor
   (servidas como `FontFace`), o que permite editar direto na tela, texto de parágrafo com quebra, vertical, em caminho,
   deformado e com estilos misturados. O vídeo continua com o texto do Pillow. Uma biblioteca de fontes livres (OFL e
   Apache) cresce para os dois.
7. **Filtros e estilos de camada em WebGL**, como uma pilha não destrutiva por camada ("filtros inteligentes"), com
   "Rasterizar" para aplicar de vez numa camada de pixels.
8. **Ajustes que são uma conta por pixel** entram na LUT 3D de sempre (TS e Python, para valerem também no vídeo); os
   que têm degrau (limiar, posterizar) ficam numa etapa exata do shader, porque a LUT de 33 pontos os amaciaria.
9. **PSD pelo ag-psd** (MIT), no navegador: abrir um PSD vira um projeto com as camadas (pixels, texto como texto quando
   der, máscaras, mesclagens, grupos), e salvar como PSD leva as camadas de volta.
10. **Preenchimento generativo** com um modelo de licença Apache que pinta dentro de uma máscara a partir de um texto
    (o Wan VACE pelo ComfyUI, que já roda o Wan 2.2); medir no Nitro antes de ligar. Sem ele, o preenchimento sensível ao
    conteúdo (LaMa) continua.

## Inventário

Cada onda junta o que depende da mesma base. [x] existe; [ ] falta.

Já existe (onda 12 e antes): Mover, Letreiro retangular e elíptico, Laço, Laço poligonal, Seleção de objeto (pelo
MobileSAM), Corte simples, Conta-gotas, Remover (pelo LaMa), Texto horizontal (desenhado no servidor), as formas como
imagens, Mão e Zoom; camadas com olho, trava, opacidade, dez modos de mesclagem, máscara de forma e desenhada, contorno e
sombra projetada; camada de ajuste com a cor inteira (níveis, curvas, matiz por faixa, LUT); os efeitos de vídeo (desfoque,
nitidez, clareza, zoom, giro, pixelizar e os outros); remover e desfocar o fundo, ampliar, expandir, gerar imagem e
melhorar; modelos, biblioteca, exportação em PNG, JPG e WebP.

### Onda 13.1 — Árvore de camadas

- [x] Grupos (pastas) com abrir e fechar no painel, mesclagem "Passagem" e as outras, opacidade e máscara do grupo
- [x] Camada › Agrupar camadas (Ctrl+G), Desagrupar (Ctrl+Shift+G), Novo › Grupo, Grupo a partir de camadas
- [x] Máscara de corte: criar e liberar (Ctrl+Alt+G; Alt + clique na camada, no lugar do Alt entre as duas)
- [x] Travas: pixels transparentes, pixels da imagem, posição, tudo, em todas as escolhidas de uma vez (as duas de pixels passam a valer com a pintura, na 13.2)
- [x] Opacidade e Preenchimento (o preenchimento não leva os estilos); teclas 1–0 mudam a opacidade
- [x] Cor do rótulo da camada (11 cores), renomear com duplo clique, Tab vai para a seguinte
- [x] Arrastar na coluna do olho esconde várias; Alt + olho mostra só essa
- [x] Várias camadas escolhidas (Shift e Ctrl no painel, Shift na prévia), mover, alinhar e distribuir juntas
- [x] Alinhar (topos, centros verticais, bases, esquerdas, centros horizontais, direitas) e Distribuir (os seis, e "horizontalmente" e "verticalmente"), à seleção ou à tela
- [x] Vincular camadas e Selecionar camadas vinculadas
- [x] Organizar › Inverter; Alt+[ e Alt+] escolhem a camada de baixo e a de cima
- [x] Filtro do painel Camadas (tipo, nome, modo, efeito, atributo, cor)
- [x] Excluir › Camadas ocultas; Excluir › Grupos vazios
- [x] Menu de contexto do painel Camadas com a lista de lá
- [x] Os 27 modos de mesclagem (faltam: dissolver, subexposição de cores, queimar linear, cor mais escura, subexposição linear, cor mais clara, luz suave, luz vívida, luz linear, luz do ponto, mistura sólida, subtrair, dividir, matiz, saturação, cor, luminosidade); a roda do mouse anda pela lista
- [x] Compositor em árvore (framebuffers para grupos e bases de recorte), na prévia e na exportação
- [x] API: os campos novos só valem em projeto de imagem

### Onda 13.2 — Camadas de pixels e o pincel

- [x] Camada de pixels (Camada › Nova › Camada, Ctrl+Shift+N), com versões no servidor e edição no navegador
- [x] Camada de fundo (travada embaixo) e "Camada a partir do fundo"
- [x] Pincel (B): tamanho, dureza, opacidade, fluxo, aerógrafo, suavização (corda puxada, recuperar o traço), pressão no tamanho e na opacidade, modo (os 27 e Limpar)
- [x] Lápis (B), com "Apagar automaticamente"
- [x] Borracha (E): pincel, lápis e bloco; com a transparência travada, pinta a cor de fundo (a camada de fundo vem com o item dela)
- [x] Painel Pincéis: predefinições em pastas (gerais, materiais secos, molhados e efeitos especiais), busca, tamanho da miniatura, importar .abr, Novo pincel predefinido
- [x] Painel Configurações do pincel (F5): forma da ponta (ângulo, arredondamento, espaçamento, virar), dinâmica de forma, dispersão, textura, pincel duplo, dinâmica de cor, transferência, pose, ruído, bordas molhadas, acúmulo, suavização, proteger textura, travas das seções, prévia do traço
- [x] Simetria da pintura (vertical, horizontal, dois eixos, diagonal, radial, mandala)
- [x] [ e ] mudam o tamanho, Shift+[ e Shift+] a dureza; Alt + botão direito arrastando muda os dois
- [x] Máscara de camada pintável: Adicionar (revelar tudo, ocultar tudo, a partir da transparência), pintar em preto e branco, Densidade e Difusão, Inverter, Aplicar, Excluir, Ativar e desativar (Shift + clique), Vincular, Ctrl+\ mira a máscara, Alt + clique mostra só a máscara
- [x] Rasterizar (camada, que vale para texto, forma, imagem e objeto; estilo; todas). O preenchimento e a máscara vetorial entram com as camadas deles (13.5 e 13.6)
- [x] Mesclar para baixo (Ctrl+E), Mesclar visíveis (Ctrl+Shift+E), Achatar imagem, Carimbar para baixo (Ctrl+Alt+E), Carimbar visíveis (Ctrl+Alt+Shift+E), Mesclar grupo
- [x] Pincel do histórico (Y) e Pincel do histórico artístico, com a fonte escolhida no Histórico
- [x] Instantâneos no Histórico; Alternar o último estado (Ctrl+Alt+Z)
- [x] Limpeza das versões antigas no servidor

### Onda 13.3 — Seleção

- [x] Seleção do documento com as formigas andando; Ctrl+H esconde as bordas
- [x] Modos novo, somar (Shift), subtrair (Alt) e intersectar (Shift+Alt) em toda ferramenta de seleção
- [x] Letreiro retangular e elíptico com Difusão, Suavização de serrilhado e Estilo (normal, proporção fixa, tamanho fixo); Alt desenha do centro, Espaço reposiciona
- [x] Letreiro de linha única e de coluna única
- [x] Laço e Laço poligonal (Shift trava em 45°)
- [x] Laço magnético (largura, contraste, frequência)
- [x] Varinha mágica (tolerância, contígua, todas as camadas)
- [x] Seleção rápida (pincel que cresce a seleção, aprimorar borda)
- [x] Seleção de objeto com o localizador de objetos (passar o mouse realça), por retângulo ou por clique
- [x] Selecionar › Tudo, Desmarcar, Selecionar novamente, Inverter
- [x] Selecionar › Converter em forma (feito com os caminhos, na 13.7)
- [x] Intervalo de cores (cores amostradas, as faixas de cor, realces, meios-tons, sombras, tons de pele; imprecisão; conta-gotas + e −)
- [x] Área de foco; Assunto (a pessoa, pelo MODNet); Céu (pela linha do céu, sem modelo)
- [x] Modificar › Borda, Suavizar, Expandir, Contrair, Difusão (Shift+F6)
- [x] Aumentar e Semelhante
- [x] Transformar seleção (escala, girar, inclinar, distorcer, perspectiva, deformar)
- [x] Máscara rápida (Q) com pintura
- [x] Seleção pela transparência da camada (Ctrl + clique na miniatura; Shift soma, Alt subtrai) e pela máscara dela
- [x] Salvar e Carregar seleção (canais alfa; luminosidade com Ctrl+Alt+2); painel Canais
- [x] Selecionar e mascarar (Ctrl+Alt+R): vistas (casca de cebola, formigas, sobreposição, no preto, no branco, preto e branco, nas camadas), pincel de refinar borda, raio e raio inteligente, suavizar, difusão, contraste, deslocar borda, descontaminar cores, saída (seleção, máscara, camada nova, com máscara, documento novo)
- [x] Encontrar camadas (Ctrl+Alt+Shift+F) e Isolar camadas
- [x] Máscara a partir da seleção: Revelar seleção e Ocultar seleção (vindo da 13.2)
- [x] Definir predefinição de pincel a partir da seleção (vindo da 13.2)

### Onda 13.4 — Seleção em uso e área de transferência

- [x] Recortar, Copiar, Copiar mesclado (Ctrl+Shift+C), Colar e Colar especial (no local, dentro, fora), com a área de transferência do sistema (colar uma imagem de fora vira camada)
- [x] Arquivo › Novo a partir da área de transferência
- [x] Limpar (Delete) apaga a seleção na camada
- [x] Preencher (Shift+F5): primeiro plano, fundo, cor, sensível ao conteúdo, padrão, histórico, preto, cinza 50%, branco, com modo, opacidade e preservar transparência; Alt+Backspace e Ctrl+Backspace
- [x] Traçado (largura, cor, dentro, centro, fora, modo, opacidade)
- [x] Camada via cópia (Ctrl+J) e via recorte (Ctrl+Shift+J) com os pixels da seleção
- [x] Imagem › Cortar (pela seleção) e Aparar (pela transparência ou pela cor dos cantos)
- [x] Atenuar (Ctrl+Shift+F) a última pintura (ou o último passo que mudou os pixels de uma camada)
- [x] A ferramenta Mover leva o que está selecionado (seleção flutuante); Alt + arrastar duplica

### Onda 13.5 — Retoque e pintura avançada

- [x] Carimbo (S) e Carimbo de padrão, com alinhado e amostra (camada atual, atual e abaixo, todas)
- [x] Painel Fonte de clonagem (fontes, sobreposição, deslocamento, escala e giro)
- [x] Pincel de recuperação (com a correspondência de tom) e Pincel de recuperação para manchas (sensível ao conteúdo, criar textura, correspondência por proximidade)
- [x] Correção (de origem ou de destino, colada sem emenda; o preenchimento por IA fica com o Remover)
- [x] Mover sensível ao conteúdo (mover e estender)
- [x] Remover (J) com "criar camada nova" e traços que cercam um objeto
- [x] Pincel misturador (úmido, carregar, misturar, fluxo; limpar e carregar depois de cada traço)
- [x] Substituição de cor (matiz, saturação, cor, luminosidade; amostragem; limites; tolerância)
- [x] Desfoque, Nitidez e Borrar com pincel (força, proteger detalhes, pintura com o dedo)
- [x] Subexposição e Superexposição (sombras, meios-tons, realces; exposição; proteger tons) e Esponja (dessaturar, saturar; vibração)
- [x] Borracha de fundo (amostragem, limites, tolerância, proteger a cor do primeiro plano)
- [x] Borracha mágica
- [x] Balde de tinta (primeiro plano ou padrão, tolerância, contígua, todas as camadas)
- [x] Degradê (G) clássico (pinta pixels): linear, radial, ângulo, refletido, losango; inverter, pontilhar
- [x] Degradê ao vivo: vai com as camadas de preenchimento, na 13.9 (o degradê é uma delas)
- [x] Editor de degradês (paradas de cor e de opacidade, ponto médio, ruído) e painel Degradês com predefinições
- [x] Painel Padrões com predefinições, Definir padrão, importar .pat

### Onda 13.6 — Transformação e geometria

- [x] Transformação livre (Ctrl+T) com X, Y, L, A, giro, inclinação, ponto de referência e interpolação (pelo menu: o Ctrl+T é do navegador)
- [x] Transformar › Escala, Girar, Inclinar, Distorcer, Perspectiva, Deformar (malha, estilos prontos, dividir em cruz, na vertical e na horizontal), Transformar novamente (Ctrl+Shift+T), girar 180 e 90, virar
- [x] Transformação livre de uma cópia (Ctrl+Alt+T)
- [x] Distorção de marionete (malha, alfinetes, rígido, normal, distorcer, densidade, expansão, profundidade)
- [x] Deformação de perspectiva (planos, endireitar, nivelar)
- [x] Escala sensível ao conteúdo (Ctrl+Alt+Shift+C)
- [x] Corte (C) completo: predefinições de proporção e de tamanho com resolução, endireitar, sobreposições (terços, grade, diagonal, triângulo, proporção áurea, espiral áurea), mostrar a área cortada, escudo, apagar os pixels cortados, preencher sensível ao conteúdo, girar arrastando fora
- [x] Corte de perspectiva
- [x] Tamanho da imagem (Ctrl+Alt+I) com reamostragem (automática, preservar detalhes, bicúbica, bilinear, vizinho mais próximo, Lanczos) e resolução
- [x] Tamanho da tela (Ctrl+Alt+C) com âncora, relativo e cor da extensão
- [x] Rotação da imagem (180, 90, arbitrária, virar a tela)
- [x] Revelar tudo
- [x] Régua (I) com "Endireitar camada"
- [x] Dissolver (Ctrl+Shift+X): empurrar, reconstruir, suavizar, girar, contrair, inflar, deslocar, congelar e descongelar máscara
- [x] Ponto de fuga (planos e colar em perspectiva)
- [x] Grande-angular adaptável e Correção de lente
- [x] Alinhar camadas automaticamente e Mesclar camadas automaticamente (panorama e empilhamento de foco)

### Onda 13.7 — Vetores, formas, quadros e pranchetas

- [x] Caneta (P), Caneta de forma livre (ajuste de curva), Caneta de curvatura, Adicionar, Excluir e Converter ponto
- [x] Seleção de caminho e Seleção direta (A), com as setas empurrando pontos
- [x] Painel Caminhos: caminho de trabalho, salvar, duplicar, excluir, fazer seleção (Ctrl+Enter), seleção para caminho, preencher, traçar com qualquer ferramenta de pintura (pressão simulada), caminho de recorte
- [x] Formas vivas (retângulo com raio por canto, elipse, triângulo com raio, polígono com lados e estrela, linha com espessura e pontas de seta): preenchimento e traçado (cor, degradê, padrão), opções de traçado (sólido, tracejado, pontilhado, pontas, cantos, limite de mitra, alinhado dentro, no centro ou fora)
- [x] Forma personalizada com uma biblioteca grande e Definir forma personalizada
- [x] Combinar formas (unir, subtrair, intersectar, excluir sobreposição, mesclar componentes)
- [x] Máscara vetorial (revelar tudo, ocultar tudo, caminho atual, ativar, vincular, excluir)
- [x] Converter a seleção em forma (o texto em forma e em caminho de trabalho vai com o texto desenhado no navegador, na 13.8)
- [x] Quadro (K): lugar retangular ou elíptico que recorta a foto posta dentro
- [x] Prancheta (V): várias pranchetas num documento, tamanhos prontos, retrato e paisagem, prancheta a partir de grupo e de camadas, exportar cada uma

### Onda 13.8 — Texto

- [x] Texto desenhado no navegador, com edição direta na tela (clique, arrastar para caixa; 2, 3, 4 e 5 cliques escolhem palavra, linha, parágrafo e tudo)
- [x] Texto de ponto e de parágrafo (caixa com quebra automática), um convertido no outro
- [x] Texto vertical e as máscaras de texto horizontal e vertical
- [x] Biblioteca grande de fontes livres, com prévia ao passar o mouse, estilos (pesos e itálicos) e envio de fontes do espaço
- [x] Painel Caractere: fonte, estilo, tamanho, entrelinha, kerning (métrica, óptico, manual), tracking, escala vertical e horizontal, deslocamento da linha de base, cor, negrito e itálico falsos, todas maiúsculas, versalete, sobrescrito, subscrito, sublinhado, tachado, OpenType (ligaduras, alternativos, frações, ordinais), eixos de fonte variável, antisserrilhamento
- [x] Painel Parágrafo: alinhar à esquerda, ao centro e à direita, justificar (última à esquerda, ao centro, à direita, tudo), recuos (início, fim, primeira linha), espaço antes e depois, hifenização
- [x] Estilos de caractere e de parágrafo; painel Glifos
- [x] Estilos misturados no mesmo texto (palavras com outra fonte, cor ou tamanho)
- [x] Texto em caminho (e dentro de uma forma)
- [x] Deformar texto: arco, arco inferior, arco superior, arco, saliência, concha inferior e superior, bandeira, onda, peixe, elevar, olho de peixe, inflar, espremer, torção
- [x] Converter em forma, Criar caminho de trabalho, Rasterizar
- [x] Localizar e substituir texto; Colar Lorem Ipsum; Atualizar todas as camadas de texto
- [x] Atalhos de formatação (Ctrl+Shift+K, U, B, I e /; Alt + setas para a entrelinha e o tracking)

### Onda 13.9 — Estilos de camada e preenchimentos

- [x] Opções de mesclagem: modo, opacidade, preenchimento, Mesclar se (esta camada e a de baixo, por canal, com as metades), avançadas (vazamento, mesclar os efeitos internos como grupo, as camadas recortadas como grupo, a máscara esconde os efeitos), canais
- [x] Chanfro e entalhe (externo, interno, entalhe, almofada, de traçado; suave, cinzel duro e macio; profundidade, direção, tamanho, suavizar, ângulo, altitude, contorno de brilho, realce e sombra; contorno; textura)
- [x] Traçado (fora, dentro, centro; cor, degradê, padrão), Sombra interna, Brilho interno, Cetim, Sobreposição de cor, de degradê e de padrão, Brilho externo, Sombra projetada (o contorno e a sombra de hoje viram estes)
- [x] Vários efeitos do mesmo tipo; contornos personalizados
- [x] Luz global; Copiar, Colar e Limpar estilo; Ocultar todos os efeitos; Dimensionar efeitos; Criar camadas a partir dos efeitos
- [x] Painel Estilos com predefinições
- [x] Camadas de preenchimento: cor sólida, degradê (com as opções do degradê e as alças na tela: o degradê ao vivo da 13.5) e padrão

### Onda 13.10 — Ajustes

- [x] As 16 camadas de ajuste com as propriedades de lá: Brilho/Contraste (com o antigo), Níveis (por canal, conta-gotas de preto, cinza e branco), Curvas (por canal, ponto e lápis), Exposição (exposição, deslocamento, gama), Vibração, Matiz/Saturação (com Colorir e a faixa por cor com conta-gotas), Equilíbrio de cores (sombras, meios-tons, realces, preservar luminosidade), Preto e branco (seis cores e tonalizar), Filtro de fotos (filtros prontos e cor, densidade), Mixer de canais (monocromático), Pesquisa de cores, Inverter, Posterizar, Limiar, Mapa de degradê, Cor seletiva
- [x] Os clássicos que vão direto nos pixels: Sombras/Realces, Tonalização HDR, Dessaturar (Ctrl+Shift+U), Corresponder cor, Substituir cor, Equalizar
- [x] Tom, Contraste e Cor automáticos (Ctrl+Shift+L, Ctrl+Alt+Shift+L, Ctrl+Shift+B)
- [x] Painel Ajustes com predefinições de cada tipo; máscara da camada de ajuste e recorte na de baixo
- [x] Painel Histograma (por canal, média, desvio, mediana, pixels)

### Onda 13.11 — Filtros

- [x] Filtros inteligentes (pilha não destrutiva por camada, com a máscara do filtro, opções de mesclagem de cada um, ligar e desligar, reordenar), Converter para filtros inteligentes, Último filtro (Ctrl+Alt+F), Atenuar
- [ ] Galeria de filtros com os 47 e a pilha de efeitos dela: artísticos (lápis de cor, recorte, pincel seco, filme granulado, afresco, brilho neon, pinceladas, espátula, plástico, bordas posterizadas, pastel, borrão, esponja, base, aquarela), traçados de pincel (bordas acentuadas, traços angulares, hachura, traços escuros, contornos de tinta, salpicos, traços borrifados, sumi-e), distorção (brilho difuso, vidro, ondulação oceânica), esboço (baixo-relevo, giz e carvão, carvão, cromado, conté, caneta gráfica, padrão de meio-tom, papel de carta, fotocópia, gesso, reticulação, carimbo, bordas rasgadas, papel molhado), estilização (bordas brilhantes), textura (craquelado, grão, ladrilhos de mosaico, colcha, vitral, texturizador)
- [ ] Desfoque: média, desfoque, mais desfoque, caixa, gaussiano, lente (com mapa de profundidade), movimento, radial, forma, inteligente, superfície
- [ ] Galeria de desfoque: campo, íris, inclinação, caminho, giro, com alfinetes na tela
- [x] Distorção: deslocamento (mapa), pinçar, coordenadas polares, ondulação, cisalhamento, esfera, redemoinho, onda, ziguezague
- [x] Ruído: adicionar, remover manchas, poeira e riscos, mediana, reduzir ruído
- [x] Pixelização: meio-tom em cores, cristalizar, facetar, fragmentar, meia-tinta, mosaico, pontilhismo
- [x] Renderização: chamas, moldura, árvore, nuvens, nuvens por diferença, fibras, reflexo de lente, efeitos de iluminação (spot, ponto, infinita, canal de textura), reiluminar
- [x] Nitidez: tornar nítido, mais nítido, nitidez nas bordas, nitidez inteligente, máscara de nitidez
- [x] Estilização: difusão, entalhe, extrusão, encontrar bordas, pintura a óleo, solarizar, ladrilhos, traçar contorno, vento
- [x] Vídeo: desentrelaçar, cores NTSC
- [x] Outros: personalizado (matriz), HSB/HSL, alta frequência, máximo, mínimo, deslocamento, cor para alfa
- [ ] Filtro de revelação (a aba Cor no lugar do filtro de câmera, com as seções que faltam: detalhe, granulação, mistura de cores, gradação de cor, vinheta com prioridade)

### Onda 13.12 — IA

- [ ] Preenchimento generativo na seleção, com texto e variações
- [ ] Expansão generativa no Corte, com texto
- [ ] Remover fundo (ação rápida), Selecionar assunto e Céu pelos modelos que já rodam
- [ ] Substituir céu
- [ ] Filtros neurais: transferência de estilo, colorir, remover artefatos de JPEG, desfoque de profundidade, super zoom, restaurar foto (sem os de rosto)
- [ ] Painel de variações geradas

### Onda 13.13 — Arquivos, documento e automação

- [ ] Abrir uma imagem do computador como documento (PNG, JPG, WebP, GIF, BMP, TIFF, SVG, HEIC pelo servidor), Abrir recentes
- [ ] Abrir e salvar PSD com as camadas (grupos, máscaras, mesclagens, textos e ajustes quando der)
- [ ] Colocar incorporado (do computador ou da biblioteca)
- [ ] Exportar como (PNG, JPG com qualidade, WebP com e sem perda, GIF, TIFF, AVIF, BMP, ICO, PDF), Exportação rápida, Salvar para web (GIF e PNG-8 com paleta), Preferências de exportação
- [ ] Exportar camadas, pranchetas e comps em arquivos; pranchetas em PDF; Gerar ativos de imagem
- [ ] Duplicar documento; Informações do arquivo; Imprimir
- [ ] Modo: Escala de cinza, Bitmap (limiar, pontilhado, meio-tom), Duotone, Cores indexadas (paletas, pontilhado, tabela de cores); CMYK e Lab na prova e na exportação; 16 e 32 bits desligados com o motivo
- [ ] Prova de cores e alerta de gama; simulação de daltonismo
- [ ] Automatizar: Lote, Processador de imagens, Folha de contato, Ajustar imagem, Cortar e endireitar fotos, Fotomesclagem, Mesclar para HDR, Carregar arquivos em pilha (com os modos de pilha)
- [ ] Scripts úteis: excluir camadas vazias, achatar todos os efeitos, achatar todas as máscaras
- [ ] Variáveis e conjuntos de dados

### Onda 13.14 — Visualização e medição

- [ ] Réguas (Ctrl+R) com unidades, guias arrastadas das réguas, Nova guia, Novo layout de guias, Novas guias a partir da forma, Bloquear e Limpar guias
- [ ] Grade, Guias inteligentes, Bordas da camada, Malha de pixels, Extras (Ctrl+H) e tudo do Mostrar
- [ ] Encaixar (Ctrl+Shift+;) e Encaixar em (guias, grade, camadas, limites)
- [ ] Girar a vista (R) e espelhar a vista; 200% e tamanho de impressão; Ajustar a camada à tela
- [ ] Modos de tela (F); Tab esconde os painéis (Shift+Tab só os encaixados)
- [ ] Navegador; Informações (a cor sob o ponteiro, X e Y, o tamanho da seleção) com o Amostrador de cor (I)
- [ ] Contagem (I), Nota (I), escala de medida e Registro de medições
- [ ] Vários documentos abertos em abas, com Ctrl+Tab

### Onda 13.15 — Organização e fluxo

- [ ] Histórico completo (avançar e voltar passos, instantâneos, documento novo a partir de um estado, opções)
- [ ] Ações: gravar, tocar, parar, inserir pausa, conjuntos, salvar e carregar
- [ ] Comps de camada
- [ ] Predefinições de ferramenta e Redefinir ferramenta
- [ ] Pesquisar (Ctrl+F): paleta com todos os comandos e ferramentas
- [ ] Atalhos de teclado personalizáveis; Menus (esconder e colorir itens); Barra de ferramentas personalizável (uma ou duas colunas, esconder ferramentas); segurar a tecla de uma ferramenta usa ela só enquanto está apertada
- [ ] Preferências (geral, interface, ferramentas, unidades, guias e grade, transparência, desempenho)
- [ ] Linha do tempo de quadros (animação), com exportar GIF e vídeo e abrir no editor de vídeo
- [ ] Fatia e Seleção de fatia (fatias a partir das guias, exportação por fatia)
- [ ] Painel Teclas modificadoras (Shift, Ctrl e Alt presos, para a tela de toque)
- [ ] Temas da interface (cinza médio e cinza claro, além do escuro e do claro de hoje)

### Onda 13.16 — Ferramentas vetoriais da suíte

- [ ] Seleção de grupo, Laço vetorial e Varinha mágica vetorial
- [ ] Toque no texto
- [ ] Segmento de linha, Arco, Espiral, Grade retangular, Grade polar
- [ ] Retângulo arredondado, Estrela, Reflexo (brilho)
- [ ] Pincel de traço, Pincel de bolha, Lápis vetorial, Suavizar, Borracha de caminho, Unir, Modelador
- [ ] Borracha vetorial, Tesoura, Faca, cortes em linha e em retângulo
- [ ] Girar, Refletir, Escalar, Inclinar, Remodelar
- [ ] Largura do traço, Deformar, Torcer, Franzir, Inflar, Recortar, Cristalizar, Enrugar
- [ ] Construtor de formas e Pintura viva
- [ ] Grade de perspectiva
- [ ] Malha de degradê, Mesclar objetos, Objetos no caminho, Cotas
- [ ] Símbolos (borrifar, mover, juntar, redimensionar, girar, tingir, transparência, estilo)
- [ ] Gráficos (colunas, colunas empilhadas, barras, barras empilhadas, linha, área, dispersão, pizza, radar)

## Ordem e regras de trabalho

As ondas vão na ordem acima, porque cada uma usa a anterior: a pintura precisa da árvore de camadas, os retoques
precisam da pintura e da seleção, os filtros precisam da pilha. Cada item entra testado: teste da conta (TS, e Python
quando vale no vídeo), teste no Chrome contra o site de produção (3010) e, quando desenha algo, a exportação comparada
com a prévia. Um commit por área, com este checklist e o "Estado atual" do CLAUDE.md no mesmo commit.
