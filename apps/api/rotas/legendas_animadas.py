# -----------------------------------------------
# TakeOne API — legendas animadas (o Clipar, ADR 0004, 14.12a)
#
# O editor manda as palavras da fala (no tempo do clipe, com a ênfase), o estilo e as cores; a API agrupa as palavras
# em blocos e põe a gravação na fila do worker de CPU, que desenha a trilha com o motor (core/legendas/motor.js) e a
# grava com transparência, como as animações em HTML. A mídia entra na biblioteca processando. A prévia do painel é a
# mesma página, com uma frase de exemplo, num iframe só com scripts: por isso o motor e as fontes são públicos.
# -----------------------------------------------
import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

from api.dependencias import obter_db, usuario_atual
from api.esquemas import MidiaSaida
from api.rotas.midias import para_saida
from core.config import FONTES_DA_BIBLIOTECA
from core.modelos.animacao_html import PASTA_FONTES, QUADROS
from core.modelos.job import montar_job
from core.modelos.legenda_animada import (
    DURACAO_MAXIMA,
    ESTILOS,
    FONTES,
    LETRAS_DA_PALAVRA,
    PALAVRAS_NO_MAXIMO,
    PASTA_DO_MOTOR,
    ErroLegenda,
    blocos_da_fala,
    conferir_palavras,
    montar_pagina,
)
from core.modelos.midia import STATUS_PROCESSANDO, montar_midia

router = APIRouter(prefix="/api/legendas-animadas", tags=["legendas-animadas"])

_COR = re.compile(r"#[0-9a-fA-F]{6}")
_ARQUIVOS_DAS_FONTES = {(pasta, arquivo) for pasta, arquivo, *_ in FONTES.values()}
EXEMPLO = "Em 30 dias, quanto menos contato com a palavra, mais longe você fica"
ENFASE_DO_EXEMPLO = {"palavra", "longe"}

# A prévia toca em laço, com o mesmo relógio do worker (renderAt), depois das fontes
_LACO_DA_PREVIA = """<script>
(() => {
  const ms = %d;
  let inicio = 0;
  const passo = (agora) => { window.renderAt(((agora - inicio) %% ms) / 1000); requestAnimationFrame(passo); };
  window.prontoParaGravar.then(() => { inicio = performance.now(); requestAnimationFrame(passo); });
})();
</script>"""


class PalavraDaLegenda(BaseModel):
    texto: str = Field(min_length=1, max_length=LETRAS_DA_PALAVRA * 2)
    inicio: float = Field(ge=0, le=DURACAO_MAXIMA)
    fim: float = Field(ge=0, le=DURACAO_MAXIMA)
    enfase: bool = False


class CoresDaLegenda(BaseModel):
    texto: str | None = Field(default=None, pattern=_COR.pattern)
    enfase: str | None = Field(default=None, pattern=_COR.pattern)
    caixa: str | None = Field(default=None, pattern=_COR.pattern)
    neon: str | None = Field(default=None, pattern=_COR.pattern)


class LegendaAnimadaEntrada(BaseModel):
    palavras: list[PalavraDaLegenda] = Field(min_length=1, max_length=PALAVRAS_NO_MAXIMO)
    estilo: str = Field(min_length=1, max_length=30)
    proporcao: str = "9:16"
    duracao: float = Field(gt=0, le=DURACAO_MAXIMA)
    cores: CoresDaLegenda = Field(default_factory=CoresDaLegenda)
    posicao: float = Field(default=0.72, ge=0.1, le=0.9)
    nome: str | None = Field(default=None, max_length=80)


def _conferir(estilo: str, proporcao: str):
    if estilo not in ESTILOS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Estilo de legenda desconhecido.")
    if proporcao not in QUADROS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Proporção desconhecida.")


def palavras_do_exemplo() -> list[dict]:
    """A frase da prévia, com 0,32 s por palavra e uma pausa curta depois de cada vírgula."""
    palavras, t = [], 0.3
    for texto in EXEMPLO.split():
        palavras.append({"texto": texto, "inicio": round(t, 2), "fim": round(t + 0.28, 2),
                         "enfase": texto.strip(",.") in ENFASE_DO_EXEMPLO})
        t += 0.32 + (0.5 if texto.endswith(",") else 0)
    return palavras


