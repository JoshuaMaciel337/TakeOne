# -----------------------------------------------
# TakeOne API — formatos de entrada e saída
# -----------------------------------------------
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from core.modelos.animacao_html import DURACAO_MAXIMA as DURACAO_MAXIMA_ANIMACAO
from core.modelos.animacao_html import DURACAO_MINIMA as DURACAO_MINIMA_ANIMACAO
from core.modelos.exportacao import ARQUIVOS_PUBLICOS as ARQUIVOS_EXPORTACAO
from core.modelos.exportacao import STATUS_ERRO as STATUS_EXPORTACAO_ERRO
from core.modelos.exportacao import STATUS_PROCESSANDO as STATUS_EXPORTACAO_PROCESSANDO
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
    # A imagem sem ruído: {status, erro}
    imagem_limpa: dict | None = None
    # A voz em outro tom: chave (tom_p3, tom_m2_limpa) → {status, erro}
    tons: dict = Field(default_factory=dict)
    estabilizacoes: dict = Field(default_factory=dict)
    # Vídeo gerado com IA: {descricao, formato, duracao}
    gerada: dict | None = None
    # Forma desenhada (POST /api/elementos/formas): o pedido que a gerou
    elemento: dict | None = None
    # Animação em HTML: {modelo, campos, proporcao, duracao}
    animacao: dict | None = None
    criado_em: datetime
    atualizado_em: datetime
    enviado_em: datetime | None = None


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
LIMITES_ANIMAVEIS = {"x": (-10, 10), "y": (-10, 10), "escala": (0.01, 20), "rotacao": (-180, 180), "opacidade": (0, 1)}


class KeyframesEntrada(BaseModel):
    x: list[KeyframeEntrada] | None = Field(default=None, max_length=100)
    y: list[KeyframeEntrada] | None = Field(default=None, max_length=100)
    escala: list[KeyframeEntrada] | None = Field(default=None, max_length=100)
    rotacao: list[KeyframeEntrada] | None = Field(default=None, max_length=100)
    opacidade: list[KeyframeEntrada] | None = Field(default=None, max_length=100)

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


class EfeitoEntrada(BaseModel):
    """Os tipos são os de apps/web/src/lib/projeto/efeitos.ts."""
    tipo: Literal["desfoque", "brilho", "distorcao", "vhs", "glitch", "luz", "granulacao"]
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


class FormaEntrada(BaseModel):
    """Uma forma desenhada (core/utils/forma.py). Sem `cor`, ela é vazada e precisa de contorno."""
    tipo: Literal["retangulo", "arredondado", "elipse", "triangulo", "estrela", "seta", "linha", "balao", "coracao"]
    cor: str | None = Field(default="#ffffff", pattern=COR)
    contorno_cor: str = Field(default="#000000", pattern=COR)
    contorno: float = Field(default=0.0, ge=0, le=0.25, description="Espessura, em fração do lado menor da forma")
    proporcao: float | None = Field(default=None, ge=0.05, le=20, description="Largura sobre altura")

    @field_validator("cor", "contorno_cor")
    @classmethod
    def minusculas(cls, valor):
        return valor.lower() if isinstance(valor, str) else valor

    @model_validator(mode="after")
    def vazada_com_contorno(self):
        if self.cor is None and self.contorno <= 0:
            raise ValueError("Uma forma vazada precisa de contorno.")
        return self


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
    filtro: Literal["quente", "frio", "vivido", "suave", "pb", "noite", "antigo", "drama", "cinema"] | None = None
    intensidade: float = Field(default=1, ge=0, le=2)
    curvas: CurvasEntrada | None = None


class ChromaEntrada(BaseModel):
    """Tela verde: os limites são os de apps/web/src/lib/projeto/edicao.ts (chromaClipes)."""
    cor: str = Field(default="#00ff00", pattern=COR)
    semelhanca: float = Field(default=0.3, ge=0.001, le=1)
    suavidade: float = Field(default=0.1, ge=0, le=1)


