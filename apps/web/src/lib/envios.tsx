"use client";

import type { DetailedError, Upload } from "tus-js-client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { nomeParaEnviar } from "./extensoesAceitas";

export { ACEITAR_ARQUIVOS, ACEITAR_IMAGENS } from "./extensoesAceitas";

export type EstadoEnvio = "preparando" | "enviando" | "pausado" | "erro";

export type Envio = {
  chave: string;
  nome: string;
  tamanho: number;
  enviado: number;
  estado: EstadoEnvio;
  erro?: string;
  midiaId?: string;
  /** O álbum de fotos para onde vai (a página do álbum mostra o andamento; as outras listas, não). */
  album?: string;
};

export type OpcoesDoEnvio = {
  /** Chamado com o id da mídia assim que a API cria o envio (a gravação de narração entra no instante dela). */
  aoCriar?: (midiaId: string) => void;
  /** O álbum de fotos de destino (a API só aceita fotos). */
  album?: string;
  /** O caminho de cada arquivo dentro da pasta enviada ("Cerimônia/IMG_01.jpg"), que o álbum guarda. */
  caminhos?: Map<File, string>;
};

// Pedaços abaixo de 10 MB: é o limite de corpo do Next e fica longe dos 100 MB da Cloudflare
const TAMANHO_PEDACO = 8 * 1024 * 1024;
// Se a internet cair, tenta de novo com espera crescente e continua de onde parou
const ESPERAS_MS = [0, 1_000, 3_000, 5_000, 10_000, 20_000, 30_000, 60_000];
// Envios ao mesmo tempo: os outros esperam na fila (uma pasta de ensaio tem milhares de fotos)
const ENVIOS_SIMULTANEOS = 4;

function statusDoErro(erro: Error): number | undefined {
  return (erro as DetailedError).originalResponse?.getStatus() || undefined;
}

/** Tenta de novo em queda de rede e erro temporário do servidor, nunca em recusa (formato, tamanho, espaço). */
function deveTentarDeNovo(erro: DetailedError): boolean {
  const status = statusDoErro(erro);
  if (!status) return true;
  if (status === 409 || status === 423) return true;
  return status >= 500 && status !== 507;
}

function mensagemDoErro(erro: Error): string {
  const status = statusDoErro(erro);
  const corpo = (erro as DetailedError).originalResponse?.getBody()?.trim();
  if (status === 401) return "Sua sessão expirou. Entre de novo e selecione o arquivo para continuar.";
  if (status && corpo && corpo.length < 300 && !corpo.startsWith("<")) return corpo;
  if (!status) return "A conexão caiu. Tente de novo: o envio continua de onde parou.";
  return "O envio falhou. Tente de novo: ele continua de onde parou.";
}

type ContextoEnvios = {
  envios: Envio[];
  /** Muda sempre que uma mídia é criada ou termina de chegar, para as listas recarregarem. */
  versao: number;
  iniciar: (arquivos: File[], opcoes?: OpcoesDoEnvio) => void;
  pausar: (chave: string) => void;
  retomar: (chave: string) => void;
  cancelar: (chave: string) => void;
  dispensar: (chave: string) => void;
};

const Contexto = createContext<ContextoEnvios | null>(null);

