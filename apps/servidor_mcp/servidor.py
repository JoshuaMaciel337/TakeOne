# -----------------------------------------------
# TakeOne — servidor MCP
#
# Deixa um assistente (Claude Desktop, Claude Code ou outro cliente MCP) mexer no TakeOne da pessoa: ver os
# projetos e as mídias, criar um projeto, pôr mídias e textos na linha do tempo e exportar. Ele fala com a API
# do TakeOne usando uma chave de acesso (criada no site, em Chaves de acesso), com as mesmas permissões da pessoa.
#
#   TAKEONE_URL=http://localhost:8010 TAKEONE_CHAVE=to_... python apps/servidor_mcp/servidor.py
#
# Roda pelo stdio (o cliente abre o processo). Veja docs/mcp.md.
# -----------------------------------------------
import logging
import os
import secrets

import httpx
from mcp.server.fastmcp import FastMCP

# Ticks por segundo do projeto (core/utils/tempo.py): o servidor não importa o core, para rodar fora do repositório
TICKS_POR_SEGUNDO = 254_016_000_000
DURACAO_DA_IMAGEM_S = 5
PROPORCOES = ("9:16", "16:9", "1:1", "4:5")


class ErroDoTakeOne(RuntimeError):
    """A API respondeu com erro: a mensagem dela vai para o assistente."""


class TakeOne:
    """O cliente da API do TakeOne, com a chave de acesso no Authorization."""

    def __init__(self, url: str, chave: str, http: httpx.Client | None = None):
        # `http`: um cliente já montado (os testes passam o da própria API)
        self.http = http or httpx.Client(base_url=url.rstrip("/"), timeout=60)
        self.cabecalhos = {"Authorization": f"Bearer {chave}"}

    def pedir(self, metodo: str, caminho: str, **opcoes):
        resposta = self.http.request(metodo, f"/api{caminho}", headers=self.cabecalhos, **opcoes)
        if resposta.status_code >= 400:
            try:
                detalhe = resposta.json().get("detail")
            except ValueError:
                detalhe = None
            raise ErroDoTakeOne(detalhe if isinstance(detalhe, str) else f"O TakeOne respondeu {resposta.status_code}.")
        return resposta.json() if resposta.content else None


def _segundos(ticks: int | None) -> float:
    return round((ticks or 0) / TICKS_POR_SEGUNDO, 3)


def _ticks(segundos: float) -> int:
    return round(segundos * TICKS_POR_SEGUNDO)


def _id() -> str:
    return secrets.token_hex(8)


def _fim(faixa: dict) -> int:
    return max((c["inicio"] + c["duracao"] for c in faixa["clipes"]), default=0)


def _salvar(takeone: TakeOne, projeto: dict) -> dict:
    """Salva o projeto inteiro, como o editor (a versão impede apagar o que outra aba salvou antes)."""
    corpo = {campo: projeto[campo] for campo in ("versao", "nome", "proporcao", "taxa", "fundo", "faixas")}
    corpo["marcadores"] = projeto.get("marcadores") or []
    return takeone.pedir("PUT", f"/projetos/{projeto['id']}", json=corpo)


