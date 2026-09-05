import { supabase } from "@/integrations/supabase/client";
import { empresaPreferida } from "@/lib/rotulo-contato";

const COLS_LEADS_ROTULO = "id, company, contact_name, cliente_id";
const COLS_CLIENTES_ROTULO = "id, razao_social, nome_fantasia";

export type DadosLeadConversa = { empresa: string | null; contato: string | null };

/**
 * Busca EM LOTE (sem N+1) empresa/contato dos leads das conversas.
 * Falha de leitura não quebra a lista: registra no console e devolve o que deu.
 */
export async function carregarEmpresaPorConversa(
  conversas: Array<{ id: string; lead_id: string | null }>,
): Promise<Record<string, DadosLeadConversa>> {
  const leadIds = Array.from(
    new Set(conversas.map((c) => c.lead_id).filter((v): v is string => !!v)),
  );
  if (leadIds.length === 0) return {};

  const { data: leads, error: erroLeads } = await supabase
    .from("leads")
    .select(COLS_LEADS_ROTULO)
    .in("id", leadIds);
  if (erroLeads) {
    console.error("[conversas] falha ao carregar leads para rótulo", erroLeads);
    return {};
  }

  const clienteIds = Array.from(
    new Set((leads ?? []).map((l) => l.cliente_id).filter((v): v is string => !!v)),
  );
  const clientesById: Record<string, { razao_social: string | null; nome_fantasia: string | null }> =
    {};
  if (clienteIds.length > 0) {
    const { data: clientes, error: erroClientes } = await supabase
      .from("clientes")
      .select(COLS_CLIENTES_ROTULO)
      .in("id", clienteIds);
    if (erroClientes) {
      console.error("[conversas] falha ao carregar clientes para rótulo", erroClientes);
    } else {
      for (const c of clientes ?? []) {
        clientesById[c.id] = { razao_social: c.razao_social, nome_fantasia: c.nome_fantasia };
      }
    }
  }

  const porLead: Record<string, DadosLeadConversa> = {};
  for (const l of leads ?? []) {
    porLead[l.id] = {
      empresa: empresaPreferida(l.cliente_id ? clientesById[l.cliente_id] : null, l.company),
      contato: l.contact_name ?? null,
    };
  }

  const out: Record<string, DadosLeadConversa> = {};
  for (const c of conversas) {
    const d = c.lead_id ? porLead[c.lead_id] : null;
    if (d) out[c.id] = d;
  }
  return out;
}
