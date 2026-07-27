-- Fase 4: Campos aditivos em pedidos + tabela de ocorrências

-- 1) Colunas de aprovação e conferência em pedidos (aditivo)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS aprovacao_solicitada_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprovacao_solicitada_por uuid,
  ADD COLUMN IF NOT EXISTS aprovacao_motivo text,
  ADD COLUMN IF NOT EXISTS aprovacao_decisao text CHECK (aprovacao_decisao IN ('aprovado','rejeitado')),
  ADD COLUMN IF NOT EXISTS aprovacao_decidida_por uuid,
  ADD COLUMN IF NOT EXISTS aprovacao_decidida_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprovacao_observacao text,
  ADD COLUMN IF NOT EXISTS checklist_conferencia jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS checklist_atualizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS checklist_atualizado_por uuid;

-- 2) Tabela de ocorrências (histórico, aditivo)
CREATE TABLE IF NOT EXISTS public.pedido_ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  severidade text NOT NULL DEFAULT 'media' CHECK (severidade IN ('baixa','media','alta','critica')),
  descricao text NOT NULL,
  stage_no_momento pedido_stage,
  resolvida boolean NOT NULL DEFAULT false,
  resolvida_em timestamptz,
  resolvida_por uuid,
  resolucao_nota text,
  criada_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.pedido_ocorrencias TO authenticated;
GRANT ALL ON public.pedido_ocorrencias TO service_role;

ALTER TABLE public.pedido_ocorrencias ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='pedido_ocorrencias' AND policyname='ocorrencias_select_auth'
  ) THEN
    CREATE POLICY "ocorrencias_select_auth" ON public.pedido_ocorrencias
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='pedido_ocorrencias' AND policyname='ocorrencias_insert_auth'
  ) THEN
    CREATE POLICY "ocorrencias_insert_auth" ON public.pedido_ocorrencias
      FOR INSERT TO authenticated WITH CHECK (criada_por = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='pedido_ocorrencias' AND policyname='ocorrencias_update_auth'
  ) THEN
    CREATE POLICY "ocorrencias_update_auth" ON public.pedido_ocorrencias
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pedido_ocorrencias_pedido_idx ON public.pedido_ocorrencias(pedido_id);
CREATE INDEX IF NOT EXISTS pedido_ocorrencias_open_idx
  ON public.pedido_ocorrencias(pedido_id) WHERE resolvida = false;

-- updated_at trigger reaproveita função existente set_updated_at()
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'pedido_ocorrencias_set_updated_at'
  ) THEN
    CREATE TRIGGER pedido_ocorrencias_set_updated_at
      BEFORE UPDATE ON public.pedido_ocorrencias
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;