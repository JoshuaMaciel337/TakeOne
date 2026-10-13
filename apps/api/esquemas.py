# -----------------------------------------------
# TakeOne API — formatos de entrada e saída
# -----------------------------------------------
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from core.modelos.exportacao import ARQUIVOS_PUBLICOS as ARQUIVOS_EXPORTACAO
from core.modelos.exportacao import STATUS_ERRO as STATUS_EXPORTACAO_ERRO
from core.modelos.exportacao import STATUS_PROCESSANDO as STATUS_EXPORTACAO_PROCESSANDO
from core.modelos.job import STATUS_ERRO as STATUS_JOB_ERRO
from core.modelos.midia import ARQUIVOS_PUBLICOS, STATUS_ERRO, STATUS_PROCESSANDO


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
    arquivos: list[str] = []
    erro: str | None = None
    processamento: ProcessamentoSaida | None = None
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


class ClipeEntrada(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    midia_id: str = Field(min_length=24, max_length=24)
    inicio: int = Field(ge=0, description="Posição na linha do tempo, em ticks")
    duracao: int = Field(gt=0, description="Em ticks")
    entrada: int = Field(ge=0, description="De onde começa na mídia, em ticks")
    velocidade: float = Field(default=1.0, ge=0.1, le=100)
    volume: float = Field(default=1.0, ge=0, le=4)
    fade_entrada: int = Field(default=0, ge=0, description="Em ticks")
    fade_saida: int = Field(default=0, ge=0, description="Em ticks")
    # Projetos salvos antes da fase 2 não têm os dois: entram com o padrão
    transformacao: TransformacaoEntrada = Field(default_factory=TransformacaoEntrada)
    recorte: RecorteEntrada = Field(default_factory=RecorteEntrada)


class FaixaEntrada(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    tipo: Literal["principal", "video", "audio"]
    oculta: bool = False
    muda: bool = False
    travada: bool = False
    clipes: list[ClipeEntrada] = Field(default=[], max_length=1500)


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


class ProjetoSaida(BaseModel):
    id: str
    nome: str
    proporcao: str
    taxa: TaxaEntrada
    fundo: FundoEntrada
    faixas: list[FaixaEntrada]
    versao: int
    duracao: int
    criado_em: datetime
    atualizado_em: datetime


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
        "arquivos": [nome for nome in doc.get("arquivos", []) if nome in ARQUIVOS_PUBLICOS],
        "processamento": processamento,
    })


def projeto_para_saida(doc: dict) -> ProjetoSaida:
    return ProjetoSaida.model_validate({**doc, "id": str(doc["_id"])})


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
