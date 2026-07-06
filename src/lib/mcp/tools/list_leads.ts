import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

const STAGES = ["novo", "em_atendimento", "proposta", "negociacao", "ganho", "perdido"] as const;

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
    const { data, error } = await supabase.from("user_workspaces").select("user_id, data");
    if (error) {
      return { content: [{ type: "text", text: `Erro: ${error.message}` }], isError: true };
    }
    const max = limit ?? 50;
    const leads: unknown[] = [];
    for (const row of data ?? []) {
      const d = (row.data ?? {}) as { leads?: Array<Record<string, unknown>> };
      for (const l of d.leads ?? []) {
        if (stage && l.stage !== stage) continue;
        leads.push({
          id: l.id,
          company: l.company,
          contactName: l.contactName,
          email: l.email,
          phone: l.phone,
          stage: l.stage,
          estimatedValue: l.estimatedValue,
          product: l.product,
          quantity: l.quantity,
          source: l.source,
          lastContact: l.lastContact,
          ownerId: l.ownerId,
        });
        if (leads.length >= max) break;
      }
      if (leads.length >= max) break;
    }
    return {
      content: [{ type: "text", text: `${leads.length} lead(s) encontrado(s).` }],
      structuredContent: { leads },
    };
  },
});
