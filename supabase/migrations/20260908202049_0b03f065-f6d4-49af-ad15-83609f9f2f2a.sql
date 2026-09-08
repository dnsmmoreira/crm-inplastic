-- 1) Novo tipo de tarefa: conversa_parada
ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_tipo_chk;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_tipo_chk CHECK (
  tipo IS NULL OR tipo = ANY (ARRAY[
    'follow_up','primeiro_contato','resposta_pendente','cadencia_proposta','retomar_contato',
    'resgate_carteira','reativacao_lead','prospeccao','retorno_agendado','conversa_parada',
    'pos_venda_confirmacao','pos_venda_satisfacao','pos_venda_recompra','pos_venda_pedido',
    'aprovacao_pendente','aguardando_pagamento','acompanhar_producao','pedido_travado',
    'nf_atrasada','previsao_atrasada','ocorrencia_aberta','comprovacao_entrega',
    'cadencia_analise_financeira','cadencia_aguardando_pagamento','cadencia_liberado',
    'cadencia_producao','cadencia_coleta_entrega','cadencia_em_rota'
  ]::text[])
);

-- 2) Fila: quem recebe o lead recebe também a conversa
CREATE OR REPLACE FUNCTION public.atribuir_proximo_vendedor(_lead_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _next uuid;
  _last uuid;
  _owner uuid;
  _stage lead_stage;
  _found boolean := false;
  _stage_moved boolean := false;
BEGIN
  SELECT true, l.owner_id, l.stage
    INTO _found, _owner, _stage
    FROM public.leads l
    WHERE l.id = _lead_id
    FOR UPDATE;

  IF NOT _found THEN
    RETURN NULL;
  END IF;

  IF _owner IS NOT NULL THEN
    RETURN _owner;
  END IF;

  SELECT ultimo_user_id INTO _last FROM public.fila_estado WHERE id = 1 FOR UPDATE;

  SELECT f.user_id INTO _next
    FROM public.fila_vendedores f
    WHERE f.ativo = true
      AND (_last IS NULL OR f.posicao > (SELECT posicao FROM public.fila_vendedores WHERE user_id = _last))
    ORDER BY f.posicao ASC
    LIMIT 1;

  IF _next IS NULL THEN
    SELECT f.user_id INTO _next
      FROM public.fila_vendedores f
      WHERE f.ativo = true
      ORDER BY f.posicao ASC
      LIMIT 1;
  END IF;

  IF _next IS NULL THEN
    RAISE EXCEPTION 'Nenhum vendedor ativo na fila';
  END IF;

  UPDATE public.fila_estado SET ultimo_user_id = _next, updated_at = now() WHERE id = 1;

  IF _stage IN ('novo', 'atendimento') THEN
    _stage_moved := true;
    UPDATE public.leads
      SET owner_id = _next, stage = 'qualificacao', updated_at = now()
      WHERE id = _lead_id;
  ELSE
    UPDATE public.leads
      SET owner_id = _next, updated_at = now()
      WHERE id = _lead_id;
  END IF;

  IF _stage_moved THEN
    UPDATE public.whatsapp_conversas
      SET status = 'qualificado', ia_ativa = false, updated_at = now()
      WHERE lead_id = _lead_id;
  END IF;

  -- SEMPRE: a conversa acompanha o dono do lead
  PERFORM set_config('app.origem', 'sync_lead_conversa', true);
  UPDATE public.whatsapp_conversas
     SET atribuido_para = _next,
         atribuido_em = now(),
         ia_ativa = false,
         status = CASE WHEN status IN ('ia_atendendo','aguardando_humano') THEN 'humano_atendendo' ELSE status END,
         updated_at = now()
   WHERE lead_id = _lead_id
     AND status <> 'encerrado'
     AND atribuido_para IS DISTINCT FROM _next;

  RETURN _next;
END; $function$;

-- 3) Dono do lead -> conversa
CREATE OR REPLACE FUNCTION public.tg_leads_owner_para_conversa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      PERFORM set_config('app.origem', 'sync_lead_conversa', true);
      UPDATE public.whatsapp_conversas
         SET atribuido_para = NEW.owner_id,
             atribuido_em = CASE WHEN NEW.owner_id IS NULL THEN NULL ELSE now() END,
             ia_ativa = CASE WHEN NEW.owner_id IS NULL THEN ia_ativa ELSE false END,
             status = CASE
               WHEN NEW.owner_id IS NOT NULL AND status IN ('ia_atendendo','aguardando_humano')
                 THEN 'humano_atendendo' ELSE status END,
             updated_at = now()
       WHERE lead_id = NEW.id
         AND status <> 'encerrado'
         AND atribuido_para IS DISTINCT FROM NEW.owner_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END; $function$;

DROP TRIGGER IF EXISTS tg_leads_owner_para_conversa ON public.leads;
CREATE TRIGGER tg_leads_owner_para_conversa
AFTER UPDATE OF owner_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_leads_owner_para_conversa();

-- 4) Dono da conversa -> lead
CREATE OR REPLACE FUNCTION public.tg_conversa_dono_para_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF NEW.atribuido_para IS NOT NULL AND NEW.lead_id IS NOT NULL
       AND NEW.atribuido_para IS DISTINCT FROM OLD.atribuido_para THEN
      PERFORM set_config('app.origem', 'sync_conversa_lead', true);
      UPDATE public.leads
         SET owner_id = NEW.atribuido_para, updated_at = now()
       WHERE id = NEW.lead_id
         AND owner_id IS DISTINCT FROM NEW.atribuido_para;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END; $function$;

DROP TRIGGER IF EXISTS tg_conversa_dono_para_lead ON public.whatsapp_conversas;
CREATE TRIGGER tg_conversa_dono_para_lead
AFTER UPDATE OF atribuido_para ON public.whatsapp_conversas
FOR EACH ROW EXECUTE FUNCTION public.tg_conversa_dono_para_lead();

-- 5) Condição de morte da tarefa "conversa parada"
CREATE OR REPLACE FUNCTION public.tg_conversa_encerrar_tarefas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _motivo text;
BEGIN
  BEGIN
    IF NEW.status::text = 'encerrado' AND OLD.status::text IS DISTINCT FROM 'encerrado' THEN
      _motivo := 'conversa encerrada';
    ELSIF OLD.em_espera_desde IS NULL AND NEW.em_espera_desde IS NOT NULL THEN
      _motivo := 'conversa em espera';
    ELSIF NEW.last_message_at IS NOT NULL
          AND (OLD.last_message_at IS NULL OR NEW.last_message_at > OLD.last_message_at) THEN
      _motivo := 'conversa retomada';
    END IF;

    IF _motivo IS NOT NULL THEN
      UPDATE public.tarefas
         SET status = 'concluida',
             concluida_at = now(),
             desfecho = 'automatico',
             desfecho_detalhe = _motivo,
             nota_conclusao = COALESCE(nota_conclusao, _motivo)
       WHERE tipo = 'conversa_parada'
         AND status IN ('pendente','adiada')
         AND descricao ILIKE '%[conversa:' || NEW.id::text || ']%';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END; $function$;

DROP TRIGGER IF EXISTS tg_conversa_encerrar_tarefas ON public.whatsapp_conversas;
CREATE TRIGGER tg_conversa_encerrar_tarefas
AFTER UPDATE ON public.whatsapp_conversas
FOR EACH ROW EXECUTE FUNCTION public.tg_conversa_encerrar_tarefas();

REVOKE EXECUTE ON FUNCTION public.tg_leads_owner_para_conversa() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_conversa_dono_para_lead() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_conversa_encerrar_tarefas() FROM PUBLIC, anon, authenticated;