# -----------------------------------------------
# TakeOne API — formatos de entrada e saída
# -----------------------------------------------
from datetime import datetime
from typing import Annotated, Literal, get_args

from pydantic import BaseModel, EmailStr, Field, field_validator, model_serializer, model_validator

from core.modelos.animacao_html import DURACAO_MAXIMA as DURACAO_MAXIMA_ANIMACAO
from core.modelos.animacao_html import DURACAO_MINIMA as DURACAO_MINIMA_ANIMACAO
from core.modelos.exportacao import ARQUIVOS_PUBLICOS as ARQUIVOS_EXPORTACAO
from core.modelos.exportacao import STATUS_ERRO as STATUS_EXPORTACAO_ERRO
from core.modelos.exportacao import STATUS_PROCESSANDO as STATUS_EXPORTACAO_PROCESSANDO
from core.modelos.exportacao import TAXAS_DO_GIF, TAXAS_DO_VIDEO
from core.modelos.geracao import DESCRICAO_MAXIMA, DESCRICAO_MINIMA, DURACOES
from core.modelos.job import STATUS_ERRO as STATUS_JOB_ERRO
from core.modelos.midia import STATUS_ERRO, STATUS_PROCESSANDO, arquivo_publico
from core.utils.tempo import TICKS_POR_SEGUNDO
from core.utils.texto import texto_cabe


def _limpar_espacos(valor):
    return " ".join(valor.split()) if isinstance(valor, str) else valor


class CadastroEntrada(BaseModel):
    nome: str = Field(min_length=2, max_length=80)
    email: EmailStr
    senha: str = Field(min_length=8, max_length=128)
    nome_organizacao: str | None = Field(default=None, max_length=80,
                                         description="Nome do espaço. Vazio: 'Espaço de <primeiro nome>'")

    @field_validator("nome", "nome_organizacao", mode="before")
    @classmethod
    def limpar_espacos(cls, valor):
        return _limpar_espacos(valor)


class EntrarEntrada(BaseModel):
    email: EmailStr
    senha: str = Field(min_length=1, max_length=128)


class UsuarioSaida(BaseModel):
    id: str
    nome: str
    email: str
    papel: str


class OrganizacaoSaida(BaseModel):
    id: str
    nome: str
    slug: str


class SessaoSaida(BaseModel):
    usuario: UsuarioSaida
    organizacao: OrganizacaoSaida


class JobCriarEntrada(BaseModel):
    tipo: Literal["teste"] = "teste"
    duracao: int = Field(default=10, ge=1, le=60, description="Só para o job de teste, em segundos")
    falhar: bool = Field(default=False, description="Só para o job de teste: simula uma falha")


class JobSaida(BaseModel):
    id: str
    tipo: str
    recurso: str
    status: str
    progresso: int
    mensagem: str
    tentativas: int
    max_tentativas: int
    erro: str | None = None
    entrada: dict = {}
    saida: dict | None = None
    criado_em: datetime
    atualizado_em: datetime
    iniciado_em: datetime | None = None
    concluido_em: datetime | None = None
    disponivel_em: datetime | None = None


class ProcessamentoSaida(BaseModel):
    status: str
    progresso: int
    mensagem: str


class MidiaSaida(BaseModel):
    id: str
    nome: str
    nome_original: str
    status: str
    tamanho_total: int
    bytes_recebidos: int
    duracao: float | None = None
    video: dict | None = None
    audio: dict | None = None
    miniaturas: dict | None = None
    imagem: bool = False
    arquivos: list[str] = []
    erro: str | None = None
    processamento: ProcessamentoSaida | None = None
    # A voz sem ruído: {"status": "processando" | "pronta" | "erro", "erro"}; sem ela, nunca foi pedida
    voz_limpa: dict | None = None
    # A máscara da pessoa (recorte do fundo): {status, erro}
    recorte_fundo: dict | None = None
    # A máscara dos rostos (esconder os rostos): {status, erro, quadros_com_rosto}
    esconder_rostos: dict | None = None
    # As máscaras dos objetos escondidos: id do rastreio → {status, erro}
    objetos_escondidos: dict = Field(default_factory=dict)
    # A imagem sem ruído: {status, erro}
    imagem_limpa: dict | None = None
    # A voz em outro tom: chave (tom_p3, tom_m2_limpa) → {status, erro}
    tons: dict = Field(default_factory=dict)
    estabilizacoes: dict = Field(default_factory=dict)
    # O vídeo ao contrário (status e erro), quando foi pedido
    invertido: dict | None = None
    # As câmeras lentas suaves pedidas, por chave do trecho: status, erro, de e até
    fluidos: dict = Field(default_factory=dict)
    # Vídeo gerado com IA: {descricao, formato, duracao}
    gerada: dict | None = None
    # Forma desenhada (POST /api/elementos/formas): o pedido que a gerou
    elemento: dict | None = None
    # Animação em HTML: {modelo, campos, proporcao, duracao}
    animacao: dict | None = None
    # Camada de pixels do editor de imagem: {largura, altura, ultima} (a última versão enviada)
    camada_pixels: dict | None = None
    # Importada pelo link: {origem, url, titulo, canal, duracao, miniatura}
    importacao: dict | None = None
    criado_em: datetime
    atualizado_em: datetime
    enviado_em: datetime | None = None


class CamadaPixelsEntrada(BaseModel):
    largura: int = Field(ge=1, le=8192)
    altura: int = Field(ge=1, le=8192)
    nome: str | None = Field(default=None, min_length=1, max_length=120)

    @model_validator(mode="after")
    def _area(self):
        if self.largura * self.altura > 36_000_000:
            raise ValueError("A camada passa de 36 milhões de pixels.")
        return self


class VersaoDePixelsSaida(BaseModel):
    # Só na última parte do envio: o número da versão nova
    versao: int | None = None


class MidiaAtualizarEntrada(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=120)

    @field_validator("nome", mode="before")
    @classmethod
    def limpar_espacos(cls, valor):
        return _limpar_espacos(valor)


class TaxaEntrada(BaseModel):
    num: int = Field(ge=1, le=240_000)
    den: int = Field(ge=1, le=1001)


class FundoEntrada(BaseModel):
    cor: str = Field(default="#000000", pattern=r"^#[0-9a-fA-F]{6}$")
    # Só no projeto de imagem: sem fundo (o PNG e o WebP saem com transparência)
    transparente: bool = False


class TamanhoEntrada(BaseModel):
    """O tamanho do projeto de imagem, em pixels (os limites são os de core/modelos/projeto.py)."""
    largura: int = Field(ge=16, le=8192)
    altura: int = Field(ge=16, le=8192)
    # A resolução em pixels por polegada (Imagem › Tamanho da imagem): vai no PNG e no JPG exportados
    resolucao: int | None = Field(default=None, ge=1, le=10000)

    @model_serializer(mode="wrap")
    def sem_resolucao_vazia(self, serializar):
        dados = serializar(self)
        if dados.get("resolucao") is None:
            dados.pop("resolucao", None)
        return dados

    @model_validator(mode="after")
    def area_que_cabe(self):
        if self.largura * self.altura > 36_000_000:
            raise ValueError("A imagem pode ter no máximo 36 milhões de pixels (6000 × 6000).")
        return self


# Os limites são os mesmos de apps/web/src/lib/projeto/edicao.ts
class TransformacaoEntrada(BaseModel):
    x: float = Field(default=0, ge=-10, le=10, description="Deslocamento do centro, em frações da largura do quadro")
    y: float = Field(default=0, ge=-10, le=10, description="Deslocamento do centro, em frações da altura do quadro")
    escala: float = Field(default=1, ge=0.01, le=20, description="1: a mídia cabe inteira no quadro")
    rotacao: float = Field(default=0, ge=-180, le=180, description="Graus, sentido horário")
    opacidade: float = Field(default=1, ge=0, le=1)


class ChaveLumaEntrada(BaseModel):
    tirar: Literal["escuro", "claro"] = "escuro"
    limiar: float = Field(default=0.1, ge=0, le=1)
    suavidade: float = Field(default=0.1, ge=0, le=1)


class EsconderRostosEntrada(BaseModel):
    modo: Literal["pixelizar", "desfocar"] = "pixelizar"
    forca: float = Field(default=0.6, ge=0, le=1)


class EsconderObjetoEntrada(BaseModel):
    rastreio: str = Field(pattern=r"^[0-9a-f]{24}$")
    modo: Literal["pixelizar", "desfocar"] = "pixelizar"
    forca: float = Field(default=0.7, ge=0, le=1)


class ObjetoEscondidoEntrada(BaseModel):
    rastreio_id: str = Field(pattern=r"^[0-9a-f]{24}$")


class ContornoEntrada(BaseModel):
    """Contorno em volta do que aparece do clipe (core/utils/silhueta.py); a largura é fração da altura do clipe."""
    cor: str = Field(default="#ffffff", pattern=r"^#[0-9a-fA-F]{6}$")
    largura: float = Field(default=0.02, ge=0, le=0.08)


class SombraEntrada(BaseModel):
    """Sombra do que aparece do clipe: desfoque e distância em frações da altura do clipe, ângulo em graus."""
    cor: str = Field(default="#000000", pattern=r"^#[0-9a-fA-F]{6}$")
    opacidade: float = Field(default=0.5, ge=0, le=1)
    desfoque: float = Field(default=0.02, ge=0, le=0.08)
    distancia: float = Field(default=0.03, ge=0, le=0.15)
    angulo: float = Field(default=90, ge=-360, le=360)


class CantosEntrada(BaseModel):
    # Frações do lado menor do clipe; os limites são os de core/utils/cantos.py
    raio: float = Field(default=0, ge=0, le=0.5)
    borda: float = Field(default=0, ge=0, le=0.25)
    cor: str = Field(default="#ffffff", pattern=r"^#[0-9a-fA-F]{6}$")


class VirarEntrada(BaseModel):
    horizontal: bool = False
    vertical: bool = False


class KeyframeEntrada(BaseModel):
    t: int = Field(description="Ticks desde o começo do clipe (pode ser negativo depois de aparar o começo)")
    valor: float
    curva: Literal["linear", "suave", "acelerar", "frear", "parado"] = "linear"


# Os mesmos limites da TransformacaoEntrada; no máximo 100 pontos por propriedade (o render monta
# uma expressão com todos)
LIMITES_ANIMAVEIS = {"x": (-10, 10), "y": (-10, 10), "escala": (0.01, 20), "rotacao": (-180, 180), "opacidade": (0, 1),
                     "volume": (0, 4)}


class KeyframesEntrada(BaseModel):
    x: list[KeyframeEntrada] | None = Field(default=None, max_length=100)
    y: list[KeyframeEntrada] | None = Field(default=None, max_length=100)
    escala: list[KeyframeEntrada] | None = Field(default=None, max_length=100)
    rotacao: list[KeyframeEntrada] | None = Field(default=None, max_length=100)
    opacidade: list[KeyframeEntrada] | None = Field(default=None, max_length=100)
    # O volume do som (fator de 0 a 4, como o `volume` do clipe)
    volume: list[KeyframeEntrada] | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def em_ordem_e_nos_limites(self):
        for nome, (minimo, maximo) in LIMITES_ANIMAVEIS.items():
            pontos = getattr(self, nome)
            if not pontos:
                continue
            if any(b.t <= a.t for a, b in zip(pontos, pontos[1:], strict=False)):
                raise ValueError(f"Os keyframes de {nome} precisam estar em ordem, sem dois no mesmo instante.")
            if any(not minimo <= ponto.valor <= maximo for ponto in pontos):
                raise ValueError(f"Um keyframe de {nome} passa do limite.")
        return self


# Os limites do tremido de cada propriedade, os de LIMITES_TREMOR em apps/web/src/lib/projeto/edicao.ts
LIMITES_TREMOR = {"x": 0.5, "y": 0.5, "escala": 1, "rotacao": 180, "opacidade": 1}


