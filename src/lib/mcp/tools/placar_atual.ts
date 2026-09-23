import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

/**
 * Placar atual — usa a RPC `placar_vendedores_escopo`, que já é SECURITY DEFINER e
 * respeita o próprio filtro interno (admin vê tudo; vendedor vê a si mesmo).
 * A privacidade de META (meta_valor/meta_pct) vale nos DOIS lugares: a UI e esta
 * ferramenta só mostram meta do próprio vendedor, ou de todos quando quem chama
 * é admin. Sem admin confirmado, a meta alheia sai nula (fail-closed).
 */

export type LinhaPlacar = {
  vendedor_id: string;
  nome: string;
  posicao: number;
  score: number;
  ganhos_qtd: number;
  ganhos_valor: number;
  propostas_qtd: number;
  conversao: number | null;
  slas_estourados: number;
  meta_valor: number | null;
  meta_pct: number | null;
  [k: string]: unknown;
};

/** Aplica a máscara de meta e monta a linha de texto. Função pura, testável. */
export function montarLinhasPlacar(
  rows: LinhaPlacar[],
  callerId: string | null,
  isAdmin: boolean,
): { ranking: LinhaPlacar[]; linhas: string[] } {
  const ranking: LinhaPlacar[] = [];
  const linhas: string[] = [];
  for (const r of rows) {
    const canSeeMeta = isAdmin === true || r.vendedor_id === callerId;
    const meta_valor = canSeeMeta ? (r.meta_valor ?? null) : null;
    const meta_pct = canSeeMeta ? (r.meta_pct ?? null) : null;
    ranking.push({ ...r, meta_valor, meta_pct });
    const meta =
      canSeeMeta && Number(r.meta_valor) > 0
        ? ` · meta ${r.meta_pct ?? 0}% (R$ ${Number(r.ganhos_valor).toLocaleString("pt-BR")} / R$ ${Number(r.meta_valor).toLocaleString("pt-BR")})`
        : "";
    const conv = r.conversao != null ? ` · conv ${r.conversao}%` : "";
    linhas.push(
      `#${r.posicao} ${r.nome} — score ${Number(r.score).toFixed(1)} · ganhos ${r.ganhos_qtd} · propostas ${r.propostas_qtd}${conv} · SLAs estourados ${r.slas_estourados}${meta}`,
    );
  }
  return { ranking, linhas };
}

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
    const { data, error } = await supabase.rpc("placar_vendedores_escopo", { _periodo: periodo ?? "mes" });
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }], isError: true };

    const { data: au } = await supabase.auth.getUser();
    const callerId = au?.user?.id ?? null;
    let isAdmin = false;
    if (callerId) {
      const { data: adm, error: admErr } = await supabase.rpc("has_role", {
        _user_id: callerId,
        _role: "admin",
      });
      isAdmin = !admErr && adm === true;
    }

    const rows = (data ?? []) as LinhaPlacar[];
    const { ranking, linhas } = montarLinhasPlacar(rows, callerId, isAdmin);
    return {
      content: [{ type: "text", text: `Placar (${periodo ?? "mes"}) — ${rows.length} vendedor(es).\n${linhas.join("\n")}` }],
      structuredContent: { periodo: periodo ?? "mes", ranking },
    };
  },
});
