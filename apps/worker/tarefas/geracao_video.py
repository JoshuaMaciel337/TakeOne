# -----------------------------------------------
# Tarefa "geracao_video" — um clipe curto gerado a partir de um texto, com o Wan 2.2 TI2V-5B
# (e, se a pessoa escolheu, de uma imagem da biblioteca, que vira o primeiro quadro)
#
# O modelo roda no ComfyUI (serviço comfyui do Compose, GPL-3.0, num container à parte); aqui só se
# monta o fluxo, se manda pela API HTTP, se acompanha e se baixa o MP4. O vídeo vira o original de uma
# mídia que já está na biblioteca (criada pela API com status "processando") e segue para a ingestão,
# como um envio comum. Gerar pede a placa livre e uns 9 GB de RAM: se o HolyCut ou outro programa está
# usando a GPU, a tarefa espera. No fim o ComfyUI solta o modelo, para a placa voltar para os outros.
# No modo simulado (MODO_IA=simulado) o vídeo é uma imagem de teste do FFmpeg (ou a imagem escolhida, parada),
# para testar o fluxo sem GPU.
# -----------------------------------------------
import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections.abc import Callable
from pathlib import Path

from bson import ObjectId

from core.config import COMFYUI_URL, MODO_IA
from core.modelos.geracao import FORMATOS, FPS, arquivo_gerado, montar_fluxo, segundos_estimados
from core.modelos.job import ErroDefinitivo, montar_job
from core.modelos.midia import ARQUIVO_IMAGEM, PRIORIDADE_INGESTAO, STATUS_ERRO, chave_arquivo, e_imagem
from core.utils import storage
from core.utils.ffmpeg import executar_ffmpeg
from core.utils.imagem import ImagemInvalida, quadro_inicial
from core.utils.mongo import agora

# Medido no Nitro 5: pico de 7,8 GB de VRAM (com parte do modelo na RAM). A RAM livre conta sem os uns 2,5 GB
# que o ComfyUI parado já ocupa, e que ele reaproveita ao carregar o modelo
VRAM_LIVRE_MINIMA_GB = 6.5
RAM_LIVRE_MINIMA_GB = 6.5
ESPERA_MAXIMA_PELA_PLACA_S = 30 * 60
INTERVALO_S = 5


def marcar_geracao_com_erro(db, job: dict, mensagem: str):
    """Chamado quando a geração falha de vez: a mídia mostra o erro na biblioteca."""
    midia_id = (job.get("entrada") or {}).get("midia_id")
    if midia_id:
        db.midias.update_one({"_id": ObjectId(midia_id)}, {"$set": {
            "status": STATUS_ERRO, "erro": mensagem, "atualizado_em": agora(),
        }})


