// Toda mudança na linha do tempo é um comando: { comando, parametros }. A interface, os atalhos e,
// mais tarde, um agente pelo MCP passam pelo mesmo caminho. A ideia vem do sistema de comandos do
// FilmCraft (crates/engine); a implementação é do TakeOne.
//
// O histórico guarda o projeto de antes de cada comando. Como as operações nunca alteram o projeto
// recebido, desfazer é só voltar para a versão anterior.
import type { Contorno, Sombra } from "./silhueta.ts";
import type { Tick } from "../tempo.ts";
import type { InformacoesDoArquivo } from "../exportacao/metadados.ts";
import type { ModoDeCor } from "../imagem/modos.ts";
import type { VariaveisDoDocumento } from "./variaveis.ts";
import type { Guias } from "./geometria.ts";
import type { Contagem, EscalaDeMedida, Nota } from "../imagem/medicao.ts";
import { aplicarComp, type CompDeCamada } from "../imagem/comps.ts";
import type { AnimacaoDaImagem } from "../imagem/animacao.ts";
import type { Fatia } from "../imagem/fatias.ts";
import {
  adicionarAjuste,
  adicionarClipe,
  adicionarLegenda,
  definirTransicao,
  animarClipes,
  adicionarTexto,
  ajustarAudio,
  mudarCor,
  alternarFaixa,
  apagarClipes,
  apararClipe,
  apararEmOndulacao,
  elevarTrecho,
  ErroEdicao,
  LIMITE_CAMADAS,
  inserirTrecho,
  esticarClipe,
  type AcaoDeKeyframe,
  type Contexto,
  type DestinoClipe,
  type Intervalo,
  removerIntervalos,
  deslizarConteudo,
  dividirClipes,
  estiloDasLegendas,
  palavrasChaveDasLegendas,
  juntarLegendas,
  colarClipes,
  colarAjustes,
  type ClipeCopiado,
  type GrupoDeAjustes,
  substituirNasLegendas,
  cortarNoRitmo,
  montarNaLinha,
  colocarLogo,
  trocarMidiaDosClipes,
  aplicarModelo,
  aplicarMarcaAosTextos,
  type TrechoNaLinha,
  pulsarNoRitmo,
  importarLegendas,
  type MudancaDeAudio,
  mudarExpressao,
  mudarKeyframe,
  limparKeyframes,
  moverKeyframe,
  reenquadrarClipe,
  seguirObjetoClipe,
  zoomNosTrechos,
  abaixarClipe,
  nivelarClipe,
  mesclarClipes,
  virarClipes,
  arredondarClipes,
  silhuetaDosClipes,
  mascararClipes,
  preencherVaga,
  aplicarEfeito,
  chromaClipes,
  chaveLumaClipes,
  desfocarOFundo,
  esconderObjetos,
  esconderRostos,
  removerFundo,
  estabilizarClipes,
  limparImagem,
  mudarVelocidade,
  curvarVelocidade,
  adicionarMarcador,
  ajustarMusicaAoVideo,
  apagarMarcador,
  mudarMarcador,
  congelarQuadro,
  inverterClipes,
  fluidoNoClipe,
  devolverSom,
  duplicarClipes,
  moverClipe,
  moverCorte,
  mudarFundo,
  mudarTexto,
  recortarClipes,
  restaurarClipes,
  transformarClipes,
  separarSom,
  type CameraSincronizada,
  sincronizarCameras,
  trocarCamera,
  desfazerMulticamera,
} from "./edicao.ts";
import type { Animacoes } from "./animacao.ts";
import {
  adicionarCamadaDeAjuste,
  adicionarCamadaDePreenchimento,
  adicionarCamadaDeMidia,
  adicionarCamadaDeTexto,
  agruparCamadas,
  apagarCamada,
  apagarCamadas,
  apagarCamadasOcultas,
  aplicarModeloDeImagem,
  camadaComOutraMidia,
  desagruparCamadas,
  desfocarFundo,
  duplicarCamada,
  duplicarCamadas,
  inverterCamadas,
  moverCamada,
  moverCamadasPara,
  adicionarCamadaDePixels,
  camadaDeFundo,
  definirMascaraDePixels,
  mudarMascaraDePixels,
  mudarCamada,
  type MudancaDaCamada,
  trocarVersaoDosPixels,
  soEstaVisivel,
  mudarFundoDaImagem,
  mudarTamanhoDaImagem,
  recortarImagem,
  transformarCamada,
  tamanhoDaImagem,
  caminhosDoVetorNaImagem,
  pixelsPorUnidade,
  tamanhoComPixels,
  tamanhoDaTela,
  girarImagem,
  type GiroDaImagem,
  cortarImagem,
  type CaixaDoCorte,
  type TrocaDePixels,
  type RetanguloDaImagem,
  type TamanhoDaImagem,
  trocarImagemDaCamada,
  vincularCamadas,
  adicionarCamadaVetorial,
  juntarAoVetor,
  mudarVetor,
  trocarCaminhosDoVetor,
  definirMascaraVetorial,
  adicionarPrancheta,
  mudarPrancheta,
  pranchetaDoGrupo,
  adicionarTextoRico,
  mudarTextoRico,
  mudarCamadaDePreenchimento,
  mudarAjusteDaCamada,
  definirFiltrosInteligentes,
  definirGeracao,
  mudarMascaraDosFiltros,
  textoEmForma,
  mudarTextosRicos,
  definirEstiloDeCamada,
  mostrarEfeitos,
  dimensionarEfeitos,
} from "./imagem.ts";
import type { EstiloDeCamada, LuzGlobal } from "../imagem/estiloDeCamada.ts";
import type { CamadaDePreenchimento } from "../imagem/camadaDePreenchimento.ts";
import type { AjusteDaImagem } from "../imagem/ajustes.ts";
import type { FiltrosInteligentes } from "../imagem/filtros/pilha.ts";
import type { TextoRico } from "../texto/modelo.ts";
import type { MascaraVetorial } from "../vetor/mascaraVetorial.ts";
import type { CaminhoDoDocumento } from "../vetor/caminhos.ts";
import type { CamadaVetorial, OperacaoDoCaminho, Subcaminho } from "../vetor/modelo.ts";
import { transformarCaminhos } from "../vetor/edicao.ts";
import type { GradeDePerspectiva } from "../vetor/perspectiva.ts";
import { type Simbolo, type TintaDaInstancia, vetorDaInstancia } from "../vetor/simbolos.ts";
import type { Grafico } from "../imagem/graficos.ts";
import { type Afim, aplicarAfim, posicaoPelaAfim } from "../transformar/ferramentas.ts";
import type { Cor } from "./cor.ts";
import { posicaoTravada, problemaNaArvore } from "./arvore.ts";
import { type PlanoDosPixels, substituirPorPixels } from "./rasterizar.ts";
import type { MascaraDePixels } from "./mascaraDePixels.ts";
import type { Nivelamento } from "./nivelar.ts";
import type { ChaveDeKeyframe, Expressao, PropriedadeAnimavel } from "./keyframes.ts";
import type { Reenquadramento } from "./reenquadrar.ts";
import type { PlanoDoModelo } from "./modelos.ts";
import type { CamadaPronta } from "./modelosDeImagem.ts";
import type { Tamanho } from "./geometria.ts";
import type { CaminhoDoSeguidor } from "./seguirObjeto.ts";
import type { Abaixamento } from "./abaixar.ts";
import type { Efeito } from "./efeitos.ts";
import type { Cantos, ChaveLuma, Chroma, MascaraDeForma, Mesclagem, Prancheta } from "./modelo.ts";
import type { PontoDeVelocidade } from "./velocidade.ts";
import type { Legenda } from "./legendas.ts";
import type { Canal, Clipe, Faixa, GeracaoDoClipe, Projeto, Proporcao, Recorte, Transformacao, Virar } from "./modelo.ts";
import type { FonteTexto, Texto } from "./texto.ts";
import type { Transicao } from "./transicao.ts";

