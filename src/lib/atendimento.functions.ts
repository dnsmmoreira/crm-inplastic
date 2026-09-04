import { createServerFn } from "@tanstack/react-start";
import { registrarFalhaSegura } from "@/lib/guard-erros";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { PERM_WHATSAPP_ATENDER } from "@/lib/atendimento-espera";

/** Client Supabase autenticado do contexto (tipagem local, sem acoplar ao gerado). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

/**
 * Marca a conversa como "humano_atendendo", desliga a IA, garante a atribuição
 * ao usuário que assumiu e marca as notificações dessa conversa como lidas.
 * RLS: admin sempre pode; vendedor só se for dono do lead ou o atribuído.
 */
export const assumirConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: atual } = await supabase
      .from("whatsapp_conversas")
      .select("atribuido_para")
      .eq("id", data.conversaId)
      .maybeSingle();

    const patch = {
      status: "humano_atendendo" as const,
      ia_ativa: false,
      ...(atual?.atribuido_para ? {} : { atribuido_para: userId }),
    };


    const { error } = await supabase
      .from("whatsapp_conversas")
      .update(patch)
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);

    // BAIXA / registrar e seguir: marcar notificação como lida é cosmético.
    const upNotif = await supabase
      .from("notificacoes")
      .update({ lida_em: new Date().toISOString() })
      .eq("conversa_id", data.conversaId)
      .eq("user_id", userId)
      .is("lida_em", null);
    if (upNotif?.error) {
      await registrarFalhaSegura("atendimento/marcar-notificacao-lida", upNotif.error, {
        conversa_id: data.conversaId,
      });
    }

    return { ok: true };
  });


/**
 * Devolve a conversa para a IA: limpa a posse e reativa o atendimento automático.
 * Permitido ao dono da conversa e ao administrador.
 */
export const devolverParaIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: conversa, error: cErr } = await supabase
      .from("whatsapp_conversas")
      .select("id, atribuido_para")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (cErr || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");

    // MÉDIA / registrar e seguir: o gate já é fail-closed (isAdmin indefinido bloqueia).
    const { data: isAdmin, error: isAdminErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (isAdminErr) await registrarFalhaSegura("atendimento/has_role", isAdminErr, { user_id: userId });
    const dono = conversa.atribuido_para ?? null;
    if (!isAdmin && dono && dono !== userId) {
      throw new Error("Somente o responsável pela conversa ou um administrador pode devolvê-la.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("whatsapp_conversas")
      .update({
        status: "ia_atendendo",
        ia_ativa: true,
        atribuido_para: null,
        atribuido_em: null,
      })
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);

    if (dono) {
      // REGISTRAR E SEGUIR: auditoria posterior à devolução já efetivada.
      const audit = await supabaseAdmin.from("user_audit_log").insert({
        alvo_user_id: dono,
        ator_user_id: userId,
        campo: "conversa_devolvida_ia",
        valor_anterior: dono,
        valor_novo: null,
      });
      if (audit?.error) {
        await registrarFalhaSegura("atendimento.devolverConversa/auditoria", audit.error, {
          conversa_id: data.conversaId,
        });
      }
    }

    return { ok: true };
  });



/**
 * Encerra a conversa: status='encerrado' e limpa requer_humano.
 * Não dispara nenhuma mensagem de WhatsApp.
 */
export const encerrarConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("whatsapp_conversas")
      .update({ status: "encerrado", ia_ativa: false, requer_humano: false })
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);

    // BAIXA / registrar e seguir: marcar notificação como lida é cosmético.
    const upNotif = await supabase
      .from("notificacoes")
      .update({ lida_em: new Date().toISOString() })
      .eq("conversa_id", data.conversaId)
      .eq("user_id", userId)
      .is("lida_em", null);
    if (upNotif?.error) {
      await registrarFalhaSegura("atendimento/marcar-notificacao-lida", upNotif.error, {
        conversa_id: data.conversaId,
      });
    }

    return { ok: true };
  });

/**
 * Lista os vendedores ativos (admin apenas) para o seletor de atribuição.
 */
export const listarVendedoresAtendimento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const isAdmin = (roles ?? []).some((r) => r.user_id === userId && r.role === "admin");
    if (!isAdmin) return [] as Array<{ id: string; name: string }>;
    const vendedorIds = (roles ?? []).filter((r) => r.role === "vendedor").map((r) => r.user_id);
    if (vendedorIds.length === 0) return [] as Array<{ id: string; name: string }>;
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", vendedorIds)
      .eq("ativo", true)
      .is("deleted_at", null)
      .order("name");
    return (profiles ?? []).map((p) => ({ id: p.id, name: p.name }));
  });

/**
 * Atribui a conversa a um vendedor (admin apenas). O gatilho do banco cria a
 * notificação e preenche `atribuido_em`.
 */