class TremorEntrada(BaseModel):
    # Período de 0,1 s a 10 s, em ticks; o deslocamento é o tempo que o tremido já tinha andado
    periodo: int = Field(ge=TICKS_POR_SEGUNDO // 10, le=10 * TICKS_POR_SEGUNDO)
    amplitude: float
    deslocamento: int = 0


class ExpressaoEntrada(BaseModel):
    repetir: Literal["ciclo", "vaivem"] | None = None
    tremer: TremorEntrada | None = None


class ExpressoesEntrada(BaseModel):
    x: ExpressaoEntrada | None = None
    y: ExpressaoEntrada | None = None
    escala: ExpressaoEntrada | None = None
    rotacao: ExpressaoEntrada | None = None
    opacidade: ExpressaoEntrada | None = None

    @model_validator(mode="after")
    def nos_limites(self):
        for nome, limite in LIMITES_TREMOR.items():
            expressao = getattr(self, nome)
            if expressao and expressao.tremer and abs(expressao.tremer.amplitude) > limite:
                raise ValueError(f"O tremido de {nome} passa do limite.")
        return self


class EfeitosVozEntrada(BaseModel):
    """Os limites são os de apps/web/src/lib/projeto/som.ts."""
    grave: float = Field(default=0, ge=-12, le=12, description="dB")
    medio: float = Field(default=0, ge=-12, le=12, description="dB")
    agudo: float = Field(default=0, ge=-12, le=12, description="dB")
    eco: float = Field(default=0, ge=0, le=0.8)
    reverb: float = Field(default=0, ge=0, le=1)
    # 1 liga o passa-altas de 80 Hz que tira o ronco
    ronco: float = Field(default=0, ge=0, le=1)


class EfeitoEntrada(BaseModel):
    """Os tipos são os de apps/web/src/lib/projeto/efeitos.ts."""
    tipo: Literal["desfoque", "brilho", "distorcao", "vhs", "glitch", "luz", "granulacao", "nitidez",
                  "clareza", "zoom", "giro", "pixelizar"]
    intensidade: float = Field(default=0.6, ge=0, le=1)


class AbaixamentoEntrada(BaseModel):
    """Abaixar na fala (apps/web/src/lib/projeto/abaixar.ts): o fator do volume, de 0 a 1, ao longo do clipe."""
    db: float = Field(ge=-40, le=0)
    pontos: list[KeyframeEntrada] = Field(min_length=1, max_length=4000)

    @model_validator(mode="after")
    def em_ordem_e_nos_limites(self):
        if any(b.t <= a.t for a, b in zip(self.pontos, self.pontos[1:], strict=False)):
            raise ValueError("Os pontos do abaixar na fala precisam estar em ordem.")
        if any(not 0 <= ponto.valor <= 1 for ponto in self.pontos):
            raise ValueError("Um ponto do abaixar na fala passa do limite.")
        return self


class NivelamentoEntrada(BaseModel):
    """Nivelar a voz (apps/web/src/lib/projeto/nivelar.ts): o fator do volume, até 12 dB para cima ou para baixo."""
    forca: float = Field(ge=0, le=1)
    pontos: list[KeyframeEntrada] = Field(min_length=1, max_length=4000)

    @model_validator(mode="after")
    def em_ordem_e_nos_limites(self):
        if any(b.t <= a.t for a, b in zip(self.pontos, self.pontos[1:], strict=False)):
            raise ValueError("Os pontos do nivelamento precisam estar em ordem.")
        if any(not 0.25 <= ponto.valor <= 4 for ponto in self.pontos):
            raise ValueError("Um ponto do nivelamento passa de 12 dB.")
        return self


class RecorteEntrada(BaseModel):
    x: float = Field(default=0, ge=0, lt=1)
    y: float = Field(default=0, ge=0, lt=1)
    largura: float = Field(default=1, ge=0.02, le=1)
    altura: float = Field(default=1, ge=0.02, le=1)

    @model_validator(mode="after")
    def dentro_da_midia(self):
        # Folga para o arredondamento do navegador (0.9 + 0.1 pode dar 1.0000000000000002)
        if self.x + self.largura > 1 + 1e-9 or self.y + self.altura > 1 + 1e-9:
            raise ValueError("O recorte passa da borda da mídia.")
        return self


COR = r"^#[0-9a-fA-F]{6}$"


class DestaqueEntrada(BaseModel):
    modo: Literal["karaoke", "palavra"] = "karaoke"
    cor: str = Field(default="#ffd400", pattern=COR)


# Os limites são os mesmos de apps/web/src/lib/projeto/texto.ts
FonteTexto = Literal["display", "texto", "manuscrita"]


class MarcaEntrada(BaseModel):
    """O kit de marca do espaço: até 6 cores, a fonte dos títulos e a dos textos e o logo."""
    cores: list[Annotated[str, Field(pattern=COR)]] = Field(default=[], max_length=6)
    fonte_titulo: FonteTexto = "display"
    fonte_texto: FonteTexto = "texto"
    logo_midia_id: str | None = None

    @field_validator("cores")
    @classmethod
    def cores_minusculas(cls, valor: list[str]) -> list[str]:
        return [cor.lower() for cor in valor]


class MarcaSaida(BaseModel):
    cores: list[str] = []
    fonte_titulo: str = "display"
    fonte_texto: str = "texto"
    logo_midia_id: str | None = None


class DegradeEntrada(BaseModel):
    """Degradê de preenchimento (core/utils/gradiente.py): de 2 a 5 cores, linear no ângulo ou radial."""
    tipo: Literal["linear", "radial"] = "linear"
    cores: list[Annotated[str, Field(pattern=COR)]] = Field(min_length=2, max_length=5)
    angulo: float = Field(default=0, ge=-360, le=360)
    meio: float = Field(default=0.5, ge=0.05, le=0.95)


class FormaEntrada(BaseModel):
    """Uma forma desenhada (core/utils/forma.py). Sem `cor`, ela é vazada e precisa de contorno."""
    tipo: Literal["retangulo", "arredondado", "elipse", "triangulo", "estrela", "seta", "linha", "balao", "coracao"]
    cor: str | None = Field(default="#ffffff", pattern=COR)
    contorno_cor: str = Field(default="#000000", pattern=COR)
    contorno: float = Field(default=0.0, ge=0, le=0.25, description="Espessura, em fração do lado menor da forma")
    proporcao: float | None = Field(default=None, ge=0.05, le=20, description="Largura sobre altura")
    # O preenchimento em degradê (core/utils/gradiente.py), no lugar da cor; a forma vazada não tem
    degrade: DegradeEntrada | None = None

    @field_validator("cor", "contorno_cor")
    @classmethod
    def minusculas(cls, valor):
        return valor.lower() if isinstance(valor, str) else valor

    @model_validator(mode="after")
    def vazada_com_contorno(self):
        if self.cor is None and self.contorno <= 0:
            raise ValueError("Uma forma vazada precisa de contorno.")
        return self


class ContornoExtraEntrada(BaseModel):
    cor: str = Field(pattern=COR)
    espessura: float = Field(ge=0, le=0.25, description="Fração do tamanho da letra")


class TextoEntrada(BaseModel):
    conteudo: str = Field(max_length=500)
    fonte: FonteTexto = "display"
    negrito: bool = True
    caixa_alta: bool = False
    tamanho: float = Field(default=0.07, ge=0.02, le=0.3, description="Fração do lado menor do quadro")
    cor: str = Field(default="#ffffff", pattern=COR)
    alinhamento: Literal["esquerda", "centro", "direita"] = "centro"
    contorno_cor: str = Field(default="#000000", pattern=COR)
    contorno_espessura: float = Field(default=0, ge=0, le=0.25, description="Fração do tamanho da letra")
    sombra: float = Field(default=0, ge=0, le=1)
    fundo_cor: str = Field(default="#000000", pattern=COR)
    fundo_opacidade: float = Field(default=0, ge=0, le=1)
    brilho: float = Field(default=0, ge=0, le=1)
    brilho_cor: str = Field(default="#ffffff", pattern=COR)
    destaque: DestaqueEntrada | None = None
    tempos: list[int] | None = Field(default=None, max_length=500, description="Começo de cada palavra, em ticks")
    # Palavras pintadas na cor_chave (números contados como em core/modelos/palavras_chave.py)
    palavras_chave: list[Annotated[int, Field(ge=0, le=500)]] | None = Field(default=None, max_length=60)
    cor_chave: str = Field(default="#ffd400", pattern=COR)
    # Espaço a mais entre as letras (fração do tamanho), altura da linha (vezes a letra), sublinhado e tachado
    espacamento: float = Field(default=0, ge=-0.1, le=1)
    entrelinha: float = Field(default=1.15, ge=0.7, le=3)
    sublinhado: bool = False
    tachado: bool = False
    # Sombra completa (core/utils/texto.py): cor, ângulo em graus e medidas em frações do tamanho da letra
    sombra_cor: str = Field(default="#000000", pattern=COR)
    sombra_angulo: float = Field(default=45, ge=-180, le=360)
    sombra_distancia: float = Field(default=0.06 * 2 ** 0.5, ge=0, le=0.5)
    sombra_desfoque: float = Field(default=0.08, ge=0, le=0.5)
    sombra_espalhar: float = Field(default=0, ge=0, le=1)
    brilho_tamanho: float = Field(default=1, ge=0.3, le=3)
    contornos: list[ContornoExtraEntrada] | None = Field(default=None, max_length=2)
    preenchimento: float = Field(default=1, ge=0, le=1)
    degrade: DegradeEntrada | None = None
    # Texto em arco, de -1 a 1 (core/utils/texto.py); não combina com o destaque da fala nem com o letra a letra
    curvatura: float = Field(default=0, ge=-1, le=1)

    @model_validator(mode="after")
    def arco_sem_destaque(self):
        if self.curvatura and self.destaque:
            raise ValueError("O texto em arco não tem o destaque da fala. "
                             "Volte a curvatura a zero para usar o destaque.")
        return self

    @model_validator(mode="after")
    def cabe_no_teto(self):
        # Medido no lado de referência; o render desenha no tamanho do vídeo, na mesma proporção
        if not texto_cabe(self.model_dump()):
            raise ValueError("O texto ficou grande demais. Quebre em linhas ou diminua o tamanho da letra.")
        return self


class AnimacaoEntrada(BaseModel):
    tipo: Literal["nenhuma", "aparecer", "subir", "descer", "deslizar", "zoom", "letras", "palavras"] = "nenhuma"
    duracao: int = Field(default=0, ge=0, description="Em ticks")


class LoopEntrada(BaseModel):
    """Os limites são os de apps/web/src/lib/projeto/animacao.ts."""
    tipo: Literal["nenhum", "pulsar", "balancar", "flutuar", "tremer"] = "nenhum"
    periodo: int = Field(default=TICKS_POR_SEGUNDO, gt=0, description="Em ticks")
    intensidade: float = Field(default=1, ge=0, le=3)


class AnimacoesEntrada(BaseModel):
    entrada: AnimacaoEntrada = Field(default_factory=AnimacaoEntrada)
    saida: AnimacaoEntrada = Field(default_factory=AnimacaoEntrada)
    loop: LoopEntrada | None = None


# Curva: de 2 a 16 pontos (x, y) de 0 a 1, com x crescendo
PontoDaCurva = tuple[float, float]


class CurvasEntrada(BaseModel):
    """As curvas de apps/web/src/lib/projeto/cor.ts: a geral (rgb) e uma por canal."""
    rgb: list[PontoDaCurva] = Field(default=[(0, 0), (1, 1)], min_length=2, max_length=16)
    r: list[PontoDaCurva] = Field(default=[(0, 0), (1, 1)], min_length=2, max_length=16)
    g: list[PontoDaCurva] = Field(default=[(0, 0), (1, 1)], min_length=2, max_length=16)
    b: list[PontoDaCurva] = Field(default=[(0, 0), (1, 1)], min_length=2, max_length=16)

    @model_validator(mode="after")
    def em_ordem_e_nos_limites(self):
        for nome in ("rgb", "r", "g", "b"):
            pontos = getattr(self, nome)
            if any(not (0 <= x <= 1 and 0 <= y <= 1) for x, y in pontos):
                raise ValueError("Os pontos da curva vão de 0 a 1.")
            if any(b[0] <= a[0] for a, b in zip(pontos, pontos[1:], strict=False)):
                raise ValueError("Os pontos da curva precisam estar em ordem, sem dois no mesmo lugar.")
        return self


FaixaDeMatiz = Literal["vermelho", "laranja", "amarelo", "verde", "ciano", "azul", "roxo", "magenta"]


class FaixaDeMatizEntrada(BaseModel):
    matiz: float = Field(default=0, ge=-1, le=1)
    saturacao: float = Field(default=0, ge=-1, le=1)
    luminancia: float = Field(default=0, ge=-1, le=1)


class ChaveEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=60)


class ChaveSaida(BaseModel):
    id: str
    nome: str
    inicio: str
    criado_em: datetime
    usado_em: datetime | None = None


class ChaveCriadaSaida(ChaveSaida):
    # A chave inteira: só nesta resposta
    chave: str


class LutDoClipeEntrada(BaseModel):
    """Uma LUT importada (/api/luts), antes dos ajustes, misturada ao original pela intensidade."""
    id: str = Field(min_length=24, max_length=24)
    intensidade: float = Field(default=1, ge=0, le=1)


class RecursoEntrada(BaseModel):
    # "degrade" (as paradas, em dados), "padrao" (o ladrilho, em imagem_png), "forma" (os caminhos de uma forma
    # personalizada, em dados.subcaminhos, numa caixa de 100 × 100) ou os estilos de caractere e de parágrafo do texto
    # do editor de imagem (em dados.estilo, conferido como o estilo de um trecho ou de um parágrafo), ou um estilo de
    # camada (em dados.estilo, conferido como o da camada, e o preenchimento em dados.preenchimento), ou um conjunto
    # de ações (em dados.acoes: cada uma com id, nome e os passos gravados, que são do editor e a API só guarda), ou
    # uma predefinição de ferramenta (em dados.ferramenta e dados.opcoes, as opções dela, que a API só guarda), ou
    # uma estratégia do Clipar (em dados.instrucoes, o que buscar e o estilo do título, e dados.faixa)
    tipo: Literal["degrade", "padrao", "forma", "estilo_caractere", "estilo_paragrafo", "estilo_camada", "acoes",
                  "ferramenta", "estrategia"]
    nome: str = Field(min_length=1, max_length=80)
    dados: dict = Field(default_factory=dict)
    imagem_png: str | None = Field(default=None, max_length=6_000_000)


class RecursoAtualizacao(BaseModel):
    """Só os conjuntos de ações mudam depois de criados (gravar mais passos, renomear)."""
    nome: str | None = Field(default=None, min_length=1, max_length=80)
    dados: dict | None = None


class RecursoSaida(BaseModel):
    id: str
    tipo: str
    nome: str
    dados: dict
    # O tamanho do ladrilho: {largura, altura}
    imagem: dict | None = None
    criado_em: datetime


class PincelEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    # "meus" (salvo pela pessoa) ou "importados" (de um arquivo .abr)
    pasta: Literal["meus", "importados"] = "meus"
    # As opções do pincel do editor (lib/pintura/traco.ts); a API só guarda
    opcoes: dict
    # A ponta em PNG (base64), quando o pincel tem uma própria
    ponta_png: str | None = Field(default=None, max_length=6_000_000)


class PincelSaida(BaseModel):
    id: str
    nome: str
    pasta: str
    opcoes: dict
    tem_ponta: bool
    # O tamanho da ponta própria: {largura, altura}
    ponta: dict | None = None
    criado_em: datetime


class LutSaida(BaseModel):
    id: str
    nome: str
    tamanho: int
    minimo: list[float]
    maximo: list[float]
    criado_em: datetime


class CorEntrada(BaseModel):
    """Os limites são os de apps/web/src/lib/projeto/cor.ts."""
    temperatura: float = Field(default=0, ge=-1, le=1)
    tom: float = Field(default=0, ge=-1, le=1)
    exposicao: float = Field(default=0, ge=-2, le=2)
    contraste: float = Field(default=0, ge=-1, le=1)
    realces: float = Field(default=0, ge=-1, le=1)
    sombras: float = Field(default=0, ge=-1, le=1)
    saturacao: float = Field(default=0, ge=-1, le=1)
    vinheta: float = Field(default=0, ge=0, le=1)
    # Rodas de cor: matiz em graus e força de escuros, meios-tons e claros
    matiz_escuros: float = Field(default=0, ge=0, le=360)
    forca_escuros: float = Field(default=0, ge=0, le=1)
    matiz_medios: float = Field(default=0, ge=0, le=360)
    forca_medios: float = Field(default=0, ge=0, le=1)
    matiz_claros: float = Field(default=0, ge=0, le=360)
    forca_claros: float = Field(default=0, ge=0, le=1)
    vibracao: float = Field(default=0, ge=-1, le=1)
    brancos: float = Field(default=0, ge=-1, le=1)
    pretos: float = Field(default=0, ge=-1, le=1)
    # Níveis: o preto e o branco de entrada (o branco conta de 1 para baixo) e a gama em potência de 2
    niveis_preto: float = Field(default=0, ge=0, le=0.45)
    niveis_branco: float = Field(default=0, ge=0, le=0.45)
    niveis_gama: float = Field(default=0, ge=-1, le=1)
    nevoa: float = Field(default=0, ge=-1, le=1)
    # Cor por matiz (core/utils/cor.py, aplicar_hsl): só as faixas mexidas
    hsl: dict[FaixaDeMatiz, FaixaDeMatizEntrada] | None = None
    filtro: Literal["quente", "frio", "vivido", "suave", "pb", "noite", "antigo", "drama", "cinema"] | None = None
    intensidade: float = Field(default=1, ge=0, le=2)
    curvas: CurvasEntrada | None = None
    lut: LutDoClipeEntrada | None = None


