-- ─────────────── 1) Normalização de telefone (chave DDD + últimos 8) ───────────────
CREATE OR REPLACE FUNCTION public.tel_chave(_v text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE d text; resto text;
BEGIN
  d := regexp_replace(coalesce(_v, ''), '\D', '', 'g');
  IF length(d) >= 12 AND left(d, 2) = '55' THEN d := substr(d, 3); END IF;
  IF length(d) < 10 THEN RETURN NULL; END IF;
  resto := substr(d, 3);
  IF length(resto) < 8 THEN RETURN NULL; END IF;
  RETURN left(d, 2) || right(resto, 8);
END;
$$;

-- ─────────────── 2) localizar_carteira ───────────────
CREATE OR REPLACE FUNCTION public.localizar_carteira(_telefone text, _cnpj text, _email text)
RETURNS TABLE(cliente_id uuid, lead_id uuid, vendedor_id uuid, origem text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tel text := public.tel_chave(_telefone);
  _doc text := nullif(regexp_replace(coalesce(_cnpj, ''), '\D', '', 'g'), '');
  _mail text := nullif(lower(btrim(coalesce(_email, ''))), '');
  _campo text;
BEGIN
  IF _doc IS NOT NULL AND length(_doc) <> 14 THEN _doc := NULL; END IF;
  IF _mail IS NOT NULL AND position('@' in _mail) = 0 THEN _mail := NULL; END IF;
  IF _tel IS NULL AND _doc IS NULL AND _mail IS NULL THEN RETURN; END IF;

  -- (a) clientes ativos
  RETURN QUERY
  SELECT c.id, NULL::uuid, c.vendedor_id,
         (CASE WHEN _doc IS NOT NULL AND regexp_replace(coalesce(c.cnpj,''), '\D', '', 'g') = _doc THEN 'cliente:cnpj'
               WHEN _tel IS NOT NULL AND (public.tel_chave(c.telefone) = _tel OR public.tel_chave(c.telefone2) = _tel) THEN 'cliente:telefone'
               ELSE 'cliente:email' END)::text
    FROM public.clientes c
   WHERE c.ativo IS TRUE
     AND c.vendedor_id IS NOT NULL
     AND (
       (_doc IS NOT NULL AND regexp_replace(coalesce(c.cnpj,''), '\D', '', 'g') = _doc)
       OR (_tel IS NOT NULL AND (public.tel_chave(c.telefone) = _tel OR public.tel_chave(c.telefone2) = _tel))
       OR (_mail IS NOT NULL AND lower(btrim(coalesce(c.email,''))) = _mail)
     )
   ORDER BY c.atualizado_em DESC NULLS LAST
   LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- (b) leads ganhos
  RETURN QUERY
  SELECT l.cliente_id, l.id, l.owner_id,
         (CASE WHEN _doc IS NOT NULL AND regexp_replace(coalesce(l.cnpj,''), '\D', '', 'g') = _doc THEN 'lead_ganho:cnpj'
               WHEN _tel IS NOT NULL THEN 'lead_ganho:telefone'
               ELSE 'lead_ganho:email' END)::text
    FROM public.leads l
   WHERE l.stage = 'ganho'::lead_stage
     AND l.owner_id IS NOT NULL
     AND (
       (_doc IS NOT NULL AND regexp_replace(coalesce(l.cnpj,''), '\D', '', 'g') = _doc)
       OR (_tel IS NOT NULL AND _tel IN (
             public.tel_chave(l.whatsapp), public.tel_chave(l.phone),
             public.tel_chave(l.telefone_whatsapp), public.tel_chave(l.telefone_fixo),
             public.tel_chave(l.telefone2)))
       OR (_mail IS NOT NULL AND lower(btrim(coalesce(l.email,''))) = _mail)
     )
   ORDER BY l.updated_at DESC NULLS LAST
   LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- (c) leads abertos
  RETURN QUERY
  SELECT l.cliente_id, l.id, l.owner_id,
         (CASE WHEN _doc IS NOT NULL AND regexp_replace(coalesce(l.cnpj,''), '\D', '', 'g') = _doc THEN 'lead_aberto:cnpj'
               WHEN _tel IS NOT NULL THEN 'lead_aberto:telefone'
               ELSE 'lead_aberto:email' END)::text
    FROM public.leads l
   WHERE l.stage NOT IN ('ganho'::lead_stage, 'perdido'::lead_stage)
     AND l.owner_id IS NOT NULL
     AND (
       (_doc IS NOT NULL AND regexp_replace(coalesce(l.cnpj,''), '\D', '', 'g') = _doc)
       OR (_tel IS NOT NULL AND _tel IN (
             public.tel_chave(l.whatsapp), public.tel_chave(l.phone),
             public.tel_chave(l.telefone_whatsapp), public.tel_chave(l.telefone_fixo),
             public.tel_chave(l.telefone2)))
       OR (_mail IS NOT NULL AND lower(btrim(coalesce(l.email,''))) = _mail)
     )
   ORDER BY l.updated_at DESC NULLS LAST
   LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.localizar_carteira(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tel_chave(text) TO authenticated, service_role;

-- ─────────────── 3) Novo tipo de tarefa ───────────────
ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_tipo_chk;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_tipo_chk CHECK (
  tipo IS NULL OR tipo = ANY (ARRAY[
    'follow_up','primeiro_contato','resposta_pendente','cadencia_proposta','retomar_contato',
    'resgate_carteira','reativacao_lead','prospeccao','retorno_agendado','conversa_parada',
    'proposta_rascunho_parada','proposta_vencida','pos_venda_confirmacao','pos_venda_satisfacao',
    'pos_venda_recompra','pos_venda_pedido','aprovacao_pendente','aguardando_pagamento',
    'acompanhar_producao','pedido_travado','nf_atrasada','previsao_atrasada','ocorrencia_aberta',
    'comprovacao_entrega','cadencia_analise_financeira','cadencia_aguardando_pagamento',
    'cadencia_liberado','cadencia_producao','cadencia_coleta_entrega','cadencia_em_rota',
    'combinar_coleta','pos_venda_atrasado','transferir_carteira'
  ])
);

-- ─────────────── 4) Lead novo já nasce do dono da carteira ───────────────
CREATE OR REPLACE FUNCTION public.tg_leads_carteira()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      IF NOT ('cliente_existente' = ANY (coalesce(NEW.tags, ARRAY[]::text[]))) THEN
        NEW.tags := coalesce(NEW.tags, ARRAY[]::text[]) || 'cliente_existente';
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_leads_carteira ON public.leads;
CREATE TRIGGER tg_leads_carteira
BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_leads_carteira();

