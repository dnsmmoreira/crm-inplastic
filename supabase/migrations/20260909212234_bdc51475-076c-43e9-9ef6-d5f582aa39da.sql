-- 1. Tarefas seguem o dono do lead
CREATE OR REPLACE FUNCTION public.tg_leads_owner_para_tarefas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF NEW.owner_id IS NOT NULL AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      UPDATE public.tarefas
         SET owner_id = NEW.owner_id,
             updated_at = now()
       WHERE lead_id = NEW.id
         AND pedido_id IS NULL
         AND status IN ('pendente','adiada')
         AND owner_id IS DISTINCT FROM NEW.owner_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END; $function$;

DROP TRIGGER IF EXISTS tg_leads_owner_para_tarefas ON public.leads;
CREATE TRIGGER tg_leads_owner_para_tarefas
AFTER UPDATE OF owner_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_leads_owner_para_tarefas();

-- Backfill: tarefas abertas com dono diferente do lead
UPDATE public.tarefas t
   SET owner_id = l.owner_id, updated_at = now()
  FROM public.leads l
 WHERE l.id = t.lead_id
   AND t.pedido_id IS NULL
   AND t.status IN ('pendente','adiada')
   AND l.owner_id IS NOT NULL
   AND t.owner_id IS DISTINCT FROM l.owner_id;

-- 2. Proposta enviada conta como contato
CREATE OR REPLACE FUNCTION public.tg_proposta_sent_track()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.sent_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.sent_at IS NULL) THEN
    UPDATE public.leads
       SET proposta_enviada_at = COALESCE(proposta_enviada_at, NEW.sent_at),
           last_contact_at = GREATEST(COALESCE(last_contact_at, '-infinity'::timestamptz), NEW.sent_at)
     WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Só desfechos de contato real tocam last_contact_at
CREATE OR REPLACE FUNCTION public.tg_tarefa_concluida_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'concluida'
     AND OLD.status <> 'concluida'
     AND NEW.lead_id IS NOT NULL
     AND NEW.origem IS DISTINCT FROM 'pedido_fluxo'
     AND COALESCE(NEW.desfecho, 'manual') IN
         ('manual','retorno_agendado','avancou_etapa','contato_registrado','data_combinada')
  THEN
    UPDATE public.leads SET last_contact_at = COALESCE(NEW.concluida_at, now()) WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END; $function$;

-- 4. RPC de transferência de lead
CREATE OR REPLACE FUNCTION public.transferir_lead(_lead_id uuid, _novo_owner uuid, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ator uuid := auth.uid();
  _lead record;
  _anterior uuid;
  _nome_ant text;
  _nome_novo text;
  _gestor uuid;
  _movidas int := 0;
BEGIN
  IF _ator IS NULL THEN
    RAISE EXCEPTION 'sem permissão para transferir este lead';
  END IF;
  IF _motivo IS NULL OR length(btrim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'informe um motivo com pelo menos 5 caracteres';
  END IF;

  SELECT id, owner_id, company INTO _lead FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead não encontrado';
  END IF;
  _anterior := _lead.owner_id;

  SELECT gestor_id INTO _gestor FROM public.profiles WHERE id = _anterior;

  IF NOT (
    _ator = _anterior
    OR public.has_role(_ator, 'admin')
    OR public.tem_permissao(_ator, 'usuarios.gerenciar')
    OR (_gestor IS NOT NULL AND _gestor = _ator)
  ) THEN
    RAISE EXCEPTION 'sem permissão para transferir este lead';
  END IF;

  IF _novo_owner IS NULL OR _novo_owner = _anterior THEN
    RAISE EXCEPTION 'escolha outro responsável para o lead';
  END IF;

  SELECT name INTO _nome_novo FROM public.profiles
   WHERE id = _novo_owner AND ativo IS TRUE AND deleted_at IS NULL;
  IF _nome_novo IS NULL THEN
    RAISE EXCEPTION 'o responsável escolhido não está ativo';
  END IF;
  IF NOT (
    public.has_role(_novo_owner, 'admin')
    OR public.has_role(_novo_owner, 'vendedor')
    OR public.tem_permissao(_novo_owner, 'propostas.editar')
  ) THEN
    RAISE EXCEPTION 'o responsável escolhido não atende clientes';
  END IF;

  SELECT name INTO _nome_ant FROM public.profiles WHERE id = _anterior;

  PERFORM set_config('app.origem', 'transferencia_manual', true);

  UPDATE public.leads SET owner_id = _novo_owner WHERE id = _lead_id;

  UPDATE public.tarefas
     SET owner_id = _novo_owner,
         title = CASE
           WHEN title LIKE '↪ de %' THEN title
           ELSE '↪ de ' || COALESCE(_nome_ant, 'anterior') || ': ' || title
         END,
         updated_at = now()
   WHERE lead_id = _lead_id
     AND pedido_id IS NULL
     AND status IN ('pendente','adiada');
  GET DIAGNOSTICS _movidas = ROW_COUNT;

  INSERT INTO public.lead_interactions (lead_id, owner_id, type, content, occurred_at)
  VALUES (
    _lead_id, _ator, 'note',
    'Transferido de ' || COALESCE(_nome_ant, 'sem dono') || ' para ' || _nome_novo || ' — ' || btrim(_motivo),
    now()
  );

  INSERT INTO public.user_audit_log (alvo_user_id, ator_user_id, campo, valor_anterior, valor_novo)
  VALUES (_novo_owner, _ator, 'lead.' || _lead_id::text || '.owner',
          _anterior::text, _novo_owner::text);

  INSERT INTO public.notificacoes (user_id, tipo, titulo, exige_aceite)
  VALUES (_novo_owner, 'lead_transferido',
          left('Você recebeu o cliente ' || COALESCE(_lead.company, 'sem nome') || ' — ' || btrim(_motivo), 300),
          false);

  RETURN jsonb_build_object('ok', true, 'tarefas_movidas', _movidas);
END; $function$;

REVOKE ALL ON FUNCTION public.transferir_lead(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_lead(uuid, uuid, text) TO authenticated;