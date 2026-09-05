/**
 * Importa para o Storage as mídias recebidas pela WhatsApp Cloud API.
 * Nunca lança: qualquer falha vira { ok:false } + registro em falhas_sistema.
 */

const BUCKET = "whatsapp-anexos";
const DEZ_ANOS_EM_SEGUNDOS = 10 * 365 * 24 * 60 * 60;

const EXTENSAO_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
  "application/pdf": "pdf",
  "text/plain": "txt",
};

function extensaoDoMime(mime: string): string {
  const limpo = String(mime ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return EXTENSAO_POR_MIME[limpo] ?? limpo.split("/")[1]?.replace(/[^a-z0-9]/g, "") ?? "bin";
}

function nomeSeguro(nome: string): string {
  return (
    String(nome ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .slice(-120) || "arquivo"
  );
}

export type MidiaImportada = {
  ok: true;
  url: string;
  path: string;
  mimeType: string;
  fileName: string;
  tamanho: number;
};

export type MidiaFalha = { ok: false; erro: string };

export async function importarMidiaInbound(input: {
  mediaId: string;
  mimeType?: string | null;
  fileName?: string | null;
  phone: string;
  waMessageId: string;
}): Promise<MidiaImportada | MidiaFalha> {
  const { registrarFalhaSegura } = await import("@/lib/guard-erros");
  const contexto = {
    wa_message_id: input.waMessageId,
    media_id: input.mediaId,
  };

  try {
    const { cloudBaixarMidia } = await import("@/lib/whatsapp-cloud.server");
    const baixado = await cloudBaixarMidia(input.mediaId);
    if (!baixado.ok) {
      await registrarFalhaSegura("whatsapp-cloud.midia", new Error(baixado.erro), {
        ...contexto,
        status: baixado.status ?? null,
      });
      return { ok: false, erro: baixado.erro };
    }

    const mimeType = input.mimeType || baixado.mimeType;
    const fileName = input.fileName?.trim()
      ? nomeSeguro(input.fileName)
      : `${input.mediaId}.${extensaoDoMime(mimeType)}`;
    const telefone = String(input.phone ?? "").replace(/\D/g, "") || "desconhecido";
    const path = `inbound/${telefone}/${nomeSeguro(input.waMessageId)}_${fileName}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, baixado.bytes, { contentType: mimeType, upsert: false });

    // Idempotente: caminho já existente = mesma mídia, segue para a signed URL.
    const jaExiste =
      !!upErr && /exists|duplicate/i.test(`${upErr.message ?? ""}`);
    if (upErr && !jaExiste) {
      await registrarFalhaSegura("whatsapp-cloud.midia", upErr, { ...contexto, path });
      return { ok: false, erro: upErr.message };
    }

    const { data: signed, error: signedErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, DEZ_ANOS_EM_SEGUNDOS);
    if (signedErr || !signed?.signedUrl) {
      await registrarFalhaSegura(
        "whatsapp-cloud.midia",
        signedErr ?? new Error("signed URL vazia"),
        { ...contexto, path },
      );
      return { ok: false, erro: signedErr?.message ?? "Não foi possível gerar o link." };
    }

    return {
      ok: true,
      url: signed.signedUrl,
      path,
      mimeType,
      fileName,
      tamanho: baixado.tamanho,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await registrarFalhaSegura("whatsapp-cloud.midia", e, contexto);
    return { ok: false, erro: msg };
  }
}
