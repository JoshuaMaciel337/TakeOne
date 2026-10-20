# Configuração dos testes.
# Os testes de integração usam um banco próprio (takeone_teste_xxxx), apagado no fim,
# e uma pasta de armazenamento temporária, também apagada no fim.
# Aponte MONGO_URI para o Mongo de teste antes de rodar, por exemplo:
#   MONGO_URI="mongodb://localhost:27017/?directConnection=true" pytest
import os
import shutil
import tempfile
import uuid
from pathlib import Path

import pytest

NOME_BANCO_TESTE = f"takeone_teste_{uuid.uuid4().hex[:8]}"
PASTA_ARMAZENAMENTO_TESTE = Path(tempfile.mkdtemp(prefix="takeone_teste_armazenamento_"))
os.environ["DATABASE_NAME"] = NOME_BANCO_TESTE
os.environ["PASTA_ARMAZENAMENTO"] = str(PASTA_ARMAZENAMENTO_TESTE)
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/?directConnection=true")
os.environ.setdefault("JWT_SEGREDO", "segredo-so-para-testes-com-mais-de-32-bytes")


@pytest.fixture(scope="session", autouse=True)
def limpar_armazenamento_no_fim():
    yield
    shutil.rmtree(PASTA_ARMAZENAMENTO_TESTE, ignore_errors=True)


@pytest.fixture(scope="session")
def db():
    from core.utils.mongo import conectar, criar_indices

    banco = conectar(timeout_ms=2000)
    if banco is None:
        pytest.skip("MongoDB indisponível para os testes de integração.")
    assert banco.name.startswith("takeone_teste_"), "Proteção: os testes só podem usar um banco de teste."
    criar_indices(banco)
    yield banco
    banco.client.drop_database(banco.name)
    banco.client.close()


@pytest.fixture
def db_limpo(db):
    for nome in db.list_collection_names():
        db[nome].delete_many({})
    return db


def pytest_runtest_logreport(report):
    """No GitHub Actions, cada falha vira uma anotação (::error), que aparece no resumo da execução sem
    precisar abrir o log inteiro."""
    if not os.environ.get("GITHUB_ACTIONS") or not report.failed:
        return
    caminho, linha, _ = report.location
    texto = str(report.longrepr).strip().splitlines()
    resumo = " | ".join(texto[-6:])[:900].replace("%", "%25").replace("\r", "").replace("\n", " ")
    titulo = f"{report.nodeid} ({report.when})"
    print(f"\n::error file={caminho},line={(linha or 0) + 1},title={titulo}::{resumo}", flush=True)
