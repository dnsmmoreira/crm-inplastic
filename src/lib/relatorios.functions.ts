import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
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
const CHAVE_GRANULAR: Record<string, string> = {
  ver_relatorios: "relatorios.ver",
  exportar_dados: "pedidos.exportar",
};

async function assertPermissao(
  sb: LooseClient,
  userId: string,
  perm: "ver_relatorios" | "exportar_dados",
  mensagem: string,
) {
  const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) return;
  const { data } = await sb.from("user_permissions").select(perm).eq("user_id", userId).maybeSingle();
  if (data && data[perm] === true) return;
  // Amplia via perfis (etapa de permissões granulares) — nunca restringe.
  const { data: viaPerfil } = await sb.rpc("tem_permissao", { _user_id: userId, _chave: CHAVE_GRANULAR[perm] });
  if (viaPerfil === true) return;
  throw new Error(mensagem);
}

/**
 * Escopo do relatório: quem não tem `pedidos.ver_todos` (vendedor comum) só
 * enxerga os próprios pedidos — o filtro é aplicado no servidor, além do RLS.
 */
async function escopoProprio(sb: LooseClient, userId: string): Promise<boolean> {
  const { data } = await sb.rpc("tem_permissao", { _user_id: userId, _chave: "pedidos.ver_todos" });
  return data !== true;
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
    let q = sb
      .from("pedidos")
      .select(
        [
          "id, number, stage, total, created_at, previsao_entrega, lead_id",
          "leads:lead_id(company)",
        ].join(", "),
      );
    if (await escopoProprio(sb, context.userId)) {
      q = q.or(`owner_id.eq.${context.userId},vendedor_proprietario_id.eq.${context.userId}`);
    }
    const { data, error } = await q.order("created_at", { ascending: false }).limit(1000);
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

/* ===========================================================================
 * Relatório "Pedidos em Aberto"
 * Fechado = reprovado_financeiro OU pós-venda já encerrado (`encerrado_em`).
 * Um pedido em faturado_em_rota / pós-venda com a tarefa AINDA aberta continua
 * contando como aberto.
 * Visibilidade segue o RLS de `pedidos` (admin vê todos; vendedor, os seus).
 * =========================================================================*/

export const PEDIDO_STAGES_FECHADOS: PedidoStageId[] = ["reprovado_financeiro", "cancelado"];

export type PedidoAbertoRow = {
  id: string;
  number: string;
  stage: PedidoStageId;
  total: number;
  created_at: string;
  previsao_entrega: string | null;
  cliente: string | null;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  itens: RelatorioPedidoItem[];
};

function clienteDoSnapshot(snap: unknown): string | null {
  if (!snap || typeof snap !== "object") return null;
  const s = snap as Record<string, unknown>;
  const candidatos = [
    s["cliente"],
    s["company"],
    s["razao_social"],
    (s["lead"] as Record<string, unknown> | undefined)?.["company"],
    (s["cliente"] as Record<string, unknown> | undefined)?.["razao_social"],
  ];
  for (const c of candidatos) if (typeof c === "string" && c.trim()) return c.trim();
  return null;
}

export const listPedidosEmAberto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PedidoAbertoRow[]> => {
    const sb: LooseClient = context.supabase;
    await assertPermissao(
      sb,
      context.userId,
      "ver_relatorios",
      "Você não tem permissão para ver relatórios.",
    );

    let q = sb
      .from("pedidos")
      .select(
        [
          "id, number, stage, total, created_at, previsao_entrega, entregue_em",
          "vendedor_proprietario_id, responsavel_atual_id, owner_id, proposta_snapshot",
          "leads:lead_id(company)",
        ].join(", "),
      )
      .is("encerrado_em", null)
      .not("stage", "in", `(${PEDIDO_STAGES_FECHADOS.join(",")})`);
    if (await escopoProprio(sb, context.userId)) {
      q = q.or(`owner_id.eq.${context.userId},vendedor_proprietario_id.eq.${context.userId}`);
    }
    const { data, error } = await q.order("created_at", { ascending: false }).limit(1000);
    if (error) throw new Error(`Falha ao listar pedidos em aberto: ${error.message}`);

    const rows = (data ?? []) as Array<{
      id: string;
      number: string;
      stage: PedidoStageId;
      total: number | null;
      created_at: string;
      previsao_entrega: string | null;
      vendedor_proprietario_id: string | null;
      responsavel_atual_id: string | null;
      owner_id: string | null;
      proposta_snapshot: unknown;
      leads?: { company: string | null } | null;
    }>;

    // Itens
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

    // Nomes (não há FK entre pedidos e profiles — lookup separado)
    const profileIds = new Set<string>();
    for (const r of rows) {
      const v = r.vendedor_proprietario_id ?? r.owner_id;
      if (v) profileIds.add(v);
      if (r.responsavel_atual_id) profileIds.add(r.responsavel_atual_id);
    }
    const nameById = new Map<string, string>();
    if (profileIds.size > 0) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id, name")
        .in("id", Array.from(profileIds));
      for (const p of (profs ?? []) as Array<{ id: string; name: string | null }>) {
        if (p.name) nameById.set(p.id, p.name);
      }
    }

    return rows.map((r) => {
      const vendedorId = r.vendedor_proprietario_id ?? r.owner_id ?? null;
      return {
        id: r.id,
        number: r.number,
        stage: r.stage,
        total: Number(r.total ?? 0),
        created_at: r.created_at,
        previsao_entrega: r.previsao_entrega,
        cliente: r.leads?.company ?? clienteDoSnapshot(r.proposta_snapshot),
        vendedor_id: vendedorId,
        vendedor_nome: vendedorId ? nameById.get(vendedorId) ?? null : null,
        responsavel_id: r.responsavel_atual_id,
        responsavel_nome: r.responsavel_atual_id ? nameById.get(r.responsavel_atual_id) ?? null : null,
        itens: itensByPedido.get(r.id) ?? [],
      };
    });
  });
