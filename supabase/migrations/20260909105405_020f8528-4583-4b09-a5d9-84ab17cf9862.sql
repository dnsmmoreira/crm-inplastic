ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS sem_pendencia_motivo text;

ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_desfecho_chk;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_desfecho_chk CHECK (
  desfecho IS NULL OR desfecho = ANY (ARRAY[
    'retorno_agendado','avancou_etapa','perdido','sem_pendencia','em_espera',
    'encerrar_conversa','recusar_proposta','reemitir_proposta','prorrogar_proposta',
    'excluir_rascunho','data_combinada','contato_registrado','transferir',
    'manual','automatico'
  ])
);