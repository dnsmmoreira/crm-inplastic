ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_desfecho_chk;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_desfecho_chk CHECK (
  desfecho IS NULL OR desfecho = ANY (ARRAY['retorno_agendado','avancou_etapa','perdido','sem_pendencia','manual','automatico']::text[])
);

CREATE INDEX IF NOT EXISTS tarefas_pedido_status_idx ON public.tarefas (pedido_id, status);

CREATE OR REPLACE FUNCTION public.tg_leads_encerrar_tarefas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comerciais text[] := ARRAY['follow_up','retomar_contato','primeiro_contato','resposta_pendente','cadencia_proposta','reativacao_lead','resgate_carteira','retorno_agendado'];
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
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_leads_encerrar_tarefas ON public.leads;
CREATE TRIGGER tg_leads_encerrar_tarefas
AFTER UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.tg_leads_encerrar_tarefas();