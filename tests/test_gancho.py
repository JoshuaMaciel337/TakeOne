from core.modelos.gancho import LETRAS_DO_TEXTO, conferir_frase, montar_mensagens


def test_a_frase_sai_limpa_e_com_pontuacao():
    assert conferir_frase({"frase": '  "Você sabe por que   quase ninguém percebe isso" 🔥 #dica '}) == \
        "Você sabe por que quase ninguém percebe isso."
    assert conferir_frase({"frase": "e se tudo o que te ensinaram estiver errado?"}) == \
        "E se tudo o que te ensinaram estiver errado?"


def test_frase_curta_longa_ou_com_cliche_e_recusada():
    assert conferir_frase({"frase": "Olha isso."}) is None
    assert conferir_frase({"frase": " ".join(["palavra"] * 19)}) is None
    assert conferir_frase({"frase": "Neste vídeo eu conto o segredo da vida"}) is None
    assert conferir_frase({"frase": "Você não vai acreditar no que aconteceu depois"}) is None
    assert conferir_frase({}) is None and conferir_frase(None) is None


def test_o_pedido_leva_o_titulo_e_o_comeco_do_texto():
    mensagens = montar_mensagens("Câncer aos 20", "palavra " * 2000)
    assert "Título: Câncer aos 20" in mensagens[1]["content"]
    assert len(mensagens[1]["content"]) < LETRAS_DO_TEXTO + 100
