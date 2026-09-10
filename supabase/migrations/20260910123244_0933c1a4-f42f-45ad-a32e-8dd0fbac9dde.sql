-- Registro de falha a partir de gatilhos (nunca derruba a transação do negócio).
CREATE OR REPLACE FUNCTION public.log_falha_trigger(_origem text, _mensagem text, _contexto jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.falhas_sistema
     SET ocorrencias = ocorrencias + 1, ocorrido_em = now(), contexto = _contexto
   WHERE origem = _origem AND mensagem = left(_mensagem, 1000) AND resolvido_em IS NULL;
  IF NOT FOUND THEN
    INSERT INTO public.falhas_sistema (origem, mensagem, contexto, ocorrido_em)
    VALUES (_origem, left(_mensagem, 1000), _contexto, now());
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- registrar falha jamais pode quebrar o fluxo
END;
$function$;

REVOKE ALL ON FUNCTION public.log_falha_trigger(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_falha_trigger(text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_leads_carteira()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _m record;
BEGIN
  BEGIN
    SELECT * INTO _m FROM public.localizar_carteira(
      coalesce(NEW.telefone_whatsapp, NEW.whatsapp, NEW.phone, NEW.telefone2, NEW.telefone_fixo),
      NEW.cnpj, NEW.email) LIMIT 1;

    IF _m.vendedor_id IS NOT NULL THEN
      IF coalesce(NEW.source, '') <> 'Manual' THEN
        NEW.owner_id := _m.vendedor_id;
      END IF;
      IF NEW.cliente_id IS NULL AND _m.cliente_id IS NOT NULL THEN
        NEW.cliente_id := _m.cliente_id;
      END IF;
      -- 'cliente_existente'::text: sem o cast o operador ficava ambíguo
      -- (text[] || unknown) e a marcação nunca era gravada.
      IF NOT ('cliente_existente' = ANY (coalesce(NEW.tags, ARRAY[]::text[]))) THEN
        NEW.tags := coalesce(NEW.tags, ARRAY[]::text[]) || 'cliente_existente'::text;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.log_falha_trigger('tg_leads_carteira', SQLERRM,
      jsonb_build_object('sqlstate', SQLSTATE, 'lead_company', NEW.company, 'source', NEW.source));
  END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_leads_carteira_nota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _m record; _nome text; _campo text;
BEGIN
  BEGIN
    IF NOT ('cliente_existente' = ANY (coalesce(NEW.tags, ARRAY[]::text[]))) THEN
      RETURN NULL;
    END IF;
    SELECT * INTO _m FROM public.localizar_carteira(
      coalesce(NEW.telefone_whatsapp, NEW.whatsapp, NEW.phone, NEW.telefone2, NEW.telefone_fixo),
      NEW.cnpj, NEW.email) LIMIT 1;
    IF _m.vendedor_id IS NULL THEN RETURN NULL; END IF;

    SELECT name INTO _nome FROM public.profiles WHERE id = _m.vendedor_id;
    _campo := CASE WHEN _m.origem LIKE '%cnpj' THEN 'CNPJ'
                   WHEN _m.origem LIKE '%email' THEN 'e-mail'
                   ELSE 'telefone' END;

    INSERT INTO public.lead_interactions (lead_id, owner_id, type, content, occurred_at)
    VALUES (NEW.id, NULL, 'note',
      'Cliente já é da carteira de ' || coalesce(_nome, 'outro responsável') ||
      ' — atribuído automaticamente (bateu por ' || _campo || ').', now());
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.log_falha_trigger('tg_leads_carteira_nota', SQLERRM,
      jsonb_build_object('sqlstate', SQLSTATE, 'lead_id', NEW.id));
  END;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_leads_cnpj_carteira()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _m record; _nome text; _doc text;
BEGIN
  BEGIN
    IF NEW.stage IN ('ganho'::lead_stage, 'perdido'::lead_stage) THEN RETURN NULL; END IF;
    IF NEW.cliente_id IS NOT NULL THEN RETURN NULL; END IF;

    _doc := regexp_replace(coalesce(NEW.cnpj, ''), '\D', '', 'g');
    IF length(_doc) <> 14 THEN
      _doc := (regexp_match(coalesce(NEW.notes, ''), 'DOC:\s*([0-9./-]{14,20})'))[1];
      _doc := regexp_replace(coalesce(_doc, ''), '\D', '', 'g');
    END IF;
    IF length(_doc) <> 14 THEN RETURN NULL; END IF;

    SELECT * INTO _m FROM public.localizar_carteira(NULL, _doc, NULL) LIMIT 1;
    IF _m.vendedor_id IS NULL OR _m.vendedor_id = NEW.owner_id OR NEW.owner_id IS NULL THEN
      RETURN NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM public.tarefas t
                WHERE t.lead_id = NEW.id AND t.tipo = 'transferir_carteira'
                  AND t.status IN ('pendente','adiada')) THEN
      RETURN NULL;
    END IF;

    SELECT name INTO _nome FROM public.profiles WHERE id = _m.vendedor_id;

    INSERT INTO public.tarefas (owner_id, lead_id, tipo, kind, origem, status, prioridade, title, descricao, due_date)
    VALUES (NEW.owner_id, NEW.id, 'transferir_carteira', 'transferir_carteira', 'xerife', 'pendente', 1,
      'Este CNPJ é da carteira de ' || coalesce(_nome, 'outro responsável') || ' — transferir ou justificar',
      'O CNPJ informado neste atendimento já pertence à carteira de ' || coalesce(_nome, 'outro responsável') ||
      '. Transfira o cliente ou registre a justificativa.',
      now() + interval '1 day');

    INSERT INTO public.notificacoes (user_id, tipo, titulo, exige_aceite)
    SELECT d, 'carteira_conflito',
      left('CNPJ de um cliente da carteira apareceu em outro atendimento — ' ||
           coalesce(NEW.company, 'sem nome'), 300), false
      FROM (
        SELECT _m.vendedor_id AS d
        UNION
        SELECT p.gestor_id FROM public.profiles p WHERE p.id = NEW.owner_id AND p.gestor_id IS NOT NULL
      ) x
     WHERE x.d IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.log_falha_trigger('tg_leads_cnpj_carteira', SQLERRM,
      jsonb_build_object('sqlstate', SQLSTATE, 'lead_id', NEW.id));
  END;
  RETURN NULL;
END;
$function$;