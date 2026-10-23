# -----------------------------------------------
# TakeOne — modelos do espaço (o projeto de alguém salvo como modelo)
#
# O modelo é uma cópia do projeto salvo (linha do tempo, proporção, taxa e fundo) e as "vagas": os clipes
# de mídia e de texto que quem usa o modelo troca. Usar cria um projeto novo com a cópia, que lembra de
# onde veio (`modelo_origem`), para o editor mostrar o "Preencher o modelo". Os modelos prontos do
# TakeOne ficam no editor (apps/web/src/lib/projeto/modelos.ts); aqui só a contagem de usos deles.
# -----------------------------------------------
import copy

from core.modelos.projeto import capa_do_projeto, duracao_do_projeto, midias_usadas
from core.utils.mongo import agora


def conferir_vagas(faixas: list[dict], vagas: list[dict]) -> str | None:
    """A mensagem do problema, ou None: cada vaga aponta um clipe que existe, do tipo dela, uma vez só."""
    clipes = {c["id"]: c for f in faixas for c in f["clipes"]}
    vistos = set()
    for vaga in vagas:
        clipe = clipes.get(vaga["clipe_id"])
        if clipe is None:
            return "Um dos clipes marcados para trocar não está mais no projeto. Marque de novo."
        if vaga["clipe_id"] in vistos:
            return "O mesmo clipe foi marcado duas vezes."
        vistos.add(vaga["clipe_id"])
        if vaga["tipo"] == "texto" and not clipe.get("texto"):
            return f"“{vaga['rotulo']}” não é um texto."
        if vaga["tipo"] == "midia" and (clipe.get("texto") or not clipe.get("midia_id")):
            return f"“{vaga['rotulo']}” não é um clipe de mídia."
    return None


def montar_modelo(projeto: dict, usuario: dict, nome: str, descricao: str, categoria: str, vagas: list[dict]) -> dict:
    """O documento do modelo a partir do projeto salvo (a linha do tempo é copiada, não referenciada)."""
    momento = agora()
    faixas = copy.deepcopy(projeto["faixas"])
    return {
        "organizacao_id": usuario["organizacao_id"],
        "criado_por": usuario["_id"],
        "criado_por_nome": usuario.get("nome", ""),
        "projeto_origem_id": projeto["_id"],
        "nome": nome,
        "descricao": descricao,
        "categoria": categoria,
        "proporcao": projeto["proporcao"],
        "taxa": projeto["taxa"],
        "fundo": projeto["fundo"],
        "faixas": faixas,
        "duracao": duracao_do_projeto(faixas),
        "midias_usadas": midias_usadas(faixas),
        "capa_midia_id": capa_do_projeto(faixas),
        "vagas": vagas,
        "criado_em": momento,
        "atualizado_em": momento,
    }


def projeto_do_modelo(modelo: dict, usuario: dict) -> dict:
    """O projeto novo, igual ao modelo, que lembra de onde veio e das vagas a preencher."""
    momento = agora()
    faixas = copy.deepcopy(modelo["faixas"])
    return {
        "organizacao_id": usuario["organizacao_id"],
        "criado_por": usuario["_id"],
        "nome": modelo["nome"],
        "proporcao": modelo["proporcao"],
        "taxa": modelo["taxa"],
        "fundo": modelo["fundo"],
        "faixas": faixas,
        "versao": 1,
        "duracao": duracao_do_projeto(faixas),
        "midias_usadas": midias_usadas(faixas),
        "capa_midia_id": capa_do_projeto(faixas),
        "modelo_origem": {"id": str(modelo["_id"]), "nome": modelo["nome"], "vagas": copy.deepcopy(modelo["vagas"])},
        "criado_em": momento,
        "atualizado_em": momento,
    }