class MascaraEntrada(BaseModel):
    """Máscara de forma: os limites são os de apps/web/src/lib/projeto/modelo.ts (LIMITES_DA_MASCARA). No desenho, os
    pontos do polígono em frações do clipe (de 3 a 32)."""
    forma: Literal["retangulo", "elipse", "desenho"]
    pontos: list[tuple[float, float]] | None = Field(default=None, max_length=32)
    x: float = Field(default=0.5, ge=-0.5, le=1.5)
    y: float = Field(default=0.5, ge=-0.5, le=1.5)
    largura: float = Field(default=0.7, ge=0.02, le=2)
    altura: float = Field(default=0.7, ge=0.02, le=2)
    suavidade: float = Field(default=0.08, ge=0, le=0.5)
    inverter: bool = False

    @model_validator(mode="after")
    def _conferir_desenho(self):
        if self.forma == "desenho":
            if not self.pontos or len(self.pontos) < 3:
                raise ValueError("O desenho da máscara precisa de pelo menos 3 pontos.")
            if any(not (-0.5 <= x <= 1.5 and -0.5 <= y <= 1.5) for x, y in self.pontos):
                raise ValueError("Um ponto do desenho ficou longe demais do clipe.")
        return self


class ChromaEntrada(BaseModel):
    """Tela verde: os limites são os de apps/web/src/lib/projeto/edicao.ts (chromaClipes)."""
    cor: str = Field(default="#00ff00", pattern=COR)
    semelhanca: float = Field(default=0.3, ge=0.001, le=1)
    suavidade: float = Field(default=0.1, ge=0, le=1)


class TransicaoEntrada(BaseModel):
    tipo: Literal["fusao", "escurecer", "deslizar", "empurrar", "zoom", "relogio", "iris", "losango", "persianas",
                  "diagonal", "blocos", "zoom_desfoque",
                  "cortina_direita", "cortina_esquerda", "cortina_baixo", "cortina_cima", "desfoque"]
    duracao: int = Field(gt=0, description="Em ticks")
    # Os dois sons se cruzam na janela da transição (lib/projeto/transicao.ts, janelasDoSom)
    misturar_som: bool = False


class FluidoEntrada(BaseModel):
    """O trecho da câmera lenta suave, em segundos da mídia (alinhados aos quadros da fonte pelo editor)."""
    de: float = Field(ge=0, le=6 * 3600)
    ate: float = Field(gt=0, le=6 * 3600)

    @model_validator(mode="after")
    def trecho_curto(self):
        if self.ate <= self.de or self.ate - self.de > 120:
            raise ValueError("A câmera lenta suave vale para trechos de até 2 minutos.")
        return self


class PixelsDoClipe(BaseModel):
    versao: int = Field(ge=0, le=9_999_999)


class MascaraDePixelsEntrada(BaseModel):
    """A máscara de camada pintável do editor de imagem (apps/web/src/lib/projeto/mascaraDePixels.ts)."""
    midia_id: str
    versao: int = Field(ge=1, le=9_999_999)
    ligada: bool = True
    vinculada: bool = True
    densidade: float = Field(default=1, ge=0, le=1)
    difusao: float = Field(default=0, ge=0, le=1000)
    # A posição na camada (0 a 1) → o ponto na máscara (0 a 1)
    matriz: list[float] = Field(min_length=6, max_length=6)


LIMITE_DO_VETOR = 1_000_000
Coordenada = Annotated[float, Field(ge=-LIMITE_DO_VETOR, le=LIMITE_DO_VETOR)]


class NoDoCaminho(BaseModel):
    """Um nó do caminho (apps/web/src/lib/vetor/modelo.ts): a âncora e as alças absolutas, que podem faltar."""
    x: Coordenada
    y: Coordenada
    ex: Coordenada | None = None
    ey: Coordenada | None = None
    sx: Coordenada | None = None
    sy: Coordenada | None = None

    @model_serializer(mode="wrap")
    def _sem_alcas_vazias(self, serializar):
        return {chave: valor for chave, valor in serializar(self).items() if valor is not None}


class SubcaminhoEntrada(BaseModel):
    nos: list[NoDoCaminho] = Field(min_length=1, max_length=5000)
    fechado: bool = False
    operacao: Literal["somar", "subtrair", "intersectar", "excluir"] = "somar"


class ParadaDeCorEntrada(BaseModel):
    posicao: float = Field(ge=0, le=1)
    cor: str = Field(pattern=COR)
    meio: float = Field(default=0.5, ge=0, le=1)


class ParadaDeOpacidadeEntrada(BaseModel):
    posicao: float = Field(ge=0, le=1)
    opacidade: float = Field(ge=0, le=1)
    meio: float = Field(default=0.5, ge=0, le=1)


class DegradeDoEditorEntrada(BaseModel):
    """Um degradê do editor de imagem (apps/web/src/lib/pintura/degrade.ts), já com as cores resolvidas."""
    nome: str = Field(default="", max_length=80)
    tipo: Literal["solido", "ruido"] = "solido"
    cores: list[ParadaDeCorEntrada] = Field(min_length=1, max_length=64)
    opacidades: list[ParadaDeOpacidadeEntrada] = Field(min_length=1, max_length=64)
    suavidade: float = Field(default=1, ge=0, le=1)
    aspereza: float = Field(default=0.5, ge=0, le=1)
    semente: int = Field(default=1, ge=0, le=2**31)


class PontoDaMalhaEntrada(BaseModel):
    """Um ponto da malha de degradê: o lugar (em frações da caixa da forma) e a cor."""
    x: float = Field(ge=-1, le=2)
    y: float = Field(ge=-1, le=2)
    cor: str = Field(pattern=COR)


class TintaDaFormaEntrada(BaseModel):
    """A tinta do preenchimento ou do traço de uma forma: nenhuma, uma cor, um degradê, um padrão, a foto de um quadro
    (a mídia, cobrindo ou cabendo, com o zoom e o deslocamento do meio) ou a malha de degradê (os pontos em linhas e
    colunas, cada um com a cor)."""
    tipo: Literal["nenhuma", "cor", "degrade", "padrao", "imagem", "malha"]
    cor: str | None = Field(default=None, pattern=COR)
    degrade: DegradeDoEditorEntrada | None = None
    forma: Literal["linear", "radial", "angulo", "refletido", "losango"] | None = None
    angulo: float | None = Field(default=None, ge=-360, le=360)
    escala: float | None = Field(default=None, ge=0.01, le=20)
    inverter: bool | None = None
    padrao: str | None = Field(default=None, min_length=1, max_length=60)
    midia_id: str | None = Field(default=None, min_length=24, max_length=24)
    ajuste: Literal["cobrir", "conter"] | None = None
    x: float | None = Field(default=None, ge=-10, le=10)
    y: float | None = Field(default=None, ge=-10, le=10)
    linhas: int | None = Field(default=None, ge=1, le=20)
    colunas: int | None = Field(default=None, ge=1, le=20)
    pontos: list[PontoDaMalhaEntrada] | None = Field(default=None, max_length=441)

    @model_serializer(mode="wrap")
    def _sem_vazios(self, serializar):
        return {chave: valor for chave, valor in serializar(self).items() if valor is not None}

    @model_validator(mode="after")
    def _completa(self):
        if self.tipo == "malha" and not (self.linhas and self.colunas and self.pontos
                                         and len(self.pontos) == (self.linhas + 1) * (self.colunas + 1)):
            raise ValueError("A malha de degradê precisa de um ponto em cada cruzamento das linhas e colunas.")
        faltando = (self.tipo == "cor" and not self.cor) or (self.tipo == "padrao" and not self.padrao) or (
            self.tipo == "degrade" and not (self.degrade and self.forma and self.angulo is not None
                                            and self.escala is not None)) or (
            self.tipo == "imagem" and not (self.midia_id and self.ajuste and self.escala is not None
                                           and self.x is not None and self.y is not None))
        if faltando:
            raise ValueError("A tinta da forma está incompleta.")
        return self


class PontoDeLarguraEntrada(BaseModel):
    """Um ponto da largura variável do traço (apps/web/src/lib/vetor/largura.ts)."""
    t: float = Field(ge=0, le=1)
    esquerda: float = Field(ge=0, le=20)
    direita: float = Field(ge=0, le=20)


class TracoDaFormaEntrada(BaseModel):
    tinta: TintaDaFormaEntrada
    largura: float = Field(ge=0, le=1000)
    alinhamento: Literal["dentro", "centro", "fora"] = "dentro"
    tipo: Literal["solido", "tracejado", "pontilhado"] = "solido"
    pontas: Literal["reta", "redonda", "quadrada"] = "reta"
    cantos: Literal["vivo", "redondo", "chanfrado"] = "vivo"
    mitra: float = Field(default=4, ge=1, le=100)
    perfil: list[PontoDeLarguraEntrada] | None = Field(default=None, max_length=100)

    @model_serializer(mode="wrap")
    def _sem_vazios(self, serializar):
        # Sem o perfil, o traço volta como era antes da largura variável
        return {chave: valor for chave, valor in serializar(self).items() if valor is not None or chave != "perfil"}


class FormaVivaEntrada(BaseModel):
    """As medidas de uma forma viva; os campos que valem dependem do tipo (lib/vetor/modelo.ts, FormaViva)."""
    tipo: Literal["retangulo", "elipse", "triangulo", "poligono", "linha"]
    largura: Coordenada | None = None
    altura: Coordenada | None = None
    raios: list[Annotated[float, Field(ge=0, le=LIMITE_DO_VETOR)]] | None = Field(default=None, min_length=4,
                                                                                  max_length=4)
    raio: float | None = Field(default=None, ge=0, le=LIMITE_DO_VETOR)
    lados: int | None = Field(default=None, ge=3, le=100)
    estrela: float | None = Field(default=None, ge=0, le=0.99)
    comprimento: float | None = Field(default=None, ge=0, le=LIMITE_DO_VETOR)
    angulo: float | None = Field(default=None, ge=-360, le=360)
    # Os nomes são os do editor
    setaInicio: bool | None = None  # noqa: N815
    setaFim: bool | None = None  # noqa: N815
    tamanhoDaSeta: float | None = Field(default=None, ge=0, le=50)  # noqa: N815

    @model_serializer(mode="wrap")
    def _sem_vazios(self, serializar):
        return {chave: valor for chave, valor in serializar(self).items() if valor is not None}


class TamanhoDoVetor(BaseModel):
    largura: float = Field(gt=0, le=65536)
    altura: float = Field(gt=0, le=65536)


class VetorEntrada(BaseModel):
    """A camada vetorial do editor de imagem (lib/vetor/modelo.ts): caminhos combinados, preenchimento e traço."""
    caixa: TamanhoDoVetor
    subcaminhos: list[SubcaminhoEntrada] = Field(max_length=1000)
    preenchimento: TintaDaFormaEntrada
    traco: TracoDaFormaEntrada | None = None
    forma: FormaVivaEntrada | None = None
    margem: float | None = Field(default=None, ge=0, le=LIMITE_DO_VETOR)
    # Um quadro (ferramenta Quadro): o preenchimento é a foto dele
    quadro: bool | None = None

    @model_serializer(mode="wrap")
    def _sem_vazios(self, serializar):
        return {chave: valor for chave, valor in serializar(self).items() if valor is not None or chave == "traco"}

    @model_validator(mode="after")
    def _nos_no_limite(self):
        if sum(len(sub.nos) for sub in self.subcaminhos) > 20_000:
            raise ValueError("A forma pode ter no máximo 20 mil pontos.")
        return self


class MascaraVetorialEntrada(BaseModel):
    """A máscara vetorial de uma camada (apps/web/src/lib/vetor/mascaraVetorial.ts), no espaço da máscara."""
    subcaminhos: list[SubcaminhoEntrada] = Field(max_length=1000)
    base: Literal["revelar", "ocultar"] = "revelar"
    ligada: bool = True
    vinculada: bool = True
    densidade: float = Field(default=1, ge=0, le=1)
    difusao: float = Field(default=0, ge=0, le=1000)
    # A posição na camada (0 a 1) → o ponto na máscara (0 a 1)
    matriz: list[float] = Field(min_length=6, max_length=6)

    @model_validator(mode="after")
    def _nos_no_limite(self):
        if sum(len(sub.nos) for sub in self.subcaminhos) > 20_000:
            raise ValueError("A máscara vetorial pode ter no máximo 20 mil pontos.")
        return self


class FundoDaPrancheta(BaseModel):
    cor: str = Field(default="#ffffff", pattern=COR)
    transparente: bool = False


class PranchetaEntrada(BaseModel):
    """Uma prancheta do editor de imagem (numa pasta da raiz): o tamanho em pixels do documento e o fundo; o meio é o
    da transformação do clipe."""
    largura: float = Field(ge=1, le=8192)
    altura: float = Field(ge=1, le=8192)
    fundo: FundoDaPrancheta = Field(default_factory=FundoDaPrancheta)


class SoOQueVeio(BaseModel):
    """Guarda só os campos que vieram (um null que veio fica): o estilo de um trecho é só o que muda do de base."""

    @model_serializer(mode="wrap")
    def _so_o_que_veio(self, serializar):
        return {chave: valor for chave, valor in serializar(self).items() if chave in self.model_fields_set}


class EstiloDoCaractereEntrada(SoOQueVeio):
    """O estilo de um trecho do texto do editor de imagem (apps/web/src/lib/texto/modelo.ts), com os nomes de lá."""
    familia: str | None = Field(default=None, min_length=1, max_length=60)
    peso: int | None = Field(default=None, ge=1, le=1000)
    italico: bool | None = None
    tamanho: float | None = Field(default=None, gt=0, le=5000)
    cor: str | None = Field(default=None, pattern=COR)
    entrelinha: float | None = Field(default=None, ge=0, le=20000)
    tracking: float | None = Field(default=None, ge=-1000, le=10000)
    kerning: Literal["metrica", "optico", "nenhum"] | None = None
    kern: float | None = Field(default=None, ge=-1000, le=1000)
    escalaH: float | None = Field(default=None, ge=0.01, le=10)  # noqa: N815
    escalaV: float | None = Field(default=None, ge=0.01, le=10)  # noqa: N815
    linhaDeBase: float | None = Field(default=None, ge=-10000, le=10000)  # noqa: N815
    giro: float | None = Field(default=None, ge=-360, le=360)
    deslocamento: float | None = Field(default=None, ge=-10000, le=10000)
    negritoFalso: bool | None = None  # noqa: N815
    italicoFalso: bool | None = None  # noqa: N815
    caixa: Literal["normal", "maiusculas", "versalete"] | None = None
    posicao: Literal["normal", "sobrescrito", "subscrito"] | None = None
    sublinhado: bool | None = None
    tachado: bool | None = None
    ligaduras: bool | None = None
    alternativos: bool | None = None
    fracoes: bool | None = None
    ordinais: bool | None = None
    eixos: dict[Annotated[str, Field(min_length=4, max_length=4)], float] | None = Field(default=None, max_length=16)
    suavizacao: Literal["nenhuma", "nitida", "forte", "suave"] | None = None


class EstiloDoParagrafoEntrada(SoOQueVeio):
    alinhamento: Literal["esquerda", "centro", "direita", "justificado-esquerda", "justificado-centro",
                         "justificado-direita", "justificado"] | None = None
    recuoInicio: float | None = Field(default=None, ge=-10000, le=10000)  # noqa: N815
    recuoFim: float | None = Field(default=None, ge=-10000, le=10000)  # noqa: N815
    recuoPrimeira: float | None = Field(default=None, ge=-10000, le=10000)  # noqa: N815
    espacoAntes: float | None = Field(default=None, ge=-10000, le=10000)  # noqa: N815
    espacoDepois: float | None = Field(default=None, ge=-10000, le=10000)  # noqa: N815
    hifenizar: bool | None = None