export function ProvedorEnvios({ children }: { children: React.ReactNode }) {
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [versao, setVersao] = useState(0);
  const uploads = useRef(new Map<string, Upload>());
  // Os que já começaram e ainda não terminaram (contam no limite) e os que esperam a vez, na ordem
  const ativos = useRef(new Set<string>());
  const fila = useRef<string[]>([]);

  const atualizar = useCallback((chave: string, campos: Partial<Envio>) => {
    setEnvios((lista) => lista.map((envio) => (envio.chave === chave ? { ...envio, ...campos } : envio)));
  }, []);

  const comecarProximos = useCallback(() => {
    while (ativos.current.size < ENVIOS_SIMULTANEOS && fila.current.length) {
      const chave = fila.current.shift()!;
      const upload = uploads.current.get(chave);
      if (!upload) continue;
      ativos.current.add(chave);
      void upload.findPreviousUploads().then((anteriores) => {
        if (!uploads.current.has(chave)) return; // cancelado enquanto procurava
        if (anteriores.length > 0) upload.resumeFromPreviousUpload(anteriores[0]);
        upload.start();
      });
    }
  }, []);

  /** O envio parou (terminou, deu erro, foi pausado ou cancelado): libera a vez para o próximo da fila. */
  const liberar = useCallback(
    (chave: string) => {
      ativos.current.delete(chave);
      comecarProximos();
    },
    [comecarProximos],
  );

  const remover = useCallback(
    (chave: string) => {
      uploads.current.delete(chave);
      fila.current = fila.current.filter((item) => item !== chave);
      setEnvios((lista) => lista.filter((envio) => envio.chave !== chave));
      liberar(chave);
    },
    [liberar],
  );

  const iniciar = useCallback(
    async (arquivos: File[], opcoes: OpcoesDoEnvio = {}) => {
      const { Upload: ClasseUpload } = await import("tus-js-client");
      const { aoCriar, album, caminhos } = opcoes;
      const novos: Envio[] = [];
      for (const arquivo of arquivos) {
        const caminho = caminhos?.get(arquivo) ?? (arquivo.webkitRelativePath || arquivo.name);
        const chave = `${album ?? ""}:${caminho}-${arquivo.size}-${arquivo.lastModified}`;
        if (uploads.current.has(chave)) continue; // este arquivo já está sendo enviado
        const nome = nomeParaEnviar(arquivo.name, arquivo.type);
        const envio: Envio = { chave, nome: nome ?? arquivo.name, tamanho: arquivo.size, enviado: 0, estado: "preparando", album };
        if (!nome) {
          envio.estado = "erro";
          envio.erro = "Formato não aceito. Envie um vídeo (MP4, MOV, MKV...), um áudio (MP3, WAV, M4A...) ou uma imagem (JPG, PNG, WebP).";
        }
        novos.push(envio);
        if (envio.estado === "erro") continue;
        const metadata: Record<string, string> = { filename: envio.nome, filetype: arquivo.type };
        if (album) {
          metadata.album = album;
          metadata.caminho = caminho;
        }

        const upload: Upload = new ClasseUpload(arquivo, {
          endpoint: "/api/uploads",
          chunkSize: TAMANHO_PEDACO,
          retryDelays: ESPERAS_MS,
          metadata,
          storeFingerprintForResuming: true,
          removeFingerprintOnSuccess: true,
          onShouldRetry: deveTentarDeNovo,
          onUploadUrlAvailable: () => {
            const midiaId = upload.url?.split("/").pop();
            atualizar(chave, { estado: "enviando", midiaId });
            // As fotos de um álbum não estão na biblioteca: não fazem as listas recarregarem
            if (!album) setVersao((valor) => valor + 1);
            if (midiaId) aoCriar?.(midiaId);
          },
          onProgress: (enviado, total) => atualizar(chave, { enviado, tamanho: total, estado: "enviando" }),
          onSuccess: () => {
            remover(chave);
            if (!album) setVersao((valor) => valor + 1);
          },
          onError: (erro) => {
            atualizar(chave, { estado: "erro", erro: mensagemDoErro(erro) });
            liberar(chave);
          },
        });
        uploads.current.set(chave, upload);
        fila.current.push(chave);
      }
      // Um estado só para a leva toda (milhares de fotos de uma pasta não viram milhares de renderizações)
      const chaves = new Set(novos.map((envio) => envio.chave));
      setEnvios((lista) => [...novos, ...lista.filter((item) => !chaves.has(item.chave))]);
      comecarProximos();
    },
    [atualizar, remover, liberar, comecarProximos],
  );

  const pausar = useCallback(
    (chave: string) => {
      uploads.current.get(chave)?.abort();
      fila.current = fila.current.filter((item) => item !== chave);
      atualizar(chave, { estado: "pausado" });
      liberar(chave);
    },
    [atualizar, liberar],
  );

  const retomar = useCallback(
    (chave: string) => {
      if (!uploads.current.has(chave)) return;
      atualizar(chave, { estado: "preparando", erro: undefined });
      fila.current.push(chave);
      comecarProximos();
    },
    [atualizar, comecarProximos],
  );

  const cancelar = useCallback(
    (chave: string) => {
      const upload = uploads.current.get(chave);
      remover(chave);
      upload
        ?.abort(true)
        .catch(() => undefined)
        .finally(() => setVersao((valor) => valor + 1));
    },
    [remover],
  );

  // Avisa antes de fechar a aba no meio de um envio
  const enviando = envios.some((envio) => envio.estado === "enviando" || envio.estado === "preparando");
  useEffect(() => {
    if (!enviando) return;
    const avisar = (evento: BeforeUnloadEvent) => evento.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [enviando]);

  return (
    <Contexto.Provider
      value={{
        envios,
        versao,
        iniciar: (arquivos, opcoes) => void iniciar(arquivos, opcoes),
        pausar,
        retomar,
        cancelar,
        dispensar: remover,
      }}
    >
      {children}
    </Contexto.Provider>
  );
}

export function useEnvios(): ContextoEnvios {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error("useEnvios precisa estar dentro de ProvedorEnvios");
  return contexto;
}
