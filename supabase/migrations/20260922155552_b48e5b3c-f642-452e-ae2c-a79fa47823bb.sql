
-- 1) Propagação do dono a partir do cliente ------------------------------
CREATE OR REPLACE FUNCTION public.tg_clientes_dono_propaga()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _ator uuid := coalesce(auth.uid(), NEW.vendedor_id);
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

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS tg_clientes_dono_propaga ON public.clientes;
CREATE TRIGGER tg_clientes_dono_propaga
AFTER UPDATE OF vendedor_id ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.tg_clientes_dono_propaga();

-- 2) Cliente novo com documento de lead de outro vendedor é recusado -----
CREATE OR REPLACE FUNCTION public.tg_clientes_dono_coerente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _doc text := nullif(regexp_replace(coalesce(NEW.cnpj,''),'\D','','g'),'');
  _dono uuid;
  _nome text;
  _origem text := coalesce(current_setting('app.origem', true), '');
BEGIN
  IF NEW.vendedor_id IS NULL OR _doc IS NULL
     OR _origem IN ('transferencia_manual','transferencia_carteira') THEN
    RETURN NEW;
  END IF;

  SELECT l.owner_id INTO _dono
    FROM public.leads l
   WHERE nullif(regexp_replace(coalesce(l.cnpj,''),'\D','','g'),'') = _doc
     AND l.owner_id IS NOT NULL
     AND l.owner_id IS DISTINCT FROM NEW.vendedor_id
   ORDER BY l.created_at
   LIMIT 1;

  IF _dono IS NOT NULL THEN
    SELECT name INTO _nome FROM public.profiles WHERE id = _dono;
    RAISE EXCEPTION 'Este CNPJ/CPF já está com %. Fale com essa pessoa antes de cadastrar.',
      coalesce(_nome, 'outro vendedor') USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_clientes_dono_coerente ON public.clientes;
CREATE TRIGGER tg_clientes_dono_coerente
BEFORE INSERT OR UPDATE OF cnpj ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.tg_clientes_dono_coerente();

-- 3) Vínculo e dono do lead ----------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_leads_vinculo_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _doc text := nullif(regexp_replace(coalesce(NEW.cnpj, ''), '\D', '', 'g'), '');
  _doc_cliente text;
  _vend uuid;
  _nome text;
  _auto boolean := false;
  _origem text := coalesce(current_setting('app.origem', true), '');
BEGIN
  -- 1) sem vínculo: liga ao cliente do mesmo documento (qualquer dono)
  IF NEW.cliente_id IS NULL AND _doc IS NOT NULL AND length(_doc) IN (11, 14) THEN
    SELECT c.id INTO NEW.cliente_id
      FROM public.clientes c
     WHERE regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') = _doc
     ORDER BY c.ativo DESC, c.atualizado_em DESC NULLS LAST
     LIMIT 1;
    _auto := NEW.cliente_id IS NOT NULL;
  END IF;

  IF NEW.cliente_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nullif(regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g'), ''), c.vendedor_id
    INTO _doc_cliente, _vend
    FROM public.clientes c WHERE c.id = NEW.cliente_id;

  -- 2) vínculo incoerente: só recusa quando OS DOIS documentos existem e diferem
  IF _doc IS NOT NULL AND _doc_cliente IS NOT NULL AND _doc_cliente <> _doc THEN
    RAISE EXCEPTION 'lead % tem CNPJ % e não pode ficar ligado ao cliente % (CNPJ %)',
      NEW.id, _doc, NEW.cliente_id, _doc_cliente
      USING ERRCODE = '23514';
  END IF;

  -- 3) lead e cliente são o mesmo cadastro: o dono tem que ser o mesmo
  IF _vend IS NOT NULL
     AND _vend IS DISTINCT FROM NEW.owner_id
     AND _origem NOT IN ('transferencia_manual','transferencia_carteira') THEN
    SELECT name INTO _nome FROM public.profiles WHERE id = _vend;
    IF (TG_OP = 'INSERT' AND NOT _auto)
       OR (TG_OP = 'UPDATE' AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id) THEN
      -- atendimento criado/ligado a um cliente existente herda o dono do cliente
      NEW.owner_id := _vend;
    ELSE
      RAISE EXCEPTION 'Este CNPJ/CPF já está com %. Fale com essa pessoa antes de seguir.',
        coalesce(_nome, 'outro vendedor') USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Transferência do lead: a carteira vai junto, sem exceção de etapa ----
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
  _carteira_movida boolean := false;
  _outros int := 0;