class TrechoEntrada(BaseModel):
    texto: str = Field(max_length=20000)
    estilo: EstiloDoCaractereEntrada = Field(default_factory=EstiloDoCaractereEntrada)


class ParagrafoRicoEntrada(BaseModel):
    trechos: list[TrechoEntrada] = Field(min_length=1, max_length=2000)
    estilo: EstiloDoParagrafoEntrada = Field(default_factory=EstiloDoParagrafoEntrada)


class PontoEntrada(BaseModel):
    x: float = Field(ge=-LIMITE_DO_VETOR, le=LIMITE_DO_VETOR)
    y: float = Field(ge=-LIMITE_DO_VETOR, le=LIMITE_DO_VETOR)


# ——— Estilos de camada do editor de imagem (apps/web/src/lib/imagem/estiloDeCamada.ts, ADR 0003, onda 13.9) ———

MesclagemDoEfeito = Literal["normal", "multiplicar", "tela", "somar", "escurecer", "clarear", "sobrepor", "luz_forte",
                            "diferenca", "exclusao", "dissolver", "superexposicao_cores", "superexposicao_linear",
                            "cor_mais_escura", "subexposicao_cores", "cor_mais_clara", "luz_suave", "luz_brilhante",
                            "luz_linear", "luz_do_pino", "mistura_solida", "subtrair", "dividir", "matiz", "saturacao",
                            "cor", "luminosidade"]