export type Comando =
  | { comando: "clipe.adicionar"; parametros: { midiaId: string } & DestinoClipe }
  | { comando: "clipe.mover"; parametros: { clipeId: string; inicio: Tick } & DestinoClipe }
  | { comando: "clipe.aparar"; parametros: { clipeId: string; borda: "inicio" | "fim"; tempo: Tick } }
  | { comando: "clipe.apararEmOndulacao"; parametros: { clipeId: string; borda: "inicio" | "fim"; tempo: Tick } }
  | { comando: "clipe.esticar"; parametros: { clipeId: string; borda: "inicio" | "fim"; tempo: Tick } }
  | { comando: "clipe.deslizar"; parametros: { clipeId: string; deslocamento: Tick } }
  | { comando: "clipe.adicionarAjuste"; parametros: { inicio: Tick } }
  | { comando: "imagem.adicionarAjuste"; parametros: { acima?: string | null; ajuste?: AjusteDaImagem | null; recortada?: boolean } }
  | { comando: "imagem.ajuste"; parametros: { clipeId: string; ajuste: AjusteDaImagem } }
  | { comando: "imagem.filtros"; parametros: { clipeId: string; filtros: FiltrosInteligentes | null; nome?: string } }
  | { comando: "imagem.mascaraDosFiltros"; parametros: { clipeId: string; mudanca: Partial<MascaraDePixels> | null } }
  | { comando: "imagem.adicionarPreenchimento"; parametros: { preenchimento: CamadaDePreenchimento; acima?: string | null } }
  | { comando: "imagem.preenchimento"; parametros: { clipeId: string; preenchimento: CamadaDePreenchimento } }
  | { comando: "clipe.moverCorte"; parametros: { clipeId: string; tempo: Tick } }
  | { comando: "linha.dividir"; parametros: { tempo: Tick; clipeIds: string[] } }
  | { comando: "clipe.apagar"; parametros: { clipeIds: string[]; fecharEspaco?: boolean } }
  | { comando: "linha.removerIntervalos"; parametros: { intervalos: Intervalo[] } }
  | { comando: "linha.elevar"; parametros: { intervalo: Intervalo } }
  | { comando: "clipe.inserirTrecho"; parametros: { midiaId: string; de: Tick; ate: Tick; tempo: Tick; modo: "inserir" | "sobrescrever" } }
  | { comando: "linha.zoomNosTrechos"; parametros: { trechos: Intervalo[] } }
  | { comando: "clipe.duplicar"; parametros: { clipeIds: string[] } }
  | { comando: "clipe.separarSom"; parametros: { clipeIds: string[] } }
  | { comando: "clipe.congelar"; parametros: { clipeId: string; tempo: Tick; midiaId: string; duracao: Tick } }
  | { comando: "clipe.inverter"; parametros: { clipeIds: string[]; ligar: boolean } }
  | { comando: "clipe.fluido"; parametros: { clipeId: string; fluido: { de: number; ate: number } | null } }
  | { comando: "marcador.adicionar"; parametros: { tempo: Tick } }
  | { comando: "marcador.mudar"; parametros: { id: string; nome?: string; cor?: string; t?: Tick } }
  | { comando: "marcador.apagar"; parametros: { id: string } }
  | { comando: "clipe.devolverSom"; parametros: { clipeIds: string[] } }
  | { comando: "faixa.alternar"; parametros: { faixaId: string; propriedade: "oculta" | "muda" | "travada" } }
  | { comando: "projeto.proporcao"; parametros: { proporcao: Proporcao } }
  | { comando: "projeto.fundo"; parametros: { cor: string } }
  | { comando: "clipe.transformar"; parametros: { clipeIds: string[]; transformacao: Partial<Transformacao>; tempo?: Tick } }
  | { comando: "clipe.keyframe"; parametros: { clipeId: string; propriedade: ChaveDeKeyframe; tempo: Tick; acao: AcaoDeKeyframe } }
  | { comando: "clipe.limparKeyframes"; parametros: { clipeId: string; propriedade: ChaveDeKeyframe; tempo: Tick } }
  | { comando: "clipe.moverKeyframe"; parametros: { clipeId: string; propriedade: ChaveDeKeyframe; de: Tick; para: Tick } }
  | { comando: "clipe.expressao"; parametros: { clipeId: string; propriedade: PropriedadeAnimavel; expressao: Expressao | null } }
  | { comando: "clipe.reenquadrar"; parametros: { clipeId: string; reenquadramento: Reenquadramento } }
  | { comando: "clipe.seguirObjeto"; parametros: { clipeId: string; caminho: CaminhoDoSeguidor } }
  | { comando: "clipe.abaixar"; parametros: { clipeId: string; abaixamento: Abaixamento | null } }
  | { comando: "clipe.nivelar"; parametros: { clipeId: string; nivelamento: Nivelamento | null } }
  | { comando: "clipe.mesclar"; parametros: { clipeIds: string[]; mesclagem: Mesclagem } }
  | { comando: "clipe.virar"; parametros: { clipeIds: string[]; sentido: keyof Virar } }
  | { comando: "clipe.cantos"; parametros: { clipeIds: string[]; cantos: Cantos | null } }
  | { comando: "clipe.silhueta"; parametros: { clipeIds: string[]; contorno?: Contorno | null; sombra?: Sombra | null } }
  | { comando: "clipe.mascara"; parametros: { clipeIds: string[]; mascara: MascaraDeForma | null } }
  | { comando: "clipe.preencher"; parametros: { clipeId: string; midiaId: string } }
  | { comando: "imagem.adicionarMidia"; parametros: { midiaId: string; transformacao?: Partial<Transformacao>; acima?: string | null; geracao?: GeracaoDoClipe } }
  | { comando: "imagem.geracao"; parametros: { clipeId: string; geracao: GeracaoDoClipe | null } }
  | { comando: "imagem.adicionarTexto"; parametros: { texto: Texto; transformacao?: Partial<Transformacao>; acima?: string | null } }
  | { comando: "imagem.agrupar"; parametros: { faixaIds: string[] } }
  | { comando: "imagem.desagrupar"; parametros: { faixaId: string } }
  | { comando: "imagem.moverPara"; parametros: { faixaIds: string[]; pai: string | null; acimaDe: string | null } }
  | { comando: "imagem.inverter"; parametros: { faixaIds: string[] } }
  | { comando: "imagem.camada"; parametros: { faixaIds: string[]; mudanca: MudancaDaCamada } }
  | { comando: "imagem.vincular"; parametros: { faixaIds: string[]; ligar: boolean } }
  | { comando: "imagem.apagarOcultas"; parametros: Record<string, never> }
  | { comando: "imagem.posicoes"; parametros: { mudancas: { clipeId: string; transformacao: Partial<Transformacao> }[] } }
  | { comando: "imagem.soEsta"; parametros: { faixaId: string } }
  | { comando: "imagem.adicionarPixels"; parametros: { midiaId: string; nome: string; acima?: string | null; versao?: number } }
  | { comando: "imagem.substituirPorPixels"; parametros: Omit<PlanoDosPixels, "desenhar"> & { midiaId: string; versao: number } }
  | { comando: "imagem.camadaDeFundo"; parametros: { faixaId: string; ligar: boolean } }
  | { comando: "camada.pixels"; parametros: { clipeId: string; versao: number } }
  | { comando: "canal.adicionar"; parametros: { canal: Omit<Canal, "id"> } }
  | { comando: "canal.mudar"; parametros: { id: string; mudanca: Partial<Pick<Canal, "nome" | "versao">> } }
  | { comando: "canal.apagar"; parametros: { id: string } }
  | { comando: "mascara.definir"; parametros: { clipeId: string; mascara: MascaraDePixels | null } }
  | { comando: "projeto.restaurar"; parametros: { projeto: Projeto } }
  | { comando: "mascara.mudar"; parametros: { clipeId: string; mudanca: Partial<Omit<MascaraDePixels, "midia_id">> } }
  | { comando: "imagem.apagarVarias"; parametros: { faixaIds: string[] } }
  | { comando: "imagem.duplicarVarias"; parametros: { faixaIds: string[] } }
  | { comando: "imagem.mover"; parametros: { faixaId: string; para: "cima" | "baixo" | "topo" | "fundo" | number } }
  | { comando: "imagem.apagar"; parametros: { faixaId: string } }
  | { comando: "imagem.duplicar"; parametros: { faixaId: string } }
  | { comando: "imagem.desfocarFundo"; parametros: { faixaId: string } }
  | { comando: "imagem.aplicarModelo"; parametros: { camadas: CamadaPronta[]; tamanho: TamanhoDaImagem; fundo: string } }
  | { comando: "imagem.trocarImagem"; parametros: { clipeId: string; midiaId: string; tamanhoAtual: Tamanho; tamanhoNovo: Tamanho } }
  | { comando: "imagem.fundo"; parametros: { cor?: string; transparente?: boolean } }
  | { comando: "imagem.informacoes"; parametros: { informacoes: InformacoesDoArquivo } }
  | { comando: "imagem.modo"; parametros: { modo: ModoDeCor } }
  | { comando: "imagem.variaveis"; parametros: { variaveis: VariaveisDoDocumento } }
  | { comando: "imagem.guias"; parametros: { guias: Guias } }
  | { comando: "imagem.contagem"; parametros: { contagem: Contagem | null; nome?: string } }
  | { comando: "imagem.notas"; parametros: { notas: Nota[] } }
  | { comando: "imagem.comps"; parametros: { comps: CompDeCamada[]; nome?: string } }
  | { comando: "imagem.aplicarComp"; parametros: { comp: CompDeCamada } }
  | { comando: "imagem.animacao"; parametros: { animacao: AnimacaoDaImagem | null; nome?: string } }
  | { comando: "imagem.fatias"; parametros: { fatias: Fatia[]; nome?: string } }
  | { comando: "imagem.perspectiva"; parametros: { grade: GradeDePerspectiva | null; nome?: string } }
  | { comando: "imagem.escalaDeMedida"; parametros: { escala: EscalaDeMedida | null } }
  | { comando: "imagem.grafico"; parametros: { pasta: string | null; grafico: Grafico; formas: { vetor: CamadaVetorial; centro: { x: number; y: number }; nome: string }[]; textos: { texto: TextoRico; ponto: { x: number; y: number }; nome: string; giro: number }[]; acima?: string | null } }
  | { comando: "imagem.simbolos"; parametros: { simbolos: Simbolo[]; nome?: string } }
  | { comando: "imagem.novoSimbolo"; parametros: { clipeId: string; simbolo: Simbolo } }
  | { comando: "imagem.redefinirSimbolo"; parametros: { id: string; vetor: CamadaVetorial } }
  | { comando: "imagem.excluirSimbolo"; parametros: { id: string } }
  | { comando: "imagem.romperSimbolo"; parametros: { clipeIds: string[] } }
  | { comando: "imagem.porInstancias"; parametros: { id: string; lugares: { x: number; y: number; escala: number; giro: number }[]; conjunto: string | null; nomeDoConjunto?: string } }
  | { comando: "imagem.instancias"; parametros: { mudancas: { clipeId: string; transformacao?: Partial<Transformacao>; tinta?: TintaDaInstancia | null; estilo?: EstiloDeCamada | null }[] } }
  | { comando: "imagem.repetirNoCaminho"; parametros: { clipeId: string; lugares: { x: number; y: number; giro: number }[] } }
  | { comando: "imagem.mesclarObjetos"; parametros: { de: string; ate: string; passos: { vetor: CamadaVetorial; centro: { x: number; y: number }; opacidade: number }[] } }
  | { comando: "imagem.adicionarCota"; parametros: { linha: CamadaVetorial; centro: { x: number; y: number }; texto: TextoRico; ponto: { x: number; y: number }; giro: number; acima?: string | null } }
  | { comando: "imagem.construirFormas"; parametros: { apagar: string[]; pecas: { origem: string; caminhos: Subcaminho[]; cor?: string }[] } }
  | { comando: "imagem.transformarCamadas"; parametros: { clipeIds: string[]; afim: Afim; copiar: boolean } }
  | { comando: "imagem.caminhosDasFormas"; parametros: { trocas: { clipeId: string; caminhos: Subcaminho[] }[]; apagar: string[] } }
  | { comando: "imagem.dividirFormas"; parametros: { divisoes: { clipeId: string; pedacos: Subcaminho[][] }[] } }
  | { comando: "imagem.unirFormas"; parametros: { clipeId: string; caminhos: Subcaminho[]; apagar: string[] } }
  | { comando: "imagem.adicionarReflexo"; parametros: { camadas: { vetor: CamadaVetorial; centro: { x: number; y: number }; nome: string; opacidade: number }[]; nome: string; acima?: string | null } }
  | { comando: "imagem.marcadorDeEscala"; parametros: { barra: CamadaVetorial; centro: { x: number; y: number }; texto: TextoRico | null; ponto: { x: number; y: number }; acima?: string | null } }
  | { comando: "imagem.aplicarConjunto"; parametros: { faixas: Faixa[] } }
  | { comando: "imagem.tamanho"; parametros: TamanhoDaImagem }
  | { comando: "imagem.recortar"; parametros: { retangulo: RetanguloDaImagem; tamanhos: Record<string, Tamanho> } }
  | { comando: "imagem.transformarCamada"; parametros: { clipeId: string; transformacao: Partial<Transformacao>; virar?: Virar } }
  | { comando: "imagem.adicionarVetor"; parametros: { vetor: CamadaVetorial; centro: { x: number; y: number }; nome: string; acima?: string | null } }
  | { comando: "imagem.mudarVetor"; parametros: { clipeId: string; vetor: CamadaVetorial; deslocamento?: { x: number; y: number } } }
  | { comando: "imagem.juntarAoVetor"; parametros: { clipeId: string; caminhos: Subcaminho[]; operacao: OperacaoDoCaminho } }
  | { comando: "imagem.caminhosDoVetor"; parametros: { clipeId: string; caminhos: Subcaminho[] } }
  | { comando: "imagem.caminhos"; parametros: { caminhos: CaminhoDoDocumento[] } }
  | { comando: "imagem.mascaraVetorial"; parametros: { clipeId: string; mascara: MascaraVetorial | null } }
  | { comando: "imagem.adicionarTextoRico"; parametros: { texto: TextoRico; ponto: { x: number; y: number }; nome: string; acima?: string | null; id?: string } }
  | { comando: "imagem.mostrarEfeitos"; parametros: { visiveis: boolean } }
  | { comando: "imagem.dimensionarEfeitos"; parametros: { clipeIds: string[]; fator: number } }
  | { comando: "imagem.estiloDeCamada"; parametros: { clipeIds: string[]; estilo: EstiloDeCamada | null; luz?: LuzGlobal; camada?: { mesclagem?: Mesclagem; opacidade?: number; preenchimento?: number } } }
  | { comando: "imagem.textosRicos"; parametros: { mudancas: { clipeId: string; texto: TextoRico }[]; nome: "substituir" | "atualizar" } }
  | { comando: "imagem.textoEmForma"; parametros: { clipeId: string; vetor: CamadaVetorial; centro: { x: number; y: number } } }
  | { comando: "imagem.textoRico"; parametros: { clipeId: string; texto: TextoRico; deslocamento?: { x: number; y: number } } }
  | { comando: "imagem.adicionarPrancheta"; parametros: { retangulo: RetanguloDaImagem; nome: string; fundo: Prancheta["fundo"]; tamanhos: Record<string, Tamanho> } }
  | { comando: "imagem.prancheta"; parametros: { clipeId: string; mudanca: Partial<Prancheta>; tamanhos: Record<string, Tamanho> } }
  | { comando: "imagem.pranchetaDoGrupo"; parametros: { faixaId: string; retangulo: RetanguloDaImagem; fundo: Prancheta["fundo"]; tamanhos: Record<string, Tamanho> } }
  | { comando: "imagem.pranchetaDeCamadas"; parametros: { faixaIds: string[]; retangulo: RetanguloDaImagem; nome: string; fundo: Prancheta["fundo"]; tamanhos: Record<string, Tamanho> } }
  | { comando: "imagem.tamanhoComPixels"; parametros: { tamanho: TamanhoDaImagem; pixels: TrocaDePixels[]; canais: TrocaDePixels[] } }
  | { comando: "imagem.tamanhoDaTela"; parametros: { retangulo: RetanguloDaImagem; tamanhos: Record<string, Tamanho>; fundo: { cor: string; transparente: boolean } | null } }
  | { comando: "imagem.girar"; parametros: { giro: GiroDaImagem; tamanhos: Record<string, Tamanho> } }
  | { comando: "imagem.cortar"; parametros: { caixa: CaixaDoCorte; tamanhos: Record<string, Tamanho>; pixels?: TrocaDePixels[] } }
  | { comando: "imagem.retificar"; parametros: { tamanho: TamanhoDaImagem; trocas: (Omit<PlanoDosPixels, "desenhar"> & { midiaId: string; versao: number })[] } }
  | { comando: "imagem.alinhar"; parametros: { retangulo: RetanguloDaImagem; tamanhos: Record<string, Tamanho>; trocas: (Omit<PlanoDosPixels, "desenhar"> & { midiaId: string; versao: number })[] } }
  | { comando: "imagem.camadaComOutraMidia"; parametros: { faixaId: string; midiaId: string } }
  | { comando: "clipe.efeito"; parametros: { clipeIds: string[]; efeito: Efeito | null } }
  | { comando: "clipe.chroma"; parametros: { clipeIds: string[]; chroma: Chroma | null } }
  | { comando: "clipe.chaveLuma"; parametros: { clipeIds: string[]; chave: ChaveLuma | null } }
  | { comando: "clipe.removerFundo"; parametros: { clipeIds: string[]; ligar: boolean } }
  | { comando: "clipe.fundoDesfocado"; parametros: { clipeIds: string[]; intensidade: number | null } }
  | { comando: "clipe.esconderRostos"; parametros: { clipeIds: string[]; valor: { modo: "pixelizar" | "desfocar"; forca: number } | null } }
  | { comando: "clipe.esconderObjetos"; parametros: { clipeId: string; objetos: { rastreio: string; modo: "pixelizar" | "desfocar"; forca: number }[] } }
  | { comando: "clipe.estabilizar"; parametros: { clipeIds: string[]; ligar: boolean } }
  | { comando: "clipe.limparImagem"; parametros: { clipeIds: string[]; ligar: boolean } }
  | { comando: "clipe.velocidade"; parametros: { clipeId: string; velocidade: number } }
  | { comando: "clipe.curvaVelocidade"; parametros: { clipeId: string; pontos: PontoDeVelocidade[] | null } }
  | { comando: "clipe.recortar"; parametros: { clipeIds: string[]; recorte: Recorte } }
  | { comando: "clipe.restaurar"; parametros: { clipeIds: string[] } }
  | { comando: "clipe.audio"; parametros: { clipeIds: string[] } & MudancaDeAudio }
  | { comando: "texto.adicionar"; parametros: { inicio: Tick; texto: Texto; transformacao?: Partial<Transformacao> } }
  | { comando: "texto.mudar"; parametros: { clipeIds: string[]; texto: Partial<Texto> } }
  | { comando: "legenda.adicionar"; parametros: { inicio: Tick; estilo: Texto } }
  | { comando: "legenda.importar"; parametros: { legendas: Legenda[]; estilo: Texto } }
  | { comando: "legenda.estilo"; parametros: { faixaId: string; estilo: Partial<Texto> } }
  | { comando: "legenda.palavrasChave"; parametros: { chaves: Record<string, number[]>; cor: string | null } }
  | { comando: "legenda.juntar"; parametros: { clipeIds: string[] } }
  | { comando: "clipe.colar"; parametros: { copiados: ClipeCopiado[]; inicio: Tick } }
  | { comando: "clipe.colarAjustes"; parametros: { origem: Clipe; clipeIds: string[]; grupos: GrupoDeAjustes[] } }
  | { comando: "legenda.substituir"; parametros: { faixaId: string; busca: string; troca: string } }
  | { comando: "linha.cortarNoRitmo"; parametros: { batidas: Tick[] } }
  | { comando: "musica.ajustar"; parametros: { clipeId: string; fortes: number[] } }
  | { comando: "modelo.aplicar"; parametros: { plano: PlanoDoModelo } }
  | { comando: "clipe.trocarMidia"; parametros: { clipeIds: string[]; midiaId: string } }
  | { comando: "marca.logo"; parametros: { midiaId: string; transformacao: Transformacao } }
  | { comando: "marca.textos"; parametros: { fonteTitulo: FonteTexto; fonteTexto: FonteTexto; cor: string | null } }
  | { comando: "linha.montar"; parametros: { trechos: TrechoNaLinha[]; musica: { midiaId: string; entrada: Tick } | null } }
  | { comando: "multicamera.sincronizar"; parametros: { cameras: CameraSincronizada[] } }
  | { comando: "multicamera.trocar"; parametros: { tempo: Tick; faixaId: string | null } }
  | { comando: "multicamera.desfazer"; parametros: Record<string, never> }
  | { comando: "linha.pulsarNoRitmo"; parametros: { batidas: Tick[] } }
  | { comando: "clipe.animar"; parametros: { clipeIds: string[]; animacao: Partial<Animacoes> } }
  | { comando: "clipe.cor"; parametros: { clipeIds: string[]; cor: Partial<Cor> } }
  | { comando: "clipe.transicao"; parametros: { clipeId: string; transicao: Transicao | null } };

