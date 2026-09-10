
CREATE OR REPLACE FUNCTION public.mover_etapa_lead(_lead_id uuid, _stage text, _origem text DEFAULT 'tela')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ator uuid := auth.uid();
  _lead record;
  _gestor uuid;
BEGIN
  IF _ator IS NULL THEN
    RAISE EXCEPTION 'sem permissão para mudar a etapa deste lead';
  END IF;

  SELECT id, owner_id, stage, company INTO _lead FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado';
  END IF;

  SELECT gestor_id INTO _gestor FROM public.profiles WHERE id = _lead.owner_id;

  IF NOT (
    _ator = _lead.owner_id
    OR _lead.owner_id IS NULL
    OR public.has_role(_ator, 'admin')
    OR public.tem_permissao(_ator, 'usuarios.gerenciar')
    OR (_gestor IS NOT NULL AND _gestor = _ator)
  ) THEN
    RAISE EXCEPTION 'sem permissão para mudar a etapa deste lead';
  END IF;

  IF _stage IS NULL OR _stage NOT IN ('atendimento','novo','qualificacao','proposta','negociacao','ganho','perdido') THEN
    RAISE EXCEPTION 'etapa inválida: %', _stage;
  END IF;

  IF _lead.stage::text = _stage THEN
    RETURN jsonb_build_object('ok', true, 'stage_anterior', _lead.stage::text, 'stage', _stage, 'alterado', false);
  END IF;

  PERFORM set_config('app.origem', COALESCE(NULLIF(btrim(_origem), ''), 'tela'), true);
  PERFORM set_config('app.etapa_manual', 'on', true);

  UPDATE public.leads
     SET stage = _stage::lead_stage,
         last_contact = COALESCE(last_contact, now())
   WHERE id = _lead_id;

  RETURN jsonb_build_object('ok', true, 'stage_anterior', _lead.stage::text, 'stage', _stage, 'alterado', true);
END; $function$;

GRANT EXECUTE ON FUNCTION public.mover_etapa_lead(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reagendar_lead(_lead_id uuid, _quando timestamptz, _motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ator uuid := auth.uid();
  _lead record;
  _gestor uuid;
BEGIN
  IF _ator IS NULL THEN
    RAISE EXCEPTION 'sem permissão para reagendar este lead';
  END IF;

  SELECT id, owner_id, stage INTO _lead FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado';
  END IF;

  SELECT gestor_id INTO _gestor FROM public.profiles WHERE id = _lead.owner_id;

  IF NOT (
    _ator = _lead.owner_id
    OR _lead.owner_id IS NULL
    OR public.has_role(_ator, 'admin')
    OR public.tem_permissao(_ator, 'usuarios.gerenciar')
    OR (_gestor IS NOT NULL AND _gestor = _ator)
  ) THEN
    RAISE EXCEPTION 'sem permissão para reagendar este lead';
  END IF;

  IF _quando IS NOT NULL AND _quando < now() - interval '1 day' THEN
    RAISE EXCEPTION 'escolha uma data futura para o próximo contato';
  END IF;

  PERFORM set_config('app.origem', 'reagendamento_manual', true);

  UPDATE public.leads
     SET next_followup = _quando,
         recontatar_em = CASE
           WHEN _lead.stage::text = 'perdido' AND _quando IS NOT NULL THEN _quando::date
           ELSE recontatar_em
         END
   WHERE id = _lead_id;

  IF _motivo IS NOT NULL AND btrim(_motivo) <> '' THEN
    INSERT INTO public.lead_interactions (lead_id, type, content, occurred_at)
    VALUES (_lead_id, 'note', 'Cobrança reagendada: ' || btrim(_motivo), now());
  END IF;

  RETURN jsonb_build_object('ok', true, 'next_followup', _quando);
END; $function$;

GRANT EXECUTE ON FUNCTION public.reagendar_lead(uuid, timestamptz, text) TO authenticated;

-- Trava: lead fechado (ganho/perdido) só sai dessa etapa pela rotina dedicada
-- (mover_etapa_lead, que liga a flag app.etapa_manual) ou por correção direta
-- de administrador do banco. Gravação genérica da tela não reverte fechamento.
CREATE OR REPLACE FUNCTION public.tg_leads_stage_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage
     AND OLD.stage::text IN ('ganho','perdido')
     AND COALESCE(current_setting('app.etapa_manual', true), '') <> 'on'
     AND current_user NOT IN ('postgres','supabase_admin','service_role','supabase_auth_admin')
  THEN
    RAISE EXCEPTION 'lead % está % — a etapa só muda pela ação de mudar etapa na tela', OLD.id, OLD.stage
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_leads_stage_lock ON public.leads;
CREATE TRIGGER trg_leads_stage_lock
BEFORE UPDATE OF stage ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_leads_stage_lock();
