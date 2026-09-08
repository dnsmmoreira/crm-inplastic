ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS vencida_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS prorrogada_ate date NULL,
  ADD COLUMN IF NOT EXISTS prorrogacao_motivo text NULL,
  ADD COLUMN IF NOT EXISTS reemitida_como uuid NULL REFERENCES public.propostas(id);

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS proposta_id uuid NULL REFERENCES public.propostas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tarefas_proposta_status_idx ON public.tarefas (proposta_id, status);

ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_tipo_chk;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_tipo_chk CHECK (
  tipo IS NULL OR tipo = ANY (ARRAY[
    'follow_up','primeiro_contato','resposta_pendente','cadencia_proposta','retomar_contato',
    'resgate_carteira','reativacao_lead','prospeccao','retorno_agendado','conversa_parada',
    'proposta_rascunho_parada','proposta_vencida',
    'pos_venda_confirmacao','pos_venda_satisfacao','pos_venda_recompra','pos_venda_pedido',
    'aprovacao_pendente','aguardando_pagamento','acompanhar_producao','pedido_travado',
    'nf_atrasada','previsao_atrasada','ocorrencia_aberta','comprovacao_entrega',
    'cadencia_analise_financeira','cadencia_aguardando_pagamento','cadencia_liberado',
    'cadencia_producao','cadencia_coleta_entrega','cadencia_em_rota'
  ]::text[])
);

ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_desfecho_chk;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_desfecho_chk CHECK (
  desfecho IS NULL OR desfecho = ANY (ARRAY[
    'retorno_agendado','avancou_etapa','perdido','sem_pendencia','em_espera','encerrar_conversa',
    'recusar_proposta','reemitir_proposta','prorrogar_proposta','excluir_rascunho',
    'manual','automatico'
  ]::text[])
);

CREATE OR REPLACE FUNCTION public.tg_propostas_encerrar_tarefas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  motivo text;
BEGIN
  BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      motivo := 'proposta ' || COALESCE(NEW.status::text, 'atualizada');

      UPDATE public.tarefas
         SET status = 'concluida',
             concluida_at = now(),
             desfecho = 'automatico',
             desfecho_detalhe = motivo,
             nota_conclusao = COALESCE(nota_conclusao, motivo),
             done = true
       WHERE proposta_id = NEW.id
         AND status IN ('pendente','adiada')
         AND tipo = 'proposta_rascunho_parada';

      IF OLD.status = 'enviada' THEN
        UPDATE public.tarefas
           SET status = 'concluida',
               concluida_at = now(),
               desfecho = 'automatico',
               desfecho_detalhe = motivo,
               nota_conclusao = COALESCE(nota_conclusao, motivo),
               done = true
         WHERE proposta_id = NEW.id
           AND status IN ('pendente','adiada')
           AND tipo IN ('proposta_vencida','cadencia_proposta');
      END IF;
    END IF;

    IF OLD.vencida_em IS NOT NULL AND NEW.vencida_em IS NULL THEN
      motivo := 'proposta prorrogada'
        || COALESCE(' até ' || to_char(NEW.prorrogada_ate, 'DD/MM'), '');
      UPDATE public.tarefas
         SET status = 'concluida',
             concluida_at = now(),
             desfecho = 'automatico',
             desfecho_detalhe = motivo,
             nota_conclusao = COALESCE(nota_conclusao, motivo),
             done = true
       WHERE proposta_id = NEW.id
         AND status IN ('pendente','adiada')
         AND tipo = 'proposta_vencida';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_propostas_encerrar_tarefas ON public.propostas;
CREATE TRIGGER tg_propostas_encerrar_tarefas
AFTER UPDATE ON public.propostas
FOR EACH ROW EXECUTE FUNCTION public.tg_propostas_encerrar_tarefas();