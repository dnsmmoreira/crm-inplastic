import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

/**
 * Romaneios operacionais do pedido (separação e conferência para emissão de NF).
 *
 * Documentos OPCIONAIS, gerados sob demanda depois que o pedido existe. O
 * snapshot de itens é congelado no momento da geração (`itens`), enquanto o
 * progresso da conferência vive em coluna separada (`itens_conferidos`) para
 * poder ser reiniciado sem perder o snapshot.
 *
 * Nada aqui toca o `checklist_conferencia` do pedido — é outro artefato.
 */

// O tipo gerado do Supabase ainda não conhece `pedido_romaneios`; client solto.
type LooseClient = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const ROMANEIO_TIPOS = ["separacao", "conferencia_nf"] as const;
export type RomaneioTipo = (typeof ROMANEIO_TIPOS)[number];

export const ROMANEIO_LABELS: Record<RomaneioTipo, string> = {
  separacao: "Romaneio de separação",
  conferencia_nf: "Romaneio de conferência para NF",
};

export type RomaneioItem = {
  item_key: string;
  sku: string | null;
  description: string | null;
  quantity: number;
  unit: string | null;
  product_id: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  pecas_por_coluna: number | null;
  stack_height_cm: number | null;
  /** Só em `conferencia_nf`. */
  ncm?: string | null;
  unit_price?: number | null;
  total_price?: number | null;
};

export type RomaneioConferido = { item_key: string; conferido: boolean };

export type RomaneioRow = {
  id: string;
  pedido_id: string;
  tipo: RomaneioTipo;
  itens: RomaneioItem[];
  itens_conferidos: RomaneioConferido[];
  gerado_em: string;
  gerado_por: string | null;
  concluido_em: string | null;
  concluido_por: string | null;
};

export type RomaneioDocumento = {
  romaneio: RomaneioRow;
  pedido: {
    id: string;
    number: string;
    cliente_nome: string | null;
    cliente_cnpj: string | null;
  };
};

const tipoSchema = z.enum(ROMANEIO_TIPOS);
const pedidoTipoSchema = z.object({
  pedido_id: z.string().uuid(),
  tipo: tipoSchema,
});

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type ItemBase = {
  sku: string | null;
  description: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  product_id: string | null;
  ncm: string | null;
  position: number;
};

/**
 * Mesma resolução usada pelo detalhe do pedido: itens copiados em
 * `pedido_itens`; se o pedido não tiver itens copiados, cai para
 * `proposta_itens` e, por último, para o `proposta_snapshot`.
 */
async function resolverItensDoPedido(
  sb: LooseClient,
  pedido: { id: string; proposta_id: string | null; proposta_snapshot: unknown },
): Promise<ItemBase[]> {
  const mapear = (rows: Array<Record<string, unknown>>): ItemBase[] =>
    rows.map((r, idx) => ({
      sku: (r['sku'] as string | null) ?? null,
      description: (r['description'] as string | null) ?? null,
      quantity: Number(r['quantity'] ?? 0),
      unit: (r['unit'] as string | null) ?? null,
      unit_price: num(r['unit_price']),
      product_id: (r['product_id'] as string | null) ?? null,
      ncm: (r['ncm'] as string | null) ?? null,
      position: Number(r['position'] ?? idx),
    }));

  const { data: pi } = await sb
    .from("pedido_itens")
    .select("sku, description, quantity, unit, unit_price, product_id, position")
    .eq("pedido_id", pedido.id)
    .order("position", { ascending: true });
  if (Array.isArray(pi) && pi.length > 0) return mapear(pi);

  if (pedido.proposta_id) {
    const { data: pri } = await sb
      .from("proposta_itens")
      .select("sku, description, quantity, unit, unit_price, product_id, ncm, position")
      .eq("proposta_id", pedido.proposta_id)
      .order("position", { ascending: true });
    if (Array.isArray(pri) && pri.length > 0) return mapear(pri);
  }

  const snap = (pedido.proposta_snapshot ?? {}) as Record<string, unknown>;
  const snapItens = Array.isArray(snap['itens'])
    ? (snap['itens'] as Array<Record<string, unknown>>)
    : Array.isArray(snap['items'])
      ? (snap['items'] as Array<Record<string, unknown>>)
      : [];
  return mapear(snapItens);
}

