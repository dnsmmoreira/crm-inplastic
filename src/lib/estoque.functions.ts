/**
 * Ajuste manual de saldo de estoque.
 *
 * A RLS já restringe a escrita em `produtos` ao admin; aqui a gravação passa a
 * ser feita no servidor para deixar TRILHA de quem mexeu (user_audit_log).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertNoError, assertRpcPermissao } from "@/lib/guard-erros";

/** Núcleo testável: recebe o client do usuário já autenticado. */
export async function ajustarSaldoCore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  userId: string,
  data: { produtoId: string; saldo: number },
) {
  const isAdmin = await assertRpcPermissao(
    await sb.rpc("has_role", { _user_id: userId, _role: "admin" }),
    "estoque.ajustarSaldo/has_role",
    { userId },
  );
  if (isAdmin !== true) {
    throw new Error("Você não tem permissão para ajustar o estoque.");
  }

  const { data: produto } = await sb
    .from("produtos")
    .select("sku, name, estoque_atual")
    .eq("id", data.produtoId)
    .maybeSingle();
  if (!produto) throw new Error("Produto não encontrado.");

  const saldoAnterior = Number((produto as { estoque_atual: number | null }).estoque_atual ?? 0);
  const sku = (produto as { sku: string | null }).sku ?? data.produtoId;

  const res = await sb
    .from("produtos")
    .update({ estoque_atual: data.saldo })
    .eq("id", data.produtoId);
  await assertNoError(res, "estoque.ajustarSaldo/update", { produtoId: data.produtoId });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { inserirMonitorado } = await import("@/lib/rls-monitor.server");
  await inserirMonitorado(
    supabaseAdmin,
    "user_audit_log",
    {
      ator_user_id: userId,
      alvo_user_id: userId,
      campo: "estoque_produto",
      valor_anterior: String(saldoAnterior),
      valor_novo: `${sku}: ${saldoAnterior} → ${data.saldo}`,
    },
    { acao: "estoque.ajustarSaldo", produto_id: data.produtoId },
  );

  return { ok: true as const, saldo: data.saldo };
}

export const ajustarSaldoProduto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        produtoId: z.string().uuid(),
        saldo: z.number().int().min(0).max(1_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    ajustarSaldoCore(context.supabase, context.userId, data),
  );
