import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

function normalizePhoneBR(phone: string) {
  let p = onlyDigits(phone);
  if (!p.startsWith("55") && p.length <= 11) p = `55${p}`;
  return p;
}

/** Texto útil: sem emoji, pontuação, espaços. */
function textoUtil(s: string) {
  return s
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}

/** Retorna { hora, domingo } no fuso America/Sao_Paulo. */
function agoraSaoPaulo() {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(new Date());
  const hora = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  return { hora, domingo: weekday === "Sun" };
}

/**
 * Aplica a posse da conversa ao usuário que está atendendo.
 * - sem dono: assume automaticamente
 * - dono é outro: só transfere com confirmação explícita (assumirPosse) e audita
 * - já é dono: nada muda
 */
async function aplicarPosseConversa(
  conversaId: string,
  userId: string,
  donoAtual: string | null,
  assumirPosse: boolean,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  await supabaseAdmin
    .from("whatsapp_conversas")
    .update({ status: "humano_atendendo", ia_ativa: false })
    .eq("id", conversaId);

  if (donoAtual === userId) return { posse: "mantida" as const };

  if (!donoAtual) {
    await supabaseAdmin
      .from("whatsapp_conversas")
      .update({ atribuido_para: userId, atribuido_em: new Date().toISOString() })
      .eq("id", conversaId)
      .is("atribuido_para", null);
    return { posse: "assumida" as const };
  }

  if (!assumirPosse) return { posse: "inalterada" as const };

  await supabaseAdmin
    .from("whatsapp_conversas")
    .update({ atribuido_para: userId, atribuido_em: new Date().toISOString() })
    .eq("id", conversaId);

  await supabaseAdmin.from("user_audit_log").insert({
    alvo_user_id: donoAtual,
    ator_user_id: userId,
    campo: "conversa_atribuido_para",
    valor_anterior: donoAtual,
    valor_novo: userId,
  });

  return { posse: "transferida" as const };
}

/**
 * Posse atual da conversa (para confirmar transferência antes de enviar).
 */
export const posseConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conversa, error } = await supabase
      .from("whatsapp_conversas")
      .select("id, atribuido_para")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (error || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");
    const dono = conversa.atribuido_para ?? null;
    let nomeDono: string | null = null;
    if (dono && dono !== userId) {
      const { data: perfil } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", dono)
        .maybeSingle();
      nomeDono = perfil?.name ?? "outro atendente";
    }
    return { donoId: dono, nomeDono, souDono: dono === userId, semDono: !dono };
  });

/**
 * Envia mensagem via WhatsApp Cloud e registra em whatsapp_mensagens (autor='vendedor').
 */
