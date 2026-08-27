/**
 * Lógica pura da integração Lalamove (sem I/O — testável).
 *
 * Regra de negócio: Lalamove só é ofertado para clientes do estado de SP.
 * Nada aqui conversa com a tabela `transportadoras` nem alimenta a estatística
 * de sugestão por frequência — Lalamove é um canal separado.
 */

export const LALAMOVE_UF_PERMITIDA = "SP";

export const LALAMOVE_AVISO_RESPONSABILIDADE =
  "Atenção: ao optar por frete via Lalamove (terceiro), a Inplastic não se responsabiliza pela carga transportada. Este valor é apenas uma indicação de transporte, não uma contratação feita pela empresa.";

export function normalizarUfLalamove(uf: string | null | undefined): string | null {
  if (!uf || typeof uf !== "string") return null;
  const v = uf.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

/** `true` somente quando o cliente é do estado de São Paulo. */
export function ufAceitaLalamove(uf: string | null | undefined): boolean {
  return normalizarUfLalamove(uf) === LALAMOVE_UF_PERMITIDA;
}

export const LALAMOVE_ERRO_UF =
  "Frete via Lalamove disponível apenas para clientes do estado de SP.";

export const LALAMOVE_ERRO_CONFIG =
  "Integração com Lalamove ainda não configurada — peça pro admin cadastrar as chaves.";

/** Cidade de São Paulo no formato locode da Lalamove. */
export const LALAMOVE_LOCODE_SP = "BR SAO";

/**
 * Ordem de preferência de serviço: pedidos são de poucas peças (até ~1t),
 * então priorizamos veículos utilitários antes de moto.
 */
export const LALAMOVE_SERVICE_PREFERENCE = [
  "VAN",
  "TRUCK550",
  "TRUCK330",
  "CAR",
  "SEDAN",
  "MOTORCYCLE",
];

export type LalamoveService = { key: string; description?: string };
export type LalamoveCity = { locode: string; name?: string; services?: LalamoveService[] };

/** Serviços disponíveis na cidade de São Paulo (fallback: primeira cidade). */
export function servicosDeSaoPaulo(cities: LalamoveCity[] | null | undefined): LalamoveService[] {
  const list = Array.isArray(cities) ? cities : [];
  const sp =
    list.find((c) => (c.locode ?? "").toUpperCase() === LALAMOVE_LOCODE_SP) ??
    list.find((c) => /s(a|ã)o paulo/i.test(c.name ?? "")) ??
    list[0];
  return (sp?.services ?? []).filter((s) => !!s?.key);
}

/** Escolhe o serviceType padrão a partir da lista devolvida pela API. */
export function escolherServiceType(
  services: LalamoveService[] | null | undefined,
  preferencia: string[] = LALAMOVE_SERVICE_PREFERENCE,
): string | null {
  const keys = (services ?? []).map((s) => s.key).filter(Boolean);
  if (!keys.length) return null;
  for (const p of preferencia) {
    const hit = keys.find((k) => k.toUpperCase() === p.toUpperCase());
    if (hit) return hit;
  }
  return keys[0];
}

export type LalamoveCotacao = {
  valor: number;
  distanciaKm: number | null;
  serviceType: string;
  quotationId: string;
  expiraEm: string | null;
};

/** Converte a resposta crua de POST /v3/quotations no formato interno. */
export function parseQuotation(payload: unknown, serviceType: string): LalamoveCotacao {
  const data = (payload as { data?: Record<string, unknown> } | null)?.data;
  if (!data) throw new Error("Resposta inesperada da Lalamove (sem dados de cotação).");

  const breakdown = data['priceBreakdown'] as { total?: string | number } | undefined;
  const valor = Number(breakdown?.total);
  if (!Number.isFinite(valor)) {
    throw new Error("Lalamove não devolveu um preço válido para esta rota.");
  }

  const distancia = data['distance'] as { value?: string | number; unit?: string } | undefined;
  const distanciaKm = distanciaEmKm(distancia);

  const quotationId = String(data['quotationId'] ?? "");
  const expiraEm = data['expiresAt'] ? String(data['expiresAt']) : null;

  return {
    valor: +valor.toFixed(2),
    distanciaKm,
    serviceType: String(data['serviceType'] ?? serviceType),
    quotationId,
    expiraEm,
  };
}

export function distanciaEmKm(
  distancia: { value?: string | number; unit?: string } | null | undefined,
): number | null {
  const raw = Number(distancia?.value);
  if (!Number.isFinite(raw)) return null;
  const unit = String(distancia?.unit ?? "m").toLowerCase();
  const km = unit === "km" ? raw : raw / 1000;
  return +km.toFixed(1);
}

export function formatarValorLalamove(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarDistanciaLalamove(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "—";
  return `${km.toFixed(1).replace(".", ",")} km`;
}