def _pedir(caminho: str, corpo: dict | None = None, tempo_limite: float = 30):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    pedido = urllib.request.Request(COMFYUI_URL + caminho, data=dados, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(pedido, timeout=tempo_limite) as resposta:
        conteudo = resposta.read()
    return json.loads(conteudo) if conteudo else None


def _ram_livre_gb() -> float:
    """Memória livre do sistema (no Docker do Windows, a do WSL inteiro)."""
    try:
        for linha in Path("/proc/meminfo").read_text().splitlines():
            if linha.startswith("MemAvailable:"):
                return int(linha.split()[1]) / 1024**2
    except OSError:
        pass
    return float("inf")


def _enviar_imagem(caminho: Path) -> str:
    """Manda o primeiro quadro para a pasta de entrada do ComfyUI (/upload/image) e devolve o nome dado a ele."""
    fronteira = uuid.uuid4().hex
    nome = f"takeone_{uuid.uuid4().hex}.png"
    corpo = (f'--{fronteira}\r\nContent-Disposition: form-data; name="image"; filename="{nome}"\r\n'
             "Content-Type: image/png\r\n\r\n").encode() + caminho.read_bytes() + (
             f'\r\n--{fronteira}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue'
             f"\r\n--{fronteira}--\r\n").encode()
    pedido = urllib.request.Request(f"{COMFYUI_URL}/upload/image", data=corpo,
                                    headers={"Content-Type": f"multipart/form-data; boundary={fronteira}"})
    with urllib.request.urlopen(pedido, timeout=60) as resposta:
        dados = json.loads(resposta.read())
    return f"{dados['subfolder']}/{dados['name']}" if dados.get("subfolder") else dados["name"]


def soltar_comfyui_parado() -> bool:
    """
    Pede ao ComfyUI para soltar o modelo quando a fila dele está vazia, e diz se pediu. Uma geração órfã (o
    worker morreu no meio, num rebuild) termina sozinha no ComfyUI e deixa o Wan na placa: as esperas pela
    placa duravam até dar erro, porque só o worker que mandou o pedido pedia o /free no fim.
    """
    try:
        fila = _pedir("/queue", tempo_limite=10) or {}
        if fila.get("queue_running") or fila.get("queue_pending"):
            return False
        _pedir("/free", {"unload_models": True, "free_memory": True}, tempo_limite=30)
        return True
    except (urllib.error.URLError, OSError, ValueError):
        # Sem o perfil video, o ComfyUI nem está ligado: não há o que soltar
        return False


def _esperar_a_placa(midia_existe: Callable[[], bool], reportar: Callable[[int, str], None]):
    """Espera ter VRAM e RAM para o Wan. O ComfyUI desligado é erro definitivo, com o comando para ligar."""
    inicio = time.monotonic()
    soltou = False
    while True:
        try:
            estado = _pedir("/system_stats", tempo_limite=10)
        except (urllib.error.URLError, OSError) as e:
            raise ErroDefinitivo("O serviço de geração de vídeo está desligado. Ligue com "
                                 "\"docker compose --profile gpu --profile video up -d\" e peça de novo.") from e
        vram = max((d.get("vram_free", 0) for d in estado.get("devices", [])), default=0) / 1024**3
        ram = _ram_livre_gb()
        if vram >= VRAM_LIVRE_MINIMA_GB and ram >= RAM_LIVRE_MINIMA_GB:
            return
        if not soltou:
            soltou = soltar_comfyui_parado()
            if soltou:
                continue
        if not midia_existe():
            raise ErroDefinitivo("A mídia foi excluída antes de o vídeo ser gerado.")
        if time.monotonic() - inicio > ESPERA_MAXIMA_PELA_PLACA_S:
            raise ErroDefinitivo("A placa de vídeo ficou ocupada por 30 minutos (outro programa está usando a GPU "
                                 "ou a memória). Peça de novo quando ela estiver livre.")
        logging.info(f"Esperando a placa: {vram:.1f} GB de VRAM e {ram:.1f} GB de RAM livres.")
        reportar(0, "Esperando a placa de vídeo ficar livre")
        time.sleep(30)


def _gerar_no_comfyui(entrada: dict, destino: Path, quadro: Path | None, midia_existe: Callable[[], bool],
                      reportar: Callable[[int, str], None]):
    _esperar_a_placa(midia_existe, reportar)
    prefixo = f"takeone_{uuid.uuid4().hex}"
    imagem = _enviar_imagem(quadro) if quadro else None
    fluxo = montar_fluxo(entrada["descricao"], entrada["formato"], entrada["duracao"], entrada["semente"], prefixo,
                         imagem)
    try:
        pedido_id = _pedir("/prompt", {"prompt": fluxo, "client_id": prefixo})["prompt_id"]
    except urllib.error.HTTPError as e:
        raise ErroDefinitivo(f"O ComfyUI recusou o pedido: {e.read().decode(errors='replace')[:500]}") from e
    estimado = segundos_estimados(entrada["duracao"], entrada["formato"])
    minutos = max(1, round(estimado / 60))
    inicio = time.monotonic()
    try:
        while True:
            historico = (_pedir(f"/history/{pedido_id}") or {}).get(pedido_id)
            if historico:
                estado = historico.get("status") or {}
                if estado.get("status_str") == "error":
                    erros = [m[1].get("exception_message", "") for m in estado.get("messages", [])
                             if m[0] == "execution_error"]
                    raise ErroDefinitivo(f"O ComfyUI falhou ao gerar: {(erros or ['sem detalhe'])[0][:500]}")
                arquivo = arquivo_gerado(historico)
                if arquivo is None:
                    raise ErroDefinitivo("O ComfyUI terminou sem salvar o vídeo.")
                break
            if not midia_existe():
                _pedir("/interrupt", {})
                raise ErroDefinitivo("A mídia foi excluída enquanto o vídeo era gerado.")
            passado = time.monotonic() - inicio
            if passado > 3 * estimado:
                _pedir("/interrupt", {})
                raise ErroDefinitivo(f"A geração passou de {3 * minutos} minutos e foi interrompida.")
            reportar(min(95, 2 + int(93 * passado / estimado)), f"Gerando o vídeo (uns {minutos} min)")
            time.sleep(INTERVALO_S)
        consulta = urllib.parse.urlencode({k: arquivo.get(k, "") for k in ("filename", "subfolder", "type")})
        with urllib.request.urlopen(f"{COMFYUI_URL}/view?{consulta}", timeout=120) as resposta:
            destino.write_bytes(resposta.read())
    finally:
        # O modelo sai da placa e da RAM, para o resto (Whisper, HolyCut) voltar a ter espaço
        try:
            _pedir("/free", {"unload_models": True, "free_memory": True})
        except (urllib.error.URLError, OSError) as e:
            logging.warning(f"Não foi possível soltar o modelo do ComfyUI: {e}")
    logging.info(f"Vídeo gerado em {time.monotonic() - inicio:.0f} s (estimado {estimado} s).")


def _gerar_simulado(entrada: dict, destino: Path, quadro: Path | None):
    largura, altura = FORMATOS[entrada["formato"]]
    if quadro:
        fonte = ["-loop", "1", "-framerate", str(FPS), "-t", str(entrada["duracao"]), "-i", str(quadro)]
    else:
        fonte = ["-f", "lavfi", "-i", f"testsrc2=size={largura}x{altura}:rate={FPS}:duration={entrada['duracao']}"]
    executar_ffmpeg([*fonte, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(destino)])


def _preparar_quadro(db, midia: dict, entrada: dict, destino: Path) -> Path:
    """A imagem escolhida, no tamanho do formato, num PNG ao lado do original."""
    imagem = db.midias.find_one({"_id": ObjectId(entrada["imagem_id"]), "organizacao_id": midia["organizacao_id"]})
    if imagem is None or not e_imagem(imagem):
        raise ErroDefinitivo("A imagem escolhida foi excluída antes de o vídeo ser gerado.")
    caminho = storage.caminho_local(chave_arquivo(imagem["organizacao_id"], imagem["_id"], ARQUIVO_IMAGEM))
    if not caminho.is_file():
        raise ErroDefinitivo("A imagem escolhida não está mais no armazenamento. Envie de novo e peça outra vez.")
    try:
        quadro_inicial(caminho, FORMATOS[entrada["formato"]], destino)
    except ImagemInvalida as e:
        raise ErroDefinitivo(str(e)) from e
    return destino


def executar_geracao_video(db, job: dict, reportar: Callable[[int, str], None]) -> dict:
    entrada = job["entrada"]
    midia_id = ObjectId(entrada["midia_id"])
    midia = db.midias.find_one({"_id": midia_id})
    if midia is None:
        raise ErroDefinitivo("A mídia foi excluída antes de o vídeo ser gerado.")
    organizacao_id = midia["organizacao_id"]
    original = storage.caminho_local(chave_arquivo(organizacao_id, midia_id, midia["original"]))
    original.parent.mkdir(parents=True, exist_ok=True)
    parcial = original.with_name("gerado.parcial.mp4")
    reportar(1, "Preparando a geração")
    quadro = None
    try:
        if entrada.get("imagem_id"):
            quadro = _preparar_quadro(db, midia, entrada, original.with_name("quadro_inicial.png"))
        if MODO_IA == "real":
            _gerar_no_comfyui(entrada, parcial, quadro,
                              lambda: db.midias.count_documents({"_id": midia_id}, limit=1) > 0, reportar)
        else:
            _gerar_simulado(entrada, parcial, quadro)
    except BaseException:
        parcial.unlink(missing_ok=True)
        raise
    finally:
        if quadro:
            quadro.unlink(missing_ok=True)
    parcial.replace(original)
    # Daqui em diante é uma mídia enviada como outra qualquer: a ingestão faz a cópia leve, a capa e o resto
    ingestao = montar_job("ingestao", organizacao_id, {"midia_id": str(midia_id)},
                          prioridade=PRIORIDADE_INGESTAO, criado_por=job.get("criado_por"))
    ingestao_id = db.jobs.insert_one(ingestao).inserted_id
    momento = agora()
    resultado = db.midias.update_one({"_id": midia_id}, {"$set": {
        "tamanho_total": original.stat().st_size,
        "bytes_recebidos": original.stat().st_size,
        "job_ingestao_id": ingestao_id,
        "enviado_em": momento,
        "atualizado_em": momento,
    }})
    if resultado.matched_count == 0:
        db.jobs.delete_one({"_id": ingestao_id})
        raise ErroDefinitivo("A mídia foi excluída enquanto o vídeo era gerado.")
    logging.info(f"[{organizacao_id}] [midia {midia_id}] Vídeo gerado; ingestão na fila.")
    reportar(100, "Vídeo gerado")
    return {"midia_id": str(midia_id)}
