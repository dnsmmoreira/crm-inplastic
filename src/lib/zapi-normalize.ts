/**
 * Normalizador único de payloads recebidos da Z-API.
 * Converte qualquer tipo de mensagem em { tipo, texto, midia }.
 * NUNCA baixa nem armazena o arquivo: apenas URL + metadados que a Z-API envia.
 */

export type MensagemTipo =
  | "texto"
  | "imagem"
  | "video"
  | "audio"
  | "documento"
  | "figurinha"
  | "localizacao"
  | "contato"
  | "resposta_opcao"
  | "reacao"
  | "desconhecido";

export type Normalizada = {
  tipo: MensagemTipo;
  texto: string;
  midia: Record<string, unknown> | null;
};

/** Tipos que podem seguir para o agente automático (n8n). */
export const TIPOS_COM_RESPOSTA_AUTOMATICA: MensagemTipo[] = ["texto", "resposta_opcao"];

/** Tipos que exigem handoff para atendimento humano. */
export const TIPOS_COM_HANDOFF: MensagemTipo[] = [
  "imagem",
  "video",
  "audio",
  "documento",
  "figurinha",
  "localizacao",
  "contato",
  "desconhecido",
];

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

export function normalizarPayloadZapi(payload: Record<string, unknown>): Normalizada {
  const text = obj(payload.text);
  const image = obj(payload.image);
  const video = obj(payload.video);
  const audio = obj(payload.audio) ?? obj(payload.ptt);
  const document = obj(payload.document);
  const sticker = obj(payload.sticker);
  const location = obj(payload.location);
  const contact = obj(payload.contact);
  const contactsArray = obj(payload.contactsArray);
  const buttonsResponse = obj(payload.buttonsResponseMessage);
  const listResponse = obj(payload.listResponseMessage);
  const reaction = obj(payload.reaction);

  if (image) {
    const caption = str(image.caption);
    return {
      tipo: "imagem",
      texto: caption || "[imagem]",
      midia: {
        url: str(image.imageUrl) || str(image.url) || null,
        mimeType: str(image.mimeType) || null,
        caption: caption || null,
      },
    };
  }

  if (video) {
    const caption = str(video.caption);
    return {
      tipo: "video",
      texto: caption || "[video]",
      midia: {
        url: str(video.videoUrl) || str(video.url) || null,
        mimeType: str(video.mimeType) || null,
        caption: caption || null,
      },
    };
  }

  if (audio) {
    return {
      tipo: "audio",
      texto: "[audio]",
      midia: {
        url: str(audio.audioUrl) || str(audio.url) || null,
        mimeType: str(audio.mimeType) || null,
        seconds: audio.seconds ?? null,
      },
    };
  }

  if (document) {
    const fileName = str(document.fileName) || str(document.title);
    return {
      tipo: "documento",
      texto: `[documento] ${fileName}`.trim(),
      midia: {
        url: str(document.documentUrl) || str(document.url) || null,
        mimeType: str(document.mimeType) || null,
        fileName: fileName || null,
        pageCount: document.pageCount ?? null,
      },
    };
  }

  if (sticker) {
    return {
      tipo: "figurinha",
      texto: "[figurinha]",
      midia: {
        url: str(sticker.stickerUrl) || str(sticker.url) || null,
        mimeType: str(sticker.mimeType) || null,
      },
    };
  }

  if (location) {
    const address = str(location.address);
    const lat = str(location.latitude);
    const lng = str(location.longitude);
    const desc = address || [lat, lng].filter(Boolean).join(",");
    return {
      tipo: "localizacao",
      texto: `[localizacao] ${desc}`.trim(),
      midia: {
        latitude: location.latitude ?? null,
        longitude: location.longitude ?? null,
        address: address || null,
        url: str(location.url) || null,
      },
    };
  }

  if (contact || contactsArray) {
    const c = contact ?? contactsArray!;
    const displayName = str(c.displayName) || str(c.name);
    return {
      tipo: "contato",
      texto: `[contato] ${displayName}`.trim(),
      midia: {
        displayName: displayName || null,
        phones: c.phones ?? c.contacts ?? null,
      },
    };
  }

  if (buttonsResponse || listResponse) {
    const r = buttonsResponse ?? listResponse!;
    const escolha =
      str(r.buttonText) || str(r.title) || str(r.message) || str(r.selectedRowId) || str(r.buttonId);
    return {
      tipo: "resposta_opcao",
      texto: escolha || "[opcao selecionada]",
      midia: {
        id: str(r.buttonId) || str(r.selectedRowId) || null,
        title: str(r.title) || null,
      },
    };
  }

  if (reaction) {
    const emoji = str(reaction.value) || str(reaction.reaction) || str(reaction.emoji);
    return {
      tipo: "reacao",
      texto: `[reacao] ${emoji}`.trim(),
      midia: {
        emoji: emoji || null,
        referencedMessageId: str(reaction.referencedMessage) || null,
      },
    };
  }

  const textoSimples = str(text?.message) || str(payload.message);
  if (textoSimples) {
    return { tipo: "texto", texto: textoSimples, midia: null };
  }

  // Tipo desconhecido — grava marcação e um recorte reduzido do payload bruto.
  const reduzido: Record<string, unknown> = {};
  for (const k of ["type", "messageId", "phone", "senderName", "chatName", "momment"]) {
    if (payload[k] !== undefined) reduzido[k] = payload[k];
  }
  reduzido.chaves = Object.keys(payload).slice(0, 30);
  return { tipo: "desconhecido", texto: "[mensagem nao suportada]", midia: reduzido };
}
