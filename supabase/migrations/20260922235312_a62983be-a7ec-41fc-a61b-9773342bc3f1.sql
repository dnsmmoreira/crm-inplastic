-- =====================================================================
-- LOTE 5A — variáveis de sessão deixam de valer pelo resto da transação.
-- Padrão: salvar o valor anterior, usar, restaurar. NUNCA limpar, porque
-- transferir_lead/transferir_cliente dependem do flag entre instruções.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.mover_etapa_lead(_lead_id uuid, _stage text, _origem text DEFAULT 'tela'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ator uuid := auth.uid();
  _lead record;
  _gestor uuid;
  _origem_ant text := coalesce(current_setting('app.origem', true), '');
  _manual_ant text := coalesce(current_setting('app.etapa_manual', true), '');
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

  -- Restaura o contexto de quem chamou: o flag não vale além desta função.
  PERFORM set_config('app.origem', _origem_ant, true);
  PERFORM set_config('app.etapa_manual', _manual_ant, true);

  RETURN jsonb_build_object('ok', true, 'stage_anterior', _lead.stage::text, 'stage', _stage, 'alterado', true);
END; $function$;

CREATE OR REPLACE FUNCTION public.reagendar_lead(_lead_id uuid, _quando timestamp with time zone, _motivo text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ator uuid := auth.uid();
  _lead record;
  _gestor uuid;
  _origem_ant text := coalesce(current_setting('app.origem', true), '');
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

  PERFORM set_config('app.origem', _origem_ant, true);

  RETURN jsonb_build_object('ok', true, 'next_followup', _quando);
END; $function$;

CREATE OR REPLACE FUNCTION public.tg_clientes_dono_propaga()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ator uuid := coalesce(auth.uid(), NEW.vendedor_id);
  _origem_ant text := coalesce(current_setting('app.origem', true), '');
BEGIN
  IF NEW.vendedor_id IS NULL OR NEW.vendedor_id IS NOT DISTINCT FROM OLD.vendedor_id THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('app.origem', 'transferencia_carteira', true);

  UPDATE public.leads
     SET owner_id = NEW.vendedor_id
   WHERE cliente_id = NEW.id
     AND owner_id IS DISTINCT FROM NEW.vendedor_id;

  UPDATE public.tarefas t
     SET owner_id = NEW.vendedor_id, updated_at = now()
   WHERE t.pedido_id IS NULL
     AND t.status IN ('pendente','adiada')
     AND t.owner_id IS DISTINCT FROM NEW.vendedor_id
     AND t.lead_id IN (SELECT id FROM public.leads WHERE cliente_id = NEW.id);

  UPDATE public.whatsapp_conversas w
     SET atribuido_para = NEW.vendedor_id, atribuido_em = now(), updated_at = now()
   WHERE w.status <> 'encerrado'
     AND w.atribuido_para IS DISTINCT FROM NEW.vendedor_id
     AND w.lead_id IN (SELECT id FROM public.leads WHERE cliente_id = NEW.id);

  UPDATE public.propostas p
     SET owner_id = NEW.vendedor_id
   WHERE p.owner_id IS DISTINCT FROM NEW.vendedor_id
     AND p.status IN ('rascunho'::proposal_status,'enviada'::proposal_status,'aguardando_aprovacao'::proposal_status)
     AND p.lead_id IN (SELECT id FROM public.leads WHERE cliente_id = NEW.id);

  INSERT INTO public.user_audit_log (alvo_user_id, ator_user_id, campo, valor_anterior, valor_novo)
  VALUES (NEW.vendedor_id, _ator, 'cliente.' || NEW.id::text || '.vendedor',
          coalesce(OLD.vendedor_id::text, ''), NEW.vendedor_id::text);

  -- Restaura o contexto de quem chamou (transferir_cliente depende dele).
  PERFORM set_config('app.origem', _origem_ant, true);

  RETURN NULL;
END;
$function$;