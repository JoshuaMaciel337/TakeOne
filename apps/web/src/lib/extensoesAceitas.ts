/** As extensões que a API aceita e o nome com que cada arquivo sobe (lib/envios.tsx). */
// Mesma lista de core/config.py
export const EXTENSOES_ACEITAS = [
  ".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm", ".mts", ".m2ts", ".ts",
  ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac",
  ".jpg", ".jpeg", ".png", ".webp", ".svg", ".gif", ".bmp", ".tif", ".tiff", ".avif", ".heic", ".heif",
  // O RAW das câmeras (pelo JPEG que a câmera grava dentro dele)
  ".cr2", ".cr3", ".nef", ".nrw", ".arw", ".srf", ".sr2", ".raf", ".dng", ".orf", ".rw2", ".pef", ".srw",
];
export const ACEITAR_ARQUIVOS = ["video/*", "audio/*", "image/*", ...EXTENSOES_ACEITAS].join(",");
/** Só as imagens (Arquivo › Abrir do editor de imagem). */
export const ACEITAR_IMAGENS = ["image/*", ...EXTENSOES_ACEITAS.slice(EXTENSOES_ACEITAS.indexOf(".jpg"))].join(",");

export function extensaoAceita(nome: string): boolean {
  const indice = nome.lastIndexOf(".");
  return indice >= 0 && EXTENSOES_ACEITAS.includes(nome.slice(indice).toLowerCase());
}

// A extensão pelo tipo do arquivo: a galeria de alguns celulares entrega a foto sem extensão no nome ("IMG_9755")
const EXTENSAO_DO_TIPO: Record<string, string> = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif",
  "image/heic-sequence": ".heic", "image/heif-sequence": ".heif", "image/gif": ".gif", "image/avif": ".avif",
  "image/tiff": ".tif", "image/bmp": ".bmp", "image/svg+xml": ".svg", "image/x-adobe-dng": ".dng",
  "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm", "video/x-matroska": ".mkv", "video/3gpp": ".mp4",
  "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/aac": ".aac", "audio/wav": ".wav",
  "audio/x-wav": ".wav", "audio/ogg": ".ogg", "audio/flac": ".flac", "audio/webm": ".webm",
};

/** O nome com que o arquivo sobe: o dele, ou com a extensão do tipo quando ele não tem uma conhecida; null se nenhum dos dois. */
export function nomeParaEnviar(nome: string, tipo: string): string | null {
  if (extensaoAceita(nome)) return nome;
  const extensao = EXTENSAO_DO_TIPO[tipo.toLowerCase()];
  return extensao ? `${nome || "arquivo"}${extensao}` : null;
}
