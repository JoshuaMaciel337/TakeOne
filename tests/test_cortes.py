# Achar os cortes (Clipar, 14.3): as frases, as janelas, a conferência do que o modelo aponta e a junção
from core.modelos.cortes import (
    FAIXAS,
    conferir_cortes,
    esquema_da_janela,
    frases_da_fala,
    janelas_de_frases,
    juntar_cortes,
    maximo_de_cortes,
    montar_mensagens,
    nota_final,
    parecenca,
    tamanho_da_janela,
    texto_para_o_modelo,
)


def fala(texto: str, inicio: float = 0.0, ritmo: float = 0.35, pausas: dict | None = None) -> list[dict]:
    """Palavras com o tempo: uma a cada `ritmo` segundos, e pausas extras depois das palavras pedidas."""
    palavras, t = [], inicio
    for i, palavra in enumerate(texto.split()):
        palavras.append({"texto": palavra, "inicio": round(t, 3), "fim": round(t + ritmo * 0.8, 3)})
        t += ritmo + (pausas or {}).get(i, 0.0)
    return palavras


def test_frases_fecham_no_ponto_na_pausa_e_no_tamanho():
    palavras = fala("Oi, tudo bem? Hoje eu vou contar uma história sem ponto nenhum aqui depois disso vem outra",
                    pausas={11: 1.0})
    frases = frases_da_fala(palavras)
    assert [frase["texto"] for frase in frases] == [
        "Oi, tudo bem?", "Hoje eu vou contar uma história sem ponto nenhum", "aqui depois disso vem outra"]
    assert frases[1]["de"] == 3 and frases[1]["ate"] == 11 and frases[1]["n"] == 1
    longa = frases_da_fala(fala(" ".join(["palavra"] * 95)))
    assert [frase["ate"] - frase["de"] + 1 for frase in longa] == [40, 40, 15]


def test_janelas_cobrem_tudo_com_sobra():
    frases = [{"n": i, "inicio": i * 10.0, "fim": i * 10.0 + 8, "texto": f"frase {i}"} for i in range(100)]
    janelas = janelas_de_frases(frases)
    assert janelas[0][0]["n"] == 0 and janelas[-1][-1]["n"] == 99
    # Cada janela de 6 min começa 5 min depois da anterior: o último minuto se repete
    assert janelas[1][0]["inicio"] == 300.0 and janelas[0][-1]["inicio"] == 350.0
    assert texto_para_o_modelo(frases[:2]) == "[0] (00:00) frase 0\n[1] (00:10) frase 1"
    # A janela pela duração pedida: 4 min para os cortes de até 1 min, 6 min para os maiores, com um corte de sobra
    assert tamanho_da_janela("medio") == (240.0, 60.0) and tamanho_da_janela("longo") == (270.0, 90.0)
    assert tamanho_da_janela("extra") == (360.0, 180.0) and tamanho_da_janela("muito_longo") == (360.0, 180.0)
    curtas = janelas_de_frases(frases, *tamanho_da_janela("medio"))
    assert [janela[0]["inicio"] for janela in curtas] == [0.0, 180.0, 360.0, 540.0, 720.0, 900.0]


def test_o_pedido_cabe_no_contexto_numa_janela_cheia():
    # Uma fala bem rápida (3 palavras por segundo) em 6 min: o texto inteiro fica abaixo de uns 5 mil tokens
    palavras = fala(" ".join(["palavra"] * 1080), ritmo=1 / 3)
    janela = janelas_de_frases(frases_da_fala(palavras))[0]
    mensagens = montar_mensagens(janela, "medio", estrategia="ganchos fortes", momentos="as histórias")
    letras = sum(len(mensagem["content"]) for mensagem in mensagens)
    assert letras / 3.2 < 6000, letras


def _frases_numeradas(n: int, segundos: float = 10.0) -> list[dict]:
    return [{"n": i, "de": i, "ate": i, "inicio": i * segundos, "fim": i * segundos + segundos - 0.5,
             "texto": f"Na frase {i} eu falo de um assunto número {i} com detalhes"} for i in range(n)]


NOTAS = {"gancho": 8, "fluxo": 7, "valor": 9, "autonomia": 8}
MOTIVOS = {criterio: "porque sim" for criterio in NOTAS}


def _bruto(trechos, titulo="O segredo dos mini-hábitos", **extra):
    return {"trechos": trechos, "titulo": titulo, "foco": ["mini-hábitos", "inventado"], "resumo": "Um resumo.",
            "categoria": "dica", "notas": dict(NOTAS), "motivos": dict(MOTIVOS), **extra}


