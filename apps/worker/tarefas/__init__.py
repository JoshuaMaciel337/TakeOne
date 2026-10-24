from collections.abc import Callable
from dataclasses import dataclass

from worker.tarefas.animacao_descrita import executar_animacao_descrita
from worker.tarefas.animacao_html import executar_animacao_html, marcar_animacao_com_erro
from worker.tarefas.batidas import executar_batidas, marcar_batidas_com_erro
from worker.tarefas.direcao import executar_direcao
from worker.tarefas.esconder_objeto import executar_esconder_objeto
from worker.tarefas.esconder_objeto import marcar_com_erro as marcar_objeto_escondido_com_erro
from worker.tarefas.esconder_rostos import executar_esconder_rostos
from worker.tarefas.esconder_rostos import marcar_com_erro as marcar_rostos_com_erro
from worker.tarefas.estabilizacao import executar_estabilizacao, marcar_estabilizacao_com_erro
from worker.tarefas.fala import executar_fala
from worker.tarefas.fluido import executar_fluido, marcar_fluido_com_erro
from worker.tarefas.foto_ia import executar_ampliar, executar_expandir, executar_foto_3d
from worker.tarefas.geracao_video import (
    executar_geracao_imagem,
    executar_geracao_video,
    executar_preenchimento,
    marcar_geracao_com_erro,
)
from worker.tarefas.ingestao import executar_ingestao, marcar_midia_com_erro
from worker.tarefas.inversao import executar_inversao, marcar_inversao_com_erro
from worker.tarefas.limpeza_imagem import executar_limpeza_imagem, marcar_imagem_com_erro
from worker.tarefas.limpeza_voz import executar_limpeza_voz, marcar_voz_com_erro
from worker.tarefas.objeto import executar_objeto, executar_selecao
from worker.tarefas.palavras_chave import executar_palavras_chave
from worker.tarefas.quadro import executar_quadro
from worker.tarefas.qualidade import executar_qualidade, marcar_qualidade_com_erro
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
    "esconder_rostos": Tarefa(executar_esconder_rostos, ao_falhar=marcar_rostos_com_erro),
    "esconder_objeto": Tarefa(executar_esconder_objeto, ao_falhar=marcar_objeto_escondido_com_erro),
    "limpeza_imagem": Tarefa(executar_limpeza_imagem, ao_falhar=marcar_imagem_com_erro),
    "estabilizacao": Tarefa(executar_estabilizacao, ao_falhar=marcar_estabilizacao_com_erro),
    "rosto": Tarefa(executar_rosto, ao_falhar=marcar_rosto_com_erro),
    "rastreio": Tarefa(executar_rastreio, ao_falhar=marcar_rastreio_com_erro),
    "qualidade": Tarefa(executar_qualidade, ao_falhar=marcar_qualidade_com_erro),
    "batidas": Tarefa(executar_batidas, ao_falhar=marcar_batidas_com_erro),
    "fala": Tarefa(executar_fala, ao_falhar=marcar_geracao_com_erro),
    "animacao_html": Tarefa(executar_animacao_html, ao_falhar=marcar_animacao_com_erro),
    "selecao": Tarefa(executar_selecao),
    "objeto": Tarefa(executar_objeto, ao_falhar=marcar_geracao_com_erro),
    "quadro": Tarefa(executar_quadro, ao_falhar=marcar_geracao_com_erro),
    "inversao": Tarefa(executar_inversao, ao_falhar=marcar_inversao_com_erro),
    "fluido": Tarefa(executar_fluido, ao_falhar=marcar_fluido_com_erro),
    "ampliar": Tarefa(executar_ampliar, ao_falhar=marcar_geracao_com_erro),
    "expandir": Tarefa(executar_expandir, ao_falhar=marcar_geracao_com_erro),
    "foto_3d": Tarefa(executar_foto_3d, ao_falhar=marcar_geracao_com_erro),
    "direcao": Tarefa(executar_direcao),
    "palavras_chave": Tarefa(executar_palavras_chave),
    "animacao_descrita": Tarefa(executar_animacao_descrita, ao_falhar=marcar_animacao_com_erro),
    "geracao_video": Tarefa(executar_geracao_video, ao_falhar=marcar_geracao_com_erro),
    "geracao_imagem": Tarefa(executar_geracao_imagem, ao_falhar=marcar_geracao_com_erro),
    "preenchimento": Tarefa(executar_preenchimento, ao_falhar=marcar_geracao_com_erro),
}
