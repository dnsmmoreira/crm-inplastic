/**
 * Carteira do vendedor (server-only).
 *
 * A carteira é a âncora: contato de cliente que já é da casa vai para o
 * vendedor dele, nunca para a fila e nunca para a IA.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarFalhaSegura } from "@/lib/guard-erros";
import type { LeadCasado } from "@/lib/carteira-match";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any>;

export type MatchCarteira = {
  clienteId: string | null;
  leadId: string | null;
  vendedorId: string;
  origem: string;
};

/** Consulta a carteira por telefone/CNPJ/e-mail. Nunca lança. */
export async function localizarCarteira(
  sb: SB,
  input: { telefone?: string | null; cnpj?: string | null; email?: string | null },
): Promise<MatchCarteira | null> {
  const { chavesDoContato, temChave } = await import("@/lib/carteira-match");
  const chaves = chavesDoContato({
    telefone: input.telefone ?? null,
    cnpj: input.cnpj ?? null,
    email: input.email ?? null,
  });
  if (!temChave(chaves)) return null;

  const { data, error } = await sb.rpc("localizar_carteira", {
    _telefone: input.telefone ?? null,
    _cnpj: input.cnpj ?? null,
    _email: input.email ?? null,
  });
  if (error) {
    await registrarFalhaSegura("carteira.localizar", error, {});
    return null;
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.vendedor_id) return null;
  return {
    clienteId: (row.cliente_id as string | null) ?? null,
    leadId: (row.lead_id as string | null) ?? null,
    vendedorId: row.vendedor_id as string,
    origem: (row.origem as string) ?? "carteira",
  };
}

export type ResultadoConversaCarteira = {
  aplicado: boolean;
  leadId?: string | null;
  vendedorId?: string;
};

/**
 * Conversa de WhatsApp que bate com a carteira: vincula ao lead existente,
 * entrega ao dono, desliga a IA e cria a cobrança de resposta.
 * Nunca lança — o webhook não pode cair por causa disso.
 */
export async function aplicarCarteiraNaConversa(
  sb: SB,
  input: { conversaId: string; phone: string; nome?: string | null },
): Promise<ResultadoConversaCarteira> {
  try {
    const { data: conv, error: convErr } = await sb
      .from("whatsapp_conversas")
      .select("id, lead_id, atribuido_para, status")
      .eq("id", input.conversaId)
      .maybeSingle();
    if (convErr) {
      await registrarFalhaSegura("carteira.conversa.ler", convErr, {
        conversa_id: input.conversaId,
      });
      return { aplicado: false };
    }
    if (!conv || conv.status === "encerrado" || conv.atribuido_para) return { aplicado: false };

    const match = await localizarCarteira(sb, { telefone: input.phone });
    if (!match) return { aplicado: false };

    // Lead aberto exige conferir se um humano já trabalhou aquele lead.
    let leadCasado: LeadCasado = null;
    if (match.origem.startsWith("lead_aberto:") && match.leadId) {
      const { data: lc, error: lcErr } = await sb
        .from("leads")
        .select("id, owner_id, last_contact_at")
        .eq("id", match.leadId)
        .maybeSingle();
      if (lcErr) {
        await registrarFalhaSegura("carteira.conversa.lead-casado", lcErr, {
          conversa_id: input.conversaId,
        });
        return { aplicado: false };
      }
      let statusConversa: string | null = null;
      if (lc?.id) {
        const { data: cc } = await sb
          .from("whatsapp_conversas")
          .select("status")
          .eq("lead_id", lc.id)
          .neq("id", input.conversaId)
          .order("updated_at", { ascending: false })
          .limit(1);
        statusConversa = cc?.[0]?.status ?? null;
      }
      leadCasado = lc
        ? {
            ownerId: (lc.owner_id as string | null) ?? null,
            ultimoContatoEm: (lc.last_contact_at as string | null) ?? null,
            statusConversa,
          }
        : null;
    }

    const { decidirCarteiraNaConversa } = await import("@/lib/carteira-match");
    const deveAgir = decidirCarteiraNaConversa(
      { id: input.conversaId, leadId: (conv.lead_id as string | null) ?? null },
      { leadId: match.leadId, vendedorId: match.vendedorId, origem: match.origem },
      leadCasado,
    );
    if (!deveAgir) return { aplicado: false };

    const leadId = (conv.lead_id as string | null) ?? match.leadId;


    const up = await sb
      .from("whatsapp_conversas")
      .update({
        ...(leadId ? { lead_id: leadId } : {}),
        atribuido_para: match.vendedorId,
        atribuido_em: new Date().toISOString(),
        ia_ativa: false,
        requer_humano: true,
        motivo_handoff: "cliente_existente",
        status: "humano_atendendo",
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.conversaId);
    if (up.error) {
      await registrarFalhaSegura("carteira.conversa.atribuir", up.error, {
        conversa_id: input.conversaId,
      });
      return { aplicado: false };
    }

    // Cobrança de resposta (1 hora) — só uma por vez.
    if (leadId) {
      const { data: jaTem } = await sb
        .from("tarefas")
        .select("id")
        .eq("lead_id", leadId)
        .eq("tipo", "resposta_pendente")
        .in("status", ["pendente", "adiada"])
        .limit(1);
      if (!jaTem?.length) {
        const insT = await sb.from("tarefas").insert({
          owner_id: match.vendedorId,
          lead_id: leadId,
          tipo: "resposta_pendente",
          kind: "resposta_pendente",
          origem: "xerife",
          status: "pendente",
          prioridade: 1,
          title: "Cliente da sua carteira escreveu no WhatsApp",
          descricao: `Mensagem nova de um cliente da sua carteira. [conversa:${input.conversaId}]`,
          due_date: new Date(Date.now() + 3600_000).toISOString(),
        });
        if (insT.error) {
          await registrarFalhaSegura("carteira.conversa.tarefa", insT.error, {
            conversa_id: input.conversaId,
            lead_id: leadId,
          });
        }
      }
    }

    // A notificação com aceite é criada pelo gatilho de atribuição da conversa.

    return { aplicado: true, leadId, vendedorId: match.vendedorId };
  } catch (e) {
    await registrarFalhaSegura("carteira.conversa", e, { conversa_id: input.conversaId });
    return { aplicado: false };
  }
}

/**
 * Lead já existente da carteira para este telefone (cliente da casa).
 * Quando existe, NÃO se cria lead novo: o atendimento continua no mesmo.
 */
export async function leadExistenteDaCarteira(
  sb: SB,
  telefone: string | null | undefined,
): Promise<string | null> {
  const m = await localizarCarteira(sb, { telefone: telefone ?? null });
  return m?.leadId ?? null;
}
