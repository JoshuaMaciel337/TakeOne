# O pedido de edição em palavras (Clipar, 14.10): o plano só com opções que existem e frases que existem
from core.modelos.pedido_edicao import ESQUEMA, conferir_plano, montar_mensagens, plano_simulado, plano_vazio

FRASES = [{"n": n, "texto": f"frase número {n} do vídeo", "inicio": 5.0 * n} for n in range(10)]


def test_o_que_nao_existe_vira_manter():
    bruto = {
        "resumo": "  Legenda   amarela e maior  ",
        "legenda": {"acao": "manter", "estilo": "neon", "tamanho": "maior", "cor": "amarelo", "posicao": "lado",
                    "caixa_alta": "talvez"},
        "enfase": {"acao": "manter", "cor": "verde"},
        "titulo": {"acao": "trocar", "texto": ""},
        "zoom": {"acao": "por", "palavras": ["câncer", "de", "câncer"], "frases": [3, 99, 3, "x", True]},
        "pausas": "apagar",
        "cortar_frases": [3, 7, 200],
        "formato": "21:9",
        "enquadrar": "rosto",
        "musica": "abaixar",
        "pergunta": {"texto": "Qual cor?", "opcoes": ["amarelo"]},
        "nao_deu": ["pôr um meme", ""],
    }
    plano = conferir_plano(bruto, FRASES)
    assert plano["resumo"] == "Legenda amarela e maior"
    # Mudar o tamanho e a cor das legendas que existem é "mudar"; o estilo e a posição desconhecidos ficam
    assert plano["legenda"] == {"acao": "mudar", "estilo": "manter", "tamanho": "maior", "cor": "amarelo",
                                "posicao": "manter", "caixa_alta": "manter"}
    assert plano["enfase"] == {"acao": "por", "cor": "verde"}
    assert plano["titulo"]["acao"] == "manter"
    # A frase 3 é cortada: não fica como lugar de zoom; as palavras repetidas e curtas saem
    assert plano["zoom"] == {"acao": "por", "palavras": ["câncer"], "frases": []}
    assert plano["cortar_frases"] == [3, 7]
    assert plano["pausas"] == "manter" and plano["formato"] == "manter" and plano["enquadrar"] == "rosto"
    assert plano["musica"] == "abaixar" and plano["nao_deu"] == ["pôr um meme"]
    # Uma pergunta com uma opção só não é pergunta
    assert plano["pergunta"] == {"texto": "", "opcoes": []}


def test_zoom_sem_lugar_e_mudar_sem_mudanca_nao_fazem_nada():
    plano = conferir_plano({"zoom": {"acao": "por", "palavras": [], "frases": []},
                            "legenda": {"acao": "mudar"},
                            "pergunta": {"texto": "Em pé ou deitado?", "opcoes": ["Em pé", "Deitado"]}}, FRASES)
    assert plano["zoom"]["acao"] == "manter" and "zoom sem dizer onde" in plano["nao_deu"]
    assert plano["legenda"]["acao"] == "manter"
    assert plano["pergunta"] == {"texto": "Em pé ou deitado?", "opcoes": ["Em pé", "Deitado"]}
    assert plano_vazio()["legenda"]["acao"] == "manter" and plano_vazio()["cortar_frases"] == []


def test_o_pedido_leva_o_estado_e_as_frases_e_cabe_no_contexto():
    mensagens = montar_mensagens("legenda amarela", FRASES, {"formato": "9:16", "legendas": True, "titulo": "Oi"})
    usuario = mensagens[1]["content"]
    assert "legenda amarela" in usuario and "com legendas" in usuario and "\"Oi\"" in usuario
    assert "[3] (00:15) frase número 3 do vídeo" in usuario
    sem_frases = montar_mensagens("legenda amarela", [])[1]["content"]
    assert "não há frases" in sem_frases
    # Frases cheias param no limite de letras: o pedido inteiro fica abaixo de uns 6 mil tokens (3,5 letras cada)
    longas = [{"n": n, "texto": "palavra " * 60, "inicio": n * 4.0} for n in range(300)]
    texto = montar_mensagens("x" * 500, longas)
    assert sum(len(m["content"]) for m in texto) < 6000 * 3.5
    assert 40 <= texto[1]["content"].count("\n[") <= 50
    assert set(ESQUEMA["required"]) == set(ESQUEMA["properties"])


def test_plano_simulado():
    plano = plano_simulado("Legenda amarela maior, sem título, tira as pausas, zoom, 1:1, abaixa a música e um meme",
                           FRASES)
    assert plano["legenda"]["cor"] == "amarelo" and plano["legenda"]["tamanho"] == "maior"
    assert plano["titulo"]["acao"] == "tirar" and plano["pausas"] == "tirar" and plano["zoom"]["frases"] == [0]
    assert plano["formato"] == "1:1" and plano["musica"] == "abaixar" and plano["nao_deu"] == ["pôr um meme"]


def test_a_lista_de_acoes_vira_o_plano_so_com_o_pedido():
    bruto = {
        "resumo": "Legendas amarelas e grandes",
        "acoes": [
            {"tipo": "legenda_cor", "valor": "Amarela", "frases": []},
            {"tipo": "legenda_tamanho", "valor": "bem grande", "frases": []},
            {"tipo": "legenda_lugar", "valor": "em cima", "frases": []},
            {"tipo": "legenda_estilo", "valor": "karaokê", "frases": []},
            {"tipo": "enfase_cor", "valor": "cor da marca", "frases": []},
            {"tipo": "zoom_nas_palavras", "valor": "dinheiro, atleta", "frases": []},
            {"tipo": "zoom_nas_frases", "valor": "", "frases": [4]},
            {"tipo": "cortar_frases", "valor": "", "frases": [2, 99]},
            {"tipo": "formato", "valor": "quadrado", "frases": []},
            {"tipo": "musica", "valor": "mais baixa", "frases": []},
            {"tipo": "trocar_titulo", "valor": "Você é o atleta", "frases": []},
            {"tipo": "legenda_cor", "valor": "furta-cor", "frases": []},
        ],
        "pergunta": {"texto": "", "opcoes": []},
        "nao_deu": [],
    }
    plano = conferir_plano(bruto, FRASES)
    assert plano["legenda"] == {"acao": "mudar", "estilo": "karaoke", "tamanho": "bem_maior", "cor": "amarelo",
                                "posicao": "alto", "caixa_alta": "manter"}
    assert plano["enfase"] == {"acao": "por", "cor": "marca"}
    assert plano["zoom"] == {"acao": "por", "palavras": ["dinheiro", "atleta"], "frases": [4]}
    assert plano["cortar_frases"] == [2] and plano["formato"] == "1:1" and plano["musica"] == "abaixar"
    assert plano["titulo"] == {"acao": "trocar", "texto": "Você é o atleta"}
    # Só o que foi pedido: o resto fica como estava
    assert plano["pausas"] == "manter" and plano["enquadrar"] == "manter"
    assert conferir_plano({"acoes": [{"tipo": "legenda_cor", "valor": "amarelo", "frases": []}]}, FRASES) == {
        **plano_vazio(),
        "legenda": {**plano_vazio()["legenda"], "acao": "mudar", "cor": "amarelo"},
    }
    assert conferir_plano({"acoes": [{"tipo": "formato", "valor": "em pé", "frases": []}]}, FRASES)["formato"] == "9:16"
