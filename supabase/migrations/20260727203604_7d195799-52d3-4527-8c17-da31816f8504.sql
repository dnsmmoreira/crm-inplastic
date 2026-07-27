CREATE TABLE IF NOT EXISTS public.pedido_notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  evento_id text NOT NULL UNIQUE,
  etapa_anterior public.pedido_stage,
  nova_etapa public.pedido_stage NOT NULL,
  classificacao text NOT NULL DEFAULT 'informativa'
    CHECK (classificacao IN ('informativa','acao_necessaria','alerta')),
  destinatario_tipo text NOT NULL DEFAULT 'vendedor_proprietario',
  destinatario_user_id uuid,
  mensagem text NOT NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','enviado','entregue','falhou','reprocessado')),
  erro text,
  tentativas integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  criado_por uuid
);

CREATE INDEX IF NOT EXISTS pedido_notificacoes_pedido_id_idx
  ON public.pedido_notificacoes(pedido_id);
CREATE INDEX IF NOT EXISTS pedido_notificacoes_status_idx
  ON public.pedido_notificacoes(status);

GRANT SELECT, INSERT, UPDATE ON public.pedido_notificacoes TO authenticated;
GRANT ALL ON public.pedido_notificacoes TO service_role;

ALTER TABLE public.pedido_notificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedido_notificacoes_select_auth" ON public.pedido_notificacoes;
CREATE POLICY "pedido_notificacoes_select_auth"
  ON public.pedido_notificacoes FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "pedido_notificacoes_insert_auth" ON public.pedido_notificacoes;
CREATE POLICY "pedido_notificacoes_insert_auth"
  ON public.pedido_notificacoes FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "pedido_notificacoes_update_auth" ON public.pedido_notificacoes;
CREATE POLICY "pedido_notificacoes_update_auth"
  ON public.pedido_notificacoes FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