/** Chave estável do item: SKU quando existir, senão a posição. */
function chaveItem(it: ItemBase, idx: number): string {
  const sku = (it.sku ?? "").trim();
  return sku.length > 0 ? sku : `#${idx}`;
}

export const gerarRomaneio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedido_id: string; tipo: RomaneioTipo }) =>
    pedidoTipoSchema.parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ romaneio: RomaneioRow; regerado: boolean; estavaConcluido: boolean }> => {
      const sb: LooseClient = context.supabase;

      const { data: pedido, error: pedErr } = await sb
        .from("pedidos")
        .select("id, proposta_id, proposta_snapshot")
        .eq("id", data.pedido_id)
        .maybeSingle();
      if (pedErr) throw new Error(`Falha ao carregar pedido: ${pedErr.message}`);
      if (!pedido) throw new Error("Pedido não encontrado");

      const base = await resolverItensDoPedido(sb, pedido);
      if (base.length === 0) throw new Error("Pedido sem itens para romanear.");

      // Peso/dimensões só existem quando o item aponta para um produto-mestre.
      const productIds = Array.from(
        new Set(base.map((i) => i.product_id).filter((v): v is string => !!v)),
      );
      const produtoById = new Map<string, Record<string, unknown>>();
      if (productIds.length > 0) {
        const { data: prods } = await sb
          .from("produtos")
          .select(
            "id, ncm, weight_kg, height_cm, width_cm, length_cm, pecas_por_coluna, stack_height_cm",
          )
          .in("id", productIds);
        for (const p of (prods ?? []) as Array<Record<string, unknown>>) {
          produtoById.set(String(p['id']), p);
        }
      }

      const comValores = data.tipo === "conferencia_nf";
      const itens: RomaneioItem[] = base.map((i, idx) => {
        const prod = i.product_id ? produtoById.get(i.product_id) : undefined;
        const item: RomaneioItem = {
          item_key: chaveItem(i, idx),
          sku: i.sku,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          product_id: i.product_id,
          // Sem produto vinculado o dado é AUSENTE, não zero: a UI avisa "—".
          weight_kg: prod ? num(prod['weight_kg']) : null,
          height_cm: prod ? num(prod['height_cm']) : null,
          width_cm: prod ? num(prod['width_cm']) : null,
          length_cm: prod ? num(prod['length_cm']) : null,
          pecas_por_coluna: prod ? num(prod['pecas_por_coluna']) : null,
          stack_height_cm: prod ? num(prod['stack_height_cm']) : null,
        };
        if (comValores) {
          const unit = i.unit_price;
          item.ncm = i.ncm ?? (prod ? ((prod['ncm'] as string | null) ?? null) : null);
          item.unit_price = unit;
          item.total_price = unit != null ? +(unit * i.quantity).toFixed(2) : null;
        }
        return item;
      });

      const { data: existente } = await sb
        .from("pedido_romaneios")
        .select("id, concluido_em")
        .eq("pedido_id", data.pedido_id)
        .eq("tipo", data.tipo)
        .maybeSingle();

      const payload = {
        pedido_id: data.pedido_id,
        tipo: data.tipo,
        itens,
        // Regerar reinicia a conferência — o snapshot mudou.
        itens_conferidos: [],
        gerado_em: new Date().toISOString(),
        gerado_por: context.userId,
        concluido_em: null,
        concluido_por: null,
      };

      const { data: row, error } = await sb
        .from("pedido_romaneios")
        .upsert(payload, { onConflict: "pedido_id,tipo" })
        .select("*")
        .single();
      if (error) throw new Error(`Falha ao gerar romaneio: ${error.message}`);

      return {
        romaneio: row as RomaneioRow,
        regerado: !!existente,
        estavaConcluido: !!(existente as { concluido_em?: string | null } | null)?.concluido_em,
      };
    },
  );

export const getRomaneio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedido_id: string; tipo: RomaneioTipo }) =>
    pedidoTipoSchema.parse(input),
  )
  .handler(async ({ data, context }): Promise<RomaneioRow | null> => {
    const sb: LooseClient = context.supabase;
    const { data: row, error } = await sb
      .from("pedido_romaneios")
      .select("*")
      .eq("pedido_id", data.pedido_id)
      .eq("tipo", data.tipo)
      .maybeSingle();
    if (error) throw new Error(`Falha ao carregar romaneio: ${error.message}`);
    return (row as RomaneioRow | null) ?? null;
  });

