# O pedido de aprovação: token, validade, anotações e resposta (core/modelos/aprovacao.py)
from datetime import datetime, timedelta

import pytest

from core.config import TZ
from core.modelos.aprovacao import (
    AJUSTES,
    APROVADO,
    PENDENTE,
    expirada,
    hash_do_token,
    montar_anotacao,
    montar_aprovacao,
    responder,
)

AGORA = datetime(2026, 11, 3, 10, 0, tzinfo=TZ)


def test_o_banco_guarda_so_o_hash_e_o_pedido_vence_em_7_dias():
    token, aprovacao = montar_aprovacao("usuario", "  Ana   da loja ", AGORA)
    assert aprovacao["token_hash"] == hash_do_token(token) and token not in str(aprovacao)
    assert aprovacao["para"] == "Ana da loja" and aprovacao["status"] == PENDENTE and aprovacao["anotacoes"] == []
    assert not expirada(aprovacao, AGORA + timedelta(days=6, hours=23))
    assert expirada(aprovacao, AGORA + timedelta(days=7))
    # A resposta dada continua valendo depois do prazo
    assert not expirada(responder(aprovacao, APROVADO, "Ana", momento=AGORA), AGORA + timedelta(days=30))


def test_anotacao_fica_dentro_do_video():
    anotacao = montar_anotacao(3.14159, "  O nome está errado  ", " Ana ", duracao=10.0, momento=AGORA)
    assert (anotacao["tempo"], anotacao["texto"], anotacao["nome"]) == (3.142, "O nome está errado", "Ana")
    assert montar_anotacao(10.02, "fim", "Ana", duracao=10.0)["tempo"] == 10.0
    for tempo, texto, nome in ((11.0, "x", "Ana"), (-1, "x", "Ana"), (1, "   ", "Ana"), (1, "x", "  ")):
        with pytest.raises(ValueError):
            montar_anotacao(tempo, texto, nome, duracao=10.0)
    assert montar_anotacao(500.0, "sem duração", "Ana", duracao=None)["tempo"] == 500.0


def test_pedir_ajustes_precisa_de_comentario_ou_anotacao():
    _, aprovacao = montar_aprovacao("usuario")
    with pytest.raises(ValueError):
        responder(aprovacao, AJUSTES, "Ana", "")
    with pytest.raises(ValueError):
        responder(aprovacao, "talvez", "Ana")
    com_anotacao = {**aprovacao, "anotacoes": [montar_anotacao(1, "aqui", "Ana", 5)]}
    respondida = responder(com_anotacao, AJUSTES, "Ana", "", AGORA)
    assert (respondida["status"], respondida["comentario"], respondida["respondido_em"]) == (AJUSTES, None, AGORA)
    assert len(respondida["anotacoes"]) == 1
