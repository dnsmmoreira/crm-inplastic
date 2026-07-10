import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

const STAGES = ["atendimento", "novo", "qualificacao", "proposta", "negociacao", "ganho", "perdido"] as const;

function daysBetween(from: string | null | undefined, to: Date): number | null {
  if (!from) return null;
  const ms = to.getTime() - new Date(from).getTime();
  return Math.floor(ms / 86_400_000);
}

export default defineTool({
  name: "list_leads",
  title: "Listar leads",
  description:
    "Lista leads visíveis para o usuário autenticado no CRM INPLASTIC (admin vê tudo; vendedor vê os próprios). Retorna nome do contato, empresa, estágio, vendedor, valor estimado, criação, último contato, mudança de etapa e dias sem contato. Filtros: estágio e limite.",
  inputSchema: {
    stage: z.enum(STAGES).optional().describe("Filtrar por estágio do pipeline"),
    limit: z.number().int().min(1).max(200).optional().describe("Máximo de resultados (padrão 50)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stage, limit }, ctx: ToolContext) => {
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
    const max = limit ?? 50;
    let q = supabase
      .from("leads")
      .select(
        "id, company, contact_name, email, phone, stage, estimated_value, product, quantity, source, created_at, last_contact_at, etapa_changed_at, owner_id",
      )
      .order("updated_at", { ascending: false })
      .limit(max);
    if (stage) q = q.eq("stage", stage);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }], isError: true };

    const ownerIds = Array.from(new Set((data ?? []).map((l) => l.owner_id).filter(Boolean))) as string[];
    let ownersById: Record<string, string> = {};
    if (ownerIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, name").in("id", ownerIds);
      ownersById = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.name ?? "—"]));
    }

    const now = new Date();
    const leads = (data ?? []).map((l) => ({
      id: l.id,
      company: l.company,
      contactName: l.contact_name,
      email: l.email,
      phone: l.phone,
      stage: l.stage,
      estimatedValue: l.estimated_value,
      product: l.product,
      quantity: l.quantity,
      source: l.source,
      createdAt: l.created_at,
      lastContactAt: l.last_contact_at,
      etapaChangedAt: l.etapa_changed_at,
      diasSemContato: daysBetween(l.last_contact_at, now),
      ownerId: l.owner_id,
      ownerName: l.owner_id ? ownersById[l.owner_id] ?? null : null,
    }));

    const linhas = leads.map((l) => {
      const val = l.estimatedValue != null ? `R$ ${Number(l.estimatedValue).toLocaleString("pt-BR")}` : "—";
      const dsc = l.diasSemContato != null ? `${l.diasSemContato}d s/contato` : "sem contato";
      return `• ${l.company ?? "—"} — ${l.contactName ?? "—"} · ${l.stage} · ${l.ownerName ?? "—"} · ${val} · ${dsc}`;
    });
    const header = `${leads.length} lead(s)${stage ? ` no estágio ${stage}` : ""}.`;
    return {
      content: [{ type: "text", text: `${header}\n${linhas.join("\n")}` }],
      structuredContent: { leads },
    };
  },
});
