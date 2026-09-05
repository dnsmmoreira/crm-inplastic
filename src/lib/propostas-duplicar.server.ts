/**
 * Duplicação de proposta (clone em rascunho).
 *
 * Regras:
 * - número novo via RPC `next_proposta_number` (mesma usada em `createProposal`);
 * - status sempre `rascunho`, `owner_id` = usuário que duplicou;
 * - campos de ciclo de vida (envio/aprovação/pedido/edição) zerados;
 * - itens (com `ncm`) e parcelas copiados como estão.
 */

type LooseClient = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export type PropostaBase = {
  lead_id: string;
  emitter_id: string;
  payment_term_id: string | null;
  forma_pagamento: string | null;
  discount_percent: number;
  acrescimo_percent?: number | null;
  cartao_parcelas?: number | null;
  transport: unknown;
  observations: string;
  validity_days: number;
  numero_pedido_cliente?: string | null;
  observacoes_pedido?: string | null;
  tratativa_comercial?: string | null;
};

export type ItemBase = {
  sku: string;
  ncm: string | null;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  product_id: string | null;
  position: number;
};

export type ParcelaBase = {
  days: number;
  amount: number;
  percentual: number | null;
  notes: string;
  position: number;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function normalizarItens(rows: Array<Record<string, unknown>>): ItemBase[] {
  return rows.map((i, idx) => ({
    sku: str(i["sku"]),
    ncm: (i["ncm"] as string | null) ?? null,
    description: str(i["description"]),
    unit: str(i["unit"], "un"),
    quantity: num(i["quantity"]),
    unit_price: num(i["unit_price"]),
    product_id: (i["product_id"] as string | null) ?? null,
    position: Number.isFinite(Number(i["position"])) ? Number(i["position"]) : idx,
  }));
}

export function normalizarParcelas(rows: Array<Record<string, unknown>>): ParcelaBase[] {
  return rows.map((p, idx) => ({
    days: num(p["days"]),
    amount: num(p["amount"]),
    percentual:
      p["percentual"] === null || p["percentual"] === undefined ? null : num(p["percentual"]),
    notes: str(p["notes"]),
    position: Number.isFinite(Number(p["position"])) ? Number(p["position"]) : idx,
  }));
}

/** Cria a proposta rascunho a partir de dados já carregados. */
export async function criarPropostaDuplicada(
  sb: LooseClient,
  args: { base: PropostaBase; itens: ItemBase[]; parcelas: ParcelaBase[]; ownerId: string },
): Promise<{ id: string; number: string }> {
  const { base, itens, parcelas, ownerId } = args;

  const year = new Date().getFullYear();
  const { data: numData, error: numErr } = await sb.rpc("next_proposta_number", { _year: year });
  if (numErr || typeof numData !== "string" || !numData) {
    throw new Error("Falha ao gerar o número da nova proposta.");
  }

  const { data: nova, error: insErr } = await sb
    .from("propostas")
    .insert({
      number: numData,
      status: "rascunho",
      owner_id: ownerId,
      em_negociacao: false,
      lead_id: base.lead_id,
      emitter_id: base.emitter_id,
      payment_term_id: base.payment_term_id ?? null,
      forma_pagamento: base.forma_pagamento ?? null,
      discount_percent: num(base.discount_percent),
      acrescimo_percent: num(base.acrescimo_percent),
      cartao_parcelas: base.cartao_parcelas ?? null,
      transport: base.transport ?? {},
      observations: base.observations ?? "",
      validity_days: num(base.validity_days, 15),
      // Datas e vínculos que não fazem sentido copiar.
      expected_delivery_date: null,
      previsao_faturamento: null,
      numero_pedido_cliente: null,
      observacoes_pedido: null,
      tratativa_comercial: null,
      sent_at: null,
      approved_at: null,
      approval_requested_at: null,
      approval_reason: null,
      approved_by_user_id: null,
      order_created_at: null,
      edit_requested_at: null,
      edit_request_reason: null,
      edit_requested_by_user_id: null,
      edit_unlocked_at: null,
      edit_unlocked_by_user_id: null,
    })
    .select("id, number")
    .single();
  if (insErr || !nova) {
    throw new Error(
      `Falha ao criar a proposta duplicada: ${(insErr as { message?: string } | null)?.message ?? "erro desconhecido"}`,
    );
  }

  if (itens.length > 0) {
    const { error } = await sb
      .from("proposta_itens")
      .insert(itens.map((i) => ({ ...i, proposta_id: nova.id })));
    if (error)
      throw new Error(`Falha ao copiar os itens: ${(error as { message?: string }).message}`);
  }

  if (parcelas.length > 0) {
    const { error } = await sb
      .from("proposta_parcelas")
      .insert(parcelas.map((p) => ({ ...p, proposta_id: nova.id, due_date: null })));
    if (error)
      throw new Error(`Falha ao copiar as parcelas: ${(error as { message?: string }).message}`);
  }

  return { id: nova.id as string, number: nova.number as string };
}

/** Duplica uma proposta existente (lê origem no banco). */
export async function duplicarPropostaImpl(
  sb: LooseClient,
  propostaId: string,
  ownerId: string,
): Promise<{ id: string; number: string }> {
  const [propRes, itensRes, parcelasRes] = await Promise.all([
    sb
      .from("propostas")
      .select(
        "id, lead_id, emitter_id, payment_term_id, forma_pagamento, discount_percent, acrescimo_percent, cartao_parcelas, transport, observations, validity_days",
      )
      .eq("id", propostaId)
      .maybeSingle(),
    sb
      .from("proposta_itens")
      .select("sku, ncm, description, unit, quantity, unit_price, product_id, position")
      .eq("proposta_id", propostaId)
      .order("position", { ascending: true }),
    sb
      .from("proposta_parcelas")
      .select("days, amount, percentual, notes, position")
      .eq("proposta_id", propostaId)
      .order("position", { ascending: true }),
  ]);

  const origem = propRes.data as PropostaBase | null;
  if (!origem) throw new Error("Proposta não encontrada ou sem permissão.");

  return criarPropostaDuplicada(sb, {
    base: origem,
    itens: normalizarItens((itensRes.data ?? []) as Array<Record<string, unknown>>),
    parcelas: normalizarParcelas((parcelasRes.data ?? []) as Array<Record<string, unknown>>),
    ownerId,
  });
}

/**
 * Duplica um pedido em nova proposta rascunho.
 * Preferimos a proposta viva (`pedidos.proposta_id`); se ela não existir mais
 * (pedido reprovado desvincula a proposta), caímos no `proposta_snapshot`.
 */
export async function duplicarPedidoImpl(
  sb: LooseClient,
  pedidoId: string,
  ownerId: string,
): Promise<{ id: string; number: string }> {
  const { data: pedido } = await sb
    .from("pedidos")
    .select("id, lead_id, proposta_id, proposta_snapshot")
    .eq("id", pedidoId)
    .maybeSingle();
  if (!pedido) throw new Error("Pedido não encontrado ou sem permissão.");

  if (pedido.proposta_id) {
    const { data: viva } = await sb
      .from("propostas")
      .select("id")
      .eq("id", pedido.proposta_id)
      .maybeSingle();
    if (viva) return duplicarPropostaImpl(sb, pedido.proposta_id as string, ownerId);
  }

  const snap = (pedido.proposta_snapshot ?? {}) as {
    proposta?: Record<string, unknown>;
    itens?: Array<Record<string, unknown>>;
    parcelas?: Array<Record<string, unknown>>;
  };
  const p = snap.proposta;
  if (!p) throw new Error("Pedido sem dados de proposta para duplicar.");

  const base: PropostaBase = {
    lead_id: (p["lead_id"] as string) ?? (pedido.lead_id as string),
    emitter_id: p["emitter_id"] as string,
    payment_term_id: (p["payment_term_id"] as string | null) ?? null,
    forma_pagamento: (p["forma_pagamento"] as string | null) ?? null,
    discount_percent: num(p["discount_percent"]),
    acrescimo_percent: num(p["acrescimo_percent"]),
    cartao_parcelas: p["cartao_parcelas"] != null ? Number(p["cartao_parcelas"]) : null,
    transport: p["transport"] ?? {},
    observations: str(p["observations"]),
    validity_days: num(p["validity_days"], 15),
  };
  if (!base.lead_id || !base.emitter_id) {
    throw new Error("Snapshot do pedido incompleto — não é possível duplicar.");
  }

  return criarPropostaDuplicada(sb, {
    base,
    itens: normalizarItens(snap.itens ?? []),
    parcelas: normalizarParcelas(snap.parcelas ?? []),
    ownerId,
  });
}