class PontoDoContornoEntrada(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    canto: bool = False


class ContornoDoEfeitoEntrada(BaseModel):
    """A curva de contorno de um efeito (o que a borda dele faz): de 2 a 32 pontos, da esquerda para a direita."""
    nome: str = Field(default="", max_length=60)
    pontos: list[PontoDoContornoEntrada] = Field(min_length=2, max_length=32)

    @model_validator(mode="after")
    def _em_ordem(self):
        if any(b.x < a.x for a, b in zip(self.pontos, self.pontos[1:], strict=False)):
            raise ValueError("Os pontos do contorno vão da esquerda para a direita.")
        return self


class TexturaDoChanfroEntrada(BaseModel):
    padrao: str = Field(min_length=1, max_length=60)
    escala: float = Field(default=1, ge=0.01, le=10)
    profundidade: float = Field(default=1, ge=-10, le=10)
    inverter: bool = False


class EfeitoDeCamadaEntrada(SoOQueVeio):
    """Um efeito do estilo de camada; cada tipo usa os campos dele (os outros ficam de fora)."""
    tipo: Literal["sombra", "sombra_interna", "brilho_externo", "brilho_interno", "chanfro", "cetim",
                  "sobreposicao_cor", "sobreposicao_degrade", "sobreposicao_padrao", "tracado"]
    id: str = Field(min_length=1, max_length=40)
    ligado: bool = True
    modo: MesclagemDoEfeito = "normal"
    opacidade: float = Field(default=1, ge=0, le=1)
    cor: str | None = Field(default=None, pattern=COR)
    tinta: TintaDaFormaEntrada | None = None
    angulo: float | None = Field(default=None, ge=-360, le=360)
    luz_global: bool | None = None
    distancia: float | None = Field(default=None, ge=0, le=30000)
    espalhar: float | None = Field(default=None, ge=0, le=1)
    tamanho: float | None = Field(default=None, ge=0, le=2500)
    ruido: float | None = Field(default=None, ge=0, le=1)
    contorno: ContornoDoEfeitoEntrada | None = None
    suavizar: bool | None = None
    vazar: bool | None = None
    tecnica: Literal["suave", "preciso", "cinzel_duro", "cinzel_suave"] | None = None
    origem: Literal["centro", "borda"] | None = None
    intervalo: float | None = Field(default=None, ge=0.01, le=1)
    variacao: float | None = Field(default=None, ge=0, le=1)
    posicao: Literal["fora", "dentro", "centro"] | None = None
    estilo: Literal["externo", "interno", "entalhe", "almofada", "tracado"] | None = None
    profundidade: float | None = Field(default=None, ge=0.01, le=10)
    direcao: Literal["cima", "baixo"] | None = None
    suavidade: float | None = Field(default=None, ge=0, le=250)
    altitude: float | None = Field(default=None, ge=0, le=90)
    contorno_brilho: ContornoDoEfeitoEntrada | None = None
    modo_realce: MesclagemDoEfeito | None = None
    cor_realce: str | None = Field(default=None, pattern=COR)
    opacidade_realce: float | None = Field(default=None, ge=0, le=1)
    modo_sombra: MesclagemDoEfeito | None = None
    cor_sombra: str | None = Field(default=None, pattern=COR)
    opacidade_sombra: float | None = Field(default=None, ge=0, le=1)
    contorno_chanfro: ContornoDoEfeitoEntrada | None = None
    intervalo_chanfro: float | None = Field(default=None, ge=0.01, le=1)
    textura: TexturaDoChanfroEntrada | None = None
    inverter: bool | None = None
    escala: float | None = Field(default=None, ge=0.01, le=10)
    alinhar: bool | None = None
    deslocamento: PontoEntrada | None = None


class MesclarSeEntrada(BaseModel):
    """Opções de mesclagem › Mesclar se: o canal e as faixas (com as metades) desta camada e da de baixo, de 0 a 255."""
    canal: Literal["cinza", "vermelho", "verde", "azul"] = "cinza"
    esta: list[float] = Field(default=[0, 0, 255, 255], min_length=4, max_length=4)
    abaixo: list[float] = Field(default=[0, 0, 255, 255], min_length=4, max_length=4)

    @model_validator(mode="after")
    def _faixas(self):
        for faixa in (self.esta, self.abaixo):
            if any(not 0 <= v <= 255 for v in faixa) or not (faixa[0] <= faixa[1] <= faixa[2] <= faixa[3]):
                raise ValueError("As faixas do Mesclar se vão de 0 a 255, em ordem.")
        return self


class CanaisDaMesclagemEntrada(BaseModel):
    vermelho: bool = True
    verde: bool = True
    azul: bool = True


class EstiloDeCamadaEntrada(SoOQueVeio):
    """O estilo de camada: os efeitos (na ordem do painel; vários do mesmo tipo valem) e as opções de mesclagem."""
    efeitos: list[EfeitoDeCamadaEntrada] = Field(default=[], max_length=40)
    ligado: bool = True
    escala: float = Field(default=1, ge=0.01, le=10)
    internos_como_grupo: bool = False
    recortadas_como_grupo: bool = True
    mascara_esconde_efeitos: bool = False
    vazamento: Literal["nenhum", "raso", "profundo"] = "nenhum"
    canais: CanaisDaMesclagemEntrada | None = None
    mesclar_se: MesclarSeEntrada | None = None


class NiveisDoCanalEntrada(BaseModel):
    preto: float = Field(default=0, ge=0, le=253)
    branco: float = Field(default=255, ge=2, le=255)
    gama: float = Field(default=1, ge=0.1, le=9.99)
    saida_preto: float = Field(default=0, ge=0, le=255)
    saida_branco: float = Field(default=255, ge=0, le=255)

    @model_validator(mode="after")
    def _ordem(self):
        if self.branco <= self.preto:
            raise ValueError("Nos níveis, o branco de entrada fica acima do preto.")
        return self


class CurvaDoAjusteEntrada(BaseModel):
    pontos: list[tuple[float, float]] = Field(min_length=2, max_length=16)
    lapis: list[float] | None = Field(default=None, min_length=256, max_length=256)

    @model_validator(mode="after")
    def _pontos(self):
        fora = any(not (0 <= x <= 1 and 0 <= y <= 1) for x, y in self.pontos)
        if fora or (self.lapis and any(not 0 <= v <= 1 for v in self.lapis)):
            raise ValueError("Os pontos da curva vão de 0 a 1.")
        if any(b[0] <= a[0] for a, b in zip(self.pontos, self.pontos[1:], strict=False)):
            raise ValueError("Os pontos da curva vão da esquerda para a direita.")
        return self


class TomHslEntrada(BaseModel):
    matiz: float = Field(default=0, ge=-360, le=360)
    saturacao: float = Field(default=0, ge=-100, le=100)
    luminosidade: float = Field(default=0, ge=-100, le=100)


class FaixaDoMatizEntrada(TomHslEntrada):
    limites: tuple[float, float, float, float]

    @model_validator(mode="after")
    def _limites(self):
        if any(not 0 <= v <= 360 for v in self.limites):
            raise ValueError("Os limites de uma faixa de cor vão de 0 a 360 graus.")
        return self


class TonsDoEquilibrioEntrada(BaseModel):
    ciano_vermelho: float = Field(default=0, ge=-100, le=100)
    magenta_verde: float = Field(default=0, ge=-100, le=100)
    amarelo_azul: float = Field(default=0, ge=-100, le=100)


class LinhaDoMixerEntrada(BaseModel):
    r: float = Field(default=0, ge=-200, le=200)
    g: float = Field(default=0, ge=-200, le=200)
    b: float = Field(default=0, ge=-200, le=200)
    constante: float = Field(default=0, ge=-200, le=200)


class TintasEntrada(BaseModel):
    ciano: float = Field(default=0, ge=-100, le=100)
    magenta: float = Field(default=0, ge=-100, le=100)
    amarelo: float = Field(default=0, ge=-100, le=100)
    preto: float = Field(default=0, ge=-100, le=100)


class PesosDoPretoBrancoEntrada(BaseModel):
    vermelhos: float = Field(default=40, ge=-200, le=300)
    amarelos: float = Field(default=60, ge=-200, le=300)
    verdes: float = Field(default=40, ge=-200, le=300)
    cianos: float = Field(default=60, ge=-200, le=300)
    azuis: float = Field(default=20, ge=-200, le=300)
    magentas: float = Field(default=80, ge=-200, le=300)


class ParadaDoMapaEntrada(BaseModel):
    posicao: float = Field(ge=0, le=1)
    cor: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


_CanalDoAjuste = Literal["rgb", "r", "g", "b"]
_FaixaDoMatiz = Literal["vermelhos", "amarelos", "verdes", "cianos", "azuis", "magentas"]
_CorDaSeletiva = Literal["vermelhos", "amarelos", "verdes", "cianos", "azuis", "magentas", "brancos", "neutros",
                         "pretos"]


class _BrilhoContraste(BaseModel):
    tipo: Literal["brilho_contraste"]
    brilho: float = Field(default=0, ge=-150, le=150)
    contraste: float = Field(default=0, ge=-50, le=100)
    antigo: bool = False


class _Niveis(BaseModel):
    tipo: Literal["niveis"]
    canais: dict[_CanalDoAjuste, NiveisDoCanalEntrada] = Field(default_factory=dict)


class _Curvas(BaseModel):
    tipo: Literal["curvas"]
    canais: dict[_CanalDoAjuste, CurvaDoAjusteEntrada] = Field(default_factory=dict)


class _Exposicao(BaseModel):
    tipo: Literal["exposicao"]
    exposicao: float = Field(default=0, ge=-20, le=20)
    deslocamento: float = Field(default=0, ge=-0.5, le=0.5)
    gama: float = Field(default=1, ge=0.01, le=9.99)


class _Vibracao(BaseModel):
    tipo: Literal["vibracao"]
    vibracao: float = Field(default=0, ge=-100, le=100)
    saturacao: float = Field(default=0, ge=-100, le=100)


class _MatizSaturacao(BaseModel):
    tipo: Literal["matiz_saturacao"]
    mestre: TomHslEntrada = Field(default_factory=TomHslEntrada)
    faixas: dict[_FaixaDoMatiz, FaixaDoMatizEntrada] = Field(default_factory=dict)
    colorir: bool = False
    cor_colorir: TomHslEntrada = Field(default_factory=TomHslEntrada)


class _Equilibrio(BaseModel):
    tipo: Literal["equilibrio"]
    sombras: TonsDoEquilibrioEntrada = Field(default_factory=TonsDoEquilibrioEntrada)
    meios: TonsDoEquilibrioEntrada = Field(default_factory=TonsDoEquilibrioEntrada)
    realces: TonsDoEquilibrioEntrada = Field(default_factory=TonsDoEquilibrioEntrada)
    preservar: bool = True


class _PretoBranco(BaseModel):
    tipo: Literal["preto_branco"]
    pesos: PesosDoPretoBrancoEntrada = Field(default_factory=PesosDoPretoBrancoEntrada)
    tonalizar: bool = False
    matiz: float = Field(default=42, ge=0, le=360)
    saturacao: float = Field(default=20, ge=0, le=100)


class _FiltroDeFotos(BaseModel):
    tipo: Literal["filtro_de_fotos"]
    cor: str = Field(default="#ec8a00", pattern=r"^#[0-9a-fA-F]{6}$")
    densidade: float = Field(default=25, ge=0, le=100)
    preservar: bool = True


class _Mixer(BaseModel):
    tipo: Literal["mixer"]
    monocromatico: bool = False
    vermelho: LinhaDoMixerEntrada = Field(default_factory=lambda: LinhaDoMixerEntrada(r=100))
    verde: LinhaDoMixerEntrada = Field(default_factory=lambda: LinhaDoMixerEntrada(g=100))
    azul: LinhaDoMixerEntrada = Field(default_factory=lambda: LinhaDoMixerEntrada(b=100))
    cinza: LinhaDoMixerEntrada = Field(default_factory=lambda: LinhaDoMixerEntrada(r=40, g=40, b=20))


class LutDoAjusteEntrada(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    intensidade: float = Field(default=1, ge=0, le=1)


class _Pesquisa(BaseModel):
    tipo: Literal["pesquisa"]
    lut: LutDoAjusteEntrada | None = None


class _Inverter(BaseModel):
    tipo: Literal["inverter"]


class _Posterizar(BaseModel):
    tipo: Literal["posterizar"]
    niveis: int = Field(default=4, ge=2, le=255)


class _Limiar(BaseModel):
    tipo: Literal["limiar"]
    nivel: int = Field(default=128, ge=1, le=255)


class _MapaDeDegrade(BaseModel):
    tipo: Literal["mapa_degrade"]
    cores: list[ParadaDoMapaEntrada] = Field(min_length=1, max_length=32)
    inverter: bool = False


class _CorSeletiva(BaseModel):
    tipo: Literal["cor_seletiva"]
    absoluto: bool = False
    cores: dict[_CorDaSeletiva, TintasEntrada] = Field(default_factory=dict)


# Os ajustes da camada de ajuste do editor de imagem (lib/imagem/ajustes.ts); os limites são os dos painéis de lá
AjusteDaImagemEntrada = Annotated[
    _BrilhoContraste | _Niveis | _Curvas | _Exposicao | _Vibracao | _MatizSaturacao | _Equilibrio | _PretoBranco
    | _FiltroDeFotos | _Mixer | _Pesquisa | _Inverter | _Posterizar | _Limiar | _MapaDeDegrade | _CorSeletiva,
    Field(discriminator="tipo"),
]


class FiltroInteligenteEntrada(BaseModel):
    """
    Um filtro da pilha de filtros inteligentes de uma camada do editor de imagem (lib/imagem/filtros): o tipo, as
    opções (números, ligados e textos curtos, como as cores) e a mesclagem dele com o que chega.
    """
    id: str = Field(min_length=1, max_length=40)
    tipo: str = Field(pattern=r"^[a-z][a-z0-9_]{1,40}$")
    opcoes: dict[str, float | bool | str] = Field(default_factory=dict)
    ligado: bool = True
    modo: MesclagemDoEfeito = "normal"
    opacidade: float = Field(default=1, ge=0, le=1)

    @model_validator(mode="after")
    def _opcoes(self):
        if len(self.opcoes) > 80:
            raise ValueError("Um filtro tem no máximo 80 opções.")
        for chave, valor in self.opcoes.items():
            if len(chave) > 40 or (isinstance(valor, str) and len(valor) > 400):
                raise ValueError("Uma opção de filtro passou do tamanho.")
            if isinstance(valor, float) and not -1_000_000 <= valor <= 1_000_000:
                raise ValueError("Uma opção de filtro está fora dos limites.")
        return self


class FiltrosInteligentesEntrada(BaseModel):
    """A pilha de filtros inteligentes de uma camada (de baixo para cima, na ordem em que valem) e a máscara dela."""
    filtros: list[FiltroInteligenteEntrada] = Field(default_factory=list, max_length=30)
    ligado: bool = True
    mascara: MascaraDePixelsEntrada | None = None


class GeracaoDoClipeEntrada(BaseModel):
    """O preenchimento generativo de onde a camada veio: o texto pedido e as variações (mídias), para trocar."""
    descricao: str = Field(default="", max_length=800)
    variacoes: list[Annotated[str, Field(pattern=r"^[0-9a-f]{24}$")]] = Field(default_factory=list, max_length=12)


class MaisVariacoesEntrada(BaseModel):
    variacoes: int = Field(default=3, ge=1, le=3)


class PontoNoDocumentoEntrada(BaseModel):
    """Um ponto em frações do documento (pode sair dele: a alça do degradê arrastada para fora)."""
    x: float = Field(ge=-10, le=10)
    y: float = Field(ge=-10, le=10)


class CamadaDePreenchimentoEntrada(BaseModel):
    """
    Camada de preenchimento (editor de imagem): cobre o documento com uma cor, um degradê ou um padrão; no degradê,
    o começo e o fim das alças, em frações do documento.
    """
    tinta: TintaDaFormaEntrada
    de: PontoNoDocumentoEntrada | None = None
    ate: PontoNoDocumentoEntrada | None = None

    @model_validator(mode="after")
    def _tinta(self):
        if self.tinta.tipo not in ("cor", "degrade", "padrao"):
            raise ValueError("A camada de preenchimento é de cor, degradê ou padrão.")
        return self


class InformacoesDoArquivoEntrada(BaseModel):
    """Arquivo › Informações do arquivo (editor de imagem): o que vai nos metadados dos arquivos exportados."""
    titulo: str = Field(default="", max_length=200)
    autor: str = Field(default="", max_length=200)
    descricao: str = Field(default="", max_length=2000)
    palavras_chave: list[str] = Field(default=[], max_length=50)
    direitos: str = Field(default="", max_length=500)
    situacao_direitos: Literal["desconhecido", "protegido", "dominio_publico"] = "desconhecido"
    url: str = Field(default="", max_length=500)

    @field_validator("palavras_chave")
    @classmethod
    def limpar_palavras(cls, valor: list[str]) -> list[str]:
        palavras = [p.strip()[:60] for p in valor if p.strip()]
        return list(dict.fromkeys(palavras))


class TintaDoDuotoneEntrada(BaseModel):
    nome: str = Field(default="", max_length=40)
    cor: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    # A tinta (0 a 100) em 0, 25, 50, 75 e 100% do cinza
    curva: list[float] = Field(min_length=5, max_length=5)

    @field_validator("curva")
    @classmethod
    def curva_em_porcentagem(cls, valor: list[float]) -> list[float]:
        if any(not 0 <= v <= 100 for v in valor):
            raise ValueError("A curva da tinta vai de 0 a 100.")
        return valor


class ModoDeCorEntrada(BaseModel):
    """Imagem › Modo (editor de imagem): o passo final da prévia e da exportação. Cada tipo usa só os campos dele."""
    tipo: Literal["rgb", "cinza", "bitmap", "duotone", "indexadas", "cmyk", "lab"]
    metodo: Literal["limiar", "padrao", "difusao", "meio_tom"] | None = None
    limiar: int | None = Field(default=None, ge=0, le=255)
    frequencia: float | None = Field(default=None, ge=1, le=600)
    angulo: float | None = Field(default=None, ge=-360, le=360)
    forma: Literal["redondo", "elipse", "linha", "quadrado", "losango", "cruz"] | None = None
    tintas: list[TintaDoDuotoneEntrada] | None = Field(default=None, min_length=1, max_length=4)
    paleta: list[list[int]] | None = Field(default=None, min_length=1, max_length=256)
    pontilhado: Literal["nenhum", "difusao", "padrao", "ruido"] | None = None
    quantidade: float | None = Field(default=None, ge=0, le=1)
    transparencia: bool | None = None
    preto: Literal["nenhuma", "leve", "media", "pesada", "maxima"] | None = None
    limite: float | None = Field(default=None, ge=100, le=400)

    @field_validator("paleta")
    @classmethod
    def cores_da_paleta(cls, valor):
        if valor is not None and any(len(cor) != 3 or any(not 0 <= v <= 255 for v in cor) for cor in valor):
            raise ValueError("Cada cor da paleta tem vermelho, verde e azul de 0 a 255.")
        return valor

    @model_validator(mode="after")
    def campos_do_tipo(self):
        exigidos = {"bitmap": ("metodo", "limiar", "frequencia", "angulo", "forma"), "duotone": ("tintas",),
                    "indexadas": ("paleta", "pontilhado", "quantidade", "transparencia"), "cmyk": ("preto", "limite")}
        faltam = [campo for campo in exigidos.get(self.tipo, ()) if getattr(self, campo) is None]
        if faltam:
            raise ValueError(f"O modo {self.tipo} precisa de: {', '.join(faltam)}.")
        return self


class VariavelEntrada(BaseModel):
    """Imagem › Variáveis: a camada ligada e o que muda nela."""
    nome: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_]{0,59}$")
    tipo: Literal["texto", "visibilidade", "imagem"]
    faixa: str = Field(min_length=1, max_length=64)


class ConjuntoDeDadosEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    valores: dict[str, str] = Field(default={}, max_length=100)

    @field_validator("valores")
    @classmethod
    def valores_curtos(cls, valor: dict[str, str]) -> dict[str, str]:
        if any(len(v) > 2000 for v in valor.values()):
            raise ValueError("Cada valor tem no máximo 2000 caracteres.")
        return valor


class VariaveisEntrada(BaseModel):
    variaveis: list[VariavelEntrada] = Field(default=[], max_length=100)
    conjuntos: list[ConjuntoDeDadosEntrada] = Field(default=[], max_length=1000)

    @model_validator(mode="after")
    def nomes_unicos(self):
        nomes = [v.nome.lower() for v in self.variaveis]
        if len(nomes) != len(set(nomes)):
            raise ValueError("Duas variáveis têm o mesmo nome.")
        return self


class GuiasEntrada(BaseModel):
    """As guias do editor de imagem, em pixels do documento (podem ficar fora dele, na mesa)."""
    verticais: list[float] = Field(default=[], max_length=400)
    horizontais: list[float] = Field(default=[], max_length=400)

    @field_validator("verticais", "horizontais")
    @classmethod
    def no_alcance(cls, valor: list[float]) -> list[float]:
        if any(not -100_000 <= v <= 100_000 for v in valor):
            raise ValueError("A guia fica longe demais do documento.")
        return valor


def _perto_do_documento(valor: float) -> float:
    if not -100_000 <= valor <= 100_000:
        raise ValueError("O ponto fica longe demais do documento.")
    return valor


class PontoDaContagemEntrada(BaseModel):
    """Um ponto da ferramenta Contagem, em pixels do documento."""
    x: float
    y: float

    @field_validator("x", "y")
    @classmethod
    def no_alcance(cls, valor: float) -> float:
        return _perto_do_documento(valor)


class GrupoDaContagemEntrada(BaseModel):
    """Um grupo da Contagem: os pontos numerados, com a cor e os tamanhos do marcador e do número."""
    id: str = Field(min_length=1, max_length=64)
    nome: str = Field(min_length=1, max_length=60)
    cor: str = Field(default="#ff3b30", pattern=COR)
    tamanho_do_marcador: int = Field(default=1, ge=0, le=10)
    tamanho_do_rotulo: int = Field(default=12, ge=8, le=72)
    visivel: bool = True
    pontos: list[PontoDaContagemEntrada] = Field(default=[], max_length=5000)

    @field_validator("nome", mode="before")
    @classmethod
    def limpar_espacos(cls, valor):
        return _limpar_espacos(valor)


class ContagemEntrada(BaseModel):
    """Os grupos da ferramenta Contagem e o grupo em que o clique conta."""
    grupos: list[GrupoDaContagemEntrada] = Field(default=[], max_length=30)
    ativo: str | None = Field(default=None, max_length=64)


class NotaEntrada(BaseModel):
    """Uma nota presa a um ponto do documento (ferramenta Nota)."""
    id: str = Field(min_length=1, max_length=64)
    x: float
    y: float
    autor: str = Field(default="", max_length=60)
    texto: str = Field(default="", max_length=4000)
    cor: str = Field(default="#ffd60a", pattern=COR)

    @field_validator("x", "y")
    @classmethod
    def no_alcance(cls, valor: float) -> float:
        return _perto_do_documento(valor)


class EscalaDeMedidaEntrada(BaseModel):
    """Imagem › Análise › Definir escala de medida: tantos pixels são tanto da unidade dada."""
    pixels: float = Field(gt=0, le=100_000)
    comprimento: float = Field(gt=0, le=1_000_000)
    unidade: str = Field(min_length=1, max_length=20)

    @field_validator("unidade", mode="before")
    @classmethod
    def limpar_espacos(cls, valor):
        return _limpar_espacos(valor)


class LuzGlobalEntrada(BaseModel):
    """A luz global do documento: o ângulo e a altitude que os efeitos com "usar a luz global" seguem."""
    angulo: float = Field(default=120, ge=-360, le=360)
    altitude: float = Field(default=30, ge=0, le=90)


class DeformacaoDoTextoEntrada(BaseModel):
    """Texto › Deformar texto (apps/web/src/lib/texto/deformar.ts): estilo, curvatura e distorções (-100 a 100)."""
    estilo: Literal["arco", "arcoInferior", "arcoSuperior", "arcada", "saliencia", "conchaInferior", "conchaSuperior",
                    "bandeira", "onda", "peixe", "elevar", "olhoDePeixe", "inflar", "espremer", "torcao"]
    vertical: bool = False
    curvatura: float = Field(ge=-100, le=100)
    distorcaoH: float = Field(default=0, ge=-100, le=100)  # noqa: N815
    distorcaoV: float = Field(default=0, ge=-100, le=100)  # noqa: N815


class CaminhoDoTextoEntrada(BaseModel):
    """
    O texto num caminho (as letras seguem a linha) ou dentro de uma forma (as linhas quebram dentro dela), nas unidades
    do texto (apps/web/src/lib/texto/caminho.ts).
    """
    tipo: Literal["linha", "area"]
    nos: list[NoDoCaminho] = Field(min_length=2, max_length=5000)
    fechado: bool = False
    inicio: float = Field(default=0, ge=0, le=1)
    inverter: bool = False


class TextoRicoEntrada(BaseModel):
    """O texto do editor de imagem, desenhado no navegador (apps/web/src/lib/texto/modelo.ts)."""
    paragrafos: list[ParagrafoRicoEntrada] = Field(min_length=1, max_length=2000)
    estilo: EstiloDoCaractereEntrada
    paragrafo: EstiloDoParagrafoEntrada
    modo: Literal["ponto", "paragrafo"] = "ponto"
    orientacao: Literal["horizontal", "vertical"] = "horizontal"
    caixa: TamanhoDoVetor
    origem: PontoEntrada
    deformar: DeformacaoDoTextoEntrada | None = None
    caminho: CaminhoDoTextoEntrada | None = None

    @model_serializer(mode="wrap")
    def _sem_os_vazios(self, serializar):
        # Sem deformação e sem caminho, os campos nem aparecem (o texto guardado fica como o editor manda)
        dados = serializar(self)
        for chave in ("deformar", "caminho"):
            if dados.get(chave) is None:
                dados.pop(chave, None)
        return dados

    @model_validator(mode="after")
    def _completo(self):
        if self.caminho and self.caminho.tipo == "area" and not self.caminho.fechado:
            raise ValueError("O texto dentro de uma forma precisa de um caminho fechado.")
        if not {"familia", "tamanho", "cor"} <= self.estilo.model_fields_set:
            raise ValueError("O estilo do texto precisa da fonte, do tamanho e da cor.")
        if sum(len(trecho.texto) for paragrafo in self.paragrafos for trecho in paragrafo.trechos) > 50_000:
            raise ValueError("O texto pode ter no máximo 50 mil caracteres.")
        return self


class CaminhoDoDocumento(BaseModel):
    """Um caminho do painel Caminhos do editor de imagem, em pixels do documento (lib/vetor/caminhos.ts)."""
    id: str = Field(min_length=1, max_length=40)
    nome: str = Field(min_length=1, max_length=60)
    subcaminhos: list[SubcaminhoEntrada] = Field(max_length=1000)
    # O caminho de trabalho (o que a caneta faz sem um caminho escolhido) e o caminho de recorte
    trabalho: bool = False
    recorte: bool = False

    @field_validator("nome", mode="before")
    @classmethod
    def limpar_espacos(cls, valor):
        return _limpar_espacos(valor)


class SerieDoGraficoEntrada(BaseModel):
    nome: str = Field(max_length=80)
    valores: list[float] = Field(max_length=100)


class CaixaDoGraficoEntrada(BaseModel):
    x: float = Field(ge=-100_000, le=100_000)
    y: float = Field(ge=-100_000, le=100_000)
    largura: float = Field(gt=0, le=100_000)
    altura: float = Field(gt=0, le=100_000)


class GraficoEntrada(BaseModel):
    """A tabela e o tipo de um gráfico do editor de imagem (apps/web/src/lib/imagem/graficos.ts)."""
    tipo: Literal["colunas", "colunasEmpilhadas", "barras", "barrasEmpilhadas", "linha", "area", "dispersao", "pizza",
                  "radar"]
    rotulos: list[Annotated[str, Field(max_length=80)]] = Field(max_length=100)
    series: list[SerieDoGraficoEntrada] = Field(max_length=20)
    caixa: CaixaDoGraficoEntrada
    legenda: bool = True
    cores: list[Annotated[str, Field(pattern=COR)]] = Field(min_length=1, max_length=20)


class TintaDaInstanciaEntrada(BaseModel):
    cor: str = Field(pattern=COR)
    quantidade: float = Field(ge=0, le=1)


class InstanciaDeSimboloEntrada(BaseModel):
    """A ligação de uma forma com um símbolo do documento (apps/web/src/lib/vetor/simbolos.ts)."""
    id: str = Field(min_length=1, max_length=64)
    tinta: TintaDaInstanciaEntrada | None = None


class SimboloEntrada(BaseModel):
    """Um símbolo do documento: a forma de referência das instâncias."""
    id: str = Field(min_length=1, max_length=64)
    nome: str = Field(min_length=1, max_length=80)
    vetor: VetorEntrada


class ClipeEntrada(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    # Clipe de texto não tem mídia: tem o texto
    midia_id: str | None = Field(default=None, min_length=24, max_length=24)
    texto: TextoEntrada | None = None
    inicio: int = Field(ge=0, description="Posição na linha do tempo, em ticks")
    duracao: int = Field(gt=0, description="Em ticks")
    entrada: int = Field(ge=0, description="De onde começa na mídia, em ticks")
    velocidade: float = Field(default=1.0, ge=0.1, le=100)
    volume: float = Field(default=1.0, ge=0, le=4)
    fade_entrada: int = Field(default=0, ge=0, description="Em ticks")
    fade_saida: int = Field(default=0, ge=0, description="Em ticks")
    curva_fade: Literal["linear", "suave", "s", "exponencial"] = "linear"
    # Usa a voz sem ruído da mídia (DeepFilterNet) no lugar do som original
    voz_limpa: bool = False
    abaixamento: AbaixamentoEntrada | None = None
    nivelamento: NivelamentoEntrada | None = None
    # Leva a mídia a -14 LUFS pelo loudness medido na ingestão
    igualar_volume: bool = False
    # O som foi para um clipe de áudio próprio ("Separar o som"): este clipe não soa
    som_separado: bool = False
    # Recorta o fundo (a pessoa fica; o resto some), pela máscara gerada no worker
    remover_fundo: bool = False
    # Usa a imagem sem ruído (gerada no worker) no lugar da original
    imagem_limpa: bool = False
    # Usa a imagem estável (gerada no worker, sobre a sem ruído se ela está ligada) no lugar da original
    estabilizar: bool = False
    # Tom da voz, em semitons (o som vem do arquivo que o worker gera para o tom)
    tom: int = Field(default=0, ge=-12, le=12)
    # Toca ao contrário (a imagem e o som vêm do vídeo invertido que o worker gera)
    inverter: bool = False
    # Câmera lenta suave: a imagem vem dos quadros inventados pelo worker para este trecho da mídia
    fluido: FluidoEntrada | None = None
    efeitos_voz: EfeitosVozEntrada | None = None
    # Projetos salvos antes da fase 2 não têm os dois: entram com o padrão
    transformacao: TransformacaoEntrada = Field(default_factory=TransformacaoEntrada)
    recorte: RecorteEntrada = Field(default_factory=RecorteEntrada)
    keyframes: KeyframesEntrada | None = None
    # Repetir os keyframes e tremer, por propriedade (lib/projeto/keyframes.ts)
    expressoes: ExpressoesEntrada | None = None
    animacao: AnimacoesEntrada | None = None
    # Do "dissolver" em diante, só no projeto de imagem (core/modelos/projeto.py, problema_na_arvore)
    mesclagem: Literal["normal", "multiplicar", "tela", "somar", "escurecer", "clarear", "sobrepor", "luz_forte",
                       "diferenca", "exclusao", "dissolver", "superexposicao_cores", "superexposicao_linear",
                       "cor_mais_escura", "subexposicao_cores", "cor_mais_clara", "luz_suave", "luz_brilhante",
                       "luz_linear", "luz_do_pino", "mistura_solida", "subtrair", "dividir", "matiz", "saturacao",
                       "cor", "luminosidade", "passagem"] = "normal"
    # A imagem espelhada; o recorte é do que aparece (core/utils/geometria.py, recorte_na_fonte)
    virar: VirarEntrada | None = None
    cantos: CantosEntrada | None = None
    mascara: MascaraEntrada | None = None
    # Camada de ajuste: sem mídia nem texto, muda a cor de tudo o que está embaixo
    ajuste: bool = False
    # Só no projeto de imagem: o ajuste da camada de ajuste (níveis, curvas, matiz/saturação...), no lugar da cor
    ajuste_imagem: AjusteDaImagemEntrada | None = None
    # Só no projeto de imagem: o estilo de camada (sombra, brilhos, chanfro, cetim, sobreposições, traçado)
    estilo_camada: EstiloDeCamadaEntrada | None = None
    # Só no projeto de imagem: a instância de um símbolo do documento (a forma é a do símbolo, com a tinta)
    simbolo: InstanciaDeSimboloEntrada | None = None
    # Só no projeto de imagem: a tabela do gráfico que o grupo desenha (para refazer)
    grafico: GraficoEntrada | None = None
    # Só no projeto de imagem: a camada de preenchimento (cor sólida, degradê ou padrão, cobrindo o documento)
    camada_de_preenchimento: CamadaDePreenchimentoEntrada | None = None
    # Só no projeto de imagem: os filtros inteligentes (a pilha não destrutiva de filtros, com a máscara dela)
    filtros_inteligentes: FiltrosInteligentesEntrada | None = None
    # Só no projeto de imagem: o preenchimento generativo de onde a camada veio (as variações para trocar)
    geracao: GeracaoDoClipeEntrada | None = None
    # Só no projeto de imagem: a pasta (grupo de camadas) e o preenchimento (a opacidade sem os estilos)
    pasta: bool = False
    preenchimento: float | None = Field(default=None, ge=0, le=1)
    # Camada de pixels: a versão do PNG da mídia que o clipe mostra (0 é a camada vazia)
    pixels: PixelsDoClipe | None = None
    mascara_pixels: MascaraDePixelsEntrada | None = None
    # Camada vetorial (forma ou caminho): sem mídia nem texto, desenhada pelo editor
    vetor: VetorEntrada | None = None
    mascara_vetorial: MascaraVetorialEntrada | None = None
    # O texto do editor de imagem (desenhado no navegador); o `texto` é o do vídeo (desenhado no servidor)
    texto_rico: TextoRicoEntrada | None = None
    prancheta: PranchetaEntrada | None = None
    efeito: EfeitoEntrada | None = None
    chroma: ChromaEntrada | None = None
    # Some o preto ou o branco pela luma BT.709 (só em vídeos e imagens, como a tela verde)
    chave_luma: ChaveLumaEntrada | None = None
    # Fundo desfocado (0 a 1): a pessoa nítida sobre uma cópia desfocada do clipe (core/utils/fundo_desfocado.py)
    fundo_desfocado: float | None = Field(default=None, ge=0, le=1)
    # Esconder os rostos: uma cópia pixelizada ou desfocada por cima, recortada pela máscara dos rostos
    esconder_rostos: EsconderRostosEntrada | None = None
    # Esconder objetos seguidos (uma placa, um logo): a máscara de cada um vem do rastreio dele
    esconder_objetos: list[EsconderObjetoEntrada] | None = Field(default=None, max_length=4)
    # Contorno e sombra em volta do que aparece (recortes, logos, formas, adesivos)
    contorno: ContornoEntrada | None = None
    sombra: SombraEntrada | None = None
    # Velocidade com curva: (u, s) do começo (u = 0) ao fim (u = 1) do clipe; s de 0,2 a 5
    curva_velocidade: list[tuple[float, float]] | None = Field(default=None, min_length=2, max_length=16)

    @field_validator("curva_velocidade")
    @classmethod
    def curva_do_comeco_ao_fim(cls, pontos):
        if pontos is None:
            return pontos
        em_ordem = all(b[0] > a[0] for a, b in zip(pontos, pontos[1:], strict=False))
        if pontos[0][0] != 0 or pontos[-1][0] != 1 or not em_ordem:
            raise ValueError("A curva de velocidade vai do começo ao fim do clipe, com os pontos em ordem.")
        if any(not 0.2 <= s <= 5 for _, s in pontos):
            raise ValueError("A curva de velocidade vai de 0,2 a 5 vezes.")
        return pontos

    @model_validator(mode="after")
    def ao_contrario_sozinho(self):
        # O vídeo ao contrário é outro arquivo: o que é medido ou gerado no original não vale nele
        if self.fluido and (self.inverter or self.remover_fundo or self.estabilizar or self.imagem_limpa):
            raise ValueError("A câmera lenta suave não combina com ao contrário, recorte do fundo, estabilizar "
                             "nem tirar o ruído.")
        if self.inverter and (self.curva_velocidade or self.remover_fundo or self.estabilizar or self.imagem_limpa
                              or self.voz_limpa or self.tom):
            raise ValueError("O clipe ao contrário não combina com curva de velocidade, recorte do fundo, "
                             "estabilizar, tirar o ruído, limpar a voz nem tom da voz.")
        return self

    @model_validator(mode="after")
    def arco_sem_letra_a_letra(self):
        # As letras no arco não ficam em linha: a máscara do letra a letra não acharia cada uma
        if self.texto and self.texto.curvatura and self.animacao and any(
                animacao.tipo in ("letras", "palavras") for animacao in (self.animacao.entrada, self.animacao.saida)):
            raise ValueError("O texto em arco não tem animação letra a letra nem palavra a palavra.")
        return self
    cor: CorEntrada | None = None
    transicao: TransicaoEntrada | None = None


class MulticameraEntrada(BaseModel):
    """A câmera de uma faixa da multicâmera: a gravação e o atraso dela na linha do tempo (o tempo da mídia
    é o da linha menos o atraso), para o editor pôr de volta o trecho certo ao trocar de câmera."""
    midia_id: str = Field(min_length=24, max_length=24)
    atraso: int = Field(description="Em ticks; negativo quando a câmera ligou antes do começo do vídeo")


class TravasEntrada(BaseModel):
    transparencia: bool = False
    pixels: bool = False
    posicao: bool = False


class FaixaEntrada(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    tipo: Literal["principal", "video", "audio", "texto", "legenda"]
    oculta: bool = False
    muda: bool = False
    travada: bool = False
    clipes: list[ClipeEntrada] = Field(default=[], max_length=1500)
    # Só nas faixas de vídeo de uma multicâmera, que ficam mesmo vazias
    multicamera: MulticameraEntrada | None = None
    # Só no projeto de imagem (cada faixa é uma camada): nome, pasta em que está, máscara de corte, travas parciais,
    # cor do rótulo, vínculo e a pasta aberta no painel (lib/projeto/arvore.ts)
    nome: str | None = Field(default=None, max_length=60)
    pai: str | None = Field(default=None, min_length=1, max_length=40)
    recortada: bool = False
    travas: TravasEntrada | None = None
    rotulo: Literal["vermelho", "laranja", "amarelo", "verde", "azul", "violeta", "cinza", "verde_agua", "anil",
                    "magenta", "fucsia"] | None = None
    vinculo: str | None = Field(default=None, max_length=40)
    aberta: bool = False
    # A camada de fundo do editor de imagem (de pixels, embaixo de todas)
    fundo: bool = False

    @model_validator(mode="after")
    def camera_so_em_video(self):
        if self.multicamera and self.tipo != "video":
            raise ValueError("Só uma faixa de vídeo pode ser de uma câmera.")
        return self


class PalavraDaDirecao(BaseModel):
    texto: str = Field(max_length=60)
    inicio: float = Field(ge=0)
    fim: float = Field(ge=0)


class DirecaoEntrada(BaseModel):
    palavras: list[PalavraDaDirecao] = Field(min_length=1, max_length=6000)
    duracao: float = Field(gt=0, le=6 * 3600)


class LegendaParaDestacar(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    texto: str = Field(max_length=500)


class PalavrasChaveEntrada(BaseModel):
    legendas: list[LegendaParaDestacar] = Field(min_length=1, max_length=2000)


class AnimacaoDescritaEntrada(BaseModel):
    descricao: str = Field(min_length=5, max_length=400)
    proporcao: Literal["9:16", "16:9", "1:1", "4:5", "3:4", "21:9"] = "16:9"
    duracao: float = Field(default=4, ge=DURACAO_MINIMA_ANIMACAO, le=DURACAO_MAXIMA_ANIMACAO)

    @field_validator("descricao", mode="before")
    @classmethod
    def limpar_descricao(cls, valor):
        return " ".join(valor.split()) if isinstance(valor, str) else valor


class AnimacaoHtmlEntrada(BaseModel):
    modelo: str = Field(min_length=1, max_length=40)
    campos: dict[str, str | int | float] = Field(default_factory=dict)
    proporcao: Literal["9:16", "16:9", "1:1", "4:5", "3:4", "21:9"] = "16:9"
    duracao: float = Field(default=4, ge=DURACAO_MINIMA_ANIMACAO, le=DURACAO_MAXIMA_ANIMACAO)


class PontoDaSelecao(BaseModel):
    """Um clique na foto, em frações dela; incluir false tira o que está ali da seleção."""
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    incluir: bool = True


class QuadroEntrada(BaseModel):
    """Congelar o quadro: o instante na mídia e a versão do vídeo que o clipe usa (como o render escolhe)."""
    segundos: float = Field(ge=0, le=6 * 3600)
    imagem_limpa: bool = False
    estabilizar: bool = False


class CaixaDaSelecao(BaseModel):
    """O retângulo arrastado em volta do objeto, em frações da foto."""
    x0: float = Field(ge=0, le=1)
    y0: float = Field(ge=0, le=1)
    x1: float = Field(ge=0, le=1)
    y1: float = Field(ge=0, le=1)


class SelecaoEntrada(BaseModel):
    pontos: list[PontoDaSelecao] = Field(default_factory=list, max_length=12)
    caixa: CaixaDaSelecao | None = None


class SelecaoSaida(BaseModel):
    arquivo: str
    # Sem job, a máscara desses pontos já existe
    job_id: str | None = None


class AmpliarEntrada(BaseModel):
    fator: Literal[2, 4] = 2


class EstiloEntrada(BaseModel):
    """A transferência de estilo: um estilo pronto (core/modelos/geracao.py) ou o texto, e a mistura com a foto."""
    estilo: str = Field(default="oleo", pattern=r"^[a-z_]{1,20}$")
    descricao: str = Field(default="", max_length=400)
    intensidade: int = Field(default=100, ge=10, le=100)


class ColorirEntrada(BaseModel):
    descricao: str = Field(default="", max_length=400)
    saturacao: int = Field(default=100, ge=0, le=200)


class RestaurarEntrada(BaseModel):
    forca: int = Field(default=60, ge=0, le=100)


class ExpandirEntrada(BaseModel):
    """A proporção da foto expandida, como "9:16" ou o tamanho do quadro ("1080:1350"), de 1:4 a 4:1."""
    proporcao: str = Field(pattern=r"^[1-9][0-9]{0,4}:[1-9][0-9]{0,4}$")

    @field_validator("proporcao")
    @classmethod
    def proporcao_razoavel(cls, valor: str) -> str:
        largura, altura = (int(lado) for lado in valor.split(":"))
        if not 0.25 <= largura / altura <= 4:
            raise ValueError("A proporção vai de 1:4 a 4:1.")
        return valor


class Foto3dEntrada(BaseModel):
    movimento: Literal["aproximar", "afastar", "lado", "circular"] = "aproximar"
    duracao: float = Field(default=4.0, ge=2, le=10, description="Em segundos")


class ObjetoEntrada(BaseModel):
    acao: Literal["apagar", "recortar"]
    selecao: str | None = Field(default=None, pattern=r"^selecao_[0-9a-f]{12}\.png$")
    # O pincel desenhado no editor: um PNG em base64 (branco é o que entra)
    pincel: str | None = Field(default=None, max_length=12_000_000)

    @model_validator(mode="after")
    def com_alguma_mascara(self):
        if not self.selecao and not self.pincel:
            raise ValueError("Marque o objeto com um clique ou com o pincel.")
        return self


class LinkEntrada(BaseModel):
    url: str = Field(min_length=4, max_length=2000)


class LinkImportarEntrada(LinkEntrada):
    # O título lido antes (POST /api/midias/link/dados), para a biblioteca mostrar o nome enquanto baixa
    titulo: str | None = Field(default=None, max_length=120)


class LinkSaida(BaseModel):
    """Os dados do vídeo por trás do link, antes de importar."""
    origem: str
    id: str
    url: str
    site: str
    titulo: str
    canal: str | None = None
    duracao: float | None = None
    miniatura: str | None = None
    data: str | None = None
    ao_vivo: bool = False
    # Por que não pode entrar (longo demais), ou None
    problema: str | None = None


class FalaEntrada(BaseModel):
    texto: str = Field(min_length=2, max_length=3000)
    voz: Literal["pf_dora", "pm_alex", "pm_santa"] = "pf_dora"
    velocidade: float = Field(default=1.0, ge=0.7, le=1.4)

    @field_validator("texto", mode="before")
    @classmethod
    def limpar_texto(cls, valor):
        return valor.strip() if isinstance(valor, str) else valor


class GerarImagemEntrada(BaseModel):
    descricao: str = Field(min_length=3, max_length=800)
    formato: Literal["16:9", "9:16", "1:1", "4:5"] = "1:1"


class PreencherEntrada(BaseModel):
    """O preenchimento generativo: o recorte em PNG (base64, com o alfa 0 na área a preencher), o texto e quantas
    variações (cada uma vira uma mídia)."""
    imagem: str = Field(min_length=16, max_length=12_000_000)
    descricao: str = Field(default="", max_length=800)
    variacoes: int = Field(default=3, ge=1, le=3)


class GerarVideoEntrada(BaseModel):
    descricao: str = Field(min_length=DESCRICAO_MINIMA, max_length=DESCRICAO_MAXIMA)
    formato: Literal["16:9", "9:16", "1:1"] = "16:9"
    duracao: int = Field(default=5, ge=min(DURACOES), le=max(DURACOES))
    # Imagem da biblioteca que vira o primeiro quadro; o texto descreve o movimento
    imagem_id: str | None = None

    @field_validator("descricao", mode="before")
    @classmethod
    def limpar_descricao(cls, valor):
        return valor.strip() if isinstance(valor, str) else valor


class EstabilizacaoEntrada(BaseModel):
    # Sobre a imagem sem ruído (o clipe com "Tirar o ruído" ligado)
    limpa: bool = False


class TomEntrada(BaseModel):
    semitons: int = Field(ge=-12, le=12)
    limpa: bool = False


class ImagemTextoEntrada(BaseModel):
    texto: TextoEntrada
    lado_menor: int = Field(default=1080, ge=100, le=2160, description="Lado menor do quadro, em pixels")


class ProjetoDaImagemEntrada(BaseModel):
    """Arquivo › Abrir do editor de imagem: a imagem enviada vira um documento do tamanho dela."""
    midia_id: str = Field(pattern=r"^[0-9a-f]{24}$")


class ProjetoCriarEntrada(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=120)
    proporcao: Literal["9:16", "16:9", "1:1", "4:5", "3:4", "21:9"] | None = None
    # Com o tamanho, o projeto é de imagem (o editor de imagem)
    tamanho: TamanhoEntrada | None = None

    @field_validator("nome", mode="before")
    @classmethod
    def limpar_espacos(cls, valor):
        return _limpar_espacos(valor)


class MarcadorEntrada(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    t: int = Field(ge=0, description="Em ticks")
    nome: str = Field(min_length=1, max_length=60)
    cor: str = Field(pattern=COR)


class CanalEntrada(BaseModel):
    """Um canal alfa do editor de imagem (uma seleção guardada): uma camada de pixels cinza do tamanho da imagem."""
    id: str = Field(min_length=1, max_length=40)
    nome: str = Field(min_length=1, max_length=60)
    midia_id: str = Field(min_length=24, max_length=24)
    versao: int = Field(ge=1)

    @field_validator("nome", mode="before")
    @classmethod
    def limpar_espacos(cls, valor):
        return _limpar_espacos(valor)


class EstadoNaCompEntrada(BaseModel):
    """Como uma camada estava numa comp de camada: o olho, a posição e a aparência (o que a comp guarda)."""
    oculta: bool | None = None
    transformacao: TransformacaoEntrada | None = None
    mesclagem: str | None = None
    preenchimento: float | None = Field(default=None, ge=0, le=1)
    estilo_camada: EstiloDeCamadaEntrada | None = None

    @field_validator("mesclagem")
    @classmethod
    def mesclagem_conhecida(cls, valor: str | None) -> str | None:
        if valor is not None and valor not in get_args(ClipeEntrada.model_fields["mesclagem"].annotation):
            raise ValueError("Modo de mesclagem desconhecido.")
        return valor


class CompDeCamadaEntrada(BaseModel):
    """Uma comp de camada do editor de imagem: o estado das camadas, e o que dele vale ao aplicar."""
    id: str = Field(min_length=1, max_length=64)
    nome: str = Field(min_length=1, max_length=80)
    comentario: str = Field(default="", max_length=500)
    visibilidade: bool = True
    posicao: bool = True
    aparencia: bool = True
    # Pela faixa da camada (a imagem tem até 100 camadas, com as pastas)
    camadas: dict[str, EstadoNaCompEntrada] = Field(default={}, max_length=110)

    @field_validator("nome", mode="before")
    @classmethod
    def limpar_espacos(cls, valor):
        return _limpar_espacos(valor)


class QuadroDaAnimacaoEntrada(BaseModel):
    """Um quadro da linha do tempo de quadros: o estado das camadas (como numa comp) e quanto ele fica na tela."""
    id: str = Field(min_length=1, max_length=64)
    atraso: float = Field(default=0.5, ge=0, le=60)
    camadas: dict[str, EstadoNaCompEntrada] = Field(default={}, max_length=110)


class AnimacaoEntrada(BaseModel):
    """A linha do tempo de quadros do editor de imagem: os quadros e quantas vezes a animação toca (0 é sempre)."""
    quadros: list[QuadroDaAnimacaoEntrada] = Field(default=[], max_length=500)
    repetir: int = Field(default=0, ge=0, le=1000)


class PontoDaPerspectivaEntrada(BaseModel):
    x: float = Field(ge=-1_000_000, le=1_000_000)
    y: float = Field(ge=-1_000_000, le=1_000_000)


class GradeDePerspectivaEntrada(BaseModel):
    """A grade de perspectiva do editor de imagem (apps/web/src/lib/vetor/perspectiva.ts)."""
    tipo: Literal[1, 2, 3]
    horizonte: float = Field(ge=-1_000_000, le=1_000_000)
    fuga: list[PontoDaPerspectivaEntrada] = Field(min_length=1, max_length=3)
    origem: PontoDaPerspectivaEntrada
    distancia: float = Field(gt=0, le=1_000_000)
    celula: float = Field(gt=0, le=100_000)
    extensao: float = Field(gt=0, le=1_000_000)
    visivel: bool
    plano: Literal["esquerdo", "direito", "chao"]

    @model_validator(mode="after")
    def _um_ponto_por_tipo(self):
        if len(self.fuga) != self.tipo:
            raise ValueError("A grade de perspectiva tem um ponto de fuga por tipo (1, 2 ou 3).")
        return self


class FatiaEntrada(BaseModel):
    """Uma fatia do editor de imagem (ferramenta Fatia): um retângulo em pixels do documento, que sai num arquivo."""
    id: str = Field(min_length=1, max_length=64)
    nome: str = Field(default="", max_length=80)
    x: int = Field(ge=-100_000, le=100_000)
    y: int = Field(ge=-100_000, le=100_000)
    largura: int = Field(ge=1, le=100_000)
    altura: int = Field(ge=1, le=100_000)


class ProjetoSalvarEntrada(BaseModel):
    versao: int = Field(ge=1, description="A versão que o editor abriu. Outra versão no banco responde 409.")
    nome: str = Field(min_length=1, max_length=120)
    proporcao: Literal["9:16", "16:9", "1:1", "4:5", "3:4", "21:9"]
    taxa: TaxaEntrada
    fundo: FundoEntrada
    # Até 30 no vídeo e 100 camadas na imagem (uma faixa por camada): a rota confere pelo tipo do projeto e dá a
    # mensagem; aqui fica só um teto com folga
    faixas: list[FaixaEntrada] = Field(min_length=1, max_length=120)
    # Marcadores da régua (viram capítulos e marcadores do XML)
    marcadores: list[MarcadorEntrada] = Field(default=[], max_length=200)
    # Só no projeto de imagem (no de vídeo é ignorado)
    tamanho: TamanhoEntrada | None = None
    canais: list[CanalEntrada] = Field(default=[], max_length=50)
    caminhos: list[CaminhoDoDocumento] = Field(default=[], max_length=100)
    luz_global: LuzGlobalEntrada | None = None
    informacoes: InformacoesDoArquivoEntrada | None = None
    modo: ModoDeCorEntrada | None = None
    variaveis: VariaveisEntrada | None = None
    guias: GuiasEntrada | None = None
    contagem: ContagemEntrada | None = None
    notas: list[NotaEntrada] = Field(default=[], max_length=200)
    escala_de_medida: EscalaDeMedidaEntrada | None = None
    comps: list[CompDeCamadaEntrada] = Field(default=[], max_length=100)
    animacao: AnimacaoEntrada | None = None
    fatias: list[FatiaEntrada] = Field(default=[], max_length=500)
    perspectiva: GradeDePerspectivaEntrada | None = None
    simbolos: list[SimboloEntrada] = Field(default=[], max_length=200)

    @field_validator("nome", mode="before")
    @classmethod
    def limpar_espacos(cls, valor):
        return _limpar_espacos(valor)


class VagaDoModelo(BaseModel):
    """Um clipe do modelo que quem usa troca: a mídia dele ou o texto dele."""
    clipe_id: str = Field(min_length=1, max_length=64)
    tipo: Literal["midia", "texto"]
    rotulo: str = Field(min_length=1, max_length=60)

    @field_validator("rotulo", mode="before")
    @classmethod
    def limpar_espacos(cls, valor):
        return _limpar_espacos(valor)


class OrigemDoModeloSaida(BaseModel):
    id: str
    nome: str
    vagas: list[VagaDoModelo]


class ProjetoSaida(BaseModel):
    id: str
    nome: str
    proporcao: str
    taxa: TaxaEntrada
    fundo: FundoEntrada
    faixas: list[FaixaEntrada]
    marcadores: list[MarcadorEntrada] = []
    canais: list[CanalEntrada] = []
    caminhos: list[CaminhoDoDocumento] = []
    luz_global: LuzGlobalEntrada | None = None
    informacoes: InformacoesDoArquivoEntrada | None = None
    modo: ModoDeCorEntrada | None = None
    variaveis: VariaveisEntrada | None = None
    guias: GuiasEntrada | None = None
    contagem: ContagemEntrada | None = None
    notas: list[NotaEntrada] = []
    escala_de_medida: EscalaDeMedidaEntrada | None = None
    comps: list[CompDeCamadaEntrada] = []
    animacao: AnimacaoEntrada | None = None
    fatias: list[FatiaEntrada] = []
    perspectiva: GradeDePerspectivaEntrada | None = None
    simbolos: list[SimboloEntrada] = []
    versao: int
    duracao: int
    tipo: Literal["video", "imagem"] = "video"
    tamanho: TamanhoEntrada | None = None
    # O projeto criado de um modelo do espaço: as vagas que o editor oferece para preencher
    modelo_origem: OrigemDoModeloSaida | None = None
    criado_em: datetime
    atualizado_em: datetime


class ModeloCriarEntrada(BaseModel):
    projeto_id: str = Field(min_length=24, max_length=24)
    nome: str = Field(min_length=1, max_length=80)
    descricao: str = Field(default="", max_length=300)
    categoria: str = Field(default="Do espaço", min_length=1, max_length=40)
    vagas: list[VagaDoModelo] = Field(default_factory=list, max_length=40)

    @field_validator("nome", "descricao", "categoria", mode="before")
    @classmethod
    def limpar_espacos(cls, valor):
        return _limpar_espacos(valor)


class ModeloSaida(BaseModel):
    id: str
    nome: str
    descricao: str
    categoria: str
    proporcao: str
    duracao: int
    capa_midia_id: str | None = None
    vagas: list[VagaDoModelo]
    criado_por_nome: str = ""
    criado_em: datetime


class BibliotecaDeModelosSaida(BaseModel):
    """Os modelos do espaço, os salvos de quem pede e os usos de cada modelo (prontos e do espaço)."""
    do_espaco: list[ModeloSaida]
    salvos: list[str]
    usos: dict[str, int]


# Id de modelo pronto (do editor), de modelo do espaço (ObjectId) ou "animacao-<id>" (com sublinhado: "ao_vivo")
ID_DE_MODELO = r"^[a-z0-9][a-z0-9_-]{0,99}$"


class SalvosEntrada(BaseModel):
    ids: list[Annotated[str, Field(pattern=ID_DE_MODELO)]] = Field(max_length=500)


class UsoDeModeloEntrada(BaseModel):
    modelo_id: str = Field(pattern=ID_DE_MODELO)


class ProjetoResumoSaida(BaseModel):
    id: str
    nome: str
    tipo: Literal["video", "imagem"] = "video"
    tamanho: TamanhoEntrada | None = None
    proporcao: str
    duracao: int
    capa_midia_id: str | None = None
    atualizado_em: datetime


class ExportacaoCriarEntrada(BaseModel):
    projeto_id: str = Field(min_length=24, max_length=24)
    resolucao: Literal["720p", "1080p", "4k"] = "1080p"
    # mp4; gif (480p); png (o quadro em `tempo`); m4a ou wav (só o som)
    formato: Literal["mp4", "gif", "png", "m4a", "wav"] = "mp4"
    # Quadros por segundo no lugar dos do projeto: 24 a 60 no vídeo, 10 a 24 no GIF
    taxa: Literal[10, 15, 24, 25, 30, 50, 60] | None = None
    tempo: int | None = Field(default=None, ge=0, description="Em ticks; só no png")

    @model_validator(mode="after")
    def _conferir(self):
        if self.formato == "png" and self.tempo is None:
            raise ValueError("Diga o instante do quadro.")
        if self.taxa is not None and self.formato == "mp4" and self.taxa not in TAXAS_DO_VIDEO:
            raise ValueError(f"O vídeo sai em {', '.join(map(str, TAXAS_DO_VIDEO))} quadros por segundo.")
        if self.taxa is not None and self.formato == "gif" and self.taxa not in TAXAS_DO_GIF:
            raise ValueError(f"O GIF sai em {', '.join(map(str, TAXAS_DO_GIF))} quadros por segundo.")
        return self


class ExportacaoSaida(BaseModel):
    id: str
    projeto_id: str
    nome: str
    resolucao: str
    formato: str = "mp4"
    taxa: int | None = None
    tempo: int | None = None
    largura: int
    altura: int
    status: str
    arquivos: list[str] = []
    tamanho: int | None = None
    duracao: float | None = None
    erro: str | None = None
    processamento: ProcessamentoSaida | None = None
    criado_em: datetime
    concluido_em: datetime | None = None


class LinkCelularSaida(BaseModel):
    caminho: str = Field(description="Endereço relativo ao site, que baixa o vídeo sem entrar na conta")
    expira_em: datetime


class WorkerSaida(BaseModel):
    id: str
    recursos: list[str]
    tipos: list[str]
    iniciado_em: datetime | None = None
    visto_em: datetime


class SistemaSaida(BaseModel):
    mongo: bool
    modo_ia: str
    workers: list[WorkerSaida]


def job_para_saida(doc: dict) -> JobSaida:
    return JobSaida.model_validate({**doc, "id": str(doc["_id"])})


class OpcoesDaClipagem(BaseModel):
    """As opções da página do Clipar (core/modelos/clipagem.py)."""
    estrategia: Literal["ganchos", "historias", "ideia", "dicas", "humor", "pregacao", "propria"] = "ganchos"
    # O que buscar e o estilo do título, nas palavras da pessoa
    instrucoes: str = Field(default="", max_length=500)
    genero: str = Field(default="auto", max_length=40)
    faixa: Literal["auto", "curto", "medio", "longo", "extra", "muito_longo"] = "auto"
    # O trecho a analisar, em segundos da mídia (None: até o fim)
    inicio: float = Field(default=0, ge=0)
    fim: float | None = Field(default=None, gt=0)
    idioma: Literal["auto", "pt", "en", "es"] = "auto"
    momentos: str = Field(default="", max_length=300)
    formato: Literal["9:16", "1:1", "4:5", "16:9"] = "9:16"
    maximo: int | None = Field(default=None, ge=1, le=50)

    @field_validator("instrucoes", "momentos", "genero", mode="before")
    @classmethod
    def limpar_textos(cls, valor):
        return " ".join(valor.split()) if isinstance(valor, str) else valor

    @model_validator(mode="after")
    def conferir_trecho(self):
        if self.fim is not None and self.fim <= self.inicio:
            raise ValueError("O fim do trecho precisa vir depois do começo.")
        return self


class LegendaDaClipagem(BaseModel):
    """Uma legenda do .srt da pessoa, em segundos da mídia."""
    inicio: float = Field(ge=0)
    fim: float = Field(gt=0)
    texto: str = Field(max_length=1000)


class ClipagemEntrada(BaseModel):
    midia_id: str
    opcoes: OpcoesDaClipagem = Field(default_factory=OpcoesDaClipagem)
    # O .srt da pessoa (lido no navegador), no lugar da transcrição
    legendas: list[LegendaDaClipagem] | None = Field(default=None, max_length=20000)


class AvaliacaoDoCorteEntrada(BaseModel):
    avaliacao: Literal["gostei", "nao_gostei"] | None = None


class ProjetoDoCorteEntrada(BaseModel):
    """O projeto em que o corte foi montado (14.5): abrir de novo vai a ele em vez de montar outro."""
    projeto_id: str | None = None


class ClipagemSaida(BaseModel):
    id: str
    midia_id: str
    nome: str
    duracao: float
    opcoes: dict
    # De onde veio a fala: a transcrição da mídia ou o .srt da pessoa
    fala: str = "transcricao"
    status: str
    erro: str | None = None
    # Enquanto processa: {etapa: transcricao | cortes, progresso, mensagem}
    andamento: dict | None = None
    cortes: list[dict] = []
    total_de_cortes: int = 0
    criado_em: datetime
    atualizado_em: datetime


def clipagem_para_saida(doc: dict, andamento: dict | None, resumida: bool = False) -> ClipagemSaida:
    """resumida: a lista das clipagens leva só a contagem (os cortes vêm ao abrir uma)."""
    cortes = [{chave: valor for chave, valor in corte.items() if chave != "texto"} for corte in doc.get("cortes") or []]
    return ClipagemSaida.model_validate({
        **doc,
        "id": str(doc["_id"]),
        "midia_id": str(doc["midia_id"]),
        "andamento": andamento,
        "cortes": [] if resumida else cortes,
        "total_de_cortes": len(cortes),
    })


class TranscricaoPedirEntrada(BaseModel):
    idioma: Literal["auto", "pt", "en", "es"] = "auto"


class PalavraSaida(BaseModel):
    texto: str
    inicio: float = Field(description="Segundos da mídia")
    fim: float


class TranscricaoSaida(BaseModel):
    midia_id: str
    status: str
    idioma: str
    palavras: list[PalavraSaida] = []
    erro: str | None = None
    processamento: ProcessamentoSaida | None = None


class CaixaNaImagem(BaseModel):
    """Retângulo em frações da imagem como ela aparece (o canto de cima à esquerda e o tamanho)."""
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    largura: float = Field(gt=0, le=1)
    altura: float = Field(gt=0, le=1)


class RastreioEntrada(BaseModel):
    # A cópia leve que a prévia mostra no clipe: a de sempre, a sem ruído ou a estável
    arquivo: str = "proxy.mp4"
    t: float = Field(ge=0, description="Segundos da mídia do quadro marcado")
    caixa: CaixaNaImagem
    de: float = Field(ge=0, description="Começo do trecho seguido, em segundos da mídia")
    ate: float = Field(ge=0)


class RastreioSaida(BaseModel):
    id: str
    midia_id: str
    status: str
    # [t, x, y, largura, altura, nota]: centro e tamanho em frações da imagem; nota de 0 a 1
    pontos: list[list[float]] = []
    erro: str | None = None
    processamento: ProcessamentoSaida | None = None


class AmostraDeRosto(BaseModel):
    t: float = Field(description="Segundos da mídia")
    x: float = Field(description="Centro do rosto, em frações da largura da imagem")
    y: float
    a: float = Field(description="Área do rosto, em frações da imagem")


class RostoSaida(BaseModel):
    midia_id: str
    status: str
    amostras: list[AmostraDeRosto] = []
    erro: str | None = None
    processamento: ProcessamentoSaida | None = None


class BatidasSaida(BaseModel):
    midia_id: str
    status: str
    bpm: float = 0.0
    batidas: list[float] = Field(default=[], description="Segundos da mídia")
    fortes: list[float] = Field(default=[], description="Os tempos fortes (de 4 em 4 batidas), em segundos da mídia")
    erro: str | None = None
    processamento: ProcessamentoSaida | None = None


class QualidadeSaida(BaseModel):
    midia_id: str
    status: str
    t: list[float] = Field(default=[], description="Segundos da mídia, 4 por segundo")
    nota: list[float] = Field(default=[], description="De 0 a 1: nitidez, luz e câmera firme")
    corte: list[bool] = Field(default=[], description="Corte de cena na amostra")
    erro: str | None = None
    processamento: ProcessamentoSaida | None = None


def qualidade_para_saida(doc: dict, job: dict | None = None) -> QualidadeSaida:
    rosto = rosto_para_saida({**doc, "amostras": []}, job)
    return QualidadeSaida.model_validate({**doc, "midia_id": str(doc["midia_id"]), "status": rosto.status,
                                          "erro": rosto.erro, "processamento": rosto.processamento})


def batidas_para_saida(doc: dict, job: dict | None = None) -> BatidasSaida:
    """job: o job da busca, para mostrar o progresso enquanto ela anda (como em rosto_para_saida)."""
    rosto = rosto_para_saida({**doc, "amostras": []}, job)
    return BatidasSaida.model_validate({**doc, "midia_id": str(doc["midia_id"]), "status": rosto.status,
                                        "erro": rosto.erro, "processamento": rosto.processamento})


def rastreio_para_saida(doc: dict, job: dict | None = None) -> RastreioSaida:
    """job: o job do rastreio, para mostrar o progresso enquanto ele anda."""
    processamento = None
    status, erro = doc["status"], doc.get("erro")
    if job is not None and status == "processando":
        processamento = ProcessamentoSaida(status=job["status"], progresso=job.get("progresso", 0),
                                           mensagem=job.get("mensagem", ""))
        if job["status"] == STATUS_JOB_ERRO:
            status, erro = "erro", erro or job.get("erro")
    return RastreioSaida(id=str(doc["_id"]), midia_id=str(doc["midia_id"]), status=status, erro=erro,
                         pontos=doc.get("pontos") or [], processamento=processamento)


def rosto_para_saida(doc: dict, job: dict | None = None) -> RostoSaida:
    """job: o job da busca do rosto, para mostrar o progresso enquanto ela anda."""
    processamento = None
    status, erro = doc["status"], doc.get("erro")
    if job is not None and status == "processando":
        processamento = ProcessamentoSaida(status=job["status"], progresso=job.get("progresso", 0),
                                           mensagem=job.get("mensagem", ""))
        if job["status"] == STATUS_JOB_ERRO:
            status, erro = "erro", erro or job.get("erro")
    return RostoSaida.model_validate({**doc, "midia_id": str(doc["midia_id"]), "status": status, "erro": erro,
                                      "processamento": processamento})


def transcricao_para_saida(doc: dict, job: dict | None = None) -> TranscricaoSaida:
    """job: o job da transcrição, para mostrar o progresso enquanto ela anda."""
    processamento = None
    status, erro = doc["status"], doc.get("erro")
    if job is not None and status == "processando":
        processamento = ProcessamentoSaida(status=job["status"], progresso=job.get("progresso", 0),
                                           mensagem=job.get("mensagem", ""))
        if job["status"] == STATUS_JOB_ERRO:
            status, erro = "erro", erro or job.get("erro")
    return TranscricaoSaida.model_validate({**doc, "midia_id": str(doc["midia_id"]), "status": status, "erro": erro,
                                            "processamento": processamento})


def midia_para_saida(doc: dict, job: dict | None = None) -> MidiaSaida:
    """job: o job de ingestão, para mostrar o progresso enquanto a mídia é processada."""
    processamento = None
    status, erro = doc["status"], doc.get("erro")
    if job is not None and status == STATUS_PROCESSANDO:
        processamento = ProcessamentoSaida(status=job["status"], progresso=job.get("progresso", 0),
                                           mensagem=job.get("mensagem", ""))
        if job["status"] == STATUS_JOB_ERRO:  # o worker caiu de vez sem avisar a mídia
            status, erro = STATUS_ERRO, erro or job.get("erro")
    return MidiaSaida.model_validate({
        **doc,
        "id": str(doc["_id"]),
        "status": status,
        "erro": erro,
        "arquivos": [nome for nome in doc.get("arquivos", []) if arquivo_publico(nome)],
        "processamento": processamento,
        # Sem o job_id, que é interno
        "voz_limpa": {"status": voz["status"], "erro": voz.get("erro")} if (voz := doc.get("voz_limpa")) else None,
        "recorte_fundo": ({"status": recorte["status"], "erro": recorte.get("erro")}
                          if (recorte := doc.get("recorte_fundo")) else None),
        "objetos_escondidos": {chave: {"status": item["status"], "erro": item.get("erro")}
                               for chave, item in (doc.get("objetos_escondidos") or {}).items()},
        "esconder_rostos": ({"status": rostos["status"], "erro": rostos.get("erro"),
                             "quadros_com_rosto": rostos.get("quadros_com_rosto")}
                            if (rostos := doc.get("esconder_rostos")) else None),
        "imagem_limpa": ({"status": limpa["status"], "erro": limpa.get("erro")}
                         if (limpa := doc.get("imagem_limpa")) else None),
        "elemento": ({k: v for k, v in elemento.items() if k != "chave"}
                     if (elemento := doc.get("elemento")) else None),
        # O preenchimento generativo não tem formato nem duração; a marca dele só aparece nele
        "gerada": ({"descricao": gerada["descricao"], "formato": gerada.get("formato"),
                    "duracao": gerada.get("duracao"), "imagem_id": gerada.get("imagem_id"),
                    **({"preenchimento": True} if gerada.get("preenchimento") else {})}
                   if (gerada := doc.get("gerada")) else None),
        "tons": {chave: {"status": tom["status"], "erro": tom.get("erro")}
                 for chave, tom in (doc.get("tons") or {}).items()},
        "estabilizacoes": {chave: {"status": item["status"], "erro": item.get("erro")}
                           for chave, item in (doc.get("estabilizacoes") or {}).items()},
        "invertido": {"status": doc["invertido"]["status"], "erro": doc["invertido"].get("erro")}
        if doc.get("invertido") else None,
        "fluidos": {chave: {"status": item["status"], "erro": item.get("erro"), "de": item.get("de"),
                            "ate": item.get("ate"), "zero": item.get("zero")}
                    for chave, item in (doc.get("fluidos") or {}).items()},
    })


def projeto_para_saida(doc: dict) -> ProjetoSaida:
    return ProjetoSaida.model_validate({**doc, "id": str(doc["_id"])})


def modelo_para_saida(doc: dict) -> ModeloSaida:
    return ModeloSaida.model_validate({**doc, "id": str(doc["_id"])})


def projeto_para_resumo(doc: dict) -> ProjetoResumoSaida:
    return ProjetoResumoSaida.model_validate({**doc, "id": str(doc["_id"])})


def worker_para_saida(doc: dict) -> WorkerSaida:
    return WorkerSaida.model_validate({**doc, "id": str(doc["_id"])})


def exportacao_para_saida(doc: dict, job: dict | None = None) -> ExportacaoSaida:
    """job: o job de render, para mostrar o progresso enquanto o vídeo é gerado."""
    processamento = None
    status, erro = doc["status"], doc.get("erro")
    if job is not None and status == STATUS_EXPORTACAO_PROCESSANDO:
        processamento = ProcessamentoSaida(status=job["status"], progresso=job.get("progresso", 0),
                                           mensagem=job.get("mensagem", ""))
        if job["status"] == STATUS_JOB_ERRO:  # o worker caiu de vez sem avisar a exportação
            status, erro = STATUS_EXPORTACAO_ERRO, erro or job.get("erro")
    return ExportacaoSaida.model_validate({
        **doc,
        "id": str(doc["_id"]),
        "projeto_id": str(doc["projeto_id"]),
        "status": status,
        "erro": erro,
        "arquivos": [nome for nome in doc.get("arquivos", []) if nome in ARQUIVOS_EXPORTACAO],
        "processamento": processamento,
    })
