# O pedido ao LLM em lotes que cabem no contexto e o ComfyUI parado que solta a placa
from worker.tarefas import geracao_video, palavras_chave


def test_comfyui_so_solta_o_modelo_com_a_fila_vazia(monkeypatch):
    estado = {"fila": {"queue_running": [["gerando"]], "queue_pending": []}}
    pedidos = []

    def pedir(caminho, corpo=None, tempo_limite=30):
        pedidos.append(caminho)
        return estado["fila"] if caminho == "/queue" else None

    monkeypatch.setattr(geracao_video, "_pedir", pedir)
    assert geracao_video.soltar_comfyui_parado() is False and pedidos == ["/queue"]
    estado["fila"] = {"queue_running": [], "queue_pending": []}
    pedidos.clear()
    assert geracao_video.soltar_comfyui_parado() is True and pedidos == ["/queue", "/free"]


def test_palavras_chave_em_lotes_que_cabem_no_contexto(monkeypatch):
    chamadas = []

    def conversar(mensagens, esquema, reportar, mensagem, primeiro=True, ultimo=True, progresso=45):
        chamadas.append((primeiro, ultimo, mensagem))
        # Destaca a palavra 0 de toda legenda do lote (numeradas do zero em cada pedido)
        total = mensagens[1]["content"].count("\nL") + 1
        return {"escolhas": [{"legenda": i, "palavras": [0]} for i in range(total)]}

    monkeypatch.setattr(palavras_chave, "MODO_IA", "real")
    monkeypatch.setattr(palavras_chave, "conversar", conversar)
    legendas = [{"id": f"c{i}", "texto": f"Economiza tempo {i}"} for i in range(250)]
    resultado = palavras_chave.executar_palavras_chave(None, {"entrada": {"legendas": legendas}}, lambda *_: None)
    assert [(p, u) for p, u, _ in chamadas] == [(True, False), (False, False), (False, True)]
    assert chamadas[0][2].endswith("(1 de 3)")
    assert set(resultado["chaves"]) == {f"c{i}" for i in range(250)}