export const sendConversaMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        conversaId: z.string().uuid(),
        message: z.string().min(1).max(4096),
        assumirPosse: z.boolean().optional(),
      })
      .parse(data),
  )

  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;


    const { data: conversa, error: cErr } = await supabase
      .from("whatsapp_conversas")
      .select("id, phone, atribuido_para")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (cErr || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");


    const { mascararTelefoneLog } = await import("./whatsapp-send.server");
    const phoneLog = mascararTelefoneLog(conversa.phone);
    const bloquear = (motivo: string, msg: string) => {
      console.warn(`[chat-manual] BLOQUEADO motivo=${motivo} phone=${phoneLog}`);
      throw new Error(msg);
    };

    const texto = data.message.trim();

    // (A1) Texto sem conteúdo útil
    if (textoUtil(texto).length < 2) {
      bloquear(
        "texto_sem_conteudo",
        "Escreva uma mensagem com pelo menos 2 caracteres de texto — só emoji ou pontuação não é enviado.",
      );
    }

    // (A2) Texto longo demais
    if (texto.length > 1200) {
      bloquear(
        "texto_muito_longo",
        "Mensagem muito longa (máximo de 1200 caracteres). Divida o conteúdo em partes menores.",
      );
    }

    // Papel resolvido SEMPRE no servidor a partir da sessão autenticada.
    // Qualquer incerteza (erro/nulo) => tratado como NÃO administrador.
    let isAdmin = false;
    try {
      const { data: adminFlag } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      isAdmin = adminFlag === true;
    } catch {
      isAdmin = false;
    }

    // Existe mensagem recebida do cliente nesta conversa?
    const { count: inboundCount, error: inErr } = await supabase
      .from("whatsapp_mensagens")
      .select("id", { count: "exact", head: true })
      .eq("conversa_id", data.conversaId)
      .eq("direcao", "entrada");
    const temInbound = !inErr && (inboundCount ?? 0) > 0;

    // (A3) Sem inbound e fora da janela comercial (admin com inbound já é exceção manual_admin)
    if (!temInbound) {
      const { hora, domingo } = agoraSaoPaulo();
      if (domingo || hora < 7 || hora >= 20) {
        bloquear(
          domingo ? "sem_inbound_domingo" : "sem_inbound_fora_da_janela",
          "Esta conversa ainda não tem mensagem do cliente. Envios só são permitidos de segunda a sábado, das 07:00 às 20:00.",
        );
      }
    }

    // (A4) Máximo de 8 mensagens do mesmo vendedor nesta conversa nos últimos 10 minutos
    const desde10min = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count: recentes } = await supabase
      .from("whatsapp_mensagens")
      .select("id", { count: "exact", head: true })
      .eq("conversa_id", data.conversaId)
      .eq("usuario_id", userId)
      .eq("autor", "vendedor")
      .gte("created_at", desde10min);
    if ((recentes ?? 0) >= 8) {
      bloquear(
        "limite_8_por_conversa_10min",
        "Você já enviou 8 mensagens para esta conversa nos últimos 10 minutos. Aguarde antes de enviar outra.",
      );
    }

    // (A5) Duas mensagens consecutivas do vendedor sem resposta do cliente
    const { data: ultimas } = await supabase
      .from("whatsapp_mensagens")
      .select("autor, created_at")
      .eq("conversa_id", data.conversaId)
      .order("created_at", { ascending: false })
      .limit(2);
    const seqVendedor = (ultimas ?? []).filter((m) => m.autor === "vendedor").length;
    if ((ultimas ?? []).length >= 2 && seqVendedor >= 2) {
      bloquear(
        "duas_mensagens_sem_resposta",
        "Já existem 2 mensagens suas sem resposta do cliente. Aguarde o retorno antes de enviar outra.",
      );
    }

    const origem = isAdmin && temInbound ? "manual_admin" : "iniciado_sistema";


    const { sendWhatsappText } = await import("./whatsapp-send.server");
    await sendWhatsappText(conversa.phone, data.message, "sendConversaMessage", "comercial", {
      origem,
    });


    const { error: mErr } = await supabase.from("whatsapp_mensagens").insert({
      conversa_id: data.conversaId,
      direcao: "saida",
      autor: "vendedor",
      conteudo: data.message,
      usuario_id: userId,
    });

    if (mErr) throw new Error(mErr.message);

    // Posse: assume se estiver sem dono; transfere só com confirmação explícita.
    const posse = await aplicarPosseConversa(
      data.conversaId,
      userId,
      conversa.atribuido_para ?? null,
      data.assumirPosse === true,
    );

    return { ok: true, posse: posse.posse };

  });

/**
 * Cria lead a partir de uma conversa sem lead vinculado.
 * Vincula o telefone (telefone_whatsapp), define owner = current user
 * e atualiza a conversa (lead_id + status='humano_atendendo').
 */
