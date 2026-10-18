from collections.abc import Callable
from dataclasses import dataclass

from worker.tarefas.animacao_descrita import executar_animacao_descrita
from worker.tarefas.animacao_html import executar_animacao_html, marcar_animacao_com_erro
from worker.tarefas.batidas import executar_batidas, marcar_batidas_com_erro
from worker.tarefas.direcao import executar_direcao
from worker.tarefas.estabilizacao import executar_estabilizacao, marcar_estabilizacao_com_erro
from worker.tarefas.fala import executar_fala
from worker.tarefas.geracao_video import executar_geracao_video, marcar_geracao_com_erro
from worker.tarefas.ingestao import executar_ingestao, marcar_midia_com_erro
from worker.tarefas.limpeza_imagem import executar_limpeza_imagem, marcar_imagem_com_erro
from worker.tarefas.limpeza_voz import executar_limpeza_voz, marcar_voz_com_erro
from worker.tarefas.palavras_chave import executar_palavras_chave
from worker.tarefas.rastreio import executar_rastreio, marcar_rastreio_com_erro
from worker.tarefas.recorte_fundo import executar_recorte_fundo, marcar_recorte_com_erro
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
    "recorte_fundo": Tarefa(executar_recorte_fundo, ao_falhar=marcar_recorte_com_erro),
    "limpeza_imagem": Tarefa(executar_limpeza_imagem, ao_falhar=marcar_imagem_com_erro),
    "estabilizacao": Tarefa(executar_estabilizacao, ao_falhar=marcar_estabilizacao_com_erro),
    "rosto": Tarefa(executar_rosto, ao_falhar=marcar_rosto_com_erro),
    "rastreio": Tarefa(executar_rastreio, ao_falhar=marcar_rastreio_com_erro),
    "batidas": Tarefa(executar_batidas, ao_falhar=marcar_batidas_com_erro),
    "fala": Tarefa(executar_fala, ao_falhar=marcar_geracao_com_erro),
    "animacao_html": Tarefa(executar_animacao_html, ao_falhar=marcar_animacao_com_erro),
    "direcao": Tarefa(executar_direcao),
    "palavras_chave": Tarefa(executar_palavras_chave),
    "animacao_descrita": Tarefa(executar_animacao_descrita, ao_falhar=marcar_animacao_com_erro),
    "geracao_video": Tarefa(executar_geracao_video, ao_falhar=marcar_geracao_com_erro),
}