export const NOMES_DOS_COMANDOS: Record<Comando["comando"], string> = {
  "clipe.adicionar": "adicionar clipe",
  "clipe.mover": "mover clipe",
  "clipe.aparar": "aparar clipe",
  "clipe.apararEmOndulacao": "aparar em ondulação",
  "clipe.esticar": "esticar a velocidade",
  "clipe.deslizar": "deslizar o conteúdo",
  "clipe.adicionarAjuste": "pôr a camada de ajuste",
  "imagem.adicionarAjuste": "pôr a camada de ajuste",
  "imagem.adicionarPreenchimento": "pôr a camada de preenchimento",
  "imagem.ajuste": "mudar o ajuste",
  "imagem.filtros": "mudar os filtros inteligentes",
  "imagem.mascaraDosFiltros": "mudar a máscara dos filtros",
  "imagem.preenchimento": "mudar o preenchimento",
  "clipe.moverCorte": "mover o corte",
  "linha.dividir": "dividir",
  "clipe.apagar": "apagar",
  "linha.removerIntervalos": "remover trechos",
  "linha.elevar": "elevar o trecho",
  "clipe.inserirTrecho": "pôr o trecho da fonte",
  "linha.zoomNosTrechos": "dar zoom nos destaques",
  "clipe.duplicar": "duplicar",
  "clipe.separarSom": "separar o som",
  "clipe.congelar": "congelar o quadro",
  "clipe.inverter": "tocar ao contrário",
  "clipe.fluido": "câmera lenta suave",
  "marcador.adicionar": "pôr um marcador",
  "marcador.mudar": "mudar o marcador",
  "marcador.apagar": "apagar o marcador",
  "clipe.devolverSom": "devolver o som",
  "faixa.alternar": "mudar a faixa",
  "projeto.proporcao": "mudar a proporção",
  "projeto.fundo": "mudar o fundo",
  "clipe.transformar": "mudar posição e tamanho",
  "clipe.keyframe": "mudar keyframe",
  "clipe.limparKeyframes": "desligar a animação",
  "clipe.moverKeyframe": "mover o keyframe",
  "clipe.expressao": "mudar a expressão",
  "clipe.reenquadrar": "seguir o rosto",
  "clipe.seguirObjeto": "seguir o objeto",
  "clipe.abaixar": "abaixar na fala",
  "clipe.nivelar": "nivelar a voz",
  "clipe.mesclar": "mudar a mesclagem",
  "clipe.virar": "virar o clipe",
  "clipe.cantos": "mudar os cantos",
  "clipe.silhueta": "mudar o contorno e a sombra",
  "clipe.mascara": "mudar a máscara",
  "clipe.preencher": "trocar a mídia do modelo",
  "imagem.adicionarMidia": "pôr a imagem",
  "imagem.geracao": "mudar as variações",
  "imagem.adicionarTexto": "pôr o texto",
  "imagem.agrupar": "agrupar as camadas",
  "imagem.desagrupar": "desagrupar",
  "imagem.moverPara": "mover as camadas",
  "imagem.inverter": "inverter a ordem",
  "imagem.camada": "mudar a camada",
  "imagem.vincular": "vincular as camadas",
  "imagem.apagarOcultas": "excluir as camadas ocultas",
  "imagem.posicoes": "mover as camadas",
  "imagem.soEsta": "mostrar só uma camada",
  "imagem.adicionarPixels": "criar a camada",
  "imagem.substituirPorPixels": "mesclar as camadas",
  "imagem.camadaDeFundo": "mudar a camada de fundo",
  "camada.pixels": "pintar",
  "canal.adicionar": "salvar a seleção",
  "canal.mudar": "mudar o canal",
  "canal.apagar": "apagar o canal",
  "mascara.definir": "mudar a máscara de camada",
  "projeto.restaurar": "restaurar o instantâneo",
  "mascara.mudar": "mudar a máscara de camada",
  "imagem.apagarVarias": "apagar as camadas",
  "imagem.duplicarVarias": "duplicar as camadas",
  "imagem.mover": "mudar a ordem das camadas",
  "imagem.apagar": "apagar a camada",
  "imagem.duplicar": "duplicar a camada",
  "imagem.desfocarFundo": "desfocar o fundo",
  "imagem.aplicarModelo": "aplicar o modelo",
  "imagem.trocarImagem": "trocar a imagem",
  "imagem.fundo": "mudar o fundo",
  "imagem.informacoes": "mudar as informações do arquivo",
  "imagem.modo": "mudar o modo de cor",
  "imagem.variaveis": "mudar as variáveis",
  "imagem.guias": "mudar as guias",
  "imagem.contagem": "mudar a contagem",
  "imagem.notas": "mudar as notas",
  "imagem.comps": "mudar as comps de camada",
  "imagem.aplicarComp": "aplicar a comp de camada",
  "imagem.animacao": "mudar a animação",
  "imagem.fatias": "mudar as fatias",
  "imagem.perspectiva": "mudar a grade de perspectiva",
  "imagem.escalaDeMedida": "definir a escala de medida",
  "imagem.marcadorDeEscala": "inserir o marcador de escala",
  "imagem.adicionarReflexo": "desenhar o reflexo",
  "imagem.unirFormas": "juntar as formas",
  "imagem.caminhosDasFormas": "apagar das formas",
  "imagem.transformarCamadas": "transformar as camadas",
  "imagem.construirFormas": "construir as formas",
  "imagem.adicionarCota": "pôr a cota",
  "imagem.mesclarObjetos": "mesclar os objetos",
  "imagem.repetirNoCaminho": "pôr os objetos no caminho",
  "imagem.simbolos": "mudar os símbolos",
  "imagem.grafico": "desenhar o gráfico",
  "imagem.novoSimbolo": "criar o símbolo",
  "imagem.redefinirSimbolo": "redefinir o símbolo",
  "imagem.excluirSimbolo": "excluir o símbolo",
  "imagem.romperSimbolo": "romper o vínculo com o símbolo",
  "imagem.porInstancias": "pôr as instâncias do símbolo",
  "imagem.instancias": "mudar as instâncias",
  "imagem.dividirFormas": "cortar as formas",
  "imagem.aplicarConjunto": "aplicar o conjunto de dados",
  "imagem.tamanho": "mudar o tamanho",
  "imagem.recortar": "recortar a imagem",
  "imagem.transformarCamada": "transformar a camada",
  "imagem.adicionarVetor": "desenhar a forma",
  "imagem.mudarVetor": "mudar a forma",
  "imagem.juntarAoVetor": "juntar à forma",
  "imagem.caminhosDoVetor": "editar o caminho da forma",
  "imagem.caminhos": "mudar os caminhos",
  "imagem.mascaraVetorial": "mudar a máscara vetorial",
  "imagem.adicionarTextoRico": "pôr o texto",
  "imagem.textoRico": "mudar o texto",
  "imagem.textoEmForma": "converter o texto em forma",
  "imagem.textosRicos": "mudar os textos",
  "imagem.estiloDeCamada": "mudar o estilo de camada",
  "imagem.mostrarEfeitos": "mostrar ou ocultar os efeitos",
  "imagem.dimensionarEfeitos": "dimensionar os efeitos",
  "imagem.adicionarPrancheta": "pôr a prancheta",
  "imagem.prancheta": "mudar a prancheta",
  "imagem.pranchetaDoGrupo": "prancheta a partir do grupo",
  "imagem.pranchetaDeCamadas": "prancheta a partir das camadas",
  "imagem.tamanhoComPixels": "mudar o tamanho da imagem",
  "imagem.tamanhoDaTela": "mudar o tamanho da tela",
  "imagem.girar": "girar a imagem",
  "imagem.cortar": "cortar a imagem",
  "imagem.retificar": "cortar em perspectiva",
  "imagem.alinhar": "alinhar as camadas",
  "imagem.camadaComOutraMidia": "pôr o objeto recortado",
  "clipe.efeito": "mudar o efeito",
  "clipe.chroma": "mudar a tela verde",
  "clipe.chaveLuma": "mudar a chave de luminância",
  "clipe.removerFundo": "recortar o fundo",
  "clipe.fundoDesfocado": "desfocar o fundo",
  "clipe.esconderRostos": "esconder os rostos",
  "clipe.esconderObjetos": "esconder um objeto",
  "clipe.estabilizar": "estabilizar",
  "clipe.limparImagem": "tirar o ruído da imagem",
  "clipe.velocidade": "mudar a velocidade",
  "clipe.curvaVelocidade": "mudar a curva de velocidade",
  "clipe.recortar": "recortar",
  "clipe.restaurar": "restaurar posição e tamanho",
  "clipe.audio": "mudar o som",
  "texto.adicionar": "adicionar texto",
  "texto.mudar": "mudar o texto",
  "legenda.adicionar": "adicionar legenda",
  "legenda.importar": "importar legendas",
  "legenda.estilo": "mudar o estilo das legendas",
  "legenda.palavrasChave": "destacar palavras-chave",
  "legenda.juntar": "juntar legendas",
  "clipe.colar": "colar clipes",
  "clipe.colarAjustes": "colar ajustes",
  "legenda.substituir": "substituir nas legendas",
  "linha.cortarNoRitmo": "cortar no ritmo",
  "musica.ajustar": "ajustar a música ao vídeo",
  "linha.montar": "montar com vários clipes",
  "multicamera.sincronizar": "sincronizar as câmeras",
  "multicamera.trocar": "trocar a câmera",
  "multicamera.desfazer": "encerrar a multicâmera",
  "marca.logo": "pôr o logo",
  "clipe.trocarMidia": "mudar a forma",
  "modelo.aplicar": "usar o modelo",
  "marca.textos": "aplicar a marca aos textos",
  "linha.pulsarNoRitmo": "pulsar no ritmo",
  "clipe.animar": "mudar a animação",
  "clipe.cor": "mudar a cor",
  "clipe.transicao": "mudar a transição",
};

