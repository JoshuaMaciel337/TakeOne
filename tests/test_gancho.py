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


def test_o_teto_do_esquema_cabe_a_maior_frase_que_a_conferencia_aceita():
    from core.modelos.gancho import ESQUEMA, LETRAS_MAXIMAS, PALAVRAS_MAXIMAS

    # 18 palavras de 9 letras, com os espaços e o ponto: a maior frase comum ainda cabe no teto da gramática
    frase = " ".join(["palavrass"] * PALAVRAS_MAXIMAS) + "?"
    assert len(frase) <= LETRAS_MAXIMAS == ESQUEMA["properties"]["frase"]["maxLength"]
    assert conferir_frase({"frase": frase}) is not None


def test_a_frase_longa_aproveita_a_primeira_frase_quando_ela_serve():
    # As duas respostas que o Qwen3 deu num corte de verdade (30/10/2026), recusadas inteiras
    longa = ("E se você pudesse mudar o que nasceu para ser um herói? 18 palavras, 18 decisões, 18 chances de mudar "
             "a sua vida. A gente vai falar do método.")
    assert conferir_frase({"frase": longa}) == "E se você pudesse mudar o que nasceu para ser um herói?"
    # Sem uma primeira frase que caiba, continua recusada
    assert conferir_frase({"frase": " ".join(["muito"] * 30)}) is None
    assert conferir_frase({"frase": "Oi. " + " ".join(["palavra"] * 25)}) is None
