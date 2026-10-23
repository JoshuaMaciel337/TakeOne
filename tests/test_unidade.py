# Funções puras do core e da API, sem banco e sem FFmpeg
from datetime import timedelta
from pathlib import Path

import pytest

from api.seguranca import LimitadorTentativas, criar_token, gerar_slug, ler_token
from core.modelos.job import calcular_espera_retry, montar_job, tipos_por_recursos
from core.modelos.midia import extensao_aceita, montar_midia, nome_para_exibir
from core.utils.ffmpeg import ler_como_bt709, ler_progresso, resumir_sondagem
from core.utils.storage import caminho_local
from core.utils.tempo import (
    TICK_MAXIMO,
    TICKS_POR_SEGUNDO,
    duracao_do_quadro,
    quadro_em,
    taxa_de_fps,
    tick_do_quadro,
)
from worker.tarefas.ingestao import planejar_miniaturas


def test_job_novo_entra_pendente_com_o_recurso_do_tipo():
    job = montar_job("ingestao", "org1", {"midia_id": "m1"}, prioridade=5)
    assert (job["status"], job["recurso"], job["prioridade"], job["tentativas"]) == ("pendente", "cpu", 5, 0)
    with pytest.raises(ValueError):
        montar_job("nao_existe", "org1")


def test_espera_entre_tentativas_cresce_e_para_em_30_min():
    assert [calcular_espera_retry(n) for n in (1, 2, 3, 9)] == [
        timedelta(minutes=1), timedelta(minutes=5), timedelta(minutes=30), timedelta(minutes=30)]


def test_tipos_por_recursos():
    assert set(tipos_por_recursos(["cpu"])) == {"teste", "ingestao", "renderizacao", "limpeza_voz", "rosto", "tom",
                                                "recorte_fundo", "limpeza_imagem", "animacao_html", "batidas", "fala",
                                                "estabilizacao", "rastreio", "qualidade", "selecao", "objeto",
                                                "quadro", "inversao", "fluido", "esconder_rostos",
                                                "esconder_objeto", "ampliar", "expandir", "foto_3d"}
    assert tipos_por_recursos(["gpu"]) == ["transcricao", "geracao_video", "direcao", "palavras_chave",
                                           "animacao_descrita", "geracao_imagem"]


def test_extensao_e_nome_da_midia():
    assert extensao_aceita("C:\\Videos\\Viagem.MP4") == ".mp4"
    assert extensao_aceita("musica.flac") == ".flac"
    assert extensao_aceita("planilha.xlsx") is None
    assert nome_para_exibir("C:/Videos/Viagem 29-09.MOV") == "Viagem 29-09"
    midia = montar_midia("org1", "u1", "Clipe.mov", 100)
    assert (midia["status"], midia["original"], midia["nome"]) == ("enviando", "original.mov", "Clipe")
    with pytest.raises(ValueError):
        montar_midia("org1", "u1", "documento.pdf", 100)


def test_chave_de_armazenamento_nao_sai_da_raiz(tmp_path):
    assert caminho_local("org_1/midias/2/proxy.mp4", tmp_path) == tmp_path / "org_1" / "midias" / "2" / "proxy.mp4"
    for chave in ("../fora.txt", "org_1/../../fora.txt", "/etc/passwd", ""):
        with pytest.raises(ValueError):
            caminho_local(chave, tmp_path)
    assert isinstance(caminho_local("a.txt", Path(tmp_path)), Path)


def test_slug_sem_acento():
    assert gerar_slug("Estúdio da Ana") == "estudio-da-ana"
    assert gerar_slug("!!!") == "espaco"


def test_token_de_sessao():
    token = criar_token("u1", "o1")
    assert ler_token(token)["sub"] == "u1"
    assert ler_token(token + "x") is None


def test_limitador_bloqueia_na_quinta_falha():
    limitador = LimitadorTentativas(maximo=5, janela_minutos=15)
    for _ in range(4):
        limitador.registrar_falha("ip|email")
    assert not limitador.bloqueado("ip|email")
    limitador.registrar_falha("ip|email")
    assert limitador.bloqueado("ip|email")
    limitador.limpar("ip|email")
    assert not limitador.bloqueado("ip|email")


