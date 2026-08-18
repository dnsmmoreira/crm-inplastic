ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS modalidade_entrega text NOT NULL DEFAULT 'coleta',
  ADD COLUMN IF NOT EXISTS aprovacao_rota text,
  ADD COLUMN IF NOT EXISTS reprovacao_motivo text,
  ADD COLUMN IF NOT EXISTS entrega_confirmada text,
  ADD COLUMN IF NOT EXISTS encerrado_em timestamptz;

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_modalidade_entrega_chk;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_modalidade_entrega_chk
  CHECK (modalidade_entrega IN ('coleta','entrega_propria'));

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_entrega_confirmada_chk;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_entrega_confirmada_chk
  CHECK (entrega_confirmada IS NULL OR entrega_confirmada IN ('entregue','coletado'));

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_aprovacao_rota_chk;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_aprovacao_rota_chk
  CHECK (aprovacao_rota IS NULL OR aprovacao_rota IN ('valor_alto','primeira_compra','dispensado_recorrente','dispensado_valor_baixo','excecao_manual','sem_recorrencia'));

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS recorrente_manual boolean NOT NULL DEFAULT false;

ALTER TABLE public.arena_config
  ADD COLUMN IF NOT EXISTS aprovacao_valor_obrigatorio numeric NOT NULL DEFAULT 25000,
  ADD COLUMN IF NOT EXISTS aprovacao_primeira_compra_valor numeric NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS aprovacao_recorrencia_dias integer NOT NULL DEFAULT 90;

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS pedido_id uuid REFERENCES public.pedidos(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS tarefas_pedido_id_idx ON public.tarefas(pedido_id);

ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS pedido_id uuid REFERENCES public.pedidos(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS notificacoes_pedido_id_idx ON public.notificacoes(pedido_id);

CREATE INDEX IF NOT EXISTS pedidos_stage_idx ON public.pedidos(stage);