CREATE OR REPLACE FUNCTION public.tg_leads_carteira_nota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    NULL;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_leads_carteira_nota ON public.leads;
CREATE TRIGGER tg_leads_carteira_nota
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_leads_carteira_nota();

-- ─────────────── 5) CNPJ que chega depois: humano decide, com prazo ───────────────
CREATE OR REPLACE FUNCTION public.tg_leads_cnpj_carteira()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _m record; _nome text; _gestor uuid; _doc text;
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
    NULL;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_leads_cnpj_carteira ON public.leads;
CREATE TRIGGER tg_leads_cnpj_carteira
AFTER UPDATE OF cnpj, notes ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_leads_cnpj_carteira();

-- ─────────────── 6) transferir_cliente (carteira inteira) ───────────────
CREATE OR REPLACE FUNCTION public.transferir_cliente(_cliente_id uuid, _novo_owner uuid, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  PERFORM set_config('app.origem', 'transferencia_carteira', true);

  UPDATE public.clientes SET vendedor_id = _novo_owner WHERE id = _cliente_id;

  UPDATE public.leads SET owner_id = _novo_owner
   WHERE cliente_id = _cliente_id
     AND stage <> 'perdido'::lead_stage
     AND owner_id IS NOT DISTINCT FROM _anterior;
  GET DIAGNOSTICS _leads = ROW_COUNT;

  UPDATE public.tarefas t SET owner_id = _novo_owner, updated_at = now()
   WHERE t.pedido_id IS NULL
     AND t.status IN ('pendente','adiada')
     AND t.owner_id IS NOT DISTINCT FROM _anterior
     AND t.lead_id IN (SELECT id FROM public.leads WHERE cliente_id = _cliente_id);
  GET DIAGNOSTICS _tarefas = ROW_COUNT;

  UPDATE public.whatsapp_conversas w
     SET atribuido_para = _novo_owner, atribuido_em = now(), updated_at = now()
   WHERE w.status <> 'encerrado'
     AND w.lead_id IN (SELECT id FROM public.leads WHERE cliente_id = _cliente_id)
     AND w.atribuido_para IS DISTINCT FROM _novo_owner;
  GET DIAGNOSTICS _conversas = ROW_COUNT;

  INSERT INTO public.user_audit_log (alvo_user_id, ator_user_id, campo, valor_anterior, valor_novo)
  VALUES (_novo_owner, _ator, 'cliente.' || _cliente_id::text || '.vendedor',
          _anterior::text, _novo_owner::text);

  INSERT INTO public.notificacoes (user_id, tipo, titulo, exige_aceite)
  VALUES (_novo_owner, 'carteira_transferida',
    left('Você recebeu a carteira de ' || coalesce(_cli.razao_social, 'um cliente') || ' — ' || btrim(_motivo), 300),
    false);

  RETURN jsonb_build_object('ok', true, 'leads_movidos', _leads,
                            'tarefas_movidas', _tarefas, 'conversas_movidas', _conversas);
END;
$$;

GRANT EXECUTE ON FUNCTION public.transferir_cliente(uuid, uuid, text) TO authenticated, service_role;

-- ─────────────── 7) transferir_lead leva a carteira junto ───────────────
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

  -- A carteira acompanha o lead: se o cliente é do dono anterior, muda junto.
  IF _lead.cliente_id IS NOT NULL THEN
    UPDATE public.clientes SET vendedor_id = _novo_owner
     WHERE id = _lead.cliente_id AND vendedor_id IS NOT DISTINCT FROM _anterior;
    IF FOUND THEN
      _carteira_movida := true;

      UPDATE public.leads SET owner_id = _novo_owner
       WHERE cliente_id = _lead.cliente_id
         AND id <> _lead_id
         AND stage NOT IN ('ganho'::lead_stage, 'perdido'::lead_stage)
         AND owner_id IS NOT DISTINCT FROM _anterior;
      GET DIAGNOSTICS _outros = ROW_COUNT;

      UPDATE public.tarefas t SET owner_id = _novo_owner, updated_at = now()
       WHERE t.pedido_id IS NULL
         AND t.status IN ('pendente','adiada')
         AND t.owner_id IS NOT DISTINCT FROM _anterior
         AND t.lead_id IN (
           SELECT id FROM public.leads
            WHERE cliente_id = _lead.cliente_id
              AND stage NOT IN ('ganho'::lead_stage, 'perdido'::lead_stage)
         );

      INSERT INTO public.user_audit_log (alvo_user_id, ator_user_id, campo, valor_anterior, valor_novo)
      VALUES (_novo_owner, _ator, 'cliente.' || _lead.cliente_id::text || '.vendedor',
              _anterior::text, _novo_owner::text);
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
END; $function$;
