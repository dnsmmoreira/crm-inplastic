import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { caminhoStorage, type EntidadeDocumento } from "@/lib/documentos";
import { BUCKET_DOCUMENTOS, registrarDocumento } from "@/lib/documentos.functions";

export const MAX_BYTES_DOCUMENTO = 25 * 1024 * 1024;

/** Chave de cache da lista de documentos de uma entidade. */
export function chaveDocumentos(entidadeTipo: EntidadeDocumento, entidadeId: string) {
  return ["documentos", entidadeTipo, entidadeId] as const;
}

/**
 * Upload de anexo reaproveitado pela seção de documentos e pelo bloco de
 * comprovação de entrega (que usa categoria fixa por área de upload).
 */
export function useUploadDocumento(entidadeTipo: EntidadeDocumento, entidadeId: string) {
  const qc = useQueryClient();
  const registrarFn = useServerFn(registrarDocumento);
  const [enviando, setEnviando] = useState(false);

  async function enviar(
    file: File,
    categoria: string,
    categoriaOutro?: string | null,
  ): Promise<void> {
    if (file.size > MAX_BYTES_DOCUMENTO) {
      throw new Error("Arquivo muito grande — o limite é de 25 MB por arquivo.");
    }
    setEnviando(true);
    try {
      const uid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
      const path = caminhoStorage(entidadeTipo, entidadeId, file.name, uid);
      const { error: upErr } = await supabase.storage
        .from(BUCKET_DOCUMENTOS)
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) throw new Error(upErr.message);

      await registrarFn({
        data: {
          entidadeTipo,
          entidadeId,
          categoria,
          categoriaOutro: categoria === "outro" ? (categoriaOutro ?? "").trim() : null,
          nomeArquivo: file.name,
          storagePath: path,
          tamanhoBytes: file.size,
          contentType: file.type || null,
        },
      });
      await qc.invalidateQueries({ queryKey: chaveDocumentos(entidadeTipo, entidadeId) });
    } finally {
      setEnviando(false);
    }
  }

  return { enviando, enviar };
}