def criar_servidor(takeone: TakeOne) -> FastMCP:
    servidor = FastMCP(
        "TakeOne",
        instructions="Editor de vídeo TakeOne: veja os projetos e as mídias da pessoa, monte vídeos na linha do tempo "
                     "e exporte. Os tempos são em segundos. Mexa só no que a pessoa pediu.",
    )

    @servidor.tool()
    def listar_projetos() -> list[dict]:
        """Os projetos do espaço, do mais novo ao mais antigo: id, nome, duração (segundos) e proporção."""
        return [{"id": p["id"], "nome": p["nome"], "duracao_s": _segundos(p.get("duracao")),
                 "proporcao": p.get("proporcao"), "atualizado_em": p.get("atualizado_em")}
                for p in takeone.pedir("GET", "/projetos")]

    @servidor.tool()
    def ver_projeto(projeto_id: str) -> dict:
        """O projeto com as faixas e os clipes (mídia, texto, começo e duração em segundos)."""
        projeto = takeone.pedir("GET", f"/projetos/{projeto_id}")
        return {
            "id": projeto["id"], "nome": projeto["nome"], "proporcao": projeto["proporcao"],
            "duracao_s": _segundos(projeto.get("duracao")),
            "faixas": [{"id": f["id"], "tipo": f["tipo"], "clipes": [
                {"id": c["id"], "midia_id": c.get("midia_id"), "texto": (c.get("texto") or {}).get("conteudo"),
                 "inicio_s": _segundos(c["inicio"]), "duracao_s": _segundos(c["duracao"])} for c in f["clipes"]]}
                for f in projeto["faixas"]],
        }

    @servidor.tool()
    def listar_midias(busca: str = "") -> list[dict]:
        """As mídias da biblioteca (vídeos, imagens e sons): id, nome, tipo, duração e se está pronta. `busca` filtra
        pelo nome."""
        midias = takeone.pedir("GET", "/midias", params={"limite": 200})
        termo = busca.strip().lower()
        return [{"id": m["id"], "nome": m["nome"],
                 "tipo": "imagem" if m.get("imagem") else "video" if m.get("video") else "som",
                 "duracao_s": m.get("duracao"), "pronta": m.get("status") == "pronta"}
                for m in midias if not termo or termo in m["nome"].lower()]

    @servidor.tool()
    def criar_projeto(nome: str, proporcao: str = "9:16") -> dict:
        """Cria um projeto vazio. Proporções: 9:16 (em pé), 16:9 (deitado), 1:1 ou 4:5."""
        if proporcao not in PROPORCOES:
            raise ErroDoTakeOne(f"Use uma destas proporções: {', '.join(PROPORCOES)}.")
        projeto = takeone.pedir("POST", "/projetos", json={"proporcao": proporcao})
        projeto["nome"] = nome.strip()[:120] or projeto["nome"]
        salvo = _salvar(takeone, projeto)
        return {"id": salvo["id"], "nome": salvo["nome"], "proporcao": salvo["proporcao"]}

    @servidor.tool()
    def adicionar_midia(projeto_id: str, midia_id: str, entrada_s: float = 0, duracao_s: float | None = None) -> dict:
        """Põe uma mídia no fim do vídeo: vídeos e imagens na faixa principal, sons numa faixa de áudio. `entrada_s` é
        de onde a mídia começa; `duracao_s`, quanto dela entra (sem ela, até o fim; uma imagem fica 5 s)."""
        midia = takeone.pedir("GET", f"/midias/{midia_id}")
        if midia.get("status") != "pronta":
            raise ErroDoTakeOne(f'A mídia "{midia["nome"]}" ainda está sendo preparada.')
        projeto = takeone.pedir("GET", f"/projetos/{projeto_id}")
        imagem, so_som = bool(midia.get("imagem")), not midia.get("video")
        total = None if imagem else float(midia.get("duracao") or 0)
        if total is not None and not 0 <= entrada_s < total:
            raise ErroDoTakeOne(f"A mídia tem {total:.1f} s: a entrada precisa ficar antes disso.")
        duracao = duracao_s or (DURACAO_DA_IMAGEM_S if imagem else total - entrada_s)
        if total is not None:
            duracao = min(duracao, total - entrada_s)
        if duracao <= 0:
            raise ErroDoTakeOne("A duração precisa ser maior que zero.")
        faixa = next((f for f in projeto["faixas"] if f["tipo"] == ("audio" if so_som else "principal")), None)
        if faixa is None:
            faixa = {"id": _id(), "tipo": "audio", "clipes": []}
            projeto["faixas"].append(faixa)
        clipe = {"id": _id(), "midia_id": midia_id, "inicio": _fim(faixa), "duracao": _ticks(duracao),
                 "entrada": 0 if imagem else _ticks(entrada_s), "velocidade": 1, "volume": 1}
        faixa["clipes"].append(clipe)
        salvo = _salvar(takeone, projeto)
        return {"clipe_id": clipe["id"], "inicio_s": _segundos(clipe["inicio"]), "duracao_s": round(duracao, 3),
                "duracao_do_projeto_s": _segundos(salvo.get("duracao"))}

    @servidor.tool()
    def adicionar_texto(projeto_id: str, texto: str, inicio_s: float, duracao_s: float = 3) -> dict:
        """Põe um texto por cima do vídeo, do instante `inicio_s` por `duracao_s` segundos (uma linha por quebra)."""
        if not texto.strip():
            raise ErroDoTakeOne("O texto está vazio.")
        projeto = takeone.pedir("GET", f"/projetos/{projeto_id}")
        inicio, duracao = _ticks(max(inicio_s, 0)), _ticks(max(duracao_s, 0.2))
        # Numa faixa de texto onde caiba sem encostar em outro texto; sem nenhuma, uma nova no topo
        faixa = next((f for f in projeto["faixas"] if f["tipo"] == "texto" and all(
            c["inicio"] + c["duracao"] <= inicio or c["inicio"] >= inicio + duracao for c in f["clipes"])), None)
        if faixa is None:
            faixa = {"id": _id(), "tipo": "texto", "clipes": []}
            projeto["faixas"].insert(0, faixa)
        clipe = {"id": _id(), "midia_id": None, "texto": {"conteudo": texto.strip()[:500]}, "inicio": inicio,
                 "duracao": duracao, "entrada": 0, "velocidade": 1, "volume": 1}
        faixa["clipes"].append(clipe)
        _salvar(takeone, projeto)
        return {"clipe_id": clipe["id"], "inicio_s": _segundos(inicio), "duracao_s": _segundos(duracao)}

    @servidor.tool()
    def exportar(projeto_id: str, resolucao: str = "1080p", formato: str = "mp4") -> dict:
        """Exporta o projeto como está salvo (mp4, gif, m4a ou wav; resolução 720p, 1080p ou 4k). Devolve o id da
        exportação: acompanhe com ver_exportacao."""
        exportacao = takeone.pedir("POST", "/exportacoes", json={"projeto_id": projeto_id, "resolucao": resolucao,
                                                                  "formato": formato})
        return {"exportacao_id": exportacao["id"], "status": exportacao["status"]}

    @servidor.tool()
    def ver_exportacao(exportacao_id: str) -> dict:
        """O andamento de uma exportação e, pronta, o endereço para baixar (relativo ao site do TakeOne)."""
        exportacao = takeone.pedir("GET", f"/exportacoes/{exportacao_id}")
        andamento = exportacao.get("processamento") or {}
        resposta = {"status": exportacao["status"], "progresso": andamento.get("progresso"),
                    "mensagem": andamento.get("mensagem"), "erro": exportacao.get("erro")}
        if exportacao["status"] == "pronta" and exportacao.get("arquivos"):
            resposta["baixar"] = f"/api/exportacoes/{exportacao_id}/arquivos/{exportacao['arquivos'][0]}?baixar=true"
        return resposta

    return servidor


def main():
    logging.basicConfig(level=logging.WARNING)
    url, chave = os.environ.get("TAKEONE_URL", "http://localhost:8010"), os.environ.get("TAKEONE_CHAVE", "")
    if not chave:
        raise SystemExit("Defina TAKEONE_CHAVE com uma chave de acesso criada no site (Chaves de acesso).")
    criar_servidor(TakeOne(url, chave)).run()


if __name__ == "__main__":
    main()
