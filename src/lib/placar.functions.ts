import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlacarPeriodo = "semana" | "mes" | "trimestre";

export type PlacarVendedor = {
  vendedor_id: string;
  nome: string;
  avatar_color: string;
  ganhos_qtd: number;
  ganhos_valor: number;
  propostas_qtd: number;
  conversao: number | null;
  perdas_qtd: number;
  leads_contatados: number;
  tempo_medio_primeira_resposta_min: number;
  slas_estourados: number;
  carteira_45_60: number;
  carteira_60_mais: number;
  pos_venda_no_prazo_pct: number | null;
  score: number;
  score_periodo_anterior: number;
  posicao: number;
};

const inputSchema = z.object({
  periodo: z.enum(["semana", "mes", "trimestre"]).default("mes"),
});

/** Fonte única do Placar. Lê da função SQL placar_vendedores. */
export const getPlacar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("placar_vendedores" as any, {
      _periodo: data.periodo,
    });
    if (error) throw new Error(error.message);
    const vendedores = ((rows ?? []) as any[]).map((r) => ({
      vendedor_id: r.vendedor_id,
      nome: r.nome,
      avatar_color: r.avatar_color,
      ganhos_qtd: Number(r.ganhos_qtd ?? 0),
      ganhos_valor: Number(r.ganhos_valor ?? 0),
      propostas_qtd: Number(r.propostas_qtd ?? 0),
      conversao: r.conversao === null || r.conversao === undefined ? null : Number(r.conversao),
      perdas_qtd: Number(r.perdas_qtd ?? 0),
      leads_contatados: Number(r.leads_contatados ?? 0),
      tempo_medio_primeira_resposta_min: Number(r.tempo_medio_primeira_resposta_min ?? 0),
      slas_estourados: Number(r.slas_estourados ?? 0),
      carteira_45_60: Number(r.carteira_45_60 ?? 0),
      carteira_60_mais: Number(r.carteira_60_mais ?? 0),
      pos_venda_no_prazo_pct:
        r.pos_venda_no_prazo_pct === null || r.pos_venda_no_prazo_pct === undefined
          ? null
          : Number(r.pos_venda_no_prazo_pct),
      score: Number(r.score ?? 0),
      score_periodo_anterior: Number(r.score_periodo_anterior ?? 0),
      posicao: Number(r.posicao ?? 0),
    })) as PlacarVendedor[];
    return {
      periodo: data.periodo,
      vendedores,
      atualizadoEm: new Date().toISOString(),
    };
  });
