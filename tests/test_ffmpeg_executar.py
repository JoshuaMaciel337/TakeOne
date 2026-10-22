# executar_ffmpeg: quem acompanha o progresso pode mandar parar, e o FFmpeg não segue sozinho
import shutil
import time

import pytest

from core.utils.ffmpeg import ErroFFmpeg, executar_ffmpeg


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg não instalado")
def test_parar_no_progresso_mata_o_ffmpeg():
    def reportar(_fracao):
        raise RuntimeError("cancelado")

    inicio = time.monotonic()
    with pytest.raises(ErroFFmpeg, match="interrompido"):
        executar_ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=600", "-c:v", "libx264",
                         "-preset", "ultrafast", "-f", "null", "-"], 600, reportar)
    assert time.monotonic() - inicio < 30