export const atribuirConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ conversaId: z.string().uuid(), vendedorId: z.string().uuid().nullable() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // MÉDIA / registrar e seguir: o gate já é fail-closed (isAdmin indefinido bloqueia).
    const { data: isAdmin, error: isAdminErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (isAdminErr) await registrarFalhaSegura("atendimento/has_role", isAdminErr, { user_id: userId });
    if (!isAdmin) throw new Error("Apenas administradores podem atribuir conversas.");
    const { error } = await supabase
      .from("whatsapp_conversas")
      .update({ atribuido_para: data.vendedorId })
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Lista as conversas que estão com a IA e ainda sem responsável (admin apenas),
 * da mais antiga para a mais nova.
 */
export const listarConversasSemAtribuicao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // MÉDIA / registrar e seguir: o gate já é fail-closed (isAdmin indefinido bloqueia).
    const { data: isAdmin, error: isAdminErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (isAdminErr) await registrarFalhaSegura("atendimento/has_role", isAdminErr, { user_id: userId });
    if (!isAdmin) return [];
    const { data, error } = await supabase
      .from("whatsapp_conversas")
      .select("id, name, phone, last_message_at, created_at, requer_humano")
      .eq("status", "ia_atendendo")
      .is("atribuido_para", null)
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        requerHumano: c.requer_humano,
        paradaDesde: c.last_message_at ?? c.created_at,
      }))
      .sort((a, b) => new Date(a.paradaDesde).getTime() - new Date(b.paradaDesde).getTime());
  });

/**
 * Atribui várias conversas de uma vez (admin apenas). Só grava onde a conversa
 * ainda está sem responsável, para não sobrescrever atribuição concorrente.
 */
export const atribuirConversasEmLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        atribuicoes: z
          .array(z.object({ conversaId: z.string().uuid(), vendedorId: z.string().uuid() }))
          .min(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // MÉDIA / registrar e seguir: o gate já é fail-closed (isAdmin indefinido bloqueia).
    const { data: isAdmin, error: isAdminErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (isAdminErr) await registrarFalhaSegura("atendimento/has_role", isAdminErr, { user_id: userId });
    if (!isAdmin) throw new Error("Apenas administradores podem atribuir conversas.");

    const alvos = [...new Set(data.atribuicoes.map((a) => a.vendedorId))];
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "vendedor")
      .in("user_id", alvos);
    const { data: perfis } = await supabase
      .from("profiles")
      .select("id")
      .in("id", alvos)
      .eq("ativo", true)
      .is("deleted_at", null);
    const validos = new Set(
      (roles ?? [])
        .map((r) => r.user_id)
        .filter((id) => (perfis ?? []).some((p) => p.id === id)),
    );
    const invalido = alvos.find((id) => !validos.has(id));
    if (invalido) throw new Error("Um dos responsáveis escolhidos não é um vendedor ativo.");

    let atribuidas = 0;
    let ignoradas = 0;
    for (const item of data.atribuicoes) {
      const { data: rows, error } = await supabase
        .from("whatsapp_conversas")
        .update({ atribuido_para: item.vendedorId })
        .eq("id", item.conversaId)
        .is("atribuido_para", null)
        .select("id");
      if (error) throw new Error(error.message);
      if ((rows ?? []).length > 0) atribuidas += 1;
      else ignoradas += 1;
    }
    return { atribuidas, ignoradas };
  });

// ───────────────────────── Transferência e espera ──────────────────────────

/**
 * Candidatos a receber uma transferência de conversa: quem tem a permissão
 * granular `whatsapp.atender`. Sem ninguém com a chave (projeto sem perfis
 * configurados), cai para os usuários ativos com papel de vendedor ou admin,
 * para o seletor nunca aparecer vazio.
 */
export const listarAtendentesParaTransferencia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { usuariosComPermissao } = await import("@/lib/pedidos-fluxo.server");

    let ids = await usuariosComPermissao(supabaseAdmin, PERM_WHATSAPP_ATENDER);
    if (ids.length === 0) {
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["vendedor", "admin"]);
      ids = [...new Set((roles ?? []).map((r) => r.user_id))];
    }
    if (ids.length === 0) return [] as Array<{ id: string; name: string }>;

    const perfisRes = await supabaseAdmin
      .from("profiles")
      .select("id, name")
      .in("id", ids)
      .eq("ativo", true)
      .is("deleted_at", null)
      .order("name");
    if (perfisRes.error) {
      await registrarFalhaSegura("atendimento/listar-atendentes", perfisRes.error, {
        user_id: userId,
      });
      return [] as Array<{ id: string; name: string }>;
    }
    void supabase;
    return (perfisRes.data ?? []).map((p) => ({ id: p.id, name: p.name as string }));
  });

