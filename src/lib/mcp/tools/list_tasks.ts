import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_tasks",
  title: "Listar tarefas",
  description: "Lista tarefas do CRM visíveis ao usuário autenticado, com filtro opcional por status (pendente/concluida).",
  inputSchema: {
    status: z.enum(["pendente", "concluida"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx: ToolContext) => {
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
    const { data, error } = await supabase.from("user_workspaces").select("data");
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }], isError: true };
    const max = limit ?? 50;
    const tasks: unknown[] = [];
    for (const row of data ?? []) {
      const d = (row.data ?? {}) as { tasks?: Array<Record<string, unknown>> };
      for (const t of d.tasks ?? []) {
        if (status && t.status !== status) continue;
        tasks.push(t);
        if (tasks.length >= max) break;
      }
      if (tasks.length >= max) break;
    }
    return {
      content: [{ type: "text", text: `${tasks.length} tarefa(s).` }],
      structuredContent: { tasks },
    };
  },
});
