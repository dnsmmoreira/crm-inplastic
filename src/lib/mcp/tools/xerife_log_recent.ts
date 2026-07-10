import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "xerife_log_recent",
  title: "Últimas ações do Xerife",
  description:
    "Retorna as últimas N ações do motor Xerife visíveis ao usuário autenticado (admin vê tudo; vendedor vê apenas ações contra ele). Inclui regra acionada, alvo (lead/vendedor), ação tomada e data.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().describe("Máximo de registros (padrão 50)"),
    regra: z.string().optional().describe("Filtrar por prefixo de regra (ILIKE)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, regra }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    let q = supabase
      .from("xerife_log")
      .select("id, regra, acao_tomada, lead_id, vendedor_id, cliente_id, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (regra) q = q.ilike("regra", `${regra}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }], isError: true };

    const leadIds = Array.from(new Set((data ?? []).map((r) => r.lead_id).filter(Boolean))) as string[];
    const vendIds = Array.from(new Set((data ?? []).map((r) => r.vendedor_id).filter(Boolean))) as string[];
    const [leadsRes, profsRes] = await Promise.all([
      leadIds.length ? supabase.from("leads").select("id, company").in("id", leadIds) : Promise.resolve({ data: [] as any[] }),
      vendIds.length ? supabase.from("profiles").select("id, name").in("id", vendIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const leadsById = Object.fromEntries(((leadsRes.data as any[]) ?? []).map((l) => [l.id, l.company]));
    const vendById = Object.fromEntries(((profsRes.data as any[]) ?? []).map((p) => [p.id, p.name ?? "—"]));

    const rows = (data ?? []).map((r) => ({
      id: r.id,
      regra: r.regra,
      acao: r.acao_tomada,
      leadId: r.lead_id,
      leadCompany: r.lead_id ? leadsById[r.lead_id] ?? null : null,
      vendedorId: r.vendedor_id,
      vendedorName: r.vendedor_id ? vendById[r.vendedor_id] ?? null : null,
      clienteId: r.cliente_id,
      createdAt: r.created_at,
      payload: r.payload,
    }));

    const linhas = rows.map((r) => {
      const when = new Date(r.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const alvo = r.leadCompany ? ` · lead:${r.leadCompany}` : "";
      const vend = r.vendedorName ? ` · vendedor:${r.vendedorName}` : "";
      return `• ${when} — ${r.regra} → ${r.acao}${alvo}${vend}`;
    });
    return {
      content: [{ type: "text", text: `${rows.length} ação(ões) do Xerife.\n${linhas.join("\n")}` }],
      structuredContent: { actions: rows },
    };
  },
});
