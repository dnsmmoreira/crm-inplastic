import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "pipeline_stats",
  title: "Estatísticas do pipeline",
  description:
    "Retorna a contagem de leads e o valor total estimado por estágio do pipeline, para o usuário autenticado.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx: ToolContext) => {
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
    const { data, error } = await supabase.from("leads").select("stage, estimated_value");
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }], isError: true };

    const byStage: Record<string, { count: number; totalValue: number }> = {};
    let total = 0;
    let totalValue = 0;
    for (const l of data ?? []) {
      const s = l.stage ?? "desconhecido";
      byStage[s] ??= { count: 0, totalValue: 0 };
      byStage[s].count += 1;
      byStage[s].totalValue += Number(l.estimated_value ?? 0);
      total += 1;
      totalValue += Number(l.estimated_value ?? 0);
    }
    return {
      content: [
        {
          type: "text",
          text: `Total de leads: ${total} · Valor estimado: R$ ${totalValue.toLocaleString("pt-BR")}`,
        },
      ],
      structuredContent: { total, totalValue, byStage },
    };
  },
});
