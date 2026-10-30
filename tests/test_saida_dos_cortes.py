# A saída dos cortes (14.9): os estados de cada corte e as legendas do projeto em .srt e .vtt, iguais às do editor
from core.modelos.saida_dos_cortes import campos_do_evento, cortes_ocupados, montar_pedido, pendentes_do_job
from core.utils.legendas import escrever_srt, escrever_vtt, legendas_das_faixas
from core.utils.tempo import TICKS_POR_SEGUNDO

S = TICKS_POR_SEGUNDO


def test_eventos_do_montador_viram_a_saida_do_corte():
    assert campos_do_evento({"evento": "etapa", "texto": "Procurando o rosto"}) == {
        "status": "montando", "etapa": "Procurando o rosto"}
    assert campos_do_evento({"evento": "montado"}) == {"status": "montado", "etapa": None}
    assert campos_do_evento({"evento": "exportado", "exportacao_id": "e1"}) == {
        "status": "exportado", "etapa": None, "exportacao_id": "e1"}
    assert campos_do_evento({"evento": "erro", "mensagem": "x" * 400})["erro"] == "x" * 300
    assert campos_do_evento({"evento": "erro"})["erro"] == "A montagem falhou."
    assert campos_do_evento({"evento": "outro"}) == {}


def test_cortes_na_fila_nao_entram_de_novo_e_a_nova_tentativa_pula_os_que_sairam():
    cortes = [{"id": "a", "saida": {"status": "na_fila", "job_id": "j"}},
              {"id": "b", "saida": {"status": "montando", "job_id": "j"}},
              {"id": "c", "saida": {"status": "exportado", "job_id": "j"}},
              {"id": "d", "saida": {"status": "erro", "job_id": "j"}},
              {"id": "e"}]
    assert cortes_ocupados(cortes, ["a", "c", "d", "e"]) == ["a"]
    assert pendentes_do_job(cortes, "j") == ["a", "b"]
    assert pendentes_do_job(cortes, "outro") == []
    job, saida = montar_pedido("org", "usuario", "clip", ["a", "b"], resolucao="4k", esteira_id="es")
    assert job["tipo"] == "montagem" and job["recurso"] == "montagem"
    assert job["entrada"] == {"clipagem_id": "clip", "cortes": ["a", "b"], "exportar": True, "resolucao": "4k",
                              "esteira_id": "es"}
    assert saida["status"] == "na_fila" and saida["exportacao_id"] is None


def test_legendas_do_projeto_como_o_editor_escreve():
    faixas = [
        {"tipo": "principal", "clipes": [{"inicio": 0, "duracao": S}]},
        {"tipo": "legenda", "clipes": [{"inicio": 61 * S + S // 3, "duracao": S, "texto": {"conteudo": "Dois"}},
                                       {"inicio": 0, "duracao": S // 2, "texto": {"conteudo": "Um\nlinha"}}]},
        {"tipo": "texto", "clipes": [{"inicio": 0, "duracao": S, "texto": {"conteudo": "Título"}}]},
    ]
    legendas = legendas_das_faixas(faixas)
    assert [legenda["conteudo"] for legenda in legendas] == ["Um\nlinha", "Dois"]
    # O mesmo texto do escreverSrt e do escreverVtt de lib/projeto/legendas.ts (1/3 s vira 333 ms)
    assert escrever_srt(legendas) == ("1\n00:00:00,000 --> 00:00:00,500\nUm\nlinha\n\n"
                                      "2\n00:01:01,333 --> 00:01:02,333\nDois\n")
    assert escrever_vtt(legendas) == ("WEBVTT\n\n00:00:00.000 --> 00:00:00.500\nUm\nlinha\n\n"
                                      "00:01:01.333 --> 00:01:02.333\nDois\n")
    assert escrever_vtt([]) == "WEBVTT\n"
