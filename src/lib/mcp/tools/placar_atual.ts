import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

/**
 * Placar atual — usa a RPC `placar_vendedores`, que já é SECURITY DEFINER e
 * respeita o próprio filtro interno (admin vê tudo; vendedor vê a si mesmo).
 * A regra de privacidade de metas/valores individuais é da UI; via MCP
 * autenticado como admin, todos os campos ficam disponíveis.
 */
export default defineTool({
  name: "placar_atual",
  title: "Placar atual (ranking de vendedores)",
  description:
    "Ranking atual do Placar com métricas por vendedor (ganhos, propostas, conversão, SLAs estourados, carteira, meta atingida, score, posição). Período: semana, mes (padrão), trimestre.",
  inputSchema: {
    periodo: z.enum(["semana", "mes", "trimestre"]).optional().describe("Período de apuração (padrão: mes)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ periodo }, ctx: ToolContext) => {
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
    const { data, error } = await supabase.rpc("placar_vendedores", { _periodo: periodo ?? "mes" });
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }], isError: true };

    const rows = (data ?? []) as any[];
    const linhas = rows.map((r) => {
      const meta = r.meta_valor > 0
        ? ` · meta ${r.meta_pct ?? 0}% (R$ ${Number(r.ganhos_valor).toLocaleString("pt-BR")} / R$ ${Number(r.meta_valor).toLocaleString("pt-BR")})`
        : "";
      const conv = r.conversao != null ? ` · conv ${r.conversao}%` : "";
      return `#${r.posicao} ${r.nome} — score ${Number(r.score).toFixed(1)} · ganhos ${r.ganhos_qtd} · propostas ${r.propostas_qtd}${conv} · SLAs estourados ${r.slas_estourados}${meta}`;
    });
    return {
      content: [{ type: "text", text: `Placar (${periodo ?? "mes"}) — ${rows.length} vendedor(es).\n${linhas.join("\n")}` }],
      structuredContent: { periodo: periodo ?? "mes", ranking: rows },
    };
  },
});
