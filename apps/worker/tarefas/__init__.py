from collections.abc import Callable
from dataclasses import dataclass

from worker.tarefas.ingestao import executar_ingestao, marcar_midia_com_erro
from worker.tarefas.limpeza_voz import executar_limpeza_voz, marcar_voz_com_erro
from worker.tarefas.renderizacao import executar_renderizacao, marcar_exportacao_com_erro
from worker.tarefas.rosto import executar_rosto, marcar_rosto_com_erro
from worker.tarefas.teste import executar_teste
from worker.tarefas.tom import executar_tom, marcar_tom_com_erro
from worker.tarefas.transcricao import executar_transcricao, marcar_transcricao_com_erro


@dataclass(frozen=True)
class Tarefa:
    # executar(db, job, reportar) -> saída do job
    executar: Callable
    # ao_falhar(db, job, mensagem): chamado quando o job vai para erro sem mais tentativas
    ao_falhar: Callable | None = None


# Tipo de job → tarefa. Os tipos e recursos ficam em core/modelos/job.py.
REGISTRO = {
    "teste": Tarefa(executar_teste),
    "ingestao": Tarefa(executar_ingestao, ao_falhar=marcar_midia_com_erro),
    "renderizacao": Tarefa(executar_renderizacao, ao_falhar=marcar_exportacao_com_erro),
    "transcricao": Tarefa(executar_transcricao, ao_falhar=marcar_transcricao_com_erro),
    "limpeza_voz": Tarefa(executar_limpeza_voz, ao_falhar=marcar_voz_com_erro),
    "tom": Tarefa(executar_tom, ao_falhar=marcar_tom_com_erro),
    "rosto": Tarefa(executar_rosto, ao_falhar=marcar_rosto_com_erro),
}
