import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import {
  calcularExpiracao,
  validarCategoria,
  type EntidadeDocumento,
} from "@/lib/documentos";

export const BUCKET_DOCUMENTOS = "documentos-anexos";

export type DocumentoRow = {
  id: string;
  entidade_tipo: string;
  entidade_id: string;
  categoria: string;
  categoria_outro: string | null;
  nome_arquivo: string;
  storage_path: string;
  tamanho_bytes: number | null;
  content_type: string | null;
  enviado_por: string | null;
  enviado_em: string;
  expira_em: string | null;
  enviado_por_nome?: string | null;
};

const SELECT_COLS =
  "id, entidade_tipo, entidade_id, categoria, categoria_outro, nome_arquivo, storage_path, tamanho_bytes, content_type, enviado_por, enviado_em, expira_em";

function normalizarTipo(v: unknown): EntidadeDocumento {
  const t = String(v ?? "");
  if (t !== "cliente" && t !== "pedido") throw new Error("Tipo de entidade inválido.");
  return t;
}

export const listarDocumentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { entidadeTipo: string; entidadeId: string }) => ({
    entidadeTipo: normalizarTipo(data?.entidadeTipo),
    entidadeId: String(data?.entidadeId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    if (!data.entidadeId) return [] as DocumentoRow[];
    const { data: rows, error } = await context.supabase
      .from("documentos")
      .select(SELECT_COLS)
      .eq("entidade_tipo", data.entidadeTipo)
      .eq("entidade_id", data.entidadeId)
      .is("removido_em", null)
      .order("enviado_em", { ascending: false });
    if (error) throw new Error(error.message);

    const docs = (rows ?? []) as DocumentoRow[];
    const ids = Array.from(new Set(docs.map((d) => d.enviado_por).filter(Boolean))) as string[];
    if (ids.length > 0) {
      const { data: perfis } = await context.supabase
        .from("profiles")
        .select("id, name")
        .in("id", ids);
      const mapa = new Map((perfis ?? []).map((p) => [p.id, p.name]));
      for (const d of docs) {
        d.enviado_por_nome = d.enviado_por ? (mapa.get(d.enviado_por) ?? null) : null;
      }
    }
    return docs;
  });

export const registrarDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      entidadeTipo: string;
      entidadeId: string;
      categoria: string;
      categoriaOutro?: string | null;
      nomeArquivo: string;
      storagePath: string;
      tamanhoBytes?: number | null;
      contentType?: string | null;
    }) => {
      const erro = validarCategoria(data?.categoria, data?.categoriaOutro);
      if (erro) throw new Error(erro);
      const entidadeId = String(data?.entidadeId ?? "");
      if (!entidadeId) throw new Error("Entidade inválida.");
      const storagePath = String(data?.storagePath ?? "").trim();
      if (!storagePath) throw new Error("Arquivo inválido.");
      return {
        entidadeTipo: normalizarTipo(data?.entidadeTipo),
        entidadeId,
        categoria: String(data.categoria),
        categoriaOutro: (data?.categoriaOutro ?? "").toString().trim() || null,
        nomeArquivo: String(data?.nomeArquivo ?? "arquivo").slice(0, 255),
        storagePath,
        tamanhoBytes: data?.tamanhoBytes != null ? Number(data.tamanhoBytes) : null,
        contentType: data?.contentType ? String(data.contentType) : null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const enviadoEm = new Date();
    const { data: row, error } = await context.supabase
      .from("documentos")
      .insert({
        entidade_tipo: data.entidadeTipo,
        entidade_id: data.entidadeId,
        categoria: data.categoria,
        categoria_outro: data.categoria === "outro" ? data.categoriaOutro : null,
        nome_arquivo: data.nomeArquivo,
        storage_path: data.storagePath,
        tamanho_bytes: data.tamanhoBytes,
        content_type: data.contentType,
        enviado_por: context.userId,
        enviado_em: enviadoEm.toISOString(),
        expira_em: calcularExpiracao(enviadoEm).toISOString(),
      })
      .select(SELECT_COLS)
      .single();
    if (error) throw new Error(error.message);
    return row as DocumentoRow;
  });

export const obterUrlDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentoId: string }) => ({
    documentoId: String(data?.documentoId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    // RLS garante que só quem enxerga a entidade encontra a linha.
    const { data: doc, error } = await context.supabase
      .from("documentos")
      .select("storage_path, nome_arquivo")
      .eq("id", data.documentoId)
      .is("removido_em", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Documento não encontrado ou sem acesso.");

    const { data: signed, error: signErr } = await context.supabase.storage
      .from(BUCKET_DOCUMENTOS)
      .createSignedUrl(doc.storage_path, 60, { download: doc.nome_arquivo });
    if (signErr) throw new Error(signErr.message);
    return { url: signed.signedUrl };
  });

export const arquivarDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentoId: string }) => ({
    documentoId: String(data?.documentoId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("documentos")
      .update({ removido_em: new Date().toISOString(), removido_por: context.userId })
      .eq("id", data.documentoId)
      .is("removido_em", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) {
      throw new Error("Não foi possível remover — documento inexistente ou sem permissão.");
    }
    return { ok: true };
  });
