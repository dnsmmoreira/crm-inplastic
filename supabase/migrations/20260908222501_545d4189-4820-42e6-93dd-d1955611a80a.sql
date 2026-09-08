ALTER TABLE public.whatsapp_conversas
  ADD COLUMN IF NOT EXISTS auto_resposta_em timestamptz NULL;

COMMENT ON COLUMN public.whatsapp_conversas.auto_resposta_em IS
  'Última auto-resposta fora do horário comercial enviada nesta conversa.';