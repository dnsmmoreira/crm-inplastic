/**
 * Chamada real à API da Lalamove (v3) — só roda no servidor.
 *
 * Autenticação HMAC-SHA256 conforme doc oficial (developers.lalamove.com):
 *   rawSignature = `${timestamp}\r\n${METHOD}\r\n${PATH}\r\n\r\n${BODY}`
 *   Authorization: `hmac ${API_KEY}:${timestamp}:${signature_hex}`
 * Headers obrigatórios: Authorization, Market, Request-ID, Content-Type.
 */
import { createHmac, randomUUID } from "crypto";
import { geocodeCep } from "@/lib/geocode.server";
import {
  escolherServiceType,
  LALAMOVE_ERRO_CONFIG,
  LALAMOVE_ERRO_UF,
  parseQuotation,
  servicosDeSaoPaulo,
  ufAceitaLalamove,
  type LalamoveCity,
  type LalamoveCotacao,
} from "@/lib/lalamove";

type Config = { key: string; secret: string; market: string; baseUrl: string };

function lerConfig(): Config | null {
  const key = process.env['LALAMOVE_API_KEY'];
  const secret = process.env['LALAMOVE_API_SECRET'];
  if (!key || !secret) return null;
  const market = process.env['LALAMOVE_MARKET'] || "BR";
  const env = (process.env['LALAMOVE_ENV'] || "sandbox").toLowerCase();
  const baseUrl =
    env === "production" ? "https://rest.lalamove.com" : "https://rest.sandbox.lalamove.com";
  return { key, secret, market, baseUrl };
}

async function lalamoveFetch(
  cfg: Config,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<unknown> {
  const timestamp = Date.now().toString();
  const rawBody = body === undefined ? "" : JSON.stringify(body);
  const rawSignature = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${rawBody}`;
  const signature = createHmac("sha256", cfg.secret).update(rawSignature).digest("hex");

  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `hmac ${cfg.key}:${timestamp}:${signature}`,
      Market: cfg.market,
      "Request-ID": randomUUID(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(method === "POST" ? { body: rawBody } : {}),
  });

  const texto = await res.text();
  if (!res.ok) {
    throw new Error(mensagemDeErroLalamove(res.status, texto));
  }
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    throw new Error("Resposta inválida da Lalamove.");
  }
}

export function mensagemDeErroLalamove(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "Lalamove recusou as credenciais — verifique LALAMOVE_API_KEY/SECRET e o ambiente configurado.";
  }
  try {
    const parsed = JSON.parse(body) as {
      errors?:
        | Array<{ id?: string; message?: string; detail?: string }>
        | { id?: string; message?: string; detail?: string };
      message?: string;
    };
    const err = Array.isArray(parsed.errors) ? parsed.errors[0] : parsed.errors;
    const msg = err?.detail || err?.message || err?.id || parsed.message;
    if (msg) return `Lalamove: ${msg}`;
  } catch {
    // corpo não-JSON — cai no fallback abaixo
  }
  return `Lalamove respondeu ${status}${body ? ` — ${body.slice(0, 200)}` : ""}`;
}

export type CotarInput = {
  originCep: string;
  destinationCep: string;
  ufCliente: string | null | undefined;
};

export async function cotarLalamove(input: CotarInput): Promise<LalamoveCotacao> {
  if (!ufAceitaLalamove(input.ufCliente)) throw new Error(LALAMOVE_ERRO_UF);

  const cfg = lerConfig();
  if (!cfg) throw new Error(LALAMOVE_ERRO_CONFIG);

  const lovableKey = process.env['LOVABLE_API_KEY'];
  const connKey = process.env['GOOGLE_MAPS_API_KEY'] ?? process.env['GOOGLE_MAPS_API_KEY_1'];
  if (!lovableKey || !connKey) throw new Error("Google Maps não está configurado no projeto");

  const [origem, destino] = await Promise.all([
    geocodeCep(input.originCep, lovableKey, connKey),
    geocodeCep(input.destinationCep, lovableKey, connKey),
  ]);

  const cities = (await lalamoveFetch(cfg, "GET", "/v3/cities")) as { data?: LalamoveCity[] } | null;
  const serviceType = escolherServiceType(servicosDeSaoPaulo(cities?.data));
  if (!serviceType) {
    throw new Error("Lalamove não retornou serviços disponíveis para São Paulo.");
  }

  const payload = {
    data: {
      serviceType,
      language: "pt_BR",
      stops: [
        {
          coordinates: { lat: String(origem.lat), lng: String(origem.lng) },
          address: origem.address,
        },
        {
          coordinates: { lat: String(destino.lat), lng: String(destino.lng) },
          address: destino.address,
        },
      ],
      isRouteOptimized: false,
    },
  };

  const quotation = await lalamoveFetch(cfg, "POST", "/v3/quotations", payload);
  return parseQuotation(quotation, serviceType);
}
