/**
 * Redes de segurança de atendimento: garante que nenhuma conversa fique
 * sem responsável e que todo handoff gere alerta visível.
 *
 * Server-only. Usa o client admin (bypassa RLS) — nunca importar no cliente.
 */
import { notifyOwner, crmLeadLink } from "@/lib/xerife/notify.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export type ResultadoAtribuicao = {
  vendedorId: string | null;
  erro: string | null;
};

/** Notificação in-app (sino) para um usuário específico. */
export async function notificarUsuario(
  sb: SB,
  params: { userId: string; tipo: string; titulo: string; conversaId?: string | null },
): Promise<void> {
  const { error } = await sb.from("notificacoes").insert({
    user_id: params.userId,
    tipo: params.tipo,
    titulo: params.titulo,
    conversa_id: params.conversaId ?? null,
  });
  if (error) console.error("[handoff] notificacoes insert falhou:", error.message);
}

/**
 * Notificação in-app para quem administra o sistema.
 *
 * Destinatário = quem tem a permissão granular `usuarios.gerenciar` no perfil
 * ativo (mesmo critério do resumo diário do Xerife). NÃO usa mais
 * `user_roles.role = 'admin'`: aquele papel é amplo demais e incluía perfis
 * comerciais (ex.: Gestor Comercial) em alertas de operação de atendimento.
 *
 * Também não dispara mais para o grupo do Telegram da diretoria — este alerta
 * é in-app (sino).
 */
export async function alertarAdmins(
  sb: SB,
  params: { tipo: string; titulo: string; conversaId?: string | null; mensagem?: string },
): Promise<void> {
  void params.mensagem;
  const { usuariosComPermissao } = await import("@/lib/pedidos-fluxo.server");
  const destinatarios = await usuariosComPermissao(sb, "usuarios.gerenciar");
  for (const userId of destinatarios) {
    await notificarUsuario(sb, {
      userId,
      tipo: params.tipo,
      titulo: params.titulo,
      conversaId: params.conversaId ?? null,
    });
  }
}

/**
 * Garante responsável para a conversa:
 *   1. round-robin via RPC atribuir_proximo_vendedor (quando há lead)
 *   2. grava atribuido_para na conversa (o trigger gera a notificação in-app)
 *   3. notifica o vendedor pelos canais internos
 *   4. em falha: requer_humano=true + alerta para admin/diretoria
 */
export async function garantirResponsavelConversa(
  sb: SB,
  params: {
    conversaId: string;
    leadId: string | null;
    contexto: string;
    tituloVendedor?: string;
  },
): Promise<ResultadoAtribuicao> {
  const { conversaId, leadId, contexto } = params;

  // Já tem responsável? Não mexe na fila.
  const { data: conv } = await sb
    .from("whatsapp_conversas")
    .select("id, phone, name, atribuido_para, lead_id")
    .eq("id", conversaId)
    .maybeSingle();
  if (conv?.atribuido_para) {
    return { vendedorId: conv.atribuido_para as string, erro: null };
  }

  const alvoLead = leadId ?? (conv?.lead_id as string | null) ?? null;
  let vendedorId: string | null = null;
  let erro: string | null = null;

  if (alvoLead) {
    const { data, error } = await sb.rpc("atribuir_proximo_vendedor", { _lead_id: alvoLead });
    if (error) erro = error.message;
    else vendedorId = (data as string) ?? null;
  } else {
    erro = "conversa sem lead vinculado";
  }

  const quem = conv?.name?.trim() || conv?.phone || conversaId;

  if (vendedorId) {
    const { error: upErr } = await sb
      .from("whatsapp_conversas")
      .update({ atribuido_para: vendedorId, updated_at: new Date().toISOString() })
      .eq("id", conversaId)
      .is("atribuido_para", null);
    if (upErr) console.error("[handoff] atribuir conversa falhou:", upErr.message);

    await notifyOwner(
      vendedorId,
      `🔔 Conversa aguardando você\n\nCliente: ${quem}\nMotivo: ${contexto}${
        alvoLead ? `\n${crmLeadLink(alvoLead)}` : ""
      }`,
    );
    return { vendedorId, erro: null };
  }

  // Falhou: nunca deixar em silêncio.
  await sb
    .from("whatsapp_conversas")
    .update({
      requer_humano: true,
      motivo_handoff: `sem_responsavel: ${erro ?? "nenhum vendedor ativo na fila"}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversaId);

  await alertarAdmins(sb, {
    tipo: "conversa_sem_responsavel",
    titulo: `Conversa sem responsável — ${quem}`,
    conversaId,
    mensagem: `⚠️ Conversa SEM vendedor responsável\n\nCliente: ${quem}\nContexto: ${contexto}\nMotivo: ${
      erro ?? "nenhum vendedor ativo na fila"
    }`,
  });

  return { vendedorId: null, erro: erro ?? "nenhum vendedor ativo na fila" };
}