/** Romaneio + cabeçalho do pedido, para a rota de impressão. */
export const getRomaneioDocumento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedido_id: string; tipo: RomaneioTipo }) =>
    pedidoTipoSchema.parse(input),
  )
  .handler(async ({ data, context }): Promise<RomaneioDocumento | null> => {
    const sb: LooseClient = context.supabase;
    const { data: row, error } = await sb
      .from("pedido_romaneios")
      .select("*")
      .eq("pedido_id", data.pedido_id)
      .eq("tipo", data.tipo)
      .maybeSingle();
    if (error) throw new Error(`Falha ao carregar romaneio: ${error.message}`);
    if (!row) return null;

    const { data: pedido } = await sb
      .from("pedidos")
      .select("id, number, lead_id")
      .eq("id", data.pedido_id)
      .maybeSingle();
    if (!pedido) throw new Error("Pedido não encontrado");

    let clienteNome: string | null = null;
    let clienteCnpj: string | null = null;
    if (pedido.lead_id) {
      const { data: lead } = await sb
        .from("leads")
        .select("company, cnpj")
        .eq("id", pedido.lead_id)
        .maybeSingle();
      clienteNome = (lead?.company as string | null) ?? null;
      clienteCnpj = (lead?.cnpj as string | null) ?? null;
    }

    return {
      romaneio: row as RomaneioRow,
      pedido: {
        id: pedido.id as string,
        number: pedido.number as string,
        cliente_nome: clienteNome,
        cliente_cnpj: clienteCnpj,
      },
    };
  });

export const salvarConferenciaRomaneio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      pedido_id: string;
      tipo: RomaneioTipo;
      itens_conferidos: RomaneioConferido[];
    }) =>
      pedidoTipoSchema
        .extend({
          itens_conferidos: z.array(
            z.object({ item_key: z.string(), conferido: z.boolean() }),
          ),
        })
        .parse(input),
  )
  .handler(async ({ data, context }): Promise<RomaneioRow> => {
    const sb: LooseClient = context.supabase;
    const { data: row, error } = await sb
      .from("pedido_romaneios")
      .update({ itens_conferidos: data.itens_conferidos })
      .eq("pedido_id", data.pedido_id)
      .eq("tipo", data.tipo)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Falha ao salvar conferência: ${error.message}`);
    if (!row) throw new Error("Romaneio não encontrado — gere o romaneio antes.");
    return row as RomaneioRow;
  });

export const concluirRomaneio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedido_id: string; tipo: RomaneioTipo }) =>
    pedidoTipoSchema.parse(input),
  )
  .handler(async ({ data, context }): Promise<RomaneioRow> => {
    const sb: LooseClient = context.supabase;
    const { data: atual, error: readErr } = await sb
      .from("pedido_romaneios")
      .select("*")
      .eq("pedido_id", data.pedido_id)
      .eq("tipo", data.tipo)
      .maybeSingle();
    if (readErr) throw new Error(`Falha ao carregar romaneio: ${readErr.message}`);
    if (!atual) throw new Error("Romaneio não encontrado — gere o romaneio antes.");

    const itens = (atual.itens ?? []) as RomaneioItem[];
    const conferidos = new Set(
      ((atual.itens_conferidos ?? []) as RomaneioConferido[])
        .filter((c) => c.conferido)
        .map((c) => c.item_key),
    );
    const faltando = itens.filter((i) => !conferidos.has(i.item_key));
    if (faltando.length > 0) {
      throw new Error(`Ainda há ${faltando.length} item(ns) não conferido(s).`);
    }

    const { data: row, error } = await sb
      .from("pedido_romaneios")
      .update({ concluido_em: new Date().toISOString(), concluido_por: context.userId })
      .eq("pedido_id", data.pedido_id)
      .eq("tipo", data.tipo)
      .select("*")
      .single();
    if (error) throw new Error(`Falha ao concluir romaneio: ${error.message}`);
    return row as RomaneioRow;
  });
