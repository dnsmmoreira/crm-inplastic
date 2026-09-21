-- Helper: visibilidade SOMENTE LEITURA de conversa para auditor de equipe.
CREATE OR REPLACE FUNCTION public.whatsapp_conversa_visivel_auditor(_atribuido uuid, _lead_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN NOT public.tem_permissao(auth.uid(), 'whatsapp.ver_equipe') THEN false
    WHEN public.supervisor_ve_tudo(auth.uid()) THEN true
    WHEN coalesce(_atribuido, _lead_owner) IS NULL THEN
      public.equipe_do_usuario(auth.uid()) IS NOT NULL
      AND public.equipe_do_usuario(auth.uid()) = public.equipe_dona_canal_whatsapp()
    ELSE public.mesma_equipe(auth.uid(), coalesce(_atribuido, _lead_owner))
  END
$function$;

-- tarefas: leitura das tarefas de colegas da equipe
CREATE POLICY "tarefas select ver_equipe"
  ON public.tarefas FOR SELECT TO authenticated
  USING (
    public.tem_permissao(auth.uid(), 'tarefas.ver_equipe')
    AND (public.supervisor_ve_tudo(auth.uid()) OR public.mesma_equipe(auth.uid(), owner_id))
  );

-- lead_interactions: leitura do histórico de leads da equipe
CREATE POLICY "interactions select ver_equipe"
  ON public.lead_interactions FOR SELECT TO authenticated
  USING (
    public.tem_permissao(auth.uid(), 'interacoes.ver_equipe')
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_interactions.lead_id
        AND (public.supervisor_ve_tudo(auth.uid()) OR public.mesma_equipe(auth.uid(), l.owner_id))
    )
  );

-- whatsapp: leitura (sem qualquer permissão de escrita)
CREATE POLICY "conversas select auditor equipe"
  ON public.whatsapp_conversas FOR SELECT TO authenticated
  USING (
    public.whatsapp_conversa_visivel_auditor(
      atribuido_para,
      (SELECT l.owner_id FROM public.leads l WHERE l.id = whatsapp_conversas.lead_id)
    )
  );

CREATE POLICY "mensagens select auditor equipe"
  ON public.whatsapp_mensagens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversas c
      WHERE c.id = whatsapp_mensagens.conversa_id
        AND public.whatsapp_conversa_visivel_auditor(
              c.atribuido_para,
              (SELECT l.owner_id FROM public.leads l WHERE l.id = c.lead_id)
            )
    )
  );

-- xerife_log: leitura das ações do Xerife sobre a equipe
CREATE POLICY "xerife_log select ver_equipe"
  ON public.xerife_log FOR SELECT TO authenticated
  USING (
    public.tem_permissao(auth.uid(), 'xerife.ver_equipe')
    AND (public.supervisor_ve_tudo(auth.uid()) OR public.mesma_equipe(auth.uid(), vendedor_id))
  );