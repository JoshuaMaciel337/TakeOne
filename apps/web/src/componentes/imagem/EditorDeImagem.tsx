"use client";

import { Check, ChevronLeft, Download, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { BarraDeMenus, useAtalhosDosMenus } from "@/componentes/area/BarraDeMenus";
import { ColunaDePaineis, type Painel, useAreaDeTrabalho } from "@/componentes/area/Paineis";
import { PainelHistorico } from "@/componentes/area/PainelHistorico";
import { BotaoTema } from "@/componentes/BotaoTema";
import { Simbolo } from "@/componentes/Logo";
import { contextoDasMidias } from "@/componentes/editor/contexto";
import { PainelEfeitos } from "@/componentes/editor/PainelEfeitos";
import { type IdAba, PainelPropriedades } from "@/componentes/editor/PainelPropriedades";
import { MiniaturaDoEstilo } from "@/componentes/editor/PainelTexto";
import { useProjeto } from "@/componentes/editor/useProjeto";
import { Redirecionar } from "@/componentes/projeto/Redirecionar";
import { criarForma } from "@/lib/elementos";
import { caminhosDaFormaPersonalizada, type FormaDoEspaco, PainelFormasPersonalizadas, SeletorDeFormaPersonalizada } from "./FormasPersonalizadas";
import { caminhosNaCaixa, normalizarParaFormaPersonalizada } from "@/lib/vetor/arrasto";
import type { EstadoDaArea } from "@/lib/areaDeTrabalho";
import { enderecoDoProjeto } from "@/lib/hub";
import { useMarca } from "@/lib/marca";
import type { Comando } from "@/lib/projeto/comandos";
import { executarComando, NOMES_DOS_COMANDOS } from "@/lib/projeto/comandos";
import { INTENSIDADE_PADRAO, type TipoEfeito } from "@/lib/projeto/efeitos";
import { alinhar, type CaixaNoQuadro, deslocar, distribuir, type MudancaDePosicao, mudancaComVinculadas, unidadesDaSelecao } from "@/lib/projeto/alinhar";
import { camadaTravada, camadaVisivel, comDescendentes, faixasEmOrdem } from "@/lib/projeto/arvore";
import { type CaixaDoCorte, camadasDaImagem, type RetanguloDaImagem, tamanhoDaImagem } from "@/lib/projeto/imagem";
import { acharClipe, type Canal, type Clipe, type Faixa, type GeracaoDoClipe, MASCARA_PADRAO, type Mesclagem, PROPORCOES, type Projeto, type Transformacao } from "@/lib/projeto/modelo";
import { camadasDoModelo, fundoDoModelo, type MidiasDoModelo, type ModeloDeImagem, modeloDeImagem, pedidosDoModelo } from "@/lib/projeto/modelosDeImagem";
import { ESTILOS_DE_TEXTO, type Texto, TEXTO_PADRAO } from "@/lib/projeto/texto";
import type { Midia } from "@/lib/tipos";
import { JanelaPreenchimentoGenerativo } from "./ia/JanelaPreenchimentoGenerativo";
import { JanelaSubstituirCeu } from "./ia/JanelaSubstituirCeu";
import { type FiltroNeural, JanelaFiltroNeural } from "./ia/JanelaFiltroNeural";
import { baseDaMascara, corDoCeuNovo, desenharCeuNovo, mascaraDoCeu, type OpcoesDoCeu } from "@/lib/imagem/substituirCeu";
import { useMidias } from "@/lib/useMidias";

import type { Ajuste } from "./ajustesDaImagem";
import { BarraDeOpcoes, type OpcoesDaForma } from "./BarraDeOpcoes";
import { CaixaDeFerramentas } from "./CaixaDeFerramentas";
import { ferramenta as dadosDa, FERRAMENTAS_DA_SELECAO, FERRAMENTAS_DE_PINTURA, FERRAMENTAS_DE_CAMINHO, FERRAMENTAS_DE_PONTO, FERRAMENTAS_DE_TEXTO, FERRAMENTAS_DE_TRACO_LIVRE, FERRAMENTAS_DE_TRANSFORMAR, LIQUEFAZER_DA_FERRAMENTA, FORMA_VIVA_DA_FERRAMENTA, GERADOR_DA_FERRAMENTA, VARIANTE_DA_FERRAMENTA, GRUPOS_DE_FERRAMENTAS, grupoDa, type IdFerramentaDaImagem, MODO_DA_SELECAO, TODAS_AS_FERRAMENTAS } from "./ferramentasDaImagem";
import { type FerramentaDeSelecao, OPCOES_DA_SELECAO, type OpcoesDaSelecao } from "./SelecaoNaPrevia";
import { JanelaEscolherImagem } from "./JanelaEscolherImagem";
import { JanelaExportarImagem, JanelaPreferenciasDeExportacao } from "./JanelaExportarImagem";
import { JanelaDuplicarDocumento, JanelaImprimir, JanelaInformacoesDoArquivo } from "./JanelasDoArquivo";
import { JanelaNovoInstantaneo, JanelaOpcoesDoHistorico, type OrigemDoInstantaneo } from "./JanelasDoHistorico";
import { JanelaAjustarImagem, JanelaAutomatizar, type TipoDaAutomacao } from "./JanelaAutomatizar";
import { JanelaConjuntos, JanelaDefinirVariaveis } from "./JanelasDasVariaveis";
import { JanelaGrade, JanelaLayoutDeGuias, JanelaNovaGuia } from "./JanelasDaVista";
import { guardarVista, guiasDaForma as guiasDaFormaDaVista, guiasDoLayout, juntarGuias, lerVista, type PreferenciasDaVista } from "@/lib/imagem/vista";
import { aplicarConjunto, type ConjuntoDeDados, conjuntoDoDocumento, type ParaAplicar, type TipoDaVariavel, type VariaveisDoDocumento } from "@/lib/projeto/variaveis";
import { exportarConjuntos } from "@/lib/exportacao/varios";
import { cortarEEndireitar } from "@/lib/automatizar/executar";
import { JanelaBitmap, JanelaCmyk, JanelaCoresIndexadas, JanelaDuotone, JanelaTabelaDeCores } from "./JanelasDoModo";
import { SIGLAS_DOS_MODOS } from "@/lib/imagem/modos";
import type { TipoDaProva } from "@/lib/imagem/prova";
import { indexar, type PaletaDaExportacao, type Pontilhado } from "@/lib/exportacao/formatos/quantizar";
import { imprimirImagem, type OpcoesDaImpressao } from "@/lib/exportacao/imprimir";
import { baixarBlob, caixaDoConteudo as caixaDoDesenho, codificarCanvas, formatoDe, gerarArquivo, lerPreferencias, nomeDoArquivo, OPCOES_PADRAO_DE_EXPORTACAO, pixelsDoBlob } from "@/lib/exportacao/exportarComo";
import { type AcoesDosMenus, AREAS_DA_IMAGEM, type IdPainelDaImagem, menusDaImagem, type ModoDeTela, PAINEIS_DA_IMAGEM } from "./menusDaImagem";
import { nomeDaCamada, PainelCamadas } from "./PainelCamadas";
import { PainelFotoIA } from "./PainelFotoIA";
import { PainelAjustes, PainelAmostras, PainelBiblioteca, PainelCor, PainelModelosDaImagem } from "./PaineisDaImagem";
import { PreviaDaImagem, proximoZoom } from "./PreviaDaImagem";
import { PropriedadesDoDocumento } from "./PropriedadesDoDocumento";
import { PropriedadesDaMascara } from "./PropriedadesDaMascara";
import { useObjeto } from "./useObjeto";
import { alvoDaMascara, alvoDaMascaraDosFiltros, alvoDosPixels, usePinturas } from "./usePinturas";
import type { AlvoDaPintura } from "./PinturaNaPrevia";
import { type FerramentaDePintura, type OpcoesDoPincel, PINCEL_PADRAO, type SecaoDoPincel, type Simetria } from "@/lib/pintura/traco";
import { comPredefinicao, PainelConfiguracoesDoPincel, PainelPinceis } from "./PaineisDoPincel";
import { criarPincel, excluirPincel, importarAbr, pincelDaPonta, predefinicaoDoEspaco, usePinceisDoEspaco } from "@/lib/pinceis";
import { criarCamadaDePixels, enviarVersao } from "@/lib/pixels";
import { exportarImagem } from "@/lib/exportacao/imagem";
import { planoDosPixels, type PlanoDosPixels, planosDosEfeitos, projetoSoCom, type TipoDaMesclagem } from "@/lib/projeto/rasterizar";
import { FERRAMENTAS_DA_GALERIA, type FerramentaDaGaleria, type Galeria, galeriaDasOpcoes, pinoNovo, textoDosPinos } from "@/lib/imagem/filtros/galeria";
import { type Escolhido } from "./filtros/Galeria";
import { JanelaGaleriaDeFiltros } from "./filtros/JanelaGaleriaDeFiltros";
import { carregarBitmap } from "@/lib/previa/bitmaps";
import { documentoDaImagem, enviarEEsperar, type ImagemRecente, imagensRecentes } from "@/lib/abrirImagem";
import { ACEITAR_IMAGENS, useEnvios } from "@/lib/envios";
import { formatarBytes } from "@/lib/formatar";
import { abrirPsd, ACEITAR_PSD, avisosGuardados, ehPsd, guardarAvisos, salvarPsd } from "@/lib/psd/arquivo";
import { arquivoDaMidia, chamarApi } from "@/lib/api";
import { ceu, ceuPelaProfundidade, imagemMenor } from "@/lib/selecao/cores";
import { REFINAMENTO_PADRAO, refinarSelecao } from "@/lib/selecao/refinar";
import { JanelaAreaDeFoco, JanelaDeNome, JanelaIntervaloDeCores } from "./JanelasDaSelecao";
import { selecaoEmCinza } from "./MascaraRapida";
import { JanelaAparar, JanelaAtenuar, JanelaPreencher, JanelaTracado, type Preenchimento, type Tracado } from "./JanelasDePixels";
import { juntarTraco } from "@/lib/pintura/mesclar";
import { type Degrade, pixelsDoDegrade, tabelaDoDegrade } from "@/lib/pintura/degrade";
import { criarRecurso, excluirRecurso, useRecursos } from "@/lib/recursos";
import { JanelaEditorDeDegrade, PainelDegrades } from "./Degrades";
import { MANCHAS_PADRAO, type OpcoesDasManchas, OpcoesDaCorrecaoNaBarra, OpcoesDasManchasNaBarra, OpcoesDoMoverSensivelNaBarra } from "./OpcoesDaRecuperacao";
import { colarSemEmenda, corrigirTom, preencherBuraco } from "@/lib/pintura/recuperar";
import {
  alvoDoRetoque,
  apagarFundoNaMarca,
  borrarMarca,
  estadoNovo,
  type FerramentaDeAlvo,
  type Marca as MarcaDoRetoque,
  MISTURADOR_PADRAO,
  misturarMarca,
  type OpcoesDaSubstituicao,
  type OpcoesDoRetoque,
  RETOQUE_PADRAO,
  SUBSTITUICAO_PADRAO,
  substituirCorNaMarca,
} from "@/lib/pintura/retoque";
import { type FerramentaDoRetoque, OpcoesDaSubstituicaoNaBarra, OpcoesDoMisturadorNaBarra, OpcoesDoRetoqueNaBarra } from "./OpcoesDoRetoque";
import { CARIMBO_PADRAO, type FonteDeClonagem, type OpcoesDoCarimbo, OpcoesDoCarimboNaBarra, PainelFonteDeClonagem } from "./FonteDeClonagem";
import { BALDE_PADRAO, BORRACHA_MAGICA_PADRAO, DEGRADE_PADRAO, OpcoesDaBorrachaMagicaNaBarra, OpcoesDoBaldeNaBarra, OpcoesDoDegradeNaBarra } from "./OpcoesDosPontos";
import type { ModoDaPintura } from "@/lib/pintura/traco";
import { caixaParaAparar, faixaDoTracado, limparPixels, preencherPixels, rgbDaCor } from "@/lib/pintura/operacoes";
import { definirPadroesDoEspaco, esperarLadrilho, type IdDoPadrao, ladrilhar, ladrilhoDoPadrao } from "@/lib/pintura/padroes";
import { lerPat } from "@/lib/pintura/pat";
import { PainelPadroes } from "./Padroes";
import { CORTE_PADRAO, type OpcoesDoCorte, OpcoesDoCorteNaBarra } from "./OpcoesDoCorte";
import { CANETA_PADRAO, type FerramentaDoTracado, JanelaCaminhoDaSelecao, JanelaCriarForma, JanelaTracarCaminho, type OpcoesDaCaneta, OpcoesDaCanetaNaBarra, OpcoesDaFormaNaBarra } from "./OpcoesDaForma";
import type { FerramentaDeCaminho } from "./CaminhosNaPrevia";
import { PainelCaminhos } from "./PainelCaminhos";
import { JanelaCamadasEmArquivos, JanelaCompsEmArquivos, JanelaExportarPranchetas, JanelaFatiasEmArquivos } from "./JanelaExportarPranchetas";
import { JanelaDividirFatia, JanelaOpcoesDaFatia, OpcoesDasFatiasNaBarra } from "./JanelasDasFatias";
import { PainelComps } from "./PainelComps";
import { OpcoesDaVarinhaVetorialNaBarra } from "./OpcoesDaVarinhaVetorial";
import { OpcoesDosGeradoresNaBarra } from "./OpcoesDosGeradores";
import { OpcoesDoReflexoNaBarra } from "./OpcoesDoReflexo";
import { type FerramentaDoPincelVetorial, OpcoesDoPincelVetorialNaBarra } from "./OpcoesDoPincelVetorial";
import { apagarDoCaminho, caminhoLivre, caminhosDaRegiaoEmCurvas, continuarCaminho, juntarBolha, type OpcoesDoPincelVetorial, PINCEL_VETORIAL_PADRAO, pontoNaRegiao, reconhecerForma, regiaoDaBolha, suavizarCaminhos, toleranciaDaFidelidade, unirCaminhos } from "@/lib/vetor/pincelVetorial";
import { regiaoDosCaminhos } from "@/lib/vetor/contorno";
import { type Afim as AfimDaFerramenta, aplicarAfim, type FerramentaDeTransformar, posicaoPelaAfim, remodelarCaminhos } from "@/lib/transformar/ferramentas";
import { JanelaTransformarNumeros } from "./JanelaTransformarNumeros";
import { OpcoesDoLiquefazerNaBarra } from "./OpcoesDoLiquefazer";
import { OpcoesDaLarguraNaBarra } from "./OpcoesDaLargura";
import { construirPecas, facesDasFormas } from "@/lib/vetor/construtor";
import { OpcoesDaPerspectivaNaBarra } from "./OpcoesDaPerspectiva";
import { COTA_PADRAO, geometriaDaCota, type OpcoesDaCota, textoDaCota } from "@/lib/vetor/cota";
import { OpcoesDaCotaNaBarra } from "./OpcoesDaCota";
import { JanelaMesclarObjetos } from "./JanelaMesclarObjetos";
import { JanelaObjetosNoCaminho } from "./JanelaObjetosNoCaminho";
import { lugaresNoCaminho } from "@/lib/vetor/repetir";
import { passosDaMescla } from "@/lib/vetor/mesclar";
import { cantosNoPlano } from "./PerspectivaNaPrevia";
import { caminhosDoPlano, type GradeDePerspectiva, gradePadrao, type PlanoDaPerspectiva, retanguloNoPlano } from "@/lib/vetor/perspectiva";
import { subcaminhosDaForma } from "@/lib/vetor/modelo";
import { formaDoArrasto as formaVivaDoArrasto } from "@/lib/vetor/arrasto";
import type { PontoDeLargura } from "@/lib/vetor/largura";
import { caminhosDoLiquefazer, comecarLiquefazer, type EstadoDoLiquefazer, LIQUEFAZER_PADRAO, type OpcoesDoLiquefazer, passoDoLiquefazer, terminarLiquefazer } from "@/lib/vetor/liquefazer";
import { comVinculadas } from "@/lib/projeto/alinhar";
import { apagarArea, cortarComFaca, cortarComTesoura, regiaoDoCorte, regiaoDoRetangulo } from "@/lib/vetor/cortes";
import { camadasDoReflexo, type OpcoesDoReflexo, REFLEXO_PADRAO } from "@/lib/vetor/reflexo";
import { caminhosDoGerador, type GeradorDeCaminhos, GERADORES_PADRAO, NOME_DO_GERADOR, type OpcoesDosGeradores } from "@/lib/vetor/geradores";
import { PainelLinhaDoTempo } from "./PainelLinhaDoTempo";
import { PainelTeclasModificadoras, useTeclasPresas } from "./TeclasPresas";
import { JanelaPesquisar } from "@/componentes/area/JanelaPesquisar";
import { type AbaDaPersonalizacao, JanelaPersonalizar } from "./JanelaPersonalizar";
import { JanelaPreferencias } from "./JanelaPreferencias";
import { TEMAS, temaAtual, trocarTema } from "@/lib/tema";
import { carregarPersonalizacao, guardarPersonalizacao, type Personalizacao, personalizarMenus, teclaDaFerramenta } from "@/lib/imagem/personalizacao";
import { achatarMenus } from "@/lib/pesquisa";
import { PredefinicoesDeFerramenta } from "./PredefinicoesDeFerramenta";
import { gerarAtivos } from "@/lib/exportacao/varios";
import { OpcoesDaPranchetaNaBarra } from "./OpcoesDaForma";
import { type SelecaoDoTexto, textoMedido } from "./EdicaoDeTextoNaPrevia";
import { OpcoesDoTextoNaBarra } from "./OpcoesDoTexto";
import { EstilosSalvos, PainelCaractere, PainelGlifos, PainelParagrafo } from "./PaineisDoTexto";
import { esperarFontes, fonteDoEstilo, useVersaoDasFontes } from "@/lib/texto/fontes";
import { converterModo } from "@/lib/texto/converter";
import { caminhosDoTexto } from "@/lib/texto/contornos";
import { LOREM_IPSUM, ocorrencias, type OpcoesDaBusca, substituirTodas } from "@/lib/texto/localizar";
import { estiloNoIndice, nomeDoTexto, substituir } from "@/lib/texto/modelo";
import { JanelaLocalizarTexto } from "./JanelaLocalizarTexto";
import { JanelaDeformarTexto } from "./JanelaDeformarTexto";
import { PainelEstilosDeCamada } from "./PainelEstilosDeCamada";
import { type GeralDaCamada, JanelaDimensionarEfeitos, JanelaEstiloDeCamada, JanelaLuzGlobal } from "./JanelaEstiloDeCamada";
import { JanelaCamadaDePreenchimento, preenchimentoNovo } from "./JanelaCamadaDePreenchimento";
import { PropriedadesDoAjuste } from "./ajustes/PropriedadesDoAjuste";
import { JanelaDoFiltroInteligente, JanelaMesclagemDoFiltro } from "./filtros/JanelasDoFiltro";
import { FILTRO_POR_ID, type Valores, valoresDoFiltro } from "@/lib/imagem/filtros/catalogo";
import { aplicarFiltro as aplicarFiltroNaImagem, type FiltrosInteligentes } from "@/lib/imagem/filtros/pilha";
import { JanelaDeAjusteNosPixels, type OperacaoDosPixels } from "./ajustes/JanelaDeAjusteNosPixels";
import {
  CORRESPONDER_PADRAO,
  corresponderCor,
  dessaturar,
  equalizar,
  estatisticasDaCor,
  type Estatisticas,
  HDR_PADRAO,
  misturarComCobertura,
  SOMBRAS_REALCES_PADRAO,
  sombrasRealces,
  SUBSTITUIR_PADRAO,
  substituirCor,
  tonalizacaoHdr,
} from "@/lib/imagem/ajustesNosPixels";
import { abrirDocumento, assinarDocumentos, documentosAbertos, documentosNoServidor, documentoVizinho, fecharDocumento, mudarDocumentos } from "@/lib/imagem/documentos";
import { histogramas, niveisAutomaticos } from "@/lib/imagem/histograma";
import { type CamadasEscolhidas, mesmaTecla, teclaDoEventoDaAcao } from "@/lib/imagem/acoes";
import { atualizarComp, camadasQueSumiram, type CompDeCamada, estadoDasCamadas, novaComp } from "@/lib/imagem/comps";
import { type AnimacaoDaImagem, compDoQuadro, interpolar, MAXIMO_DE_QUADROS, novoQuadro } from "@/lib/imagem/animacao";
import { gifDaAnimacao, videoDaAnimacao } from "@/lib/exportacao/animacao";
import { dividirFatia, type Fatia, fatiasDasGuias, MAXIMO_DE_FATIAS } from "@/lib/imagem/fatias";
import { camadasParecidas, type OpcoesDaVarinhaVetorial, VARINHA_VETORIAL_PADRAO } from "@/lib/vetor/varinhaVetorial";
import { opcoesParaGuardar, type ParteDasOpcoes, partesDaFerramenta, type PredefinicaoDeFerramenta } from "@/lib/imagem/predefinicoesDeFerramenta";
import { carregarOpcoesDoHistorico, guardarOpcoesDoHistorico, type OpcoesDoHistorico } from "@/lib/imagem/opcoesDoHistorico";
import { ESCALA_PADRAO, type Medicao, medicaoDaContagem, medicaoDaRegua, medicaoDaSelecao, medirSelecao, type Nota, novoGrupo, tirarGrupo, totalDaContagem } from "@/lib/imagem/medicao";
import { lutGuardada } from "@/lib/projeto/lutImportada";
import { useImagemAbaixo } from "./ajustes/useImagemAbaixo";
import { PainelHistograma } from "./ajustes/PainelHistograma";
import { PainelInformacoes, PainelNavegador } from "./PaineisDaVista";
import { JanelaParadaAoTocar, PainelAcoes } from "./PainelAcoes";
import { useAcoes } from "./useAcoes";
import { JanelaEscalaDeMedida, JanelaMarcadorDeEscala, OpcoesDaContagemNaBarra, OpcoesDaNotaNaBarra, type OpcoesDoMarcador, PainelNotas, PainelRegistro } from "./PaineisDaMedicao";
import { type AjusteDaImagem, ajustePadrao, aplicarAjusteNosPixels, compilarAjuste, corEmRgb, NOMES_DOS_AJUSTES, type Rgb } from "@/lib/imagem/ajustes";
import { alcasDoDegrade, type CamadaDePreenchimento } from "@/lib/imagem/camadaDePreenchimento";
import { type EstiloDeCamada, LUZ_GLOBAL_PADRAO, type LuzGlobal, type TipoDoEfeito } from "@/lib/imagem/estiloDeCamada";
import type { Deformacao } from "@/lib/texto/deformar";
import { aplicarEstilo, aplicarParagrafo, ESTILO_PADRAO, type EstiloDoCaractere, type EstiloDoParagrafo, estiloComum, estiloEmTudo, estiloDoParagrafo, PARAGRAFO_PADRAO, paragrafoDoIndice, paragrafoEmTudo, type Suavizacao, textoCorrido, textoNovo, type TextoRico } from "@/lib/texto/modelo";
import { novoId } from "@/componentes/editor/contexto";
import { pranchetasDoProjeto } from "@/lib/exportacao/pranchetas";
import { type AcaoDaMascaraVetorial, PropriedadesDaMascaraVetorial } from "./PropriedadesDaMascaraVetorial";
import { inverterMascaraVetorial, novaMascaraVetorial, vincularMascaraVetorial, caminhosDaMascaraNoDocumento } from "@/lib/vetor/mascaraVetorial";
import { canvasDaMascaraVetorial } from "@/lib/previa/mascaraCombinada";
import { tracarNoAlvo, tracosDoCaminho } from "./tracarCaminho";
import { caminhoDeRecorte, comCaminho, nomeLivre, NOME_DO_TRABALHO, porNoCaminho, salvarTrabalho } from "@/lib/vetor/caminhos";
import { caminhosDaMascara, mesclarComponentes, transformarCaminhos } from "@/lib/vetor/edicao";
import { regiaoNoCanvas } from "@/lib/vetor/desenhar";
import { camadaDaForma, camadaDosCaminhos, type OperacaoDoCaminho, refazerForma, type Subcaminho, temArea, TRACO_PADRAO } from "@/lib/vetor/modelo";
import { caminhosDoVetorNaImagem, pixelsPorUnidade, pontoDaForma } from "@/lib/projeto/imagem";
import { caixaDoClipe, cantosDaCaixa } from "@/lib/projeto/geometria";
import { type ArrastoDaForma, arrastoDaForma, camadaDoArrasto, NOME_DA_FORMA, OPCOES_DAS_FORMAS_PADRAO, opcoesDaVariante, type TipoDaFormaViva } from "@/lib/vetor/arrasto";
import { caixaDosCaminhos, deslocar as deslocarCaminhos } from "@/lib/vetor/modelo";
import { SOBREPOSICOES_DO_CORTE } from "./RecorteNaPrevia";
import { type Medida, OpcoesDaReguaNaBarra, OpcoesDoCortePerspectivaNaBarra } from "./OpcoesDaGeometria";
import { preencherBuracos } from "@/lib/pintura/recuperar";
import { JanelaAlinhar, JanelaEscalaSensivel, JanelaMesclarCamadas, JanelaTamanhoDaImagem, JanelaTamanhoDaTela, type NovaEscalaSensivel, type NovaTela, type NovoTamanho } from "./JanelasDoDocumento";
import { alinhar as alinharPelosPontos, aplicar, type ProjecaoDoAlinhamento } from "@/lib/transformar/alinhar";
import { empilharFoco, mesclarPanorama } from "@/lib/transformar/mesclarCamadas";
import { redimensionar } from "@/lib/transformar/reamostragem";
import { JanelaDissolver } from "./JanelaDissolver";
import { JanelaMarionete } from "./JanelaMarionete";
import { JanelaLente } from "./JanelaLente";
import { JanelaPerspectiva } from "./JanelaPerspectiva";
import { JanelaPontoDeFuga } from "./JanelaPontoDeFuga";
import { escalaSensivel } from "@/lib/transformar/escalaSensivel";
import { type CaixaDaMarionete, caixaDoConteudo } from "@/lib/transformar/marionete";
import { type ResultadoDoRefinamento, SelecionarEMascarar } from "./SelecionarEMascarar";
import { type DivisaoDaMalha, type EstadoDaTransformacao, mapaDoEstado, type ModoDaTransformacao } from "./TransformacaoNaPrevia";
import { type Ponto as PontoDaMalha, type Quadrilatero, quadDoRetangulo } from "@/lib/transformar/malha";
import { type Malha, malhaDoEstilo, mapaDaMalha, type OpcoesDoEstilo } from "@/lib/transformar/deformar";
import { homografia } from "@/lib/transformar/malha";
import { inversaDaHomografia } from "@/lib/transformar/perspectiva";
import { afimEntre, doReferencial, type Interpolacao, noReferencial, type NumerosDaTransformacao, numerosDoQuad, quadDosNumeros, reamostrar, reamostrarPeloMapa, type Referencia, retificar, semelhanca } from "@/lib/transformar/livre";
import { type CorDoCanal, PainelCanais } from "./PainelCanais";
import { JanelaCarregarSelecao, JanelaSalvarSelecao } from "./JanelasDaSelecao";
import type { AlvoDoMotor } from "./usePinturas";
import { Pintura } from "@/lib/pintura/motor";
import { arquivoDaVersao } from "@/lib/pixels";
import { type Afim, compor, type MascaraDePixels, IDENTIDADE, inverter, matrizDaCaixa, matrizDaMascaraNoDocumento, matrizDaMidiaNoDocumento, matrizParaOutraCaixa } from "@/lib/projeto/mascaraDePixels";
import { borda, cheia, combinar, limites, vazia, contrair, difusao, expandir, inverter as inverterSelecao, type ModoDaSelecao, type Selecao, suavizar, temAlgo } from "@/lib/selecao/mascara";
import { imagemDoBlob, imagemNoDocumento, selecaoDoCanvas, selecaoNaMidia, selecaoParaCanvas } from "@/lib/selecao/naTela";
import { mapaDeBordas, type MapaDeBordas } from "@/lib/selecao/magnetico";
import { aumentar, type ImagemRgba, varinha } from "@/lib/selecao/varinha";

const SEM_SEGUIR = {
  marcando: null,
  andamento: null,
  aoIniciar: () => undefined,
};
const NADA = () => undefined;

/** As áreas de trabalho: uma coluna de grupos à direita, como nos editores de imagem profissionais. */
const AREAS: Record<string, EstadoDaArea> = {
  essenciais: {
    direita: [
      { id: "g-cor", abas: ["cor", "amostras", "formas"], ativa: "cor", altura: 190 },
      { id: "g-propriedades", abas: ["propriedades", "caractere", "paragrafo", "ajustes", "biblioteca", "modelos"], ativa: "propriedades", altura: 340 },
      { id: "g-camadas", abas: ["camadas", "canais", "caminhos", "historico"], ativa: "camadas" },
    ],
  },
  fotografia: {
    direita: [
      { id: "g-histograma", abas: ["navegador", "histograma", "informacoes"], ativa: "navegador", altura: 260 },
      { id: "g-propriedades", abas: ["propriedades", "ajustes", "filtros"], ativa: "propriedades", altura: 360 },
      { id: "g-biblioteca", abas: ["biblioteca", "fotoIA"], ativa: "biblioteca", altura: 220 },
      { id: "g-camadas", abas: ["camadas", "canais", "caminhos", "historico"], ativa: "camadas" },
    ],
  },
  grafico: {
    direita: [
      { id: "g-cor", abas: ["cor", "amostras", "estilosDeCamada"], ativa: "cor", altura: 190 },
      { id: "g-propriedades", abas: ["propriedades", "caractere", "paragrafo", "estilos", "formas", "modelos"], ativa: "propriedades", altura: 340 },
      { id: "g-camadas", abas: ["camadas", "canais", "caminhos", "historico", "biblioteca"], ativa: "camadas" },
    ],
  },
};
const IDS_DOS_PAINEIS = Object.keys(PAINEIS_DA_IMAGEM);

type Pendente = { trocar?: string[]; camadaDe?: string; caixa?: RetanguloDaImagem; geracao?: GeracaoDoClipe };
/** A chave do motor da máscara rápida (não é um clipe). */
const CHAVE_DA_MASCARA_RAPIDA = "#mascaraRapida";
type ModificacaoDaSelecao = "borda" | "suavizar" | "expandir" | "contrair" | "difusao";

/** O número de cada Selecionar › Modificar: o rótulo, o padrão e os limites, em pixels. */
const MODIFICACOES: Record<ModificacaoDaSelecao, { titulo: string; rotulo: string; padrao: number; minimo: number; maximo: number }> = {
  borda: { titulo: "Borda da seleção", rotulo: "Largura", padrao: 10, minimo: 1, maximo: 200 },
  suavizar: { titulo: "Suavizar a seleção", rotulo: "Raio da amostra", padrao: 5, minimo: 1, maximo: 500 },
  expandir: { titulo: "Expandir a seleção", rotulo: "Expandir em", padrao: 5, minimo: 1, maximo: 500 },
  contrair: { titulo: "Contrair a seleção", rotulo: "Contrair em", padrao: 5, minimo: 1, maximo: 500 },
  difusao: { titulo: "Difusão da seleção", rotulo: "Raio da difusão", padrao: 5, minimo: 0.2, maximo: 1000 },
};

/** A seleção em cinza opaco (branco no que entra), para uma máscara de camada. */
function pintarSelecao(ctx2d: CanvasRenderingContext2D, selecao: Selecao, invertida = false) {
  const dados = ctx2d.createImageData(selecao.largura, selecao.altura);
  for (let i = 0; i < selecao.dados.length; i++) {
    const valor = invertida ? 255 - selecao.dados[i] : selecao.dados[i];
    dados.data[i * 4] = valor;
    dados.data[i * 4 + 1] = valor;
    dados.data[i * 4 + 2] = valor;
    dados.data[i * 4 + 3] = 255;
  }
  ctx2d.putImageData(dados, 0, 0);
}

function porcentagem(zoom: number): string {
  return `${(Math.round(zoom * 1000) / 10).toLocaleString("pt-BR")}%`;
}

/**
 * O editor de imagem (ADR 0002): menus, barra de opções, caixa de ferramentas à esquerda, o documento no meio e os
 * painéis encaixados à direita, nos lugares e com os nomes dos editores de imagem profissionais. O projeto, o
 * desfazer e o salvamento são os do editor de vídeo; as camadas são faixas com um clipe só.
 */
type EdicaoDeTexto = {
  clipeId: string;
  /** Um texto novo: onde ele começa (pixels da imagem) e acima de que camada entra; a máscara vira seleção, não camada. */
  novo: { ponto: { x: number; y: number }; acima: string | null; mascara?: boolean } | null;
  texto: TextoRico;
  /** O texto como estava (cancelar e "nada mudou"). */
  original: TextoRico | null;
  selecao: SelecaoDoTexto;
  /** O estilo mudado sem seleção, para o que for digitado. */
  estiloPendente: Partial<EstiloDoCaractere> | null;
};


/** O comando que põe o texto em edição no projeto (com a fonte sob o mouse no seletor, na seleção ou no texto todo). */
function comandoDaEdicao(edicao: EdicaoDeTexto, previa: Partial<EstiloDoCaractere> | null): Comando {
  let texto = edicao.texto;
  // Sem seleção, a fonte escolhida vale só para o que for digitado: a prévia também não muda o texto
  if (previa && edicao.selecao.de !== edicao.selecao.ate) texto = textoMedido(aplicarEstilo(texto, edicao.selecao.de, edicao.selecao.ate, previa));
  return edicao.novo
    ? { comando: "imagem.adicionarTextoRico", parametros: { texto, ponto: edicao.novo.ponto, nome: nomeDoTexto(texto), acima: edicao.novo.acima, id: edicao.clipeId } }
    : { comando: "imagem.textoRico", parametros: { clipeId: edicao.clipeId, texto } };
}

/** As opções de cada ferramenta de pintura ao abrir (o pincel e a borracha guardam tamanhos diferentes, como lá). */
const PINCEIS_PADRAO: Record<FerramentaDePintura, OpcoesDoPincel> = {
  pincel: PINCEL_PADRAO,
  lapis: { ...PINCEL_PADRAO, tamanho: 4, dureza: 1, espacamento: 0.1, suavizacao: 0 },
  borracha: { ...PINCEL_PADRAO, tamanho: 40 },
  historico: { ...PINCEL_PADRAO, tamanho: 40, dureza: 0.5 },
  historicoArtistico: { ...PINCEL_PADRAO, tamanho: 6, dureza: 0.6, fluxo: 0.85 },
  carimbo: { ...PINCEL_PADRAO, tamanho: 40, dureza: 0.5 },
  carimboDePadrao: { ...PINCEL_PADRAO, tamanho: 40, dureza: 0.5 },
  recuperacao: { ...PINCEL_PADRAO, tamanho: 30, dureza: 0.5 },
  recuperacaoParaManchas: { ...PINCEL_PADRAO, tamanho: 20, dureza: 0.5 },
  desfoque: { ...PINCEL_PADRAO, tamanho: 40, dureza: 0 },
  nitidez: { ...PINCEL_PADRAO, tamanho: 40, dureza: 0 },
  borrar: { ...PINCEL_PADRAO, tamanho: 30, dureza: 0.5, espacamento: 0.1 },
  subexposicao: { ...PINCEL_PADRAO, tamanho: 60, dureza: 0 },
  superexposicao: { ...PINCEL_PADRAO, tamanho: 60, dureza: 0 },
  esponja: { ...PINCEL_PADRAO, tamanho: 60, dureza: 0 },
  misturador: { ...PINCEL_PADRAO, tamanho: 30, dureza: 0.7, espacamento: 0.1 },
  substituicaoDeCor: { ...PINCEL_PADRAO, tamanho: 30, dureza: 1 },
  borrachaDeFundo: { ...PINCEL_PADRAO, tamanho: 40, dureza: 1 },
};
const RETOQUES_PADRAO: Record<FerramentaDoRetoque, OpcoesDoRetoque> = {
  desfoque: RETOQUE_PADRAO,
  nitidez: RETOQUE_PADRAO,
  borrar: RETOQUE_PADRAO,
  subexposicao: RETOQUE_PADRAO,
  superexposicao: RETOQUE_PADRAO,
  esponja: RETOQUE_PADRAO,
};
const FORMA_PADRAO: OpcoesDaForma = { ...OPCOES_DAS_FORMAS_PADRAO, personalizada: "coracao" };
const PERSPECTIVA_PADRAO = { largura: 0, altura: 0, resolucao: 0, grade: true };

/** Quanto a tecla de uma ferramenta precisa ficar apertada para valer só enquanto está (a ferramenta de mola). */
const SEGURAR_A_FERRAMENTA_MS = 400;

export function EditorDeImagem({ projetoId, modeloInicial }: { projetoId: string; modeloInicial?: string }) {
  const router = useRouter();
  const marca = useMarca();
  const biblioteca = useMidias();
  // As camadas de pixels criadas agora entram aqui antes da biblioteca recarregar (a pessoa já está pintando)
  const [criadas, setCriadas] = useState<ReadonlyMap<string, Midia>>(new Map());
  const midias = useMemo(() => new Map([...criadas, ...(biblioteca.midias ?? []).map((midia) => [midia.id, midia] as const)]), [biblioteca.midias, criadas]);
  const ctx = useMemo(() => contextoDasMidias(midias), [midias]);
  const edicao = useProjeto(projetoId, ctx);
  const { projeto, executar: executarNoProjeto, desfazer, refazer, mostrarAviso } = edicao;
  const area = useAreaDeTrabalho("imagem", AREAS, "essenciais", IDS_DOS_PAINEIS);

  const [ferramenta, setFerramenta] = useState<IdFerramentaDaImagem>("mover");
  const [ultimas, setUltimas] = useState<Partial<Record<number, IdFerramentaDaImagem>>>({});
  const [cores, setCores] = useState<{ primeiroPlano: string; fundo: string; editando: "primeiroPlano" | "fundo" }>({ primeiroPlano: "#000000", fundo: "#ffffff", editando: "primeiroPlano" });
  const [forma, setForma] = useState<OpcoesDaForma>(FORMA_PADRAO);
  const [opcoesDosGeradores, setOpcoesDosGeradores] = useState<OpcoesDosGeradores>(GERADORES_PADRAO);
  const [opcoesDoReflexo, setOpcoesDoReflexo] = useState<OpcoesDoReflexo>(REFLEXO_PADRAO);
  const [opcoesDaCota, setOpcoesDaCota] = useState<OpcoesDaCota>(COTA_PADRAO);
  const [mesclando, setMesclando] = useState(false);
  const [repetindo, setRepetindo] = useState<{ clipeId: string; caminho: Subcaminho; origem: string } | null>(null);
  const [pincelVetorial, setPincelVetorial] = useState<OpcoesDoPincelVetorial>(PINCEL_VETORIAL_PADRAO);
  // O caminho do começo do traço do Suavizar e da Borracha de caminho (cada movimento refaz a partir dele)
  const baseDoTracoLivre = useRef<Subcaminho[] | null>(null);
  const [opcoesDoLiquefazer, setOpcoesDoLiquefazer] = useState<OpcoesDoLiquefazer>(LIQUEFAZER_PADRAO);
  const liquefazendo = useRef<EstadoDoLiquefazer | null>(null);
  // A origem de Girar, Refletir, Escalar e Inclinar (vale para a escolha em que foi posta) e os números abertos
  const [origemDaTransformacao, setOrigemDaTransformacao] = useState<{ escolha: string; ponto: { x: number; y: number } } | null>(null);
  const [numerosDaTransformacao, setNumerosDaTransformacao] = useState<{ ferramenta: FerramentaDeTransformar; origem: { x: number; y: number } } | null>(null);
  // As formas personalizadas do espaço (Editar › Definir forma personalizada) e o nome da que está sendo definida
  const recursosDasFormas = useRecursos<{ subcaminhos: Subcaminho[] }>("forma");
  const formasDoEspaco: FormaDoEspaco[] = recursosDasFormas.recursos.map((recurso) => ({ id: recurso.id, nome: recurso.nome, subcaminhos: recurso.dados.subcaminhos ?? [] }));
  const [nomeDaForma, setNomeDaForma] = useState(false);
  // As pranchetas: o tamanho da próxima (a barra da ferramenta Prancheta) e a janela de exportar
  const [tamanhoDaPrancheta, setTamanhoDaPrancheta] = useState({ largura: 1080, altura: 1080 });
  const [exportandoPranchetas, setExportandoPranchetas] = useState(false);
  // A ferramenta Quadro: retangular ou elíptico
  const [formaDoQuadro, setFormaDoQuadro] = useState<"retangulo" | "elipse">("retangulo");
  // O clique sem arrastar de uma ferramenta de forma: a janela com as medidas
  const [criandoForma, setCriandoForma] = useState<{ tipo: TipoDaFormaViva; ponto: { x: number; y: number } } | null>(null);
  // O painel Caminhos: o caminho escolhido (a caneta soma nele; null, um caminho de trabalho novo), as opções das canetas
  // e as janelas de traçar, preencher e criar da seleção
  const [caminhoEscolhido, setCaminhoEscolhido] = useState<string | null>(null);
  const [caneta, setCaneta] = useState<OpcoesDaCaneta>(CANETA_PADRAO);
  // A camada cuja máscara vetorial as ferramentas de caminho editam (o clique na miniatura dela, no painel Camadas)
  const [mascaraVetorialEmFoco, setMascaraVetorialEmFoco] = useState<string | null>(null);
  // Os componentes escolhidos pela Seleção de caminho (a barra muda a operação deles)
  const [componentesEscolhidos, setComponentesEscolhidos] = useState<number[]>([]);
  const [janelaDoCaminho, setJanelaDoCaminho] = useState<{ tipo: "tracar" | "preencher"; id: string } | { tipo: "daSelecao" } | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [zoomMedido, setZoomMedido] = useState(1);
  const [removerAoSoltar, setRemoverAoSoltar] = useState(true);
  const [removerCercando, setRemoverCercando] = useState(true);
  const [removerNaCamadaNova, setRemoverNaCamadaNova] = useState(false);
  const [localizador, setLocalizador] = useState(true);
  const [pedindo, setPedindo] = useState(false);
  const [pedidoDeAba, setPedidoDeAba] = useState<{ aba: IdAba; vez: number } | undefined>(undefined);

  // As opções de cada ferramenta de pintura (o pincel e a borracha guardam tamanhos diferentes, como lá)
  const [pinceis, setPinceis] = useState<Record<FerramentaDePintura, OpcoesDoPincel>>(PINCEIS_PADRAO);
  // O retoque com pincel: as opções de cada ferramenta e o pincel do misturador (a tinta suja passa de um traço ao outro)
  const [opcoesDoRetoque, setOpcoesDoRetoque] = useState<Record<FerramentaDoRetoque, OpcoesDoRetoque>>(RETOQUES_PADRAO);
  const [opcoesDoMisturador, setOpcoesDoMisturador] = useState(MISTURADOR_PADRAO);
  const [opcoesDaSubstituicao, setOpcoesDaSubstituicao] = useState(SUBSTITUICAO_PADRAO);
  const [opcoesDaBorrachaDeFundo, setOpcoesDaBorrachaDeFundo] = useState<OpcoesDaSubstituicao>({ ...SUBSTITUICAO_PADRAO, tolerancia: 128 });
  const pincelDoMisturador = useRef({ estado: estadoNovo(), limpo: false });
  // O pincel de manchas, a Correção e o Mover sensível ao conteúdo: as opções, o que o traço de manchas precisa para
  // refazer a área quando solta, e o motor provisório das manchas numa foto (a IA refaz)
  const [opcoesDasManchas, setOpcoesDasManchas] = useState<OpcoesDasManchas>(MANCHAS_PADRAO);
  const [modoDaCorrecao, setModoDaCorrecao] = useState<"origem" | "destino">("origem");
  const [modoDoMoverSensivel, setModoDoMoverSensivel] = useState<"mover" | "estender">("mover");
  // O traço dos pincéis de recuperação, refeito ao soltar (com `fonte`, o de recuperação: a fonte colada sem emenda)
  const manchas = useRef<{ chave: string; pintura: Pintura; antes: ImageData; amostra: ImageData; vazia: boolean; fonte?: ImageData } | null>(null);
  const [motorDasManchas, setMotorDasManchas] = useState<{ pintura: Pintura; clipeId: string } | null>(null);
  const [quadroDasManchas, setQuadroDasManchas] = useState(0);
  // O carimbo: as cinco fontes de clonagem (o ponto do Alt + clique e o deslocamento), a da vez e as opções
  const [fontesDeClonagem, setFontesDeClonagem] = useState<(FonteDeClonagem | null)[]>([null, null, null, null, null]);
  const [fonteAtiva, setFonteAtiva] = useState(0);
  const [opcoesDoCarimbo, setOpcoesDoCarimbo] = useState<OpcoesDoCarimbo>(CARIMBO_PADRAO);
  const [sobreposicaoDaFonte, setSobreposicaoDaFonte] = useState<HTMLCanvasElement | null>(null);
  // Os instantâneos do Histórico (da sessão, como nos editores de imagem) e a fonte dos pincéis do histórico
  const [instantaneos, setInstantaneos] = useState<{ id: string; nome: string; projeto: Projeto }[]>([]);
  // As opções do Histórico (no navegador) e as janelas do instantâneo novo e das opções
  const [opcoesDoHistorico, setOpcoesDoHistorico] = useState<OpcoesDoHistorico>(carregarOpcoesDoHistorico);
  const [janelaDoHistorico, setJanelaDoHistorico] = useState<"instantaneo" | "opcoes" | null>(null);
  // O primeiro instantâneo, com o nome do documento, ao abrir (uma vez, quando o projeto chega)
  const [primeiroInstantaneoFeito, setPrimeiroInstantaneoFeito] = useState(false);
  if (projeto && !primeiroInstantaneoFeito) {
    setPrimeiroInstantaneoFeito(true);
    if (opcoesDoHistorico.primeiroInstantaneo) setInstantaneos((atual) => [{ id: "abertura", nome: edicao.nome || "Abertura", projeto }, ...atual]);
  }
  const [fonteDoHistorico, setFonteDoHistorico] = useState("passo:0");
  // O último passo do Ctrl+Alt+Z (alternar o último estado): desfeito, para refazer na próxima
  const ultimoFoiDesfazer = useRef(false);
  const [simetria, setSimetria] = useState<Simetria | null>(null);
  const [gerandoPixels, setGerandoPixels] = useState(false);
  // A máscara de camada em foco (o pincel pinta nela) e a máscara à vista (Alt + clique na miniatura dela)
  const [mascaraEmFoco, setMascaraEmFoco] = useState<string | null>(null);
  const [mascaraAVista, setMascaraAVista] = useState<string | null>(null);
  // A seleção do documento (lib/selecao), a última desmarcada (Selecionar novamente), as bordas à vista (Ctrl+H), as
  // opções das ferramentas de seleção e o Modificar que está perguntando o número
  const [selecaoDoDocumento, setSelecaoDoDocumento] = useState<Selecao | null>(null);
  const [selecaoAnterior, setSelecaoAnterior] = useState<Selecao | null>(null);
  const [bordasDaSelecao, setBordasDaSelecao] = useState(true);
  const [opcoesDaSelecao, setOpcoesDaSelecao] = useState<OpcoesDaSelecao>(OPCOES_DA_SELECAO);
  const [modificando, setModificando] = useState<ModificacaoDaSelecao | null>(null);
  // A imagem que a varinha e o laço magnético leem, guardada até o projeto mudar, e as bordas dela para o laço
  const imagemLida = useRef<{ chave: string; projeto: Projeto; imagem: Promise<ImagemRgba> } | null>(null);
  const [bordasDaImagem, setBordasDaImagem] = useState<MapaDeBordas | null>(null);
  const [imagemDaRapida, setImagemDaRapida] = useState<ImagemRgba | null>(null);
  // A janela do Intervalo de cores ou da Área de foco, com a imagem que ela lê
  const [janelaDaSelecao, setJanelaDaSelecao] = useState<{ tipo: "cores" | "foco"; imagem: ImagemRgba } | null>(null);
  const [achandoAssunto, setAchandoAssunto] = useState(false);
  // A máscara rápida (Q): o motor do documento com a seleção em cinza, e o quadro do traço (o véu redesenha)
  const [mascaraRapida, setMascaraRapida] = useState<Pintura | null>(null);
  const [quadroDaRapida, setQuadroDaRapida] = useState(0);
  // Os canais: o de cor à vista, o alfa à vista e pintado (com a imagem da versão dele) e a janela de salvar ou carregar
  const [corAVista, setCorAVista] = useState<CorDoCanal | null>(null);
  const [canalAtivo, setCanalAtivo] = useState<string | null>(null);
  const [imagemDoCanal, setImagemDoCanal] = useState<{ chave: string; imagem: ImageBitmap } | null>(null);
  const [janelaDoCanal, setJanelaDoCanal] = useState<"salvar" | "carregar" | null>(null);
  // Editar › Definir predefinição de pincel (pede o nome) e os pedidos ao painel Camadas (encontrar e isolar)
  const [nomeDoPincel, setNomeDoPincel] = useState(false);
  // As janelas de Preencher, Traçado e Aparar (lembram as últimas escolhas, como lá)
  const [janelaDePixels, setJanelaDePixels] = useState<"preencher" | "tracado" | "aparar" | "atenuar" | null>(null);
  // Mover os pixels selecionados (a seleção flutuante): o motor da camada, o que fica (com o buraco ou não), o pedaço
  // levado, a conta do deslocamento do documento para a camada e o arrasto ainda abrindo
  const flutuante = useRef<{ chave: string; pintura: Pintura; original: Uint8ClampedArray; base: ImageData; peca: HTMLCanvasElement; inversa: Afim; selecao: Selecao; cobertura: Uint8ClampedArray } | null>(null);
  const flutuanteAbrindo = useRef<Promise<void> | null>(null);
  // O Balde de tinta, a Borracha mágica e o Degradê: as opções da barra, os degradês do espaço e o editor aberto
  const [opcoesDoBalde, setOpcoesDoBalde] = useState(BALDE_PADRAO);
  const [opcoesDaBorrachaMagica, setOpcoesDaBorrachaMagica] = useState(BORRACHA_MAGICA_PADRAO);
  const [opcoesDoDegrade, setOpcoesDoDegrade] = useState(DEGRADE_PADRAO);
  const [editandoDegrade, setEditandoDegrade] = useState(false);
  const degradesDoEspaco = useRecursos<Degrade>("degrade");
  // Os estilos de caractere e de parágrafo salvos no espaço
  const estilosDeCaractere = useRecursos<{ estilo: Partial<EstiloDoCaractere> }>("estilo_caractere");
  const estilosDeParagrafo = useRecursos<{ estilo: Partial<EstiloDoParagrafo> }>("estilo_paragrafo");
  const estilosDeCamadaDoEspaco = useRecursos<{ estilo: EstiloDeCamada; preenchimento: number }>("estilo_camada");
  // Os padrões do espaço vão para a lista que os seletores de padrão mostram
  const padroesDoEspaco = useRecursos("padrao");
  useEffect(() => definirPadroesDoEspaco(padroesDoEspaco.recursos.map((recurso) => ({ id: recurso.id, nome: recurso.nome }))), [padroesDoEspaco.recursos]);
  const [nomeDoPadrao, setNomeDoPadrao] = useState(false);
  // Imagem › Tamanho da imagem, Tamanho da tela e Rotação da imagem › Arbitrária
  const [janelaDoDocumento, setJanelaDoDocumento] = useState<"imagem" | "tela" | "giro" | null>(null);
  // Filtro › Dissolver: a camada desenhada sozinha e o plano da camada de pixels que vem dela
  const [dissolvendo, setDissolvendo] = useState<{ tipo: "dissolver" | "marionete" | "lente" | "grandeAngular" | "perspectiva"; imagem: ImagemRgba; dados: Omit<PlanoDosPixels, "desenhar"> } | null>(null);
  // Editar › Alinhar e Mesclar camadas automaticamente: a janela aberta
  const [janelaDasCamadas, setJanelaDasCamadas] = useState<"alinhar" | "mesclar" | null>(null);
  // Filtro › Ponto de fuga: a imagem inteira, por baixo dos planos
  const [pontoDeFuga, setPontoDeFuga] = useState<ImagemRgba | null>(null);
  // Editar › Escala sensível ao conteúdo: a camada sozinha e a caixa do conteúdo dela
  const [escalando, setEscalando] = useState<{ imagem: ImagemRgba; caixa: CaixaDaMarionete; dados: Omit<PlanoDosPixels, "desenhar"> } | null>(null);
  const [importandoPadroes, setImportandoPadroes] = useState(false);
  const [ultimoPreenchimento, setUltimoPreenchimento] = useState<Preenchimento>({ conteudo: "primeiroPlano", cor: "#ff0000", padrao: "xadrez", modo: "normal", opacidade: 1, preservar: false });
  // A área de transferência das camadas: os pixels copiados, onde estavam no documento e o tamanho do PNG que foi para a
  // do sistema (para reconhecer a própria cópia ao colar e colar no mesmo lugar)
  const areaDeTransferencia = useRef<{ canvas: HTMLCanvasElement; x: number; y: number; tamanhoDoPng: number } | null>(null);
  const [ultimoTracado, setUltimoTracado] = useState<Tracado>({ largura: 4, cor: "#000000", onde: "centro", modo: "normal", opacidade: 1, preservar: false });
  // Selecionar e mascarar: a camada sozinha (ou a imagem), o resto das camadas e o clipe da camada
  const [refinando, setRefinando] = useState<{ imagem: ImagemRgba; fundo: ImagemRgba | null; clipeId: string | null; faixaId: string | null } | null>(null);
  // A transformação livre (da seleção, ou de uma camada): a caixa (em pixels do documento) do começo e a de agora, o
  // modo, o pedaço em resolução cheia (a fonte) e a cópia pequena dele para a prévia, a referência, os números digitados
  // (null: tirados da caixa) e a interpolação; numa camada, o que é preciso para gravar o resultado
  const [transformando, setTransformando] = useState<Transformando | null>(null);
  // A última transformação de camada, no referencial da caixa dela (Editar › Transformar › Transformar novamente)
  const ultimaTransformacao = useRef<{ cantos: PontoDaMalha[]; malha: Malha | null; interpolacao: Interpolacao } | null>(null);
  const [pedidoAsCamadas, setPedidoAsCamadas] = useState<{ tipo: "procurar" | "isolar"; vez: number; faixaIds: string[] } | null>(null);
  // As seções travadas no painel Configurações do pincel ficam ao escolher outra predefinição
  const [secoesTravadas, setSecoesTravadas] = useState<ReadonlySet<SecaoDoPincel>>(new Set());
  const pinceisDoEspaco = usePinceisDoEspaco();
  const [ocupadoComPinceis, setOcupadoComPinceis] = useState<string | null>(null);
  const [selecao, definirSelecao] = useState<string[]>([]);
  const [exportando, setExportando] = useState<false | "exportar" | "web">(false);
  const [preferenciasDeExportacao, setPreferenciasDeExportacao] = useState(false);
  const [camadasEmArquivos, setCamadasEmArquivos] = useState(false);
  // As comps de camada: a aplicada por último e a última posição do documento (o estado de antes), só na sessão
  const [compsEmArquivos, setCompsEmArquivos] = useState(false);
  const [pesquisando, setPesquisando] = useState(false);
  const [preferindo, setPreferindo] = useState(false);
  // A linha do tempo de quadros: o quadro escolhido e a animação tocando (só na tela)
  const [quadroAtual, setQuadroAtual] = useState<string | null>(null);
  // As fatias: a escolhida pela Seleção de fatia e as janelas
  const [fatiaEscolhida, setFatiaEscolhida] = useState<string | null>(null);
  const [opcoesDaVarinhaVetorial, setOpcoesDaVarinhaVetorial] = useState<OpcoesDaVarinhaVetorial>(VARINHA_VETORIAL_PADRAO);
  const [janelaDaFatia, setJanelaDaFatia] = useState<"dividir" | "opcoes" | null>(null);
  const [fatiasEmArquivos, setFatiasEmArquivos] = useState(false);
  // O painel Teclas modificadoras (Shift, Ctrl e Alt presos, para a tela de toque)
  useTeclasPresas();
  const [tocandoAnimacao, setTocandoAnimacao] = useState(false);
  const relogioDaAnimacao = useRef<number | null>(null);
  // Editar › Atalhos de teclado e menus e Barra de ferramentas (no navegador), e os itens escondidos à vista
  const [personalizacao, setPersonalizacao] = useState<Personalizacao>(carregarPersonalizacao);
  const [personalizando, setPersonalizando] = useState<AbaDaPersonalizacao | null>(null);
  const [mostrarTudoNosMenus, setMostrarTudoNosMenus] = useState(false);
  // A ferramenta de mola: segurar a tecla de uma ferramenta usa ela só enquanto a tecla está apertada
  const mola = useRef<{ tecla: string; anterior: IdFerramentaDaImagem; inicio: number } | null>(null);
  const [compAplicada, setCompAplicada] = useState<string | null>(null);
  const [ultimaPosicao, setUltimaPosicao] = useState<CompDeCamada | null>(null);
  const [janelaDoArquivo, setJanelaDoArquivo] = useState<"informacoes" | "duplicar" | "imprimir" | null>(null);
  // A prova de cores e o alerta de gama são da tela (como o zoom): não entram no projeto
  const [prova, setProva] = useState<{ tipo: TipoDaProva; ligada: boolean }>({ tipo: "cmyk", ligada: false });
  const [alertaDeGama, setAlertaDeGama] = useState(false);
  // Exibir: as preferências da vista ficam no navegador (são da tela de quem edita); as guias são do documento
  const [vista, setVista] = useState<PreferenciasDaVista>(lerVista);
  // A vista girada (R) e o pedido de enquadrar uma camada: só da tela
  const [giroDaVista, setGiroDaVista] = useState({ angulo: 0, espelhada: false });
  // O Amostrador de cor (os pontos, em pixels do documento, só da sessão) e o lado da amostra do conta-gotas
  const [amostradores, setAmostradores] = useState<{ x: number; y: number }[]>([]);
  const [ladoDaAmostra, setLadoDaAmostra] = useState(1);
  // A medição: a nota aberta, o autor e a cor das notas novas, o Registro de medições (só da sessão) e as janelas
  const [notaEscolhida, setNotaEscolhida] = useState<string | null>(null);
  const [autorDasNotas, setAutorDasNotas] = useState("");
  const [corDasNotas, setCorDasNotas] = useState("#ffd60a");
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const medicoesFeitas = useRef(0);
  const [janelaDaMedicao, setJanelaDaMedicao] = useState<"escala" | "marcador" | null>(null);
  // Os documentos abertos em abas (a lista fica no navegador): este entra com o nome dele ao abrir e ao renomear
  const abertos = useSyncExternalStore(assinarDocumentos, documentosAbertos, documentosNoServidor);
  const nomeDoDocumento = edicao.nome;
  useEffect(() => {
    if (projeto?.tipo === "imagem") mudarDocumentos(abrirDocumento(documentosAbertos(), { id: projetoId, nome: nomeDoDocumento }));
  }, [projeto?.tipo, projetoId, nomeDoDocumento]);
  const abas = abertos.some((documento) => documento.id === projetoId) ? abertos : [...abertos, { id: projetoId, nome: nomeDoDocumento }];
  const fecharAba = (id = projetoId) => {
    const { lista, proximo } = fecharDocumento(documentosAbertos(), id);
    mudarDocumentos(lista);
    if (id === projetoId) router.push(proximo ? `/app/imagem/${proximo}` : "/app/ferramentas/editor-de-imagem");
  };
  // Exibir › Modo de tela (F) e os painéis escondidos pelo Tab (todos) ou pelo Shift+Tab (só os da direita)
  const [modoDeTela, setModoDeTela] = useState<ModoDeTela>("padrao");
  const [paineisOcultos, setPaineisOcultos] = useState<"nenhum" | "todos" | "encaixados">("nenhum");
  const mudarModoDeTela = (modo: ModoDeTela) => {
    setModoDeTela(modo);
    // Só a imagem: os painéis saem (o Tab os traz de volta); voltando ao padrão, eles voltam
    setPaineisOcultos(modo === "cheia" ? "todos" : "nenhum");
    // A tela cheia do navegador: o Esc dele sai, e o editor volta ao modo padrão (abaixo)
    if (modo !== "padrao" && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (modo === "padrao" && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    const aoMudar = () => {
      if (!document.fullscreenElement) {
        setModoDeTela("padrao");
        setPaineisOcultos("nenhum");
      }
    };
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);
  const [enquadrar, setEnquadrar] = useState<{ retangulo: RetanguloDaImagem; vez: number } | null>(null);
  const mudarVista = (mudanca: Partial<PreferenciasDaVista>) =>
    setVista((atual) => {
      const nova = { ...atual, ...mudanca };
      guardarVista(nova);
      return nova;
    });
  const [janelaDaVista, setJanelaDaVista] = useState<"guia" | "layout" | "grade" | null>(null);
  const [janelaDasVariaveis, setJanelaDasVariaveis] = useState<"definir" | "conjuntos" | null>(null);
  const [automatizando, setAutomatizando] = useState<TipoDaAutomacao | null>(null);
  const [ajustandoImagem, setAjustandoImagem] = useState(false);
  const [janelaDoModo, setJanelaDoModo] = useState<"bitmap" | "duotone" | "indexadas" | "tabela" | "cmyk" | null>(null);
  const [atalhos, setAtalhos] = useState(false);
  const [provisorio, setProvisorio] = useState<Comando | null>(null);
  // O texto em edição na tela (ADR 0003, onda 13.8): fica fora do histórico até terminar, e aí vira um passo só
  const [edicaoDeTexto, setEdicaoDeTexto] = useState<EdicaoDeTexto | null>(null);
  // As opções da ferramenta Texto para o próximo texto, e a fonte sob o mouse no seletor (a prévia mostra nela)
  const [opcoesDoTexto, setOpcoesDoTexto] = useState<{ estilo: Partial<EstiloDoCaractere>; paragrafo: Partial<EstiloDoParagrafo> }>({ estilo: {}, paragrafo: {} });
  const [fonteEmPrevia, setFonteEmPrevia] = useState<string | null>(null);
  const [localizandoTexto, setLocalizandoTexto] = useState(false);
  // Camada › Estilo de camada: a camada e o efeito em que a janela abriu
  const [estiloAberto, setEstiloAberto] = useState<{ clipeId: string; foco: TipoDoEfeito | "mesclagem" } | null>(null);
  // Copiar estilo de camada guarda aqui; as janelas pequenas do estilo
  const [estiloCopiado, setEstiloCopiado] = useState<EstiloDeCamada | null>(null);
  const [janelaDoEstilo, setJanelaDoEstilo] = useState<"luz" | "dimensionar" | null>(null);
  // Texto › Deformar texto: a deformação de antes (para o Cancelar) enquanto a janela está aberta
  const [deformando, setDeformando] = useState<{ clipeId: string; antes: Deformacao | null } | null>(null);
  /** A janela da camada de preenchimento: a nova (sem clipe, acima da escolhida) ou a de uma que já existe. */
  const [preenchendo, setPreenchendo] = useState<{ clipeId: string | null; acima: string | null; inicial: CamadaDePreenchimento } | null>(null);
  const versaoDasFontes = useVersaoDasFontes();
  // As mídias pedidas (formas, fotos da IA) entram como camada quando ficam prontas; a troca de uma foto também espera
  const pendentes = useRef(new Map<string, Pendente>());
  // O modelo escolhido espera as formas dele aparecerem na biblioteca, como as formas avulsas
  const modeloPendente = useRef<{ modelo: ModeloDeImagem; cores: string[]; midias: Record<string, Midia> } | null>(null);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [trocando, setTrocando] = useState<string | null>(null);
  // Editar › Preenchimento generativo: a janela do texto (a área é a seleção do documento)
  const [preenchendoComIA, setPreenchendoComIA] = useState(false);
  // O Corte (C): a caixa em andamento e as opções, que ficam de um corte para o outro
  const [recorte, setRecorte] = useState<CaixaDoCorte | null>(null);
  const [opcoesDoCorte, setOpcoesDoCorte] = useState<OpcoesDoCorte>(CORTE_PADRAO);
  // O Corte de perspectiva: o quadrilátero e o tamanho do resultado (0 é pelos lados do quadrilátero)
  const [cortePerspectiva, setCortePerspectiva] = useState<Quadrilatero | null>(null);
  const [opcoesDaPerspectiva, setOpcoesDaPerspectiva] = useState(PERSPECTIVA_PADRAO);
  // A Régua: a última medida (fica ao trocar de ferramenta, como lá)
  const [medida, setMedida] = useState<Medida | null>(null);
  const modeloDoEndereco = useRef(false);
  // As caixas das camadas na tela (a prévia mede), para alinhar e distribuir
  const caixasRef = useRef<Map<string, CaixaNoQuadro>>(new Map());

  const setSelecao = useCallback((ids: string[]) => {
    const ativo = document.activeElement;
    if (ativo instanceof HTMLElement && ativo.matches("input, textarea, select")) ativo.blur();
    definirSelecao(ids);
  }, []);
  // A gravação de uma ação (painel Ações) recebe cada comando feito, com as camadas escolhidas antes e depois
  const registrarNaAcao = useRef<((comando: Comando, nome: string, antes: CamadasEscolhidas, depois: CamadasEscolhidas) => void) | null>(null);
  const selecaoAtual = useRef<string[]>([]);
  const executar = useCallback(
    (comando: Comando) => {
      // Mostrar e esconder camadas só vira passo quando as opções do Histórico mandam
      const soVisibilidade = comando.comando === "imagem.soEsta" || (comando.comando === "imagem.camada" && Object.keys(comando.parametros.mudanca).every((chave) => chave === "oculta"));
      const antesDoComando = selecaoAtual.current;
      const resultado = executarNoProjeto(comando, { semPasso: soVisibilidade && !opcoesDoHistorico.visibilidadeDesfazivel });
      if (resultado?.selecao) setSelecao(resultado.selecao);
      if (resultado && registrarNaAcao.current) {
        const faixas = (clipes: string[]) => clipes.flatMap((id) => resultado.projeto.faixas.find((faixa) => faixa.clipes.some((clipe) => clipe.id === id))?.id ?? []);
        const depois = resultado.selecao ?? antesDoComando;
        registrarNaAcao.current(comando, NOMES_DOS_COMANDOS[comando.comando], { clipes: antesDoComando, faixas: faixas(antesDoComando) }, { clipes: depois, faixas: faixas(depois) });
      }
      return resultado;
    },
    [executarNoProjeto, setSelecao, opcoesDoHistorico.visibilidadeDesfazivel],
  );
  const { configurarHistorico } = edicao;
  useEffect(() => {
    configurarHistorico({ limite: opcoesDoHistorico.estados, naoLinear: opcoesDoHistorico.naoLinear });
  }, [configurarHistorico, opcoesDoHistorico.estados, opcoesDoHistorico.naoLinear]);
  // As Ações: a parada que espera a resposta ao tocar, os conjuntos e a gravação
  const [paradaDaAcao, setParadaDaAcao] = useState<{ mensagem: string; continuar: boolean; responder: (seguir: boolean) => void } | null>(null);
  const acoesDoEspaco = useAcoes({
    executar,
    escolhidas: () => {
      const atual = projetoRef.current;
      const clipes = selecaoAtual.current;
      return { clipes, faixas: atual ? clipes.flatMap((id) => atual.faixas.find((faixa) => faixa.clipes.some((clipe) => clipe.id === id))?.id ?? []) : [] };
    },
    faixasDosClipes: (clipes) => {
      const atual = projetoRef.current;
      return atual ? clipes.flatMap((id) => atual.faixas.find((faixa) => faixa.clipes.some((clipe) => clipe.id === id))?.id ?? []) : [];
    },
    perguntar: (mensagem, continuar) =>
      new Promise<boolean>((resolver) =>
        setParadaDaAcao({
          mensagem,
          continuar,
          responder: (seguir) => {
            setParadaDaAcao(null);
            resolver(seguir);
          },
        }),
      ),
    aoAvisar: mostrarAviso,
    novoId: () => crypto.randomUUID().slice(0, 12),
  });
  useEffect(() => {
    registrarNaAcao.current = acoesDoEspaco.gravacao ? acoesDoEspaco.registrar : null;
  });
  // As teclas de função das ações (F2, F3, F4, F9, F10, com Shift ou Ctrl)
  const teclaDaAcao = useEffectEvent((evento: KeyboardEvent) => {
    if (evento.defaultPrevented || janelaAberta) return;
    const tecla = teclaDoEventoDaAcao(evento);
    if (!tecla) return;
    const acao = acoesDoEspaco.conjuntos.flatMap((conjunto) => conjunto.acoes).find((item) => mesmaTecla(item.tecla, tecla));
    if (!acao) return;
    evento.preventDefault();
    if (!acoesDoEspaco.gravacao) void acoesDoEspaco.tocar(acao);
  });
  useEffect(() => {
    const ouvir = (evento: KeyboardEvent) => teclaDaAcao(evento);
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, []);
  const pinturas = usePinturas({ executar, aoAvisar: mostrarAviso });
  // O projeto mais novo, para quem espera a pintura subir (a exportação) ler o que veio depois
  const projetoRef = useRef(projeto);
  useEffect(() => {
    projetoRef.current = projeto;
  });
  /** Desfazer e refazer esperam a pintura que ainda está subindo: o traço vira um passo antes. */
  const depoisDaPintura = (acao: () => void) => (pinturas.enviando ? void pinturas.esperar().then(acao) : acao());
  const faixaTransformada = transformando?.camada && !transformando.camada.copia ? transformando.camada.faixaId : null;
  const projetoNaTela = useMemo(() => {
    let base = projeto;
    if (base && provisorio) {
      try {
        base = executarComando(base, provisorio, ctx).projeto;
      } catch {
        // fica o de antes
      }
    }
    // O texto em edição (ou o escolhido, com a fonte sob o mouse no seletor) aparece como está
    const textoNaTela = edicaoDeTexto ? comandoDaEdicao(edicaoDeTexto, fonteEmPrevia ? { familia: fonteEmPrevia } : null) : null;
    if (base && textoNaTela) {
      try {
        base = executarComando(base, textoNaTela, ctx).projeto;
      } catch {
        // fica o de antes
      }
    }
    // A camada que está sendo transformada sai da prévia: ela aparece pela caixa da transformação
    if (base && faixaTransformada) base = { ...base, faixas: base.faixas.map((faixa) => (faixa.id === faixaTransformada ? { ...faixa, oculta: true } : faixa)) };
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a versão das fontes refaz a medida do texto em edição
  }, [projeto, provisorio, ctx, faixaTransformada, edicaoDeTexto, fonteEmPrevia, versaoDasFontes]);
  const preverDoPainel = (comando: Comando | null) => {
    if (comando !== null || !provisorio) {
      setProvisorio(comando);
      return;
    }
    setProvisorio(null);
    if (JSON.stringify(projetoNaTela) !== JSON.stringify(projeto)) executar(provisorio);
  };
  const abrirAba = (aba: IdAba) => {
    area.abrir("propriedades");
    setPedidoDeAba((atual) => ({ aba, vez: (atual?.vez ?? 0) + 1 }));
  };

  /** Pede as formas do modelo (e o lugar das fotos); o modelo entra quando todas aparecem na biblioteca. */
  const aplicarModelo = (modelo: ModeloDeImagem) => {
    setAplicando(modelo.id);
    const coresDaMarca = marca.cores;
    Promise.all(pedidosDoModelo(modelo, coresDaMarca, new Set()).map(({ chave, forma: pedido }) => criarForma(pedido).then((midia) => [chave, midia] as const)))
      .then((lista) => {
        modeloPendente.current = { modelo, cores: coresDaMarca, midias: Object.fromEntries(lista) };
        void biblioteca.recarregar();
      })
      .catch((e: unknown) => {
        mostrarAviso(e instanceof Error ? e.message : "Não foi possível aplicar o modelo agora.");
        setAplicando(null);
      });
  };
  const esperarMidia = (midia: Midia, pendente: Pendente = {}) => {
    pendentes.current.set(midia.id, pendente);
    void biblioteca.recarregar();
  };

  const resolverPendentes = useEffectEvent(() => {
    const pendente = modeloPendente.current;
    if (pendente && Object.values(pendente.midias).every((midia) => midias.get(midia.id)?.status === "pronta")) {
      modeloPendente.current = null;
      setAplicando(null);
      const doModelo: MidiasDoModelo = {};
      for (const [chave, midia] of Object.entries(pendente.midias)) doModelo[chave] = { id: midia.id, largura: midia.video?.largura ?? 1, altura: midia.video?.altura ?? 1 };
      executar({
        comando: "imagem.aplicarModelo",
        parametros: { camadas: camadasDoModelo(pendente.modelo, pendente.cores, doModelo), tamanho: pendente.modelo.tamanho, fundo: fundoDoModelo(pendente.modelo, pendente.cores) },
      });
    }
    for (const [id, acao] of pendentes.current) {
      const midia = midias.get(id);
      if (!midia || midia.status === "processando" || midia.status === "enviando") continue;
      pendentes.current.delete(id);
      if (midia.status === "erro") mostrarAviso(`"${midia.nome}" não ficou pronta: ${midia.erro ?? "erro desconhecido"}`);
      else if (acao.camadaDe) executar({ comando: "imagem.camadaComOutraMidia", parametros: { faixaId: acao.camadaDe, midiaId: id } });
      else if (acao.trocar) executar({ comando: "clipe.trocarMidia", parametros: { clipeIds: acao.trocar, midiaId: id } });
      else
        executar({
          comando: "imagem.adicionarMidia",
          parametros: { midiaId: id, transformacao: acao.caixa && projeto ? transformacaoDaCaixa(acao.caixa, midia, tamanhoDaImagem(projeto)) : undefined, geracao: acao.geracao },
        });
    }
  });
  useEffect(() => {
    if (pendentes.current.size || modeloPendente.current) resolverPendentes();
  }, [midias]);

  /**
   * O preenchimento generativo: o recorte em volta da área marcada (com uma folga, para o modelo ver o que combina),
   * como a imagem aparece, com a área transparente; a primeira variação entra como camada no recorte, e as outras
   * ficam na seção Variações.
   */
  const pedirPreenchimento = async (descricao: string, variacoes: number, dado?: { selecao: Selecao; projeto: Projeto }) => {
    const atual = dado?.projeto ?? projetoRef.current;
    const selecao = dado?.selecao ?? selecaoNoDocumento;
    const caixa = selecao ? limites(selecao) : null;
    if (!atual || !selecao || !caixa) return mostrarAviso("Marque a área a preencher com uma ferramenta de seleção.");
    const documento = tamanhoDaImagem(atual);
    const folga = Math.max(32, 0.3 * Math.max(caixa.x1 - caixa.x0, caixa.y1 - caixa.y0));
    const x = Math.max(0, Math.floor(caixa.x0 - folga));
    const y = Math.max(0, Math.floor(caixa.y0 - folga));
    const recorte: RetanguloDaImagem = { x, y, largura: Math.min(documento.largura, Math.ceil(caixa.x1 + folga)) - x, altura: Math.min(documento.altura, Math.ceil(caixa.y1 + folga)) - y };
    setPreenchendoComIA(false);
    try {
      await pinturas.esperar();
      const bitmap = await createImageBitmap(await exportarImagem(atual, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }));
      // Até 2048 de lado (o worker leva ao tamanho do modelo); por baixo, branco: o que é transparente na imagem não é área a preencher
      const escala = Math.min(1, 2048 / Math.max(recorte.largura, recorte.altura));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(recorte.largura * escala));
      canvas.height = Math.max(1, Math.round(recorte.altura * escala));
      const ctx2d = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx2d.fillStyle = "#ffffff";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      ctx2d.drawImage(bitmap, (recorte.x * bitmap.width) / documento.largura, (recorte.y * bitmap.height) / documento.altura, (recorte.largura * bitmap.width) / documento.largura, (recorte.altura * bitmap.height) / documento.altura, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const dados = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
      for (let py = 0, i = 3; py < canvas.height; py++) {
        const dy = Math.min(selecao.altura - 1, Math.floor(recorte.y + (py + 0.5) / escala));
        for (let px = 0; px < canvas.width; px++, i += 4) {
          const dx = Math.min(selecao.largura - 1, Math.floor(recorte.x + (px + 0.5) / escala));
          if (selecao.dados[dy * selecao.largura + dx] >= 128) dados.data[i] = 0;
        }
      }
      ctx2d.putImageData(dados, 0, 0);
      const criadas = await chamarApi<Midia[]>("/midias/preencher", { metodo: "POST", corpo: { imagem: canvas.toDataURL("image/png"), descricao, variacoes } });
      if (!criadas.length) return;
      esperarMidia(criadas[0], { caixa: recorte, geracao: { descricao, variacoes: criadas.map((midia) => midia.id) } });
      mostrarAviso(variacoes > 1 ? `Gerando ${variacoes} variações: a primeira entra como camada quando ficar pronta (a primeira leva uns 2 min).` : "Gerando o preenchimento: ele entra como camada quando ficar pronto (uns 2 min).");
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível pedir o preenchimento.");
    }
  };
  // Filtro › Filtros neurais: a janela dos que têm modelo (estilo, colorir, restaurar)
  const [filtroNeural, setFiltroNeural] = useState<FiltroNeural | null>(null);
  const abrirFiltroNeural = async (qual: FiltroNeural | "profundidade" | "superZoom") => {
    if (!foto || !selecionado || selecionado.clipe.pixels) return mostrarAviso("Escolha uma foto: os filtros neurais valem em fotos.");
    if (qual === "estilo" || qual === "colorir" || qual === "restaurar") return setFiltroNeural(qual);
    try {
      if (qual === "superZoom") {
        const midia = await chamarApi<Midia>(`/midias/${foto.id}/ampliar`, { metodo: "POST", corpo: { fator: 2 } });
        esperarMidia(midia, { trocar: [selecionado.clipe.id] });
        return mostrarAviso("Ampliando a foto 2×: ela troca quando ficar pronta.");
      }
      // O desfoque de profundidade: a profundidade da foto (uma vez) e o desfoque de lente lendo ela, com o perto nítido
      await profundidadeDaFoto(foto.id);
      await biblioteca.recarregar();
      aplicarFiltroDoMenu("lente", { fonte: "profundidade", focal: 255, raio: 15, iris: "circulo", curvatura: 100 });
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível aplicar o filtro.");
    }
  };
  const pedirFiltroNeural = async (qual: FiltroNeural, corpo: Record<string, unknown>) => {
    setFiltroNeural(null);
    if (!foto || !selecionado) return;
    try {
      const midia = await chamarApi<Midia>(`/midias/${foto.id}/${qual}`, { metodo: "POST", corpo });
      esperarMidia(midia, { camadaDe: selecionado.faixa.id });
      mostrarAviso(qual === "restaurar" ? "Restaurando a foto: ela entra numa camada nova quando ficar pronta." : "Gerando: o resultado entra numa camada nova quando ficar pronto (a primeira vez leva uns 2 min).");
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível pedir o filtro.");
    }
  };
  // Arquivo › Abrir (vira um documento) e Colocar incorporado (vira uma camada aqui): o arquivo do computador sobe
  // pelo envio de sempre e espera a ingestão
  const { iniciar: iniciarEnvio } = useEnvios();
  const [recentes, setRecentes] = useState<ImagemRecente[]>([]);
  useEffect(() => {
    let vivo = true;
    imagensRecentes(projetoId)
      .then((lista) => vivo && setRecentes(lista))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [projetoId]);
  const escolherArquivo = (destino: "documento" | "camada") => {
    const entrada = document.createElement("input");
    entrada.type = "file";
    entrada.accept = destino === "documento" ? `${ACEITAR_IMAGENS},${ACEITAR_PSD}` : ACEITAR_IMAGENS;
    entrada.onchange = () => {
      const arquivo = entrada.files?.[0];
      if (!arquivo) return;
      // O PSD abre com as camadas, lido aqui no navegador
      if (destino === "documento" && ehPsd(arquivo)) {
        mostrarAviso(`Abrindo "${arquivo.name}"…`);
        abrirPsd(arquivo, mostrarAviso)
          .then(({ projetoId: id, avisos }) => {
            guardarAvisos(id, avisos);
            router.push(`/app/imagem/${id}`);
          })
          .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível abrir o PSD."));
        return;
      }
      mostrarAviso(destino === "documento" ? `Abrindo "${arquivo.name}"…` : `Colocando "${arquivo.name}"…`);
      enviarEEsperar(iniciarEnvio, arquivo)
        .then(async (midia) => {
          if (destino === "documento") return router.push(`/app/imagem/${await documentoDaImagem(midia.id)}`);
          esperarMidia(midia);
        })
        .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível abrir a imagem."));
    };
    entrada.click();
  };
  // Os avisos da abertura de um PSD (o que não veio como era), uma vez, ao abrir o documento
  useEffect(() => {
    const avisos = avisosGuardados(projetoId);
    if (avisos.length) mostrarAviso(avisos.join(" "));
  }, [projetoId, mostrarAviso]);
  // Imagem › Variáveis: como achar a foto pelo valor (o nome do arquivo, com ou sem a extensão, ou o id) e medir o texto
  const definicaoDasVariaveis: VariaveisDoDocumento = projeto?.variaveis ?? { variaveis: [], conjuntos: [] };
  const paraAplicar = (): ParaAplicar => ({
    ctx,
    medir: textoMedido,
    imagem: (valor) => {
      const procurado = valor.trim().toLowerCase();
      const semExtensao = (nome: string) => nome.toLowerCase().replace(/\.[a-z0-9]+$/, "");
      const midia = imagensProntas.find((item) => item.id === valor.trim() || item.nome.toLowerCase() === procurado || semExtensao(item.nome) === semExtensao(procurado));
      return midia?.video ? { midiaId: midia.id, tamanho: { largura: midia.video.largura, altura: midia.video.altura } } : null;
    },
    tamanhoDaMidia: (midiaId) => {
      const video = midias.get(midiaId)?.video;
      return video ? { largura: video.largura, altura: video.altura } : null;
    },
  });
  /** Aplicar um conjunto de dados: o documento com os valores dele, num passo do desfazer. */
  const aplicarConjuntoDeDados = (conjunto: ConjuntoDeDados) => {
    const atual = projetoRef.current;
    if (!atual) return;
    const { projeto: aplicado, avisos } = aplicarConjunto(atual, atual.variaveis ?? definicaoDasVariaveis, conjunto, paraAplicar());
    if (executar({ comando: "imagem.aplicarConjunto", parametros: { faixas: aplicado.faixas } })) mostrarAviso(avisos.length ? avisos.join(" ") : `Conjunto "${conjunto.nome}" aplicado.`);
  };
  /** O fim do Automatizar: o primeiro documento criado abre (os outros ficam em Abrir recentes). */
  const aoCriarPelaAutomacao = (ids: string[], avisos: string[]) => {
    setAutomatizando(null);
    if (!ids.length) return;
    const todos = ids.length > 1 ? [`${ids.length} documentos criados: os outros estão em Arquivo › Abrir recentes.`, ...avisos] : avisos;
    guardarAvisos(ids[0], todos);
    router.push(`/app/imagem/${ids[0]}`);
  };
  /** Arquivo › Automatizar › Cortar e endireitar fotos: a imagem como se vê, procurada e cortada em documentos novos. */
  const cortarEEndireitarFotos = async () => {
    if (!projeto) return;
    try {
      mostrarAviso("Procurando as fotos…");
      await pinturas.esperar();
      const atual = projetoRef.current ?? projeto;
      const { canvas } = await pixelsDoBlob(await exportarImagem(atual, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }));
      const dados = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data;
      aoCriarPelaAutomacao(await cortarEEndireitar({ dados, largura: canvas.width, altura: canvas.height }, edicao.nome.trim() || "Foto", mostrarAviso), []);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível cortar as fotos.");
    }
  };
  /** Imagem › Modo › Cores indexadas: a paleta sai da imagem como ela está agora (no RGB, numa cópia de até 1024 px). */
  const converterEmIndexadas = async (opcoes: { paleta: PaletaDaExportacao; cores: number; pontilhado: Pontilhado; quantidade: number; transparencia: boolean }) => {
    setJanelaDoModo(null);
    if (!projeto) return;
    try {
      await pinturas.esperar();
      const atual = projetoRef.current ?? projeto;
      const { largura, altura } = tamanhoDaImagem(atual);
      const escala = Math.min(1, 1024 / Math.max(largura, altura));
      const { canvas } = await pixelsDoBlob(await exportarImagem(atual, midias, { formato: "png", escala, fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }));
      const dados = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data;
      const indexada = indexar(dados, canvas.width, canvas.height, { ...opcoes, fosco: [255, 255, 255] });
      const paleta = indexada.transparente === null ? indexada.paleta : indexada.paleta.slice(0, indexada.transparente);
      executar({ comando: "imagem.modo", parametros: { modo: { tipo: "indexadas", paleta, pontilhado: opcoes.pontilhado, quantidade: opcoes.quantidade, transparencia: opcoes.transparencia } } });
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível converter em cores indexadas.");
    }
  };
  /** Imagem › Duplicar: um documento novo com uma cópia deste (as camadas de pixels continuam nas mesmas mídias). */
  const duplicarDocumento = async (nome: string, mescladas: boolean, origem?: Projeto) => {
    setJanelaDoArquivo(null);
    if (!projeto) return;
    try {
      mostrarAviso("Duplicando…");
      await pinturas.esperar();
      // A origem: o estado de agora, ou um instantâneo do Histórico (Documento novo a partir do estado)
      const atual = origem ?? projetoRef.current ?? projeto;
      const { largura, altura } = tamanhoDaImagem(atual);
      const novo = await chamarApi<Projeto>("/projetos", { metodo: "POST", corpo: { nome, tamanho: { largura, altura } } });
      let faixas = atual.faixas;
      if (mescladas) {
        // A imagem como aparece, numa camada de pixels só
        const midia = await criarCamadaDePixels(largura, altura, nome);
        const png = await exportarImagem(atual, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros });
        const versao = await enviarVersao(midia.id, png);
        faixas = executarComando(novo, { comando: "imagem.adicionarPixels", parametros: { midiaId: midia.id, nome: "Fundo", versao } }, ctx).projeto.faixas;
      }
      await chamarApi(`/projetos/${novo.id}`, {
        metodo: "PUT",
        corpo: {
          versao: novo.versao,
          nome,
          proporcao: atual.proporcao,
          taxa: atual.taxa,
          fundo: atual.fundo,
          faixas,
          marcadores: [],
          canais: mescladas ? [] : (atual.canais ?? []),
          caminhos: mescladas ? [] : (atual.caminhos ?? []),
          luz_global: atual.luz_global ?? undefined,
          informacoes: atual.informacoes ?? undefined,
          tamanho: atual.tamanho ?? { largura, altura },
        },
      });
      router.push(`/app/imagem/${novo.id}`);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível duplicar a imagem.");
    }
  };
  /** Arquivo › Imprimir: a imagem como aparece, na janela de impressão do navegador. */
  const imprimir = async (opcoes: OpcoesDaImpressao) => {
    setJanelaDoArquivo(null);
    if (!projeto) return;
    try {
      await pinturas.esperar();
      const atual = projetoRef.current ?? projeto;
      const { largura, altura } = tamanhoDaImagem(atual);
      const exportada = await exportarImagem(atual, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros });
      // No modo de cor do documento (a prova, no CMYK)
      const png = atual.modo ? await codificarCanvas((await pixelsDoBlob(exportada)).canvas, { ...OPCOES_PADRAO_DE_EXPORTACAO, modo: atual.modo }, atual.tamanho?.resolucao ?? 72) : exportada;
      await imprimirImagem(png, edicao.nome, opcoes, largura, altura, atual.tamanho?.resolucao ?? 72);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível imprimir.");
    }
  };
  /** Arquivo › Gerar › Ativos de imagem: os pedidos dos nomes das camadas, num ZIP. */
  const gerarAtivosDaImagem = async () => {
    if (!projeto) return;
    try {
      await pinturas.esperar();
      const { nome, blob } = await gerarAtivos(projetoRef.current ?? projeto, midias, { fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }, mostrarAviso);
      baixarBlob(blob, nome);
      mostrarAviso(`Ativos baixados (${formatarBytes(blob.size)}).`);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível gerar os ativos.");
    }
  };
  /** Arquivo › Exportar › Exportação rápida: o formato das preferências, no tamanho do documento, direto para o download. */
  const exportacaoRapida = async () => {
    if (!projeto) return;
    const { formato, qualidade } = lerPreferencias();
    try {
      mostrarAviso(`Exportando em ${formatoDe(formato).nome}…`);
      await pinturas.esperar();
      const atual = projetoRef.current ?? projeto;
      const blob = await gerarArquivo(atual, midias, { ...OPCOES_PADRAO_DE_EXPORTACAO, formato, qualidade, informacoes: atual.informacoes ?? null }, { fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros });
      baixarBlob(blob, nomeDoArquivo(edicao.nome, formato));
      mostrarAviso(`Imagem baixada (${formatarBytes(blob.size)}).`);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível exportar.");
    }
  };
  /** Arquivo › Exportar › PSD: as camadas, as pastas, as máscaras, os ajustes e os efeitos com par. */
  const exportarPsd = async () => {
    if (!projeto) return;
    try {
      const avisos: string[] = [];
      const blob = await salvarPsd(projeto, midias, { fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }, mostrarAviso, avisos);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(edicao.nome.trim() || "Imagem").replace(/[\\/:*?"<>|]+/g, "-")}.psd`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      mostrarAviso(["PSD baixado.", ...avisos].join(" "));
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível gerar o PSD.");
    }
  };
  /** Mais variações do preenchimento da camada: o mesmo recorte e o mesmo texto, guardados no servidor. */
  const maisVariacoes = async (clipeId: string) => {
    const atual = projetoRef.current;
    const clipe = atual ? acharClipe(atual, clipeId)?.clipe : null;
    if (!clipe?.geracao?.variacoes.length) return;
    try {
      const novas = await chamarApi<Midia[]>(`/midias/${clipe.geracao.variacoes[0]}/variacoes`, { metodo: "POST", corpo: { variacoes: 3 } });
      void biblioteca.recarregar();
      executar({ comando: "imagem.geracao", parametros: { clipeId, geracao: { ...clipe.geracao, variacoes: [...clipe.geracao.variacoes, ...novas.map((midia) => midia.id)] } } });
      mostrarAviso("Gerando mais 3 variações: elas aparecem na seção Variações quando ficarem prontas.");
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível pedir mais variações.");
    }
  };

  // O modelo escolhido na biblioteca (?modelo=): entra uma vez, na imagem ainda vazia, e sai do endereço
  const aplicarDoEndereco = useEffectEvent(() => {
    if (modeloDoEndereco.current || !projeto || !modeloInicial) return;
    modeloDoEndereco.current = true;
    router.replace(`/app/imagem/${projetoId}`);
    const modelo = modeloDeImagem(modeloInicial);
    // Depois do efeito: aplicar muda o estado (o modelo sendo aplicado)
    if (modelo && camadasDaImagem(projeto).length === 0) void Promise.resolve().then(() => aplicarModelo(modelo));
  });
  useEffect(() => {
    if (projeto) aplicarDoEndereco();
  }, [projeto]);

  const selecaoValida = projeto ? selecao.filter((id) => acharClipe(projeto, id)) : [];
  useEffect(() => {
    selecaoAtual.current = selecaoValida;
  });
  const escolhidoNaTela = projetoNaTela && selecaoValida.length === 1 ? acharClipe(projetoNaTela, selecaoValida[0]) : null;
  // Uma pasta não tem imagem: as propriedades, os filtros e as fotos valem só para as outras camadas
  const selecionado = escolhidoNaTela?.clipe.pasta ? null : escolhidoNaTela;
  const midiaDoClipe = selecionado?.clipe.midia_id ? (midias.get(selecionado.clipe.midia_id) ?? null) : null;
  const foto = midiaDoClipe?.imagem && !midiaDoClipe.elemento && !midiaDoClipe.camada_pixels && !midiaDoClipe.animacao ? midiaDoClipe : null;
  const objeto = useObjeto(selecionado?.clipe ?? null, midiaDoClipe);
  // A seleção só vale no tamanho em que foi feita (recortar ou mudar o tamanho da imagem a desfaz)
  const tamanhoDoDocumento = projeto ? tamanhoDaImagem(projeto) : null;
  const selecaoNoDocumento =
    selecaoDoDocumento && tamanhoDoDocumento && selecaoDoDocumento.largura === tamanhoDoDocumento.largura && selecaoDoDocumento.altura === tamanhoDoDocumento.altura ? selecaoDoDocumento : null;
  // A largura e a altura da seleção, para o painel Informações (a conta passa pela máscara inteira: só com ele aberto)
  const informacoesVisiveis = area.aberto("informacoes");
  const limitesDaSelecao = useMemo(() => (selecaoNoDocumento && informacoesVisiveis ? limites(selecaoNoDocumento) : null), [selecaoNoDocumento, informacoesVisiveis]);
  const temSelecao = Boolean(objeto.selecao) || objeto.temPincel || Boolean(selecaoNoDocumento && foto);
  /** A seleção do documento muda; a que é desmarcada fica para o Selecionar novamente. */
  const selecionarNoDocumento = (nova: Selecao | null) => {
    const valida = nova && temAlgo(nova) ? nova : null;
    if (!valida && selecaoNoDocumento) setSelecaoAnterior(selecaoNoDocumento);
    setSelecaoDoDocumento(valida);
    if (valida) setBordasDaSelecao(true);
  };
  const modificarSelecao = (como: ModificacaoDaSelecao, valor: number) => {
    const atual = selecaoNoDocumento;
    if (!atual) return;
    const nova =
      como === "borda" ? borda(atual, valor) : como === "suavizar" ? suavizar(atual, valor) : como === "expandir" ? expandir(atual, valor) : como === "contrair" ? contrair(atual, valor) : difusao(atual, valor / 2);
    if (!temAlgo(nova)) mostrarAviso("Nenhum pixel ficou mais da metade selecionado: as bordas da seleção não vão aparecer.");
    setSelecaoDoDocumento(nova);
  };
  /**
   * A seleção do documento levada à foto escolhida, como o pincel da ferramenta Objeto: um PNG opaco, branco no que
   * entra, no tamanho da foto (até 2048 no lado maior). Null sem seleção ou sem a camada na prévia.
   */
  const selecaoNaFoto = (selecaoDada: Selecao | null = selecaoNoDocumento): string | null => {
    if (!selecaoDada || !selecionado || !foto?.video || !projeto) return null;
    const medida = caixasRef.current.get(selecionado.clipe.id);
    if (!medida?.bruta || !medida.quadro) return null;
    const fator = Math.min(1, 2048 / Math.max(foto.video.largura, foto.video.altura));
    const naFoto = { largura: Math.max(1, Math.round(foto.video.largura * fator)), altura: Math.max(1, Math.round(foto.video.altura * fator)) };
    const matriz = matrizDaMidiaNoDocumento(medida.bruta, selecionado.clipe.recorte, selecionado.clipe.virar, naFoto, medida.quadro, tamanhoDaImagem(projeto));
    const branca = selecaoNaMidia(selecaoDada, matriz, naFoto);
    const canvas = document.createElement("canvas");
    canvas.width = naFoto.largura;
    canvas.height = naFoto.altura;
    const ctx2d = canvas.getContext("2d")!;
    ctx2d.fillStyle = "#000";
    ctx2d.fillRect(0, 0, naFoto.largura, naFoto.altura);
    ctx2d.drawImage(branca, 0, 0);
    return canvas.toDataURL("image/png");
  };
  /**
   * Os pixels que a varinha, o Aumentar e o laço magnético leem: a imagem inteira, ou só a camada escolhida (sem
   * estilos, máscara nem opacidade), no tamanho do documento. Fica guardada até o projeto mudar.
   */
  const imagemParaSelecao = (todas: boolean): Promise<ImagemRgba> => {
    const atual = projetoRef.current ?? projeto!;
    const so = !todas && selecionado ? selecionado.faixa.id : null;
    const chave = so ?? "todas";
    const guardada = imagemLida.current;
    if (guardada && guardada.projeto === atual && guardada.chave === chave) return guardada.imagem;
    const desenhar = so ? projetoSoCom(atual, [so], { neutras: new Set([so]), semEstilo: true, semMascara: true }) : atual;
    const imagem = exportarImagem(desenhar, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }).then(imagemDoBlob);
    imagemLida.current = { chave, projeto: atual, imagem };
    imagem.catch(() => {
      if (imagemLida.current?.imagem === imagem) imagemLida.current = null;
    });
    return imagem;
  };
  /** A varinha: a cor do ponto clicado (pixels do documento) e as parecidas, no modo. */
  const usarVarinha = (ponto: { x: number; y: number }, modo: ModoDaSelecao) => {
    const antes = selecaoNoDocumento;
    imagemParaSelecao(opcoesDaSelecao.todasAsCamadas || !selecionado)
      .then((imagem) => {
        const { tolerancia, contigua, suavizar: suave, amostra } = opcoesDaSelecao;
        const nova = varinha(imagem, ponto.x, ponto.y, { tolerancia, contigua, suavizar: suave, amostra });
        selecionarNoDocumento(combinar(antes, nova, modo));
      })
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível ler a imagem."));
  };
  /** Aumentar (contígua) e Semelhante (em toda a imagem), com a tolerância da varinha. */
  const aumentarSelecao = (contigua: boolean) => {
    const antes = selecaoNoDocumento;
    if (!antes) return;
    imagemParaSelecao(opcoesDaSelecao.todasAsCamadas || !selecionado)
      .then((imagem) => setSelecaoDoDocumento(aumentar(imagem, antes, opcoesDaSelecao.tolerancia, contigua)))
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível ler a imagem."));
  };
  // O laço magnético lê as bordas da imagem inteira ao ser escolhido, e de novo quando o projeto muda
  const lerBordas = useEffectEvent((vivo: { atual: boolean }) => {
    imagemParaSelecao(true)
      .then((imagem) => {
        if (vivo.atual) setBordasDaImagem(mapaDeBordas(imagem));
      })
      .catch(() => {
        if (vivo.atual) mostrarAviso("Não foi possível ler as bordas da imagem.");
      });
  });
  useEffect(() => {
    if (ferramenta !== "lacoMagnetico" || !projeto) return;
    const vivo = { atual: true };
    lerBordas(vivo);
    return () => {
      vivo.atual = false;
    };
  }, [ferramenta, projeto]);
  // A seleção rápida lê a camada escolhida (ou a imagem inteira) ao ser escolhida e quando o projeto muda
  const lerParaARapida = useEffectEvent((vivo: { atual: boolean }) => {
    imagemParaSelecao(opcoesDaSelecao.todasAsCamadas || !selecionado)
      .then((imagem) => {
        if (vivo.atual) setImagemDaRapida(imagem);
      })
      .catch(() => {
        if (vivo.atual) mostrarAviso("Não foi possível ler a imagem.");
      });
  });
  const camadaDaRapida = opcoesDaSelecao.todasAsCamadas ? null : (selecionado?.clipe.id ?? null);
  useEffect(() => {
    if (ferramenta !== "selecaoRapida" || !projeto) return;
    const vivo = { atual: true };
    lerParaARapida(vivo);
    return () => {
      vivo.atual = false;
    };
  }, [ferramenta, projeto, camadaDaRapida]);
  // A seleção da IA (na foto) vira a seleção do documento, com as formigas, para as outras ferramentas usarem
  const arquivoDoObjeto = objeto.selecao?.arquivo ?? null;
  const canais = projeto?.canais ?? [];
  const canalDaVez = canalAtivo ? (canais.find((canal) => canal.id === canalAtivo) ?? null) : null;
  /** O motor de um canal alfa: pintar nele sobe uma versão nova e muda o número no projeto (um passo do desfazer). */
  const alvoDoCanal = (canal: Canal): AlvoDoMotor => ({
    chave: `#canal:${canal.id}`,
    midiaId: canal.midia_id,
    versao: canal.versao,
    aoSubir: (versao) => ({ comando: "canal.mudar", parametros: { id: canal.id, mudanca: { versao } } }),
  });
  // A versão do canal à vista, para o véu cinza (enquanto ninguém pinta nele)
  const chaveDoCanal = canalDaVez ? arquivoDaMidia(canalDaVez.midia_id, arquivoDaVersao(canalDaVez.versao)) : null;
  useEffect(() => {
    if (!chaveDoCanal) return;
    let vivo = true;
    carregarBitmap(chaveDoCanal)
      .then((imagem) => {
        if (vivo) setImagemDoCanal({ chave: chaveDoCanal, imagem });
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [chaveDoCanal]);
  /** O canal alfa como seleção (o branco é selecionado), no tamanho do documento. */
  const selecaoDoCanal = async (canal: Canal): Promise<Selecao> => {
    const documento = tamanhoDaImagem(projetoRef.current ?? projeto!);
    const imagem = pinturas.fonteDe(alvoDoCanal(canal)) ?? (await carregarBitmap(arquivoDaMidia(canal.midia_id, arquivoDaVersao(canal.versao))));
    return imagemNoDocumento(imagem, [documento.largura / imagem.width, 0, 0, documento.altura / imagem.height, 0, 0], documento, "cinza");
  };
  /** Salvar a seleção: num canal novo, ou num que existe (substituir, somar, subtrair ou intersectar). */
  const salvarSelecaoNoCanal = async (destino: string | null, nome: string, operacao: ModoDaSelecao) => {
    const selecao = selecaoNoDocumento;
    if (!selecao || !projeto) return;
    try {
      await pinturas.esperar();
      if (!destino) {
        const { largura, altura } = tamanhoDaImagem(projeto);
        const midia = await criarCamadaDePixels(largura, altura, nome);
        const versao = await enviarVersao(midia.id, await pngDoDocumento((ctx2d) => pintarSelecao(ctx2d, selecao))());
        executar({ comando: "canal.adicionar", parametros: { canal: { nome, midia_id: midia.id, versao } } });
        return;
      }
      const canal = canais.find((item) => item.id === destino);
      if (!canal) return;
      const atual = await selecaoDoCanal(canal);
      const nova = operacao === "nova" ? selecao : (combinar(atual, selecao, operacao) ?? atual);
      const versao = await enviarVersao(canal.midia_id, await pngDoDocumento((ctx2d) => pintarSelecao(ctx2d, nova))());
      executar({ comando: "canal.mudar", parametros: { id: canal.id, mudanca: { versao } } });
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível salvar a seleção.");
    }
  };
  /** Carregar a seleção de um canal (ou da transparência da camada escolhida), invertida ou não, no modo. */
  const carregarSelecaoDoCanal = async (fonte: string, inverter: boolean, modo: ModoDaSelecao) => {
    try {
      if (fonte === "transparencia") {
        if (selecionado) await selecionarDaCamada(selecionado.clipe.id, modo, "camada", inverter);
        return;
      }
      const canal = canais.find((item) => item.id === fonte);
      if (!canal) return;
      const lida = await selecaoDoCanal(canal);
      const resultado = combinar(selecaoNoDocumento, inverter ? inverterSelecao(lida) : lida, modo);
      if (resultado && !temAlgo(resultado)) mostrarAviso("Nenhum pixel ficou mais da metade selecionado: as bordas da seleção não vão aparecer.");
      setSelecaoDoDocumento(resultado);
      setBordasDaSelecao(true);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível carregar a seleção.");
    }
  };
  /** Um canal alfa novo, preto (nada selecionado), já à vista para pintar. */
  const novoCanal = async () => {
    if (!projeto) return;
    const { largura, altura } = tamanhoDaImagem(projeto);
    const nome = `Alfa ${canais.length + 1}`;
    try {
      const midia = await criarCamadaDePixels(largura, altura, nome);
      const versao = await enviarVersao(midia.id, await pngDoDocumento((ctx2d) => {
        ctx2d.fillStyle = "#000";
        ctx2d.fillRect(0, 0, largura, altura);
      })());
      const resultado = executar({ comando: "canal.adicionar", parametros: { canal: { nome, midia_id: midia.id, versao } } });
      const criado = resultado?.projeto.canais?.at(-1);
      if (criado) {
        setCorAVista(null);
        setCanalAtivo(criado.id);
        if (!FERRAMENTAS_DE_PINTURA.has(ferramenta)) escolherFerramenta("pincel");
      }
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível criar o canal.");
    }
  };
  /** Selecionar e mascarar: lê a camada escolhida sozinha (ou a imagem inteira) e o resto, para a vista "Nas camadas". */
  const abrirSelecionarEMascarar = () => {
    const atual = projetoRef.current;
    if (!atual) return;
    const faixa = selecionado?.faixa ?? null;
    const ler = (projetoParaLer: Projeto) => exportarImagem(projetoParaLer, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }).then(imagemDoBlob);
    const daCamada = faixa ? ler(projetoSoCom(atual, [faixa.id], { neutras: new Set([faixa.id]), semEstilo: true, semMascara: true })) : imagemParaSelecao(true);
    const resto = faixa ? ler({ ...atual, faixas: atual.faixas.map((item) => (item.id === faixa.id ? { ...item, oculta: true } : item)) }) : Promise.resolve(null);
    Promise.all([daCamada, resto])
      .then(([imagem, fundo]) => setRefinando({ imagem, fundo, clipeId: selecionado?.clipe.id ?? null, faixaId: faixa?.id ?? null }))
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível ler a imagem."));
  };
  /** A saída do Selecionar e mascarar: a seleção, a máscara da camada, uma camada nova (recortada) ou com máscara. */
  const saidaDoRefinamento = async (resultado: ResultadoDoRefinamento) => {
    const contexto = refinando;
    setRefinando(null);
    if (!contexto || !projeto) return;
    const { selecao, saida, descontaminada } = resultado;
    if (saida === "selecao") {
      setSelecaoDoDocumento(temAlgo(selecao) ? selecao : null);
      setBordasDaSelecao(true);
      return;
    }
    if (saida === "mascara") {
      await criarMascara("revelarSelecao", selecao);
      return;
    }
    // Uma camada nova acima da escolhida: os pixels dela (descontaminados, se pedido), recortados pela seleção ou inteiros
    const imagem = descontaminada ?? contexto.imagem;
    const { largura, altura } = tamanhoDaImagem(projeto);
    try {
      setGerandoPixels(true);
      const nome = `${contexto.faixaId ? nomeDaFaixa(projeto.faixas.find((f) => f.id === contexto.faixaId)!) : "Camada"} (refinada)`;
      const png = await pngDoDocumento((ctx2d) => {
        const dados = ctx2d.createImageData(largura, altura);
        dados.data.set(imagem.dados);
        if (saida === "camada") for (let i = 0; i < selecao.dados.length; i++) dados.data[i * 4 + 3] = Math.round((dados.data[i * 4 + 3] * selecao.dados[i]) / 255);
        ctx2d.putImageData(dados, 0, 0);
      })();
      const midia = await criarCamadaDePixels(largura, altura, nome);
      setCriadas((atual) => new Map([...atual, [midia.id, midia]]));
      const versao = await enviarVersao(midia.id, png);
      const criado = executar({ comando: "imagem.adicionarPixels", parametros: { midiaId: midia.id, nome, acima: contexto.faixaId, versao } });
      const clipeId = criado?.selecao?.[0];
      if (saida === "camadaComMascara" && clipeId) {
        const { midia: mascara, versao: versaoDaMascara } = await subirMascara(pngDoDocumento((ctx2d) => pintarSelecao(ctx2d, selecao)));
        executar({ comando: "mascara.definir", parametros: { clipeId, mascara: { midia_id: mascara.id, versao: versaoDaMascara, ligada: true, vinculada: true, densidade: 1, difusao: 0, matriz: IDENTIDADE } } });
      }
      // A camada de origem fica escondida, como lá (a nova toma o lugar dela)
      if (contexto.faixaId) executar({ comando: "imagem.camada", parametros: { faixaIds: [contexto.faixaId], mudanca: { oculta: true } } });
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível criar a camada.");
    } finally {
      setGerandoPixels(false);
    }
  };
  /**
   * Os pixels da camada de pixels escolhida (sem uma, com `criar`, uma nova acima) passam pela função, com a cobertura
   * da seleção levada à camada (sem seleção, a camada inteira); o resultado sobe como versão nova, um passo do desfazer.
   */
  /** A matriz do pixel da camada para o do documento (a camada nova, ainda não medida, cobre o quadro). */
  const matrizDaCamada = (clipe: Clipe, tamanho: { largura: number; altura: number }, documento: { largura: number; altura: number }) => {
    const medida = caixasRef.current.get(clipe.id);
    const caixa = medida?.bruta ?? { cx: documento.largura / 2, cy: documento.altura / 2, largura: documento.largura, altura: documento.altura, rotacao: 0 };
    return matrizDaMidiaNoDocumento(caixa, clipe.recorte, clipe.virar, tamanho, medida?.quadro ?? documento, documento);
  };
  /** A cobertura da seleção (0 a 255) em cada pixel da camada. */
  const coberturaNaCamada = (clipe: Clipe, tamanho: { largura: number; altura: number }, selecao: Selecao, documento: { largura: number; altura: number }) => {
    const naCamada = selecaoNaMidia(selecao, matrizDaCamada(clipe, tamanho, documento), tamanho).getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, tamanho.largura, tamanho.altura).data;
    const cobertura = new Uint8ClampedArray(tamanho.largura * tamanho.altura);
    for (let i = 0; i < cobertura.length; i++) cobertura[i] = naCamada[i * 4 + 3];
    return cobertura;
  };
  /** A ferramenta Mover pega os pixels selecionados da camada de pixels (com Alt, uma cópia) para arrastar. */
  const comecarAMoverPixels = (duplicar: boolean) => {
    const atual = projetoRef.current;
    const achado = selecionado?.clipe.pixels && atual ? acharClipe(atual, selecionado.clipe.id) : null;
    const selecao = selecaoNoDocumento;
    if (!atual || !achado?.clipe.midia_id || !selecao) return;
    if (camadaTravada(atual, achado.faixa) || achado.faixa.travas?.pixels || achado.faixa.travas?.posicao) return mostrarAviso("Esta camada está travada.");
    const alvo = alvoDosPixels(achado.clipe)!;
    const documento = tamanhoDaImagem(atual);
    const tamanho = midias.get(achado.clipe.midia_id)?.camada_pixels ?? documento;
    flutuanteAbrindo.current = (async () => {
      await pinturas.esperar();
      const pintura = await pinturas.preparar(alvo, tamanho);
      const ctx2d = pintura.camada.getContext("2d", { willReadFrequently: true })!;
      const tudo = ctx2d.getImageData(0, 0, tamanho.largura, tamanho.altura);
      const original = Uint8ClampedArray.from(tudo.data);
      const cobertura = coberturaNaCamada(achado.clipe, tamanho, selecao, documento);
      const peca = document.createElement("canvas");
      peca.width = tamanho.largura;
      peca.height = tamanho.altura;
      const pctx = peca.getContext("2d")!;
      const pedaco = pctx.createImageData(tamanho.largura, tamanho.altura);
      pedaco.data.set(tudo.data);
      for (let i = 0; i < cobertura.length; i++) {
        pedaco.data[i * 4 + 3] = Math.round((tudo.data[i * 4 + 3] * cobertura[i]) / 255);
        // Sem Alt, o que é levado sai do lugar
        if (!duplicar) tudo.data[i * 4 + 3] = Math.round((tudo.data[i * 4 + 3] * (255 - cobertura[i])) / 255);
      }
      pctx.putImageData(pedaco, 0, 0);
      const m = matrizDaCamada(achado.clipe, tamanho, documento);
      const det = m[0] * m[3] - m[1] * m[2] || 1;
      flutuante.current = { chave: alvo.chave, pintura, original, base: tudo, peca, inversa: [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, 0, 0], selecao, cobertura };
    })().catch((e: unknown) => {
      flutuante.current = null;
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível mover os pixels.");
    });
  };
  /** O pedaço no deslocamento (pixels do documento), sobre o que ficou. */
  const desenharFlutuante = (dx: number, dy: number, f = flutuante.current) => {
    if (!f) return;
    const ctx2d = f.pintura.camada.getContext("2d")!;
    ctx2d.putImageData(f.base, 0, 0);
    ctx2d.drawImage(f.peca, f.inversa[0] * dx + f.inversa[2] * dy, f.inversa[1] * dx + f.inversa[3] * dy);
    pinturas.avisarQuadro();
  };
  /** Solta: a camada sobe como versão nova e a seleção anda junto. */
  const soltarFlutuante = (dx: number, dy: number, sensivel: "" | "mover" | "estender" = "") => {
    void flutuanteAbrindo.current?.then(() => {
      const f = flutuante.current;
      flutuante.current = null;
      if (!f) return;
      // Mover sensível ao conteúdo: o lugar de onde o pedaço saiu é refeito pelo que está em volta
      const largura = f.pintura.largura;
      const altura = f.pintura.altura;
      if (sensivel === "mover" && (dx || dy)) {
        preencherBuraco(f.base.data, largura, altura, Uint8Array.from(f.cobertura, (v) => (v > 32 ? 1 : 0)), { jeito: "remendo", alcance: 4.5 });
        for (let i = 0; i < f.cobertura.length; i++) if (f.cobertura[i] > 32) f.base.data[i * 4 + 3] = 255;
      }
      // A conta da soltura usa o pedaço daqui (o ref já foi limpo para o próximo arrasto)
      desenharFlutuante(dx, dy, f);
      // No sensível ao conteúdo, o pedaço emenda com a luz e a cor do lugar novo
      if (sensivel && (dx || dy)) {
        const ox = Math.round(f.inversa[0] * dx + f.inversa[2] * dy);
        const oy = Math.round(f.inversa[1] * dx + f.inversa[3] * dy);
        const regiao = new Uint8Array(largura * altura);
        for (let y = Math.max(0, oy); y < Math.min(altura, altura + oy); y++) {
          for (let x = Math.max(0, ox); x < Math.min(largura, largura + ox); x++) regiao[y * largura + x] = f.cobertura[(y - oy) * largura + x - ox];
        }
        const ctx2d = f.pintura.camada.getContext("2d", { willReadFrequently: true })!;
        const colado = colarSemEmenda(f.base.data, f.original, largura, altura, regiao, { dx: -ox, dy: -oy });
        ctx2d.putImageData(new ImageData(colado, largura, altura), 0, 0);
        pinturas.avisarQuadro();
      }
      if (!dx && !dy) return void pinturas.soltar(f.chave);
      pinturas.soltar(f.chave);
      const andada = vazia(f.selecao.largura, f.selecao.altura);
      for (let y = 0; y < andada.altura; y++) {
        const ys = y - dy;
        if (ys < 0 || ys >= andada.altura) continue;
        for (let x = 0; x < andada.largura; x++) {
          const xs = x - dx;
          if (xs >= 0 && xs < andada.largura) andada.dados[y * andada.largura + x] = f.selecao.dados[ys * andada.largura + xs];
        }
      }
      setSelecaoDoDocumento(temAlgo(andada) ? andada : null);
    });
  };
  /** A região da cor parecida com a do ponto (a varinha), na camada de pixels ou na imagem inteira, dentro da seleção. */
  const regiaoDaCor = async (ponto: { x: number; y: number }, opcoes: { tolerancia: number; contigua: boolean; suavizar: boolean; todasAsCamadas: boolean }) => {
    const imagem = await imagemParaSelecao(opcoes.todasAsCamadas || !selecionado?.clipe.pixels);
    const regiao = varinha(imagem, ponto.x, ponto.y, { tolerancia: opcoes.tolerancia, contigua: opcoes.contigua, suavizar: opcoes.suavizar, amostra: 1 });
    return selecaoNoDocumento ? (combinar(selecaoNoDocumento, regiao, "intersectar") ?? regiao) : regiao;
  };
  /** O Balde de tinta: a área de cor parecida cheia com o primeiro plano ou o padrão. */
  const usarBalde = (ponto: { x: number; y: number }) => {
    const o = opcoesDoBalde;
    Promise.all([regiaoDaCor(ponto, o), o.preencher === "padrao" ? esperarLadrilho(o.padrao) : null])
      .then(([regiao]) =>
        editarPixels(
          (dados, cobertura, camada) => {
            const tinta = o.preencher === "padrao" ? ladrilhar(ladrilhoDoPadrao(o.padrao, cores.primeiroPlano, cores.fundo), camada.largura, camada.altura) : rgbDaCor(cores.primeiroPlano);
            preencherPixels(dados, camada.largura, cobertura, tinta, { modo: o.modo, opacidade: o.opacidade, preservar: Boolean(camada.faixa.travas?.transparencia) });
          },
          { criar: true, selecao: regiao },
        ),
      )
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível encher a área."));
  };
  /** A Borracha mágica: os pixels de cor parecida na camada de pixels ficam transparentes (na opacidade). */
  const usarBorrachaMagica = (ponto: { x: number; y: number }) => {
    if (!selecionado?.clipe.pixels) return mostrarAviso("Escolha uma camada de pixels para apagar.");
    const o = opcoesDaBorrachaMagica;
    regiaoDaCor(ponto, o)
      .then((regiao) =>
        editarPixels(
          (dados, cobertura, camada) => {
            const parcial = cobertura ? Uint8ClampedArray.from(cobertura, (v) => v * o.opacidade) : null;
            limparPixels(dados, parcial, camada.faixa.travas?.transparencia || camada.faixa.fundo ? rgbDaCor(cores.fundo) : null);
          },
          { selecao: regiao },
        ),
      )
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível apagar."));
  };
  /** O Degradê: de `de` a `ate` (pixels do documento), pintado na camada de pixels (sem uma, nasce), dentro da seleção. */
  const aplicarDegrade = (de: { x: number; y: number }, ate: { x: number; y: number }) => {
    const o = opcoesDoDegrade;
    const degrade = o.transparencia ? o.degrade : { ...o.degrade, opacidades: o.degrade.opacidades.map((p) => ({ ...p, opacidade: 1 })) };
    const tabela = tabelaDoDegrade(degrade, cores.primeiroPlano, cores.fundo);
    void editarPixels(
      (dados, cobertura, camada) => {
        // Os pontos do documento vão para a camada pela conta inversa da caixa dela
        const m = inverter(matrizDaCamada(camada.clipe, camada, tamanhoDaImagem(projetoRef.current ?? projeto!)));
        const naCamada = (p: { x: number; y: number }) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
        const pixels = pixelsDoDegrade(camada.largura, camada.altura, naCamada(de), naCamada(ate), o.forma, tabela, { inverter: o.inverter, pontilhar: o.pontilhar });
        preencherPixels(dados, camada.largura, cobertura, pixels, { modo: o.modo, opacidade: o.opacidade, preservar: Boolean(camada.faixa.travas?.transparencia) });
      },
      { criar: true },
    );
  };
  /**
   * Com uma camada de preenchimento de degradê escolhida, a ferramenta Degradê leva o começo e o fim dela (ao vivo),
   * em vez de pintar: a linha atual aparece na tela.
   */
  const degradeDoPreenchimento = (() => {
    const clipe = selecionado?.clipe;
    const preenchimento = clipe?.camada_de_preenchimento;
    if (!clipe || !preenchimento || preenchimento.tinta.tipo !== "degrade" || !projeto) return null;
    const documento = tamanhoDaImagem(projeto);
    const { de, ate } = alcasDoDegrade(preenchimento, documento);
    const noDocumento = (p: { x: number; y: number }) => ({ x: p.x * documento.largura, y: p.y * documento.altura });
    const fracao = (p: { x: number; y: number }) => ({ x: p.x / documento.largura, y: p.y / documento.altura });
    return {
      alcas: { de: noDocumento(de), ate: noDocumento(ate) },
      comando: (novoDe: { x: number; y: number }, novoAte: { x: number; y: number }): Comando => ({
        comando: "imagem.preenchimento",
        parametros: { clipeId: clipe.id, preenchimento: { ...preenchimento, de: fracao(novoDe), ate: fracao(novoAte) } },
      }),
    };
  })();
  /** Salva o degradê no espaço (painel Degradês). */
  const salvarDegrade = (degrade: Degrade) => {
    criarRecurso({ tipo: "degrade", nome: degrade.nome || "Degradê", dados: degrade })
      .then(() => {
        degradesDoEspaco.recarregar();
        mostrarAviso(`"${degrade.nome}" está no painel Degradês.`);
      })
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível salvar o degradê."));
  };
  /** Editar › Atenuar: o último passo de pixels misturado com o estado de antes dele, na opacidade e no modo. */
  const atenuar = async (opacidade: number, modo: ModoDaPintura) => {
    const agora = projetoRef.current;
    const antes = edicao.projetoDoPasso(edicao.passos.feitos.length - 1);
    if (!agora || !antes) return;
    // A camada de pixels cuja versão o último passo mudou
    const mudada = agora.faixas.flatMap((faixa) => faixa.clipes).find((clipe) => clipe.pixels && acharClipe(antes, clipe.id)?.clipe.pixels?.versao !== clipe.pixels.versao);
    if (!mudada?.midia_id) return mostrarAviso("Atenuar vale para a última pintura, preenchimento ou mudança de pixels numa camada.");
    const versaoAntes = acharClipe(antes, mudada.id)?.clipe.pixels?.versao ?? 0;
    const midiaId = mudada.midia_id;
    await editarPixelsDoClipe(mudada.id, async (dados, _cobertura, camada) => {
      const canvas = document.createElement("canvas");
      canvas.width = camada.largura;
      canvas.height = camada.altura;
      const ctx2d = canvas.getContext("2d", { willReadFrequently: true })!;
      if (versaoAntes > 0) ctx2d.drawImage(await carregarBitmap(arquivoDaMidia(midiaId, arquivoDaVersao(versaoAntes))), 0, 0, camada.largura, camada.altura);
      const anterior = ctx2d.getImageData(0, 0, camada.largura, camada.altura).data;
      const depois = Uint8ClampedArray.from(dados);
      if (modo === "normal") {
        // O meio do caminho entre os dois estados (a transparência também), na opacidade
        const forca = new Uint8ClampedArray(dados.length).fill(255);
        juntarTraco(anterior, forca, dados, { substituirPor: depois, modo: "normal", opacidade, travarTransparencia: false, apagar: false, largura: camada.largura, x0: 0, y0: 0 });
      } else juntarTraco(anterior, depois, dados, { modo, opacidade, travarTransparencia: false, apagar: false, largura: camada.largura, x0: 0, y0: 0 });
    }, null);
  };
  type EdicaoDePixels = (dados: Uint8ClampedArray, cobertura: Uint8ClampedArray | null, camada: { largura: number; altura: number; clipe: Clipe; faixa: Faixa }) => void | Promise<void>;
  const editarPixels = (editar: EdicaoDePixels, opcoes: { criar?: boolean; selecao?: Selecao | null } = {}) =>
    editarPixelsDoClipe(selecionado?.clipe.pixels ? selecionado.clipe.id : null, editar, opcoes.selecao === undefined ? selecaoNoDocumento : opcoes.selecao, opcoes.criar);
  const editarPixelsDoClipe = async (clipeDado: string | null, editar: EdicaoDePixels, selecao: Selecao | null, criar = false) => {
    let clipeId = clipeDado;
    if (!clipeId) {
      if (!criar) {
        mostrarAviso("Escolha uma camada de pixels (Camada › Rasterizar transforma as outras).");
        return;
      }
      clipeId = await novaCamada();
    }
    const atual = projetoRef.current;
    const achado = clipeId && atual ? acharClipe(atual, clipeId) : null;
    if (!atual || !achado?.clipe.midia_id || !achado.clipe.pixels) return;
    if (camadaTravada(atual, achado.faixa) || achado.faixa.travas?.pixels) {
      mostrarAviso("Os pixels desta camada estão travados.");
      return;
    }
    const alvo = alvoDosPixels(achado.clipe)!;
    const documento = tamanhoDaImagem(atual);
    const tamanho = midias.get(achado.clipe.midia_id)?.camada_pixels ?? documento;
    try {
      await pinturas.esperar();
      const pintura = await pinturas.preparar(alvo, tamanho);
      const ctx2d = pintura.camada.getContext("2d", { willReadFrequently: true })!;
      const dados = ctx2d.getImageData(0, 0, tamanho.largura, tamanho.altura);
      let cobertura: Uint8ClampedArray | null = null;
      if (selecao) {
        // A camada nova ainda não foi medida pela prévia: ela cobre o quadro, e o quadro é o documento
        cobertura = coberturaNaCamada(achado.clipe, tamanho, selecao, documento);
      }
      await editar(dados.data, cobertura, { ...tamanho, clipe: achado.clipe, faixa: achado.faixa });
      ctx2d.putImageData(dados, 0, 0);
      pinturas.soltar(alvo.chave);
      pinturas.avisarQuadro();
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível mudar os pixels.");
    }
  };
  /** Editar › Preencher: a cor, o padrão ou o estado do histórico, com o modo, a opacidade e o preservar transparência. */
  const preencher = (p: Preenchimento, selecaoDoCaminho?: Selecao) => {
    if (p.conteudo === "sensivel") return void usarSelecao("apagar");
    const cor = p.conteudo === "primeiroPlano" ? cores.primeiroPlano : p.conteudo === "fundo" ? cores.fundo : p.conteudo === "preto" ? "#000000" : p.conteudo === "cinza" ? "#808080" : p.conteudo === "branco" ? "#ffffff" : p.cor;
    void editarPixels(
      async (dados, cobertura, camada) => {
        let tinta: [number, number, number] | Uint8ClampedArray = rgbDaCor(cor);
        if (p.conteudo === "padrao") await esperarLadrilho(p.padrao);
        if (p.conteudo === "padrao") tinta = ladrilhar(ladrilhoDoPadrao(p.padrao, cores.primeiroPlano, cores.fundo), camada.largura, camada.altura);
        if (p.conteudo === "historico") {
          const fonte = await fonteDoHistoricoPara(camada.clipe, camada);
          if (!fonte) return;
          tinta = fonte.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, camada.largura, camada.altura).data;
        }
        preencherPixels(dados, camada.largura, cobertura, tinta, { modo: p.modo, opacidade: p.opacidade, preservar: p.preservar || Boolean(camada.faixa.travas?.transparencia) });
      },
      selecaoDoCaminho ? { criar: true, selecao: selecaoDoCaminho } : { criar: true },
    );
  };
  /** Editar › Limpar (Delete com seleção): fica transparente; com a transparência travada (ou no fundo), a cor de fundo. */
  const limpar = () => {
    if (!selecaoNoDocumento) return;
    void editarPixels((dados, cobertura, camada) => limparPixels(dados, cobertura, camada.faixa.travas?.transparencia || camada.faixa.fundo ? rgbDaCor(cores.fundo) : null));
  };
  /** Editar › Traçado: a faixa na borda da seleção, pintada como um preenchimento. */
  const tracar = (t: Tracado) => {
    if (!selecaoNoDocumento) return;
    const faixa = faixaDoTracado(selecaoNoDocumento, t.largura, t.onde);
    void editarPixels((dados, cobertura, camada) => preencherPixels(dados, camada.largura, cobertura, rgbDaCor(t.cor), { modo: t.modo, opacidade: t.opacidade, preservar: t.preservar }), { criar: true, selecao: faixa });
  };
  /** Os pixels da camada escolhida (ou da imagem inteira, mesclado) na seleção (sem ela, tudo), cortados em volta dela. */
  const pixelsParaCopiar = async (mesclado: boolean): Promise<{ canvas: HTMLCanvasElement; x: number; y: number } | null> => {
    if (!mesclado && !selecionado) {
      mostrarAviso("Escolha a camada para copiar (ou use Copiar mesclado).");
      return null;
    }
    const imagem = await imagemParaSelecao(mesclado);
    const selecao = selecaoNoDocumento;
    const caixa = selecao ? limites(selecao) : { x0: 0, y0: 0, x1: imagem.largura, y1: imagem.altura };
    if (!caixa) return null;
    const largura = caixa.x1 - caixa.x0;
    const altura = caixa.y1 - caixa.y0;
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx2d = canvas.getContext("2d")!;
    const dados = ctx2d.createImageData(largura, altura);
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        const i = (y + caixa.y0) * imagem.largura + x + caixa.x0;
        const j = (y * largura + x) * 4;
        dados.data[j] = imagem.dados[i * 4];
        dados.data[j + 1] = imagem.dados[i * 4 + 1];
        dados.data[j + 2] = imagem.dados[i * 4 + 2];
        dados.data[j + 3] = selecao ? Math.round((imagem.dados[i * 4 + 3] * selecao.dados[i]) / 255) : imagem.dados[i * 4 + 3];
      }
    }
    ctx2d.putImageData(dados, 0, 0);
    return { canvas, x: caixa.x0, y: caixa.y0 };
  };
  const pngDoCanvas = (canvas: HTMLCanvasElement) => new Promise<Blob>((pronto, falhou) => canvas.toBlob((blob) => (blob ? pronto(blob) : falhou(new Error("O navegador não conseguiu gravar a imagem."))), "image/png"));
  /** Editar › Copiar (e mesclado): guarda aqui, com o lugar, e manda o PNG para a área de transferência do sistema. */
  const copiar = async (mesclado: boolean): Promise<boolean> => {
    try {
      const pixels = await pixelsParaCopiar(mesclado);
      if (!pixels) return false;
      const png = await pngDoCanvas(pixels.canvas);
      areaDeTransferencia.current = { ...pixels, tamanhoDoPng: png.size };
      // Sem a permissão (ou fora de um contexto seguro), fica só a cópia daqui
      await navigator.clipboard?.write?.([new ClipboardItem({ "image/png": png })]).catch(() => undefined);
      return true;
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível copiar.");
      return false;
    }
  };
  /** O que colar: a imagem da área de transferência do sistema (a própria cópia volta com o lugar) ou a daqui. */
  const lerAreaDeTransferencia = async (): Promise<{ canvas: HTMLCanvasElement | ImageBitmap; x: number | null; y: number | null } | null> => {
    const daqui = areaDeTransferencia.current;
    try {
      for (const item of (await navigator.clipboard?.read?.()) ?? []) {
        const tipo = item.types.find((t) => t.startsWith("image/"));
        if (!tipo) continue;
        const blob = await item.getType(tipo);
        if (daqui && blob.size === daqui.tamanhoDoPng) return daqui;
        return { canvas: await createImageBitmap(blob), x: null, y: null };
      }
    } catch {
      // Sem permissão para ler: vale a cópia daqui
    }
    return daqui;
  };
  /** Uma camada de pixels nova acima da escolhida com a imagem no lugar dado; devolve o clipe. */
  const camadaComImagem = async (imagem: CanvasImageSource & { width: number; height: number }, x: number, y: number, largura: number, altura: number, nome: string): Promise<string | null> => {
    if (!projeto) return null;
    const documento = tamanhoDaImagem(projeto);
    const midia = await criarCamadaDePixels(documento.largura, documento.altura, nome);
    setCriadas((atual) => new Map([...atual, [midia.id, midia]]));
    const versao = await enviarVersao(midia.id, await pngDoDocumento((ctx2d) => ctx2d.drawImage(imagem, x, y, largura, altura))());
    const resultado = executar({ comando: "imagem.adicionarPixels", parametros: { midiaId: midia.id, nome, acima: escolhidas[0]?.id ?? null, versao } });
    return resultado?.selecao?.[0] ?? null;
  };
  /** Uma máscara de camada da seleção (ou dela invertida) num clipe que cobre o quadro (a camada nova). */
  const mascaraNoClipeNovo = async (clipeId: string, selecao: Selecao, invertida: boolean) => {
    const { midia, versao } = await subirMascara(pngDoDocumento((ctx2d) => pintarSelecao(ctx2d, selecao, invertida)));
    executar({ comando: "mascara.definir", parametros: { clipeId, mascara: { midia_id: midia.id, versao, ligada: true, vinculada: true, densidade: 1, difusao: 0, matriz: IDENTIDADE } } });
  };
  /** Editar › Colar: no meio da seleção (ou da imagem), no mesmo lugar, ou dentro ou fora da seleção (com máscara). */
  const colar = async (como: "normal" | "noLocal" | "dentro" | "fora") => {
    if (!projeto) return;
    try {
      const dado = await lerAreaDeTransferencia();
      if (!dado) return mostrarAviso("A área de transferência está vazia: copie uma parte da imagem (Ctrl+C) ou uma imagem de outro programa.");
      const documento = tamanhoDaImagem(projeto);
      // Maior que a imagem, entra reduzida para caber
      const fator = Math.min(1, documento.largura / dado.canvas.width, documento.altura / dado.canvas.height);
      const largura = dado.canvas.width * fator;
      const altura = dado.canvas.height * fator;
      const caixa = selecaoNoDocumento ? limites(selecaoNoDocumento) : null;
      let x = (documento.largura - largura) / 2;
      let y = (documento.altura - altura) / 2;
      if (como === "noLocal" && dado.x !== null && dado.y !== null) {
        x = dado.x;
        y = dado.y;
      } else if (caixa) {
        x = (caixa.x0 + caixa.x1 - largura) / 2;
        y = (caixa.y0 + caixa.y1 - altura) / 2;
      }
      const clipeId = await camadaComImagem(dado.canvas, Math.round(x), Math.round(y), largura, altura, "Camada colada");
      if (clipeId && (como === "dentro" || como === "fora") && selecaoNoDocumento) await mascaraNoClipeNovo(clipeId, selecaoNoDocumento, como === "fora");
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível colar.");
    }
  };
  /** Editar › Recortar: copia e limpa (numa camada de pixels). */
  const recortarPixels = async () => {
    if (!(await copiar(false))) return;
    if (!selecaoNoDocumento) return;
    if (selecionado?.clipe.pixels) limpar();
    else mostrarAviso("Copiado. Para tirar os pixels desta camada, rasterize ela antes (ou use Camada via recorte).");
  };
  /** Camada via cópia (sem seleção, duplica) e via recorte (na camada de pixels limpa; nas outras, uma máscara esconde). */
  const camadaVia = async (recortar: boolean) => {
    if (!selecaoNoDocumento) {
      if (!recortar && faixaIds.length) executar({ comando: "imagem.duplicarVarias", parametros: { faixaIds } });
      return;
    }
    const origem = selecionado;
    const selecao = selecaoNoDocumento;
    const pixels = await pixelsParaCopiar(false).catch(() => null);
    if (!pixels || !origem) return;
    await camadaComImagem(pixels.canvas, pixels.x, pixels.y, pixels.canvas.width, pixels.canvas.height, recortar ? "Camada recortada" : "Camada copiada");
    if (!recortar) return;
    if (origem.clipe.pixels) {
      // A seleção continua no mesmo lugar: limpa a camada de origem, que deixou de ser a escolhida
      setSelecao([origem.clipe.id]);
      await new Promise((pronto) => setTimeout(pronto, 0));
      void editarPixelsDoClipe(origem.clipe.id, (dados, cobertura) => limparPixels(dados, cobertura, null), selecao);
    } else if (!origem.clipe.mascara_pixels) {
      const medida = caixasRef.current.get(origem.clipe.id);
      if (!medida?.bruta || !medida.quadro) return;
      const { midia, versao } = await subirMascara(pngDoDocumento((ctx2d) => pintarSelecao(ctx2d, selecao, true)));
      executar({ comando: "mascara.definir", parametros: { clipeId: origem.clipe.id, mascara: { midia_id: midia.id, versao, ligada: true, vinculada: true, densidade: 1, difusao: 0, matriz: matrizDaCaixa(medida.bruta, medida.quadro) } } });
    } else mostrarAviso("A camada já tem máscara: a cópia entrou numa camada nova, e a original ficou como estava.");
  };
  /** Arquivo › Novo a partir da área de transferência: uma imagem nova do tamanho da cópia, com ela numa camada. */
  const novoDaAreaDeTransferencia = async () => {
    try {
      const dado = await lerAreaDeTransferencia();
      if (!dado) return mostrarAviso("A área de transferência está vazia.");
      const largura = Math.max(16, dado.canvas.width);
      const altura = Math.max(16, dado.canvas.height);
      const novo = await chamarApi<Projeto>("/projetos", { metodo: "POST", corpo: { tamanho: { largura, altura } } });
      const midia = await criarCamadaDePixels(largura, altura, "Camada colada");
      const canvas = document.createElement("canvas");
      canvas.width = largura;
      canvas.height = altura;
      canvas.getContext("2d")!.drawImage(dado.canvas, 0, 0);
      const versao = await enviarVersao(midia.id, await pngDoCanvas(canvas));
      const { projeto: comCamada } = executarComando(novo, { comando: "imagem.adicionarPixels", parametros: { midiaId: midia.id, nome: "Camada colada", versao } }, ctx);
      await chamarApi(`/projetos/${novo.id}`, {
        metodo: "PUT",
        corpo: { versao: novo.versao, nome: "Imagem colada", proporcao: comCamada.proporcao, taxa: comCamada.taxa, fundo: comCamada.fundo, faixas: comCamada.faixas, marcadores: [], canais: [], tamanho: comCamada.tamanho },
      });
      router.push(`/app/imagem/${novo.id}`);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível criar a imagem.");
    }
  };
  /** Imagem › Cortar: pela seleção (o retângulo em volta dela), ou a ferramenta Corte sem seleção. */
  const cortarImagem = () => {
    const caixa = selecaoNoDocumento ? limites(selecaoNoDocumento) : null;
    if (!caixa) return escolherFerramenta("corte");
    const retangulo = { x: caixa.x0, y: caixa.y0, largura: caixa.x1 - caixa.x0, altura: caixa.y1 - caixa.y0 };
    if (executar({ comando: "imagem.recortar", parametros: { retangulo, tamanhos: tamanhosDasMidias() } })) setSelecaoDoDocumento(null);
  };
  /** Imagem › Aparar: tira as bordas transparentes, ou da cor de um canto, pela imagem inteira. */
  const aparar = (por: "transparencia" | "cantoDeCima" | "cantoDeBaixo") => {
    imagemParaSelecao(true)
      .then((imagem) => {
        const caixa = caixaParaAparar(imagem.dados as Uint8ClampedArray, imagem.largura, imagem.altura, por);
        if (!caixa) return mostrarAviso("Não sobra nada para aparar com essa escolha.");
        if (caixa.x0 === 0 && caixa.y0 === 0 && caixa.x1 === imagem.largura && caixa.y1 === imagem.altura) return mostrarAviso("Não há borda para aparar.");
        executar({ comando: "imagem.recortar", parametros: { retangulo: { x: caixa.x0, y: caixa.y0, largura: caixa.x1 - caixa.x0, altura: caixa.y1 - caixa.y0 }, tamanhos: tamanhosDasMidias() } });
      })
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível ler a imagem."));
  };
  /** Começa a transformar a seleção: a caixa em volta dela, com a seleção cortada nela. */
  const transformarSelecao = () => {
    const selecao = selecaoNoDocumento;
    const caixa = selecao ? limites(selecao) : null;
    if (!selecao || !caixa) return;
    const largura = caixa.x1 - caixa.x0;
    const altura = caixa.y1 - caixa.y0;
    const fonte = document.createElement("canvas");
    fonte.width = largura;
    fonte.height = altura;
    fonte.getContext("2d")!.drawImage(selecaoParaCanvas(selecao), -caixa.x0, -caixa.y0);
    const fator = Math.min(1, 800 / Math.max(largura, altura));
    const pequena = document.createElement("canvas");
    pequena.width = Math.max(1, Math.round(largura * fator));
    pequena.height = Math.max(1, Math.round(altura * fator));
    pequena.getContext("2d")!.drawImage(fonte, 0, 0, pequena.width, pequena.height);
    const quad: EstadoDaTransformacao["quad"] = [{ x: caixa.x0, y: caixa.y0 }, { x: caixa.x1, y: caixa.y0 }, { x: caixa.x1, y: caixa.y1 }, { x: caixa.x0, y: caixa.y1 }];
    setTransformando({ estado: { quad, malha: null }, inicial: quad, modo: "livre", fonte, previa: { imagem: pequena, largura: pequena.width, altura: pequena.height }, referencia: { u: 0.5, v: 0.5 }, numeros: null, interpolacao: "bicubica" });
  };
  /** Enter: a seleção desenhada pelo mapa da transformação, na resolução cheia. */
  const confirmarTransformacao = () => {
    if (!transformando || !projeto) return;
    if (transformando.camada) return void confirmarTransformacaoDaCamada(transformando);
    const { largura, altura } = tamanhoDaImagem(projeto);
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx2d.putImageData(new ImageData(levarPeloEstado(transformando.fonte, transformando.estado, { largura, altura }, "bilinear"), largura, altura), 0, 0);
    const nova = selecaoDoCanvas(canvas, "alfa");
    setTransformando(null);
    if (!temAlgo(nova)) mostrarAviso("A seleção ficou sem nenhum pixel mais da metade selecionado.");
    setSelecaoDoDocumento(temAlgo(nova) ? nova : null);
    setBordasDaSelecao(true);
  };
  /** A seleção vira a ponta de um pincel: o escuro da imagem pinta, vezes a cobertura da seleção, como lá. */
  const definirPincelDaSelecao = (nome: string) => {
    const selecao = selecaoNoDocumento;
    const caixa = selecao ? limites(selecao) : null;
    if (!selecao || !caixa) return;
    imagemParaSelecao(true)
      .then(async (imagem) => {
        const largura = caixa.x1 - caixa.x0;
        const altura = caixa.y1 - caixa.y0;
        const dados = new Uint8Array(largura * altura);
        const d = imagem.dados;
        for (let y = 0; y < altura; y++) {
          for (let x = 0; x < largura; x++) {
            const i = (y + caixa.y0) * imagem.largura + x + caixa.x0;
            const luz = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
            // O transparente não pinta; o branco também não
            dados[y * largura + x] = Math.round((((255 - luz) * d[i * 4 + 3]) / 255) * (selecao.dados[i] / 255));
          }
        }
        await pincelDaPonta(nome, { largura, altura, dados });
        pinceisDoEspaco.recarregar();
        mostrarAviso(`"${nome}" está em Meus pincéis.`);
      })
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível criar o pincel."));
  };
  /**
   * Editar › Definir padrão: o retângulo da seleção (ou a imagem inteira), como se vê com todas as camadas, vira um
   * padrão do espaço.
   */
  const definirPadrao = (nome: string) => {
    imagemParaSelecao(true)
      .then(async (imagem) => {
        const caixa = (selecaoNoDocumento && limites(selecaoNoDocumento)) || { x0: 0, y0: 0, x1: imagem.largura, y1: imagem.altura };
        const largura = caixa.x1 - caixa.x0;
        const altura = caixa.y1 - caixa.y0;
        if (largura > 2048 || altura > 2048) throw new Error("O padrão pode ter até 2048 px de lado: selecione um retângulo menor.");
        const canvas = document.createElement("canvas");
        canvas.width = largura;
        canvas.height = altura;
        const pixels = new ImageData(largura, altura);
        for (let y = 0; y < altura; y++) pixels.data.set(imagem.dados.subarray(((y + caixa.y0) * imagem.largura + caixa.x0) * 4, ((y + caixa.y0) * imagem.largura + caixa.x1) * 4), y * largura * 4);
        canvas.getContext("2d")!.putImageData(pixels, 0, 0);
        const recurso = await criarRecurso({ tipo: "padrao", nome, imagem_png: canvas.toDataURL("image/png").split(",")[1] });
        padroesDoEspaco.recarregar();
        escolherPadrao(`espaco:${recurso.id}`);
        mostrarAviso(`"${nome}" está nos padrões do espaço.`);
      })
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível definir o padrão."));
  };
  /** Importar um .pat: cada padrão do arquivo (até 50) vira um do espaço. */
  const importarPadroes = async (arquivo: File) => {
    setImportandoPadroes(true);
    try {
      const lidos = lerPat(await arquivo.arrayBuffer(), 50).filter((padrao) => padrao.largura <= 2048 && padrao.altura <= 2048);
      if (!lidos.length) throw new Error("O arquivo não tem padrões em cores que o editor lê (tons de cinza, indexadas, RGB ou CMYK).");
      for (const padrao of lidos) {
        const canvas = document.createElement("canvas");
        canvas.width = padrao.largura;
        canvas.height = padrao.altura;
        canvas.getContext("2d")!.putImageData(new ImageData(padrao.rgba, padrao.largura, padrao.altura), 0, 0);
        await criarRecurso({ tipo: "padrao", nome: padrao.nome.slice(0, 80), imagem_png: canvas.toDataURL("image/png").split(",")[1] });
      }
      padroesDoEspaco.recarregar();
      mostrarAviso(lidos.length === 1 ? "1 padrão importado." : `${lidos.length} padrões importados.`);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível importar os padrões.");
    } finally {
      setImportandoPadroes(false);
    }
  };
  /** O padrão escolhido no painel vale para o Balde, o Carimbo de padrão e o Preencher. */
  const escolherPadrao = (id: IdDoPadrao) => {
    setOpcoesDoBalde((atual) => ({ ...atual, padrao: id }));
    setOpcoesDoCarimbo((atual) => ({ ...atual, padrao: id }));
    setUltimoPreenchimento((atual) => ({ ...atual, padrao: id }));
  };
  /** Selecionar › Luminosidade (Ctrl+Alt+2): a luz da imagem inteira vira a seleção (o claro mais selecionado). */
  const selecionarLuminosidade = () => {
    imagemParaSelecao(true)
      .then((imagem) => {
        const selecao: Selecao = { largura: imagem.largura, altura: imagem.altura, dados: new Uint8Array(imagem.largura * imagem.altura) };
        const d = imagem.dados;
        for (let i = 0; i < selecao.dados.length; i++) selecao.dados[i] = Math.round(((0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) * d[i * 4 + 3]) / 255);
        if (!temAlgo(selecao)) mostrarAviso("Nenhum pixel é claro o bastante: as bordas da seleção não vão aparecer.");
        setSelecaoDoDocumento(selecao);
        setBordasDaSelecao(true);
      })
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível ler a imagem."));
  };
  /** Q: entra na máscara rápida (a seleção vira cinza para pintar) ou sai dela (o cinza volta a ser a seleção). */
  const alternarMascaraRapida = () => {
    if (!projeto) return;
    if (mascaraRapida) {
      const nova = selecaoDoCanvas(mascaraRapida.camada, "cinza");
      setMascaraRapida(null);
      selecionarNoDocumento(temAlgo(nova) ? nova : null);
      return;
    }
    const { largura, altura } = tamanhoDaImagem(projeto);
    const pintura = new Pintura(largura, altura);
    pintura.carregar(selecaoEmCinza(selecaoNoDocumento, largura, altura));
    setMascaraRapida(pintura);
    if (!FERRAMENTAS_DE_PINTURA.has(ferramenta)) escolherFerramenta("pincel");
  };
  /** Uma máscara cinza da foto escolhida (a do objeto, a do assunto) como seleção do documento; null sem a camada na prévia. */
  const mascaraDaFotoNoDocumento = async (arquivo: string, canal: "cinza" | "alfa" = "cinza"): Promise<Selecao | null> => {
    const medida = selecionado ? caixasRef.current.get(selecionado.clipe.id) : undefined;
    const video = foto?.video;
    if (!selecionado || !foto || !video || !projeto || !medida?.bruta || !medida.quadro) return null;
    const { bruta, quadro } = medida;
    const clipe = selecionado.clipe;
    const documento = tamanhoDaImagem(projeto);
    const mascara = await carregarBitmap(arquivoDaMidia(foto.id, arquivo));
    // A máscara vem menor que a foto: o pixel dela vai para o da foto e daí ao documento
    const escala: Afim = [video.largura / mascara.width, 0, 0, video.altura / mascara.height, 0, 0];
    return imagemNoDocumento(mascara, compor(matrizDaMidiaNoDocumento(bruta, clipe.recorte, clipe.virar, video, quadro, documento), escala), documento, canal);
  };
  /** A profundidade da foto (255 perto, 0 longe), medida uma vez pelo worker de CPU: o nome do arquivo dela. */
  const profundidadeDaFoto = async (fotoId: string): Promise<string> => {
    const resposta = await chamarApi<{ arquivo: string; job_id: string | null }>(`/midias/${fotoId}/profundidade`, { metodo: "POST" });
    if (resposta.job_id) {
      mostrarAviso("Medindo a profundidade da foto…");
      for (;;) {
        const job = await chamarApi<{ status: string; erro?: string | null }>(`/jobs/${resposta.job_id}`);
        if (job.status === "concluido") break;
        if (job.status === "erro") throw new Error(job.erro ?? "Não foi possível medir a profundidade.");
        await new Promise((pronto) => setTimeout(pronto, 500));
      }
      void biblioteca.recarregar();
    }
    return resposta.arquivo;
  };
  /** O céu da foto escolhida: o longe que toca a borda de cima (pela profundidade), com a borda acertada pela cor. */
  const acharCeu = async (): Promise<Selecao | null> => {
    if (!foto) return null;
    const arquivo = await profundidadeDaFoto(foto.id);
    const [disparidade, cobertura, imagem] = await Promise.all([mascaraDaFotoNoDocumento(arquivo), mascaraDaFotoNoDocumento(arquivo, "alfa"), imagemParaSelecao(true)]);
    if (!disparidade || !cobertura) return null;
    // Fora da foto não é céu (o cinza ali seria zero, o mais longe)
    for (let i = 0; i < disparidade.dados.length; i++) if (cobertura.dados[i] < 128) disparidade.dados[i] = 255;
    const ceuBruto = ceuPelaProfundidade(disparidade);
    if (!temAlgo(ceuBruto)) return null;
    // A profundidade vem num tamanho pequeno: a borda é refeita pela cor numa faixa em volta
    const raio = Math.max(3, Math.round(Math.max(imagem.largura, imagem.altura) / 250));
    return refinarSelecao(imagem, ampliarSelecao(ceuBruto, { largura: imagem.largura, altura: imagem.altura }), { ...REFINAMENTO_PADRAO, raio, raioInteligente: true });
  };
  /** Selecionar › Céu numa foto: o céu dela vira a seleção. */
  const selecionarCeuPelaProfundidade = async () => {
    if (!foto || achandoAssunto) return;
    setAchandoAssunto(true);
    try {
      const ceuAchado = await acharCeu();
      if (!ceuAchado) mostrarAviso("Nenhum céu foi achado (o céu precisa tocar a borda de cima).");
      else selecionarNoDocumento(ceuAchado);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível achar o céu.");
    } finally {
      setAchandoAssunto(false);
    }
  };
  // Editar › Substituição do céu: a janela com a imagem e o céu pequenos, e o céu no tamanho do documento para o OK
  const [substituindoCeu, setSubstituindoCeu] = useState<{ base: ImagemRgba; mascara: Selecao; escala: number; ceu: Selecao; faixaId: string } | null>(null);
  const abrirSubstituicaoDoCeu = async () => {
    if (!foto || !selecionado || selecionado.clipe.pixels) return mostrarAviso("Escolha uma foto: o céu é achado na foto escolhida.");
    if (achandoAssunto) return;
    setAchandoAssunto(true);
    try {
      const ceuAchado = await acharCeu();
      if (!ceuAchado) return mostrarAviso("Nenhum céu foi achado (o céu precisa tocar a borda de cima).");
      const imagem = await imagemParaSelecao(true);
      const base = imagemMenor(imagem, 900);
      const k = base.largura / imagem.largura;
      const mascara = imagemNoDocumento(selecaoParaCanvas(ceuAchado), [k, 0, 0, k, 0, 0], { largura: base.largura, altura: base.altura }, "alfa");
      setSubstituindoCeu({ base, mascara, escala: k, ceu: ceuAchado, faixaId: selecionado.faixa.id });
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível achar o céu.");
    } finally {
      setAchandoAssunto(false);
    }
  };
  /** O OK da substituição: um grupo com a luz do primeiro plano e o céu novo, cada um com a máscara dele (pintável). */
  const confirmarSubstituicaoDoCeu = async (opcoes: OpcoesDoCeu) => {
    const dados = substituindoCeu;
    setSubstituindoCeu(null);
    const atual = projetoRef.current;
    if (!dados || !atual) return;
    setGerandoPixels(true);
    try {
      const { largura, altura } = tamanhoDaImagem(atual);
      const mascara = mascaraDoCeu(dados.ceu, opcoes.deslocar);
      const imagem = opcoes.fonte.tipo === "midia" ? await carregarBitmap(arquivoDaMidia(opcoes.fonte.id, "imagem.png")) : null;
      const ceuNovo = desenharCeuNovo(opcoes, largura, altura, baseDaMascara(mascara), imagem);
      const cor = corDoCeuNovo(ceuNovo, mascara);
      const luz = document.createElement("canvas");
      luz.width = largura;
      luz.height = altura;
      const ctxDaLuz = luz.getContext("2d")!;
      ctxDaLuz.fillStyle = `rgb(${Math.round(cor[0] * 255)}, ${Math.round(cor[1] * 255)}, ${Math.round(cor[2] * 255)})`;
      ctxDaLuz.fillRect(0, 0, largura, altura);
      const comoPng = (canvas: HTMLCanvasElement) => new Promise<Blob>((pronto, falhou) => canvas.toBlob((blob) => (blob ? pronto(blob) : falhou(new Error("O navegador não conseguiu gravar a camada."))), "image/png"));
      const matriz = matrizDaCaixa({ cx: largura / 2, cy: altura / 2, largura, altura, rotacao: 0 }, { largura, altura });
      const novas: string[] = [];
      // A luz primeiro (fica logo acima da foto), depois o céu (acima da luz)
      const camadas: { nome: string; canvas: HTMLCanvasElement; invertida: boolean; opacidade: number; mesclagem: Mesclagem }[] = [
        { nome: "Luz do primeiro plano", canvas: luz, invertida: true, opacidade: opcoes.luz / 100, mesclagem: opcoes.modoDaLuz },
        { nome: "Céu", canvas: ceuNovo, invertida: false, opacidade: 1, mesclagem: "normal" },
      ];
      for (const camada of camadas) {
        const daMascara = await subirMascara(pngDoDocumento((ctx2d) => pintarSelecao(ctx2d, mascara, camada.invertida)));
        const midia = await criarCamadaDePixels(largura, altura, camada.nome);
        setCriadas((anteriores) => new Map([...anteriores, [midia.id, midia]]));
        const versao = await enviarVersao(midia.id, await comoPng(camada.canvas));
        const depois = executar({
          comando: "imagem.substituirPorPixels",
          parametros: {
            remover: [],
            lugar: dados.faixaId,
            nome: camada.nome,
            manter: { opacidade: camada.opacidade, mesclagem: camada.mesclagem, faixa: {}, mascara: { midia_id: daMascara.midia.id, versao: daMascara.versao, ligada: true, vinculada: true, densidade: 1, difusao: opcoes.esmaecer / 2, matriz } },
            midiaId: midia.id,
            versao,
          },
        });
        const faixa = depois?.projeto.faixas.find((f) => f.clipes[0]?.midia_id === midia.id);
        if (faixa) novas.push(faixa.id);
      }
      void biblioteca.recarregar();
      if (novas.length === 2) {
        const agrupado = executar({ comando: "imagem.agrupar", parametros: { faixaIds: novas } });
        const pai = agrupado?.projeto.faixas.find((f) => f.id === novas[0])?.pai;
        if (pai) executar({ comando: "imagem.camada", parametros: { faixaIds: [pai], mudanca: { nome: "Substituição do céu" } } });
      }
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível trocar o céu.");
    } finally {
      setGerandoPixels(false);
    }
  };
  const levarObjeto = useEffectEvent((arquivo: string) => {
    mascaraDaFotoNoDocumento(arquivo)
      .then((selecao) => {
        if (!selecao) return;
        setSelecaoDoDocumento(selecao);
        setBordasDaSelecao(true);
      })
      .catch(() => undefined);
  });
  /** Selecionar › Assunto: a pessoa da foto escolhida (o MODNet do recorte do fundo), como seleção. */
  const selecionarAssunto = async () => {
    if (!selecionado || !foto) return mostrarAviso("Escolha uma foto: o assunto (a pessoa) é achado na foto escolhida.");
    if (achandoAssunto) return;
    setAchandoAssunto(true);
    try {
      let estado = foto.recorte_fundo?.status;
      if (estado !== "pronta") {
        if (estado !== "processando") await chamarApi(`/midias/${foto.id}/recorte-fundo`, { metodo: "POST" });
        mostrarAviso("Achando o assunto da foto…");
        for (let i = 0; i < 300 && estado !== "pronta"; i++) {
          await new Promise((pronto) => setTimeout(pronto, 1000));
          const atual = await chamarApi<Midia>(`/midias/${foto.id}`);
          estado = atual.recorte_fundo?.status;
          if (estado === "erro") throw new Error(atual.recorte_fundo?.erro ?? "Não foi possível achar o assunto.");
        }
        if (estado !== "pronta") throw new Error("O assunto demorou demais. Tente de novo.");
        void biblioteca.recarregar();
      }
      const selecao = await mascaraDaFotoNoDocumento("mascara.png");
      if (!selecao || !temAlgo(selecao)) mostrarAviso("Nenhuma pessoa foi achada na foto.");
      else selecionarNoDocumento(selecao);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível achar o assunto.");
    } finally {
      setAchandoAssunto(false);
    }
  };
  /** Uma seleção feita numa cópia menor da imagem, ampliada (suave) para o tamanho do documento. */
  const ampliarSelecao = (selecao: Selecao, documento: { largura: number; altura: number }): Selecao =>
    selecao.largura === documento.largura && selecao.altura === documento.altura
      ? selecao
      : imagemNoDocumento(selecaoParaCanvas(selecao), [documento.largura / selecao.largura, 0, 0, documento.altura / selecao.altura, 0, 0], documento, "alfa");
  const selecionarPor = (como: "cores" | "foco" | "assunto" | "ceu") => {
    if (como === "assunto") return void selecionarAssunto();
    // Numa foto escolhida, o céu vem pela profundidade dela; sem foto, pela cor (coluna a coluna)
    if (como === "ceu" && foto && selecionado && !selecionado.clipe.pixels) return void selecionarCeuPelaProfundidade();
    imagemParaSelecao(true)
      .then((imagem) => {
        if (como === "ceu") {
          const nova = ceu(imagemMenor(imagem, 512));
          const selecao = ampliarSelecao(nova, { largura: imagem.largura, altura: imagem.altura });
          if (!temAlgo(selecao)) mostrarAviso("Nenhum céu foi achado (o céu precisa tocar a borda de cima).");
          else selecionarNoDocumento(selecao);
        } else setJanelaDaSelecao({ tipo: como, imagem });
      })
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível ler a imagem."));
  };
  useEffect(() => {
    if (arquivoDoObjeto) levarObjeto(arquivoDoObjeto);
  }, [arquivoDoObjeto]);
  /** A máscara de camada pintável levada ao documento (o cinza dela em cada pixel do documento). */
  const mascaraNoDocumento = async (clipe: Clipe): Promise<Selecao | null> => {
    const mascara = clipe.mascara_pixels;
    const medida = caixasRef.current.get(clipe.id);
    if (!mascara || !medida?.bruta || !medida.quadro) return null;
    const documento = tamanhoDaImagem(projetoRef.current ?? projeto!);
    const imagem = pinturas.fonteDaMascara(clipe) ?? (await carregarBitmap(arquivoDaMidia(mascara.midia_id, arquivoDaVersao(mascara.versao))));
    // A máscara tem o tamanho do documento de quando foi feita: o pixel dela vai para o documento pela matriz
    const escala: Afim = [documento.largura / imagem.width, 0, 0, documento.altura / imagem.height, 0, 0];
    return imagemNoDocumento(imagem, compor(matrizDaMascaraNoDocumento(mascara, medida.bruta, medida.quadro, documento), escala), documento, "cinza");
  };
  /** Ctrl + clique na miniatura: a seleção pela transparência da camada (sozinha) ou pelo cinza da máscara dela. */
  const selecionarDaCamada = async (clipeId: string, modo: ModoDaSelecao, de: "camada" | "mascara", inverter = false) => {
    const atual = projetoRef.current;
    const achado = atual ? acharClipe(atual, clipeId) : null;
    if (!atual || !achado) return;
    const documento = tamanhoDaImagem(atual);
    try {
      await pinturas.esperar();
      let nova: Selecao;
      if (de === "mascara") {
        const daMascara = await mascaraNoDocumento(achado.clipe);
        if (!daMascara) return;
        nova = daMascara;
      } else {
        const sozinha = projetoSoCom(atual, [achado.faixa.id], { neutras: new Set([achado.faixa.id]), semEstilo: true, semMascara: true });
        const imagem = await createImageBitmap(await exportarImagem(sozinha, midias, { formato: "png", fonteDosPixels: pinturas.fonte }));
        nova = imagemNoDocumento(imagem, [documento.largura / imagem.width, 0, 0, documento.altura / imagem.height, 0, 0], documento, "alfa");
        imagem.close();
      }
      const resultado = combinar(selecaoNoDocumento, inverter ? inverterSelecao(nova) : nova, modo);
      if (resultado && !temAlgo(resultado)) mostrarAviso("A camada não tem nenhum pixel mais da metade opaco: nada foi selecionado.");
      selecionarNoDocumento(resultado);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível selecionar pela camada.");
    }
  };
  const camadaEscolhida = projeto && selecionado ? camadasDaImagem(projeto).find(({ clipe }) => clipe.id === selecionado.clipe.id) : undefined;
  // As camadas escolhidas (podem ser várias, e pastas), de cima para baixo como no painel
  const escolhidas = projeto ? faixasEmOrdem(projeto).filter((faixa) => selecaoValida.includes(faixa.clipes[0].id)) : [];
  const faixaIds = escolhidas.map((faixa) => faixa.id);

  const escolherFerramenta = (id: IdFerramentaDaImagem) => {
    setFerramenta(id);
    const indice = GRUPOS_DE_FERRAMENTAS.findIndex((grupo) => grupo.some((item) => item.id === id));
    setUltimas((atual) => ({ ...atual, [indice]: id }));
    const modo = MODO_DA_SELECAO[id];
    if (modo) objeto.setModo(modo);
    if (id === "corte" && projeto) {
      const { largura, altura } = tamanhoDaImagem(projeto);
      setRecorte(caixaNaPredefinicao({ cx: largura / 2, cy: altura / 2, largura, altura, angulo: 0 }, opcoesDoCorte, { largura, altura }));
    } else setRecorte(null);
    if (id !== "corteDePerspectiva") setCortePerspectiva(null);
  };

  /** O tamanho de cada mídia (as camadas de pixels também), para recortar a imagem sem mudar o tamanho delas em pixels. */
  const tamanhosDasMidias = () => {
    const tamanhos: Record<string, { largura: number; altura: number }> = {};
    for (const midia of midias.values()) {
      if (midia.camada_pixels) tamanhos[midia.id] = { largura: midia.camada_pixels.largura, altura: midia.camada_pixels.altura };
      else if (midia.video) tamanhos[midia.id] = { largura: midia.video.largura, altura: midia.video.altura };
    }
    return tamanhos;
  };
  /**
   * Confirma o corte: a imagem gira ao contrário da caixa e fica o retângulo dela. Apagando os pixels cortados, cada
   * camada de pixels é desenhada sozinha já no quadro novo e entra no lugar dela; sensível ao conteúdo, o que ficou vazio
   * é refeito pelo que está em volta numa camada nova; em L × A × resolução, a imagem vai para esse tamanho depois.
   */
  const confirmarCorte = async () => {
    const atual = projetoRef.current;
    if (!recorte || !atual || gerandoPixels) return;
    const tamanhos = tamanhosDasMidias();
    const caixa = { ...recorte, largura: Math.round(recorte.largura), altura: Math.round(recorte.altura) };
    const comando: Comando = { comando: "imagem.cortar", parametros: { caixa, tamanhos } };
    let depois: Projeto;
    try {
      depois = executarComando(atual, comando, ctx).projeto;
    } catch (e) {
      return mostrarAviso(e instanceof Error ? e.message : "Não foi possível cortar.");
    }
    const o = opcoesDoCorte;
    setRecorte(null);
    setFerramenta("mover");
    setGerandoPixels(true);
    try {
      await pinturas.esperar();
      const pixels: { id: string; midiaId: string; versao: number }[] = [];
      if (o.apagar) {
        const documento = tamanhoDaImagem(depois);
        for (const { clipe, faixa } of camadasDaImagem(depois)) {
          // As camadas com máscara continuam inteiras (a máscara acompanha a caixa delas)
          if (!clipe.pixels || !clipe.midia_id || clipe.mascara_pixels) continue;
          const sozinha = projetoSoCom(depois, [faixa.id], { neutras: new Set([faixa.id]), semEstilo: true });
          const blob = await exportarImagem(sozinha, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros });
          const midia = await criarCamadaDePixels(documento.largura, documento.altura, nomeDaFaixa(faixa));
          setCriadas((atuais) => new Map([...atuais, [midia.id, midia]]));
          pixels.push({ id: clipe.id, midiaId: midia.id, versao: await enviarVersao(midia.id, blob) });
        }
        if (pixels.length) void biblioteca.recarregar();
      }
      executar({ ...comando, parametros: { ...comando.parametros, pixels } } as Comando);
      if (o.preencher && o.preencherCom === "generativo") await expansaoGenerativa(depois, o.textoDoPreenchimento.trim());
      else if (o.preencher) await preencherOVazio(depois);
      if (o.predefinicao === "tamanho") await aplicarTamanhoDaImagem({ ...o.tamanhoFinal, reamostrar: true, metodo: "automatica" });
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível cortar.");
    } finally {
      setGerandoPixels(false);
    }
  };
  /**
   * O Corte de perspectiva: cada camada (desenhada sozinha, como no rasterizar) é retificada do quadrilátero para o
   * retângulo do resultado e entra no lugar dela como camada de pixels; o quadro fica do tamanho dele. Num passo só.
   */
  const confirmarCortePerspectiva = async () => {
    const atual = projetoRef.current;
    const quad = cortePerspectiva;
    if (!atual || !quad || gerandoPixels) return;
    const lado = (a: PontoDaMalha, b: PontoDaMalha) => Math.hypot(b.x - a.x, b.y - a.y);
    const largura = opcoesDaPerspectiva.largura || Math.round(Math.max(lado(quad[0], quad[1]), lado(quad[3], quad[2])));
    const altura = opcoesDaPerspectiva.altura || Math.round(Math.max(lado(quad[0], quad[3]), lado(quad[1], quad[2])));
    const tamanho = { largura, altura, ...(opcoesDaPerspectiva.resolucao ? { resolucao: opcoesDaPerspectiva.resolucao } : {}) };
    const problema = largura < 16 || altura < 16 || largura > 8192 || altura > 8192 || largura * altura > 36_000_000;
    if (problema) return mostrarAviso("O resultado precisa ter de 16 a 8192 px de lado e até 36 milhões de pixels.");
    const documento = tamanhoDaImagem(atual);
    setCortePerspectiva(null);
    setFerramenta("mover");
    setGerandoPixels(true);
    try {
      await pinturas.esperar();
      const trocas: (Omit<PlanoDosPixels, "desenhar"> & { midiaId: string; versao: number })[] = [];
      for (const { clipe, faixa } of camadasDaImagem(atual)) {
        if (clipe.pasta || clipe.ajuste || clipe.camada_de_preenchimento) continue;
        let plano: PlanoDosPixels;
        try {
          plano = planoDosPixels(atual, clipe.mascara_pixels ? "aplicarMascara" : "transformar", [faixa.id], nomeDaFaixa, alturaDaCaixa, matrizNoQuadro);
        } catch {
          continue;
        }
        const { desenhar, ...dados } = plano;
        const bitmap = await createImageBitmap(await exportarImagem(desenhar, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }));
        const tela = document.createElement("canvas");
        tela.width = documento.largura;
        tela.height = documento.altura;
        const ctxTela = tela.getContext("2d", { willReadFrequently: true })!;
        ctxTela.drawImage(bitmap, 0, 0, documento.largura, documento.altura);
        bitmap.close();
        const origem = ctxTela.getImageData(0, 0, documento.largura, documento.altura);
        const canvas = document.createElement("canvas");
        canvas.width = largura;
        canvas.height = altura;
        canvas.getContext("2d")!.putImageData(new ImageData(retificar({ dados: origem.data, largura: origem.width, altura: origem.height }, quad, largura, altura, "bicubica"), largura, altura), 0, 0);
        const blob = await new Promise<Blob>((pronto, falhou) => canvas.toBlob((b) => (b ? pronto(b) : falhou(new Error("O navegador não conseguiu gravar a camada."))), "image/png"));
        const midia = await criarCamadaDePixels(largura, altura, dados.nome);
        setCriadas((atuais) => new Map([...atuais, [midia.id, midia]]));
        trocas.push({ ...dados, midiaId: midia.id, versao: await enviarVersao(midia.id, blob) });
      }
      void biblioteca.recarregar();
      executar({ comando: "imagem.retificar", parametros: { tamanho, trocas } });
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível cortar em perspectiva.");
    } finally {
      setGerandoPixels(false);
    }
  };
  /**
   * Filtro › Dissolver e Editar › Distorção de marionete: a camada escolhida, desenhada sozinha (como no rasterizar),
   * vai para a área de trabalho; o resultado volta como camada de pixels no lugar dela.
   */
  const abrirDissolver = async (tipo: "dissolver" | "marionete" | "lente" | "grandeAngular" | "perspectiva") => {
    const sozinha = await camadaSozinhaParaEditar();
    if (sozinha) setDissolvendo({ tipo, ...sozinha });
  };
  /**
   * A camada escolhida desenhada sozinha no tamanho da imagem (como no rasterizar, sem o estilo; com a máscara aplicada,
   * se houver) e o plano da camada de pixels que entra no lugar dela: o Dissolver, a Marionete e a Escala sensível.
   */
  const camadaSozinhaParaEditar = async (): Promise<{ imagem: ImagemRgba; dados: Omit<PlanoDosPixels, "desenhar"> } | null> => {
    const atual = projetoRef.current;
    if (!atual || !selecionado || gerandoPixels) return null;
    const achado = acharClipe(atual, selecionado.clipe.id);
    if (!achado || achado.clipe.pasta || achado.clipe.ajuste) {
      mostrarAviso("Escolha uma camada com conteúdo.");
      return null;
    }
    if (camadaTravada(atual, achado.faixa) || achado.faixa.travas?.pixels) {
      mostrarAviso("A camada está travada.");
      return null;
    }
    let plano: PlanoDosPixels;
    try {
      plano = planoDosPixels(atual, achado.clipe.mascara_pixels ? "aplicarMascara" : "transformar", [achado.faixa.id], nomeDaFaixa, alturaDaCaixa, matrizNoQuadro);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível abrir a camada.");
      return null;
    }
    const { desenhar, ...dados } = plano;
    setGerandoPixels(true);
    try {
      await pinturas.esperar();
      const documento = tamanhoDaImagem(atual);
      const bitmap = await createImageBitmap(await exportarImagem(desenhar, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }));
      const canvas = document.createElement("canvas");
      canvas.width = documento.largura;
      canvas.height = documento.altura;
      const ctx2d = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx2d.drawImage(bitmap, 0, 0, documento.largura, documento.altura);
      bitmap.close();
      const pixels = ctx2d.getImageData(0, 0, documento.largura, documento.altura);
      return { imagem: { dados: pixels.data, largura: pixels.width, altura: pixels.height }, dados };
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível abrir a camada.");
      return null;
    } finally {
      setGerandoPixels(false);
    }
  };
  /** As camadas escolhidas com conteúdo, cada uma desenhada sozinha (como no rasterizar) e o plano dela. */
  const escolhidasSozinhas = async (): Promise<{ faixa: Faixa; imagem: ImagemRgba; dados: Omit<PlanoDosPixels, "desenhar"> }[]> => {
    const atual = projetoRef.current;
    if (!atual) return [];
    await pinturas.esperar();
    const documento = tamanhoDaImagem(atual);
    const saida: { faixa: Faixa; imagem: ImagemRgba; dados: Omit<PlanoDosPixels, "desenhar"> }[] = [];
    // De baixo para cima, como na pilha
    for (const { faixa, clipe } of [...camadasDaImagem(atual)].reverse()) {
      if (!faixaIds.includes(faixa.id) || clipe.pasta || clipe.ajuste || clipe.camada_de_preenchimento) continue;
      let plano: PlanoDosPixels;
      try {
        plano = planoDosPixels(atual, clipe.mascara_pixels ? "aplicarMascara" : "transformar", [faixa.id], nomeDaFaixa, alturaDaCaixa, matrizNoQuadro);
      } catch {
        continue;
      }
      const { desenhar, ...dados } = plano;
      const bitmap = await createImageBitmap(await exportarImagem(desenhar, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }));
      const canvas = document.createElement("canvas");
      canvas.width = documento.largura;
      canvas.height = documento.altura;
      const ctx2d = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx2d.drawImage(bitmap, 0, 0, documento.largura, documento.altura);
      bitmap.close();
      const pixels = ctx2d.getImageData(0, 0, documento.largura, documento.altura);
      saida.push({ faixa, imagem: { dados: pixels.data, largura: pixels.width, altura: pixels.height }, dados });
    }
    return saida;
  };
  /**
   * Editar › Alinhar camadas automaticamente: a do meio da pilha fica e as outras vão para o lugar dela pelos pontos
   * em comum; a tela cresce até caber todas, e as alinhadas viram camadas de pixels, num passo só.
   */
  const alinharCamadas = async (projecao: ProjecaoDoAlinhamento) => {
    const atual = projetoRef.current;
    if (!atual || gerandoPixels) return;
    setGerandoPixels(true);
    try {
      const camadas = await escolhidasSozinhas();
      if (camadas.length < 2) return mostrarAviso("Escolha duas ou mais camadas com conteúdo.");
      const referencia = camadas[Math.floor(camadas.length / 2)];
      const documento = tamanhoDaImagem(atual);
      const cantos = [
        { x: 0, y: 0 },
        { x: documento.largura, y: 0 },
        { x: documento.largura, y: documento.altura },
        { x: 0, y: documento.altura },
      ];
      const levadas: { camada: (typeof camadas)[number]; quad: Quadrilatero }[] = [];
      const sem: string[] = [];
      for (const camada of camadas) {
        if (camada === referencia) {
          levadas.push({ camada, quad: cantos as Quadrilatero });
          continue;
        }
        const achado = alinharPelosPontos(camada.imagem, referencia.imagem, projecao);
        if (!achado) {
          sem.push(nomeDaFaixa(camada.faixa));
          continue;
        }
        levadas.push({ camada, quad: cantos.map((p) => aplicar(achado.modelo, p)) as Quadrilatero });
      }
      if (levadas.length < 2) return mostrarAviso(`Não achei pontos em comum que bastem${sem.length ? ` (${sem.join(", ")})` : ""}.`);
      // A tela nova: o que cobre a de agora e todas as levadas
      const xs = levadas.flatMap(({ quad }) => quad.map((p) => p.x));
      const ys = levadas.flatMap(({ quad }) => quad.map((p) => p.y));
      const x0 = Math.floor(Math.min(0, ...xs));
      const y0 = Math.floor(Math.min(0, ...ys));
      const largura = Math.ceil(Math.max(documento.largura, ...xs)) - x0;
      const altura = Math.ceil(Math.max(documento.altura, ...ys)) - y0;
      if (largura > 8192 || altura > 8192 || largura * altura > 36_000_000) return mostrarAviso("O resultado passaria de 8192 px de lado ou de 36 milhões de pixels.");
      const trocas: (Omit<PlanoDosPixels, "desenhar"> & { midiaId: string; versao: number })[] = [];
      for (const { camada, quad } of levadas) {
        const canvas = document.createElement("canvas");
        canvas.width = largura;
        canvas.height = altura;
        const deslocado = quad.map((p) => ({ x: p.x - x0, y: p.y - y0 })) as Quadrilatero;
        canvas.getContext("2d")!.putImageData(new ImageData(reamostrar(camada.imagem, deslocado, { largura, altura }, "bicubica"), largura, altura), 0, 0);
        const blob = await new Promise<Blob>((pronto, falhou) => canvas.toBlob((b) => (b ? pronto(b) : falhou(new Error("O navegador não conseguiu gravar a camada."))), "image/png"));
        const midia = await criarCamadaDePixels(largura, altura, camada.dados.nome);
        setCriadas((atuais) => new Map([...atuais, [midia.id, midia]]));
        trocas.push({ ...camada.dados, midiaId: midia.id, versao: await enviarVersao(midia.id, blob) });
      }
      void biblioteca.recarregar();
      executar({ comando: "imagem.alinhar", parametros: { retangulo: { x: x0, y: y0, largura, altura }, tamanhos: tamanhosDasMidias(), trocas } });
      if (sem.length) mostrarAviso(`Sem pontos em comum que bastem: ${sem.join(", ")} (ficaram como estavam).`);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível alinhar.");
    } finally {
      setGerandoPixels(false);
    }
  };
  /** Editar › Mesclar camadas automaticamente: as escolhidas (já alinhadas) numa camada nova por cima. */
  const mesclarCamadas = async (metodo: "panorama" | "empilhar", tonsECores: boolean) => {
    if (gerandoPixels) return;
    setGerandoPixels(true);
    let blob: Blob | null = null;
    try {
      const camadas = await escolhidasSozinhas();
      if (camadas.length < 2) return mostrarAviso("Escolha duas ou mais camadas com conteúdo.");
      const { largura, altura } = camadas[0].imagem;
      const pixels = metodo === "panorama" ? mesclarPanorama(camadas.map((c) => c.imagem), { tonsECores }) : empilharFoco(camadas.map((c) => c.imagem));
      const canvas = document.createElement("canvas");
      canvas.width = largura;
      canvas.height = altura;
      canvas.getContext("2d")!.putImageData(new ImageData(pixels, largura, altura), 0, 0);
      blob = await new Promise<Blob>((pronto, falhou) => canvas.toBlob((b) => (b ? pronto(b) : falhou(new Error("O navegador não conseguiu gravar a camada."))), "image/png"));
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível mesclar.");
    } finally {
      setGerandoPixels(false);
    }
    const pronto = blob;
    if (pronto) await gerarPixels(async () => pronto, { remover: [], lugar: null, nome: metodo === "panorama" ? "Panorama" : "Imagens empilhadas", manter: { opacidade: 1, faixa: {} } });
  };
  /** Filtro › Ponto de fuga: a imagem inteira, como se vê, vai para a área de trabalho. */
  const abrirPontoDeFuga = async () => {
    const atual = projetoRef.current;
    if (!atual || gerandoPixels) return;
    setGerandoPixels(true);
    try {
      await pinturas.esperar();
      const documento = tamanhoDaImagem(atual);
      const bitmap = await createImageBitmap(await exportarImagem(atual, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }));
      const canvas = document.createElement("canvas");
      canvas.width = documento.largura;
      canvas.height = documento.altura;
      const ctx2d = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx2d.drawImage(bitmap, 0, 0, documento.largura, documento.altura);
      bitmap.close();
      const pixels = ctx2d.getImageData(0, 0, documento.largura, documento.altura);
      setPontoDeFuga({ dados: pixels.data, largura: pixels.width, altura: pixels.height });
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível abrir o Ponto de fuga.");
    } finally {
      setGerandoPixels(false);
    }
  };
  /** O que colar no Ponto de fuga: o que foi copiado, ou uma camada desenhada sozinha, no retângulo do conteúdo dela. */
  const fonteDoPontoDeFuga = async (id: string): Promise<ImagemRgba | null> => {
    const atual = projetoRef.current;
    if (!atual) return null;
    let canvas: HTMLCanvasElement;
    if (id === "copia") {
      const copia = areaDeTransferencia.current;
      if (!copia) return null;
      canvas = copia.canvas;
    } else {
      const documento = tamanhoDaImagem(atual);
      const sozinha = projetoSoCom(atual, [id], { neutras: new Set([id]), semEstilo: true });
      const bitmap = await createImageBitmap(await exportarImagem(sozinha, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }));
      canvas = document.createElement("canvas");
      canvas.width = documento.largura;
      canvas.height = documento.altura;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, documento.largura, documento.altura);
      bitmap.close();
    }
    const dados = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data;
    const caixa = caixaDoConteudo(dados, canvas.width, canvas.height, 0);
    if (!caixa) return null;
    const largura = caixa.x1 - caixa.x0;
    const altura = caixa.y1 - caixa.y0;
    const recorte = new Uint8ClampedArray(largura * altura * 4);
    for (let y = 0; y < altura; y++) recorte.set(dados.subarray(((y + caixa.y0) * canvas.width + caixa.x0) * 4, ((y + caixa.y0) * canvas.width + caixa.x1) * 4), y * largura * 4);
    return { dados: recorte, largura, altura };
  };
  const abrirEscalaSensivel = async () => {
    const sozinha = await camadaSozinhaParaEditar();
    if (!sozinha) return;
    const caixa = caixaDoConteudo(sozinha.imagem.dados, sozinha.imagem.largura, sozinha.imagem.altura, 0);
    if (!caixa) return mostrarAviso("A camada está vazia.");
    setEscalando({ ...sozinha, caixa });
  };
  /**
   * A escala sensível: o retângulo do conteúdo vai para o tamanho novo pelas costuras (com a proteção recortada nele) e
   * volta para a camada com o mesmo centro, como camada de pixels.
   */
  const aplicarEscalaSensivel = async (nova: NovaEscalaSensivel) => {
    if (!escalando) return;
    const { imagem, caixa, dados } = escalando;
    setEscalando(null);
    setGerandoPixels(true);
    try {
      const l = caixa.x1 - caixa.x0;
      const a = caixa.y1 - caixa.y0;
      const recorte = new Uint8ClampedArray(l * a * 4);
      for (let y = 0; y < a; y++) recorte.set(imagem.dados.subarray(((y + caixa.y0) * imagem.largura + caixa.x0) * 4, ((y + caixa.y0) * imagem.largura + caixa.x1) * 4), y * l * 4);
      // A proteção: a seleção ou um canal (o claro protege), no mesmo recorte
      let protecaoDoDocumento: ArrayLike<number> | null = null;
      if (nova.protecao === "selecao" && selecaoNoDocumento) protecaoDoDocumento = selecaoNoDocumento.dados;
      else if (nova.protecao !== "nenhuma") {
        const canal = (projetoRef.current?.canais ?? []).find((item) => item.id === nova.protecao);
        if (canal) {
          const pintura = await pinturas.preparar(alvoDoCanal(canal), imagem);
          const cinza = pintura.camada.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, imagem.largura, imagem.altura).data;
          protecaoDoDocumento = Uint8Array.from({ length: imagem.largura * imagem.altura }, (_, i) => cinza[i * 4]);
        }
      }
      let protecao: Uint8Array | null = null;
      if (protecaoDoDocumento) {
        protecao = new Uint8Array(l * a);
        for (let y = 0; y < a; y++) for (let x = 0; x < l; x++) protecao[y * l + x] = protecaoDoDocumento[(y + caixa.y0) * imagem.largura + x + caixa.x0];
      }
      const pixels = escalaSensivel({ dados: recorte, largura: l, altura: a }, nova.largura, nova.altura, { protecao, protegerPele: nova.pele, quantidade: nova.quantidade });
      const pedaco = document.createElement("canvas");
      pedaco.width = nova.largura;
      pedaco.height = nova.altura;
      pedaco.getContext("2d")!.putImageData(new ImageData(pixels, nova.largura, nova.altura), 0, 0);
      const canvas = document.createElement("canvas");
      canvas.width = imagem.largura;
      canvas.height = imagem.altura;
      canvas.getContext("2d")!.drawImage(pedaco, Math.round((caixa.x0 + caixa.x1 - nova.largura) / 2), Math.round((caixa.y0 + caixa.y1 - nova.altura) / 2));
      const blob = await new Promise<Blob>((pronto, falhou) => canvas.toBlob((b) => (b ? pronto(b) : falhou(new Error("O navegador não conseguiu gravar a camada."))), "image/png"));
      setGerandoPixels(false);
      await gerarPixels(async () => blob, dados);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível mudar a escala.");
    } finally {
      setGerandoPixels(false);
    }
  };
  /** Expansão generativa: o que ficou sem nenhuma camada vira a área do preenchimento generativo (pelo texto). */
  const expansaoGenerativa = async (depois: Projeto, descricao: string) => {
    const documento = tamanhoDaImagem(depois);
    const comTransparencia = { ...depois, fundo: { ...depois.fundo, transparente: true } };
    const bitmap = await createImageBitmap(await exportarImagem(comTransparencia, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }));
    const canvas = document.createElement("canvas");
    canvas.width = documento.largura;
    canvas.height = documento.altura;
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx2d.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = ctx2d.getImageData(0, 0, documento.largura, documento.altura).data;
    const vazio = new Uint8Array(documento.largura * documento.altura);
    for (let i = 0; i < vazio.length; i++) if (pixels[i * 4 + 3] < 250) vazio[i] = 255;
    if (!vazio.some(Boolean)) return;
    await pedirPreenchimento(descricao, 1, { selecao: { largura: documento.largura, altura: documento.altura, dados: vazio }, projeto: depois });
  };
  /** Sensível ao conteúdo: o que ficou sem nenhuma camada (as cunhas do giro, o que passou da imagem) é refeito. */
  const preencherOVazio = async (depois: Projeto) => {
    const documento = tamanhoDaImagem(depois);
    const comTransparencia = { ...depois, fundo: { ...depois.fundo, transparente: true } };
    const bitmap = await createImageBitmap(await exportarImagem(comTransparencia, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }));
    const canvas = document.createElement("canvas");
    canvas.width = documento.largura;
    canvas.height = documento.altura;
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx2d.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = ctx2d.getImageData(0, 0, documento.largura, documento.altura);
    const buraco = new Uint8Array(documento.largura * documento.altura);
    let vazios = 0;
    for (let i = 0; i < buraco.length; i++) {
      if (pixels.data[i * 4 + 3] < 250) {
        buraco[i] = 1;
        vazios++;
      }
    }
    if (!vazios) return;
    preencherBuracos(pixels.data, documento.largura, documento.altura, buraco, { jeito: "remendo", alcance: 6 });
    // A camada nova só tem o que foi refeito
    for (let i = 0; i < buraco.length; i++) if (!buraco[i]) pixels.data[i * 4 + 3] = 0;
    ctx2d.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>((pronto, falhou) => canvas.toBlob((b) => (b ? pronto(b) : falhou(new Error("O navegador não conseguiu gravar a camada."))), "image/png"));
    await gerarPixels(async () => blob, { remover: [], lugar: null, nome: "Preenchimento sensível ao conteúdo", manter: { opacidade: 1, faixa: {} } });
  };
  /** A caixa ajustada à predefinição: a maior na proporção dentro da de agora, com o mesmo centro e o mesmo giro. */
  const caixaNaPredefinicao = (caixa: CaixaDoCorte, opcoes: OpcoesDoCorte, documento: { largura: number; altura: number }): CaixaDoCorte => {
    const proporcao = proporcaoDoCorte(opcoes, documento);
    if (!proporcao) return caixa;
    const largura = Math.min(caixa.largura, caixa.altura * proporcao);
    return { ...caixa, largura, altura: largura / proporcao };
  };
  const mudarOpcoesDoCorte = (mudanca: Partial<OpcoesDoCorte>) => {
    const novas = { ...opcoesDoCorte, ...mudanca };
    setOpcoesDoCorte(novas);
    if (recorte && projeto && ("predefinicao" in mudanca || "tamanhoFinal" in mudanca)) setRecorte(caixaNaPredefinicao(recorte, novas, tamanhoDaImagem(projeto)));
  };
  const cancelarCorte = () => {
    setRecorte(null);
    setFerramenta("mover");
  };

  /** Apagar (a IA refaz o fundo e a foto da camada troca) ou recortar (vira uma camada nova) a seleção da foto. */
  async function usarSelecao(acao: "apagar" | "recortar") {
    if (!selecionado || pedindo) return;
    setPedindo(true);
    const midia = await objeto.pedir(acao, selecaoNaFoto());
    setPedindo(false);
    if (!midia) return;
    // Com "Numa camada nova" (o Remover), a foto refeita entra por cima, no mesmo lugar, e a original fica
    const naCamadaNova = acao === "recortar" || (ferramenta === "remover" && removerNaCamadaNova);
    esperarMidia(midia, naCamadaNova ? { camadaDe: selecionado.faixa.id } : { trocar: [selecionado.clipe.id] });
    objeto.limpar();
    mostrarAviso(acao === "recortar" ? "Recortando: o objeto entra numa camada nova quando ficar pronto." : naCamadaNova ? "Removendo: o resultado entra numa camada nova quando ficar pronto." : "Removendo: a foto troca quando ficar pronta.");
  }
  // O "Remover após cada traço" roda depois que o traço entra no estado do pincel
  const usarSelecaoRef = useRef(usarSelecao);
  useEffect(() => {
    usarSelecaoRef.current = usarSelecao;
  });

  // ——— As camadas de preenchimento ———
  const novoPreenchimento = (tipo: CamadaDePreenchimento["tinta"]["tipo"]) => {
    terminarTexto();
    setPreenchendo({ clipeId: null, acima: selecionado?.faixa.id ?? null, inicial: preenchimentoNovo(tipo, cores.primeiroPlano, cores.fundo) });
  };
  /** A janela de uma camada de preenchimento; com outro tipo, é o "Alterar o conteúdo da camada". */
  const editarPreenchimento = (clipeId: string, tipo?: CamadaDePreenchimento["tinta"]["tipo"]) => {
    const atual = projeto ? acharClipe(projeto, clipeId)?.clipe.camada_de_preenchimento : null;
    if (!atual) return;
    setPreenchendo({ clipeId, acima: null, inicial: tipo && tipo !== atual.tinta.tipo ? preenchimentoNovo(tipo, cores.primeiroPlano, cores.fundo) : atual });
  };
  const comandoDoPreenchimento = useCallback(
    (preenchimento: CamadaDePreenchimento): Comando | null =>
      !preenchendo
        ? null
        : preenchendo.clipeId
          ? { comando: "imagem.preenchimento", parametros: { clipeId: preenchendo.clipeId, preenchimento } }
          : { comando: "imagem.adicionarPreenchimento", parametros: { preenchimento, acima: preenchendo.acima } },
    [preenchendo],
  );
  const preverPreenchimento = useCallback((preenchimento: CamadaDePreenchimento) => setProvisorio(comandoDoPreenchimento(preenchimento)), [comandoDoPreenchimento]);
  /** Uma camada de ajuste (do tipo, ou já numa predefinição), acima da escolhida, com o painel Propriedades dela aberto. */
  const criarAjustePronto = (ajuste: AjusteDaImagem) => {
    const resultado = executar({ comando: "imagem.adicionarAjuste", parametros: { acima: selecionado?.faixa.id ?? null, ajuste } });
    if (resultado) area.abrir("propriedades");
  };
  const criarAjuste = (ajuste: Ajuste) => criarAjustePronto(ajustePadrao(ajuste.id, cores.primeiroPlano, cores.fundo));
  // ——— A camada de ajuste escolhida: o que está embaixo dela (histograma, conta-gotas) e o conta-gotas ———
  // O painel Histograma: a imagem inteira ou a camada escolhida, contada só com o painel aberto
  const [origemDoHistograma, setOrigemDoHistograma] = useState<"imagem" | "camada">("imagem");
  const camadaDoHistograma = origemDoHistograma === "camada" ? (selecionado?.faixa.id ?? null) : null;
  const imagemDoHistograma = useImagemAbaixo(projeto, midias, camadaDoHistograma, area.aberto("histograma"), Boolean(camadaDoHistograma));
  // O Navegador: a imagem inteira, pequena
  const miniaturaDoNavegador = useImagemAbaixo(projeto, midias, null, area.aberto("navegador"));
  // O painel Informações lê a imagem inteira em resolução cheia (a mesma da varinha), lida de novo quando o projeto muda
  const [imagemDasInformacoes, setImagemDasInformacoes] = useState<ImagemRgba | null>(null);
  const informacoesAbertas = area.aberto("informacoes");
  const lerImagemDasInformacoes = useEffectEvent(() => imagemParaSelecao(true));
  useEffect(() => {
    if (!informacoesAbertas || !projeto) return;
    let cancelado = false;
    const espera = window.setTimeout(() => {
      lerImagemDasInformacoes()
        .then((lida) => {
          if (!cancelado) setImagemDasInformacoes(lida);
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      cancelado = true;
      window.clearTimeout(espera);
    };
  }, [informacoesAbertas, projeto]);
  const ajusteEscolhido = selecionado?.clipe.ajuste_imagem ? selecionado : null;
  const imagemAbaixo = useImagemAbaixo(projeto, midias, ajusteEscolhido?.faixa.id ?? null, Boolean(ajusteEscolhido));
  // O pedido vale só para o ajuste que pediu: trocar de camada desiste dele
  const [pedidoDeAmostra, setPedidoDeAmostra] = useState<{ clipeId: string; receber: (cor: Rgb) => void } | null>(null);
  const amostraDoAjuste = pedidoDeAmostra && (pedidoDeAmostra.clipeId === ajusteEscolhido?.clipe.id || pedidoDeAmostra.clipeId === "janela") ? pedidoDeAmostra.receber : null;
  /** A cor da imagem embaixo do ajuste (ou da camada, na janela de Imagem › Ajustes) no ponto clicado (pixels do documento). */
  const amostrarAbaixo = (ponto: { x: number; y: number }) => {
    const receber = amostraDoAjuste;
    setPedidoDeAmostra(null);
    if (!receber) return;
    if (pedidoDeAmostra?.clipeId === "janela" && nosPixels) {
      // Os pixels de antes da camada, no ponto levado a ela
      const [a, b, c, d, e, f] = nosPixels.matriz;
      const x = Math.min(nosPixels.largura - 1, Math.max(0, Math.floor(a * ponto.x + c * ponto.y + e)));
      const y = Math.min(nosPixels.altura - 1, Math.max(0, Math.floor(b * ponto.x + d * ponto.y + f)));
      const i = (y * nosPixels.largura + x) * 4;
      receber([nosPixels.original[i] / 255, nosPixels.original[i + 1] / 255, nosPixels.original[i + 2] / 255]);
      return;
    }
    if (!imagemAbaixo || !projeto) return;
    const documento = tamanhoDaImagem(projeto);
    const x = Math.min(imagemAbaixo.largura - 1, Math.max(0, Math.floor((ponto.x / documento.largura) * imagemAbaixo.largura)));
    const y = Math.min(imagemAbaixo.altura - 1, Math.max(0, Math.floor((ponto.y / documento.altura) * imagemAbaixo.altura)));
    const i = (y * imagemAbaixo.largura + x) * 4;
    receber([imagemAbaixo.dados[i] / 255, imagemAbaixo.dados[i + 1] / 255, imagemAbaixo.dados[i + 2] / 255]);
  };
  // ——— Imagem › Ajustes: o ajuste gravado nos pixels da camada de pixels escolhida ———
  /**
   * A sessão da janela: o canvas vivo da camada, os pixels de antes (o cancelar volta a eles), a seleção levada à
   * camada, uma cópia pequena (o histograma) e a operação da vez. A prévia escreve no canvas, sem subir nada.
   */
  const [nosPixels, setNosPixels] = useState<{
    clipeId: string;
    chave: string;
    canvas: HTMLCanvasElement;
    largura: number;
    altura: number;
    original: Uint8ClampedArray;
    cobertura: Uint8ClampedArray | null;
    pequena: ImagemRgba;
    matriz: Afim;
    operacao: OperacaoDosPixels;
    visualizar: boolean;
  } | null>(null);
  // Os mapas do documento que os filtros nos pixels leem (o desfoque de lente), pela fonte e pela versão
  const mapasDosFiltros = useRef(new Map<string, Selecao>());
  const [mapasProntos, setMapasProntos] = useState(0);
  const chaveDoMapa = (fonte: string, clipeId?: string) => {
    const atual = projetoRef.current;
    if (fonte.startsWith("canal:")) {
      const canal = atual?.canais?.find((item) => item.id === fonte.slice(6));
      return canal ? `${fonte}@${canal.versao}` : fonte;
    }
    const mascara = atual && clipeId ? acharClipe(atual, clipeId)?.clipe.mascara_pixels : null;
    return mascara ? `mascara:${clipeId}@${mascara.midia_id}:${mascara.versao}` : `mascara:${clipeId}`;
  };
  const [estatisticasDaOrigem, setEstatisticasDaOrigem] = useState<{ origem: string; estatisticas: Estatisticas | null } | null>(null);
  /** A camada sozinha (ou o documento, com `null`) desenhada pequena: o histograma e a cor de origem. */
  const imagemPequena = async (faixaId: string | null, lado = 512, base?: Projeto): Promise<ImagemRgba | null> => {
    const atual = base ?? projetoRef.current;
    if (!atual) return null;
    const documento = tamanhoDaImagem(atual);
    const desenhar = faixaId ? projetoSoCom(atual, [faixaId], { neutras: new Set([faixaId]), semEstilo: true, semMascara: true }) : atual;
    const blob = await exportarImagem(desenhar, midias, { formato: "png", escala: Math.min(1, lado / Math.max(documento.largura, documento.altura)), fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx2d.drawImage(bitmap, 0, 0);
    bitmap.close();
    return { largura: canvas.width, altura: canvas.height, dados: ctx2d.getImageData(0, 0, canvas.width, canvas.height).data };
  };
  /** O resultado da operação sobre os pixels de antes (com a seleção). */
  const pixelsDaOperacao = (sessao: NonNullable<typeof nosPixels>): Uint8ClampedArray => {
    const dados = sessao.original.slice();
    const operacao = sessao.operacao;
    if (operacao.tipo === "ajuste") {
      const ajuste = operacao.ajuste;
      const daPesquisa = ajuste.tipo === "pesquisa" && ajuste.lut ? lutGuardada(ajuste.lut.id) : null;
      aplicarAjusteNosPixels(dados, compilarAjuste(ajuste, daPesquisa), sessao.cobertura);
      return dados;
    }
    if (operacao.tipo === "filtro") return filtrarPixelsRetos(sessao.original, sessao.largura, sessao.altura, operacao.filtro, operacao.opcoes, sessao.cobertura, inverter(sessao.matriz), sessao.clipeId);
    if (operacao.tipo === "sombrasRealces") sombrasRealces(dados, sessao.largura, sessao.altura, operacao.opcoes);
    else if (operacao.tipo === "hdr") tonalizacaoHdr(dados, sessao.largura, sessao.altura, operacao.opcoes);
    else if (operacao.tipo === "substituir") substituirCor(dados, operacao.opcoes);
    else {
      const origem = estatisticasDaOrigem?.origem === operacao.origem ? estatisticasDaOrigem.estatisticas : null;
      const alvo = estatisticasDaCor(sessao.original);
      if (!origem || !alvo) return dados;
      corresponderCor(dados, alvo, origem, operacao.opcoes);
    }
    misturarComCobertura(sessao.original, dados, sessao.cobertura);
    return dados;
  };
  // A prévia: o resultado (ou os pixels de antes, sem o Visualizar) no canvas da camada, um pouco depois de mexer
  useEffect(() => {
    if (!nosPixels) return;
    const espera = window.setTimeout(() => {
      const dados = nosPixels.visualizar ? pixelsDaOperacao(nosPixels) : nosPixels.original;
      nosPixels.canvas.getContext("2d", { willReadFrequently: true })!.putImageData(new ImageData(new Uint8ClampedArray(dados), nosPixels.largura, nosPixels.altura), 0, 0);
      pinturas.avisarQuadro();
    }, 60);
    return () => window.clearTimeout(espera);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a conta lê a sessão, a origem e os mapas, que estão nas dependências
  }, [nosPixels, estatisticasDaOrigem, mapasProntos]);
  // O mapa de profundidade do desfoque de lente nos pixels: o canal ou a máscara da camada, carregado uma vez por versão
  const fonteDaLente = nosPixels?.operacao.tipo === "filtro" && nosPixels.operacao.filtro === "lente" ? String(nosPixels.operacao.opcoes.fonte ?? "") : "";
  const chaveDaLente = fonteDaLente === "mascara" || fonteDaLente.startsWith("canal:") ? chaveDoMapa(fonteDaLente, nosPixels?.clipeId) : "";
  useEffect(() => {
    if (!chaveDaLente || mapasDosFiltros.current.has(chaveDaLente)) return;
    const atual = projetoRef.current;
    const canal = fonteDaLente.startsWith("canal:") ? atual?.canais?.find((item) => item.id === fonteDaLente.slice(6)) : undefined;
    const achado = atual && nosPixels ? acharClipe(atual, nosPixels.clipeId) : null;
    const carregar = canal ? selecaoDoCanal(canal) : achado ? mascaraNoDocumento(achado.clipe) : Promise.resolve(null);
    carregar
      .then((mapa) => {
        if (!mapa) return;
        mapasDosFiltros.current.set(chaveDaLente, mapa);
        setMapasProntos((n) => n + 1);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave já diz a fonte, a camada e a versão
  }, [chaveDaLente]);
  // A cor da origem do Corresponder cor, desenhada pequena quando muda
  const origemDoCorresponder = nosPixels?.operacao.tipo === "corresponder" ? nosPixels.operacao.origem : null;
  useEffect(() => {
    if (!origemDoCorresponder) return;
    let cancelado = false;
    imagemPequena(origemDoCorresponder === "documento" ? null : origemDoCorresponder)
      .then((imagem) => !cancelado && setEstatisticasDaOrigem({ origem: origemDoCorresponder, estatisticas: imagem ? estatisticasDaCor(imagem.dados) : null }))
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando a origem muda
  }, [origemDoCorresponder]);
  /**
   * Abre a janela numa camada de pixels. Noutra camada, os dezesseis ajustes entram como camada de ajuste presa a ela
   * (o mesmo resultado, sem perder a camada); os clássicos pedem que ela vire pixels antes.
   */
  const abrirNosPixels = async (operacao: OperacaoDosPixels) => {
    const atual = projetoRef.current;
    if (!atual || !selecionado || gerandoPixels) return mostrarAviso("Escolha uma camada.");
    const achado = acharClipe(atual, selecionado.clipe.id);
    if (!achado) return;
    if (!achado.clipe.pixels || !achado.clipe.midia_id) {
      if (operacao.tipo === "ajuste" && !achado.clipe.pasta && !achado.clipe.ajuste) {
        if (executar({ comando: "imagem.adicionarAjuste", parametros: { acima: achado.faixa.id, ajuste: operacao.ajuste, recortada: true } })) {
          area.abrir("propriedades");
          mostrarAviso(`${NOMES_DOS_AJUSTES[operacao.ajuste.tipo]} entrou como camada de ajuste presa a esta camada (para gravar nos pixels, Camada › Rasterizar).`);
        }
        return;
      }
      return mostrarAviso("Este ajuste vale para camadas de pixels: use Camada › Rasterizar antes.");
    }
    if (camadaTravada(atual, achado.faixa) || achado.faixa.travas?.pixels) return mostrarAviso("Os pixels desta camada estão travados.");
    const alvo = alvoDosPixels(achado.clipe)!;
    const documento = tamanhoDaImagem(atual);
    const tamanho = midias.get(achado.clipe.midia_id)?.camada_pixels ?? documento;
    await pinturas.esperar();
    const pintura = await pinturas.preparar(alvo, tamanho);
    const dados = pintura.camada.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, tamanho.largura, tamanho.altura).data;
    // A cópia pequena (o histograma e os automáticos), pelo vizinho mais perto
    const escala = Math.min(1, 512 / Math.max(tamanho.largura, tamanho.altura));
    const pl = Math.max(1, Math.round(tamanho.largura * escala));
    const pa = Math.max(1, Math.round(tamanho.altura * escala));
    const pequena = new Uint8ClampedArray(pl * pa * 4);
    for (let y = 0; y < pa; y++) {
      for (let x = 0; x < pl; x++) {
        const j = (Math.min(tamanho.altura - 1, Math.floor(y / escala)) * tamanho.largura + Math.min(tamanho.largura - 1, Math.floor(x / escala))) * 4;
        pequena.set(dados.subarray(j, j + 4), (y * pl + x) * 4);
      }
    }
    setNosPixels({
      clipeId: achado.clipe.id,
      chave: alvo.chave,
      canvas: pintura.camada,
      largura: tamanho.largura,
      altura: tamanho.altura,
      original: dados.slice(),
      cobertura: selecaoNoDocumento ? coberturaNaCamada(achado.clipe, tamanho, selecaoNoDocumento, documento) : null,
      pequena: { largura: pl, altura: pa, dados: pequena },
      matriz: inverter(matrizDaCamada(achado.clipe, tamanho, documento)),
      operacao,
      visualizar: true,
    });
  };
  const confirmarNosPixels = () => {
    if (!nosPixels) return;
    if (nosPixels.operacao.tipo === "filtro") setUltimoFiltro({ tipo: nosPixels.operacao.filtro, opcoes: nosPixels.operacao.opcoes });
    const dados = pixelsDaOperacao(nosPixels);
    nosPixels.canvas.getContext("2d", { willReadFrequently: true })!.putImageData(new ImageData(new Uint8ClampedArray(dados), nosPixels.largura, nosPixels.altura), 0, 0);
    pinturas.soltar(nosPixels.chave);
    pinturas.avisarQuadro();
    setNosPixels(null);
    setPedidoDeAmostra(null);
  };
  const cancelarNosPixels = () => {
    if (!nosPixels) return;
    nosPixels.canvas.getContext("2d", { willReadFrequently: true })!.putImageData(new ImageData(new Uint8ClampedArray(nosPixels.original), nosPixels.largura, nosPixels.altura), 0, 0);
    pinturas.avisarQuadro();
    setNosPixels(null);
    setPedidoDeAmostra(null);
  };
  /** Os que não têm janela: Inverter, Dessaturar, Equalizar e os automáticos, direto nos pixels (ou presos, como ajuste). */
  const ajusteInstantaneo = async (qual: "inverter" | "dessaturar" | "equalizar" | "tom" | "contraste" | "cor") => {
    const atual = projetoRef.current;
    if (!atual || !selecionado) return mostrarAviso("Escolha uma camada.");
    const achado = acharClipe(atual, selecionado.clipe.id);
    if (!achado) return;
    if (!achado.clipe.pixels) {
      if (qual === "equalizar" || achado.clipe.pasta || achado.clipe.ajuste) return mostrarAviso("Este ajuste vale para camadas de pixels: use Camada › Rasterizar antes.");
      let ajuste: AjusteDaImagem;
      if (qual === "inverter") ajuste = { tipo: "inverter" };
      else if (qual === "dessaturar") ajuste = { ...(ajustePadrao("matiz_saturacao") as Extract<AjusteDaImagem, { tipo: "matiz_saturacao" }>), mestre: { matiz: 0, saturacao: -100, luminosidade: 0 } };
      else {
        const imagem = await imagemPequena(achado.faixa.id);
        if (!imagem) return;
        ajuste = { tipo: "niveis", canais: niveisAutomaticos(histogramas(imagem.dados), qual) };
      }
      if (executar({ comando: "imagem.adicionarAjuste", parametros: { acima: achado.faixa.id, ajuste, recortada: true } })) area.abrir("propriedades");
      return;
    }
    void editarPixels((dados, cobertura, camada) => {
      const antes = dados.slice();
      if (qual === "dessaturar") dessaturar(dados);
      else if (qual === "equalizar") equalizar(dados, camada.largura, camada.altura, cobertura);
      else if (qual === "inverter") aplicarAjusteNosPixels(dados, compilarAjuste({ tipo: "inverter" }));
      else aplicarAjusteNosPixels(dados, compilarAjuste({ tipo: "niveis", canais: niveisAutomaticos(histogramas(dados), qual) }));
      misturarComCobertura(antes, dados, cobertura);
    });
  };
  // ——— Filtros (menu Filtro): nos pixels da camada de pixels, ou na pilha de filtros inteligentes das outras ———
  const [ultimoFiltro, setUltimoFiltro] = useState<{ tipo: string; opcoes: Valores } | null>(null);
  /** A janela de um filtro inteligente: o novo (que entra no topo da pilha) ou um que já está nela. */
  const [filtroAberto, setFiltroAberto] = useState<{ clipeId: string; filtroId: string; tipo: string; antes: FiltrosInteligentes | null; inicial: Valores; novo: boolean } | null>(null);
  // A galeria de desfoque: a ferramenta, o alfinete escolhido e, no filtro inteligente, as opções (que os alfinetes na
  // prévia mudam junto com a janela)
  const [ferramentaDaGaleria, setFerramentaDaGaleria] = useState<FerramentaDaGaleria>("campo");
  const [escolhidoDaGaleria, setEscolhidoDaGaleria] = useState<Escolhido>(null);
  const [valoresDaGaleria, setValoresDaGaleria] = useState<Valores | null>(null);
  const [mesclagemDoFiltro, setMesclagemDoFiltro] = useState<{ clipeId: string; filtroId: string; antes: FiltrosInteligentes } | null>(null);
  const [mascaraDosFiltrosEmFoco, setMascaraDosFiltrosEmFoco] = useState<string | null>(null);
  /** A pilha com o filtro da janela nas opções da vez. */
  const pilhaComFiltro = useCallback(
    (valores: Valores): FiltrosInteligentes | null => {
      if (!filtroAberto) return null;
      const base = filtroAberto.antes ?? { filtros: [] };
      const filtros = filtroAberto.novo
        ? [...base.filtros, { id: filtroAberto.filtroId, tipo: filtroAberto.tipo, opcoes: valores, ligado: true, modo: "normal" as const, opacidade: 1 }]
        : base.filtros.map((filtro) => (filtro.id === filtroAberto.filtroId ? { ...filtro, opcoes: valores } : filtro));
      return { ...base, filtros };
    },
    [filtroAberto],
  );
  const preverFiltro = useCallback(
    (valores: Valores | null) => {
      if (!filtroAberto) return;
      setProvisorio({ comando: "imagem.filtros", parametros: { clipeId: filtroAberto.clipeId, filtros: valores ? pilhaComFiltro(valores) : filtroAberto.antes } });
    },
    [filtroAberto, pilhaComFiltro],
  );
  /** O filtro em pixels pré-multiplicados (como o compositor) sobre a camada de pixels em cor reta, com a seleção. */
  const filtrarPixelsRetos = (original: Uint8ClampedArray, largura: number, altura: number, tipo: string, opcoes: Valores, cobertura: Uint8ClampedArray | Uint8Array | null, paraDocumento?: Afim, clipeId?: string): Uint8ClampedArray => {
    const documento = tamanhoDaImagem(projetoRef.current ?? projeto!);
    const pre = new Uint8ClampedArray(original.length);
    for (let i = 0; i < pre.length; i += 4) {
      const a = original[i + 3];
      for (let k = 0; k < 3; k++) pre[i + k] = Math.round((original[i + k] * a) / 255);
      pre[i + 3] = a;
    }
    const saida = aplicarFiltroNaImagem({ largura, altura, dados: pre }, tipo, opcoes, {
      escala: largura / documento.largura,
      primeiroPlano: corEmRgb(cores.primeiroPlano),
      fundo: corEmRgb(cores.fundo),
      origem: { x: 0, y: 0 },
      documento,
      // O mapa de profundidade do desfoque de lente: um canal ou a máscara da camada, já carregados, lidos no documento
      mapa: (fonte) => {
        const doc = mapasDosFiltros.current.get(chaveDoMapa(fonte, clipeId));
        if (!doc || !paraDocumento) return null;
        const mapa = new Float32Array(largura * altura);
        const [a, b, c, d, e, f] = paraDocumento;
        for (let y = 0, p = 0; y < altura; y++) {
          for (let x = 0; x < largura; x++, p++) {
            const dx = Math.floor(a * (x + 0.5) + c * (y + 0.5) + e);
            const dy = Math.floor(b * (x + 0.5) + d * (y + 0.5) + f);
            mapa[p] = dx >= 0 && dy >= 0 && dx < doc.largura && dy < doc.altura ? doc.dados[dy * doc.largura + dx] / 255 : 0;
          }
        }
        return mapa;
      },
    }).dados;
    const dados = new Uint8ClampedArray(original.length);
    for (let p = 0, i = 0; i < dados.length; p++, i += 4) {
      const a = saida[i + 3];
      // A seleção mistura os quatro canais (um filtro pode mexer no alfa, como o Cor para alfa)
      const peso = cobertura ? cobertura[p] / 255 : 1;
      const reto = [0, 1, 2].map((k) => (a ? Math.round((saida[i + k] * 255) / a) : original[i + k]));
      for (let k = 0; k < 3; k++) dados[i + k] = Math.round(original[i + k] + (reto[k] - original[i + k]) * peso);
      dados[i + 3] = Math.round(original[i + 3] + (a - original[i + 3]) * peso);
    }
    return dados;
  };
  /**
   * O filtro do menu: na camada de pixels (sem filtros inteligentes), grava nos pixels (com a janela, se ele tem
   * opções); nas outras, entra na pilha de filtros inteligentes (a primeira vez, ela nasce).
   */
  const aplicarFiltroDoMenu = (tipo: string, opcoes?: Valores, semJanela = false) => {
    const definicao = FILTRO_POR_ID.get(tipo);
    const atual = projetoRef.current;
    if (!definicao || !atual) return;
    if (!selecionado) return mostrarAviso("Escolha uma camada.");
    const achado = acharClipe(atual, selecionado.clipe.id);
    if (!achado) return;
    if (achado.clipe.ajuste || achado.clipe.pasta) return mostrarAviso("Os filtros valem para camadas com conteúdo, não para ajustes nem grupos.");
    // As cores da frente e do fundo (nuvens, fibras) começam com as da paleta
    const valores = valoresDoFiltro(definicao, { cor_frente: cores.primeiroPlano, cor_fundo: cores.fundo, ...opcoes });
    const direto = definicao.semJanela || semJanela;
    if (achado.clipe.pixels && !achado.clipe.filtros_inteligentes) {
      if (!direto) return void abrirNosPixels({ tipo: "filtro", filtro: tipo, opcoes: valores });
      setUltimoFiltro({ tipo, opcoes: valores });
      void editarPixels((dados, cobertura, camada) => {
        dados.set(filtrarPixelsRetos(dados, camada.largura, camada.altura, tipo, valores, cobertura));
      });
      return;
    }
    const pilha = achado.clipe.filtros_inteligentes ?? { filtros: [] };
    const filtroId = Math.random().toString(36).slice(2, 10);
    if (direto) {
      const novo = { id: filtroId, tipo, opcoes: valores, ligado: true, modo: "normal" as const, opacidade: 1 };
      if (executar({ comando: "imagem.filtros", parametros: { clipeId: achado.clipe.id, filtros: { ...pilha, filtros: [...pilha.filtros, novo] } } })) setUltimoFiltro({ tipo, opcoes: valores });
      return;
    }
    if (tipo === "galeria") setValoresDaGaleria(valores);
    setFiltroAberto({ clipeId: achado.clipe.id, filtroId, tipo, antes: achado.clipe.filtros_inteligentes ?? null, inicial: valores, novo: true });
  };
  /** Filtro › Galeria de desfoque: a galeria com um alfinete da ferramenta no meio da imagem. */
  const abrirGaleria = (ferramenta: FerramentaDaGaleria) => {
    const documento = tamanhoDaImagem(projetoRef.current ?? projeto!);
    setFerramentaDaGaleria(ferramenta);
    setEscolhidoDaGaleria({ ferramenta, indice: 0 });
    aplicarFiltroDoMenu("galeria", { [ferramenta]: textoDosPinos(ferramenta, [pinoNovo(ferramenta, 50, 50, documento)] as Galeria[typeof ferramenta]) });
  };
  // Os alfinetes na prévia mudam as opções da janela aberta: a do filtro inteligente ou a dos pixels
  const galeriaNaTela: { valores: Valores; aoMudar: (valores: Valores) => void } | null =
    filtroAberto?.tipo === "galeria" && valoresDaGaleria
      ? { valores: valoresDaGaleria, aoMudar: setValoresDaGaleria }
      : nosPixels?.operacao.tipo === "filtro" && nosPixels.operacao.filtro === "galeria"
        ? { valores: nosPixels.operacao.opcoes, aoMudar: (opcoes) => setNosPixels((atual) => (atual && atual.operacao.tipo === "filtro" ? { ...atual, operacao: { ...atual.operacao, opcoes } } : atual)) }
        : null;
  const escolherNaGaleria = (escolhido: Escolhido) => {
    setEscolhidoDaGaleria(escolhido);
    if (escolhido) setFerramentaDaGaleria(escolhido.ferramenta);
  };
  const propsDaGaleria = {
    ferramenta: ferramentaDaGaleria,
    aoFerramenta: (f: FerramentaDaGaleria) => {
      setFerramentaDaGaleria(f);
      setEscolhidoDaGaleria(null);
    },
    escolhido: escolhidoDaGaleria,
    aoEscolher: escolherNaGaleria,
  };
  // Filtro › Galeria de filtros: a janela com a camada pequena, na pilha da camada (ou a que está sendo editada)
  const [galeriaDeFiltros, setGaleriaDeFiltros] = useState<{
    clipeId: string;
    filtroId: string | null;
    imagem: ImagemRgba;
    documento: { largura: number; altura: number };
    inicial: string;
    cores: { frente: string; fundo: string };
  } | null>(null);
  const abrirGaleriaDeFiltros = async (editar?: { clipeId: string; filtroId: string }) => {
    const atual = projetoRef.current;
    const clipeId = editar?.clipeId ?? selecionado?.clipe.id;
    if (!atual || !clipeId) return mostrarAviso("Escolha uma camada.");
    const achado = acharClipe(atual, clipeId);
    if (!achado) return;
    if (achado.clipe.ajuste || achado.clipe.pasta) return mostrarAviso("Os filtros valem para camadas com conteúdo, não para ajustes nem grupos.");
    const pilha = achado.clipe.filtros_inteligentes;
    const indice = editar && pilha ? pilha.filtros.findIndex((filtro) => filtro.id === editar.filtroId) : -1;
    const filtro = indice >= 0 ? pilha!.filtros[indice] : undefined;
    // A camada como chega à galeria: com os filtros de baixo dela (os de cima ainda não valem)
    const base: Projeto =
      pilha && indice >= 0
        ? { ...atual, faixas: atual.faixas.map((faixa) => (faixa.id === achado.faixa.id ? { ...faixa, clipes: faixa.clipes.map((clipe) => (clipe.id === clipeId ? { ...clipe, filtros_inteligentes: { ...pilha, filtros: pilha.filtros.slice(0, indice) } } : clipe)) } : faixa)) }
        : atual;
    try {
      await pinturas.esperar();
      const imagem = await imagemPequena(achado.faixa.id, 900, base);
      if (!imagem) return;
      setGaleriaDeFiltros({
        clipeId,
        filtroId: filtro?.id ?? null,
        imagem,
        documento: tamanhoDaImagem(atual),
        inicial: filtro ? String(filtro.opcoes.pilha ?? "") : "",
        cores: filtro ? { frente: String(filtro.opcoes.cor_frente ?? "#000000"), fundo: String(filtro.opcoes.cor_fundo ?? "#ffffff") } : { frente: cores.primeiroPlano, fundo: cores.fundo },
      });
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível abrir a galeria.");
    }
  };
  const fecharGaleriaDeFiltros = useCallback(() => setGaleriaDeFiltros(null), []);
  const confirmarGaleriaDeFiltros = (texto: string) => {
    const galeria = galeriaDeFiltros;
    setGaleriaDeFiltros(null);
    if (!galeria) return;
    const opcoes = { pilha: texto, cor_frente: galeria.cores.frente, cor_fundo: galeria.cores.fundo };
    if (!galeria.filtroId) return aplicarFiltroDoMenu("galeria_filtros", opcoes, true);
    const pilha = projetoRef.current ? acharClipe(projetoRef.current, galeria.clipeId)?.clipe.filtros_inteligentes : null;
    if (!pilha) return;
    const filtros = pilha.filtros.map((filtro) => (filtro.id === galeria.filtroId ? { ...filtro, opcoes } : filtro));
    if (executar({ comando: "imagem.filtros", parametros: { clipeId: galeria.clipeId, filtros: { ...pilha, filtros } } })) setUltimoFiltro({ tipo: "galeria_filtros", opcoes });
  };
  /** O clique duplo num filtro da pilha: a janela dele, com as opções que ele tem. */
  const editarFiltroInteligente = (clipeId: string, filtroId: string) => {
    const pilha = projetoRef.current ? acharClipe(projetoRef.current, clipeId)?.clipe.filtros_inteligentes : null;
    const filtro = pilha?.filtros.find((item) => item.id === filtroId);
    if (!pilha || !filtro) return;
    if (!FILTRO_POR_ID.get(filtro.tipo)?.opcoes.length) return mostrarAviso("Este filtro não tem opções.");
    if (filtro.tipo === "galeria_filtros") return void abrirGaleriaDeFiltros({ clipeId, filtroId });
    if (filtro.tipo === "galeria") {
      const galeria = galeriaDasOpcoes(filtro.opcoes);
      setFerramentaDaGaleria(FERRAMENTAS_DA_GALERIA.find((f) => (galeria[f] as unknown[]).length) ?? "campo");
      setEscolhidoDaGaleria(null);
      setValoresDaGaleria(filtro.opcoes);
    }
    setFiltroAberto({ clipeId, filtroId, tipo: filtro.tipo, antes: pilha, inicial: filtro.opcoes, novo: false });
  };
  /** A máscara dos filtros: a primeira vez, uma branca (ou a seleção); depois, o clique põe ela em foco para o pincel. */
  const mascaraDosFiltros = async (clipeId: string) => {
    const atual = projetoRef.current;
    const achado = atual ? acharClipe(atual, clipeId) : null;
    if (!achado?.clipe.filtros_inteligentes || gerandoPixels) return;
    if (achado.clipe.filtros_inteligentes.mascara) {
      setMascaraDosFiltrosEmFoco((foco) => (foco === clipeId ? null : clipeId));
      setMascaraEmFoco(null);
      return;
    }
    const medida = caixasRef.current.get(clipeId);
    if (!medida?.bruta || !medida.quadro) return mostrarAviso("A camada ainda não apareceu na prévia. Tente de novo.");
    const matriz = matrizDaCaixa(medida.bruta, medida.quadro);
    setGerandoPixels(true);
    try {
      const selecao = selecaoNoDocumento;
      const gerar = selecao
        ? pngDoDocumento((ctx2d) => pintarSelecao(ctx2d, selecao, false))
        : pngDoDocumento((ctx2d, largura, altura) => {
            ctx2d.fillStyle = "#ffffff";
            ctx2d.fillRect(0, 0, largura, altura);
          });
      const { midia, versao } = await subirMascara(gerar);
      if (executar({ comando: "imagem.mascaraDosFiltros", parametros: { clipeId, mudanca: { midia_id: midia.id, versao, ligada: true, vinculada: true, densidade: 1, difusao: 0, matriz } } })) {
        setMascaraDosFiltrosEmFoco(clipeId);
        setMascaraEmFoco(null);
      }
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível criar a máscara dos filtros.");
    } finally {
      setGerandoPixels(false);
    }
  };
  /** Filtro › Converter para filtros inteligentes: a camada de pixels passa a receber os filtros na pilha. */
  const converterParaFiltrosInteligentes = () => {
    const clipe = selecionado?.clipe;
    if (!clipe || clipe.ajuste || clipe.pasta) return mostrarAviso("Escolha uma camada com conteúdo.");
    if (clipe.filtros_inteligentes) return mostrarAviso("A camada já recebe filtros inteligentes.");
    if (executar({ comando: "imagem.filtros", parametros: { clipeId: clipe.id, filtros: { filtros: [] } } })) mostrarAviso("Os filtros desta camada agora entram como filtros inteligentes.");
  };
  // ——— A ferramenta Texto (texto desenhado no navegador) ———
  const textoEscolhido = !edicaoDeTexto && selecionado?.clipe.texto_rico ? selecionado.clipe : null;
  /** Começa um texto novo no ponto (de ponto) ou na caixa arrastada (de parágrafo), com as opções da barra. */
  const comecarTexto = (x: number, y: number, caixa?: { largura: number; altura: number }) => {
    terminarTexto();
    if (!projeto) return;
    const documento = tamanhoDaImagem(projeto);
    const estilo = { tamanho: Math.max(12, Math.round(Math.min(documento.largura, documento.altura) / 18)), ...opcoesDoTexto.estilo, cor: cores.primeiroPlano };
    const base = textoNovo("", estilo, caixa ? "paragrafo" : "ponto");
    const orientacao = ferramenta === "textoVertical" || ferramenta === "mascaraDeTextoVertical" ? "vertical" : "horizontal";
    const mascara = ferramenta === "mascaraDeTexto" || ferramenta === "mascaraDeTextoVertical";
    const texto = textoMedido({ ...base, orientacao, paragrafo: { ...base.paragrafo, ...opcoesDoTexto.paragrafo }, caixa: caixa ?? base.caixa });
    setSelecao([]);
    setEdicaoDeTexto({ clipeId: novoId(), novo: { ponto: { x, y }, acima: escolhidas[0]?.id ?? null, mascara }, texto, original: null, selecao: { de: 0, ate: 0 }, estiloPendente: null });
  };
  /** Um texto novo no caminho (pixels da imagem: as unidades do texto novo são os pixels, a origem no canto da imagem). */
  const comecarTextoNoCaminho = (caminho: Subcaminho, fracao: number) => {
    terminarTexto();
    if (!projeto) return;
    const documento = tamanhoDaImagem(projeto);
    const estilo = { tamanho: Math.max(12, Math.round(Math.min(documento.largura, documento.altura) / 18)), ...opcoesDoTexto.estilo, cor: cores.primeiroPlano };
    const base = textoNovo("", estilo, "ponto");
    const texto = textoMedido({ ...base, paragrafo: { ...base.paragrafo, ...opcoesDoTexto.paragrafo }, caminho: { tipo: "linha", nos: caminho.nos, fechado: caminho.fechado, inicio: fracao, inverter: false } });
    setSelecao([]);
    setEdicaoDeTexto({ clipeId: novoId(), novo: { ponto: { x: 0, y: 0 }, acima: escolhidas[0]?.id ?? null }, texto, original: null, selecao: { de: 0, ate: 0 }, estiloPendente: null });
  };
  /** Um texto novo dentro de um caminho fechado: a caixa é o retângulo dele, e as linhas quebram dentro do contorno. */
  const comecarTextoNaArea = (caminho: Subcaminho) => {
    terminarTexto();
    const retangulo = caixaDosCaminhos([caminho]);
    if (!projeto || !retangulo) return;
    const documento = tamanhoDaImagem(projeto);
    const estilo = { tamanho: Math.max(12, Math.round(Math.min(documento.largura, documento.altura) / 18)), ...opcoesDoTexto.estilo, cor: cores.primeiroPlano };
    const base = textoNovo("", estilo, "paragrafo");
    const nos = deslocarCaminhos([caminho], -retangulo.x0, -retangulo.y0)[0].nos;
    const texto = textoMedido({
      ...base,
      paragrafo: { ...base.paragrafo, ...opcoesDoTexto.paragrafo },
      caixa: { largura: Math.max(8, retangulo.x1 - retangulo.x0), altura: Math.max(8, retangulo.y1 - retangulo.y0) },
      caminho: { tipo: "area", nos, fechado: true, inicio: 0, inverter: false },
    });
    setSelecao([]);
    setEdicaoDeTexto({ clipeId: novoId(), novo: { ponto: { x: retangulo.x0, y: retangulo.y0 }, acima: escolhidas[0]?.id ?? null }, texto, original: null, selecao: { de: 0, ate: 0 }, estiloPendente: null });
  };
  /** Janela › Glifos: o caractere no cursor do texto em edição, com o estilo de quem está antes. */
  const inserirNoTexto = (caractere: string) => {
    if (!edicaoDeTexto) return;
    const de = Math.min(edicaoDeTexto.selecao.de, edicaoDeTexto.selecao.ate);
    const ate = Math.max(edicaoDeTexto.selecao.de, edicaoDeTexto.selecao.ate);
    const novo = substituir(edicaoDeTexto.texto, de, ate, caractere, edicaoDeTexto.estiloPendente ?? undefined);
    const fim = de + caractere.length;
    setEdicaoDeTexto({ ...edicaoDeTexto, texto: textoMedido(novo), selecao: { de: fim, ate: fim } });
  };
  /** Salva o estilo comum do que está escolhido como um estilo do espaço (só os campos que ele tem). */
  const salvarEstiloDeTexto = (tipo: "estilo_caractere" | "estilo_paragrafo", nome: string) => {
    const origem: Record<string, unknown> = tipo === "estilo_caractere" ? estiloNaBarra : paragrafoNaBarra;
    const modelo = tipo === "estilo_caractere" ? ESTILO_PADRAO : PARAGRAFO_PADRAO;
    const estilo = Object.fromEntries(Object.entries(origem).filter(([chave, valor]) => valor !== undefined && chave in modelo));
    criarRecurso({ tipo, nome, dados: { estilo } })
      .then(() => (tipo === "estilo_caractere" ? estilosDeCaractere : estilosDeParagrafo).recarregar())
      .catch((erro: unknown) => mostrarAviso(erro instanceof Error ? erro.message : "Não foi possível salvar o estilo."));
  };
  const excluirEstiloDeTexto = (tipo: "estilo_caractere" | "estilo_paragrafo", id: string) => {
    excluirRecurso(id)
      .then(() => (tipo === "estilo_caractere" ? estilosDeCaractere : estilosDeParagrafo).recarregar())
      .catch((erro: unknown) => mostrarAviso(erro instanceof Error ? erro.message : "Não foi possível excluir o estilo."));
  };
  /** O texto no caminho: onde ele começa (fração) e de que lado fica. */
  const mudarCaminhoDoTexto = (mudanca: { inicio?: number; inverter?: boolean }) => {
    const alvo = edicaoDeTexto?.texto ?? textoEscolhido?.texto_rico;
    if (!alvo?.caminho) return;
    const novo = textoMedido({ ...alvo, caminho: { ...alvo.caminho, ...mudanca } });
    if (edicaoDeTexto) setEdicaoDeTexto({ ...edicaoDeTexto, texto: novo });
    else if (textoEscolhido) executar({ comando: "imagem.textoRico", parametros: { clipeId: textoEscolhido.id, texto: novo } });
  };
  /** Abre a edição de um texto que já existe, com o cursor no caractere do clique. */
  const editarTexto = (clipeId: string, indice: number) => {
    const clipe = projeto ? acharClipe(projeto, clipeId)?.clipe : null;
    if (!clipe?.texto_rico || clipeId === edicaoDeTexto?.clipeId) return;
    terminarTexto();
    setSelecao([clipeId]);
    setEdicaoDeTexto({ clipeId, novo: null, texto: clipe.texto_rico, original: clipe.texto_rico, selecao: { de: indice, ate: indice }, estiloPendente: null });
  };
  /** Termina a edição: o texto vira um passo do histórico (o vazio não entra; o que ficou vazio sai). */
  const terminarTexto = (cancelar = false) => {
    const atual = edicaoDeTexto;
    if (!atual) return;
    setEdicaoDeTexto(null);
    setFonteEmPrevia(null);
    if (cancelar) return;
    const vazio = !textoCorrido(atual.texto).trim();
    if (vazio) {
      if (!atual.novo) {
        const faixa = projeto ? acharClipe(projeto, atual.clipeId)?.faixa : null;
        if (faixa) executar({ comando: "imagem.apagar", parametros: { faixaId: faixa.id } });
      }
      return;
    }
    if (!atual.novo && JSON.stringify(atual.texto) === JSON.stringify(atual.original)) return;
    if (atual.novo?.mascara) {
      void selecaoDoTexto(atual);
      return;
    }
    // As fontes chegam antes da medida final (o texto não fica com a caixa de uma fonte que faltava)
    void esperarFontes([atual.texto]).then(() => {
      executar(comandoDaEdicao({ ...atual, texto: textoMedido(atual.texto) }, null));
      setSelecao([atual.clipeId]);
    });
  };
  /**
   * A máscara de texto: o texto, desenhado sozinho como seria a camada, vira a seleção do documento (pela transparência,
   * como o Ctrl + clique na miniatura); Shift soma, Alt tira, como nas outras seleções.
   */
  const selecaoDoTexto = async (edicao: EdicaoDeTexto) => {
    const atual = projetoRef.current;
    if (!atual) return;
    try {
      await esperarFontes([edicao.texto]);
      const comTexto = executarComando(atual, comandoDaEdicao({ ...edicao, texto: textoMedido(edicao.texto) }, null), ctx).projeto;
      const faixa = acharClipe(comTexto, edicao.clipeId)?.faixa;
      if (!faixa) return;
      const documento = tamanhoDaImagem(comTexto);
      const sozinha = projetoSoCom(comTexto, [faixa.id], { neutras: new Set([faixa.id]), semEstilo: true, semMascara: true });
      const imagem = await createImageBitmap(await exportarImagem(sozinha, midias, { formato: "png" }));
      const nova = imagemNoDocumento(imagem, [documento.largura / imagem.width, 0, 0, documento.altura / imagem.height, 0, 0], documento, "alfa");
      imagem.close();
      selecionarNoDocumento(combinar(selecaoNoDocumento, nova, opcoesDaSelecao.modo));
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível fazer a seleção do texto.");
    }
  };
  /** Uma mudança de estilo da barra ou dos painéis: na seleção do texto em edição, no texto escolhido inteiro ou no próximo. */
  const mudarEstiloDoTexto = (mudanca: Partial<EstiloDoCaractere>) => {
    if (edicaoDeTexto) {
      const { de, ate } = edicaoDeTexto.selecao;
      if (de === ate) setEdicaoDeTexto({ ...edicaoDeTexto, estiloPendente: { ...edicaoDeTexto.estiloPendente, ...mudanca } });
      else setEdicaoDeTexto({ ...edicaoDeTexto, texto: textoMedido(aplicarEstilo(edicaoDeTexto.texto, de, ate, mudanca)) });
      return;
    }
    if (textoEscolhido?.texto_rico) {
      const novo = estiloEmTudo(textoEscolhido.texto_rico, mudanca);
      const clipeId = textoEscolhido.id;
      void esperarFontes([novo]).then(() => executar({ comando: "imagem.textoRico", parametros: { clipeId, texto: textoMedido(novo) } }));
      return;
    }
    // A cor do próximo texto é a de primeiro plano (como nos editores de imagem)
    const { cor, ...resto } = mudanca;
    if (cor) setCores((atual) => ({ ...atual, primeiroPlano: cor }));
    setOpcoesDoTexto((atual) => ({ ...atual, estilo: { ...atual.estilo, ...resto } }));
  };
  const mudarParagrafoDoTexto = (mudanca: Partial<EstiloDoParagrafo>) => {
    if (edicaoDeTexto) {
      setEdicaoDeTexto({ ...edicaoDeTexto, texto: textoMedido(aplicarParagrafo(edicaoDeTexto.texto, edicaoDeTexto.selecao.de, edicaoDeTexto.selecao.ate, mudanca)) });
      return;
    }
    if (textoEscolhido?.texto_rico) {
      executar({ comando: "imagem.textoRico", parametros: { clipeId: textoEscolhido.id, texto: textoMedido(paragrafoEmTudo(textoEscolhido.texto_rico, mudanca)) } });
      return;
    }
    setOpcoesDoTexto((atual) => ({ ...atual, paragrafo: { ...atual.paragrafo, ...mudanca } }));
  };
  /**
   * O kerning manual: com o cursor entre dois caracteres, o par deles (o kern do de antes); com uma seleção, cada par
   * dela; no texto escolhido, todos. `delta` soma ao que havia (Alt + setas).
   */
  const mudarKern = (valor: number, delta = false) => {
    const limitar = (kern: number) => Math.max(-1000, Math.min(1000, kern));
    if (edicaoDeTexto) {
      const { de, ate } = edicaoDeTexto.selecao;
      const a = de === ate ? de - 1 : Math.min(de, ate);
      const b = de === ate ? de : Math.max(de, ate);
      if (a < 0) return;
      const atual = estiloComum(edicaoDeTexto.texto, a, b).kern ?? 0;
      setEdicaoDeTexto({ ...edicaoDeTexto, texto: textoMedido(aplicarEstilo(edicaoDeTexto.texto, a, b, { kern: limitar(delta ? atual + valor : valor) })) });
      return;
    }
    if (textoEscolhido?.texto_rico) {
      const atual = estiloComum(textoEscolhido.texto_rico, 0, textoCorrido(textoEscolhido.texto_rico).length).kern ?? 0;
      executar({ comando: "imagem.textoRico", parametros: { clipeId: textoEscolhido.id, texto: textoMedido(estiloEmTudo(textoEscolhido.texto_rico, { kern: limitar(delta ? atual + valor : valor) })) } });
    }
  };
  /** A suavização das bordas é da camada inteira. */
  const mudarSuavizacao = (suavizacao: Suavizacao) => {
    if (edicaoDeTexto) setEdicaoDeTexto({ ...edicaoDeTexto, texto: estiloEmTudo(edicaoDeTexto.texto, { suavizacao }) });
    else if (textoEscolhido?.texto_rico) executar({ comando: "imagem.textoRico", parametros: { clipeId: textoEscolhido.id, texto: estiloEmTudo(textoEscolhido.texto_rico, { suavizacao }) } });
    else setOpcoesDoTexto((atual) => ({ ...atual, estilo: { ...atual.estilo, suavizacao } }));
  };
  /** Texto de ponto em parágrafo e de volta, com as letras no lugar (a edição em andamento termina antes). */
  const converterTexto = () => {
    const alvo = edicaoDeTexto ? (edicaoDeTexto.novo ? null : edicaoDeTexto.texto) : textoEscolhido?.texto_rico;
    const clipeId = edicaoDeTexto?.clipeId ?? textoEscolhido?.id;
    if (!alvo || !clipeId) return;
    if (edicaoDeTexto) setEdicaoDeTexto(null);
    void esperarFontes([alvo]).then(() => {
      const { texto, deslocamento } = converterModo(alvo, fonteDoEstilo);
      executar({ comando: "imagem.textoRico", parametros: { clipeId, texto, deslocamento } });
      setSelecao([clipeId]);
    });
  };
  /**
   * Os contornos do texto escolhido em pixels da imagem (a edição em andamento termina antes): para a forma e para o
   * caminho de trabalho.
   */
  const contornosDoTexto = async (): Promise<{ clipeId: string; caminhos: Subcaminho[]; cor: string } | null> => {
    const clipeId = edicaoDeTexto?.clipeId ?? textoEscolhido?.id;
    if (edicaoDeTexto) terminarTexto();
    const atual = projetoRef.current;
    const clipe = clipeId && atual ? acharClipe(atual, clipeId)?.clipe : null;
    const texto = edicaoDeTexto?.texto ?? clipe?.texto_rico;
    if (!clipeId || !clipe || !texto || !atual) return null;
    await esperarFontes([texto]);
    const documento = tamanhoDaImagem(atual);
    const naImagem = { ...clipe, texto_rico: textoMedido(texto) };
    const caminhos = caminhosDoTexto(naImagem.texto_rico, fonteDoEstilo).map((sub) => ({
      ...sub,
      nos: sub.nos.map((no) => {
        const levar = (x: number, y: number) => pontoDaForma(naImagem, { x, y }, documento);
        const p = levar(no.x, no.y);
        const e = no.ex !== undefined && no.ey !== undefined ? levar(no.ex, no.ey) : null;
        const s = no.sx !== undefined && no.sy !== undefined ? levar(no.sx, no.sy) : null;
        return { x: p.x, y: p.y, ...(e ? { ex: e.x, ey: e.y } : {}), ...(s ? { sx: s.x, sy: s.y } : {}) };
      }),
    }));
    return { clipeId, caminhos, cor: texto.estilo.cor };
  };
  const textoEmFormaVetorial = async () => {
    const contornos = await contornosDoTexto();
    if (!contornos?.caminhos.length) return;
    const { vetor, centro } = camadaDosCaminhos(contornos.caminhos, { tipo: "cor", cor: contornos.cor }, null);
    executar({ comando: "imagem.textoEmForma", parametros: { clipeId: contornos.clipeId, vetor, centro } });
  };
  const caminhoDoTexto = async () => {
    const contornos = await contornosDoTexto();
    const atual = projetoRef.current;
    if (!contornos?.caminhos.length || !atual) return;
    // Um caminho de trabalho novo, no lugar do que havia (como a caneta sem caminho escolhido)
    const id = crypto.randomUUID().slice(0, 12);
    const caminhos = [...(atual.caminhos ?? []).filter((item) => !item.trabalho), { id, nome: NOME_DO_TRABALHO, subcaminhos: contornos.caminhos, trabalho: true }];
    if (executar({ comando: "imagem.caminhos", parametros: { caminhos } })) {
      setCaminhoEscolhido(id);
      area.abrir("caminhos");
    }
  };
  // ——— Localizar e substituir, Lorem Ipsum e Atualizar todas ———
  /** Troca o trecho [de, ate) do texto, com o estilo do primeiro caractere dele. */
  const substituirNoTrecho = (texto: TextoRico, de: number, ate: number, troca: string) => substituir(texto, de, ate, troca, estiloNoIndice(texto, de + 1));
  /** As camadas de texto do navegador, de cima para baixo (como no painel), com o texto em edição no lugar do salvo. */
  const textosDoProjeto = (): { clipeId: string; texto: TextoRico }[] => {
    const atual = projetoRef.current;
    if (!atual) return [];
    return faixasEmOrdem(atual)
      .map((faixa) => faixa.clipes[0])
      .filter((clipe) => clipe?.texto_rico)
      .map((clipe) => ({ clipeId: clipe.id, texto: clipe.id === edicaoDeTexto?.clipeId ? edicaoDeTexto.texto : clipe.texto_rico! }));
  };
  /** Abre a edição de um texto com o trecho selecionado (a ferramenta passa a ser a Texto). */
  const mostrarTrecho = (clipeId: string, texto: TextoRico, de: number, ate: number) => {
    if (edicaoDeTexto?.clipeId === clipeId) {
      setEdicaoDeTexto({ ...edicaoDeTexto, selecao: { de, ate } });
      return;
    }
    terminarTexto();
    if (!FERRAMENTAS_DE_TEXTO.has(ferramenta)) setFerramenta("texto");
    setSelecao([clipeId]);
    setEdicaoDeTexto({ clipeId, novo: null, texto, original: texto, selecao: { de, ate }, estiloPendente: null });
  };
  /** O próximo trecho achado depois do cursor (ou do começo), dando a volta pelas camadas. */
  const localizarTexto = (busca: string, opcoes: OpcoesDaBusca): boolean => {
    const textos = textosDoProjeto();
    if (!textos.length) return false;
    const inicio = Math.max(0, textos.findIndex((item) => item.clipeId === edicaoDeTexto?.clipeId));
    const depois = edicaoDeTexto ? Math.max(edicaoDeTexto.selecao.de, edicaoDeTexto.selecao.ate) : 0;
    for (let passo = 0; passo <= textos.length; passo++) {
      const { clipeId, texto } = textos[(inicio + passo) % textos.length];
      const achados = ocorrencias(textoCorrido(texto), busca, opcoes);
      const achado = passo === 0 && clipeId === edicaoDeTexto?.clipeId ? achados.find((item) => item.de >= depois) : achados[0];
      if (achado) {
        mostrarTrecho(clipeId, texto, achado.de, achado.ate);
        return true;
      }
    }
    return false;
  };
  /** Troca o trecho selecionado (se ele é o que se procura) e vai para o próximo. */
  const substituirTexto = (busca: string, troca: string, opcoes: OpcoesDaBusca): boolean => {
    if (edicaoDeTexto) {
      const de = Math.min(edicaoDeTexto.selecao.de, edicaoDeTexto.selecao.ate);
      const ate = Math.max(edicaoDeTexto.selecao.de, edicaoDeTexto.selecao.ate);
      const selecionado = textoCorrido(edicaoDeTexto.texto).slice(de, ate);
      if (ate > de && ocorrencias(selecionado, busca, opcoes).some((item) => item.de === 0 && item.ate === selecionado.length)) {
        const novo = substituirNoTrecho(edicaoDeTexto.texto, de, ate, troca);
        setEdicaoDeTexto({ ...edicaoDeTexto, texto: textoMedido(novo), selecao: { de: de + troca.length, ate: de + troca.length } });
        return true;
      }
    }
    return localizarTexto(busca, opcoes);
  };
  /** Troca em todas as camadas de texto, num passo só; devolve quantas trocas. */
  const substituirTudo = (busca: string, troca: string, opcoes: OpcoesDaBusca): number => {
    const mudancas = textosDoProjeto()
      .map(({ clipeId, texto }) => ({ clipeId, ...substituirTodas(texto, busca, troca, opcoes) }))
      .filter((item) => item.quantas > 0);
    const quantas = mudancas.reduce((soma, item) => soma + item.quantas, 0);
    if (!quantas) return 0;
    setEdicaoDeTexto(null);
    void esperarFontes(mudancas.map((item) => item.texto)).then(() =>
      executar({ comando: "imagem.textosRicos", parametros: { nome: "substituir", mudancas: mudancas.map(({ clipeId, texto }) => ({ clipeId, texto: textoMedido(texto) })) } }),
    );
    return quantas;
  };
  /** Texto › Colar Lorem Ipsum: no cursor do texto em edição (a caixa de parágrafo ganha os três parágrafos). */
  const colarLorem = () => {
    if (!edicaoDeTexto) return;
    const { de, ate } = edicaoDeTexto.selecao;
    const lorem = edicaoDeTexto.texto.modo === "paragrafo" ? LOREM_IPSUM.join("\n") : LOREM_IPSUM[0];
    const novo = substituirNoTrecho(edicaoDeTexto.texto, Math.min(de, ate), Math.max(de, ate), lorem);
    const fim = Math.min(de, ate) + lorem.length;
    setEdicaoDeTexto({ ...edicaoDeTexto, texto: textoMedido(novo), selecao: { de: fim, ate: fim } });
  };
  /** Texto › Atualizar todas as camadas de texto: mede de novo cada texto com as fontes que chegaram. */
  const atualizarTextos = async () => {
    const textos = textosDoProjeto().filter((item) => item.clipeId !== edicaoDeTexto?.clipeId);
    await esperarFontes(textos.map((item) => item.texto));
    const mudancas = textos.map(({ clipeId, texto }) => ({ clipeId, texto: textoMedido(texto) })).filter((item, i) => JSON.stringify(item.texto) !== JSON.stringify(textos[i].texto));
    if (mudancas.length) executar({ comando: "imagem.textosRicos", parametros: { nome: "atualizar", mudancas } });
    mostrarAviso(mudancas.length ? `${mudancas.length} ${mudancas.length === 1 ? "camada de texto atualizada" : "camadas de texto atualizadas"}.` : "As camadas de texto já estão atualizadas.");
  };
  /** Abre a janela Estilo de camada da camada escolhida (as pastas e as camadas de ajuste não têm). */
  const abrirEstiloDeCamada = (foco: TipoDoEfeito | "mesclagem") => {
    const clipe = escolhidoNaTela?.clipe;
    if (!clipe || clipe.pasta || clipe.ajuste) {
      mostrarAviso("Escolha uma camada (pastas e camadas de ajuste não têm estilo).");
      return;
    }
    setEstiloAberto({ clipeId: clipe.id, foco });
  };
  const preverEstilo = useCallback((estilo: EstiloDeCamada, luz: LuzGlobal, camada: GeralDaCamada) => {
    setProvisorio((atual) => {
      const clipeId = estiloAberto?.clipeId;
      return clipeId ? { comando: "imagem.estiloDeCamada", parametros: { clipeIds: [clipeId], estilo, luz, camada } } : atual;
    });
  }, [estiloAberto?.clipeId]);
  /** Abre o Deformar texto no texto em edição ou no escolhido. */
  const abrirDeformar = () => {
    const texto = edicaoDeTexto?.texto ?? textoEscolhido?.texto_rico;
    const clipeId = edicaoDeTexto?.clipeId ?? textoEscolhido?.id;
    if (texto && clipeId) setDeformando({ clipeId, antes: texto.deformar ?? null });
  };
  /** A deformação no texto: na edição, no próprio texto; fora dela, como prévia (provisória) ou de vez. */
  const deformarTexto = (deformar: Deformacao | null, deVez: boolean) => {
    if (!deformando) return;
    if (edicaoDeTexto?.clipeId === deformando.clipeId) {
      setEdicaoDeTexto({ ...edicaoDeTexto, texto: textoMedido({ ...edicaoDeTexto.texto, deformar }) });
      return;
    }
    const clipe = projetoRef.current ? acharClipe(projetoRef.current, deformando.clipeId)?.clipe : null;
    if (!clipe?.texto_rico) return;
    const comando: Comando = { comando: "imagem.textoRico", parametros: { clipeId: clipe.id, texto: textoMedido({ ...clipe.texto_rico, deformar }) } };
    if (deVez) {
      setProvisorio(null);
      executar(comando);
    } else setProvisorio(comando);
  };
  const mudarOrientacaoDoTexto = (orientacao: TextoRico["orientacao"]) => {
    if (edicaoDeTexto) setEdicaoDeTexto({ ...edicaoDeTexto, texto: textoMedido({ ...edicaoDeTexto.texto, orientacao }) });
    else if (textoEscolhido?.texto_rico) executar({ comando: "imagem.textoRico", parametros: { clipeId: textoEscolhido.id, texto: textoMedido({ ...textoEscolhido.texto_rico, orientacao }) } });
    // Sem texto, o botão troca a ferramenta (horizontal e vertical, texto ou máscara), como nos editores de imagem
    else {
      const mascara = ferramenta === "mascaraDeTexto" || ferramenta === "mascaraDeTextoVertical";
      escolherFerramenta(mascara ? (orientacao === "vertical" ? "mascaraDeTextoVertical" : "mascaraDeTexto") : orientacao === "vertical" ? "textoVertical" : "texto");
    }
  };
  // O que a barra mostra: o estilo comum da seleção do texto em edição, o do texto escolhido ou as opções do próximo
  const estiloNaBarra: Partial<EstiloDoCaractere> = edicaoDeTexto
    ? { ...estiloComum(edicaoDeTexto.texto, edicaoDeTexto.selecao.de, edicaoDeTexto.selecao.ate), ...edicaoDeTexto.estiloPendente }
    : textoEscolhido?.texto_rico
      ? estiloComum(textoEscolhido.texto_rico, 0, textoCorrido(textoEscolhido.texto_rico).length)
      : { ...ESTILO_PADRAO, tamanho: tamanhoDoDocumento ? Math.max(12, Math.round(Math.min(tamanhoDoDocumento.largura, tamanhoDoDocumento.altura) / 18)) : 48, ...opcoesDoTexto.estilo, cor: cores.primeiroPlano };
  const textoDaBarra = edicaoDeTexto?.texto ?? textoEscolhido?.texto_rico ?? null;
  // O parágrafo: o comum dos parágrafos que a seleção toca (no texto escolhido, de todos)
  const paragrafoNaBarra: Partial<EstiloDoParagrafo> = (() => {
    if (!textoDaBarra) return { ...PARAGRAFO_PADRAO, ...opcoesDoTexto.paragrafo };
    const de = edicaoDeTexto ? paragrafoDoIndice(textoDaBarra, Math.min(edicaoDeTexto.selecao.de, edicaoDeTexto.selecao.ate)) : 0;
    const ate = edicaoDeTexto ? paragrafoDoIndice(textoDaBarra, Math.max(edicaoDeTexto.selecao.de, edicaoDeTexto.selecao.ate)) : textoDaBarra.paragrafos.length - 1;
    const estilos = textoDaBarra.paragrafos.slice(de, ate + 1).map((paragrafo) => estiloDoParagrafo(textoDaBarra, paragrafo));
    const comum: Partial<EstiloDoParagrafo> = { ...estilos[0] };
    for (const estilo of estilos.slice(1)) for (const chave of Object.keys(comum) as (keyof EstiloDoParagrafo)[]) if (comum[chave] !== estilo[chave]) delete comum[chave];
    return comum;
  })();
  const alinhamentoNaBarra = paragrafoNaBarra.alinhamento;
  // O kerning manual do par do cursor (com seleção, em branco)
  const kernNoCursor = edicaoDeTexto && edicaoDeTexto.selecao.de === edicaoDeTexto.selecao.ate && edicaoDeTexto.selecao.de > 0 ? (estiloComum(edicaoDeTexto.texto, edicaoDeTexto.selecao.de - 1, edicaoDeTexto.selecao.de).kern ?? 0) : null;
  // Trocar de ferramenta termina a edição
  useEffect(() => {
    if (!FERRAMENTAS_DE_TEXTO.has(ferramenta) && edicaoDeTexto) terminarTexto();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a troca de ferramenta
  }, [ferramenta]);

  const porTexto = (texto?: Texto, onde?: { x: number; y: number }) => {
    const base = texto ?? { ...TEXTO_PADRAO, cor: cores.primeiroPlano };
    const resultado = executar({ comando: "imagem.adicionarTexto", parametros: { texto: base, transformacao: onde } });
    if (resultado) abrirAba("texto");
  };
  /**
   * Com a grade de perspectiva à vista, a forma vai para o plano ativo: o retângulo arrastado vira a caixa dela no plano
   * e os caminhos voltam para a imagem pela homografia (null sem a grade, ou na linha).
   */
  const formaNaGrade = (tipo: TipoDaFormaViva, arrasto: ArrastoDaForma) => {
    const grade = projetoNaTela?.perspectiva;
    if (!grade?.visivel || tipo === "linha") return null;
    const { largura, altura, paraPlano } = retanguloNoPlano(grade, grade.plano, { x: arrasto.x, y: arrasto.y }, { x: arrasto.x + arrasto.largura, y: arrasto.y + arrasto.altura });
    if (largura < 1 || altura < 1) return null;
    const viva = formaVivaDoArrasto(tipo, { x: 0, y: 0, largura, altura, de: { x: 0, y: 0 }, ate: { x: largura, y: altura } }, opcoesDaVariante(VARIANTE_DA_FERRAMENTA[ferramenta], forma));
    const noPlanoDaGrade = subcaminhosDaForma(viva).map((sub) => ({
      ...sub,
      nos: sub.nos.map((no) => {
        const p = paraPlano(no.x, no.y);
        const saida: Subcaminho["nos"][number] = { x: p.x, y: p.y };
        if (no.ex !== undefined && no.ey !== undefined) Object.assign(saida, (({ x, y }) => ({ ex: x, ey: y }))(paraPlano(no.ex, no.ey)));
        if (no.sx !== undefined && no.sy !== undefined) Object.assign(saida, (({ x, y }) => ({ sx: x, sy: y }))(paraPlano(no.sx, no.sy)));
        return saida;
      }),
    }));
    return caminhosDoPlano(grade, grade.plano, noPlanoDaGrade);
  };
  /** A forma viva do arrasto, com os caminhos já em pixels da imagem (para o contorno na prévia e para juntar). */
  const formaDoArrasto = (tipo: TipoDaFormaViva, arrasto: ArrastoDaForma) => {
    const { vetor, centro } = camadaDoArrasto(tipo, arrasto, opcoesDaVariante(VARIANTE_DA_FERRAMENTA[ferramenta], forma), cores.primeiroPlano);
    return { vetor, centro, naImagem: deslocarCaminhos(vetor.subcaminhos, centro.x - vetor.caixa.largura / 2, centro.y - vetor.caixa.altura / 2) };
  };
  /** Desenha a forma viva: numa camada nova, ou junta à camada de forma escolhida (as operações da barra). */
  const criarFormaViva = (tipo: TipoDaFormaViva, arrasto: ArrastoDaForma) => {
    const naGrade = formaNaGrade(tipo, arrasto);
    if (naGrade) {
      // Na grade de perspectiva: um caminho comum, com as tintas da barra
      const preenchimento = forma.preenchimento ?? { tipo: "cor" as const, cor: cores.primeiroPlano };
      const desenhada = camadaDosCaminhos(naGrade, preenchimento, forma.traco.tinta.tipo === "nenhuma" ? null : forma.traco);
      const base = NOME_DA_FORMA[tipo];
      const numero = (projeto?.faixas.filter((faixa) => faixa.nome?.startsWith(base)).length ?? 0) + 1;
      executar({ comando: "imagem.adicionarVetor", parametros: { vetor: desenhada.vetor, centro: desenhada.centro, nome: `${base} ${numero}`, acima: escolhidas[0]?.id ?? null } });
      return;
    }
    const { vetor, centro, naImagem } = formaDoArrasto(tipo, arrasto);
    if (forma.operacao !== "nova" && selecionado?.clipe.vetor) {
      executar({ comando: "imagem.juntarAoVetor", parametros: { clipeId: selecionado.clipe.id, caminhos: naImagem, operacao: forma.operacao } });
      return;
    }
    const variante = VARIANTE_DA_FERRAMENTA[ferramenta];
    const base = variante === "retanguloArredondado" ? "Retângulo arredondado" : variante === "estrela" ? "Estrela" : NOME_DA_FORMA[tipo];
    const numero = (projeto?.faixas.filter((faixa) => faixa.nome?.startsWith(base)).length ?? 0) + 1;
    executar({ comando: "imagem.adicionarVetor", parametros: { vetor, centro, nome: `${base} ${numero}`, acima: escolhidas[0]?.id ?? null } });
  };
  const caminhosDoDocumento = projetoNaTela?.caminhos ?? [];
  const caminhoDaVez = caminhoEscolhido ? (caminhosDoDocumento.find((caminho) => caminho.id === caminhoEscolhido) ?? null) : null;
  const ferramentaDeCaminho = FERRAMENTAS_DE_CAMINHO.has(ferramenta) ? (ferramenta as FerramentaDeCaminho) : null;
  // O que as ferramentas de caminho editam: o caminho escolhido no painel, ou o da camada de forma escolhida
  const mascaraEmEdicao = mascaraVetorialEmFoco && escolhidoNaTela?.clipe.id === mascaraVetorialEmFoco && escolhidoNaTela.clipe.mascara_vetorial ? escolhidoNaTela.clipe : null;
  const formaEmEdicao = !mascaraEmEdicao && !caminhoDaVez && escolhidoNaTela?.clipe.vetor ? escolhidoNaTela.clipe : null;
  const caminhosEditaveis = caminhoDaVez ? caminhoDaVez.subcaminhos : formaEmEdicao && projetoNaTela ? caminhosDoVetorNaImagem(formaEmEdicao, tamanhoDaImagem(projetoNaTela)) : null;
  const mudarCaminhos = (subcaminhos: Subcaminho[], provisorio: boolean) => {
    const atual = projetoRef.current;
    if (!atual) return;
    const comando: Comando | null = mascaraEmEdicao?.mascara_vetorial
      ? { comando: "imagem.mascaraVetorial", parametros: { clipeId: mascaraEmEdicao.id, mascara: { ...mascaraEmEdicao.mascara_vetorial, subcaminhos } } }
      : caminhoDaVez
      ? { comando: "imagem.caminhos", parametros: { caminhos: comCaminho(atual.caminhos ?? [], { ...caminhoDaVez, subcaminhos }) } }
      : formaEmEdicao
        ? { comando: "imagem.caminhosDoVetor", parametros: { clipeId: formaEmEdicao.id, caminhos: subcaminhos } }
        : null;
    if (!comando) return;
    if (provisorio) setProvisorio(comando);
    else {
      setProvisorio(null);
      executar(comando);
    }
  };
  /** Uma forma (camada vetorial) com os caminhos, nas tintas das formas. */
  const formaDosCaminhos = (subcaminhos: Subcaminho[]) => {
    const preenchimento = forma.preenchimento ?? { tipo: "cor" as const, cor: cores.primeiroPlano };
    const { vetor, centro } = camadaDosCaminhos(subcaminhos, preenchimento, forma.traco.tinta.tipo === "nenhuma" ? null : forma.traco);
    const numero = (projeto?.faixas.filter((faixa) => faixa.nome?.startsWith("Forma")).length ?? 0) + 1;
    executar({ comando: "imagem.adicionarVetor", parametros: { vetor, centro, nome: `Forma ${numero}`, acima: escolhidas[0]?.id ?? null } });
  };
  /** O caminho que uma caneta acabou de desenhar: uma forma (modo Forma) ou o caminho escolhido / de trabalho. */
  const criarCaminho = (sub: Subcaminho) => {
    const atual = projetoRef.current;
    if (!atual) return;
    // Com a máscara vetorial em foco, o caminho novo entra nela (já no espaço da máscara)
    if (mascaraEmEdicao?.mascara_vetorial) {
      const mascara = mascaraEmEdicao.mascara_vetorial;
      executar({ comando: "imagem.mascaraVetorial", parametros: { clipeId: mascaraEmEdicao.id, mascara: { ...mascara, subcaminhos: [...mascara.subcaminhos, { ...sub, operacao: mascara.base === "revelar" ? "subtrair" : "somar" }] } } });
      return;
    }
    if (caneta.modo === "forma") {
      if (forma.operacao !== "nova" && selecionado?.clipe.vetor && !caminhoDaVez) executar({ comando: "imagem.juntarAoVetor", parametros: { clipeId: selecionado.clipe.id, caminhos: [sub], operacao: forma.operacao } });
      else formaDosCaminhos([sub]);
      return;
    }
    if (!caminhoDaVez && formaEmEdicao) {
      // Com uma forma escolhida e nenhum caminho do painel, a caneta no modo Caminho soma na forma
      executar({ comando: "imagem.caminhosDoVetor", parametros: { clipeId: formaEmEdicao.id, caminhos: [...(caminhosEditaveis ?? []), sub] } });
      return;
    }
    const { caminhos, id } = porNoCaminho(atual.caminhos ?? [], caminhoEscolhido, sub, () => crypto.randomUUID().slice(0, 12));
    if (executar({ comando: "imagem.caminhos", parametros: { caminhos } })) setCaminhoEscolhido(id);
  };
  /** O retângulo (pixels do documento) do que as camadas ocupam, pelas caixas medidas na prévia. */
  const retanguloDasCamadas = (clipeIds: string[]): RetanguloDaImagem | null => {
    const atual = projetoRef.current;
    if (!atual) return null;
    const documento = tamanhoDaImagem(atual);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const id of clipeIds) {
      const medida = caixasRef.current.get(id);
      if (!medida?.bruta || !medida.quadro) continue;
      const fator = documento.largura / medida.quadro.largura;
      for (const canto of cantosDaCaixa(medida.bruta)) {
        x0 = Math.min(x0, canto.x * fator);
        y0 = Math.min(y0, canto.y * fator);
        x1 = Math.max(x1, canto.x * fator);
        y1 = Math.max(y1, canto.y * fator);
      }
    }
    return x1 > x0 ? { x: Math.floor(x0), y: Math.floor(y0), largura: Math.ceil(x1 - x0), altura: Math.ceil(y1 - y0) } : null;
  };
  /** Camada › Novo › Prancheta: uma nova (à direita das que já existem), a partir do grupo ou das camadas escolhidas. */
  const novaPrancheta = async (como: "nova" | "grupo" | "camadas", retangulo?: RetanguloDaImagem) => {
    const atual = projetoRef.current;
    if (!atual) return;
    const existentes = pranchetasDoProjeto(atual);
    const nome = `Prancheta ${existentes.length + 1}`;
    const fundo = { cor: "#ffffff", transparente: false };
    if (como === "nova") {
      // À direita da última prancheta (ou da tela, se ainda não há nenhuma), 100 px depois
      const direita = existentes.length ? Math.max(...existentes.map((item) => item.retangulo.x + item.retangulo.largura)) + 100 : 0;
      const lugar = retangulo ?? { x: direita, y: existentes.length ? Math.min(...existentes.map((item) => item.retangulo.y)) : 0, ...tamanhoDaPrancheta };
      executar({ comando: "imagem.adicionarPrancheta", parametros: { retangulo: lugar, nome, fundo, tamanhos: tamanhosDasMidias() } });
      return;
    }
    const faixas = como === "grupo" ? escolhidas.slice(0, 1) : escolhidas;
    const ids = faixas.flatMap((faixa) => comDescendentes(atual, faixa.id).flatMap((item) => (item.clipes[0] ? [item.clipes[0].id] : [])));
    // O retângulo do que as camadas desenham: a camada de pixels cobre o documento, mas a prancheta fica em volta do
    // conteúdo dela (como nos editores); sem conteúdo, a caixa das camadas
    let lugar = retanguloDasCamadas(ids) ?? { x: 0, y: 0, ...tamanhoDaImagem(atual) };
    try {
      await pinturas.esperar();
      const desenho = await exportarImagem(projetoSoCom(atual, faixas.map((faixa) => faixa.id)), midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros });
      const conteudo = caixaDoDesenho((await pixelsDoBlob(desenho)).canvas);
      if (conteudo) lugar = conteudo;
    } catch {
      // Sem o desenho, fica a caixa das camadas
    }
    if (projetoRef.current !== atual) return;
    if (como === "grupo") executar({ comando: "imagem.pranchetaDoGrupo", parametros: { faixaId: faixas[0].id, retangulo: lugar, fundo, tamanhos: tamanhosDasMidias() } });
    else executar({ comando: "imagem.pranchetaDeCamadas", parametros: { faixaIds: faixas.map((faixa) => faixa.id), retangulo: lugar, nome, fundo, tamanhos: tamanhosDasMidias() } });
  };
  /** A foto no quadro: cobrindo, sem zoom, no meio (as propriedades mudam depois). */
  const porFotoNoQuadro = (clipeId: string, midiaId: string) => {
    const clipe = projetoRef.current ? acharClipe(projetoRef.current, clipeId)?.clipe : null;
    if (!clipe?.vetor) return;
    executar({ comando: "imagem.mudarVetor", parametros: { clipeId, vetor: { ...clipe.vetor, preenchimento: { tipo: "imagem", midia_id: midiaId, ajuste: "cobrir", escala: 1, x: 0, y: 0 } } } });
  };
  /** Camada › Máscara vetorial (e as ações da miniatura e das propriedades dela). */
  const acaoMascaraVetorial = (acao: AcaoDaMascaraVetorial | "selecionar", clipeId = selecionado?.clipe.id, modo: ModoDaSelecao = "nova") => {
    const atual = projetoRef.current;
    if (!atual || !clipeId) return;
    const achado = acharClipe(atual, clipeId);
    const medida = caixasRef.current.get(clipeId);
    if (!achado) return;
    if (acao === "foco") return void setMascaraVetorialEmFoco(null);
    const documento = tamanhoDaImagem(atual);
    const mascara = achado.clipe.mascara_vetorial ?? null;
    const executarMascara = (nova: typeof mascara) => executar({ comando: "imagem.mascaraVetorial", parametros: { clipeId, mascara: nova } });
    if (acao === "revelar" || acao === "ocultar" || acao === "caminho") {
      if (!medida?.bruta || !medida.quadro) return void mostrarAviso("A camada ainda não apareceu na prévia. Tente de novo.");
      const caminhos = acao === "caminho" ? (caminhoDaVez?.subcaminhos ?? []) : [];
      if (acao === "caminho" && !caminhos.length) return void mostrarAviso("Escolha um caminho no painel Caminhos.");
      if (executarMascara(novaMascaraVetorial(acao === "revelar" ? "revelar" : "ocultar", caminhos, medida.bruta, medida.quadro))) setMascaraVetorialEmFoco(clipeId);
      return;
    }
    if (!mascara) return;
    if (acao === "excluir") {
      if (executarMascara(null)) setMascaraVetorialEmFoco(null);
    } else if (acao === "ligar") executarMascara({ ...mascara, ligada: !mascara.ligada });
    else if (acao === "inverter") executarMascara(inverterMascaraVetorial(mascara));
    else if (acao === "vincular") {
      if (!medida?.bruta || !medida.quadro) return;
      executarMascara(vincularMascaraVetorial(mascara, !mascara.vinculada, medida.bruta, medida.quadro, documento));
    } else if (acao === "selecionar") {
      if (!medida?.bruta || !medida.quadro) return;
      const lida = selecaoDoCanvas(canvasDaMascaraVetorial(caminhosDaMascaraNoDocumento(mascara, medida.bruta, medida.quadro, documento), mascara.base, documento), "cinza");
      setSelecaoDoDocumento(combinar(selecaoNoDocumento, lida, modo));
      setBordasDaSelecao(true);
    }
  };
  /** Selecionar › Converter em forma: os contornos da seleção viram uma camada de forma (a seleção sai). */
  const converterSelecaoEmForma = () => {
    if (!selecaoNoDocumento) return;
    const caminhos = caminhosDaMascara(selecaoNoDocumento, 1);
    if (!caminhos.length) return void mostrarAviso("A seleção não tem pixels selecionados mais da metade.");
    formaDosCaminhos(caminhos);
    setSelecaoDoDocumento(null);
  };
  /** A seleção dos caminhos (a região deles, com a borda suave). */
  const selecaoDosCaminhos = (subcaminhos: Subcaminho[]): Selecao | null => {
    const atual = projetoRef.current;
    if (!atual || !subcaminhos.some(temArea)) return null;
    const { largura, altura } = tamanhoDaImagem(atual);
    return selecaoDoCanvas(regiaoNoCanvas(subcaminhos, largura, altura), "alfa");
  };
  /** Ctrl+Enter: o caminho escolhido (ou o da forma) vira a seleção, com o modo (Shift soma, Alt subtrai). */
  const caminhoComoSelecao = (subcaminhos: Subcaminho[] | null = caminhosEditaveis, modo: ModoDaSelecao = "nova") => {
    const lida = subcaminhos ? selecaoDosCaminhos(subcaminhos) : null;
    if (!lida) return void mostrarAviso("O caminho precisa ter área (três pontos ou mais) para virar seleção.");
    setSelecaoDoDocumento(combinar(selecaoNoDocumento, lida, modo));
    setBordasDaSelecao(true);
  };
  /** Criar caminho de trabalho: os contornos da seleção num caminho de trabalho novo (a seleção sai, como lá). */
  const caminhoDaSelecao = (tolerancia: number) => {
    const atual = projetoRef.current;
    if (!atual || !selecaoNoDocumento) return;
    const subcaminhos = caminhosDaMascara(selecaoNoDocumento, tolerancia);
    if (!subcaminhos.length) return void mostrarAviso("A seleção não tem pixels selecionados mais da metade.");
    const id = crypto.randomUUID().slice(0, 12);
    const caminhos = [...(atual.caminhos ?? []).filter((caminho) => !caminho.trabalho), { id, nome: NOME_DO_TRABALHO, subcaminhos, trabalho: true }];
    if (executar({ comando: "imagem.caminhos", parametros: { caminhos } })) {
      setCaminhoEscolhido(id);
      setSelecaoDoDocumento(null);
    }
  };
  /** Traçar caminho: a ferramenta de pintura anda pelos componentes, na camada de pixels (ou numa nova). */
  const tracarCaminho = async (subcaminhos: Subcaminho[], qual: FerramentaDoTracado, simular: boolean) => {
    const tracos = tracosDoCaminho(subcaminhos, simular);
    if (!tracos.length || !tracos[0].length) return;
    const alvo = await alvoDaPintura(tracos[0][0], qual);
    const atual = projetoRef.current;
    if (!alvo || !atual) return;
    const documento = tamanhoDaImagem(atual);
    const achado = alvo.mascara ? null : acharClipe(atual, alvo.clipeId);
    const caixa = achado ? caixaDoClipe(achado.clipe.transformacao, achado.clipe.recorte, { largura: alvo.pintura.largura, altura: alvo.pintura.altura }, documento) : null;
    const mudou = tracarNoAlvo({ ...alvo, caixa }, tracos, { ferramenta: qual, opcoes: pinceis[qual], cores, documento, selecao: selecaoNoDocumento });
    pinturas.avisarQuadro();
    if (mudou) pinturas.soltar(alvo.chave);
  };
  const desenharForma = (arrasto: ArrastoDaForma, clique: boolean) => {
    const viva = FORMA_VIVA_DA_FERRAMENTA[ferramenta];
    if (viva) {
      if (clique) setCriandoForma({ tipo: viva, ponto: arrasto.de });
      else criarFormaViva(viva, arrasto);
      return;
    }
    if (ferramenta === "cota") {
      if (clique || !projeto) return;
      void criarCota(arrasto.de, arrasto.ate);
      return;
    }
    if (ferramenta === "reflexo") {
      // Um clique sem arrastar: os anéis vão para baixo e para a direita, a três diâmetros do meio
      const fim = clique ? { x: arrasto.de.x + opcoesDoReflexo.diametro * 2.1, y: arrasto.de.y + opcoesDoReflexo.diametro * 2.1 } : arrasto.ate;
      const camadas = camadasDoReflexo(arrasto.de, fim, opcoesDoReflexo).map((camada) => ({ ...camadaDosCaminhos(camada.caminhos, camada.preenchimento, null), nome: camada.nome, opacidade: camada.opacidade }));
      const numero = (projeto?.faixas.filter((faixa) => faixa.nome?.startsWith("Reflexo")).length ?? 0) + 1;
      executar({ comando: "imagem.adicionarReflexo", parametros: { camadas, nome: `Reflexo ${numero}`, acima: escolhidas[0]?.id ?? null } });
      return;
    }
    const gerador = GERADOR_DA_FERRAMENTA[ferramenta];
    if (gerador) {
      // Um clique sem arrastar: um quarto do lado menor da imagem a partir do ponto
      const lado = projeto ? Math.min(tamanhoDaImagem(projeto).largura, tamanhoDaImagem(projeto).altura) / 4 : 100;
      const ate = gerador === "espiral" || gerador === "segmento" ? { x: arrasto.x + lado, y: arrasto.y } : { x: arrasto.x + lado, y: arrasto.y + lado };
      porGerador(gerador, clique ? arrastoDaForma(arrasto.de, ate) : arrasto);
      return;
    }
    if (ferramenta === "quadro") {
      const lado = projeto ? Math.min(tamanhoDaImagem(projeto).largura, tamanhoDaImagem(projeto).altura) / 3 : 100;
      const caixa = clique ? arrastoDaForma({ x: arrasto.x - lado / 2, y: arrasto.y - lado / 2 }, { x: arrasto.x + lado / 2, y: arrasto.y + lado / 2 }) : arrasto;
      const { vetor, centro } = camadaDoArrasto(formaDoQuadro, caixa, { ...OPCOES_DAS_FORMAS_PADRAO, traco: { ...OPCOES_DAS_FORMAS_PADRAO.traco, tinta: { tipo: "nenhuma" } } }, cores.primeiroPlano);
      const numero = (projeto?.faixas.filter((faixa) => faixa.clipes[0]?.vetor?.quadro).length ?? 0) + 1;
      executar({ comando: "imagem.adicionarVetor", parametros: { vetor: { ...vetor, preenchimento: { tipo: "nenhuma" }, traco: null, quadro: true }, centro, nome: `Quadro ${numero}`, acima: escolhidas[0]?.id ?? null } });
      return;
    }
    if (ferramenta !== "formaPersonalizada") return;
    // Um clique sem arrastar: a forma com um quarto do lado menor da imagem, no ponto, na proporção dela
    const lado = projeto ? Math.min(tamanhoDaImagem(projeto).largura, tamanhoDaImagem(projeto).altura) / 4 : 100;
    porFormaPersonalizada(forma.personalizada, clique ? { x: arrasto.x - lado / 2, y: arrasto.y - lado / 2, largura: lado, altura: lado } : arrasto, clique || Boolean(arrasto.proporcional));
  };
  /** As duas formas escolhidas para Mesclar objetos, a de baixo primeiro. */
  const formasDaMescla = () => (projeto ? [...projeto.faixas].reverse().filter((faixa) => faixa.clipes[0]?.vetor && selecao.includes(faixa.clipes[0].id)).map((faixa) => faixa.clipes[0]) : []);
  const mesclarObjetos = (passos: number) => {
    const [de, ate] = formasDaMescla();
    if (!projeto || !de?.vetor || !ate?.vetor) return;
    const quadro = tamanhoDaImagem(projeto);
    const comoForma = (clipe: typeof de) => ({ caminhos: caminhosDoVetorNaImagem(clipe, quadro), preenchimento: clipe.vetor!.preenchimento, traco: clipe.vetor!.traco, opacidade: clipe.transformacao.opacidade });
    const meio = passosDaMescla(comoForma(de), comoForma(ate), passos);
    if (!meio.length) return void mostrarAviso("Essas formas não têm um contorno para mesclar.");
    executar({ comando: "imagem.mesclarObjetos", parametros: { de: de.id, ate: ate.id, passos: meio.map((passo) => ({ ...camadaDosCaminhos(passo.caminhos, passo.preenchimento, passo.traco), opacidade: passo.opacidade })) } });
  };
  /** A Cota: a linha com as setas (uma forma) e o número na escala de medida (um texto girado com ela), num grupo. */
  const criarCota = async (de: { x: number; y: number }, ate: { x: number; y: number }) => {
    if (!projeto) return;
    const { caminhos, meioDoTexto, giro } = geometriaDaCota(de, ate, opcoesDaCota);
    const traco = { ...TRACO_PADRAO, tinta: { tipo: "cor" as const, cor: opcoesDaCota.cor }, largura: opcoesDaCota.espessura, alinhamento: "centro" as const };
    const { vetor, centro } = camadaDosCaminhos(caminhos, { tipo: "cor", cor: opcoesDaCota.cor }, traco);
    const novo = textoNovo(textoDaCota(Math.hypot(ate.x - de.x, ate.y - de.y), projeto.escala_de_medida, opcoesDaCota.casas), { tamanho: opcoesDaCota.tamanhoDoTexto, cor: opcoesDaCota.cor }, "ponto");
    await esperarFontes([novo]);
    const texto = textoMedido({ ...novo, paragrafo: { ...novo.paragrafo, alinhamento: "centro" } });
    // O ponto do texto é o começo da linha de base: o meio da caixa fica no meio do número
    const ponto = { x: meioDoTexto.x - texto.caixa.largura / 2 + texto.origem.x, y: meioDoTexto.y - texto.caixa.altura / 2 + texto.origem.y };
    executar({ comando: "imagem.adicionarCota", parametros: { linha: vetor, centro, texto, ponto, giro, acima: escolhidas[0]?.id ?? null } });
  };
  /** As ferramentas de linha: caminhos comuns com o traço na cor de primeiro plano (e o fundo no preenchimento). */
  const porGerador = (gerador: GeradorDeCaminhos, arrasto: ArrastoDaForma) => {
    const caminhos = caminhosDoGerador(gerador, arrasto, opcoesDosGeradores);
    if (forma.operacao !== "nova" && selecionado?.clipe.vetor) {
      executar({ comando: "imagem.juntarAoVetor", parametros: { clipeId: selecionado.clipe.id, caminhos, operacao: forma.operacao } });
      return;
    }
    const traco = { ...TRACO_PADRAO, tinta: { tipo: "cor" as const, cor: cores.primeiroPlano }, largura: opcoesDosGeradores.espessura, alinhamento: "centro" as const };
    const preenchimento = opcoesDosGeradores.preencher && gerador !== "segmento" && gerador !== "espiral" ? { tipo: "cor" as const, cor: cores.fundo } : { tipo: "nenhuma" as const };
    const { vetor, centro } = camadaDosCaminhos(caminhos, preenchimento, traco);
    const base = NOME_DO_GERADOR[gerador];
    const numero = (projeto?.faixas.filter((faixa) => faixa.nome?.startsWith(base)).length ?? 0) + 1;
    executar({ comando: "imagem.adicionarVetor", parametros: { vetor, centro, nome: `${base} ${numero}`, acima: escolhidas[0]?.id ?? null } });
  };
  /**
   * Os pincéis e o lápis do editor vetorial: o traço (pixels da imagem) a cada movimento e no fim. O Suavizar e a
   * Borracha de caminho mostram o resultado enquanto andam e viram um passo ao soltar; os outros agem no fim.
   */
  const aoTracoLivre = (pontos: { x: number; y: number }[], final: boolean, escalaDaTela: number, reto: boolean) => {
    const perto = pincelVetorial.distancia / Math.max(1e-6, escalaDaTela);
    const editaveis = !mascaraEmEdicao && caminhosEditaveis?.length ? caminhosEditaveis : null;
    const nomeNovo = (base: string) => `${base} ${(projeto?.faixas.filter((faixa) => faixa.nome?.startsWith(base)).length ?? 0) + 1}`;
    const liquefazer = LIQUEFAZER_DA_FERRAMENTA[ferramenta];
    if (liquefazer) {
      if (pontos.length === 1) liquefazendo.current = editaveis ? comecarLiquefazer(editaveis, opcoesDoLiquefazer.raio) : null;
      const estado = liquefazendo.current;
      if (!estado) {
        if (final) mostrarAviso("Escolha uma forma (ou um caminho no painel Caminhos) para deformar.");
        return;
      }
      const agora = pontos[pontos.length - 1];
      const novo = passoDoLiquefazer(estado, liquefazer, agora, pontos[pontos.length - 2] ?? agora, opcoesDoLiquefazer);
      liquefazendo.current = final ? null : novo;
      // Sem tocar nenhum caminho, nada muda (a forma continua viva)
      if (!novo.pontos.some(Boolean)) return void (final && setProvisorio(null));
      mudarCaminhos(final ? terminarLiquefazer(novo) : caminhosDoLiquefazer(novo), !final);
      return;
    }
    if (ferramenta === "remodelar") {
      if (pontos.length === 1) baseDoTracoLivre.current = editaveis;
      const base = baseDoTracoLivre.current;
      if (!base) {
        if (final) mostrarAviso("Escolha uma forma (ou um caminho no painel Caminhos) para remodelar.");
        return;
      }
      const ultimo = pontos[pontos.length - 1];
      mudarCaminhos(remodelarCaminhos(base, pontos[0], { x: ultimo.x - pontos[0].x, y: ultimo.y - pontos[0].y }, pincelVetorial.alcance), !final);
      if (final) baseDoTracoLivre.current = null;
      return;
    }
    if (ferramenta === "suavizar" || ferramenta === "borrachaDeCaminho") {
      if (pontos.length === 1) baseDoTracoLivre.current = editaveis;
      const base = baseDoTracoLivre.current;
      if (!base) {
        if (final) mostrarAviso("Escolha uma forma (ou um caminho no painel Caminhos) para usar esta ferramenta.");
        return;
      }
      const novos = ferramenta === "suavizar" ? suavizarCaminhos(base, pontos, pincelVetorial.raio, pincelVetorial.suavidade) : apagarDoCaminho(base, pontos, pincelVetorial.raio);
      mudarCaminhos(novos, !final);
      if (final) baseDoTracoLivre.current = null;
      return;
    }
    if (!final) return;
    if (ferramenta === "tesoura") {
      if (!editaveis) return void mostrarAviso("Escolha uma forma (ou um caminho no painel Caminhos) para usar a Tesoura.");
      const cortados = cortarComTesoura(editaveis, pontos[pontos.length - 1], 7 / Math.max(1e-6, escalaDaTela));
      if (cortados) mudarCaminhos(cortados, false);
      else mostrarAviso("Clique em cima do caminho escolhido (não na ponta de um caminho aberto).");
      return;
    }
    if ((ferramenta === "faca" || ferramenta === "borrachaVetorial") && projeto) {
      // A forma escolhida, ou todas as formas à vista (as travadas não)
      const quadro = tamanhoDaImagem(projeto);
      const alvos = projeto.faixas
        .filter((faixa) => !faixa.oculta && !faixa.travas?.pixels && faixa.clipes[0]?.vetor && !faixa.clipes[0].vetor.quadro)
        .filter((faixa) => !formaEmEdicao || faixa.clipes[0].id === formaEmEdicao.id)
        .map((faixa) => ({ faixa, caminhos: caminhosDoVetorNaImagem(faixa.clipes[0], quadro) }));
      if (ferramenta === "faca") {
        const corte = regiaoDoCorte(reto ? [pontos[0], pontos[pontos.length - 1]] : pontos);
        const divisoes = alvos.flatMap(({ faixa, caminhos }) => {
          const pedacos = cortarComFaca(caminhos, corte);
          return pedacos ? [{ clipeId: faixa.clipes[0].id, pedacos }] : [];
        });
        if (divisoes.length) executar({ comando: "imagem.dividirFormas", parametros: { divisoes } });
        else mostrarAviso("Passe a Faca através de uma forma, de um lado ao outro.");
        return;
      }
      const area = reto ? regiaoDoRetangulo(pontos[0], pontos[pontos.length - 1]) : regiaoDaBolha(pontos, pincelVetorial.raio);
      const trocas: { clipeId: string; caminhos: Subcaminho[] }[] = [];
      const apagar: string[] = [];
      for (const { faixa, caminhos } of alvos) {
        const sobra = apagarArea(caminhos, area);
        if (!sobra) continue;
        if (sobra.length) trocas.push({ clipeId: faixa.clipes[0].id, caminhos: sobra });
        else apagar.push(faixa.id);
      }
      if (trocas.length || apagar.length) executar({ comando: "imagem.caminhosDasFormas", parametros: { trocas, apagar } });
      return;
    }
    if (ferramenta === "unir") {
      if (!editaveis) return void mostrarAviso("Escolha uma forma (ou um caminho no painel Caminhos) para usar esta ferramenta.");
      const unidos = unirCaminhos(editaveis, pontos, perto);
      if (unidos) mudarCaminhos(unidos, false);
      else mostrarAviso("Passe o Unir sobre duas pontas abertas do caminho escolhido.");
      return;
    }
    const tolerancia = toleranciaDaFidelidade(pincelVetorial.fidelidade);
    if (ferramenta === "pincelDeTraco" || ferramenta === "lapisVetorial") {
      const sub = caminhoLivre(pontos, tolerancia, pincelVetorial.fechar ? perto : 0);
      if (!sub) return;
      const continuado = pincelVetorial.editarSelecionados && editaveis ? continuarCaminho(editaveis, sub, perto) : null;
      if (continuado) return void mudarCaminhos(continuado, false);
      const pincel = ferramenta === "pincelDeTraco";
      const traco = { ...TRACO_PADRAO, tinta: { tipo: "cor" as const, cor: cores.primeiroPlano }, largura: pincelVetorial.espessura, alinhamento: "centro" as const, pontas: pincel ? ("redonda" as const) : ("reta" as const), cantos: pincel ? ("redondo" as const) : ("vivo" as const) };
      const { vetor, centro } = camadaDosCaminhos([sub], { tipo: "nenhuma" }, traco);
      executar({ comando: "imagem.adicionarVetor", parametros: { vetor, centro, nome: nomeNovo(pincel ? "Pincelada" : "Lápis"), acima: escolhidas[0]?.id ?? null } });
      return;
    }
    if (ferramenta === "pincelDeBolha") {
      const bolha = regiaoDaBolha(pontos, pincelVetorial.raioDaBolha);
      if (!bolha.length) return;
      const preenchimento = formaEmEdicao?.vetor?.preenchimento;
      const mesmaCor = Boolean(formaEmEdicao && !formaEmEdicao.vetor?.traco && preenchimento?.tipo === "cor" && preenchimento.cor.toLowerCase() === cores.primeiroPlano.toLowerCase());
      const juntos = pincelVetorial.mesclarBolha && mesmaCor && editaveis ? juntarBolha(editaveis, bolha, Math.max(0.35, tolerancia / 4)) : null;
      if (juntos) return void mudarCaminhos(juntos, false);
      const { vetor, centro } = camadaDosCaminhos(caminhosDaRegiaoEmCurvas(bolha, Math.max(0.35, tolerancia / 4)), { tipo: "cor", cor: cores.primeiroPlano }, null);
      executar({ comando: "imagem.adicionarVetor", parametros: { vetor, centro, nome: nomeNovo("Bolha"), acima: escolhidas[0]?.id ?? null } });
      return;
    }
    if (ferramenta !== "modelador" || !projeto) return;
    const reconhecida = reconhecerForma(pontos);
    if (!reconhecida) return void mostrarAviso("O Modelador não reconheceu a forma: desenhe uma linha, um retângulo, uma elipse, um triângulo ou um polígono.");
    if (reconhecida.tipo === "rabisco") {
      // As formas debaixo do rabisco (as que têm um quinto dos pontos dele por dentro): uma sai; várias viram uma
      const quadro = tamanhoDaImagem(projeto);
      const debaixo = projeto.faixas
        .filter((faixa) => !faixa.oculta && faixa.clipes[0]?.vetor && !faixa.clipes[0].vetor.quadro)
        .map((faixa) => ({ faixa, caminhos: caminhosDoVetorNaImagem(faixa.clipes[0], quadro) }))
        .filter(({ caminhos }) => {
          const regiao = regiaoDosCaminhos(caminhos);
          return pontos.filter((p) => pontoNaRegiao(regiao, p)).length >= pontos.length / 5;
        });
      if (!debaixo.length) return void mostrarAviso("O rabisco não passou sobre nenhuma forma.");
      if (debaixo.length === 1) return void executar({ comando: "imagem.apagar", parametros: { faixaId: debaixo[0].faixa.id } });
      const [primeira, ...outras] = debaixo;
      executar({ comando: "imagem.unirFormas", parametros: { clipeId: primeira.faixa.clipes[0].id, caminhos: outras.flatMap((item) => item.caminhos.filter((sub) => sub.fechado)), apagar: outras.map((item) => item.faixa.id) } });
      return;
    }
    if (reconhecida.tipo === "poligono") return void formaDosCaminhos([{ nos: reconhecida.pontos.map(({ x, y }) => ({ x, y })), fechado: true, operacao: "somar" }]);
    if (reconhecida.tipo === "linha") return void criarFormaViva("linha", arrastoDaForma(reconhecida.de, reconhecida.ate));
    const { x, y, largura, altura } = reconhecida.caixa;
    criarFormaViva(reconhecida.tipo, arrastoDaForma({ x, y }, { x: x + largura, y: y + altura }));
  };
  // O Construtor de formas e a Pintura viva: as formas escolhidas (de baixo para cima) e as faces delas
  const construindo = ferramenta === "construtorDeFormas" || ferramenta === "pinturaViva";
  const formasDoConstrutor = useMemo(() => {
    if (!construindo || !projetoNaTela) return [];
    const quadro = tamanhoDaImagem(projetoNaTela);
    return [...projetoNaTela.faixas]
      .reverse()
      .filter((faixa) => !faixa.oculta && faixa.clipes[0]?.vetor && !faixa.clipes[0].vetor.quadro && selecao.includes(faixa.clipes[0].id))
      .map((faixa) => ({ clipeId: faixa.clipes[0].id, faixaId: faixa.id, caminhos: caminhosDoVetorNaImagem(faixa.clipes[0], quadro) }));
  }, [construindo, projetoNaTela, selecao]);
  const facesDoConstrutor = useMemo(() => facesDasFormas(formasDoConstrutor.map((forma) => forma.caminhos)), [formasDoConstrutor]);
  const construirFormas = (juntar: number[], apagar: number[], cor?: string) => {
    const pecas = construirPecas(facesDoConstrutor, juntar, apagar);
    executar({
      comando: "imagem.construirFormas",
      parametros: {
        apagar: formasDoConstrutor.map((forma) => forma.faixaId),
        // Na pintura, a peça da face pintada (a última) leva a cor
        pecas: pecas.map((peca, i) => ({ origem: formasDoConstrutor[peca.origem].clipeId, caminhos: peca.caminhos, ...(cor && i === pecas.length - 1 ? { cor } : {}) })),
      },
    });
  };
  /** A grade de perspectiva: mudar (provisório enquanto arrasta uma alça) e a Seleção de perspectiva. */
  const mudarGrade = (grade: GradeDePerspectiva | null, provisorio: boolean, nome = "mudar a grade de perspectiva") => {
    const comando: Comando = { comando: "imagem.perspectiva", parametros: { grade, nome } };
    if (provisorio) setProvisorio(comando);
    else {
      setProvisorio(null);
      executar(comando);
    }
  };
  const levarParaOPlano = (plano: PlanoDaPerspectiva, a: number, b: number) => {
    const grade = projetoNaTela?.perspectiva;
    const atual = projetoRef.current;
    if (!grade || !atual || !selecionado) return void mostrarAviso("Escolha a camada que vai para o plano.");
    const achado = acharClipe(atual, selecionado.clipe.id);
    if (!achado) return;
    if (achado.clipe.vetor) {
      // A forma continua vetorial: cada ponto da caixa dela vai para o lugar no plano
      const caminhos = caminhosDoVetorNaImagem(achado.clipe, tamanhoDaImagem(atual));
      const caixa = caixaDosCaminhos(caminhos);
      if (!caixa) return;
      const altura = caixa.y1 - caixa.y0;
      const espelhar = plano === "esquerdo" && grade.tipo !== 1;
      const levar = (x: number, y: number) => ({ x: espelhar ? a - (x - caixa.x0) : a + (x - caixa.x0), y: b + altura - (y - caixa.y0) });
      const noPlanoDaGrade = caminhos.map((sub) => ({
        ...sub,
        nos: sub.nos.map((no) => {
          const p = levar(no.x, no.y);
          const saida: Subcaminho["nos"][number] = { x: p.x, y: p.y };
          if (no.ex !== undefined && no.ey !== undefined) Object.assign(saida, (({ x, y }) => ({ ex: x, ey: y }))(levar(no.ex, no.ey)));
          if (no.sx !== undefined && no.sy !== undefined) Object.assign(saida, (({ x, y }) => ({ sx: x, sy: y }))(levar(no.sx, no.sy)));
          return saida;
        }),
      }));
      executar({ comando: "imagem.caminhosDoVetor", parametros: { clipeId: achado.clipe.id, caminhos: caminhosDoPlano(grade, plano, noPlanoDaGrade) } });
      return;
    }
    // As outras camadas vão pelos pixels (como a Transformação livre), do retângulo delas para o plano
    void comecarTransformacaoDaCamada({
      imediata: (q) => {
        const largura = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y);
        const altura = Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y);
        return { quad: cantosNoPlano(grade, plano, a, b, largura, altura) as Quadrilatero, malha: null };
      },
    });
  };
  /** A Largura do traço: o perfil novo no traço da forma escolhida (a margem da caixa acompanha o maior lado). */
  const mudarPerfilDoTraco = (perfil: PontoDeLargura[], provisorio: boolean) => {
    const clipe = formaEmEdicao;
    if (!clipe?.vetor?.traco) return;
    const original = projetoRef.current ? acharClipe(projetoRef.current, clipe.id)?.clipe.vetor : null;
    if (!original?.traco) return;
    const comando: Comando = { comando: "imagem.mudarVetor", parametros: { clipeId: clipe.id, vetor: refazerForma(original, { traco: { ...original.traco, perfil: perfil.length ? perfil : null } }) } };
    if (provisorio) setProvisorio(comando);
    else {
      setProvisorio(null);
      executar(comando);
    }
  };
  /** As camadas que Girar, Refletir, Escalar e Inclinar levam: as escolhidas, as de dentro das pastas e as vinculadas. */
  const alvosDaTransformacao = (() => {
    if (!projetoNaTela || !FERRAMENTAS_DE_TRANSFORMAR.has(ferramenta)) return [];
    return comVinculadas(projetoNaTela, selecaoValida).filter((id) => {
      const achado = acharClipe(projetoNaTela, id);
      return achado && !achado.clipe.pasta && !achado.clipe.ajuste && !achado.faixa.travas?.posicao && !camadaTravada(projetoNaTela, achado.faixa);
    });
  })();
  /**
   * Leva as camadas pela afim: a posição delas quando é só girar, refletir ou escalar por igual; as formas pelos pontos;
   * uma camada só que não é forma, pelos pixels (como a Transformação livre).
   */
  const aplicarAfimNasCamadas = (afim: AfimDaFerramenta, copiar: boolean) => {
    const atual = projetoRef.current;
    if (!atual || !alvosDaTransformacao.length) return void mostrarAviso("Escolha as camadas que vai transformar.");
    const semelhante = posicaoPelaAfim(afim, { x: 0, y: 0 }, 1, 0) !== null;
    const naoFormas = alvosDaTransformacao.filter((id) => !acharClipe(atual, id)?.clipe.vetor);
    if (!semelhante && naoFormas.length) {
      if (alvosDaTransformacao.length === 1 && selecionado?.clipe.id === alvosDaTransformacao[0]) {
        void comecarTransformacaoDaCamada({ copia: copiar, imediata: (q) => ({ quad: q.map((p) => aplicarAfim(afim, p)) as Quadrilatero, malha: null }) });
        return;
      }
      return void mostrarAviso("Esticar e inclinar várias camadas juntas só vale nas formas: transforme as outras uma de cada vez.");
    }
    executar({ comando: "imagem.transformarCamadas", parametros: { clipeIds: alvosDaTransformacao, afim, copiar } });
  };
  /** A forma personalizada escolhida na caixa (com as tintas e a operação da barra). */
  const porFormaPersonalizada = (id: string, caixa: RetanguloDaImagem, proporcional: boolean) => {
    const escolhida = caminhosDaFormaPersonalizada(id, formasDoEspaco);
    if (!escolhida) return void mostrarAviso("Essa forma não existe mais. Escolha outra no painel Formas.");
    const caminhos = caminhosNaCaixa(escolhida.caminhos, caixa, proporcional);
    if (forma.operacao !== "nova" && selecionado?.clipe.vetor) {
      executar({ comando: "imagem.juntarAoVetor", parametros: { clipeId: selecionado.clipe.id, caminhos, operacao: forma.operacao } });
      return;
    }
    const preenchimento = forma.preenchimento ?? { tipo: "cor" as const, cor: cores.primeiroPlano };
    const { vetor, centro } = camadaDosCaminhos(caminhos, preenchimento, forma.traco.tinta.tipo === "nenhuma" ? null : forma.traco);
    const numero = (projeto?.faixas.filter((faixa) => faixa.nome?.startsWith(escolhida.nome)).length ?? 0) + 1;
    executar({ comando: "imagem.adicionarVetor", parametros: { vetor, centro, nome: `${escolhida.nome} ${numero}`.slice(0, 60), acima: escolhidas[0]?.id ?? null } });
  };
  /** Editar › Definir forma personalizada: os caminhos da forma (ou do caminho) escolhida viram uma forma do espaço. */
  const definirFormaPersonalizada = (nome: string) => {
    const caminhos = caminhosEditaveis?.filter((sub) => sub.nos.length >= 2) ?? [];
    if (!caminhos.length) return void mostrarAviso("Escolha uma camada de forma ou um caminho.");
    criarRecurso({ tipo: "forma", nome, dados: { subcaminhos: normalizarParaFormaPersonalizada(caminhos) } })
      .then((recurso) => {
        recursosDasFormas.recarregar();
        setForma((atual) => ({ ...atual, personalizada: `espaco:${recurso.id}` }));
        mostrarAviso(`A forma "${nome}" está no painel Formas e na ferramenta Forma personalizada.`);
      })
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível guardar a forma."));
  };
  const aplicarFiltro = (efeito: TipoEfeito) => {
    if (!selecionado) return;
    if (executar({ comando: "clipe.efeito", parametros: { clipeIds: [selecionado.clipe.id], efeito: { tipo: efeito, intensidade: INTENSIDADE_PADRAO } } })) area.abrir("filtros");
  };
  const mudarZoom = (para: "mais" | "menos" | "ajustar" | 1) => setZoom(para === "ajustar" ? null : para === 1 ? 1 : proximoZoom(zoom ?? zoomMedido, para === "mais" ? 1 : -1));
  /** Uma camada de pixels vazia, do tamanho da imagem, acima da escolhida. Devolve o clipe dela. */
  const novaCamada = async (): Promise<string | null> => {
    if (!projeto) return null;
    const { largura, altura } = tamanhoDaImagem(projeto);
    const numero = projeto.faixas.filter((faixa) => faixa.clipes[0]?.pixels).length + 1;
    const nome = `Camada ${numero}`;
    try {
      const midia = await criarCamadaDePixels(largura, altura, nome);
      setCriadas((atual) => new Map([...atual, [midia.id, midia]]));
      void biblioteca.recarregar();
      const acima = escolhidas[0]?.id ?? null;
      const resultado = executar({ comando: "imagem.adicionarPixels", parametros: { midiaId: midia.id, nome, acima } });
      // Quem pinta logo em seguida procura a camada nova antes da tela desenhar de novo
      if (resultado) projetoRef.current = resultado.projeto;
      return resultado?.selecao?.[0] ?? null;
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível criar a camada.");
      return null;
    }
  };
  /**
   * A camada do traço: a de pixels escolhida, ou uma nova acima da escolhida (como pintar numa foto ou num texto não
   * muda a foto nem o texto). As travas de tudo e de pixels recusam; a de transparência só segura o alfa.
   */
  /** O projeto do estado marcado como fonte no Histórico (o de abertura, se o passo marcado não existe mais). */
  const projetoDaFonte = (): Projeto | null => {
    if (fonteDoHistorico.startsWith("instantaneo:")) {
      const instantaneo = instantaneos.find((item) => `instantaneo:${item.id}` === fonteDoHistorico);
      if (instantaneo) return instantaneo.projeto;
    }
    const passo = Number(fonteDoHistorico.replace("passo:", ""));
    return edicao.projetoDoPasso(Number.isFinite(passo) ? passo : 0) ?? edicao.projetoDoPasso(0);
  };
  /**
   * A camada como estava na fonte do pincel do histórico, do tamanho dela: a versão de então (a mesma mídia), ou a
   * camada de então desenhada sozinha (um texto antes de rasterizar), quando a camada de agora cobre o quadro.
   */
  const fonteDoHistoricoPara = async (clipe: Clipe, tamanhoDaCamada: { largura: number; altura: number }): Promise<HTMLCanvasElement | null> => {
    const origem = projetoDaFonte();
    const naFonte = origem ? acharClipe(origem, clipe.id) : null;
    const canvas = document.createElement("canvas");
    canvas.width = tamanhoDaCamada.largura;
    canvas.height = tamanhoDaCamada.altura;
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true })!;
    if (!naFonte) return canvas;
    if (naFonte.clipe.pixels && naFonte.clipe.midia_id === clipe.midia_id) {
      if (naFonte.clipe.pixels.versao > 0) ctx2d.drawImage(await carregarBitmap(arquivoDaMidia(clipe.midia_id!, arquivoDaVersao(naFonte.clipe.pixels.versao))), 0, 0, canvas.width, canvas.height);
      return canvas;
    }
    const t = clipe.transformacao;
    if (Math.abs(t.x) > 1e-6 || Math.abs(t.y) > 1e-6 || Math.abs(t.escala - 1) > 1e-6 || Math.abs(t.rotacao) > 1e-6) {
      mostrarAviso("A camada mudou de lugar desde aquele estado: o pincel do histórico não acha o que estava lá.");
      return null;
    }
    const sozinha = projetoSoCom(origem!, [naFonte.faixa.id], { neutras: new Set([naFonte.faixa.id]), semEstilo: true, semMascara: true });
    const imagem = await createImageBitmap(await exportarImagem(sozinha, midias, { formato: "png" }));
    ctx2d.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    imagem.close();
    return canvas;
  };
  /** A imagem de onde o carimbo copia, no documento: a camada (pelo motor dela), a camada e as de baixo, ou todas. */
  const imagemDaAmostra = async (clipe: Clipe, pintura: Pintura, tamanho: { largura: number; altura: number }, forcada?: "atual" | "atualEAbaixo" | "todas"): Promise<HTMLCanvasElement> => {
    const atual = projetoRef.current!;
    const documento = tamanhoDaImagem(atual);
    const canvas = document.createElement("canvas");
    canvas.width = documento.largura;
    canvas.height = documento.altura;
    const ctx2d = canvas.getContext("2d")!;
    // Numa camada de pixels ainda vazia (a que nasce ao carimbar sobre uma foto), a camada atual não tem o que copiar
    const pedida = forcada ?? opcoesDoCarimbo.amostra;
    const amostra = pedida === "atual" && clipe.pixels?.versao === 0 ? "atualEAbaixo" : pedida;
    if (amostra === "atual") {
      ctx2d.setTransform(...matrizDaCamada(clipe, tamanho, documento));
      ctx2d.drawImage(pintura.camada, 0, 0);
      return canvas;
    }
    let projetoDaAmostra = atual;
    if (amostra === "atualEAbaixo") {
      // As camadas acima da escolhida ficam escondidas
      const ordem = faixasEmOrdem(atual);
      const indice = ordem.findIndex((faixa) => faixa.clipes[0]?.id === clipe.id);
      const acima = new Set(ordem.slice(0, Math.max(0, indice)).map((faixa) => faixa.id));
      projetoDaAmostra = { ...atual, faixas: atual.faixas.map((faixa) => (acima.has(faixa.id) ? { ...faixa, oculta: true } : faixa)) };
    }
    const imagem = await createImageBitmap(await exportarImagem(projetoDaAmostra, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }));
    ctx2d.drawImage(imagem, 0, 0, documento.largura, documento.altura);
    imagem.close();
    return canvas;
  };
  /** O que o carimbo pinta, no documento: a fonte levada ao destino (o deslocamento, a escala e o giro). */
  const fonteTransformada = (imagem: CanvasImageSource, fonte: FonteDeClonagem, deslocamento: { x: number; y: number }, documento: { largura: number; altura: number }) => {
    const canvas = document.createElement("canvas");
    canvas.width = documento.largura;
    canvas.height = documento.altura;
    const ctx2d = canvas.getContext("2d")!;
    ctx2d.translate(fonte.ponto.x + deslocamento.x, fonte.ponto.y + deslocamento.y);
    ctx2d.rotate((opcoesDoCarimbo.angulo * Math.PI) / 180);
    ctx2d.scale(opcoesDoCarimbo.escalaX, opcoesDoCarimbo.escalaY);
    ctx2d.translate(-fonte.ponto.x, -fonte.ponto.y);
    ctx2d.drawImage(imagem, 0, 0);
    return canvas;
  };
  /**
   * A fonte da tinta do carimbo na camada (do tamanho dela): o padrão ladrilhado (alinhado ao documento, ou ao começo
   * do traço), ou a amostra copiada da fonte de clonagem pelo deslocamento (alinhado: o do primeiro traço; senão, o
   * deste traço).
   */
  const fonteDoCarimbo = async (inicio: { x: number; y: number }, clipe: Clipe, pintura: Pintura, tamanho: { largura: number; altura: number }): Promise<HTMLCanvasElement | null> => {
    const documento = tamanhoDaImagem(projetoRef.current!);
    const naCamada = (doc: HTMLCanvasElement) => {
      const saida = document.createElement("canvas");
      saida.width = tamanho.largura;
      saida.height = tamanho.altura;
      const ctx2d = saida.getContext("2d")!;
      ctx2d.setTransform(...inverter(matrizDaCamada(clipe, tamanho, documento)));
      ctx2d.drawImage(doc, 0, 0);
      return saida;
    };
    if (ferramenta === "carimboDePadrao") {
      await esperarLadrilho(opcoesDoCarimbo.padrao);
      const doc = document.createElement("canvas");
      doc.width = documento.largura;
      doc.height = documento.altura;
      const ctx2d = doc.getContext("2d")!;
      const padrao = ctx2d.createPattern(ladrilhoDoPadrao(opcoesDoCarimbo.padrao, cores.primeiroPlano, cores.fundo), "repeat")!;
      if (!opcoesDoCarimbo.alinhado) padrao.setTransform(new DOMMatrix().translate(inicio.x, inicio.y));
      ctx2d.fillStyle = padrao;
      ctx2d.fillRect(0, 0, documento.largura, documento.altura);
      return naCamada(doc);
    }
    const fonte = fontesDeClonagem[fonteAtiva];
    if (!fonte) {
      mostrarAviso("Marque de onde copiar: Alt + clique com o carimbo.");
      return null;
    }
    const deslocamento = opcoesDoCarimbo.alinhado && fonte.deslocamento ? fonte.deslocamento : { x: inicio.x - fonte.ponto.x, y: inicio.y - fonte.ponto.y };
    setFontesDeClonagem((atual) => atual.map((item, i) => (i === fonteAtiva && item ? { ...item, deslocamento } : item)));
    return naCamada(fonteTransformada(await imagemDaAmostra(clipe, pintura, tamanho), fonte, deslocamento, documento));
  };
  // A sobreposição da fonte de clonagem: a imagem inteira levada pelo deslocamento da fonte da vez
  const fonteDaVez = fontesDeClonagem[fonteAtiva];
  const chaveDaSobreposicao = ferramenta === "carimbo" && opcoesDoCarimbo.sobreposicao && fonteDaVez?.deslocamento ? JSON.stringify([fonteDaVez, opcoesDoCarimbo.escalaX, opcoesDoCarimbo.escalaY, opcoesDoCarimbo.angulo]) : null;
  const lerSobreposicao = useEffectEvent((vivo: { atual: boolean }) => {
    const fonte = fontesDeClonagem[fonteAtiva];
    if (!fonte?.deslocamento || !projeto) return;
    const deslocamento = fonte.deslocamento;
    imagemParaSelecao(true)
      .then((imagem) => {
        const canvas = document.createElement("canvas");
        canvas.width = imagem.largura;
        canvas.height = imagem.altura;
        canvas.getContext("2d")!.putImageData(new ImageData(Uint8ClampedArray.from(imagem.dados), imagem.largura, imagem.altura), 0, 0);
        if (vivo.atual) setSobreposicaoDaFonte(fonteTransformada(canvas, fonte, deslocamento, tamanhoDaImagem(projeto)));
      })
      .catch(() => undefined);
  });
  useEffect(() => {
    if (!chaveDaSobreposicao) return;
    const vivo = { atual: true };
    lerSobreposicao(vivo);
    return () => {
      vivo.atual = false;
    };
  }, [chaveDaSobreposicao]);
  /** Um canvas do documento levado à camada (do tamanho dela), pela matriz inversa da caixa. */
  const documentoNaCamada = (doc: CanvasImageSource, clipe: Clipe, tamanho: { largura: number; altura: number }) => {
    const saida = document.createElement("canvas");
    saida.width = tamanho.largura;
    saida.height = tamanho.altura;
    const ctx2d = saida.getContext("2d", { willReadFrequently: true })!;
    ctx2d.setTransform(...inverter(matrizDaCamada(clipe, tamanho, tamanhoDaImagem(projetoRef.current!))));
    ctx2d.drawImage(doc, 0, 0);
    return saida;
  };
  const pixelsDe = (canvas: HTMLCanvasElement) => canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
  /**
   * Um pincel de recuperação soltou: a área do traço é refeita (o de manchas, pelo que está em volta na amostra; o de
   * recuperação, com a fonte colada sem emenda, agora que se sabe onde o traço acabou) e entra na camada.
   */
  const refazerManchas = () => {
    const m = manchas.current;
    manchas.current = null;
    if (!m) return;
    const mascara = m.pintura.mascaraDoUltimoTraco();
    const ctx2d = m.pintura.camada.getContext("2d", { willReadFrequently: true })!;
    if (!mascara) {
      ctx2d.putImageData(m.antes, 0, 0);
      pinturas.avisarQuadro();
      return;
    }
    const largura = m.pintura.largura;
    const altura = m.pintura.altura;
    let refeita = Uint8ClampedArray.from(m.amostra.data);
    // Por proximidade, o lugar parecido mais perto; sensível ao conteúdo, mais longe; criar textura, a membrana com o grão
    const jeito = opcoesDasManchas.tipo === "textura" ? "textura" : "remendo";
    if (m.fonte) refeita = colarSemEmenda(m.amostra.data, m.fonte.data, largura, altura, Uint8Array.from(mascara, (v) => (v > 8 ? 255 : 0)));
    else preencherBuraco(refeita, largura, altura, Uint8Array.from(mascara, (v) => (v > 8 ? 1 : 0)), { jeito, alcance: opcoesDasManchas.tipo === "sensivel" ? 6 : 2 });
    const saida = Uint8ClampedArray.from(m.antes.data);
    // Onde o traço passou, a área refeita entra na força do traço (o resto da camada fica como estava)
    for (let i = 0; i < mascara.length; i++) {
      const a = mascara[i] / 255;
      if (!a) continue;
      const aa = saida[i * 4 + 3] / 255;
      const ar = refeita[i * 4 + 3] / 255;
      const alfa = aa * (1 - a) + ar * a;
      for (let c = 0; c < 3; c++) saida[i * 4 + c] = alfa > 0 ? Math.round((saida[i * 4 + c] * aa * (1 - a) + refeita[i * 4 + c] * ar * a) / alfa) : 0;
      saida[i * 4 + 3] = Math.round(alfa * 255);
    }
    ctx2d.putImageData(new ImageData(saida, largura, altura), 0, 0);
    pinturas.soltar(m.chave);
    pinturas.avisarQuadro();
  };
  /** O pincel de manchas numa foto, sensível ao conteúdo: o traço vira a seleção que a IA refaz (a foto é trocada). */
  const refazerManchasComIa = () => {
    const motor = motorDasManchas;
    setMotorDasManchas(null);
    const mascara = motor?.pintura.mascaraDoUltimoTraco();
    if (!motor || !mascara || !projeto) return;
    const documento = tamanhoDaImagem(projeto);
    const selecao: Selecao = { largura: documento.largura, altura: documento.altura, dados: Uint8Array.from(mascara, (v) => (v > 8 ? 255 : 0)) };
    const pincel = selecaoNaFoto(selecao);
    if (!pincel) return mostrarAviso("A foto ainda não apareceu na prévia. Tente de novo.");
    setPedindo(true);
    objeto
      .pedir("apagar", pincel)
      .then((midia) => {
        if (!midia) return;
        esperarMidia(midia, { trocar: [motor.clipeId] });
        mostrarAviso("Refazendo a mancha: a foto troca quando ficar pronta.");
      })
      .finally(() => setPedindo(false));
  };
  /** A Correção: a área da seleção (de origem) ou a do destino é refeita com a textura da outra, no tom do lugar. */
  const aplicarCorrecao = async (dx: number, dy: number) => {
    const selecao = selecaoNoDocumento;
    if (!selecao || (!dx && !dy) || !projeto) return;
    try {
      const imagem = await imagemParaSelecao(!selecionado?.clipe.pixels);
      const { largura, altura } = imagem;
      // A fonte deslocada: na de origem, cada ponto da seleção pega o ponto para onde ela foi arrastada; na de
      // destino, cada ponto do destino pega o da seleção
      const sinal = modoDaCorrecao === "origem" ? 1 : -1;
      const fonte = new Uint8ClampedArray(imagem.dados.length);
      for (let y = 0; y < altura; y++) {
        const ys = Math.min(altura - 1, Math.max(0, y + sinal * dy));
        for (let x = 0; x < largura; x++) {
          const xs = Math.min(largura - 1, Math.max(0, x + sinal * dx));
          const i = (y * largura + x) * 4;
          const j = (ys * largura + xs) * 4;
          for (let c = 0; c < 4; c++) fonte[i + c] = imagem.dados[j + c];
        }
      }
      // A região refeita: a seleção, ou ela levada ao destino
      let regiao = selecao;
      if (modoDaCorrecao === "destino") {
        regiao = vazia(largura, altura);
        for (let y = 0; y < altura; y++) {
          const ys = y - dy;
          if (ys < 0 || ys >= altura) continue;
          for (let x = 0; x < largura; x++) {
            const xs = x - dx;
            if (xs >= 0 && xs < largura) regiao.dados[y * largura + x] = selecao.dados[ys * largura + xs];
          }
        }
      }
      const corrigida = colarSemEmenda(imagem.dados as Uint8ClampedArray, fonte, largura, altura, regiao.dados);
      const doc = document.createElement("canvas");
      doc.width = largura;
      doc.height = altura;
      doc.getContext("2d")!.putImageData(new ImageData(corrigida, largura, altura), 0, 0);
      await editarPixels(
        (dados, cobertura, camada) => preencherPixels(dados, camada.largura, cobertura, pixelsDe(documentoNaCamada(doc, camada.clipe, camada)).data, { modo: "normal", opacidade: 1, preservar: false }),
        { criar: true, selecao: regiao },
      );
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível corrigir.");
    }
  };
  const alvoDaPintura = async (inicio: { x: number; y: number }, qual: IdFerramentaDaImagem = ferramenta): Promise<Omit<AlvoDaPintura, "caixa"> | null> => {
    const atual = projetoRef.current;
    if (!atual) return null;
    // O pincel de manchas numa foto, sensível ao conteúdo: o traço vai num motor do documento só para virar a
    // seleção que a IA refaz (a foto é trocada, sem camada nova)
    if (qual === "recuperacaoParaManchas" && opcoesDasManchas.tipo === "sensivel" && selecionado && !selecionado.clipe.pixels && foto) {
      const { largura, altura } = tamanhoDaImagem(atual);
      const pintura = new Pintura(largura, altura);
      setMotorDasManchas({ pintura, clipeId: selecionado.clipe.id });
      return { clipeId: "#manchas", chave: "#manchas", pintura, mascara: { vinculada: false, matriz: IDENTIDADE }, recorte: { x: 0, y: 0, largura: 1, altura: 1 }, virar: null, travarTransparencia: false };
    }
    // Na máscara rápida, todo pincel pinta a seleção (do tamanho do documento, parada no lugar)
    if (mascaraRapida) {
      return { clipeId: CHAVE_DA_MASCARA_RAPIDA, chave: CHAVE_DA_MASCARA_RAPIDA, pintura: mascaraRapida, mascara: { vinculada: false, matriz: IDENTIDADE }, recorte: { x: 0, y: 0, largura: 1, altura: 1 }, virar: null, travarTransparencia: true };
    }
    // Com um canal alfa à vista, o pincel pinta nele, em cinza
    const canal = canalAtivo ? (atual.canais ?? []).find((item) => item.id === canalAtivo) : undefined;
    if (canal) {
      const alvo = alvoDoCanal(canal);
      try {
        const pintura = await pinturas.preparar(alvo, tamanhoDaImagem(atual));
        return { clipeId: alvo.chave, chave: alvo.chave, pintura, mascara: { vinculada: false, matriz: IDENTIDADE }, recorte: { x: 0, y: 0, largura: 1, altura: 1 }, virar: null, travarTransparencia: true };
      } catch {
        mostrarAviso("Não foi possível abrir o canal para pintar. Tente de novo.");
        return null;
      }
    }
    // Os pincéis do histórico pintam na camada de pixels escolhida, com ela como estava na fonte
    if (qual === "historico" || qual === "historicoArtistico") {
      const achado = selecionado?.clipe.pixels ? acharClipe(atual, selecionado.clipe.id) : null;
      if (!achado?.clipe.midia_id || !achado.clipe.pixels) {
        mostrarAviso("Escolha uma camada de pixels para pintar com o histórico.");
        return null;
      }
      if (camadaTravada(atual, achado.faixa) || achado.faixa.travas?.pixels) {
        mostrarAviso("A camada está travada.");
        return null;
      }
      const alvo = alvoDosPixels(achado.clipe)!;
      const tamanhoDaCamada = midias.get(achado.clipe.midia_id)?.camada_pixels ?? tamanhoDaImagem(atual);
      try {
        const [pintura, fonteDaTinta] = await Promise.all([pinturas.preparar(alvo, tamanhoDaCamada), fonteDoHistoricoPara(achado.clipe, tamanhoDaCamada)]);
        if (!fonteDaTinta) return null;
        return { clipeId: achado.clipe.id, chave: alvo.chave, pintura, recorte: achado.clipe.recorte, virar: achado.clipe.virar, travarTransparencia: Boolean(achado.faixa.travas?.transparencia), fonteDaTinta };
      } catch {
        mostrarAviso("Não foi possível abrir a camada para pintar. Tente de novo.");
        return null;
      }
    }
    // A máscara dos filtros inteligentes em foco: o pincel pinta nela, como na máscara da camada
    if (selecionado && mascaraDosFiltrosEmFoco === selecionado.clipe.id && selecionado.clipe.filtros_inteligentes?.mascara) {
      const achado = acharClipe(atual, selecionado.clipe.id);
      const mascara = achado?.clipe.filtros_inteligentes?.mascara;
      const alvo = achado ? alvoDaMascaraDosFiltros(achado.clipe) : null;
      if (!achado || !mascara || !alvo) return null;
      if (camadaTravada(atual, achado.faixa) || achado.faixa.travas?.pixels) {
        mostrarAviso("A camada está travada. Destrave para pintar a máscara dos filtros.");
        return null;
      }
      try {
        const pintura = await pinturas.preparar(alvo, tamanhoDaImagem(atual));
        return { clipeId: achado.clipe.id, chave: alvo.chave, pintura, recorte: achado.clipe.recorte, virar: achado.clipe.virar, travarTransparencia: true, mascara };
      } catch {
        mostrarAviso("Não foi possível abrir a máscara dos filtros para pintar. Tente de novo.");
        return null;
      }
    }
    // A máscara em foco (Ctrl+\ ou o clique na miniatura dela): o pincel pinta a máscara em tons de cinza
    if (selecionado && mascaraEmFoco === selecionado.clipe.id && selecionado.clipe.mascara_pixels) {
      const achado = acharClipe(atual, selecionado.clipe.id);
      const mascara = achado?.clipe.mascara_pixels;
      const alvo = achado ? alvoDaMascara(achado.clipe) : null;
      if (!achado || !mascara || !alvo) return null;
      if (camadaTravada(atual, achado.faixa) || achado.faixa.travas?.pixels) {
        mostrarAviso("A camada está travada. Destrave para pintar a máscara.");
        return null;
      }
      try {
        const pintura = await pinturas.preparar(alvo, tamanhoDaImagem(atual));
        return { clipeId: achado.clipe.id, chave: alvo.chave, pintura, recorte: achado.clipe.recorte, virar: achado.clipe.virar, travarTransparencia: true, mascara };
      } catch {
        mostrarAviso("Não foi possível abrir a máscara para pintar. Tente de novo.");
        return null;
      }
    }
    // As que só mexem no que já está pintado não criam camada
    const soNosPixels = qual === "borrar" || qual === "substituicaoDeCor" || qual === "borrachaDeFundo";
    if (soNosPixels && (!selecionado?.clipe.pixels || selecionado.clipe.pixels.versao === 0)) {
      mostrarAviso(selecionado?.clipe.pixels ? "A camada está vazia: escolha uma com pixels." : "Escolha uma camada de pixels (ou rasterize a camada: Camada › Rasterizar).");
      return null;
    }
    let clipeId = selecionado?.clipe.pixels ? selecionado.clipe.id : null;
    if (!clipeId) clipeId = await novaCamada();
    const achado = clipeId && projetoRef.current ? acharClipe(projetoRef.current, clipeId) : null;
    if (!achado?.clipe.midia_id || !achado.clipe.pixels) return null;
    const projetoAgora = projetoRef.current ?? atual;
    if (camadaTravada(projetoAgora, achado.faixa)) {
      mostrarAviso("A camada está travada. Destrave o cadeado para pintar.");
      return null;
    }
    if (achado.faixa.travas?.pixels) {
      mostrarAviso("Os pixels desta camada estão travados (painel Camadas).");
      return null;
    }
    const midia = midias.get(achado.clipe.midia_id);
    const tamanhoDaCamada = midia?.camada_pixels ?? tamanhoDaImagem(projetoAgora);
    const alvo = alvoDosPixels(achado.clipe);
    if (!alvo) return null;
    try {
      const pintura = await pinturas.preparar(alvo, tamanhoDaCamada);
      // Os carimbos pintam em direção à fonte deles (como o pincel do histórico)
      let fonteDaTinta: HTMLCanvasElement | undefined;
      if (qual === "carimbo" || qual === "carimboDePadrao") {
        const fonte = await fonteDoCarimbo(inicio, achado.clipe, pintura, tamanhoDaCamada);
        if (!fonte) return null;
        fonteDaTinta = fonte;
      }
      // O pincel de recuperação: a textura copiada da fonte, com a luz e a cor de onde pinta
      if (qual === "recuperacao") {
        const fonte = await fonteDoCarimbo(inicio, achado.clipe, pintura, tamanhoDaCamada);
        if (!fonte) return null;
        const destino = achado.clipe.pixels.versao === 0 ? documentoNaCamada(await imagemDaAmostra(achado.clipe, pintura, tamanhoDaCamada, "atualEAbaixo"), achado.clipe, tamanhoDaCamada) : pintura.camada;
        const corrigida = corrigirTom(pixelsDe(destino).data, pixelsDe(fonte).data, tamanhoDaCamada.largura, tamanhoDaCamada.altura, Math.max(2, pinceis.recuperacao.tamanho / 2));
        const canvas = document.createElement("canvas");
        canvas.width = tamanhoDaCamada.largura;
        canvas.height = tamanhoDaCamada.altura;
        canvas.getContext("2d")!.putImageData(new ImageData(corrigida, canvas.width, canvas.height), 0, 0);
        // Enquanto pinta, o tom pelo desfoque da diferença; ao soltar, a fonte colada sem emenda na área do traço
        manchas.current = { chave: alvo.chave, pintura, antes: pixelsDe(pintura.camada), amostra: pixelsDe(destino), vazia: achado.clipe.pixels.versao === 0, fonte: pixelsDe(fonte) };
        fonteDaTinta = canvas;
      }
      // O pincel de manchas: o traço aparece escurecido; ao soltar, a área é refeita pelo que está em volta
      if (qual === "recuperacaoParaManchas") {
        const vazia = achado.clipe.pixels.versao === 0;
        const amostra = vazia || opcoesDasManchas.todasAsCamadas ? documentoNaCamada(await imagemDaAmostra(achado.clipe, pintura, tamanhoDaCamada, vazia ? "atualEAbaixo" : "todas"), achado.clipe, tamanhoDaCamada) : pintura.camada;
        const escura = document.createElement("canvas");
        escura.width = tamanhoDaCamada.largura;
        escura.height = tamanhoDaCamada.altura;
        const ectx = escura.getContext("2d")!;
        ectx.drawImage(amostra, 0, 0);
        ectx.fillStyle = "rgba(0,0,0,0.45)";
        ectx.globalCompositeOperation = "source-atop";
        ectx.fillRect(0, 0, escura.width, escura.height);
        manchas.current = { chave: alvo.chave, pintura, antes: pixelsDe(pintura.camada), amostra: pixelsDe(amostra), vazia };
        fonteDaTinta = escura;
      }
      // O retoque pelo alvo: a camada (numa vazia, o que se vê dela para baixo) com o efeito na força escolhida
      if (qual === "desfoque" || qual === "nitidez" || qual === "subexposicao" || qual === "superexposicao" || qual === "esponja") {
        const vazia = achado.clipe.pixels.versao === 0;
        const base = vazia ? documentoNaCamada(await imagemDaAmostra(achado.clipe, pintura, tamanhoDaCamada, "atualEAbaixo"), achado.clipe, tamanhoDaCamada) : pintura.camada;
        const escala = tamanhoDaCamada.largura / tamanhoDaImagem(projetoAgora).largura;
        const efeito = alvoDoRetoque(qual as FerramentaDeAlvo, pixelsDe(base).data, tamanhoDaCamada.largura, tamanhoDaCamada.altura, opcoesDoRetoque[qual], escala);
        const canvas = document.createElement("canvas");
        canvas.width = tamanhoDaCamada.largura;
        canvas.height = tamanhoDaCamada.altura;
        canvas.getContext("2d")!.putImageData(new ImageData(efeito, canvas.width, canvas.height), 0, 0);
        fonteDaTinta = canvas;
      }
      // Marca a marca: cada uma lê e muda a tela debaixo dela
      const rgb = (cor: string) => rgbDaCor(cor).map((v) => v / 255) as [number, number, number];
      let porMarca: ((marca: MarcaDoRetoque) => void) | undefined;
      if (qual === "borrar") {
        const estado = estadoNovo();
        const { forca, pinturaComDedo } = opcoesDoRetoque.borrar;
        const cor = rgb(cores.primeiroPlano);
        porMarca = (marca) => borrarMarca(marca, estado, forca, cor, pinturaComDedo);
      } else if (qual === "misturador") {
        const pincel = pincelDoMisturador.current;
        const o = opcoesDoMisturador;
        if (o.limparDepois) pincel.estado = estadoNovo();
        if (o.carregarDepois) {
          pincel.estado.tinta = 1;
          pincel.limpo = false;
        }
        const reservatorio = pincel.limpo ? null : rgb(cores.primeiroPlano);
        const estado = pincel.estado;
        porMarca = (marca) => misturarMarca(marca, estado, o, reservatorio);
      } else if (qual === "substituicaoDeCor" || qual === "borrachaDeFundo") {
        const estado = estadoNovo();
        const primeiro = rgb(cores.primeiroPlano);
        const fundo = rgb(cores.fundo);
        porMarca =
          qual === "substituicaoDeCor"
            ? (marca) => substituirCorNaMarca(marca, estado, opcoesDaSubstituicao, primeiro, fundo, 1)
            : (marca) => apagarFundoNaMarca(marca, estado, opcoesDaBorrachaDeFundo, primeiro, fundo, 1);
      }
      return { clipeId: achado.clipe.id, chave: alvo.chave, pintura, recorte: achado.clipe.recorte, virar: achado.clipe.virar, travarTransparencia: Boolean(achado.faixa.travas?.transparencia), fonteDaTinta, porMarca };
    } catch {
      mostrarAviso("Não foi possível abrir a camada para pintar. Tente de novo.");
      return null;
    }
  };
  /**
   * Os pixels de um plano (rasterizar, mesclar, achatar, carimbar, a camada a partir do fundo): o projeto do plano é
   * desenhado como na exportação, sobe como camada de pixels nova e um comando troca as camadas, num passo só.
   */
  const gerarPixels = async (plano: PlanoDosPixels | (() => Promise<Blob>), dados: Omit<PlanoDosPixels, "desenhar">) => {
    if (!projeto) return;
    setGerandoPixels(true);
    try {
      await pinturas.esperar();
      const blob = typeof plano === "function" ? await plano() : await exportarImagem(plano.desenhar, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros });
      const { largura, altura } = tamanhoDaImagem(projetoRef.current ?? projeto);
      const midia = await criarCamadaDePixels(largura, altura, dados.nome);
      setCriadas((atual) => new Map([...atual, [midia.id, midia]]));
      const versao = await enviarVersao(midia.id, blob);
      void biblioteca.recarregar();
      executar({ comando: "imagem.substituirPorPixels", parametros: { ...dados, midiaId: midia.id, versao } });
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível gerar os pixels.");
    } finally {
      setGerandoPixels(false);
    }
  };
  const nomeDaFaixa = (faixa: Faixa) => nomeDaCamada(faixa.clipes[0], midias, faixa);
  const alturaDaCaixa = (faixa: Faixa) => caixasRef.current.get(faixa.clipes[0].id)?.altura ?? null;
  /** A matriz da máscara de camada para o quadro inteiro (a camada que rasterizar cria), pela caixa de agora. */
  const matrizNoQuadro = (faixa: Faixa, qual?: Pick<MascaraDePixels, "vinculada" | "matriz">) => {
    const medida = caixasRef.current.get(faixa.clipes[0].id);
    const mascara = qual ?? faixa.clipes[0].mascara_pixels;
    if (!medida?.bruta || !medida.quadro || !mascara) return null;
    const inteira = { cx: medida.quadro.largura / 2, cy: medida.quadro.altura / 2, largura: medida.quadro.largura, altura: medida.quadro.altura, rotacao: 0, opacidade: 1 };
    return matrizParaOutraCaixa(mascara, medida.bruta, inteira, medida.quadro);
  };
  /**
   * Começa a transformação livre da camada escolhida. A camada é desenhada sozinha (como no rasterizar, sem o estilo):
   * a caixa é a dela (girada com ela) ou, nas de pixels, o retângulo do que não é transparente; com uma seleção numa
   * camada de pixels, só o que está selecionado vai, e o resto fica. `imediata` leva a caixa do começo à final e
   * confirma na hora (girar e virar pelo menu, Transformar novamente).
   */
  const comecarTransformacaoDaCamada = async (opcoes: { copia?: boolean; modo?: ModoDaTransformacao; imediata?: (inicial: Quadrilatero) => { quad: Quadrilatero; malha: Malha | null } }) => {
    const atual = projetoRef.current;
    if (!atual || !selecionado || transformando || gerandoPixels) return;
    const achado = acharClipe(atual, selecionado.clipe.id);
    if (!achado || achado.clipe.pasta || achado.clipe.ajuste) return mostrarAviso("Escolha uma camada com conteúdo para transformar.");
    if (camadaTravada(atual, achado.faixa) || achado.faixa.travas?.posicao) return mostrarAviso("A posição desta camada está travada.");
    let plano: Omit<PlanoDosPixels, "desenhar"> | string;
    try {
      const { desenhar: _desenhar, ...dados } = planoDosPixels(atual, "transformar", [achado.faixa.id], nomeDaFaixa, alturaDaCaixa, matrizNoQuadro);
      void _desenhar;
      plano = dados;
    } catch (e) {
      plano = e instanceof Error ? e.message : "Não foi possível transformar a camada.";
    }
    const documento = tamanhoDaImagem(atual);
    setGerandoPixels(true);
    try {
      await pinturas.esperar();
      const desenhar = projetoSoCom(atual, [achado.faixa.id], { neutras: new Set([achado.faixa.id]), semEstilo: true });
      const blob = await exportarImagem(desenhar, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros });
      const bitmap = await createImageBitmap(blob);
      const tela = document.createElement("canvas");
      tela.width = documento.largura;
      tela.height = documento.altura;
      const ctxTela = tela.getContext("2d", { willReadFrequently: true })!;
      ctxTela.drawImage(bitmap, 0, 0, documento.largura, documento.altura);
      bitmap.close();
      // Com uma seleção numa camada de pixels: o pedaço selecionado vai, o resto fica
      const selecao = achado.clipe.pixels && selecaoNoDocumento && temAlgo(selecaoNoDocumento) ? selecaoNoDocumento : null;
      let resto: HTMLCanvasElement | null = null;
      if (selecao) {
        const pixels = ctxTela.getImageData(0, 0, documento.largura, documento.altura);
        const sobra = new ImageData(new Uint8ClampedArray(pixels.data), documento.largura, documento.altura);
        for (let i = 0; i < selecao.dados.length; i++) {
          pixels.data[i * 4 + 3] = Math.round((pixels.data[i * 4 + 3] * selecao.dados[i]) / 255);
          sobra.data[i * 4 + 3] = Math.round((sobra.data[i * 4 + 3] * (255 - selecao.dados[i])) / 255);
        }
        ctxTela.putImageData(pixels, 0, 0);
        resto = document.createElement("canvas");
        resto.width = documento.largura;
        resto.height = documento.altura;
        resto.getContext("2d")!.putImageData(sobra, 0, 0);
      }
      // A caixa do começo
      let inicial: Quadrilatero | null = null;
      const medida = caixasRef.current.get(achado.clipe.id);
      if (!achado.clipe.pixels && medida?.bruta && medida.quadro) {
        const k = documento.largura / medida.quadro.largura;
        inicial = quadDoRetangulo(medida.bruta.cx * k, medida.bruta.cy * k, medida.bruta.largura * k, medida.bruta.altura * k, medida.bruta.rotacao);
      } else {
        const caixa = caixaParaAparar(ctxTela.getImageData(0, 0, documento.largura, documento.altura).data, documento.largura, documento.altura, "transparencia");
        if (caixa)
          inicial = [
            { x: caixa.x0, y: caixa.y0 },
            { x: caixa.x1, y: caixa.y0 },
            { x: caixa.x1, y: caixa.y1 },
            { x: caixa.x0, y: caixa.y1 },
          ];
      }
      if (!inicial) return mostrarAviso(selecao ? "A seleção não pega nada desta camada." : "A camada está vazia.");
      // A fonte: o conteúdo no referencial da caixa, na resolução do documento
      const u = { x: inicial[1].x - inicial[0].x, y: inicial[1].y - inicial[0].y };
      const v = { x: inicial[3].x - inicial[0].x, y: inicial[3].y - inicial[0].y };
      const largura = Math.max(1, Math.round(Math.hypot(u.x, u.y)));
      const altura = Math.max(1, Math.round(Math.hypot(v.x, v.y)));
      const fonte = document.createElement("canvas");
      fonte.width = largura;
      fonte.height = altura;
      const ctxFonte = fonte.getContext("2d")!;
      // Do documento para a caixa: a inversa de (a, b) → q0 + a·U/largura + b·V/altura
      const m00 = u.x / largura;
      const m10 = u.y / largura;
      const m01 = v.x / altura;
      const m11 = v.y / altura;
      const det = m00 * m11 - m01 * m10 || 1e-12;
      const i00 = m11 / det;
      const i01 = -m01 / det;
      const i10 = -m10 / det;
      const i11 = m00 / det;
      ctxFonte.imageSmoothingQuality = "high";
      ctxFonte.setTransform(i00, i10, i01, i11, -(i00 * inicial[0].x + i01 * inicial[0].y), -(i10 * inicial[0].x + i11 * inicial[0].y));
      ctxFonte.drawImage(tela, 0, 0);
      // A seleção no mesmo referencial (ela anda junto com o pedaço)
      let fonteDaSelecao: HTMLCanvasElement | null = null;
      if (selecao) {
        fonteDaSelecao = document.createElement("canvas");
        fonteDaSelecao.width = largura;
        fonteDaSelecao.height = altura;
        const ctxSelecao = fonteDaSelecao.getContext("2d")!;
        ctxSelecao.setTransform(i00, i10, i01, i11, -(i00 * inicial[0].x + i01 * inicial[0].y), -(i10 * inicial[0].x + i11 * inicial[0].y));
        ctxSelecao.drawImage(selecaoParaCanvas(selecao), 0, 0);
      }
      const fator = Math.min(1, 800 / Math.max(largura, altura));
      const pequena = document.createElement("canvas");
      pequena.width = Math.max(1, Math.round(largura * fator));
      pequena.height = Math.max(1, Math.round(altura * fator));
      pequena.getContext("2d")!.drawImage(fonte, 0, 0, pequena.width, pequena.height);
      const novo: Transformando = {
        estado: { quad: inicial, malha: null },
        inicial,
        modo: opcoes.modo ?? "livre",
        fonte,
        previa: { imagem: pequena, largura: pequena.width, altura: pequena.height },
        referencia: { u: 0.5, v: 0.5 },
        numeros: null,
        interpolacao: "bicubica",
        camada: { faixaId: achado.faixa.id, clipeId: achado.clipe.id, copia: Boolean(opcoes.copia), plano, resto, selecao, fonteDaSelecao },
      };
      if (opcoes.imediata) {
        const final = opcoes.imediata(inicial);
        await confirmarTransformacaoDaCamada({ ...novo, estado: { quad: final.quad, malha: final.malha }, interpolacao: ultimaTransformacao.current?.interpolacao ?? "bicubica" }, true);
      } else setTransformando(novo);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível transformar a camada.");
    } finally {
      setGerandoPixels(false);
    }
  };
  /**
   * Confirma a transformação da camada. Mover, girar, escalar por igual e virar ficam na posição da camada (ela continua
   * editável, sem perder nitidez); o resto (e a cópia, e o pedaço de uma seleção) vai para os pixels, reamostrado na
   * interpolação escolhida, e a camada vira de pixels.
   */
  const confirmarTransformacaoDaCamada = async (t: Transformando, jaComGerando = false) => {
    const camada = t.camada;
    const atual = projetoRef.current;
    setTransformando(null);
    if (!camada || !atual) return;
    const achado = acharClipe(atual, camada.clipeId);
    if (!achado) return;
    ultimaTransformacao.current = { cantos: noReferencial(t.inicial, t.estado.quad), malha: t.estado.malha ? { ...t.estado.malha, pontos: noReferencial(t.inicial, t.estado.malha.pontos) } : null, interpolacao: t.interpolacao };
    const documento = tamanhoDaImagem(atual);
    const parecida = !t.estado.malha && !camada.copia && !camada.selecao ? semelhanca(t.inicial, t.estado.quad) : null;
    if (parecida) {
      const tr = achado.clipe.transformacao;
      const centro = afimEntre(t.inicial, t.estado.quad)({ x: (tr.x + 0.5) * documento.largura, y: (tr.y + 0.5) * documento.altura });
      const virar = achado.clipe.virar ?? { horizontal: false, vertical: false };
      executar({
        comando: "imagem.transformarCamada",
        parametros: {
          clipeId: camada.clipeId,
          transformacao: { x: centro.x / documento.largura - 0.5, y: centro.y / documento.altura - 0.5, escala: tr.escala * parecida.escala, rotacao: parecida.espelhado ? parecida.giro - tr.rotacao : tr.rotacao + parecida.giro },
          ...(parecida.espelhado ? { virar: { ...virar, horizontal: !virar.horizontal } } : {}),
        },
      });
      return;
    }
    // A forma continua vetorial: os pontos (e as alças) vão pela mesma conta da imagem, da caixa dela ao lugar novo
    if (achado.clipe.vetor && !camada.copia && !camada.selecao) {
      const paraUv = inversaDaHomografia(t.inicial);
      const destino = t.estado.malha ? mapaDaMalha(t.estado.malha) : homografia(t.estado.quad);
      const caminhos = transformarCaminhos(caminhosDoVetorNaImagem(achado.clipe, documento), (p) => {
        const uv = paraUv(p);
        return destino(uv.x, uv.y);
      });
      executar({ comando: "imagem.caminhosDoVetor", parametros: { clipeId: camada.clipeId, caminhos } });
      return;
    }
    if (typeof camada.plano === "string") return mostrarAviso(camada.plano);
    const canvas = document.createElement("canvas");
    canvas.width = documento.largura;
    canvas.height = documento.altura;
    const ctx2d = canvas.getContext("2d")!;
    if (camada.resto) ctx2d.drawImage(camada.resto, 0, 0);
    const pedaco = document.createElement("canvas");
    pedaco.width = documento.largura;
    pedaco.height = documento.altura;
    pedaco.getContext("2d")!.putImageData(new ImageData(levarPeloEstado(t.fonte, t.estado, documento, t.interpolacao), documento.largura, documento.altura), 0, 0);
    ctx2d.drawImage(pedaco, 0, 0);
    // A seleção anda junto com o pedaço
    if (camada.fonteDaSelecao) {
      const mascara = document.createElement("canvas");
      mascara.width = documento.largura;
      mascara.height = documento.altura;
      mascara.getContext("2d")!.putImageData(new ImageData(levarPeloEstado(camada.fonteDaSelecao, t.estado, documento, "bilinear"), documento.largura, documento.altura), 0, 0);
      const nova = selecaoDoCanvas(mascara, "alfa");
      setSelecaoDoDocumento(temAlgo(nova) ? nova : null);
    }
    const blob = await new Promise<Blob>((pronto, falhou) => canvas.toBlob((b) => (b ? pronto(b) : falhou(new Error("O navegador não conseguiu gravar a camada."))), "image/png"));
    if (jaComGerando) setGerandoPixels(false);
    await gerarPixels(async () => blob, camada.copia ? { ...camada.plano, remover: [], nome: `${camada.plano.nome} cópia` } : camada.plano);
  };
  /** O menu Editar: a transformação livre, a de uma cópia, o submenu Transformar. */
  const transformarCamadaPeloMenu = (como: Parameters<AcoesDosMenus["transformarCamada"]>[0]) => {
    const girarEm = (graus: number) => (q: Quadrilatero) => {
      const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
      const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
      const r = (graus * Math.PI) / 180;
      return { quad: q.map((p) => ({ x: cx + (p.x - cx) * Math.cos(r) - (p.y - cy) * Math.sin(r), y: cy + (p.x - cx) * Math.sin(r) + (p.y - cy) * Math.cos(r) })) as Quadrilatero, malha: null };
    };
    if (como === "livre") return void comecarTransformacaoDaCamada({});
    if (como === "copia") return void comecarTransformacaoDaCamada({ copia: true });
    if (como === "girar180") return void comecarTransformacaoDaCamada({ imediata: girarEm(180) });
    if (como === "girar90") return void comecarTransformacaoDaCamada({ imediata: girarEm(90) });
    if (como === "girarMenos90") return void comecarTransformacaoDaCamada({ imediata: girarEm(-90) });
    if (como === "virarH") return void comecarTransformacaoDaCamada({ imediata: (q) => ({ quad: [q[1], q[0], q[3], q[2]], malha: null }) });
    if (como === "virarV") return void comecarTransformacaoDaCamada({ imediata: (q) => ({ quad: [q[3], q[2], q[1], q[0]], malha: null }) });
    if (como === "novamente") {
      const ultima = ultimaTransformacao.current;
      if (!ultima) return;
      return void comecarTransformacaoDaCamada({ imediata: (q) => ({ quad: doReferencial(q, ultima.cantos) as Quadrilatero, malha: ultima.malha ? { ...ultima.malha, pontos: doReferencial(q, ultima.malha.pontos) } : null }) });
    }
    void comecarTransformacaoDaCamada({ modo: como });
  };
  /**
   * Imagem › Tamanho da imagem: com a reamostragem, cada camada de pixels e cada canal vão para o tamanho novo pelo
   * método escolhido (mídias novas, que sobem antes) e o quadro muda num passo só; sem ela, só a resolução muda.
   */
  const aplicarTamanhoDaImagem = async (novo: NovoTamanho) => {
    const atual = projetoRef.current;
    if (!atual) return;
    const antes = tamanhoDaImagem(atual);
    const mudou = novo.largura !== antes.largura || novo.altura !== antes.altura;
    const pixels: { id: string; midiaId: string; versao: number }[] = [];
    const canais: { id: string; midiaId: string; versao: number }[] = [];
    setGerandoPixels(true);
    try {
      if (mudou && novo.reamostrar) {
        await pinturas.esperar();
        const reamostrarAlvo = async (alvo: AlvoDoMotor, tamanho: { largura: number; altura: number }, nome: string) => {
          const pintura = await pinturas.preparar(alvo, tamanho);
          const dados = pintura.camada.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, tamanho.largura, tamanho.altura).data;
          const largura = Math.max(1, Math.round((tamanho.largura * novo.largura) / antes.largura));
          const altura = Math.max(1, Math.round((tamanho.altura * novo.altura) / antes.altura));
          const canvas = document.createElement("canvas");
          canvas.width = largura;
          canvas.height = altura;
          canvas.getContext("2d")!.putImageData(new ImageData(redimensionar({ dados, largura: tamanho.largura, altura: tamanho.altura }, largura, altura, novo.metodo), largura, altura), 0, 0);
          const blob = await new Promise<Blob>((pronto, falhou) => canvas.toBlob((b) => (b ? pronto(b) : falhou(new Error("O navegador não conseguiu gravar a camada."))), "image/png"));
          const midia = await criarCamadaDePixels(largura, altura, nome);
          setCriadas((atuais) => new Map([...atuais, [midia.id, midia]]));
          return { midiaId: midia.id, versao: await enviarVersao(midia.id, blob) };
        };
        for (const { clipe, faixa } of camadasDaImagem(atual)) {
          if (!clipe.pixels || !clipe.midia_id) continue;
          const alvo = alvoDosPixels(clipe);
          if (!alvo) continue;
          const tamanho = midias.get(clipe.midia_id)?.camada_pixels ?? antes;
          pixels.push({ id: clipe.id, ...(await reamostrarAlvo(alvo, tamanho, nomeDaFaixa(faixa))) });
        }
        for (const canal of atual.canais ?? []) canais.push({ id: canal.id, ...(await reamostrarAlvo(alvoDoCanal(canal), antes, canal.nome)) });
        void biblioteca.recarregar();
      }
      executar({ comando: "imagem.tamanhoComPixels", parametros: { tamanho: { largura: novo.largura, altura: novo.altura, resolucao: novo.resolucao }, pixels, canais } });
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível mudar o tamanho da imagem.");
    } finally {
      setGerandoPixels(false);
    }
  };
  /** Imagem › Tamanho da tela: o retângulo novo pela âncora, as camadas no mesmo lugar em pixels. */
  const aplicarTamanhoDaTela = (nova: NovaTela) => {
    const atual = projetoRef.current;
    if (!atual) return;
    const antes = tamanhoDaImagem(atual);
    const retangulo = { x: (antes.largura - nova.largura) * nova.ancora.u, y: (antes.altura - nova.altura) * nova.ancora.v, largura: nova.largura, altura: nova.altura };
    executar({ comando: "imagem.tamanhoDaTela", parametros: { retangulo, tamanhos: tamanhosDasMidias(), fundo: nova.extensao } });
  };
  /** Imagem › Revelar tudo: a tela cresce até caber o que está fora dela (pelas caixas que a prévia mede). */
  const revelarTudo = () => {
    const atual = projetoRef.current;
    if (!atual) return;
    const antes = tamanhoDaImagem(atual);
    let x0 = 0;
    let y0 = 0;
    let x1 = antes.largura;
    let y1 = antes.altura;
    for (const { clipe } of camadasDaImagem(atual)) {
      if (clipe.ajuste || clipe.pasta || clipe.camada_de_preenchimento) continue;
      const medida = caixasRef.current.get(clipe.id);
      if (!medida?.bruta || !medida.quadro) continue;
      const k = antes.largura / medida.quadro.largura;
      // A caixa medida na tela tem um resto de conta: um centésimo de pixel não aumenta a tela
      for (const canto of quadDoRetangulo(medida.bruta.cx * k, medida.bruta.cy * k, medida.bruta.largura * k, medida.bruta.altura * k, medida.bruta.rotacao)) {
        x0 = Math.min(x0, Math.floor(canto.x + 0.01));
        y0 = Math.min(y0, Math.floor(canto.y + 0.01));
        x1 = Math.max(x1, Math.ceil(canto.x - 0.01));
        y1 = Math.max(y1, Math.ceil(canto.y - 0.01));
      }
    }
    if (x0 === 0 && y0 === 0 && x1 === antes.largura && y1 === antes.altura) return mostrarAviso("Não há nada fora da tela.");
    executar({ comando: "imagem.tamanhoDaTela", parametros: { retangulo: { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 }, tamanhos: tamanhosDasMidias(), fundo: null } });
  };
  /** Rasterizar, mesclar, achatar ou carimbar as escolhidas (cada rasterizar é uma camada por vez). */
  const mesclarEmPixels = async (tipo: TipoDaMesclagem) => {
    if (!projeto || gerandoPixels) return;
    const ids = tipo === "rasterizar" && faixaIds.length > 1 ? faixaIds : [faixaIds];
    for (const grupo of ids) {
      const atual = projetoRef.current ?? projeto;
      let plano: PlanoDosPixels;
      try {
        plano = planoDosPixels(atual, tipo, Array.isArray(grupo) ? grupo : [grupo], nomeDaFaixa, alturaDaCaixa, matrizNoQuadro);
      } catch (e) {
        mostrarAviso(e instanceof Error ? e.message : "Não foi possível.");
        return;
      }
      const { desenhar, ...dados } = plano;
      await gerarPixels({ desenhar, ...dados }, dados);
    }
  };
  /** Camada › Estilo de camada › Criar camadas: cada efeito vira uma camada de pixels, e a camada fica sem o estilo. */
  const criarCamadasDosEfeitos = async () => {
    const atual = projetoRef.current ?? projeto;
    const faixa = escolhidas[0];
    if (!atual || !faixa || gerandoPixels) return;
    let planos: PlanoDosPixels[];
    try {
      planos = planosDosEfeitos(atual, faixa.id, nomeDaFaixa);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível.");
      return;
    }
    for (const plano of planos) {
      const { desenhar, ...dados } = plano;
      await gerarPixels({ desenhar, ...dados }, dados);
    }
    executar({ comando: "imagem.estiloDeCamada", parametros: { clipeIds: [faixa.clipes[0].id], estilo: null } });
  };
  /** Rasterizar › Todas as camadas: cada camada que não é de pixels (nem grupo nem ajuste), uma por vez. */
  /** Arquivo › Scripts › Achatar todos os efeitos de camada e Achatar todas as máscaras: o plano de uma camada, em todas. */
  const achatarEmTodas = async (tipo: "rasterizarEstilo" | "aplicarMascara") => {
    if (!projeto) return;
    const precisa = (faixa: Faixa) => {
      const clipe = faixa.clipes[0];
      if (!clipe || clipe.pasta || clipe.ajuste || faixa.travada) return false;
      return tipo === "rasterizarEstilo" ? Boolean(clipe.contorno || clipe.sombra || clipe.estilo_camada?.efeitos.length) : Boolean(clipe.mascara_pixels || clipe.mascara_vetorial);
    };
    const alvos = faixasEmOrdem(projeto).filter(precisa).map((faixa) => faixa.id);
    if (!alvos.length) return mostrarAviso(tipo === "rasterizarEstilo" ? "Nenhuma camada tem efeitos." : "Nenhuma camada tem máscara.");
    let feitas = 0;
    for (const id of alvos) {
      const atual = projetoRef.current ?? projeto;
      if (!atual.faixas.some((item) => item.id === id)) continue;
      try {
        const { desenhar, ...dados } = planoDosPixels(atual, tipo, [id], nomeDaFaixa, alturaDaCaixa, matrizNoQuadro);
        await gerarPixels({ desenhar, ...dados }, dados);
        feitas++;
      } catch {
        // A camada que não dá (travada no meio do caminho) fica como está
      }
    }
    mostrarAviso(`${feitas} ${feitas === 1 ? "camada achatada" : "camadas achatadas"}.`);
  };
  /**
   * Arquivo › Scripts › Excluir todas as camadas vazias: as de pixels sem nada pintado, os textos sem texto e os
   * grupos que ficam sem nada (como o script dos editores; o fundo e os ajustes ficam).
   */
  const excluirCamadasVazias = async () => {
    const atual = projetoRef.current;
    if (!atual) return;
    await pinturas.esperar();
    const vazias = new Set<string>();
    for (const { faixa, clipe } of camadasDaImagem(atual)) {
      if (clipe.pasta || clipe.ajuste || clipe.camada_de_preenchimento || faixa.fundo || faixa.travada) continue;
      if (clipe.texto_rico && !textoCorrido(clipe.texto_rico).trim()) vazias.add(faixa.id);
      if (!clipe.pixels || !clipe.midia_id) continue;
      if (clipe.pixels.versao === 0) {
        vazias.add(faixa.id);
        continue;
      }
      const fonte = pinturas.fonte(clipe) ?? (await carregarBitmap(arquivoDaMidia(clipe.midia_id, arquivoDaVersao(clipe.pixels.versao))));
      const canvas = document.createElement("canvas");
      canvas.width = fonte.width;
      canvas.height = fonte.height;
      const contexto = canvas.getContext("2d", { willReadFrequently: true })!;
      contexto.drawImage(fonte, 0, 0);
      const dados = contexto.getImageData(0, 0, canvas.width, canvas.height).data;
      let algo = false;
      for (let i = 3; i < dados.length && !algo; i += 4) if (dados[i]) algo = true;
      if (!algo) vazias.add(faixa.id);
    }
    // Os grupos com só grupos e camadas vazias dentro
    for (const faixa of atual.faixas)
      if (faixa.clipes[0]?.pasta && comDescendentes(atual, faixa.id).every((item) => item.id === faixa.id || item.clipes[0]?.pasta || vazias.has(item.id))) vazias.add(faixa.id);
    if (!vazias.size) return mostrarAviso("Nenhuma camada vazia.");
    const camadas = [...vazias].filter((id) => !atual.faixas.find((faixa) => faixa.id === id)?.clipes[0]?.pasta).length;
    if (executar({ comando: "imagem.apagarVarias", parametros: { faixaIds: [...vazias] } })) mostrarAviso(`${camadas} ${camadas === 1 ? "camada vazia excluída" : "camadas vazias excluídas"}${vazias.size > camadas ? `, com ${vazias.size - camadas} ${vazias.size - camadas === 1 ? "grupo" : "grupos"}` : ""}.`);
  };
  const rasterizarTodas = async () => {
    if (!projeto) return;
    for (const faixa of faixasEmOrdem(projeto).filter((item) => !item.clipes[0].pixels && !item.clipes[0].pasta && !item.clipes[0].ajuste && !item.travada)) {
      const atual = projetoRef.current ?? projeto;
      if (!atual.faixas.some((item) => item.id === faixa.id)) continue;
      const { desenhar, ...dados } = planoDosPixels(atual, "rasterizar", [faixa.id], nomeDaFaixa, alturaDaCaixa, matrizNoQuadro);
      await gerarPixels({ desenhar, ...dados }, dados);
    }
  };
  /** Camada a partir do fundo: a cor do fundo vira uma camada de pixels embaixo de todas, e a imagem fica sem fundo. */
  const camadaDoFundoDoDocumento = () => {
    if (!projeto) return;
    const { largura, altura } = tamanhoDaImagem(projeto);
    const cor = projeto.fundo.cor;
    void gerarPixels(
      () =>
        new Promise<Blob>((pronto, falhou) => {
          const canvas = document.createElement("canvas");
          canvas.width = largura;
          canvas.height = altura;
          const ctx2d = canvas.getContext("2d")!;
          ctx2d.fillStyle = cor;
          ctx2d.fillRect(0, 0, largura, altura);
          canvas.toBlob((blob) => (blob ? pronto(blob) : falhou(new Error("O navegador não conseguiu gerar a camada."))), "image/png");
        }),
      { remover: [], lugar: null, nome: "Camada 0", manter: { opacidade: 1, faixa: {} }, doFundoDoDocumento: true },
    );
  };
  const camadaDeFundoAtual = projeto?.faixas.find((faixa) => faixa.fundo) ?? null;

  /** Um PNG do tamanho da imagem: a cor lisa, ou a função que pinta o canvas. */
  const pngDoDocumento = (pintar: (ctx: CanvasRenderingContext2D, largura: number, altura: number) => void | Promise<void>) => async (): Promise<Blob> => {
    const { largura, altura } = tamanhoDaImagem(projetoRef.current ?? projeto!);
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true })!;
    await pintar(ctx2d, largura, altura);
    return new Promise<Blob>((pronto, falhou) => canvas.toBlob((blob) => (blob ? pronto(blob) : falhou(new Error("O navegador não conseguiu gerar a máscara."))), "image/png"));
  };
  /** Sobe um PNG como camada de pixels (a máscara de camada) e devolve a mídia e a versão. */
  const subirMascara = async (gerar: () => Promise<Blob>) => {
    const { largura, altura } = tamanhoDaImagem(projetoRef.current ?? projeto!);
    const blob = await gerar();
    const midia = await criarCamadaDePixels(largura, altura, "Máscara");
    setCriadas((atual) => new Map([...atual, [midia.id, midia]]));
    const versao = await enviarVersao(midia.id, blob);
    return { midia, versao };
  };
  /**
   * Camada › Máscara de camada: revelar tudo (branca), ocultar tudo (preta) ou a partir da transparência (o alfa da
   * camada, desenhada sozinha, vira o cinza). A matriz é a da caixa da camada agora: a máscara anda com ela.
   */
  const criarMascara = async (como: "revelar" | "ocultar" | "revelarSelecao" | "ocultarSelecao" | "transparencia", selecaoDada?: Selecao) => {
    const daSelecao = selecaoDada ?? selecaoNoDocumento;
    if ((como === "revelarSelecao" || como === "ocultarSelecao") && !daSelecao) return mostrarAviso("Não há seleção.");
    const alvo = selecionado;
    if (!alvo || !projeto || gerandoPixels) return;
    if (alvo.clipe.pasta) return mostrarAviso("A máscara de pixels vale para camadas, não para grupos.");
    if (alvo.faixa.travada) return mostrarAviso("A camada está travada.");
    const medida = caixasRef.current.get(alvo.clipe.id);
    if (!medida?.bruta || !medida.quadro) return mostrarAviso("A camada ainda não apareceu na prévia. Tente de novo.");
    const matriz = matrizDaCaixa(medida.bruta, medida.quadro);
    setGerandoPixels(true);
    try {
      await pinturas.esperar();
      const gerar =
        como === "transparencia"
          ? pngDoDocumento(async (ctx2d, largura, altura) => {
              const sozinha = projetoSoCom(projetoRef.current ?? projeto, [alvo.faixa.id], { neutras: new Set([alvo.faixa.id]), semEstilo: true, semMascara: true });
              const imagem = await createImageBitmap(await exportarImagem(sozinha, midias, { formato: "png", fonteDosPixels: pinturas.fonte }));
              ctx2d.drawImage(imagem, 0, 0, largura, altura);
              imagem.close();
              const dados = ctx2d.getImageData(0, 0, largura, altura);
              for (let i = 0; i < dados.data.length; i += 4) {
                const a = dados.data[i + 3];
                dados.data[i] = a;
                dados.data[i + 1] = a;
                dados.data[i + 2] = a;
                dados.data[i + 3] = 255;
              }
              ctx2d.putImageData(dados, 0, 0);
            })
          : daSelecao && (como === "revelarSelecao" || como === "ocultarSelecao")
            ? pngDoDocumento((ctx2d) => pintarSelecao(ctx2d, daSelecao, como === "ocultarSelecao"))
            : pngDoDocumento((ctx2d, largura, altura) => {
                ctx2d.fillStyle = como === "revelar" ? "#ffffff" : "#000000";
                ctx2d.fillRect(0, 0, largura, altura);
              });
      const { midia, versao } = await subirMascara(gerar);
      if (executar({ comando: "mascara.definir", parametros: { clipeId: alvo.clipe.id, mascara: { midia_id: midia.id, versao, ligada: true, vinculada: true, densidade: 1, difusao: 0, matriz } } })) {
        setMascaraEmFoco(alvo.clipe.id);
      }
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível criar a máscara.");
    } finally {
      setGerandoPixels(false);
    }
  };
  /** Inverter a máscara (o que mostrava esconde): uma versão nova com o cinza ao contrário. */
  const inverterMascara = async () => {
    const mascara = selecionado?.clipe.mascara_pixels;
    if (!selecionado || !mascara || gerandoPixels) return;
    setGerandoPixels(true);
    try {
      await pinturas.esperar();
      const atual = pinturas.fonteDaMascara(selecionado.clipe) ?? (await carregarBitmap(arquivoDaMidia(mascara.midia_id, arquivoDaVersao(mascara.versao))));
      const blob = await pngDoDocumento((ctx2d, largura, altura) => {
        ctx2d.drawImage(atual, 0, 0, largura, altura);
        const dados = ctx2d.getImageData(0, 0, largura, altura);
        for (let i = 0; i < dados.data.length; i += 4) {
          dados.data[i] = 255 - dados.data[i];
          dados.data[i + 1] = 255 - dados.data[i + 1];
          dados.data[i + 2] = 255 - dados.data[i + 2];
          dados.data[i + 3] = 255;
        }
        ctx2d.putImageData(dados, 0, 0);
      })();
      const versao = await enviarVersao(mascara.midia_id, blob);
      executar({ comando: "mascara.mudar", parametros: { clipeId: selecionado.clipe.id, mudanca: { versao } } });
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível inverter a máscara.");
    } finally {
      setGerandoPixels(false);
    }
  };
  /** Vincular de novo guarda a matriz da caixa de agora: a máscara fica onde está e volta a andar com a camada. */
  const vincularMascara = (clipeId: string, ligar: boolean) => {
    const medida = caixasRef.current.get(clipeId);
    if (ligar && (!medida?.bruta || !medida.quadro)) return;
    executar({ comando: "mascara.mudar", parametros: { clipeId, mudanca: ligar ? { vinculada: true, matriz: matrizDaCaixa(medida!.bruta!, medida!.quadro!) } : { vinculada: false } } });
  };
  const mascaraDaEscolhida = selecionado?.clipe.mascara_pixels ?? null;
  const ferramentaDePintura = FERRAMENTAS_DE_PINTURA.has(ferramenta) ? (ferramenta as FerramentaDePintura) : null;
  // Fora das ferramentas de pintura, os painéis do pincel mostram o Pincel (como lá, o último pincel usado)
  const pincelDosPaineis: FerramentaDePintura = ferramentaDePintura ?? "pincel";
  const mudarPincel = (mudanca: Partial<OpcoesDoPincel>) => setPinceis((atual) => ({ ...atual, [pincelDosPaineis]: { ...atual[pincelDosPaineis], ...mudanca } }));
  const ordenar = (para: "topo" | "cima" | "baixo" | "fundo") => {
    // Várias: cada uma anda entre as irmãs dela; para cima, a de cima anda primeiro (e o contrário para baixo)
    const ordem = para === "cima" || para === "fundo" ? escolhidas : [...escolhidas].reverse();
    for (const faixa of ordem) executar({ comando: "imagem.mover", parametros: { faixaId: faixa.id, para } });
  };
  const posicoes = (mudancas: MudancaDePosicao[]) => mudancas.length > 0 && executar({ comando: "imagem.posicoes", parametros: { mudancas } });
  /** A mudança de um clipe com as vinculadas a ele (um passo só). */
  const comandoDaMudanca = (clipeId: string, mudanca: Partial<Transformacao>): Comando => {
    const achado = projeto ? acharClipe(projeto, clipeId) : null;
    const mudancas = projeto && achado ? mudancaComVinculadas(projeto, achado.clipe, mudanca) : [];
    return mudancas.length > 1 ? { comando: "imagem.posicoes", parametros: { mudancas } } : { comando: "clipe.transformar", parametros: { clipeIds: [clipeId], transformacao: mudanca } };
  };
  /** Deslocar as escolhidas (as pastas inteiras) e as vinculadas, em frações do quadro. */
  const mudancasDoDeslocamento = (dx: number, dy: number) =>
    projeto
      ? deslocar(
          projeto,
          unidadesDaSelecao(projeto, selecaoValida).flatMap((unidade) => unidade.clipeIds),
          dx,
          dy,
        )
      : [];
  /** Alt+[ e Alt+]: a camada visível de baixo ou de cima da escolhida (ou a de cima de todas). */
  const camadaVizinha = (sentido: 1 | -1) => {
    if (!projeto) return;
    const visiveis = faixasEmOrdem(projeto).filter((faixa) => camadaVisivel(projeto, faixa));
    if (!visiveis.length) return;
    const atual = escolhidas.length ? visiveis.findIndex((faixa) => faixa.id === escolhidas[sentido > 0 ? escolhidas.length - 1 : 0].id) : -1;
    const proxima = atual < 0 ? visiveis[0] : visiveis[Math.min(visiveis.length - 1, Math.max(0, atual + sentido))];
    setSelecao([proxima.clipes[0].id]);
  };
  const todasRecortadas = escolhidas.length > 0 && escolhidas.every((faixa) => faixa.recortada);
  const vinculadas = escolhidas.length > 1 && escolhidas.every((faixa) => faixa.vinculo && faixa.vinculo === escolhidas[0].vinculo);

  const acoes: AcoesDosMenus = {
    temCamada: escolhidas.length > 0,
    quantas: escolhidas.length,
    temPasta: escolhidas.some((faixa) => faixa.clipes[0].pasta),
    recortadas: todasRecortadas,
    vinculadas,
    temFoto: Boolean(foto),
    temSelecao,
    temSelecaoDoDocumento: Boolean(selecaoNoDocumento),
    podeSelecionarNovamente: !selecaoNoDocumento && Boolean(selecaoAnterior && selecaoAnterior.largura === tamanhoDoDocumento?.largura && selecaoAnterior.altura === tamanhoDoDocumento?.altura),
    bordasVisiveis: bordasDaSelecao,
    selecaoDoDocumento: (acao) => {
      if (!tamanhoDoDocumento) return;
      if (acao === "tudo") selecionarNoDocumento(cheia(tamanhoDoDocumento.largura, tamanhoDoDocumento.altura));
      else if (acao === "desmarcar") selecionarNoDocumento(null);
      else if (acao === "novamente" && selecaoAnterior) selecionarNoDocumento(selecaoAnterior);
      else if (acao === "inverter" && selecaoNoDocumento) setSelecaoDoDocumento(inverterSelecao(selecaoNoDocumento));
      else if (acao === "bordas") setBordasDaSelecao((atual) => !atual);
    },
    modificarSelecao: (como) => selecaoNoDocumento && setModificando(como),
    aumentarSelecao,
    selecionarPor,
    mascaraRapida: Boolean(mascaraRapida),
    alternarMascaraRapida,
    temCanais: canais.length > 0,
    definirPincel: () => selecaoNoDocumento && setNomeDoPincel(true),
    definirPadrao: () => setNomeDoPadrao(true),
    definirFormaPersonalizada: () => setNomeDaForma(true),
    transformarSelecao,
    transformarCamada: transformarCamadaPeloMenu,
    tamanhoDaImagem: () => setJanelaDoDocumento("imagem"),
    tamanhoDaTela: () => setJanelaDoDocumento("tela"),
    girarImagem: (giro) => (giro === "arbitraria" ? setJanelaDoDocumento("giro") : executar({ comando: "imagem.girar", parametros: { giro, tamanhos: tamanhosDasMidias() } })),
    revelarTudo,
    dissolver: () => void abrirDissolver("dissolver"),
    marionete: () => void abrirDissolver("marionete"),
    lente: (tipo) => void abrirDissolver(tipo),
    perspectiva: () => void abrirDissolver("perspectiva"),
    escalaSensivel: () => void abrirEscalaSensivel(),
    pontoDeFuga: () => void abrirPontoDeFuga(),
    alinharCamadas: () => setJanelaDasCamadas("alinhar"),
    temCaminho: Boolean(caminhosEditaveis?.some(temArea)),
    caminhoComoSelecao: () => caminhoComoSelecao(),
    caminhoDaSelecao: () => setJanelaDoCaminho({ tipo: "daSelecao" }),
    mesclarCamadas: () => setJanelaDasCamadas("mesclar"),
    temUltimaTransformacao: ultimaTransformacao.current !== null,
    selecionarEMascarar: abrirSelecionarEMascarar,
    camadasNoPainel: (como) => {
      area.abrir("camadas");
      setPedidoAsCamadas((atual) => ({ tipo: como, vez: (atual?.vez ?? 0) + 1, faixaIds }));
    },
    canalDaSelecao: (acao) => (acao === "luminosidade" ? selecionarLuminosidade() : setJanelaDoCanal(acao)),
    podeDesfazer: edicao.nomeDesfazer,
    podeRefazer: edicao.nomeRefazer,
    area: area.area,
    painelAberto: (painel) => area.aberto(painel),
    novo: () => router.push("/app/ferramentas/editor-de-imagem"),
    abrir: () => escolherArquivo("documento"),
    recentes,
    abrirRecente: (id: string) => router.push(`/app/imagem/${id}`),
    colocarIncorporado: () => escolherArquivo("camada"),
    exportar: () => setExportando("exportar"),
    salvarParaWeb: () => setExportando("web"),
    exportacaoRapida: () => void exportacaoRapida(),
    nomeDaExportacaoRapida: formatoDe(lerPreferencias().formato).nome,
    preferenciasDeExportacao: () => setPreferenciasDeExportacao(true),
    temPranchetas: Boolean(projeto?.faixas.some((faixa) => faixa.clipes[0]?.prancheta)),
    grupoEscolhido: escolhidas.length === 1 && Boolean(escolhidas[0].clipes[0]?.pasta) && !escolhidas[0].clipes[0]?.prancheta,
    prancheta: (como) => void novaPrancheta(como),
    exportarPranchetas: () => setExportandoPranchetas(true),
    camadasEmArquivos: () => setCamadasEmArquivos(true),
    temComps: Boolean(projeto?.comps?.length),
    pesquisar: () => setPesquisando(true),
    personalizar: setPersonalizando,
    preferencias: () => setPreferindo(true),
    gradeDePerspectiva: projeto?.perspectiva ? (projeto.perspectiva.visivel ? "visivel" : "oculta") : "nenhuma",
    mudarGradeDePerspectiva: (como) => {
      if (!projeto) return;
      const atual = projeto.perspectiva;
      const documento = tamanhoDaImagem(projeto);
      if (como === "alternar") mudarGrade(atual ? { ...atual, visivel: !atual.visivel } : gradePadrao(2, documento.largura, documento.altura), false, atual?.visivel ? "ocultar a grade de perspectiva" : "mostrar a grade de perspectiva");
      else mudarGrade({ ...gradePadrao(como, documento.largura, documento.altura), ...(atual ? { celula: atual.celula, extensao: atual.extensao } : {}) }, false);
    },
    clarearInterface: (passo) => {
      const indice = TEMAS.findIndex((item) => item.id === temaAtual());
      const proximo = TEMAS[Math.min(TEMAS.length - 1, Math.max(0, indice + passo))];
      trocarTema(proximo.id);
      mostrarAviso(`Tema: ${proximo.nome.toLowerCase()}.`);
    },
    compsEmArquivos: () => setCompsEmArquivos(true),
    fatiasEmArquivos: () => setFatiasEmArquivos(true),
    informacoesDoArquivo: () => setJanelaDoArquivo("informacoes"),
    vista,
    mudarVista,
    zoomExato: (valor) => setZoom(valor),
    // O pixel CSS é 1/96 de polegada: o documento sai no tamanho de papel da resolução dele
    tamanhoDeImpressao: () => setZoom(96 / (projeto?.tamanho?.resolucao ?? 72)),
    ajustarCamadaATela: () => {
      const retangulo = retanguloDasCamadas(escolhidas.flatMap((faixa) => (faixa.clipes[0] ? [faixa.clipes[0].id] : [])));
      if (retangulo) setEnquadrar((atual) => ({ retangulo, vez: (atual?.vez ?? 0) + 1 }));
    },
    giroDaVista,
    girarVista: (giro) => setGiroDaVista((atual) => ({ ...atual, ...giro })),
    modoDeTela,
    mudarModoDeTela,
    documentosAbertos: abas,
    documentoAtual: projetoId,
    irParaDocumento: (id) => id !== projetoId && router.push(`/app/imagem/${id}`),
    documentoVizinho: (sentido) => {
      const id = documentoVizinho(abas, projetoId, sentido);
      if (id) router.push(`/app/imagem/${id}`);
    },
    fecharDocumento: fecharAba,
    fecharTodos: () => {
      mudarDocumentos([]);
      router.push("/app/ferramentas/editor-de-imagem");
    },
    temEscalaDeMedida: Boolean(projeto?.escala_de_medida),
    escalaDeMedidaPadrao: () => executar({ comando: "imagem.escalaDeMedida", parametros: { escala: null } }),
    janelaDaMedicao: setJanelaDaMedicao,
    registrarMedicoes: () => registrarMedicoes(),
    ocultarPaineis: (quais) => setPaineisOcultos((atual) => (atual === "nenhum" ? quais : "nenhum")),
    janelaDaVista: (janela) => setJanelaDaVista(janela),
    temGuias: Boolean(projeto?.guias),
    limparGuias: () => executar({ comando: "imagem.guias", parametros: { guias: { verticais: [], horizontais: [] } } }),
    guiasDaForma: () => {
      const retangulo = retanguloDasCamadas(escolhidas.flatMap((faixa) => (faixa.clipes[0] ? [faixa.clipes[0].id] : [])));
      if (!retangulo) return mostrarAviso("Escolha uma camada com conteúdo.");
      const forma = guiasDaFormaDaVista({ esquerda: retangulo.x, topo: retangulo.y, direita: retangulo.x + retangulo.largura, base: retangulo.y + retangulo.altura });
      executar({ comando: "imagem.guias", parametros: { guias: juntarGuias(projeto?.guias ?? { verticais: [], horizontais: [] }, forma) } });
    },
    variaveis: (janela) => setJanelaDasVariaveis(janela),
    conjuntos: (projeto?.variaveis?.conjuntos ?? []).map((conjunto) => conjunto.nome),
    aplicarConjunto: (indice) => {
      const conjunto = projeto?.variaveis?.conjuntos[indice];
      if (conjunto) aplicarConjuntoDeDados(conjunto);
    },
    automatizar: (tipo) => setAutomatizando(tipo),
    cortarEEndireitar: () => void cortarEEndireitarFotos(),
    ajustarImagem: () => setAjustandoImagem(true),
    script: (qual) => void (qual === "vazias" ? excluirCamadasVazias() : achatarEmTodas(qual === "efeitos" ? "rasterizarEstilo" : "aplicarMascara")),
    prova,
    mudarProva: (mudanca) => setProva((atual) => ({ ...atual, ...mudanca })),
    alertaDeGama,
    alternarAlertaDeGama: () => setAlertaDeGama((atual) => !atual),
    modoAtual: projeto?.modo?.tipo ?? "rgb",
    modoDeCor: (tipo) => {
      if (tipo === "rgb" || tipo === "cinza" || tipo === "lab") executar({ comando: "imagem.modo", parametros: { modo: { tipo } } });
      else setJanelaDoModo(tipo);
    },
    tabelaDeCores: () => setJanelaDoModo("tabela"),
    imprimir: () => setJanelaDoArquivo("imprimir"),
    duplicarDocumento: () => setJanelaDoArquivo("duplicar"),
    gerarAtivos: () => void gerarAtivosDaImagem(),
    exportarPsd: () => void exportarPsd(),
    salvar: () => mostrarAviso(edicao.salvamento === "salvo" ? "Tudo salvo: o TakeOne salva a cada mudança." : "Salvando: o TakeOne salva a cada mudança."),
    desfazer: () =>
      depoisDaPintura(() => {
        ultimoFoiDesfazer.current = true;
        desfazer();
      }),
    refazer: () =>
      depoisDaPintura(() => {
        ultimoFoiDesfazer.current = false;
        refazer();
      }),
    alternarUltimoEstado: () =>
      depoisDaPintura(() => {
        // Ctrl+Alt+Z: o último passo vai e volta (desfeito agora, refeito na próxima)
        if (ultimoFoiDesfazer.current && edicao.nomeRefazer) {
          ultimoFoiDesfazer.current = false;
          refazer();
        } else if (edicao.nomeDesfazer) {
          ultimoFoiDesfazer.current = true;
          desfazer();
        }
      }),
    novaCamada: () => void novaCamada(),
    rasterizar: (tipo) => void (tipo === "todas" ? rasterizarTodas() : mesclarEmPixels(tipo)),
    mesclar: (tipo) => void mesclarEmPixels(tipo),
    camadaDoFundo: () => {
      if (camadaDeFundoAtual) executar({ comando: "imagem.camadaDeFundo", parametros: { faixaId: camadaDeFundoAtual.id, ligar: false } });
      else if (projeto && !projeto.fundo.transparente) camadaDoFundoDoDocumento();
    },
    fundoDaCamada: () => escolhidas[0] && executar({ comando: "imagem.camadaDeFundo", parametros: { faixaId: escolhidas[0].id, ligar: true } }),
    temFundo: Boolean(camadaDeFundoAtual) || Boolean(projeto && !projeto.fundo.transparente),
    podeVirarFundo: escolhidas.length === 1 && Boolean(escolhidas[0].clipes[0].pixels) && !camadaDeFundoAtual,
    gerandoPixels,
    temMascara: Boolean(mascaraDaEscolhida),
    temMascaraVetorial: Boolean(selecionado?.clipe.mascara_vetorial),
    mascaraVetorialLigada: Boolean(selecionado?.clipe.mascara_vetorial?.ligada),
    mascaraVetorialVinculada: Boolean(selecionado?.clipe.mascara_vetorial?.vinculada),
    mascaraVetorial: (acao) => acaoMascaraVetorial(acao),
    converterSelecaoEmForma,
    mascaraLigada: Boolean(mascaraDaEscolhida?.ligada),
    mascaraVinculada: Boolean(mascaraDaEscolhida?.vinculada),
    mascaraEmFoco: Boolean(selecionado && mascaraEmFoco === selecionado.clipe.id),
    mascaraDePixels: (acao) => {
      if (!selecionado) return;
      const clipeId = selecionado.clipe.id;
      if (acao === "revelar" || acao === "ocultar" || acao === "revelarSelecao" || acao === "ocultarSelecao" || acao === "transparencia") void criarMascara(acao);
      else if (acao === "excluir") {
        if (executar({ comando: "mascara.definir", parametros: { clipeId, mascara: null } })) setMascaraEmFoco(null);
      } else if (acao === "aplicar") void mesclarEmPixels("aplicarMascara").then(() => setMascaraEmFoco(null));
      else if (acao === "ligar" && mascaraDaEscolhida) executar({ comando: "mascara.mudar", parametros: { clipeId, mudanca: { ligada: !mascaraDaEscolhida.ligada } } });
      else if (acao === "vincular" && mascaraDaEscolhida) vincularMascara(clipeId, !mascaraDaEscolhida.vinculada);
      else if (acao === "inverter") void inverterMascara();
      else if (acao === "foco") setMascaraEmFoco((atual) => (atual === clipeId || !mascaraDaEscolhida ? null : clipeId));
    },
    ferramenta: escolherFerramenta,
    ajuste: criarAjuste,
    ajusteNosPixels: (tipo) => (tipo === "inverter" ? void ajusteInstantaneo("inverter") : void abrirNosPixels({ tipo: "ajuste", ajuste: ajustePadrao(tipo, cores.primeiroPlano, cores.fundo) })),
    classico: (qual) => {
      if (qual === "dessaturar" || qual === "equalizar") return void ajusteInstantaneo(qual);
      if (qual === "sombrasRealces") return void abrirNosPixels({ tipo: "sombrasRealces", opcoes: SOMBRAS_REALCES_PADRAO });
      if (qual === "hdr") return void abrirNosPixels({ tipo: "hdr", opcoes: HDR_PADRAO });
      if (qual === "corresponder") return void abrirNosPixels({ tipo: "corresponder", opcoes: CORRESPONDER_PADRAO, origem: "documento" });
      void abrirNosPixels({ tipo: "substituir", opcoes: SUBSTITUIR_PADRAO });
    },
    automatico: (jeito) => void ajusteInstantaneo(jeito),
    filtroDoCatalogo: (tipo) => aplicarFiltroDoMenu(tipo),
    galeriaDeDesfoque: abrirGaleria,
    galeriaDeFiltros: () => void abrirGaleriaDeFiltros(),
    filtroNeural: (qual) => void abrirFiltroNeural(qual),
    ultimoFiltro: { nome: ultimoFiltro ? (FILTRO_POR_ID.get(ultimoFiltro.tipo)?.nome ?? null) : null, aplicar: () => ultimoFiltro && aplicarFiltroDoMenu(ultimoFiltro.tipo, ultimoFiltro.opcoes, true) },
    converterParaFiltrosInteligentes,
    preenchimento: {
      escolhido: Boolean(escolhidoNaTela?.clipe.camada_de_preenchimento),
      nova: novoPreenchimento,
      editar: (tipo) => escolhidoNaTela && editarPreenchimento(escolhidoNaTela.clipe.id, tipo),
    },
    documento: () => {
      setSelecao([]);
      area.abrir("propriedades");
    },
    painel: (painel) => area.abrir(painel),
    alternarPainel: (painel) => area.alternar(painel),
    duplicar: () => escolhidas.length && executar({ comando: "imagem.duplicarVarias", parametros: { faixaIds } }),
    excluir: () => escolhidas.length && executar({ comando: "imagem.apagarVarias", parametros: { faixaIds } }),
    apagarOcultas: () => executar({ comando: "imagem.apagarOcultas", parametros: {} }),
    apagarVazias: () => {
      if (!projeto) return;
      // Os grupos sem nenhuma camada dentro (os de fora primeiro: apagar um leva os vazios de dentro)
      const vazias = projeto.faixas.filter((faixa) => faixa.clipes[0]?.pasta && comDescendentes(projeto, faixa.id).every((item) => item.clipes[0]?.pasta));
      if (vazias.length) executar({ comando: "imagem.apagarVarias", parametros: { faixaIds: vazias.map((faixa) => faixa.id) } });
      else mostrarAviso("Não há grupos vazios para excluir.");
    },
    selecionarVinculadas: () => {
      if (!projeto) return;
      const vinculos = new Set(escolhidas.flatMap((faixa) => (faixa.vinculo ? [faixa.vinculo] : [])));
      if (vinculos.size) setSelecao(camadasDaImagem(projeto).filter(({ faixa }) => faixa.vinculo && vinculos.has(faixa.vinculo)).map(({ clipe }) => clipe.id));
    },
    ordenar,
    inverter: () => executar({ comando: "imagem.inverter", parametros: { faixaIds } }),
    esconder: () => escolhidas.length && executar({ comando: "imagem.camada", parametros: { faixaIds, mudanca: { oculta: !escolhidas.every((faixa) => faixa.oculta) } } }),
    bloquear: () => escolhidas.length && executar({ comando: "imagem.camada", parametros: { faixaIds, mudanca: { travada: !escolhidas.every((faixa) => faixa.travada) } } }),
    grupo: () => executar({ comando: "imagem.agrupar", parametros: { faixaIds: [] } }),
    agrupar: () => escolhidas.length && executar({ comando: "imagem.agrupar", parametros: { faixaIds } }),
    duasFormas: formasDaMescla().length === 2,
    mesclarObjetos: () => (formasDaMescla().length === 2 ? setMesclando(true) : mostrarAviso("Escolha duas formas para mesclar.")),
    objetosNoCaminho: () => {
      if (!projeto) return;
      // As escolhidas de cima para baixo: a de cima vai ao longo do caminho; o caminho é o escolhido no painel Caminhos
      // ou o da forma escolhida mais embaixo
      const escolhidasNaOrdem = projeto.faixas.map((faixa) => faixa.clipes[0]).filter((clipe) => clipe && !clipe.pasta && selecao.includes(clipe.id));
      const objeto = escolhidasNaOrdem[0];
      if (!objeto) return void mostrarAviso("Escolha a camada que vai ao longo do caminho.");
      const doPainel = caminhoDaVez?.subcaminhos.find((sub) => sub.nos.length >= 2);
      const forma = escolhidasNaOrdem.length > 1 ? escolhidasNaOrdem[escolhidasNaOrdem.length - 1] : null;
      const daForma = forma?.vetor ? caminhosDoVetorNaImagem(forma, tamanhoDaImagem(projeto)).find((sub) => sub.nos.length >= 2) : undefined;
      const caminho = doPainel ?? daForma;
      if (!caminho) return void mostrarAviso("Escolha um caminho no painel Caminhos, ou escolha também (embaixo) a forma do caminho.");
      setRepetindo({ clipeId: objeto.id, caminho, origem: doPainel ? `o caminho "${caminhoDaVez?.nome ?? "de trabalho"}"` : "a forma escolhida de baixo" });
    },
    desagrupar: () => {
      for (const faixa of escolhidas) if (faixa.clipes[0].pasta) executar({ comando: "imagem.desagrupar", parametros: { faixaId: faixa.id } });
    },
    recortar: () => escolhidas.length && executar({ comando: "imagem.camada", parametros: { faixaIds, mudanca: { recortada: !todasRecortadas } } }),
    vincular: () => executar({ comando: "imagem.vincular", parametros: { faixaIds, ligar: !vinculadas } }),
    alinhar: (como) => projeto && posicoes(alinhar(projeto, selecaoValida, caixasRef.current, como)),
    distribuir: (como) => projeto && posicoes(distribuir(projeto, selecaoValida, caixasRef.current, como)),
    camadaVizinha,
    estilo: (foco) => abrirEstiloDeCamada(foco),
    estiloDeCamada: {
      temEstilo: Boolean(escolhidoNaTela?.clipe.estilo_camada?.efeitos.length),
      temCopiado: Boolean(estiloCopiado),
      efeitosVisiveis: !projeto?.faixas.some((faixa) => faixa.clipes[0]?.estilo_camada && faixa.clipes[0].estilo_camada.ligado === false),
      copiar: () => setEstiloCopiado(escolhidoNaTela?.clipe.estilo_camada ?? null),
      colar: () => {
        const ids = escolhidas.map((faixa) => faixa.clipes[0]).filter((clipe) => !clipe.pasta && !clipe.ajuste).map((clipe) => clipe.id);
        if (estiloCopiado && ids.length) executar({ comando: "imagem.estiloDeCamada", parametros: { clipeIds: ids, estilo: estiloCopiado } });
      },
      limpar: () => {
        const ids = escolhidas.map((faixa) => faixa.clipes[0]).filter((clipe) => clipe.estilo_camada).map((clipe) => clipe.id);
        if (ids.length) executar({ comando: "imagem.estiloDeCamada", parametros: { clipeIds: ids, estilo: null } });
      },
      luzGlobal: () => setJanelaDoEstilo("luz"),
      criarCamadas: () => void criarCamadasDosEfeitos(),
      alternarVisiveis: () => executar({ comando: "imagem.mostrarEfeitos", parametros: { visiveis: Boolean(projeto?.faixas.some((faixa) => faixa.clipes[0]?.estilo_camada?.ligado === false)) } }),
      dimensionar: () => setJanelaDoEstilo("dimensionar"),
    },
    mascara: () => {
      if (camadaEscolhida && executar({ comando: "clipe.mascara", parametros: { clipeIds: [camadaEscolhida.clipe.id], mascara: camadaEscolhida.clipe.mascara ?? MASCARA_PADRAO } })) abrirAba("basico");
    },
    viaRecorte: () => void usarSelecao("recortar"),
    preencher: () => setJanelaDePixels("preencher"),
    substituicaoDoCeu: () => void abrirSubstituicaoDoCeu(),
    preenchimentoGenerativo: () => (selecaoNoDocumento ? setPreenchendoComIA(true) : mostrarAviso("Marque a área a preencher com uma ferramenta de seleção.")),
    copiar: (mesclado) => void copiar(mesclado),
    recortarPixels: () => void recortarPixels(),
    colar: (como) => void colar(como),
    novoDaAreaDeTransferencia: () => void novoDaAreaDeTransferencia(),
    camadaVia: (recortar) => void camadaVia(recortar),
    atenuar: () => setJanelaDePixels("atenuar"),
    preencherRapido: (com, preservar) => preencher({ ...ultimoPreenchimento, conteudo: com, modo: "normal", opacidade: 1, preservar }),
    limpar,
    tracado: () => selecaoNoDocumento && setJanelaDePixels("tracado"),
    cortar: cortarImagem,
    aparar: () => setJanelaDePixels("aparar"),
    desmarcar: () => {
      objeto.limpar();
      selecionarNoDocumento(null);
    },
    todasAsCamadas: () => projeto && setSelecao(camadasDaImagem(projeto).map(({ clipe }) => clipe.id)),
    desmarcarCamadas: () => setSelecao([]),
    texto: (texto) => porTexto(texto),
    textoRico: {
      modo: (edicaoDeTexto?.texto ?? textoEscolhido?.texto_rico)?.modo ?? null,
      orientacao: (edicaoDeTexto?.texto ?? textoEscolhido?.texto_rico)?.orientacao ?? (ferramenta === "textoVertical" || ferramenta === "mascaraDeTextoVertical" ? "vertical" : "horizontal"),
      suavizacao: (edicaoDeTexto?.texto ?? textoEscolhido?.texto_rico)?.estilo.suavizacao ?? opcoesDoTexto.estilo.suavizacao ?? "nitida",
      aoConverter: converterTexto,
      aoOrientacao: mudarOrientacaoDoTexto,
      aoSuavizacao: mudarSuavizacao,
      aoConverterEmForma: () => void textoEmFormaVetorial(),
      aoCaminhoDeTrabalho: () => void caminhoDoTexto(),
      editando: Boolean(edicaoDeTexto),
      aoLocalizar: () => setLocalizandoTexto(true),
      aoLorem: colarLorem,
      aoAtualizarTodas: () => void atualizarTextos(),
      aoDeformar: abrirDeformar,
    },
    filtro: aplicarFiltro,
    zoom: mudarZoom,
    area_: area.escolherArea,
    restaurarArea: area.restaurar,
    atalhos: () => setAtalhos(true),
  };
  /** Um instantâneo do Histórico: o documento inteiro, a imagem como aparece numa camada só, ou só a camada escolhida. */
  const criarInstantaneo = async (nome: string, de: OrigemDoInstantaneo) => {
    if (!projeto) return;
    const id = crypto.randomUUID().slice(0, 8);
    try {
      let estado: Projeto = projetoRef.current ?? projeto;
      if (de === "camada" && selecionado) estado = projetoSoCom(estado, [selecionado.faixa.id]);
      else if (de === "mescladas") {
        await pinturas.esperar();
        estado = projetoRef.current ?? projeto;
        const { largura, altura } = tamanhoDaImagem(estado);
        const midia = await criarCamadaDePixels(largura, altura, nome);
        const png = await exportarImagem(estado, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros });
        const versao = await enviarVersao(midia.id, png);
        const vazio = { ...estado, faixas: estado.faixas.filter((faixa) => faixa.tipo === "principal").map((faixa) => ({ ...faixa, clipes: [] })) };
        estado = executarComando(vazio, { comando: "imagem.adicionarPixels", parametros: { midiaId: midia.id, nome: "Camadas mescladas", versao } }, ctx).projeto;
      }
      setInstantaneos((atual) => [...atual, { id, nome, projeto: estado }]);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível criar o instantâneo.");
    }
  };
  // ——— As predefinições de ferramenta: as opções de cada ferramenta (as partes dela), aplicar e redefinir ———
  const predefinicoesDoEspaco = useRecursos<PredefinicaoDeFerramenta>("ferramenta");
  const opcoesDasPartes = (id: string): Partial<Record<ParteDasOpcoes, unknown>> => ({
    pincel: (pinceis as Record<string, OpcoesDoPincel>)[id],
    retoque: (opcoesDoRetoque as Record<string, OpcoesDoRetoque>)[id],
    misturador: opcoesDoMisturador,
    substituicao: opcoesDaSubstituicao,
    borrachaDeFundo: opcoesDaBorrachaDeFundo,
    carimbo: opcoesDoCarimbo,
    manchas: opcoesDasManchas,
    selecao: opcoesDaSelecao,
    forma,
    caneta,
    balde: opcoesDoBalde,
    borrachaMagica: opcoesDaBorrachaMagica,
    degrade: opcoesDoDegrade,
    texto: opcoesDoTexto,
    corte: opcoesDoCorte,
    perspectiva: opcoesDaPerspectiva,
    linhas: opcoesDosGeradores,
    reflexo: opcoesDoReflexo,
    pincelVetorial,
    liquefazer: opcoesDoLiquefazer,
  });
  /** Põe as partes nas opções da ferramenta; o que falta (uma predefinição de antes de uma opção nova) fica no padrão. */
  const aplicarPartes = (id: string, partes: Partial<Record<ParteDasOpcoes, unknown>>) => {
    const com = <T,>(padrao: T, valor: unknown): T => (valor && typeof valor === "object" ? ({ ...padrao, ...(valor as object) } as T) : padrao);
    for (const parte of partesDaFerramenta(id)) {
      if (!(parte in partes)) continue;
      const valor = partes[parte];
      if (parte === "pincel") setPinceis((atual) => ({ ...atual, [id]: com((PINCEIS_PADRAO as Record<string, OpcoesDoPincel>)[id], valor) }));
      else if (parte === "retoque") setOpcoesDoRetoque((atual) => ({ ...atual, [id]: com(RETOQUE_PADRAO, valor) }));
      else if (parte === "misturador") setOpcoesDoMisturador(com(MISTURADOR_PADRAO, valor));
      else if (parte === "substituicao") setOpcoesDaSubstituicao(com(SUBSTITUICAO_PADRAO, valor));
      else if (parte === "borrachaDeFundo") setOpcoesDaBorrachaDeFundo(com({ ...SUBSTITUICAO_PADRAO, tolerancia: 128 }, valor));
      else if (parte === "carimbo") setOpcoesDoCarimbo(com(CARIMBO_PADRAO, valor));
      else if (parte === "manchas") setOpcoesDasManchas(com(MANCHAS_PADRAO, valor));
      else if (parte === "selecao") setOpcoesDaSelecao(com(OPCOES_DA_SELECAO, valor));
      else if (parte === "forma") setForma(com(FORMA_PADRAO, valor));
      else if (parte === "caneta") setCaneta(com(CANETA_PADRAO, valor));
      else if (parte === "balde") setOpcoesDoBalde(com(BALDE_PADRAO, valor));
      else if (parte === "borrachaMagica") setOpcoesDaBorrachaMagica(com(BORRACHA_MAGICA_PADRAO, valor));
      else if (parte === "degrade") setOpcoesDoDegrade(com(DEGRADE_PADRAO, valor));
      else if (parte === "texto") setOpcoesDoTexto(com({ estilo: {}, paragrafo: {} }, valor));
      else if (parte === "corte") setOpcoesDoCorte(com(CORTE_PADRAO, valor));
      else if (parte === "perspectiva") setOpcoesDaPerspectiva(com(PERSPECTIVA_PADRAO, valor));
      else if (parte === "reflexo") setOpcoesDoReflexo(com(REFLEXO_PADRAO, valor));
      else if (parte === "pincelVetorial") setPincelVetorial(com(PINCEL_VETORIAL_PADRAO, valor));
      else if (parte === "liquefazer") setOpcoesDoLiquefazer(com(LIQUEFAZER_PADRAO, valor));
      else if (parte === "linhas") {
        const v = (valor && typeof valor === "object" ? valor : {}) as Partial<OpcoesDosGeradores>;
        // Cada ferramenta tem as medidas num objeto: o que falta fica no padrão
        setOpcoesDosGeradores({
          ...com(GERADORES_PADRAO, v),
          arco: com(GERADORES_PADRAO.arco, v.arco),
          espiral: com(GERADORES_PADRAO.espiral, v.espiral),
          grade: com(GERADORES_PADRAO.grade, v.grade),
          polar: com(GERADORES_PADRAO.polar, v.polar),
        });
      }
    }
  };
  /** Redefinir: as partes da ferramenta voltam ao padrão (um objeto vazio em cada uma). */
  const redefinirFerramenta = (id: string) => aplicarPartes(id, Object.fromEntries(partesDaFerramenta(id).map((parte) => [parte, {}])));
  const conteudoDasPredefinicoes = (
    <PredefinicoesDeFerramenta
      ferramenta={ferramenta}
      itens={predefinicoesDoEspaco.recursos.map((recurso) => ({ id: recurso.id, nome: recurso.nome, ferramenta: recurso.dados.ferramenta }))}
      nomeDaFerramenta={(id) => (TODAS_AS_FERRAMENTAS.find((item) => item.id === id)?.nome ?? id).replace(/^Ferramenta /, "")}
      podeGuardar={partesDaFerramenta(ferramenta).length > 0}
      aoEscolher={(item) => {
        const recurso = predefinicoesDoEspaco.recursos.find((r) => r.id === item.id);
        if (!recurso) return;
        if (recurso.dados.ferramenta !== ferramenta && TODAS_AS_FERRAMENTAS.some((f) => f.id === recurso.dados.ferramenta)) escolherFerramenta(recurso.dados.ferramenta as IdFerramentaDaImagem);
        aplicarPartes(recurso.dados.ferramenta, recurso.dados.opcoes);
      }}
      aoCriar={(nome) =>
        void criarRecurso({ tipo: "ferramenta", nome, dados: { ferramenta, opcoes: opcoesParaGuardar(ferramenta, opcoesDasPartes(ferramenta)) } })
          .then(() => predefinicoesDoEspaco.recarregar())
          .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível guardar a predefinição."))
      }
      aoExcluir={(id) =>
        void excluirRecurso(id)
          .then(() => predefinicoesDoEspaco.recarregar())
          .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível excluir."))
      }
      aoRedefinir={() => redefinirFerramenta(ferramenta)}
      aoRedefinirTodas={() => {
        for (const item of TODAS_AS_FERRAMENTAS) redefinirFerramenta(item.id);
        mostrarAviso("Todas as ferramentas voltaram às opções de fábrica.");
      }}
    />
  );
  // ——— As fatias ———
  const fatiasDoDocumento = projeto?.fatias ?? [];
  const mudarFatias = (fatias: Fatia[], nome: string) => {
    if (fatias.length > MAXIMO_DE_FATIAS) return mostrarAviso(`São no máximo ${MAXIMO_DE_FATIAS} fatias.`);
    executar({ comando: "imagem.fatias", parametros: { fatias, nome } });
  };
  const fatiaDaVez = fatiasDoDocumento.find((fatia) => fatia.id === fatiaEscolhida) ?? null;
  const excluirFatia = () => {
    if (!fatiaDaVez) return;
    mudarFatias(fatiasDoDocumento.filter((fatia) => fatia.id !== fatiaDaVez.id), "excluir a fatia");
    setFatiaEscolhida(null);
  };
  // ——— A linha do tempo de quadros ———
  const animacaoDoDocumento = projeto?.animacao ?? null;
  const mudarAnimacao = (animacao: AnimacaoDaImagem | null, nome: string) => executar({ comando: "imagem.animacao", parametros: { animacao, nome } });
  /** Escolher um quadro mostra as camadas como estão nele, sem virar passo do desfazer. */
  const escolherQuadro = (id: string, animacao = animacaoDoDocumento) => {
    const quadro = animacao?.quadros.find((item) => item.id === id);
    if (!quadro) return;
    setQuadroAtual(id);
    executarNoProjeto({ comando: "imagem.aplicarComp", parametros: { comp: compDoQuadro(quadro) } }, { semPasso: true });
  };
  // O que muda nas camadas vale para o quadro escolhido (junto do passo da mudança, sem outro)
  useEffect(() => {
    if (!projeto?.animacao || !quadroAtual || tocandoAnimacao) return;
    const quadro = projeto.animacao.quadros.find((item) => item.id === quadroAtual);
    if (!quadro) return;
    const estado = estadoDasCamadas(projeto);
    if (JSON.stringify(estado) === JSON.stringify(quadro.camadas)) return;
    executarNoProjeto({ comando: "imagem.animacao", parametros: { animacao: { ...projeto.animacao, quadros: projeto.animacao.quadros.map((item) => (item.id === quadro.id ? { ...item, camadas: estado } : item)) } } }, { semPasso: true });
  }, [projeto, quadroAtual, tocandoAnimacao, executarNoProjeto]);
  const pararAnimacao = () => {
    if (relogioDaAnimacao.current !== null) window.clearTimeout(relogioDaAnimacao.current);
    relogioDaAnimacao.current = null;
    setTocandoAnimacao(false);
    setProvisorio(null);
  };
  /** Tocar: cada quadro na tela pelo tempo dele, as vezes pedidas (sempre: até parar), pela mudança provisória. */
  const tocarAnimacao = () => {
    const animacao = animacaoDoDocumento;
    if (!animacao?.quadros.length) return;
    setTocandoAnimacao(true);
    let i = Math.max(0, animacao.quadros.findIndex((quadro) => quadro.id === quadroAtual));
    let volta = 0;
    const passo = () => {
      const quadro = animacao.quadros[i];
      setProvisorio({ comando: "imagem.aplicarComp", parametros: { comp: compDoQuadro(quadro) } });
      relogioDaAnimacao.current = window.setTimeout(() => {
        i++;
        if (i >= animacao.quadros.length) {
          i = 0;
          volta++;
          if (animacao.repetir && volta >= animacao.repetir) return pararAnimacao();
        }
        passo();
      }, Math.max(1000 / 30, quadro.atraso * 1000));
    };
    passo();
  };
  useEffect(() => () => {
    if (relogioDaAnimacao.current !== null) window.clearTimeout(relogioDaAnimacao.current);
  }, []);
  /** Exportar a animação: o GIF, o MP4, ou o MP4 aberto num projeto novo do editor de vídeo. */
  const exportarAnimacao = async (como: "gif" | "video" | "editor") => {
    const animacao = animacaoDoDocumento;
    if (!projeto || !animacao) return;
    try {
      await pinturas.esperar();
      const atual = projetoRef.current ?? projeto;
      const { largura, altura } = tamanhoDaImagem(atual);
      const fontes = { fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros };
      if (como === "gif") {
        const blob = await gifDaAnimacao(atual, midias, animacao, 1, fontes, mostrarAviso);
        baixarBlob(blob, `${edicao.nome || "animacao"}.gif`);
        mostrarAviso("GIF animado pronto.");
        return;
      }
      const escala = Math.min(1, 1920 / Math.max(largura, altura));
      const video = await videoDaAnimacao(atual, midias, animacao, escala, fontes, mostrarAviso);
      if (como === "video") {
        baixarBlob(video, `${edicao.nome || "animacao"}.mp4`);
        mostrarAviso("Vídeo pronto.");
        return;
      }
      // No editor de vídeo: o MP4 sobe para a biblioteca e entra num projeto novo, no formato mais perto do documento
      mostrarAviso("Enviando o vídeo para a biblioteca…");
      const midia = await enviarEEsperar(iniciarEnvio, new File([video], `${edicao.nome || "Animação"}.mp4`, { type: "video/mp4" }));
      const razao = largura / altura;
      const proporcao = PROPORCOES.reduce((melhor, item) => {
        const [a, b] = item.split(":").map(Number);
        const [c, d] = melhor.split(":").map(Number);
        return Math.abs(Math.log(a / b / razao)) < Math.abs(Math.log(c / d / razao)) ? item : melhor;
      }, PROPORCOES[0]);
      const novo = await chamarApi<Projeto>("/projetos", { metodo: "POST", corpo: { nome: edicao.nome || "Animação", proporcao } });
      const comClipe = executarComando(novo, { comando: "clipe.adicionar", parametros: { midiaId: midia.id } }, contextoDasMidias(new Map([[midia.id, midia]]))).projeto;
      await chamarApi(`/projetos/${novo.id}`, { metodo: "PUT", corpo: { versao: novo.versao, nome: novo.nome, proporcao: novo.proporcao, taxa: novo.taxa, fundo: novo.fundo, faixas: comClipe.faixas, marcadores: [] } });
      router.push(`/app/editor/${novo.id}`);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível exportar a animação.");
    }
  };
  // ——— A medição (Imagem › Análise): as notas, o Registro de medições e o marcador de escala ———
  const mudarNotas = (notas: Nota[], escolhida?: string) => {
    executar({ comando: "imagem.notas", parametros: { notas } });
    if (escolhida !== undefined) setNotaEscolhida(escolhida);
    else if (!notas.some((nota) => nota.id === notaEscolhida)) setNotaEscolhida(null);
    if (escolhida && !area.aberto("notas")) area.abrir("notas");
  };
  /** Da Régua (com ela escolhida e uma medida), da Contagem (com ela escolhida) ou da seleção, como lá. */
  const registrarMedicoes = () => {
    if (!projeto) return;
    const base = { id: novoId(), rotulo: `Medição ${medicoesFeitas.current + 1}`, data: new Date().toLocaleString("pt-BR"), documento: edicao.nome, escala: projeto.escala_de_medida };
    const registrar = (medicao: Medicao) => {
      medicoesFeitas.current++;
      setMedicoes((atual) => [...atual, medicao]);
      if (!area.aberto("registro")) area.abrir("registro");
    };
    if (ferramenta === "regua" && medida) return registrar(medicaoDaRegua(base, medida.de, medida.ate));
    if (ferramenta === "contagem") return registrar(medicaoDaContagem(base, projeto.contagem));
    const selecao = selecaoNoDocumento;
    if (selecao) {
      imagemParaSelecao(true)
        .then((imagem) => {
          const medidas = medirSelecao(selecao, imagem);
          if (medidas) registrar(medicaoDaSelecao(base, medidas));
        })
        .catch(() => mostrarAviso("Não foi possível ler a imagem para medir."));
      return;
    }
    if (medida) return registrar(medicaoDaRegua(base, medida.de, medida.ate));
    if (totalDaContagem(projeto.contagem)) return registrar(medicaoDaContagem(base, projeto.contagem));
    mostrarAviso("Faça uma seleção, uma medida com a Régua ou uma contagem para registrar.");
  };
  /** Imagem › Análise › Inserir marcador de escala: a barra no comprimento pedido e o número, no canto de baixo. */
  const inserirMarcadorDeEscala = async (opcoes: OpcoesDoMarcador) => {
    if (!projeto) return;
    const documento = tamanhoDaImagem(projeto);
    const escala = projeto.escala_de_medida ?? ESCALA_PADRAO;
    const comprimento = (opcoes.comprimento * escala.pixels) / escala.comprimento;
    if (comprimento < 2 || comprimento > documento.largura * 4) return mostrarAviso("A barra ficaria pequena ou grande demais para a imagem: mude o comprimento.");
    const lado = Math.min(documento.largura, documento.altura);
    const margem = Math.round(lado * 0.04);
    const altura = Math.max(2, Math.round(lado * 0.008));
    const cor = opcoes.cor === "preto" ? "#000000" : "#ffffff";
    const embaixo = opcoes.mostrarTexto && opcoes.textoEmBaixo;
    const topoDaBarra = documento.altura - margem - altura - (embaixo ? Math.round(opcoes.fonte * 1.3) : 0);
    const barra = camadaDaForma({ tipo: "retangulo", largura: comprimento, altura, raios: [0, 0, 0, 0] }, { tipo: "cor", cor }, null);
    const centro = { x: margem + barra.caixa.largura / 2, y: topoDaBarra + barra.caixa.altura / 2 };
    let texto: TextoRico | null = null;
    if (opcoes.mostrarTexto) {
      const numero = (Math.round(opcoes.comprimento * 1000) / 1000).toLocaleString("pt-BR");
      const novo = textoNovo(`${numero} ${escala.unidade}`, { tamanho: opcoes.fonte, cor });
      await esperarFontes([novo]);
      texto = textoMedido(novo);
    }
    // O ponto do texto é o começo da linha de base
    const ponto = { x: margem, y: embaixo ? topoDaBarra + altura + Math.round(opcoes.fonte * 1.05) : topoDaBarra - Math.round(opcoes.fonte * 0.35) };
    executar({ comando: "imagem.marcadorDeEscala", parametros: { barra, centro, texto, ponto, acima: null } });
  };
  const janelaAberta = exportando || fatiasEmArquivos || janelaDaFatia !== null || preferindo || personalizando !== null || pesquisando || compsEmArquivos || paradaDaAcao !== null || janelaDoHistorico !== null || janelaDaMedicao !== null || janelaDaVista !== null || janelaDasVariaveis !== null || automatizando !== null || ajustandoImagem || preferenciasDeExportacao || camadasEmArquivos || janelaDoArquivo !== null || janelaDoModo !== null || exportandoPranchetas || atalhos || trocando !== null || modificando !== null || janelaDaSelecao !== null || janelaDoCanal !== null || nomeDoPincel || nomeDoPadrao || nomeDaForma || janelaDoDocumento !== null || dissolvendo !== null || escalando !== null || pontoDeFuga !== null || janelaDasCamadas !== null || refinando !== null || janelaDePixels !== null || editandoDegrade;

  // As teclas sem Ctrl: as ferramentas, as cores, as setas e o Enter e o Esc do corte e da seleção
  const teclas = useEffectEvent((evento: KeyboardEvent) => {
    if (!projeto || janelaAberta || evento.defaultPrevented) return;
    const alvo = evento.target as HTMLElement;
    if (alvo.closest("input, textarea, select, [contenteditable='true'], [role='menu']")) return;
    if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
    const tecla = evento.key.length === 1 ? evento.key.toUpperCase() : evento.key;
    // Com uma ferramenta de pintura, os números dão a opacidade dela; fora delas, a das camadas escolhidas
    if (/^[0-9]$/.test(tecla) && ferramentaDePintura) {
      mudarPincel({ opacidade: tecla === "0" ? 1 : Number(tecla) / 10 });
      evento.preventDefault();
      return;
    }
    if (/^[0-9]$/.test(tecla) && escolhidas.length && !MODO_DA_SELECAO[ferramenta]) {
      const clipeIds = escolhidas.filter((faixa) => !faixa.travada).map((faixa) => faixa.clipes[0].id);
      if (clipeIds.length) executar({ comando: "clipe.transformar", parametros: { clipeIds, transformacao: { opacidade: tecla === "0" ? 1 : Number(tecla) / 10 } } });
      evento.preventDefault();
      return;
    }
    if (recorte && (tecla === "X" || tecla === "O" || tecla === "H")) {
      evento.preventDefault();
      if (tecla === "X") setRecorte({ ...recorte, largura: recorte.altura, altura: recorte.largura });
      else if (tecla === "H") setOpcoesDoCorte((atual) => ({ ...atual, mostrarCortada: !atual.mostrarCortada }));
      else if (evento.shiftKey) setOpcoesDoCorte((atual) => ({ ...atual, orientacaoDaEspiral: (atual.orientacaoDaEspiral + 1) % 4 }));
      else setOpcoesDoCorte((atual) => ({ ...atual, sobreposicao: SOBREPOSICOES_DO_CORTE[(SOBREPOSICOES_DO_CORTE.findIndex((item) => item.id === atual.sobreposicao) + 1) % SOBREPOSICOES_DO_CORTE.length].id }));
      return;
    }
    const comTecla = TODAS_AS_FERRAMENTAS.filter((item) => teclaDaFerramenta(item, personalizacao) === tecla);
    if (comTecla.length) {
      // Segurando a tecla, o navegador repete o evento: a ferramenta já está escolhida (e a mola conta o tempo)
      if (evento.repeat) {
        evento.preventDefault();
        return;
      }
      // Shift + a tecla passa à seguinte do grupo; sem Shift, volta à última usada do grupo (entre as da tecla)
      const atualNoGrupo = comTecla.some((item) => item.id === ferramenta);
      const grupo = grupoDa(comTecla[0].id);
      const indice = GRUPOS_DE_FERRAMENTAS.indexOf(grupo);
      const ultima = ultimas[indice];
      let id = ultima && comTecla.some((item) => item.id === ultima) ? ultima : comTecla[0].id;
      // Shift passa só pelas do grupo com a mesma tecla (o letreiro de linha única não tem tecla, como lá)
      const comAMesma = grupo.filter((item) => teclaDaFerramenta(item, personalizacao) === tecla);
      // Sem o Shift para trocar (Editar › Preferências), a mesma tecla de novo já passa à seguinte
      if ((evento.shiftKey || !vista.shiftTrocaFerramenta) && atualNoGrupo) id = comAMesma[(comAMesma.findIndex((item) => item.id === ferramenta) + 1) % comAMesma.length].id;
      if (id !== ferramenta) mola.current = { tecla, anterior: ferramenta, inicio: performance.now() };
      escolherFerramenta(id);
    } else if (tecla === "D") setCores((atual) => ({ ...atual, primeiroPlano: "#000000", fundo: "#ffffff" }));
    else if (tecla === "X") setCores((atual) => ({ ...atual, primeiroPlano: atual.fundo, fundo: atual.primeiroPlano }));
    else if ((tecla === "[" || tecla === "]") && ferramenta === "selecaoRapida") {
      const t = opcoesDaSelecao.tamanhoRapida;
      const passo = t < 10 ? 1 : t < 100 ? 5 : 25;
      setOpcoesDaSelecao((atual) => ({ ...atual, tamanhoRapida: Math.min(500, Math.max(1, tecla === "]" ? t + passo : t - passo)) }));
    } else if ((tecla === "[" || tecla === "]") && ferramenta === "remover") objeto.setTamanhoDoPincel(Math.min(0.2, Math.max(0.01, objeto.tamanhoDoPincel * (tecla === "]" ? 1.25 : 0.8))));
    else if (ferramentaDePintura && (tecla === "[" || tecla === "]" || tecla === "{" || tecla === "}")) {
      const opcoes = pinceis[ferramentaDePintura];
      const maior = tecla === "]" || tecla === "}";
      if (evento.shiftKey || tecla === "{" || tecla === "}") mudarPincel({ dureza: Math.min(1, Math.max(0, Math.round((opcoes.dureza + (maior ? 0.25 : -0.25)) * 4) / 4)) });
      else {
        // Os degraus dos editores de imagem: de 1 em 1 até 10, de 10 em 10 até 100, depois maiores
        const t = opcoes.tamanho;
        const passo = t < 10 ? 1 : t < 100 ? 10 : t < 200 ? 25 : t < 500 ? 50 : 100;
        mudarPincel({ tamanho: Math.min(5000, Math.max(1, maior ? t + passo : t - (t <= 10 ? 1 : t <= 100 ? 10 : passo))) });
      }
    }
    else if (tecla === "Enter" && transformando) confirmarTransformacao();
    else if (tecla === "Escape" && transformando) setTransformando(null);
    else if (tecla === "Enter" && recorte) void confirmarCorte();
    else if (tecla === "Enter" && cortePerspectiva) void confirmarCortePerspectiva();
    else if (tecla === "Escape") {
      if (recorte) cancelarCorte();
      else if (temSelecao || objeto.pontos.length) objeto.limpar();
      else setSelecao([]);
    } else if ((tecla === "Delete" || tecla === "Backspace") && ferramenta === "selecaoDeFatia" && fatiaEscolhida) excluirFatia();
    else if ((tecla === "Delete" || tecla === "Backspace") && selecaoNoDocumento && selecionado?.clipe.pixels) limpar();
    else if ((tecla === "Delete" || tecla === "Backspace") && escolhidas.length && !escolhidas.some((faixa) => faixa.travada)) executar({ comando: "imagem.apagarVarias", parametros: { faixaIds } });
    else if (escolhidas.length && evento.key.startsWith("Arrow")) {
      // Um pixel da imagem por toque (dez com Shift), em frações do quadro, com as pastas e as vinculadas
      const { largura, altura } = tamanhoDaImagem(projeto);
      const passo = evento.shiftKey ? 10 : 1;
      const dx = evento.key === "ArrowLeft" ? -passo / largura : evento.key === "ArrowRight" ? passo / largura : 0;
      const dy = evento.key === "ArrowUp" ? -passo / altura : evento.key === "ArrowDown" ? passo / altura : 0;
      posicoes(mudancasDoDeslocamento(dx, dy));
    } else return;
    evento.preventDefault();
  });
  useEffect(() => {
    const ouvir = (evento: KeyboardEvent) => teclas(evento);
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, []);
  const soltarMola = useEffectEvent((evento: KeyboardEvent) => {
    const atual = mola.current;
    if (!atual || evento.key.toUpperCase() !== atual.tecla) return;
    mola.current = null;
    // Um toque rápido troca de ferramenta; segurada (e usada) mais que isso, a tecla só emprestou a ferramenta
    if (performance.now() - atual.inicio > SEGURAR_A_FERRAMENTA_MS) escolherFerramenta(atual.anterior);
  });
  useEffect(() => {
    const ouvir = (evento: KeyboardEvent) => soltarMola(evento);
    window.addEventListener("keyup", ouvir);
    return () => window.removeEventListener("keyup", ouvir);
  }, []);

  if (edicao.erroCarga) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-fundo p-6 text-center">
        <p className="text-sm">{edicao.erroCarga}</p>
        <Link href="/app" className="botao-secundario px-3 py-1.5">
          Voltar ao início
        </Link>
      </div>
    );
  }
  if (!projeto || !projetoNaTela) {
    return (
      <div className="flex h-dvh items-center justify-center gap-2 bg-fundo text-sm text-suave">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Abrindo a imagem…
      </div>
    );
  }
  if (projeto.tipo !== "imagem") return <Redirecionar para={enderecoDoProjeto({ id: projetoId, tipo: projeto.tipo })} />;

  const imagensProntas = (biblioteca.midias ?? []).filter((midia) => midia.imagem && !midia.elemento && !midia.camada_pixels && !midia.animacao);
  const tamanho = tamanhoDaImagem(projetoNaTela);
  const zoomNaTela = zoom ?? zoomMedido;

  const paineis: Record<IdPainelDaImagem, Painel> = {
    cor: { nome: PAINEIS_DA_IMAGEM.cor, conteudo: <PainelCor cores={cores} aoMudar={(qual, cor) => setCores((atual) => ({ ...atual, [qual]: cor }))} aoEscolherEditada={(qual) => setCores((atual) => ({ ...atual, editando: qual }))} /> },
    amostras: { nome: PAINEIS_DA_IMAGEM.amostras, conteudo: <PainelAmostras aoEscolher={(cor, paraOFundo) => setCores((atual) => ({ ...atual, [paraOFundo ? "fundo" : "primeiroPlano"]: cor }))} /> },
    formas: {
      nome: PAINEIS_DA_IMAGEM.formas,
      conteudo: (
        <PainelFormasPersonalizadas
          escolhida={forma.personalizada}
          doEspaco={formasDoEspaco}
          aoEscolher={(personalizada) => {
            setForma((atual) => ({ ...atual, personalizada }));
            escolherFerramenta("formaPersonalizada");
          }}
          aoPor={(id) => {
            // No meio da imagem, com um terço do lado menor
            const { largura, altura } = tamanho;
            const lado = Math.min(largura, altura) / 3;
            porFormaPersonalizada(id, { x: (largura - lado) / 2, y: (altura - lado) / 2, largura: lado, altura: lado }, true);
          }}
          aoExcluir={(id) => void excluirRecurso(id).then(recursosDasFormas.recarregar)}
        />
      ),
    },
    propriedades: {
      nome: PAINEIS_DA_IMAGEM.propriedades,
      conteudo:
        selecionado && mascaraVetorialEmFoco === selecionado.clipe.id && selecionado.clipe.mascara_vetorial ? (
          <PropriedadesDaMascaraVetorial
            clipeId={selecionado.clipe.id}
            mascara={escolhidoNaTela?.clipe.mascara_vetorial ?? selecionado.clipe.mascara_vetorial}
            travada={selecionado.faixa.travada}
            aoPrever={preverDoPainel}
            aoExecutar={executar}
            aoAcao={(acao) => acaoMascaraVetorial(acao)}
          />
        ) : selecionado && mascaraEmFoco === selecionado.clipe.id && selecionado.clipe.mascara_pixels ? (
          <PropriedadesDaMascara
            clipeId={selecionado.clipe.id}
            mascara={selecionado.clipe.mascara_pixels}
            travada={selecionado.faixa.travada}
            aoPrever={preverDoPainel}
            aoExecutar={executar}
            aoAcao={(acao) => acoes.mascaraDePixels(acao)}
          />
        ) : selecionado && escolhidoNaTela?.clipe.ajuste_imagem ? (
          <PropriedadesDoAjuste
            key={selecionado.clipe.id}
            clipeId={selecionado.clipe.id}
            faixa={escolhidoNaTela.faixa}
            ajuste={escolhidoNaTela.clipe.ajuste_imagem}
            imagem={imagemAbaixo}
            primeiroPlano={cores.primeiroPlano}
            fundo={cores.fundo}
            degradesDoEspaco={degradesDoEspaco.recursos.map((recurso) => recurso.dados)}
            aoPedirAmostra={(receber) => setPedidoDeAmostra(receber ? { clipeId: selecionado.clipe.id, receber } : null)}
            amostrando={Boolean(amostraDoAjuste)}
            aoPrever={preverDoPainel}
            aoExecutar={executar}
            aoVerSem={(ver) => setProvisorio(ver ? { comando: "imagem.camada", parametros: { faixaIds: [selecionado.faixa.id], mudanca: { oculta: true } } } : null)}
            aoExcluir={acoes.excluir}
          />
        ) : (
        <PainelPropriedades
          modo="imagem"
          midia={midiaDoClipe}
          midias={midias}
          selecionado={escolhidoNaTela}
          taxa={projeto.taxa}
          tempo={0}
          aoBuscar={NADA}
          proporcao={projeto.proporcao}
          faixas={projeto.faixas}
          aoAvisar={mostrarAviso}
          aoTrocarMidia={(clipeIds, midia) => esperarMidia(midia, { trocar: clipeIds })}
          seguirObjeto={SEM_SEGUIR}
          aoTrocarImagem={setTrocando}
          aoMaisVariacoes={(clipeId) => void maisVariacoes(clipeId)}
          aoSelecionarAssunto={() => void selecionarAssunto()}
          fundo={projeto.fundo.cor}
          aoPrever={preverDoPainel}
          aoExecutar={executar}
          pedidoDeAba={pedidoDeAba}
          semSelecao={<PropriedadesDoDocumento projeto={projetoNaTela} aoPrever={preverDoPainel} aoExecutar={executar} />}
          formas={{ quadro: tamanho, primeiroPlano: cores.primeiroPlano, fundo: cores.fundo, degrades: degradesDoEspaco.recursos.map((recurso) => recurso.dados), aoEscolherFoto: setTrocando }}
          className="h-full"
        />
        ),
    },
    notas: {
      nome: PAINEIS_DA_IMAGEM.notas,
      conteudo: <PainelNotas notas={projeto.notas ?? []} escolhida={notaEscolhida} aoEscolher={setNotaEscolhida} aoMudar={mudarNotas} />,
    },
    registro: {
      nome: PAINEIS_DA_IMAGEM.registro,
      conteudo: <PainelRegistro medicoes={medicoes} aoRegistrar={registrarMedicoes} aoExcluir={(ids) => setMedicoes((atual) => atual.filter((m) => !ids.includes(m.id)))} />,
    },
    informacoes: {
      nome: PAINEIS_DA_IMAGEM.informacoes,
      conteudo: (
        <PainelInformacoes
          imagem={imagemDasInformacoes}
          modo={projeto.modo}
          amostra={ladoDaAmostra}
          unidade={vista.unidade}
          ppi={projeto.tamanho?.resolucao ?? 72}
          documento={tamanho}
          selecao={limitesDaSelecao}
          amostradores={amostradores}
          aoLimparAmostradores={() => setAmostradores([])}
          aoTirarAmostrador={(indice) => setAmostradores((atual) => atual.filter((_, i) => i !== indice))}
          dica={dadosDa(ferramenta).dica}
        />
      ),
    },
    navegador: {
      nome: PAINEIS_DA_IMAGEM.navegador,
      conteudo: <PainelNavegador miniatura={miniaturaDoNavegador} documento={tamanho} zoom={zoomNaTela} aoMudarZoom={setZoom} />,
    },
    predefinicoes: { nome: PAINEIS_DA_IMAGEM.predefinicoes, conteudo: conteudoDasPredefinicoes },
    teclasModificadoras: { nome: PAINEIS_DA_IMAGEM.teclasModificadoras, conteudo: <PainelTeclasModificadoras /> },
    linhaDoTempo: {
      nome: PAINEIS_DA_IMAGEM.linhaDoTempo,
      conteudo: (
        <PainelLinhaDoTempo
          projeto={projeto}
          midias={midias}
          animacao={animacaoDoDocumento}
          atual={quadroAtual}
          tocando={tocandoAnimacao}
          aoCriar={() => {
            const id = crypto.randomUUID().slice(0, 12);
            mudarAnimacao({ quadros: [novoQuadro(projeto, id)], repetir: 0 }, "criar a animação");
            setQuadroAtual(id);
          }}
          aoEscolher={(id) => {
            if (tocandoAnimacao) pararAnimacao();
            escolherQuadro(id);
          }}
          aoDuplicar={() => {
            if (!animacaoDoDocumento) return;
            const id = crypto.randomUUID().slice(0, 12);
            const onde = animacaoDoDocumento.quadros.findIndex((quadro) => quadro.id === quadroAtual) + 1 || animacaoDoDocumento.quadros.length;
            const atraso = animacaoDoDocumento.quadros[onde - 1]?.atraso ?? 0.5;
            const quadros = [...animacaoDoDocumento.quadros.slice(0, onde), novoQuadro(projeto, id, atraso), ...animacaoDoDocumento.quadros.slice(onde)];
            if (quadros.length > MAXIMO_DE_QUADROS) return mostrarAviso(`São no máximo ${MAXIMO_DE_QUADROS} quadros.`);
            mudarAnimacao({ ...animacaoDoDocumento, quadros }, "duplicar o quadro");
            setQuadroAtual(id);
          }}
          aoExcluir={(id) => {
            if (!animacaoDoDocumento) return;
            const onde = animacaoDoDocumento.quadros.findIndex((quadro) => quadro.id === id);
            const nova = { ...animacaoDoDocumento, quadros: animacaoDoDocumento.quadros.filter((quadro) => quadro.id !== id) };
            mudarAnimacao(nova, "excluir o quadro");
            const vizinho = nova.quadros[Math.min(onde, nova.quadros.length - 1)];
            if (vizinho) escolherQuadro(vizinho.id, nova);
          }}
          aoMover={(id, passo) => {
            if (!animacaoDoDocumento) return;
            const quadros = [...animacaoDoDocumento.quadros];
            const de = quadros.findIndex((quadro) => quadro.id === id);
            const para = de + passo;
            if (de < 0 || para < 0 || para >= quadros.length) return;
            [quadros[de], quadros[para]] = [quadros[para], quadros[de]];
            mudarAnimacao({ ...animacaoDoDocumento, quadros }, "mover o quadro");
          }}
          aoAtraso={(id, atraso) => animacaoDoDocumento && mudarAnimacao({ ...animacaoDoDocumento, quadros: animacaoDoDocumento.quadros.map((quadro) => (quadro.id === id ? { ...quadro, atraso } : quadro)) }, "mudar o tempo do quadro")}
          aoRepetir={(repetir) => animacaoDoDocumento && mudarAnimacao({ ...animacaoDoDocumento, repetir }, "mudar a repetição")}
          aoTocar={tocarAnimacao}
          aoParar={pararAnimacao}
          aoInterpolar={(quantos) => {
            if (!animacaoDoDocumento) return;
            const onde = animacaoDoDocumento.quadros.findIndex((quadro) => quadro.id === quadroAtual);
            const [a, b] = [animacaoDoDocumento.quadros[onde], animacaoDoDocumento.quadros[onde + 1]];
            if (!a || !b) return;
            const quadros = [...animacaoDoDocumento.quadros.slice(0, onde + 1), ...interpolar(a, b, quantos, () => crypto.randomUUID().slice(0, 12)), ...animacaoDoDocumento.quadros.slice(onde + 1)];
            if (quadros.length > MAXIMO_DE_QUADROS) return mostrarAviso(`São no máximo ${MAXIMO_DE_QUADROS} quadros.`);
            mudarAnimacao({ ...animacaoDoDocumento, quadros }, "interpolar");
          }}
          aoExportar={(como) => void exportarAnimacao(como)}
          aoExcluirAnimacao={() => {
            pararAnimacao();
            mudarAnimacao(null, "excluir a animação");
            setQuadroAtual(null);
          }}
        />
      ),
    },
    comps: {
      nome: PAINEIS_DA_IMAGEM.comps,
      conteudo: (
        <PainelComps
          comps={projeto.comps ?? []}
          aplicada={compAplicada}
          temUltimaPosicao={Boolean(ultimaPosicao)}
          sumidas={(comp) => camadasQueSumiram(projeto, comp)}
          aoAplicar={(id) => {
            if (id === null) {
              if (ultimaPosicao) executar({ comando: "imagem.aplicarComp", parametros: { comp: ultimaPosicao } });
              setUltimaPosicao(null);
              setCompAplicada(null);
              return;
            }
            const comp = projeto.comps?.find((item) => item.id === id);
            if (!comp) return;
            // A primeira comp aplicada guarda o estado de antes, para a última posição do documento
            if (!ultimaPosicao) setUltimaPosicao(novaComp(projeto, "ultima", { nome: "Última posição do documento", comentario: "", visibilidade: true, posicao: true, aparencia: true }));
            executar({ comando: "imagem.aplicarComp", parametros: { comp } });
            setCompAplicada(id);
          }}
          aoCriar={(opcoes) => {
            const id = crypto.randomUUID().slice(0, 12);
            executar({ comando: "imagem.comps", parametros: { comps: [...(projeto.comps ?? []), novaComp(projeto, id, opcoes)], nome: "nova comp de camada" } });
            setCompAplicada(id);
            setUltimaPosicao(null);
          }}
          aoAtualizar={(id) => executar({ comando: "imagem.comps", parametros: { comps: (projeto.comps ?? []).map((comp) => (comp.id === id ? atualizarComp(comp, projeto) : comp)), nome: "atualizar a comp de camada" } })}
          aoMudar={(id, opcoes) => executar({ comando: "imagem.comps", parametros: { comps: (projeto.comps ?? []).map((comp) => (comp.id === id ? { ...comp, ...opcoes } : comp)), nome: "mudar a comp de camada" } })}
          aoExcluir={(id) => {
            executar({ comando: "imagem.comps", parametros: { comps: (projeto.comps ?? []).filter((comp) => comp.id !== id), nome: "excluir a comp de camada" } });
            if (compAplicada === id) setCompAplicada(null);
          }}
        />
      ),
    },
    acoes: {
      nome: PAINEIS_DA_IMAGEM.acoes,
      conteudo: <PainelAcoes acoes={acoesDoEspaco} aoAvisar={mostrarAviso} />,
    },
    histograma: {
      nome: PAINEIS_DA_IMAGEM.histograma,
      conteudo: <PainelHistograma imagem={imagemDoHistograma} selecao={selecaoNoDocumento} origem={origemDoHistograma} temCamada={Boolean(selecionado)} aoMudarOrigem={setOrigemDoHistograma} />,
    },
    ajustes: { nome: PAINEIS_DA_IMAGEM.ajustes, conteudo: <PainelAjustes aoCriar={criarAjuste} aoCriarPronto={criarAjustePronto} /> },
    biblioteca: {
      nome: PAINEIS_DA_IMAGEM.biblioteca,
      conteudo: (
        <PainelBiblioteca
          imagens={imagensProntas}
          erro={biblioteca.erro}
          quadro={tamanho}
          aoPorImagem={(midia) => (selecionado?.clipe.vetor?.quadro ? porFotoNoQuadro(selecionado.clipe.id, midia.id) : executar({ comando: "imagem.adicionarMidia", parametros: { midiaId: midia.id } }))}
          noQuadro={Boolean(selecionado?.clipe.vetor?.quadro)}
          aoGerada={(midia) => {
            esperarMidia(midia);
            mostrarAviso("Gerando a imagem: ela entra como camada quando ficar pronta (uns 3 min).");
          }}
        />
      ),
    },
    modelos: { nome: PAINEIS_DA_IMAGEM.modelos, conteudo: <PainelModelosDaImagem aplicando={aplicando} aoAplicar={aplicarModelo} /> },
    estilos: {
      nome: PAINEIS_DA_IMAGEM.estilos,
      conteudo: (
        <div className="grid grid-cols-2 gap-1.5 p-3">
          {ESTILOS_DE_TEXTO.map((estilo) => (
            <button key={estilo.id} type="button" onClick={() => porTexto(estilo.texto)} className="flex h-16 items-center justify-center rounded border border-borda bg-painel-3 p-1 transition hover:border-destaque" title={estilo.nome}>
              <MiniaturaDoEstilo texto={estilo.texto} nome={estilo.nome} />
            </button>
          ))}
        </div>
      ),
    },
    filtros: {
      nome: PAINEIS_DA_IMAGEM.filtros,
      conteudo: (
        <div className="p-3">
          <PainelEfeitos selecionado={selecionado} aoPrever={preverDoPainel} aoExecutar={executar} />
        </div>
      ),
    },
    fotoIA: {
      nome: PAINEIS_DA_IMAGEM.fotoIA,
      conteudo: (
        <div className="p-3">
          <PainelFotoIA
            foto={foto}
            quadro={tamanho}
            aoPedir={(acao, midia) => {
              if (!selecionado) return;
              // Ampliada: a foto da camada é trocada; expandida: entra uma camada nova com tudo da camada
              esperarMidia(midia, acao === "ampliar" ? { trocar: [selecionado.clipe.id] } : { camadaDe: selecionado.faixa.id });
              mostrarAviso(acao === "ampliar" ? "Ampliando a foto: ela troca quando ficar pronta." : "Expandindo a foto: ela entra numa camada nova quando ficar pronta.");
            }}
          />
        </div>
      ),
    },
    fonteDeClonagem: {
      nome: PAINEIS_DA_IMAGEM.fonteDeClonagem,
      conteudo: (
        <PainelFonteDeClonagem
          fontes={fontesDeClonagem}
          ativa={fonteAtiva}
          opcoes={opcoesDoCarimbo}
          aoEscolher={setFonteAtiva}
          aoMudar={(mudanca) => setOpcoesDoCarimbo((atual) => ({ ...atual, ...mudanca }))}
          aoMudarDeslocamento={(deslocamento) => setFontesDeClonagem((atual) => atual.map((item, i) => (i === fonteAtiva && item ? { ...item, deslocamento } : item)))}
        />
      ),
    },
    padroes: {
      nome: PAINEIS_DA_IMAGEM.padroes,
      conteudo: (
        <PainelPadroes
          doEspaco={padroesDoEspaco.recursos.map((recurso) => ({ id: recurso.id, nome: recurso.nome }))}
          escolhido={opcoesDoBalde.padrao}
          primeiroPlano={cores.primeiroPlano}
          fundo={cores.fundo}
          importando={importandoPadroes}
          aoEscolher={escolherPadrao}
          aoExcluir={(id) => void excluirRecurso(id).then(padroesDoEspaco.recarregar)}
          aoDefinir={() => setNomeDoPadrao(true)}
          aoImportar={(arquivo) => void importarPadroes(arquivo)}
        />
      ),
    },
    degrades: {
      nome: PAINEIS_DA_IMAGEM.degrades,
      conteudo: (
        <PainelDegrades
          doEspaco={degradesDoEspaco.recursos.map((recurso) => ({ id: recurso.id, degrade: recurso.dados }))}
          primeiroPlano={cores.primeiroPlano}
          fundo={cores.fundo}
          aoEscolher={(degrade) => {
            setOpcoesDoDegrade((atual) => ({ ...atual, degrade }));
            escolherFerramenta("degrade");
          }}
          aoExcluir={(id) => void excluirRecurso(id).then(degradesDoEspaco.recarregar)}
        />
      ),
    },
    caractere: {
      nome: PAINEIS_DA_IMAGEM.caractere,
      conteudo: (
        <PainelCaractere
          estilo={estiloNaBarra}
          aoEstilo={mudarEstiloDoTexto}
          aoPreverFonte={setFonteEmPrevia}
          kernManual={kernNoCursor}
          aoKern={(valor) => mudarKern(valor)}
          suavizacao={(edicaoDeTexto?.texto ?? textoEscolhido?.texto_rico)?.estilo.suavizacao ?? opcoesDoTexto.estilo.suavizacao}
          aoSuavizacao={mudarSuavizacao}
          estilosSalvos={
            <EstilosSalvos
              titulo="Estilos de caractere"
              estilos={estilosDeCaractere.recursos}
              aoAplicar={(id) => {
                const salvo = estilosDeCaractere.recursos.find((item) => item.id === id);
                if (salvo) mudarEstiloDoTexto(salvo.dados.estilo);
              }}
              aoSalvar={(nome) => salvarEstiloDeTexto("estilo_caractere", nome)}
              aoExcluir={(id) => excluirEstiloDeTexto("estilo_caractere", id)}
            />
          }
        />
      ),
    },
    estilosDeCamada: {
      nome: PAINEIS_DA_IMAGEM.estilosDeCamada,
      conteudo: (
        <PainelEstilosDeCamada
          doEspaco={estilosDeCamadaDoEspaco.recursos.map((recurso) => ({ id: recurso.id, nome: recurso.nome, estilo: recurso.dados.estilo, preenchimento: recurso.dados.preenchimento ?? 1 }))}
          podeAplicar={escolhidas.some((faixa) => !faixa.clipes[0].pasta && !faixa.clipes[0].ajuste)}
          podeGuardar={Boolean(escolhidoNaTela?.clipe.estilo_camada?.efeitos.length)}
          aoAplicar={(estilo, preenchimento) => {
            const ids = escolhidas.map((faixa) => faixa.clipes[0]).filter((clipe) => !clipe.pasta && !clipe.ajuste).map((clipe) => clipe.id);
            if (ids.length) executar({ comando: "imagem.estiloDeCamada", parametros: { clipeIds: ids, estilo, camada: { preenchimento } } });
          }}
          aoGuardar={(nome) => {
            const clipe = escolhidoNaTela?.clipe;
            if (!clipe?.estilo_camada) return;
            criarRecurso({ tipo: "estilo_camada", nome, dados: { estilo: clipe.estilo_camada, preenchimento: clipe.preenchimento ?? 1 } })
              .then(() => estilosDeCamadaDoEspaco.recarregar())
              .catch((erro: unknown) => mostrarAviso(erro instanceof Error ? erro.message : "Não foi possível salvar o estilo."));
          }}
          aoExcluir={(id) => {
            excluirRecurso(id)
              .then(() => estilosDeCamadaDoEspaco.recarregar())
              .catch((erro: unknown) => mostrarAviso(erro instanceof Error ? erro.message : "Não foi possível excluir o estilo."));
          }}
        />
      ),
    },
    glifos: {
      nome: PAINEIS_DA_IMAGEM.glifos,
      conteudo: <PainelGlifos estilo={estiloNaBarra} editando={Boolean(edicaoDeTexto)} aoInserir={inserirNoTexto} />,
    },
    paragrafo: {
      nome: PAINEIS_DA_IMAGEM.paragrafo,
      conteudo: (
        <>
          <PainelParagrafo paragrafo={paragrafoNaBarra} aoParagrafo={mudarParagrafoDoTexto} deParagrafo={(textoDaBarra?.modo ?? "paragrafo") === "paragrafo"} />
          <EstilosSalvos
            titulo="Estilos de parágrafo"
            estilos={estilosDeParagrafo.recursos}
            aoAplicar={(id) => {
              const salvo = estilosDeParagrafo.recursos.find((item) => item.id === id);
              if (salvo) mudarParagrafoDoTexto(salvo.dados.estilo);
            }}
            aoSalvar={(nome) => salvarEstiloDeTexto("estilo_paragrafo", nome)}
            aoExcluir={(id) => excluirEstiloDeTexto("estilo_paragrafo", id)}
          />
        </>
      ),
    },
    caminhos: {
      nome: PAINEIS_DA_IMAGEM.caminhos,
      conteudo: (
        <PainelCaminhos
          caminhos={caminhosDoDocumento}
          documento={tamanho}
          escolhido={caminhoDaVez?.id ?? null}
          aoEscolher={setCaminhoEscolhido}
          aoRenomear={(id, nome) => {
            const atual = projetoRef.current?.caminhos ?? [];
            const caminho = atual.find((item) => item.id === id);
            if (caminho) executar({ comando: "imagem.caminhos", parametros: { caminhos: caminho.trabalho ? salvarTrabalho(atual, id, nome) : comCaminho(atual, { ...caminho, nome }) } });
          }}
          aoExcluir={(id) => {
            if (executar({ comando: "imagem.caminhos", parametros: { caminhos: (projetoRef.current?.caminhos ?? []).filter((item) => item.id !== id) } })) setCaminhoEscolhido(null);
          }}
          aoDuplicar={(id) => {
            const atual = projetoRef.current?.caminhos ?? [];
            const caminho = atual.find((item) => item.id === id);
            if (!caminho) return;
            const novo = { ...structuredClone(caminho), id: crypto.randomUUID().slice(0, 12), nome: `${caminho.nome} cópia`.slice(0, 60), recorte: false, trabalho: false };
            if (executar({ comando: "imagem.caminhos", parametros: { caminhos: [...atual, novo] } })) setCaminhoEscolhido(novo.id);
          }}
          aoNovo={() => {
            const atual = projetoRef.current?.caminhos ?? [];
            const novo = { id: crypto.randomUUID().slice(0, 12), nome: nomeLivre(atual), subcaminhos: [] };
            if (executar({ comando: "imagem.caminhos", parametros: { caminhos: [...atual, novo] } })) setCaminhoEscolhido(novo.id);
          }}
          aoRecorte={(id) => executar({ comando: "imagem.caminhos", parametros: { caminhos: caminhoDeRecorte(projetoRef.current?.caminhos ?? [], id) } })}
          aoPreencher={(id) => setJanelaDoCaminho({ tipo: "preencher", id })}
          aoTracar={(id) => setJanelaDoCaminho({ tipo: "tracar", id })}
          aoCarregar={(id, modo) => caminhoComoSelecao(caminhosDoDocumento.find((item) => item.id === id)?.subcaminhos ?? null, modo)}
          aoDaSelecao={() => setJanelaDoCaminho({ tipo: "daSelecao" })}
          temSelecao={Boolean(selecaoNoDocumento)}
        />
      ),
    },
    canais: {
      nome: PAINEIS_DA_IMAGEM.canais,
      conteudo: (
        <PainelCanais
          canais={canais}
          corAVista={corAVista}
          aoVerCor={setCorAVista}
          canalAtivo={canalDaVez?.id ?? null}
          aoAtivar={(id) => {
            setCanalAtivo(id);
            if (id && !FERRAMENTAS_DE_PINTURA.has(ferramenta)) escolherFerramenta("pincel");
          }}
          aoCarregar={(id, modo) => void carregarSelecaoDoCanal(id, false, modo)}
          aoSalvar={() => setJanelaDoCanal("salvar")}
          aoNovo={() => void novoCanal()}
          aoApagar={(id) => {
            if (executar({ comando: "canal.apagar", parametros: { id } }) && canalAtivo === id) setCanalAtivo(null);
          }}
          aoRenomear={(id, nome) => executar({ comando: "canal.mudar", parametros: { id, mudanca: { nome } } })}
          temSelecao={Boolean(selecaoNoDocumento)}
        />
      ),
    },
    camadas: {
      nome: PAINEIS_DA_IMAGEM.camadas,
      conteudo: <PainelCamadas projeto={projetoNaTela} midias={midias} selecao={selecaoValida} aoSelecionar={setSelecao} aoExecutar={executar} aoCriarAjuste={criarAjuste} aoCriarPreenchimento={novoPreenchimento} aoEditarPreenchimento={(clipeId) => editarPreenchimento(clipeId)} aoFiltros={{
            mascaraEmFoco: mascaraDosFiltrosEmFoco,
            editar: editarFiltroInteligente,
            mesclagem: (clipeId, filtroId) => {
              const pilha = projetoRef.current ? acharClipe(projetoRef.current, clipeId)?.clipe.filtros_inteligentes : null;
              if (pilha) setMesclagemDoFiltro({ clipeId, filtroId, antes: pilha });
            },
            mascara: (clipeId) => void mascaraDosFiltros(clipeId),
          }} aoAbrirPropriedades={() => abrirAba("basico")} aoAbrirEstilo={abrirEstiloDeCamada} aoNovaCamada={() => void novaCamada()} aoCamadaDoFundo={acoes.camadaDoFundo} mascaraEmFoco={mascaraEmFoco} mascaraAVista={mascaraAVista} aoFocarMascara={setMascaraEmFoco} aoVerMascara={setMascaraAVista} aoCriarMascara={(como) => void criarMascara(selecaoNoDocumento ? (como === "revelar" ? "revelarSelecao" : "ocultarSelecao") : como)} aoVincularMascara={vincularMascara} mascaraVetorialEmFoco={mascaraVetorialEmFoco} aoFocarMascaraVetorial={(clipeId) => {
            setMascaraVetorialEmFoco(clipeId);
            if (clipeId) {
              setMascaraEmFoco(null);
              if (!FERRAMENTAS_DE_CAMINHO.has(ferramenta)) escolherFerramenta("selecaoDireta");
            }
          }} aoAcaoMascaraVetorial={(clipeId, acao, modo) => acaoMascaraVetorial(acao, clipeId, modo)} aoSelecionarDaCamada={(clipeId, modo, de) => void selecionarDaCamada(clipeId, modo, de)} pedido={pedidoAsCamadas} />,
    },
    pinceis: {
      nome: PAINEIS_DA_IMAGEM.pinceis,
      conteudo: (
        <PainelPinceis
          opcoes={pinceis[pincelDosPaineis]}
          cor={cores.primeiroPlano}
          doEspaco={pinceisDoEspaco.pinceis.map(predefinicaoDoEspaco)}
          ocupado={ocupadoComPinceis}
          aoSalvar={(nome) => {
            setOcupadoComPinceis("Salvando o pincel…");
            criarPincel({ nome, pasta: "meus", opcoes: pinceis[pincelDosPaineis] })
              .then(() => {
                pinceisDoEspaco.recarregar();
                mostrarAviso(`O pincel "${nome}" está em Meus pincéis.`);
              })
              .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível salvar o pincel."))
              .finally(() => setOcupadoComPinceis(null));
          }}
          aoImportar={(arquivo) => {
            setOcupadoComPinceis("Importando os pincéis…");
            importarAbr(arquivo, (feitas, total) => setOcupadoComPinceis(`Importando ${feitas} de ${total}…`))
              .then((quantos) => mostrarAviso(quantos === 1 ? "Um pincel entrou em Importados." : `${quantos} pincéis entraram em Importados.`))
              .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível importar os pincéis."))
              .finally(() => {
                pinceisDoEspaco.recarregar();
                setOcupadoComPinceis(null);
              });
          }}
          aoExcluir={(predefinicao) =>
            excluirPincel(predefinicao.id.replace("espaco:", ""))
              .then(pinceisDoEspaco.recarregar)
              .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível excluir o pincel."))
          }
          aoEscolher={(predefinicao) => {
            setPinceis((atual) => ({ ...atual, [pincelDosPaineis]: comPredefinicao(atual[pincelDosPaineis], predefinicao, secoesTravadas) }));
            if (!ferramentaDePintura) escolherFerramenta("pincel");
          }}
          aoAbrirConfiguracoes={() => area.abrir("configuracoesDoPincel")}
        />
      ),
    },
    configuracoesDoPincel: {
      nome: PAINEIS_DA_IMAGEM.configuracoesDoPincel,
      conteudo: (
        <PainelConfiguracoesDoPincel
          opcoes={pinceis[pincelDosPaineis]}
          cor={cores.primeiroPlano}
          aoMudar={mudarPincel}
          travadas={secoesTravadas}
          aoTravar={(secao) =>
            setSecoesTravadas((atual) => {
              const novas = new Set(atual);
              if (novas.has(secao)) novas.delete(secao);
              else novas.add(secao);
              return novas;
            })
          }
          aoAbrirPredefinicoes={() => area.abrir("pinceis")}
          pontasDoEspaco={pinceisDoEspaco.pinceis.filter((pincel) => pincel.tem_ponta).map((pincel) => `pincel:${pincel.id}` as const)}
        />
      ),
    },
    historico: {
      nome: PAINEIS_DA_IMAGEM.historico,
      conteudo: (
        <PainelHistorico
          nome={edicao.nome}
          feitos={edicao.passos.feitos}
          desfeitos={edicao.passos.desfeitos}
          aoIr={edicao.irParaPasso}
          extras={{
            instantaneos,
            aoCriarInstantaneo: (comJanela) => {
              if (comJanela || opcoesDoHistorico.janelaDoInstantaneo) setJanelaDoHistorico("instantaneo");
              else void criarInstantaneo(`Instantâneo ${instantaneos.length + 1}`, "documento");
            },
            aoRenomearInstantaneo: (id, nome) => setInstantaneos((atual) => atual.map((item) => (item.id === id ? { ...item, nome } : item))),
            aoExcluirInstantaneo: (id) => setInstantaneos((atual) => atual.filter((item) => item.id !== id)),
            aoDocumentoNovo: (id) => {
              const instantaneo = id ? instantaneos.find((item) => item.id === id) : null;
              void duplicarDocumento(`${instantaneo?.nome ?? edicao.nome} (cópia)`, false, instantaneo?.projeto);
            },
            aoExcluirEstado: () => depoisDaPintura(edicao.excluirEstado),
            aoOpcoes: () => setJanelaDoHistorico("opcoes"),
            aoRestaurarInstantaneo: (id) => {
              const instantaneo = instantaneos.find((item) => item.id === id);
              if (instantaneo) depoisDaPintura(() => executar({ comando: "projeto.restaurar", parametros: { projeto: instantaneo.projeto } }));
            },
            fonte: fonteDoHistorico,
            aoEscolherFonte: setFonteDoHistorico,
          }}
        />
      ),
    },
  };

  const salvamento =
    edicao.salvamento === "salvo"
      ? "Salvo"
      : edicao.salvamento === "conflito"
        ? "Alterado em outra aba"
        : edicao.salvamento === "erro"
          ? "Não foi possível salvar"
          : edicao.salvamento === "sem-conexao"
            ? "Sem conexão"
            : "Salvando…";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-fundo text-texto">
      <header className={`h-8 shrink-0 items-center gap-1 border-b border-borda bg-painel px-1.5 ${modoDeTela === "cheia" ? "hidden" : "flex"}`}>
        <Link href="/app" className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-suave transition hover:text-texto" title="Voltar ao início">
          <ChevronLeft className="size-3.5" aria-hidden />
          <Simbolo tamanho={18} />
        </Link>
        <MenusDaImagem acoes={acoes} ativo={!janelaAberta} personalizacao={personalizacao} mostrarTudo={mostrarTudoNosMenus} aoMostrarTudo={() => setMostrarTudoNosMenus(true)} />
        <span className="ml-auto hidden items-center gap-1 text-[11px] text-suave sm:flex" role="status">
          {edicao.salvamento === "salvo" ? <Check className="size-3" aria-hidden /> : <LoaderCircle className="size-3 animate-spin" aria-hidden />}
          {salvamento}
        </span>
        <select
          aria-label="Área de trabalho"
          title="Área de trabalho"
          value={area.area}
          onChange={(evento) => area.escolherArea(evento.currentTarget.value)}
          className="ml-2 rounded border border-borda bg-painel-2 px-1 py-0.5 text-[11px] max-md:hidden"
        >
          {Object.entries(AREAS_DA_IMAGEM).map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
        <BotaoTema />
        <button type="button" className="botao-principal shrink-0 px-2.5 py-0.5 text-xs" onClick={() => setExportando("exportar")} title="Exportar como PNG, JPG, WebP, GIF, AVIF, TIFF, PDF… (Ctrl+Alt+Shift+W)">
          <Download className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Exportar</span>
        </button>
      </header>

      <div className={paineisOcultos === "todos" ? "hidden" : "contents"}>
      <BarraDeOpcoes
        predefinicoes={conteudoDasPredefinicoes}
        amostra={{ lado: ladoDaAmostra, aoMudar: setLadoDaAmostra, amostradores: amostradores.length, aoLimpar: () => setAmostradores([]) }}
        giroDaVista={giroDaVista}
        aoGirarVista={(giro) => setGiroDaVista((atual) => ({ ...atual, ...giro }))}
        ferramenta={ferramenta}
        clipe={selecionado?.clipe ?? null}
        aoExecutar={executar}
        objeto={objeto}
        aoUsarSelecao={(acao) => void usarSelecao(acao)}
        pedindo={pedindo}
        removerAoSoltar={removerAoSoltar}
        aoMudarRemoverAoSoltar={setRemoverAoSoltar}
        removerCercando={removerCercando}
        aoMudarRemoverCercando={setRemoverCercando}
        removerNaCamadaNova={removerNaCamadaNova}
        aoMudarRemoverNaCamadaNova={setRemoverNaCamadaNova}
        localizador={localizador}
        aoMudarLocalizador={setLocalizador}
        forma={forma}
        aoMudarForma={(mudanca) => setForma((atual) => ({ ...atual, ...mudanca }))}
        primeiroPlano={cores.primeiroPlano}
        aoZoom={setZoom}
        aoAlinhar={(eixo) => camadaEscolhida && executar({ comando: "clipe.transformar", parametros: { clipeIds: [camadaEscolhida.clipe.id], transformacao: { [eixo]: 0 } } })}
        pincel={ferramentaDePintura ? pinceis[ferramentaDePintura] : undefined}
        aoMudarPincel={mudarPincel}
        simetria={simetria}
        aoMudarSimetria={setSimetria}
        extraDoPincel={
          ferramenta === "carimbo" || ferramenta === "carimboDePadrao" || ferramenta === "recuperacao" ? (
            <OpcoesDoCarimboNaBarra padrao={ferramenta === "carimboDePadrao"} opcoes={opcoesDoCarimbo} aoMudar={(mudanca) => setOpcoesDoCarimbo((atual) => ({ ...atual, ...mudanca }))} />
          ) : ferramenta === "recuperacaoParaManchas" ? (
            <OpcoesDasManchasNaBarra opcoes={opcoesDasManchas} aoMudar={(mudanca) => setOpcoesDasManchas((atual) => ({ ...atual, ...mudanca }))} />
          ) : ferramenta === "desfoque" || ferramenta === "nitidez" || ferramenta === "borrar" || ferramenta === "subexposicao" || ferramenta === "superexposicao" || ferramenta === "esponja" ? (
            <OpcoesDoRetoqueNaBarra ferramenta={ferramenta} opcoes={opcoesDoRetoque[ferramenta]} aoMudar={(mudanca) => setOpcoesDoRetoque((atual) => ({ ...atual, [ferramenta]: { ...atual[ferramenta], ...mudanca } }))} />
          ) : ferramenta === "misturador" ? (
            <OpcoesDoMisturadorNaBarra
              opcoes={opcoesDoMisturador}
              aoMudar={(mudanca) => setOpcoesDoMisturador((atual) => ({ ...atual, ...mudanca }))}
              aoCarregar={() => (pincelDoMisturador.current = { estado: estadoNovo(), limpo: false })}
              aoLimpar={() => (pincelDoMisturador.current = { estado: estadoNovo(), limpo: true })}
            />
          ) : ferramenta === "substituicaoDeCor" ? (
            <OpcoesDaSubstituicaoNaBarra borracha={false} opcoes={opcoesDaSubstituicao} aoMudar={(mudanca) => setOpcoesDaSubstituicao((atual) => ({ ...atual, ...mudanca }))} />
          ) : ferramenta === "borrachaDeFundo" ? (
            <OpcoesDaSubstituicaoNaBarra borracha opcoes={opcoesDaBorrachaDeFundo} aoMudar={(mudanca) => setOpcoesDaBorrachaDeFundo((atual) => ({ ...atual, ...mudanca }))} />
          ) : undefined
        }
        opcoesProprias={
          FERRAMENTAS_DE_TEXTO.has(ferramenta) && !selecionado?.clipe.texto ? (
            <OpcoesDoTextoNaBarra
              estilo={estiloNaBarra}
              alinhamento={alinhamentoNaBarra}
              orientacao={textoDaBarra?.orientacao ?? (ferramenta === "textoVertical" || ferramenta === "mascaraDeTextoVertical" ? "vertical" : "horizontal")}
              aoEstilo={mudarEstiloDoTexto}
              aoPreverFonte={setFonteEmPrevia}
              aoAlinhamento={(alinhamento) => mudarParagrafoDoTexto({ alinhamento })}
              aoOrientacao={mudarOrientacaoDoTexto}
              edicao={edicaoDeTexto ? { aoConfirmar: () => terminarTexto(), aoCancelar: () => terminarTexto(true) } : null}
              aoPaineis={() => area.abrir("caractere")}
              aoDeformar={(edicaoDeTexto || textoEscolhido) && !textoDaBarra?.caminho ? abrirDeformar : null}
              caminho={textoDaBarra?.caminho?.tipo === "linha" ? { inicio: textoDaBarra.caminho.inicio, aoInicio: (inicio) => mudarCaminhoDoTexto({ inicio }), aoInverter: () => mudarCaminhoDoTexto({ inverter: !textoDaBarra.caminho!.inverter }) } : null}
            />
          ) : ferramenta === "prancheta" ? (
            <OpcoesDaPranchetaNaBarra
              prancheta={escolhidoNaTela?.clipe.prancheta ?? null}
              tamanho={tamanhoDaPrancheta}
              aoMudarTamanho={setTamanhoDaPrancheta}
              aoMudarPrancheta={(mudanca) => escolhidoNaTela?.clipe.prancheta && executar({ comando: "imagem.prancheta", parametros: { clipeId: escolhidoNaTela.clipe.id, mudanca, tamanhos: tamanhosDasMidias() } })}
              aoNova={() => novaPrancheta("nova")}
            />
          ) : ferramenta === "quadro" ? (
            <>
              <span className="text-suave">Quadro:</span>
              <span className="flex items-center gap-0.5" role="group" aria-label="Forma do quadro">
                {(
                  [
                    ["retangulo", "Retangular"],
                    ["elipse", "Elíptico"],
                  ] as const
                ).map(([id, nome]) => (
                  <button key={id} type="button" aria-pressed={formaDoQuadro === id} className={`rounded px-1.5 py-0.5 text-xs ${formaDoQuadro === id ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`} onClick={() => setFormaDoQuadro(id)}>
                    {nome}
                  </button>
                ))}
              </span>
              <span className="text-suave">Com o quadro escolhido, clique numa foto da biblioteca para pôr nele.</span>
            </>
          ) : ferramentaDeCaminho ? (
            <OpcoesDaCanetaNaBarra
              ferramenta={ferramenta}
              caneta={caneta}
              formas={forma}
              primeiroPlano={cores.primeiroPlano}
              fundo={cores.fundo}
              doEspaco={degradesDoEspaco.recursos.map((recurso) => recurso.dados)}
              comFormaEscolhida={Boolean(selecionado?.clipe.vetor)}
              comCaminho={Boolean(caminhoDaVez?.subcaminhos.length)}
              aoMudarCaneta={(mudanca) => setCaneta((atual) => ({ ...atual, ...mudanca }))}
              aoMudarFormas={(mudanca) => setForma((atual) => ({ ...atual, ...mudanca }))}
              aoCriarSelecao={() => caminhoComoSelecao(caminhoDaVez?.subcaminhos ?? null)}
              aoCriarForma={() => caminhoDaVez && formaDosCaminhos(caminhoDaVez.subcaminhos)}
              componentes={
                ferramenta === "selecaoDeCaminho"
                  ? (() => {
                      const lista = caminhosEditaveis ?? [];
                      const escolhidos = componentesEscolhidos.filter((i) => i < lista.length);
                      const operacoes = new Set(escolhidos.map((i) => lista[i].operacao));
                      return {
                        quantos: escolhidos.length,
                        operacao: operacoes.size === 1 ? [...operacoes][0] : null,
                        aoOperacao: (operacao: OperacaoDoCaminho) => mudarCaminhos(lista.map((sub, i) => (escolhidos.includes(i) ? { ...sub, operacao } : sub)), false),
                        aoMesclar: lista.filter((sub) => sub.fechado).length > 1 ? () => mudarCaminhos(mesclarComponentes(lista), false) : null,
                      };
                    })()
                  : undefined
              }
            />
          ) : FORMA_VIVA_DA_FERRAMENTA[ferramenta] || ferramenta === "formaPersonalizada" ? (
            <OpcoesDaFormaNaBarra
              tipo={FORMA_VIVA_DA_FERRAMENTA[ferramenta] ?? "personalizada"}
              variante={VARIANTE_DA_FERRAMENTA[ferramenta]}
              seletor={ferramenta === "formaPersonalizada" ? <SeletorDeFormaPersonalizada escolhida={forma.personalizada} doEspaco={formasDoEspaco} aoEscolher={(personalizada) => setForma((atual) => ({ ...atual, personalizada }))} /> : undefined}
              opcoes={forma}
              primeiroPlano={cores.primeiroPlano}
              fundo={cores.fundo}
              doEspaco={degradesDoEspaco.recursos.map((recurso) => recurso.dados)}
              comFormaEscolhida={Boolean(selecionado?.clipe.vetor)}
              aoMudar={(mudanca) => setForma((atual) => ({ ...atual, ...mudanca }))}
            />
          ) : ferramenta === "gradeDePerspectiva" || ferramenta === "selecaoDePerspectiva" ? (
            <OpcoesDaPerspectivaNaBarra grade={projetoNaTela?.perspectiva ?? null} documento={projetoNaTela ? tamanhoDaImagem(projetoNaTela) : { largura: 1, altura: 1 }} levar={ferramenta === "selecaoDePerspectiva"} aoMudar={(grade, nome) => mudarGrade(grade, false, nome)} />
          ) : ferramenta === "construtorDeFormas" || ferramenta === "pinturaViva" ? (
            <span className="text-suave">
              {formasDoConstrutor.length
                ? `${facesDoConstrutor.length} faces em ${formasDoConstrutor.length} ${formasDoConstrutor.length === 1 ? "forma" : "formas"}. ${ferramenta === "pinturaViva" ? "Clique numa face para enchê-la com a cor de primeiro plano." : "Arraste pelas faces para juntá-las; com Alt, para apagá-las."}`
                : "Escolha as formas (Shift + clique no Mover, ou no painel Camadas)."}
            </span>
          ) : ferramenta === "larguraDoTraco" ? (
            <OpcoesDaLarguraNaBarra perfil={formaEmEdicao?.vetor ? (formaEmEdicao.vetor.traco?.perfil ?? []) : null} comTraco={Boolean(formaEmEdicao?.vetor?.traco)} aoMudar={(perfil) => mudarPerfilDoTraco(perfil, false)} />
          ) : LIQUEFAZER_DA_FERRAMENTA[ferramenta] ? (
            <OpcoesDoLiquefazerNaBarra ferramenta={LIQUEFAZER_DA_FERRAMENTA[ferramenta]!} opcoes={opcoesDoLiquefazer} aoMudar={setOpcoesDoLiquefazer} />
          ) : FERRAMENTAS_DE_TRACO_LIVRE.has(ferramenta) ? (
            <OpcoesDoPincelVetorialNaBarra ferramenta={ferramenta as FerramentaDoPincelVetorial} opcoes={pincelVetorial} aoMudar={setPincelVetorial} />
          ) : ferramenta === "cota" ? (
            <OpcoesDaCotaNaBarra opcoes={opcoesDaCota} escala={projetoNaTela?.escala_de_medida ?? null} aoMudar={setOpcoesDaCota} />
          ) : ferramenta === "reflexo" ? (
            <OpcoesDoReflexoNaBarra opcoes={opcoesDoReflexo} aoMudar={setOpcoesDoReflexo} />
          ) : GERADOR_DA_FERRAMENTA[ferramenta] ? (
            <OpcoesDosGeradoresNaBarra tipo={GERADOR_DA_FERRAMENTA[ferramenta]!} opcoes={opcoesDosGeradores} aoMudar={setOpcoesDosGeradores} />
          ) : ferramenta === "varinhaVetorial" ? (
            <OpcoesDaVarinhaVetorialNaBarra opcoes={opcoesDaVarinhaVetorial} aoMudar={setOpcoesDaVarinhaVetorial} />
          ) : ferramenta === "fatia" || ferramenta === "selecaoDeFatia" ? (
            <OpcoesDasFatiasNaBarra
              total={fatiasDoDocumento.length}
              temGuias={Boolean(projeto.guias?.verticais.length || projeto.guias?.horizontais.length)}
              escolhida={fatiaDaVez}
              aoDasGuias={() => projeto.guias && mudarFatias([...fatiasDoDocumento, ...fatiasDasGuias(projeto.guias, tamanhoDaImagem(projeto), () => crypto.randomUUID().slice(0, 12))], "fatias a partir das guias")}
              aoDividir={() => setJanelaDaFatia("dividir")}
              aoOpcoes={() => setJanelaDaFatia("opcoes")}
              aoExcluir={excluirFatia}
              aoLimpar={() => {
                mudarFatias([], "limpar as fatias");
                setFatiaEscolhida(null);
              }}
            />
          ) : ferramenta === "contagem" ? (
            <OpcoesDaContagemNaBarra
              contagem={projeto.contagem ?? null}
              aoMudar={(contagem, nome) => executar({ comando: "imagem.contagem", parametros: { contagem, nome } })}
              aoNovoGrupo={() => {
                try {
                  executar({ comando: "imagem.contagem", parametros: { contagem: novoGrupo(projeto.contagem, novoId()), nome: "novo grupo de contagem" } });
                } catch (e) {
                  mostrarAviso(e instanceof Error ? e.message : "Não foi possível criar o grupo.");
                }
              }}
              aoTirarGrupo={(id) => projeto.contagem && executar({ comando: "imagem.contagem", parametros: { contagem: tirarGrupo(projeto.contagem, id), nome: "excluir o grupo de contagem" } })}
            />
          ) : ferramenta === "nota" ? (
            <OpcoesDaNotaNaBarra autor={autorDasNotas} cor={corDasNotas} total={projeto.notas?.length ?? 0} aoMudarAutor={setAutorDasNotas} aoMudarCor={setCorDasNotas} aoLimpar={() => mudarNotas([])} />
          ) : ferramenta === "regua" ? (
            <OpcoesDaReguaNaBarra
              medida={medida}
              aoLimpar={() => setMedida(null)}
              aoEndireitar={() => {
                if (!medida || !camadaEscolhida) return mostrarAviso("Escolha a camada para endireitar.");
                // A linha fica reta: na horizontal, ou na vertical se ela é mais em pé
                let angulo = (Math.atan2(medida.ate.y - medida.de.y, medida.ate.x - medida.de.x) * 180) / Math.PI;
                if (angulo > 45 && angulo <= 135) angulo -= 90;
                else if (angulo < -45 && angulo >= -135) angulo += 90;
                else if (angulo > 135) angulo -= 180;
                else if (angulo < -135) angulo += 180;
                executar({ comando: "imagem.transformarCamada", parametros: { clipeId: camadaEscolhida.clipe.id, transformacao: { rotacao: camadaEscolhida.clipe.transformacao.rotacao - angulo } } });
                setMedida(null);
              }}
            />
          ) : ferramenta === "corteDePerspectiva" ? (
            <OpcoesDoCortePerspectivaNaBarra
              opcoes={opcoesDaPerspectiva}
              temQuad={Boolean(cortePerspectiva)}
              aoMudar={(mudanca) => setOpcoesDaPerspectiva((atual) => ({ ...atual, ...mudanca }))}
              aoConfirmar={() => void confirmarCortePerspectiva()}
              aoCancelar={() => setCortePerspectiva(null)}
            />
          ) : ferramenta === "corte" && recorte ? (
            <OpcoesDoCorteNaBarra
              opcoes={opcoesDoCorte}
              medidas={recorte}
              aoMudar={mudarOpcoesDoCorte}
              aoTrocar={() => {
                const trocada = { ...recorte, largura: recorte.altura, altura: recorte.largura };
                if (typeof opcoesDoCorte.predefinicao === "number") mudarOpcoesDoCorte({ predefinicao: 1 / opcoesDoCorte.predefinicao });
                else if (opcoesDoCorte.predefinicao === "tamanho") mudarOpcoesDoCorte({ tamanhoFinal: { ...opcoesDoCorte.tamanhoFinal, largura: opcoesDoCorte.tamanhoFinal.altura, altura: opcoesDoCorte.tamanhoFinal.largura } });
                setRecorte(trocada);
              }}
              aoLimpar={() => {
                const { largura, altura } = tamanhoDaImagem(projeto!);
                setOpcoesDoCorte((atual) => ({ ...atual, predefinicao: "livre" }));
                setRecorte({ cx: largura / 2, cy: altura / 2, largura, altura, angulo: 0 });
              }}
              aoConfirmar={() => void confirmarCorte()}
              aoCancelar={cancelarCorte}
            />
          ) : ferramenta === "balde" ? (
            <OpcoesDoBaldeNaBarra opcoes={opcoesDoBalde} aoMudar={(mudanca) => setOpcoesDoBalde((atual) => ({ ...atual, ...mudanca }))} />
          ) : ferramenta === "borrachaMagica" ? (
            <OpcoesDaBorrachaMagicaNaBarra opcoes={opcoesDaBorrachaMagica} aoMudar={(mudanca) => setOpcoesDaBorrachaMagica((atual) => ({ ...atual, ...mudanca }))} />
          ) : ferramenta === "correcao" ? (
            <OpcoesDaCorrecaoNaBarra modo={modoDaCorrecao} aoMudar={setModoDaCorrecao} />
          ) : ferramenta === "moverSensivel" ? (
            <OpcoesDoMoverSensivelNaBarra modo={modoDoMoverSensivel} aoMudar={setModoDoMoverSensivel} />
          ) : ferramenta === "degrade" ? (
            <OpcoesDoDegradeNaBarra
              opcoes={opcoesDoDegrade}
              doEspaco={degradesDoEspaco.recursos.map((recurso) => recurso.dados)}
              primeiroPlano={cores.primeiroPlano}
              fundo={cores.fundo}
              aoMudar={(mudanca) => setOpcoesDoDegrade((atual) => ({ ...atual, ...mudanca }))}
              aoEditar={() => setEditandoDegrade(true)}
            />
          ) : null
        }
        transformacao={
          transformando
            ? {
                modo: transformando.modo,
                aoModo: (modo) => setTransformando((atual) => (atual ? { ...atual, modo } : atual)),
                aoConfirmar: confirmarTransformacao,
                aoCancelar: () => setTransformando(null),
                numeros: transformando.estado.malha ? null : (transformando.numeros ?? numerosDoQuad(transformando.inicial, transformando.estado.quad, transformando.referencia)),
                aoNumeros: (numeros) => setTransformando((atual) => (atual ? { ...atual, numeros, estado: { quad: quadDosNumeros(atual.inicial, numeros, atual.referencia), malha: null } } : atual)),
                referencia: transformando.referencia,
                aoReferencia: (referencia) => setTransformando((atual) => (atual ? { ...atual, referencia, numeros: null } : atual)),
                interpolacao: transformando.camada ? transformando.interpolacao : undefined,
                aoInterpolacao: (interpolacao) => setTransformando((atual) => (atual ? { ...atual, interpolacao } : atual)),
                estilo: transformando.estilo,
                aoEstilo: (estilo) => setTransformando((atual) => (atual ? { ...atual, estilo, dividindo: null, estado: { quad: atual.estado.quad, malha: estilo ? malhaDoEstilo(atual.estado.quad, estilo) : null } } : atual)),
                dividindo: transformando.dividindo,
                aoDividindo: (dividindo) => setTransformando((atual) => (atual ? { ...atual, dividindo } : atual)),
              }
            : null
        }
        selecaoDoDocumento={{
          opcoes: opcoesDaSelecao,
          aoMudar: (mudanca) => setOpcoesDaSelecao((atual) => ({ ...atual, ...mudanca })),
          temSelecao: Boolean(selecaoNoDocumento),
          naFoto: Boolean(foto),
          aoDesmarcar: acoes.desmarcar,
        }}
      />
      </div>

      <div className="flex min-h-0 flex-1 max-md:flex-wrap max-md:content-start max-md:overflow-y-auto">
        <div className={paineisOcultos === "todos" ? "hidden" : "contents"}>
        <CaixaDeFerramentas
          ocultas={new Set(personalizacao.ferramentasOcultas)}
          colunas={personalizacao.colunas}
          teclaDe={(item) => teclaDaFerramenta(item, personalizacao)}
          ativa={ferramenta}
          aoEscolher={escolherFerramenta}
          ultimas={ultimas}
          primeiroPlano={cores.primeiroPlano}
          fundo={cores.fundo}
          aoEditarCor={(qual) => {
            setCores((atual) => ({ ...atual, editando: qual }));
            area.abrir("cor");
          }}
          aoTrocarCores={() => setCores((atual) => ({ ...atual, primeiroPlano: atual.fundo, fundo: atual.primeiroPlano }))}
          mascaraRapida={Boolean(mascaraRapida)}
          aoMascaraRapida={alternarMascaraRapida}
          aoCoresPadrao={() => setCores((atual) => ({ ...atual, primeiroPlano: "#000000", fundo: "#ffffff" }))}
          aoDuploClique={(id) => setZoom(id === "zoom" ? 1 : null)}
        />
        </div>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col max-md:h-[62vh]">
          <div role="tablist" aria-label="Documentos" className={`h-7 shrink-0 items-end overflow-x-auto overflow-y-hidden border-b border-borda bg-painel-2 ${modoDeTela === "padrao" ? "flex" : "hidden"}`}>
            {abas.map((documento) =>
              documento.id === projetoId ? (
            <div key={documento.id} role="tab" aria-selected className="flex h-full max-w-full shrink-0 items-center gap-1 border-r border-borda bg-fundo px-2 text-[11px]">
              <input
                id="nome-projeto"
                value={edicao.nome}
                onChange={(evento) => edicao.renomear(evento.currentTarget.value)}
                aria-label="Nome da imagem"
                maxLength={120}
                size={Math.max(6, Math.min(40, edicao.nome.length + 1))}
                className="min-w-0 bg-transparent font-medium outline-none focus:bg-painel-2"
              />
              <span className="shrink-0 truncate text-suave">
                @ {porcentagem(zoomNaTela)} ({escolhidoNaTela ? nomeDaCamada(escolhidoNaTela.clipe, midias, escolhidoNaTela.faixa) : escolhidas.length > 1 ? `${escolhidas.length} camadas` : "Fundo"}, {SIGLAS_DOS_MODOS[projeto?.modo?.tipo ?? "rgb"]}/8)
              </span>
              <button type="button" className="botao-icone size-4 shrink-0" onClick={() => fecharAba()} aria-label={`Fechar ${edicao.nome || "a imagem"}`} title="Fechar">
                <X className="size-3" aria-hidden />
              </button>
            </div>
              ) : (
                <div key={documento.id} role="tab" aria-selected={false} className="group flex h-full shrink-0 items-center gap-1 border-r border-borda px-2 text-[11px] text-suave hover:bg-fundo/60 hover:text-texto">
                  <button type="button" className="max-w-48 truncate" onClick={() => router.push(`/app/imagem/${documento.id}`)} title={documento.nome}>
                    {documento.nome || "Imagem sem título"}
                  </button>
                  <button type="button" className="botao-icone size-4 shrink-0 opacity-60 group-hover:opacity-100" onClick={() => fecharAba(documento.id)} aria-label={`Fechar ${documento.nome || "a imagem"}`} title="Fechar">
                    <X className="size-3" aria-hidden />
                  </button>
                </div>
              ),
            )}
          </div>
          <PreviaDaImagem
            telaCheia={modoDeTela === "cheia"}
            giroDaVista={giroDaVista}
            aoGirarVista={(angulo) => setGiroDaVista((atual) => ({ ...atual, angulo }))}
            enquadrar={enquadrar}
            vista={vista}
            guiasDoDocumento={projeto.guias ?? null}
            aoMudarGuias={(guias) => executar({ comando: "imagem.guias", parametros: { guias } })}
            aoMudarUnidade={(unidade) => mudarVista({ unidade })}
            projeto={projetoNaTela}
            midias={midias}
            selecao={selecaoValida}
            aoSelecionar={setSelecao}
            aoPrever={(clipeId, mudanca) => setProvisorio(mudanca ? comandoDaMudanca(clipeId, mudanca) : null)}
            aoTransformar={(clipeId, mudanca) => executar(comandoDaMudanca(clipeId, mudanca))}
            aoPreverDeslocamento={(deslocamento) => setProvisorio(deslocamento ? { comando: "imagem.posicoes", parametros: { mudancas: mudancasDoDeslocamento(deslocamento.dx, deslocamento.dy) } } : null)}
            aoDeslocar={(dx, dy) => posicoes(mudancasDoDeslocamento(dx, dy))}
            caixasRef={caixasRef}
            pintura={
              ferramentaDePintura
                ? {
                    ferramenta: ferramentaDePintura,
                    opcoes: pinceis[ferramentaDePintura],
                    cores,
                    aoPedirAlvo: alvoDaPintura,
                    aoAltClique:
                      ferramenta === "carimbo" || ferramenta === "recuperacao"
                        ? (ponto) => {
                            setFontesDeClonagem((atual) => atual.map((item, i) => (i === fonteAtiva ? { ponto, deslocamento: null } : item)));
                            setSobreposicaoDaFonte(null);
                          }
                        : undefined,
                    aoQuadro: mascaraRapida ? () => setQuadroDaRapida((atual) => atual + 1) : motorDasManchas ? () => setQuadroDasManchas((atual) => atual + 1) : pinturas.avisarQuadro,
                    aoSoltar: (clipeId) => {
                      if (clipeId === CHAVE_DA_MASCARA_RAPIDA) setQuadroDaRapida((atual) => atual + 1);
                      else if (clipeId === "#manchas") refazerManchasComIa();
                      else if (manchas.current?.chave === clipeId) refazerManchas();
                      else pinturas.soltar(clipeId);
                    },
                    aoAjustar: mudarPincel,
                    simetria,
                    // Na máscara, a tinta é cinza: a luz das cores (o branco mostra, o preto esconde)
                    emCinza: Boolean(selecionado && mascaraEmFoco === selecionado.clipe.id && selecionado.clipe.mascara_pixels),
                  }
                : null
            }
            fonteDosPixels={pinturas.fonte}
            fonteDaMascara={pinturas.fonteDaMascara}
            fonteDaMascaraDosFiltros={pinturas.fonteDaMascaraDosFiltros}
            mascaraAVista={mascaraAVista}
            prova={prova.ligada ? prova.tipo : null}
            alertaDeGama={alertaDeGama}
            veu={
              motorDasManchas
                ? { fonte: motorDasManchas.pintura.fonte, quadro: quadroDasManchas, cinza: true }
                : mascaraRapida
                ? { fonte: mascaraRapida.fonte, quadro: quadroDaRapida, cinza: false }
                : canalDaVez
                  ? (() => {
                      // O canal à vista: o canvas do motor enquanto pinta (ou com traços subindo), senão a versão dele
                      const fonte = pinturas.fonteDe(alvoDoCanal(canalDaVez)) ?? (imagemDoCanal?.chave === chaveDoCanal ? imagemDoCanal.imagem : null);
                      return fonte ? { fonte, quadro: pinturas.quadro, cinza: true } : null;
                    })()
                  : null
            }
            corAVista={canalDaVez ? null : corAVista}
            sobreposicao={chaveDaSobreposicao && sobreposicaoDaFonte ? { imagem: sobreposicaoDaFonte, opacidade: opcoesDoCarimbo.opacidadeDaSobreposicao } : null}
            pontoDaFonte={ferramenta === "carimbo" || ferramenta === "recuperacao" ? (fonteDaVez?.ponto ?? null) : null}
            ponto={
              amostraDoAjuste
                ? { modo: "clique", aoClicar: amostrarAbaixo }
                : FERRAMENTAS_DE_PONTO.has(ferramenta)
                ? ferramenta === "degrade"
                  ? degradeDoPreenchimento
                    ? {
                        modo: "arrasto",
                        alcas: degradeDoPreenchimento.alcas,
                        aoArrastando: (de, ate) => setProvisorio(degradeDoPreenchimento.comando(de, ate)),
                        aoArrastar: (de, ate) => {
                          setProvisorio(null);
                          executar(degradeDoPreenchimento.comando(de, ate));
                        },
                      }
                    : { modo: "arrasto", aoArrastar: aplicarDegrade }
                  : { modo: "clique", aoClicar: (p) => (ferramenta === "balde" ? usarBalde(p) : usarBorrachaMagica(p)) }
                : null
            }
            moverPixels={
              (ferramenta === "mover" || ferramenta === "moverSensivel") && selecaoNoDocumento && selecionado?.clipe.pixels && limites(selecaoNoDocumento)
                ? {
                    caixa: limites(selecaoNoDocumento)!,
                    aoComecar: (duplicar) => comecarAMoverPixels(duplicar || (ferramenta === "moverSensivel" && modoDoMoverSensivel === "estender")),
                    aoMover: (dx, dy) => void flutuanteAbrindo.current?.then(() => desenharFlutuante(dx, dy)),
                    aoSoltar: (dx, dy) => soltarFlutuante(dx, dy, ferramenta === "moverSensivel" ? modoDoMoverSensivel : ""),
                  }
                : ferramenta === "correcao" && selecaoNoDocumento && limites(selecaoNoDocumento)
                  ? { caixa: limites(selecaoNoDocumento)!, aoComecar: () => undefined, aoMover: () => undefined, aoSoltar: (dx, dy) => void aplicarCorrecao(dx, dy) }
                  : null
            }
            transformacao={
              transformando
                ? {
                    estado: transformando.estado,
                    modo: transformando.modo,
                    origem: transformando.previa,
                    referencia: mapaDoEstado(transformando.estado)(transformando.referencia.u, transformando.referencia.v),
                    opaco: Boolean(transformando.camada),
                    dividindo: transformando.dividindo,
                    aoDividir: (malha) => setTransformando((atual) => (atual ? { ...atual, estado: { ...atual.estado, malha }, dividindo: null, estilo: null } : atual)),
                    // Mexer à mão numa malha de estilo a torna personalizada
                    aoMudar: (estado) => setTransformando((atual) => (atual ? { ...atual, estado, numeros: null, estilo: null } : atual)),
                    aoConfirmar: confirmarTransformacao,
                  }
                : null
            }
            selecaoDoDocumento={{
              selecao: selecaoNoDocumento,
              bordas: bordasDaSelecao && vista.extras,
              ferramenta: FERRAMENTAS_DA_SELECAO.has(ferramenta) ? (ferramenta as FerramentaDeSelecao) : null,
              opcoes: opcoesDaSelecao,
              aoSelecionar: selecionarNoDocumento,
              mapaDeBordas: ferramenta === "lacoMagnetico" ? bordasDaImagem : null,
              imagem: ferramenta === "selecaoRapida" ? imagemDaRapida : null,
              aoVarinha: usarVarinha,
            }}
            ferramenta={ferramenta}
            zoom={zoom}
            aoMudarZoom={setZoom}
            aoMedirZoom={setZoomMedido}
            regua={ferramenta === "regua" ? { medida, aoMudar: setMedida } : null}
            tamanhoDaAmostra={ladoDaAmostra}
            perspectiva={
              projetoNaTela?.perspectiva && (projetoNaTela.perspectiva.visivel || ferramenta === "gradeDePerspectiva")
                ? {
                    grade: projetoNaTela.perspectiva,
                    modo: ferramenta === "gradeDePerspectiva" ? "editar" : ferramenta === "selecaoDePerspectiva" ? "levar" : "ver",
                    aoMudar: (grade, provisorio) => mudarGrade(grade, provisorio),
                    aoLevar: levarParaOPlano,
                  }
                : null
            }
            construtor={
              construindo && facesDoConstrutor.length
                ? { modo: ferramenta === "pinturaViva" ? "pinturaViva" : "construtor", faces: facesDoConstrutor, cor: cores.primeiroPlano, aoConstruir: (juntar, apagar) => construirFormas(juntar, apagar), aoPintar: (face) => construirFormas([face], [], cores.primeiroPlano) }
                : null
            }
            larguraDoTraco={
              ferramenta === "larguraDoTraco" && formaEmEdicao?.vetor?.traco && caminhosEditaveis
                ? { caminhos: caminhosEditaveis, largura: formaEmEdicao.vetor.traco.largura * (projetoNaTela ? pixelsPorUnidade(formaEmEdicao.vetor.caixa, formaEmEdicao.transformacao.escala, tamanhoDaImagem(projetoNaTela)) : 1), perfil: formaEmEdicao.vetor.traco.perfil ?? [], aoMudar: mudarPerfilDoTraco }
                : null
            }
            transformarComFerramenta={
              FERRAMENTAS_DE_TRANSFORMAR.has(ferramenta)
                ? {
                    ferramenta: ferramenta as FerramentaDeTransformar,
                    clipeIds: alvosDaTransformacao,
                    origem: origemDaTransformacao?.escolha === alvosDaTransformacao.join() ? origemDaTransformacao.ponto : null,
                    aoMudarOrigem: (ponto) => setOrigemDaTransformacao({ escolha: alvosDaTransformacao.join(), ponto }),
                    aoAplicar: aplicarAfimNasCamadas,
                    aoNumeros: (origem) => {
                      setOrigemDaTransformacao({ escolha: alvosDaTransformacao.join(), ponto: origem });
                      setNumerosDaTransformacao({ ferramenta: ferramenta as FerramentaDeTransformar, origem });
                    },
                  }
                : null
            }
            tracoLivre={
              FERRAMENTAS_DE_TRACO_LIVRE.has(ferramenta)
                ? {
                    caminhos: ferramenta === "suavizar" || ferramenta === "borrachaDeCaminho" || ferramenta === "unir" || ferramenta === "pincelDeTraco" || ferramenta === "lapisVetorial" || ferramenta === "tesoura" || ferramenta === "remodelar" || Boolean(LIQUEFAZER_DA_FERRAMENTA[ferramenta]) ? (caminhosEditaveis ?? null) : null,
                    largura: ferramenta === "pincelDeBolha" ? 2 * pincelVetorial.raioDaBolha : ferramenta === "borrachaVetorial" ? 2 * pincelVetorial.raio : ferramenta === "pincelDeTraco" || ferramenta === "lapisVetorial" ? pincelVetorial.espessura : 0,
                    cor: ferramenta === "pincelDeTraco" || ferramenta === "lapisVetorial" || ferramenta === "pincelDeBolha" ? cores.primeiroPlano : "#2f80ff",
                    raio: ferramenta === "suavizar" || ferramenta === "borrachaDeCaminho" || ferramenta === "borrachaVetorial" ? pincelVetorial.raio : ferramenta === "pincelDeBolha" ? pincelVetorial.raioDaBolha : ferramenta === "remodelar" ? pincelVetorial.alcance : LIQUEFAZER_DA_FERRAMENTA[ferramenta] ? opcoesDoLiquefazer.raio : undefined,
                    comAlt: ferramenta === "borrachaVetorial" ? "retangulo" : ferramenta === "faca" ? "linha" : undefined,
                    continuo: Boolean(LIQUEFAZER_DA_FERRAMENTA[ferramenta]) && ferramenta !== "deformarVetor",
                    aoTraco: aoTracoLivre,
                  }
                : null
            }
            toqueNoTexto={{
              aoMudar: (clipeId, texto, final) => {
                const comando: Comando = { comando: "imagem.textoRico", parametros: { clipeId, texto } };
                if (!final) return setProvisorio(comando);
                setProvisorio(null);
                executar(comando);
              },
              aoAviso: mostrarAviso,
            }}
            aoVarinhaVetorial={(clipeId, modo) => {
              const achadas = clipeId ? camadasParecidas(projeto, clipeId, opcoesDaVarinhaVetorial) : [];
              setSelecao(modo === "somar" ? [...new Set([...selecaoValida, ...achadas])] : modo === "subtrair" ? selecaoValida.filter((id) => !achadas.includes(id)) : achadas);
            }}
            fatias={{
              fatias: fatiasDoDocumento,
              ferramenta: ferramenta === "fatia" || ferramenta === "selecaoDeFatia" ? ferramenta : null,
              escolhida: fatiaEscolhida,
              mostrarAutomaticas: true,
              aoEscolher: setFatiaEscolhida,
              aoCriar: (retangulo) => {
                const id = crypto.randomUUID().slice(0, 12);
                mudarFatias([...fatiasDoDocumento, { id, nome: "", ...retangulo }], "criar a fatia");
                setFatiaEscolhida(id);
              },
              aoMudar: (id, retangulo) => mudarFatias(fatiasDoDocumento.map((fatia) => (fatia.id === id ? { ...fatia, ...retangulo } : fatia)), "mudar a fatia"),
              aoAbrirOpcoes: (id) => {
                setFatiaEscolhida(id);
                setJanelaDaFatia("opcoes");
              },
            }}
            contagem={{
              contagem: projeto.contagem ?? null,
              ativo: ferramenta === "contagem",
              aoMudar: (contagem, nome) => executar({ comando: "imagem.contagem", parametros: { contagem, nome } }),
              aoErro: mostrarAviso,
              novoId,
            }}
            notas={{
              notas: projeto.notas ?? [],
              ativo: ferramenta === "nota",
              escolhida: notaEscolhida,
              autor: autorDasNotas,
              cor: corDasNotas,
              aoEscolher: (id) => {
                setNotaEscolhida(id);
                if (id && !area.aberto("notas")) area.abrir("notas");
              },
              aoMudar: mudarNotas,
              novoId,
            }}
            amostradores={{
              pontos: amostradores,
              ativo: ferramenta === "amostradorDeCor",
              aoMudar: (pontos) => {
                if (pontos.length > amostradores.length && !area.aberto("informacoes")) area.abrir("informacoes");
                setAmostradores(pontos);
              },
              aoCheio: () => mostrarAviso("São no máximo 10 amostradores: tire um com Alt + clique."),
            }}
            galeria={galeriaNaTela ? { ...galeriaNaTela, ferramenta: ferramentaDaGaleria, escolhido: escolhidoDaGaleria, aoEscolher: escolherNaGaleria } : null}
            cortePerspectiva={
              ferramenta === "corteDePerspectiva"
                ? { quad: cortePerspectiva, grade: opcoesDaPerspectiva.grade, aoMudar: setCortePerspectiva, aoConfirmar: () => void confirmarCortePerspectiva() }
                : null
            }
            recorte={
              recorte
                ? {
                    caixa: recorte,
                    proporcao: proporcaoDoCorte(opcoesDoCorte, tamanho),
                    sobreposicao: opcoesDoCorte.sobreposicao,
                    orientacaoDaEspiral: opcoesDoCorte.orientacaoDaEspiral,
                    escudo: opcoesDoCorte.escudo,
                    mostrarCortada: opcoesDoCorte.mostrarCortada,
                    endireitando: opcoesDoCorte.endireitando,
                    aoMudar: setRecorte,
                    aoEndireitar: (angulo) => {
                      setRecorte((atual) => (atual ? { ...atual, angulo } : atual));
                      setOpcoesDoCorte((atual) => ({ ...atual, endireitando: false }));
                    },
                  }
                : null
            }
            objeto={MODO_DA_SELECAO[ferramenta] && objeto.foto && selecionado ? { clipeId: selecionado.clipe.id, ferramenta: objeto, localizador } : null}
            aoTerminarTraco={ferramenta === "remover" && removerAoSoltar ? () => window.setTimeout(() => void usarSelecaoRef.current("apagar"), 0) : undefined}
            preencherCercado={ferramenta === "remover" && removerCercando}
            aoClicarTexto={comecarTexto}
            caminhosDoTexto={FERRAMENTAS_DE_TEXTO.has(ferramenta) ? caminhosEditaveis : null}
            aoClicarNoCaminho={comecarTextoNoCaminho}
            aoClicarNaArea={comecarTextoNaArea}
            aoEditarTexto={editarTexto}
            edicaoDeTexto={
              edicaoDeTexto
                ? {
                    clipeId: edicaoDeTexto.clipeId,
                    selecao: edicaoDeTexto.selecao,
                    estiloPendente: edicaoDeTexto.estiloPendente,
                    aoSelecionar: (selecao) => setEdicaoDeTexto((atual) => (atual ? { ...atual, selecao, estiloPendente: selecao.de === atual.selecao.de && selecao.ate === atual.selecao.ate ? atual.estiloPendente : null } : atual)),
                    aoMudar: (texto) => setEdicaoDeTexto((atual) => (atual ? { ...atual, texto } : atual)),
                    aoTerminar: () => terminarTexto(),
                    aoEstilo: mudarEstiloDoTexto,
                    aoParagrafo: mudarParagrafoDoTexto,
                    aoKern: (delta) => mudarKern(delta, true),
                  }
                : null
            }
            aoDesenharForma={desenharForma}
            caminhos={
              ferramentaDeCaminho
                ? {
                    ferramenta: ferramentaDeCaminho,
                    caminhos: caminhosEditaveis,
                    opcoes: caneta,
                    aoMudar: mudarCaminhos,
                    aoCriar: criarCaminho,
                    aoEscolherComponentes: setComponentesEscolhidos,
                    mascaraDe: mascaraEmEdicao?.id ?? null,
                  }
                : null
            }
            pranchetas={{ ativa: ferramenta === "prancheta", aoCriar: (retangulo) => novaPrancheta("nova", retangulo) }}
            caminhoDoArrasto={(arrasto) => {
              const viva = FORMA_VIVA_DA_FERRAMENTA[ferramenta];
              if (viva) return formaNaGrade(viva, arrasto) ?? formaDoArrasto(viva, arrasto).naImagem;
              if (ferramenta === "quadro") return formaDoArrasto(formaDoQuadro, arrasto).naImagem;
              const gerador = GERADOR_DA_FERRAMENTA[ferramenta];
              if (gerador) return caminhosDoGerador(gerador, arrasto, opcoesDosGeradores);
              if (ferramenta === "cota") return geometriaDaCota(arrasto.de, arrasto.ate, opcoesDaCota).caminhos;
              if (ferramenta === "reflexo") return camadasDoReflexo(arrasto.de, arrasto.ate, opcoesDoReflexo).flatMap((camada) => camada.caminhos);
              const personalizada = ferramenta === "formaPersonalizada" ? caminhosDaFormaPersonalizada(forma.personalizada, formasDoEspaco) : null;
              return personalizada ? caminhosNaCaixa(personalizada.caminhos, arrasto, Boolean(arrasto.proporcional)) : null;
            }}
            aoPegarCor={(cor, paraOFundo) => setCores((atual) => ({ ...atual, [paraOFundo ? "fundo" : "primeiroPlano"]: cor }))}
          />
          <footer className={`h-6 shrink-0 items-center gap-3 border-t border-borda bg-painel px-2 text-[11px] text-suave ${paineisOcultos === "todos" ? "hidden" : "flex"}`}>
            <span className="tabular-nums">{porcentagem(zoomNaTela)}</span>
            <span className="tabular-nums">
              {tamanho.largura} px × {tamanho.altura} px ({projeto.tamanho?.resolucao ?? 72} ppp)
            </span>
            {acoesDoEspaco.gravacao ? (
              <span className="flex shrink-0 items-center gap-1 text-red-400" role="status">
                <span className="size-2 rounded-full bg-red-500" aria-hidden />
                Gravando a ação
              </span>
            ) : null}
            {vista.dicas ? <span className="min-w-0 truncate max-md:hidden">{dadosDa(ferramenta).dica}</span> : null}
          </footer>
        </main>

        <div className={paineisOcultos === "nenhum" ? "contents" : "hidden"}>
          <ColunaDePaineis grupos={area.estado.direita ?? []} paineis={paineis} area={area} className="shrink-0 border-l border-borda bg-painel max-md:h-[70vh] max-md:w-full max-md:border-l-0 max-md:border-t md:w-80" />
        </div>
      </div>

      {paradaDaAcao ? <JanelaParadaAoTocar mensagem={paradaDaAcao.mensagem} continuar={paradaDaAcao.continuar} aoResponder={paradaDaAcao.responder} /> : null}
      {janelaDoHistorico === "instantaneo" ? (
        <JanelaNovoInstantaneo
          nome={`Instantâneo ${instantaneos.length + 1}`}
          temCamada={Boolean(selecionado)}
          aoFechar={() => setJanelaDoHistorico(null)}
          aoConfirmar={(nome, de) => {
            setJanelaDoHistorico(null);
            void criarInstantaneo(nome, de);
          }}
        />
      ) : null}
      {janelaDoHistorico === "opcoes" ? (
        <JanelaOpcoesDoHistorico
          opcoes={opcoesDoHistorico}
          aoFechar={() => setJanelaDoHistorico(null)}
          aoConfirmar={(opcoes) => {
            setJanelaDoHistorico(null);
            setOpcoesDoHistorico(opcoes);
            guardarOpcoesDoHistorico(opcoes);
          }}
        />
      ) : null}
      {janelaDaMedicao === "escala" ? (
        <JanelaEscalaDeMedida
          escala={projeto.escala_de_medida}
          comprimentoDaRegua={medida ? Math.hypot(medida.ate.x - medida.de.x, medida.ate.y - medida.de.y) : null}
          aoFechar={() => setJanelaDaMedicao(null)}
          aoConfirmar={(escala) => {
            setJanelaDaMedicao(null);
            executar({ comando: "imagem.escalaDeMedida", parametros: { escala } });
          }}
        />
      ) : null}
      {janelaDaMedicao === "marcador" ? (
        <JanelaMarcadorDeEscala
          escala={projeto.escala_de_medida}
          aoFechar={() => setJanelaDaMedicao(null)}
          aoConfirmar={(opcoes) => {
            setJanelaDaMedicao(null);
            void inserirMarcadorDeEscala(opcoes);
          }}
        />
      ) : null}
      {filtroNeural ? <JanelaFiltroNeural tipo={filtroNeural} aoConfirmar={(corpo) => void pedirFiltroNeural(filtroNeural, corpo)} aoCancelar={() => setFiltroNeural(null)} /> : null}
      {substituindoCeu ? (
        <JanelaSubstituirCeu base={substituindoCeu.base} mascara={substituindoCeu.mascara} escala={substituindoCeu.escala} imagens={imagensProntas} aoConfirmar={(opcoes) => void confirmarSubstituicaoDoCeu(opcoes)} aoCancelar={() => setSubstituindoCeu(null)} />
      ) : null}
      {preenchendoComIA ? <JanelaPreenchimentoGenerativo aoGerar={(descricao, variacoes) => void pedirPreenchimento(descricao, variacoes)} aoCancelar={() => setPreenchendoComIA(false)} /> : null}
      {trocando ? (
        <JanelaEscolherImagem
          imagens={imagensProntas}
          aoFechar={() => setTrocando(null)}
          aoEscolher={(nova) => {
            const clipe = acharClipe(projeto, trocando)?.clipe;
            const atual = clipe?.midia_id ? midias.get(clipe.midia_id) : undefined;
            setTrocando(null);
            if (clipe?.vetor?.quadro) return void porFotoNoQuadro(clipe.id, nova.id);
            if (!clipe || !atual?.video || !nova.video) return;
            executar({
              comando: "imagem.trocarImagem",
              parametros: {
                clipeId: clipe.id,
                midiaId: nova.id,
                tamanhoAtual: { largura: atual.video.largura, altura: atual.video.altura },
                tamanhoNovo: { largura: nova.video.largura, altura: nova.video.altura },
              },
            });
          }}
        />
      ) : null}
      {exportandoPranchetas && projeto ? (
        <JanelaExportarPranchetas
          quantas={pranchetasDoProjeto(projeto).length}
          midias={midias}
          aoPreparar={() => pinturas.esperar().then(() => projetoRef.current ?? projeto)}
          fonteDosPixels={pinturas.fonte}
          fonteDaMascara={pinturas.fonteDaMascara}
          fonteDaMascaraDosFiltros={pinturas.fonteDaMascaraDosFiltros}
          aoFechar={() => setExportandoPranchetas(false)}
          aoAvisar={mostrarAviso}
        />
      ) : null}
      {repetindo ? (
        <JanelaObjetosNoCaminho
          origem={repetindo.origem}
          aoFechar={() => setRepetindo(null)}
          aoConfirmar={(quantidade, girar) => {
            const { clipeId, caminho } = repetindo;
            setRepetindo(null);
            const lugares = lugaresNoCaminho(caminho, quantidade).map((lugar) => ({ x: lugar.x, y: lugar.y, giro: girar ? lugar.angulo : 0 }));
            executar({ comando: "imagem.repetirNoCaminho", parametros: { clipeId, lugares } });
          }}
        />
      ) : null}
      {mesclando ? (
        <JanelaMesclarObjetos
          aoFechar={() => setMesclando(false)}
          aoConfirmar={(passos) => {
            setMesclando(false);
            mesclarObjetos(passos);
          }}
        />
      ) : null}
      {numerosDaTransformacao ? (
        <JanelaTransformarNumeros
          ferramenta={numerosDaTransformacao.ferramenta}
          origem={numerosDaTransformacao.origem}
          aoFechar={() => setNumerosDaTransformacao(null)}
          aoAplicar={(afim, copiar) => {
            setNumerosDaTransformacao(null);
            aplicarAfimNasCamadas(afim, copiar);
          }}
        />
      ) : null}
      {preferindo ? (
        <JanelaPreferencias
          vista={vista}
          estadosDoHistorico={opcoesDoHistorico.estados}
          aoFechar={() => setPreferindo(false)}
          aoConfirmar={(nova, estados) => {
            setPreferindo(false);
            mudarVista(nova);
            if (estados !== opcoesDoHistorico.estados) {
              const opcoes = { ...opcoesDoHistorico, estados };
              setOpcoesDoHistorico(opcoes);
              guardarOpcoesDoHistorico(opcoes);
            }
          }}
        />
      ) : null}
      {personalizando ? (
        <JanelaPersonalizar
          aba={personalizando}
          personalizacao={personalizacao}
          comandos={achatarMenus(menusDaImagem(acoes))}
          ferramentas={[...new Map(TODAS_AS_FERRAMENTAS.map((item) => [item.id, { id: item.id, nome: item.nome.replace(/^Ferramenta /, ""), tecla: item.tecla, grupo: GRUPOS_DE_FERRAMENTAS.indexOf(grupoDa(item.id)) }])).values()]}
          aoFechar={() => setPersonalizando(null)}
          aoConfirmar={(nova) => {
            setPersonalizando(null);
            setPersonalizacao(nova);
            guardarPersonalizacao(nova);
          }}
        />
      ) : null}
      {pesquisando ? (
        <JanelaPesquisar
          aoFechar={() => setPesquisando(false)}
          itens={[
            ...achatarMenus(personalizarMenus(menusDaImagem(acoes), personalizacao, true)),
            // As ferramentas (cada uma uma vez; algumas aparecem em dois grupos)
            ...[...new Map(TODAS_AS_FERRAMENTAS.map((item) => [item.id, item])).values()].map((item) => ({ nome: item.nome, caminho: "Ferramentas", atalho: teclaDaFerramenta(item, personalizacao) || undefined, tipo: "ferramenta" as const, acao: () => escolherFerramenta(item.id) })),
          ]}
        />
      ) : null}
      {fatiasEmArquivos && projeto ? (
        <JanelaFatiasEmArquivos
          midias={midias}
          documento={edicao.nome}
          aoPreparar={() => pinturas.esperar().then(() => projetoRef.current ?? projeto)}
          fonteDosPixels={pinturas.fonte}
          fonteDaMascara={pinturas.fonteDaMascara}
          fonteDaMascaraDosFiltros={pinturas.fonteDaMascaraDosFiltros}
          aoFechar={() => setFatiasEmArquivos(false)}
          aoAvisar={mostrarAviso}
        />
      ) : null}
      {janelaDaFatia === "dividir" && fatiaDaVez ? (
        <JanelaDividirFatia
          aoFechar={() => setJanelaDaFatia(null)}
          aoConfirmar={(colunas, linhas) => {
            setJanelaDaFatia(null);
            const partes = dividirFatia(fatiaDaVez, colunas, linhas, () => crypto.randomUUID().slice(0, 12));
            const onde = fatiasDoDocumento.findIndex((fatia) => fatia.id === fatiaDaVez.id);
            mudarFatias([...fatiasDoDocumento.slice(0, onde), ...partes, ...fatiasDoDocumento.slice(onde + 1)], "dividir a fatia");
          }}
        />
      ) : null}
      {janelaDaFatia === "opcoes" && fatiaDaVez ? (
        <JanelaOpcoesDaFatia
          fatia={fatiaDaVez}
          documento={tamanhoDaImagem(projeto)}
          aoFechar={() => setJanelaDaFatia(null)}
          aoConfirmar={(nova) => {
            setJanelaDaFatia(null);
            mudarFatias(fatiasDoDocumento.map((fatia) => (fatia.id === nova.id ? nova : fatia)), "mudar a fatia");
          }}
        />
      ) : null}
      {compsEmArquivos && projeto ? (
        <JanelaCompsEmArquivos
          midias={midias}
          comps={projeto.comps ?? []}
          aoPreparar={() => pinturas.esperar().then(() => projetoRef.current ?? projeto)}
          fonteDosPixels={pinturas.fonte}
          fonteDaMascara={pinturas.fonteDaMascara}
          fonteDaMascaraDosFiltros={pinturas.fonteDaMascaraDosFiltros}
          aoFechar={() => setCompsEmArquivos(false)}
          aoAvisar={mostrarAviso}
        />
      ) : null}
      {camadasEmArquivos && projeto ? (
        <JanelaCamadasEmArquivos
          midias={midias}
          aoPreparar={() => pinturas.esperar().then(() => projetoRef.current ?? projeto)}
          fonteDosPixels={pinturas.fonte}
          fonteDaMascara={pinturas.fonteDaMascara}
          fonteDaMascaraDosFiltros={pinturas.fonteDaMascaraDosFiltros}
          aoFechar={() => setCamadasEmArquivos(false)}
          aoAvisar={mostrarAviso}
        />
      ) : null}
      {janelaDoEstilo === "luz" && projeto ? (
        <JanelaLuzGlobal
          luz={projeto.luz_global ?? LUZ_GLOBAL_PADRAO}
          aoCancelar={() => setJanelaDoEstilo(null)}
          aoConfirmar={(luz) => {
            executar({ comando: "imagem.estiloDeCamada", parametros: { clipeIds: [], estilo: null, luz } });
            setJanelaDoEstilo(null);
          }}
        />
      ) : null}
      {janelaDoEstilo === "dimensionar" ? (
        <JanelaDimensionarEfeitos
          aoCancelar={() => setJanelaDoEstilo(null)}
          aoConfirmar={(fator) => {
            const ids = escolhidas.map((faixa) => faixa.clipes[0]).filter((clipe) => clipe.estilo_camada).map((clipe) => clipe.id);
            if (ids.length) executar({ comando: "imagem.dimensionarEfeitos", parametros: { clipeIds: ids, fator } });
            setJanelaDoEstilo(null);
          }}
        />
      ) : null}
      {estiloAberto && projeto ? (
        <JanelaEstiloDeCamada
          inicial={acharClipe(projeto, estiloAberto.clipeId)?.clipe.estilo_camada ?? null}
          luz={projeto.luz_global ?? LUZ_GLOBAL_PADRAO}
          geral={(() => {
            const clipe = acharClipe(projeto, estiloAberto.clipeId)?.clipe;
            return { mesclagem: clipe?.mesclagem && clipe.mesclagem !== "passagem" ? clipe.mesclagem : "normal", opacidade: clipe?.transformacao.opacidade ?? 1, preenchimento: clipe?.preenchimento ?? 1 };
          })()}
          foco={estiloAberto.foco}
          primeiroPlano={cores.primeiroPlano}
          fundo={cores.fundo}
          degradesDoEspaco={degradesDoEspaco.recursos.map((recurso) => recurso.dados)}
          aoPrever={preverEstilo}
          aoConfirmar={(estilo, luz, camada) => {
            setProvisorio(null);
            executar({ comando: "imagem.estiloDeCamada", parametros: { clipeIds: [estiloAberto.clipeId], estilo, luz, camada } });
            setEstiloAberto(null);
          }}
          aoCancelar={() => {
            setProvisorio(null);
            setEstiloAberto(null);
          }}
        />
      ) : null}
      {nosPixels && projeto ? (
        <JanelaDeAjusteNosPixels
          operacao={nosPixels.operacao}
          visualizar={nosPixels.visualizar}
          imagem={nosPixels.pequena}
          origens={[{ id: "documento", nome: "O documento inteiro" }, ...camadasDaImagem(projeto).filter(({ clipe }) => clipe.id !== nosPixels.clipeId && !clipe.pasta && !clipe.ajuste).map(({ faixa }) => ({ id: faixa.id, nome: nomeDaFaixa(faixa) }))]}
          primeiroPlano={cores.primeiroPlano}
          fundo={cores.fundo}
          degradesDoEspaco={degradesDoEspaco.recursos.map((recurso) => recurso.dados)}
          amostrando={pedidoDeAmostra?.clipeId === "janela"}
          aoPedirAmostra={(receber) => setPedidoDeAmostra(receber ? { clipeId: "janela", receber } : null)}
          aoMudar={(operacao) => setNosPixels((atual) => (atual ? { ...atual, operacao } : atual))}
          aoVisualizar={(visualizar) => setNosPixels((atual) => (atual ? { ...atual, visualizar } : atual))}
          aoConfirmar={confirmarNosPixels}
          aoCancelar={cancelarNosPixels}
          canais={projeto.canais ?? []}
          galeria={propsDaGaleria}
        />
      ) : null}
      {galeriaDeFiltros ? (
        <JanelaGaleriaDeFiltros
          imagem={galeriaDeFiltros.imagem}
          documento={galeriaDeFiltros.documento}
          primeiroPlano={corEmRgb(galeriaDeFiltros.cores.frente)}
          fundo={corEmRgb(galeriaDeFiltros.cores.fundo)}
          inicial={galeriaDeFiltros.inicial}
          aoConfirmar={confirmarGaleriaDeFiltros}
          aoCancelar={fecharGaleriaDeFiltros}
        />
      ) : null}
      {filtroAberto ? (
        <JanelaDoFiltroInteligente
          key={`${filtroAberto.clipeId}:${filtroAberto.filtroId}`}
          tipo={filtroAberto.tipo}
          inicial={filtroAberto.inicial}
          aoPrever={preverFiltro}
          canais={projeto?.canais ?? []}
          controlado={filtroAberto.tipo === "galeria" && valoresDaGaleria ? { valores: valoresDaGaleria, aoMudar: setValoresDaGaleria } : undefined}
          galeria={propsDaGaleria}
          aoConfirmar={(valores) => {
            const filtros = pilhaComFiltro(valores);
            setProvisorio(null);
            setFiltroAberto(null);
            if (executar({ comando: "imagem.filtros", parametros: { clipeId: filtroAberto.clipeId, filtros } })) setUltimoFiltro({ tipo: filtroAberto.tipo, opcoes: valores });
          }}
          aoCancelar={() => {
            setProvisorio(null);
            setFiltroAberto(null);
          }}
        />
      ) : null}
      {mesclagemDoFiltro ? (
        <JanelaMesclagemDoFiltro
          nome={(() => {
            const filtro = mesclagemDoFiltro.antes.filtros.find((item) => item.id === mesclagemDoFiltro.filtroId);
            return (filtro && FILTRO_POR_ID.get(filtro.tipo)?.nome) ?? "filtro";
          })()}
          inicial={(() => {
            const filtro = mesclagemDoFiltro.antes.filtros.find((item) => item.id === mesclagemDoFiltro.filtroId);
            return { modo: filtro?.modo ?? "normal", opacidade: filtro?.opacidade ?? 1 };
          })()}
          aoPrever={(m) =>
            setProvisorio({
              comando: "imagem.filtros",
              parametros: { clipeId: mesclagemDoFiltro.clipeId, filtros: { ...mesclagemDoFiltro.antes, filtros: mesclagemDoFiltro.antes.filtros.map((item) => (item.id === mesclagemDoFiltro.filtroId ? { ...item, ...m } : item)) } },
            })
          }
          aoConfirmar={(m) => {
            setProvisorio(null);
            executar({
              comando: "imagem.filtros",
              parametros: { clipeId: mesclagemDoFiltro.clipeId, filtros: { ...mesclagemDoFiltro.antes, filtros: mesclagemDoFiltro.antes.filtros.map((item) => (item.id === mesclagemDoFiltro.filtroId ? { ...item, ...m } : item)) } },
            });
            setMesclagemDoFiltro(null);
          }}
          aoCancelar={() => {
            setProvisorio(null);
            setMesclagemDoFiltro(null);
          }}
        />
      ) : null}
      {preenchendo ? (
        <JanelaCamadaDePreenchimento
          key={`${preenchendo.clipeId}:${preenchendo.inicial.tinta.tipo}`}
          inicial={preenchendo.inicial}
          primeiroPlano={cores.primeiroPlano}
          fundo={cores.fundo}
          degradesDoEspaco={degradesDoEspaco.recursos.map((recurso) => recurso.dados)}
          aoPrever={preverPreenchimento}
          aoConfirmar={(preenchimento) => {
            const comando = comandoDoPreenchimento(preenchimento);
            setProvisorio(null);
            setPreenchendo(null);
            if (comando) executar(comando);
          }}
          aoCancelar={() => {
            setProvisorio(null);
            setPreenchendo(null);
          }}
        />
      ) : null}
      {deformando ? (
        <JanelaDeformarTexto
          inicial={deformando.antes}
          aoPrever={(deformar) => deformarTexto(deformar, false)}
          aoConfirmar={(deformar) => {
            deformarTexto(deformar, true);
            setDeformando(null);
          }}
          aoCancelar={() => {
            deformarTexto(deformando.antes, false);
            setProvisorio(null);
            setDeformando(null);
          }}
        />
      ) : null}
      {localizandoTexto ? <JanelaLocalizarTexto aoFechar={() => setLocalizandoTexto(false)} aoLocalizar={localizarTexto} aoSubstituir={substituirTexto} aoSubstituirTudo={substituirTudo} /> : null}
      {exportando ? (
        <JanelaExportarImagem
          projeto={projeto}
          nome={edicao.nome}
          midias={midias}
          modo={exportando}
          aoFechar={() => setExportando(false)}
          aoAvisar={mostrarAviso}
          aoPrepararPintura={() => pinturas.esperar().then(() => projetoRef.current ?? projeto)}
          fonteDosPixels={pinturas.fonte}
          fonteDaMascara={pinturas.fonteDaMascara}
          fonteDaMascaraDosFiltros={pinturas.fonteDaMascaraDosFiltros}
        />
      ) : null}
      {janelaDoArquivo === "informacoes" && projeto ? (
        <JanelaInformacoesDoArquivo
          inicial={projeto.informacoes}
          resumo={[
            { rotulo: "Tamanho", valor: `${tamanhoDaImagem(projeto).largura} × ${tamanhoDaImagem(projeto).altura} px` },
            { rotulo: "Resolução", valor: `${Math.round(projeto.tamanho?.resolucao ?? 72)} ppp` },
            { rotulo: "Modo de cor", valor: "RGB, 8 bits por canal" },
            { rotulo: "Camadas", valor: String(projeto.faixas.filter((faixa) => faixa.tipo !== "principal" && faixa.clipes[0] && !faixa.clipes[0].pasta).length) },
          ]}
          aoFechar={() => setJanelaDoArquivo(null)}
          aoConfirmar={(informacoes) => {
            setJanelaDoArquivo(null);
            executar({ comando: "imagem.informacoes", parametros: { informacoes } });
          }}
        />
      ) : null}
      {janelaDaVista === "guia" && projeto ? (
        <JanelaNovaGuia
          unidade={vista.unidade}
          ppi={projeto.tamanho?.resolucao ?? 72}
          documento={tamanhoDaImagem(projeto)}
          aoFechar={() => setJanelaDaVista(null)}
          aoConfirmar={(tipo, pos) => {
            setJanelaDaVista(null);
            const nova = tipo === "v" ? { verticais: [pos], horizontais: [] } : { verticais: [], horizontais: [pos] };
            executar({ comando: "imagem.guias", parametros: { guias: juntarGuias(projeto.guias ?? { verticais: [], horizontais: [] }, nova) } });
          }}
        />
      ) : null}
      {janelaDaVista === "layout" && projeto ? (
        <JanelaLayoutDeGuias
          aoFechar={() => setJanelaDaVista(null)}
          aoConfirmar={(layout, limpar) => {
            setJanelaDaVista(null);
            const novas = guiasDoLayout(layout, tamanhoDaImagem(projeto));
            executar({ comando: "imagem.guias", parametros: { guias: limpar ? novas : juntarGuias(projeto.guias ?? { verticais: [], horizontais: [] }, novas) } });
          }}
        />
      ) : null}
      {janelaDaVista === "grade" ? (
        <JanelaGrade
          espaco={vista.espacoDaGrade}
          subdivisoes={vista.subdivisoes}
          aoFechar={() => setJanelaDaVista(null)}
          aoConfirmar={(espacoDaGrade, subdivisoes) => {
            setJanelaDaVista(null);
            mudarVista({ espacoDaGrade, subdivisoes, grade: true });
          }}
        />
      ) : null}
      {janelaDasVariaveis === "definir" && projeto ? (
        <JanelaDefinirVariaveis
          camadas={camadasDaImagem(projeto).flatMap(({ faixa, clipe }) => {
            if (clipe.pasta || clipe.ajuste) return [];
            const ehFoto = Boolean(clipe.midia_id && !clipe.pixels && midias.get(clipe.midia_id)?.imagem);
            const tipos: TipoDaVariavel[] = clipe.texto_rico ? ["texto", "visibilidade"] : ehFoto ? ["imagem", "visibilidade"] : ["visibilidade"];
            return [{ faixaId: faixa.id, nome: nomeDaFaixa(faixa), tipos }];
          })}
          inicial={definicaoDasVariaveis}
          aoFechar={() => setJanelaDasVariaveis(null)}
          aoConfirmar={(variaveis) => {
            setJanelaDasVariaveis(null);
            executar({ comando: "imagem.variaveis", parametros: { variaveis: { ...definicaoDasVariaveis, variaveis } } });
          }}
        />
      ) : null}
      {janelaDasVariaveis === "conjuntos" && projeto ? (
        <JanelaConjuntos
          definicao={definicaoDasVariaveis}
          imagens={imagensProntas}
          aoFechar={() => setJanelaDasVariaveis(null)}
          aoSalvar={(conjuntos) => {
            const atual = projetoRef.current?.variaveis ?? definicaoDasVariaveis;
            if (JSON.stringify(atual.conjuntos) !== JSON.stringify(conjuntos)) executar({ comando: "imagem.variaveis", parametros: { variaveis: { ...atual, conjuntos } } });
          }}
          aoAplicar={aplicarConjuntoDeDados}
          aoDoDocumento={(nome) => conjuntoDoDocumento(projetoRef.current ?? projeto, definicaoDasVariaveis, nome, (id) => midias.get(id)?.nome ?? id)}
          aoExportar={async (conjuntos, formato, padrao) => {
            try {
              await pinturas.esperar();
              const atual = projetoRef.current ?? projeto;
              const { arquivo, avisos } = await exportarConjuntos(atual, midias, atual.variaveis ?? definicaoDasVariaveis, conjuntos, formato, padrao, paraAplicar(), { fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara, fonteDaMascaraDosFiltros: pinturas.fonteDaMascaraDosFiltros }, mostrarAviso);
              baixarBlob(arquivo.blob, arquivo.nome);
              mostrarAviso([`${conjuntos.length} ${conjuntos.length === 1 ? "arquivo exportado" : "arquivos exportados"}.`, ...avisos].join(" "));
            } catch (e) {
              mostrarAviso(e instanceof Error ? e.message : "Não foi possível exportar os conjuntos.");
            }
          }}
        />
      ) : null}
      {automatizando && projeto ? (
        <JanelaAutomatizar
          tipo={automatizando}
          imagens={imagensProntas}
          ajustesDoDocumento={[...camadasDaImagem(projeto)].reverse().flatMap(({ faixa, clipe }) => (clipe.ajuste && clipe.ajuste_imagem && !faixa.oculta && clipe.ajuste_imagem.tipo !== "pesquisa" ? [clipe.ajuste_imagem] : []))}
          modoDoDocumento={projeto.modo ?? null}
          acoes={acoesDoEspaco.conjuntos.flatMap((conjunto) => conjunto.acoes.map((acao) => ({ id: `${conjunto.id}/${acao.id}`, nome: `${conjunto.nome} › ${acao.nome}`, acao })))}
          aoFechar={() => setAutomatizando(null)}
          aoCriar={aoCriarPelaAutomacao}
          aoAvisar={mostrarAviso}
        />
      ) : null}
      {ajustandoImagem && projeto ? (
        <JanelaAjustarImagem
          antes={tamanhoDaImagem(projeto)}
          aoFechar={() => setAjustandoImagem(false)}
          aoConfirmar={(tamanho) => {
            setAjustandoImagem(false);
            void aplicarTamanhoDaImagem({ ...tamanho, resolucao: projeto.tamanho?.resolucao ?? 72, reamostrar: true, metodo: "automatica" });
          }}
        />
      ) : null}
      {janelaDoModo === "bitmap" && projeto ? (
        <JanelaBitmap inicial={projeto.modo} ppi={projeto.tamanho?.resolucao ?? 72} aoFechar={() => setJanelaDoModo(null)} aoConfirmar={(modo) => (setJanelaDoModo(null), executar({ comando: "imagem.modo", parametros: { modo } }))} />
      ) : null}
      {janelaDoModo === "duotone" && projeto ? (
        <JanelaDuotone inicial={projeto.modo} aoFechar={() => setJanelaDoModo(null)} aoConfirmar={(modo) => (setJanelaDoModo(null), executar({ comando: "imagem.modo", parametros: { modo } }))} />
      ) : null}
      {janelaDoModo === "cmyk" && projeto ? (
        <JanelaCmyk inicial={projeto.modo} aoFechar={() => setJanelaDoModo(null)} aoConfirmar={(modo) => (setJanelaDoModo(null), executar({ comando: "imagem.modo", parametros: { modo } }))} />
      ) : null}
      {janelaDoModo === "indexadas" && projeto ? <JanelaCoresIndexadas inicial={projeto.modo} aoFechar={() => setJanelaDoModo(null)} aoConfirmar={(opcoes) => void converterEmIndexadas(opcoes)} /> : null}
      {janelaDoModo === "tabela" && projeto?.modo?.tipo === "indexadas" ? (
        <JanelaTabelaDeCores
          modo={projeto.modo}
          aoFechar={() => setJanelaDoModo(null)}
          aoConfirmar={(paleta) => {
            setJanelaDoModo(null);
            if (projeto.modo?.tipo === "indexadas") executar({ comando: "imagem.modo", parametros: { modo: { ...projeto.modo, paleta } } });
          }}
        />
      ) : null}
      {janelaDoArquivo === "duplicar" ? <JanelaDuplicarDocumento nome={edicao.nome} aoFechar={() => setJanelaDoArquivo(null)} aoConfirmar={(nome, mescladas) => void duplicarDocumento(nome, mescladas)} /> : null}
      {janelaDoArquivo === "imprimir" && projeto ? (
        <JanelaImprimir tamanho={tamanhoDaImagem(projeto)} ppi={projeto.tamanho?.resolucao ?? 72} aoFechar={() => setJanelaDoArquivo(null)} aoConfirmar={(opcoes) => void imprimir(opcoes)} />
      ) : null}
      {preferenciasDeExportacao ? <JanelaPreferenciasDeExportacao aoFechar={() => setPreferenciasDeExportacao(false)} aoAvisar={mostrarAviso} /> : null}
      {atalhos ? <JanelaDeAtalhos acoes={acoes} aoFechar={() => setAtalhos(false)} /> : null}
      {janelaDaSelecao?.tipo === "cores" ? (
        <JanelaIntervaloDeCores
          imagem={janelaDaSelecao.imagem}
          aoFechar={() => setJanelaDaSelecao(null)}
          aoConfirmar={(selecao) => {
            setJanelaDaSelecao(null);
            if (!temAlgo(selecao)) mostrarAviso("Nenhum pixel ficou mais da metade selecionado.");
            selecionarNoDocumento(selecao);
          }}
        />
      ) : null}
      {janelaDaSelecao?.tipo === "foco" ? (
        <JanelaAreaDeFoco
          imagem={janelaDaSelecao.imagem}
          aoFechar={() => setJanelaDaSelecao(null)}
          aoConfirmar={(selecao) => {
            setJanelaDaSelecao(null);
            selecionarNoDocumento(selecao);
          }}
        />
      ) : null}
      {janelaDePixels === "preencher" ? (
        <JanelaPreencher
          inicial={ultimoPreenchimento}
          comFoto={Boolean(foto && selecaoNoDocumento)}
          aoFechar={() => setJanelaDePixels(null)}
          aoConfirmar={(p) => {
            setJanelaDePixels(null);
            setUltimoPreenchimento(p);
            preencher(p);
          }}
        />
      ) : null}
      {janelaDePixels === "tracado" ? (
        <JanelaTracado
          inicial={{ ...ultimoTracado, cor: ultimoTracado.cor || cores.primeiroPlano }}
          aoFechar={() => setJanelaDePixels(null)}
          aoConfirmar={(t) => {
            setJanelaDePixels(null);
            setUltimoTracado(t);
            tracar(t);
          }}
        />
      ) : null}
      {editandoDegrade ? (
        <JanelaEditorDeDegrade
          inicial={opcoesDoDegrade.degrade}
          doEspaco={degradesDoEspaco.recursos.map((recurso) => recurso.dados)}
          primeiroPlano={cores.primeiroPlano}
          fundo={cores.fundo}
          aoFechar={() => setEditandoDegrade(false)}
          aoConfirmar={(degrade) => {
            setEditandoDegrade(false);
            setOpcoesDoDegrade((atual) => ({ ...atual, degrade }));
          }}
          aoSalvar={salvarDegrade}
        />
      ) : null}
      {janelaDePixels === "atenuar" ? (
        <JanelaAtenuar
          nome={edicao.nomeDesfazer ?? ""}
          aoFechar={() => setJanelaDePixels(null)}
          aoConfirmar={(opacidade, modo) => {
            setJanelaDePixels(null);
            void atenuar(opacidade, modo);
          }}
        />
      ) : null}
      {janelaDePixels === "aparar" ? (
        <JanelaAparar
          temTransparencia={Boolean(projeto.fundo.transparente)}
          aoFechar={() => setJanelaDePixels(null)}
          aoConfirmar={(por) => {
            setJanelaDePixels(null);
            aparar(por);
          }}
        />
      ) : null}
      {refinando ? (
        <SelecionarEMascarar
          imagem={refinando.imagem}
          fundo={refinando.fundo}
          selecao={selecaoNoDocumento}
          temCamada={Boolean(refinando.clipeId)}
          aoFechar={() => setRefinando(null)}
          aoConfirmar={(resultado) => void saidaDoRefinamento(resultado)}
        />
      ) : null}
      {dissolvendo
        ? (() => {
            const aoConfirmar = (pixels: Uint8ClampedArray<ArrayBuffer>) => {
              const { dados, imagem } = dissolvendo;
              setDissolvendo(null);
              const canvas = document.createElement("canvas");
              canvas.width = imagem.largura;
              canvas.height = imagem.altura;
              canvas.getContext("2d")!.putImageData(new ImageData(pixels, imagem.largura, imagem.altura), 0, 0);
              canvas.toBlob((blob) => blob && void gerarPixels(async () => blob, dados), "image/png");
            };
            if (dissolvendo.tipo === "lente" || dissolvendo.tipo === "grandeAngular") return <JanelaLente tipo={dissolvendo.tipo} imagem={dissolvendo.imagem} aoFechar={() => setDissolvendo(null)} aoConfirmar={aoConfirmar} />;
            const Janela = dissolvendo.tipo === "marionete" ? JanelaMarionete : dissolvendo.tipo === "perspectiva" ? JanelaPerspectiva : JanelaDissolver;
            return (
              <Janela imagem={dissolvendo.imagem} aoFechar={() => setDissolvendo(null)} aoConfirmar={aoConfirmar} />
            );
          })()
        : null}
      {janelaDasCamadas === "alinhar" ? (
        <JanelaAlinhar
          aoFechar={() => setJanelaDasCamadas(null)}
          aoConfirmar={(projecao) => {
            setJanelaDasCamadas(null);
            void alinharCamadas(projecao);
          }}
        />
      ) : null}
      {janelaDasCamadas === "mesclar" ? (
        <JanelaMesclarCamadas
          aoFechar={() => setJanelaDasCamadas(null)}
          aoConfirmar={(metodo, tons) => {
            setJanelaDasCamadas(null);
            void mesclarCamadas(metodo, tons);
          }}
        />
      ) : null}
      {janelaDoCaminho?.tipo === "tracar" ? (
        <JanelaTracarCaminho
          aoFechar={() => setJanelaDoCaminho(null)}
          aoConfirmar={(qual, simular) => {
            const caminho = caminhosDoDocumento.find((item) => item.id === janelaDoCaminho.id);
            setJanelaDoCaminho(null);
            if (caminho) void tracarCaminho(caminho.subcaminhos, qual, simular);
          }}
        />
      ) : null}
      {janelaDoCaminho?.tipo === "preencher" ? (
        <JanelaPreencher
          inicial={ultimoPreenchimento}
          comFoto={false}
          aoFechar={() => setJanelaDoCaminho(null)}
          aoConfirmar={(p) => {
            const caminho = caminhosDoDocumento.find((item) => item.id === janelaDoCaminho.id);
            setJanelaDoCaminho(null);
            const selecao = caminho ? selecaoDosCaminhos(caminho.subcaminhos) : null;
            if (!selecao) return void mostrarAviso("O caminho precisa ter área (três pontos ou mais) para ser preenchido.");
            setUltimoPreenchimento(p);
            preencher(p, selecao);
          }}
        />
      ) : null}
      {janelaDoCaminho?.tipo === "daSelecao" ? (
        <JanelaCaminhoDaSelecao
          aoFechar={() => setJanelaDoCaminho(null)}
          aoConfirmar={(tolerancia) => {
            setJanelaDoCaminho(null);
            caminhoDaSelecao(tolerancia);
          }}
        />
      ) : null}
      {criandoForma ? (
        <JanelaCriarForma
          tipo={criandoForma.tipo}
          aoFechar={() => setCriandoForma(null)}
          aoConfirmar={({ largura, altura, doMeio }) => {
            const { tipo, ponto } = criandoForma;
            setCriandoForma(null);
            // A linha: o comprimento e o ângulo; as outras: a largura e a altura
            const fim = tipo === "linha" ? { x: ponto.x + Math.cos((altura * Math.PI) / 180) * largura, y: ponto.y + Math.sin((altura * Math.PI) / 180) * largura } : { x: ponto.x + largura, y: ponto.y + altura };
            const inicio = doMeio ? { x: ponto.x - (fim.x - ponto.x) / 2, y: ponto.y - (fim.y - ponto.y) / 2 } : ponto;
            const ate = doMeio ? { x: ponto.x + (fim.x - ponto.x) / 2, y: ponto.y + (fim.y - ponto.y) / 2 } : fim;
            criarFormaViva(tipo, arrastoDaForma(inicio, ate));
          }}
        />
      ) : null}
      {pontoDeFuga && projeto ? (
        <JanelaPontoDeFuga
          fundo={pontoDeFuga}
          fontes={[
            ...(areaDeTransferencia.current ? [{ id: "copia", nome: "O que foi copiado" }] : []),
            ...camadasDaImagem(projeto)
              .filter(({ clipe }) => !clipe.pasta && !clipe.ajuste)
              .map(({ faixa }) => ({ id: faixa.id, nome: nomeDaFaixa(faixa) })),
          ]}
          carregarFonte={fonteDoPontoDeFuga}
          aoFechar={() => setPontoDeFuga(null)}
          aoConfirmar={(pixels) => {
            const { largura, altura } = pontoDeFuga;
            setPontoDeFuga(null);
            const canvas = document.createElement("canvas");
            canvas.width = largura;
            canvas.height = altura;
            canvas.getContext("2d")!.putImageData(new ImageData(pixels, largura, altura), 0, 0);
            canvas.toBlob((blob) => blob && void gerarPixels(async () => blob, { remover: [], lugar: null, nome: "Ponto de fuga", manter: { opacidade: 1, faixa: {} } }), "image/png");
          }}
        />
      ) : null}
      {escalando ? (
        <JanelaEscalaSensivel
          antes={{ largura: escalando.caixa.x1 - escalando.caixa.x0, altura: escalando.caixa.y1 - escalando.caixa.y0 }}
          canais={(projeto?.canais ?? []).map((canal) => ({ id: canal.id, nome: canal.nome }))}
          temSelecao={Boolean(selecaoNoDocumento)}
          aoFechar={() => setEscalando(null)}
          aoConfirmar={(nova) => void aplicarEscalaSensivel(nova)}
        />
      ) : null}
      {janelaDoDocumento === "imagem" && projeto ? (
        <JanelaTamanhoDaImagem
          antes={{ ...tamanhoDaImagem(projeto), resolucao: projeto.tamanho?.resolucao ?? 72 }}
          aoFechar={() => setJanelaDoDocumento(null)}
          aoConfirmar={(novo) => {
            setJanelaDoDocumento(null);
            void aplicarTamanhoDaImagem(novo);
          }}
        />
      ) : null}
      {janelaDoDocumento === "tela" && projeto ? (
        <JanelaTamanhoDaTela
          antes={{ ...tamanhoDaImagem(projeto), resolucao: projeto.tamanho?.resolucao ?? 72 }}
          primeiroPlano={cores.primeiroPlano}
          fundo={cores.fundo}
          aoFechar={() => setJanelaDoDocumento(null)}
          aoConfirmar={(nova) => {
            setJanelaDoDocumento(null);
            aplicarTamanhoDaTela(nova);
          }}
        />
      ) : null}
      {janelaDoDocumento === "giro" ? (
        <JanelaDeNumero
          titulo="Girar a imagem"
          rotulo="Ângulo (° no sentido horário; negativo, no anti-horário)"
          padrao={0}
          minimo={-359.99}
          maximo={359.99}
          aoFechar={() => setJanelaDoDocumento(null)}
          aoConfirmar={(graus) => {
            setJanelaDoDocumento(null);
            if (graus) executar({ comando: "imagem.girar", parametros: { giro: { graus }, tamanhos: tamanhosDasMidias() } });
          }}
        />
      ) : null}
      {nomeDaForma ? (
        <JanelaDeNome
          titulo="Nome da forma"
          rotulo="Nome"
          inicial={`Forma ${formasDoEspaco.length + 1}`}
          aoFechar={() => setNomeDaForma(false)}
          aoConfirmar={(nome) => {
            setNomeDaForma(false);
            definirFormaPersonalizada(nome);
          }}
        />
      ) : null}
      {nomeDoPadrao ? (
        <JanelaDeNome
          titulo="Nome do padrão"
          rotulo="Nome"
          inicial={`Padrão ${padroesDoEspaco.recursos.length + 1}`}
          aoFechar={() => setNomeDoPadrao(false)}
          aoConfirmar={(nome) => {
            setNomeDoPadrao(false);
            definirPadrao(nome);
          }}
        />
      ) : null}
      {nomeDoPincel ? (
        <JanelaDeNome
          titulo="Nome do pincel"
          rotulo="Nome"
          inicial={`Pincel ${pinceisDoEspaco.pinceis.length + 1}`}
          aoFechar={() => setNomeDoPincel(false)}
          aoConfirmar={(nome) => {
            setNomeDoPincel(false);
            definirPincelDaSelecao(nome);
          }}
        />
      ) : null}
      {janelaDoCanal === "salvar" ? (
        <JanelaSalvarSelecao
          canais={canais}
          aoFechar={() => setJanelaDoCanal(null)}
          aoConfirmar={(destino, nome, operacao) => {
            setJanelaDoCanal(null);
            void salvarSelecaoNoCanal(destino, nome, operacao);
          }}
        />
      ) : null}
      {janelaDoCanal === "carregar" ? (
        <JanelaCarregarSelecao
          canais={canais}
          camada={selecionado ? nomeDaFaixa(selecionado.faixa) : null}
          temSelecao={Boolean(selecaoNoDocumento)}
          aoFechar={() => setJanelaDoCanal(null)}
          aoConfirmar={(fonte, inverter, operacao) => {
            setJanelaDoCanal(null);
            void carregarSelecaoDoCanal(fonte, inverter, operacao);
          }}
        />
      ) : null}
      {modificando ? (
        <JanelaDeNumero
          {...MODIFICACOES[modificando]}
          aoFechar={() => setModificando(null)}
          aoConfirmar={(valor) => {
            setModificando(null);
            modificarSelecao(modificando, valor);
          }}
        />
      ) : null}
      {edicao.aviso ? (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-8 z-50 flex justify-center px-4">
          <p className="rounded-lg border border-borda bg-painel-3 px-4 py-2 text-sm shadow-xl shadow-black/40">{edicao.aviso}</p>
        </div>
      ) : null}
    </div>
  );
}

/** A barra de menus e os atalhos dela (os menus são montados aqui, com o estado da vez). */
function MenusDaImagem({ acoes, ativo, personalizacao, mostrarTudo, aoMostrarTudo }: { acoes: AcoesDosMenus; ativo: boolean; personalizacao: Personalizacao; mostrarTudo: boolean; aoMostrarTudo: () => void }) {
  // Os menus com os atalhos, as cores e os itens escondidos da personalização; os menus com algum escondido ganham
  // no fim o item que mostra todos (até recarregar)
  const menus = personalizarMenus(menusDaImagem(acoes), personalizacao, mostrarTudo).map((menu) =>
    !mostrarTudo && personalizacao.ocultos.some((chave) => chave.startsWith(`${menu.nome} › `)) ? { ...menu, itens: [...menu.itens, "-" as const, { nome: "Mostrar todos os itens do menu", aoEscolher: aoMostrarTudo }] } : menu,
  );
  useAtalhosDosMenus(menus, ativo);
  return (
    <>
      <BarraDeMenus menus={menus} className="min-w-0 max-md:hidden" />
      {/* No celular, os menus num só, como submenus */}
      <BarraDeMenus menus={[{ nome: "Menu", itens: menus.map((menu) => ({ nome: menu.nome, itens: menu.itens })) }]} className="md:hidden" />
    </>
  );
}

/** A camada da forma desenhada: o centro no meio da caixa e a escala que dá à imagem a largura da caixa. */
function transformacaoDaCaixa(caixa: RetanguloDaImagem, midia: Midia, quadro: { largura: number; altura: number }): Partial<Transformacao> {
  const largura = midia.video?.largura ?? 1;
  const altura = midia.video?.altura ?? 1;
  // Escala 1 é a imagem inteira cabendo no quadro
  const cabe = Math.min(quadro.largura / largura, quadro.altura / altura);
  return {
    x: (caixa.x + caixa.largura / 2) / quadro.largura - 0.5,
    y: (caixa.y + caixa.altura / 2) / quadro.altura - 0.5,
    escala: Math.max(caixa.largura / (largura * cabe), caixa.altura / (altura * cabe)),
  };
}

/** A proporção que o Corte prende (largura sobre altura), ou null na livre. */
function proporcaoDoCorte(opcoes: OpcoesDoCorte, documento: { largura: number; altura: number }): number | null {
  if (opcoes.predefinicao === "livre") return null;
  if (opcoes.predefinicao === "original") return documento.largura / documento.altura;
  if (opcoes.predefinicao === "tamanho") return opcoes.tamanhoFinal.largura / opcoes.tamanhoFinal.altura;
  return opcoes.predefinicao;
}

/** Ajuda > Atalhos do teclado: as ferramentas e os atalhos dos menus. */
/** A janela de um número só (Selecionar › Modificar): Enter confirma, Esc fecha. */
function JanelaDeNumero({
  titulo,
  rotulo,
  padrao,
  minimo,
  maximo,
  aoFechar,
  aoConfirmar,
}: {
  titulo: string;
  rotulo: string;
  padrao: number;
  minimo: number;
  maximo: number;
  aoFechar: () => void;
  aoConfirmar: (valor: number) => void;
}) {
  const [texto, setTexto] = useState(String(padrao));
  const numero = Number(texto.replace(",", "."));
  const valido = Number.isFinite(numero) && numero >= minimo && numero <= maximo;
  useEffect(() => {
    const esc = (evento: KeyboardEvent) => evento.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <form
        role="dialog"
        aria-modal
        aria-label={titulo}
        className="w-full max-w-xs rounded-lg border border-borda bg-painel p-4 shadow-2xl"
        onClick={(evento) => evento.stopPropagation()}
        onSubmit={(evento) => {
          evento.preventDefault();
          if (valido) aoConfirmar(numero);
        }}
      >
        <h2 className="mb-3 text-sm font-semibold">{titulo}</h2>
        <label className="flex items-center gap-2 text-xs">
          {rotulo}:
          <input autoFocus inputMode="decimal" value={texto} onChange={(evento) => setTexto(evento.currentTarget.value)} onFocus={(evento) => evento.currentTarget.select()} className="w-20 rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-right tabular-nums" />
          pixels
        </label>
        {!valido ? <p className="mt-2 text-[11px] text-erro">Use um número de {minimo.toLocaleString("pt-BR")} a {maximo.toLocaleString("pt-BR")}.</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao-principal px-3 py-1 text-xs" disabled={!valido}>
            OK
          </button>
        </div>
      </form>
    </div>
  );
}

function JanelaDeAtalhos({ acoes, aoFechar }: { acoes: AcoesDosMenus; aoFechar: () => void }) {
  const menus = menusDaImagem(acoes);
  type Linha = { nome: string; atalho: string };
  const doMenu = (itens: ReturnType<typeof menusDaImagem>[number]["itens"]): Linha[] =>
    itens.flatMap((item) => (item === "-" ? [] : "itens" in item ? doMenu(item.itens) : item.atalho ? [{ nome: item.nome.replace(/…$/, ""), atalho: item.atalho }] : []));
  useEffect(() => {
    const esc = (evento: KeyboardEvent) => evento.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <div role="dialog" aria-modal aria-label="Atalhos do teclado" className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-borda bg-painel shadow-2xl" onClick={(evento) => evento.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
          <h2 className="text-sm font-semibold">Atalhos do teclado</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="grid min-h-0 gap-6 overflow-y-auto p-4 text-xs sm:grid-cols-2">
          <section>
            <h3 className="mb-2 font-semibold">Ferramentas</h3>
            <dl>
              {TODAS_AS_FERRAMENTAS.map((item) => (
                <div key={item.id} className="flex justify-between gap-3 border-b border-borda/50 py-1">
                  <dt>{item.nome}</dt>
                  <dd className="font-mono text-suave">{item.tecla}</dd>
                </div>
              ))}
              {[
                ["Mão temporária", "Espaço"],
                ["Cores padrão", "D"],
                ["Trocar as cores", "X"],
                ["Pincel menor / maior", "[ / ]"],
                ["Pincel mais macio / mais duro", "Shift + [ / ]"],
                ["Tamanho e dureza arrastando", "Alt + botão direito"],
                ["Opacidade do pincel (10% a 100%)", "1 … 0"],
                ["Empurrar as camadas 1 px (10 com Shift)", "Setas"],
                ["Opacidade das camadas (10% a 100%)", "1 … 0"],
                ["Excluir as camadas", "Delete"],
                ["Mostrar só uma camada", "Alt + clique no olho"],
                ["Escolher várias camadas", "Ctrl ou Shift + clique"],
                ["Renomear a camada", "Duplo clique no nome"],
              ].map(([nome, atalho]) => (
                <div key={nome} className="flex justify-between gap-3 border-b border-borda/50 py-1">
                  <dt>{nome}</dt>
                  <dd className="font-mono text-suave">{atalho}</dd>
                </div>
              ))}
            </dl>
          </section>
          {menus.map((menu) => {
            const linhas = doMenu(menu.itens);
            return linhas.length ? (
              <section key={menu.nome}>
                <h3 className="mb-2 font-semibold">{menu.nome}</h3>
                <dl>
                  {linhas.map((linha) => (
                    <div key={linha.nome} className="flex justify-between gap-3 border-b border-borda/50 py-1">
                      <dt>{linha.nome}</dt>
                      <dd className="font-mono text-suave">{linha.atalho}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
}

/** A transformação livre em andamento (a da seleção ou a de uma camada). */
type Transformando = {
  estado: EstadoDaTransformacao;
  /** A caixa do começo: os números e o Transformar novamente são em relação a ela. */
  inicial: Quadrilatero;
  modo: ModoDaTransformacao;
  fonte: HTMLCanvasElement;
  previa: { imagem: HTMLCanvasElement; largura: number; altura: number };
  referencia: Referencia;
  numeros: NumerosDaTransformacao | null;
  interpolacao: Interpolacao;
  /** Deformar: o estilo pronto da malha (null: à mão) e a divisão que o próximo clique põe. */
  estilo?: OpcoesDoEstilo | null;
  dividindo?: DivisaoDaMalha | null;
  camada?: {
    faixaId: string;
    clipeId: string;
    copia: boolean;
    /** O plano da camada nova de pixels, ou por que ela não pode ir para os pixels (a máscara de camada). */
    plano: Omit<PlanoDosPixels, "desenhar"> | string;
    /** Com uma seleção numa camada de pixels: o que fica no lugar, e a seleção. */
    resto: HTMLCanvasElement | null;
    selecao: Selecao | null;
    fonteDaSelecao: HTMLCanvasElement | null;
  };
};

/**
 * O pedaço (no referencial da caixa do começo) levado à caixa final, nos pixels do documento: pela homografia inversa
 * quando não há malha, senão pela malha do Deformar (sem emendas entre os triângulos).
 */
function levarPeloEstado(fonte: HTMLCanvasElement, estado: EstadoDaTransformacao, documento: { largura: number; altura: number }, interpolacao: Interpolacao): Uint8ClampedArray<ArrayBuffer> {
  const pixels = fonte.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, fonte.width, fonte.height);
  const origem = { dados: pixels.data, largura: pixels.width, altura: pixels.height };
  return estado.malha ? reamostrarPeloMapa(origem, mapaDaMalha(estado.malha), documento, interpolacao, 64) : reamostrar(origem, estado.quad, documento, interpolacao);
}
