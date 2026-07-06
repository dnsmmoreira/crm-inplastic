import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

const STAGES = ["atendimento", "novo", "qualificacao", "proposta", "negociacao", "ganho", "perdido"] as const;

export default defineTool({
  name: "list_leads",
  title: "Listar leads",
  description:
    "Lista os leads visíveis para o usuário autenticado no CRM INPLASTIC. Admins veem todos; vendedores veem apenas os próprios. Suporta filtro por estágio e limite.",
  inputSchema: {
    stage: z
      .enum(STAGES)
      .optional()
      .describe("Filtrar por estágio do pipeline"),
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
      .select("id, company, contact_name, email, phone, stage, estimated_value, product, quantity, source, last_contact, owner_id")
      .order("updated_at", { ascending: false })
      .limit(max);
    if (stage) q = q.eq("stage", stage);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: `Erro: ${error.message}` }], isError: true };
    }
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
      lastContact: l.last_contact,
      ownerId: l.owner_id,
    }));
    return {
      content: [{ type: "text", text: `${leads.length} lead(s) encontrado(s).` }],
      structuredContent: { leads },
    };
  },
});