/** Aplica o comando. `selecao` vem quando o comando cria clipes que devem ficar selecionados. */
/** A faixa de um clipe (o marcador de escala junta as camadas que acabou de criar). */
/** Muda os clipes das camadas (o primeiro de cada faixa), para os comandos dos símbolos. */
const mudarClipesDasInstancias = (projeto: Projeto, mudar: (clipe: Clipe) => Clipe): Projeto => ({
  ...projeto,
  faixas: projeto.faixas.map((faixa) => (faixa.clipes[0] ? { ...faixa, clipes: [mudar(faixa.clipes[0]), ...faixa.clipes.slice(1)] } : faixa)),
});
const faixaDoClipeNoProjeto = (projeto: Projeto, clipeId: string | undefined) => (clipeId ? projeto.faixas.find((faixa) => faixa.clipes.some((clipe) => clipe.id === clipeId))?.id : undefined);

export function executarComando(projeto: Projeto, comando: Comando, ctx: Contexto): { projeto: Projeto; selecao?: string[] } {
  if (projeto.tipo === "imagem" && (comando.comando === "clipe.transformar" || comando.comando === "imagem.posicoes")) {
    const ids = comando.comando === "clipe.transformar" ? comando.parametros.clipeIds : comando.parametros.mudancas.map((mudanca) => mudanca.clipeId);
    for (const faixa of projeto.faixas) {
      if (faixa.clipes.some((clipe) => ids.includes(clipe.id)) && posicaoTravada(projeto, faixa)) throw new ErroEdicao("A posição desta camada está travada.");
    }
  }
  const resultado = executarSemConferir(projeto, comando, ctx);
  if (resultado.projeto !== projeto) {
    // As regras da árvore de camadas (a API confere as mesmas): sem elas, o salvamento seguinte voltaria com erro
    const problema = problemaNaArvore(resultado.projeto);
    if (problema) throw new ErroEdicao(problema);
  }
  // Os comandos de camada da imagem não passam pelo `finalizar`: o limite de camadas é conferido aqui, antes de
  // o salvamento esbarrar nele na API
  if (resultado.projeto.tipo === "imagem" && resultado.projeto.faixas.length > LIMITE_CAMADAS + 1 && resultado.projeto.faixas.length > projeto.faixas.length) {
    throw new ErroEdicao(`A imagem pode ter no máximo ${LIMITE_CAMADAS} camadas. Apague ou junte algumas antes.`);
  }
  return resultado;
}

