import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Assistente de redação do chat do vendedor.
 * NUNCA envia nada para o WhatsApp — apenas devolve um texto sugerido,
 * que o vendedor precisa revisar e enviar pelo fluxo normal (com todas as guardas).
 */
export const assistenteRedacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        conversaId: z.string().uuid(),
        rascunho: z.string().max(2000).default(""),
        modo: z.enum(["corrigir", "sugerir"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const {
      LIMITE_CHAMADAS_HORA,
      promptDoModo,
      historicoParaTexto,
      gerarTexto,
    } = await import("./assistente-redacao.server");

    // Limite de 30 chamadas por usuário por hora.
    const desde = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count } = await supabase
      .from("assistente_redacao_uso")
      .select("id", { count: "exact", head: true })
      .eq("usuario_id", userId)
      .gte("created_at", desde);
    if ((count ?? 0) >= LIMITE_CHAMADAS_HORA) {
      throw new Error(
        `Você atingiu o limite de ${LIMITE_CHAMADAS_HORA} usos do assistente por hora. Tente novamente mais tarde.`,
      );
    }

    const { data: conversa, error: cErr } = await supabase
      .from("whatsapp_conversas")
      .select("id, name")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (cErr || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");

    const rascunho = data.rascunho.trim();

    let userPrompt: string;
    if (data.modo === "corrigir") {
      if (rascunho.length < 2) {
        throw new Error("Escreva um rascunho antes de pedir a correção.");
      }
      userPrompt = `Rascunho do vendedor:\n"""\n${rascunho}\n"""`;
    } else {
      const { data: msgs } = await supabase
        .from("whatsapp_mensagens")
        .select("direcao, autor, conteudo, created_at")
        .eq("conversa_id", data.conversaId)
        .order("created_at", { ascending: false })
        .limit(20);
      const historico = historicoParaTexto([...(msgs ?? [])].reverse());
      if (!historico) throw new Error("Ainda não há mensagens suficientes para sugerir uma resposta.");
      userPrompt = [
        `Contato: ${conversa.name?.trim() || "não identificado"}`,
        "Últimas mensagens da conversa (mais antiga primeiro):",
        historico,
        rascunho ? `\nRascunho parcial do vendedor (use como base):\n${rascunho}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    const texto = await gerarTexto(promptDoModo(data.modo), userPrompt);

    await supabase.from("assistente_redacao_uso").insert({
      usuario_id: userId,
      conversa_id: data.conversaId,
      modo: data.modo,
    });

    return { texto };
  });
