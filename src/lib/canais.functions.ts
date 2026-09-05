import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { podeEscreverConversa } from "@/lib/permissoes";
import { assertNoError, registrarFalhaSegura } from "@/lib/guard-erros";

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

  // ABORTAR: o roteamento da conversa é pré-requisito do envio manual;
  // seguir com a IA ainda ativa causaria resposta automática por cima.
  const rot = await supabaseAdmin
    .from("whatsapp_conversas")
    .update({ status: "humano_atendendo", ia_ativa: false })
    .eq("id", conversaId);
  await assertNoError(
    rot,
    "canais.aplicarPosseConversa/rotear",
    { conversa_id: conversaId },
    "Não foi possível assumir a conversa. Tente novamente.",
  );

  if (donoAtual === userId) return { posse: "mantida" as const };

  if (!donoAtual) {
    // ABORTAR: sem posse gravada, o atendimento seguiria sem dono definido.
    const assumir = await supabaseAdmin
      .from("whatsapp_conversas")
      .update({ atribuido_para: userId, atribuido_em: new Date().toISOString() })
      .eq("id", conversaId)
      .is("atribuido_para", null);
    await assertNoError(
      assumir,
      "canais.aplicarPosseConversa/assumir",
      { conversa_id: conversaId },
      "Não foi possível assumir a conversa. Tente novamente.",
    );
    return { posse: "assumida" as const };
  }

  if (!assumirPosse) return { posse: "inalterada" as const };

  // ABORTAR: transferência de posse é o efeito principal desta chamada.
  const transferir = await supabaseAdmin
    .from("whatsapp_conversas")
    .update({ atribuido_para: userId, atribuido_em: new Date().toISOString() })
    .eq("id", conversaId);
  await assertNoError(
    transferir,
    "canais.aplicarPosseConversa/transferir",
    { conversa_id: conversaId, dono_anterior: donoAtual },
    "Não foi possível transferir a posse da conversa. Tente novamente.",
  );

  // REGISTRAR E SEGUIR: auditoria é efeito secundário; a posse já mudou.
  const audit = await supabaseAdmin.from("user_audit_log").insert({
    alvo_user_id: donoAtual,
    ator_user_id: userId,
    campo: "conversa_atribuido_para",
    valor_anterior: donoAtual,
    valor_novo: userId,
  });
  if (audit?.error) {
    await registrarFalhaSegura("canais.aplicarPosseConversa/auditoria", audit.error, {
      conversa_id: conversaId,
    });
  }

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
      .select("id, phone, atribuido_para, status")
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
      // BAIXA / só registrar: fail-closed já é o comportamento (isAdmin=false).
      const { data: adminFlag, error: adminErr } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (adminErr) {
        await registrarFalhaSegura("canais.has_role", adminErr, { user_id: userId });
      }
      isAdmin = adminFlag === true;
    } catch {
      isAdmin = false;
    }

    // (A0) Escrita manual só quando a conversa está aguardando humano ou em
    // atendimento humano. Admin não é limitado por este guard.
    if (!isAdmin && !podeEscreverConversa(conversa.status)) {
      bloquear(
        "status_nao_permite_escrita",
        "Esta conversa não está em atendimento humano. Assuma o atendimento para poder responder.",
      );
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
 * Envia ANEXO (mídia por link público) na conversa e registra em
 * whatsapp_mensagens (autor='vendedor'). Espelha as mesmas guardas de
 * `sendConversaMessage`, como função separada.
 */
export const sendConversaAnexo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        conversaId: z.string().uuid(),
        fileUrl: z.string().url(),
        mimeType: z.string().min(1).max(200),
        fileName: z.string().min(1).max(255),
        caption: z.string().max(1024).optional(),
        tipoEnvio: z.enum(["image", "document", "audio", "video"]),
        assumirPosse: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: conversa, error: cErr } = await supabase
      .from("whatsapp_conversas")
      .select("id, phone, atribuido_para, status")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (cErr || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");

    const { mascararTelefoneLog } = await import("./whatsapp-send.server");
    const phoneLog = mascararTelefoneLog(conversa.phone);
    const bloquear = (motivo: string, msg: string) => {
      console.warn(`[chat-anexo] BLOQUEADO motivo=${motivo} phone=${phoneLog}`);
      throw new Error(msg);
    };

    let isAdmin = false;
    try {
      // BAIXA / só registrar: fail-closed já é o comportamento (isAdmin=false).
      const { data: adminFlag, error: adminErr } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (adminErr) {
        await registrarFalhaSegura("canais.has_role", adminErr, { user_id: userId });
      }
      isAdmin = adminFlag === true;
    } catch {
      isAdmin = false;
    }

    if (!isAdmin && !podeEscreverConversa(conversa.status)) {
      bloquear(
        "status_nao_permite_escrita",
        "Esta conversa não está em atendimento humano. Assuma o atendimento para poder responder.",
      );
    }

    const { count: inboundCount, error: inErr } = await supabase
      .from("whatsapp_mensagens")
      .select("id", { count: "exact", head: true })
      .eq("conversa_id", data.conversaId)
      .eq("direcao", "entrada");
    const temInbound = !inErr && (inboundCount ?? 0) > 0;

    if (!temInbound) {
      const { hora, domingo } = agoraSaoPaulo();
      if (domingo || hora < 7 || hora >= 20) {
        bloquear(
          domingo ? "sem_inbound_domingo" : "sem_inbound_fora_da_janela",
          "Esta conversa ainda não tem mensagem do cliente. Envios só são permitidos de segunda a sábado, das 07:00 às 20:00.",
        );
      }
    }

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

    const { sendWhatsappMedia } = await import("./whatsapp-send.server");
    await sendWhatsappMedia(conversa.phone, data.tipoEnvio, data.fileUrl, {
      ...(data.caption ? { caption: data.caption } : {}),
      filename: data.fileName,
      ctx: "sendConversaAnexo",
      canal: "comercial",
      origem,
    });

    const tipoMensagem =
      data.tipoEnvio === "image" ? "imagem" : data.tipoEnvio === "audio" ? "audio" : "documento";

    const { error: mErr } = await supabase.from("whatsapp_mensagens").insert({
      conversa_id: data.conversaId,
      direcao: "saida",
      autor: "vendedor",
      conteudo: data.caption?.trim() || data.fileName,
      tipo: tipoMensagem,
      midia: {
        url: data.fileUrl,
        mimeType: data.mimeType,
        caption: data.caption ?? null,
        fileName: data.fileName,
      },
      usuario_id: userId,
    });
    if (mErr) throw new Error(mErr.message);

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

    // ABORTAR: sem o vínculo, o lead recém-criado fica órfão da conversa.
    const vinculo = await supabase
      .from("whatsapp_conversas")
      .update({ lead_id: lead.id, status: "humano_atendendo", ia_ativa: false })
      .eq("id", data.conversaId);
    await assertNoError(
      vinculo,
      "canais.criarLeadDaConversa/vincular",
      { conversa_id: data.conversaId, lead_id: lead.id },
      "Lead criado, mas não foi possível vinculá-lo à conversa. Tente novamente.",
    );

    // Registra interação (dispara trigger de last_interaction)
    if (conversa.last_message_preview) {
      // REGISTRAR E SEGUIR: histórico de interação é efeito secundário.
      const inter = await supabase.from("lead_interactions").insert({
        lead_id: lead.id,
        owner_id: userId,
        type: "whatsapp",
        content: conversa.last_message_preview,
      });
      if (inter?.error) {
        await registrarFalhaSegura("canais.criarLeadDaConversa/interacao", inter.error, {
          lead_id: lead.id,
        });
      }
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
    // O trigger `tg_conversa_atribuida_notifica` roda BEFORE INSERT e quebra por FK
    // quando `atribuido_para` já vem preenchido no INSERT: inserimos sem o campo e
    // atribuímos logo em seguida via UPDATE (mesmo padrão de enviarPropostaWhatsapp).
    const { data: criada, error: iErr } = await supabaseAdmin
      .from("whatsapp_conversas")
      .insert({
        phone,
        name: nome,
        status: "humano_atendendo",
        ia_ativa: false,
        lead_id: lead?.id ?? null,
      })
      .select("id")
      .single();
    if (iErr || !criada) throw new Error(iErr?.message ?? "Falha ao iniciar conversa.");

    const { error: uErr } = await supabaseAdmin
      .from("whatsapp_conversas")
      .update({ atribuido_para: userId })
      .eq("id", criada.id);
    if (uErr) throw new Error(uErr.message);

    return { conversaId: criada.id };

  });