function executarSemConferir(projeto: Projeto, { comando, parametros }: Comando, ctx: Contexto): { projeto: Projeto; selecao?: string[] } {
  switch (comando) {
    case "clipe.adicionar": {
      const { midiaId, ...destino } = parametros;
      const resultado = adicionarClipe(projeto, ctx, midiaId, destino);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "clipe.mover": {
      const { clipeId, ...destino } = parametros;
      return { projeto: moverClipe(projeto, ctx, clipeId, destino) };
    }
    case "clipe.aparar":
      return { projeto: apararClipe(projeto, ctx, parametros.clipeId, parametros.borda, parametros.tempo) };
    case "clipe.apararEmOndulacao":
      return { projeto: apararEmOndulacao(projeto, ctx, parametros.clipeId, parametros.borda, parametros.tempo) };
    case "clipe.esticar":
      return { projeto: esticarClipe(projeto, ctx, parametros.clipeId, parametros.borda, parametros.tempo) };
    case "clipe.adicionarAjuste": {
      const resultado = adicionarAjuste(projeto, ctx, parametros.inicio);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.adicionarAjuste": {
      const resultado = adicionarCamadaDeAjuste(projeto, ctx, parametros.acima, parametros.ajuste, parametros.recortada);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.adicionarPreenchimento": {
      const resultado = adicionarCamadaDePreenchimento(projeto, ctx, parametros.preenchimento, parametros.acima);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.filtros":
      return { projeto: definirFiltrosInteligentes(projeto, parametros.clipeId, parametros.filtros) };
    case "imagem.mascaraDosFiltros":
      return { projeto: mudarMascaraDosFiltros(projeto, parametros.clipeId, parametros.mudanca) };
    case "imagem.ajuste":
      return { projeto: mudarAjusteDaCamada(projeto, parametros.clipeId, parametros.ajuste) };
    case "imagem.preenchimento":
      return { projeto: mudarCamadaDePreenchimento(projeto, parametros.clipeId, parametros.preenchimento) };
    case "clipe.deslizar":
      return { projeto: deslizarConteudo(projeto, ctx, parametros.clipeId, parametros.deslocamento) };
    case "clipe.moverCorte":
      return { projeto: moverCorte(projeto, ctx, parametros.clipeId, parametros.tempo) };
    case "linha.dividir": {
      const resultado = dividirClipes(projeto, ctx, parametros.tempo, parametros.clipeIds);
      return { projeto: resultado.projeto, selecao: resultado.novos };
    }
    case "linha.zoomNosTrechos":
      return { projeto: zoomNosTrechos(projeto, parametros.trechos) };
    case "linha.removerIntervalos":
      return { projeto: removerIntervalos(projeto, ctx, parametros.intervalos), selecao: [] };
    case "linha.elevar":
      return { projeto: elevarTrecho(projeto, ctx, parametros.intervalo) };
    case "clipe.inserirTrecho": {
      const resultado = inserirTrecho(projeto, ctx, parametros.midiaId, parametros.de, parametros.ate, parametros.tempo, parametros.modo);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "clipe.apagar":
      return { projeto: apagarClipes(projeto, parametros.clipeIds, parametros.fecharEspaco), selecao: [] };
    case "clipe.duplicar": {
      const resultado = duplicarClipes(projeto, ctx, parametros.clipeIds);
      return { projeto: resultado.projeto, selecao: resultado.novos };
    }
    case "clipe.separarSom": {
      const resultado = separarSom(projeto, ctx, parametros.clipeIds);
      return { projeto: resultado.projeto, selecao: resultado.novos };
    }
    case "clipe.congelar": {
      const resultado = congelarQuadro(projeto, ctx, parametros.clipeId, parametros.tempo, parametros.midiaId, parametros.duracao);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "marcador.adicionar":
      return { projeto: adicionarMarcador(projeto, ctx, parametros.tempo).projeto };
    case "marcador.mudar": {
      const { id, ...mudanca } = parametros;
      return { projeto: mudarMarcador(projeto, id, mudanca) };
    }
    case "marcador.apagar":
      return { projeto: apagarMarcador(projeto, parametros.id) };
    case "clipe.fluido":
      return { projeto: fluidoNoClipe(projeto, ctx, parametros.clipeId, parametros.fluido) };
    case "clipe.inverter":
      return { projeto: inverterClipes(projeto, ctx, parametros.clipeIds, parametros.ligar) };
    case "clipe.devolverSom":
      return { projeto: devolverSom(projeto, parametros.clipeIds) };
    case "faixa.alternar":
      return { projeto: alternarFaixa(projeto, parametros.faixaId, parametros.propriedade) };
    case "projeto.proporcao":
      return { projeto: { ...projeto, proporcao: parametros.proporcao } };
    case "projeto.fundo":
      return { projeto: mudarFundo(projeto, parametros.cor) };
    case "clipe.transformar":
      return { projeto: transformarClipes(projeto, parametros.clipeIds, parametros.transformacao, parametros.tempo) };
    case "clipe.curvaVelocidade":
      return { projeto: curvarVelocidade(projeto, parametros.clipeId, parametros.pontos) };
    case "clipe.velocidade":
      return { projeto: mudarVelocidade(projeto, parametros.clipeId, parametros.velocidade) };
    case "clipe.limparImagem":
      return { projeto: limparImagem(projeto, parametros.clipeIds, parametros.ligar) };
    case "clipe.removerFundo":
      return { projeto: removerFundo(projeto, parametros.clipeIds, parametros.ligar) };
    case "clipe.esconderObjetos":
      return { projeto: esconderObjetos(projeto, parametros.clipeId, parametros.objetos) };
    case "clipe.esconderRostos":
      return { projeto: esconderRostos(projeto, parametros.clipeIds, parametros.valor) };
    case "clipe.fundoDesfocado":
      return { projeto: desfocarOFundo(projeto, parametros.clipeIds, parametros.intensidade) };
    case "clipe.estabilizar":
      return { projeto: estabilizarClipes(projeto, ctx, parametros.clipeIds, parametros.ligar) };
    case "clipe.chroma":
      return { projeto: chromaClipes(projeto, parametros.clipeIds, parametros.chroma) };
    case "clipe.chaveLuma":
      return { projeto: chaveLumaClipes(projeto, parametros.clipeIds, parametros.chave) };
    case "clipe.efeito":
      return { projeto: aplicarEfeito(projeto, parametros.clipeIds, parametros.efeito) };
    case "clipe.mesclar":
      return { projeto: mesclarClipes(projeto, parametros.clipeIds, parametros.mesclagem) };
    case "clipe.virar":
      return { projeto: virarClipes(projeto, parametros.clipeIds, parametros.sentido) };
    case "clipe.cantos":
      return { projeto: arredondarClipes(projeto, parametros.clipeIds, parametros.cantos) };
    case "clipe.silhueta": {
      const { clipeIds, ...mudanca } = parametros;
      return { projeto: silhuetaDosClipes(projeto, clipeIds, mudanca) };
    }
    case "clipe.mascara":
      return { projeto: mascararClipes(projeto, parametros.clipeIds, parametros.mascara) };
    case "imagem.adicionarMidia": {
      const resultado = adicionarCamadaDeMidia(projeto, ctx, parametros.midiaId, parametros.transformacao, parametros.acima);
      // O preenchimento generativo entra já com as variações dele (um passo do desfazer só)
      const comGeracao = parametros.geracao ? definirGeracao(resultado.projeto, resultado.clipeId, parametros.geracao) : resultado.projeto;
      return { projeto: comGeracao, selecao: [resultado.clipeId] };
    }
    case "imagem.geracao":
      return { projeto: definirGeracao(projeto, parametros.clipeId, parametros.geracao) };
    case "imagem.adicionarTexto": {
      const resultado = adicionarCamadaDeTexto(projeto, ctx, parametros.texto, parametros.transformacao, parametros.acima);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.agrupar": {
      const resultado = agruparCamadas(projeto, ctx, parametros.faixaIds);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.desagrupar":
      return { projeto: desagruparCamadas(projeto, parametros.faixaId) };
    case "imagem.moverPara":
      return { projeto: moverCamadasPara(projeto, parametros.faixaIds, parametros.pai, parametros.acimaDe) };
    case "imagem.inverter":
      return { projeto: inverterCamadas(projeto, parametros.faixaIds) };
    case "imagem.camada":
      return { projeto: mudarCamada(projeto, parametros.faixaIds, parametros.mudanca) };
    case "imagem.vincular":
      return { projeto: vincularCamadas(projeto, ctx, parametros.faixaIds, parametros.ligar) };
    case "imagem.apagarOcultas":
      return { projeto: apagarCamadasOcultas(projeto), selecao: [] };
    case "imagem.posicoes": {
      // Alinhar, distribuir, mover várias e as vinculadas: cada camada com a mudança dela, num passo só
      let resultado = projeto;
      for (const { clipeId, transformacao } of parametros.mudancas) resultado = transformarClipes(resultado, [clipeId], transformacao);
      return { projeto: resultado };
    }
    case "imagem.apagarVarias":
      return { projeto: apagarCamadas(projeto, parametros.faixaIds), selecao: [] };
    case "imagem.duplicarVarias": {
      const resultado = duplicarCamadas(projeto, ctx, parametros.faixaIds);
      return { projeto: resultado.projeto, selecao: resultado.clipeIds };
    }
    case "imagem.adicionarPixels": {
      const resultado = adicionarCamadaDePixels(projeto, ctx, parametros.midiaId, parametros.nome, parametros.acima, parametros.versao);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.substituirPorPixels": {
      const resultado = substituirPorPixels(projeto, ctx.novoId, parametros);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.camadaDeFundo":
      return { projeto: camadaDeFundo(projeto, parametros.faixaId, parametros.ligar) };
    case "projeto.restaurar":
      // Um instantâneo do Histórico: as camadas, o fundo e o tamanho de então, num passo novo (que se desfaz)
      return { projeto: { ...projeto, faixas: parametros.projeto.faixas, fundo: parametros.projeto.fundo, tamanho: parametros.projeto.tamanho, proporcao: parametros.projeto.proporcao, marcadores: parametros.projeto.marcadores, canais: parametros.projeto.canais }, selecao: [] };
    case "mascara.definir":
      return { projeto: definirMascaraDePixels(projeto, parametros.clipeId, parametros.mascara) };
    case "mascara.mudar":
      return { projeto: mudarMascaraDePixels(projeto, parametros.clipeId, parametros.mudanca) };
    case "camada.pixels":
      return { projeto: trocarVersaoDosPixels(projeto, parametros.clipeId, parametros.versao) };
    case "canal.adicionar":
      if ((projeto.canais ?? []).length >= 50) throw new ErroEdicao("A imagem pode ter no máximo 50 canais.");
      return { projeto: { ...projeto, canais: [...(projeto.canais ?? []), { id: ctx.novoId(), ...parametros.canal }] } };
    case "canal.mudar": {
      const canais = projeto.canais ?? [];
      if (!canais.some((canal) => canal.id === parametros.id)) throw new ErroEdicao("Este canal não existe mais.");
      return { projeto: { ...projeto, canais: canais.map((canal) => (canal.id === parametros.id ? { ...canal, ...parametros.mudanca } : canal)) } };
    }
    case "canal.apagar":
      return { projeto: { ...projeto, canais: (projeto.canais ?? []).filter((canal) => canal.id !== parametros.id) } };
    case "imagem.soEsta":
      return { projeto: soEstaVisivel(projeto, parametros.faixaId) };
    case "imagem.mover":
      return { projeto: moverCamada(projeto, parametros.faixaId, parametros.para) };
    case "imagem.apagar":
      return { projeto: apagarCamada(projeto, parametros.faixaId), selecao: [] };
    case "imagem.duplicar": {
      const resultado = duplicarCamada(projeto, ctx, parametros.faixaId);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.camadaComOutraMidia": {
      const resultado = camadaComOutraMidia(projeto, ctx, parametros.faixaId, parametros.midiaId);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.recortar":
      return { projeto: recortarImagem(projeto, parametros.retangulo, parametros.tamanhos) };
    case "imagem.transformarCamada":
      return { projeto: transformarCamada(projeto, parametros.clipeId, parametros.transformacao, parametros.virar) };
    case "imagem.adicionarVetor": {
      const resultado = adicionarCamadaVetorial(projeto, ctx, parametros.vetor, parametros.centro, parametros.nome, parametros.acima);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.mudarVetor":
      return { projeto: mudarVetor(projeto, parametros.clipeId, parametros.vetor, parametros.deslocamento) };
    case "imagem.juntarAoVetor":
      return { projeto: juntarAoVetor(projeto, parametros.clipeId, parametros.caminhos, parametros.operacao) };
    case "imagem.caminhosDoVetor":
      return { projeto: trocarCaminhosDoVetor(projeto, parametros.clipeId, parametros.caminhos) };
    case "imagem.caminhos":
      return { projeto: { ...projeto, caminhos: parametros.caminhos } };
    case "imagem.mascaraVetorial":
      return { projeto: definirMascaraVetorial(projeto, parametros.clipeId, parametros.mascara) };
    case "imagem.adicionarTextoRico": {
      const resultado = adicionarTextoRico(projeto, ctx, parametros.texto, parametros.ponto, parametros.nome, parametros.acima, parametros.id);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.mostrarEfeitos":
      return { projeto: mostrarEfeitos(projeto, parametros.visiveis) };
    case "imagem.dimensionarEfeitos":
      return { projeto: dimensionarEfeitos(projeto, parametros.clipeIds, parametros.fator) };
    case "imagem.estiloDeCamada":
      return { projeto: definirEstiloDeCamada(projeto, parametros.clipeIds, parametros.estilo, parametros.luz, parametros.camada) };
    case "imagem.textosRicos":
      return { projeto: mudarTextosRicos(projeto, parametros.mudancas) };
    case "imagem.textoEmForma": {
      const resultado = textoEmForma(projeto, ctx, parametros.clipeId, parametros.vetor, parametros.centro);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.textoRico":
      return { projeto: mudarTextoRico(projeto, parametros.clipeId, parametros.texto, parametros.deslocamento) };
    case "imagem.adicionarPrancheta": {
      const resultado = adicionarPrancheta(projeto, ctx, parametros.retangulo, parametros.nome, parametros.fundo, parametros.tamanhos);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.prancheta":
      return { projeto: mudarPrancheta(projeto, parametros.clipeId, parametros.mudanca, parametros.tamanhos) };
    case "imagem.pranchetaDoGrupo":
      return { projeto: pranchetaDoGrupo(projeto, parametros.faixaId, parametros.retangulo, parametros.fundo, parametros.tamanhos) };
    case "imagem.pranchetaDeCamadas": {
      const agrupado = agruparCamadas(projeto, ctx, parametros.faixaIds);
      const faixa = agrupado.projeto.faixas.find((item) => item.clipes[0]?.id === agrupado.clipeId)!;
      const comNome = { ...agrupado.projeto, faixas: agrupado.projeto.faixas.map((item) => (item.id === faixa.id ? { ...item, nome: parametros.nome } : item)) };
      return { projeto: pranchetaDoGrupo(comNome, faixa.id, parametros.retangulo, parametros.fundo, parametros.tamanhos), selecao: [agrupado.clipeId] };
    }
    case "imagem.tamanhoComPixels":
      return { projeto: tamanhoComPixels(projeto, parametros.tamanho, parametros.pixels, parametros.canais) };
    case "imagem.tamanhoDaTela":
      return { projeto: tamanhoDaTela(projeto, parametros.retangulo, parametros.tamanhos, parametros.fundo) };
    case "imagem.girar":
      return { projeto: girarImagem(projeto, parametros.giro, parametros.tamanhos) };
    case "imagem.cortar":
      return { projeto: cortarImagem(projeto, parametros.caixa, parametros.tamanhos, parametros.pixels) };
    case "imagem.alinhar": {
      // A tela cresce até caber todas as alinhadas, e cada uma é trocada pela versão alinhada, num passo só
      let atual = tamanhoDaTela(projeto, parametros.retangulo, parametros.tamanhos, null);
      for (const troca of parametros.trocas) atual = substituirPorPixels(atual, ctx.novoId, troca).projeto;
      return { projeto: atual, selecao: [] };
    }
    case "imagem.retificar": {
      // O Corte de perspectiva: o quadro novo e cada camada trocada pela versão retificada dela, num passo só
      let atual = mudarTamanhoDaImagem(projeto, parametros.tamanho);
      for (const troca of parametros.trocas) atual = substituirPorPixels(atual, ctx.novoId, troca).projeto;
      return { projeto: atual, selecao: [] };
    }
    case "imagem.aplicarModelo":
      return { projeto: aplicarModeloDeImagem(projeto, ctx, parametros), selecao: [] };
    case "imagem.trocarImagem":
      return { projeto: trocarImagemDaCamada(projeto, ctx, parametros.clipeId, parametros.midiaId, parametros.tamanhoAtual, parametros.tamanhoNovo), selecao: [parametros.clipeId] };
    case "imagem.desfocarFundo": {
      const resultado = desfocarFundo(projeto, ctx, parametros.faixaId);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "imagem.fundo":
      return { projeto: mudarFundoDaImagem(projeto, parametros) };
    case "imagem.informacoes":
      return { projeto: { ...projeto, informacoes: parametros.informacoes } };
    case "imagem.contagem":
      return { projeto: { ...projeto, contagem: parametros.contagem?.grupos.length ? parametros.contagem : null } };
    case "imagem.notas":
      return { projeto: { ...projeto, notas: parametros.notas } };
    case "imagem.comps":
      return { projeto: { ...projeto, comps: parametros.comps } };
    case "imagem.aplicarComp":
      return { projeto: aplicarComp(projeto, parametros.comp) };
    case "imagem.perspectiva":
      return { projeto: { ...projeto, perspectiva: parametros.grade } };
    case "imagem.fatias":
      return { projeto: { ...projeto, fatias: parametros.fatias } };
    case "imagem.animacao":
      return { projeto: { ...projeto, animacao: parametros.animacao?.quadros.length ? parametros.animacao : null } };
    case "imagem.escalaDeMedida":
      return { projeto: { ...projeto, escala_de_medida: parametros.escala } };
    case "imagem.simbolos":
      return { projeto: { ...projeto, simbolos: parametros.simbolos } };
    case "imagem.grafico": {
      // As formas e os textos do gráfico; refeito, entram na pasta dele no lugar dos de antes
      const antigas = parametros.pasta ? projeto.faixas.filter((faixa) => faixa.pai === parametros.pasta).map((faixa) => faixa.id) : [];
      let atual = projeto;
      let acima: string | null = antigas[antigas.length - 1] ?? parametros.acima ?? null;
      const novas: string[] = [];
      const anotar = (clipeId: string) => {
        const faixa = faixaDoClipeNoProjeto(atual, clipeId);
        if (faixa) {
          novas.push(faixa);
          acima = faixa;
        }
      };
      for (const forma of parametros.formas) {
        const posta = adicionarCamadaVetorial(atual, ctx, forma.vetor, forma.centro, forma.nome, acima);
        atual = posta.projeto;
        anotar(posta.clipeId);
      }
      for (const texto of parametros.textos) {
        const id = ctx.novoId();
        atual = executarComando(atual, { comando: "imagem.adicionarTextoRico", parametros: { texto: texto.texto, ponto: texto.ponto, nome: texto.nome, acima, id } }, ctx).projeto;
        if (texto.giro) atual = transformarCamada(atual, id, { rotacao: texto.giro });
        anotar(id);
      }
      if (parametros.pasta) {
        const pasta = parametros.pasta;
        atual = executarComando(atual, { comando: "imagem.apagarVarias", parametros: { faixaIds: antigas } }, ctx).projeto;
        atual = { ...atual, faixas: atual.faixas.map((faixa) => (faixa.id === pasta ? { ...faixa, clipes: [{ ...faixa.clipes[0], grafico: parametros.grafico }] } : faixa)) };
        return { projeto: atual, selecao: [projeto.faixas.find((faixa) => faixa.id === pasta)?.clipes[0].id].filter((id): id is string => Boolean(id)) };
      }
      const agrupado = executarComando(atual, { comando: "imagem.agrupar", parametros: { faixaIds: novas } }, ctx);
      const pasta = faixaDoClipeNoProjeto(agrupado.projeto, agrupado.selecao?.[0]);
      if (!pasta) return agrupado;
      const numero = projeto.faixas.filter((faixa) => faixa.clipes[0]?.grafico).length + 1;
      const nomeado = executarComando(agrupado.projeto, { comando: "imagem.camada", parametros: { faixaIds: [pasta], mudanca: { nome: `Gráfico ${numero}` } } }, ctx).projeto;
      return { projeto: mudarClipesDasInstancias(nomeado, (clipe) => (clipe.id === agrupado.selecao?.[0] ? { ...clipe, grafico: parametros.grafico } : clipe)), selecao: agrupado.selecao };
    }
    case "imagem.novoSimbolo": {
      // O símbolo novo, e a forma de onde ele veio passa a ser a primeira instância
      const comSimbolo = { ...projeto, simbolos: [...(projeto.simbolos ?? []), parametros.simbolo] };
      return { projeto: mudarClipesDasInstancias(comSimbolo, (clipe) => (clipe.id === parametros.clipeId ? { ...clipe, simbolo: { id: parametros.simbolo.id } } : clipe)) };
    }
    case "imagem.redefinirSimbolo": {
      // A forma nova no símbolo e em todas as instâncias (com a tinta de cada uma; uma unidade continua valendo o mesmo)
      const simbolos = (projeto.simbolos ?? []).map((simbolo) => (simbolo.id === parametros.id ? { ...simbolo, vetor: parametros.vetor } : simbolo));
      const simbolo = simbolos.find((item) => item.id === parametros.id);
      if (!simbolo) return { projeto };
      const quadro = tamanhoDaImagem(projeto);
      return {
        projeto: mudarClipesDasInstancias({ ...projeto, simbolos }, (clipe) => {
          if (clipe.simbolo?.id !== parametros.id || !clipe.vetor) return clipe;
          const vetor = vetorDaInstancia(simbolo, clipe.simbolo.tinta);
          const escala = clipe.transformacao.escala * (pixelsPorUnidade(clipe.vetor.caixa, 1, quadro) / pixelsPorUnidade(vetor.caixa, 1, quadro));
          return { ...clipe, vetor, transformacao: { ...clipe.transformacao, escala } };
        }),
      };
    }
    case "imagem.excluirSimbolo":
      return {
        projeto: mudarClipesDasInstancias({ ...projeto, simbolos: (projeto.simbolos ?? []).filter((simbolo) => simbolo.id !== parametros.id) }, (clipe) =>
          clipe.simbolo?.id === parametros.id ? { ...clipe, simbolo: null } : clipe,
        ),
      };
    case "imagem.romperSimbolo":
      return { projeto: mudarClipesDasInstancias(projeto, (clipe) => (parametros.clipeIds.includes(clipe.id) ? { ...clipe, simbolo: null } : clipe)) };
    case "imagem.porInstancias": {
      // As instâncias novas; num conjunto que já existe, dentro dele; senão, várias viram um conjunto novo
      const simbolo = (projeto.simbolos ?? []).find((item) => item.id === parametros.id);
      if (!simbolo || !parametros.lugares.length) return { projeto };
      const dentro = parametros.conjunto ? projeto.faixas.find((faixa) => faixa.pai === parametros.conjunto) : undefined;
      let atual = projeto;
      let acima: string | null = dentro?.id ?? null;
      const ids: string[] = [];
      for (const lugar of parametros.lugares) {
        const posta = adicionarCamadaVetorial(atual, ctx, simbolo.vetor, { x: lugar.x, y: lugar.y }, simbolo.nome, acima);
        atual = mudarClipesDasInstancias(posta.projeto, (clipe) =>
          clipe.id === posta.clipeId ? { ...clipe, simbolo: { id: simbolo.id }, transformacao: { ...clipe.transformacao, escala: clipe.transformacao.escala * lugar.escala, rotacao: lugar.giro } } : clipe,
        );
        ids.push(posta.clipeId);
        acima = faixaDoClipeNoProjeto(atual, posta.clipeId) ?? acima;
      }
      if (dentro || ids.length < 2) return { projeto: atual, selecao: ids };
      const faixas = ids.map((id) => faixaDoClipeNoProjeto(atual, id)).filter((f): f is string => Boolean(f));
      const agrupado = executarComando(atual, { comando: "imagem.agrupar", parametros: { faixaIds: faixas } }, ctx);
      const pasta = faixaDoClipeNoProjeto(agrupado.projeto, agrupado.selecao?.[0]);
      const nomeado = pasta ? executarComando(agrupado.projeto, { comando: "imagem.camada", parametros: { faixaIds: [pasta], mudanca: { nome: parametros.nomeDoConjunto ?? "Conjunto de símbolos" } } }, ctx).projeto : agrupado.projeto;
      return { projeto: nomeado, selecao: agrupado.selecao };
    }
    case "imagem.instancias": {
      // Os pincéis de símbolo: a posição, a tinta (a forma de novo, do símbolo) e o estilo de cada instância
      const porId = new Map(parametros.mudancas.map((mudanca) => [mudanca.clipeId, mudanca]));
      const simbolos = projeto.simbolos ?? [];
      return {
        projeto: mudarClipesDasInstancias(projeto, (clipe) => {
          const mudanca = porId.get(clipe.id);
          if (!mudanca) return clipe;
          let novo = mudanca.transformacao ? { ...clipe, transformacao: { ...clipe.transformacao, ...mudanca.transformacao } } : clipe;
          if (mudanca.tinta !== undefined && novo.simbolo) {
            const simbolo = simbolos.find((item) => item.id === novo.simbolo!.id);
            novo = { ...novo, simbolo: { ...novo.simbolo, tinta: mudanca.tinta }, ...(simbolo ? { vetor: vetorDaInstancia(simbolo, mudanca.tinta) } : {}) };
          }
          if (mudanca.estilo !== undefined) novo = { ...novo, estilo_camada: mudanca.estilo };
          return novo;
        }),
      };
    }
    case "imagem.repetirNoCaminho": {
      // As cópias da camada, cada uma com o meio num lugar do caminho e o giro somado, num grupo "Repetição"
      const faixaId = faixaDoClipeNoProjeto(projeto, parametros.clipeId);
      const original = projeto.faixas.find((faixa) => faixa.id === faixaId)?.clipes[0];
      if (!faixaId || !original) return { projeto };
      const documento = tamanhoDaImagem(projeto);
      let atual = projeto;
      const faixas: string[] = [];
      for (const lugar of parametros.lugares) {
        const copia = duplicarCamada(atual, ctx, faixaId, true);
        atual = transformarCamada(copia.projeto, copia.clipeId, { x: lugar.x / documento.largura - 0.5, y: lugar.y / documento.altura - 0.5, rotacao: original.transformacao.rotacao + lugar.giro });
        const faixa = faixaDoClipeNoProjeto(atual, copia.clipeId);
        if (faixa) faixas.push(faixa);
      }
      if (!faixas.length) return { projeto: atual };
      const agrupado = executarComando(atual, { comando: "imagem.agrupar", parametros: { faixaIds: faixas } }, ctx);
      const pasta = faixaDoClipeNoProjeto(agrupado.projeto, agrupado.selecao?.[0]);
      const numero = projeto.faixas.filter((faixa) => faixa.nome?.startsWith("Repetição")).length + 1;
      const nomeado = pasta ? executarComando(agrupado.projeto, { comando: "imagem.camada", parametros: { faixaIds: [pasta], mudanca: { nome: `Repetição ${numero}` } } }, ctx).projeto : agrupado.projeto;
      return { projeto: nomeado, selecao: agrupado.selecao };
    }
    case "imagem.mesclarObjetos": {
      // Os passos entre as duas formas, cada um acima do anterior, e tudo num grupo "Mescla"
      const faixaDe = faixaDoClipeNoProjeto(projeto, parametros.de);
      const faixaAte = faixaDoClipeNoProjeto(projeto, parametros.ate);
      if (!faixaDe || !faixaAte) return { projeto };
      let atual = projeto;
      let acima = faixaDe;
      const faixas = [faixaDe];
      parametros.passos.forEach((passo, i) => {
        const posto = adicionarCamadaVetorial(atual, ctx, passo.vetor, passo.centro, `Passo ${i + 1}`, acima);
        atual = { ...posto.projeto, faixas: posto.projeto.faixas.map((faixa) => (faixa.clipes[0]?.id === posto.clipeId ? { ...faixa, clipes: [{ ...faixa.clipes[0], transformacao: { ...faixa.clipes[0].transformacao, opacidade: passo.opacidade } }] } : faixa)) };
        const faixa = faixaDoClipeNoProjeto(atual, posto.clipeId);
        if (faixa) {
          faixas.push(faixa);
          acima = faixa;
        }
      });
      faixas.push(faixaAte);
      const agrupado = executarComando(atual, { comando: "imagem.agrupar", parametros: { faixaIds: faixas } }, ctx);
      const pasta = faixaDoClipeNoProjeto(agrupado.projeto, agrupado.selecao?.[0]);
      const numero = projeto.faixas.filter((faixa) => faixa.nome?.startsWith("Mescla")).length + 1;
      const nomeado = pasta ? executarComando(agrupado.projeto, { comando: "imagem.camada", parametros: { faixaIds: [pasta], mudanca: { nome: `Mescla ${numero}` } } }, ctx).projeto : agrupado.projeto;
      return { projeto: nomeado, selecao: agrupado.selecao };
    }
    case "imagem.adicionarCota": {
      // A linha e o número num grupo "Cota", num passo só (o número girado com a linha)
      const linha = executarComando(projeto, { comando: "imagem.adicionarVetor", parametros: { vetor: parametros.linha, centro: parametros.centro, nome: "Linha da cota", acima: parametros.acima } }, ctx);
      const faixaDaLinha = faixaDoClipeNoProjeto(linha.projeto, linha.selecao?.[0]);
      const idDoTexto = ctx.novoId();
      let atual = executarComando(linha.projeto, { comando: "imagem.adicionarTextoRico", parametros: { texto: parametros.texto, ponto: parametros.ponto, nome: "Número da cota", acima: faixaDaLinha, id: idDoTexto } }, ctx).projeto;
      if (parametros.giro) atual = transformarCamada(atual, idDoTexto, { rotacao: parametros.giro });
      const faixas = [faixaDaLinha, faixaDoClipeNoProjeto(atual, idDoTexto)].filter((f): f is string => Boolean(f));
      const agrupado = executarComando(atual, { comando: "imagem.agrupar", parametros: { faixaIds: faixas } }, ctx);
      const pasta = faixaDoClipeNoProjeto(agrupado.projeto, agrupado.selecao?.[0]);
      const numero = projeto.faixas.filter((faixa) => faixa.nome?.startsWith("Cota")).length + 1;
      const nomeado = pasta ? executarComando(agrupado.projeto, { comando: "imagem.camada", parametros: { faixaIds: [pasta], mudanca: { nome: `Cota ${numero}` } } }, ctx).projeto : agrupado.projeto;
      return { projeto: nomeado, selecao: agrupado.selecao };
    }
    case "imagem.construirFormas": {
      // O Construtor de formas e a Pintura viva: cada peça é uma cópia da forma de onde veio (a aparência dela) com os
      // caminhos da peça (e, na pintura, a cor nova); as formas de antes saem
      let atual = projeto;
      const selecao: string[] = [];
      for (const peca of parametros.pecas) {
        const faixaId = faixaDoClipeNoProjeto(atual, peca.origem);
        if (!faixaId) continue;
        const copia = duplicarCamada(atual, ctx, faixaId, true);
        // A peça fica com o nome da forma de onde veio (sem o "cópia")
        const nome = atual.faixas.find((faixa) => faixa.id === faixaId)?.nome;
        atual = trocarCaminhosDoVetor(copia.projeto, copia.clipeId, peca.caminhos);
        atual = { ...atual, faixas: atual.faixas.map((faixa) => (faixa.clipes[0]?.id === copia.clipeId ? { ...faixa, nome } : faixa)) };
        if (peca.cor) {
          const cor = peca.cor;
          atual = { ...atual, faixas: atual.faixas.map((faixa) => (faixa.clipes[0]?.id === copia.clipeId && faixa.clipes[0].vetor ? { ...faixa, clipes: [{ ...faixa.clipes[0], vetor: { ...faixa.clipes[0].vetor, preenchimento: { tipo: "cor" as const, cor } } }] } : faixa)) };
        }
        selecao.push(copia.clipeId);
      }
      return { projeto: executarComando(atual, { comando: "imagem.apagarVarias", parametros: { faixaIds: parametros.apagar } }, ctx).projeto, selecao };
    }
    case "imagem.transformarCamadas": {
      // Girar, Refletir, Escalar e Inclinar: a posição da camada quando dá; as formas, pelos pontos; com copiar, nas cópias
      const documento = tamanhoDaImagem(projeto);
      let atual = projeto;
      const selecao: string[] = [];
      for (const id of parametros.clipeIds) {
        let alvo = id;
        if (parametros.copiar) {
          const faixaId = faixaDoClipeNoProjeto(atual, id);
          if (!faixaId) continue;
          const copia = duplicarCamada(atual, ctx, faixaId, true);
          atual = copia.projeto;
          alvo = copia.clipeId;
        }
        const clipe = atual.faixas.find((faixa) => faixa.clipes[0]?.id === alvo)?.clipes[0];
        if (!clipe) continue;
        const tr = clipe.transformacao;
        const posicao = posicaoPelaAfim(parametros.afim, { x: (tr.x + 0.5) * documento.largura, y: (tr.y + 0.5) * documento.altura }, tr.escala, tr.rotacao);
        if (posicao) {
          const virar = clipe.virar ?? { horizontal: false, vertical: false };
          const nova = { x: posicao.centro.x / documento.largura - 0.5, y: posicao.centro.y / documento.altura - 0.5, escala: posicao.escala, rotacao: posicao.rotacao };
          atual = transformarCamada(atual, alvo, nova, posicao.espelhado ? { ...virar, horizontal: !virar.horizontal } : undefined);
        } else if (clipe.vetor) {
          atual = trocarCaminhosDoVetor(atual, alvo, transformarCaminhos(caminhosDoVetorNaImagem(clipe, documento), (p) => aplicarAfim(parametros.afim, p)));
        }
        selecao.push(alvo);
      }
      return { projeto: atual, selecao };
    }
    case "imagem.caminhosDasFormas": {
      // A Borracha vetorial: cada forma com o que sobrou, e as que sumiram de todo saem
      let atual = projeto;
      for (const troca of parametros.trocas) atual = trocarCaminhosDoVetor(atual, troca.clipeId, troca.caminhos);
      return parametros.apagar.length ? executarComando(atual, { comando: "imagem.apagarVarias", parametros: { faixaIds: parametros.apagar } }, ctx) : { projeto: atual };
    }
    case "imagem.dividirFormas": {
      // A Faca: o primeiro pedaço fica na camada; cada outro é uma cópia dela com os caminhos do pedaço
      let atual = projeto;
      const selecao: string[] = [];
      for (const divisao of parametros.divisoes) {
        const faixaId = faixaDoClipeNoProjeto(atual, divisao.clipeId);
        if (!faixaId) continue;
        for (const pedaco of divisao.pedacos.slice(1)) {
          const copia = duplicarCamada(atual, ctx, faixaId);
          atual = trocarCaminhosDoVetor(copia.projeto, copia.clipeId, pedaco);
          selecao.push(copia.clipeId);
        }
        atual = trocarCaminhosDoVetor(atual, divisao.clipeId, divisao.pedacos[0]);
        selecao.unshift(divisao.clipeId);
      }
      return { projeto: atual, selecao };
    }
    case "imagem.unirFormas": {
      // As formas debaixo do rabisco do Modelador: os caminhos delas somados à primeira, e as outras saem
      const juntado = juntarAoVetor(projeto, parametros.clipeId, parametros.caminhos, "somar");
      return executarComando(juntado, { comando: "imagem.apagarVarias", parametros: { faixaIds: parametros.apagar } }, ctx);
    }
    case "imagem.adicionarReflexo": {
      // As camadas em "tela", uma acima da outra, numa pasta, num passo só
      let atual = projeto;
      let acima = parametros.acima ?? null;
      const faixas: string[] = [];
      for (const camada of parametros.camadas) {
        const posta = adicionarCamadaVetorial(atual, ctx, camada.vetor, camada.centro, camada.nome, acima);
        atual = {
          ...posta.projeto,
          faixas: posta.projeto.faixas.map((faixa) =>
            faixa.clipes[0]?.id === posta.clipeId ? { ...faixa, clipes: [{ ...faixa.clipes[0], mesclagem: "tela", transformacao: { ...faixa.clipes[0].transformacao, opacidade: camada.opacidade } }] } : faixa,
          ),
        };
        const faixa = faixaDoClipeNoProjeto(atual, posta.clipeId);
        if (faixa) {
          faixas.push(faixa);
          acima = faixa;
        }
      }
      const agrupado = executarComando(atual, { comando: "imagem.agrupar", parametros: { faixaIds: faixas } }, ctx);
      const pasta = faixaDoClipeNoProjeto(agrupado.projeto, agrupado.selecao?.[0]);
      const nomeado = pasta ? executarComando(agrupado.projeto, { comando: "imagem.camada", parametros: { faixaIds: [pasta], mudanca: { nome: parametros.nome } } }, ctx).projeto : agrupado.projeto;
      return { projeto: nomeado, selecao: agrupado.selecao };
    }
    case "imagem.marcadorDeEscala": {
      // A barra e o número numa pasta "Marcador de escala de medida", num passo só
      const barra = executarComando(projeto, { comando: "imagem.adicionarVetor", parametros: { vetor: parametros.barra, centro: parametros.centro, nome: "Barra de escala", acima: parametros.acima } }, ctx);
      const faixas = [faixaDoClipeNoProjeto(barra.projeto, barra.selecao?.[0])];
      let atual = barra.projeto;
      if (parametros.texto) {
        const id = ctx.novoId();
        atual = executarComando(atual, { comando: "imagem.adicionarTextoRico", parametros: { texto: parametros.texto, ponto: parametros.ponto, nome: "Texto da escala", acima: faixas[0], id } }, ctx).projeto;
        faixas.push(faixaDoClipeNoProjeto(atual, id));
      }
      const agrupado = executarComando(atual, { comando: "imagem.agrupar", parametros: { faixaIds: faixas.filter((f): f is string => Boolean(f)) } }, ctx);
      const pasta = faixaDoClipeNoProjeto(agrupado.projeto, agrupado.selecao?.[0]);
      const nomeado = pasta ? executarComando(agrupado.projeto, { comando: "imagem.camada", parametros: { faixaIds: [pasta], mudanca: { nome: "Marcador de escala de medida" } } }, ctx).projeto : agrupado.projeto;
      return { projeto: nomeado, selecao: agrupado.selecao };
    }
    case "imagem.guias":
      return { projeto: { ...projeto, guias: parametros.guias.verticais.length || parametros.guias.horizontais.length ? parametros.guias : null } };
    case "imagem.variaveis":
      return { projeto: { ...projeto, variaveis: parametros.variaveis.variaveis.length ? parametros.variaveis : null } };
    case "imagem.aplicarConjunto":
      // As faixas já com os valores (o texto medido e as fotos trocadas vêm de quem chama)
      return { projeto: { ...projeto, faixas: parametros.faixas } };
    case "imagem.modo":
      return { projeto: { ...projeto, modo: parametros.modo.tipo === "rgb" ? null : parametros.modo } };
    case "imagem.tamanho":
      return { projeto: mudarTamanhoDaImagem(projeto, parametros) };
    case "clipe.preencher":
      return { projeto: preencherVaga(projeto, ctx, parametros.clipeId, parametros.midiaId), selecao: [parametros.clipeId] };
    case "clipe.nivelar":
      return { projeto: nivelarClipe(projeto, parametros.clipeId, parametros.nivelamento) };
    case "clipe.abaixar":
      return { projeto: abaixarClipe(projeto, parametros.clipeId, parametros.abaixamento) };
    case "clipe.reenquadrar":
      return { projeto: reenquadrarClipe(projeto, parametros.clipeId, parametros.reenquadramento) };
    case "clipe.seguirObjeto":
      return { projeto: seguirObjetoClipe(projeto, parametros.clipeId, parametros.caminho) };
    case "clipe.keyframe":
      return { projeto: mudarKeyframe(projeto, parametros.clipeId, parametros.propriedade, parametros.tempo, parametros.acao) };
    case "clipe.limparKeyframes":
      return { projeto: limparKeyframes(projeto, parametros.clipeId, parametros.propriedade, parametros.tempo) };
    case "clipe.moverKeyframe":
      return { projeto: moverKeyframe(projeto, parametros.clipeId, parametros.propriedade, parametros.de, parametros.para) };
    case "clipe.expressao":
      return { projeto: mudarExpressao(projeto, parametros.clipeId, parametros.propriedade, parametros.expressao) };
    case "clipe.recortar":
      return { projeto: recortarClipes(projeto, parametros.clipeIds, parametros.recorte) };
    case "clipe.restaurar":
      return { projeto: restaurarClipes(projeto, parametros.clipeIds) };
    case "texto.adicionar": {
      const resultado = adicionarTexto(projeto, ctx, parametros.inicio, parametros.texto);
      // A ferramenta Texto do monitor escreve no ponto do clique: o mesmo passo do desfazer
      const posto = parametros.transformacao ? transformarClipes(resultado.projeto, [resultado.clipeId], parametros.transformacao) : resultado.projeto;
      return { projeto: posto, selecao: [resultado.clipeId] };
    }
    case "legenda.adicionar": {
      const resultado = adicionarLegenda(projeto, ctx, parametros.inicio, parametros.estilo);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "legenda.importar": {
      const resultado = importarLegendas(projeto, ctx, parametros.legendas, parametros.estilo);
      return { projeto: resultado.projeto, selecao: [] };
    }
    case "legenda.estilo":
      return { projeto: estiloDasLegendas(projeto, parametros.faixaId, parametros.estilo) };
    case "legenda.palavrasChave":
      return { projeto: palavrasChaveDasLegendas(projeto, parametros.chaves, parametros.cor) };
    case "clipe.colar": {
      const resultado = colarClipes(projeto, ctx, parametros.copiados, parametros.inicio);
      return { projeto: resultado.projeto, selecao: resultado.novos };
    }
    case "clipe.colarAjustes":
      return { projeto: colarAjustes(projeto, ctx, parametros.origem, parametros.clipeIds, parametros.grupos).projeto };
    case "legenda.juntar": {
      const resultado = juntarLegendas(projeto, parametros.clipeIds);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "legenda.substituir":
      return { projeto: substituirNasLegendas(projeto, parametros.faixaId, parametros.busca, parametros.troca).projeto };
    case "musica.ajustar": {
      const resultado = ajustarMusicaAoVideo(projeto, ctx, parametros.clipeId, parametros.fortes);
      return { projeto: resultado.projeto, selecao: resultado.novos };
    }
    case "linha.cortarNoRitmo":
      return { projeto: cortarNoRitmo(projeto, ctx, parametros.batidas) };
    case "modelo.aplicar":
      return aplicarModelo(projeto, ctx, parametros.plano);
    case "clipe.trocarMidia":
      return { projeto: trocarMidiaDosClipes(projeto, ctx, parametros.clipeIds, parametros.midiaId) };
    case "marca.logo": {
      const resultado = colocarLogo(projeto, ctx, parametros.midiaId, parametros.transformacao);
      return { projeto: resultado.projeto, selecao: [resultado.clipeId] };
    }
    case "marca.textos":
      return { projeto: aplicarMarcaAosTextos(projeto, parametros.fonteTitulo, parametros.fonteTexto, parametros.cor) };
    case "linha.montar":
      return montarNaLinha(projeto, ctx, parametros.trechos, parametros.musica);
    case "multicamera.sincronizar":
      return sincronizarCameras(projeto, ctx, parametros.cameras);
    case "multicamera.trocar":
      return trocarCamera(projeto, ctx, parametros.tempo, parametros.faixaId);
    case "multicamera.desfazer":
      return { projeto: desfazerMulticamera(projeto) };
    case "linha.pulsarNoRitmo":
      return { projeto: pulsarNoRitmo(projeto, parametros.batidas) };
    case "clipe.transicao":
      return { projeto: definirTransicao(projeto, parametros.clipeId, parametros.transicao) };
    case "clipe.cor":
      return { projeto: mudarCor(projeto, parametros.clipeIds, parametros.cor) };
    case "clipe.animar":
      return { projeto: animarClipes(projeto, parametros.clipeIds, parametros.animacao) };
    case "texto.mudar":
      return { projeto: mudarTexto(projeto, parametros.clipeIds, parametros.texto) };
    case "clipe.audio": {
      const { clipeIds, ...mudanca } = parametros;
      return { projeto: ajustarAudio(projeto, clipeIds, mudanca) };
    }
  }
}

// -----------------------------------------------
// Histórico
// -----------------------------------------------
export const LIMITE_HISTORICO = 200;

type Passo = { projeto: Projeto; nome: string };

export type Historico = { passado: Passo[]; presente: Projeto; futuro: Passo[] };

/** O que o editor devolve ao executar um comando: o projeto novo, ou null se o comando falhou (o aviso já apareceu). */
export type ResultadoDoComando = { projeto: Projeto; selecao?: string[] } | null;

export function iniciarHistorico(projeto: Projeto): Historico {
  return { passado: [], presente: projeto, futuro: [] };
}

/**
 * Um passo novo. No histórico linear, o que tinha sido desfeito some; no não linear (as opções do Histórico do editor
 * de imagem), os estados desfeitos ficam na lista e o passo novo entra no fim dela, feito a partir do estado escolhido.
 * Passando do limite, os passos mais antigos saem.
 */
export function registrar(historico: Historico, projeto: Projeto, nome: string, { limite = LIMITE_HISTORICO, naoLinear = false }: { limite?: number; naoLinear?: boolean } = {}): Historico {
  if (projeto === historico.presente) return historico;
  // Cada passo guarda o estado de antes e o nome da mudança que levou ao seguinte
  const estados = naoLinear ? [historico.presente, ...historico.futuro.map((passo) => passo.projeto)] : [historico.presente];
  const nomes = naoLinear ? [...historico.futuro.map((passo) => passo.nome), nome] : [nome];
  const passado = [...historico.passado, ...estados.map((estado, i) => ({ projeto: estado, nome: nomes[i] }))].slice(-Math.max(1, limite));
  return { passado, presente: projeto, futuro: [] };
}

/** Os passos mais antigos que passam do limite saem (as opções do Histórico mudaram o número de estados). */
export function limitarHistorico(historico: Historico, limite: number): Historico {
  const maximo = Math.max(1, limite);
  return historico.passado.length > maximo ? { ...historico, passado: historico.passado.slice(-maximo) } : historico;
}

/**
 * Excluir o estado de agora (o botão do Histórico): no linear, ele e os que vieram depois saem e o anterior fica; no
 * não linear, só ele sai.
 */
export function excluirEstado(historico: Historico, naoLinear = false): Historico {
  const anterior = historico.passado.at(-1);
  if (!anterior) return historico;
  return { passado: historico.passado.slice(0, -1), presente: anterior.projeto, futuro: naoLinear ? historico.futuro : [] };
}

/** O estado de agora muda sem virar passo (as mudanças de visibilidade, quando as opções do Histórico mandam). */
export function substituirPresente(historico: Historico, projeto: Projeto): Historico {
  return projeto === historico.presente ? historico : { ...historico, presente: projeto };
}

export function desfazer(historico: Historico): Historico {
  const anterior = historico.passado.at(-1);
  if (!anterior) return historico;
  return {
    passado: historico.passado.slice(0, -1),
    presente: anterior.projeto,
    futuro: [{ projeto: historico.presente, nome: anterior.nome }, ...historico.futuro],
  };
}

export function refazer(historico: Historico): Historico {
  const proximo = historico.futuro[0];
  if (!proximo) return historico;
  return {
    passado: [...historico.passado, { projeto: historico.presente, nome: proximo.nome }],
    presente: proximo.projeto,
    futuro: historico.futuro.slice(1),
  };
}
