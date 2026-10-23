# Servidor MCP do TakeOne

O servidor MCP deixa um assistente (Claude Desktop, Claude Code ou outro cliente compatível com o protocolo MCP) mexer no seu TakeOne: ver os projetos e as mídias, criar um projeto, pôr vídeos, imagens, sons e textos na linha do tempo e exportar. Ele fala com a API do TakeOne usando uma **chave de acesso** e tem as mesmas permissões que você no seu espaço.

## 1. Crie uma chave de acesso

No site, abra **Assistentes** no menu (seção Conectar), dê um nome e clique em **Criar chave**. A chave inteira só aparece uma vez: copie na hora. Para tirar o acesso de um programa, apague a chave dele na mesma página.

Uma chave não cria outras chaves. Quem tiver a chave entra no seu espaço: guarde como uma senha.

## 2. Instale o servidor

Na pasta do TakeOne:

```
pip install -r apps/servidor_mcp/requirements.txt
```

## 3. Ligue o cliente

O cliente abre o servidor pelo stdio. Na configuração do Claude Desktop (`claude_desktop_config.json`), por exemplo:

```json
{
  "mcpServers": {
    "takeone": {
      "command": "python",
      "args": ["apps/servidor_mcp/servidor.py"],
      "env": { "TAKEONE_URL": "http://localhost:8010", "TAKEONE_CHAVE": "to_..." }
    }
  }
}
```

`TAKEONE_URL` é o endereço da API (no Docker do TakeOne, a porta 8010). Use o caminho completo do `servidor.py` se o cliente não abrir na pasta do TakeOne.

## Ferramentas

| Ferramenta | O que faz |
|---|---|
| `listar_projetos` | Os projetos do espaço, com a duração e a proporção |
| `ver_projeto` | As faixas e os clipes de um projeto (tempos em segundos) |
| `listar_midias` | As mídias da biblioteca, com uma busca pelo nome |
| `criar_projeto` | Um projeto vazio, em 9:16, 16:9, 1:1 ou 4:5 |
| `adicionar_midia` | Uma mídia no fim do vídeo (vídeos e imagens na principal, sons numa faixa de áudio), com a entrada e a duração |
| `adicionar_texto` | Um texto por cima do vídeo, num instante e por uma duração |
| `exportar` | Exporta em MP4, GIF, M4A ou WAV, em 720p, 1080p ou 4K |
| `ver_exportacao` | O andamento de uma exportação e o endereço para baixar quando fica pronta |

O assistente vê o mesmo que o editor: o que ele monta aparece no projeto (e o editor aberto em outra aba avisa que o projeto mudou).