export const createLeadFromConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        conversaId: z.string().uuid(),
        company: z.string().optional(),
        contactName: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: conversa, error: cErr } = await supabase
      .from("whatsapp_conversas")
      .select("id, phone, name, lead_id, last_message_preview")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (cErr || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");
    if (conversa.lead_id) return { leadId: conversa.lead_id };

    const phoneDigits = normalizePhoneBR(conversa.phone);
    const displayName = data.contactName?.trim() || conversa.name?.trim() || "A identificar";
    const company =
      data.company?.trim() ||
      conversa.name?.trim() ||
      `Contato WhatsApp ${conversa.phone}`;

    const { data: lead, error: lErr } = await supabase
      .from("leads")
      .insert({
        owner_id: userId,
        company,
        contact_name: displayName,
        phone: conversa.phone,
        telefone_whatsapp: phoneDigits,
        stage: "atendimento",
        source: "WhatsApp",
        origem: "whatsapp",
        tags: ["WhatsApp"],
        notes: conversa.last_message_preview
          ? `Primeira mensagem: "${conversa.last_message_preview}"`
          : "",
        last_contact: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (lErr || !lead) throw new Error(lErr?.message ?? "Falha ao criar lead.");

    await supabase
      .from("whatsapp_conversas")
      .update({ lead_id: lead.id, status: "humano_atendendo", ia_ativa: false })
      .eq("id", data.conversaId);

    // Registra interação (dispara trigger de last_interaction)
    if (conversa.last_message_preview) {
      await supabase.from("lead_interactions").insert({
        lead_id: lead.id,
        owner_id: userId,
        type: "whatsapp",
        content: conversa.last_message_preview,
      });
    }

    return { leadId: lead.id };
  });

/**
 * Inicia (ou reaproveita) uma conversa de WhatsApp a partir de um cliente.
 * Não envia nenhuma mensagem — apenas garante a linha em whatsapp_conversas.
 */
export const iniciarConversaCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ clienteId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: cliente, error: cErr } = await supabase
      .from("clientes")
      .select("id, razao_social, nome_fantasia, telefone, telefone2")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (cErr || !cliente) throw new Error("Cliente não encontrado ou sem permissão.");

    const raw = (cliente.telefone ?? cliente.telefone2 ?? "").trim();
    if (!raw) throw new Error("Cliente sem telefone cadastrado");

    const phone = normalizePhoneBR(raw);
    if (phone.length < 12) throw new Error("Cliente sem telefone cadastrado");

    const nome = cliente.nome_fantasia?.trim() || cliente.razao_social?.trim() || null;

    const { data: existente } = await supabase
      .from("whatsapp_conversas")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (existente) return { conversaId: existente.id };

    // Lead vinculado ao cliente (se houver) para amarrar a conversa ao funil.
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("cliente_id", data.clienteId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // whatsapp_conversas não aceita INSERT via RLS; usamos o client privilegiado
    // apenas depois de validar o usuário e o acesso dele ao cliente.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: criada, error: iErr } = await supabaseAdmin
      .from("whatsapp_conversas")
      .insert({
        phone,
        name: nome,
        status: "humano_atendendo",
        ia_ativa: false,
        atribuido_para: userId,
        lead_id: lead?.id ?? null,
      })
      .select("id")
      .single();
    if (iErr || !criada) throw new Error(iErr?.message ?? "Falha ao iniciar conversa.");

    return { conversaId: criada.id };
  });

/* ------------------------------------------------------------------ *
 * Templates aprovados da Meta (envio fora da janela de 24h)
 * ------------------------------------------------------------------ */

/** Lista os templates APROVADOS da WABA (cache curto no servidor). */
export const listarTemplatesAprovados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ forcar: z.boolean().optional() }).parse(data ?? {}))
  .handler(async ({ data }) => {
    const { cloudListarTemplatesAprovados } = await import("./whatsapp-cloud.server");
    return cloudListarTemplatesAprovados(data.forcar === true);
  });

/** Status da janela de 24h desta conversa (última mensagem do cliente). */
export const statusJanelaConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: conversa, error } = await supabase
      .from("whatsapp_conversas")
      .select("id, phone, name")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (error || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");

    const { data: ultima } = await supabase
      .from("whatsapp_mensagens")
      .select("created_at")
      .eq("conversa_id", data.conversaId)
      .eq("autor", "cliente")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ultimaInboundEm = ultima?.created_at ?? null;
    const expiraEm = ultimaInboundEm
      ? new Date(new Date(ultimaInboundEm).getTime() + 24 * 3600_000).toISOString()
      : null;
    const janelaAberta = !!expiraEm && new Date(expiraEm).getTime() > Date.now();

    const { resolverPrimeiroNomeContato } = await import("./whatsapp-send.server");
    const primeiroNomeSugerido = await resolverPrimeiroNomeContato(conversa.phone);

    return { janelaAberta, expiraEm, ultimaInboundEm, primeiroNomeSugerido };
  });

