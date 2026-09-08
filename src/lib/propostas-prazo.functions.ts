/**
 * Bloco 4 — ações de prazo da proposta chamadas pela tela da proposta.
 * Gate fail-closed: dono, admin ou `propostas.alterar_status`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

export const prorrogarProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propostaId: z.string().uuid(),
        ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a nova validade."),
        motivo: z.string().trim().min(5, "Explique por que está prorrogando."),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertNoError } = await import("@/lib/guard-erros");
    const { assertPodeAlterarStatus, auditarProposta } = await import(
      "@/lib/propostas-perda.server"
    );
    const sb = context.supabase as any;

    const { data: prop, error } = await sb
      .from("propostas")
      .select("id, number, owner_id, status")
      .eq("id", data.propostaId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!prop) throw new Error("Proposta não encontrada.");
    await assertPodeAlterarStatus(sb, context.userId, prop.owner_id);

    const up = await sb
      .from("propostas")
      .update({
        prorrogada_ate: data.ate,
        prorrogacao_motivo: data.motivo.trim(),
        vencida_em: null,
      })
      .eq("id", data.propostaId);
    await assertNoError(up, "propostas-prazo.prorrogar", { proposta_id: data.propostaId });
    await auditarProposta(
      sb,
      context.userId,
      "proposta_prorrogada",
      prop.number ?? null,
      data.ate,
    );
    return { ok: true as const, ate: data.ate };
  });

export const reemitirProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propostaId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertNoError } = await import("@/lib/guard-erros");
    const { assertPodeAlterarStatus, auditarProposta } = await import(
      "@/lib/propostas-perda.server"
    );
    const { duplicarPropostaImpl } = await import("@/lib/propostas-duplicar.server");
    const sb = context.supabase as any;

    const { data: prop, error } = await sb
      .from("propostas")
      .select("id, number, owner_id, status")
      .eq("id", data.propostaId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!prop) throw new Error("Proposta não encontrada.");
    await assertPodeAlterarStatus(sb, context.userId, prop.owner_id);

    const nova = await duplicarPropostaImpl(sb as never, data.propostaId, context.userId);
    // A antiga não pode seguir "enviada": vira recusada por duplicidade.
    // Update direto (sem `recusarProposta`) para NÃO avaliar perda do lead — a nova está aberta.
    const up = await sb
      .from("propostas")
      .update({
        reemitida_como: nova.id,
        vencida_em: new Date().toISOString(),
        status: "recusada",
        motivo_recusa: "Duplicidade",
        recusa_detalhe: `reemitida como ${nova.number}`,
        recusada_em: new Date().toISOString(),
        recusada_por: context.userId,
      })
      .eq("id", data.propostaId);
    await assertNoError(up, "propostas-prazo.reemitir", { proposta_id: data.propostaId });

    await auditarProposta(
      sb,
      context.userId,
      "proposta_reemitida",
      prop.number ?? null,
      nova.number ?? null,
    );
    return { ok: true as const, id: nova.id, number: nova.number };
  });