/* ------------------------------------------------------------------ *
 * Templates aprovados da Meta (envio fora da janela de 24h)
 * ------------------------------------------------------------------ */

/**
 * Lista os templates APROVADOS da WABA (cache curto no servidor), já cruzados
 * com o catálogo de frases prontas: quando o template nasceu de uma frase do
 * CRM, devolvemos o título legível e o mapa de variáveis para o chat
 * pré-preencher os campos sozinho.
 */
export const listarTemplatesAprovados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ forcar: z.boolean().optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { cloudListarTemplatesAprovados } = await import("./whatsapp-cloud.server");
    const base = await cloudListarTemplatesAprovados(data.forcar === true);

    const { data: frases } = await context.supabase
      .from("mensagem_templates")
      .select("titulo, meta_nome, meta_mapa")
      .not("meta_nome", "is", null);

    const porNome = new Map(
      (frases ?? []).map((f: { meta_nome: string; titulo: string; meta_mapa: unknown }) => [
        f.meta_nome,
        f,
      ]),
    );

    const itens = base.itens.map((t) => {
      const f = porNome.get(t.name) as
        | { titulo: string; meta_mapa: string[] | null }
        | undefined;
      return {
        ...t,
        tituloCrm: f?.titulo ?? null,
        metaMapa: (f?.meta_mapa ?? null) as string[] | null,
      };
    });

    return { ...base, itens };
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
      // REGISTRAR E SEGUIR: o template já foi enviado ao cliente.
      const interTpl = await supabase.from("lead_interactions").insert({
        lead_id: conversa.lead_id,
        owner_id: userId,
        type: "whatsapp",
        content: `Template enviado: ${tpl.name} — ${textoFinal}`,
      });
      if (interTpl?.error) {
        await registrarFalhaSegura("canais.enviarTemplate/interacao", interTpl.error, {
          lead_id: conversa.lead_id,
        });
      }
    }

    return { ok: true, texto: textoFinal };
  });

