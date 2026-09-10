/**
 * Rede de segurança da carteira (somente leitura).
 *
 * Passa `localizar_carteira` nos leads ATIVOS sem `cliente_id` e apenas
 * SINALIZA divergências (dono atual ≠ dono da carteira, ou cliente da casa sem
 * vínculo). NÃO reatribui nada: a decisão de mudar dono é humana.
 */
import { registrarFalhaAdmin } from "@/lib/falhas.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export type DivergenciaCarteira = {
  leadId: string;
  company: string | null;
  ownerAtual: string | null;
  vendedorCarteira: string;
  clienteId: string | null;
  origem: string;
  /** true quando o dono atual não é o dono da carteira. */
  donoDiferente: boolean;
};

/** Leads manuais são deliberadamente fora do vínculo automático. */
export function ignoraReconciliacao(source: string | null | undefined): boolean {
  return String(source ?? "").trim().toLowerCase() === "manual";
}

export async function reconciliarCarteira(
  opts: { limite?: number; sb?: SB } = {},
): Promise<{ analisados: number; divergencias: DivergenciaCarteira[] }> {
  const limite = opts.limite ?? 300;
  const sb: SB =
    opts.sb ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;

  const { data: leads, error } = await sb
    .from("leads")
    .select("id, company, source, owner_id, cliente_id, phone, whatsapp, telefone_whatsapp, telefone2, telefone_fixo, cnpj, email")
    .is("cliente_id", null)
    .not("stage", "in", "(ganho,perdido)")
    .order("created_at", { ascending: false })
    .limit(limite);

  if (error) {
    await registrarFalhaAdmin("carteira.reconciliacao", error, {});
    return { analisados: 0, divergencias: [] };
  }

  const divergencias: DivergenciaCarteira[] = [];
  const lista = (leads ?? []) as any[];

  for (const l of lista) {
    if (ignoraReconciliacao(l.source)) continue;
    const telefone =
      l.telefone_whatsapp ?? l.whatsapp ?? l.phone ?? l.telefone2 ?? l.telefone_fixo ?? null;
    const { data, error: rpcErr } = await sb.rpc("localizar_carteira", {
      _telefone: telefone,
      _cnpj: l.cnpj ?? null,
      _email: l.email ?? null,
    });
    if (rpcErr) {
      await registrarFalhaAdmin("carteira.reconciliacao.rpc", rpcErr, { lead_id: l.id });
      continue;
    }
    const row = Array.isArray(data) ? data[0] : null;
    if (!row?.vendedor_id) continue;
    // O match apontou o próprio lead: não é cliente da casa.
    if (row.lead_id && row.lead_id === l.id) continue;

    divergencias.push({
      leadId: l.id,
      company: l.company ?? null,
      ownerAtual: l.owner_id ?? null,
      vendedorCarteira: row.vendedor_id,
      clienteId: row.cliente_id ?? null,
      origem: String(row.origem ?? "carteira"),
      donoDiferente: Boolean(l.owner_id) && l.owner_id !== row.vendedor_id,
    });
  }

  if (divergencias.length) {
    await registrarFalhaAdmin(
      "carteira.reconciliacao",
      `${divergencias.length} lead(s) ativos batem com a carteira e estão sem vínculo`,
      { divergencias: divergencias.slice(0, 50) },
    );
  }

  return { analisados: lista.length, divergencias };
}