BEGIN
  IF _ator IS NULL THEN
    RAISE EXCEPTION 'sem permissão para transferir este lead';
  END IF;
  IF _motivo IS NULL OR length(btrim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'informe um motivo com pelo menos 5 caracteres';
  END IF;

  SELECT id, owner_id, company, cliente_id INTO _lead FROM public.leads WHERE id = _lead_id;
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

  UPDATE public.propostas p
     SET owner_id = _novo_owner
   WHERE p.lead_id = _lead_id
     AND p.owner_id IS DISTINCT FROM _novo_owner
     AND p.status IN ('rascunho'::proposal_status,'enviada'::proposal_status,'aguardando_aprovacao'::proposal_status);

  -- A carteira acompanha o lead: o cliente ligado muda de dono sempre.
  IF _lead.cliente_id IS NOT NULL THEN
    SELECT count(*) INTO _outros FROM public.leads
     WHERE cliente_id = _lead.cliente_id AND id <> _lead_id
       AND owner_id IS DISTINCT FROM _novo_owner;

    UPDATE public.clientes SET vendedor_id = _novo_owner
     WHERE id = _lead.cliente_id AND vendedor_id IS DISTINCT FROM _novo_owner;
    IF FOUND THEN
      _carteira_movida := true;   -- o gatilho do cliente leva leads, tarefas, conversas e propostas
    ELSE
      _outros := 0;
    END IF;
  END IF;

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

  RETURN jsonb_build_object('ok', true, 'tarefas_movidas', _movidas,
                            'carteira_movida', _carteira_movida, 'leads_movidos', _outros);
END;
$function$;

-- 5) Transferência da carteira: o gatilho do cliente faz a propagação -----
CREATE OR REPLACE FUNCTION public.transferir_cliente(_cliente_id uuid, _novo_owner uuid, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ator uuid := auth.uid();
  _cli record;
  _anterior uuid;
  _gestor uuid;
  _nome_novo text;
  _leads int := 0;
  _tarefas int := 0;
  _conversas int := 0;
BEGIN
  IF _ator IS NULL THEN RAISE EXCEPTION 'sem permissão para transferir esta carteira'; END IF;
  IF _motivo IS NULL OR length(btrim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'informe um motivo com pelo menos 5 caracteres';
  END IF;

  SELECT id, vendedor_id, razao_social INTO _cli FROM public.clientes WHERE id = _cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cliente não encontrado'; END IF;
  _anterior := _cli.vendedor_id;

  SELECT gestor_id INTO _gestor FROM public.profiles WHERE id = _anterior;

  IF NOT (
    _ator = _anterior
    OR public.has_role(_ator, 'admin')
    OR public.tem_permissao(_ator, 'usuarios.gerenciar')
    OR (_gestor IS NOT NULL AND _gestor = _ator)
  ) THEN
    RAISE EXCEPTION 'sem permissão para transferir esta carteira';
  END IF;

  IF _novo_owner IS NULL OR _novo_owner = _anterior THEN
    RAISE EXCEPTION 'escolha outro responsável para o cliente';
  END IF;

  SELECT name INTO _nome_novo FROM public.profiles
   WHERE id = _novo_owner AND ativo IS TRUE AND deleted_at IS NULL;
  IF _nome_novo IS NULL THEN RAISE EXCEPTION 'o responsável escolhido não está ativo'; END IF;

  SELECT count(*) INTO _leads FROM public.leads
   WHERE cliente_id = _cliente_id AND owner_id IS DISTINCT FROM _novo_owner;

  SELECT count(*) INTO _tarefas FROM public.tarefas t
   WHERE t.pedido_id IS NULL AND t.status IN ('pendente','adiada')
     AND t.owner_id IS DISTINCT FROM _novo_owner
     AND t.lead_id IN (SELECT id FROM public.leads WHERE cliente_id = _cliente_id);

  SELECT count(*) INTO _conversas FROM public.whatsapp_conversas w
   WHERE w.status <> 'encerrado'
     AND w.atribuido_para IS DISTINCT FROM _novo_owner
     AND w.lead_id IN (SELECT id FROM public.leads WHERE cliente_id = _cliente_id);

  PERFORM set_config('app.origem', 'transferencia_carteira', true);

  -- O gatilho tg_clientes_dono_propaga leva leads, tarefas, conversas,
  -- propostas abertas e grava a auditoria.
  UPDATE public.clientes SET vendedor_id = _novo_owner WHERE id = _cliente_id;

  INSERT INTO public.notificacoes (user_id, tipo, titulo, exige_aceite)
  VALUES (_novo_owner, 'carteira_transferida',
    left('Você recebeu a carteira de ' || coalesce(_cli.razao_social, 'um cliente') || ' — ' || btrim(_motivo), 300),
    false);

  RETURN jsonb_build_object('ok', true, 'leads_movidos', _leads,
                            'tarefas_movidas', _tarefas, 'conversas_movidas', _conversas);
END;
$function$;
