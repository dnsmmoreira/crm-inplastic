/**
 * Mapeamento PURO do payload de mensagem da WhatsApp Cloud API (Meta) para o
 * formato interno do pipeline de entrada. Não faz rede, não toca no banco.
 */
import type { MensagemTipo } from "@/lib/zapi-normalize";

export type MapeamentoMensagem = {
  tipo: MensagemTipo;
  /** Texto que será gravado em whatsapp_mensagens.conteudo. */
  texto: string;
  /** ID da mídia na Meta (precisa ser baixada com o access token). */
  mediaId: string | null;
  mimeType: string | null;
  caption: string | null;
  fileName: string | null;
  /** true = apenas registra, sem IA/handoff/notificação (ex.: reação). */
  silencioso: boolean;
  /** Metadados extras já conhecidos pelo payload (localização, contato...). */
  extra: Record<string, unknown> | null;
};

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

const BASE: MapeamentoMensagem = {
  tipo: "desconhecido",
  texto: "",
  mediaId: null,
  mimeType: null,
  caption: null,
  fileName: null,
  silencioso: false,
  extra: null,
};

/** Rótulo padrão quando não há legenda. */
export function rotuloPadrao(tipo: MensagemTipo, fileName?: string | null): string {
  switch (tipo) {
    case "imagem":
      return "[imagem]";
    case "documento":
      return fileName ? `[documento: ${fileName}]` : "[documento]";
    case "audio":
      return "[áudio]";
    case "video":
      return "[vídeo]";
    case "figurinha":
      return "[figurinha]";
    default:
      return "[mensagem]";
  }
}

export function mapearMensagemCloud(msg: Record<string, unknown>): MapeamentoMensagem {
  const type = str(msg["type"]) || "desconhecido";

  if (type === "text") {
    const texto = str(obj(msg["text"])?.["body"]).trim();
    return { ...BASE, tipo: "texto", texto };
  }

  if (type === "image" || type === "document" || type === "audio" || type === "video" || type === "sticker") {
    const node = obj(msg[type]) ?? {};
    const tipo: MensagemTipo =
      type === "image"
        ? "imagem"
        : type === "document"
          ? "documento"
          : type === "audio"
            ? "audio"
            : type === "video"
              ? "video"
              : "figurinha";
    const caption = str(node["caption"]).trim() || null;
    const fileName = str(node["filename"]).trim() || null;
    return {
      ...BASE,
      tipo,
      texto: caption || rotuloPadrao(tipo, fileName),
      mediaId: str(node["id"]) || null,
      mimeType: str(node["mime_type"]) || null,
      caption,
      fileName,
      extra: node["voice"] === true ? { voice: true } : null,
    };
  }

  if (type === "button") {
    const node = obj(msg["button"]) ?? {};
    const texto = str(node["text"]).trim();
    return {
      ...BASE,
      tipo: "texto",
      texto: texto || "[resposta de botão]",
      extra: { payload: str(node["payload"]) || null },
    };
  }

  if (type === "interactive") {
    const node = obj(msg["interactive"]) ?? {};
    const br = obj(node["button_reply"]);
    const lr = obj(node["list_reply"]);
    const escolha = str(br?.["title"]) || str(lr?.["title"]);
    return {
      ...BASE,
      tipo: "resposta_opcao",
      texto: escolha.trim() || "[opção selecionada]",
      extra: { id: str(br?.["id"]) || str(lr?.["id"]) || null },
    };
  }

  if (type === "reaction") {
    const node = obj(msg["reaction"]) ?? {};
    const emoji = str(node["emoji"]).trim();
    return {
      ...BASE,
      tipo: "reacao",
      texto: emoji ? `Reagiu com ${emoji}` : "Removeu a reação",
      silencioso: true,
      extra: { emoji: emoji || null, messageId: str(node["message_id"]) || null },
    };
  }

  if (type === "location") {
    const node = obj(msg["location"]) ?? {};
    const lat = str(node["latitude"]);
    const lng = str(node["longitude"]);
    const nome = str(node["name"]) || str(node["address"]);
    return {
      ...BASE,
      tipo: "localizacao",
      texto: `[localização] ${[lat, lng].filter(Boolean).join(",")}${nome ? ` ${nome}` : ""}`.trim(),
      extra: {
        latitude: node["latitude"] ?? null,
        longitude: node["longitude"] ?? null,
        name: str(node["name"]) || null,
        address: str(node["address"]) || null,
      },
    };
  }

  if (type === "contacts") {
    const lista = Array.isArray(msg["contacts"]) ? (msg["contacts"] as unknown[]) : [];
    const primeiro = obj(lista[0]);
    const nome = str(obj(primeiro?.["name"])?.["formatted_name"]);
    return {
      ...BASE,
      tipo: "contato",
      texto: `[contato compartilhado: ${nome || "sem nome"}]`,
      extra: { quantidade: lista.length, nome: nome || null },
    };
  }

  return {
    ...BASE,
    tipo: "desconhecido",
    texto: "[mensagem não suportada pelo WhatsApp]",
    extra: { type },
  };
}
