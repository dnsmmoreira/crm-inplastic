CREATE OR REPLACE FUNCTION public.tg_leads_encerrar_tarefas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  comerciais text[] := ARRAY['follow_up','retomar_contato','primeiro_contato','resposta_pendente','cadencia_proposta','reativacao_lead','resgate_carteira','retorno_agendado'];
  retomaveis text[] := ARRAY['retomar_contato','reativacao_lead','resgate_carteira','retorno_agendado','follow_up'];
  _contato timestamptz;
  _contato_old timestamptz;
BEGIN
  BEGIN
    -- 1) lead encerrado (ganho/perdido): mata toda a cobrança comercial do lead
    IF NEW.stage IS DISTINCT FROM OLD.stage AND NEW.stage::text IN ('ganho','perdido') THEN
      UPDATE public.tarefas
         SET status = 'concluida',
             concluida_at = now(),
             desfecho = 'automatico',
             desfecho_detalhe = 'lead marcado como ' || CASE WHEN NEW.stage::text = 'ganho' THEN 'Ganho' ELSE 'Perdido' END
       WHERE lead_id = NEW.id
         AND pedido_id IS NULL
         AND status IN ('pendente','adiada')
         AND tipo = ANY (comerciais);

    -- 2) mudou de etapa (não terminal): o "parado em X" perdeu o motivo
    ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
      UPDATE public.tarefas
         SET status = 'concluida',
             concluida_at = now(),
             desfecho = 'automatico',
             desfecho_detalhe = 'lead avançou para ' || NEW.stage::text
       WHERE lead_id = NEW.id
         AND pedido_id IS NULL
         AND status IN ('pendente','adiada')
         AND tipo = 'follow_up';
    END IF;

    -- 3) primeiro contato registrado
    IF OLD.last_contact_at IS NULL AND NEW.last_contact_at IS NOT NULL THEN
      UPDATE public.tarefas
         SET status = 'concluida',
             concluida_at = now(),
             desfecho = 'automatico',
             desfecho_detalhe = 'primeiro contato registrado'
       WHERE lead_id = NEW.id
         AND pedido_id IS NULL
         AND status IN ('pendente','adiada')
         AND tipo = 'primeiro_contato';
    END IF;

    -- 4) vendedor respondeu o cliente
    IF NEW.ultima_msg_vendedor_at IS DISTINCT FROM OLD.ultima_msg_vendedor_at
       AND NEW.ultima_msg_vendedor_at IS NOT NULL
       AND (NEW.ultima_msg_cliente_at IS NULL OR NEW.ultima_msg_vendedor_at >= NEW.ultima_msg_cliente_at) THEN
      UPDATE public.tarefas
         SET status = 'concluida',
             concluida_at = now(),
             desfecho = 'automatico',
             desfecho_detalhe = 'cliente respondido'
       WHERE lead_id = NEW.id
         AND pedido_id IS NULL
         AND status IN ('pendente','adiada')
         AND tipo = 'resposta_pendente';
    END IF;

    -- 5) vendedor retomou o contato: cobranças de retomada perdem o motivo
    _contato := GREATEST(
      COALESCE(NEW.ultima_msg_vendedor_at, '-infinity'::timestamptz),
      COALESCE(NEW.last_contact_at, '-infinity'::timestamptz)
    );
    _contato_old := GREATEST(
      COALESCE(OLD.ultima_msg_vendedor_at, '-infinity'::timestamptz),
      COALESCE(OLD.last_contact_at, '-infinity'::timestamptz)
    );
    IF _contato > '-infinity'::timestamptz AND _contato > _contato_old THEN
      UPDATE public.tarefas t
         SET status = 'concluida',
             concluida_at = now(),
             desfecho = 'automatico',
             desfecho_detalhe = 'contato retomado pelo vendedor',
             nota_conclusao = COALESCE(t.nota_conclusao, 'contato retomado pelo vendedor')
       WHERE t.lead_id = NEW.id
         AND t.pedido_id IS NULL
         AND t.status IN ('pendente','adiada')
         AND t.tipo = ANY (retomaveis)
         AND t.created_at < _contato;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$function$;

-- Limpeza única das tarefas já desatualizadas
UPDATE public.tarefas t
   SET status = 'concluida',
       concluida_at = now(),
       desfecho = 'automatico',
       desfecho_detalhe = 'contato retomado pelo vendedor',
       nota_conclusao = COALESCE(t.nota_conclusao, 'contato retomado pelo vendedor')
  FROM public.leads l
 WHERE l.id = t.lead_id
   AND t.pedido_id IS NULL
   AND t.status IN ('pendente','adiada')
   AND t.tipo IN ('retomar_contato','reativacao_lead','resgate_carteira','retorno_agendado','follow_up')
   AND GREATEST(
         COALESCE(l.ultima_msg_vendedor_at, '-infinity'::timestamptz),
         COALESCE(l.last_contact_at, '-infinity'::timestamptz)
       ) > t.created_at;