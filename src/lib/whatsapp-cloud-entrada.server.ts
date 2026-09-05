/**
 * Ponte entre o payload da Meta e o pipeline único de entrada.
 * Usado pelo webhook (tempo real) e pelo reprocessamento do backlog.
 */
import { mapearMensagemCloud, rotuloPadrao } from "@/lib/whatsapp-cloud-mapeamento";
import type { MensagemTipo } from "@/lib/zapi-normalize";

const TIPOS_COM_MIDIA: MensagemTipo[] = ["imagem", "documento", "audio", "video", "figurinha"];

export type ResultadoMensagemCloud = {
  gravado: boolean;
  tipo: MensagemTipo;
  midiaOk: boolean;
  erro?: string;
};

export async function processarMensagemCloud(input: {
  msg: Record<string, unknown>;
  phone: string;
  nomeContato: string | null;
  waMessageId: string | null;
  tag: string;
  silencioso?: boolean;
  criadoEm?: string;
}): Promise<ResultadoMensagemCloud> {
  const { msg, phone, nomeContato, waMessageId, tag } = input;
  const mapeado = mapearMensagemCloud(msg);

  let midia: Record<string, unknown> | null = null;
  let texto = mapeado.texto;
  let midiaOk = true;
  let erro: string | undefined;

  if (TIPOS_COM_MIDIA.includes(mapeado.tipo) && mapeado.mediaId) {
    const { importarMidiaInbound } = await import("@/lib/whatsapp-midia-inbound.server");
    const importado = await importarMidiaInbound({
      mediaId: mapeado.mediaId,
      mimeType: mapeado.mimeType,
      fileName: mapeado.fileName,
      phone,
      waMessageId: waMessageId ?? mapeado.mediaId,
    });
    if (importado.ok) {
      midia = {
        url: importado.url,
        path: importado.path,
        mimeType: importado.mimeType,
        fileName: importado.fileName,
        caption: mapeado.caption,
        waMediaId: mapeado.mediaId,
        tamanho: importado.tamanho,
        ...(mapeado.extra ?? {}),
      };
    } else {
      // A mensagem existe mesmo sem o arquivo: o vendedor precisa saber.
      midiaOk = false;
      erro = importado.erro;
      midia = {
        waMediaId: mapeado.mediaId,
        mimeType: mapeado.mimeType,
        fileName: mapeado.fileName,
        caption: mapeado.caption,
        erro: "download_falhou",
      };
      const rotulo = rotuloPadrao(mapeado.tipo, mapeado.fileName).replace(/^\[|\]$/g, "");
      texto = `[${rotulo} — não foi possível baixar, tentar novamente]`;
    }
  } else if (mapeado.extra && mapeado.tipo !== "texto") {
    midia = { ...mapeado.extra };
  }

  const { processarEntradaWhatsapp } = await import("@/lib/whatsapp-inbound.server");
  await processarEntradaWhatsapp({
    phone,
    message: texto,
    name: nomeContato,
    externalId: waMessageId,
    tipo: mapeado.tipo,
    midia,
    tag,
    silencioso: input.silencioso === true || mapeado.silencioso,
    ...(input.criadoEm ? { criadoEm: input.criadoEm } : {}),
  });

  return { gravado: true, tipo: mapeado.tipo, midiaOk, ...(erro ? { erro } : {}) };
}
