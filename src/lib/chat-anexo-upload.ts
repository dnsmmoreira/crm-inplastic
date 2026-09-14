/**
 * Upload de anexo do Chat Interno com progresso real.
 * O SDK do Storage não expõe progresso, então falamos direto com o endpoint
 * REST via XHR, usando o token da sessão do próprio usuário (a RLS do bucket
 * continua valendo — nada aqui contorna permissão).
 */
import { supabase } from "@/integrations/supabase/client";

export type ResultadoUploadAnexo = { ok: true } | { ok: false; erro: string };

function urlStorage(bucket: string, path: string): string | null {
  const base = import.meta.env['VITE_SUPABASE_URL'];
  if (!base) return null;
  const destino = path
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
  return `${String(base).replace(/\/$/, "")}/storage/v1/object/${bucket}/${destino}`;
}

export async function enviarAnexoComProgresso(opts: {
  bucket: string;
  path: string;
  arquivo: File;
  onProgress?: (pct: number) => void;
}): Promise<ResultadoUploadAnexo> {
  const { bucket, path, arquivo, onProgress } = opts;
  const url = urlStorage(bucket, path);
  if (!url) return { ok: false, erro: "Armazenamento indisponível no momento." };

  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao?.session?.access_token;
  if (!token) return { ok: false, erro: "Sua sessão expirou. Entre de novo para enviar arquivos." };

  const apikey = String(import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ?? "");

  return await new Promise<ResultadoUploadAnexo>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (apikey) xhr.setRequestHeader("apikey", apikey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "3600");
    xhr.setRequestHeader("content-type", arquivo.type || "application/octet-stream");

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !onProgress) return;
      onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onerror = () => resolve({ ok: false, erro: "Falha de conexão ao enviar o arquivo." });
    xhr.onabort = () => resolve({ ok: false, erro: "Envio cancelado." });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve({ ok: true });
        return;
      }
      if (xhr.status === 403 || xhr.status === 401) {
        resolve({ ok: false, erro: "Você não tem permissão para enviar arquivo nesta conversa." });
        return;
      }
      if (xhr.status === 413) {
        resolve({ ok: false, erro: "Arquivo maior que o limite de 15 MB." });
        return;
      }
      resolve({ ok: false, erro: `Não consegui enviar o arquivo (erro ${xhr.status}).` });
    };
    xhr.send(arquivo);
  });
}