/** Contexto de autorização do ator para as ações de conversa. */
async function contextoAtor(
  supabase: SupabaseLike,
  userId: string,
): Promise<{ isAdmin: boolean; podeAtender: boolean }> {
  const { data: isAdmin, error: e1 } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (e1) await registrarFalhaSegura("atendimento/has_role", e1, { user_id: userId });
  const { data: podeAtender, error: e2 } = await supabase.rpc("tem_permissao", {
    _user_id: userId,
    _chave: PERM_WHATSAPP_ATENDER,
  });
  if (e2) await registrarFalhaSegura("atendimento/tem_permissao", e2, { user_id: userId });
  return { isAdmin: isAdmin === true, podeAtender: podeAtender === true };
}

/**
 * Transfere a conversa para outro atendente, com motivo obrigatório.
 * Pode transferir: admin, o responsável atual, ou um atendente quando a
 * conversa está sem dono. A transferência tira a conversa da espera — quem
 * recebe precisa decidir o próximo passo.
 */
export const transferirConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        conversaId: z.string().uuid(),
        paraUserId: z.string().uuid(),
        motivo: z.string().trim().min(3, "Descreva o motivo da transferência."),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { podeTransferirConversa } = await import("@/lib/atendimento-espera");

    const { data: conversa, error: cErr } = await supabase
      .from("whatsapp_conversas")
      .select("id, atribuido_para, name, phone")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (cErr || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");

    const ator = await contextoAtor(supabase, userId);
    const donoAtual = conversa.atribuido_para ?? null;
    if (!podeTransferirConversa({ ...ator, userId, donoAtual })) {
      throw new Error(
        "Somente o responsável atual, um atendente (conversa sem dono) ou um administrador pode transferir.",
      );
    }
    if (donoAtual === data.paraUserId) {
      throw new Error("Esta conversa já está com o atendente escolhido.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: destino } = await supabaseAdmin
      .from("profiles")
      .select("id, name, ativo, deleted_at")
      .eq("id", data.paraUserId)
      .maybeSingle();
    if (!destino || destino.ativo !== true || destino.deleted_at) {
      throw new Error("O atendente escolhido não está ativo.");
    }

    // O gatilho do banco cria a notificação com aceite obrigatório.
    const { error } = await supabaseAdmin
      .from("whatsapp_conversas")
      .update({
        atribuido_para: data.paraUserId,
        em_espera_desde: null,
        em_espera_por: null,
        espera_alertada_em: null,
      })
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);

    // REGISTRAR E SEGUIR: o rastro é posterior à transferência já efetivada.
    const audit = await supabaseAdmin.from("user_audit_log").insert({
      alvo_user_id: data.paraUserId,
      ator_user_id: userId,
      campo: "conversa_transferida",
      valor_anterior: donoAtual,
      valor_novo: `${data.paraUserId} — ${data.motivo}`,
    });
    if (audit?.error) {
      await registrarFalhaSegura("atendimento/transferir-auditoria", audit.error, {
        conversa_id: data.conversaId,
      });
    }

    return { ok: true, para: destino.name as string };
  });

/**
 * Coloca o atendimento em espera (aguardando algo do cliente). Enquanto em
 * espera, a conversa some dos indicadores de "cliente sem resposta".
 */
export const colocarConversaEmEspera = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { podeGerenciarEspera } = await import("@/lib/atendimento-espera");

    const { data: conversa, error: cErr } = await supabase
      .from("whatsapp_conversas")
      .select("id, atribuido_para, status")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (cErr || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");
    if (conversa.status === "encerrado") {
      throw new Error("Conversa encerrada não pode entrar em espera.");
    }
    const ator = await contextoAtor(supabase, userId);
    if (!podeGerenciarEspera({ isAdmin: ator.isAdmin, userId, donoAtual: conversa.atribuido_para })) {
      throw new Error("Só o responsável pela conversa (ou um administrador) pode colocá-la em espera.");
    }

    const { error } = await supabase
      .from("whatsapp_conversas")
      .update({
        em_espera_desde: new Date().toISOString(),
        em_espera_por: userId,
        espera_alertada_em: null,
      })
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Retoma o atendimento: sai da espera e volta a contar tempo sem resposta. */
export const retomarConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { podeGerenciarEspera } = await import("@/lib/atendimento-espera");

    const { data: conversa, error: cErr } = await supabase
      .from("whatsapp_conversas")
      .select("id, atribuido_para")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (cErr || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");
    const ator = await contextoAtor(supabase, userId);
    if (!podeGerenciarEspera({ isAdmin: ator.isAdmin, userId, donoAtual: conversa.atribuido_para })) {
      throw new Error("Só o responsável pela conversa (ou um administrador) pode retomá-la.");
    }

    const { error } = await supabase
      .from("whatsapp_conversas")
      .update({ em_espera_desde: null, em_espera_por: null, espera_alertada_em: null })
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
