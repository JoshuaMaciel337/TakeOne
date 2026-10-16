# "Criar automaticamente": a transcrição que vai para o LLM e a conferência do plano que ele devolve
from core.modelos.direcao import ESQUEMA, conferir_plano, montar_mensagens, plano_simulado, transcricao_numerada


def _fala(texto: str, passo: float = 0.4) -> list[dict]:
    return [{"texto": p, "inicio": i * passo, "fim": i * passo + passo * 0.8} for i, p in enumerate(texto.split())]


FALA = _fala("Oi, eu sou a Ana Souza, fundadora da Lume. Hoje vou mostrar três jeitos de editar mais rápido. "
             "O primeiro é cortar os silêncios. Segue o perfil para mais dicas.")


def test_transcricao_numerada_quebra_nas_frases():
    linhas = transcricao_numerada(FALA).splitlines()
    assert linhas[0].startswith("0.0s: [0]Oi, [1]eu [2]sou")
    assert linhas[1].startswith("3.6s: [9]Hoje")
    mensagens = montar_mensagens(FALA, 12)
    assert mensagens[0]["role"] == "system" and "Nunca invente um nome" in mensagens[0]["content"]
    assert "Vídeo de 12 segundos" in mensagens[1]["content"]
    assert set(ESQUEMA["required"]) == {"titulo", "apresentacao", "destaques", "cta"}


def test_plano_fica_so_com_o_que_esta_na_fala():
    bruto = {
        "titulo": '"Edite mais rápido."  ',
        "apresentacao": {"nome": "Ana Souza", "funcao": "fundadora da Lume", "palavra": 4},
        "destaques": [{"de": 12, "ate": 18}, {"de": 13, "ate": 15}, {"de": 0, "ate": 1}, {"de": 20, "ate": 999}],
        "cta": "Siga para mais dicas",
    }
    plano = conferir_plano(bruto, FALA)
    assert plano["titulo"] == "Edite mais rápido"
    assert plano["apresentacao"] == {"nome": "Ana Souza", "funcao": "fundadora da Lume", "palavra": 4}
    # O curto demais (0 a 1), o sobreposto (13 a 15) e o fora da fala (até 999) saem
    assert plano["destaques"] == [{"de": 12, "ate": 18}]
    assert plano["cta"] == "Siga para mais dicas"


def test_nome_inventado_ou_longe_da_palavra_sai():
    inventado = conferir_plano({"titulo": "x", "apresentacao": {"nome": "Carlos", "funcao": "", "palavra": 4},
                                "destaques": [], "cta": None}, FALA)
    assert inventado["apresentacao"] is None
    longe = conferir_plano({"titulo": "x", "apresentacao": {"nome": "Ana", "funcao": "", "palavra": 25},
                            "destaques": [], "cta": ""}, FALA)
    assert longe["apresentacao"] is None and longe["cta"] is None
    assert conferir_plano({}, FALA) == {"titulo": "", "apresentacao": None, "destaques": [], "cta": None}
    # A fala copiada como chamada sai; o título comprido é cortado em palavra inteira
    copiada = conferir_plano({"titulo": "Uma ferramenta que edita os vídeos sozinha no computador",
                              "cta": "Comenta plugin que eu vou te mandar na sua DM"}, FALA)
    assert copiada["cta"] is None and copiada["titulo"] == "Uma ferramenta que edita os vídeos"


def test_plano_simulado_e_valido():
    plano = plano_simulado(FALA)
    assert plano["titulo"] == "Oi, eu sou a" and len(plano["destaques"]) == 1
