import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertNoError, assertRpcPermissao } from "@/lib/guard-erros";
import {
  agruparMotivos,
  resumirPorVendedor,
  resumirPropostas,
  type MotivoRecusaAgregado,
  type PropostaMetricaRow,
  type ResumoPropostas,
} from "@/lib/relatorio-propostas";

export type PeriodoPropostas = "30" | "90" | "180" | "ano";

export type RelatorioPropostasResult = {
  periodo: PeriodoPropostas;
  desde: string;
  isAdmin: boolean;
  resumo: ResumoPropostas;
  motivos: MotivoRecusaAgregado[];
  vendedores: { owner_id: string; nome: string; resumo: ResumoPropostas }[];
};

const inputSchema = z.object({
  periodo: z.enum(["30", "90", "180", "ano"]).default("30"),
  vendedorId: z.string().uuid().nullable().optional(),
});

function desdeISO(periodo: PeriodoPropostas): string {
  const agora = new Date();
  if (periodo === "ano") return new Date(agora.getFullYear(), 0, 1).toISOString();
  const dias = Number(periodo);
  return new Date(agora.getTime() - dias * 86_400_000).toISOString();
}

/**
 * Relatório de propostas — leitura pura. Vendedor comum só enxerga as próprias
 * propostas (fail-closed: sem admin, o filtro por dono é obrigatório).
 */
export const getRelatorioPropostas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<RelatorioPropostasResult> => {
    const { supabase, userId } = context;
    const isAdmin =
      (await assertRpcPermissao(
        await supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
        "relatorio-propostas/has_role",
        { userId },
      )) === true;

    const desde = desdeISO(data.periodo);
    let q = supabase
      .from("propostas")
      .select(
        "id, owner_id, status, created_at, sent_at, recusada_em, order_created_at, motivo_recusa, discount_percent, acrescimo_percent",
      )
      .gte("created_at", desde);
    if (!isAdmin) q = q.eq("owner_id", userId);
    else if (data.vendedorId) q = q.eq("owner_id", data.vendedorId);

    const propRes = await q;
    assertNoError(propRes, "relatorio-propostas/propostas");
    const props = propRes.data ?? [];
    const ids = props.map((p) => p.id);

    const totalPorProposta = new Map<string, number>();
    if (ids.length > 0) {
      const itensRes = await supabase
        .from("proposta_itens")
        .select("proposta_id, quantity, unit_price")
        .in("proposta_id", ids);
      assertNoError(itensRes, "relatorio-propostas/itens");
      for (const it of itensRes.data ?? []) {
        const atual = totalPorProposta.get(it.proposta_id) ?? 0;
        totalPorProposta.set(
          it.proposta_id,
          atual + Number(it.quantity ?? 0) * Number(it.unit_price ?? 0),
        );
      }
    }

    const rows: PropostaMetricaRow[] = props.map((p) => {
      const subtotal = totalPorProposta.get(p.id) ?? 0;
      const desc = Math.max(0, Math.min(100, Number(p.discount_percent) || 0));
      const acre = Math.max(0, Number(p.acrescimo_percent) || 0);
      const aposDesconto = subtotal * (1 - desc / 100);
      return {
        id: p.id,
        owner_id: p.owner_id,
        status: String(p.status),
        total: +(aposDesconto * (1 + acre / 100)).toFixed(2),
        created_at: p.created_at,
        sent_at: p.sent_at,
        recusada_em: p.recusada_em,
        order_created_at: p.order_created_at,
        motivo_recusa: p.motivo_recusa,
      };
    });

    const porVendedor = resumirPorVendedor(rows);
    const nomes = new Map<string, string>();
    if (porVendedor.length > 0) {
      const profRes = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", porVendedor.map((v) => v.owner_id));
      assertNoError(profRes, "relatorio-propostas/profiles");
      for (const p of profRes.data ?? []) nomes.set(p.id, p.name ?? "Vendedor");
    }

    return {
      periodo: data.periodo,
      desde,
      isAdmin,
      resumo: resumirPropostas(rows),
      motivos: agruparMotivos(rows),
      vendedores: porVendedor.map((v) => ({
        owner_id: v.owner_id,
        nome: nomes.get(v.owner_id) ?? "Vendedor",
        resumo: v.resumo,
      })),
    };
  });