/** Envia um template aprovado nesta conversa (respeita todas as guardas). */
export const enviarTemplateConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        conversaId: z.string().uuid(),
        templateName: z.string().min(1),
        lang: z.string().min(2),
        params: z.array(z.string()).max(10).optional(),
        assumirPosse: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: conversa, error: cErr } = await supabase
      .from("whatsapp_conversas")
      .select("id, phone, lead_id, atribuido_para")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (cErr || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");

    // Janela comercial: envio manual do atendente segue a mesma regra do automático.
    const { hora, domingo } = agoraSaoPaulo();
    if (domingo || hora < 7 || hora >= 20) {
      throw new Error(
        "Envios só são permitidos de segunda a sábado, das 07:00 às 20:00. Modelo não enviado.",
      );
    }

    // Só templates realmente aprovados e suportados no v1.
    const { cloudListarTemplatesAprovados } = await import("./whatsapp-cloud.server");
    const lista = await cloudListarTemplatesAprovados();
    if (!lista.ok) throw new Error(lista.erro ?? "Não foi possível consultar os modelos aprovados.");
    const tpl = lista.itens.find(
      (t) => t.name === data.templateName && t.language === data.lang,
    );
    if (!tpl) throw new Error("Modelo não está aprovado para este idioma.");
    if (!tpl.suportado) {
      throw new Error(tpl.motivoNaoSuportado ?? "Modelo não suportado no momento.");
    }

    const params = (data.params ?? []).map((p) => p.trim());
    if (params.length !== tpl.variaveis || params.some((p) => p.length === 0)) {
      throw new Error("Preencha todas as variáveis do modelo antes de enviar.");
    }

    // Limite por conversa: 8 mensagens do mesmo atendente em 10 minutos.
    const desde10min = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count: recentes } = await supabase
      .from("whatsapp_mensagens")
      .select("id", { count: "exact", head: true })
      .eq("conversa_id", data.conversaId)
      .eq("usuario_id", userId)
      .eq("autor", "vendedor")
      .gte("created_at", desde10min);
    if ((recentes ?? 0) >= 8) {
      throw new Error(
        "Você já enviou 8 mensagens para esta conversa nos últimos 10 minutos. Aguarde antes de enviar outra.",
      );
    }

    const { aplicarVariaveis } = await import("./whatsapp-template");
    const textoFinal = aplicarVariaveis(tpl.bodyText, params);

    // Motor único de saída: opt-out, disjuntor, rate limits e retry continuam valendo.
    const { sendWhatsappText } = await import("./whatsapp-send.server");
    await sendWhatsappText(conversa.phone, textoFinal, "enviarTemplateConversa", "comercial", {
      origem: "iniciado_sistema",
      templateOverride: { name: tpl.name, lang: tpl.language, params },
    });

    const { error: mErr } = await supabase.from("whatsapp_mensagens").insert({
      conversa_id: data.conversaId,
      direcao: "saida",
      autor: "vendedor",
      conteudo: textoFinal,
      usuario_id: userId,
    });
    if (mErr) throw new Error(mErr.message);

    await aplicarPosseConversa(
      data.conversaId,
      userId,
      conversa.atribuido_para ?? null,
      data.assumirPosse === true,
    );


    // Auditoria
    if (conversa.lead_id) {
      await supabase.from("lead_interactions").insert({
        lead_id: conversa.lead_id,
        owner_id: userId,
        type: "whatsapp",
        content: `Template enviado: ${tpl.name} — ${textoFinal}`,
      });
    }

    return { ok: true, texto: textoFinal };
  });