def test_resumo_da_sondagem_com_video_girado():
    sondagem = {
        "format": {"duration": "12.5"},
        "streams": [
            {"codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080,
             "avg_frame_rate": "30000/1001", "side_data_list": [{"rotation": -90}]},
            {"codec_type": "audio", "codec_name": "aac", "channels": 2, "sample_rate": "48000"},
        ],
    }
    resumo = resumir_sondagem(sondagem)
    assert resumo["duracao"] == 12.5
    assert (resumo["video"]["largura"], resumo["video"]["altura"], resumo["video"]["rotacao"]) == (1080, 1920, 270)
    assert resumo["video"]["fps"] == 29.97
    assert resumo["video"]["matriz"] is None, "sem marcação de cor"
    assert resumo["audio"] == {"codec": "aac", "canais": 2, "taxa": 48000}
    sondagem["streams"][0]["color_space"] = "smpte170m"
    assert resumir_sondagem(sondagem)["video"]["matriz"] == "smpte170m"
    assert ler_como_bt709(None) == ["setparams=colorspace=bt709"] and ler_como_bt709("bt709") == []


def test_progresso_do_ffmpeg():
    assert ler_progresso("out_time_us=2500000") == 2.5
    assert ler_progresso("frame=10") is None


def test_plano_de_miniaturas():
    assert planejar_miniaturas(30)["total"] == 10          # mínimo de 10
    assert planejar_miniaturas(600)["total"] == 60
    plano = planejar_miniaturas(5000)
    assert (plano["total"], plano["linhas"]) == (100, 10)  # máximo de 100


def test_ticks_exatos_nas_taxas_comuns():
    # Os mesmos casos de apps/web/src/lib/tempo.test.ts: o navegador e o servidor fazem a mesma conta
    for num, den in [(24000, 1001), (24, 1), (25, 1), (30000, 1001), (30, 1), (60000, 1001), (60, 1)]:
        assert duracao_do_quadro(num, den) * num == TICKS_POR_SEGUNDO * den
        ultimo = quadro_em(num, den, TICK_MAXIMO)
        for quadro in (-1, 0, 1, 1799, 107892, ultimo):
            assert quadro_em(num, den, tick_do_quadro(num, den, quadro)) == quadro
            assert quadro_em(num, den, tick_do_quadro(num, den, quadro) + duracao_do_quadro(num, den) - 1) == quadro
    for amostras in (8000, 11025, 16000, 22050, 44100, 48000, 96000, 192000):
        assert TICKS_POR_SEGUNDO % amostras == 0
    assert quadro_em(0, 0, TICKS_POR_SEGUNDO) == 30   # taxa danificada vira a padrão
    assert taxa_de_fps(29.97) == (30000, 1001)
    assert taxa_de_fps(12.5) == (25, 2)


def test_geracao_de_video_formatos_tempo_e_fluxo():
    from core.modelos.geracao import (
        FORMATOS,
        arquivo_gerado,
        formato_da_imagem,
        montar_fluxo,
        nome_da_midia,
        quadros_para,
        segundos_estimados,
    )

    assert [quadros_para(s) for s in (2, 5)] == [49, 121]
    assert all(lado % 32 == 0 for formato in FORMATOS.values() for lado in formato)
    # O que foi medido no Nitro 5: 5 s em 832×480 em 541 s
    assert segundos_estimados(5, "16:9") == 541
    assert segundos_estimados(2, "16:9") < segundos_estimados(5, "16:9")
    assert nome_da_midia("Ondas do mar, câmera lenta") == "IA · Ondas do mar"
    assert len(nome_da_midia("palavra " * 30)) <= 66
    fluxo = montar_fluxo("Ondas", "9:16", 3, 7, "takeone_x")
    latente = fluxo["7"]["inputs"]
    assert (latente["width"], latente["height"], latente["length"]) == (480, 832, 73)
    assert fluxo["8"]["inputs"]["seed"] == 7 and fluxo["5"]["inputs"]["text"] == "Ondas"
    historico = {"outputs": {"11": {"images": [{"filename": "takeone_x_00001_.mp4", "subfolder": "video",
                                                "type": "output"}], "animated": [True]}}}
    assert arquivo_gerado(historico)["filename"] == "takeone_x_00001_.mp4"
    assert arquivo_gerado({"outputs": {}}) is None
    # Sem imagem, o latente começa do ruído; com ela, a imagem enviada é o primeiro quadro
    assert "start_image" not in latente and "12" not in fluxo
    com_imagem = montar_fluxo("A câmera se aproxima", "1:1", 2, 7, "takeone_x", "takeone_abc.png")
    assert com_imagem["12"] == {"class_type": "LoadImage", "inputs": {"image": "takeone_abc.png"}}
    assert com_imagem["7"]["inputs"]["start_image"] == ["12", 0]
    # O formato mais perto da proporção da imagem
    assert formato_da_imagem(1920, 1080) == "16:9" and formato_da_imagem(3000, 1000) == "16:9"
    assert formato_da_imagem(1080, 1920) == "9:16" and formato_da_imagem(1000, 1100) == "1:1"
    assert formato_da_imagem(1150, 900) == "1:1" and formato_da_imagem(1200, 900) == "16:9"