def test_conferencia_tira_o_que_nao_se_sustenta():
    frases = _frases_numeradas(30)
    bruto = {"cortes": [
        _bruto([{"de": 2, "ate": 5}]),                                   # 39,5 s: fica
        _bruto([{"de": 2, "ate": 99}]),                                  # frase que não existe
        _bruto([{"de": 29, "ate": 29}]),                                 # curto, sem frase seguinte para estender
        _bruto([{"de": 0, "ate": 29}]),                                  # longo demais
        _bruto([{"de": 6, "ate": 9}], titulo="🔥 #viral"),               # título vazio sem o emoji e a hashtag
        _bruto([{"de": 10, "ate": 13}], notas={"gancho": "muito"}),      # nota que não é número
        _bruto([{"de": 20, "ate": 21}, {"de": 25, "ate": 26}], titulo="A ideia volta no fim"),  # dois trechos
    ]}
    cortes = conferir_cortes(bruto, frases, "medio")
    assert [corte["titulo"] for corte in cortes] == ["O segredo dos mini-hábitos", "A ideia volta no fim"]
    primeiro, segundo = cortes
    assert primeiro["trechos"] == [{"inicio": 20.0, "fim": 59.5}] and primeiro["duracao"] == 39.5
    assert primeiro["foco"] == ["mini-hábitos"] and primeiro["categoria"] == "dica" and not primeiro["propaganda"]
    assert segundo["trechos"] == [{"inicio": 200.0, "fim": 219.5}, {"inicio": 250.0, "fim": 269.5}]


def test_resposta_com_de_e_ate_e_o_corte_curto_estendido():
    frases = _frases_numeradas(30)
    sem_trechos = {k: v for k, v in _bruto([]).items() if k != "trechos"}
    bruto = {"cortes": [
        {**sem_trechos, "de": 2, "ate": 2, "mais": []},                       # 9,5 s: ganha as seguintes até 30 s
        {**sem_trechos, "de": 10, "ate": 12, "mais": [{"de": 20, "ate": 20}], "titulo": "Com um trecho a mais"},
    ]}
    estendido, com_mais = conferir_cortes(bruto, frases, "medio")
    assert estendido["frases"] == [{"de": 2, "ate": 5}] and estendido["duracao"] == 39.5
    # Com mais de um trecho, só o último é estendido
    assert com_mais["frases"] == [{"de": 10, "ate": 12}, {"de": 20, "ate": 20}] and com_mais["duracao"] == 39.0
    assert esquema_da_janela(5, 9)["properties"]["cortes"]["items"]["properties"]["de"] == {
        "type": "integer", "minimum": 5, "maximum": 9}


def test_trechos_vizinhos_viram_um_e_caixa_alta_vira_frase():
    frases = _frases_numeradas(10)
    bruto = {"cortes": [_bruto([{"de": 4, "ate": 2}, {"de": 3, "ate": 5}], titulo="O PODER DO HÁBITO")]}
    cortes = conferir_cortes(bruto, frases, "medio")
    assert cortes[0]["frases"] == [{"de": 2, "ate": 5}] and cortes[0]["titulo"] == "O poder do hábito"


def test_comeco_que_aponta_para_tras_perde_autonomia_e_propaganda_e_marcada():
    frases = _frases_numeradas(10)
    frases[3]["texto"] = "Isso mudou tudo para mim"
    frases[7]["texto"] = "Usa o cupom TAKE10 e comenta a palavra plugin"
    bruto = {"cortes": [_bruto([{"de": 3, "ate": 5}]), _bruto([{"de": 6, "ate": 8}], titulo="Outro corte bom")]}
    cortes = conferir_cortes(bruto, frases, "medio")
    assert cortes[0]["notas"]["autonomia"] == 5.0 and "Isso" in cortes[0]["motivos"]["autonomia"]
    assert cortes[1]["propaganda"] and not cortes[0]["propaganda"]


def test_junção_tira_os_que_se_sobrepoem_e_os_repetidos():
    texto = "o plugin faz a edição automática no premiere em um clique com legendas e trilha"
    def corte(inicio, fim, nota, frase=texto):
        return {"trechos": [{"inicio": inicio, "fim": fim}], "duracao": fim - inicio, "nota": nota, "texto": frase}
    # O mesmo vídeo repetido 4 vezes (o teste que enganou outro clipador) e uma janela que viu o mesmo trecho
    candidatos = [corte(0, 46, 87), corte(47, 93, 71), corte(94, 140, 78), corte(141, 187, 84), corte(5, 46, 80),
                  corte(200, 240, 60, "outra conversa sobre um assunto bem diferente do resto")]
    ficam = juntar_cortes(candidatos, 10)
    assert [(c["trechos"][0]["inicio"], c["nota"]) for c in ficam] == [(0, 87), (200, 60)]
    assert [c["id"] for c in ficam] == ["c01", "c02"]
    assert parecenca(texto, texto.upper()) == 1.0 and parecenca(texto, "nada a ver com aquilo") == 0.0


def test_nota_final_e_quantos_cortes():
    assert nota_final({"gancho": 10, "fluxo": 10, "valor": 10, "autonomia": 10}) == 100
    assert nota_final(NOTAS) == 80
    assert nota_final(NOTAS, {"ritmo": 1.0, "rosto": 1.0}) == 84
    assert nota_final(NOTAS, {"ritmo": None}) == 80
    assert maximo_de_cortes(600) == 20 and maximo_de_cortes(60) == 3 and maximo_de_cortes(7200) == 30
    assert maximo_de_cortes(600, 5) == 5
    assert set(FAIXAS) >= {"auto", "curto", "medio", "longo"}
