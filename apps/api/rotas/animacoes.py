# -----------------------------------------------
# TakeOne API — animações em HTML (tarjas, títulos, CTA...)
#
# O painel do editor lista os modelos, mostra a animação tocando num iframe (a mesma página que o
# worker grava, com as mesmas fontes) e pede a gravação. A animação vira uma mídia da biblioteca,
# com a transparência pronta, e passa pela ingestão como um envio comum.
# -----------------------------------------------
import gzip
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse, HTMLResponse, Response
from starlette.concurrency import run_in_threadpool

from api.dependencias import obter_db, usuario_atual
from api.esquemas import AnimacaoDescritaEntrada, AnimacaoHtmlEntrada, MidiaSaida
from api.rotas.midias import para_saida
from core.modelos.animacao_descrita import CSS_MAXIMO, HTML_MAXIMO
from core.modelos.animacao_html import (
    ARQUIVOS_COMUNS,
    DURACAO_MAXIMA,
    DURACAO_MINIMA,
    LIVRE,
    MODELOS,
    PASTA_FONTES,
    PASTA_MODELOS,
    QUADROS,
    ErroAnimacao,
    conferir_campos,
    lista_de_modelos,
    montar_html,
)
from core.modelos.job import montar_job
from core.modelos.midia import STATUS_PROCESSANDO, montar_midia

router = APIRouter(prefix="/api/animacoes", tags=["animacoes"])

FONTES = {"Inter[opsz,wght].ttf", "Montserrat[wght].ttf", "Caveat[wght].ttf"}

# Na prévia a animação recomeça sozinha a cada volta, com o mesmo relógio que o worker usa (as animações
# CSS e o renderAt dos modelos em Canvas)
_LACO_DA_PREVIA = """<script>
(() => {
  const ms = %d;
  let inicio = 0;
  const passo = (agora) => {
    const t = (agora - inicio) %% ms;
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; }
    if (typeof window.renderAt === "function") window.renderAt(t / 1000);
    requestAnimationFrame(passo);
  };
  Promise.all([document.fonts.ready, window.TO ? window.TO.carregado : null, window.prontoParaGravar || null])
    .then(() => { inicio = performance.now(); requestAnimationFrame(passo); });
})();
</script>"""


# A lista só muda quando a biblioteca muda (no deploy): montada uma vez, já comprimida. Com os temas ela passa
# de centenas de modelos, e o gzip leva a uns 10% do tamanho.
_LISTA = json.dumps(lista_de_modelos(), ensure_ascii=False).encode()
_LISTA_GZIP = gzip.compress(_LISTA, 9)


@router.get("/modelos")
async def modelos(request: Request, _usuario=Depends(usuario_atual)):
    if "gzip" in request.headers.get("accept-encoding", ""):
        return Response(_LISTA_GZIP, media_type="application/json",
                        headers={"Content-Encoding": "gzip", "Vary": "Accept-Encoding"})
    return Response(_LISTA, media_type="application/json", headers={"Vary": "Accept-Encoding"})


@router.get("/previa", response_class=HTMLResponse)
async def previa(modelo: str, proporcao: str = "16:9", duracao: float = Query(default=4, ge=DURACAO_MINIMA,
                                                                                 le=DURACAO_MAXIMA),
                 campos: str = Query(default="{}", max_length=CSS_MAXIMO + HTML_MAXIMO + 2000),
                 _usuario=Depends(usuario_atual)):
    """A página da animação, para o iframe do painel (que roda sem acesso ao site)."""
    if proporcao not in QUADROS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Proporção desconhecida.")
    try:
        valores = json.loads(campos)
        if not isinstance(valores, dict):
            raise ValueError
        # Numa thread: a limpeza do modelo livre roda expressões no CSS, e no laço de eventos ela pararia a API
        pagina = await run_in_threadpool(montar_html, modelo, valores, duracao, proporcao, "/api/animacoes/fontes",
                                         "/api/animacoes/arquivos")
    except (ValueError, ErroAnimacao) as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e) or "Campos inválidos.") from e
    # O laço entra depois dos módulos do modelo (que definem o renderAt)
    pagina = pagina.replace("</body>", _LACO_DA_PREVIA % round(duracao * 1000) + "</body>")
    # O iframe não tem permissão de nada além de rodar a animação: scripts da própria API, fontes e imagens
    # geradas na página. Nada de rede (connect-src fica em 'none').
    return HTMLResponse(pagina, headers={"Content-Security-Policy": (
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' *; font-src *; "
        "img-src data: blob:")})


