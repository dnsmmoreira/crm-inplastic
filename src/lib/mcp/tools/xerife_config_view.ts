import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "xerife_config_view",
  title: "Configuração do Xerife",
  description:
    "Retorna os parâmetros atuais de configuração do motor Xerife: SLAs, cadência, carteira, pós-venda, horário comercial, agenda e pesos do placar. Somente leitura.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error } = await supabase.from("xerife_config").select("*").eq("id", 1).maybeSingle();
    if (error) return { content: [{ type: "text", text: `Erro: ${error.message}` }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Configuração não encontrada." }], isError: true };

    const linhas = [
      `Motor ativo: ${data.ativo ? "sim" : "não"}`,
      `Horário comercial: ${data.horario_comercial_inicio}–${data.horario_comercial_fim} · Dias úteis: ${data.dias_uteis_inicio}–${data.dias_uteis_fim}`,
      `SLA 1º contato: ${data.sla_primeiro_contato_min}min (escala em ${data.sla_primeiro_contato_escalar_min}min)`,
      `SLA resposta WhatsApp: ${data.sla_resposta_whatsapp_horas}h (escala em ${data.sla_resposta_whatsapp_escalar_horas}h)`,
      `Tarefa atrasada: ${data.tarefa_atrasada_horas}h · IA sem resposta: ${data.ia_sem_resposta_horas}h`,
      `Cadência proposta (dias): [${(data.cadencia_proposta_dias ?? []).join(", ")}] · Proposta enviada: ${data.proposta_enviada_dias}d`,
      `Carteira alerta/crítico: ${data.carteira_alerta_dias}d / ${data.carteira_critico_dias}d · Reciclagem perdidos: ${data.reciclagem_perdidos_dias}d`,
      `Pós-venda (dias): [${(data.pos_venda_dias ?? []).join(", ")}]`,
      `Meta atividades/dia: ${data.meta_atividades_dia} · Resumo diário: ${data.resumo_diario_ativo ? `sim @ ${data.resumo_hora}` : "não"}`,
      `Placar pesos → ganho:${data.placar_peso_ganho} proposta:${data.placar_peso_proposta} tarefa:${data.placar_peso_tarefa} pos_venda:${data.placar_peso_pos_venda} sla_estourado:${data.placar_peso_sla_estourado} carteira_60:${data.placar_peso_carteira_60} meta_batida:${data.placar_peso_meta_batida}`,
      `Placar dias sem proposta (limite): ${data.placar_dias_sem_proposta_limite}d`,
      `Dias sem interação por etapa: ${JSON.stringify(data.dias_sem_interacao_por_etapa)}`,
      `Máx. dias por etapa: ${JSON.stringify(data.max_dias_etapa)}`,
      `Atualizado em: ${data.updated_at}`,
    ];
    return {
      content: [{ type: "text", text: linhas.join("\n") }],
      structuredContent: { config: data },
    };
  },
});
