-- 1) Movimentação de etapa pelo SISTEMA (devolução de pedido, reabertura de
--    proposta recusada). A trava trg_leads_stage_lock continua intacta: esta
--    função é SECURITY DEFINER e liga app.etapa_manual apenas na transação.
--    Execução restrita ao service_role (somente código de servidor).
CREATE OR REPLACE FUNCTION public.sistema_mover_etapa_lead(
  _lead_id uuid,
  _stage text,
  _origem text DEFAULT 'sistema',
  _de text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _atual text;
BEGIN
  IF _stage IS NULL OR _stage NOT IN ('atendimento','novo','qualificacao','proposta','negociacao','ganho','perdido') THEN
    RAISE EXCEPTION 'etapa inválida: %', _stage;
  END IF;

  SELECT stage::text INTO _atual FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_nao_encontrado');
  END IF;

  IF _de IS NOT NULL AND _atual IS DISTINCT FROM _de THEN
    RETURN jsonb_build_object('ok', true, 'alterado', false, 'stage', _atual);
  END IF;

  IF _atual = _stage THEN
    RETURN jsonb_build_object('ok', true, 'alterado', false, 'stage', _atual);
  END IF;

  PERFORM set_config('app.origem', COALESCE(NULLIF(btrim(_origem), ''), 'sistema'), true);
  PERFORM set_config('app.etapa_manual', 'on', true);

  UPDATE public.leads SET stage = _stage::lead_stage WHERE id = _lead_id;

  RETURN jsonb_build_object('ok', true, 'alterado', true, 'stage_anterior', _atual, 'stage', _stage);
END;
$$;

REVOKE ALL ON FUNCTION public.sistema_mover_etapa_lead(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sistema_mover_etapa_lead(uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.sistema_mover_etapa_lead(uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sistema_mover_etapa_lead(uuid, text, text, text) TO service_role;

-- 2) Auditoria de usuários: RLS estava ligada, havia policy de leitura para
--    admin, mas NENHUM grant e NENHUMA policy de INSERT — todo registro era
--    recusado pelo banco.
GRANT SELECT, INSERT ON public.user_audit_log TO authenticated;
GRANT ALL ON public.user_audit_log TO service_role;

CREATE POLICY "Usuario registra auditoria como ator"
  ON public.user_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (ator_user_id = auth.uid());