@router.get("/arquivos/{caminho:path}")
async def arquivo_comum(caminho: str):
    """O comum.js e o Three.js (vendor/) dos modelos em Canvas. Públicos, como as fontes."""
    if not ARQUIVOS_COMUNS.fullmatch(caminho):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado.")
    return FileResponse(PASTA_MODELOS / caminho, media_type="text/javascript",
                        headers={"Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*"})


@router.get("/fontes/{nome}")
async def fonte(nome: str):
    """As fontes das animações (OFL). Públicas: o iframe da prévia não leva a sessão."""
    if nome not in FONTES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fonte não encontrada.")
    return FileResponse(PASTA_FONTES / nome, media_type="font/ttf",
                        headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"})


async def _criar_midia(db, usuario, nome: str, animacao: dict, tipo_do_job: str, entrada_do_job: dict) -> MidiaSaida:
    """A mídia já entra na biblioteca, processando; o progresso do job aparece nela como o da ingestão."""
    midia = montar_midia(usuario["organizacao_id"], usuario["_id"], "animacao.mp4", 0, "video/mp4")
    midia.update({"nome": nome, "nome_original": nome, "status": STATUS_PROCESSANDO, "animacao": animacao})
    midia_id = (await db.midias.insert_one(midia)).inserted_id
    job = montar_job(tipo_do_job, usuario["organizacao_id"], {"midia_id": str(midia_id), **entrada_do_job},
                     criado_por=usuario["_id"])
    job_id = (await db.jobs.insert_one(job)).inserted_id
    await db.midias.update_one({"_id": midia_id}, {"$set": {"job_ingestao_id": job_id}})
    logging.info(f"[{usuario['organizacao_id']}] Animação pedida: {nome}")
    return (await para_saida(db, [{**midia, "_id": midia_id, "job_ingestao_id": job_id}]))[0]


@router.post("/descrita", response_model=MidiaSaida, status_code=status.HTTP_201_CREATED)
async def descrever(dados: AnimacaoDescritaEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Experimental: o LLM local escreve a animação a partir do pedido (worker de GPU) e ela é gravada
    como as outras (worker de CPU)."""
    nome = f"Animação · {dados.descricao}"[:110]
    animacao = {"modelo": LIVRE, "descricao": dados.descricao, "campos": {}, "proporcao": dados.proporcao,
                "duracao": dados.duracao}
    entrada = {"descricao": dados.descricao, "proporcao": dados.proporcao, "duracao": dados.duracao}
    return await _criar_midia(db, usuario, nome, animacao, "animacao_descrita", entrada)


@router.post("", response_model=MidiaSaida, status_code=status.HTTP_201_CREATED)
async def gravar(dados: AnimacaoHtmlEntrada, usuario=Depends(usuario_atual), db=Depends(obter_db)):
    """Põe na fila a gravação da animação. A mídia já entra na biblioteca, processando."""
    if dados.modelo not in MODELOS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Modelo de animação desconhecido.")
    try:
        campos = conferir_campos(dados.modelo, dados.campos)
    except ErroAnimacao as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    modelo = MODELOS[dados.modelo]
    destaque = next((campos[c[0]] for c in modelo["campos"] if c[2] in ("texto", "linhas", "numero")), "")
    nome = f"Animação · {modelo['nome']}: {' '.join(destaque.split())}"[:110]
    animacao = {"modelo": dados.modelo, "campos": campos, "proporcao": dados.proporcao, "duracao": dados.duracao}
    return await _criar_midia(db, usuario, nome, animacao, "animacao_html", animacao)
