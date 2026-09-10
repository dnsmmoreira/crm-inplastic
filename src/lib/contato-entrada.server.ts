/**
 * Resolução de contato de entrada (server-only).
 *
 * Todos os canais (WhatsApp, OPA/n8n, cadastro) passam por aqui antes de
 * criar lead ou distribuir por rodízio.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarFalhaSegura } from "@/lib/guard-erros";
import { decidirEntrada, temChaveForte, type AlvoLeadAtivo, type DecisaoEntrada } from "@/lib/contato-entrada";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any>;

/** Lead ativo (etapa não encerrada) que casa por telefone ou CNPJ. Nunca lança. */
export async function localizarLeadAtivo(
  sb: SB,
  input: { telefone?: string | null; cnpj?: string | null },
): Promise<AlvoLeadAtivo> {
  if (!temChaveForte(input)) return null;
  const { data, error } = await sb.rpc("localizar_lead_ativo", {
    _telefone: input.telefone ?? null,
    _cnpj: input.cnpj ?? null,
  });
  if (error) {
    await registrarFalhaSegura("contato-entrada.localizarLeadAtivo", error, {});
    return null;
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.lead_id) return null;
  return {
    leadId: row.lead_id as string,
    ownerId: (row.owner_id as string | null) ?? null,
    stage: (row.stage as string) ?? "novo",
    company: (row.company as string | null) ?? null,
    origem: (row.origem as string) ?? "lead_ativo",
  };
}

export type EntradaResolvida = DecisaoEntrada & { leadAtivo?: AlvoLeadAtivo };

/**
 * Decide o destino do contato: carteira, lead ativo já existente ou lead novo.
 * Nunca lança — na dúvida devolve `criar_lead`, que é o comportamento antigo.
 */
export async function resolverContatoEntrada(
  sb: SB,
  input: {
    telefone?: string | null;
    cnpj?: string | null;
    email?: string | null;
    conversaLeadId?: string | null;
  },
): Promise<EntradaResolvida> {
  try {
    const { localizarCarteira } = await import("@/lib/carteira.server");
    const carteira = await localizarCarteira(sb, {
      telefone: input.telefone ?? null,
      cnpj: input.cnpj ?? null,
      email: input.email ?? null,
    });
    const leadAtivo = carteira?.vendedorId
      ? null
      : await localizarLeadAtivo(sb, { telefone: input.telefone ?? null, cnpj: input.cnpj ?? null });

    const decisao = decidirEntrada({
      conversaLeadId: input.conversaLeadId ?? null,
      carteira,
      leadAtivo,
    });
    return { ...decisao, leadAtivo };
  } catch (e) {
    await registrarFalhaSegura("contato-entrada.resolver", e, {});
    return { acao: "criar_lead" };
  }
}
