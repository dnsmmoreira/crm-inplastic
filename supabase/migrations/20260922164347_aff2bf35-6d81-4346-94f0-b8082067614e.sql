-- PARTE 1: anexos do chat só podem ser alterados/apagados por quem enviou.
DROP POLICY IF EXISTS "chat anexos update membro" ON storage.objects;
CREATE POLICY "chat anexos update membro"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'chat-anexos' AND owner_id = auth.uid()::text)
  WITH CHECK (bucket_id = 'chat-anexos' AND owner_id = auth.uid()::text);

DROP POLICY IF EXISTS "chat anexos delete membro" ON storage.objects;
CREATE POLICY "chat anexos delete membro"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'chat-anexos' AND owner_id = auth.uid()::text);

-- PARTE 2 (itens 1-3): acesso operacional sem os pesos do placar.
CREATE OR REPLACE FUNCTION public.xerife_config_operacional()
RETURNS TABLE (
  id integer,
  ativo boolean,
  dias_sem_interacao_por_etapa jsonb,
  max_dias_etapa jsonb,
  proposta_enviada_dias integer,
  tarefa_atrasada_horas integer,
  ia_sem_resposta_horas integer,
  resumo_diario_ativo boolean,
  resumo_hora time without time zone,
  horario_comercial_inicio time without time zone,
  horario_comercial_fim time without time zone,
  dias_uteis_inicio time without time zone,
  dias_uteis_fim time without time zone,
  sla_primeiro_contato_min integer,
  sla_primeiro_contato_escalar_min integer,
  sla_resposta_whatsapp_horas integer,
  sla_resposta_whatsapp_escalar_horas integer,
  cadencia_proposta_dias integer[],
  cadencia_abandono_dias integer[],
  carteira_alerta_dias integer,
  carteira_critico_dias integer,
  reciclagem_perdidos_dias integer,
  pos_venda_dias integer[],
  pos_venda_dias_uteis integer,
  meta_atividades_dia integer,
  auto_atribuir_lead_orfao boolean,
  sla_lead_orfao_min integer,
  whatsapp_interno_ativo boolean,
  telegram_ativo boolean,
  watchdog_conversa_ativo boolean,
  watchdog_conversa_ia_min integer,
  watchdog_conversa_fria_min integer,
  reatribuir_lead_abandonado boolean,
  meta_template_automatico text,
  meta_template_automatico_lang text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.ativo, c.dias_sem_interacao_por_etapa, c.max_dias_etapa,
         c.proposta_enviada_dias, c.tarefa_atrasada_horas, c.ia_sem_resposta_horas,
         c.resumo_diario_ativo, c.resumo_hora,
         c.horario_comercial_inicio, c.horario_comercial_fim,
         c.dias_uteis_inicio, c.dias_uteis_fim,
         c.sla_primeiro_contato_min, c.sla_primeiro_contato_escalar_min,
         c.sla_resposta_whatsapp_horas, c.sla_resposta_whatsapp_escalar_horas,
         c.cadencia_proposta_dias, c.cadencia_abandono_dias,
         c.carteira_alerta_dias, c.carteira_critico_dias, c.reciclagem_perdidos_dias,
         c.pos_venda_dias, c.pos_venda_dias_uteis, c.meta_atividades_dia,
         c.auto_atribuir_lead_orfao, c.sla_lead_orfao_min,
         c.whatsapp_interno_ativo, c.telegram_ativo,
         c.watchdog_conversa_ativo, c.watchdog_conversa_ia_min, c.watchdog_conversa_fria_min,
         c.reatribuir_lead_abandonado,
         c.meta_template_automatico, c.meta_template_automatico_lang,
         c.updated_at
  FROM public.xerife_config c
  WHERE c.id = 1
$$;

REVOKE ALL ON FUNCTION public.xerife_config_operacional() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.xerife_config_operacional() TO authenticated, service_role;