/** Tipos de evento da Meta que geram mensagem no chat. */
const TIPOS_EVENTO_MENSAGEM = [
  "mensagem_image",
  "mensagem_document",
  "mensagem_audio",
  "mensagem_video",
  "mensagem_sticker",
  "mensagem_button",
  "mensagem_interactive",
  "mensagem_reaction",
  "mensagem_location",
  "mensagem_contacts",
  "mensagem_unsupported",
] as const;

async function exigirAdminCanais(supabase: { rpc: Function }, userId: string) {
  // Fail-closed: qualquer erro ou valor não-verdadeiro bloqueia.
  let isAdmin = false;
  try {
    const { data, error } = await (supabase as any).rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (error) await registrarFalhaSegura("canais.has_role", error, { user_id: userId });
    isAdmin = data === true;
  } catch {
    isAdmin = false;
  }
  if (!isAdmin) throw new Error("Acesso restrito a administradores.");
}

/** Quantos anexos recebidos ainda não viraram mensagem no chat (admin). */
export const contarMidiasPendentesCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await exigirAdminCanais(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("wa_cloud_eventos")
      .select("tipo, recebido_em")
      .eq("processado", false)
      .in("tipo", TIPOS_EVENTO_MENSAGEM as unknown as string[])
      .order("recebido_em", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    const linhas = data ?? [];
    const porTipo: Record<string, number> = {};
    for (const l of linhas) porTipo[l.tipo] = (porTipo[l.tipo] ?? 0) + 1;
    return {
      total: linhas.length,
      porTipo,
      maisAntigo: linhas[0]?.recebido_em ?? null,
    };
  });

/**
 * Recupera o backlog de mensagens recebidas que ficaram só no log de eventos.
 * Silencioso e com a data original: nada de IA, notificação ou alerta.
 */
export const reprocessarMidiasCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ limite: z.number().int().min(1).max(200).optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await exigirAdminCanais(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: eventos, error } = await supabaseAdmin
      .from("wa_cloud_eventos")
      .select("id, tipo, phone, wa_message_id, payload, recebido_em")
      .eq("processado", false)
      .in("tipo", TIPOS_EVENTO_MENSAGEM as unknown as string[])
      .order("recebido_em", { ascending: true })
      .limit(data.limite ?? 50);
    if (error) throw new Error(error.message);

    const { processarMensagemCloud } = await import("@/lib/whatsapp-cloud-entrada.server");
    let processados = 0;
    const falhas: Array<{ id: string; tipo: string; erro: string }> = [];

    for (const ev of eventos ?? []) {
      const msg = (ev.payload ?? {}) as Record<string, unknown>;
      const phone = onlyDigits(String(ev.phone ?? msg["from"] ?? ""));
      const ts = Number(msg["timestamp"] ?? 0);
      const criadoEm =
        Number.isFinite(ts) && ts > 0
          ? new Date(ts * 1000).toISOString()
          : (ev.recebido_em ?? new Date().toISOString());
      try {
        const r = await processarMensagemCloud({
          msg,
          phone,
          nomeContato: null,
          waMessageId: ev.wa_message_id,
          tag: "wa-cloud-reprocesso",
          silencioso: true,
          criadoEm,
          atualizarExistente: true,
        });
        const marcado = await supabaseAdmin
          .from("wa_cloud_eventos")
          .update({
            processado: r.gravado,
            erro: r.midiaOk ? null : (r.erro ?? "download_falhou").slice(0, 500),
          })
          .eq("id", ev.id);
        if (marcado.error) {
          await registrarFalhaSegura("canais.reprocessarMidias.marcar", marcado.error, {
            evento_id: ev.id,
          });
        }
        if (r.gravado) processados += 1;
        else falhas.push({ id: ev.id, tipo: ev.tipo, erro: r.erro ?? "não gravado" });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        falhas.push({ id: ev.id, tipo: ev.tipo, erro: m });
        await registrarFalhaSegura("canais.reprocessarMidias", e, { evento_id: ev.id });
        await supabaseAdmin
          .from("wa_cloud_eventos")
          .update({ erro: m.slice(0, 500) })
          .eq("id", ev.id);
      }
    }

    return { processados, falhas };
  });
