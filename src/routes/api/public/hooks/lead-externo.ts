import { createFileRoute } from "@tanstack/react-router";
import { registrarFalhaSegura } from "@/lib/guard-erros";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-n8n-secret",
} as const;

type LeadExternoBody = {
  telefone?: string;
  nome?: string;
  empresa?: string;
  produto?: string;
  quantidade?: number | string;
  segmento?: string;
  cidade_uf?: string;
  resumo?: string;
  motivo?: string;
  protocolo_opa?: string;
};

/** Mesma lógica de DDI 55 usada em whatsapp-send.server.ts. */
function normalizePhoneBR(phone: string) {
  let p = (phone ?? "").replace(/\D/g, "");
  if (!p.startsWith("55") && p.length <= 11) p = `55${p}`;
  return p;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/**
 * Recebe leads QUALIFICADOS vindos do número WhatsApp da Inplastic que roda
 * fora deste CRM (OPA). Cria/vincula conversa + lead, distribui pro próximo
 * vendedor e dispara re-engajamento para abrir a janela de 24h neste número.
 * Header obrigatório: x-n8n-secret.
 */
/** Nome plausível: tem ao menos 2 caracteres e contém alguma letra. */
function nomePlausivel(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (t.length < 2 || !/[a-zA-ZÀ-ÿ]/.test(t)) return null;
  return t;
}

export const Route = createFileRoute("/api/public/hooks/lead-externo")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { n8nSecretValido } = await import("@/lib/n8n-auth.server");
        if (!(await n8nSecretValido(request))) {
          return json({ error: "unauthorized" }, 401);
        }

        let body: LeadExternoBody;
        try {
          body = (await request.json()) as LeadExternoBody;
        } catch {
          return json({ error: "invalid json" }, 400);
        }

        const telefone = normalizePhoneBR(body.telefone ?? "");
        if (!telefone) return json({ error: "telefone é obrigatório" }, 400);

        const nome = body.nome?.trim() || null;
        const resumo = body.resumo?.trim() || null;
        const preview = resumo ?? body.motivo?.trim() ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1) Conversa: cria ou garante ia_ativa=false / name preenchido
        const { candidatosTelefoneBR } = await import("@/lib/telefone-br");
        const { data: encontradas } = await supabaseAdmin
          .from("whatsapp_conversas")
          .select("id, name, lead_id")
          .in("phone", candidatosTelefoneBR(telefone))
          .order("updated_at", { ascending: false })
          .limit(1);
        const existente = encontradas?.[0] ?? null;

        let conversaId: string;
        if (!existente) {
          const { data: nova, error: cErr } = await supabaseAdmin
            .from("whatsapp_conversas")
            .insert({
              phone: telefone,
              name: nome,
              status: "qualificado",
              ia_ativa: false,
              last_message_preview: preview,
            })
            .select("id")
            .single();
          if (cErr || !nova) {
            return json({ error: cErr?.message ?? "falha ao criar conversa" }, 500);
          }
          conversaId = nova.id;
        } else {
          conversaId = existente.id;
          // REGISTRAR E SEGUIR: a conversa já existe; o UPDATE abaixo (passo 3)
          // reaplica ia_ativa=false. Registra com o protocolo do OPA.
          const upExistente = await supabaseAdmin
            .from("whatsapp_conversas")
            .update({
              ia_ativa: false,
              ...(existente.name?.trim() ? {} : { name: nome }),
              updated_at: new Date().toISOString(),
            })
            .eq("id", conversaId);
          if (upExistente.error) {
            await registrarFalhaSegura("lead-externo.atualizarConversa", upExistente.error, {
              conversa_id: conversaId,
              protocolo_opa: body.protocolo_opa ?? null,
            });
          }
        }

        // 2) Lead
        let leadId = (existente?.lead_id as string | null) ?? null;
        if (!leadId) {
          const quantidade =
            typeof body.quantidade === "string"
              ? Number(body.quantidade.replace(/[^\d]/g, "")) || undefined
              : typeof body.quantidade === "number"
                ? body.quantidade
                : undefined;

          const notesLines: string[] = [];
          if (resumo) notesLines.push(resumo);
          if (body.cidade_uf) notesLines.push(`Cidade/UF: ${body.cidade_uf}`);
          if (body.protocolo_opa) notesLines.push(`Protocolo OPA: ${body.protocolo_opa}`);

          const { data: lead, error: lErr } = await supabaseAdmin
            .from("leads")
            .insert({
              owner_id: null,
              company: body.empresa?.trim() || nomePlausivel(nome) || "A identificar",
              contact_name: nomePlausivel(nome) || "A identificar",
              phone: telefone,
              telefone_whatsapp: telefone,
              product: body.produto ?? null,
              quantity: quantidade,
              segment: body.segmento ?? null,
              stage: "novo",
              origem: "whatsapp-opa",
              source: "OPA/Inplastic",
              tags: ["WhatsApp", "OPA", "IA"],
              notes: notesLines.join("\n"),
            })
            .select("id")
            .single();
          if (lErr || !lead) {
            return json({ error: lErr?.message ?? "falha ao criar lead" }, 500);
          }
          leadId = lead.id;
        }

        // ABORTAR: sem o vínculo lead↔conversa a IA continuaria respondendo e o
        // atendimento humano não acha o lead. Nada foi enviado ao cliente ainda
        // e o remetente (OPA/n8n) reentrega em 5xx; lead/conversa são reusados.
        const vincErr = await supabaseAdmin
          .from("whatsapp_conversas")
          .update({
            lead_id: leadId,
            status: "qualificado",
            motivo_handoff: "qualificado",
            ia_ativa: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversaId);
        if (vincErr.error) {
          await registrarFalhaSegura("lead-externo.vincularConversa", vincErr.error, {
            conversa_id: conversaId,
            lead_id: leadId,
            protocolo_opa: body.protocolo_opa ?? null,
          });
          return json({ error: "falha ao vincular conversa ao lead" }, 500);
        }

        // 3) Resumo da IA como nota no lead + trilha no chat
        if (resumo || body.motivo) {
          if (resumo) {
            const { error: rErr } = await supabaseAdmin.from("lead_interactions").insert({
              lead_id: leadId,
              owner_id: null,
              type: "note",
              content: `Resumo da IA (Gabriel) — origem WhatsApp Inplastic/OPA:\n${resumo}`,
            });
            if (rErr) {
              // REGISTRAR E SEGUIR: nota do lead é complementar.
              console.error("[lead-externo] falha ao gravar resumo:", rErr.message);
              await registrarFalhaSegura("lead-externo.resumoLead", rErr, {
                lead_id: leadId,
                protocolo_opa: body.protocolo_opa ?? null,
              });
            }
          }

          const { error: mErr } = await supabaseAdmin.from("whatsapp_mensagens").insert({
            conversa_id: conversaId,
            direcao: "saida",
            autor: "ia",
            tipo: "resumo_opa",
            conteudo: [
              "Atendimento qualificado via WhatsApp Inplastic (OPA) — fora deste CRM.",
              body.protocolo_opa ? `Protocolo: ${body.protocolo_opa}` : null,
              body.empresa ? `Empresa: ${body.empresa}` : null,
              body.produto ? `Produto: ${body.produto}` : null,
              body.quantidade ? `Quantidade: ${body.quantidade}` : null,
              body.cidade_uf ? `Cidade/UF: ${body.cidade_uf}` : null,
              "",
              resumo || body.motivo || "Sem resumo detalhado.",
            ]
              .filter((l) => l !== null)
              .join("\n"),
          });
          if (mErr) {
            // REGISTRAR E SEGUIR: trilha no chat é complementar.
            console.error("[lead-externo] falha ao gravar resumo no chat:", mErr.message);
            await registrarFalhaSegura("lead-externo.resumoChat", mErr, {
              conversa_id: conversaId,
              protocolo_opa: body.protocolo_opa ?? null,
            });
          }
        }

        // 4) Round-robin + notificação ao vendedor
        const { garantirResponsavelConversa } = await import("@/lib/xerife/handoff.server");
        const atribuicao = await garantirResponsavelConversa(supabaseAdmin, {
          conversaId,
          leadId,
          contexto: `Lead do WhatsApp Inplastic (OPA)${resumo ? ` — ${resumo}` : ""}`,
        });
        const vendedorId = atribuicao.vendedorId;

        // 5) Re-engajamento — abre a janela de 24h neste número.
        let reengajamentoEnviado = false;
        let erroReengajamento: string | null = null;
        try {
          const { sendWhatsappText } = await import("@/lib/whatsapp-send.server");
          const res = await sendWhatsappText(
            telefone,
            "Olá! Aqui é a Inplastic. Recebemos seu contato e um consultor já vai continuar seu atendimento por aqui. 🙂",
            "lead-externo",
            "comercial",
            { origem: "iniciado_sistema" },
          );
          reengajamentoEnviado = !!res?.ok;
          if (!res?.ok) erroReengajamento = res?.body ?? "falha no envio";
        } catch (e) {
          erroReengajamento = e instanceof Error ? e.message : String(e);
          console.error("[lead-externo] re-engajamento falhou:", erroReengajamento);
        }

        // 6) Registro da ação
        // REGISTRAR E SEGUIR: mensagem de re-engajamento já pode ter saído para
        // o cliente; abortar aqui não desfaz nada e faria o OPA reenviar tudo.
        const insAcao = await supabaseAdmin.from("lead_ai_actions").insert({
          lead_id: leadId,
          owner_id: vendedorId,
          type: "qualify",
          content: "Lead externo (WhatsApp Inplastic/OPA) qualificado e distribuído.",
          metadata: {
            canal: "whatsapp-opa",
            protocolo_opa: body.protocolo_opa ?? null,
            conversa_id: conversaId,
            dados: {
              empresa: body.empresa ?? null,
              contato: nome,
              segmento: body.segmento ?? null,
              produto: body.produto ?? null,
              quantidade: body.quantidade ?? null,
              cidade_uf: body.cidade_uf ?? null,
            },
            distribuido: !!vendedorId,
            vendedor_id: vendedorId,
            erro_distribuicao: atribuicao.erro,
            reengajamento_enviado: reengajamentoEnviado,
            erro_reengajamento: erroReengajamento,
          },
        });
        if (insAcao.error) {
          await registrarFalhaSegura("lead-externo.registroAcao", insAcao.error, {
            lead_id: leadId,
            conversa_id: conversaId,
            protocolo_opa: body.protocolo_opa ?? null,
          });
        }

        return json({
          ok: true,
          lead_id: leadId,
          vendedor_id: vendedorId,
          distribuido: !!vendedorId,
          reengajamento_enviado: reengajamentoEnviado,
        });
      },
    },
  },
});