class TransicaoEntrada(BaseModel):
    tipo: Literal["fusao", "escurecer", "deslizar", "empurrar", "zoom",
                  "cortina_direita", "cortina_esquerda", "cortina_baixo", "cortina_cima", "desfoque"]
    duracao: int = Field(gt=0, description="Em ticks")


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
    # Leva a mídia a -14 LUFS pelo loudness medido na ingestão
    igualar_volume: bool = False
    # Recorta o fundo (a pessoa fica; o resto some), pela máscara gerada no worker
    remover_fundo: bool = False
    # Usa a imagem sem ruído (gerada no worker) no lugar da original
    imagem_limpa: bool = False
    # Usa a imagem estável (gerada no worker, sobre a sem ruído se ela está ligada) no lugar da original
    estabilizar: bool = False
    # Tom da voz, em semitons (o som vem do arquivo que o worker gera para o tom)
    tom: int = Field(default=0, ge=-12, le=12)
    efeitos_voz: EfeitosVozEntrada | None = None
    # Projetos salvos antes da fase 2 não têm os dois: entram com o padrão
    transformacao: TransformacaoEntrada = Field(default_factory=TransformacaoEntrada)
    recorte: RecorteEntrada = Field(default_factory=RecorteEntrada)
    keyframes: KeyframesEntrada | None = None
    # Repetir os keyframes e tremer, por propriedade (lib/projeto/keyframes.ts)
    expressoes: ExpressoesEntrada | None = None
    animacao: AnimacoesEntrada | None = None
    mesclagem: Literal["normal", "multiplicar", "tela", "somar"] = "normal"
    # A imagem espelhada; o recorte é do que aparece (core/utils/geometria.py, recorte_na_fonte)
    virar: VirarEntrada | None = None
    cantos: CantosEntrada | None = None
    efeito: EfeitoEntrada | None = None
    chroma: ChromaEntrada | None = None
    # Some o preto ou o branco pela luma BT.709 (só em vídeos e imagens, como a tela verde)
    chave_luma: ChaveLumaEntrada | None = None
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
    cor: CorEntrada | None = None
    transicao: TransicaoEntrada | None = None


class FaixaEntrada(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    tipo: Literal["principal", "video", "audio", "texto", "legenda"]
    oculta: bool = False
    muda: bool = False
    travada: bool = False
    clipes: list[ClipeEntrada] = Field(default=[], max_length=1500)


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


class FalaEntrada(BaseModel):
    texto: str = Field(min_length=2, max_length=3000)
    voz: Literal["pf_dora", "pm_alex", "pm_santa"] = "pf_dora"
    velocidade: float = Field(default=1.0, ge=0.7, le=1.4)

    @field_validator("texto", mode="before")
    @classmethod
    def limpar_texto(cls, valor):
        return valor.strip() if isinstance(valor, str) else valor


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


class ProjetoCriarEntrada(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=120)
    proporcao: Literal["9:16", "16:9", "1:1", "4:5", "3:4", "21:9"] | None = None

    @field_validator("nome", mode="before")
    @classmethod
    def limpar_espacos(cls, valor):
        return _limpar_espacos(valor)


class ProjetoSalvarEntrada(BaseModel):
    versao: int = Field(ge=1, description="A versão que o editor abriu. Outra versão no banco responde 409.")
    nome: str = Field(min_length=1, max_length=120)
    proporcao: Literal["9:16", "16:9", "1:1", "4:5", "3:4", "21:9"]
    taxa: TaxaEntrada
    fundo: FundoEntrada
    faixas: list[FaixaEntrada] = Field(min_length=1, max_length=30)

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
    versao: int
    duracao: int
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
    proporcao: str
    duracao: int
    capa_midia_id: str | None = None
    atualizado_em: datetime


class ExportacaoCriarEntrada(BaseModel):
    projeto_id: str = Field(min_length=24, max_length=24)
    resolucao: Literal["720p", "1080p", "4k"] = "1080p"


class ExportacaoSaida(BaseModel):
    id: str
    projeto_id: str
    nome: str
    resolucao: str
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
        "imagem_limpa": ({"status": limpa["status"], "erro": limpa.get("erro")}
                         if (limpa := doc.get("imagem_limpa")) else None),
        "elemento": ({k: v for k, v in elemento.items() if k != "chave"}
                     if (elemento := doc.get("elemento")) else None),
        "gerada": ({"descricao": gerada["descricao"], "formato": gerada["formato"], "duracao": gerada["duracao"],
                    "imagem_id": gerada.get("imagem_id")}
                   if (gerada := doc.get("gerada")) else None),
        "tons": {chave: {"status": tom["status"], "erro": tom.get("erro")}
                 for chave, tom in (doc.get("tons") or {}).items()},
        "estabilizacoes": {chave: {"status": item["status"], "erro": item.get("erro")}
                           for chave, item in (doc.get("estabilizacoes") or {}).items()},
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
