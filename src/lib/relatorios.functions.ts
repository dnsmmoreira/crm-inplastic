import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PedidoStageId } from "@/lib/pedidos.functions";

/**
 * Relatório de Pedidos — leitura pura sobre `pedidos` + `pedido_itens`.
 * Não altera nada; apenas agrega os itens de cada pedido para a tabela do relatório.
 */

export type RelatorioPedidoItem = {
  sku: string;
  description: string;
  quantity: number;
  unit: string;
};

export type RelatorioPedidoRow = {
  id: string;
  number: string;
  stage: PedidoStageId;
  total: number;
  created_at: string;
  previsao_entrega: string | null;
  cliente: string | null;
  itens: RelatorioPedidoItem[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

/** Lê a permissão do próprio usuário no servidor (admin sempre liberado). */
async function assertPermissao(
  sb: LooseClient,
  userId: string,
  perm: "ver_relatorios" | "exportar_dados",
  mensagem: string,
) {
  const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) return;
  const { data } = await sb.from("user_permissions").select(perm).eq("user_id", userId).maybeSingle();
  if (!data || data[perm] !== true) throw new Error(mensagem);
}

export const assertPodeExportarRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermissao(
      context.supabase,
      context.userId,
      "exportar_dados",
      "Você não tem permissão para exportar dados.",
    );
    return { ok: true as const };
  });

export const listPedidosRelatorio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RelatorioPedidoRow[]> => {
    const sb: LooseClient = context.supabase;
    await assertPermissao(
      sb,
      context.userId,
      "ver_relatorios",
      "Você não tem permissão para ver relatórios.",
    );
    const { data, error } = await sb
      .from("pedidos")
      .select(
        [
          "id, number, stage, total, created_at, previsao_entrega, lead_id",
          "leads:lead_id(company)",
        ].join(", "),
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(`Falha ao listar pedidos: ${error.message}`);

    const rows = (data ?? []) as Array<{
      id: string;
      number: string;
      stage: PedidoStageId;
      total: number | null;
      created_at: string;
      previsao_entrega: string | null;
      leads?: { company: string | null } | null;
    }>;

    const itensByPedido = new Map<string, RelatorioPedidoItem[]>();
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      const { data: itens, error: itensErr } = await sb
        .from("pedido_itens")
        .select("pedido_id, sku, description, quantity, unit, position")
        .in("pedido_id", ids)
        .order("position", { ascending: true });
      if (itensErr) throw new Error(`Falha ao listar itens: ${itensErr.message}`);
      for (const it of (itens ?? []) as Array<{
        pedido_id: string;
        sku: string | null;
        description: string | null;
        quantity: number | null;
        unit: string | null;
      }>) {
        const list = itensByPedido.get(it.pedido_id) ?? [];
        list.push({
          sku: it.sku ?? "",
          description: it.description ?? "",
          quantity: Number(it.quantity ?? 0),
          unit: it.unit ?? "un",
        });
        itensByPedido.set(it.pedido_id, list);
      }
    }

    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      stage: r.stage,
      total: Number(r.total ?? 0),
      created_at: r.created_at,
      previsao_entrega: r.previsao_entrega,
      cliente: r.leads?.company ?? null,
      itens: itensByPedido.get(r.id) ?? [],
    }));
  });