@router.get("/estilos")
async def estilos(_usuario=Depends(usuario_atual)):
    return [{"id": chave, "nome": e["nome"], "descricao": e["descricao"], "categoria": e["categoria"]}
            for chave, e in ESTILOS.items()]


@router.get("/previa", response_class=HTMLResponse)
async def previa(estilo: str, proporcao: str = "9:16", cores: str = Query(default="{}", max_length=300),
                 posicao: float = Query(default=0.72, ge=0.1, le=0.9), _usuario=Depends(usuario_atual)):
    """A página com a frase de exemplo, para o iframe do painel."""
    _conferir(estilo, proporcao)
    try:
        valores = CoresDaLegenda.model_validate(json.loads(cores)).model_dump(exclude_none=True)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Cores inválidas.") from e
    palavras = palavras_do_exemplo()
    duracao = palavras[-1]["fim"] + 1.2
    blocos = blocos_da_fala(conferir_palavras(palavras, duracao), estilo, duracao)
    pagina = montar_pagina(blocos, estilo, proporcao, duracao, valores, posicao, "/api/legendas-animadas/fontes",
                           "/api/legendas-animadas")
    pagina = pagina.replace("</body>", _LACO_DA_PREVIA % round(duracao * 1000) + "</body>")
    return HTMLResponse(pagina, headers={"Content-Security-Policy": (
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' *; font-src *; "
        "img-src data: blob:")})


@router.get("/motor.js")
async def motor():
    """O motor das legendas. Público, como as fontes: o iframe da prévia não leva a sessão."""
    return FileResponse(PASTA_DO_MOTOR / "motor.js", media_type="text/javascript",
                        headers={"Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*"})


@router.get("/fontes/{pasta}/{arquivo}")
async def fonte(pasta: str, arquivo: str):
    """Só as fontes que os estilos usam (OFL)."""
    if (pasta, arquivo) not in _ARQUIVOS_DAS_FONTES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fonte não encontrada.")
    caminho = (PASTA_FONTES if pasta == "nucleo" else FONTES_DA_BIBLIOTECA) / arquivo
    if not caminho.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fonte não encontrada.")
    return FileResponse(caminho, media_type="font/ttf",
                        headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"})


@router.post("", response_model=MidiaSaida, status_code=status.HTTP_201_CREATED)
async def gravar(dados: LegendaAnimadaEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Agrupa as palavras e põe a gravação na fila. A mídia já entra na biblioteca, processando."""
    _conferir(dados.estilo, dados.proporcao)
    try:
        palavras = conferir_palavras([p.model_dump() for p in dados.palavras], dados.duracao)
        blocos = blocos_da_fala(palavras, dados.estilo, dados.duracao)
    except ErroLegenda as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    cores = dados.cores.model_dump(exclude_none=True)
    nome = (dados.nome or f"Legenda · {ESTILOS[dados.estilo]['nome']}")[:110]
    entrada = {"estilo": dados.estilo, "proporcao": dados.proporcao, "duracao": round(dados.duracao, 3),
               "cores": cores, "posicao": dados.posicao, "blocos": blocos}
    midia = montar_midia(usuario["organizacao_id"], usuario["_id"], "legenda.mp4", 0, "video/mp4")
    midia.update({"nome": nome, "nome_original": nome, "status": STATUS_PROCESSANDO,
                  "legenda_animada": {"estilo": dados.estilo, "proporcao": dados.proporcao,
                                      "duracao": entrada["duracao"], "palavras": len(palavras)}})
    midia_id = (await db.midias.insert_one(midia)).inserted_id
    job = montar_job("legenda_animada", usuario["organizacao_id"], {"midia_id": str(midia_id), **entrada},
                     prioridade=1, criado_por=usuario["_id"])
    job_id = (await db.jobs.insert_one(job)).inserted_id
    await db.midias.update_one({"_id": midia_id}, {"$set": {"job_ingestao_id": job_id}})
    logging.info(f"[{usuario['organizacao_id']}] Legenda animada pedida: {dados.estilo}, {len(palavras)} palavras, "
                 f"{len(blocos)} blocos")
    return (await para_saida(db, [{**midia, "_id": midia_id, "job_ingestao_id": job_id}]))[0]
